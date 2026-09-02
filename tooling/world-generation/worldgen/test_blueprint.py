"""Blueprint schema validator tests (Phase 11 Part 0 item 3, decision 0041)."""

from . import blueprint


def _bp(**over):
    bp = {
        "id": "place.testreg.reed-cut-camp",
        "seed": "s1",
        "causalModel": {"founding": "f", "siteAdvantages": "s", "occupantsMotive": "m",
                        "pressures": "p", "wouldChangeIf": "w"},
        "boundary": [[0.1, 0.1], [0.2, 0.1], [0.2, 0.2]],
        "districts": [{"id": "d1", "kind": "core", "cultureKit": "argonian",
                       "boundary": [[0.1, 0.1], [0.2, 0.1], [0.2, 0.2]]}],
        "parcels": [{"id": "p1", "districtId": "d1", "use": "dwelling",
                     "buildingFamily": "shackkit", "groundFit": "stilt",
                     "footprint": [[0.12, 0.12], [0.14, 0.12], [0.14, 0.14]]}],
        "doors": [{"id": "door.testreg.reed-cut-camp.1", "parcelId": "p1",
                   "facingDeg": 90, "thresholdUV": [0.15, 0.15],
                   "interiorClaim": {"sizeClass": "small", "culture": "argonian"}}],
        "clearance": {"hardClear": [], "thinned": [], "kept": []},
        "variants": [{"id": "v-raided", "changedRefs": ["p1"]}],
        "occupants": [{"slotId": "o1", "ladderRef": "modest-d2 hunter", "cultureRole": "hunter"}],
        "budget": {"maxInstances": 500, "maxUniqueMaterials": 20,
                   "maxTextureMB": 32, "maxColliders": 120},
    }
    bp.update(over)
    return bp


KNOWN = {"place.testreg.reed-cut-camp", "place.testreg.other"}


def test_valid_blueprint_passes():
    assert blueprint.validate_blueprint(_bp(), KNOWN) == []


def test_id_must_be_in_catalogue():
    errs = blueprint.validate_blueprint(_bp(id="place.testreg.ghost"), KNOWN)
    assert any("catalogue" in e for e in errs)


def test_two_culture_rule_and_ground_fit():
    bad = _bp(districts=[{"id": "d1", "kind": "core", "cultureKit": "blended"}],
              parcels=[{"id": "p1", "districtId": "d1", "use": "x",
                        "buildingFamily": "shackkit", "groundFit": "grade-everything"}])
    errs = blueprint.validate_blueprint(bad, KNOWN)
    assert any("two-culture" in e for e in errs)
    assert any("groundFit" in e for e in errs)


def test_door_prefix_claim_and_parcel_link():
    bad_door = {"id": "door.wrong.1", "parcelId": "nope", "interiorClaim": {}}
    errs = blueprint.validate_blueprint(_bp(doors=[bad_door]), KNOWN)
    assert any("must start door.testreg.reed-cut-camp." in e for e in errs)
    assert any("unknown parcelId" in e for e in errs)
    assert any("interiorClaim" in e for e in errs)


def test_variant_cap_and_semantic_occupants():
    too_many = [{"id": f"v{i}", "changedRefs": []} for i in range(4)]
    errs = blueprint.validate_blueprint(_bp(variants=too_many), KNOWN)
    assert any("at most 3" in e for e in errs)
    errs = blueprint.validate_blueprint(
        _bp(occupants=[{"slotId": "o1", "ladderRef": "42"}]), KNOWN)
    assert any("semantic" in e for e in errs)


def test_travel_service_target_checked():
    svc = [{"id": "t1", "kind": "ferry", "toPlaceId": "place.testreg.nowhere"}]
    errs = blueprint.validate_blueprint(_bp(travelServices=svc), KNOWN)
    assert any("toPlaceId" in e for e in errs)


def test_budget_shape():
    errs = blueprint.validate_blueprint(_bp(budget={"maxInstances": 1}), KNOWN)
    assert any("budget" in e for e in errs)


def test_live_dir_validates():
    assert blueprint.validate_all(known_place_ids=set()) == []
