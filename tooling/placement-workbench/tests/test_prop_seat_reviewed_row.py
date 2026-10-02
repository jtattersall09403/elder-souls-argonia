"""propSeatRule reads a reviewed assetPlacement row (sink evidence exactly
"policy") as designing the burial, as burialRule does
(seat_rules.DESIGNED_ROW_EVIDENCE); only a policy FALLBACK designs nothing.
The HTBM awning's posts go 0.91 m x scale under its pivot by its row
(16k walk 9, Riverwalk): before the fix propSeatRule failed it "uneven
ground: move it" at 0.59 m. Local only: the Claywater fixture scene needs the
raw kit builds and the frozen ground window."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from workbench import measure, pads, rules  # noqa: E402
from workbench.kits import Catalogue  # noqa: E402
from workbench.scene import Piece  # noqa: E402

LAYOUT = HERE.parent / "fixtures" / "claywater-walk1.layout.json"
AWNING = ("htbm:here there be monsters - curse of cipactli/architecture/villages/"
          "argonian/orcawning01")


@pytest.fixture(scope="module")
def cat():
    return Catalogue()


@pytest.fixture
def scene(applied_layout, cat, tmp_path):
    s = applied_layout(LAYOUT).view()
    s.path = tmp_path / "scene.json"
    pads.ground_for(cat, s, None)
    return s


def test_a_reviewed_row_designs_the_awnings_sunk_posts(cat, scene):
    sack = scene.piece("b1-sack")
    p = scene.add(Piece("awn", AWNING, sack.x + 30.0, sack.z + 30.0, 0.0))
    p.scale = 0.65
    p.y = measure.prop_seat(cat, pads.ground_for(cat, scene, None), p)["y"]
    got = rules.prop_seat(cat, scene)
    row = got["pieces"]["awn"]
    assert row["sinkEvidence"] == "policy"
    assert row["gapM"] < -0.4                      # the posts are in the ground
    assert not [f for f in got["failures"] if f.startswith("awn:")]
