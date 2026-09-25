#!/usr/bin/env python3
"""List the subagent lanes a crashed session left unfinished, and print a
continuation packet that relaunches one from its literal transcript.

Owner ruling 2026-09-25: a crashed session's lanes resume from their own
transcripts, automatically, without the owner telling the next agent. The
SessionStart hook in .claude/settings.json runs `lane_resume.py --brief`; it
prints nothing when no lane is unfinished. PROGRESS.md protocol item 5 says
what to do with the output: relaunch each unfinished lane with its --packet
as the brief, before any new work.

Where the transcripts are: $CLAUDE_CONFIG_DIR (default ~/.claude)/projects/
<repo path, every non-alphanumeric character as '-'>/<session>/subagents/:
  agent-<id>.jsonl + agent-<id>.meta.json        a Task/Agent subagent
  workflows/<runId>/journal.jsonl + agent-<id>.* a Workflow script's agents
and <session>.jsonl beside the folder is the parent session's transcript.

An agent is FINISHED when any of these holds:
  - its workflow journal has a `result` record for it;
  - the parent transcript's last task-notification for it (or, for a
    workflow agent, for its run) has any status but `running` (completed,
    failed, or killed/stopped: the planner stopped it on purpose);
  - it called SubagentHandback;
  - its last message is the assistant's, ended (end_turn / stop_sequence),
    with no tool call in it.
It is SUPERSEDED (not listed) when the same workflow journal started the same
key again under a newer agent id. It is LIVE (not listed) when its session's
Claude process is alive ($CLAUDE_CONFIG_DIR/sessions/<pid>.json, pid checked
against /proc) and it was active after that process started: a session
reopened with `claude --resume` keeps its id, so its lanes from before the
crash still show. Everything else is UNFINISHED: a crash leaves a dangling
tool call, a tool result nobody answered, or an interruption.
A lane's jobs still running are found by identity, never by tool name: a
`job_guard.sh <lane>` slot held by a live pid for a lane name its open
commands used, or a process whose command line carries the text of one of
its open commands (a Bash call with no result, or one sent to the background);
either only if the process started before the lane's last activity, so a
relaunch's new job is never pinned on the dead lane.

  lane_resume.py                   one line per unfinished agent, newest first
  lane_resume.py --brief           the hook form: nothing, or a short block
  lane_resume.py --packet <id>     the continuation packet for one agent; it
                                   also CLAIMS the lane, so no other session is
                                   told to relaunch it (--no-claim to only look)
  lane_resume.py --check-live      also list heavy processes still running
  lane_resume.py --dismiss <id>... stop listing these (abandoned or judged done)
Claims and dismissals are kept in <project dir>/lane-resume-dismissed.json.
The hook form prints nothing in a headless session (CLAUDE_CODE_ENTRYPOINT
other than `cli`, e.g. the review gate's `claude -p`).
Options: --since DAYS (3), --last N tool calls in a packet (30),
--exclude-session ID (and $CLAUDE_SESSION_ID: that session skipped whole),
--project-dir DIR (tests), --all (also finished/superseded/live).
"""

from __future__ import annotations

import argparse
import functools
import json
import os
import re
import select
import subprocess
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
# --check-live's machine-wide list (the heavy jobs of docs/phases/lanes/README.md).
HEAVY = re.compile(r"blender|wb\.py|mine_[a-z_]+|build_kit|kit_compress|compile_[a-z_]+|preflight|"
                   r"npm (run )?test|pytest|vitest|job_guard\.sh|memwatch\.sh")
GUARD_LANE = re.compile(r"job_guard\.sh\s+(\S+)\s+--")
LOCK_DIR = Path(os.environ.get("ES_JOB_LOCK_DIR", "/tmp/es-jobs"))
NOTE = re.compile(r"<task-id>([A-Za-z0-9_-]+)</task-id>.{0,800}?<status>([a-z_]+)</status>", re.S)
EDIT_TOOLS = {"Edit", "Write", "MultiEdit", "NotebookEdit"}
CLOSING = "Continue from here; do not redo completed steps; your paths are unchanged."


def project_dir(repo: Path = REPO) -> Path:
    home = Path(os.environ.get("CLAUDE_CONFIG_DIR") or Path.home() / ".claude")
    return home / "projects" / re.sub(r"[^A-Za-z0-9]", "-", str(repo))


def parse_ts(value: str | None) -> float:
    if not value:
        return 0.0
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return 0.0


def read_jsonl(path: Path) -> list[dict]:
    out = []
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            for line in f:
                try:
                    out.append(json.loads(line))
                except json.JSONDecodeError:
                    continue   # a line cut by the crash
    except OSError:
        pass
    return out


def blocks(record: dict) -> list:
    content = (record.get("message") or {}).get("content")
    if isinstance(content, str):
        return [{"type": "text", "text": content}]
    return content if isinstance(content, list) else []


def text_of(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text")
    return ""


def one_line(value, limit: int) -> str:
    s = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
    s = re.sub(r"\s+", " ", s).strip()
    return s if len(s) <= limit else s[: limit - 1] + "…"


@dataclass
class Agent:
    agent_id: str
    session: str
    path: Path
    run: str = ""            # workflow run id, "" for a Task subagent
    label: str = ""
    agent_type: str = ""
    records: list = field(default_factory=list)
    status: str = "unfinished"
    first_ts: float = 0.0
    last_ts: float = 0.0

    def load(self) -> None:
        self.records = read_jsonl(self.path)
        stamps = [parse_ts(r.get("timestamp")) for r in self.records if r.get("timestamp")]
        self.first_ts = min(stamps) if stamps else self.path.stat().st_mtime
        self.last_ts = max(stamps) if stamps else self.path.stat().st_mtime

    def turns(self) -> list[dict]:
        return [r for r in self.records if r.get("type") in ("user", "assistant") and not r.get("isMeta")]

    def brief(self) -> str:
        for r in self.turns():
            if r["type"] == "user":
                return text_of((r.get("message") or {}).get("content"))
        return ""

    def tool_calls(self) -> list[tuple[dict, dict | None]]:
        """(tool_use block, tool_result block or None), in order."""
        results = {}
        for r in self.records:
            if r.get("type") == "user":
                for b in blocks(r):
                    if isinstance(b, dict) and b.get("type") == "tool_result":
                        results[b.get("tool_use_id")] = b
        calls = []
        for r in self.records:
            if r.get("type") == "assistant":
                for b in blocks(r):
                    if isinstance(b, dict) and b.get("type") == "tool_use":
                        calls.append((b, results.get(b.get("id"))))
        return calls

    def last_text(self) -> str:
        for r in reversed(self.records):
            if r.get("type") == "assistant":
                t = text_of(blocks(r))
                if t.strip():
                    return t
        return ""

    def ended_cleanly(self) -> bool:
        if any(u.get("name") == "SubagentHandback" and res is not None and not res.get("is_error")
               for u, res in self.tool_calls()):
            return True
        turns = self.turns()
        if not turns or turns[-1]["type"] != "assistant":
            return False
        last = turns[-1]
        return ((last.get("message") or {}).get("stop_reason") in ("end_turn", "stop_sequence")
                and not any(isinstance(b, dict) and b.get("type") == "tool_use" for b in blocks(last)))

    def edited_files(self) -> list[str]:
        out = []
        for u, _ in self.tool_calls():
            if u.get("name") in EDIT_TOOLS:
                p = (u.get("input") or {}).get("file_path") or (u.get("input") or {}).get("notebook_path")
                if p and p not in out:
                    out.append(p)
        return out

    def open_commands(self) -> list[str]:
        """The Bash commands this lane may have left running: those with no
        result (cut off mid-run) and those it sent to the background."""
        out = []
        for u, res in self.tool_calls():
            inp = u.get("input") or {}
            if u.get("name") == "Bash" and (res is None or inp.get("run_in_background") or
                                            text_of(res.get("content")).startswith("Command running in background")):
                out.append(inp.get("command", ""))
        return out


def processes() -> list[tuple[str, str]]:
    """(pid, "pid etime args") for every process but this one."""
    try:
        out = subprocess.run(["ps", "-eo", "pid=,etime=,args="], capture_output=True, text=True, timeout=10).stdout
    except (OSError, subprocess.SubprocessError):
        return []
    me = str(os.getpid())
    rows = [(ln.split(None, 1)[0], ln.strip()) for ln in out.splitlines() if ln.strip()]
    return [(pid, ln) for pid, ln in rows if pid != me and "lane_resume" not in ln]


@functools.lru_cache(maxsize=None)
def _btime() -> int:
    return next(int(ln.split()[1]) for ln in Path("/proc/stat").read_text().splitlines() if ln.startswith("btime "))


@functools.lru_cache(maxsize=None)
def proc_start(pid: str) -> float:
    """Epoch seconds a process started (0.0 when unknown)."""
    try:
        ticks = int(Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()[19])
        return _btime() + ticks / os.sysconf("SC_CLK_TCK")
    except (OSError, ValueError, IndexError, StopIteration):
        return 0.0


def lane_jobs(a: "Agent", procs: list[tuple[str, str]]) -> list[str]:
    """Jobs of this lane still running, by identity (module docstring)."""
    started_by_lane = lambda pid: 0 < proc_start(pid) <= a.last_ts + 5  # noqa: E731
    hits = []
    cmds = a.open_commands()
    lanes = {m for c in cmds for m in GUARD_LANE.findall(c)}
    for lock in sorted(LOCK_DIR.glob("slot-*.lock")) if lanes else []:
        try:
            _, lane, _, pid = lock.read_text().split(None, 4)[:4]
        except (OSError, ValueError):
            continue
        if lane in lanes and started_by_lane(pid.rstrip(":")):
            hits.append(f"job_guard slot {lock.name}: {lock.read_text().strip()}")
    # The command text itself: Claude runs a Bash call as `bash -c ... eval '<command>'`,
    # and a job it started carries its own command line, which the call's text contains.
    keys = [re.sub(r"\s+", " ", c).strip()[:80] for c in cmds]
    keys = [k.split("'")[0] for k in keys if len(k.split("'")[0]) >= 20]
    for pid, ln in procs:
        args = ln.split(None, 2)[2] if len(ln.split(None, 2)) == 3 else ""
        flat = re.sub(r"\s+", " ", args)
        if (any(k in flat for k in keys) or (len(flat) >= 20 and any(flat in re.sub(r"\s+", " ", c) for c in cmds))) \
                and started_by_lane(pid):
            hits.append(ln)
    return hits


RUN_LAUNCH = re.compile(r"Task ID: ([A-Za-z0-9_-]+).{0,1500}?Run ID: (wf_[A-Za-z0-9_-]+)", re.S)


@dataclass
class Parent:
    """What the parent session's transcript says about its background tasks."""
    status: dict      # task id -> last notified status (completed, killed, failed, stopped, running...)
    run_task: dict    # workflow run id -> its task id


def read_parent(session_file: Path) -> Parent:
    try:
        raw = session_file.read_text(encoding="utf-8", errors="replace").replace("\\n", "\n")
    except OSError:
        return Parent({}, {})
    status = {m.group(1): m.group(2) for m in NOTE.finditer(raw)}   # the last one wins
    return Parent(status, {m.group(2): m.group(1) for m in RUN_LAUNCH.finditer(raw)})


def terminal(status: str | None) -> bool:
    """Any notified status but `running` means the task ended (completed,
    killed, failed, stopped: a stop is the planner's choice, not a crash)."""
    return bool(status) and status != "running"


def live_sessions() -> dict[str, float]:
    """Session id -> start time (epoch s) of its live Claude process, from
    $CLAUDE_CONFIG_DIR/sessions/<pid>.json (pid + procStart, checked against
    /proc so a reused pid does not count)."""
    home = Path(os.environ.get("CLAUDE_CONFIG_DIR") or Path.home() / ".claude")
    live: dict[str, float] = {}
    for f in (home / "sessions").glob("*.json"):
        try:
            d = json.loads(f.read_text())
            pid, sid = int(d["pid"]), d["sessionId"]
            stat = Path(f"/proc/{pid}/stat").read_text()
        except (OSError, ValueError, KeyError, TypeError):
            continue
        start = stat.rsplit(")", 1)[1].split()[19]   # field 22, starttime
        if str(d.get("procStart", start)) == start:
            live[sid] = max(live.get(sid, 0.0), float(d.get("startedAt", 0)) / 1000)
    return live


def dismissed_file(pdir: Path) -> Path:
    return pdir / "lane-resume-dismissed.json"


def load_dismissed(pdir: Path) -> dict[str, str]:
    """agent id -> why it is no longer listed ("dismissed", "claimed by <session> at <time>")."""
    try:
        data = json.loads(dismissed_file(pdir).read_text())
    except (OSError, ValueError, TypeError):
        return {}
    return {i: "dismissed" for i in data} if isinstance(data, list) else dict(data)


def save_dismissed(pdir: Path, add: dict[str, str]) -> None:
    data = {**load_dismissed(pdir), **add}
    tmp = dismissed_file(pdir).with_suffix(f".{os.getpid()}.tmp")
    tmp.write_text(json.dumps(data, indent=1, sort_keys=True) + "\n")
    tmp.replace(dismissed_file(pdir))


def scan(pdir: Path, since_s: float, exclude: set[str], live: dict[str, float] | None = None) -> list[Agent]:
    now = time.time()
    live = live or {}
    dismissed = load_dismissed(pdir)
    agents: list[Agent] = []
    if not pdir.is_dir():
        return agents
    sessions = [d for d in pdir.iterdir() if d.is_dir() and (d / "subagents").is_dir()]
    for sdir in sessions:
        sid = sdir.name
        if sid in exclude:
            continue
        sub = sdir / "subagents"
        parent: Parent | None = None
        found: list[Agent] = []
        for f in sub.glob("agent-*.jsonl"):
            if now - f.stat().st_mtime > since_s:
                continue
            a = Agent(f.stem[len("agent-"):], sid, f)
            meta = _meta(f)
            a.label, a.agent_type = meta.get("description", ""), meta.get("agentType", "")
            if parent is None:   # read the (large) parent transcript only when needed
                parent = read_parent(pdir / f"{sid}.jsonl")
            if terminal(parent.status.get(a.agent_id)):
                a.status = parent.status[a.agent_id]
            found.append(a)
        for jdir in (sub / "workflows").glob("*") if (sub / "workflows").is_dir() else []:
            journal = read_jsonl(jdir / "journal.jsonl")
            started = [r for r in journal if r.get("type") == "started"]
            done = {r.get("agentId") for r in journal if r.get("type") == "result"}
            for f in jdir.glob("agent-*.jsonl"):
                if now - f.stat().st_mtime > since_s:
                    continue
                a = Agent(f.stem[len("agent-"):], sid, f, run=jdir.name)
                meta = _meta(f)
                a.agent_type = meta.get("agentType", "")
                mine = [i for i, r in enumerate(started) if r.get("agentId") == a.agent_id]
                a.label = started[mine[-1]].get("label", "") if mine else meta.get("description", "")
                if a.agent_id in done:
                    a.status = "completed"
                elif mine and any(r.get("key") == started[mine[-1]].get("key") for r in started[mine[-1] + 1:]):
                    a.status = "superseded"
                else:
                    # The run itself ended (stopped, failed...): its open agents ended with it.
                    if parent is None:
                        parent = read_parent(pdir / f"{sid}.jsonl")
                    run_status = parent.status.get(parent.run_task.get(jdir.name, ""))
                    if terminal(run_status):
                        a.status = f"run {run_status}"
                found.append(a)
        for a in found:
            a.load()
            if a.status == "unfinished" and a.ended_cleanly():
                a.status = "completed"
            if a.status == "unfinished" and a.agent_id in dismissed:
                a.status = dismissed[a.agent_id]
            if a.status == "unfinished" and sid in live and a.last_ts >= live[sid]:
                a.status = "live"   # its session's process is alive and was when it last ran
        agents.extend(found)
    agents.sort(key=lambda a: a.last_ts, reverse=True)
    return agents


def _meta(jsonl: Path) -> dict:
    try:
        return json.loads(jsonl.with_suffix(".meta.json").read_text())
    except (OSError, json.JSONDecodeError):
        return {}


def summary(a: Agent, procs: list[tuple[str, str]] | None) -> str:
    idle = int((time.time() - a.last_ts) // 60)
    calls = a.tool_calls()
    last = "-"
    if calls:
        u, res = calls[-1]
        inp = u.get("input") or {}
        arg = inp.get("command") or inp.get("file_path") or inp.get("pattern") or inp
        last = f"{u.get('name')}({one_line(arg, 60)}){'' if res else ' [no result]'}"
    where = f"{a.session[:8]}{'/' + a.run if a.run else ''}"
    line = f"{where}  {a.agent_id}  [{a.agent_type or '?'}] {a.label or '-'}  idle {idle} min  last {last}"
    if a.status != "unfinished":
        line += f"  ({a.status})"
    elif idle < 5:
        line += "  (active under 5 min ago: check it is not still running)"
    if procs is not None:
        hits = lane_jobs(a, procs)
        if hits:
            line += f"  JOBS STILL RUNNING: {len(hits)} (see --packet)"
    return line


def git(*args: str) -> str:
    r = subprocess.run(["git", "-C", str(REPO), *args], capture_output=True, text=True)
    return r.stdout.strip() if r.returncode == 0 else ""


def repo_rel(path: str) -> str:
    """A transcript's absolute path as a path in this checkout (the transcript
    may come from another machine: the part after the repo's folder name)."""
    marker = "/" + REPO.name + "/"
    rel = path[len(str(REPO)) + 1:] if path.startswith(str(REPO) + "/") else path.split(marker, 1)[1] if marker in path else ""
    return rel if rel and (REPO / rel).exists() else ""


def brief_paths(brief: str) -> list[str]:
    """Repo paths the brief names (a `{a,b}` group expanded one level)."""
    out = []
    for tok in re.findall(r"[A-Za-z0-9_.{},*/-]+/[A-Za-z0-9_.{},*/-]+", brief):
        tok = tok.strip(".,;:)")
        m = re.match(r"(.*)\{([^{}]*)\}(.*)", tok)
        for cand in ([m.group(1) + x + m.group(3) for x in m.group(2).split(",")] if m else [tok]):
            cand = cand.replace("/**", "").rstrip("/*")
            cand = repo_rel(cand) if cand.startswith("/") else cand
            if cand and (REPO / cand).exists() and cand not in out:
                out.append(cand)
    return out


def packet(a: Agent, last_n: int) -> str:
    brief = a.brief()
    lines = [f"# Continuation packet: agent {a.agent_id} ({a.agent_type or '?'}, \"{a.label}\")",
             f"Session {a.session}{', workflow run ' + a.run if a.run else ''}; transcript {a.path}",
             f"Brief given {datetime.fromtimestamp(a.first_ts, timezone.utc):%Y-%m-%d %H:%M} UTC; "
             f"last activity {datetime.fromtimestamp(a.last_ts, timezone.utc):%Y-%m-%d %H:%M} UTC.",
             "", "## Original brief", brief.strip(), ""]
    calls = a.tool_calls()
    lines.append(f"## Last {min(last_n, len(calls))} of {len(calls)} tool calls (oldest first)")
    for i, (u, res) in enumerate(calls[-last_n:], start=max(1, len(calls) - last_n + 1)):
        got = "NO RESULT (cut off here)" if res is None else one_line(text_of(res.get("content")) or res.get("content", ""), 300)
        lines.append(f"{i}. {u.get('name')} {one_line(u.get('input') or {}, 200)}")
        lines.append(f"   -> {'ERROR: ' if res and res.get('is_error') else ''}{got}")
    lines += ["", "## Last assistant text", a.last_text().strip() or "(none)", ""]
    if a.run:
        scripts = sorted((a.path.parents[3] / "workflows" / "scripts").glob(f"*{a.run}.js"))
        lines += [f"This agent ran in workflow run {a.run}"
                  + (f" (script {scripts[0]}): relaunching the run with Workflow({{scriptPath, "
                     f"resumeFromRunId: \"{a.run}\"}}) reuses its returned agents' results." if scripts else "."), ""]
    paths = sorted(set(brief_paths(brief)) | {q for q in map(repo_rel, a.edited_files()) if q})
    base = git("rev-list", "-1", f"--before={int(a.first_ts)}", "HEAD")
    lines.append(f"## Files changed on its paths since {base[:8] or 'the brief'} (git)")
    if paths:
        stat = git("diff", "--stat", base, "--", *paths) if base else ""
        status = git("status", "--short", "--", *paths)
        lines.append(stat or "(no diff against that commit)")
        lines.append("Working tree now:\n" + (status or "(clean on these paths)"))
    else:
        lines.append("(the brief names no existing repo path and the agent edited none)")
    running = lane_jobs(a, processes())
    if running:
        lines += ["", "## WARNING: jobs this lane started are still running", *running,
                  "Wait for them or kill them before relaunching; never run the same job twice."]
    lines += ["", CLOSING]
    return "\n".join(lines)


def hook_session_id() -> str:
    """The session_id a SessionStart hook passes on stdin, if any (never blocks)."""
    try:
        if sys.stdin is None or sys.stdin.isatty():
            return ""
        ready, _, _ = select.select([sys.stdin], [], [], 0.2)
        if not ready:
            return ""
        return str(json.loads(sys.stdin.read() or "{}").get("session_id", ""))
    except (OSError, ValueError, AttributeError):
        return ""


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--brief", action="store_true")
    ap.add_argument("--packet", metavar="AGENT_ID")
    ap.add_argument("--check-live", action="store_true")
    ap.add_argument("--since", type=float, default=3.0, help="days")
    ap.add_argument("--last", type=int, default=30)
    ap.add_argument("--exclude-session", action="append", default=[])
    ap.add_argument("--project-dir", type=Path)
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--dismiss", nargs="+", metavar="AGENT_ID")
    ap.add_argument("--no-claim", action="store_true")
    args = ap.parse_args(argv)
    pdir = args.project_dir or project_dir()

    if args.dismiss:
        save_dismissed(pdir, {i: "dismissed" for i in args.dismiss})
        print(f"lane_resume: dismissed {' '.join(args.dismiss)}")
        return 0
    if args.brief and os.environ.get("CLAUDE_CODE_ENTRYPOINT", "cli") != "cli":
        return 0   # a headless session (claude -p) never relaunches lanes

    # CLAUDE_SESSION_ID is an explicit opt-in (Claude Code does not set it); the
    # CLI's own CLAUDE_CODE_SESSION_ID (set in its hooks and Bash calls) only
    # labels claims: excluding it would hide a resumed session's dead lanes.
    exclude = set(args.exclude_session) | ({os.environ["CLAUDE_SESSION_ID"]} if os.environ.get("CLAUDE_SESSION_ID") else set())
    if args.brief:
        hook_session_id()   # drain the hook's stdin; its own session is judged by the live rule
    agents = scan(pdir, args.since * 86400, set() if args.packet else exclude,
                  None if args.packet else live_sessions())

    if args.packet:
        hit = [a for a in agents if a.agent_id == args.packet or a.agent_id.startswith(args.packet)]
        if not hit:
            print(f"lane_resume: no agent {args.packet} within {args.since:g} days under {pdir}", file=sys.stderr)
            return 2
        print(packet(hit[0], args.last))
        if not args.no_claim:
            who = os.environ.get("CLAUDE_CODE_SESSION_ID", "")[:8] or "a shell"
            save_dismissed(pdir, {hit[0].agent_id: f"claimed by {who} at {datetime.now(timezone.utc):%Y-%m-%d %H:%M} UTC"})
        return 0

    shown = [a for a in agents if args.all or a.status == "unfinished"]
    procs = processes() if (args.check_live or args.brief) else None
    if args.brief:
        if not shown:
            return 0
        print(f"[lane_resume] {len(shown)} lane(s) left unfinished by an earlier session (PROGRESS.md protocol 5):")
        for a in shown:
            print("  " + summary(a, procs))
        print("Relaunch each with the output of `python3 tooling/repo-standards/lane_resume.py --packet <agent-id>` "
              "as its brief (same agent type), before any new work (printing a packet claims the lane); "
              "`--dismiss <agent-id>` a lane you judge finished or obsolete.")
        return 0
    for a in shown:
        print(summary(a, procs))
    if args.check_live:
        for _, p in procs or []:
            if HEAVY.search(p):
                print(f"live heavy process: {p}")
    return 0


if __name__ == "__main__":
    import signal
    signal.signal(signal.SIGPIPE, signal.SIG_DFL)   # `| head` ends quietly
    sys.exit(main())
