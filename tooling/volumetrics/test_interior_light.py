"""cell_medium: kind, humidity and dust band of a cell (decision 0112 section 6)."""
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import interior_light as il  # noqa: E402


def medium(cell, assets, template="SolitudeInteriors", mined=None):
    """cell_medium with the mined furniture mix = the placed assets unless `mined` says otherwise."""
    b = {"cellId": cell, "lighting": {"template": template}, "placements": [{"assetId": a} for a in assets]}
    return il.cell_medium(b, [{"model": a} for a in (assets if mined is None else mined)])


BED = "vanilla:furniture/bed01"
HEARTH = "vanilla:architecture/farmhouse/fireplace01"


def test_dwelling_is_low_storage_high_damp_medium_with_mist():
    assert medium("A", [BED, HEARTH])["dust"] == "low"
    store = medium("B", ["vanilla:clutter/barrel01", "vanilla:architecture/farmhouse/wall01"])
    assert (store["kind"], store["dust"], store["floorMist"]) == ("storage", "high", False)
    cave = medium("C", [BED], template="CaveLightingTemplate")
    assert (cave["kind"], cave["dust"], cave["floorMist"]) == ("damp", "medium", True)


def test_kind_is_the_claims_class_from_the_mined_mix_not_the_bundle():
    # the published bundle drops markers; the mined mix keeps the tanning rack (KeebaHouseSnailMinder)
    row = medium("S", [BED, HEARTH], mined=[BED, HEARTH, "kotm:argonia/clutter/tanningrackmarker"])
    assert (row["kind"], row["dust"]) == ("smithy", "high")


def test_a_mud_hut_is_one_band_lower():
    hut = ["kotm:argonia/mudhuts/wall01"] * 5 + ["vanilla:architecture/farmhouse/fencewoven01"] * 8
    row = medium("D", hut + ["vanilla:clutter/barrel01"])
    assert (row["kind"], row["humid"], row["dust"]) == ("storage", True, "medium")
    dry = medium("E", ["kotm:argonia/mudhuts/wall01"] * 2 + ["vanilla:architecture/farmhouse/wall01"] * 3)
    assert dry["humid"] is False


def test_override_wins_with_its_reason(monkeypatch):
    monkeypatch.setitem(il.DUST_OVERRIDES, "F", ("high", "a mill the furniture mix reads as a dwelling"))
    row = medium("F", [BED, HEARTH])
    assert row["dust"] == "high" and row["dustWhy"] == "override"


def test_a_published_cell_no_shell_links_fails_loud():
    shells = {"shell": [{"plugin": "P.esp", "interiorCell": "Linked", "pieces": [{"model": BED}]}]}
    assert il.mined_pieces("P.esp", "Linked", shells) == [{"model": BED}]
    with pytest.raises(SystemExit):
        il.mined_pieces("P.esp", "Unlinked", shells)
