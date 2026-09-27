"""Decision 0102 decision 2 and 5: walkRule, floorEdgeRule, pathReachRule,
propSeatRule, the small unmined mount and the walk packet's measured
column. Each rule is shown failing on a deliberately broken copy of the real
Claywater scene (a door behind a wall, a floor 0.3 m up, a path ending 3 m
short, a lantern floated 0.1 m) where the unbroken item passes. Local only:
the scene needs the raw kit builds and the frozen ground window."""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import wb  # noqa: E402
from workbench import layout, measure, paths, rules, snap  # noqa: E402
from workbench.kits import Catalogue  # noqa: E402
from workbench.scene import Piece, Scene  # noqa: E402

LAYOUT = HERE.parent / "fixtures" / "claywater-walk1.layout.json"
"""Claywater's walk-1 layout, frozen with every place op's scale pinned to 1.0
(16k fix 2 layout pre-step): the rules are shown failing on a fixed scene,
never on the live layout or the placed-scale default."""
OVERLAYS = HERE.parent / "fixtures" / "claywater-walk1.ground-overlays.json"
"""Claywater's `groundOverlays` as the bundle export wrote them for these runs
(the published bundle at 00e0e14b), frozen beside the fixture layout."""
WALL = "vanilla:architecture/farmhouse/stonewall/stonewall01"


@pytest.fixture(scope="module")
def cat():
    return Catalogue()


@pytest.fixture(scope="module")
def base(applied_layout, cat):
    """The Claywater scene `apply` built from the pinned fixture layout
    (`conftest.applied_layout`: once per session, in a scratch output
    folder), its pads and padded ground warmed on this module's catalogue."""
    from workbench import pads
    s = applied_layout(LAYOUT)
    pads.ground_for(cat, s, None)
    return s


@pytest.fixture
def scene(base, tmp_path):
    s = base.view()
    s.path = tmp_path / "scene.json"
    return s


def _target(got, uid):
    return next(t for t in got["targets"] if t["uid"] == uid)


def test_the_character_limits_are_read_from_the_controller_source():
    ch = rules.character()
    assert ch["stepM"] == 0.45 and ch["capsuleRadiusM"] == 0.3   # 0.45 m auto-step (825124ef)
    assert ch["stepMSource"].startswith("packages/game-core/src/physics/characterPhysics.ts:")


def test_walk_fails_on_a_door_behind_a_wall(cat, scene):
    assert _target(rules.walk(cat, scene), "b4")["ok"]
    door = next(d for d in rules.doors(cat, scene) if d["uid"] == "b4")
    dx, dz = rules._bearing_vec(door["facingDeg"])
    x, z = door["thresholdM"][0] + dx * 1.2, door["thresholdM"][1] + dz * 1.2
    wall = scene.add(Piece("blocker", WALL, x, z, door["facingDeg"]))
    wall.y = measure.seat(cat, scene.ground(), wall)["y"]
    got = rules.walk(cat, scene)
    t = _target(got, "b4")
    assert not t["ok"] and "blocked by blocker" in t["reason"]
    assert any(f.startswith("b4: walk to its door") for f in got["failures"])


def test_walk_reaches_a_chair_3_m_from_any_path_and_fails_it_behind_walls(cat, scene):
    """Planner ruling 1 (16k round 5): every npc, idle and container socket
    is a walkRule target in its own right, so a chair well off the drawn
    paths passes when the grid reaches it, and fails once walls box it in."""
    chair = scene.piece("ahy-chair")
    near = min(math.hypot(chair.x - q[0], chair.z - q[1])
               for path in scene.paths for q in path["pointsM"])
    assert near > 3.0
    t = _target(rules.walk(cat, scene), "ahy-chair")
    assert t["id"] == "socket:yard.ahy-chair" and t["ok"]
    assert "socket:yard.ahy-chair" in rules.walk_routes(cat, scene)["routes"]
    for k, (dx, dz, yaw) in enumerate(((0, 2.3, 0), (0, -2.3, 0), (2.3, 0, 90), (-2.3, 0, 90))):
        wall = scene.add(Piece(f"box{k}", WALL, chair.x + dx, chair.z + dz, yaw))
        wall.y = measure.seat(cat, scene.ground(), wall)["y"]
    got = rules.walk(cat, scene)
    t = _target(got, "ahy-chair")
    assert not t["ok"] and "no route from the terminal" in t["reason"]
    assert any(f.startswith("ahy-chair: walk to its idle socket yard.ahy-chair")
               for f in got["failures"])


def test_walk_routes_are_export_ready(cat, scene):
    """Planner ruling 1: routes only, never the grid; each reached target's
    polyline in metres with its length, steepest grade, largest step and
    deepest water."""
    got = rules.walk_routes(cat, scene)
    assert got["schemaVersion"] == 1 and "nodes" not in got and "edges" not in got
    r = got["routes"]["door:b1"]
    # a bound door's route also names its parcel (16k fix 2 ruling 4)
    assert set(r) == {"points", "routeM", "steepestDeg", "largestStepM", "deepestWadeM",
                      "parcelId"}
    assert len(r["points"]) >= 2 and all(len(p) == 3 for p in r["points"])
    run = sum(math.dist(a, b) for a, b in zip(r["points"], r["points"][1:]))
    assert run == pytest.approx(r["routeM"], abs=0.1)   # the dropped points were collinear


def _fit(scene, cat):
    import wb as w
    paths.bridge()
    from worldgen import compile_settlement as cs
    return lambda p: w._authored_fit(scene, p) or cs.record_ground_fit(cat.row(p.asset))


def test_floor_edge_fails_on_a_floor_moved_up(cat, scene):
    """b1 (plinth, band 0.60 m): with only the underside within 1.0 m of its
    base judged (ruling 2), its worst perimeter sample is its foundation
    skirt, buried 1.01 m under the padded ground (16k r7 rule 1: a building
    pad outranks a run pad, so the round-4 run pads no longer raise the
    ground inside b1's pad, which had read 0.52 m); a 1.5 m lift leaves it
    inside the band, a 1.7 m lift crosses it. (Round 1's
    0.5 m fixture crossed on an eave 4.65 m up, which the band now excludes.)"""
    got = rules.floor_edge(cat, scene, _fit(scene, cat))
    assert got["pieces"]["b1"]["overBand"] == 0
    assert got["pieces"]["b1"]["worst"]["gapM"] == pytest.approx(-1.01, abs=0.02)
    scene.piece("b1").y += 1.5
    assert rules.floor_edge(cat, scene, _fit(scene, cat))["pieces"]["b1"]["overBand"] == 0
    scene.piece("b1").y += 0.2
    got = rules.floor_edge(cat, scene, _fit(scene, cat))
    assert got["pieces"]["b1"]["overBand"] > 0
    assert got["pieces"]["b1"]["worstUnretained"]["gapM"] > rules.FLOOR_BANDS["plinth"]
    assert any(f.startswith("b1: floor edge stands") for f in got["failures"])


def test_path_reach_fails_on_a_path_ending_3_m_short(cat, scene):
    assert rules.path_reach(cat, scene)["pieces"]["b1"]["ok"]
    path = next(p for p in scene.paths if p["id"].endswith("station-house-path"))
    (x0, z0), (x1, z1) = path["pointsM"][-2], path["pointsM"][-1]
    leg = math.hypot(x1 - x0, z1 - z0)
    path["pointsM"][-1] = [x1 - (x1 - x0) / leg * 3.0, z1 - (z1 - z0) / leg * 3.0]
    got = rules.path_reach(cat, scene)
    assert not got["pieces"]["b1"]["ok"]
    assert any(f.startswith("b1: no path ends at its door") for f in got["failures"])


def test_prop_seat_fails_on_a_lantern_floated(cat, scene):
    before = rules.prop_seat(cat, scene)
    assert abs(before["pieces"]["b1-lamp"]["offSeatM"]) <= 0.03
    assert not any(f.startswith("b1-lamp: stands") for f in before["failures"])
    scene.piece("b1-lamp").y += 0.1
    after = rules.prop_seat(cat, scene)
    assert after["pieces"]["b1-lamp"]["offSeatM"] == pytest.approx(0.1, abs=1e-3)
    assert any(f.startswith("b1-lamp: stands +0.100 m off its designed seat")
               for f in after["failures"])


def test_prop_seat_fails_on_a_yard_set_member_moved_off_its_set(cat, scene):
    before = rules.prop_seat(cat, scene)["pieces"]["isy-lamp"]
    assert before["offDeclaredM"] <= rules.SET_SPACING_TOL_M
    scene.piece("isy-lamp").x += 2.0
    after = rules.prop_seat(cat, scene)
    assert any(f.startswith("isy-lamp: stands 2.") for f in after["failures"])


def test_a_small_unmined_mount_needs_the_approval_and_the_size(cat, scene):
    barrel = scene.piece("b1-barrel")
    small = scene.add(Piece("cup", "vanilla:clutter/bucket01", barrel.x, barrel.z, 0.0))
    assert not snap.mount_pairs(small.asset, barrel.asset)
    with pytest.raises(ValueError, match="no mined mount pair"):
        snap.mount(small, barrel, cat=cat)
    with pytest.raises(ValueError, match="reader-approved rN"):
        snap.mount(small, barrel, unmined="looks fine", cat=cat)
    got = snap.mount(small, barrel, unmined="reader-approved r2", cat=cat)
    assert got["pair"]["kind"] == "unmined" and small.role["mountPair"]["unmined"] == "reader-approved r2"
    assert small.y > barrel.y
    # the bar is the PLAN side < 0.6 m and the height < 1.0 m (0102 decision 5
    # as amended): the 0.615 m tall candle lantern (plan 0.26 m) now mounts
    lamp = scene.add(Piece("lamp2", "vanilla:clutter/common/candlelanternwithcandle01",
                           barrel.x, barrel.z, 0.0))
    assert snap.mount(lamp, barrel, unmined="reader-approved r2", cat=cat)["pair"]["heightM"] == 0.615
    wide = scene.add(Piece("wide", "vanilla:clutter/barrel02", barrel.x, barrel.z, 0.0))
    with pytest.raises(ValueError, match="longest plan side 0.792"):
        snap.mount(wide, barrel, unmined="reader-approved r2", cat=cat)
    tall = scene.add(Piece("tall", "vanilla:clutter/common/candlelanternwithcandle01",
                           barrel.x, barrel.z, 0.0, scale=1.7))
    with pytest.raises(ValueError, match="height 1.04"):
        snap.mount(tall, barrel, unmined="reader-approved r2", cat=cat)


def test_a_yard_set_member_may_carry_an_approved_small_unmined_mount(cat):
    from workbench import assembly
    st = {"id": "t", "anchor": "a", "members": [
        {"uid": "a", "piece": "vanilla:clutter/barrel02", "offsetM": [0, 0], "yaw": 0},
        {"uid": "l", "piece": "vanilla:clutter/common/candlelanternwithcandle01",
         "offsetM": [0, 0], "yaw": 0, "mount": {"on": "a", "upM": 1.1}}]}
    pairs = assembly.mined_mount_pairs()
    assert assembly.unmined_mounts(st, pairs, cat) == ["l"]
    st["members"][1]["unmined"] = "looks fine"
    assert assembly.unmined_mounts(st, pairs, cat) == ["l"]
    st["members"][1]["unmined"] = "reader-approved r3"
    assert assembly.unmined_mounts(st, pairs, cat) == []
    st["members"][1]["piece"] = "vanilla:clutter/barrel02"
    assert assembly.unmined_mounts(st, pairs, cat) == ["l"]


def test_the_measured_column_carries_the_rule_numbers():
    check = {"walk": {"targets": [{"uid": "b1", "ok": True, "routeM": 48.5, "steepestDeg": 28.1,
                                   "largestStepM": 0.0}]},
             "floorEdge": {"pieces": {"b1": {"worst": {"gapM": 0.2}, "overBand": 0}}},
             "pieces": {"canoe": {"beachedProfile": {"keelGapM": 0.12, "bowHeightM": 0.27}}},
             "propSeat": {"pieces": {"lamp": {"gapM": -0.02, "offSeatM": 0.0}}}}
    got = rules.measured(check)
    assert got["b1"] == "walk 48.5 m / 28.1 deg / step 0.0 m; floorEdge worst 0.2 m"
    assert got["canoe"] == "keel gap 0.12 m, bow 0.27 m"
    assert got["lamp"] == "propSeat gap -0.02 m, off seat 0.0 m"


def test_floor_edge_reads_only_underside_within_1_m_of_the_base(cat, scene, monkeypatch):
    """Planner ruling 2: eaves and domes are out. With no band (the round-1
    rule) b2's eave fails at 4.65 m over its base; with the 1.0 m band it
    passes and b6's floor edge (0.54 m) stays a failure."""
    monkeypatch.setattr(rules, "UNDERSIDE_BAND_M", 1e9)
    got = rules.floor_edge(cat, scene, _fit(scene, cat))
    assert got["pieces"]["b2"]["worstUnretained"]["aboveBaseM"] > 4.0
    monkeypatch.setattr(rules, "UNDERSIDE_BAND_M", 1.0)
    got = rules.floor_edge(cat, scene, _fit(scene, cat))
    assert got["pieces"]["b2"]["overBand"] == 0 and got["pieces"]["b2"]["overhang"] > 0
    assert got["pieces"]["b6"]["overBand"] > 0
    assert got["pieces"]["b6"]["worstUnretained"]["gapM"] == pytest.approx(0.54, abs=0.01)
    assert all((r.get("worst") or {}).get("aboveBaseM", 0.0) <= 1.0 for r in got["pieces"].values())


def test_walk_fails_where_the_water_is_deeper_than_wading(cat, scene, monkeypatch):
    """Planner ruling 7: a wet cell is walkable at most 0.7 m deep over the
    padded ground (0093). The well's approach crosses water 0.63 m deep and
    passes; at a 0.3 m limit it fails as wading."""
    t = _target(rules.walk(cat, scene), "well")
    assert t["ok"] and 0.3 < t["deepestWadeM"] <= rules.WADE_MAX_M
    monkeypatch.setattr(rules, "WADE_MAX_M", 0.3)
    got = rules.walk(cat, scene)
    t = _target(got, "well")
    assert not t["ok"] and t["reason"].count("by wading")
    assert any(f.startswith("well: walk to its opening") for f in got["failures"])


def test_walk_targets_every_unsealed_doorway(cat, scene):
    """Planner ruling 8: every doorway record of a placed building is a
    target unless a placed piece stands within 0.5 m in front of it. b4's
    second doorway: a wall 1.0 m out seals it (skipped); 1.5 m out it is
    open and unreachable, so it fails."""
    got = rules.walk(cat, scene)
    assert {t["id"] for t in got["targets"]} >= {"door:b4", "door:b4.1", "door:b2.2"}
    assert _target_id(got, "door:b4.1")["ok"]
    door = next(d for d in rules.doors(cat, scene, every=True) if d["id"] == "door:b4.1")
    dx, dz = rules._bearing_vec(door["facingDeg"])
    wall = scene.add(Piece("blocker", WALL, door["thresholdM"][0] + dx * 1.0,
                           door["thresholdM"][1] + dz * 1.0, door["facingDeg"]))
    wall.y = measure.seat(cat, scene.ground(), wall)["y"]
    got = rules.walk(cat, scene)
    doorways = [t for t in got["targets"] if t["kind"] == "door"]   # the layout's sockets aside
    assert [s["id"] for s in got["sealed"]] == ["door:b4.1"] and all(t["ok"] for t in doorways)
    wall.x, wall.z = door["thresholdM"][0] + dx * 1.5, door["thresholdM"][1] + dz * 1.5
    got = rules.walk(cat, scene)
    assert not got["sealed"]
    assert any(f.startswith("b4: walk to its doorway 1 (interiors/leaf): the approach is "
                            "blocked by blocker") for f in got["failures"])


def _target_id(got, tid):
    return next(t for t in got["targets"] if t["id"] == tid)


ROUND1_FALLBACK = {"direct": 0.08, "plinth": 0.25, "pad": 0.18, "stilt": 0.12, "dug-in": 0.35,
                   "route-structure": 0.06}
"""placement-policies.json's fallbackSinkM before planner ruling 4."""


class _Resolved(Catalogue):
    """The catalogue as a manifest refresh from ``fallback`` would leave it: a
    policy-fallback row's designedSinkM re-resolved (`resolve_designed_sink`)
    from placement-policies.json with its fallbackSinkM replaced by
    ``fallback`` (None: the file as it stands). Independent of whether the
    published manifests have been refreshed yet."""

    def __init__(self, fallback: dict | None):
        super().__init__()
        sys.path.insert(0, str(paths.REPO_ROOT / "tooling" / "asset-pipeline"))
        from pipeline import placement_metadata as pm
        self._pm, self._mined = pm, pm.load_designed_sink()
        self._policies = pm.load_inventory()["policies"]
        self._fallback = fallback

    def row(self, asset_id):
        row = super().row(asset_id)
        if (row.get("designedSinkM") or {}).get("evidence") == "policy-fallback":
            pid = row["placement"]["evidence"]["policyId"]
            policy = dict(self._policies[pid])
            if self._fallback is not None:
                policy["fallbackSinkM"] = self._fallback.get(pid, policy["fallbackSinkM"])
            # the round-1 world had no lowest-point lift (ruling W1): resolve
            # it without the offset; the file as it stands, with the row
            asset = {"id": asset_id} if self._fallback is not None else row
            sink, _ = self._pm.resolve_designed_sink(asset, policy, self._mined, pid)
            row = {**row, "designedSinkM": sink}
        return row


def _reseated(ref, scene):
    g = rules._ground(ref, scene)
    for p in rules.props(ref, scene):
        if rules._parent_of(scene, p) is None:
            p.y = measure.prop_seat(ref, g, p)["y"]   # the settle's own seat (one helper)
    return rules.prop_seat(ref, scene)


def test_the_no_evidence_sink_is_contact(cat, scene):
    """Planner ruling 4: placement-policies.json's no-evidence sink is 0 in
    every policy. Round 1 seated 12 Claywater props on a sink with no
    evidence (the policy fallback). Since the designed-sink record gained
    measured rows for the works kit's fire, pot, basket and sign pieces and
    works-v1 was republished from it (16k fix 2 round 5), no Claywater prop
    row carries a policy-fallback sink, so even the round-1 fallbacks bury
    none (traced 16k fix 2 round 6: 12 -> 0 is the evidence arriving, not
    the rule going blind). Seated on the file as it stands, no prop fails on
    its sink or its seat; the spit pots sit on their mined sink."""
    assert all(v["fallbackSinkM"] == 0.0 for v in _Resolved(None)._policies.values())
    fallback = sorted(p.uid for p in rules.props(cat, scene)
                      if (cat.row(p.asset).get("designedSinkM") or {}).get("evidence")
                      == "policy-fallback")
    assert fallback == [], fallback
    before = _reseated(_Resolved(ROUND1_FALLBACK), scene)
    assert not [f for f in before["failures"] if "by a designed sink with no evidence" in f]
    after = _reseated(_Resolved(None), scene)
    for uid in ("ahy-pot", "b5-ahy-pot"):
        p = next(q for q in scene.pieces if q.uid == uid)
        mined = cat.row(p.asset)["designedSinkM"]
        assert mined["evidence"] == "plugin", uid
        assert after["pieces"][uid]["designedSinkM"] == pytest.approx(mined["p50"] * p.scale, abs=2e-3), uid
    assert not [f for f in after["failures"] if "by a designed sink" in f]
    assert not [f for f in after["failures"] if "off its designed seat" in f]
    seat_failures = [f.split(":")[0] for f in after["failures"] if "yard set" not in f]
    assert "ahy-pot" not in seat_failures and "b5-ahy-pot" not in seat_failures, seat_failures
    assert after["pieces"]["sty-hay"]["burialAllowM"] == rules.UNEVEN_SINK_CAP_M


def test_the_export_carries_the_mount_pair_and_the_bundle_copies_the_walk_routes(cat, scene):
    """Planner rulings 1 and 4: `mountPair` is the member's own field (the
    evidence string stays as authored) and the blueprint validates it; the
    bundle copies the blueprint's `walkRoutes`."""
    from workbench import export
    role = {"kind": "assembly", "id": "x", "layer": "light", "on": "parent",
            "evidence": "measured", "mountedOn": "b1-barrel",
            "mountPair": {"kind": "unmined", "unmined": "reader-approved r2",
                          "longestPlanSideM": 0.26}}
    assert export.mount_pair(role) == {"kind": "unmined", "mountedOn": "b1-barrel",
                                       "unmined": "reader-approved r2"}
    assert export.mount_pair({"evidence": "measured"}) is None
    paths.bridge()
    from worldgen import blueprint as bpm
    member = {"id": "x", "asset": "a", "atM": [0.0, 0.0], "upM": 1.0, "on": "parent",
              "layer": "light", "evidence": "measured", "mountPair": export.mount_pair(role)}
    parcel = {"id": "p", "assetRef": "s", "assembly": [member]}
    assert bpm.assembly_failures(parcel) == []
    member["mountPair"] = {"kind": "unmined", "unmined": "looked fine"}
    assert any("reader-approved rN" in f for f in bpm.assembly_failures(parcel))
    member["mountPair"] = {"kind": "band", "n": 14, "mountedOn": "b1"}
    assert bpm.assembly_failures(parcel) == []
    from worldgen import export_settlement_bundle as ex
    routes = rules.walk_routes(cat, scene)
    assert ex.walk_routes_field({"id": "b", "walkRoutes": routes}) == {"walkRoutes": routes}
    assert ex.walk_routes_field({"id": "b"}) == {}
    with pytest.raises(ValueError, match="walkRoutes schemaVersion 2"):
        ex.walk_routes_field({"id": "b", "walkRoutes": {**routes, "schemaVersion": 2}})


def test_the_bound_doorway_is_never_sealed(cat, scene):
    """Planner ruling 5: a piece standing hard in front of the BOUND door
    (0.3 m out, inside SEAL_M) never exempts it: it stays a walk target and
    fails, where the same piece in front of an unbound doorway seals it."""
    door = next(d for d in rules.doors(cat, scene) if d["uid"] == "b4")
    dx, dz = rules._bearing_vec(door["facingDeg"])
    x, z = door["thresholdM"][0] + dx * 0.3, door["thresholdM"][1] + dz * 0.3
    wall = scene.add(Piece("blocker", WALL, x, z, door["facingDeg"]))
    wall.y = measure.seat(cat, scene.ground(), wall)["y"]
    assert rules.sealed_by(cat, scene, door) == "blocker"      # it would seal an unbound one
    got = rules.walk(cat, scene)
    assert "door:b4" not in [t["id"] for t in got["sealed"]]
    assert not _target_id(got, "door:b4")["ok"]
    assert any(f.startswith("b4: walk to its door:") for f in got["failures"])


def test_the_workbench_applies_pads_in_the_runtime_order(cat, scene):
    """Terrain recommendation 2 (16k fix 2 round 3): the workbench's padded
    ground applies building pads in the bundle overlay ids' order, as the
    runtime does. b5 (family-hut) is moved beside b1 (station-house) so their
    blend rings overlap: index order (b1 first) and id order (family-hut
    first) then read different ground, and the workbench must read the
    runtime's."""
    from workbench import pads
    paths.bridge()
    from worldgen import pad_overlay, settlement_run_pads as srp
    b1, b5 = scene.piece("b1"), scene.piece("b5")
    b5.x, b5.z = b1.x + 25.0, b1.z             # 1.7 m of open ground between the pads
    b5.pad = {k: v for k, v in b5.pad.items() if k != "datumM"}   # resolved there: 35.56 m
    scene.__dict__.pop("_padMemo", None)
    res = pads.scene_pads(cat, scene)
    live = [(uid, r) for uid, r in res.items() if r["error"] is None]
    assert "b5" in dict(live), res["b5"]["error"]
    g = scene.ground()

    def overlays(ids):
        return [pad_overlay.building_overlay(ids(uid, k), r["polygonM"], float(r["datumM"]),
                                             srp.PAD_BLEND_M) for k, (uid, r) in enumerate(live)]
    runs = pads.run_overlays(cat, scene)       # the runtime applies the run pads too (W3)
    runtime = pad_overlay.ground(g.chunk_height,
                                 overlays(lambda uid, k: pads.overlay_id(scene, uid)) + runs)
    by_index = pad_overlay.ground(g.chunk_height,
                                  overlays(lambda uid, k: f"pad.{k:04d}") + runs)
    wb_ground = pads.ground_for(cat, scene, b1)
    pts = [(b1.x + dx, b1.z + dz) for dx in np.arange(11.0, 19.0, 0.25)
           for dz in np.arange(-6.0, 6.5, 0.5)]
    assert max(abs(runtime(x, z) - by_index(x, z)) for x, z in pts) > 0.01   # order matters here
    assert max(abs(wb_ground.chunk_height(x, z) - runtime(x, z)) for x, z in pts) < 1e-9


def test_the_padded_ground_carries_the_run_pads_the_runtime_applies(cat, scene):
    """Planner ruling W3 (16k fix 2 round 4): the workbench's padded ground
    applies the run-pad overlays too, the same list (ids and maths) the
    bundle export writes for the runtime; Claywater has 10 run pads. The
    ids are compared with the fixture's frozen bundle export (`OVERLAYS`),
    never the live bundle, which later walks re-author."""
    from workbench import pads
    paths.bridge()
    from worldgen import pad_overlay
    runs = pads.run_overlays(cat, scene)
    assert len(runs) == 10, [r["id"] for r in runs]
    frozen = json.loads(OVERLAYS.read_text())
    assert frozen["placeId"] == scene.placeId
    published = {o["id"] for o in frozen["groundOverlays"]["pads"] if o["hardM"] > 0}
    assert {r["id"] for r in runs} == published
    g = scene.ground()
    wb_ground = pads.ground_for(cat, scene, None)
    building = [o for o in wb_ground.overlays if o["hardM"] == 0.0]
    both = pad_overlay.ground(g.chunk_height, building + runs)
    only_buildings = pad_overlay.ground(g.chunk_height, building)
    pts = [tuple(v) for r in runs for piece in r["pieces"] for v in piece["polygonM"]]
    assert max(abs(both(x, z) - only_buildings(x, z)) for x, z in pts) > 0.05
    assert max(abs(wb_ground.chunk_height(x, z) - both(x, z)) for x, z in pts) < 1e-9


def test_the_walktable_door_row_reads_its_own_doorways_walk():
    """r5 review (CONFIRMED): the door row took the first `walk` cell of its
    building, which is an unbound doorway's when that record comes first.
    The row reads the bound door's own target (`door:<uid>`)."""
    check = {"walk": {"targets": [
        {"id": "door:b1.0", "uid": "b1", "bound": False, "doorway": 0, "ok": False},
        {"id": "door:b1", "uid": "b1", "bound": True, "doorway": 1, "ok": True,
         "routeM": 12.0, "steepestDeg": 4.0, "largestStepM": 0.1}]}}
    assert rules.door_walk(check, "b1") == "walk 12.0 m / 4.0 deg / step 0.1 m"
    assert rules.door_walk(check, "b9") == "-"


def test_a_piece_hung_above_head_height_is_no_obstacle(cat, scene):
    """r5 review (CONFIRMED): WalkGrid blocked every footprint whatever its
    height. A piece whose lowest point stands HEAD_CLEARANCE_M or more over
    the ground is walked under; the same piece lower still blocks."""
    door = next(d for d in rules.doors(cat, scene) if d["uid"] == "b4")
    dx, dz = rules._bearing_vec(door["facingDeg"])
    x, z = door["thresholdM"][0] + dx * 0.3, door["thresholdM"][1] + dz * 0.3
    wall = scene.add(Piece("blocker", WALL, x, z, door["facingDeg"]))
    wall.y = measure.seat(cat, scene.ground(), wall)["y"]
    ground = rules._ground(cat, scene).chunk_height(*door["thresholdM"])
    lift = ground + rules.HEAD_CLEARANCE_M - rules._lowest_m(cat, wall)
    wall.y += lift - 0.2                     # its lowest point 1.7 m up: in the way
    assert rules.sealed_by(cat, scene, door) == "blocker"
    assert not _target_id(rules.walk(cat, scene), "door:b4")["ok"]
    wall.y += 0.4                            # 2.1 m up: walked under
    assert rules.sealed_by(cat, scene, door) is None
    assert _target_id(rules.walk(cat, scene), "door:b4")["ok"]


def test_head_clearance_is_read_over_a_deck_whatever_the_order(cat, scene):
    """r5 review 2 (CONFIRMED): the clearance was read over the bare ground
    (sealed_by) or over whatever the loop had laid so far (WalkGrid). A piece
    2 m over the ground but low over a walkable deck under it is in the way,
    even when it comes before the deck in the scene."""
    door = next(d for d in rules.doors(cat, scene) if d["uid"] == "b4")
    dx, dz = rules._bearing_vec(door["facingDeg"])
    # 0.6 m out: clear of b4's own footprint buffered by the capsule radius
    # (the mudhut footprint grew with its re-measured sink, 2026-09-27)
    x, z = door["thresholdM"][0] + dx * 0.6, door["thresholdM"][1] + dz * 0.6
    hung = scene.add(Piece("hung", WALL, x, z, door["facingDeg"]))
    deck = scene.add(Piece("deck", WALL, x, z, door["facingDeg"], walkable=True))
    deck.y = hung.y = measure.seat(cat, scene.ground(), deck)["y"]
    ground = rules._ground(cat, scene).chunk_height(x, z)
    hung.y += ground + rules.HEAD_CLEARANCE_M + 0.1 - rules._lowest_m(cat, hung)
    assert rules._surface_m(cat, scene, rules._ground(cat, scene), x, z) > ground + 0.5
    assert rules.sealed_by(cat, scene, door) == "hung"
    grid = rules.WalkGrid(cat, scene)
    assert grid.uids[grid.block[grid.cell(x, z)]] == "hung"
