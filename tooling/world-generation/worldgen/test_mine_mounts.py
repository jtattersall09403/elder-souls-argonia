"""The mined mount record: real mesh-to-mesh contact, not co-placement noise."""

import json
import math
import struct
from collections import defaultdict
from pathlib import Path

import numpy as np
import pytest

trimesh = pytest.importorskip("trimesh")

from .esp_index import (
    GT_CELL_CHILDREN,
    GT_CELL_TEMPORARY,
    GT_EXT_CELL_BLOCK,
    GT_EXT_CELL_SUBBLOCK,
    GT_TOP,
    GT_WORLD_CHILDREN,
    UNITS_PER_METRE,
)
from . import known_red
from .mine_designed_sink import DEFAULT_OUT as SINK_RECORD, complete_record
from .mine_mounts import (
    ANCHOR_EVIDENCE,
    DEFAULT_OUT as MOUNTS_RECORD,
    MIN_SAMPLES,
    ChildRef,
    Instance,
    build_document,
    classify_anchor,
    classify_reference,
    patch_class,
    policy_anchor_class,
    relative_pose,
    summarise,
    validate_pairs,
    water_column,
)
from .test_esp_index import cstr, group, record, sub


def _record(path: Path) -> dict:
    return json.loads(path.read_text())


def test_every_mined_mount_pair_meets_the_contract():
    document = _record(MOUNTS_RECORD)
    assert document["schemaVersion"] == 3 and document["shapes"]
    assert validate_pairs(document["pairs"]) == []
    assert all(pair["n"] >= MIN_SAMPLES for pair in document["pairs"]
               if pair["kind"] == "band")


_GOLDEN = Path(__file__).resolve().parent / "fixtures" / "mount-golden.json"


def test_the_record_holds_the_golden_set():
    """The full record answers every golden expectation (class, and the named
    kit parent in its pair list); the sconce -> free wall pair the yard mounts
    comes out of the full run with n >= 3 (16h round 16 ruling 5: a 40-ref
    sample of its 298 refs carries it once, every ref 14 times)."""
    golden = _record(_GOLDEN)["golden"]["ids"]
    document = _record(MOUNTS_RECORD)
    pairs = {(p["child"], p["parent"]): p for p in document["pairs"]}
    wrong = [f'{row["id"]}: expected {row["expected"]}, got '
             f'{document["anchors"].get(row["id"], {}).get("anchorClass")}'
             + (f', parent {row["parent"]} missing' if row.get("parent")
                and (row["id"], row["parent"]) not in pairs else "")
             for row in golden
             if document["anchors"].get(row["id"], {}).get("anchorClass") != row["expected"]
             or (row.get("parent") and (row["id"], row["parent"]) not in pairs)]
    sconce = pairs[("vanilla:clutter/imperial/impwallsconcecandle01",
                    "vanilla:dungeons/imperial/clutterkits/impfreewall01")]
    assert sconce["n"] >= MIN_SAMPLES
    # keyed to the failing entry, never the test (decision 0053)
    known_red.assert_clear(
        "worldgen/test_mine_mounts.py::test_the_record_holds_the_golden_set", wrong)


def test_the_record_carries_an_anchor_class_for_every_kit_asset():
    document = _record(MOUNTS_RECORD)
    assert document["anchors"] and document["anchorClassCounts"]
    # The evidence vocabulary is placement_metadata's (``category``: an effect
    # mesh is ``fx`` by its kit category; ``policy``: a reviewed assetPlacement
    # row, apply_placement_row), never a copy of it here.
    assert {row["anchorClassEvidence"] for row in document["anchors"].values()} <= ANCHOR_EVIDENCE


def test_a_loose_or_thin_cluster_is_points_not_a_band():
    thin = summarise({("child", "parent"): [((1.0, 0.0, 2.0), 0.0)] * 2})
    loose = summarise({("child", "parent"): [((1.0, 0.0, 2.0), 0.0)] * 3
                       + [((1.0, 0.0, 9.0), 0.0)] * 3})
    assert [p["kind"] for p in thin + loose] == ["points", "points"]
    assert [pt["n"] for pt in loose[0]["points"]] == [3, 3]
    assert validate_pairs(thin) == [] and validate_pairs(loose) == []


def test_the_pose_reproduces_local_offset_for_a_yawed_parent():
    parent = Instance("p", 0.0, 0.0, 0.0, 90.0)
    child = Instance("c", 0.0, -UNITS_PER_METRE, 0.0, 90.0)
    a, b = relative_pose(parent, child)
    assert np.allclose(b, (1.0, 0.0, 0.0)) and np.allclose(a, np.eye(3))


def test_a_patch_is_classed_by_its_mean_outward_normal():
    assert patch_class(np.array([[0.0, -1.0, 0.0]] * 5)) == "side"
    assert patch_class(np.array([[0.0, 0.0, 1.0]] * 5)) == "top"
    assert patch_class(np.array([[0.0, 0.0, -1.0]] * 3 + [[1.0, 0.0, 0.0]])) == "under"


def test_a_reference_with_no_usable_terrain_is_not_evidence(tmp_path):
    """Round 8: an exterior cell with no LAND cannot prove what a piece stands
    on, so its references are dropped; with n < 3 left the asset falls back to
    its policy row (ground), and a sink waterline makes it water."""
    placed = []
    for i in range(3):
        placed += [("wall", (10.0 * i - 10.0, 0.0, 0.0), 0.0),
                   ("sconce", (10.0 * i - 10.0 + 0.5, 0.25, 2.0), 0.0)]
    sconce = _mine(tmp_path, placed, land=False)["anchors"]["vanilla:test/sconce01"]
    assert sconce == {"anchorClass": "ground", "anchorClassEvidence": "plugin", "n": 0,
                      "droppedNoLand": 3, "evidence": "policy"}
    wet = {"vanilla:test/sconce01": {"waterline": {"n": 5, "iqrM": 0.1, "p50": 0.0}}}
    sconce = _mine(tmp_path, placed, land=False, sink=wet)["anchors"]["vanilla:test/sconce01"]
    assert (sconce["anchorClass"], sconce["evidence"]) == ("water", "sink-waterline")


def test_a_pivot_more_than_two_metres_under_the_land_stands_in_the_ground(tmp_path):
    """Round 14 ruling: the test LAND lies at -1.14 m; chairs at -3.2 m are
    buried and vote ground (counted as buriedGround), never dropped; chairs at
    -3.1 m are within 2 m of it and are classed by contact."""
    buried = [("chair", (float(i), 0.0, -3.2), 0.0) for i in range(3)]
    chair = _mine(tmp_path, buried)["anchors"]["vanilla:test/chair01"]
    assert (chair["anchorClass"], chair["n"], chair["refClasses"], chair["buriedGround"],
            chair.get("droppedNoLand")) == ("ground", 3, {"ground": 3}, 3, None), chair
    shallow = [("chair", (float(i), 0.0, -3.1), 0.0) for i in range(3)]
    chair = _mine(tmp_path, shallow)["anchors"]["vanilla:test/chair01"]
    assert (chair["n"], chair.get("buriedGround")) == (3, None)


def test_an_ambiguous_vote_is_thin_or_below_six_tenths():
    from .mine_mounts import is_ambiguous
    assert is_ambiguous({"n": 2, "share": 1.0}) and is_ambiguous({"n": 36, "share": 0.583})
    assert not is_ambiguous({"n": 40, "share": 0.6}) and not is_ambiguous({"n": 0})


def test_the_policy_row_names_the_fallback_class():
    inventory = {"assetPolicies": {"a:boat": "water-zero"}, "kitPolicies": {"k": "stilt"}}
    assert policy_anchor_class("a:boat", "k", inventory) == "water"
    assert policy_anchor_class("a:hut", "k", inventory) == "ground"
    assert policy_anchor_class("a:hut", None, inventory) == "ground"


def test_a_tie_goes_to_the_fixing_only_when_nothing_is_supported():
    assert classify_anchor(["wall", "free"] * 3, {})[0] == "wall"
    assert classify_anchor(["wall", "ground"] * 3, {})[0] == "ground"


def test_majority_class_and_thin_agreement():
    assert classify_anchor(["wall", "wall", "ground"], {})[:2] == ("wall", "plugin")
    assert classify_anchor(["hanging"], {})[2]["evidence"] == "thin"
    assert classify_anchor(["hanging", "ground"], {})[0] == "ground"
    assert classify_anchor([], {})[:2] == ("ground", "unplaced")


def test_ground_and_deck_pool_as_support_before_the_plurality():
    """Round 20 fix (a), support from below wins (0085): M18's wrfencestr01
    (wall 15 / deck 13 / ground 10) and M19's (ground 17 / wall 15 / deck 6)
    are supported; the pool then splits ground vs deck. The round-19 rule
    chose wall on the first."""
    anchor, _, fields = classify_anchor(["wall"] * 15 + ["deck"] * 13 + ["ground"] * 10, {})
    assert (anchor, fields["share"]) == ("deck", 0.605)
    assert classify_anchor(["ground"] * 17 + ["wall"] * 15 + ["deck"] * 6, {})[0] == "ground"
    assert classify_anchor(["wall"] * 5 + ["deck"] * 2 + ["free"] * 2, {})[0] == "wall"
    assert classify_anchor(["wall"] * 4 + ["deck"] * 2 + ["free"] * 2, {})[0] == "ground"


def test_an_asset_placement_row_decides_the_class_and_waterline():
    """Round 20: the reviewed assetPlacement row decides as the manifest writer
    applies it, so the mounts record and the manifests agree."""
    from .mine_mounts import apply_placement_row
    fields = {"n": 20, "share": 0.8}
    assert apply_placement_row("deck", "plugin", fields, {}) == ("deck", "plugin")
    assert fields == {"n": 20, "share": 0.8}
    got = apply_placement_row("deck", "plugin", fields,
                              {"anchorClass": "water", "designedWaterlineM": -0.30621})
    assert got == ("water", "policy")
    assert (fields["votedClass"], fields["evidence"], fields["waterline"]["p50"],
            fields["waterline"]["evidence"]) == ("deck", "policy", -0.3062, "policy")
    deck = {"n": 0}
    apply_placement_row("ground", "unplaced", deck, {"anchorClass": "water", "deckClearanceM": 0.672},
                        {"groundLineTell": {"tell": "deck-top", "deckTopM": 0.366}})
    assert deck["waterline"]["p50"] == -0.306
    unplaced = {"n": 0}
    assert apply_placement_row("ground", "unplaced", unplaced,
                               {"anchorClass": "hanging"}) == ("hanging", "policy")
    assert unplaced == {"n": 0, "votedClass": "ground", "evidence": "policy"}


def test_the_record_follows_every_asset_placement_row():
    """The mounts record says what the refreshed manifests say: every
    assetPlacement row's anchorClass is the record's (round 20)."""
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "asset-pipeline"))
    from pipeline.placement_metadata import load_inventory
    anchors = json.loads(MOUNTS_RECORD.read_text())["anchors"]
    rows = load_inventory().get("assetPlacement", {})
    wrong = sorted(f"{aid}: record {anchors.get(aid, {}).get('anchorClass')}, row "
                   f"{row['anchorClass']}" for aid, row in rows.items()
                   if "anchorClass" in row
                   and (anchors.get(aid, {}).get("anchorClass"),
                        anchors.get(aid, {}).get("anchorClassEvidence"))
                   != (row["anchorClass"], "policy"))
    assert not wrong, wrong


# --- contact on real (test) meshes --------------------------------------- #
def _box(low, high):
    low, high = np.array(low, float), np.array(high, float)
    return trimesh.creation.box(extents=high - low,
                                transform=trimesh.transformations.translation_matrix(
                                    (low + high) / 2))


def _kit(mesh):
    low, high = mesh.bounds
    return {"sizeM": (high - low).tolist(), "originOffsetM": (-low).tolist()}


_RAW_KITS = Path(__file__).resolve().parents[2] / "asset-pipeline" / "output" / "kits"
_FLOOR_ID = "plugin-static:other/floor.nif"
_FLOOR = _box((-20, -20, -0.2), (20, 20, 0.0))
_FLOOR_OBND = (-1400, -1400, -14, 1400, 1400, 0)
_WALL = _box((-2, -0.25, 0), (2, 0.25, 4))
_SCONCE = _box((-0.1, 0.0, -0.2), (0.1, 0.15, 0.2))       # flat back at y = 0
_CHAIR = _box((-0.25, -0.25, 0.0), (0.25, 0.25, 1.0))
_LANTERN = _box((-0.15, -0.15, -0.5), (0.15, 0.15, 0.0))  # hook top at the pivot
_TREE = trimesh.util.concatenate([_box((-0.5, -0.5, 0), (0.5, 0.5, 12)),
                                  _box((-6, -0.3, 5.2), (6, 0.3, 5.6)),
                                  _box((-0.3, -6, 8.2), (0.3, 6, 8.6))])
_POST = trimesh.util.concatenate([_box((-0.1, -0.1, 0), (0.1, 0.1, 3.0)),
                                  _box((0.0, -0.05, 2.7), (1.5, 0.05, 2.8))])
_SIGN = _box((-0.5, -0.03, -0.6), (0.5, 0.03, 0.0))         # top edge at the pivot
_BASES = {"wall": (0x01000800, b"STAT", "Test\\Wall01.nif"),
          "sconce": (0x01000801, b"STAT", "Test\\Sconce01.nif"),
          "chair": (0x01000802, b"STAT", "Test\\Chair01.nif"),
          "lantern": (0x01000803, b"STAT", "Test\\Lantern01.nif"),
          "tree": (0x01000804, b"TREE", "Test\\Tree01.nif"),
          "post": (0x01000805, b"STAT", "Test\\Post01.nif"),
          "sign": (0x01000806, b"STAT", "Test\\Sign01.nif")}
_MESHES = {"wall": _WALL, "sconce": _SCONCE, "chair": _CHAIR, "lantern": _LANTERN,
           "tree": _TREE, "post": _POST, "sign": _SIGN}


def _mine(tmp_path, placed, cells=None, interior=False, land=True, sink=None,
          **options):
    """``placed``: (name, (x, y, z) metres, yaw[, scale]) on one floor; returns
    the mined document with the test meshes injected."""
    kits = {f"vanilla:test/{name}01": _kit(mesh) for name, mesh in _MESHES.items()}
    meshes = {f"vanilla:test/{name}01": mesh for name, mesh in _MESHES.items()}
    meshes[_FLOOR_ID] = _FLOOR
    bases = [(form, kind, model, None) for form, kind, model in _BASES.values()]
    bases.append((0x01000900, b"STAT", "Other\\Floor.nif", _FLOOR_OBND))

    def refs(rows, start):
        return [(start + i, _BASES[name][0], pos, yaw, *extra)
                for i, (name, pos, yaw, *extra) in enumerate(rows)]

    if cells is None:
        refs_in = refs(placed, 0x01000C01) + [(0x01000C00, 0x01000900, (0.0, 0.0, 0.0), 0.0)]
        path = _plugin(tmp_path, bases, refs_in, interior=interior, land=land)
    else:
        grouped = {grid: refs(rows, 0x01000C01 + 0x40 * n)
                   for n, (grid, rows) in enumerate(sorted(cells.items()))}
        path = _plugin(tmp_path, bases, [], cells=grouped, land=land)
    return build_document(kits, Path("/nonexistent"), sink=sink or {},
                          plugins=[("vanilla", path)], meshes=meshes.get, **options)


def test_a_sconce_whose_back_lies_on_a_wall_face_is_wall_with_a_pair(tmp_path):
    placed = []
    for i in range(3):
        placed += [("wall", (10.0 * i - 10.0, 0.0, 0.0), 0.0),
                   ("sconce", (10.0 * i - 10.0 + 0.5, 0.25, 2.0), 0.0)]
    document = _mine(tmp_path, placed, interior=True)
    anchors = document["anchors"]
    assert anchors["vanilla:test/wall01"]["anchorClass"] == "ground"
    assert anchors["vanilla:test/sconce01"]["anchorClass"] == "wall"
    assert [(p["child"], p["parent"], p["n"]) for p in document["pairs"]] == [
        ("vanilla:test/sconce01", "vanilla:test/wall01", 3)]
    assert np.allclose(document["pairs"][0]["offsetM"], (0.5, 0.25, 2.0), atol=1e-3)


def test_the_same_sconce_off_the_wall_is_not_in_contact(tmp_path):
    placed = []
    for i in range(3):
        placed += [("wall", (10.0 * i - 10.0, 0.0, 0.0), 0.0),
                   ("sconce", (10.0 * i - 10.0, 0.45, 2.0), 0.0)]
    document = _mine(tmp_path, placed, interior=True)
    sconce = document["anchors"]["vanilla:test/sconce01"]
    assert (sconce["anchorClass"], sconce["refClasses"]) == ("ground", {"free": 3})
    assert document["pairs"] == []


def test_a_chair_on_the_floor_with_its_back_on_a_wall_is_ground_and_abuts(tmp_path):
    placed = []
    for i in range(3):
        placed += [("wall", (10.0 * i - 10.0, 0.0, 0.0), 0.0),
                   ("chair", (10.0 * i - 10.0, 0.5, 0.0), 0.0)]
    document = _mine(tmp_path, placed, interior=True)
    chair = document["anchors"]["vanilla:test/chair01"]
    assert chair["anchorClass"] == "ground"
    assert chair["abuts"] == {"vanilla:test/wall01": 3}
    assert document["pairs"] == []


def test_a_lantern_whose_hook_touches_a_branch_is_hanging(tmp_path):
    """argonianlanterns03 on three branches of the Hist tree, placed at 0.77."""
    s = 0.77
    placed = [("tree", (0.0, 0.0, 0.0), 0.0, s),
              ("lantern", (4.0 * s, 0.0, 5.2 * s), 0.0),
              ("lantern", (-3.0 * s, 0.0, 5.2 * s), 0.0),
              ("lantern", (0.0, 4.0 * s, 8.2 * s), 0.0)]
    document = _mine(tmp_path, placed)
    lantern = document["anchors"]["vanilla:test/lantern01"]
    assert (lantern["anchorClass"], lantern["n"]) == ("hanging", 3)
    assert [(p["kind"], p["parent"], p["n"], p["parentScale"])
            for p in document["pairs"]] == [("points", "vanilla:test/tree01", 3, 0.77)]


def test_a_sign_whose_top_touches_a_post_arm_across_a_cell_border_is_hanging(tmp_path):
    edge = 4096.0 / UNITS_PER_METRE
    cells = {(0, 0): [("post", (edge - 1.0, 10.0, 0.0), 0.0)],
             (1, 0): [("sign", (edge + 0.2, 10.0, 2.7), 0.0)]}
    document = _mine(tmp_path, [], cells=cells)
    sign = document["anchors"]["vanilla:test/sign01"]
    assert (sign["anchorClass"], sign.get("evidence")) == ("hanging", "thin")
    assert [(p["kind"], p["parent"], p["n"]) for p in document["pairs"]] == [
        ("points", "vanilla:test/post01", 1)]


def test_a_plank_lying_on_the_top_of_a_piece_is_not_what_holds_it_up(tmp_path):
    """Round 15 ruling 1 (kioskbarrierei01, commoncounter01): the walkway
    plank laid over a barrier touches its top, but lies wholly above it, so
    it rests ON the barrier (an abut) and the barrier does not hang from it."""
    _MESHES["plank"] = _box((-1.0, -0.2, 0.0), (1.0, 0.2, 0.1))
    _BASES["plank"] = (0x01000808, b"STAT", "Test\\Plank01.nif")
    try:
        placed = []
        for i in range(3):
            placed += [("sign", (10.0 * i - 10.0, 0.0, 2.0), 0.0),
                       ("plank", (10.0 * i - 10.0, 0.0, 2.0), 0.0)]
        document = _mine(tmp_path, placed, interior=True)
    finally:
        del _MESHES["plank"], _BASES["plank"]
    sign = document["anchors"]["vanilla:test/sign01"]
    assert (sign["anchorClass"], sign["refClasses"], sign.get("restsOnOnly")) == (
        "ground", {"free": 3}, 3), sign
    assert sign["abuts"] == {"vanilla:test/plank01": 3}
    assert document["pairs"] == []


def test_a_railing_whose_foot_is_set_into_a_plank_stands_on_it(tmp_path):
    """Round 16 ruling 1a (kioskbarrierei01): the barrier's foot passes
    through the walkway plank (its lowest point below the plank's, its top
    above the plank's top, contact on the plank's top face): the plank
    supports it, deck on a kit plank; never hanging from it."""
    _MESHES["plank"] = _box((-1.0, -0.2, -0.11), (1.0, 0.2, 0.0))
    _BASES["plank"] = (0x01000808, b"STAT", "Test\\Plank01.nif")
    _MESHES["barrier"] = _box((-0.5, -0.05, -0.15), (0.5, 0.05, 1.0))
    _BASES["barrier"] = (0x01000809, b"STAT", "Test\\Barrier01.nif")
    try:
        placed = []
        for i in range(3):
            placed += [("barrier", (10.0 * i - 10.0, 0.0, 2.0), 0.0),
                       ("plank", (10.0 * i - 10.0, 0.0, 2.0), 0.0)]
        document = _mine(tmp_path, placed, interior=True)
    finally:
        for name in ("plank", "barrier"):
            del _MESHES[name], _BASES[name]
    barrier = document["anchors"]["vanilla:test/barrier01"]
    assert (barrier["anchorClass"], barrier["refClasses"]) == ("deck", {"deck": 3}), barrier
    assert document["pairs"] == []


def test_a_foot_set_into_a_plank_and_touching_the_land_votes_ground(tmp_path):
    """Round 19 ruling 2 (terrain wins for the vote too): the railing set
    into a kit plank whose own lowest point reaches the LAND (-1.14 m) stands
    on the terrain, ground, the plank an abut; the same pair two metres up
    stays deck (fails on the round 18 rule: deck both times)."""
    _MESHES["plank"] = _box((-1.0, -0.2, -0.11), (1.0, 0.2, 0.0))
    _BASES["plank"] = (0x01000808, b"STAT", "Test\\Plank01.nif")
    _MESHES["barrier"] = _box((-0.5, -0.05, -0.15), (0.5, 0.05, 1.0))
    _BASES["barrier"] = (0x01000809, b"STAT", "Test\\Barrier01.nif")
    found = {}
    try:
        for z in (-1.1, 1.0):
            placed = []
            for i in range(3):   # clear of the non-kit floor (+-20 m)
                placed += [("barrier", (30.0 + 10.0 * i, 5.0, z), 0.0),
                           ("plank", (30.0 + 10.0 * i, 5.0, z), 0.0)]
            (tmp_path / str(z)).mkdir()
            barrier = _mine(tmp_path / str(z), placed)["anchors"]["vanilla:test/barrier01"]
            found[z] = (barrier["anchorClass"], barrier["refClasses"],
                        barrier.get("terrainOverNeighbour"),
                        barrier.get("abuts"))
    finally:
        for name in ("plank", "barrier"):
            del _MESHES[name], _BASES[name]
    assert found == {
        -1.1: ("ground", {"ground": 3}, 3, {"vanilla:test/plank01": 3}),
        1.0: ("deck", {"deck": 3}, None, None)}, found


def test_a_counter_in_a_one_mesh_room_stands_on_the_floor_a_ray_finds(tmp_path):
    """Round 16 ruling 1b (commoncounter01 in bauernhaus03innen): the room is
    one mesh whose bounds top is its ceiling; a ray cast down from the
    counter's footprint meets its floor 0.01 m below, so the counter stands."""
    _MESHES["room"] = trimesh.util.concatenate([_box((-5, -5, -0.2), (5, 5, 0.0)),
                                                _box((-5, -5, 4.8), (5, 5, 5.0))])
    _BASES["room"] = (0x0100080A, b"STAT", "Test\\Room01.nif")
    try:
        placed = []
        for i in range(3):
            placed += [("room", (100.0 + 20.0 * i, 0.0, 0.0), 0.0),
                       ("chair", (100.0 + 20.0 * i, 0.0, 0.01), 0.0)]
        document = _mine(tmp_path, placed, interior=True)
    finally:
        del _MESHES["room"], _BASES["room"]
    counter = document["anchors"]["vanilla:test/chair01"]
    assert (counter["anchorClass"], counter["refClasses"]) == ("deck", {"deck": 3}), counter


def test_a_chair_a_little_over_the_floor_a_ray_finds_stands_on_it(tmp_path):
    """Round 18 ruling 1 (wickerchair01 0.085 m over the bamboohut01_int
    floor): a ray-cast floor within FLOOR_SUPPORT_M 0.10 m under the chair
    supports it (deck); 0.15 m over it the chair is free. Round 16 took only
    CONTACT_M 0.03 m: free."""
    _MESHES["room"] = trimesh.util.concatenate([_box((-5, -5, -0.2), (5, 5, 0.0)),
                                                _box((-5, -5, 4.8), (5, 5, 5.0))])
    _BASES["room"] = (0x0100080A, b"STAT", "Test\\Room01.nif")
    try:
        classes = {}
        for gap in (0.085, 0.15):
            placed = []
            for i in range(3):
                placed += [("room", (100.0 + 20.0 * i, 0.0, 0.0), 0.0),
                           ("chair", (100.0 + 20.0 * i, 0.0, gap), 0.0)]
            (tmp_path / str(gap)).mkdir()
            document = _mine(tmp_path / str(gap), placed, interior=True)
            chair = document["anchors"]["vanilla:test/chair01"]
            classes[gap] = (chair["anchorClass"], chair["refClasses"])
    finally:
        del _MESHES["room"], _BASES["room"]
    assert classes == {0.085: ("deck", {"deck": 3}), 0.15: ("ground", {"free": 3})}, classes


def test_terrain_touch_is_read_at_the_lowest_point_not_a_higher_vertex():
    """Round 18 ruling 2: a piece touches the terrain when its own lowest
    point is within TERRAIN_TOUCH_M of the LAND under it. An L-shaped piece
    whose foot stands 0.5 m over a slope while its arm meets the slope
    higher up does not touch it; the same piece lowered onto the slope does."""
    from types import SimpleNamespace
    from .mine_mounts import land_heights_m, touches_terrain
    rows, cols = np.mgrid[0:33, 0:33]
    land = ((rows + cols).astype(np.float32) * 128.0, (0, 0))   # rises 1 m per metre, x and y
    piece = np.asarray(trimesh.util.concatenate([
        _box((0.0, 0.0, 0.0), (0.5, 0.3, 2.0)),
        _box((0.5, 0.0, 1.3), (3.5, 0.3, 1.8))]).vertices)

    def child(z):
        return SimpleNamespace(land=land, rotation=np.eye(3), scale=1.0,
                               origin_m=np.array([0.0, 0.0, z]))
    arm = land_heights_m(*land, np.array([3.5 * UNITS_PER_METRE]), np.array([0.0]))[0]
    assert arm > 0.5 + 1.3                                    # the arm meets the slope
    assert not touches_terrain(child(1.1), piece)             # foot 1.1 m over land <= 0.8 m
    assert touches_terrain(child(0.0), piece)


def test_a_piece_with_side_and_top_contact_is_wall_not_hanging(tmp_path):
    """Round 16 ruling 1c: hanging needs a top contact with no side contact.
    The sign's top touches the post arm (the larger patch) and its end face
    lies on a wall end below its top: wall (round 15 took the larger patch:
    hanging)."""
    placed = []
    for i in range(3):
        x = 10.0 * i - 10.0
        placed += [("post", (x - 1.0, 0.0, 0.0), 0.0),
                   ("sign", (x + 0.2, 0.0, 2.7), 0.0),
                   ("wall", (x + 0.95, 0.0, -1.6), 90.0)]
    document = _mine(tmp_path, placed, interior=True)
    sign = document["anchors"]["vanilla:test/sign01"]
    assert (sign["anchorClass"], sign["refClasses"]) == ("wall", {"wall": 3}), sign


def test_a_door_with_no_frame_contact_hangs_by_its_category_row(tmp_path):
    """Round 16 ruling 2 (impwooddoorsinglesmallload01): a load door with
    nothing within reach takes the door rule's class, never free."""
    _MESHES["door"] = _box((-0.5, -0.05, 0.0), (0.5, 0.05, 2.0))
    _BASES["door"] = (0x0100080B, b"DOOR", "Test\\Door01.nif")
    try:
        placed = [("door", (10.0 * i, 0.0, 5.0), 0.0) for i in range(3)]
        document = _mine(tmp_path, placed)
    finally:
        del _MESHES["door"], _BASES["door"]
    door = document["anchors"]["vanilla:test/door01"]
    assert (door["anchorClass"], door["refClasses"], door.get("hangingFrom")) == (
        "hanging", {"hanging": 3}, "category"), door


def test_the_reference_sample_of_an_asset_does_not_depend_on_the_others(tmp_path):
    """Round 15 ruling 3: a seed per asset. Chairs (sorted before the sconce)
    added to the run leave the sconce's sampled references unchanged."""
    sconces = []
    for i in range(6):
        sconces += [("wall", (10.0 * i - 30.0, 0.0, 0.0), 0.0),
                    ("sconce", (10.0 * i - 30.0, 0.25 if i % 2 else 0.45, 2.0), 0.0)]
    chairs = [("chair", (float(i), 30.0, 0.0), 0.0) for i in range(6)]
    got = []
    for placed in (sconces, chairs + sconces):
        document = _mine(tmp_path, placed, interior=True, sample_max=3, sample_seed=7)
        got.append(document["anchors"]["vanilla:test/sconce01"]["refClasses"])
    assert got[0] == got[1], got


def test_a_thin_water_vote_with_no_contact_takes_the_policy_row(tmp_path):
    """Round 15 ruling 2 (windchimehavok): one reference in a water column,
    touching nothing, with no mined waterline, is ambiguous and takes the
    policy row: here no asset or kit row, so ground."""
    pad = [(0x01000C01, _BASES["lantern"][0], (0.0, 0.0, -0.5), 0.0)]
    path = _plugin_file(tmp_path / "Chime.esm", _ALL_BASES,
                        {(0, 0): {"refs": pad, "land": _LAND_OFFSET, "water": 0.0}})
    chime = _mine_files([path])["anchors"]["vanilla:test/lantern01"]
    assert (chime["anchorClass"], chime["evidence"], chime["votedClass"],
            chime["refClasses"]) == ("ground", "policy", "water", {"water": 1}), chime


_PUBLISHED_KITS = Path(__file__).resolve().parents[3] / "apps/world-studio/public/kits"


def test_a_candle_inside_the_lantern_is_not_what_holds_it_up(tmp_path):
    """Golden run 1: every Mud Mother lantern carries argoniancandle01 inside
    its cage, and that candle read as the lantern's support (deck)."""
    _MESHES["candle"] = _box((-0.03, -0.03, -0.5), (0.03, 0.03, -0.3))
    _BASES["candle"] = (0x01000807, b"STAT", "Test\\Candle01.nif")
    try:
        s = 0.77
        placed = [("tree", (0.0, 0.0, 0.0), 0.0, s)]
        for x, z in ((4.0, 5.2), (-3.0, 5.2), (2.0, 5.2)):
            placed += [("lantern", (x * s, 0.0, z * s), 0.0),
                       ("candle", (x * s, 0.0, z * s), 0.0)]
        document = _mine(tmp_path, placed)
    finally:
        del _MESHES["candle"], _BASES["candle"]
    lantern = document["anchors"]["vanilla:test/lantern01"]
    assert (lantern["anchorClass"], lantern.get("hangingFrom")) == ("hanging", "crown"), lantern


# --- water (16h round 7 placed-water band; round 9 water column) ---------- #
def _columned(z_m, water_m, land_m=-1.0):
    land = (np.full((33, 33), land_m * UNITS_PER_METRE, dtype=np.float32), (0, 0))
    wet = water_column(land, None, water_m, np.array([1.0, 1.0, z_m]))
    return ChildRef("vanilla:test/chair01", np.eye(3), np.array([1.0, 1.0, z_m]), 1.0,
                    land, [], water_m=water_m, water_column=wet)


def test_the_water_column_is_water_above_the_floor_at_the_pivot():
    """Round 9: the floor is the LAND, else the flat placeholder or worldspace
    default; the old 0.10 m cell-water band is gone (depth does not matter)."""
    assert classify_reference(_columned(-0.8, 0.0), {}, None)[0] == "water"
    assert classify_reference(_columned(0.15, 0.0), {}, None)[0] == "water"
    assert classify_reference(_columned(0.05, 0.0, land_m=0.5), {}, None)[0] == "free"
    origin = np.array([0.0, 0.0, -5.0])
    assert water_column(None, -29.13, 0.0, origin) and not water_column(None, None, 0.0, origin)
    assert not water_column(None, -29.13, None, origin)


def test_a_pivot_within_ten_centimetres_of_a_placed_water_mesh_floats(tmp_path):
    """BM&V floats its swamp on Skyrim's water planes (meshes/water/), not on
    the cell water: a pivot within 0.10 m of the plane's top is water."""
    _BASES["water"] = (0x01000808, b"ACTI", "Water\\Water1024.nif")
    try:
        got = {}
        for z in (5.07, 5.3):
            bases = [(form, kind, model, None) for form, kind, model in _BASES.values()]
            bases[-1] = (*_BASES["water"], (-512, -512, 0, 512, 512, 0))
            refs = [(0x01000C01, _BASES["water"][0], (0.0, 0.0, 5.0), 0.0),
                    (0x01000C02, _BASES["chair"][0], (1.0, 1.0, z), 0.0)]
            path = _plugin(tmp_path, bases, refs)
            kits = {"vanilla:test/chair01": _kit(_CHAIR)}
            document = build_document(kits, Path("/nonexistent"), sink={},
                                      plugins=[("vanilla", path)],
                                      meshes={"vanilla:test/chair01": _CHAIR}.get)
            got[z] = document["anchors"]["vanilla:test/chair01"]["refClasses"]
    finally:
        del _BASES["water"]
    assert got == {5.07: {"water": 1}, 5.3: {"free": 1}}


def test_an_interior_shell_held_only_by_shells_is_ground_on_the_shell_datum(tmp_path):
    """Round 7 rule (a): room shells touch only other shells (the chair stands
    in for a second shell piece); a sconce (not a shell) on a wall stays a wall."""
    _SCONCE_KIT = _MESHES["sconce"]
    placed = []
    for i in range(3):
        placed += [("wall", (10.0 * i - 10.0, 0.0, 5.0), 0.0),
                   ("chair", (10.0 * i - 10.0 + 2.25, 0.0, 5.0), 0.0),
                   ("wall", (10.0 * i - 10.0, 20.0, 5.0), 0.0),
                   ("sconce", (10.0 * i - 10.0 + 0.5, 20.25, 7.0), 0.0)]
    kits = {f"vanilla:test/{name}01": _kit(mesh) for name, mesh in _MESHES.items()}
    kits["vanilla:test/wall01"]["category"] = "architecture"
    kits["vanilla:test/chair01"]["category"] = "architecture"
    kits["vanilla:test/sconce01"]["category"] = "clutter"
    bases = [(form, kind, model, None) for form, kind, model in _BASES.values()]
    refs = [(0x01000C01 + i, _BASES[name][0], pos, yaw)
            for i, (name, pos, yaw) in enumerate(placed)]
    path = _plugin(tmp_path, bases, refs, interior=True)
    document = build_document(kits, Path("/nonexistent"), sink={},
                              plugins=[("vanilla", path)],
                              meshes={f"vanilla:test/{n}01": m for n, m in _MESHES.items()}.get)
    wall = document["anchors"]["vanilla:test/wall01"]
    assert (wall["anchorClass"], wall.get("support")) == ("ground", "interior-zero"), wall
    assert document["anchors"]["vanilla:test/sconce01"]["anchorClass"] == "wall"
    assert _SCONCE_KIT is _MESHES["sconce"]


def _mine_interior_shells(tmp_path, placed):
    kits = {f"vanilla:test/{name}01": _kit(mesh) for name, mesh in _MESHES.items()}
    kits["vanilla:test/wall01"]["category"] = "architecture"
    kits["vanilla:test/chair01"]["category"] = "architecture"
    kits["vanilla:test/sconce01"]["category"] = "clutter"
    bases = [(form, kind, model, None) for form, kind, model in _BASES.values()]
    refs = [(0x01000C01 + i, _BASES[name][0], pos, yaw)
            for i, (name, pos, yaw) in enumerate(placed)]
    path = _plugin(tmp_path, bases, refs, interior=True)
    return build_document(kits, Path("/nonexistent"), sink={},
                          plugins=[("vanilla", path)],
                          meshes={f"vanilla:test/{n}01": m for n, m in _MESHES.items()}.get)


def test_a_shell_touching_only_copies_of_itself_is_on_the_shell_datum(tmp_path):
    """Round 8: a run of identical wall pieces is structure; contact with a copy
    of the same asset counts as a shell contact (and never makes a pair)."""
    placed = [("wall", (4.0 * i, 0.0, 5.0), 0.0) for i in range(3)]
    document = _mine_interior_shells(tmp_path, placed)
    wall = document["anchors"]["vanilla:test/wall01"]
    assert (wall["refClasses"], wall.get("support")) == ({"ground": 3}, "interior-zero"), wall
    assert document["pairs"] == []


def test_kit_clutter_on_a_shell_does_not_unmake_the_structure(tmp_path):
    """Round 8: a wall touching another shell and carrying a sconce is still
    structure; only its shell contacts are judged."""
    placed = []
    for i in range(3):
        x = 10.0 * i - 10.0
        placed += [("wall", (x, 0.0, 5.0), 0.0),
                   ("chair", (x + 2.25, 0.0, 5.0), 0.0),
                   ("sconce", (x + 0.5, 0.25, 7.0), 0.0)]
    document = _mine_interior_shells(tmp_path, placed)
    wall = document["anchors"]["vanilla:test/wall01"]
    assert (wall["refClasses"], wall.get("support")) == ({"ground": 3}, "interior-zero"), wall
    assert document["anchors"]["vanilla:test/sconce01"]["anchorClass"] == "wall"



def _shell_on(parent_shell: bool, child_shell: bool = True, floor=None) -> ChildRef:
    """An interior piece standing on a kit piece (``parent_shell``) and touching
    a non-kit static at its side."""
    offset = ((0.0, 0.0, 0.0), 0.0, 1.0)
    links = [("under", "vanilla:test/hall02", True, offset, False, False, parent_shell, False),
             ("side", "plugin-static:other/rock.nif", False, offset, False, False, False, False)]
    return ChildRef("vanilla:test/hall01", np.eye(3), np.zeros(3), 1.0, None, links,
                    floor=floor, interior=True, shell=child_shell)


def test_a_shell_standing_on_a_kit_shell_is_on_the_shell_datum():
    """Round 13 decision 1 (imphall4way01 voted deck 14 / ground 12): support
    from below by a kit shell makes an interior shell ground/interior-zero even
    when it also touches a non-kit static; a non-shell on a shell stays deck."""
    contacts = {"under": ("under", 40), "side": ("side", 10)}
    vertices = np.array([[0.0, 0.0, 0.0], [1.0, 1.0, 1.0]])
    anchor, _mounts, _abuts, source = classify_reference(_shell_on(True), contacts, vertices)
    assert (anchor, source) == ("ground", "interior-zero")
    assert classify_reference(_shell_on(True, child_shell=False), contacts, vertices)[0] == "deck"
    # Round 17 ruling 1: kit clutter never supports a shell (was deck in round
    # 13): the shell is held by the rock at its side.
    assert classify_reference(_shell_on(False), contacts, vertices)[0] == "wall"
    # The floor top right under it is a kit shell (third item) or not.
    assert classify_reference(_shell_on(True, floor=(0.0, True, True)), contacts,
                              vertices)[3] == "interior-zero"
    assert classify_reference(_shell_on(True, floor=(0.0, True, False)), contacts,
                              vertices)[0] == "deck"


def test_a_shell_among_vanilla_dungeon_statics_is_on_the_shell_datum():
    """Round 14 ruling 2 (impfreewall01 voted wall 164 / ground 95 among the
    vanilla floor and pillar statics): a vanilla dungeon-kit static is a shell,
    so an interior shell touching only kit shells and those statics is
    ground/interior-zero; one other static at its side keeps it a wall."""
    offset = ((0.0, 0.0, 0.0), 0.0, 1.0)

    def free_wall(static_shell: bool) -> ChildRef:
        links = [("pillar", "vanilla:test/pillar01", True, offset, False, False, True, False),
                 ("floor", "plugin-static:dungeons/imperial/clutterkits/impfloorpiece02.nif",
                  False, offset, False, False, static_shell, False)]
        return ChildRef("vanilla:test/freewall01", np.eye(3), np.zeros(3), 1.0, None, links,
                        interior=True, shell=True)
    contacts = {"pillar": ("side", 30), "floor": ("side", 20)}
    vertices = np.array([[0.0, 0.0, 0.0], [1.0, 1.0, 1.0]])
    assert classify_reference(free_wall(True), contacts, vertices)[::3] == (
        "ground", "interior-zero")
    assert classify_reference(free_wall(False), contacts, vertices)[0] == "wall"
    from .mine_mounts import is_vanilla_shell
    assert is_vanilla_shell("plugin-static:dungeons/imperial/clutterkits/impfloorchunk01.nif",
                            "vanilla")
    assert not is_vanilla_shell("plugin-static:dungeons/imperial/clutterkits/x.nif", "bmv")
    assert not is_vanilla_shell("plugin-static:effects/fxcobwebcorner01.nif", "vanilla")


def test_kit_clutter_never_supports_a_shell():
    """Round 17 ruling 1 (mudhut01intnew set into hayscatter04): kit clutter
    under a shell, or the shell's foot set into it, is not support; the same
    contact holds a non-shell piece (deck), and a kit shell still holds it."""
    offset = ((0.0, 0.0, 0.0), 0.0, 1.0)
    vertices = np.array([[0.0, 0.0, 0.0], [1.0, 1.0, 1.0]])
    for kind in ("under", "set-into"):
        def piece(child_shell: bool, parent_shell: bool) -> ChildRef:
            links = [("hay", "vanilla:test/hay01", True, offset, False, False,
                      parent_shell, False)]
            return ChildRef("vanilla:test/hut01", np.eye(3), np.zeros(3), 1.0, None,
                            links, interior=True, shell=child_shell)
        contacts = {"hay": (kind, 40)}
        anchor, _mounts, abutted, _source = classify_reference(
            piece(True, False), contacts, vertices)
        assert (anchor, abutted) == ("free", ["vanilla:test/hay01"]), kind
        assert classify_reference(piece(False, False), contacts, vertices)[0] == "deck"
        assert classify_reference(piece(True, True), contacts, vertices)[0] == "ground"


def test_effect_and_spell_statics_are_never_candidates(tmp_path):
    """Round 17 ruling 1 (lantern02_blue set into maginvlightspellart): a
    non-kit static under magic/ or effects/ holds nothing up; round 20 fix (c):
    nor one under sky/ (clouddistant03 under the stockade tops); the same box
    under another folder does."""
    art = _box((-1.0, -1.0, 0.0), (1.0, 1.0, 1.0))
    got = {}
    for folder in ("Magic", "Effects", "Sky", "Other"):
        kits = {"vanilla:test/chair01": _kit(_CHAIR)}
        static_id = f"plugin-static:{folder.lower()}/art01.nif"
        meshes = {"vanilla:test/chair01": _CHAIR, static_id: art}
        bases = [(_BASES["chair"][0], b"STAT", "Test\\Chair01.nif", None),
                 (0x01000900, b"STAT", f"{folder}\\Art01.nif", (-70, -70, 0, 70, 70, 70))]
        refs = []
        for i in range(3):
            refs += [(0x01000C01 + 2 * i, 0x01000900, (10.0 * i, 0.0, 0.0), 0.0),
                     (0x01000C02 + 2 * i, _BASES["chair"][0], (10.0 * i, 0.0, 1.0), 0.0)]
        path = _plugin(tmp_path, bases, refs, interior=True)
        document = build_document(kits, Path("/nonexistent"), sink={},
                                  plugins=[("vanilla", path)], meshes=meshes.get)
        got[folder] = document["anchors"]["vanilla:test/chair01"]["refClasses"]
    assert got == {"Magic": {"free": 3}, "Effects": {"free": 3}, "Sky": {"free": 3},
                   "Other": {"ground": 3}}


def test_policy_rows_decide_asset_row_always_kit_row_when_ambiguous():
    """Round 17 ruling 2 (cedartree3 wall 231/367, share 0.63): an asset row
    naming a class decides whatever the share (fails on the round-12 rule,
    ambiguous votes only); a kit row naming one decides only an ambiguous
    vote of an asset with no asset row; a row naming no class never does."""
    from .mine_mounts import policy_override
    clear = {"n": 367, "share": 0.629}
    ambiguous = {"n": 422, "share": 0.564}
    assert policy_override("wall", clear, "water-zero", "direct") == "water"
    assert policy_override("water", clear, "water-zero", "direct") is None
    assert policy_override("wall", clear, None, "water-zero") is None
    assert policy_override("deck", ambiguous, None, "water-zero") == "water"
    assert policy_override("deck", ambiguous, None, "route-structure") is None
    assert policy_override("deck", ambiguous, "direct", "water-zero") is None
    assert policy_override("ground", {"n": 2, "share": 1.0}, None, "deck") == "deck"


def test_a_water_class_waterline_comes_from_its_column_else_the_policy_row():
    """Round 17 ruling 3: cell water minus pivot, median over n >= 3 defining-
    file column references; below that the policy row's fallbackWaterlineM
    (asset row, else kit row), evidence policy. Round 18 ruling 3: never
    the row's ground sink (fallbackSinkM); a row with no fallbackWaterlineM
    gives no waterline."""
    from .mine_mounts import water_column_waterline
    inventory = {"policies": {"water-zero": {"fallbackSinkM": 0.5, "fallbackWaterlineM": 0.0},
                              "dug-in": {"fallbackSinkM": 0.6, "fallbackWaterlineM": 0.35},
                              "direct": {"fallbackSinkM": 0.08}}}
    column = water_column_waterline([0.4, 0.6, 0.5], None, "stilt", inventory)
    assert (column["p50"], column["n"], column["evidence"]) == (0.5, 3, "column")
    assert water_column_waterline([0.4], "water-zero", "dug-in", inventory) == {
        "p50": 0.0, "n": 1, "evidence": "policy", "policyId": "water-zero"}
    assert water_column_waterline([], None, "dug-in", inventory)["p50"] == 0.35
    assert water_column_waterline([], None, "direct", inventory) is None


def test_a_worker_reports_the_meshes_it_could_not_load():
    """Round 17 ruling 4: meshesMissing is counted in each contact worker and
    summed by the parent (the round-16 record read only the parent's library,
    which loads no parent mesh in a multi-process run)."""
    from collections import Counter
    from .mine_mounts import _init_worker, _measure_task

    class Library:
        missing = Counter()

        def __call__(self, asset_id):
            self.missing[asset_id] += 1
            return None
    _init_worker(Library())
    key = ("a:child", "plugin-static:gone.nif", 0)
    results, missing = _measure_task(([key], {key: (np.eye(3), np.zeros(3), 1.0)}, set()))
    assert results == {key: None} and set(missing) == {"a:child", "plugin-static:gone.nif"}


def test_a_policy_decided_deck_needs_no_deck_reference():
    """Round 13: an ambiguous vote decided by a ``deck`` policy row passes the
    contract check that a voted deck needs a deck reference."""
    from .mine_mounts import POLICY_ANCHOR, validate_anchors
    assert POLICY_ANCHOR["deck"] == "deck"
    anchors = {"a": {"anchorClass": "deck", "anchorClassEvidence": "plugin",
                     "evidence": "policy", "refClasses": {"ground": 2, "wall": 1}},
               "b": {"anchorClass": "deck", "anchorClassEvidence": "plugin",
                     "refClasses": {"ground": 2}}}
    assert validate_anchors(anchors) == ["b: deck with no reference in contact"]


def test_treehouse_connector_carries_the_deck_policy():
    """Round 13 decision 3: the Telvanni treehouse connector rests on its host
    by design, so its ambiguous vote takes deck (a policy row with its why,
    anchor-only for the mesh tell)."""
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "asset-pipeline"))
    from pipeline.mesh_ground_line import ANCHOR_ONLY_POLICIES
    from pipeline.placement_metadata import load_inventory, validate_policy_inventory
    from .mine_mounts import policy_anchor_class
    inventory = load_inventory()
    key = "bmv:telvanni/tel_int_connector_01"
    assert inventory["assetPolicies"][key] == "deck"
    assert inventory["assetPolicyEvidence"][key]
    assert "deck" in ANCHOR_ONLY_POLICIES
    assert policy_anchor_class(key, "bmv-treehouse-int", inventory) == "deck"
    assert validate_policy_inventory(inventory) == []


def test_aquatic_plants_carry_the_water_zero_policy():
    """Round 13 decision 2: every aquatic-plant asset has a water-zero row with
    its why (kelptallstatic01 leaned on rocks)."""
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "asset-pipeline"))
    from pipeline.placement_metadata import load_inventory
    inventory = load_inventory()
    aquatic = {asset["id"].casefold() for path in _RAW_KITS.glob("*.kit.json")
               for asset in _record(path).get("assets", [])
               if asset.get("category") == "aquatic-plant"}
    if not aquatic:
        pytest.skip("raw kit build absent")
    wrong = sorted(a for a in aquatic
                   if inventory["assetPolicies"].get(a) != "water-zero"
                   or not inventory["assetPolicyEvidence"].get(a))
    assert wrong == []

# --- the sink record (16h round 6) ---------------------------------------- #
def test_mined_sink_record_carries_its_method_and_samples():
    document = _record(SINK_RECORD)
    assert document["schemaVersion"] == 1
    assert "designedSinkM = groundZ - pivotZ" in document["method"]
    assert all(row["n"] >= 3 for row in document["assets"].values()
               if row.get("evidence") == "plugin")


def test_the_record_carries_the_mesh_sill_so_both_writers_agree():
    """dockstrsol01 was once all waterline: its record carries a measured sink
    (plugin samples since round 9 reads master bases, else the mesh sill),
    never the 0.25 m plinth fallback one writer used to pick."""
    row = _record(SINK_RECORD)["assets"]["vanilla:architecture/docks/dockstrsol01"]
    assert row["evidence"] in ("plugin", "mesh-sill") and "p50" in row, row
    assets = {"a:x/plugin": {"p25": 0.1, "p50": 0.2, "p75": 0.3, "n": 5, "iqrM": 0.2,
                             "slopeTermMPerDeg": None, "evidence": "plugin"}}
    kits = {"a:x/plugin": {}, "b:x/plugin": {}, "a:y/sill": {}, "a:z/none": {}}
    counts = complete_record(assets, kits, {"a:y/sill": {"tell": "post-foot", "valueM": -1.5}},
                             bases={})
    assert counts == {"base": 0, "swap": 1, "mesh-sill": 1, "plugin-spread": 0}
    assert assets["b:x/plugin"]["evidence"] == "swap:a:x/plugin"
    assert assets["a:y/sill"]["p50"] == -1.5 and "a:z/none" not in assets


def test_a_composite_shaped_like_its_base_piece_takes_the_base_plugin_sink():
    """Round 14 ruling 3 (farmhouse01-with-door: door-sill -1.82 m, its base
    farmhouse01 -0.05 m from 20 placements, identical bounds and origin): a
    composite whose sizeM and originOffsetM equal its base piece's takes the
    base's plugin sink; one with bounds of its own (a quay run) keeps its tell."""
    plugin = {"p25": -0.5, "p50": -0.05, "p75": 0.9, "n": 20, "iqrM": 1.4,
              "slopeTermMPerDeg": 0.1, "evidence": "plugin"}
    shape = {"sizeM": [20.0, 10.0, 10.5], "originOffsetM": [10.0, 5.0, 1.8]}
    kits = {"v:house": dict(shape), "composite:house-door": dict(shape),
            "v:deck": {"sizeM": [7.0, 4.0, 3.0], "originOffsetM": [3.5, 2.0, 2.0]},
            "composite:quay": {"sizeM": [7.0, 11.0, 3.0], "originOffsetM": [3.5, 9.0, 2.0]}}
    assets = {"v:house": dict(plugin), "v:deck": dict(plugin)}
    tells = {"composite:house-door": {"tell": "door-sill", "valueM": -1.82},
             "composite:quay": {"tell": "deck-top", "valueM": -0.31}}
    counts = complete_record(assets, kits, tells,
                             bases={"composite:house-door": "v:house", "composite:quay": "v:deck"})
    assert counts == {"base": 1, "swap": 0, "mesh-sill": 1, "plugin-spread": 0}
    door = assets["composite:house-door"]
    assert (door["p50"], door["n"], door["evidence"]) == (-0.05, 20, "base:v:house")
    assert (assets["composite:quay"]["p50"], assets["composite:quay"]["evidence"]) == (
        -0.31, "mesh-sill")


def test_farmhouse_with_door_is_a_plinth_house_with_its_base_sink():
    """Round 14: a plinth row, not stilt (it has no deck on legs); the record
    carries the base piece's plugin sink."""
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "asset-pipeline"))
    from pipeline.placement_metadata import load_inventory
    composite = "composite:farmhouse/farmhouse01-with-door"
    assert load_inventory()["assetPolicies"][composite] == "plinth"
    row = _record(SINK_RECORD)["assets"][composite]
    base = _record(SINK_RECORD)["assets"]["vanilla:architecture/farmhouse/farmhouse01"]
    assert row["evidence"] == "base:vanilla:architecture/farmhouse/farmhouse01"
    assert (row["p50"], row["n"]) == (base["p50"], base["n"])


def test_one_asset_carries_one_recorded_sink_in_every_published_kit():
    """Round 6: 18 assets carried a mesh-sill in one kit and the policy
    fallback in another. Every recorded sink is now the same in every kit; a
    policy fallback follows the kit's authored policy (placement-policies.json)."""
    sinks = defaultdict(set)
    for path in sorted(_PUBLISHED_KITS.glob("*.kit.json")):
        for asset in _record(path).get("assets", []):
            sink = asset.get("designedSinkM") or {}
            if sink.get("evidence") != "policy-fallback":
                sinks[asset["id"]].add(json.dumps(sink, sort_keys=True))
    assert [asset_id for asset_id, values in sorted(sinks.items()) if len(values) > 1] == []


_LAND_OFFSET = -10.0
"""Test LAND base height in VHGT steps (x 8 units = -1.14 m), one vertex raised
so it is real terrain, not a flat placeholder."""


def _land(form_id: int) -> bytes:
    deltas = [0] * (33 * 33)
    deltas[-1] = 1
    vhgt = struct.pack("<f", _LAND_OFFSET) + struct.pack(f"<{len(deltas)}b", *deltas) + b"\0\0\0"
    return record(b"LAND", form_id, sub(b"VHGT", vhgt))


def _plugin(tmp_path, bases, refs, cells=None, interior=False, land=True) -> Path:
    """``bases``: (form id, type, model, OBND or None); ``refs``: (form id,
    base, (x, y, z) metres, yawDeg[, scale]) in one exterior cell (0, 0), or
    ``cells``: {(gx, gy): refs} for several; ``land`` gives each exterior
    cell a real LAND at -1.14 m."""
    header = sub(b"HEDR", struct.pack("<fiI", 1.7, 10, 0x800))
    by_type: dict[bytes, bytes] = {}
    for form_id, kind, model, obnd in bases:
        body = sub(b"MODL", cstr(model))
        if obnd is not None:
            body += sub(b"OBND", struct.pack("<6h", *obnd))
        by_type[kind] = by_type.get(kind, b"") + record(kind, form_id, body)
    tops = b"".join(group(kind, GT_TOP, body) for kind, body in by_type.items())
    blocks = b""
    for index, (grid, cell_refs) in enumerate(sorted((cells or {(0, 0): refs}).items())):
        body = _land(0x01000D00 + index) if land else b""
        for form_id, base, pos, yaw, *scale in cell_refs:
            fields = sub(b"NAME", struct.pack("<I", base)) + sub(
                b"DATA", struct.pack("<6f", *(v * UNITS_PER_METRE for v in pos),
                                     0.0, 0.0, math.radians(yaw)))
            if scale:
                fields += sub(b"XSCL", struct.pack("<f", scale[0]))
            body += record(b"REFR", form_id, fields)
        cell_id = 0x01000A00 + index
        label = struct.pack("<I", cell_id)
        children = group(label, GT_CELL_CHILDREN, group(label, GT_CELL_TEMPORARY, body))
        blocks += record(b"CELL", cell_id, sub(b"XCLC", struct.pack("<iiI", *grid, 0)))
        blocks += children
    if interior:
        # One interior cell (no LAND; the floor is the lowest static top).
        label = struct.pack("<I", 0x01000A00)
        body = b"".join(record(b"REFR", form_id, sub(b"NAME", struct.pack("<I", base)) + sub(
            b"DATA", struct.pack("<6f", *(v * UNITS_PER_METRE for v in pos),
                                 0.0, 0.0, math.radians(yaw)))) for form_id, base, pos, yaw, *_ in refs)
        cell = record(b"CELL", 0x01000A00, sub(b"EDID", cstr("TestHall")))
        cell += group(label, GT_CELL_CHILDREN, group(label, GT_CELL_TEMPORARY, body))
        tree = group(b"CELL", GT_TOP, group(struct.pack("<i", 0), 2,
                                            group(struct.pack("<i", 0), 3, cell)))
        path = tmp_path / "shapes.esp"
        path.write_bytes(record(b"TES4", 0, header) + tops + tree)
        return path
    world = record(b"WRLD", 0x01000B00, sub(b"EDID", cstr("Test")))
    tree = group(b"WRLD", GT_TOP, world + group(
        struct.pack("<I", 0x01000B00), GT_WORLD_CHILDREN,
        group(struct.pack("<i", 0), GT_EXT_CELL_BLOCK,
              group(struct.pack("<i", 0), GT_EXT_CELL_SUBBLOCK, blocks))))
    path = tmp_path / "shapes.esp"
    path.write_bytes(record(b"TES4", 0, header) + tops + tree)
    return path


def _plugin_file(path: Path, bases, cells, masters=(), world=0x01000B00,
                 cell_base=0x01000A00) -> Path:
    """A plugin with ``masters`` (MAST), its own ``bases`` (form id, type,
    model, OBND or None) and exterior ``cells``: {grid: {"refs": [(form id,
    base, (x, y, z) m, yaw)], "land": VHGT offset or None, "water": m or None}}
    in worldspace ``world`` (a master's through its master index)."""
    header = sub(b"HEDR", struct.pack("<fiI", 1.7, 10, 0x800))
    for master in masters:
        header += sub(b"MAST", cstr(master)) + sub(b"DATA", b"\0" * 8)
    by_type: dict[bytes, bytes] = {}
    for form_id, kind, model, obnd in bases:
        body = sub(b"MODL", cstr(model))
        if obnd is not None:
            body += sub(b"OBND", struct.pack("<6h", *obnd))
        by_type[kind] = by_type.get(kind, b"") + record(kind, form_id, body)
    tops = b"".join(group(kind, GT_TOP, body) for kind, body in by_type.items())
    blocks = b""
    for index, (grid, cell) in enumerate(sorted(cells.items())):
        body = b""
        if cell.get("land") is not None:
            deltas = [0] * (33 * 33)
            deltas[-1] = 1
            vhgt = (struct.pack("<f", cell["land"]) + struct.pack(f"<{len(deltas)}b", *deltas)
                    + b"\0\0\0")
            body += record(b"LAND", cell_base + 0x100 + index, sub(b"VHGT", vhgt))
        for form_id, base, pos, yaw in cell.get("refs", ()):
            body += record(b"REFR", form_id, sub(b"NAME", struct.pack("<I", base)) + sub(
                b"DATA", struct.pack("<6f", *(v * UNITS_PER_METRE for v in pos),
                                     0.0, 0.0, math.radians(yaw))))
        cell_id = cell_base + index
        fields = sub(b"XCLC", struct.pack("<iiI", *grid, 0))
        if cell.get("water") is not None:
            fields += sub(b"XCLW", struct.pack("<f", cell["water"] * UNITS_PER_METRE))
        label = struct.pack("<I", cell_id)
        blocks += record(b"CELL", cell_id, fields)
        blocks += group(label, GT_CELL_CHILDREN, group(label, GT_CELL_TEMPORARY, body))
    world_rec = record(b"WRLD", world, sub(b"EDID", cstr("Test"))) if not masters else b""
    tree = group(b"WRLD", GT_TOP, world_rec + group(
        struct.pack("<I", world), GT_WORLD_CHILDREN,
        group(struct.pack("<i", 0), GT_EXT_CELL_BLOCK,
              group(struct.pack("<i", 0), GT_EXT_CELL_SUBBLOCK, blocks))))
    path.write_bytes(record(b"TES4", 0, header) + tops + tree)
    return path


def _mine_files(files, kits_of=("wall", "sconce", "chair", "lantern")):
    kits = {f"vanilla:test/{name}01": _kit(_MESHES[name]) for name in kits_of}
    meshes = {f"vanilla:test/{name}01": _MESHES[name] for name in kits_of}
    return build_document(kits, Path("/nonexistent"), sink={},
                          plugins=[("vanilla", path) for path in files], meshes=meshes.get)


_ALL_BASES = [(form, kind, model, None) for form, kind, model in _BASES.values()]


def _master_form(name: str) -> int:
    """A master's base as a plugin whose master index 0 is that master sees it."""
    return _BASES[name][0] & 0xFFFFFF


def test_a_master_defined_base_is_mined_beside_the_master_cells_refs(tmp_path):
    """Round 9 (a)+(b): Black Marsh North places Black Marsh.esm's bases in
    Black Marsh.esm's cells. The child's sconces (a master base) are mined, and
    the master's walls in the same cell are their neighbours; the child's cell
    override carries no LAND, so the master's LAND stands."""
    walls = [(0x01000C01 + i, _BASES["wall"][0], (10.0 * i - 10.0, 0.0, -1.14), 0.0)
             for i in range(3)]          # standing on the LAND
    master = _plugin_file(tmp_path / "Master.esm", _ALL_BASES,
                          {(0, 0): {"refs": walls, "land": _LAND_OFFSET}})
    sconces = [(0x01000C11 + i, _master_form("sconce"), (10.0 * i - 10.0 + 0.5, 0.25, 2.0), 0.0)
               for i in range(3)]
    child = _plugin_file(tmp_path / "Child.esp", [], {(0, 0): {"refs": sconces}},
                         masters=("Master.esm",), world=0x00000B00, cell_base=0x00000A00)
    document = _mine_files([child, master])            # load order sorts .esm first
    sconce = document["anchors"]["vanilla:test/sconce01"]
    assert (sconce["anchorClass"], sconce["n"]) == ("wall", 3), sconce
    assert [(p["child"], p["parent"], p["n"]) for p in document["pairs"]] == [
        ("vanilla:test/sconce01", "vanilla:test/wall01", 3)]
    assert (document["childRefs"], document["childRefsDefiningFile"],
            document["childRefsOtherFile"]) == (6, 3, 3)


def test_the_last_land_override_wins(tmp_path):
    """Round 9 (b): chairs 3.2 m down are buried under the master's LAND
    (-1.14 m: ground by burial, round 14) and stand above the child's
    override LAND (-4.57 m: classed by contact)."""
    chairs = [(0x01000C01 + i, _BASES["chair"][0], (float(i), 0.0, -3.2), 0.0)
              for i in range(3)]
    master = _plugin_file(tmp_path / "Master.esm", _ALL_BASES,
                          {(0, 0): {"refs": chairs, "land": _LAND_OFFSET}})
    alone = _mine_files([master])["anchors"]["vanilla:test/chair01"]
    assert (alone["n"], alone["buriedGround"]) == (3, 3), alone
    child = _plugin_file(tmp_path / "Child.esp", [], {(0, 0): {"land": -40.0}},
                         masters=("Master.esm",), world=0x00000B00, cell_base=0x00000A00)
    chair = _mine_files([child, master])["anchors"]["vanilla:test/chair01"]
    assert (chair["n"], chair.get("buriedGround")) == (3, None), chair


def test_a_piece_in_a_water_column_with_no_contact_is_water(tmp_path):
    """Round 10: lily pads hang 0.5 m under their pivot, 0.5 m under the cell
    water, clear of the lake bed (LAND -1.14 m): no contact, so the column
    holds them up; without the water they are free (ground)."""
    pads = [(0x01000C01 + i, _BASES["lantern"][0], (float(i), 0.0, -0.5), 0.0)
            for i in range(3)]
    got = {}
    for water in (0.0, None):
        path = _plugin_file(tmp_path / "Pads.esm", _ALL_BASES,
                            {(0, 0): {"refs": pads, "land": _LAND_OFFSET, "water": water}})
        anchor = _mine_files([path])["anchors"]["vanilla:test/lantern01"]
        got[water] = anchor["refClasses"]
        if water is not None:
            # Round 17 ruling 3: no sink waterline, so the column gives it.
            assert anchor["waterline"] == {"p50": 0.5, "n": 3, "iqrM": 0.0,
                                           "evidence": "column"}, anchor
    assert got == {0.0: {"water": 3}, None: {"free": 3}}


def test_terrain_contact_on_submerged_ground_is_water(tmp_path):
    """Round 11: contacts decide first, and a foot on the bed under the water
    stands in the water; the same feet on dry ground stand on the ground."""
    feet = [(0x01000C01 + i, _BASES["lantern"][0], (float(i), 0.0, -0.62), 0.0)
            for i in range(3)]
    path = _plugin_file(tmp_path / "Bed.esm", _ALL_BASES,
                        {(0, 0): {"refs": feet, "land": _LAND_OFFSET, "water": 0.0}})
    assert _mine_files([path])["anchors"]["vanilla:test/lantern01"]["refClasses"] == {
        "water": 3}
    path = _plugin_file(tmp_path / "Bed.esm", _ALL_BASES,
                        {(0, 0): {"refs": feet, "land": _LAND_OFFSET, "water": -2.0}})
    assert _mine_files([path])["anchors"]["vanilla:test/lantern01"]["refClasses"] == {
        "ground": 3}


def test_the_defining_file_votes_while_it_has_three_usable_refs(tmp_path):
    """Round 10 (wrfencestr01): the master places three sconces on walls;
    another plugin places five copies of the master's sconce on the ground.
    The master's three decide (wall); with only two of its own, all vote."""
    def run(own_count):
        walls, sconces = [], []
        for i in range(3):
            walls.append((0x01000C01 + i, _BASES["wall"][0], (10.0 * i - 10.0, 0.0, -1.14), 0.0))
        for i in range(own_count):
            sconces.append((0x01000C11 + i, _BASES["sconce"][0],
                            (10.0 * i - 10.0 + 0.5, 0.25, 2.0), 0.0))
        master = _plugin_file(tmp_path / "Master.esm", _ALL_BASES,
                              {(0, 0): {"refs": walls + sconces, "land": _LAND_OFFSET}})
        loose = [(0x01000C21 + i, _master_form("sconce"), (40.0 + 2.0 * i, 40.0, -1.14), 0.0)
                 for i in range(5)]
        child = _plugin_file(tmp_path / "Child.esp", [], {(0, 0): {"refs": loose}},
                             masters=("Master.esm",), world=0x00000B00, cell_base=0x00000A00)
        return _mine_files([child, master])
    document = run(3)
    sconce = document["anchors"]["vanilla:test/sconce01"]
    assert (sconce["anchorClass"], sconce["refClasses"], sconce["otherFileRefsNotVoting"]) == (
        "wall", {"wall": 3}, 5), sconce
    assert [(p["parent"], p["n"]) for p in document["pairs"]] == [("vanilla:test/wall01", 3)]
    sconce = run(2)["anchors"]["vanilla:test/sconce01"]
    assert (sconce["anchorClass"], sconce["refClasses"]) == ("ground",
                                                             {"ground": 5, "wall": 2}), sconce


def test_a_piece_on_a_deck_in_a_water_column_is_deck(tmp_path):
    """Round 9 (c): mesh contact from below still wins in a water column: a
    chair on a kit piece (the wall's top at 3 m) standing in the water."""
    refs = []
    for i in range(3):
        refs += [(0x01000C01 + 2 * i, _BASES["wall"][0], (10.0 * i, 0.0, -1.0), 0.0),
                 (0x01000C02 + 2 * i, _BASES["chair"][0], (10.0 * i, 0.0, 3.0), 0.0)]
    path = _plugin_file(tmp_path / "Deck.esm", _ALL_BASES,
                        {(0, 0): {"refs": refs, "land": _LAND_OFFSET, "water": 0.0}})
    anchors = _mine_files([path])["anchors"]
    assert anchors["vanilla:test/chair01"]["refClasses"] == {"deck": 3}
    assert anchors["vanilla:test/wall01"]["refClasses"] == {"water": 3}


def test_a_water_class_without_a_mined_waterline_does_not_crash_the_writer():
    """Round 9 rule 4: the manifest writer omits designedWaterlineM when the
    sink record has no waterline for a water-classed asset."""
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "asset-pipeline"))
    from pipeline.placement_metadata import apply_placement_metadata
    asset = {"id": "mudmother:gv_meshes/argoniannest/mudhut01", "sizeM": [5.9, 6.4, 5.1],
             "originOffsetM": [2.9, 3.0, 0.539]}
    anchors = {asset["id"]: {"anchorClass": "water", "anchorClassEvidence": "plugin"}}
    manifest = apply_placement_metadata({"assets": [asset]}, "settlement-mud-v1",
                                        mined={}, anchors=anchors)
    assert manifest["assets"][0]["anchorClass"] == "water"
    assert "designedWaterlineM" not in manifest["assets"][0]


# --- the manifest writer copies the sink record (round 6 regression gate) --- #
def test_every_published_manifest_sink_equals_the_record():
    """A manifest's designedSinkM is the mined record's value for that asset
    (or its measured twin's, evidence ``swap:``), never a value from another
    record or unit."""
    mined = _record(SINK_RECORD)["assets"]
    wrong = []
    for path in sorted(_PUBLISHED_KITS.glob("*.kit.json")):
        for asset in _record(path).get("assets", []):
            sink = asset.get("designedSinkM") or {}
            evidence = sink.get("evidence", "")
            if evidence == "policy":
                continue      # an assetPlacement row decides (planner ruling 2026-09-24)
            source = (evidence.partition(":")[2] if evidence.startswith(("swap:", "base:"))
                      else asset["id"])
            record = mined.get(source, {})
            if "p50" in record or evidence == "plugin" or evidence.startswith(("swap:", "base:")):
                if not ("p50" in record and all(
                        sink.get(k) == record.get(k) for k in ("p25", "p50", "p75", "n"))):
                    wrong.append((path.name, asset["id"], sink.get("p50"),
                                  record.get("p50")))
    assert wrong == []
