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
