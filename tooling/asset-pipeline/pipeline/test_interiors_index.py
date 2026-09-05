"""Tests for the interiors index (owner ruling 2026-09-05, doors and interiors).

Geometry is synthesised here rather than read from a built kit: the point of
these tests is that the enclosure probe and the doorway finder answer correctly
for shapes whose answer we know, and a synthetic room is the only shape whose
answer we know exactly.
"""

from __future__ import annotations

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


def test_a_matched_sibling_beats_the_tileset_rule():
    tris = room()
    pools = {"vanilla": ["vanilla:architecture/farmhouse/farmhouse01",
                         "vanilla:architecture/farmhouse/farmhouse01_int"]}
    record = ix.classify_asset(
        {"id": "vanilla:architecture/farmhouse/farmhouse01", "category": "architecture"},
        "settlement-imperial-v1", _verts(tris), tris, pools)
    assert record["interior"] == "matched"
    assert record["interiorAssetRef"].endswith("_int")
    assert "tileset" not in record


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
