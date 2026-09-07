"""Tests for the interiors index (owner ruling 2026-09-05, doors and interiors).

Geometry is synthesised here rather than read from a built kit: the point of
these tests is that the enclosure probe and the doorway finder answer correctly
for shapes whose answer we know, and a synthetic room is the only shape whose
answer we know exactly.
"""

from __future__ import annotations

import json
import math

import numpy as np
import pytest

from pipeline import interiors_index as ix


# --------------------------------------------------------------------------- #
# synthetic geometry (GLB frame: y up, ground plane x/z)
# --------------------------------------------------------------------------- #
def _quad(a, b, c, d) -> list:
    return [[a, b, c], [a, c, d]]


def _wall(x0, z0, x1, z1, y0, y1) -> list:
    return _quad([x0, y0, z0], [x1, y0, z1], [x1, y1, z1], [x0, y1, z0])


def _slab(y, half=5.0) -> list:
    return _quad([-half, y, -half], [half, y, -half], [half, y, half], [-half, y, half])


def room(half: float = 5.0, ceiling: float = 3.0, roof: bool = True,
         door_at_x: float | None = None) -> np.ndarray:
    """A four-walled box with a floor, optionally a ceiling, optionally a door
    leaf set into the +x wall (a panel standing proud of the wall, which is how
    every closed exterior shell in our kits models its door)."""
    tris: list = []
    tris += _wall(-half, -half, half, -half, 0.0, ceiling)
    tris += _wall(half, -half, half, half, 0.0, ceiling)
    tris += _wall(half, half, -half, half, 0.0, ceiling)
    tris += _wall(-half, half, -half, -half, 0.0, ceiling)
    tris += _slab(0.0, half)
    if roof:
        tris += _slab(ceiling, half)
    if door_at_x is not None:
        tris += _wall(door_at_x, -0.6, door_at_x, 0.6, 0.0, 2.0)
    return np.asarray(tris, dtype=np.float64)


# --------------------------------------------------------------------------- #
# rule (a): matched interior siblings
# --------------------------------------------------------------------------- #
def test_matched_sibling_found_in_the_same_pool_and_directory():
    pools = {"htbm": [
        "htbm:architecture/villages/argonian/bamboohut01",
        "htbm:architecture/villages/argonian/bamboohut01_int",
        "htbm:architecture/villages/kothringi/bamboohut01_int",
    ]}
    got = ix.find_matched_interior("htbm:architecture/villages/argonian/bamboohut01", pools)
    assert got == "htbm:architecture/villages/argonian/bamboohut01_int"


def test_a_sibling_in_another_directory_is_not_a_match():
    pools = {"htbm": ["htbm:a/hut01", "htbm:b/hut01_int"]}
    assert ix.find_matched_interior("htbm:a/hut01", pools) is None


def test_an_interior_mesh_does_not_claim_an_interior_of_its_own():
    pools = {"p": ["p:a/hut01", "p:a/hut01_int", "p:a/hut01_interior"]}
    assert ix.find_matched_interior("p:a/hut01_int", pools) is None


# --------------------------------------------------------------------------- #
# rule (b): tileset prefixes
# --------------------------------------------------------------------------- #
def test_longest_tileset_prefix_wins():
    tileset, _ = ix.find_tileset("vanilla:architecture/farmhouse/farmhouse01")
    assert tileset == "vanilla-farmhouse-int"
    assert ix.find_tileset("vanilla:architecture/docks/dockstrsol01") is None


# --------------------------------------------------------------------------- #
# size classes (the numbers the blueprint validator quotes)
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("area,expected", [
    (0.0, "small"), (39.9, "small"), (40.0, "medium"),
    (119.9, "medium"), (120.0, "large"), (400.0, "large"),
])
def test_size_class_boundaries(area, expected):
    assert ix.size_class(area) == expected


# --------------------------------------------------------------------------- #
# the enclosure probe
# --------------------------------------------------------------------------- #
def test_a_roofed_box_is_an_enclosure():
    probe = ix.best_floor(room(), (0.0, 0.0), 0.0, 3.0)
    assert probe["ringFraction"] == 1.0
    assert probe["roof"] is True
    assert ix.is_enclosure(probe)


def test_an_unroofed_box_is_not_an_enclosure():
    probe = ix.best_floor(room(roof=False), (0.0, 0.0), 0.0, 3.0)
    assert probe["ringFraction"] == 1.0
    assert probe["roof"] is False
    assert not ix.is_enclosure(probe)


def test_a_crawl_space_under_a_deck_is_not_a_room():
    # 1.0 m of headroom: a plaza substructure, not a storey.
    probe = ix.best_floor(room(ceiling=1.0), (0.0, 0.0), 0.0, 1.0)
    assert not ix.is_enclosure(probe)


def test_the_stilt_storey_is_found_above_open_piles():
    """Piles from 0–4 m with the room on top: the ground-level probe stands in
    open air, so only the ladder search finds the deck."""
    piles = []
    for sx in (-4.0, 4.0):
        for sz in (-4.0, 4.0):
            piles += _wall(sx - 0.2, sz, sx + 0.2, sz, 0.0, 4.0)
    upper = room(ceiling=3.0)
    upper = upper + np.asarray([0.0, 4.0, 0.0])
    tris = np.vstack([np.asarray(piles, dtype=np.float64), upper])
    probe = ix.best_floor(tris, (0.0, 0.0), 0.0, 7.0)
    # the lowest rung whose eye clears the deck floor wins
    assert probe["floorOffsetM"] >= 3.0
    assert ix.is_enclosure(probe)


# --------------------------------------------------------------------------- #
# doorways
# --------------------------------------------------------------------------- #
def test_a_door_leaf_set_into_the_wall_is_found_on_the_side_it_is_on():
    doors, why = ix.doorways_from_probe(room(door_at_x=3.5), (0.0, 0.0), 0.0, 3.0)
    assert why is None
    assert len(doors) == 1
    # +x is east: bearing 90° in the local frame (north = 0, clockwise).
    assert abs(doors[0]["sideDeg"] - 90.0) <= 5.0
    assert ix.DOORWAY_MIN_ARC_M <= doors[0]["arcM"] <= ix.DOORWAY_MAX_ARC_M
    x, z = doors[0]["offsetM"]
    assert x == pytest.approx(3.5, abs=0.2) and abs(z) < 0.3


def test_a_blank_walled_box_yields_no_doorway_and_says_why():
    doors, why = ix.doorways_from_probe(room(), (0.0, 0.0), 0.0, 3.0)
    assert doors == []
    assert "no direction reads as a doorway" in why


def test_a_piece_with_no_wall_above_a_lintel_says_so():
    doors, why = ix.doorways_from_probe(room(ceiling=2.0), (0.0, 0.0), 0.0, 2.0)
    assert doors == []
    assert "no wall above a lintel" in why


def test_side_deg_uses_the_same_bearing_convention_as_yawDeg():
    """north = 0, clockwise; world axes x east, z south. The validator adds
    yawDeg to sideDeg, so this convention is load-bearing."""
    assert ix._bearing_deg(0.0, -1.0) == pytest.approx(0.0)     # north
    assert ix._bearing_deg(1.0, 0.0) == pytest.approx(90.0)     # east
    assert ix._bearing_deg(0.0, 1.0) == pytest.approx(180.0)    # south
    assert ix._bearing_deg(-1.0, 0.0) == pytest.approx(270.0)   # west


# --------------------------------------------------------------------------- #
# classification end to end
# --------------------------------------------------------------------------- #
def _verts(tris):
    return tris.reshape(-1, 3)


def test_a_roofed_shell_with_no_matched_interior_and_no_rule_is_a_shell():
    tris = room()
    record = ix.classify_asset({"id": "pool:arch/hut01", "category": "architecture"},
                               "settlement-mud-v1", _verts(tris), tris, {})
    assert record["interior"] == "shell"
    assert record["sizeClass"] == "medium"  # 100 m² box: 40–120 m²
    assert "enclose" in record["why"]


def test_a_matched_sibling_a_kit_packages_is_reported_against_that_kit():
    """The door must link to a BUILT interior kit, so a matched sibling that a
    kit packages reports as `tileset`, keeping the mesh in matchedInteriorMesh."""
    tris = room()
    pools = {"vanilla": ["vanilla:architecture/farmhouse/farmhouse01",
                         "vanilla:architecture/farmhouse/farmhouse01_int"]}
    record = ix.classify_asset(
        {"id": "vanilla:architecture/farmhouse/farmhouse01", "category": "architecture"},
        "settlement-imperial-v1", _verts(tris), tris, pools)
    assert record["interior"] == "tileset"
    assert record["tileset"] == "vanilla-farmhouse-int"
    assert record["matchedInteriorMesh"].endswith("_int")
    assert "interiorAssetRef" not in record


def test_a_matched_sibling_with_no_kit_rule_stays_matched():
    tris = room()
    pools = {"nokit": ["nokit:architecture/shack/shack01",
                       "nokit:architecture/shack/shack01_int"]}
    record = ix.classify_asset(
        {"id": "nokit:architecture/shack/shack01", "category": "architecture"},
        "settlement-imperial-v1", _verts(tris), tris, pools)
    assert record["interior"] == "matched"
    assert record["interiorAssetRef"].endswith("_int")
    assert "tileset" not in record


def test_the_hut_interiors_resolve_to_their_built_kits():
    tris = room()
    pools = {"mudmother": ["mudmother:gv_meshes/argoniannest/mudhut01",
                           "mudmother:gv_meshes/argoniannest/mudhut01intnew"]}
    record = ix.classify_asset(
        {"id": "mudmother:gv_meshes/argoniannest/mudhut01", "category": "architecture"},
        "settlement-mud-v1", _verts(tris), tris, pools)
    assert record["tileset"] == "mudmother-hut-int"
    htbm = "htbm:here there be monsters - curse of cipactli/architecture/villages/argonian/"
    pools = {"htbm": [htbm + "bamboohut01", htbm + "bamboohut01_int"]}
    record = ix.classify_asset(
        {"id": htbm + "bamboohut01", "category": "architecture"},
        "settlement-stilt-v1", _verts(tris), tris, pools)
    assert record["tileset"] == "htbm-hut-int"


def test_a_tileset_rule_applies_only_when_the_piece_measures_enclosed():
    tris = room(roof=False)
    record = ix.classify_asset(
        {"id": "vanilla:architecture/farmhouse/farmhouse01walkway", "category": "architecture"},
        "settlement-imperial-v1", _verts(tris), tris, {})
    assert record["interior"] == "none"
    assert ("open to the sky" in record["why"]) or ("not a building" in record["why"])  # a gate/walkway piece is excluded by name before it is measured


def test_a_boat_hull_is_never_a_building_however_it_measures():
    tris = room()
    record = ix.classify_asset({"id": "pool:dungeons/ships/shiprowboat01", "category": "dungeon-kit"},
                               "watercraft-v1", _verts(tris), tris, {})
    assert record["interior"] == "none"
    assert "ship" in record["why"]


def test_interior_kits_never_claim_an_interior():
    record = ix.classify_asset({"id": "pool:ar/arcorridor01", "category": "ruin"},
                               "xanmeer-interior-v1", None, None, {})
    assert record["interior"] == "none"
    assert record["doorways"] == []


def test_a_prop_is_too_small_to_hold_an_interior():
    tris = room(half=0.5, ceiling=0.6)
    record = ix.classify_asset({"id": "pool:clutter/urn01", "category": "container"},
                               "works-v1", _verts(tris), tris, {})
    assert record["interior"] == "none"
    assert "too small" in record["why"]


def test_classification_is_deterministic():
    tris = room(door_at_x=3.5)
    asset = {"id": "pool:arch/hut01", "category": "architecture"}
    first = ix.classify_asset(asset, "settlement-mud-v1", _verts(tris), tris, {})
    second = ix.classify_asset(asset, "settlement-mud-v1", _verts(tris), tris, {})
    assert first == second


def test_the_local_doorway_bearing_rotates_with_yaw_the_way_the_validator_assumes():
    """A parcel's world facing is sideDeg + yawDeg. Rotating the mesh by yaw and
    re-measuring must give the same answer, or the validator's check is wrong."""
    yaw = 90.0
    tris = room(door_at_x=3.5)
    theta = math.radians(yaw)
    rot = np.asarray([[math.cos(theta), 0.0, -math.sin(theta)],
                      [0.0, 1.0, 0.0],
                      [math.sin(theta), 0.0, math.cos(theta)]])
    turned = tris @ rot.T
    plain, _ = ix.doorways_from_probe(tris, (0.0, 0.0), 0.0, 3.0)
    spun, _ = ix.doorways_from_probe(turned, (0.0, 0.0), 0.0, 3.0)
    delta = (spun[0]["sideDeg"] - plain[0]["sideDeg"]) % 360.0
    assert min(delta, 360.0 - delta) == pytest.approx(yaw, abs=5.0)


# --------------------------------------------------------------------------- #
# the join: doorways mined from source placements (kit-assemblies-mined.json)
# --------------------------------------------------------------------------- #
def _mined_fixed(count: int = 16) -> dict:
    """One mined door: a separate leaf placed at x -2.45, y 1.4 in the shell's
    own z-up frame, which is bearing 299.7 deg and plan offset [-2.45, -1.4]."""
    return {
        "kind": "fixed",
        "doorAsset": "htbm:architecture/villages/argonian/bamboohutdoor01",
        "doorPiece": "bamboohutdoor01",
        "offsetLocalM": [-2.45, 1.4, 0.0],
        "radiusM": 2.82,
        "yawDeg": 120.0,
        "sideDeg": 299.75,
        "count": count,
    }


def _mined_radial() -> dict:
    return {
        "kind": "radial",
        "doorAsset": "vanilla:dungeons/nordic/doors/animated/mediumdoor/ruinsmediumdoorload01",
        "doorPiece": "ruinsmediumdoorload01",
        "offsetLocalM": None,
        "radiusM": 0.48,
        "yawDeg": 358.7,
        "sideDeg": None,
        "count": 4,
    }


def test_a_mined_door_converts_to_the_index_plan_frame():
    entry = ix.assembly_doorway_entries([_mined_fixed()])[0]
    # z-up (x, y) -> GLB plan (x, -y); the bearing is the same angle either way.
    assert entry["offsetM"] == [-2.45, -1.4]
    assert entry["sideDeg"] == pytest.approx(299.75)
    assert entry["doorwaySource"] == "assembly"
    assert entry["count"] == 16
    assert "arcM" not in entry


def test_a_radial_mined_door_commits_to_a_radius_but_not_a_bearing():
    entry = ix.assembly_doorway_entries([_mined_radial()])[0]
    assert entry["radial"] is True
    assert entry["radiusM"] == pytest.approx(0.48)
    assert "sideDeg" not in entry
    assert "offsetM" not in entry


def test_mined_doors_are_sorted_by_how_often_the_authors_placed_them():
    doors = [_mined_fixed(4), _mined_fixed(30)]
    counts = [e["count"] for e in ix.assembly_doorway_entries(doors)]
    assert counts == [30, 4]


def test_a_blank_shell_takes_its_doorway_from_the_mined_assembly():
    record = ix.classify_asset(
        {"id": "htbm:architecture/villages/argonian/bamboohut01", "category": "architecture"},
        "settlement-stilt-v1",
        _verts(room()), room(), {},
        [_mined_fixed()],
    )
    assert record["interior"] == "shell"
    assert record["doorwaySource"] == "assembly"
    assert record["doorways"][0]["offsetM"] == [-2.45, -1.4]
    assert "bamboohutdoor01" in record["doorwaysWhy"]


def test_a_measured_opening_beats_the_mined_one_and_keeps_it_as_corroboration():
    record = ix.classify_asset(
        {"id": "htbm:architecture/villages/argonian/bamboohut01", "category": "architecture"},
        "settlement-stilt-v1",
        _verts(room(door_at_x=3.5)), room(door_at_x=3.5), {},
        [_mined_fixed()],
    )
    assert record["doorwaySource"] == "geometry"
    assert record["doorways"][0].get("arcM")            # the measured one
    assert record["doorwaysCorroboration"][0]["count"] == 16


def test_a_walkway_never_takes_a_mined_door():
    record = ix.classify_asset(
        {"id": "bmv:architecture/citebosmer/passerelles/troncons/passl128i01",
         "category": "architecture"},
        "settlement-stilt-v1",
        _verts(room(roof=False)), room(roof=False), {},
        [_mined_fixed()],
    )
    assert record["interior"] == "none"
    assert record["doorways"] == []
    assert record.get("doorwaySource") is None


def test_a_composite_takes_the_doors_its_anchor_was_mined_with(tmp_path):
    (tmp_path / "settlement-stilt-v1.json").write_text(json.dumps({"assets": [
        {"asset": "htbm:hut01"},
        {"asset": "composite:stilt/hut01-with-door", "compose": {"parts": [
            {"asset": "htbm:hut01"}, {"asset": "htbm:hutdoor01"}]}},
    ]}))
    parts = ix.composite_parts("settlement-stilt-v1", tmp_path)
    assert parts["composite:stilt/hut01-with-door"] == ["htbm:hut01", "htbm:hutdoor01"]
    mined = {"htbm:hut01": [
        {**_mined_fixed(), "doorAsset": "htbm:hutdoor01"},
        {**_mined_fixed(), "doorAsset": "htbm:someotherdoor"},
    ]}
    doors = ix.composite_doorways(parts["composite:stilt/hut01-with-door"], mined)
    assert [d["doorAsset"] for d in doors] == ["htbm:hutdoor01"]


def test_a_composite_that_carries_no_door_piece_gets_no_doorway(tmp_path):
    mined = {"vanilla:block01": [_mined_fixed()]}
    assert ix.composite_doorways(["vanilla:block01", "vanilla:block01"], mined) == []


# --------------------------------------------------------------------------- #
# criterion 5: a closed prop is not a room (front faces)
# --------------------------------------------------------------------------- #
def closed_box(half: float = 3.0, top: float = 4.0) -> np.ndarray:
    """A solid-looking prop: a box wound so every face points OUTWARD, which is
    what every closed game mesh is. An eye dropped inside it sees only back
    faces — a plinth, a pool basin, a stair block, a tower mass."""
    tris: list = []
    tris += _quad([-half, 0.0, -half], [half, 0.0, -half], [half, top, -half], [-half, top, -half])
    tris += _quad([half, 0.0, half], [-half, 0.0, half], [-half, top, half], [half, top, half])
    tris += _quad([-half, 0.0, half], [-half, 0.0, -half], [-half, top, -half], [-half, top, half])
    tris += _quad([half, 0.0, -half], [half, 0.0, half], [half, top, half], [half, top, -half])
    tris += _quad([-half, top, -half], [half, top, -half], [half, top, half], [-half, top, half])
    tris += _quad([-half, 0.0, half], [half, 0.0, half], [half, 0.0, -half], [-half, 0.0, -half])
    # wound so the normals point AWAY from the middle: `_quad` builds its
    # triangles the other way round, so the whole box is flipped once here.
    return _flip(np.asarray(tris, dtype=np.float64))


def _flip(tris: np.ndarray) -> np.ndarray:
    """The same surface wound the other way."""
    return tris[:, ::-1, :].copy()


def test_a_closed_prop_read_from_inside_is_not_an_enclosure():
    probe = ix.probe_from_inside(closed_box(), (0.0, 0.0), 1.6)
    assert probe["ringFraction"] == 1.0          # it has the SHAPE of a room
    assert probe["frontFaceFraction"] == 0.0     # ...but every face looks away
    assert not ix.is_enclosure(probe)
    assert ix.encloses_shape(probe)


def test_the_same_box_wound_inward_is_a_room():
    probe = ix.probe_from_inside(_flip(closed_box()), (0.0, 0.0), 1.6)
    assert probe["frontFaceFraction"] == 1.0
    assert ix.is_enclosure(probe)


def test_a_closed_prop_is_demoted_with_a_why_that_names_the_criterion():
    verts = closed_box().reshape(-1, 3)
    record = ix.classify_asset({"id": "mwkeep:keep/exterior/mwimparchpool01",
                                "category": "architecture"},
                               "imperial-keep", verts, closed_box(), {})
    assert record["interior"] == "none"
    assert record["frontFaceFraction"] == 0.0
    assert "closed prop seen from inside" in record["why"]


def test_a_closed_shell_with_a_door_piece_placed_on_it_is_still_a_building():
    """Criterion 5 demotes a closed shell only when NOTHING says it has a door.
    A shell the source authors repeatedly hung a door on is a building whose
    door happens to be a separate mesh."""
    verts = closed_box().reshape(-1, 3)
    doors = [{"kind": "fixed", "doorAsset": "mwkeep:door01", "doorPiece": "door01",
              "offsetLocalM": [3.0, 0.0, 0.0], "radiusM": 3.0, "riseM": 0.0, "sideDeg": 90.0,
              "yawDeg": 0.0, "count": 7}]
    record = ix.classify_asset({"id": "mwkeep:keep/exterior/mwimparchkeep01",
                                "category": "architecture"},
                               "imperial-keep", verts, closed_box(), {}, doors)
    assert record["interior"] == "tileset"
    assert record["closedShellPromotedBy"] == "door-piece"
    assert record["doorways"]


# --------------------------------------------------------------------------- #
# mechanism 2: open fronts
# --------------------------------------------------------------------------- #
def open_fronted_shed(half: float = 4.0, ceiling: float = 3.0) -> np.ndarray:
    """Three walls and a roof, with the whole +z side open: a stable, a cart
    shed, a veranda. Wider than a door, and still the way in."""
    tris: list = []
    tris += _wall(half, -half, -half, -half, 0.0, ceiling)
    tris += _wall(-half, -half, -half, half, 0.0, ceiling)
    tris += _wall(half, half, half, -half, 0.0, ceiling)
    tris += _slab(ceiling, half)
    tris += _slab(0.0, half)
    return np.asarray(tris, dtype=np.float64)


def test_an_open_front_wider_than_a_door_is_still_an_entrance():
    tris = open_fronted_shed()
    doors, why = ix.doorways_from_probe(tris, (0.0, 0.0), 0.0, 3.0)
    assert why is None
    assert doors, "the open side must be reported as a way in"
    front = doors[0]
    assert front["kind"] == "open-front"
    assert front["arcM"] > ix.DOORWAY_MAX_ARC_M
    assert abs(front["sideDeg"] - 180.0) <= 15.0     # +z is bearing 180


# --------------------------------------------------------------------------- #
# mechanism 3: a door leaf modelled into the shell
# --------------------------------------------------------------------------- #
def shell_with_baked_leaf(half: float = 4.0, ceiling: float = 3.2,
                          proud: float = 0.25) -> np.ndarray:
    """A closed room whose door is modelled shut: a door-sized panel standing
    `proud` metres in front of the +x wall, from the floor to 2.1 m."""
    tris = list(_flip(room(half=half, ceiling=ceiling)))
    x = half - proud
    tris += _wall(x, -0.5, x, 0.5, 0.0, 2.1)
    return np.asarray(tris, dtype=np.float64)


def test_the_leaf_pass_finds_a_door_modelled_shut_into_the_wall():
    doors = ix.leaf_doorways(shell_with_baked_leaf(), (0.0, 0.0), 0.0, 3.2)
    assert doors, "a leaf standing proud of its wall must read as a doorway"
    leaf = doors[0]
    assert leaf["kind"] == "leaf"
    assert ix.LEAF_MIN_ARC_M <= leaf["arcM"] <= ix.LEAF_MAX_ARC_M
    assert abs(leaf["sideDeg"] - 90.0) <= 15.0       # +x is bearing 90


def test_a_blank_wall_has_no_leaf():
    assert ix.leaf_doorways(_flip(room(half=4.0, ceiling=3.2)), (0.0, 0.0), 0.0, 3.2) == []


# --------------------------------------------------------------------------- #
# mechanism 4: the door piece the family authored for the shell
# --------------------------------------------------------------------------- #
def test_a_door_piece_fitted_to_the_shell_wall_becomes_the_doorway():
    record = {"interior": "tileset",
              "_probe": {"centre": [0.0, 0.0], "floorY": 0.0, "roomH": 3.0,
                         "ring": [4.0] * ix.BINS}}
    bounds = {"pool:set/doorpiece01": ((-0.6, 0.0, 3.8), (0.6, 2.2, 4.1)),
              "pool:set/roofpiece01": ((-4.0, 3.0, -4.0), (4.0, 3.4, 4.0))}
    doors = ix.door_piece_doorways(record, "pool:set/shell01", bounds)
    assert len(doors) == 1
    assert doors[0]["doorAsset"] == "pool:set/doorpiece01"
    assert doors[0]["fitM"] <= ix.DOOR_PIECE_FIT_M
    assert abs(doors[0]["sideDeg"] - 180.0) <= 10.0


def test_a_door_piece_that_does_not_reach_the_wall_is_not_this_shell_s_door():
    record = {"interior": "tileset",
              "_probe": {"centre": [0.0, 0.0], "floorY": 0.0, "roomH": 3.0,
                         "ring": [4.0] * ix.BINS}}
    bounds = {"pool:set/doorpiece01": ((-0.6, 0.0, 8.0), (0.6, 2.2, 8.3))}
    assert ix.door_piece_doorways(record, "pool:set/shell01", bounds) == []


# --------------------------------------------------------------------------- #
# the interior link has to resolve to a kit we can actually build
# --------------------------------------------------------------------------- #
def test_every_tileset_rule_names_a_kit_config_that_exists():
    """Owner ruling 2026-09-05: the door teleports the player into the interior,
    so a building's interior link is only real if the kit behind it exists."""
    missing = sorted({tileset for _, tileset, _ in ix.TILESET_RULES
                      if not (ix.KIT_CONFIG_DIR / f"{tileset}.json").exists()})
    assert not missing, f"tileset rules name kits with no config: {missing}"


def test_every_tileset_a_built_kit_records_resolves_to_a_kit_config():
    from pipeline.measure_footprints import KITS_DIR
    missing: dict[str, str] = {}
    for path in sorted(KITS_DIR.glob("*.interiors.json")):
        for asset_id, record in json.loads(path.read_text())["assets"].items():
            tileset = record.get("tileset")
            if tileset and not (ix.KIT_CONFIG_DIR / f"{tileset}.json").exists():
                missing[asset_id] = tileset
    assert not missing, f"interior links with no kit config: {missing}"


def test_no_built_kit_leaves_a_building_without_a_doorway_or_an_interior():
    """The owner's finish line: an enclosed piece has a way in AND somewhere to
    go. `shell` is not an answer — it means nobody has claimed the interior."""
    from pipeline.measure_footprints import KITS_DIR
    doorless: list[str] = []
    unlinked: list[str] = []
    for path in sorted(KITS_DIR.glob("*.interiors.json")):
        for asset_id, record in json.loads(path.read_text())["assets"].items():
            if record.get("interior") not in ix.BUILDING_INTERIORS:
                continue
            if not record.get("doorways"):
                doorless.append(asset_id)
            if not (record.get("tileset") or record.get("interiorAssetRef")):
                unlinked.append(asset_id)
    assert not doorless, f"enclosed pieces with no doorway: {doorless}"
    assert not unlinked, f"enclosed pieces with no interior kit: {unlinked}"
