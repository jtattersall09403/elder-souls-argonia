"""Blueprint schema validator tests (Phase 11 Part 0 item 3, decision 0041)."""

import pytest

from . import blueprint, blueprint_footprints, street_router

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


def _why(full=True):
    """A why block that satisfies the reference-register minimum length."""
    block = {
        "what": "A reed-cutters' camp of one hut above the cut itself.",
        "whyHere": "The cut is worked for three months a year, and the cutters sleep beside it.",
        "whyNeighbours": "The hut stands alone, because nothing else is built within a mile of it.",
        "playerPurpose": "A shelter, a bedroll and a reed-cutter who talks about the marsh.",
        "microGeography": "The hut takes the one dry hummock at the head of the cut.",
    }
    if full:
        block["whySpot"] = "This hummock stays above the water when the rest of the cut floods."
    return block


def _bp(**over):
    bp = {
        "id": "place.testreg.reed-cut-camp",
        "seed": "s1",
        "causalModel": {"founding": "f", "siteAdvantages": "s", "occupantsMotive": "m",
                        "pressures": "p", "wouldChangeIf": "w"},
        "boundary": [[0.1, 0.1], [0.2, 0.1], [0.2, 0.2]],
        "districts": [{"id": "district.reed-cut-camp.core", "kind": "core", "cultureKit": "argonian",
                       "boundary": [[0.1, 0.1], [0.2, 0.1], [0.2, 0.2]], "why": _why(full=False)}],
        "parcels": [{"id": "parcel.reed-cut-camp.hut", "districtId": "district.reed-cut-camp.core", "use": "dwelling",
                     "buildingFamily": "shackkit", "groundFit": "stilt",
                     "centreUV": list(CENTRE_UV), "yawDeg": YAW_DEG,
                     "orientationWhy": "Turned so its landing faces the reed cut.",
                     "assetRef": ASSET_REF, "footprint": _derived(), "why": _why()}],
        "doors": [{"id": "door.testreg.reed-cut-camp.1", "parcelId": "parcel.reed-cut-camp.hut",
                   "facingDeg": _door_facing(), "thresholdUV": _threshold(),
                   "interiorClaim": {"sizeClass": "large", "culture": "argonian",
                                     "interiorRef": "vanilla-farmhouse-int"}}],
        "clearance": {"hardClear": [], "thinned": [], "kept": []},
        "approaches": [{"id": "approach.reed-cut-camp.marsh-track", "mode": "walk",
                        "fromDirection": "south-east", "firstSeen": "parcel.reed-cut-camp.hut",
                        "sequence": "The hut's roof shows over the reeds a hundred paces out, and nothing else does.",
                        "wayfinding": "The cut itself leads to the door, because the only dry line runs along its bank."}],
        "scaleGrounding": {"loreSource": "Test stub: the smallest camp on module 92's ladder.",
                           "population": "2-4", "households": 1, "buildingsPlanned": 1, "npcsPlanned": 2,
                           "why": "One family works this cut, so one hut is all the camp needs."},
        "combatSpaces": [{"id": "combat.reed-cut-camp.cut-head", "clearanceClass": "open",
                          "boundary": [[0.128, 0.128], [0.133, 0.128], [0.133, 0.133]],
                          "why": "The cutters fight bog-lurkers at the head of the cut, and it is the one open ground."}],
        "siting": {"dossier": "world/sources/sites/fixture-reed-cut-camp.md",
                   "candidates": [
                       {"id": "candidate.reed-cut-camp.hummock", "positionM": [960.0, 960.0], "chosen": True,
                        "why": "The hummock stays dry when the cut floods."},
                       {"id": "candidate.reed-cut-camp.bank", "positionM": [980.0, 990.0],
                        "why": "Closer to the water but under it for two months a year.",
                        "rejectedBecause": "It floods."}]},
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


# --------------------------------------------------------------------------- #
# Part 6 round 2 (owner 2026-09-05): why blocks, approaches, scale grounding,
# ways authored as via + routing + why, gate spans and interiors
# --------------------------------------------------------------------------- #

def _way(**over):
    way = {"id": "route.reed-cut-camp.cut-path", "kind": "footpath", "widthM": 1.5,
           "routing": "straight", "via": [[0.1, 0.1], [0.13, 0.13]],
           "points": [[0.1, 0.1], [0.13, 0.13]],
           "endsAt": ["parcel.reed-cut-camp.hut"],
           "why": "The only dry line into the camp, which runs along the bank of the cut."}
    way.update(over)
    return way


def _routed(bp):
    """`points` is derived: run the street router the way an author would."""
    street_router.apply_to_blueprint(bp)
    return bp


def test_why_block_is_required_on_districts_and_parcels():
    parcel = {k: v for k, v in _bp()["parcels"][0].items() if k != "why"}
    errs = blueprint.validate_blueprint(_bp(parcels=[parcel]), KNOWN)
    assert any("why block is required" in e for e in errs)
    district = {k: v for k, v in _bp()["districts"][0].items() if k != "why"}
    errs = blueprint.validate_blueprint(_bp(districts=[district]), KNOWN)
    assert any("why block is required" in e for e in errs)


def test_why_fields_must_be_plain_sentences():
    parcel = dict(_bp()["parcels"][0])
    parcel["why"] = dict(parcel["why"], whySpot="dry")
    errs = blueprint.validate_blueprint(_bp(parcels=[parcel]), KNOWN)
    assert any("why.whySpot must be a plain sentence" in e for e in errs)


def test_approaches_are_required_and_shaped():
    errs = blueprint.validate_blueprint(_bp(approaches=[]), KNOWN)
    assert any("at least one walking/boat approach" in e for e in errs)
    bad = [{"id": "approach.reed-cut-camp.marsh-track", "mode": "teleport",
            "sequence": "x", "wayfinding": "y"}]
    errs = blueprint.validate_blueprint(_bp(approaches=bad), KNOWN)
    assert any("mode must be one of" in e for e in errs)
    assert any("needs fromRouteId or fromDirection" in e for e in errs)
    assert any("firstSeen" in e for e in errs)
    assert any("sequence must be a plain sentence" in e for e in errs)


def test_scale_grounding_must_match_the_parcels_drawn():
    sg = dict(_bp()["scaleGrounding"], buildingsPlanned=40)
    errs = blueprint.validate_blueprint(_bp(scaleGrounding=sg), KNOWN)
    assert any("the plan and the drawing disagree" in e for e in errs)
    missing = {k: v for k, v in sg.items() if k != "loreSource"}
    errs = blueprint.validate_blueprint(_bp(scaleGrounding=missing), KNOWN)
    assert any("scaleGrounding.loreSource is required" in e for e in errs)


def test_ways_are_authored_as_via_routing_and_why():
    assert blueprint.validate_blueprint(_routed(_bp(routes=[_way()])), KNOWN) == []
    bad = _way(via=[[0.1, 0.1]], routing="vibes", why="short")
    errs = blueprint.validate_blueprint(_bp(routes=[bad]), KNOWN)
    assert any("via must be >=2" in e for e in errs)
    assert any("routing must be one of" in e for e in errs)
    assert any("why is required" in e for e in errs)
    no_points = {k: v for k, v in _way().items() if k != "points"}
    errs = blueprint.validate_blueprint(_bp(routes=[no_points]), KNOWN)
    assert any("points" in e for e in errs)


def test_fence_needs_its_kit_piece_and_combat_space_needs_a_why():
    fence = _way(id="fence.reed-cut-camp.reed-screen", kind="hedge", endsAt=[])
    errs = blueprint.validate_blueprint(_bp(fences=[fence]), KNOWN)
    assert any("assetRef (the kit's fence/wall piece) is required" in e for e in errs)
    space = {"id": "combat.reed-cut-camp.cut", "boundary": [[0.1, 0.1], [0.2, 0.1], [0.2, 0.2]],
             "clearanceClass": "open"}
    errs = blueprint.validate_blueprint(_bp(combatSpaces=[space]), KNOWN)
    assert any("why is required" in e for e in errs)
    space["why"] = "A raid on the camp is the tier-1 hostility flip, and this is the only open ground."
    assert blueprint.validate_blueprint(_bp(combatSpaces=[space]), KNOWN) == []


def test_parcel_spans_and_interior_are_typed():
    parcel = dict(_bp()["parcels"][0], spans=7, interior={"kind": "cellar"})
    errs = blueprint.validate_blueprint(_bp(parcels=[parcel]), KNOWN)
    assert any("spans must be a way id" in e for e in errs)
    assert any("interior.kind must be one of" in e for e in errs)
    ok = dict(_bp()["parcels"][0], spans="route.reed-cut-camp.cut-path",
              interior={"kind": "dwelling"})
    assert blueprint.validate_blueprint(_routed(_bp(parcels=[ok], routes=[_way()])), KNOWN) == []


# --------------------------------------------------------------------------- #
# Interiors and doors (owner ruling 2026-09-05). The index is DERIVED data, so
# these tests substitute a stub library rather than depending on which kit
# pieces happen to measure enclosed today — what is under test is the rule, not
# the measurement (that is pipeline/test_interiors_index.py's job).
# --------------------------------------------------------------------------- #
from . import blueprint_interiors  # noqa: E402


class _StubLibrary(blueprint_interiors.InteriorLibrary):
    def __init__(self, record):
        self.by_asset = {ASSET_REF: record}
        self.kit_of = {ASSET_REF: "settlement-stilt-v1"}


@pytest.fixture
def stub_index(monkeypatch):
    def install(record):
        monkeypatch.setattr(blueprint_interiors, "library", lambda *a, **k: _StubLibrary(record))
    return install


def _claim(**over):
    claim = {"sizeClass": "large", "culture": "argonian", "interiorRef": "vanilla-farmhouse-int"}
    claim.update(over)
    return claim


def _door(**over):
    door = {"id": "door.testreg.reed-cut-camp.1", "parcelId": "parcel.reed-cut-camp.hut",
            "facingDeg": _door_facing(), "thresholdUV": _threshold(),
            "interiorClaim": _claim()}
    door.update(over)
    return door


SHELL = {"interior": "shell", "sizeClass": "large", "planAreaM2": 186.94, "doorways": []}
MATCHED = {"interior": "matched", "sizeClass": "large", "planAreaM2": 186.94,
           "interiorAssetRef": "pool:arch/hut01_int", "doorways": [{"sideDeg": 180.0, "arcM": 1.3}]}
OPEN = {"interior": "none", "sizeClass": "large", "planAreaM2": 186.94, "doorways": [],
        "why": "open to the sky"}


def test_a_building_with_an_inside_must_have_a_door(stub_index):
    stub_index(SHELL)
    errs = blueprint.validate_blueprint(_bp(doors=[]), KNOWN)
    assert any("has an inside" in e and "no door in doors[]" in e for e in errs)


def test_a_piece_with_no_interior_may_not_have_a_door(stub_index):
    stub_index(OPEN)
    errs = blueprint.validate_blueprint(_bp(), KNOWN)
    assert any("opens onto nothing" in e for e in errs)


def test_a_matched_piece_needs_the_kit_s_own_interior_ref(stub_index):
    stub_index(MATCHED)
    errs = blueprint.validate_blueprint(_bp(doors=[_door(
        facingDeg=(180.0 + YAW_DEG) % 360.0)]), KNOWN)
    assert any("interiorClaim.interiorRef is 'vanilla-farmhouse-int'" in e
               and "pool:arch/hut01_int" in e for e in errs)


def test_a_shell_must_name_the_interior_kit_phase_12_will_build(stub_index):
    stub_index(SHELL)
    errs = blueprint.validate_blueprint(
        _bp(doors=[_door(interiorClaim=_claim(interiorRef=None))]), KNOWN)
    assert any("interiorClaim.interiorRef is required" in e for e in errs)


def test_size_class_must_match_the_measured_footprint_and_says_the_numbers(stub_index):
    stub_index(SHELL)
    errs = blueprint.validate_blueprint(
        _bp(doors=[_door(interiorClaim=_claim(sizeClass="small"))]), KNOWN)
    message = next(e for e in errs if "sizeClass" in e)
    assert "187 m²" in message and "under 40 m²" in message and "under 120 m²" in message
    assert "'large'" in message


def test_a_door_may_not_be_claimed_on_a_blank_wall(stub_index):
    """The mesh's only doorway is at local 180°; with yaw 40° that is 220° in
    the world, so a door facing 40° is on the back wall."""
    stub_index(MATCHED)
    errs = blueprint.validate_blueprint(_bp(doors=[_door(
        facingDeg=YAW_DEG, interiorClaim=_claim(interiorRef="pool:arch/hut01_int"))]), KNOWN)
    assert any("off the nearest doorway the mesh actually has" in e for e in errs)


def test_a_door_on_the_measured_doorway_passes(stub_index):
    stub_index(MATCHED)
    errs = blueprint.validate_blueprint(_bp(doors=[_door(
        facingDeg=(180.0 + YAW_DEG) % 360.0,
        interiorClaim=_claim(interiorRef="pool:arch/hut01_int"))]), KNOWN)
    assert not any("doorway" in e for e in errs)


def test_the_report_lists_what_each_parcel_owes(stub_index):
    stub_index(SHELL)
    lines = blueprint_interiors.report_lines(_bp(doors=[]),
                                             _StubLibrary(SHELL))
    assert any("MISSING a door" in line for line in lines)
    assert lines[-1].endswith("problem(s)")


# --- module 97 placement principles (§G closures, 2026-09-05) --------------

def test_siting_is_required_on_a_blueprint_of_a_catalogue_record():
    """97 B1 / G7 — no design before a dossier."""
    bp = _bp()
    bp.pop("siting")
    assert any("97 B1" in e for e in blueprint.validate_blueprint(bp, KNOWN))
    # the Part 0 fixture details no catalogue record, so it is exempt
    assert not any("97 B1" in e for e in blueprint.validate_blueprint(bp, None))


def test_a_combat_space_is_required_with_its_clearance_and_why():
    """97 D9 / G20 — even a safe place has one."""
    assert any("97 D9" in e for e in blueprint.validate_blueprint(_bp(combatSpaces=[]), KNOWN))
    bad = [{"id": "combat.reed-cut-camp.cut-head", "why": "short"}]
    errs = blueprint.validate_blueprint(_bp(combatSpaces=bad), KNOWN)
    assert any("clearanceClass" in e for e in errs)
    assert any("boundary" in e and "combat" in e for e in errs)


def _yaw_parcels(yaws):
    base = _bp()["parcels"][0]
    out = []
    for i, yaw in enumerate(yaws):
        u = 0.13 + i * 0.002
        p = dict(base, id=f"parcel.reed-cut-camp.hut-{i}", centreUV=[u, 0.13], yawDeg=float(yaw))
        p["footprint"] = _derived(centre_uv=[u, 0.13], yaw=float(yaw))
        out.append(p)
    return out


def test_yaw_diversity_is_capped_per_district():
    """97 C8 / G17 — a uniform bearing reads as copy-paste."""
    uniform = _bp(parcels=_yaw_parcels([30.0] * 10), doors=[],
                  scaleGrounding={**_bp()["scaleGrounding"], "buildingsPlanned": 10})
    assert any("97 C8" in e for e in blueprint.validate_blueprint(uniform, KNOWN))
    varied = _bp(parcels=_yaw_parcels([0, 20, 45, 70, 100, 130, 165, 200, 240, 300]), doors=[],
                 scaleGrounding={**_bp()["scaleGrounding"], "buildingsPlanned": 10})
    assert not any("97 C8" in e for e in blueprint.validate_blueprint(varied, KNOWN))


def test_a_declared_grid_district_may_share_one_bearing():
    """97 C2 — a surveyed Imperial grid is the exception."""
    bp = _bp(parcels=_yaw_parcels([30.0] * 10), doors=[],
             scaleGrounding={**_bp()["scaleGrounding"], "buildingsPlanned": 10})
    bp["districts"][0]["routing"] = "straight"
    assert not any("97 C8" in e for e in blueprint.validate_blueprint(bp, KNOWN))
    bp["districts"][0]["routing"] = "surveyed"
    assert any("97 C2" in e for e in blueprint.validate_blueprint(bp, KNOWN))


def test_abuts_must_name_a_parcel_and_say_why():
    """97 C5 — the declared exception to the 8 m floor."""
    parcel = dict(_bp()["parcels"][0], abuts=["parcel.reed-cut-camp.nowhere"])
    errs = blueprint.validate_blueprint(_bp(parcels=[parcel]), KNOWN)
    assert any("not a parcel in this blueprint" in e for e in errs)
    assert any("abutsWhy is required" in e for e in errs)


def test_density_band_and_use_mix_are_warnings_not_failures():
    """97 C6 / C7 — warn-grade, with the number in the message."""
    errs, warns = blueprint.validate_blueprint_full(_bp(), KNOWN)
    assert errs == []
    assert any("97 C6" in w for w in warns)
    assert all("97 C6" not in e for e in errs)


def test_way_width_classes_are_reported_with_their_numbers():
    """97 C3 — width reads as rank."""
    ways = [{"id": "route.reed-cut-camp.spine", "kind": "road", "widthM": 2.0,
             "why": "The one dry line into the cut, wide enough for a hauling sledge.",
             "via": [[0.11, 0.11], [0.13, 0.13]], "routing": "straight",
             "points": [[0.11, 0.11], [0.13, 0.13]]}]
    _errs, warns = blueprint.validate_blueprint_full(_bp(routes=ways), KNOWN)
    assert any("97 C3" in w and "4.3" in w for w in warns)


def test_the_use_histogram_reports_the_share_it_measured():
    parcels = _yaw_parcels([0, 20, 45, 70, 100, 130, 165, 200, 240, 300])
    for p in parcels:
        p["use"] = "storage"
    _errs, warns = blueprint.validate_blueprint_full(
        _bp(parcels=parcels, doors=[],
            scaleGrounding={**_bp()["scaleGrounding"], "buildingsPlanned": 10}), KNOWN)
    assert any("97 C7" in w and "storage" in w for w in warns)


# --- 97 C-stitch: networkTerminals ---------------------------------------
# The Part 0 fixture details no catalogue record (it is compiled
# --skip-catalogue), so it is exempt from the "terminals required" rule the
# same way it is exempt from `siting`; the rule is tested on synthetic
# records instead, which keeps the fixture free of a made-up province route.

def _terminal(**over):
    t = {"id": "terminal.reed-cut-camp.path-head", "routeId": "track.testreg.reed-cut-camp",
         "entryUV": [0.131, 0.129], "wayId": "route.reed-cut-camp.bank",
         "kind": "footpath",
         "why": "The only dry line off the marsh reaches the camp at the head of the cut."}
    t.update(over)
    return t


def _with_way(**over):
    way = {"id": "route.reed-cut-camp.bank", "kind": "footpath", "widthM": 1.2,
           "via": [[0.131, 0.129], [0.132, 0.130]], "routing": "straight",
           "points": [[0.131, 0.129], [0.132, 0.130]],
           "why": "The bank path carries the marsh line from the path head to the hut."}
    over.setdefault("networkTerminals", [_terminal()])
    return _bp(routes=[way], **over)


def test_terminal_schema_is_checked():
    errs = blueprint.validate_blueprint(
        _with_way(networkTerminals=[_terminal(kind="highway", wayId="route.reed-cut-camp.nope",
                                              why="short", entryUV=[0.1])]), KNOWN)
    assert any("kind must be one of" in e for e in errs)
    assert any("wayId" in e for e in errs)
    assert any("entryUV" in e for e in errs)
    assert any("why is required" in e and "C-stitch" in e for e in errs)


def test_terminal_id_follows_the_standard():
    errs = blueprint.validate_blueprint(
        _with_way(networkTerminals=[_terminal(id="terminal.wrong.head")]), KNOWN)
    assert any("standard 2" in e for e in errs)


def test_approach_from_route_must_name_a_terminal():
    ap = [{"id": "approach.reed-cut-camp.marsh-track", "mode": "walk",
           "fromRouteId": "route.road.invented-by-the-designer",
           "viaUV": [[0.140, 0.140]],
           "firstSeen": "parcel.reed-cut-camp.hut",
           "sequence": "The hut's roof shows over the reeds a hundred paces out, and nothing else does.",
           "wayfinding": "The cut itself leads to the door, because the only dry line runs along its bank."}]
    errs = blueprint.validate_blueprint(_with_way(approaches=ap), KNOWN)
    assert any("names no networkTerminal's routeId" in e for e in errs)


def test_approach_from_route_needs_a_via_arrow():
    ap = [{"id": "approach.reed-cut-camp.marsh-track", "mode": "walk",
           "fromRouteId": "track.testreg.reed-cut-camp",
           "firstSeen": "parcel.reed-cut-camp.hut",
           "sequence": "The hut's roof shows over the reeds a hundred paces out, and nothing else does.",
           "wayfinding": "The cut itself leads to the door, because the only dry line runs along its bank."}]
    errs = blueprint.validate_blueprint(_with_way(approaches=ap), KNOWN)
    assert any("viaUV is required" in e for e in errs)


def test_terminals_required_when_the_record_is_reached_by_road(monkeypatch):
    monkeypatch.setattr(blueprint, "catalogue_records",
                        lambda: {"place.testreg.reed-cut-camp": {"id": "place.testreg.reed-cut-camp",
                                                                 "discovery": "road"}})
    errs = blueprint.validate_blueprint(_bp(), KNOWN)
    assert any("needs at least one networkTerminal" in e for e in errs)


def test_terminals_not_required_for_a_hidden_place(monkeypatch):
    monkeypatch.setattr(blueprint, "catalogue_records",
                        lambda: {"place.testreg.reed-cut-camp": {"id": "place.testreg.reed-cut-camp",
                                                                 "discovery": "rumour"}})
    assert not [e for e in blueprint.validate_blueprint(_bp(), KNOWN) if "C-stitch" in e]
