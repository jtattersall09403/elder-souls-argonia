"""agent_cap.py: at most CAP live subagents per session tree (owner 2026-09-30)."""
import json
import subprocess
import sys
from pathlib import Path

CAP_PY = Path(__file__).parent / "agent_cap.py"


def hook(tmp, ev, **kw):
    d = {"hook_event_name": ev, "session_id": "s1", **kw}
    env = {"ES_AGENT_CAP_DIR": str(tmp), "ES_AGENT_CAP": "3", "PATH": "/usr/bin:/bin"}
    return subprocess.run([sys.executable, str(CAP_PY)], input=json.dumps(d), text=True,
                          capture_output=True, env=env).returncode


def test_cap_refuses_then_frees_a_slot_on_stop(tmp_path):
    for i in range(3):
        assert hook(tmp_path, "PreToolUse", tool_name="Agent") == 0
        assert hook(tmp_path, "SubagentStart", agent_id=f"a{i}") == 0
    assert hook(tmp_path, "PreToolUse", tool_name="Agent") == 2
    assert hook(tmp_path, "SubagentStop", agent_id="a1") == 0
    assert hook(tmp_path, "PreToolUse", tool_name="Agent") == 0


def test_parallel_launches_count_before_they_start(tmp_path):
    # three Agent calls in one message: none has started when the fourth asks
    for _ in range(3):
        assert hook(tmp_path, "PreToolUse", tool_name="Agent") == 0
    assert hook(tmp_path, "PreToolUse", tool_name="Task") == 2


def test_other_tools_and_sessions_are_not_counted(tmp_path):
    for _ in range(5):
        assert hook(tmp_path, "PreToolUse", tool_name="Bash") == 0
    for i in range(3):
        hook(tmp_path, "SubagentStart", agent_id=f"a{i}")
    d = {"hook_event_name": "PreToolUse", "session_id": "s2", "tool_name": "Agent"}
    env = {"ES_AGENT_CAP_DIR": str(tmp_path), "ES_AGENT_CAP": "3", "PATH": "/usr/bin:/bin"}
    assert subprocess.run([sys.executable, str(CAP_PY)], input=json.dumps(d), text=True,
                          env=env).returncode == 0


def test_stale_entries_expire(tmp_path):
    sys.path.insert(0, str(CAP_PY.parent))
    import agent_cap
    agent_cap.DIR = str(tmp_path)
    for i in range(agent_cap.CAP):
        agent_cap.handle({"hook_event_name": "SubagentStart", "session_id": "s", "agent_id": f"a{i}"}, now=0)
    ev = {"hook_event_name": "PreToolUse", "session_id": "s", "tool_name": "Agent"}
    assert agent_cap.handle(dict(ev), now=10)[0] == 2
    assert agent_cap.handle(dict(ev), now=agent_cap.STALE_S + 1)[0] == 0


def test_garbage_input_allows(tmp_path):
    env = {"ES_AGENT_CAP_DIR": str(tmp_path), "PATH": "/usr/bin:/bin"}
    assert subprocess.run([sys.executable, str(CAP_PY)], input="not json", text=True, env=env).returncode == 0
