"""Blueprint schema validator tests (Phase 11 Part 0 item 3, decision 0041)."""

import pytest

from . import blueprint, blueprint_footprints

# A real, measured kit asset: parcels are picked on geometry, so the tests are
# too (the validator recomputes the derived footprint from this piece).
ASSET_REF = "bmv:architecture/stilthouse/stilthouseext"
CENTRE_UV = [0.13, 0.13]
YAW_DEG = 40.0


def _derived(centre_uv=CENTRE_UV, yaw=YAW_DEG, asset_ref=ASSET_REF):
    record = blueprint_footprints.library().get(asset_ref)
    if record is None:
        pytest.skip("kits are not built in this checkout (output/kits is derived)")
    return blueprint_footprints.derive_footprint(record, centre_uv, yaw)


def _bp(**over):
    bp = {
        "id": "place.testreg.reed-cut-camp",
        "seed": "s1",
        "causalModel": {"founding": "f", "siteAdvantages": "s", "occupantsMotive": "m",
                        "pressures": "p", "wouldChangeIf": "w"},
        "boundary": [[0.1, 0.1], [0.2, 0.1], [0.2, 0.2]],
        "districts": [{"id": "district.reed-cut-camp.core", "kind": "core", "cultureKit": "argonian",
                       "boundary": [[0.1, 0.1], [0.2, 0.1], [0.2, 0.2]]}],
        "parcels": [{"id": "parcel.reed-cut-camp.hut", "districtId": "district.reed-cut-camp.core", "use": "dwelling",
                     "buildingFamily": "shackkit", "groundFit": "stilt",
                     "centreUV": list(CENTRE_UV), "yawDeg": YAW_DEG,
                     "orientationWhy": "Turned so its landing faces the reed cut.",
                     "assetRef": ASSET_REF, "footprint": _derived()}],
        "doors": [{"id": "door.testreg.reed-cut-camp.1", "parcelId": "parcel.reed-cut-camp.hut",
                   "facingDeg": _door_facing(), "thresholdUV": _threshold(),
                   "interiorClaim": {"sizeClass": "small", "culture": "argonian"}}],
        "clearance": {"hardClear": [], "thinned": [], "kept": []},
        "variants": [{"id": "variant.reed-cut-camp.raided", "changedRefs": ["parcel.reed-cut-camp.hut"]}],
        "occupants": [{"slotId": "o1", "ladderRef": "modest-d2 hunter", "cultureRole": "hunter"}],
        "budget": {"maxInstances": 500, "maxUniqueMaterials": 20,
                   "maxTextureMB": 32, "maxColliders": 120},
    }
    bp.update(over)
    return bp


KNOWN = {"place.testreg.reed-cut-camp", "place.testreg.other"}


def _threshold():
    """A point on the derived outline: doors sit on the wall they claim."""
    poly = _derived()
    ax, az = poly[0]
    bx, bz = poly[1]
    return [round((ax + bx) / 2, 9), round((az + bz) / 2, 9)]


def _door_facing():
    parcel = {"footprint": _derived()}
    return round(blueprint._door_edge_bearing(parcel, _threshold()))


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


@pytest.mark.xfail(
    reason="Part 6 schema change 2026-09-05: parcels now require centreUV/yawDeg/"
           "orientationWhy/assetRef and a DERIVED footprint. The five live "
           "blueprints are being re-authored against it; this flips back to a "
           "hard gate when they land.",
    strict=False,
)
def test_live_dir_validates():
    # the live dir holds real places from Part 6 on; validate against the catalogue
    assert blueprint.validate_all(known_place_ids=blueprint.catalogue_ids()) == []


def test_parcel_requires_orientation_with_a_reason():
    parcel = dict(_bp()["parcels"][0])
    parcel.pop("yawDeg")
    parcel.pop("orientationWhy")
    errs = blueprint.validate_blueprint(_bp(parcels=[parcel]), KNOWN)
    assert any("yawDeg is required" in e for e in errs)
    assert any("orientationWhy is required" in e for e in errs)


def test_footprint_is_derived_and_cannot_be_hand_edited():
    parcel = dict(_bp()["parcels"][0])
    parcel["footprint"] = [[p[0] + 0.001, p[1]] for p in parcel["footprint"]]
    errs = blueprint.validate_blueprint(_bp(parcels=[parcel]), KNOWN)
    assert any("not the derived polygon" in e for e in errs)


def test_apply_rewrites_the_footprint_from_the_measured_asset():
    bp = _bp()
    bp["parcels"][0]["footprint"] = [[0.0, 0.0], [0.0, 0.1], [0.1, 0.1]]
    assert blueprint_footprints.apply_to_blueprint(bp) == []
    assert blueprint.validate_blueprint(bp, KNOWN) == []


def test_door_must_sit_on_the_side_it_claims():
    bp = _bp()
    bp["doors"][0]["facingDeg"] = (bp["doors"][0]["facingDeg"] + 180) % 360
    errs = blueprint.validate_blueprint(bp, KNOWN)
    assert any("faces away from the wall" in e for e in errs)


def test_part6_asset_ref_and_siting_block():
    bad = _bp(parcels=[{"id": "parcel.reed-cut-camp.hut", "districtId": "district.reed-cut-camp.core", "use": "x", "buildingFamily": "hut",
                        "groundFit": "stilt", "footprint": [[0, 0], [0, 1], [1, 1]], "assetRef": 7,
                        "centreUV": [0.1, 0.1], "yawDeg": 0.0, "orientationWhy": "Square to the bank behind it."}],
              districts=[{"id": "district.reed-cut-camp.core", "kind": "core", "cultureKit": "argonian-stilt",
                          "boundary": [[0, 0], [0, 1], [1, 1]]}],
              siting={"candidates": [{"id": "a", "positionM": [1, 2], "why": "flat"}]})
    errs = blueprint.validate_blueprint(bad, KNOWN)
    assert any("assetRef" in e for e in errs)
    assert any("siting.dossier" in e for e in errs)
    assert any(">=2 candidate" in e for e in errs)
    assert any("candidate id 'a'" in e for e in errs)
    good = _bp(siting={"dossier": "world/sources/sites/dossiers/x.json",
                       "candidates": [{"id": "candidate.reed-cut-camp.a", "positionM": [1, 2], "why": "flat", "chosen": True},
                                      {"id": "candidate.reed-cut-camp.b", "positionM": [3, 4], "why": "wet", "rejectedBecause": "floods"}]})
    assert not [e for e in blueprint.validate_blueprint(good, KNOWN) if "siting" in e or "candidate" in e]
    bad_ids = _bp(districts=[{"id": "d1", "kind": "core", "cultureKit": "argonian", "boundary": [[0, 0], [0, 1], [1, 1]]}])
    assert any("standard 2" in e for e in blueprint.validate_blueprint(bad_ids, KNOWN))
    assert "argonian-stone" in blueprint.KIT_SETS and "neutral-works" in blueprint.KIT_SETS
