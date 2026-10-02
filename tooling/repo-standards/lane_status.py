#!/usr/bin/env python3
"""One row per subagent of a session: how big each lane has grown (method review r7 P2).

The planner runs it at every check-in (CLAUDE.md "Chunk, monitor, never cap")
and splits from its note any agent whose context passed 200k; nothing is
capped, the number informs the split (decision 0118 d1). Task subagents and
Workflow children both count; lane_resume.scan finds and classifies them and
session_tokens.Calls/cost_units count turns and units, so the numbers here are
the ones the token report prints.

    python3 tooling/repo-standards/lane_status.py                 # the newest session, last 12 h
    python3 tooling/repo-standards/lane_status.py --brief         # one short line per agent
    python3 tooling/repo-standards/lane_status.py --session <id> --hours 24 --json

Columns: agent id, type, label, started (UTC), elapsed min, turns, current
context (the last call's input + cache tokens), units, state (live,
unfinished, completed, killed, stopped, run <status>, superseded).
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from lane_resume import live_sessions, project_dir, scan  # noqa: E402
from session_tokens import Calls, cost_units  # noqa: E402

BIG = 200_000          # the split line (method review r7: 65 % of walk-9 units were past it)
RUNNING = ("live", "unfinished")


def newest_session(pdir: Path) -> str | None:
    files = sorted(pdir.glob("*.jsonl"), key=lambda p: p.stat().st_mtime)
    return files[-1].stem if files else None


def rows(pdir: Path, session: str, hours: float = 12.0, live: dict | None = None) -> list[dict]:
    """One dict per subagent of `session` written to in the last `hours`."""
    others = {d.name for d in pdir.iterdir() if d.is_dir() and d.name != session} if pdir.is_dir() else set()
    live = live_sessions() if live is None else live
    out = []
    for a in scan(pdir, hours * 3600, others, live):
        calls = Calls()
        for r in a.records:
            calls.add(r)
        last = calls.calls[-1] if calls.calls else {}
        out.append({"id": a.agent_id, "type": a.agent_type or "?", "label": a.label or "-",
                    "run": a.run, "started": a.first_ts,
                    "elapsedMin": round((a.last_ts - a.first_ts) / 60, 1),
                    "idleMin": round((time.time() - a.last_ts) / 60, 1),
                    "turns": len(calls.calls),
                    "context": sum(last.get(k, 0) for k in ("cache_read", "cache_create", "input")),
                    "units": round(cost_units(calls.total()) / 1e6, 2), "state": a.status})
    out.sort(key=lambda r: r["started"])
    return out


def over_big(rs: list[dict]) -> list[dict]:
    """Running agents past the split line."""
    return [r for r in rs if r["state"] in RUNNING and r["context"] > BIG]


def _hm(ts: float) -> str:
    return datetime.fromtimestamp(ts, timezone.utc).strftime("%H:%M")


def render(rs: list[dict], brief: bool) -> str:
    if brief:
        return "\n".join(f"{r['id'][:10]} {r['type']} {r['state']} {r['elapsedMin']:.0f}m "
                         f"{r['context'] // 1000}k {r['units']:.1f}u {r['label'][:40]}" for r in rs)
    head = f"{'agent':<18} {'type':<13} {'start':>5} {'min':>6} {'turns':>5} {'ctx':>6} {'units':>6}  state       label"
    lines = [head] + [f"{r['id'][:18]:<18} {r['type'][:13]:<13} {_hm(r['started']):>5} {r['elapsedMin']:>6.1f} "
                      f"{r['turns']:>5} {r['context'] // 1000:>5}k {r['units']:>6.2f}  {r['state'][:11]:<11} "
                      f"{r['label'][:50]}" for r in rs]
    big = over_big(rs)
    lines.append(f"running: {sum(r['state'] in RUNNING for r in rs)}; over {BIG // 1000}k context: {len(big)}"
                 + (f" ({', '.join(r['id'][:10] for r in big)}: split from its note)" if big else ""))
    return "\n".join(lines)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--session", help="session id (default: the newest session transcript)")
    ap.add_argument("--hours", type=float, default=12.0, help="agents written to in the last N hours")
    ap.add_argument("--dir", type=Path, default=None, help="project transcript dir (default: this repo's)")
    ap.add_argument("--brief", action="store_true", help="one short line per agent")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args(argv)
    pdir = a.dir or project_dir()
    session = a.session or newest_session(pdir)
    if not session:
        print(f"lane_status: no session transcripts under {pdir}")
        return 1
    rs = rows(pdir, session, a.hours)
    print(json.dumps(rs, indent=1) if a.json else render(rs, a.brief))
    return 0


if __name__ == "__main__":
    sys.exit(main())
