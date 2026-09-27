"""The chain refuses a place's levelled ground (decision 0102 decision 1):
a `settlement-pad` travels in the place's bundle as a ground overlay."""

import json

import pytest

from . import apply_terrain_patches as atp
from . import terrain_patches as tp


def test_a_settlement_pad_row_refuses_the_chain_by_name():
    rows = [{"id": "patch.levee.x", "kind": "levee"},
            {"id": "patch.pad.settlement.place.a.b1", "kind": "settlement-pad"}]
    with pytest.raises(SystemExit, match="patch.pad.settlement.place.a.b1"):
        atp.refuse_place_rows(rows)
    atp.refuse_place_rows(rows[:1])          # every other kind passes


def test_claywater_holds_no_row_in_the_terrain_patch_set():
    doc = json.loads(tp.PATCHES_PATH.read_text())
    rows = [p["id"] for p in doc["patches"] if p["kind"] == "settlement-pad"
            and (p.get("source") or {}).get("placeId") == "place.imperial-fringe.claywater-station"]
    assert rows == []
