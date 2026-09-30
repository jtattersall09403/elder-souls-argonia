"""A house on stilts seated by the water (BM&V swamp house with its landing,
Riverwalk re-site 2026-09-30): a walkable water piece settles on `place`
with no `settle` flag; `floor_services` names why a floored parcel is no
floor service; the footing slope is the deck plane's and the bed is judged
per stilt foot from the mesh (`measure.stilt_feet`); the landing's outer edge
must rest on dry ground at deck height (`seat_rules.house_landing`)."""
from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from workbench import measure, paths, rules, seat_rules  # noqa: E402
from workbench.scene import Piece  # noqa: E402

pytestmark = pytest.mark.skipif(not paths.RAW_KITS.exists(), reason="raw kit builds absent")

HOUSE = "composite:stilt/swamp-house-with-landing"
LEVEL = 0.0


class Bed:
    """A water body at LEVEL over a bed ``bed(x, z)``; dry (no water) where
    ``dry(x, z)`` holds."""

    def __init__(self, bed, dry=lambda x, z: False):
        self.bed, self.dry = bed, dry

    def chunk_height(self, x, z):
        return self.bed(x, z)

    def water_level(self, x, z):
        return None if self.dry(x, z) else LEVEL


@pytest.fixture(scope="module")
def cat():
    from workbench.kits import Catalogue
    return Catalogue()


def _house(cat, x=100.0, z=100.0, yaw=0.0):
    p = Piece(uid="h", asset=HOUSE, x=x, z=z, yaw=yaw, y=None, scale=1.0, walkable=True)
    p.y = measure.seat(cat, Bed(lambda x, z: -1.0), p)["y"]
    return p


def test_walkable_water_piece_auto_settles(cat):
    row = cat.row(HOUSE)
    assert measure.auto_settles(row, walkable=True)
    assert not measure.auto_settles(row, walkable=False)
    assert not measure.auto_settles({"anchorClass": "ground"}, walkable=True)
    assert measure.deck_seated(row)


def test_floor_service_names_its_cause(cat):
    p = Piece(uid="h", asset=HOUSE, x=0.0, z=0.0, yaw=0.0, y=None, scale=1.0)
    assert rules.floor_service_cause(cat, p, {"interior": {"kind": "none"}}).startswith(
        rules.FLOOR_UNSEATED)
    p.y = -2.02
    assert "'dwelling'" in rules.floor_service_cause(cat, p, {"interior": {"kind": "dwelling"}})
    assert rules.floor_service_cause(cat, p, {"interior": {"kind": "none"}}) is None


def test_sloped_bed_passes_with_per_foot_embeds(cat):
    p = _house(cat)
    assert measure.deck_slope_deg(p) == 0.0          # the deck plane, not the bed
    # a bed 0.35 m deep at the west edge falling to 1.5 m at the east (~6 deg)
    got = measure.stilt_feet(cat, Bed(lambda x, z: -0.35 - (x - 88.0) * 0.055), p)
    assert got["stiltRule"] is None, got["stiltRule"]
    feet = got["stiltFeet"]
    assert len(feet) >= 20 and [f["id"] for f in feet] == [f"foot-{i}" for i in range(len(feet))]
    assert all(0.0 <= f["embedM"] <= f["lengthM"] for f in feet)
    assert len({round(f["embedM"], 2) for f in feet}) > 5    # buried length varies per foot


def test_foot_over_too_deep_bed_fails_by_id(cat):
    p = _house(cat)
    got = measure.stilt_feet(cat, Bed(lambda x, z: -4.0 if x > 102.0 else -1.0), p)
    assert got["stiltRule"] and "hangs" in got["stiltRule"]
    hanging = [f["id"] for f in got["stiltFeet"] if f["embedM"] < 0.0]
    assert hanging and all(h in got["stiltRule"] for h in hanging)


def _landing(cat, p, g):
    scene = SimpleNamespace(pieces=[p])
    return seat_rules.house_landing(cat, scene, g, p, 0.45, {})


def test_landing_outer_edge_on_dry_ground(cat):
    p = _house(cat)
    edge = measure.landing_edges(cat, p)[0]
    assert edge["outwardDeg"] == 90.0                # the template's east doorway, yaw 0
    shore_x = edge["outer"][1][0]
    deck = p.y + 2.585                               # the plank deck, 0.14 m under the floor
    dry = Bed(lambda x, z: deck if x >= shore_x else -1.0, dry=lambda x, z: x >= shore_x)
    row, fails = _landing(cat, p, dry)
    assert not fails, fails
    lr = row["landings"][0]
    assert abs(lr["landDropM"]) <= seat_rules.LANDING_FOOT_M
    assert abs(lr["floorOverInnerDeckM"]) <= 0.45
    row, fails = _landing(cat, p, Bed(lambda x, z: -1.0))        # open water past the edge
    assert any("over water" in f for f in fails)


def test_berth_reach_skips_a_stilt_house(cat, monkeypatch):
    """A walkable deck_seated house over open water is not a berth: berthReachRule
    leaves it to seat_rules.house_landing (R82) and says so in its row."""
    p = _house(cat)
    p.role = {"kind": "parcel"}
    scene = SimpleNamespace(pieces=[p], paths=[], layout={})
    monkeypatch.setattr(rules, "_ground", lambda c, s: Bed(lambda x, z: -1.0))
    monkeypatch.setattr(rules, "floor_services", lambda c, s: {})
    monkeypatch.setattr(rules, "_layout_sockets", lambda s: [])
    out = rules.berth_reach(cat, scene)
    assert not out["failures"], out["failures"]
    assert "house_landing" in out["pieces"]["h"]["skipped"]
