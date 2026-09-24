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
    for d in ("a", "b"):
        (tmp_path / d).mkdir()
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
    (root / "a" / "f.py").write_text("x = 2\n")
    (root / "b" / "f.py").write_text("x = 3\n")
    assert run_hook(monkeypatch, "npm run preflight -- --paths a") == 0
    assert len(calls) == 1 and "a/f.py" in calls[0] and "b/f.py" not in calls[0]
    # same pathspec again, inside the fix window: satisfied by A's stamp
    assert run_hook(monkeypatch, "npm run preflight -- --paths a") == 0
    assert len(calls) == 1
    # pathspec B: A's stamp (and its fix window) must not satisfy it
    assert run_hook(monkeypatch, "npm run preflight -- --paths b") == 0
    assert len(calls) == 2 and "b/f.py" in calls[1] and "a/f.py" not in calls[1]
    # whole tree: neither pathspec stamp satisfies it
    assert run_hook(monkeypatch, "npm run preflight") == 0
    assert len(calls) == 3 and "a/f.py" in calls[2] and "b/f.py" in calls[2]
    stamps = json.load(open(review_gate.STAMP))["stamps"]
    assert set(stamps) == {"a", "b", "*"} and stamps["a"]["paths"] == ["a"]


def test_size_limit_measured_on_pathspec_diff_only(repo, monkeypatch):
    root, calls = repo
    (root / "a" / "f.py").write_text("x = 2\n")
    (root / "b" / "f.py").write_text("y = 1\n" * (review_gate.MAX_DIFF_BYTES // 6 + 10))
    # the whole tree is over the limit: refused before any review
    assert run_hook(monkeypatch, "npm run preflight") == 2
    assert calls == []
    # pathspec a is small: reviewed, although the tree is over the limit
    assert run_hook(monkeypatch, "npm run preflight -- --paths a") == 0
    assert len(calls) == 1 and len(calls[0]) < 1000
    # pathspec b alone is over the limit: refused
    assert run_hook(monkeypatch, "npm run preflight -- --paths b") == 2
    assert len(calls) == 1


def test_legacy_single_stamp_reads_as_whole_tree(repo, monkeypatch):
    os.makedirs(os.path.dirname(review_gate.STAMP), exist_ok=True)
    json.dump({"hash": "abc", "time": 1.0, "status": "ok", "findings": 0}, open(review_gate.STAMP, "w"))
    assert review_gate.read_stamp()["hash"] == "abc"
    assert review_gate.read_stamp(["a"]) == {}
