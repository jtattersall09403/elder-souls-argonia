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
         door_at_x: float | None = None, hole_east: bool = False,
         sill: float = 0.0) -> np.ndarray:
    """A four-walled box with a floor, optionally a ceiling, optionally a door
    leaf set into the +x wall (a panel standing proud of the wall, which is how
    every closed exterior shell in our kits models its door)."""
    tris: list = []
    tris += _wall(-half, -half, half, -half, 0.0, ceiling)
    if hole_east:
        # a real opening in the +x wall: 1.2 m wide, sill `sill`, 2.2 m clear
        top = sill + 2.2
        tris += _wall(half, -half, half, -0.6, 0.0, ceiling)
        tris += _wall(half, 0.6, half, half, 0.0, ceiling)
        tris += _wall(half, -0.6, half, 0.6, top, ceiling)
        if sill > 0:
            tris += _wall(half, -0.6, half, 0.6, 0.0, sill)
    else:
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


#: the kinds that MEASURE an opening in the shell's own mesh; `esp-door` and
#: `assembly` carry the door reference's own authored facing instead
MEASURED_OPENING_KINDS = ("opening", "open-front", "leaf", "door-piece")
SIDE_AGREEMENT_DEG = 30.0


def test_a_measured_entrance_s_side_is_the_bearing_of_its_offset():
    """K5 (2026-09-23): an entrance holds ONE measured opening. Its `sideDeg`
    agrees within 30 deg with the bearing of its `offsetM` from the plan centre
    (`planCentreM`), whichever point the probe stood on. The stilt house read
    142.5 deg from an off-centre probe while its offset lay at ~0 deg."""
    tracked = ix.REPO_ROOT / "world" / "sources" / "placement" / "kit-interiors"
    checked, bad = 0, []
    for path in sorted(tracked.glob("*.interiors.json")):
        for asset_id, record in json.loads(path.read_text())["assets"].items():
            e = record.get("entrance") or {}
            if e.get("kind") not in MEASURED_OPENING_KINDS or not e.get("offsetM"):
                continue
            cx, cz = record["planCentreM"]
            bearing = ix._bearing_deg(e["offsetM"][0] - cx, e["offsetM"][1] - cz)
            off = abs((float(e["sideDeg"]) - bearing + 180.0) % 360.0 - 180.0)
            checked += 1
            if off > SIDE_AGREEMENT_DEG:
                bad.append(f"{path.name} {asset_id}: sideDeg {e['sideDeg']} vs offset "
                           f"bearing {bearing:.1f} ({off:.0f} deg)")
    assert checked
    assert bad == []


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


@pytest.mark.parametrize("category", ["effect", "rock", "plant", "shrub", "fungus", None])
def test_only_a_building_category_can_be_a_building_however_it_measures(category):
    """A waterfall body sheet curls round like a room (fxwaterfallbodyslope,
    waterfall-fx-v1, 2026-09-23): the categories that may be a building are an
    allow-list, so a category nobody listed can never become a house."""
    tris = room()
    asset = {"id": "vanilla:effects/fxwaterfallbodyslope"}
    if category:
        asset["category"] = category
    record = ix.classify_asset(asset, "waterfall-fx-v1", _verts(tris), tris, {})
    assert record["interior"] == "none"
    assert "never a building" in record["why"]


def test_a_composite_is_banned_by_its_anchor_name_not_its_own_id():
    """Walk 2 lane P (planner 2026-09-27): `farmhouse02-with-walkway` is the
    farmhouse with its deck walkway, so the name ban reads its ANCHOR piece
    (part 0, `farmhouse02`), never the composite id's `walkway` token."""
    tris = room()
    record = ix.classify_asset(
        {"id": "composite:farmhouse/farmhouse02-with-walkway", "category": "architecture"},
        "settlement-imperial-v1", _verts(tris), tris, {},
        anchor_id="vanilla:architecture/farmhouse/farmhouse02")
    assert record["interior"] == "tileset"
    assert record["tileset"] == "vanilla-farmhouse-int"
    # and an anchor whose own name is a non-building still bans the composite
    record = ix.classify_asset(
        {"id": "composite:docks/quay-run-2", "category": "architecture"},
        "settlement-imperial-v1", _verts(tris), tris, {},
        anchor_id="pool:architecture/docks/walkwaystr01")
    assert record["interior"] == "none"
    assert "name token" in record["why"]


@pytest.mark.parametrize("asset_id", [
    "hlaalu:hlaaluarchitecture/hammerfell/trgmbridge02",
    "hlaalu:hlaaluarchitecture/hammerfell/trgmcoverstairs",
])
def test_a_compound_name_ending_in_a_non_building_noun_is_not_a_building(asset_id):
    """`trgm` + `bridge`: the head noun ends the segment (2026-09-23)."""
    tris = room()
    record = ix.classify_asset({"id": asset_id, "category": "misc"},
                               "hlaalu-domestic", _verts(tris), tris, {})
    assert record["interior"] == "none"
    assert "name token" in record["why"]


def test_an_exact_asset_tileset_rule_outranks_the_name_token():
    """The Hist trunk is authored by its own id as a way into the root dungeon
    (TILESET_RULES); a name heuristic may not overrule a row naming the piece."""
    tris = room()
    record = ix.classify_asset({"id": "mudmother:gv_meshes/argoniannest/histtree",
                                "category": "misc"},
                               "settlement-root-v1", _verts(tris), tris, {})
    assert record["interior"] == "tileset"
    assert record["tileset"] == "dungeon-root-v1"


@pytest.mark.parametrize("category", sorted(ix.BUILDING_CATEGORIES))
def test_a_building_category_that_encloses_is_a_building(category):
    tris = room(door_at_x=3.5)
    record = ix.classify_asset({"id": "pool:arch/hut01", "category": category},
                               "settlement-stilt-v1", _verts(tris), tris, {})
    assert record["interior"] in ix.BUILDING_INTERIORS


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
        _verts(room(hole_east=True)), room(hole_east=True), {},
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


def test_a_scaled_anchor_carries_its_mined_door_through_the_composite_pose():
    """16h K11 A: the mine measures the door in the anchor's UNSCALED frame; a
    composite that stands the anchor at 1.3, turned 90 deg and lifted 1 m must
    report the door where that pose puts it. Part 0's `yawDeg` is clockwise
    from above, the one composite convention (16h check-in 3 item 4)."""
    pose = {"scale": 1.3, "offsetM": [0.0, 0.0, 1.0], "yawDeg": 90.0}
    door = ix.posed_mined_door({**_mined_fixed(), "riseM": 0.5,
                                "offsetLocalM": [-2.45, 1.4, 0.5]}, pose)
    x, y, z = door["offsetLocalM"]
    assert (x, y, z) == pytest.approx((1.82, 3.185, 1.65), abs=1e-3)
    assert door["radiusM"] == pytest.approx(2.82 * 1.3, abs=0.01)
    # a clockwise 90 deg turn adds 90 to the clockwise bearing
    assert door["sideDeg"] == pytest.approx((299.75 + 90.0) % 360.0, abs=0.05)
    assert door["yawDeg"] == pytest.approx(210.0)
    assert door["riseM"] == pytest.approx(1.65)
    # identity pose leaves the record untouched
    assert ix.posed_mined_door(_mined_fixed(), {"scale": 1.0, "offsetM": [0, 0, 0],
                                                "yawDeg": 0.0}) == _mined_fixed()


def test_a_scaled_anchor_carries_its_plugin_door_link_and_sibling_box():
    pose = {"scale": 2.0, "offsetM": [0.0, 0.0, 0.0], "yawDeg": 0.0}
    row = ix.posed_link({"doorOffsetInShell": {"xM": 1.0, "yM": 2.0, "zM": 0.5,
                                               "yawDeg": 10.0, "sideDeg": 26.57,
                                               "radiusM": 2.236}}, pose)
    off = row["doorOffsetInShell"]
    assert (off["xM"], off["yM"], off["zM"]) == (2.0, 4.0, 1.0)
    assert off["radiusM"] == pytest.approx(4.472, abs=1e-3)
    lo, hi = ix.posed_bounds_glb(pose, (1.0, 0.0, -3.0), (2.0, 2.0, -2.0))
    assert list(lo) == [2.0, 0.0, -6.0] and list(hi) == [4.0, 4.0, -4.0]


def test_the_mud_hut_entrance_reads_where_its_frames_stand():
    """16h K11 A on the real record: the composite stands `hutexterior` at the
    plugin's 1.30, so its entrance must read in the 6.3-7.2 m band the four
    `doorframe01` rings occupy (K10 D), not the unscaled 5.01 m."""
    composite = "composite:mud/hut-with-entrance"
    parts = ix.composite_parts("settlement-mud-v1")[composite]
    pose = ix.composite_anchor_poses("settlement-mud-v1")[composite]
    mined = ix.load_assembly_doorways()
    assert pose["scale"] == pytest.approx(1.3)
    unposed = ix.composite_doorways(parts, mined)
    posed = ix.composite_doorways(parts, mined, pose)
    assert posed and len(posed) == len(unposed)
    # the defect this guards: without the pose the entrance reads 5.0 m
    assert min(d["radiusM"] for d in unposed) < 6.3
    for door in posed:
        assert 6.3 <= door["radiusM"] <= 7.2, door


def _plugin_rotation(pitch_deg: float, roll_deg: float, yaw_deg: float) -> np.ndarray:
    """The plugin's REFR rotation as `worldgen.mine_mounts.rotation` reads it:
    clockwise angles, x then y then z (written out here, independently)."""
    ax, ay, az = (-math.radians(v) for v in (pitch_deg, roll_deg, yaw_deg))
    rx = np.array([[1, 0, 0], [0, math.cos(ax), -math.sin(ax)], [0, math.sin(ax), math.cos(ax)]])
    ry = np.array([[math.cos(ay), 0, math.sin(ay)], [0, 1, 0], [-math.sin(ay), 0, math.cos(ay)]])
    rz = np.array([[math.cos(az), -math.sin(az), 0], [math.sin(az), math.cos(az), 0], [0, 0, 1]])
    return rz @ ry @ rx


def test_a_part_pitched_and_rolled_as_the_plugin_places_it_carries_its_points():
    """16k interiors r8 (1): King of the Murkmire places 6 of its 7 smpodext02
    pods at x-rotation 164-198 deg. A composite part carries `pitchDeg` (the
    plugin's x rotation) and `rollDeg` (its y rotation) in the plugin's own
    convention, applied x then y then z like the REFR, so a mined point on the
    anchor lands where the plugin's placement puts it."""
    pose = {"scale": 1.0, "offsetM": [0.5, -1.0, 2.0], "yawDeg": 30.0,
            "pitchDeg": 180.0, "rollDeg": 8.1}
    point = (1.2, -3.4, 0.7)
    want = _plugin_rotation(180.0, 8.1, 30.0) @ np.array(point) + np.array([0.5, -1.0, 2.0])
    assert ix.pose_point_zup(pose, point) == pytest.approx(list(want), abs=1e-9)
    # pitch 180 alone turns the pod over: up becomes down, forward becomes back
    flip = {"scale": 1.0, "offsetM": [0.0, 0.0, 0.0], "yawDeg": 0.0, "pitchDeg": 180.0}
    assert ix.pose_point_zup(flip, (1.0, 2.0, 3.0)) == pytest.approx([1.0, -2.0, -3.0])
    # a tilted pose is never the identity, and a door's facing turns with it:
    # a door facing bearing 20 on a pod turned over about x faces 160
    assert not ix._is_identity_pose(flip)
    assert ix.pose_yaw_deg(flip, 20.0) == pytest.approx(160.0)
    assert ix.pose_yaw_deg({"scale": 1.0, "offsetM": [0, 0, 0], "yawDeg": 90.0}, 120.0) \
        == pytest.approx(210.0)


def test_the_part_rotation_is_identical_in_the_blender_half():
    """The Blender importer cannot import this package, so the pure rotation
    is duplicated there (the card-packing precedent); drift would stand a
    pitched part one way in the GLB and its doors another way in the sidecar."""
    import re
    from pathlib import Path
    here = Path(__file__).resolve().parent
    pattern = re.compile(r"\ndef part_rotation_zup.*?\n    return rows\n", re.S)
    host = pattern.search((here / "interiors_index.py").read_text())
    blender = pattern.search((here / "blender" / "build_kit.py").read_text())
    assert host and blender
    assert host.group(0) == blender.group(0)
    assert "part_rotation_zup(part" in (here / "blender" / "build_kit.py").read_text()


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
            if not record.get("entrance"):
                doorless.append(asset_id)
            if record.get("interior") == "promised":
                # claimed, not built yet: Phase 12 builds it, and says why
                if not (record.get("promiseReason") or "").strip():
                    unlinked.append(asset_id)
            elif not (record.get("tileset") or record.get("interiorAssetRef")):
                unlinked.append(asset_id)
    assert not doorless, f"enclosed pieces with no entrance: {doorless}"
    assert not unlinked, f"enclosed pieces with no interior kit: {unlinked}"


# --- the door manifest is the truth about interiors (owner 2026-09-07) ------ #
def test_every_manifest_linked_shell_in_a_built_kit_resolves_to_a_built_interior():
    """A shell the mods' own load doors link may not be a mass, may not point at
    an unbuilt kit, and must carry the entrance the plugin derived for it."""
    import json as _json
    from pathlib import Path as _Path
    from . import interiors_index as ii

    links = ii.load_door_links()
    if not links:
        return  # manifest not mined in this checkout
    built = {p.stem.removesuffix(".kit") for p in ii.KITS_DIR.glob("*.kit.json")}
    problems: list[str] = []
    for path in sorted(ii.KITS_DIR.glob("*.interiors.json")):
        data = _json.loads(_Path(path).read_text())
        kit = data.get("kit", path.stem)
        if kit in ii.INTERIOR_KITS:
            continue
        for asset_id, record in data.get("assets", {}).items():
            if asset_id not in links or record.get("interior") == "none":
                continue
            if record.get("interiorSource") != "esp-door":
                problems.append(f"{kit}/{asset_id}: linked by the manifest but its interior "
                                f"came from {record.get('interiorSource') or 'a rule'}")
                continue
            tileset = record.get("tileset")
            if tileset not in built:
                problems.append(f"{kit}/{asset_id}: interior kit {tileset!r} is not built")
            if (record.get("entrance") or {}).get("kind") != "esp-door":
                problems.append(f"{kit}/{asset_id}: the plugin's own load door did not win the "
                                f"entrance ranking (got "
                                f"{(record.get('entrance') or {}).get('kind')!r})")
    assert not problems, "\n".join(problems)


# --------------------------------------------------------------------------- #
# ONE canonical entrance, ranked (owner ruling 2026-09-07)
# --------------------------------------------------------------------------- #
def _record_with(*kinds) -> dict:
    """A record carrying one doorway evidence per named kind, worst first, so a
    ranking that did nothing would leave the worst in front."""
    made = {
        "esp-door": {"kind": "esp-door", "sideDeg": 10.0, "placements": 3},
        "assembly": {"doorwaySource": "assembly", "sideDeg": 20.0, "count": 16},
        "door-piece": {"kind": "door-piece", "sideDeg": 30.0, "fitM": 0.1},
        "leaf": {"kind": "leaf", "sideDeg": 40.0, "arcM": 1.1},
        "opening": {"kind": "opening", "sideDeg": 50.0, "arcM": 1.3},
        "open-front": {"kind": "open-front", "sideDeg": 60.0, "arcM": 4.0},
    }
    return {"interior": "shell", "doorways": [dict(made[k]) for k in kinds]}


@pytest.mark.parametrize("kinds, winner", [
    (("open-front", "opening", "leaf", "door-piece", "assembly", "esp-door"), "esp-door"),
    (("open-front", "opening", "leaf", "door-piece", "assembly"), "assembly"),
    (("open-front", "opening", "leaf", "door-piece"), "door-piece"),
    (("open-front", "opening", "leaf"), "leaf"),
    (("open-front", "opening"), "opening"),
    (("open-front",), "open-front"),
])
def test_the_best_evidence_wins_the_entrance_whatever_order_it_arrived_in(kinds, winner):
    record = _record_with(*kinds)
    ix.finalise_entrance(record)
    assert record["entrance"]["kind"] == winner


def test_the_losing_evidence_is_kept_for_audit_and_never_as_a_second_entrance():
    """The symptom the ruling fixes: a shell drawn with three different answers
    for where its door is."""
    record = _record_with("opening", "leaf", "esp-door")
    ix.finalise_entrance(record)
    assert record["entrance"]["kind"] == "esp-door"
    assert [d["kind"] for d in record["provenance"]] == ["leaf", "opening"]
    assert "doorways" not in record and "doorwaySource" not in record


def test_a_piece_with_no_door_evidence_says_so_rather_than_guessing():
    record = {"interior": "none", "doorways": [], "doorwaysWhy": "not an enclosure"}
    ix.finalise_entrance(record)
    assert record["entrance"] is None
    assert record["provenance"] == []
    assert record["entranceWhy"] == "not an enclosure"


def test_only_placement_evidence_may_make_an_entrance_radial():
    """A ray-measured opening is one hole on one side; only the plugin's or the
    authors' own placements can show a door turned to different sides."""
    mined = {"interior": "shell", "doorways": [
        {"doorwaySource": "assembly", "radial": True, "radiusM": 2.5, "count": 9}]}
    ix.finalise_entrance(mined)
    assert mined["entrance"]["radial"] is True
    measured = {"interior": "shell", "doorways": [
        {"kind": "opening", "radial": True, "radiusM": 2.5, "sideDeg": 90.0, "arcM": 1.2}]}
    ix.finalise_entrance(measured)
    assert "radial" not in measured["entrance"]


def test_the_most_placed_door_wins_between_equals():
    record = {"interior": "shell", "doorways": [
        {"doorwaySource": "assembly", "sideDeg": 10.0, "count": 4},
        {"doorwaySource": "assembly", "sideDeg": 200.0, "count": 31}]}
    ix.finalise_entrance(record)
    assert record["entrance"]["sideDeg"] == 200.0


def test_a_promised_building_says_why_and_only_the_promise_table_makes_one():
    """16k lane F: `promised` is a building Phase 12 builds the interior of;
    it comes only from `PROMISED_INTERIORS`, and each row carries its reason."""
    assert all(reason.strip() for reason in ix.PROMISED_INTERIORS.values())
    assert "promised" in ix.BUILDING_INTERIORS
    probe = {"centre": [0.0, 0.0], "floorY": 0.0, "roomH": 3.0, "ring": [4.0] * ix.BINS}
    for asset_id, expected in (("kotm:argonia/mudhuts/mudhut01", "promised"),
                               ("kotm:argonia/mudhuts/mudhut99", "shell")):
        record = {"interior": "shell", "ringFraction": 1.0, "medianWallM": 4.0, "_probe": probe}
        got = ix.promise_or_shell(record, asset_id)
        assert got["interior"] == expected
        assert bool(got.get("promiseReason")) == (expected == "promised")


def test_storeys_from_the_shells_own_floor_and_door_heights():
    """Planner ruling 3 (interiors round 2): a shell's storeys cluster its
    floor and esp-door heights by STOREY_GAP_M; a non-building has none."""
    from pipeline import interiors_index as ii
    one = {"interior": "tileset", "floorOffsetM": 0.0,
           "entrance": {"kind": "esp-door", "heightM": -0.04}}
    ii.set_storeys(one)
    assert one["storeys"] == 1
    two = {"interior": "tileset", "floorOffsetM": 0.0, "entrance": {"kind": "leaf", "heightM": 1.8},
           "provenance": [{"kind": "esp-door", "heightM": 3.4}]}
    ii.set_storeys(two)
    assert two["storeys"] == 2 and two["storeyLevelsM"] == [0.0, 3.4]
    prop = {"interior": "none", "floorOffsetM": 0.0}
    ii.set_storeys(prop)
    assert "storeys" not in prop


def test_a_porch_that_carries_its_own_mined_door_is_no_leaf():
    """16k fix 2 (kotm-house-pod): the KotM porch `smpodextdoor` has "door" in
    its name but is the doorway module the plugin hangs `door01` on
    (kotm:t0034); only the leaf `door01` is a composite-leaf doorway."""
    parts = [{"asset": "kotm:argonia/mudhuts/smpodext02"},
             {"asset": "kotm:argonia/mudhuts/smpodextdoor", "offsetM": [-0.3, -3.36, 1.22],
              "yawDeg": 3.35},
             {"asset": "kotm:argonia/mudhuts/door01", "offsetM": [-0.91, -6.29, 2.44],
              "yawDeg": 4.75}]
    frames = {"kotm:argonia/mudhuts/smpodextdoor"}
    got = ix.composite_leaf_doorways(parts, [], frames)
    assert [d["doorAsset"] for d in got] == ["kotm:argonia/mudhuts/door01"]
    assert len(ix.composite_leaf_doorways(parts, [])) == 2      # the old rule took the porch


def test_a_radial_plugin_door_is_fixed_where_the_composite_hangs_it():
    """16k fix 2: the pod's plugin load door `door01` stands at 6.3 m on any
    bearing across the plugin's placements (radial); a composite that hangs
    door01 at one offset fixes the entrance there. A leaf of another model
    leaves the radial door alone."""
    esp = {"kind": "esp-door", "doorAsset": "kotm:argonia/mudhuts/door01", "placements": 8,
           "radiusM": 6.3, "radial": True}
    leaf = {"doorwaySource": "composite-leaf", "doorAsset": "kotm:argonia/mudhuts/door01",
            "offsetLocalM": [-0.91, -6.29, 2.44], "radiusM": 6.355, "sideDeg": 188.23,
            "yawDeg": 4.75, "count": 1}
    record = {"doorways": [dict(esp)]}
    ix.fix_radial_esp_door(record, [leaf])
    door = record["doorways"][0]
    assert "radial" not in door and door["sideDeg"] == 188.23
    # the plan frame the doorways use (x, -y: south positive), as the mined rows
    assert door["offsetM"] == [-0.91, 6.29] and door["heightM"] == 2.44 and door["yawDeg"] == 4.75
    other = {"doorways": [dict(esp)]}
    ix.fix_radial_esp_door(other, [dict(leaf, doorAsset="kotm:argonia/mudhuts/door02")])
    assert other["doorways"][0]["radial"] is True


# --- 16k fix 2 ruling 2: an esp-door's offsetM is in the z-south plan frame
def test_apply_esp_link_writes_the_door_offset_in_the_z_south_frame():
    """The plugin's door offset is x east, y north; every reader of
    `offsetM` (piece_doorways, blueprint_interiors) reads x east, z south,
    so the record carries [x, -y]. mudmother mudhut01 read sideDeg 181.66
    (south) with its offset 19.5 m north of the hut."""
    record: dict = {"doorways": []}
    link = {"plugin": "p.esp", "interiorCell": "C", "placements": 3, "doorModel": "d.nif",
            "doorOffsetInShell": {"xM": 0.4, "yM": -5.0, "zM": 0.1, "sideDeg": 175.4,
                                  "yawDeg": 180.0, "radiusM": 5.02}}
    ix.apply_esp_link(record, link, "interior-x")
    door = record["doorways"][-1]
    assert door["offsetM"] == [0.4, 5.0]
    bearing = ix._bearing_deg(*door["offsetM"])
    assert abs((door["sideDeg"] - bearing + 180.0) % 360.0 - 180.0) < 1.0


#: a link whose placements spread 7.58 m: the miner's per-field medians give a
#: sideDeg that is no offset's bearing (backlog row "mine_door_links.consolidate")
SPREAD_LINK_EXEMPT = {"bmv:architecture/citebosmer/houses/housegland001"}


def test_every_tracked_fixed_esp_door_offset_lies_on_its_side():
    """The tracked records after the re-index: a fixed esp-door's offsetM
    bearing from the shell pivot agrees with its sideDeg within 30 deg."""
    tracked = ix.REPO_ROOT / "world" / "sources" / "placement" / "kit-interiors"
    checked, bad = 0, []
    for path in sorted(tracked.glob("*.interiors.json")):
        for asset_id, record in json.loads(path.read_text())["assets"].items():
            for d in (record.get("doorways") or []) + [record.get("entrance") or {}]:
                if d.get("kind") != "esp-door" or d.get("radial") or not d.get("offsetM"):
                    continue
                if (math.hypot(*d["offsetM"]) < 0.5 or d.get("sideDeg") is None
                        or asset_id in SPREAD_LINK_EXEMPT):
                    continue
                bearing = ix._bearing_deg(*d["offsetM"])
                off = abs((float(d["sideDeg"]) - bearing + 180.0) % 360.0 - 180.0)
                checked += 1
                if off > SIDE_AGREEMENT_DEG:
                    bad.append(f"{path.name} {asset_id}: sideDeg {d['sideDeg']} vs {bearing:.1f}")
    assert checked
    assert bad == [], f"{len(bad)} of {checked}: {bad[:5]}"


def _farmhouse02_mined() -> dict:
    """farmhouse02's two mined doors, one piece: the porch door (vanilla:t0335,
    7) and the deck door 3.18 m up (vanilla:t0420, 6)."""
    door = "vanilla:architecture/farmhouse/farmhouseldoor01"
    return {"vanilla:architecture/farmhouse/farmhouse02": [
        {"kind": "fixed", "doorAsset": door, "offsetLocalM": [0.0, -3.11, -0.01],
         "radiusM": 3.11, "riseM": -0.01, "yawDeg": 0.0, "sideDeg": 179.98, "count": 7},
        {"kind": "fixed", "doorAsset": door, "offsetLocalM": [-0.02, -3.67, 3.18],
         "radiusM": 3.67, "riseM": 3.18, "yawDeg": 0.0, "sideDeg": 180.33, "count": 6}]}


def test_a_composite_carries_only_the_mined_door_its_part_stands_at():
    """Walk 2 lane P (planner 2026-09-27): farmhouse02-with-walkway hangs the
    load door on the deck (t0420); the porch door of the same piece (t0335,
    3.24 m away) is not in the composite and is no doorway of it."""
    rows = [{"asset": "vanilla:architecture/farmhouse/farmhouse02"},
            {"asset": "vanilla:architecture/farmhouse/farmhouse02walkway",
             "offsetM": [-0.04, -8.23, -0.01]},
            {"asset": "vanilla:architecture/farmhouse/farmhouseldoor01",
             "offsetM": [-0.02, -3.67, 3.18]}]
    doors = ix.composite_doorways([r["asset"] for r in rows], _farmhouse02_mined(), None, rows)
    assert [(d["offsetLocalM"], d.get("carried")) for d in doors] == [([-0.02, -3.67, 3.18], True)]


def test_a_radial_plugin_door_is_fixed_at_the_mined_door_the_composite_carries():
    esp = {"kind": "esp-door", "doorAsset": "vanilla:architecture/farmhouse/farmhouseldoor01",
           "placements": 34, "radiusM": 3.67, "radial": True}
    deck = {**_farmhouse02_mined()["vanilla:architecture/farmhouse/farmhouse02"][1],
            "carried": True}
    record = {"doorways": [dict(esp)]}
    ix.fix_radial_esp_door(record, [deck])
    door = record["doorways"][0]
    assert "radial" not in door
    assert (door["offsetM"], door["heightM"], door["sideDeg"]) == ([-0.02, 3.67], 3.18, 180.33)
    # two carried rows of one piece: no single bearing, the door stays radial
    record = {"doorways": [dict(esp)]}
    ix.fix_radial_esp_door(record, [deck, {**deck, "offsetLocalM": [0.0, -3.11, -0.01]}])
    assert record["doorways"][0]["radial"] is True


def _stall() -> np.ndarray:
    """A stable stall in the GLB frame (x east, y up, z south): walls north and
    west, the east end open to the roof (the run continues), and the south
    face an arched mouth 2.4 m wide under a lintel from 3.0 m (keep stables)."""
    h, top = 2.5, 5.4
    tris: list = []
    tris += _wall(-h, -h, h, -h, 0.0, top)                  # north
    tris += _wall(-h, h, -h, -h, 0.0, top)                  # west
    tris += _wall(-h, h, -1.2, h, 0.0, top)                 # south, west of the mouth
    tris += _wall(1.2, h, h, h, 0.0, top)                   # south, east of the mouth
    tris += _wall(-1.2, h, 1.2, h, 3.0, top)                # the lintel over the mouth
    tris += _slab(top, h)
    return np.asarray(tris, dtype=np.float64)


def test_a_floorless_raised_storey_takes_its_entrance_at_the_ground():
    """Walk 2 lane P (planner 2026-09-27): the keep stable stalls' ring closes
    only at the 2 m rung, where the open run end is the one gap, so the old
    record called the run end the front. Below that storey the arched mouth
    reads as an opening under its lintel and outranks the open run end."""
    tris = _stall()
    high, _ = ix.doorways_from_probe(tris, (0.0, 0.0), 2.0, 3.4)
    assert [round(d["sideDeg"]) for d in high] == [90]          # the run end only
    low = ix.ground_doorways(tris, (0.0, 0.0), 0.0, 5.4, 2.0)
    assert low[0]["kind"] == "opening" and abs(low[0]["sideDeg"] - 180.0) <= 5.0
    # walk 2 round 5: the open run end is the run's join face, not a doorway
    assert not any(d["kind"] == "open-front" for d in low), low


def test_the_keep_stable_stalls_open_on_their_arched_south_face():
    """The tracked record: each stall's entrance is the -y (south) mouth."""
    path = ix.REPO_ROOT / "world/sources/placement/kit-interiors/imperial-keep.interiors.json"
    assets = json.loads(path.read_text())["assets"]
    stall = "mwkeep:tesak1243/mwimperialarchitecture/architecture/keep/exterior/stables/"
    for name in ("mwimparchstableendl01", "mwimparchstableendr01", "mwimparchstablestraight01"):
        e = assets[stall + name]["entrance"]
        assert abs(float(e["sideDeg"]) - 180.0) <= 10.0, (name, e)
        # exactly one doorway, the -y opening: no join face left in provenance
        # (walk 2 round 5: endl01/endr01 listed an open-front at [±2.3, 2.68])
        assert e["kind"] == "opening" and e["offsetM"][1] > 4.5, (name, e)
        assert assets[stall + name]["provenance"] == [], (name, assets[stall + name]["provenance"])


def test_r18_an_open_front_doorless_piece_placed_outdoors_is_walked_into():
    """0105 R18: open front, no door, its plugin places it outdoors -> none."""
    def rec(interior="shell", kinds=("open-front",)):
        ways = [{"kind": k} for k in kinds]
        return {"interior": interior, "ringFraction": 0.83, "entrance": ways[0], "provenance": ways[1:],
                **({"promiseReason": "x"} if interior == "promised" else {})}
    outdoors = {"n": 2, "settings": {"exterior": ["town"]}, "sourceCells": ["RiftenLocation"]}
    indoors = {"n": 1, "settings": {"interior": ["town"]}, "sourceCells": ["Cell"]}
    r = rec(); ix.walk_in_open_front(r, outdoors)
    assert r["interior"] == "none" and r["walkedInto"] and "R18" in r["why"] and r["entrance"]
    r = rec("promised"); ix.walk_in_open_front(r, outdoors)
    assert r["interior"] == "none" and "promiseReason" not in r
    for row, kinds in ((indoors, ("open-front",)), (None, ("open-front",)),
                       (outdoors, ("opening", "open-front")), (outdoors, ("esp-door", "open-front"))):
        r = rec(kinds=kinds); ix.walk_in_open_front(r, row)
        assert r["interior"] == "shell", (row, kinds)


# --------------------------------------------------------------------------- #
# a doorway is where rays pass (16k walk 4, lane PARTS)
# --------------------------------------------------------------------------- #
_HUT = {"id": "kotm:argonia/mudhuts/testhut", "category": "architecture"}


def test_a_closed_doorway_is_dropped_with_a_warn_naming_the_shell(capsys):
    """A leaf panel set proud of a CLOSED wall reads as a doorway to the probe,
    but no ray passes through it: it is dropped, named, and kept for audit."""
    tris = room(door_at_x=3.5)
    record = ix.classify_asset(_HUT, "settlement-mud-v1", _verts(tris), tris, {})
    assert record["doorways"] == []
    assert record["doorwaysClosedDropped"][0]["sideDeg"] == pytest.approx(90.0, abs=5.0)
    assert "kotm:argonia/mudhuts/testhut" in capsys.readouterr().out


def test_an_open_doorway_is_kept_with_its_sill_clear_height_and_width():
    tris = room(hole_east=True)
    record = ix.classify_asset(_HUT, "settlement-mud-v1", _verts(tris), tris, {})
    door = record["doorways"][0]
    assert door["rayConfirmed"] is True
    assert door["sideDeg"] == pytest.approx(90.0, abs=5.0)
    assert door["sillYM"] == pytest.approx(0.0, abs=0.06)
    assert door["clearM"] == pytest.approx(2.2, abs=0.1)
    assert door["widthM"] == pytest.approx(1.2, abs=0.1)
    assert "doorwaysClosedDropped" not in record


def test_an_opening_above_the_floor_is_found_at_its_sill():
    """mudhut01's shape: the floor ladder stands at a foundation's foot, the
    opening starts 2.5 m up, so only the sill sweep can find it."""
    tris = room(hole_east=True, sill=2.5, ceiling=6.0)
    doors = ix.sill_doorways(tris, (0.0, 0.0), 0.0, 6.0)
    assert len(doors) == 1
    assert doors[0]["sideDeg"] == pytest.approx(90.0, abs=5.0)
    assert doors[0]["sillYM"] == pytest.approx(2.5, abs=0.06)
    assert doors[0]["clearM"] == pytest.approx(2.2, abs=0.1)


def test_a_doorway_is_confirmed_at_its_storey_surface_not_the_ladder_rung():
    """16k walk 9: KotM's shed tread stands 1.06 m off the rung its ring closed
    at and the lizardhouse pod floor 1.18 m, so a sill band hung off the rung
    tested both real openings as closed wall. The band hangs off the surface
    the probe's down ray stands on."""
    tris = np.vstack([room(ceiling=4.0, hole_east=True, sill=1.0),
                      np.asarray(_slab(1.0), dtype=np.float64)])
    door = {"sideDeg": 90.0, "offsetM": [5.0, 0.0], "arcM": 1.2}
    probe = ix.probe_from_inside(tris, (0.0, 0.0), 0.0 + ix.EYE_HEIGHT_M)
    assert ix.doorway_rays(tris, door, 0.0, ix.LEAF_SILL_MAX_M) is None  # the rung's band
    door_y = ix.door_storey_y(probe, 0.0, 0.0)
    assert door_y == pytest.approx(1.0, abs=0.01)
    proof = ix.doorway_rays(tris, door, door_y, door_y + ix.LEAF_SILL_MAX_M)
    assert proof is not None and proof["sillYM"] == pytest.approx(1.0, abs=0.06)
    # a hit at the knees, or no floor at all, keeps the rung
    assert ix.door_storey_y(dict(probe, floorDropM=0.2), 0.0, 0.0) == 0.0
    assert ix.door_storey_y(dict(probe, floor=False), 0.0, 0.0) == 0.0


def test_the_sill_is_the_tread_not_the_gap_under_a_floor_slab():
    """The Riften stable's shape: a horizontal ray slides under the stall floor,
    so the sill is where the down ray finds the tread."""
    tris = np.vstack([room(hole_east=True), np.asarray(_slab(0.3), dtype=np.float64)])
    door = {"sideDeg": 90.0, "offsetM": [5.0, 0.0], "arcM": 1.2}
    proof = ix.doorway_rays(tris, door, 0.0, 0.6)
    assert proof["sillYM"] == pytest.approx(0.3, abs=0.06)
    assert proof["clearM"] == pytest.approx(1.9, abs=0.1)


# --------------------------------------------------------------------------- #
# approach: the doorway a composite's landing part reaches (16k Riverwalk
# walk 5: BM&V's swamp house read its far-side opening over water as the
# entrance, ~175 deg from the doorway its dock plank is laid at)
# --------------------------------------------------------------------------- #
def two_door_room(half: float = 5.0, ceiling: float = 3.0) -> np.ndarray:
    """A roofed box with a 1.2 m doorway in BOTH the +x (east) and -x (west)
    walls: the centre ray pass cannot tell which one the makers walk in by."""
    tris: list = []
    tris += _wall(-half, -half, half, -half, 0.0, ceiling)
    tris += _wall(half, half, -half, half, 0.0, ceiling)
    for x in (half, -half):
        tris += _wall(x, -half, x, -0.6, 0.0, ceiling)
        tris += _wall(x, 0.6, x, half, 0.0, ceiling)
        tris += _wall(x, -0.6, x, 0.6, 2.2, ceiling)
    tris += _slab(0.0, half)
    tris += _slab(ceiling, half)
    return np.asarray(tris, dtype=np.float64)


def _parts(landing_offset):
    return [{"asset": "bmv:architecture/swamp house", "scale": 1.0},
            {"asset": "vanilla:architecture/docks/dockstrent02", "offsetM": landing_offset}]


@pytest.mark.parametrize("x, expected", [(7.5, 90.0), (-7.5, 270.0)])
def test_a_landing_part_picks_the_doorway_it_reaches(x, expected):
    doors = ix.approach_doorways(two_door_room(), _parts([x, 0.0, 0.0]))
    assert len(doors) == 1
    door = doors[0]
    assert door["kind"] == "approach" and door["rayConfirmed"]
    assert door["doorAsset"].endswith("dockstrent02")
    assert abs((door["sideDeg"] - expected + 180.0) % 360.0 - 180.0) <= 10.0
    assert math.copysign(1.0, door["offsetM"][0]) == math.copysign(1.0, x)


def test_a_part_inside_the_shell_or_a_leaf_is_no_landing():
    assert ix.approach_doorways(two_door_room(), _parts([1.0, 0.0, 0.0])) == []
    leaf = [{"asset": "bmv:architecture/swamp house"},
            {"asset": "x:architecture/housedoor01", "offsetM": [7.5, 0.0, 0.0]}]
    assert ix.approach_doorways(two_door_room(), leaf) == []


def test_the_approach_outranks_the_ray_pick():
    record = {"doorways": [{"kind": "opening", "sideDeg": 262.5, "arcM": 0.8},
                           {"kind": "approach", "sideDeg": 95.8, "arcM": 1.7}]}
    ix.finalise_entrance(record)
    assert record["entrance"]["kind"] == "approach"


def test_a_rock_with_an_invisible_load_door_is_a_cave_mouth_and_no_other_rock_is():
    # 16k walk 9: rockcaveentrance02 holds King of the Murkmire's AutoLoadDoor01
    rock = {"category": "rock", "interior": "none"}
    assert ix.cave_mouth_link(rock, {"doorModel": "vanilla:autoloadmarker01"})
    assert not ix.cave_mouth_link(rock, {"doorModel": "vanilla:architecture/farmhouse/farmhouseldoor01"})
    assert not ix.cave_mouth_link({"category": "misc"}, {"doorModel": "vanilla:autoloadmarker01"})


def test_a_radial_cave_mouth_door_is_fixed_on_its_doors_axis_toward_the_show_side():
    # rockcaveentrance02's plugins face their doors out (about 110) or in (about 290)
    record = {"category": "rock", "caveDoorYawsDeg": [107.0, 113.0, 287.0, 293.0],
              "entrance": {"kind": "esp-door", "radial": True, "radiusM": 1.5}}
    ix.fix_cave_mouth_entrance(record, 79.7)
    ent = record["entrance"]
    assert "radial" not in ent and "caveDoorYawsDeg" not in record
    assert abs(ent["sideDeg"] - 110.0) < 0.01 and ent["yawDeg"] == ent["sideDeg"]
    record = {"category": "rock", "entrance": {"kind": "esp-door", "radial": True, "radiusM": 1.5}}
    ix.fix_cave_mouth_entrance(record, 90.0)
    assert record["entrance"]["offsetM"] == [1.5, -0.0]


def test_cave_door_yaws_never_reach_the_sidecar():
    # walk 9 review: a cave-mouth rock with no derivable front, or a door that is
    # not radial, kept the working field and published it
    yaws = [107.0, 113.0]
    for record, front in (
            ({"category": "rock", "caveDoorYawsDeg": yaws,
              "entrance": {"kind": "esp-door", "radial": True, "radiusM": 1.5}}, None),
            ({"category": "rock", "caveDoorYawsDeg": yaws,
              "entrance": {"kind": "esp-door", "radiusM": 1.5}}, {"deg": 80.0}),
            ({"category": "rock", "caveDoorYawsDeg": yaws,
              "entrance": {"kind": "esp-door", "radial": True, "radiusM": 1.5}}, {"deg": 79.7})):
        ix.settle_cave_mouth(record, lambda: front)
        assert "caveDoorYawsDeg" not in record
    assert abs(record["entrance"]["sideDeg"] - 110.0) < 0.01
