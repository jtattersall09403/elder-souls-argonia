"""agent_guard.py (decision 0118): the lead-never-works rule."""
import json
import subprocess
import sys
from pathlib import Path

GUARD = Path(__file__).parent / "agent_guard.py"


def call(tool="Bash", kind="lead", agent=True, **inp):
    d = {"session_id": "s1", "agent_type": kind, "tool_name": tool,
         "tool_input": inp or {"command": "npm run typecheck"}}
    if agent:
        d["agent_id"] = "a1"
    return subprocess.run([sys.executable, str(GUARD)], input=json.dumps(d), text=True, capture_output=True)


def test_lead_never_edits_or_builds():
    for tool, inp in [("Edit", {"file_path": "/r/tooling/repo-standards/x.py"}),
                      ("Write", {"file_path": "/r/world/sources/a.json"}),
                      ("Bash", {"command": "python3 tooling/placement-workbench/wb.py apply x"}),
                      ("Bash", {"command": "cd tooling/world-generation && python3 -m pytest -q"}),
                      ("Bash", {"command": "npm test"}), ("Bash", {"command": "npm run kit:publish"}),
                      ("Bash", {"command": "bash tooling/repo-standards/job_guard.sh L -- node x.mjs"})]:
        r = call(tool, **inp)
        assert r.returncode == 2 and "0118" in r.stderr, (tool, inp)
    for tool, inp in [("Write", {"file_path": "/r/tooling/.reports/16k/lead.md"}),
                      ("Bash", {"command": "git commit -m x -- a.py"}), ("Bash", {"command": "git status"})]:
        assert call(tool, **inp).returncode == 0, (tool, inp)


def test_other_agents_and_planner_untouched():
    assert call("Edit", kind="deliver", file_path="/r/packages/a.ts").returncode == 0
    assert call("Bash", kind="deliver", command="npm test").returncode == 0
    assert call("Edit", agent=False, file_path="/r/packages/a.ts").returncode == 0


def test_garbage_allows():
    assert subprocess.run([sys.executable, str(GUARD)], input="nope", text=True).returncode == 0
