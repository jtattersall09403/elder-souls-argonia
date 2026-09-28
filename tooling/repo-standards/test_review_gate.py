"""Unit tests for the review gate's trigger (decision 0079 §8).

The hook must fire on a command that RUNS preflight, never on one that merely
contains the word (a commit message did that on 2026-09-21).
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from review_gate import is_preflight_command  # noqa: E402

POSITIVE = [
    "npm run preflight",
    "cd x && npm run preflight",
    "npm run preflight -w @elder-souls/game",
    "node tooling/repo-standards/preflight.mjs",
    "python3 tooling/repo-standards/preflight.py",
    "npx preflight",
    "git status; npm run preflight",
]

NEGATIVE = [
    'git commit -m "run preflight later"',
    "git commit -F /tmp/msg.txt",
    "echo preflight",
    "npm run docs:check",
    "cat <<EOF\nnpm run preflight\nEOF",
    "grep -r preflight tooling/",
    "npm run test -- --grep preflight",
    "",
]


def test_fires_through_job_guard_with_its_pathspec():
    from review_gate import preflight_paths
    for cmd in ['bash tooling/repo-standards/job_guard.sh infra -- "npm run preflight -- --paths a b"',
                "bash tooling/repo-standards/job_guard.sh infra -- npm run preflight -- --paths a b"]:
        assert is_preflight_command(cmd) is True
        assert preflight_paths(cmd) == ["a", "b"]
    assert is_preflight_command("bash tooling/repo-standards/job_guard.sh kits -- python3 build_kit.py x") is False


# Every form an agent has typed or may type (review_gate.is_preflight_command,
# 2026-09-26): the preflight agent's `timeout 600 npm run preflight -- --paths`
# slipped past the old matcher (8 runs in the transcripts), as did memwatch,
# `rtk run`, `npm --prefix` and a subshell.
WRAPPED = [
    "timeout 600 npm run preflight -- --paths a b",
    "cd /workspaces/elder-souls-argonia; timeout 590 npm run preflight -- --paths a b",
    "timeout -k 10 600 npm run preflight -- --paths a b 2>&1 | tail -40",
    "npm run preflight --paths a b",
    "npm run preflight -- --runner",
    "npx npm run preflight -- --paths a b",
    "npm --prefix /workspaces/elder-souls-argonia run preflight -- --paths a b",
    "npm run-script preflight -- --paths a b",
    "npm --silent run preflight -- --paths a b",
    "env FOO=1 npm run preflight -- --paths a b",
    "FOO=1 nice -n 5 npm run preflight -- --paths a b",
    "(npm run preflight -- --paths a b) 2>&1 | tail -40",
    "rtk run npm run preflight -- --paths a b",
    "rtk proxy npm run preflight -- --paths a b",
    "tooling/repo-standards/memwatch.sh npm run preflight -- --paths a b > /tmp/p.log 2>&1",
    "cd tooling && timeout 600 npm run preflight -- --paths a b",
    "nohup time npm run preflight -- --paths a b",
    "npx -p npm npm run preflight -- --paths a b",
]


@pytest.mark.parametrize("cmd", ['npm run preflight -- --paths $(git diff --name-only)',
                                 'npm run preflight -- --paths $P', 'npm run preflight -- --paths `cat l`'])
def test_computed_pathspec_reviews_the_whole_tree(cmd):
    from review_gate import preflight_paths
    assert is_preflight_command(cmd) is True
    assert preflight_paths(cmd) is None


@pytest.mark.parametrize("cmd,paths", [('npm run preflight -- --paths a b; echo "exit $?"', ["a", "b"]),
                                       ("npm run preflight -- --paths a b 2>&1 | tee $LOG", ["a", "b"]),
                                       ("npm run preflight -- --paths a 3 > p.log", ["a", "3"]),
                                       ("npm run preflight -- --paths a 2> /tmp/x", ["a"])])
def test_fixed_pathspec_survives_what_follows_it(cmd, paths):
    from review_gate import preflight_paths
    assert preflight_paths(cmd) == paths



@pytest.mark.parametrize("cmd", WRAPPED)
def test_fires_on_every_wrapped_form_with_its_pathspec(cmd):
    from review_gate import preflight_paths
    assert is_preflight_command(cmd) is True
    if "--paths" in cmd:
        assert preflight_paths(cmd) == ["a", "b"]


@pytest.mark.parametrize("cmd", ["timeout 600 echo preflight", "rtk grep preflight tooling/",
                                 "timeout 600 npm run test -- preflight", "sudo tail /tmp/preflight.log"])
def test_wrappers_do_not_make_a_mention_fire(cmd):
    assert is_preflight_command(cmd) is False


@pytest.mark.parametrize("cmd", POSITIVE)
def test_fires(cmd):
    assert is_preflight_command(cmd) is True


@pytest.mark.parametrize("cmd", NEGATIVE)
def test_does_not_fire(cmd):
    assert is_preflight_command(cmd) is False


# --- pathspec reviews (decision 0087 §3) ------------------------------------
import io
import json
import subprocess

import review_gate


def test_preflight_paths_parsed_from_command():
    assert review_gate.preflight_paths("npm run preflight -- --paths a b/c --runner") == ["a", "b/c"]
    assert review_gate.preflight_paths("npm run preflight") is None
    assert review_gate.preflight_paths('git commit -m "npm run preflight -- --paths a"') is None


@pytest.fixture
def repo(tmp_path, monkeypatch):
    """A throwaway git repo with review_gate pointed at it and a fake reviewer."""
    def git(*a):
        subprocess.run(["git", *a], cwd=tmp_path, check=True, capture_output=True)
    git("init", "-q")
    git("config", "user.email", "t@t"); git("config", "user.name", "t")
    for d in ("tooling/a", "tooling/b"):
        (tmp_path / d).mkdir(parents=True)
        (tmp_path / d / "f.py").write_text("x = 1\n")
    git("add", "."); git("commit", "-qm", "init")
    claude = tmp_path / ".claude"
    monkeypatch.setattr(review_gate, "ROOT", str(tmp_path))
    monkeypatch.setattr(review_gate, "STAMP", str(claude / "review-stamp.json"))
    monkeypatch.setattr(review_gate, "FINDINGS", str(claude / "review-findings.md"))
    calls = []

    def fake_review(diff, what):
        calls.append(diff)
        return "NO FINDINGS", 0, ""
    monkeypatch.setattr(review_gate, "review", fake_review)
    return tmp_path, calls


def run_hook(monkeypatch, cmd):
    monkeypatch.setattr(sys, "argv", ["review_gate.py"])
    monkeypatch.setattr(sys, "stdin", io.StringIO(json.dumps({"tool_name": "Bash", "tool_input": {"command": cmd}})))
    return review_gate.main()


def test_stamp_for_pathspec_a_does_not_satisfy_pathspec_b(repo, monkeypatch):
    root, calls = repo
    (root / "tooling/a" / "f.py").write_text("x = 2\n")
    (root / "tooling/b" / "f.py").write_text("x = 3\n")
    assert run_hook(monkeypatch, "npm run preflight -- --paths tooling/a") == 0
    assert len(calls) == 1 and "tooling/a/f.py" in calls[0] and "tooling/b/f.py" not in calls[0]
    # same pathspec again, inside the fix window: satisfied by A's stamp
    assert run_hook(monkeypatch, "npm run preflight -- --paths tooling/a") == 0
    assert len(calls) == 1
    # pathspec B: A's stamp (and its fix window) must not satisfy it
    assert run_hook(monkeypatch, "npm run preflight -- --paths tooling/b") == 0
    assert len(calls) == 2 and "tooling/b/f.py" in calls[1] and "tooling/a/f.py" not in calls[1]
    # whole tree: neither pathspec stamp satisfies it
    assert run_hook(monkeypatch, "npm run preflight -- --runner") == 0
    assert len(calls) == 3 and "tooling/a/f.py" in calls[2] and "tooling/b/f.py" in calls[2]
    stamps = json.load(open(review_gate.STAMP))["stamps"]
    assert set(stamps) == {"tooling/a", "tooling/b", "*"} and stamps["tooling/a"]["paths"] == ["tooling/a"]


def test_size_limit_measured_on_pathspec_diff_only(repo, monkeypatch):
    root, calls = repo
    (root / "tooling/a" / "f.py").write_text("x = 2\n")
    (root / "tooling/b" / "f.py").write_text("y = 1\n" * (review_gate.MAX_DIFF_BYTES // 6 + 10))
    # the whole tree is over the limit: refused before any review
    assert run_hook(monkeypatch, "npm run preflight -- --runner") == 2
    assert calls == []
    # pathspec a is small: reviewed, although the tree is over the limit
    assert run_hook(monkeypatch, "npm run preflight -- --paths tooling/a") == 0
    assert len(calls) == 1 and len(calls[0]) < 1000
    # pathspec b alone is over the limit: refused
    assert run_hook(monkeypatch, "npm run preflight -- --paths tooling/b") == 2
    assert len(calls) == 1


def test_legacy_single_stamp_reads_as_whole_tree(repo, monkeypatch):
    os.makedirs(os.path.dirname(review_gate.STAMP), exist_ok=True)
    json.dump({"hash": "abc", "time": 1.0, "status": "ok", "findings": 0}, open(review_gate.STAMP, "w"))
    assert review_gate.read_stamp()["hash"] == "abc"
    assert review_gate.read_stamp(["a"]) == {}


def test_per_place_prose_never_enters_the_review_diff(repo, monkeypatch):
    """Design briefs and site dossiers are text-review's (walk 3 L8 rec 6)."""
    root, _ = repo
    for rel in ("world/sources/sites/dossiers/p.md", "world/sources/blueprints/p.design.md", "tooling/a/g.py"):
        (root / rel).parent.mkdir(parents=True, exist_ok=True)
        (root / rel).write_text("y = 2\n")
    d = review_gate.current_diff()
    assert "tooling/a/g.py" in d and "dossiers/p.md" not in d and "p.design.md" not in d


def test_a_batch_with_no_code_is_never_reviewed(repo, monkeypatch):
    """Decision 0106: docs, data, world records and reports are not reviewed."""
    root, calls = repo
    for rel in ("docs/decisions/0106-x.md", "world/sources/blueprints/p.layout.json",
                "tooling/.reports/16k/r.md", "tooling/a/config.json"):
        (root / rel).parent.mkdir(parents=True, exist_ok=True)
        (root / rel).write_text("prose or data\n")
    assert review_gate.current_diff() == ""
    assert run_hook(monkeypatch, "npm run preflight -- --paths docs world tooling/.reports tooling/a") == 0
    assert calls == []
