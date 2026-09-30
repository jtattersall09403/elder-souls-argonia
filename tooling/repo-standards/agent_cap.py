#!/usr/bin/env python3
"""Live-agent cap (owner 2026-09-30, walk-6 process audit proposal 1): at most
CAP subagents alive at once across one session tree (the planner, its leads
and their workers share the harness `session_id`). Walk 5 peaked at 23 live
agents; two OOM kills cost 504 min.

One script, three hook events (the event is read from `hook_event_name`):
  PreToolUse (Agent|Task)  refuse (exit 2) when live + pending >= CAP, else
                           record a pending launch (expires after PENDING_S)
  SubagentStart            the launch became a live agent: drop the oldest
                           pending entry, add `agent_id`
  SubagentStop             remove `agent_id`
Live entries older than STALE_S are dropped (a crashed agent that never sent
SubagentStop cannot hold a slot for ever). State: one JSON file per session
under $ES_AGENT_CAP_DIR (default /tmp/es-agent-cap), read-modify-write under
flock. Any error allows: a broken counter never blocks work.
`agent_cap.py --status` prints the live count for every session.
"""
import fcntl, json, os, sys, time

CAP = int(os.environ.get("ES_AGENT_CAP", "8"))
PENDING_S = 120
STALE_S = 4 * 3600
DIR = os.environ.get("ES_AGENT_CAP_DIR", "/tmp/es-agent-cap")


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
            n = len(st["live"]) + len(st["pending"])
            if n >= CAP:
                code = 2
                msg = (f"[agent cap, owner 2026-09-30] {n} agents are alive or launching in this session tree; "
                       f"the cap is {CAP} (walk 5: 23 live agents, two OOM kills, 504 min lost). Wait for one to "
                       "hand back (you are re-invoked when it does), or fold this job into a running lane.\n")
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
                print(f"{name[:-5]}: {len(st['live'])} live, {len(st['pending'])} pending (cap {CAP})")
        return 0
    try:
        code, msg = handle(json.load(sys.stdin))
    except Exception:
        return 0
    sys.stderr.write(msg)
    return code


if __name__ == "__main__":
    sys.exit(main())
