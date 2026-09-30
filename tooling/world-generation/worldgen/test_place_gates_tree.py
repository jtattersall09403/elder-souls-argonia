"""place_gates never writes the working tree's source files (2026-09-30: a
Riverwalk layout and blueprint were found rewritten to HEAD mid-lane). One
real gate run over a built place; every world/sources file that differs from
HEAD, and the place's own layout and blueprint, hash the same afterwards."""
from __future__ import annotations

import hashlib
import subprocess

import pytest

from . import place_gates as pg

PLACE = "place.dunmer-north.riverwalk"


def _hashes(paths):
    return {p: hashlib.sha256((pg.REPO_ROOT / p).read_bytes()).hexdigest()
            for p in paths if (pg.REPO_ROOT / p).is_file()}


def test_a_gate_run_leaves_world_sources_untouched():
    layout = pg.BLUEPRINTS / "riverwalk.layout.json"
    if not layout.exists() or not (pg.REPO_ROOT / "tooling" / "placement-workbench" / "output").exists():
        pytest.skip("no Riverwalk layout or no workbench output (a clean clone has no built kits)")
    dirty = subprocess.run(["git", "status", "--porcelain", "--untracked-files=all", "--", "world/sources"],
                           cwd=pg.REPO_ROOT, capture_output=True, text=True, check=True).stdout
    paths = sorted({line[3:] for line in dirty.splitlines()}
                   | {str(layout.relative_to(pg.REPO_ROOT)), f"world/sources/blueprints/{PLACE}.json"})
    before = _hashes(paths)
    doc = pg.run(PLACE, now="2026-09-30T00:00:00Z")
    assert doc["gates"], "the gate run graded nothing"
    assert _hashes(paths) == before
