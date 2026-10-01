"""preflight_guard.py (decision 0106): what each rule refuses, on a throwaway repo."""
import json
import os
import subprocess
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "hooks"))
import preflight_guard as pg  # noqa: E402


@pytest.fixture
def repo(tmp_path, monkeypatch):
    def git(*a):
        subprocess.run(["git", *a], cwd=tmp_path, check=True, capture_output=True)
    git("init", "-q"); git("config", "user.email", "t@t"); git("config", "user.name", "t")
    (tmp_path / ".gitignore").write_text("stamps.json\n")   # as tooling/.reports/ is ignored
    for rel in ("tooling/a/f.py", "docs/d.md"):
        (tmp_path / rel).parent.mkdir(parents=True, exist_ok=True)
        (tmp_path / rel).write_text("x = 1\n")
    git("add", "."); git("commit", "-qm", "init")
    monkeypatch.setattr(pg, "ROOT", str(tmp_path))
    monkeypatch.setattr(pg, "STAMPS", str(tmp_path / "stamps.json"))
    monkeypatch.setattr(pg, "batch_base", lambda: None)
    return tmp_path


def refused(tool, **tool_input):
    return pg.check_preflight(tool_input["command"]) or pg.check_miner(tool_input["command"]) \
        if tool == "Bash" else pg.check_lane(tool_input)


def test_unscoped_preflight_is_refused_and_runner_is_not(repo):
    assert "scoped" in refused("Bash", command="npm run preflight")
    assert refused("Bash", command="npm run preflight -- --runner") is None


def test_a_docs_only_batch_is_refused(repo):
    (repo / "docs/d.md").write_text("new\n")
    assert "docs-" in refused("Bash", command="npm run preflight -- --paths docs")
    (repo / "tooling/a/f.py").write_text("x = 2\n")
    assert refused("Bash", command="npm run preflight -- --paths docs tooling/a") is None


def test_a_committed_code_batch_is_not_docs_only(repo, monkeypatch):
    """Walk 7: everything committed, only a ledger dirty; the old dirty-tree rule refused."""
    base = subprocess.run(["git", "rev-parse", "HEAD"], cwd=repo, capture_output=True, text=True).stdout.strip()
    (repo / "tooling/a/f.py").write_text("x = 2\n")
    subprocess.run(["git", "commit", "-qam", "code"], cwd=repo, check=True, capture_output=True)
    (repo / "docs/d.md").write_text("dirty\n")
    cmd = "npm run preflight -- --paths tooling/a docs"
    assert "docs-" in refused("Bash", command=cmd)           # the old logic (no close known)
    monkeypatch.setattr(pg, "batch_base", lambda: base)
    assert refused("Bash", command=cmd) is None
    (repo / "tooling/a/f.py").write_text("x = 1\n")        # code reverted to base: only docs differ
    subprocess.run(["git", "commit", "-qam", "back"], cwd=repo, check=True, capture_output=True)
    msg = refused("Bash", command=cmd)
    assert "since the last close" in msg and "1 files" in msg


def test_the_same_batch_twice_is_refused_until_an_edit(repo):
    (repo / "tooling/a/f.py").write_text("x = 2\n")
    cmd = "npm run preflight -- --paths tooling/a"
    assert refused("Bash", command=cmd) is None
    pg.write_stamp(["tooling/a"], False)
    assert "once per batch" in refused("Bash", command=cmd)
    (repo / "docs/d.md").write_text("a fix outside the pathspec\n")
    assert refused("Bash", command=cmd) is None


def test_a_full_miner_run_needs_rule_change(repo):
    full = "cd tooling/world-generation && python3 -m worldgen.mine_abuts --write"
    assert "rule change" in refused("Bash", command=full).lower()
    assert refused("Bash", command=full + " --rule-change") is None
    assert refused("Bash", command="python3 -m worldgen.mine_abuts --assets x --merge") is None
    assert refused("Bash", command="python3 -m worldgen.mine_mounts --sample 25 --out /tmp/s") is None
    assert "rule change" in refused("Bash", command="python3 -m worldgen.mine_designed_sink --jobs 2").lower()
    assert refused("Bash", command="echo mine_abuts is fast now") is None
    # walk 8: the name in a heredoc or an import is not an invocation
    heredoc = "python3 - <<'E'\nfrom worldgen import mine_mounts as m\nprint(m.MESH_CACHE)\nE"
    assert refused("Bash", command=heredoc) is None
    assert refused("Bash", command='python3 -c "import worldgen.mine_mounts"') is None
    wrapped = "tooling/repo-standards/job_guard.sh L -- python3 tooling/world-generation/worldgen/mine_mounts.py"
    assert "rule change" in refused("Bash", command=wrapped).lower()
    # interpreter flags before -m or the script do not hide the miner
    for flags in ("-u", "-X importtime", "-W ignore", "-u -O"):
        assert "rule change" in refused("Bash", command=f"python3 {flags} -m worldgen.mine_mounts").lower(), flags


def test_a_deliver_lane_needs_a_budget_line(repo):
    assert "Budget" in refused("Agent", subagent_type="deliver", prompt="do X")
    assert refused("Agent", subagent_type="deliver", prompt="do X\nBudget: 45 min (hard)") is None
    assert refused("Agent", subagent_type="find", prompt="look up X") is None
    assert "Budget" in refused("Workflow", script='agent({agentType: "deliver", prompt: brief})')
    script = "agent({agentType: 'deliver', prompt: brief})"
    assert "Budget" in refused("Workflow", script=script)
    assert refused("Workflow", script=script + " // Budget: 60 min (hard)") is None


def test_the_hook_exits_2_with_the_rule(repo, monkeypatch, capsys):
    import io
    monkeypatch.setattr(sys, "stdin", io.StringIO(json.dumps(
        {"tool_name": "Bash", "tool_input": {"command": "npm run preflight"}})))
    assert pg.main() == 2 and "[0106]" in capsys.readouterr().err
