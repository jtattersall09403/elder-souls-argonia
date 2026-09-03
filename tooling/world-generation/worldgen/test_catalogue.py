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
    }
    rec.update(over)
    return rec


def _region_file(dirpath, places):
    _write(dirpath, "places-testreg.json",
           {"schemaVersion": 1, "region": "testreg", "seed": "s1", "places": places})


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
           {"schemaVersion": 1, "region": "testreg", "seed": "s1", "places": [rec]})
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
# Source: docs/research/phase11-critique/coverage-density.md S1/S2.
REGION_BUDGETS = {
    "dunmer-north": (138, 169),
    "hist-heartland": (94, 130),
    "imperial-fringe": (119, 147),
    "imperial-penal-south": (17, 21),
    "mercantile-coast": (45, 56),
    "naga-kur-deeps": (22, 32),
    "pirate-freeholds": (14, 17),
    "saxhleel-coast": (18, 24),
}
# Owner ruling (touchpoint ①, 2026-09-03): ceilings are SOFT, floors are HARD.
# A region may exceed its ceiling when there is a recorded reason — add it here
# with a comment, never silently. A region below its floor always fails.
# naga-kur-deeps sits above its ceiling by design after the verify/wrap
# rebalance: taking it to 32 would have driven six types under-band, so it was
# rebalanced only as far as the type guard allowed and the residue handed to
# Part 3's homeless-batch review. Owner accepted 2026-09-03.
BUDGET_EXCEPTIONS = {"naga-kur-deeps": 39}


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
            "(docs/research/phase11-critique/coverage-density.md S2)"
        )


def test_province_total_is_inside_the_corrected_envelope():
    lo = sum(b[0] for b in REGION_BUDGETS.values())
    hi = sum(b[1] for b in REGION_BUDGETS.values()) + sum(
        BUDGET_EXCEPTIONS[r] - REGION_BUDGETS[r][1] for r in BUDGET_EXCEPTIONS
    )
    n = sum(_live_by_region().values())
    assert lo <= n <= hi, f"province holds {n} live records; the corrected envelope is {lo}-{hi}"
