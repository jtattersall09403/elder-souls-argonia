"""Blueprint schema validator tests (Phase 11 Part 0 item 3, decision 0041)."""

import pytest

from . import blueprint, blueprint_footprints, blueprint_interiors, street_router

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
        "boardwalks": [_door_walk()],
        "clearance": {"hardClear": [], "thinned": [], "kept": []},
        "approaches": [{"id": "approach.reed-cut-camp.marsh-track", "mode": "walk",
                        "fromDirection": "south-east", "firstSeen": "parcel.reed-cut-camp.hut",
                        "sequence": "The hut's roof shows over the reeds a hundred paces out, and nothing else does.",
                        "wayfinding": "The cut itself leads to the door, because the only dry line runs along its bank."}],
        "scaleGrounding": {"loreSource": "Test stub: the smallest camp on module 92's ladder.",
                           "population": "2-4", "households": 1, "buildingsPlanned": 1, "npcsPlanned": 2,
                           "why": "One family works this cut, so one hut is all the camp needs."},
        "combatSpaces": [{"id": "combat.reed-cut-camp.cut-head", "clearanceClass": "open",
                          "aroundIds": ["parcel.reed-cut-camp.hut"],
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
    # District/combat polygons are generated records. Keep the generic fixture
    # canonical after any per-test parcel/way override.
    blueprint_footprints.apply_area_boundaries(bp)
    return bp


KNOWN = {"place.testreg.reed-cut-camp", "place.testreg.other"}


def test_dock_requires_a_physical_asset():
    bp = {
        "id": "place.testreg.reed-cut-camp",
        "docks": [{"id": "dock.reed-cut-camp.landing", "position": [0.15, 0.15],
                   "hullClass": "canoe"}],
        "networkTerminals": [{"id": "terminal.reed-cut-camp.landing", "kind": "channel",
                              "dockId": "dock.reed-cut-camp.landing",
                              "routeId": "waterway.reed-cut-camp"}],
    }
    bp["districts"] = []
    bp["parcels"] = []
    bp["landmarks"] = []
    # With no live-catalogue set, the validator performs schema checks without
    # loading province geometry; unrelated required-field findings are fine.
    generic_errors = blueprint.validate_blueprint(bp)
    assert any("physical berth cannot compile" in error for error in generic_errors)


def _threshold():
    """A point on the derived outline: doors sit on the wall they claim."""
    poly = _derived()
    ax, az = poly[0]
    bx, bz = poly[1]
    return [round((ax + bx) / 2, 9), round((az + bz) / 2, 9)]


def _door_facing():
    parcel = {"footprint": _derived()}
    return round(blueprint._door_edge_bearing(parcel, _threshold()))


class _StubLibrary(blueprint_interiors.InteriorLibrary):
    def __init__(self, record):
        self.by_asset = {ASSET_REF: record}
        self.kit_of = {ASSET_REF: "settlement-stilt-v1"}


@pytest.fixture(autouse=True)
def default_index(monkeypatch):
    """Every test runs against an interiors index that DOES derive an entrance
    for the fixture's piece, on the side the fixture's door sits: the
    door-on-the-canonical-entrance rule (owner rulings 2026-09-05 / 2026-09-07)
    is exercised on purpose by the tests below, not incidentally by every other
    one. Tests that want a different index install it over this with
    `stub_index`."""
    record = {"interior": "shell", "sizeClass": "large", "planAreaM2": 186.94,
              "entrance": {"sideDeg": (_door_facing() - YAW_DEG) % 360.0, "arcM": 1.3,
                           "offsetM": [0.0, 3.2], "kind": "assembly"}}
    monkeypatch.setattr(blueprint_interiors, "library",
                        lambda *a, **k: _StubLibrary(record))


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
    """Hard again since 2026-09-05: the five live blueprints are re-authored
    against the Part 6 schema and the doors-and-interiors rulings."""
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

def _door_walk():
    """A boardwalk two metres in front of the door, square to the way it looks.

    The owner's ruling of 2026-09-05 makes a door that faces no way a hard
    failure, so the base fixture gives its one door something to open onto.
    Held as a boardwalk, not a route, so the tests that replace `routes` still
    have it."""
    import math
    th = _threshold()
    facing = math.radians(_door_facing())
    step = 2.0 / blueprint_footprints.PROVINCE_EXTENT_M
    ahead = (th[0] + step * math.sin(facing), th[1] - step * math.cos(facing))
    side = 6.0 / blueprint_footprints.PROVINCE_EXTENT_M
    way = {"id": "boardwalk.reed-cut-camp.door-walk", "kind": "boardwalk", "widthM": 1.5,
           "routing": "straight",
           "via": [[round(ahead[0] + side * math.cos(facing), 9), round(ahead[1] + side * math.sin(facing), 9)],
                   [round(ahead[0] - side * math.cos(facing), 9), round(ahead[1] - side * math.sin(facing), 9)]],
           "why": "The plank walk the hut's door steps onto, laid along the dry bank of the cut."}
    way["points"] = street_router.route_way(way, {}, None)
    return way


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
    space = {"id": "combat.reed-cut-camp.cut", "aroundIds": ["parcel.reed-cut-camp.hut"],
             "boundary": [[0.1, 0.1], [0.2, 0.1], [0.2, 0.2]],
             "clearanceClass": "open"}
    errs = blueprint.validate_blueprint(_bp(combatSpaces=[space]), KNOWN)
    assert any("why is required" in e for e in errs)
    space["why"] = "A raid on the camp is the tier-1 hostility flip, and this is the only open ground."
    good = _bp(combatSpaces=[space])
    blueprint_footprints.apply_area_boundaries(good)
    assert blueprint.validate_blueprint(good, KNOWN) == []


def test_parcel_spans_and_interior_are_typed():
    parcel = dict(_bp()["parcels"][0], spans=7, interior={"kind": "cellar"})
    errs = blueprint.validate_blueprint(_bp(parcels=[parcel]), KNOWN)
    assert any("spans must be a way id" in e for e in errs)
    assert any("interior.kind must be one of" in e for e in errs)
    ok = dict(_bp()["parcels"][0], spans="route.reed-cut-camp.cut-path",
              interior={"kind": "dwelling"},
              playerPurpose=[{"kind": "bed", "tier": "medium",
                              "note": "the bed the camp rents to a passing player"}])
    assert blueprint.validate_blueprint(_routed(_bp(parcels=[ok], routes=[_way()])), KNOWN) == []


# --------------------------------------------------------------------------- #
# Interiors and doors (owner ruling 2026-09-05). The index is DERIVED data, so
# these tests substitute a stub library rather than depending on which kit
# pieces happen to measure enclosed today — what is under test is the rule, not
# the measurement (that is pipeline/test_interiors_index.py's job).
# --------------------------------------------------------------------------- #
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


SHELL = {"interior": "shell", "sizeClass": "large", "planAreaM2": 186.94, "entrance": None}
MATCHED = {"interior": "matched", "sizeClass": "large", "planAreaM2": 186.94,
           "interiorAssetRef": "pool:arch/hut01_int",
           "entrance": {"sideDeg": 180.0, "arcM": 1.3, "kind": "opening"}}
ASSEMBLY = {"interior": "matched", "sizeClass": "large", "planAreaM2": 186.94,
            "interiorAssetRef": "pool:arch/hut01_int",
            "entrance": {"sideDeg": 180.0, "arcM": 1.3, "offsetM": [0.0, 3.2],
                         "kind": "assembly"}}
RADIAL = {"interior": "matched", "sizeClass": "large", "planAreaM2": 186.94,
          "interiorAssetRef": "pool:arch/hut01_int",
          "entrance": {"radial": True, "radiusM": 4.0, "arcM": 1.3, "kind": "assembly"}}
OPEN = {"interior": "none", "sizeClass": "large", "planAreaM2": 186.94, "entrance": None,
        "why": "open to the sky"}


def test_a_building_with_an_inside_must_have_a_door(stub_index):
    stub_index(ASSEMBLY)
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
    """The mesh's only entrance is at local 180°; with yaw 40° that is 220° in
    the world, so a door facing 40° is on the back wall."""
    stub_index(MATCHED)
    errs = blueprint.validate_blueprint(_bp(doors=[_door(
        facingDeg=YAW_DEG, interiorClaim=_claim(interiorRef="pool:arch/hut01_int"))]), KNOWN)
    assert any("does not sit on the canonical entrance" in e for e in errs)


def test_a_door_on_an_assembly_entrance_passes(stub_index):
    """The entrance a mined kit assembly puts a door part in is the one place a
    door may stand (owner ruling 2026-09-05)."""
    stub_index(ASSEMBLY)
    errs = blueprint.validate_blueprint(_bp(doors=[_door(
        facingDeg=(180.0 + YAW_DEG) % 360.0,
        interiorClaim=_claim(interiorRef="pool:arch/hut01_int"))]), KNOWN)
    # only the entrance rule is under test here: this door looks off the base
    # fixture's plank walk, which the door-on-way rule reports separately.
    assert not any("does not sit on the canonical entrance" in e for e in errs)


def test_a_piece_with_no_derived_entrance_may_not_carry_a_door(stub_index):
    stub_index(SHELL)
    errs = blueprint.validate_blueprint(_bp(), KNOWN)
    message = next(e for e in errs if "no derived entrance" in e)
    assert "use the composite that ships the door, or record a sourcing gap" in message


def test_a_piece_with_an_inside_and_no_entrance_fails_hard(stub_index):
    """Every enclosed piece in the index now carries a derived entrance, so a
    shell without one means a stale kit and the compile stops (owner ruling
    2026-09-05, restoring the hard gate)."""
    stub_index(SHELL)
    warnings = []
    errs = blueprint.validate_blueprint(_bp(doors=[]), KNOWN, warnings=warnings)
    assert any("its kit derives no entrance" in e for e in errs)
    assert not any("record a sourcing gap" in w for w in warnings)


def _radial_threshold(radius_m: float):
    """A threshold `radius_m` due east of the parcel centre."""
    cx, cz = CENTRE_UV
    return [round(cx + radius_m / blueprint_footprints.PROVINCE_EXTENT_M, 9), cz]


def test_a_radial_entrance_passes_on_the_ring_and_fails_off_it(stub_index):
    stub_index(RADIAL)
    ok = _door(facingDeg=90.0, thresholdUV=_radial_threshold(4.0),
               interiorClaim=_claim(interiorRef="pool:arch/hut01_int"))
    assert not any("canonical entrance" in e for e in
                   blueprint.validate_blueprint(_bp(doors=[ok]), KNOWN))
    off = _door(facingDeg=90.0, thresholdUV=_radial_threshold(6.5),
                interiorClaim=_claim(interiorRef="pool:arch/hut01_int"))
    errs = blueprint.validate_blueprint(_bp(doors=[off]), KNOWN)
    assert any("does not sit on the canonical entrance" in e and "radial ring" in e for e in errs)


def test_a_legacy_doorway_ref_is_stripped_rather_than_rewritten(stub_index):
    """There is one entrance now, so there is no index to record: `--doors`
    checks the door against it and drops the stale field (owner 2026-09-07)."""
    stub_index(ASSEMBLY)
    door = _door(facingDeg=(180.0 + YAW_DEG) % 360.0,
                 interiorClaim=_claim(interiorRef="pool:arch/hut01_int"))
    door["doorwayRef"] = 3
    bp = _bp(doors=[door])
    assert blueprint_footprints.apply_doors_to_blueprint(bp) == []
    assert "doorwayRef" not in bp["doors"][0]


def test_a_door_off_the_entrance_is_reported_by_the_doors_pass(stub_index):
    stub_index(ASSEMBLY)
    bp = _bp(doors=[_door(facingDeg=YAW_DEG,
                          interiorClaim=_claim(interiorRef="pool:arch/hut01_int"))])
    problems = blueprint_footprints.apply_doors_to_blueprint(bp)
    assert problems and "canonical entrance" in problems[0]


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


def test_area_boundaries_are_derived_compact_and_cannot_be_hand_edited():
    bp = _bp()
    district = bp["districts"][0]
    assert len(district["boundary"]) <= 8  # mitred buffer, not ~64 arc vertices
    district["boundary"][0][0] += 0.001
    errs = blueprint.validate_blueprint(bp, KNOWN)
    assert any("boundary is not the derived polygon" in e for e in errs)


def test_combat_space_around_ids_are_typed_geometry_refs():
    bp = _bp()
    bp["combatSpaces"][0]["aroundIds"] = ["parcel.reed-cut-camp.missing"]
    errs = blueprint.validate_blueprint(bp, KNOWN)
    assert any("aroundIds names unknown refs" in e for e in errs)


def test_area_derivation_clips_to_the_place_boundary():
    bp = _bp()
    blueprint_footprints.apply_area_boundaries(bp)
    outer = blueprint_footprints._polygon(bp["boundary"])
    assert outer.covers(blueprint_footprints._polygon(bp["districts"][0]["boundary"]))


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
    """97 C6 / C7 — warn-grade, with the number in the message.

    Measured over the BUILT hull (audit §6.3): the one-hut fixture draws a
    27 ha boundary round a camp of 0.05 ha, and judging a camp on the ground
    its approaches cross said nothing about the camp. Spread the same huts over
    a kilometre and the band bites.
    """
    errs, warns = blueprint.validate_blueprint_full(_bp(), KNOWN)
    assert errs == []
    assert not any("97 C6" in w for w in warns), warns
    assert all("97 C6" not in e for e in errs)

    spread = _yaw_parcels([0, 20, 45, 70, 100, 130, 165, 200, 240, 300])
    for i, parcel in enumerate(spread):
        u = 0.13 + i * 0.02          # ~150 m apart: a scatter, not a place
        parcel["centreUV"] = [u, 0.13]
        parcel["footprint"] = _derived(centre_uv=[u, 0.13], yaw=parcel["yawDeg"])
    errs2, warns2 = blueprint.validate_blueprint_full(
        _bp(boundary=[[0.1, 0.1], [0.4, 0.1], [0.4, 0.2], [0.1, 0.2]],
            parcels=spread, doors=[],
            scaleGrounding={**_bp()["scaleGrounding"], "buildingsPlanned": 10}), KNOWN)
    assert any("97 C6" in w and "built hull" in w for w in warns2), warns2
    assert all("97 C6" not in e for e in errs2)


def test_density_skips_a_lair_and_counts_no_props(monkeypatch):
    """97 C6 (decision 2026-09-07): the bands are settlement bands, and a rack
    or a notice board is dressing rather than a building."""
    record = {"id": "place.testreg.reed-cut-camp",
              "classification": {"class": "lair", "magnitude": "M2"}}
    monkeypatch.setattr(blueprint, "catalogue_records",
                        lambda: {"place.testreg.reed-cut-camp": record})
    spread = _yaw_parcels([0, 20, 45, 70, 100, 130, 165, 200, 240, 300])
    for i, parcel in enumerate(spread):
        u = 0.13 + i * 0.02
        parcel["centreUV"] = [u, 0.13]
        parcel["footprint"] = _derived(centre_uv=[u, 0.13], yaw=parcel["yawDeg"])
    _errs, warns = blueprint.validate_blueprint_full(
        _bp(parcels=spread, doors=[],
            scaleGrounding={**_bp()["scaleGrounding"], "buildingsPlanned": 10}), KNOWN)
    assert not any("97 C6" in w for w in warns), warns


def test_scale_grounding_counts_buildings_and_structures_not_props():
    """97 D7 / audit §6.5 — a stacked deck is the same structure seen from
    higher up, and a prop is dressing; neither is a second building."""
    hut = _bp()["parcels"][0]
    deck = dict(hut, id="parcel.reed-cut-camp.deck",
                stacksOn="parcel.reed-cut-camp.hut")
    errs = blueprint.validate_blueprint(
        _bp(parcels=[hut, deck], doors=[]), KNOWN)
    assert all("buildingsPlanned" not in e for e in errs), errs


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


def test_minor_waterways_are_addressable_as_terminal_routes():
    """97 C-stitch: a marsh village's landing may be a poling channel from
    `waterways-minor.json`, not only a major lane — so those ids are part of
    the province network the validator accepts (Phase 11 stream C)."""
    from . import province_network as pn
    ids = pn.route_ids()
    if not ids:
        pytest.skip("no published province network in this checkout")
    assert any(rid.startswith("waterway.") for rid in ids), (
        "no minor waterway ids in the network: province_network is not reading "
        "waterways-minor.json, so a poling lane cannot be a networkTerminals[] routeId"
    )


# --------------------------------------------------------------------------- #
# The door is the link to the interior (owner rulings 2026-09-05): the kit it
# names has to exist, and the doorway has to face the way the player arrives on.
# --------------------------------------------------------------------------- #
def test_interior_ref_must_name_a_kit_that_exists():
    bp = _bp()
    bp["doors"][0]["interiorClaim"]["interiorRef"] = "swamp-palace-int"
    errs = blueprint.validate_blueprint(bp, KNOWN)
    message = next(e for e in errs if "names no interior kit" in e)
    assert "config/kits" in message


def test_a_door_must_face_the_way_it_opens_onto():
    """60° is the ruling's allowance; a door turned away from its walk fails."""
    bp = _bp()
    parcel = bp["parcels"][0]
    parcel["yawDeg"] = (parcel["yawDeg"] + 120.0) % 360.0
    parcel["footprint"] = _derived(yaw=parcel["yawDeg"])
    bp["doors"][0]["facingDeg"] = (bp["doors"][0]["facingDeg"] + 120.0) % 360.0
    errs = blueprint.validate_blueprint(bp, KNOWN)
    assert any("door-on-way" in e and "the ruling allows" in e for e in errs)


def test_a_door_must_stand_at_the_way_it_opens_onto():
    bp = _bp()
    walk = bp["boardwalks"][0]
    walk["via"] = [[p[0] + 0.01, p[1] + 0.01] for p in walk["via"]]
    walk["points"] = street_router.route_way(walk, bp, None)
    errs = blueprint.validate_blueprint(bp, KNOWN)
    assert any("door-on-way" in e and "from the nearest way" in e for e in errs)


def test_orient_turns_a_parcel_until_its_doorway_faces_its_way():
    """--orient solves yaw from the doorway and the way, and leaves the why alone."""
    bp = _routed(_bp())
    blueprint_footprints.apply_doors_to_blueprint(bp)
    parcel = bp["parcels"][0]
    original_why = parcel["orientationWhy"]
    parcel["yawDeg"] = (parcel["yawDeg"] + 150.0) % 360.0
    parcel["footprint"] = _derived(yaw=parcel["yawDeg"])
    rows = blueprint_footprints.orient_blueprint(bp)
    assert len(rows) == 1 and rows[0]["moved"]
    assert rows[0]["wayId"] == "boardwalk.reed-cut-camp.door-walk"
    assert rows[0]["deltaDeg"] > 90.0
    assert parcel["orientationWhy"] == original_why
    # the doorway now looks at the walk: the bearing rule is satisfied (the
    # threshold's distance is a siting question the tool deliberately leaves)
    errs = blueprint.validate_blueprint(bp, KNOWN)
    assert not any("the ruling allows" in e for e in errs)
    # a second pass is a no-op: the parcel already faces its way
    assert blueprint_footprints.orient_blueprint(bp)[0]["moved"] is False


# --------------------------------------------------------------------------- #
# Review 2026-09-07: the CLI, the built-kit rule and the WARN-grade quality
# reports. Each is a paired fail/pass.
# --------------------------------------------------------------------------- #
def test_interior_ref_must_name_a_BUILT_kit(stub_index, monkeypatch):
    stub_index(SHELL)
    monkeypatch.setattr(blueprint, "kit_config_names", lambda: frozenset({"planned-int", "built-int"}))
    monkeypatch.setattr(blueprint, "built_kit_names", lambda: frozenset({"built-int"}))
    errs = blueprint.validate_blueprint(
        _bp(doors=[_door(interiorClaim=_claim(interiorRef="planned-int"))]), KNOWN)
    assert any("has a kit config but no BUILT kit" in e for e in errs)


def test_interior_ref_passes_when_the_kit_is_built(stub_index, monkeypatch):
    stub_index(SHELL)
    monkeypatch.setattr(blueprint, "kit_config_names", lambda: frozenset({"planned-int", "built-int"}))
    monkeypatch.setattr(blueprint, "built_kit_names", lambda: frozenset({"built-int"}))
    errs = blueprint.validate_blueprint(
        _bp(doors=[_door(interiorClaim=_claim(interiorRef="built-int"))]), KNOWN)
    assert not [e for e in errs if "BUILT kit" in e or "names no interior kit" in e]


def test_why_quality_warns_on_a_stub_why_and_on_a_repeated_one():
    short = dict(_bp()["parcels"][0], why=dict(_why(), microGeography="It sits there."))
    warns = blueprint._why_quality_warnings(_bp(parcels=[short]))
    assert any("under 40 characters" in w for w in warns)

    # the fixture's district and parcel already share one why block verbatim
    warns = blueprint._why_quality_warnings(_bp())
    assert any("appear on more than one record" in w for w in warns)


def _distinct_why_bp():
    """The fixture with the district's why rewritten, so no two records share
    a sentence — the clean case the report must stay silent on."""
    district = dict(_bp()["districts"][0], why={
        "what": "The whole camp, which is one hut, a drying frame and the cut below them.",
        "whyHere": "The district is the hummock; there is no other ground here to build on.",
        "whyNeighbours": "Nothing adjoins it, so the district's edge is the edge of the dry ground.",
        "playerPurpose": "The player crosses it in a minute and leaves knowing what a cut is.",
        "microGeography": "The hummock falls away to reed water on three of its four sides."})
    return _bp(districts=[district])


def test_why_quality_is_silent_on_distinct_full_sentences():
    assert blueprint._why_quality_warnings(_distinct_why_bp()) == []


def test_occupancy_warns_when_the_people_are_not_authored():
    thin = dict(_bp()["scaleGrounding"], npcsPlanned=20)
    warns = blueprint._occupancy_warnings(_bp(scaleGrounding=thin))
    assert warns and "only 1 occupant slot(s)" in warns[0] and "20" in warns[0]


def test_occupancy_is_silent_when_half_the_people_are_authored():
    assert blueprint._occupancy_warnings(_bp()) == []


def test_cli_accepts_check_and_id(capsys):
    assert blueprint.main(["--check"]) in (0, 1)
    assert blueprint.main(["--id", "no-such-place"]) == 2
    assert "no blueprint matches" in capsys.readouterr().err


# --------------------------------------------------------------------------- #
# A piece with no door still has a front: the side its authors left open (owner
# ruling + steer 2026-09-07). It must look at the line the player arrives on —
# HARD for an enclosure edge, WARN for the rest — and an enclosure edge must
# also face away from what the boundary encloses. Paired fail/pass throughout.
# --------------------------------------------------------------------------- #
FRONT_ASSET = "kit:wallgate01"


def _front_bp(yaw: float, use: str = "gate", way_pts=None) -> dict:
    """A square place with one piece on its EAST edge. Away from the middle is
    due east (90°), and the way runs east of the piece too, so a front of 90°
    satisfies both contracts and 270° breaks both."""
    return {
        "id": "place.testreg.walled",
        "boundary": [[0.10, 0.10], [0.20, 0.10], [0.20, 0.20], [0.10, 0.20]],
        "parcels": [{"id": "parcel.walled.gate", "use": use, "assetRef": FRONT_ASSET,
                     "yawDeg": yaw, "centreUV": [0.20, 0.15]}],
        "routes": [{"id": "route.walled.gate-road", "kind": "road", "widthM": 4.3,
                    "points": way_pts or [[0.22, 0.14], [0.22, 0.16]]}],
    }


@pytest.fixture()
def front_index(monkeypatch):
    def install(front):
        record = {"interior": "none", "entrance": None, "front": front}
        library = _StubLibrary(record)
        library.by_asset = {FRONT_ASSET: record}
        monkeypatch.setattr(blueprint_interiors, "library", lambda *a, **k: library)
    return install


def test_a_front_turned_away_from_the_approach_is_reported_with_the_yaw_to_take(front_index):
    front_index({"deg": 0.0, "evidence": "co-placement", "outside": True})
    hard, warn = blueprint._front_failures(_front_bp(yaw=270.0))
    assert any("the way the player arrives on" in m for m in warn)
    assert any("co-placement" in m for m in warn)


def test_a_front_looking_at_the_approach_passes(front_index):
    front_index({"deg": 0.0, "evidence": "co-placement", "outside": True})
    assert blueprint._front_failures(_front_bp(yaw=90.0)) == ([], [])


def test_an_ordinary_piece_only_warns_while_an_enclosure_edge_fails(front_index):
    """The approach is advice — how a piece is usually planted, not a law about
    this plot. What turns a wrong-way piece into a hard failure is being an
    enclosure edge, and it fails on the enclosure rule."""
    front_index({"deg": 0.0, "evidence": "asymmetry", "outside": True})
    hard, warn = blueprint._front_failures(_front_bp(yaw=270.0, use="shrine"))
    assert hard == [] and len(warn) == 1
    hard, warn = blueprint._front_failures(_front_bp(yaw=270.0, use="wall"))
    assert any("a gate or wall faces out" in m for m in hard)
    assert any("the way the player arrives on" in m for m in warn)


def test_a_piece_with_no_derived_front_may_take_any_yaw(front_index):
    """A symmetric tower: `front: null` is the right answer, not a gap."""
    front_index(None)
    assert blueprint._front_failures(_front_bp(yaw=270.0, use="tower")) == ([], [])


def test_an_enclosure_edge_must_face_away_from_what_the_boundary_encloses(front_index):
    """The rule reads the BOUNDARY, so it works for a lair or a shrine ring as
    well as a town. Here the way is moved inside the boundary, so the approach
    contract is satisfied and only the enclosure one can fail."""
    front_index({"deg": 0.0, "evidence": "co-placement", "outside": True})
    bp = _front_bp(yaw=270.0, way_pts=[[0.18, 0.14], [0.18, 0.16]])
    hard, _ = blueprint._front_failures(bp)
    assert any("away from what this place's boundary encloses" in m for m in hard)
    assert not any("the way the player arrives on" in m for m in hard)


def test_the_road_must_come_in_through_the_outside_of_a_gate(front_index):
    """The gate faces out and stands at its road, but the road it spans runs off
    WEST, behind it — so the arch is not what the player comes through."""
    front_index({"deg": 0.0, "evidence": "co-placement", "outside": True})
    bp = _front_bp(yaw=90.0)
    bp["parcels"][0]["spans"] = "route.walled.gate-road"
    bp["routes"][0]["points"] = [[0.20, 0.15], [0.05, 0.15]]
    hard, _ = blueprint._front_failures(bp)
    assert any("The road comes in through the outside of a gate" in m for m in hard)

    bp["routes"][0]["points"] = [[0.20, 0.15], [0.35, 0.15]]
    assert blueprint._front_failures(bp) == ([], [])


def test_a_way_that_only_ends_at_the_gate_sets_no_outer_side(front_index):
    """The road comes up to the arch from inside and stops: there is no outer
    end to face, so the enclosure rule is the whole contract."""
    front_index({"deg": 0.0, "evidence": "co-placement", "outside": True})
    bp = _front_bp(yaw=90.0)
    bp["parcels"][0]["spans"] = "route.walled.gate-road"
    bp["routes"][0]["points"] = [[0.20, 0.15], [0.05, 0.15]]
    assert blueprint._front_failures(bp)[0]           # crossing: the road is behind it
    bp["routes"][0]["endsAt"] = ["parcel.walled.gate"]
    assert blueprint._front_failures(bp) == ([], [])
