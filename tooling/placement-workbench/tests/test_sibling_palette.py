"""sibling_palette: same-type siblings split by shared region class, over two fixtures."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import sibling_palette  # noqa: E402


def _place(pid, t, regions, culture="argonian"):
    return {"id": pid, "culture": culture, "classification": {"type": t}, "sitingPrefs": {"regionClasses": regions}}


def _bp(pid, refs, fam=None):
    return {"id": pid, "parcels": [{"assetRef": r, "buildingFamily": fam} for r in refs]}


CAT = {p["id"]: p for p in [
    _place("a", "village", ["marsh", "delta"]),
    _place("b", "village", ["marsh"]),
    _place("c", "village", ["upland"], "imperial"),
    _place("d", "camp", ["marsh"]),
]}
BPS = [_bp("a", ["x"]), _bp("b", ["x", "y"], "hut"), _bp("c", ["z"]), _bp("d", ["q"])]


def test_split_by_region_and_type():
    r = sibling_palette.siblings("a", CAT, BPS)
    assert [x["id"] for x in r["same_region"]] == ["b"]
    assert r["same_region"][0]["assets"] == ["x", "y"] and r["same_region"][0]["families"] == ["hut"]
    assert [x["id"] for x in r["other_region"]] == ["c"]


def test_no_sibling():
    assert sibling_palette.siblings("d", CAT, BPS) == {"same_region": [], "other_region": []}
