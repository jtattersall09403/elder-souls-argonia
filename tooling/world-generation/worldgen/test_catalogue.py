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
