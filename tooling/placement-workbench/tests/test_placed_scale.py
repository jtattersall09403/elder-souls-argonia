"""A `place` op that names no scale takes the shell's plugin median placed
scale from its manifest (planner ruling 1, interiors round 4)."""
from __future__ import annotations

import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from workbench.kits import Catalogue, default_scale  # noqa: E402


def test_default_scale_reads_the_manifest_median():
    assert default_scale({"id": "x", "placedScaleMedian": 2.1}) == 2.1
    assert default_scale({"id": "x"}) == 1.0
    assert default_scale({"id": "x", "placedScaleMedian": 0}) == 1.0


def test_the_mud_mother_hut_defaults_to_its_placed_scale():
    # Mud Mother's plugin sets its mudhut01 at 1.92-2.3 (interiors round 3)
    cat = Catalogue()
    assert 1.9 <= cat.placed_scale("mudmother:gv_meshes/argoniannest/mudhut01") <= 2.35
