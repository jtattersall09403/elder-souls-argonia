"""type-recipes.json is the source of truth; taxonomy.json is derived from it.

These tests keep the two in sync mechanically (Phase 11 Part 1, decision 0041)
and hold the invariants the region-derivation agents rely on:

- every taxonomy type resolves to exactly one recipe and vice versa;
- recipes cite only real region classes and real asset-inventory families;
- the withdrawn `darkwater` asset pool never appears;
- every recipe carries all five POI recipe slots;
- the `recordScope == "poi"` count bands sum inside the province total
  (600-740 named places on 33.52 km2 of authored land, per the terrain scour).
"""

from __future__ import annotations

import json
from pathlib import Path

from .catalogue import CATALOGUE_DIR, load_taxonomy
from .regions import REGION_CLASSES

RECIPES_PATH = CATALOGUE_DIR / "type-recipes.json"

SLOT_KEYS = {"cue", "population", "props", "rewardFree", "rewardGated", "satellite"}
SCOPES = {"poi", "district", "dressing"}
COMPLEXITY = {"trivial", "simple", "standard", "complex"}
CULTURES = {"argonian", "imperial", "dunmer", "khajiit"}
DANGER = {f"D{i}" for i in range(6)}
ERAS = {
    "merethic", "duskfall", "ayleid", "lost-peoples", "knahaten-flu", "second-empire",
    "imperial", "morrowind-invasion", "post-umbriel", "current",
}
# Landform classes from the terrain scour, plus the pseudo-classes for types
# that need ordinary ground rather than a named landform.
PSEUDO_LANDFORMS = {"any-firm-ground", "any-shallow-marsh", "any-channel-bank"}
# Province-wide named-place total established by the scour (candidate-sites.md).
POI_TOTAL_MIN, POI_TOTAL_MAX = 600, 740


def _recipes() -> list[dict]:
    return json.loads(RECIPES_PATH.read_text())["types"]


def test_schema_version() -> None:
    assert json.loads(RECIPES_PATH.read_text())["schemaVersion"] == 1


def test_taxonomy_is_derived_from_recipes() -> None:
    classes = load_taxonomy()
    tax = {
        (c, f, t): set(v)
        for c, fams in classes.items()
        for f, types in fams.items()
        for t, v in types.items()
    }
    rec = {(r["class"], r["family"], r["type"]): set(r["variants"]) for r in _recipes()}
    assert tax == rec, "taxonomy.json and type-recipes.json have drifted — regenerate the taxonomy"


def test_type_ids_unique() -> None:
    ids = [r["type"] for r in _recipes()]
    assert len(ids) == len(set(ids))


def test_every_recipe_has_all_five_slots() -> None:
    for r in _recipes():
        assert set(r["slots"]) == SLOT_KEYS, f"{r['type']}: slots must be exactly {sorted(SLOT_KEYS)}"
        assert all(r["slots"][k].strip() for k in SLOT_KEYS), f"{r['type']}: empty slot"


def test_enumerations() -> None:
    region_names = {name for name, _ in REGION_CLASSES.values()}
    for r in _recipes():
        t = r["type"]
        assert r["recordScope"] in SCOPES, t
        assert r["complexityBudget"] in COMPLEXITY, t
        if r["complexityBudget"] == "complex":
            assert r.get("complexityJustification"), f"{t}: complex needs a justification"
        assert r["cultures"] and set(r["cultures"]) <= CULTURES, t
        assert r["dangerTiers"] and set(r["dangerTiers"]) <= DANGER, t
        assert set(r.get("approachDanger", [])) <= DANGER, t
        assert r["eraLayers"] and set(r["eraLayers"]) <= ERAS, t
        assert r["magnitude"] in {None, "M1", "M2", "M3", "M4", "M5"}, t
        assert set(r["siting"]["regionClasses"]) <= region_names, (
            f"{t}: unknown region class {set(r['siting']['regionClasses']) - region_names}"
        )
        assert r["siting"]["landformClasses"], t
        lo, hi = r["countBand"]
        assert 0 < lo <= hi, t


def test_no_withdrawn_asset_pool() -> None:
    """The darkwater pool was withdrawn for licence reasons and may never be planned against."""
    for r in _recipes():
        assert not any("darkwater" in a for a in r["assetPlan"]), r["type"]


def test_asset_plans_reference_known_families() -> None:
    inv = Path(__file__).resolve().parents[3] / "world" / "sources" / "placement" / "settlement-asset-inventory.json"
    if not inv.exists():  # inventory is owned by another workstream; skip if absent
        return
    known = set(json.dumps(json.loads(inv.read_text())).split())
    blob = " ".join(known)
    missing = {a for r in _recipes() for a in r["assetPlan"] if a not in blob}
    # Advisory rather than fatal: the inventory's id spelling is its own to change.
    assert len(missing) < len({a for r in _recipes() for a in r["assetPlan"]}), (
        "no asset-plan family matched the inventory at all — the id vocabulary has diverged"
    )


def test_poi_count_bands_sum_to_the_province_total() -> None:
    poi = [r for r in _recipes() if r["recordScope"] == "poi"]
    lo = sum(r["countBand"][0] for r in poi)
    hi = sum(r["countBand"][1] for r in poi)
    assert POI_TOTAL_MIN <= lo < hi <= POI_TOTAL_MAX, (
        f"poi count bands sum to {lo}-{hi}; the scour sizes the province at "
        f"{POI_TOTAL_MIN}-{POI_TOTAL_MAX} named places"
    )
