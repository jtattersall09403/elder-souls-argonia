"""lane_resume.py on anonymised copies of real subagent transcripts
(fixtures/lane_resume: `done` ended with SubagentHandback, `cut` ends on a
tool call with no result, as a crash leaves it). Proves the list, the hook
form (--brief, session id on stdin) and the continuation packet."""

import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
TOOL = HERE / "lane_resume.py"
FIX = HERE / "fixtures" / "lane_resume"


def run(pdir: Path, *args: str, stdin: str = "", entrypoint: str = "cli") -> str:
    # CLAUDE_CONFIG_DIR = the project dir's grandparent: its sessions/ is the test's own.
    env = {**os.environ, "CLAUDE_CONFIG_DIR": str(pdir.parent), "CLAUDE_CODE_ENTRYPOINT": entrypoint}
    r = subprocess.run([sys.executable, str(TOOL), "--project-dir", str(pdir), *args],
                       input=stdin, capture_output=True, text=True, timeout=60, env=env)
    assert r.returncode == 0, r.stderr
    return r.stdout


def agent(dirpath: Path, agent_id: str, kind: str, label: str) -> None:
    dirpath.mkdir(parents=True, exist_ok=True)
    shutil.copy(FIX / f"{kind}.jsonl", dirpath / f"agent-{agent_id}.jsonl")
    (dirpath / f"agent-{agent_id}.meta.json").write_text(json.dumps({"agentType": "deliver", "description": label}))


@pytest.fixture()
def project(tmp_path: Path) -> Path:
    pdir = tmp_path / "project"
    sub = pdir / "sess-a" / "subagents"
    agent(sub, "a1done", "done", "finished lookup")
    agent(sub, "a2cut", "cut", "crashed lane")
    agent(sub, "a5killed", "cut", "killed on purpose")
    agent(sub, "a8stopped", "cut", "stopped on purpose")
    agent(sub, "a9running", "cut", "notified running, then cut")
    # The parent transcript (JSON-escaped as on disk): the planner killed a5 and
    # stopped a8 (TaskStop) and workflow run wf_2; a9 was last seen running.
    def note(task: str, status: str) -> str:
        return f"<task-notification>\n<task-id>{task}</task-id>\n<status>{status}</status>\n</task-notification>"
    launch = ("Workflow launched in background. Task ID: w2stop\nSummary: x\nTranscript dir: "
              ".../subagents/workflows/wf_2\nRun ID: wf_2\n")
    (pdir / "sess-a.jsonl").write_text("".join(
        json.dumps({"type": "user", "message": {"role": "user", "content": c}}) + "\n"
        for c in (note("a5killed", "killed"), note("a8stopped", "stopped"), note("a9running", "running"),
                  launch, note("w2stop", "stopped"))))
    agent(sub / "workflows" / "wf_2", "a10inrun", "cut", "lane of a stopped run")
    (sub / "workflows" / "wf_2" / "journal.jsonl").write_text(json.dumps(
        {"type": "started", "key": "k9", "agentId": "a10inrun", "label": "lane of a stopped run"}) + "\n")
    wf = sub / "workflows" / "wf_1"
    agent(wf, "a3ret", "cut", "returned lane")
    agent(wf, "a4old", "cut", "retried lane")
    agent(wf, "a6new", "cut", "retried lane")
    agent(wf, "a7open", "cut", "open workflow lane")
    (wf / "journal.jsonl").write_text("\n".join(json.dumps(r) for r in [
        {"type": "launched"},
        {"type": "started", "key": "k1", "agentId": "a3ret", "label": "returned lane"},
        {"type": "result", "key": "k1", "agentId": "a3ret", "result": "done"},
        {"type": "started", "key": "k2", "agentId": "a4old", "label": "retried lane"},
        {"type": "started", "key": "k2", "agentId": "a6new", "label": "retried lane"},
        {"type": "result", "key": "k2", "agentId": "a6new", "result": "done"},
        {"type": "started", "key": "k3", "agentId": "a7open", "label": "open workflow lane"},
    ]) + "\n")
    agent(pdir / "sess-b" / "subagents", "b1cut", "cut", "other session lane")
    # Two sessions whose Claude process is alive (this test's own pid). sess-live's
    # process started before its agent last ran: the agent is live, skipped.
    # sess-resumed's process started after (a `claude --resume` of a crashed
    # session keeps the id): its agent died in the crash and is listed.
    agent(pdir / "sess-live" / "subagents", "l1cut", "cut", "running in a live session")
    agent(pdir / "sess-resumed" / "subagents", "r1cut", "cut", "died before the resume")
    start = Path("/proc/self/stat").read_text().rsplit(")", 1)[1].split()[19]
    (tmp_path / "sessions").mkdir()
    for n, (sid, started) in enumerate((("sess-live", 0), ("sess-resumed", int(time.time() * 1000)))):
        (tmp_path / "sessions" / f"{os.getpid()}-{n}.json").write_text(json.dumps(
            {"pid": os.getpid(), "sessionId": sid, "procStart": start, "startedAt": started}))
    return pdir


def ids(out: str) -> set[str]:
    return {line.split()[1] for line in out.splitlines() if line.startswith(("sess-", "  sess-"))
            or line.lstrip().startswith("sess-")}


def test_list_names_only_the_unfinished(project: Path) -> None:
    out = run(project)
    assert ids(out) == {"a2cut", "a7open", "a9running", "b1cut", "r1cut"}
    assert "[no result]" in out and "idle" in out
    every = run(project, "--all")
    assert {"a1done", "a3ret", "a4old", "a5killed", "a6new", "a8stopped", "a10inrun"} <= ids(every)
    assert "(stopped)" in every and "(run stopped)" in every
    assert "(live)" in every and "l1cut" in every


def test_brief_hook_form_and_silent_when_nothing_is_open(project: Path, tmp_path: Path) -> None:
    out = run(project, "--brief", stdin=json.dumps({"session_id": "sess-resumed", "source": "resume"}))
    assert ids(out) == {"a2cut", "a7open", "a9running", "b1cut", "r1cut"}
    assert "--packet <agent-id>" in out
    assert run(project, "--brief", entrypoint="sdk-cli") == ""   # headless (claude -p): silent
    clean = tmp_path / "clean"
    agent(clean / "sess-z" / "subagents", "z1", "done", "finished")
    assert run(clean, "--brief") == ""


def test_packet_carries_brief_digest_last_text_and_closing_line(project: Path) -> None:
    out = run(project, "--packet", "a2cut", "--last", "1")
    brief = json.loads((FIX / "cut.jsonl").read_text().splitlines()[0])["message"]["content"]
    first = (brief if isinstance(brief, str) else brief[0]["text"]).strip().splitlines()[0]
    assert "## Original brief" in out and first in out
    assert "## Last 1 of 2 tool calls" in out and out.count("\n   -> ") == 1
    assert "NO RESULT (cut off here)" in out
    assert "## Last assistant text" in out and "## Files changed on its paths" in out
    assert out.rstrip().endswith("Continue from here; do not redo completed steps; your paths are unchanged.")
    # Printing the packet claimed the lane: no other session is told to relaunch it.
    assert "a2cut" not in ids(run(project)) and "(claimed by " in run(project, "--all")
    run(project, "--packet", "a7open", "--no-claim")
    assert "a7open" in ids(run(project))


def test_dismiss_stops_listing(project: Path) -> None:
    run(project, "--dismiss", "a2cut")
    assert ids(run(project)) == {"a7open", "a9running", "b1cut", "r1cut"}


def test_a_job_is_pinned_on_a_lane_by_its_own_open_command_or_guard_lane(tmp_path: Path, monkeypatch) -> None:
    sys.path.insert(0, str(HERE))
    import lane_resume as lr
    a = lr.Agent("x", "s", FIX / "cut.jsonl")

    def call(cmd: str, result, bg: bool = False) -> list:
        use = {"type": "tool_use", "id": cmd, "name": "Bash", "input": {"command": cmd, "run_in_background": bg}}
        out = [{"type": "assistant", "message": {"content": [use]}}]
        if result is not None:
            out.append({"type": "user", "message": {"content": [
                {"type": "tool_result", "tool_use_id": cmd, "content": result}]}})
        return out
    a.records = (call("blender -b finished.blend --python x.py", "ok")
                 + call("bash tooling/repo-standards/job_guard.sh miner -- python3 -m worldgen.mine_mounts --jobs 2",
                        "Command running in background with ID: x")
                 + call("python3 pipeline/build_kit.py settlement-stilt-v1 > /tmp/k.log", None))
    a.last_ts = 1000.0
    # Processes 11-13 and the job_guard pid started while the lane ran; 14 after (a relaunch's job).
    monkeypatch.setattr(lr, "proc_start", lambda pid: 2000.0 if pid == "14" else 900.0)
    monkeypatch.setattr(lr, "LOCK_DIR", tmp_path)
    (tmp_path / "slot-0.lock").write_text(f"2026-09-25T00:00:00Z miner pid {os.getpid()}: python3 ...\n")
    (tmp_path / "slot-1.lock").write_text(f"2026-09-25T00:00:00Z kits pid {os.getpid()}: other lane\n")
    procs = [("11", "11 01:00 python3 pipeline/build_kit.py settlement-stilt-v1"),   # this lane's cut-off job
             ("12", "12 01:00 python3 pipeline/build_kit.py settlement-imperial-v1"),  # another lane's build
             ("13", "13 01:00 blender -b other.blend --python y.py"),                 # same tool, not this lane's
             ("14", "14 00:10 python3 pipeline/build_kit.py settlement-stilt-v1")]    # the relaunch's own job
    hits = lr.lane_jobs(a, procs)
    assert any("slot-0.lock" in h for h in hits) and not any("slot-1.lock" in h for h in hits)
    assert [h for h in hits if not h.startswith("job_guard")] == [procs[0][1]]
