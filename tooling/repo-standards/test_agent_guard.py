"""agent_guard.py (decision 0118): the Opus context cap and the lead-never-works rule."""
import json
import subprocess
import sys
from pathlib import Path

GUARD = Path(__file__).parent / "agent_guard.py"
sys.path.insert(0, str(GUARD.parent))
import agent_guard  # noqa: E402


def transcript(tmp_path, n, workflow=False):
    """A project folder with session s1 and agent a1 holding n assistant turns
    (each turn split over two records with one message id, as the harness writes)."""
    sub = tmp_path / "s1" / "subagents" / ("workflows/wf_1" if workflow else "")
    sub.mkdir(parents=True, exist_ok=True)
    with open(sub / "agent-a1.jsonl", "w") as f:
        f.write(json.dumps({"type": "user", "message": {"content": "brief"}}) + "\n")
        for i in range(n):
            for _ in range(2):
                f.write(json.dumps({"type": "assistant", "message": {"id": f"msg_{i:04d}", "content": []}}) + "\n")
    return str(tmp_path / "s1.jsonl")


def call(tmp_path, n, tool="Bash", kind="deliver", workflow=False, **inp):
    d = {"session_id": "s1", "agent_id": "a1", "agent_type": kind, "tool_name": tool,
         "transcript_path": transcript(tmp_path, n, workflow), "tool_input": inp or {"command": "npm run typecheck"}}
    return subprocess.run([sys.executable, str(GUARD)], input=json.dumps(d), text=True, capture_output=True)


def test_turns_count_distinct_messages(tmp_path):
    transcript(tmp_path, 7)
    assert agent_guard.turns(tmp_path / "s1/subagents/agent-a1.jsonl") == 7


def test_under_nudge_is_silent(tmp_path):
    r = call(tmp_path, 149)
    assert r.returncode == 0 and r.stdout == ""


def test_nudge_at_150_lets_the_call_run(tmp_path):
    r = call(tmp_path, 150)
    assert r.returncode == 0 and "hand-off note" in r.stdout and "0118" in r.stdout


def test_refuse_at_180_except_report_and_handback(tmp_path):
    r = call(tmp_path, 180)
    assert r.returncode == 2 and "SubagentHandback" in r.stderr and "0118" in r.stderr
    assert call(tmp_path, 200, tool="Write", file_path="/r/tooling/.reports/16k/x.md").returncode == 0
    assert call(tmp_path, 200, tool="Edit", file_path="/r/packages/a.ts").returncode == 2
    assert call(tmp_path, 200, tool="SubagentHandback", message="done").returncode == 0
    assert call(tmp_path, 200, workflow=True).returncode == 2          # Workflow agents' layout too


def test_cheap_tiers_and_planner_uncapped(tmp_path):
    assert call(tmp_path, 300, kind="find").returncode == 0
    assert call(tmp_path, 300, kind="run").returncode == 0
    d = {"session_id": "s1", "tool_name": "Bash", "tool_input": {"command": "ls"}}
    assert agent_guard.decide(d, n_turns=500) == (0, "")


def test_lead_never_edits_or_builds(tmp_path):
    for tool, inp in [("Edit", {"file_path": "/r/tooling/repo-standards/x.py"}),
                      ("Write", {"file_path": "/r/world/sources/a.json"}),
                      ("Bash", {"command": "python3 tooling/placement-workbench/wb.py apply x"}),
                      ("Bash", {"command": "cd tooling/world-generation && python3 -m pytest -q"}),
                      ("Bash", {"command": "npm test"}), ("Bash", {"command": "npm run kit:publish"}),
                      ("Bash", {"command": "bash tooling/repo-standards/job_guard.sh L -- node x.mjs"})]:
        r = call(tmp_path, 10, tool=tool, kind="lead", **inp)
        assert r.returncode == 2 and "0118" in r.stderr, (tool, inp)
    for tool, inp in [("Write", {"file_path": "/r/tooling/.reports/16k/lead.md"}),
                      ("Bash", {"command": "git commit -m x -- a.py"}), ("Bash", {"command": "git status"})]:
        assert call(tmp_path, 10, tool=tool, kind="lead", **inp).returncode == 0, (tool, inp)


def test_garbage_and_missing_transcript_allow(tmp_path):
    assert subprocess.run([sys.executable, str(GUARD)], input="nope", text=True).returncode == 0
    d = {"session_id": "nope", "agent_id": "zz", "agent_type": "deliver", "tool_name": "Bash",
         "transcript_path": str(tmp_path / "nope.jsonl"), "tool_input": {"command": "ls"}}
    assert subprocess.run([sys.executable, str(GUARD)], input=json.dumps(d), text=True).returncode == 0
