"""shell_guard.py: `sleep` is refused for every agent (owner 2026-09-25); the
exploration words only for the planner (decision 0079)."""
import json
import subprocess
import sys
from pathlib import Path

GUARD = Path(__file__).parent / "shell_guard.py"


def code(cmd, sub):
    d = {"tool_name": "Bash", "tool_input": {"command": cmd}}
    if sub:
        d.update(agent_id="a1", agent_type="run")
    return subprocess.run([sys.executable, str(GUARD)], input=json.dumps(d), text=True,
                          capture_output=True).returncode


def test_sleep_refused_for_planner_and_subagents():
    for cmd in ["sleep 30", "npm run build; sleep 5", "while true; do sleep 5; done",
                "cd x && sleep 1", "(sleep 2; ls)", "timeout 60 sleep 30", "rtk sleep 3"]:
        assert code(cmd, sub=True) == 2, cmd
        assert code(cmd, sub=False) == 2, cmd


def test_sleep_as_a_word_is_not_a_command():
    for cmd in ["echo sleepy", "git commit -m 'no sleep polling'", "python3 x.py --sleep-s 3",
                "grep -n time.sleep x.py"]:
        assert code(cmd, sub=True) == 0, cmd


def test_exploration_words_still_planner_only():
    assert code("grep -rn foo .", sub=False) == 2
    assert code("grep -rn foo .", sub=True) == 0
    assert code("npm test", sub=False) == 0
