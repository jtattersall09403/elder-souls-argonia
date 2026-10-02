"""cell_medium and the cell AABB: kind, size, humidity, dust and floor mist of a cell (decision 0112 section 6)."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import interior_light as il  # noqa: E402

BED = "vanilla:furniture/bed01"
HEARTH = "vanilla:architecture/farmhouse/fireplace01"
CIPHTBM = "htbm:here there be monsters - curse of cipactli/architecture/villages/argonian"


def medium(cell, mined, template="SolitudeInteriors", family="vanilla:architecture/farmhouse/interior",
           shell="Farmhouse01", volume="medium"):
    """cell_medium over a mined door-link row with this furniture mix, room family and shell editor id."""
    b = {"cellId": cell, "lighting": {"template": template}, "placements": []}
    link = {"pieces": [{"model": a} for a in mined], "interiorFamily": family, "shellEditorId": shell}
    return il.cell_medium(b, link, volume)


def test_dwelling_is_low_storage_high_damp_medium_with_mist():
    assert medium("A", [BED, HEARTH])["dust"] == "low"
    store = medium("B", ["vanilla:clutter/barrel01", HEARTH], shell="Warehouse01")
    assert (store["kind"], store["dust"], store["floorMist"]) == ("storage", "high", None)
    cave = medium("C", [BED], template="CaveLightingTemplate", volume="large")
    assert (cave["kind"], cave["kindWhy"], cave["dust"]) == ("damp", "damp-template", "medium")
    assert cave["floorMist"] == {"topM": 1.3, "density": 0.055}


def test_kind_is_the_claims_class_from_the_mined_mix():
    # the published bundle drops markers; the mined mix keeps the tanning rack (KeebaHouseSnailMinder)
    row = medium("S", [BED, HEARTH, "kotm:argonia/clutter/tanningrackmarker"])
    assert (row["kind"], row["dust"]) == ("smithy", "high")


def test_a_mix_with_no_use_evidence_is_never_storage():
    # CIPHTBM huts: their mined mix is the room shell, hay and an ember fx, no bed or hearth piece
    hut = medium("H", [f"{CIPHTBM}/bamboohut02_int", "clutter/hay/haypile01", "effects/fxfirewithembers03.nif"],
                 family=CIPHTBM, shell="CIPHTBMVillageHut1", volume="small")
    assert (hut["kind"], hut["kindWhy"]) == ("dwelling", "shell")
    bare = medium("U", [], shell="SomeRock01")
    assert (bare["kind"], bare["kindWhy"], bare["dust"]) == ("unknown", "unknown", "medium")


def test_an_argonian_hut_family_is_humid_one_band_lower_with_a_shallow_mist():
    hut = medium("H", [f"{CIPHTBM}/bamboohut02_int"], family=CIPHTBM, shell="CIPHTBMVillageHut1", volume="small")
    assert (hut["humid"], hut["dust"], hut["floorMist"]) == (True, "low", {"topM": 0.25, "density": 0.08})
    kotm = medium("K", [BED, HEARTH], family="kotm:argonia/mudhuts")
    assert kotm["humid"] is True
    assert medium("D", [BED, HEARTH])["humid"] is False


def test_override_wins_with_its_reason(monkeypatch):
    monkeypatch.setitem(il.DUST_OVERRIDES, "F", ("high", "a mill the furniture mix reads as a dwelling"))
    row = medium("F", [BED, HEARTH])
    assert row["dust"] == "high" and row["dustWhy"] == "override"


def test_volume_class_from_the_placed_part_bounds(monkeypatch):
    monkeypatch.setattr(il, "part_file", lambda kit, asset, cache: Path(f"/k/{asset}"))
    parts = {"/k/room": {"bounds": {"lo": [-2, 0, -1], "hi": [2, 3, 1]}}}
    # a 4 x 3 x 2 room turned 90 degrees and doubled, twice side by side 10 m apart
    places = [{"assetId": "room", "positionM": [x, 0, 0], "rotationDeg": [0, 90, 0], "scale": 2.0} for x in (0, 10)]
    lo, hi = il.cell_bounds({"placements": places}, parts, {})
    assert [round(v, 6) for v in lo] == [-2, 0, -4] and [round(v, 6) for v in hi] == [12, 6, 4]
    assert il.volume_class((lo, hi)) == "small"  # 14 x 6 x 8 = 672 m3, a one-room hut
    assert il.volume_class(([0, 0, 0], [20, 10, 20])) == "medium"
    assert il.volume_class(([0, 0, 0], [50, 20, 90])) == "large"
    assert il.volume_class(None) == "medium"


def test_a_published_cell_no_shell_links_fails_loud():
    shells = {"shell": [{"plugin": "P.esp", "interiorCell": "Linked", "pieces": [{"model": BED}]}]}
    assert il.mined_link("P.esp", "Linked", shells)["pieces"] == [{"model": BED}]
    with pytest.raises(SystemExit):
        il.mined_link("P.esp", "Unlinked", shells)


def test_a_damp_mist_keeps_half_a_low_ray():
    import math
    for top, density in il.FLOOR_MIST["damp"].values():
        assert math.exp(-il.MIST_LOW_RAY_M * il.MIST_MAX_GAIN * density) >= il.MIST_LOW_RAY_KEEP
