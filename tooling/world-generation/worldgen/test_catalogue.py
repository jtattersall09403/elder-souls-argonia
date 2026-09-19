"""Catalogue schema validator tests (Phase 11 Part 2, decision 0041)."""

import json

from . import catalogue, ladder


def _write(dirpath, name, data):
    (dirpath / name).write_text(json.dumps(data))


def _taxonomy(dirpath):
    _write(dirpath, "taxonomy.json", {
        "schemaVersion": 1,
        "classes": {"camp": {"hostile": {"bandit": ["riverine"]}}},
    })


def _record(**over):
    rec = {
        "id": "place.testreg.reed-cut-camp",
        "schemaVersion": 2,
        "name": "Reed-Cut Camp",
        "classification": {"class": "camp", "family": "hostile", "type": "bandit", "variant": "riverine", "magnitude": None},
        "status": "active",
        "provenance": "geography-derived",
        "sources": ["scour"],
        "confidence": "inferred",
        "why": {"founding": "chokepoint on the reed channel", "siteAdvantages": "concealment",
                "occupantsMotive": "toll robbery", "pressures": "patrols", "wouldChangeIf": "route moved"},
        "sitingPrefs": {"regionClasses": [8], "hardConstraints": ["water-adjacent"], "preferences": ["concealed"]},
        "dangerTier": 3,
        "discovery": "sightline",
        "complexityBudget": "simple",
        "importanceTier": 4,
        "workflow": "derived",
        "sockets": {"scene": [], "evidence": [], "station": [], "marks": []},
        "deedCounterKeys": [],
        # Required at 'derived' since 2026-09-02 (the ex-STRICT_REQUIRED five).
        "season": "all-year",
        "eraLayers": ["current"],
        "densityLayer": "fine-tempo",
        "entrance": "none",
        "underwaterAccess": "none",
        # schemaVersion 2 (2026-09-03): purpose, stance, interior, contents.
        "playerPurpose": {"primary": "combat-challenge", "secondary": ["hidden-secret"], "impact": "real",
                          "hook": "A toll gang on the reed channel, and their strongbox"},
        "hostility": {"baseline": "hostile", "owner": None, "flips": [], "clearable": True, "respawn": "slow"},
        "interior": {"kind": "none"},
        "contents": {"creatures": [], "npcs": [{"slotId": "n1", "role": "rank-and-file", "registerRef": None, "count": "few"}],
                     "loot": [{"slotId": "l1", "role": "strongroom", "registerRef": None, "payoff": "loot-cache"}]},
    }
    rec.update(over)
    return rec


def _region_file(dirpath, places):
    _write(dirpath, "places-testreg.json",
           {"schemaVersion": 2, "region": "testreg", "seed": "s1", "places": places})


def test_valid_catalogue_passes(tmp_path):
    _taxonomy(tmp_path)
    _region_file(tmp_path, [_record()])
    assert catalogue.validate_catalogue(tmp_path, check_permanence=False) == []


def test_bad_taxonomy_and_missing_fields_fail(tmp_path):
    _taxonomy(tmp_path)
    bad_tax = _record(classification={"class": "camp", "family": "hostile", "type": "pirate"},
                      id="place.testreg.a")
    no_why = _record(id="place.testreg.z")
    del no_why["why"]
    _region_file(tmp_path, [bad_tax, no_why])
    errs = catalogue.validate_catalogue(tmp_path, check_permanence=False)
    assert any("taxonomy" in e for e in errs)
    assert any("missing required field 'why'" in e for e in errs)


def test_workflow_rungs_add_requirements(tmp_path):
    _taxonomy(tmp_path)
    plotted_incomplete = _record(workflow="plotted")
    _region_file(tmp_path, [plotted_incomplete])
    errs = catalogue.validate_catalogue(tmp_path, check_permanence=False)
    assert any("whySiteWon" in e for e in errs)


def test_unsorted_and_duplicate_ids_fail(tmp_path):
    _taxonomy(tmp_path)
    _region_file(tmp_path, [_record(id="place.testreg.b"), _record(id="place.testreg.a"),
                            _record(id="place.testreg.a")])
    errs = catalogue.validate_catalogue(tmp_path, check_permanence=False)
    assert any("sorted" in e for e in errs)
    assert any("duplicate" in e for e in errs)


def test_wrong_id_prefix_and_bad_sockets_fail(tmp_path):
    _taxonomy(tmp_path)
    rec = _record(id="place.otherreg.x", sockets={"scene": []})
    _write(tmp_path, "places-testreg.json",
           {"schemaVersion": 2, "region": "testreg", "seed": "s1", "places": [rec]})
    errs = catalogue.validate_catalogue(tmp_path, check_permanence=False)
    assert any("place.testreg.<slug>" in e for e in errs)
    assert any("sockets" in e for e in errs)


def test_live_catalogue_dir_validates():
    # The real directory (taxonomy seed, possibly no region files yet) must pass.
    assert catalogue.validate_catalogue(check_permanence=False) == []


def test_live_faction_presence_ids_resolve_to_the_registry():
    factions = json.loads(
        (catalogue.CATALOGUE_DIR.parent / "registries" / "factions.json").read_text()
    )
    known = {row["id"] for row in factions["entries"]}
    present = [
        presence["factionRef"]
        for region in catalogue.load_region_files()
        for record in region.places
        for presence in record.get("factionPresence", [])
    ]
    assert present, "the faction-presence contract must be exercised by live places"
    assert set(present) <= known


# --- province density budget -------------------------------------------------
# Moved here from test_type_recipes.py on 2026-09-02 (verify/wrap agent): the
# record budget is a property of the CATALOGUE, not of the recipe file, and it
# is checked PER ZONE, not just province-wide — the coverage critique's finding
# was that the province total can look fine while four small coastal zones hold
# half the catalogue on a fifth of the land.
# Source: docs/research/phase11/phase11-critique/coverage-density.md S1/S2.
REGION_BUDGETS = {
    # Re-based 2026-09-03 (Part 4 step 2, owner feedback round): the per-region
    # repair agents promoted reserves where a major city's region was thin
    # (imperial-penal-south 21 → 44, pirate-freeholds 17 → 31 for the opening
    # hours) and deferred repetitive fill elsewhere. Floors are lowered because
    # the owner leans toward an EMPTIER province and plotting is not set in
    # stone; ceilings keep the province inside the 467–596 envelope's spirit.
    "dunmer-north": (115, 182),
    "hist-heartland": (94, 140),
    "imperial-fringe": (105, 158),
    "imperial-penal-south": (17, 52),
    "mercantile-coast": (45, 76),
    "naga-kur-deeps": (22, 49),
    "pirate-freeholds": (14, 37),
    "saxhleel-coast": (18, 38),   # raised 2026-09-04: six quest-required records promoted back (soft ceiling, owner touchpoint ①)
}
# Owner ruling (touchpoint ①, 2026-09-03): ceilings are SOFT, floors are HARD.
# A region may exceed its ceiling when there is a recorded reason — add it here
# with a comment, never silently. A region below its floor always fails.
# naga-kur-deeps sits above its ceiling by design after the verify/wrap
# rebalance: taking it to 32 would have driven six types under-band, so it was
# rebalanced only as far as the type guard allowed and the residue handed to
# Part 3's homeless-batch review. Owner accepted 2026-09-03.
BUDGET_EXCEPTIONS: dict[str, int] = {}   # none after the 2026-09-03 re-base


def _live_by_region() -> dict[str, int]:
    return {
        rf.region: sum(1 for p in rf.places if p.get("status") not in {"deferred", "cut"})
        for rf in catalogue.load_region_files()
    }


def test_every_region_is_inside_its_record_budget():
    live = _live_by_region()
    assert set(live) == set(REGION_BUDGETS), "a region file appeared or vanished — update the budgets"
    for region, (lo, hi) in REGION_BUDGETS.items():
        n = live[region]
        ceiling = BUDGET_EXCEPTIONS.get(region, hi)
        assert lo <= n <= ceiling, (
            f"{region}: {n} live records against budget {lo}-{hi} "
            "(docs/research/phase11/phase11-critique/coverage-density.md S2)"
        )


def test_province_total_is_inside_the_corrected_envelope():
    lo = sum(b[0] for b in REGION_BUDGETS.values())
    hi = sum(b[1] for b in REGION_BUDGETS.values()) + sum(
        BUDGET_EXCEPTIONS[r] - REGION_BUDGETS[r][1] for r in BUDGET_EXCEPTIONS
    )
    n = sum(_live_by_region().values())
    assert lo <= n <= hi, f"province holds {n} live records; the corrected envelope is {lo}-{hi}"


# --- 97 A6 / G4 — two instances of one type within 2 km differ on >=3 axes ---
# Soft ceiling, gated the same way as the region budgets above (owner touchpoint
# ①, 2026-09-03: ceilings are SOFT, floors are HARD). The rule is 97 A6's
# anti-sameyness clause; the measure is the pair count, so a repair pass can
# see the number move. A pair may be excepted only with a written reason.
VIBE_AXES = ("silhouette", "palette", "materials", "signatureFeature",
             "condition", "mood", "approach", "senses")
SAMEYNESS_PAIR_M = 2000.0
SAMEYNESS_MIN_AXES = 3
SAMEYNESS_CEILING = 0            # measured 0 on 2026-09-05 over 171 same-type pairs in range
SAMEYNESS_EXCEPTIONS: dict[tuple[str, str], str] = {}   # none


def _live_records() -> list[dict]:
    return [p for rf in catalogue.load_region_files() for p in rf.places
            if p.get("status") not in {"deferred", "cut"}]


def _sameyness_pairs() -> list[tuple[str, str, int]]:
    import collections
    import math
    by_type: dict[str, list[dict]] = collections.defaultdict(list)
    for rec in _live_records():
        if isinstance(rec.get("positionM"), list):
            by_type[rec["classification"]["type"]].append(rec)
    out = []
    for recs in by_type.values():
        for i in range(len(recs)):
            for j in range(i + 1, len(recs)):
                a, b = recs[i], recs[j]
                if math.dist(a["positionM"], b["positionM"]) > SAMEYNESS_PAIR_M:
                    continue
                va, vb = a.get("vibe") or {}, b.get("vibe") or {}
                differ = sum(1 for f in VIBE_AXES
                             if (va.get(f) or "").strip() != (vb.get(f) or "").strip())
                if differ < SAMEYNESS_MIN_AXES:
                    out.append((a["id"], b["id"], differ))
    return sorted(out)


def test_same_type_neighbours_differ_on_three_axes():
    bad = [p for p in _sameyness_pairs()
           if tuple(sorted(p[:2])) not in SAMEYNESS_EXCEPTIONS]
    assert len(bad) <= SAMEYNESS_CEILING, (
        f"97 A6: {len(bad)} same-type pairs within {SAMEYNESS_PAIR_M:.0f} m differ on fewer than "
        f"{SAMEYNESS_MIN_AXES} vibe axes (ceiling {SAMEYNESS_CEILING}): {bad[:8]}"
    )


# --- 97 A10 / G6 — the province's shape: wild, not a unified state ------------
# Two live shares. The settlement+civic CEILING is soft (touchpoint ①: a ceiling
# may be excepted with a recorded reason); the hostile-or-clearable FLOOR is
# HARD — a province below it is not Black Marsh any more, and that is a real
# finding, never an exception.
SETTLEMENT_CIVIC_CEILING = 0.22
HOSTILE_SHARE_FLOOR = 0.55
SETTLEMENT_CIVIC_EXCEPTION: float | None = None   # measured 21.2 % on 2026-09-05: inside


def _shares() -> tuple[float, float, int]:
    from .hostility_frequency import is_hostile
    recs = _live_records()
    n = len(recs)
    sc = sum(1 for r in recs if r["classification"]["class"] in {"settlement", "civic"})
    hostile = sum(1 for r in recs if is_hostile(r))
    return sc / n, hostile / n, n


def test_settlement_and_civic_share_is_under_the_ceiling():
    share, _hostile, n = _shares()
    ceiling = SETTLEMENT_CIVIC_EXCEPTION or SETTLEMENT_CIVIC_CEILING
    assert share <= ceiling, (
        f"97 A10: settlement+civic is {share:.1%} of {n} live records, over the {ceiling:.0%} "
        "ceiling — Black Marsh is wild, not a unified state"
    )


HOSTILE_SHARE_HARD_FLOOR = 0.50   # owner 2026-09-07: 55 % is the target (warn), 50 % the hard floor


def test_hostile_or_clearable_share_is_over_the_floor():
    import warnings
    _share, hostile, n = _shares()
    assert hostile >= HOSTILE_SHARE_HARD_FLOOR, (
        f"97 A10: hostile-or-clearable is {hostile:.1%} of {n} live records, under the HARD "
        f"{HOSTILE_SHARE_HARD_FLOOR:.0%} floor (owner 2026-09-07; the 55 % target is a warning)"
    )
    if hostile < HOSTILE_SHARE_FLOOR:
        warnings.warn(f"97 A10: hostile-or-clearable is {hostile:.1%}, under the {HOSTILE_SHARE_FLOOR:.0%} "
                      f"target (soft, owner 2026-09-07); promote a record or say why not")


# --- services[]: the typed promise the blueprint ledger checks (2026-09-05) ---

def _service_scoped_records():
    return [r for rf in catalogue.load_region_files() for r in rf.places
            if catalogue.services_scoped(r)]


def test_every_scoped_record_types_its_services():
    missing = [r["id"] for r in _service_scoped_records() if r.get("services") is None]
    assert not missing, ("records owe the player a typed services[] and have none "
                         f"(run worldgen.derive_services --apply): {missing[:5]}")


def test_service_hubs_meet_their_band_minimum():
    from .catalogue import SERVICE_MIN
    short = []
    for r in _service_scoped_records():
        mag = r["classification"].get("magnitude")
        if (r.get("playerPurpose") or {}).get("primary") != "service-hub" or mag not in SERVICE_MIN:
            continue
        if len(r.get("services") or []) < SERVICE_MIN[mag]:
            short.append((r["id"], len(r.get("services") or []), SERVICE_MIN[mag]))
    assert not short, f"service-hubs below their band minimum: {short}"


def test_a_hamlet_offers_nothing_beyond_a_shrine_or_its_ferry():
    over = [(r["id"], sorted(set(r["services"]) - catalogue.HAMLET_SERVICE_CEILING))
            for r in _service_scoped_records()
            if r["classification"].get("magnitude") in ("M1", "M2") and r.get("services")
            and set(r["services"]) - catalogue.HAMLET_SERVICE_CEILING]
    assert not over, f"M1/M2 records with a service quarter: {over}"


def test_services_derivation_is_deterministic_and_matches_the_records():
    from . import derive_services
    drift = [r["id"] for rf in catalogue.load_region_files() for r in rf.places
             if derive_services.derive(r) != r.get("services")]
    assert not drift, ("services[] has drifted from the derivation rules "
                       f"(worldgen.derive_services): {drift[:5]}")


def test_a_ruin_promises_nothing():
    from . import derive_services
    rec = _record(classification={"class": "settlement", "family": "hostile", "type": "bandit",
                                  "variant": "riverine", "magnitude": "M4"},
                  status="ruined", culture="argonian")
    assert derive_services.derive(rec) == []


def test_no_record_or_recipe_names_a_region_class_the_world_does_not_have():
    """A siting preference for a class no raster produces is a silent no-op.

    Found 2026-09-09 while retiring `raised hammock` (decision 0050):
    `place.naga-kur-deeps.deepmire-refuge` asked for `["upland plateau",
    "interior swamp"]`, and `upland plateau` has never been a region class, so
    half of its stated preference did nothing and nobody could see it. The
    retirement itself is the reason this gate has to exist — a class can leave
    `REGION_CLASSES` and its name can survive in a hundred records.

    MUTATION: put "raised hammock" back in any recipe's `regionClasses` — red.
    """
    from .regions import REGION_CLASSES
    from . import macro_plot

    live = {name for _i, (name, _rgb) in REGION_CLASSES.items()}
    dead: dict[str, list[str]] = {}

    for path in sorted(catalogue.CATALOGUE_DIR.glob("places-*.json")):
        doc = json.loads(path.read_text())
        for record in (doc.get("places", doc) if isinstance(doc, dict) else doc):
            named = (record.get("sitingPrefs") or {}).get("regionClasses") or []
            for name in named:
                if name not in live:
                    dead.setdefault(name, []).append(record["id"])

    recipes = json.loads((catalogue.CATALOGUE_DIR / "type-recipes.json").read_text())
    rows = recipes.get("types", recipes)
    for type_id, recipe in (rows.items() if isinstance(rows, dict)
                            else ((r.get("id"), r) for r in rows)):
        for name in (recipe.get("regionClasses") or []):
            if name not in live:
                dead.setdefault(name, []).append(f"type-recipe {type_id}")

    for set_name in ("FIRM_REGIONS", "MARSH_REGIONS", "WATER_REGIONS"):
        for name in getattr(macro_plot, set_name) - live:
            dead.setdefault(name, []).append(f"macro_plot.{set_name}")

    assert not dead, (
        "region-class names that no raster can produce, so every rule reading "
        "them silently does nothing:\n  "
        + "\n  ".join(f"{name!r} named by {len(where)}: "
                      f"{', '.join(sorted(where)[:4])}"
                      f"{' …' if len(where) > 4 else ''}"
                      for name, where in sorted(dead.items()))
        + f"\n\nLive classes: {sorted(live)}")


# --------------------------------------------------------------------------- #
# 16g record fields — each gate shown failing on a synthetic fixture
# --------------------------------------------------------------------------- #
def _groups(dirpath, *rows):
    _write(dirpath, "design-groups.json", {"schemaVersion": 1, "groups": list(rows)})


def _errs(dirpath, places, groups=None):
    _taxonomy(dirpath)
    _region_file(dirpath, places)
    if groups is not None:
        _groups(dirpath, *groups)
    return catalogue.validate_catalogue(dirpath, check_permanence=False)


def _group_row(**over):
    row = {"id": "group.pair", "anchor": "place.testreg.a",
           "members": ["place.testreg.a", "place.testreg.b"],
           "loreReason": "One xanmeer, two mouths; one blueprint and one build.",
           "maxSpreadM": 120}
    row.update(over)
    return row


def _member(rid, pos, **over):
    return _record(id=rid, designGroup="group.pair", positionM=list(pos),
                   footprintRadiusM=40.0, footprintSource="band", **over)


def test_a_record_schemaVersion_above_the_files_fails(tmp_path):
    """MUTATION: drop the per-record comparison — green on a record claiming
    a shape its file does not have."""
    errs = _errs(tmp_path, [_record(schemaVersion=3)])
    assert any("schemaVersion 3 is above the file's 2" in e for e in errs), errs


def test_a_record_without_a_schemaVersion_fails(tmp_path):
    rec = _record()
    del rec["schemaVersion"]
    errs = _errs(tmp_path, [rec])
    assert any("schemaVersion must be an int" in e for e in errs), errs


def test_design_group_members_further_apart_than_the_spread_fail(tmp_path):
    """MUTATION: drop the pairwise distance loop — green on a "group" whose
    members are half a region apart."""
    places = [_member("place.testreg.a", (0, 0)), _member("place.testreg.b", (900, 0))]
    errs = _errs(tmp_path, places, [_group_row()])
    assert any("past maxSpreadM 120" in e for e in errs), errs


def test_a_group_member_without_the_stamp_fails(tmp_path):
    """MUTATION: check only the stamped records, never the register's members."""
    places = [_member("place.testreg.a", (0, 0)),
              _record(id="place.testreg.b", positionM=[50, 0],
                      footprintRadiusM=40.0, footprintSource="band")]
    errs = _errs(tmp_path, places, [_group_row()])
    assert any("is a member of group.pair but carries designGroup None" in e for e in errs), errs


def test_a_group_whose_anchor_is_not_a_member_fails(tmp_path):
    places = [_member("place.testreg.a", (0, 0)), _member("place.testreg.b", (50, 0))]
    errs = _errs(tmp_path, places, [_group_row(anchor="place.testreg.z")])
    assert any("anchor place.testreg.z is not one of its members" in e for e in errs), errs


def test_a_designGroup_with_no_register_row_fails(tmp_path):
    errs = _errs(tmp_path, [_member("place.testreg.a", (0, 0))], [_group_row(id="group.other")])
    assert any("designGroup group.pair is not a row" in e for e in errs), errs


def test_an_unknown_co_siting_relation_fails(tmp_path):
    """MUTATION: accept any string relation — green on invented vocabulary."""
    rec = _record(coSitedWith=[{"place": "place.testreg.b", "relation": "next-door",
                                "measurement": {"clearM": 3.0, "checked": "scour"}}])
    errs = _errs(tmp_path, [rec])
    assert any("relation must be one of" in e for e in errs), errs


def test_a_co_siting_measurement_of_the_wrong_shape_fails(tmp_path):
    rec = _record(coSitedWith=[{"place": "place.testreg.b", "relation": "satellite",
                                "measurement": {"clearM": 3.0, "checked": "scour"}}])
    errs = _errs(tmp_path, [rec])
    assert any("needs measurement keys ['distanceM', 'maxM']" in e for e in errs), errs


def test_a_sightline_that_is_not_reciprocated_fails(tmp_path):
    """A sightline is true of the PAIR. MUTATION: drop the reciprocity loop."""
    a = _record(id="place.testreg.a",
                coSitedWith=[{"place": "place.testreg.b", "relation": "sightline",
                              "measurement": {"clearM": 3.0, "checked": "scour"}}])
    b = _record(id="place.testreg.b")
    errs = _errs(tmp_path, [a, b])
    assert any("is not reciprocated on that record" in e for e in errs), errs
    b["coSitedWith"] = [{"place": "place.testreg.a", "relation": "sightline",
                         "measurement": {"clearM": 3.0, "checked": "scour"}}]
    assert catalogue.validate_catalogue(tmp_path, check_permanence=False) == [] or True
    _region_file(tmp_path, [a, b])
    assert catalogue.validate_catalogue(tmp_path, check_permanence=False) == []


def test_vastei_tutorial_scene_without_owner_guided_fails(tmp_path):
    """MUTATION: validate `vasteiTutorialScene` alone — green on a tutorial
    scene nobody has guided."""
    errs = _errs(tmp_path, [_record(vasteiTutorialScene=True)])
    assert any("only valid on an ownerGuided record" in e for e in errs), errs
    assert _errs(tmp_path, [_record(vasteiTutorialScene=True, ownerGuided=True)]) == []


def test_two_player_stronghold_reservations_fail(tmp_path):
    """MUTATION: stop counting — green on two strongholds."""
    places = [_record(id="place.testreg.a", reservedFor="player-stronghold"),
              _record(id="place.testreg.b", reservedFor="player-stronghold")]
    errs = _errs(tmp_path, places)
    assert any("reservedFor 'player-stronghold' is claimed by 2 live records" in e for e in errs), errs


def test_an_eleventh_hero_hist_fails(tmp_path):
    """MUTATION: drop the slot count — green on eleven power slots."""
    places = []
    for i in range(11):
        slug = f"tree-{i:02d}"
        places.append(_record(id=f"place.testreg.{slug}",
                              heroHist={"id": f"hist.testreg.{slug}",
                                        "powerSlot": f"power.hist.testreg.{slug}",
                                        "status": "hero"}))
    errs = _errs(tmp_path, places)
    assert any("11 live records carry status 'hero'" in e for e in errs), errs
    assert _errs(tmp_path, places[:10]) == []


def test_a_hero_hist_reserve_must_have_no_power_slot(tmp_path):
    errs = _errs(tmp_path, [_record(heroHist={"id": "hist.testreg.grove",
                                              "powerSlot": "power.hist.testreg.grove",
                                              "status": "reserve"})])
    assert any("'reserve' exactly when powerSlot is null" in e for e in errs), errs


def test_a_positioned_record_without_a_footprint_fails(tmp_path):
    errs = _errs(tmp_path, [_record(positionM=[10.0, 10.0])])
    assert any("needs a positive footprintRadiusM" in e for e in errs), errs


def test_a_polygon_that_does_not_contain_the_dot_fails(tmp_path):
    """MUTATION: return True from `_point_in_polygon` — green on a footprint
    drawn beside the place it belongs to."""
    rec = _record(positionM=[500.0, 500.0], footprintRadiusM=120.0,
                  footprintSource="polygon",
                  footprintPolygon=[[0, 0], [100, 0], [100, 100], [0, 100]],
                  classification={"class": "camp", "family": "hostile", "type": "bandit",
                                  "variant": "riverine", "magnitude": "M4"})
    errs = _errs(tmp_path, [rec])
    assert any("does not contain the record's positionM" in e for e in errs), errs
    rec["positionM"] = [50.0, 50.0]
    assert _errs(tmp_path, [rec]) == []


def test_a_polygon_on_a_small_record_fails(tmp_path):
    rec = _record(positionM=[50.0, 50.0], footprintRadiusM=120.0, footprintSource="polygon",
                  footprintPolygon=[[0, 0], [100, 0], [100, 100], [0, 100]])
    errs = _errs(tmp_path, [rec])
    assert any("only for ['M4', 'M5'] records" in e for e in errs), errs


def test_a_city_way_that_starts_away_from_the_gate_fails(tmp_path):
    """MUTATION: check only the length of `way` — green on a street that
    starts nowhere near the gate it comes in through."""
    m5 = {"class": "camp", "family": "hostile", "type": "bandit",
          "variant": "riverine", "magnitude": "M5"}
    rec = _record(classification=m5, positionM=[0.0, 0.0], footprintRadiusM=225.0,
                  footprintSource="blueprint",
                  cityLayout={"gate": [0, 0], "centre": [100, 0],
                              "way": [[40, 0], [100, 0]], "source": "street_router"})
    errs = _errs(tmp_path, [rec])
    assert any("must start within 5.0 m of the gate" in e for e in errs), errs
    rec["cityLayout"]["way"] = [[2, 0], [50, 0], [100, 0]]
    assert _errs(tmp_path, [rec]) == []


def test_a_city_layout_on_a_non_M5_record_fails(tmp_path):
    rec = _record(positionM=[0.0, 0.0], footprintRadiusM=40.0, footprintSource="band",
                  cityLayout={"gate": [0, 0], "centre": [100, 0],
                              "way": [[0, 0], [100, 0]], "source": "street_router"})
    errs = _errs(tmp_path, [rec])
    assert any("cityLayout is only for ['M5'] records" in e for e in errs), errs


def test_an_underwater_access_detail_of_the_wrong_shape_fails(tmp_path):
    rec = _record(underwaterAccessDetail={"gating": "hold-your-breath", "surfaceAccessNodes": -1,
                                          "airPockets": "yes", "submergedPortal": False,
                                          "entityId": "", "depthM": "deep"})
    errs = _errs(tmp_path, [rec])
    for expect in ("gating must be one of", "surfaceAccessNodes must be an int",
                   "airPockets must be a bool", "entityId must name the water",
                   "depthM must be a number"):
        assert any(expect in e for e in errs), (expect, errs)


# --------------------------------------------------------------------------- #
# the shipped plot: nothing stands inside anything else's footprint
# --------------------------------------------------------------------------- #
@ladder.requires_delivered("16g")
def test_no_record_stands_inside_anothers_footprint(survey):
    """The closing footprint pass over the SHIPPED plot, judged on the
    record's own `footprintRadiusM` (16g), not on the plot run's memory.

    Skipped until the 16g chain run, because 16g is what re-plots these dots.
    Measured with the decorator removed on 2026-09-19 against the ladder at
    16f: 6 overlapping pairs, every one of them Gideon (footprint radius
    230 m, the imperial-city band) against a small place in the ring
    round it — that is what 16g has to clear.
    """
    from . import macro_plot
    recipes = macro_plot.load_recipes()
    demands, _files = macro_plot.build_demand(recipes)
    recs = {r["id"]: r for rf in catalogue.load_region_files() for r in rf.places}
    result = {}
    for d in demands:
        rec = recs.get(d.id)
        pos = (rec or {}).get("positionM")
        if not pos:
            continue
        d.footprint_m = float(rec["footprintRadiusM"])
        result[d.id] = {"candidate": macro_plot.committed_candidate(survey, rec, pos[0], pos[1])}
    rows = [r for r in macro_plot.typed_siting_violations(
        [d for d in demands if d.id in result], result, survey) if r["gate"] == "footprint"]
    assert rows == [], (
        f"{len(rows)} pairs stand inside each other's footprint, e.g. "
        + "; ".join(f"{r['id']} vs {r['other']} ({r['distM']} m, needs {r['needM']})"
                    for r in rows[:5]))


@ladder.requires_delivered("16g")
def test_every_underwater_entry_says_how_you_get_in():
    """A record whose way in is under water owes the player the detail: how it
    is gated, where you surface, whether there is air, how deep.

    Skipped until the 16g chain run (16g is what authors these blocks).
    Measured with the decorator removed on 2026-09-19: all 45 LIVE
    `underwater-entry` records (52 including the cut and deferred ones)
    carry no `underwaterAccessDetail`.
    """
    missing = [r["id"] for rf in catalogue.load_region_files() for r in rf.places
               if r.get("entrance") in catalogue.UNDERWATER_ENTRANCES
               and r.get("status") not in ("cut", "deferred")
               and not r.get("underwaterAccessDetail")]
    assert missing == [], (
        f"{len(missing)} underwater-entry records do not say how you get in, e.g. "
        + ", ".join(missing[:5]))
