#!/usr/bin/env python3
"""lane_watch.py: the mechanical watchdog over lanes, jobs and pods (owner 2026-10-02).

Prints one line per finding and exits 0. It never kills or deletes anything:
the planner acts on every finding at every wake (docs/standards/hooks.md
"lane_watch"). Five checks:

  STALE     a live agent whose trailing Bash call (a run of `lane_wait.py
            --files X` re-calls counts from the first) began > 12 min ago,
            every X absent, and the newest file under X's folders and
            /tmp/<lane>/ older than 10 min.
  ORPHAN    a heavy-job process (pod-capture.mjs, measure.mjs, wb.py, blender,
            job_guard.sh, vite build) whose lane (job_guard lane arg or
            /tmp/<lane>/ in its cmdline) no live agent names; with no lane, it
            is an orphan when no agent is live at all.
  OVERCTX   a live lead/deliver whose context has been past 150k for > 10 min.
  UNGUARDED a python/blender/node process over 2 GiB RSS outside a job_guard
            scope (its cgroup is not a systemd-run `run-*.scope`).
  POD       a 14-char pod id on a "Pod:" line of tooling/.reports/16k/walk*/*-lead.md
            whose lane (the file stem) no live agent names.

    python3 tooling/repo-standards/lane_watch.py [--session ID] [--quiet]

Reuses lane_resume.scan (agents and their state) and lane_status.running.
"""
from __future__ import annotations

import argparse
import re
import shlex
import subprocess
import sys
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from lane_resume import GUARD_LANE, REPO, blocks, live_sessions, parse_ts, project_dir, scan  # noqa: E402
from lane_status import BIG, newest_session, running  # noqa: E402

STALE_WAIT_S, STALE_OUT_S, OVERCTX_S = 12 * 60, 10 * 60, 10 * 60
HEAVY_JOB = re.compile(r"pod-capture\.mjs|measure\.mjs|wb\.py|blender|job_guard\.sh|vite build")
TMP_LANE = re.compile(r"/tmp/([A-Za-z0-9][\w.-]*)/")
POD_LINE = re.compile(r"Pod:.*?\b([a-z0-9]{14})\b", re.I)
HEAVY_RSS_KIB = 2 * 1024 * 1024
HEAVY_COMM = re.compile(r"python|blender|node")


class Watched:
    """What the checks need from one agent transcript."""

    def __init__(self, a):
        self.id, self.label, self.type = a.agent_id, a.label or "-", a.agent_type or "?"
        self.live = running(a.status)
        self.bash: list[tuple[float, str]] = []      # (start ts, command), in order
        self.over_since = 0.0                        # first ts of the trailing run of calls past BIG
        seen = set()
        for r in a.records:
            if r.get("type") != "assistant":
                continue
            ts = parse_ts(r.get("timestamp"))
            m = r.get("message") or {}
            u = m.get("usage")
            if u and m.get("id") not in seen:
                seen.add(m.get("id"))
                ctx = sum(u.get(k, 0) for k in ("cache_read_input_tokens", "cache_creation_input_tokens", "input_tokens"))
                self.ctx = ctx
                self.over_since = (self.over_since or ts) if ctx > BIG else 0.0
            for b in blocks(r):
                if isinstance(b, dict) and b.get("type") == "tool_use" and b.get("name") == "Bash":
                    self.bash.append((ts, (b.get("input") or {}).get("command", "")))
        self.ctx = getattr(self, "ctx", 0)
        self.lanes = {m for _, c in self.bash for m in GUARD_LANE.findall(c) + TMP_LANE.findall(c)}


def wait_files(cmd: str) -> list[str]:
    if "lane_wait.py" not in cmd:
        return []
    try:
        toks = shlex.split(cmd)
    except ValueError:
        toks = cmd.split()
    out, on = [], False
    for t in toks:
        if t == "--files":
            on = True
        elif t.startswith("--") or t in ("&&", ";", "|"):
            on = False
        elif on:
            out.append(t)
    return out


def newest_mtime(dirs) -> float:
    best = 0.0
    for d in dirs:
        try:
            for p in Path(d).rglob("*"):
                try:
                    best = max(best, p.stat().st_mtime)
                except OSError:
                    pass
        except OSError:
            pass
    return best


def stale(agents, now, repo: Path = REPO) -> list[str]:
    out = []
    for w in agents:
        if not w.live or not w.bash:
            continue
        ts, cmd = w.bash[-1]
        files = wait_files(cmd)
        if files:   # the first of the trailing re-calls on the same files
            for t, c in reversed(w.bash):
                if wait_files(c) != files:
                    break
                ts = t
        if now - ts <= STALE_WAIT_S:
            continue
        paths = [Path(f) if Path(f).is_absolute() else repo / f for f in files]
        if any(p.exists() for p in paths):
            continue
        dirs = {p.parent for p in paths} | {Path("/tmp") / ln for ln in w.lanes}
        last = newest_mtime(dirs)
        if last and now - last <= STALE_OUT_S:
            continue
        what = " ".join(files) or cmd[:60]
        ago = f"{(now - last) / 60:.0f} min ago" if last else "never"
        out.append(f"STALE {w.id} {w.label} waiting {(now - ts) / 60:.0f} min on {what}; last output {ago}")
    return out


def overctx(agents, now) -> list[str]:
    return [f"OVERCTX {w.id} {w.label} {w.ctx // 1000}k for {(now - w.over_since) / 60:.0f} min"
            for w in agents
            if w.live and w.type in ("lead", "deliver") and w.over_since and now - w.over_since > OVERCTX_S]


def proc_list() -> list[dict]:
    """pid, ppid, etimes, rss KiB, args for every process; cgroup read lazily."""
    try:
        txt = subprocess.run(["ps", "-eo", "pid=,ppid=,etimes=,rss=,args="], capture_output=True,
                             text=True, timeout=5).stdout
    except (OSError, subprocess.SubprocessError):
        return []
    out = []
    for ln in txt.splitlines():
        p = ln.split(None, 4)
        if len(p) == 5 and p[0].isdigit():
            out.append({"pid": int(p[0]), "ppid": int(p[1]), "etimes": int(p[2]), "rss": int(p[3]), "args": p[4]})
    return out


def cgroup(pid: int) -> str:
    try:
        return Path(f"/proc/{pid}/cgroup").read_text()
    except OSError:
        return ""


def orphans(procs, agents) -> list[str]:
    hits = {p["pid"]: p for p in procs if HEAVY_JOB.search(p["args"]) and "lane_watch" not in p["args"]}
    live_lanes = {ln for w in agents if w.live for ln in w.lanes}
    any_live = any(w.live for w in agents)
    out = []
    for p in hits.values():
        if p["ppid"] in hits:   # report the top of each job tree once
            continue
        lanes = set(GUARD_LANE.findall(p["args"]) + TMP_LANE.findall(p["args"]))
        if (lanes and not lanes & live_lanes) or (not lanes and not any_live):
            lane = ",".join(sorted(lanes)) or "-"
            out.append(f"ORPHAN pid {p['pid']} {p['args'][:60]} started {p['etimes'] // 60} min ago; "
                       f"lane {lane} has no live agent")
    return out


def unguarded(procs, cg=cgroup) -> list[str]:
    out = []
    for p in procs:
        comm = p["args"].split(None, 1)[0].rsplit("/", 1)[-1] if p["args"] else ""
        if p["rss"] > HEAVY_RSS_KIB and HEAVY_COMM.search(comm) and "/run-" not in cg(p["pid"]):
            out.append(f"UNGUARDED pid {p['pid']} {p['rss'] / 1048576:.1f} GiB {p['args'][:60]}")
    return out


def pods(agents, repo: Path = REPO) -> list[str]:
    live = [w for w in agents if w.live]
    out = []
    for f in sorted(repo.glob("tooling/.reports/16k/walk*/*-lead.md")):
        try:
            ids = {m.group(1) for ln in f.read_text(errors="replace").splitlines() for m in [POD_LINE.search(ln)] if m}
        except OSError:
            continue
        lane = f.stem[: -len("-lead")]
        rel = f.relative_to(repo)
        if ids and not any(lane in w.label or str(rel) in " ".join(c for _, c in w.bash) or lane in w.lanes for w in live):
            out += [f"POD {i} named by {rel} with no live lane: delete or hand over" for i in sorted(ids)]
    return out


def findings(pdir: Path, session: str | None, hours: float = 3.0, procs=None, now=None) -> list[str]:
    now = now or time.time()
    others = {d.name for d in pdir.iterdir() if d.is_dir() and d.name != session} if session and pdir.is_dir() else set()
    agents = [Watched(a) for a in scan(pdir, hours * 3600, others, live_sessions())]
    procs = proc_list() if procs is None else procs
    return stale(agents, now) + orphans(procs, agents) + overctx(agents, now) + unguarded(procs) + pods(agents)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--session", help="session id (default: the newest session transcript)")
    ap.add_argument("--hours", type=float, default=3.0, help="agents written to in the last N hours (a live one writes at least every 10 min)")
    ap.add_argument("--dir", type=Path, default=None, help="project transcript dir (default: this repo's)")
    ap.add_argument("--quiet", action="store_true", help="print nothing when there are no findings")
    a = ap.parse_args(argv)
    pdir = a.dir or project_dir()
    found = findings(pdir, a.session or newest_session(pdir), a.hours)
    if found:
        print("\n".join(found))
    elif not a.quiet:
        print("lane_watch: no findings")
    return 0


if __name__ == "__main__":
    sys.exit(main())
