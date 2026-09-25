#!/usr/bin/env python3
"""CPU watchdog daemon (owner ruling 2026-09-25, after the second codespace
crash at 100 % CPU): watches the whole machine's CPU with no agent involved,
pauses the heaviest processes while the machine is saturated and clears
stale ones. Started by tooling/bootstrap/on-start.sh through cpu_watchdog.sh
(nohup, one instance: flock on <dir>/watchdog.lock). Log: <dir>/watchdog.log,
state: <dir>/watchdog.state.json (dir = ES_WD_DIR, default /tmp/es-jobs).

Every INTERVAL s (2) it samples whole-machine CPU from /proc/stat.
  * Throttle: CPU above HIGH % (85) for HIGH_SAMPLES samples (3) -> SIGSTOP the
    heaviest throttleable process (CPU ticks since the last sample), one per
    sample, until a sample is under STOP_UNTIL % (70).
  * Resume: once CPU has stayed under RESUME_BELOW % (60) for RESUME_AFTER s
    (10), SIGCONT the oldest-stopped process; the 10 s window restarts after
    each one, so they come back one at a time.
  * Stale sweep every SWEEP s (30): SIGTERM, then SIGKILL after KILL_GRACE s
    (10), any `rtk` older than RTK_MAX s (120) that has no live child (an rtk
    still wrapping a running command, e.g. `rtk npm run preflight`, is left to
    the throttle), and any blender / wb.py / mine_*.py / build_kit / vitest /
    node test worker whose parent has been dead (ppid 1) for ORPHAN_MAX s (600).
Throttleable = every process except code-server / vscode-server / extension
hosts, sshd, the `claude` CLI, systemd/init (pid 1), kernel threads, the
watchdog itself with its ancestors, and any process whose own command line
or an ancestor's is job_guard.sh (it holds a slot on purpose; exempt from
both the throttle and the stale/orphan sweep). Every action is one log line
with pid,
command, CPU and reason. A restarted watchdog re-adopts the processes its
predecessor left stopped; SIGTERM/SIGINT continues everything it stopped.

  cpu_watchdog.py            run the daemon in the foreground
  cpu_watchdog.py --status   print the daemon's state and the stopped list

Test hooks (env): ES_WD_SAMPLER (a command printing the machine CPU % per
call), ES_WD_PROCS (a command printing a JSON list of processes: pid, ppid,
start, ticks, age, comm, args, state), ES_WD_DRY_RUN=1 (log, never signal),
ES_WD_FAKE_CLOCK=1 (time advances INTERVAL per sample), ES_WD_SLEEP (seconds
actually slept per sample), ES_WD_MAX_SAMPLES, ES_WD_MATCH (regex: only
processes whose command matches are throttleable). Thresholds: ES_WD_INTERVAL,
ES_WD_HIGH, ES_WD_HIGH_SAMPLES, ES_WD_STOP_UNTIL, ES_WD_RESUME_BELOW,
ES_WD_RESUME_AFTER, ES_WD_SWEEP, ES_WD_RTK_MAX, ES_WD_ORPHAN_MAX,
ES_WD_KILL_GRACE.
"""
from __future__ import annotations

import fcntl
import json
import os
import re
import signal
import subprocess
import sys
import time
from dataclasses import dataclass, field

CLK_TCK = os.sysconf("SC_CLK_TCK")
EXEMPT_ARGS = re.compile(
    r"code-server|vscode-server|/vscode/|\.vscode|extensionHost|"
    r"/claude-code/|@anthropic-ai/claude|cpu_watchdog")
EXEMPT_COMM = {"sshd", "claude", "systemd", "init"}
JOB_GUARD = re.compile(r"job_guard\.sh")
STALE_ORPHAN = re.compile(
    r"blender|\bwb\.py\b|mine_\w+(\.py)?|build_kit|vitest|tinypool|jest-worker|node\s+--test")


def env_num(name: str, default: float) -> float:
    v = os.environ.get(name)
    return float(v) if v not in (None, "") else default


@dataclass
class Config:
    interval: float = 2.0
    high: float = 85.0
    high_samples: int = 3
    stop_until: float = 70.0
    resume_below: float = 60.0
    resume_after: float = 10.0
    sweep: float = 30.0
    rtk_max: float = 120.0
    orphan_max: float = 600.0
    kill_grace: float = 10.0
    match: str = ""

    @classmethod
    def from_env(cls) -> "Config":
        return cls(
            interval=env_num("ES_WD_INTERVAL", 2), high=env_num("ES_WD_HIGH", 85),
            high_samples=int(env_num("ES_WD_HIGH_SAMPLES", 3)),
            stop_until=env_num("ES_WD_STOP_UNTIL", 70),
            resume_below=env_num("ES_WD_RESUME_BELOW", 60),
            resume_after=env_num("ES_WD_RESUME_AFTER", 10), sweep=env_num("ES_WD_SWEEP", 30),
            rtk_max=env_num("ES_WD_RTK_MAX", 120), orphan_max=env_num("ES_WD_ORPHAN_MAX", 600),
            kill_grace=env_num("ES_WD_KILL_GRACE", 10), match=os.environ.get("ES_WD_MATCH", ""))


@dataclass
class Proc:
    pid: int
    ppid: int
    start: int      # start time in ticks since boot: (pid, start) is the identity
    ticks: int      # utime + stime
    age: float      # seconds since the process started
    comm: str
    args: str
    state: str = "S"


# ---------------------------------------------------------------- readers

class ProcStatSampler:
    """Whole-machine busy % between consecutive calls (None on the first)."""

    def __init__(self) -> None:
        self.prev: tuple[int, int] | None = None

    def __call__(self) -> float | None:
        with open("/proc/stat") as f:
            vals = [int(x) for x in f.readline().split()[1:]]
        total = sum(vals[:8])
        idle = vals[3] + (vals[4] if len(vals) > 4 else 0)
        prev, self.prev = self.prev, (total, idle)
        if prev is None or total == prev[0]:
            return None
        return 100.0 * (1 - (idle - prev[1]) / (total - prev[0]))


def command_sampler(cmd: str):
    def sample() -> float | None:
        out = subprocess.run(cmd, shell=True, capture_output=True, text=True).stdout.strip()
        return float(out) if out else None
    return sample


def read_procs() -> dict[int, Proc]:
    with open("/proc/uptime") as f:
        uptime = float(f.read().split()[0])
    procs: dict[int, Proc] = {}
    for name in os.listdir("/proc"):
        if not name.isdigit():
            continue
        try:
            with open(f"/proc/{name}/stat") as f:
                raw = f.read()
            with open(f"/proc/{name}/cmdline", "rb") as f:
                args = f.read().replace(b"\0", b" ").decode(errors="replace").strip()
        except OSError:
            continue
        lp, rp = raw.index("("), raw.rindex(")")
        comm, rest = raw[lp + 1:rp], raw[rp + 2:].split()
        start = int(rest[19])
        procs[int(name)] = Proc(
            pid=int(name), ppid=int(rest[1]), start=start, ticks=int(rest[11]) + int(rest[12]),
            age=uptime - start / CLK_TCK, comm=comm, args=args, state=rest[0])
    return procs


def command_procs(cmd: str):
    def read() -> dict[int, Proc]:
        out = subprocess.run(cmd, shell=True, capture_output=True, text=True).stdout
        return {p["pid"]: Proc(**p) for p in json.loads(out or "[]")}
    return read


def real_signal(pid: int, sig: int) -> None:
    os.kill(pid, sig)


# ---------------------------------------------------------------- the decision core

@dataclass
class Stopped:
    pid: int
    start: int
    cmd: str
    since: float
    cpu: float


@dataclass
class Watchdog:
    cfg: Config
    sampler: object
    procs_reader: object
    signal_fn: object
    clock: object
    log_fn: object
    self_pids: set = field(default_factory=set)
    stopped: list = field(default_factory=list)          # [Stopped], oldest first
    pending: dict = field(default_factory=dict)          # pid -> (start, deadline, cmd)
    orphan_seen: dict = field(default_factory=dict)      # (pid, start) -> first time seen orphaned
    high_run: int = 0
    throttling: bool = False
    low_since: float | None = None
    last_sweep: float | None = None
    last_cpu: float | None = None
    prev_ticks: dict = field(default_factory=dict)       # (pid, start) -> ticks
    last_dt: float = 0.0
    last_t: float | None = None

    # --- helpers
    @staticmethod
    def held_by_job_guard(p: Proc, procs: dict) -> bool:
        """True if p's own command line, or that of any ancestor, is job_guard.sh
        (it holds a slot on purpose: never throttled or swept as stale/orphan)."""
        seen = set()
        cur = p
        while cur is not None and cur.pid not in seen:
            if JOB_GUARD.search(cur.args or ""):
                return True
            seen.add(cur.pid)
            cur = procs.get(cur.ppid)
        return False

    def throttleable(self, p: Proc, procs: dict | None = None) -> bool:
        if p.pid in self.self_pids or p.pid <= 1 or p.ppid == 2 or not p.args:
            return False
        if p.comm in EXEMPT_COMM or os.path.basename(p.args.split(" ", 1)[0]) == "claude":
            return False
        if EXEMPT_ARGS.search(p.args):
            return False
        if procs is not None and self.held_by_job_guard(p, procs):
            return False
        if self.cfg.match and not re.search(self.cfg.match, p.args):
            return False
        return True

    def pct(self, delta_ticks: int) -> float:
        return 100.0 * delta_ticks / CLK_TCK / self.last_dt if self.last_dt > 0 else 0.0

    def send(self, pid: int, sig: int) -> bool:
        try:
            self.signal_fn(pid, sig)
            return True
        except ProcessLookupError:
            return False
        except PermissionError:
            self.log_fn(f"SKIP pid {pid}: no permission for signal {sig}")
            return False

    @staticmethod
    def short(p: Proc) -> str:
        return (p.args or p.comm)[:120]

    # --- one sample
    def step(self) -> None:
        t = self.clock()
        cpu = self.sampler()
        procs = self.procs_reader()
        self.last_dt = (t - self.last_t) if self.last_t is not None else self.cfg.interval
        self.last_t = t
        deltas = {}
        new_ticks = {}
        for p in procs.values():
            key = (p.pid, p.start)
            new_ticks[key] = p.ticks
            deltas[p.pid] = p.ticks - self.prev_ticks.get(key, p.ticks)
        self.prev_ticks = new_ticks
        self.last_cpu = cpu

        # processes that went away (killed by someone else, exited)
        for s in list(self.stopped):
            p = procs.get(s.pid)
            if p is None or p.start != s.start:
                self.stopped.remove(s)
                self.log_fn(f"GONE pid {s.pid} ({s.cmd}): exited while stopped; dropped from the stopped list")
        for pid, (start, deadline, cmd) in list(self.pending.items()):
            p = procs.get(pid)
            if p is None or p.start != start:
                del self.pending[pid]
            elif t >= deadline:
                self.send(pid, signal.SIGKILL)
                del self.pending[pid]
                self.log_fn(f"KILL pid {pid} ({cmd}): still alive {self.cfg.kill_grace:g} s after SIGTERM")

        if cpu is not None:
            self.throttle(cpu, procs, deltas, t)
        if self.last_sweep is None or t - self.last_sweep >= self.cfg.sweep:
            self.last_sweep = t
            self.sweep(procs, deltas, t)

    def throttle(self, cpu: float, procs: dict, deltas: dict, t: float) -> None:
        c = self.cfg
        self.high_run = self.high_run + 1 if cpu > c.high else 0
        if not self.throttling and self.high_run >= c.high_samples:
            self.throttling = True
        if self.throttling:
            if cpu < c.stop_until:
                self.throttling = False
                self.high_run = 0
            else:
                stopped_pids = {s.pid for s in self.stopped} | set(self.pending)
                cands = [p for p in procs.values()
                         if p.pid not in stopped_pids and p.state != "T"
                         and deltas.get(p.pid, 0) > 0 and self.throttleable(p, procs)]
                if cands:
                    p = max(cands, key=lambda q: deltas[q.pid])
                    pc = self.pct(deltas[p.pid])
                    if self.send(p.pid, signal.SIGSTOP):
                        self.stopped.append(Stopped(p.pid, p.start, self.short(p), t, round(pc, 1)))
                        why = (f"> {c.high:g}% for {self.high_run} samples" if self.high_run >= c.high_samples
                               else f"still >= {c.stop_until:g}% while throttling")
                        self.log_fn(f"STOP pid {p.pid} cpu {pc:.0f}% ({self.short(p)}): machine {cpu:.0f}% "
                                    f"{why}; heaviest throttleable")
        if cpu < c.resume_below:
            if self.low_since is None:
                self.low_since = t
        else:
            self.low_since = None
        if (self.stopped and not self.throttling and self.low_since is not None
                and t - self.low_since >= c.resume_after):
            s = self.stopped.pop(0)
            if self.send(s.pid, signal.SIGCONT):
                self.log_fn(f"CONT pid {s.pid} cpu {s.cpu:.0f}% when stopped ({s.cmd}): machine under "
                            f"{c.resume_below:g}% for {t - self.low_since:.0f} s; oldest stopped "
                            f"({t - s.since:.0f} s)")
            self.low_since = t

    def sweep(self, procs: dict, deltas: dict, t: float) -> None:
        c = self.cfg
        children: dict[int, int] = {}
        for p in procs.values():
            children[p.ppid] = children.get(p.ppid, 0) + 1
        live_keys = set()
        for p in procs.values():
            if p.pid in self.pending or p.pid in self.self_pids:
                continue
            if self.held_by_job_guard(p, procs):
                continue
            reason = None
            if p.comm == "rtk" and p.age > c.rtk_max and not children.get(p.pid):
                reason = f"rtk older than {c.rtk_max:g} s ({p.age:.0f} s) with no live child"
            elif p.ppid == 1 and STALE_ORPHAN.search(p.args or ""):
                key = (p.pid, p.start)
                live_keys.add(key)
                first = self.orphan_seen.setdefault(key, t)
                if t - first >= c.orphan_max:
                    reason = f"orphaned (ppid 1) for {t - first:.0f} s"
            if reason:
                self.terminate(p, deltas, t, reason)
        self.orphan_seen = {k: v for k, v in self.orphan_seen.items() if k in live_keys}

    def terminate(self, p: Proc, deltas: dict, t: float, reason: str) -> None:
        if not self.send(p.pid, signal.SIGTERM):
            return
        was_stopped = [s for s in self.stopped if s.pid == p.pid]
        if was_stopped or p.state == "T":
            self.send(p.pid, signal.SIGCONT)   # a stopped process only acts on SIGTERM once continued
            self.stopped = [s for s in self.stopped if s.pid != p.pid]
        self.pending[p.pid] = (p.start, t + self.cfg.kill_grace, self.short(p))
        self.log_fn(f"TERM pid {p.pid} cpu {self.pct(deltas.get(p.pid, 0)):.0f}% ({self.short(p)}): stale, {reason}")

    def release_all(self, why: str) -> None:
        for s in self.stopped:
            if self.send(s.pid, signal.SIGCONT):
                self.log_fn(f"CONT pid {s.pid} ({s.cmd}): {why}")
        self.stopped = []

    def state(self) -> dict:
        return {
            "pid": os.getpid(), "updated": time.time(), "cpu": self.last_cpu,
            "throttling": self.throttling, "highRun": self.high_run,
            "stopped": [s.__dict__ for s in self.stopped],
            "pendingKill": [{"pid": k, "start": v[0], "cmd": v[2]} for k, v in self.pending.items()],
            "orphansTracked": len(self.orphan_seen),
        }

    def adopt(self, state: dict, procs: dict) -> None:
        for s in state.get("stopped", []):
            p = procs.get(s["pid"])
            if p is not None and p.start == s["start"] and p.state == "T":
                self.stopped.append(Stopped(**s))
                self.log_fn(f"ADOPT pid {s['pid']} ({s['cmd']}): left stopped by the previous watchdog")


# ---------------------------------------------------------------- daemon plumbing

def paths() -> tuple[str, str, str, str]:
    d = os.environ.get("ES_WD_DIR", "/tmp/es-jobs")
    return d, f"{d}/watchdog.lock", f"{d}/watchdog.log", f"{d}/watchdog.state.json"


def make_logger(log_path: str):
    def log(msg: str) -> None:
        try:
            if os.path.getsize(log_path) > 5_000_000:
                os.replace(log_path, log_path + ".1")
        except OSError:
            pass
        with open(log_path, "a") as f:
            f.write(f"{time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())} {msg}\n")
    return log


def ancestors(pid: int) -> set[int]:
    out = {pid}
    try:
        while pid > 1:
            with open(f"/proc/{pid}/stat") as f:
                raw = f.read()
            pid = int(raw[raw.rindex(")") + 2:].split()[1])
            out.add(pid)
    except OSError:
        pass
    return out


def status() -> int:
    d, lock_path, log_path, state_path = paths()
    running = False
    try:
        with open(lock_path, "a") as lf:
            try:
                fcntl.flock(lf, fcntl.LOCK_EX | fcntl.LOCK_NB)
                fcntl.flock(lf, fcntl.LOCK_UN)
            except OSError:
                running = True
    except OSError:
        pass
    try:
        with open(state_path) as f:
            st = json.load(f)
    except (OSError, ValueError):
        st = {}
    age = time.time() - st["updated"] if st.get("updated") else None
    cpu = st.get("cpu")
    nice_val = None
    if running and st.get("pid"):
        try:
            nice_val = os.getpriority(os.PRIO_PROCESS, int(st["pid"]))
        except OSError:
            pass
    print(f"watchdog: {'running' if running else 'NOT running'}"
          + (f", pid {st.get('pid')}, last sample {age:.0f} s ago" if age is not None else "")
          + (f", machine CPU {cpu:.0f}%" if cpu is not None else "")
          + (f", nice {nice_val}" if nice_val is not None else "")
          + (", THROTTLING" if st.get("throttling") else ""))
    stopped = st.get("stopped", [])
    print(f"stopped: {len(stopped)}")
    for s in stopped:
        print(f"  pid {s['pid']} stopped {time.time() - s['since']:.0f} s ago at {s['cpu']:.0f}% cpu: {s['cmd']}"
              if s['since'] > 1e9 else f"  pid {s['pid']} at {s['cpu']:.0f}% cpu: {s['cmd']}")
    for p in st.get("pendingKill", []):
        print(f"  pending SIGKILL: pid {p['pid']} {p['cmd']}")
    print(f"log: {log_path}")
    return 0


def main() -> int:
    if "--status" in sys.argv[1:]:
        return status()
    d, lock_path, log_path, state_path = paths()
    os.makedirs(d, exist_ok=True)
    try:
        os.chmod(d, 0o1777)
    except OSError:
        pass
    log = make_logger(log_path)
    lf = open(lock_path, "a")
    try:
        fcntl.flock(lf, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        print("cpu_watchdog: already running", file=sys.stderr)
        return 0
    cfg = Config.from_env()
    fake = os.environ.get("ES_WD_FAKE_CLOCK") == "1"
    tick = {"t": 0.0}

    def clock() -> float:
        if fake:
            tick["t"] += cfg.interval
            return tick["t"]
        return time.time()

    sampler = command_sampler(os.environ["ES_WD_SAMPLER"]) if os.environ.get("ES_WD_SAMPLER") else ProcStatSampler()
    reader = command_procs(os.environ["ES_WD_PROCS"]) if os.environ.get("ES_WD_PROCS") else read_procs
    if os.environ.get("ES_WD_DRY_RUN") == "1":
        def signal_fn(pid: int, sig: int) -> None:
            log(f"DRYRUN signal {signal.Signals(sig).name} -> pid {pid}")
    else:
        signal_fn = real_signal
    wd = Watchdog(cfg, sampler, reader, signal_fn, clock, log, self_pids=ancestors(os.getpid()))
    try:
        with open(state_path) as f:
            wd.adopt(json.load(f), reader())
    except (OSError, ValueError):
        pass
    stop = {"now": False}

    def on_term(signum, _frame) -> None:
        stop["now"] = True
    signal.signal(signal.SIGTERM, on_term)
    signal.signal(signal.SIGINT, on_term)
    log(f"START pid {os.getpid()}: every {cfg.interval:g} s; stop above {cfg.high:g}% x{cfg.high_samples} "
        f"until under {cfg.stop_until:g}%; continue under {cfg.resume_below:g}% for {cfg.resume_after:g} s")
    sleep_s = env_num("ES_WD_SLEEP", cfg.interval)
    max_samples = int(env_num("ES_WD_MAX_SAMPLES", 0))
    n = 0
    while not stop["now"]:
        try:
            wd.step()
        except Exception as e:  # a bad sample never kills the daemon
            log(f"ERROR {type(e).__name__}: {e}")
        tmp = state_path + ".tmp"
        with open(tmp, "w") as f:
            json.dump(wd.state(), f)
        os.replace(tmp, state_path)
        n += 1
        if max_samples and n >= max_samples:
            break
        if sleep_s > 0:
            time.sleep(sleep_s)
    wd.release_all("watchdog exiting")
    with open(state_path, "w") as f:
        json.dump(wd.state(), f)
    log(f"EXIT pid {os.getpid()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
