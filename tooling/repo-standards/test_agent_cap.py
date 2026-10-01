"""agent_cap.py: CPU-and-memory admission gate for subagent spawns (owner 2026-10-01)."""
import json
import subprocess
import sys
from pathlib import Path

CAP_PY = Path(__file__).parent / "agent_cap.py"
sys.path.insert(0, str(CAP_PY.parent))
import agent_cap  # noqa: E402

GIB = 1024
FINE = dict(mem_mib=lambda: 8 * GIB, ceiling_mib=lambda: 22 * GIB, load1=lambda: 4.0,
            cores=lambda: 8, slots_busy=lambda now: False)
EV = {"hook_event_name": "PreToolUse", "session_id": "s", "tool_name": "Agent"}


def gate(tmp_path, monkeypatch, now=100.0, **over):
    monkeypatch.setattr(agent_cap, "DIR", str(tmp_path))
    for k, v in {**FINE, **over}.items():
        monkeypatch.setattr(agent_cap, k, v)
    return agent_cap.handle(dict(EV), now=now)


def test_both_fine_admits_and_logs(tmp_path, monkeypatch):
    code, _ = gate(tmp_path, monkeypatch)
    assert code == 0
    assert "admit" in (tmp_path / "admissions.log").read_text()


def test_memory_high_refuses_with_numbers(tmp_path, monkeypatch):
    # 21 GiB unreclaimable + the per-agent reserve passes the 22 GiB ceiling
    code, msg = gate(tmp_path, monkeypatch, mem_mib=lambda: 21 * GIB)
    assert code == 2 and "22.0 GiB" in msg and "job_guard" in msg
    assert "refuse" in (tmp_path / "admissions.log").read_text()


def test_load_high_refuses(tmp_path, monkeypatch):
    code, msg = gate(tmp_path, monkeypatch, load1=lambda: 10.5)  # limit 8 x 1.25 = 10
    assert code == 2 and "10.0" in msg


def test_all_slots_starting_refuses_but_waiting_slot_admits(tmp_path, monkeypatch):
    assert gate(tmp_path, monkeypatch, slots_busy=lambda now: True)[0] == 2
    assert gate(tmp_path / "b", monkeypatch, slots_busy=lambda now: False)[0] == 0


def test_runaway_cap_refuses(tmp_path, monkeypatch):
    monkeypatch.setattr(agent_cap, "DIR", str(tmp_path))
    for i in range(agent_cap.RUNAWAY_CAP):
        agent_cap.handle({"hook_event_name": "SubagentStart", "session_id": "s", "agent_id": f"a{i}"}, now=0)
    assert gate(tmp_path, monkeypatch, now=10)[0] == 2
    # stale live entries expire, so a crashed agent cannot hold the backstop
    assert gate(tmp_path, monkeypatch, now=agent_cap.STALE_S + 1)[0] == 0


def test_pending_launches_count_and_stop_frees(tmp_path, monkeypatch):
    for _ in range(agent_cap.RUNAWAY_CAP):
        assert gate(tmp_path, monkeypatch)[0] == 0
    assert gate(tmp_path, monkeypatch)[0] == 2


def test_other_tools_pass_and_garbage_input_allows(tmp_path):
    env = {"ES_AGENT_CAP_DIR": str(tmp_path), "PATH": "/usr/bin:/bin"}
    d = {"hook_event_name": "PreToolUse", "session_id": "s", "tool_name": "Bash"}
    assert subprocess.run([sys.executable, str(CAP_PY)], input=json.dumps(d), text=True, env=env).returncode == 0
    assert subprocess.run([sys.executable, str(CAP_PY)], input="not json", text=True, env=env).returncode == 0
