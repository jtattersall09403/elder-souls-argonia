"""`piece_doorways` reads the mined assemblies' doorway offsets in their own
z-up frame (y NORTH), so the plan z (south) is the negated y
(fix2-kits-r3 rec 4: farmhouse02's assembly rows repeated the interiors
rows with z flipped), and `effect_placement` mounts an `fx:*` member."""
from __future__ import annotations

import pytest

from . import compile_settlement as cs

FARMHOUSE02 = "vanilla:architecture/farmhouse/farmhouse02"


def test_a_mined_doorway_north_of_the_pivot_lies_at_negative_plan_z():
    mined = {"a": {"doorways": [{"offsetLocalM": [0.5, 3.0, 0.0], "sideDeg": 0.0}]}}
    got = cs.piece_doorways("a", {}, mined)
    assert got == [{"offsetInPieceM": [0.5, -3.0], "sideDeg": 0.0, "source": "assembly"}]


def test_farmhouse02_doorway_records_are_unique():
    interiors, mined = cs.kit_interiors(), cs.assembly_doorways()
    if FARMHOUSE02 not in interiors or FARMHOUSE02 not in mined:
        pytest.skip("farmhouse02 is in neither the interiors index nor the assemblies record")
    got = cs.piece_doorways(FARMHOUSE02, interiors, mined)
    offsets = [tuple(r["offsetInPieceM"]) for r in got]
    assert len(offsets) == len(set(offsets))
    # no record is another's mirror across the pivot's east-west axis
    assert not [(x, z) for x, z in offsets if z and (x, -z) in offsets]
    # the mined door on the south side (sideDeg 180) is the interiors' own row
    assert not [r for r in got if r["source"] == "assembly"]


class _Shelf:
    effect_kit = {"fx:smoke-column": "works-v1"}


def _effect(member):
    errors: list[str] = []
    building = {"id": "b", "positionM": [10.0, 5.0, 20.0], "yawDeg": 90.0, "scale": 1.0}
    row = cs.effect_placement("bp", "1", {"id": "parcel.x"}, building, member, _Shelf(), errors)
    return row, errors


def test_an_effect_member_is_mounted_with_no_footprint():
    row, errors = _effect({"id": "smoke", "asset": "fx:smoke-column", "on": "parent",
                           "atM": [1.0, 0.0], "upM": 6.0})
    assert errors == []
    assert row["objectKind"] == "effect" and row["kit"] == "works-v1"
    assert row["anchorClass"] == "fx" and row["parentPlacementId"] == "b"
    assert row["footprintM"] == [] and row["mountOffsetM"] == [1.0, 6.0, 0.0]
    assert row["positionM"][1] == 11.0


@pytest.mark.parametrize("member, why", [
    ({"id": "s", "asset": "fx:smoke-column", "on": "ground", "atM": [0, 0]}, "mounted only"),
    ({"id": "s", "asset": "fx:none", "on": "parent", "atM": [0, 0], "upM": 1}, "effectTextures"),
])
def test_an_effect_on_the_ground_or_with_no_texture_is_refused(member, why):
    row, errors = _effect(member)
    assert row is None and why in errors[0]
