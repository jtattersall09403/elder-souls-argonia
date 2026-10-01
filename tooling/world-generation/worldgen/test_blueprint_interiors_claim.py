"""The tier A claim per door (decision 0103 decision 2): the fit rule, its
determinism, and that the pick follows the parcel's services."""

from __future__ import annotations

import copy
from pathlib import Path
import math

import pytest

from . import blueprint_interiors as bi


class _Lib:
    def __init__(self, records):
        self.records = records

    def get(self, asset_id):
        return self.records.get(asset_id)

    def __bool__(self):
        return True


def _cell(cell, pieces, placements=1):
    return {"plugin": "Test.esm", "interiorCell": cell,
            "pieces": [{"model": m, "count": n} for m, n in pieces],
            "placements": placements}


def _profile(plan=(10.0, 10.0), storeys=1, doors=(0.0,), interior_doors=0, heights=None):
    heights = heights or [0.0] * len(doors)
    return {"structuralPlanM": list(plan), "storeys": storeys, "interiorDoors": interior_doors,
            "exteriorDoors": [{"refId": f"D{i}", "bearingDeg": b, "positionM": [0.0, 0.0, heights[i]],
                               "arrivalMarker": {"positionM": [1.0, 2.0, 0.0], "yawDeg": b}}
                              for i, b in enumerate(doors)]}


BED = "vanilla:furniture/common/commonbed01"
HEARTH = "vanilla:clutter/woodfires/fireplacewood01burning"
COUNTER = "vanilla:clutter/counterset/counterstraight01"
SHRINE = "vanilla:clutter/shrines/shrinearkay"

LINKS = {"test:shell": [
    _cell("Home", [(BED, 2), (HEARTH, 1)], placements=2),
    _cell("Home2", [(BED, 1), (HEARTH, 1)], placements=2),
    _cell("Shop", [(COUNTER, 3), (BED, 1)], placements=1),
    _cell("Chapel", [(SHRINE, 1), (BED, 1)], placements=5),
    _cell("Tall", [(BED, 2), (HEARTH, 1)], placements=1),
    _cell("TwoDoors", [(BED, 2), (HEARTH, 1)], placements=1),
    _cell("Cellar", [(BED, 2), (HEARTH, 1)], placements=1),
    _cell("NoDoor", [(BED, 2), (HEARTH, 1)], placements=9),
]}
# Interior-to-interior doors are not counted (ruling 1): "Cellar" has one
# exterior door and a cellar door and still fits.
PROFILES = {"Home": _profile(), "Home2": _profile(), "Shop": _profile(), "Chapel": _profile(),
            "Tall": _profile(storeys=2),
            "TwoDoors": _profile(doors=(0.0, 180.0), heights=[3.4, 0.0]),
            "Cellar": _profile(interior_doors=1), "NoDoor": _profile(doors=())}
LIB = _Lib({"test:shell": {"planAreaM2": 100.0, "storeys": 1,
                           "entrance": {"kind": "esp-door", "sideDeg": 10.0}},
            "test:bare": {"planAreaM2": 50.0, "entrance": {"kind": "leaf"}}})


def PROFILE(plugin, cell, shell):
    return PROFILES[cell]


def _bp(services, asset="test:shell", use="dwelling"):
    return {"parcels": [{"id": "p1", "assetRef": asset, "use": use, "services": services}],
            "doors": [{"id": "d1", "parcelId": "p1",
                       "interiorClaim": {"sizeClass": "medium", "interiorRef": "kit-x"}}]}


def _claim(bp):
    rows = bi.claim_doors(bp, LIB, LINKS, PROFILE)
    return bp["doors"][0]["interiorClaim"], rows[0]


def test_fit_rule_rejects_ratio_and_too_few_doors():
    _claim_, row = _claim(_bp(["lodging"]))
    fails = {c["cellId"]: c["fails"] for c in row["candidates"]}
    # 0114: the plugin's link is the interior, taller than the shell or not
    assert fails["Tall"] == []
    # ruling 3 (round 3): more load doors than entrances is legal; the entrance
    # takes the ground-floor door and the upper one ships closed
    assert fails["TwoDoors"] == []
    two = next(c for c in row["candidates"] if c["cellId"] == "TwoDoors")
    assert [d["refId"] for d in two["doors"]] == ["D1"] and two["closedDoors"] == ["D0"]
    assert any("0 exterior load door(s), the shell has 1" in f for f in fails["NoDoor"])
    assert fails["Cellar"] == []
    # the use class ranks the passing cells, it never refuses one (0114)
    assert fails["Chapel"] == []


def test_pick_is_stable_across_runs_and_keeps_existing_fields():
    first, _ = _claim(_bp(["lodging"]))
    second, _ = _claim(_bp(["lodging"]))
    assert first == second
    # most-used cell wins the tie between the two dwellings (2 links each), then id
    assert first["tier"] == "A" and first["cellId"] == "Home" and first["plugin"] == "Test.esm"
    assert first["interiorLoadDoorRef"] == "D0"
    # the arrival marker is written in the game frame (x, z-up -> y, -y -> z)
    assert first["arrivalMarker"] == {"positionM": [1.0, 0.0, -2.0], "yawDeg": 0.0}
    assert first["interiorRef"] == "kit-x" and first["sizeClass"] == "medium"
    # a second run over an already-claimed door rewrites the same claim
    bp = _bp(["lodging"])
    _claim(bp)
    again = copy.deepcopy(bp)
    bi.claim_doors(again, LIB, LINKS, PROFILE)
    assert again == bp


def test_pick_changes_when_services_change():
    lodging, _ = _claim(_bp(["lodging"]))
    trader, _ = _claim(_bp(["trader"]))
    assert lodging["cellId"] == "Home"
    assert trader["cellId"] == "Shop"


def test_unserved_use_ranks_last_and_an_unlinked_shell_is_hollow():
    smith, _ = _claim(_bp(["smith"]))
    assert smith["tier"] == "A" and "serving" not in smith["why"]
    unlinked, _ = _claim(_bp([], asset="test:bare"))
    assert unlinked["tier"] == "none" and "no plugin gives test:bare a load door" in unlinked["why"]
    assert "cellId" not in unlinked and "interiorRef" not in unlinked


def test_use_class_classifier_on_labelled_cells():
    # labels written before the rule ran (16i item 4 classes)
    assert bi.cell_use_class([{"model": BED, "count": 2}, {"model": HEARTH, "count": 1}])[0] == "dwelling"
    assert bi.cell_use_class([{"model": BED, "count": 3}])[0] == "barracks"
    assert bi.cell_use_class([{"model": COUNTER, "count": 2}, {"model": BED, "count": 4}])[0] == "inn"
    assert bi.cell_use_class([{"model": COUNTER, "count": 2}])[0] == "shop"
    assert bi.cell_use_class([{"model": SHRINE, "count": 1}])[0] == "shrine"
    assert bi.cell_use_class([{"model": "vanilla:clutter/barrel01", "count": 4}])[0] == "storage"


def test_composite_inherits_its_base_shell():
    assert bi.composite_base("composite:farmhouse/farmhouse01-with-door") == \
        "vanilla:architecture/farmhouse/farmhouse01"


def test_two_door_shell_pairs_by_relative_bearing():
    from .interior_cells import pair_doors
    # shell entrances at 0 and 180; the cell (its own frame, turned 90) has
    # doors at 270 and 90: entrance 0 -> door index 1 (90), entrance 1 -> 0
    pick, why = pair_doors([0.0, 180.0], [270.0, 90.0])
    assert pick in ([1, 0], [0, 1]) and "worst 0" in why
    pick, why = pair_doors([0.0, 180.0], [10.0, 185.0])
    assert pick == [0, 1]


def test_pairing_refuses_a_90_degree_mismatch_and_too_few_doors():
    from .interior_cells import pair_doors
    pick, why = pair_doors([0.0, 180.0], [0.0, 90.0])
    assert pick is None and "90 deg off" in why
    pick, why = pair_doors([0.0, 180.0], [0.0])
    assert pick is None and "1 exterior load door(s)" in why
    # one entrance, two doors: the lowest door, the other left closed
    pick, why = pair_doors([0.0], [0.0, 180.0], [3.4, 0.0])
    assert pick == [1] and "1 load door(s) left closed" in why
    # two entrances, three doors: paired by bearing, one left over
    pick, why = pair_doors([0.0, 180.0], [0.0, 95.0, 180.0])
    assert pick == [0, 2] and "left closed" in why


def test_storeys_cluster_levels_more_than_2_4_m_apart():
    from .interior_cells import STOREY_GAP_M, storeys_from_levels
    assert STOREY_GAP_M == 2.4
    assert storeys_from_levels([0.0, 0.0, 0.3, 2.3]) == 1
    assert storeys_from_levels([0.0, 0.2, 3.1, 3.3]) == 2
    assert storeys_from_levels([]) == 0


def test_shell_and_cell_storey_gap_agree():
    import importlib.util
    path = bi.REPO_ROOT / "tooling" / "asset-pipeline" / "pipeline" / "interiors_index.py"
    text = path.read_text()
    from .interior_cells import STOREY_GAP_M
    assert f"STOREY_GAP_M = {STOREY_GAP_M}" in text


# --- the cell profile read from a plugin (rulings 1-3), on a fake plugin ---
class _FakePlugin:
    def source_of(self, form_id):
        return "Test.esm"


class _FakeWorld:
    """`interior_cells.PluginWorld`'s surface, over hand-made records."""

    def __init__(self, bases, refs, interior_refs):
        from types import SimpleNamespace
        self.main = _FakePlugin()
        self.name = "Test.esm"
        self._bases = {k: SimpleNamespace(type=t, model=m, bounds=b) for k, (t, m, b) in bases.items()}
        self.cells = {"Cell": refs}
        self.interior_refs = {("test.esm", fid) for fid in interior_refs}

    def base(self, form_id):
        return self._bases.get(form_id)

    def world_refs(self, keys):
        return {}


def _ref(fid, base, pos, rot=(0.0, 0.0, 0.0), teleport=None):
    from types import SimpleNamespace

    from .esp_index import UNITS_PER_METRE as u
    return SimpleNamespace(form_id=fid, base=base, pos=tuple(c * u for c in pos), rot=rot,
                           scale=1.0, teleport=(teleport, (0, 0, 0), (0, 0, 0)) if teleport else None)


def _units(*m):
    from .esp_index import UNITS_PER_METRE as u
    return tuple(int(round(v * u)) for v in m)


def test_profile_counts_only_exterior_doors_and_measures_structure_only():
    from . import interior_cells as ic
    bases = {
        1: ("STAT", "architecture/farmhouse/interior/farmintend01.nif", _units(-5, -4, 0, 5, 4, 7)),
        2: ("STAT", "architecture/farmhouse/interior/farmintfloor01.nif", _units(-5, -4, -0.2, 5, 4, 0.2)),
        3: ("STAT", "clutter/barrel01.nif", _units(-30, -30, 0, 30, 30, 3)),   # dressing, huge box
        4: ("DOOR", "architecture/farmhouse/farmhouseldoor01.nif", _units(-1, -0.2, 0, 1, 0.2, 2.5)),
    }
    refs = [
        _ref(10, 1, (0, 0, 0)),
        _ref(11, 2, (0, 0, 3.4)),                 # an upper floor 3.4 m up: storey 2
        _ref(12, 3, (40, 40, 0)),                 # dressing far away never widens the plan
        _ref(13, 4, (0, -4, 0), teleport=0x500),  # to the world
        _ref(14, 4, (4, 0, 0), teleport=0x600),   # to a cellar (an interior ref)
    ]
    world = _FakeWorld(bases, refs, interior_refs=[0x600])
    prof = ic.profile_cell(world, "Cell", "vanilla:architecture/farmhouse/farmhouse01")
    assert [d["refId"] for d in prof["exteriorDoors"]] == ["0000000D"]
    assert prof["interiorDoors"] == 1
    assert prof["structuralPlanM"] == pytest.approx([10.0, 8.0], abs=0.02)
    assert prof["storeys"] == 2
    assert prof["exteriorDoors"][0]["bearingDeg"] == 180.0


def test_room_is_the_enclosing_piece_and_what_overlaps_it_never_the_yard():
    """Ruling 1 (round 3): the room is the largest enclosing piece plus the
    pieces overlapping it; a modular neighbour that abuts it extends it, the
    stairs inside do not move its edge, the yard floor, a fence and the floor
    disc under the hut stay out."""
    from . import interior_cells as ic
    fam = "argonia/mudhuts/"
    bases = {
        1: ("STAT", fam + "smpodint02.nif", _units(-5, -5, 0, 5, 5, 8)),        # the room, 100 m2
        2: ("STAT", fam + "mudhutintstairs.nif", _units(-1, -1, 0, 1, 1, 3)),   # stairs, 3/4 inside
        3: ("STAT", fam + "floor02.nif", _units(-15, -15, -0.1, 15, 15, 0.0)),  # yard floor
        4: ("STAT", "architecture/farmhouse/fencewoven01.nif", _units(-1.5, -0.2, 0, 1.5, 0.2, 1.5)),
        5: ("STAT", fam + "manorint.nif", _units(0, -5, 0, 7, 5, 8)),           # abutting module, 70 m2
        6: ("STAT", fam + "roundfloor01.nif", _units(-20, -20, -3, 20, 20, 0)),  # floor disc under it
    }
    refs = [
        _ref(20, 1, (0, 0, 0)),
        _ref(21, 2, (4.5, 0, 0)),
        _ref(22, 3, (0, 0, 0)),
        _ref(23, 4, (0, 12, 0)),
        _ref(24, 5, (4.8, 0, 0)),
        _ref(25, 6, (0, 0, -0.5)),
    ]
    world = _FakeWorld(bases, refs, interior_refs=[])
    prof = ic.profile_cell(world, "Cell", "kotm:argonia/mudhuts/smpodext02")
    assert prof["roomSeed"] == fam + "smpodint02.nif"
    # x from -5 to 4.8 + 7 = 11.8, y -5..5; the stairs (to 5.5) sit inside the grown room
    assert prof["structuralPlanM"] == pytest.approx([16.8, 10.0], abs=0.02)


def test_room_is_measured_in_the_seed_pieces_own_frame():
    """Ruling 2 (interiors round 4): a room mesh turned 30 degrees in its cell
    is its own 10 x 6 m, not the 11.66 x 10.20 m box round its outline; the
    stairs turned with it stay inside, and the arrival bearing is read on the
    cell frame (a door due south of the room centre is at 180)."""
    import math

    from . import interior_cells as ic
    fam = "argonia/mudhuts/"
    bases = {
        1: ("STAT", fam + "smpodint02.nif", _units(-5, -3, 0, 5, 3, 8)),
        2: ("STAT", fam + "mudhutintstairs.nif", _units(-1, -1, 0, 1, 1, 3)),
        4: ("DOOR", "architecture/farmhouse/farmhouseldoor01.nif", _units(-1, -0.2, 0, 1, 0.2, 2.5)),
    }
    yaw = math.radians(30.0)
    refs = [_ref(20, 1, (0, 0, 0), rot=(0.0, 0.0, yaw)),
            _ref(21, 2, (3.0 * math.cos(yaw), -3.0 * math.sin(yaw), 0), rot=(0.0, 0.0, yaw)),
            _ref(22, 4, (0, -3.5, 0), teleport=0x500)]
    world = _FakeWorld(bases, refs, interior_refs=[])
    prof = ic.profile_cell(world, "Cell", "kotm:argonia/mudhuts/smpodext02")
    assert prof["structuralPlanM"] == pytest.approx([10.0, 6.0], abs=0.02)
    assert prof["structuralCentreM"] == pytest.approx([0.0, 0.0], abs=0.02)
    assert prof["exteriorDoors"][0]["bearingDeg"] == pytest.approx(180.0, abs=0.1)


# --- interiors round 4: placed scale, the band, the stable ---
def test_a_stable_is_reserved_to_the_stable_pool_and_claims_no_house():
    """Ruling 4 (round 4): no plugin authors a stable interior; and an
    open-fronted building with no interior has no door record (door-type
    ruling 2026-09-27), so the claim drops its door."""
    bp = _bp(["stable"], use="storage")
    door = bp["doors"][0]
    rows = bi.claim_doors(bp, LIB, LINKS, PROFILE)
    claim, row = door["interiorClaim"], rows[0]
    assert claim["tier"] == "reserved" and claim["pool"] == "stable"
    assert "cellId" not in claim and row["candidates"] == []
    assert row["doorType"] is None and bp["doors"] == []


def test_the_linked_shell_itself_is_never_part_of_the_room():
    """Ruling 3 (interiors round 5): 00MudHut01 places the exterior mudhut01
    inside its own cell; the room grows from the room mesh, never the shell."""
    from . import interior_cells as ic
    fam = "gv_meshes/argoniannest/"
    bases = {
        1: ("STAT", fam + "mudhut01intnew.nif", _units(-8, -6, 0, 8, 6, 5)),
        2: ("STAT", "meshes\\" + fam.replace("/", "\\") + "mudhut01.nif", _units(-9, -11, 0, 9, 11, 9)),
    }
    refs = [_ref(20, 1, (0, 0, 0)), _ref(21, 2, (0, 0, 0))]
    world = _FakeWorld(bases, refs, interior_refs=[])
    prof = ic.profile_cell(world, "Cell", "mudmother:gv_meshes/argoniannest/mudhut01")
    assert prof["roomSeed"] == fam + "mudhut01intnew.nif"
    assert prof["structuralPlanM"] == pytest.approx([16.0, 12.0], abs=0.02)


def _two_huts(prefer=None, first_prefers=False):
    bp = {"parcels": [{"id": "p1", "assetRef": "test:shell", "use": "dwelling"},
                      {"id": "p2", "assetRef": "test:shell", "use": "dwelling"}],
          "doors": [{"id": "d1", "parcelId": "p1", "interiorClaim": {}},
                    {"id": "d2", "parcelId": "p2", "interiorClaim": {}}]}
    if prefer:
        bp["doors"][0 if first_prefers else 1]["preferCell"] = {"cellId": prefer, "why": "story"}
    bi.claim_doors(bp, LIB, LINKS, PROFILE)
    return [d["interiorClaim"] for d in bp["doors"]]


def test_further_parcel_of_one_shell_takes_the_unused_cell_with_most_placements():
    # Home and Home2 both have 2 links; the first parcel takes Home (id), the
    # second the next free fitting cell, never the same room twice
    a, b = _two_huts()
    assert (a["cellId"], b["cellId"]) == ("Home", "Home2")
    assert "already furnished another building here" in b["why"]


def test_prefer_cell_is_honoured_when_it_fits_and_claims_first():
    # the second door asks for Home: it claims first, so the first parcel
    # takes the next free cell
    a, b = _two_huts(prefer="Home")
    assert (a["cellId"], b["cellId"]) == ("Home2", "Home")
    assert "chosen for this door: story" in b["why"]


def test_prefer_cell_that_does_not_fit_falls_back_to_the_rule():
    a, b = _two_huts(prefer="NoDoor", first_prefers=True)
    assert a["cellId"] == "Home" and "NoDoor was asked for but does not pass" in a["why"]
    assert b["cellId"] == "Home2"


def test_malformed_prefer_cell_is_an_error():
    bp = _bp(["lodging"])
    bp["doors"][0]["preferCell"] = "Home"
    with pytest.raises(ValueError, match="preferCell"):
        bi.claim_doors(bp, LIB, LINKS, PROFILE)


# 16k interiors r8 (3), the asset-aware fit rule (owner rule): a cell whose
# references need an asset that exists nowhere in the vault ranks below any
# fitting cell whose assets all resolve, and a cell is claimable only if its
# bundle passes the acceptance gate. The fixture is KeebaHouseCrafter's
# measured gaps (interiors r7): two `_resourcepack` modularrug01 references
# the vault holds nowhere, and boneflute01, whose Creation Club diffuse the
# vault holds nowhere, so it is in no published kit.
CRAFTER_GAPS = {"unsourced": ["_resourcepack/clutter/modular/modularrug01.nif"] * 2,
                "gate": ["3 references need a mesh no published kit holds: "
                         "_resourcepack/clutter/modular/modularrug01.nif, "
                         "argonia/clutter/boneflute01.nif"]}


def _sourcing(table):
    return lambda plugin, cell: table.get(cell, {"unsourced": [], "gate": []})


def test_a_cell_whose_bundle_fails_the_gate_is_not_claimable():
    # Home has the most-used tie-break, but its bundle fails the gate
    bp = _bp(["lodging"])
    rows = bi.claim_doors(bp, LIB, LINKS, PROFILE, sourcing=_sourcing({"Home": CRAFTER_GAPS}))
    claim = bp["doors"][0]["interiorClaim"]
    assert claim["cellId"] == "Home2"
    home = next(c for c in rows[0]["candidates"] if c["cellId"] == "Home")
    assert any("acceptance gate" in f for f in home["fails"])
    assert home["unsourced"] == CRAFTER_GAPS["unsourced"]


def test_an_unsourced_cell_ranks_below_a_fully_sourced_fitting_cell():
    # even with a gate that passes, the cell needing a vault-absent asset ranks
    # below every fitting cell whose assets all resolve
    gaps = {"Home": {"unsourced": CRAFTER_GAPS["unsourced"], "gate": []}}
    bp = _bp(["lodging"])
    bi.claim_doors(bp, LIB, LINKS, PROFILE, sourcing=_sourcing(gaps))
    assert bp["doors"][0]["interiorClaim"]["cellId"] == "Home2"


def test_prefer_cell_that_fails_the_gate_is_not_honoured():
    bp = _bp(["lodging"])
    bp["doors"][0]["preferCell"] = {"cellId": "Home", "why": "story"}
    bi.claim_doors(bp, LIB, LINKS, PROFILE, sourcing=_sourcing({"Home": CRAFTER_GAPS}))
    claim = bp["doors"][0]["interiorClaim"]
    assert claim["cellId"] == "Home2" and "Home was asked for but does not pass" in claim["why"]


def test_every_cell_failing_the_gate_reserves_the_door():
    table = {row["interiorCell"]: CRAFTER_GAPS for row in LINKS["test:shell"]}
    bp = _bp(["lodging"])
    bi.claim_doors(bp, LIB, LINKS, PROFILE, sourcing=_sourcing(table))
    claim = bp["doors"][0]["interiorClaim"]
    assert claim["tier"] == "reserved" and "acceptance gate" in claim["why"]


def test_an_unlinked_shell_is_hollow_and_keeps_its_promise():
    """0114: no plugin gives the shell a load door, so it has no interior and
    no prompt; a `promised` record keeps its Phase 12 promise in the why."""
    parcel = {"id": "p", "assetRef": "kotm:argonia/mudhuts/mudhut01"}
    lib = {"kotm:argonia/mudhuts/mudhut01": {"planAreaM2": 99.0, "interior": "promised",
                                             "promiseReason": "Phase 12 builds it"}}
    got = bi.claim_for_parcel(parcel, lib, {}, lambda *a: None)
    assert got["tier"] == "reserved" and got["pool"] == "phase-12"
    assert got["why"] == ("no plugin gives kotm:argonia/mudhuts/mudhut01 a load door, so it is a "
                          "hollow shell with no enter prompt; the interior its record promises is "
                          "built later")
    from .door_types import door_type
    assert door_type({"interiorClaim": {"tier": "reserved", "pool": "phase-12"}},
                     "kotm:argonia/mudhuts/mudhut01", frozenset()) == "hollow"
    assert door_type({"interiorClaim": {"tier": "reserved", "pool": "kotm"}},
                     "kotm:argonia/mudhuts/mudhut01", frozenset({"kotm:argonia/mudhuts/mudhut01"})) == "load"


# Planner ruling 2026-09-27 (16k walk 2 lane I): missing pieces count over
# clutter only. KotM's KeebaHouseElder misses HearthFires and Dragonborn bases
# (place-diag-kotm-cells.txt); unclassed or architecture misses make a cell unfit.
def test_a_cell_missing_architecture_or_unclassed_pieces_does_not_fit():
    for cls in ("architecture", "unclassed", "container"):
        gaps = {"Home": {"unsourced": ["x"], "misses": {cls: 1}, "gate": []}}
        bp = _bp(["lodging"])
        rows = bi.claim_doors(bp, LIB, LINKS, PROFILE, sourcing=_sourcing(gaps))
        assert bp["doors"][0]["interiorClaim"]["cellId"] == "Home2", cls
        home = next(c for c in rows[0]["candidates"] if c["cellId"] == "Home")
        assert any("no stand-in may replace" in f for f in home["fails"]), cls


def test_clutter_misses_rank_by_count():
    # every linked cell misses clutter; the one missing least is taken
    table = {row["interiorCell"]: {"unsourced": ["a", "b"], "misses": {"clutter": 2}, "gate": []}
             for row in LINKS["test:shell"]}
    table["Home2"] = {"unsourced": ["a"], "misses": {"clutter": 1}, "gate": []}
    bp = _bp(["lodging"])
    bi.claim_doors(bp, LIB, LINKS, PROFILE, sourcing=_sourcing(table))
    assert bp["doors"][0]["interiorClaim"]["cellId"] == "Home2"


def test_shell_swap_rewrites_interior_ref_and_size_class():
    """A door kept the old shell's interiorRef after a hut -> pod swap
    (GREENSPRING5); the claim now takes both from the parcel's piece."""
    lib = _Lib({**LIB.records, "test:shell": {**LIB.records["test:shell"],
                                              "tileset": "kit-pod", "sizeClass": "large"}})
    bp = _bp(["lodging"])
    bi.claim_doors(bp, lib, LINKS, PROFILE)
    claim = bp["doors"][0]["interiorClaim"]
    assert claim["interiorRef"] == "kit-pod" and claim["sizeClass"] == "large"


def test_claim_reexecs_itself_under_job_guard_once(monkeypatch):
    """`--claim` replaces itself with the same command inside job_guard.sh,
    and runs inline once it is there (ES_JOB_CORES is job_guard's export)."""
    from . import job_guard as jg
    execs = []
    monkeypatch.setattr(jg.os, "execvp", lambda f, a: execs.append(a))
    monkeypatch.delenv("ES_JOB_CORES", raising=False)
    jg.reexec_guarded("interiors-claim", "worldgen.blueprint_interiors", ["--claim", "x.json"])
    assert execs and execs[0][:4] == ["bash", str(jg.JOB_GUARD), "interiors-claim", "--"]
    assert execs[0][-4:] == ["-m", "worldgen.blueprint_interiors", "--claim", "x.json"]
    monkeypatch.setenv("ES_JOB_CORES", "2")
    jg.reexec_guarded("interiors-claim", "worldgen.blueprint_interiors", ["--claim", "x.json"])
    assert len(execs) == 1


# --------------------------------------------------------------------------- #
# walk 6 (owner 2026-09-30), decision 0114: the plugin data is the manifest
# --------------------------------------------------------------------------- #
ROUND_HUT = {"planAreaM2": 171.0, "storeys": 1, "storeyLevelsM": [0.0], "interior": "tileset",
             "tileset": "vanilla-farmhouse-int", "entrance": {"kind": "assembly", "sideDeg": 150.0}}
POD = {"planAreaM2": 150.8, "storeys": 1, "storeyLevelsM": [2.4, 4.0], "interior": "tileset",
       "tileset": "interior-kotm-v1", "entrance": {"kind": "esp-door", "sideDeg": 188.0, "heightM": 2.44}}
SWAMP_HOUSE = {"planAreaM2": 375.0, "storeys": 1, "storeyLevelsM": [6.0], "interior": "promised",
               "promiseReason": "no load door in any plugin",
               "entrance": {"kind": "approach", "sideDeg": 96.0}}
POD_LINKS = {"test:pod": [_cell("Loft", [(BED, 2), (HEARTH, 1)], placements=9),
                          _cell("PodCellar", [(BED, 1), (HEARTH, 1)])],
             # another shell's cells: never offered to the pod or the hut
             "test:other": [_cell("Elsewhere", [(BED, 1), (HEARTH, 1)], placements=50)]}
POD_PROFILES = {
    # a loft 3.1 m over the entry (the KotM Keeba pods, measured)
    "Loft": {**_profile(storeys=2, heights=[86.27]), "floorLevelsM": [81.3, 82.7, 85.8, 89.4]},
    # one floor at the entry and a cellar under it
    "PodCellar": {**_profile(storeys=2, heights=[3.5]), "floorLevelsM": [0.0, 0.2, 3.4, 3.5]},
    "Elsewhere": _profile(),
}
POD_LIB = _Lib({"test:pod": POD, "test:roundhut": ROUND_HUT, "test:swamphouse": SWAMP_HOUSE})


def _pod_claim(asset):
    return bi.claim_for_parcel({"id": "p1", "assetRef": asset, "use": "dwelling"}, POD_LIB,
                               POD_LINKS, lambda pl, c, sh: POD_PROFILES[c])


def test_a_pod_takes_its_plugins_cell_loft_or_not():
    got = _pod_claim("test:pod")
    fails = {c["cellId"]: c["fails"] for c in got["candidates"]}
    # 0114: the modder's link is the interior, loft or not; the most-used wins
    assert got["tier"] == "A" and got["cellId"] == "Loft", got
    assert "Elsewhere" not in fails                  # another shell's cell is never offered
    # a second pod of the place takes the unused linked cell before a repeat
    again = bi.claim_for_parcel({"id": "p2", "assetRef": "test:pod", "use": "dwelling"}, POD_LIB,
                                POD_LINKS, lambda pl, c, sh: POD_PROFILES[c], used={"Loft": 1})
    assert again["cellId"] == "PodCellar"


def test_a_shell_whose_linked_cells_all_fail_is_reserved_never_widened():
    links = {"test:pod": [POD_LINKS["test:pod"][0]], "test:other": POD_LINKS["test:other"]}
    got = bi.claim_for_parcel({"id": "p1", "assetRef": "test:pod", "use": "dwelling"}, POD_LIB,
                              links, lambda pl, c, sh: {**POD_PROFILES[c], "exteriorDoors": []})
    assert got["tier"] == "reserved" and "Loft: door pairing refused" in got["why"]
    assert [c["cellId"] for c in got["candidates"]] == ["Loft"]


def test_round_hut_and_swamp_house_no_plugin_links_are_hollow_with_no_prompt():
    from .door_types import door_type
    hut, house = _pod_claim("test:roundhut"), _pod_claim("test:swamphouse")
    assert hut["tier"] == "none" and "hollow shell" in hut["why"]
    assert house["tier"] == "reserved" and "record promises" in house["why"]
    assert door_type({"interiorClaim": {"tier": "none"}}, "test:swamphouse") == "hollow"


def test_an_unlinked_shell_walked_in_through_an_opening_has_no_door_record(monkeypatch):
    """No closed buildings, the open case (door_types rule 2): the BM&V swamp
    house (an `approach` opening, no door leaf, no plugin link) is walked
    into, so its door record is dropped; a door leaf on an unlinked shell
    stays a hollow (closed) door the gate refuses."""
    from . import door_types as dt
    lib = bi.InteriorLibrary(Path("/nonexistent"))
    lib.by_asset = {"test:swamphouse": {"entrance": {"kind": "approach", "rayConfirmed": True}},
                    "test:roundhut": {"entrance": {"kind": "esp-door"}}}
    monkeypatch.setattr(bi, "library", lambda kits_dir=None: lib)
    shells = frozenset({"test:shell"})
    assert dt.door_type({"interiorClaim": {"tier": "reserved", "pool": "phase-12"}},
                        "test:swamphouse", shells) is None
    assert dt.door_type({"interiorClaim": {"tier": "none"}}, "test:roundhut", shells) == "hollow"


def test_a_door_on_a_shell_no_plugin_links_is_a_closed_building_and_fails():
    """No closed buildings (0114 rule 3): hollow is a build error, not a state;
    a stale tier A claim on an unlinked shell fails too; an open front with no
    door record, and a linked shell, pass."""
    shells = frozenset({"test:shell"})
    bp = {"parcels": [{"id": "p.home", "assetRef": "test:shell"},
                      {"id": "p.hut", "assetRef": "test:roundhut"},
                      {"id": "p.stale", "assetRef": "test:swamphouse"}],
          "doors": [{"id": "d.home", "parcelId": "p.home", "interiorClaim": {"tier": "A"}},
                    {"id": "d.hut", "parcelId": "p.hut", "interiorClaim": {"tier": "none"}},
                    {"id": "d.stale", "parcelId": "p.stale",
                     "interiorClaim": {"tier": "A", "cellId": "Borrowed"}}]}
    lib = bi.InteriorLibrary(Path("/nonexistent"))
    lib.by_asset = {"test:roundhut": {"entrance": {"kind": "esp-door"}},
                    "test:swamphouse": {"entrance": {"kind": "approach", "rayConfirmed": True}}}
    got = bi.closed_shell_failures(bp, shells, lib)
    assert [line.split()[3] for line in got] == ["d.hut", "d.stale"]
    assert all(line.startswith("closed building: door") for line in got)
    # the doors dropped: the round hut still carries its plugin door leaf, so
    # it looks shut and opens nowhere (a closed building with no door record);
    # the swamp house's open front is walked into (open structure)
    bp["doors"] = bp["doors"][:1]
    got = bi.closed_shell_failures(bp, shells, lib)
    assert len(got) == 1 and got[0].startswith("closed building: p.hut")
    bp["parcels"] = [p for p in bp["parcels"] if p["id"] != "p.hut"]
    assert bi.closed_shell_failures(bp, shells, lib) == []


def test_a_socket_op_in_a_cell_no_door_claims_is_named():
    bp = {"doors": [{"id": "d1", "interiorClaim": {"tier": "A", "cellId": "Home"}},
                    {"id": "d2", "interiorClaim": {"tier": "reserved", "pool": "kotm"}}]}
    layout = {"ops": [{"op": "socket", "id": "s.home", "interiorCell": "Home"},
                      {"op": "socket", "id": "s.gone", "interiorCell": "Loft"},
                      {"op": "socket", "id": "s.out"}, {"op": "place", "id": "p", "interiorCell": "Loft"}]}
    assert bi.orphan_socket_ops(bp, layout) == [
        "socket op s.gone stands in Loft, which no door claims at tier A"]
