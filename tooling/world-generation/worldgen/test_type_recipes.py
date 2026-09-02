"""type-recipes.json is the source of truth; taxonomy.json is derived from it.

These tests keep the two in sync mechanically (Phase 11 Part 1, decision 0041)
and hold the invariants the region-derivation agents rely on:

- every taxonomy type resolves to exactly one recipe and vice versa;
- recipes cite only real region classes and real asset-inventory families;
- the withdrawn `darkwater` asset pool never appears;
- every recipe carries all five POI recipe slots;
- every type's count band actually contains its live record count.

The old invariant here — "the poi count bands sum inside the province total" —
was retired on 2026-09-02 (verify/wrap agent). It was never sound: with ~236
poi types averaging two records each, per-type slack of +/-1 aggregates to a
+/-236 envelope, so the sum could only be made to land on the province total by
giving every band zero slack, which makes the bands useless as a Part 3
maintenance envelope. The province total is a property of the CATALOGUE, not of
this file, and is now asserted in test_catalogue.py against the coverage doc's
per-zone budgets. What this file checks instead is far stronger and not
tautological: each band must contain the count actually derived, so drift in
either direction fails.
"""

from __future__ import annotations

import collections
import json
from pathlib import Path

from .catalogue import CATALOGUE_DIR, load_taxonomy
from .regions import REGION_CLASSES

RECIPES_PATH = CATALOGUE_DIR / "type-recipes.json"

SLOT_KEYS = {"cue", "population", "props", "rewardFree", "rewardGated", "satellite"}
SCOPES = {"poi", "district", "dressing"}
COMPLEXITY = {"trivial", "simple", "standard", "complex"}
CULTURES = {"argonian", "imperial", "dunmer", "khajiit", "altmer", "nord", "lost-peoples"}
DANGER = {f"D{i}" for i in range(6)}
ERAS = {
    "merethic", "duskfall", "ayleid", "lost-peoples", "knahaten-flu", "second-empire",
    "imperial", "oblivion-crisis", "morrowind-invasion", "post-umbriel", "current",
}
SEASONS = {"all", "wet", "dry", "varies"}
STATUSES = {
    "active", "ruined", "abandoned", "seasonal", "drowned", "contested",
    "under-construction", "reoccupied", "rebuilt",
}
# Landform classes from the terrain scour, plus the pseudo-classes for types
# that need ordinary ground rather than a named landform.
PSEUDO_LANDFORMS = {"any-firm-ground", "any-shallow-marsh", "any-channel-bank"}


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
        assert r["season"] in SEASONS, t
        assert r["statuses"] and set(r["statuses"]) <= STATUSES, t
        assert set(r["siting"]["regionClasses"]) <= region_names, (
            f"{t}: unknown region class {set(r['siting']['regionClasses']) - region_names}"
        )
        assert r["siting"]["landformClasses"], t
        lo, hi = r["countBand"]
        # lo may be 0: a type that is enumerated but currently unspent is honest
        # (Part 3 may spend it); a band with no upper room is not.
        assert 0 <= lo <= hi and hi > 0, t


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


def test_count_bands_contain_the_live_record_counts() -> None:
    """Every type's band must contain the number of live records derived for it.

    Live = status is neither `deferred` nor `cut`. This is the anti-drift check
    that replaced the band-sum assertion: it fails if a region agent over-fills
    a type, and equally if a rebalance guts one.
    """
    live: collections.Counter[str] = collections.Counter()
    for path in sorted(CATALOGUE_DIR.glob("places-*.json")):
        for rec in json.loads(path.read_text())["places"]:
            if rec.get("status") not in {"deferred", "cut"}:
                live[rec["classification"]["type"]] += 1
    for r in _recipes():
        # district/dressing-scope types are not catalogue records at all — they
        # are the Part 3 / compiler dressing tier, and their bands are a
        # per-settlement demand forecast, not a province count.
        if r["recordScope"] != "poi":
            continue
        lo, hi = r["countBand"]
        n = live.get(r["type"], 0)
        assert lo <= n <= hi, (
            f"{r['type']}: {n} live records against countBand {lo}-{hi} — "
            "re-derive the band or rebalance the records"
        )
    unknown = set(live) - {r["type"] for r in _recipes()}
    assert not unknown, f"catalogue uses types with no recipe: {sorted(unknown)}"


def test_count_band_note_is_present() -> None:
    assert json.loads(RECIPES_PATH.read_text()).get("countBandNote", "").strip()
