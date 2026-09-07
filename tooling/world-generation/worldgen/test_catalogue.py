"""Catalogue schema validator tests (Phase 11 Part 2, decision 0041)."""

import json

from . import catalogue


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
