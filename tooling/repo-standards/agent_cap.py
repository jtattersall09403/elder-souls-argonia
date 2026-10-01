#!/usr/bin/env python3
"""Agent admission gate (owner 2026-10-01, decision 0106 decision 18): a
subagent spawn is admitted on the machine's measured CPU and memory, not on a
count. Walk 5 peaked at 23 live agents and two OOM kills cost 504 min; the
cause was memory and load, so the gate measures those.

One script, three hook events (the event is read from `hook_event_name`):
  PreToolUse (Agent|Task)  refuse (exit 2) when
    - memory: machine unreclaimable (anon + shmem + kernel, memwatch.sh's
      measure) + AGENT_RESERVE_MIB >= the memwatch ceiling (3/4 of
      memory.max, else MemTotal);
    - CPU: 1-min load >= nproc x LOAD_FACTOR (3) AND (unreclaimable > half
      the ceiling OR a job waits for a job_guard slot); load alone never
      refuses (it only slows jobs; memory kills sessions); or every job_guard heavy slot
      is held by a job in its first SLOT_YOUNG_S (a slot that is free, or a
      job waiting for one, admits: slots serialise heavy jobs);
    - backstop: live + pending >= RUNAWAY_CAP;
    else record a pending launch (expires after PENDING_S).
  SubagentStart            pending -> live (`agent_id`)
  SubagentStop             remove `agent_id`
Live entries older than STALE_S drop (a crashed agent cannot hold a place).
Every PreToolUse decision and its numbers go to DIR/admissions.log.
State: one JSON file per session under $ES_AGENT_CAP_DIR (default
/tmp/es-agent-cap), read-modify-write under flock. Any error allows.
`agent_cap.py --status` prints live counts and the current measurements.
"""
import calendar, fcntl, glob, json, os, sys, time

# Per-new-agent memory reserve. Measured 2026-10-01 from the live tree (the
# Pss anon+shmem of each tool tree under the claude process, own_memory.py
# --tree): 0.0 / 0.36 / 0.40 / 1.14 GiB over 4 agents' tools. Too few samples
# for a true 95th percentile: 1.5 GiB sits above the observed max and is a
# placeholder to re-measure from more trees.
AGENT_RESERVE_MIB = 1536
LOAD_FACTOR = 3.0  # load counts runnable threads; ~23 with three guarded jobs is normal
SLOT_YOUNG_S = 60
# Not a budget: a backstop against a spawn loop. Admission is CPU and memory.
RUNAWAY_CAP = 24
PENDING_S = 120
STALE_S = 4 * 3600
DIR = os.environ.get("ES_AGENT_CAP_DIR", "/tmp/es-agent-cap")
LOCK_DIR = os.environ.get("ES_JOB_LOCK_DIR", "/tmp/es-jobs")


def mem_mib():
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from own_memory import machine_mib
    return machine_mib()


def ceiling_mib():
    """memwatch.sh default ceiling: 3/4 of memory.max, else of MemTotal."""
    try:
        lim = int(open("/sys/fs/cgroup/memory.max").read().strip())
    except (OSError, ValueError):
        lim = next(int(l.split()[1]) * 1024 for l in open("/proc/meminfo") if l.startswith("MemTotal:"))
    return lim * 3 // 4 // 1048576


def load1():
    return float(open("/proc/loadavg").read().split()[0])


def cores():
    return os.cpu_count() or 1


def slots_busy(now):
    """True when every job_guard slot (N = max(1, (nproc-1)//2), as job_guard)
    is held by a live job whose slot line is under SLOT_YOUNG_S old."""
    n = int(os.environ.get("ES_JOB_SLOTS") or max(1, (cores() - 1) // 2))
    for i in range(n):
        try:
            parts = open(os.path.join(LOCK_DIR, f"slot-{i}.lock")).readline().split()
            os.kill(int(parts[3]), 0)
            started = calendar.timegm(time.strptime(parts[0], "%Y-%m-%dT%H:%M:%SZ"))
        except Exception:
            return False
        if now - started >= SLOT_YOUNG_S:
            return False
    return True


def slot_waiters():
    """job_guard.sh processes (top-level, not their $(...) subshells) that
    hold no slot: jobs waiting for a heavy slot."""
    held, guards = set(), {}
    for f in glob.glob(os.path.join(LOCK_DIR, "slot-*.lock")):
        try:
            held.add(int(open(f).readline().split()[3]))
        except Exception:
            pass
    for d in glob.glob("/proc/[0-9]*"):
        try:
            if any(x.endswith(b"job_guard.sh") for x in open(d + "/cmdline", "rb").read().split(b"\0")):
                guards[int(d[6:])] = int(open(d + "/stat").read().rsplit(")", 1)[1].split()[1])
        except Exception:
            pass
    return sum(1 for p, pp in guards.items() if pp not in guards and p not in held)


def _admit(n, now):
    """(refusal reason or "", numbers line)."""
    m, c = mem_mib(), ceiling_mib()
    l, lim = load1(), cores() * LOAD_FACTOR
    nums = (f"unreclaimable {m / 1024:.1f} GiB + reserve {AGENT_RESERVE_MIB / 1024:.1f} GiB vs ceiling "
            f"{c / 1024:.1f} GiB; load {l:.2f} vs limit {lim:.1f}; {n} live+pending (runaway cap {RUNAWAY_CAP})")
    if n >= RUNAWAY_CAP:
        return "runaway cap: wait for a lane to hand back (you are re-invoked when it does)", nums
    if m + AGENT_RESERVE_MIB >= c:
        return ("memory: wait for a lane to finish, or run the heavy job under job_guard.sh "
                "so it waits for its slot instead of a new agent"), nums
    if l >= lim and (m * 2 > c or slot_waiters()):
        return "CPU load: wait for a lane to finish, or run the heavy job under job_guard.sh", nums
    if slots_busy(now):
        return "every job_guard heavy slot is starting a job: wait a minute and retry", nums
    return "", nums


def _prune(st, now):
    st["live"] = {k: t for k, t in st.get("live", {}).items() if now - t < STALE_S}
    st["pending"] = [t for t in st.get("pending", []) if now - t < PENDING_S]


def handle(d, now=None):
    now = time.time() if now is None else now
    ev = d.get("hook_event_name", "")
    if ev == "PreToolUse" and d.get("tool_name") not in ("Agent", "Task"):
        return 0, ""
    sid = str(d.get("session_id") or "default").replace("/", "_")
    os.makedirs(DIR, exist_ok=True)
    path = os.path.join(DIR, f"{sid}.json")
    with open(path + ".lock", "a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            st = json.load(open(path))
        except Exception:
            st = {}
        _prune(st, now)
        msg, code = "", 0
        if ev == "PreToolUse":
            why, nums = _admit(len(st["live"]) + len(st["pending"]), now)
            with open(os.path.join(DIR, "admissions.log"), "a") as log:
                log.write(f"{time.strftime('%FT%TZ', time.gmtime(now))} {sid} "
                          f"{'refuse' if why else 'admit'}: {nums}{' | ' + why if why else ''}\n")
            if why:
                code = 2
                msg = f"[agent admission, 0106 d18] refused: {nums}. {why}.\n"
            else:
                st["pending"].append(now)
        elif ev == "SubagentStart":
            if st["pending"]:
                st["pending"].pop(0)
            st["live"][str(d.get("agent_id") or f"anon-{now}")] = now
        elif ev == "SubagentStop":
            st["live"].pop(str(d.get("agent_id")), None)
        tmp = path + ".tmp"
        with open(tmp, "w") as f:
            json.dump(st, f)
        os.replace(tmp, path)
    return code, msg


def main():
    if "--status" in sys.argv:
        for name in sorted(os.listdir(DIR)) if os.path.isdir(DIR) else []:
            if name.endswith(".json"):
                st = json.load(open(os.path.join(DIR, name)))
                _prune(st, time.time())
                print(f"{name[:-5]}: {len(st['live'])} live, {len(st['pending'])} pending")
        print(_admit(0, time.time())[1])
        return 0
    try:
        code, msg = handle(json.load(sys.stdin))
    except Exception:
        return 0
    sys.stderr.write(msg)
    return code


if __name__ == "__main__":
    sys.exit(main())
