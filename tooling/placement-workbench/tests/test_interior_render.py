"""`wb.py render-interior` (workbench/interior_render.py): the non-Blender
half on a synthetic bundle: the runtime's placement matrix, the room bounds,
the three cameras from the bounds and the door, the light list at the
runtime's intensity, and the fires the interior loader burns."""
from __future__ import annotations

import math
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from workbench import interior_render as ir  # noqa: E402

WALL = {"sizeM": [10.0, 8.0, 4.0], "originOffsetM": [5.0, 4.0, 0.0]}      # x, north, up
CANDLE = {"sizeM": [0.1, 0.1, 0.3], "originOffsetM": [0.05, 0.05, 0.0],
          "flames": [{"offsetM": [0.0, 0.3, 0.0], "sizeM": 0.05}]}
LAMP = {"sizeM": [0.3, 0.3, 0.6], "originOffsetM": [0.15, 0.15, 0.0],
        "light": {"fixtureKind": "lantern"}}
ROWS = {"k:wall": WALL, "k:candle": CANDLE, "k:lamp": LAMP}


def _p(pid, asset, pos, yaw=0.0, cat="misc"):
    return {"id": pid, "assetId": asset, "kit": "k", "positionM": pos,
            "rotationDeg": [0.0, yaw, 0.0], "scale": 1.0, "category": cat}


BUNDLE = {
    "arrivalMarker": {"positionM": [0.0, 0.0, 3.0], "yawDeg": 0.0},
    "exitDoor": {"positionM": [0.0, 0.0, 4.0], "yawDeg": 180.0},
    "placements": [_p("wall", "k:wall", [0.0, 0.0, 0.0], cat="architecture"),
                   _p("candle", "k:candle", [2.0, 1.0, -1.0]),
                   _p("lamp", "k:lamp", [-3.0, 0.0, -2.0])],
    "lights": [{"refId": "L1", "positionM": [1.0, 2.0, -3.0], "radiusM": 5.0,
                "colorRGB": [255, 128, 0], "fade": 2.0}],
    "ambient": {"colorRGB": [255, 255, 255], "intensity": 2.0},
    "lighting": {"directionalRGB": [0, 0, 0]},
}


def row_of(p):
    return ROWS.get(p["assetId"])


def test_placement_matrix_is_the_runtimes_yaw_clockwise_from_north():
    m = ir.placement_matrix(_p("x", "k:wall", [1.0, 2.0, 3.0], yaw=90.0))
    # yaw 90 (east): the asset's forward (-z, north) turns to +x (east)
    assert np.allclose(m[:3, :3] @ [0.0, 0.0, -1.0], [1.0, 0.0, 0.0], atol=1e-9)
    assert np.allclose(m[:3, 3], [1.0, 2.0, 3.0])
    # Blender frame: game (x, y up, z south) -> (x, -z, y)
    b = ir.blender_matrix(np.eye(4) @ m)
    assert np.allclose(b[:3, 3], [1.0, -3.0, 2.0])


def test_room_bounds_are_every_drawn_pieces_box():
    lo, hi = ir.room_bounds(BUNDLE, row_of)
    assert np.allclose(lo, [-5.0, 0.0, -4.0]) and np.allclose(hi, [5.0, 4.0, 4.0])


def test_no_camera_stands_under_the_arrival_floor():
    """KeebaHouseElder (walk 5): the only `architecture` pieces were a lower
    level's fences, the shell was `misc`, and the ceiling cap put every eye
    under the floor. Bounds take every piece; the eye stays >= MIN_EYE_M up."""
    bundle = {**BUNDLE, "arrivalMarker": {"positionM": [0.0, 3.9, 3.0], "yawDeg": 0.0},
              "placements": [_p("fence", "k:wall", [0.0, -4.0, 0.0], cat="architecture"),
                             _p("shell", "k:wall", [0.0, 3.9, 0.0])]}
    lo, hi = ir.room_bounds(bundle, row_of)
    assert hi[1] >= 7.9
    for c in ir.cameras(bundle, lo, hi):
        assert c["eyeGame"][1] >= 3.9 + ir.MIN_EYE_M - 1e-6
    low = {**bundle, "placements": [bundle["placements"][0]]}
    for c in ir.cameras(low, *ir.room_bounds(low, row_of)):
        assert c["eyeGame"][1] >= 3.9 + ir.MIN_EYE_M - 1e-6


def test_cameras_stand_in_the_doorway_and_two_opposite_corners():
    lo, hi = ir.room_bounds(BUNDLE, row_of)
    cams = {c["name"]: c for c in ir.cameras(BUNDLE, lo, hi)}
    assert list(cams) == ["doorway", "corner-a", "corner-b"]
    door = cams["doorway"]["eyeGame"]
    # stepped from the door toward the arrival marker, at eye height
    assert np.allclose(door, [0.0, ir.EYE_M, 4.0 - ir.DOOR_STEP_M])
    a, b = np.array(cams["corner-a"]["eyeGame"]), np.array(cams["corner-b"]["eyeGame"])
    assert a[0] < 0 < b[0] and a[2] < 0 < b[2]            # opposite plan corners
    assert np.allclose((a + b)[[0, 2]] / 2, [0.0, 0.0])
    # each camera looks at the room centre (Blender -Z toward the target)
    m = np.array(cams["doorway"]["matrix"])
    to_target = np.array(cams["doorway"]["targetBlender"]) - m[:3, 3]
    assert np.dot(-m[:3, 2], to_target / np.linalg.norm(to_target)) > 0.999


def test_light_list_is_the_records_at_the_runtimes_intensity():
    (light,) = ir.light_list(BUNDLE)
    assert light["at"] == [1.0, 3.0, 2.0]
    assert math.isclose(light["intensity"], 2.0 * math.pi)
    assert light["radiusM"] == 5.0 and light["decay"] == 2.0
    assert light["colour"][0] == 1.0 and 0.2 < light["colour"][1] < 0.23   # sRGB -> linear
    amb = ir.ambient_of(BUNDLE)
    assert np.allclose(amb["ambient"], [2.0 * math.pi] * 3)


def test_fires_are_mined_wicks_and_a_lit_fixtures_fallback():
    fires, cards, glow = ir.fire_list(BUNDLE, row_of)
    by = {f["id"]: f for f in fires}
    assert not by["candle"]["fallback"]
    assert np.allclose(by["candle"]["at"], [2.0, 1.0, 1.3])        # wick 0.3 m up
    assert by["lamp"]["fallback"]
    assert np.allclose(by["lamp"]["at"], [-3.0, 2.0, 0.6])         # top centre
    assert cards == [] and glow == []


def test_flame_cards_of_a_piece_with_flames_draw_emissive_and_a_bed_s_are_hidden():
    """A piece with mined `flames` keeps its flame cards (the loader draws
    them): the render draws them emissive. A flame-card bed without flames
    (a hearth's fxfire) has its cards hidden and a proxy at its bed."""
    rows = {"k:torch": {**CANDLE, "flameCardMaterials": ["TorchFlame:0.Mat"]},
            "k:hearth": {"sizeM": [1.0, 1.0, 0.8], "originOffsetM": [0.5, 0.5, 0.0],
                         "flameCardMaterials": ["Flames02:0.Mat"]}}
    bundle = {"placements": [_p("t", "k:torch", [0.0, 0.0, 0.0]),
                             _p("h", "k:hearth", [3.0, 0.0, 0.0])]}
    fires, cards, glow = ir.fire_list(bundle, lambda p: rows.get(p["assetId"]))
    assert glow == ["TorchFlame:0.Mat"] and cards == ["Flames02:0.Mat"]
    assert {f["id"] for f in fires} == {"t", "h"}
    assert next(f for f in fires if f["id"] == "h")["heightM"] >= 0.4      # a visible bed proxy


def test_stand_ins_and_swing_doors_draw_as_the_loader_draws_them():
    bundle = dict(BUNDLE, substitutions=[{
        "id": "sub", "refId": "1", "standInAsset": "k:candle", "kit": "k",
        "standInCategory": "clutter", "positionM": [1.0, 0.0, 1.0],
        "rotationDeg": [0.0, 0.0, 0.0], "scale": 1.0}],
        doors=[{"doorType": "load", "interiorLoadDoorRef": "2", "loadDoor": {}},
               {"doorType": "swing", "id": "sw", "assetId": "k:wall", "kit": "k",
                "positionM": [0.0, 0.0, 0.0], "rotationDeg": [0.0, 0.0, 0.0], "scale": 1.0}])
    drawn = {p["id"]: p for p in ir.drawn_placements(bundle)}
    assert drawn["sub"]["assetId"] == "k:candle" and drawn["sub"]["category"] == "clutter"
    assert drawn["sw"]["assetId"] == "k:wall" and len(drawn) == 5      # the load door draws nothing

    class Cat:
        def raw_glb(self, asset):
            return (Path(f"/kits/{asset}.glb"), asset)
    pieces, missing = ir.pieces(bundle, Cat())
    assert {p["uid"] for p in pieces} == set(drawn) and not missing
    fires, _, _ = ir.fire_list(bundle, row_of)
    assert "sub" in {f["id"] for f in fires}                            # a stand-in candle burns


def _box_cast(lo, hi, walls=()):
    """A ray cast against the inside of an axis box (Blender frame, z up)
    plus extra vertical slabs `walls` = (x0, x1, y0, y1) spanning all z
    (single-sided faces are not modelled: a ray from inside hits the far face,
    as Blender's ray_cast does)."""
    def cast(o, d, max_m):
        best = None
        for ax in range(3):
            if abs(d[ax]) < 1e-12:
                continue
            for plane in (lo[ax], hi[ax]):
                t = (plane - o[ax]) / d[ax]
                if 1e-9 < t <= max_m:
                    p = [o[i] + d[i] * t for i in range(3)]
                    if all(lo[i] - 1e-6 <= p[i] <= hi[i] + 1e-6 for i in range(3)):
                        best = t if best is None else min(best, t)
        for x0, x1, y0, y1 in walls:          # slab: entry distance along the ray
            tmin, tmax = 0.0, max_m
            for ax, (a, b) in ((0, (x0, x1)), (1, (y0, y1))):
                if abs(d[ax]) < 1e-12:
                    if not a <= o[ax] <= b:
                        tmin = tmax + 1
                    continue
                t1, t2 = sorted(((a - o[ax]) / d[ax], (b - o[ax]) / d[ax]))
                tmin, tmax = max(tmin, t1), min(tmax, t2)
            hit = tmin if tmin > 1e-9 else tmax        # from inside a slab: its far face
            if tmin <= tmax and hit > 1e-9:
                best = hit if best is None else min(best, hit)
        return best
    return cast


def test_corner_eye_outside_the_shell_walks_in_and_stays_aimed():
    """walk 5 (KeebaHouseElder): a corner eye outside the shell walks along
    its line toward the arrival point until inside with its view clear."""
    cast = _box_cast((0.0, 0.0, 0.0), (10.0, 10.0, 4.0))
    eye, moved = ir.settle_eye(cast, (-6.0, -6.0, 1.6), (5.0, 5.0, 1.0))
    assert ir.is_inside(cast, eye) and ir.view_clear(cast, eye, (5.0, 5.0, 1.0)) >= 1.0
    assert moved > 8.0 and 0.0 <= eye[0] <= 10.0


def test_corner_eye_facing_a_near_wall_keeps_stepping_in():
    """walk 5: corner-a stood inside the shell facing a wall at close range.
    A partition 1 m ahead fails the AHEAD_M bar; the eye steps past it."""
    cast = _box_cast((0.0, 0.0, 0.0), (20.0, 20.0, 4.0), walls=[(3.0, 3.3, 0.0, 20.0)])
    eye0, target = (1.8, 5.0, 1.6), (15.0, 5.0, 1.0)
    assert ir.is_inside(cast, eye0) and ir.view_clear(cast, eye0, target) < 1.0
    eye, moved = ir.settle_eye(cast, eye0, target)
    assert eye[0] > 3.3 and ir.view_clear(cast, eye, target) >= 1.0
    # a clear view where it stands: the eye does not move
    assert ir.settle_eye(cast, (8.0, 5.0, 1.6), target) == ((8.0, 5.0, 1.6), 0.0)


def test_corners_aim_at_the_arrival_point():
    lo, hi = ir.room_bounds(BUNDLE, row_of)
    cams = {c["name"]: c for c in ir.cameras(BUNDLE, lo, hi)}
    arrive = BUNDLE["arrivalMarker"]["positionM"]
    for name in ("corner-a", "corner-b"):
        assert np.allclose(cams[name]["targetBlender"], ir.to_blender([arrive[0], arrive[1] + 1.0, arrive[2]]))


def test_a_view_whose_target_is_out_of_sight_fails():
    """walk 5 (KeebaHouseElder corner-b): the forward line ran 3 m clear
    past a pod's opening, but a rock wall hid the arrival point."""
    cast = _box_cast((0.0, 0.0, 0.0), (20.0, 20.0, 4.0), walls=[(8.0, 8.3, 0.0, 20.0)])
    assert ir.view_clear(cast, (2.0, 5.0, 1.6), (15.0, 5.0, 1.0)) < 1.0
    assert ir.view_clear(cast, (9.0, 5.0, 1.6), (15.0, 5.0, 1.0)) == 1.0


def test_eyes_stay_over_the_arrivals_floor_level():
    """walk 5 (KeebaHouseElder corner-a): an eye over the lower level framed
    the upper floor's edge. A floor 2 m lower beyond x = 8 is off level."""
    lower = _box_cast((8.0, 0.0, -2.0), (30.0, 6.0, 4.0))
    upper = _box_cast((0.0, 0.0, 0.0), (8.0, 6.0, 4.0))

    def cast(o, d, m):
        hits = [h for h in (upper(o, d, m) if o[0] <= 8.0 else None, lower(o, d, m)
                            if o[0] >= 8.0 else None) if h is not None]
        return min(hits) if hits else None
    assert ir.on_level(cast, (4.0, 3.0, 1.6), 1.6) and not ir.on_level(cast, (12.0, 3.0, 1.6), 1.6)
    eye, _ = ir.settle_eye(cast, (20.0, 3.0, 1.6), (2.0, 3.0, 1.0), 1.6)
    assert eye[0] <= 8.0


def _solids_cast(boxes):
    """A ray cast against solid axis boxes (x0, y0, z0, x1, y1, z1), Blender
    frame: the nearest entry face, or the exit face from inside a box (as
    Blender's ray_cast hits back faces)."""
    def cast(o, d, max_m):
        best = None
        for b in boxes:
            tmin, tmax = -1e9, 1e9
            for ax in range(3):
                a, c = b[ax], b[ax + 3]
                if abs(d[ax]) < 1e-12:
                    if not a <= o[ax] <= c:
                        tmin = tmax + 1
                    continue
                t1, t2 = sorted(((a - o[ax]) / d[ax], (c - o[ax]) / d[ax]))
                tmin, tmax = max(tmin, t1), min(tmax, t2)
            if tmin > tmax:
                continue
            hit = tmin if tmin > 1e-9 else tmax
            if 1e-9 < hit <= max_m:
                best = hit if best is None else min(best, hit)
        return best
    return cast


# a 10 x 10 m room, floor top z 0, ceiling underside z 4, and a 2 m deep
# landing along its west wall standing 1.4 m over the floor (the Lilmoth
# houses: the arrival marker on a stair landing, the room below it)
ROOM = [(-0.2, -0.2, -0.2, 10.2, 10.2, 0.0), (-0.2, -0.2, 4.0, 10.2, 10.2, 4.2),
        (-0.2, -0.2, 0.0, 0.0, 10.2, 4.0), (10.0, -0.2, 0.0, 10.2, 10.2, 4.0),
        (0.0, -0.2, 0.0, 10.0, 0.0, 4.0), (0.0, 10.0, 0.0, 10.0, 10.2, 4.0),
        (0.0, 0.0, 0.0, 2.0, 10.0, 1.4)]


def test_floor_levels_are_largest_area_first():
    levels = ir.floor_levels([0.0] * 10 + [1.4] * 30 + [0.05] * 5, 0.25)
    assert levels[0] == (1.4, 7.5) and levels[1][0] in (0.0, 0.05) and levels[1][1] == 3.75


def test_an_arrival_off_the_main_floor_puts_the_eyes_on_the_largest_level():
    """16k walk 5 (the Lilmoth houses): the eye height came from the arrival
    marker's own y, on a stair landing, so every view looked up the stair
    or into a wall. The floor below the marker is ray-cast; the main floor
    is the largest walkable level by area; off it, the eyes move there."""
    cast = _solids_cast(ROOM)
    plan = ir.floor_plan(cast, (-0.2, -0.2, -0.2), (10.2, 10.2, 4.2), (1.0, 5.0, 1.45))
    assert abs(plan["belowZ"] - 1.4) < 1e-6 and abs(plan["mainZ"]) < 1e-6
    assert not plan["onMain"] and abs(plan["floorZ"]) < 1e-6
    assert plan["levels"][0][1] > plan["levels"][1][1]
    assert plan["hub"][0] > 2.0 and abs(plan["hub"][1] - 5.0) <= 0.5      # nearest main-floor column
    on = ir.floor_plan(cast, (-0.2, -0.2, -0.2), (10.2, 10.2, 4.2), (5.0, 5.0, 0.02))
    assert on["onMain"] and on["hub"] == (5.0, 5.0) and abs(on["floorZ"]) < 1e-6
    corner = {"matrix": ir._look_matrix([8.0, 8.0, 2.45], [1.0, 5.0, 2.45]),
              "targetBlender": [1.0, 5.0, 2.45], "arrivalEye": [1.0, 5.0, 2.45], "eyeHeightM": 1.6}
    moved = ir.on_floor({**corner, "eyeHeightM": 1.0}, plan, 1.45)     # capped over the landing
    assert moved["eyeHeightM"] == ir.EYE_M
    assert np.allclose(moved["arrivalEye"], [*plan["hub"], 1.6])
    assert np.allclose(moved["targetBlender"], [*plan["hub"], 1.0])
    assert abs(moved["matrix"][2][3] - 1.6) < 1e-6
    door = {"matrix": ir._look_matrix([0.5, 5.0, 3.05], [5.0, 5.0, 2.45]),
            "targetBlender": [5.0, 5.0, 2.45], "eyeHeightM": 1.6}
    moved = ir.on_floor(door, plan, 1.45)
    assert abs(moved["matrix"][2][3] - 1.6) < 1e-6 and abs(moved["targetBlender"][2] - 1.0) < 1e-6


def test_the_open_ground_under_a_stilt_house_is_no_level():
    """A floor under a roof but open at eye height on every side is no room."""
    cast = _solids_cast([(0.0, 0.0, -0.2, 10.0, 10.0, 0.0), (0.0, 0.0, 3.0, 10.0, 10.0, 3.2)])
    assert ir.column_floors(cast, 5.0, 5.0, 4.0, -1.0) == []


def test_every_blender_launch_runs_under_job_guard(monkeypatch, tmp_path):
    """The cpu_watchdog SIGSTOPs the heaviest unguarded process (Cycles:
    546 s of KeebaHouseElder's 579 s), so every workbench Blender launch
    goes through paths.guarded."""
    import json
    import subprocess
    from workbench import bpy_run, paths, render

    class Launched(Exception):
        pass
    seen = []

    def runner(cmd, *a, **k):
        seen.append(cmd)
        raise Launched
    monkeypatch.delenv("ES_JOB_GUARD", raising=False)
    monkeypatch.setattr(subprocess, "run", runner)
    monkeypatch.setattr(paths, "OUTPUT", tmp_path)
    monkeypatch.setattr(render, "scene_job", lambda *a, **k: {})
    monkeypatch.setattr(bpy_run, "scene_job", lambda *a, **k: {})
    monkeypatch.setattr(bpy_run, "runtime_posed", lambda cat, scene: (scene, []))
    monkeypatch.setattr(bpy_run, "_frame", lambda *a: (np.zeros(3), np.ones(3)))
    cell = tmp_path / "Cell.json"
    cell.write_text(json.dumps(BUNDLE))
    monkeypatch.setattr(ir, "bundle_path", lambda c: cell)

    class Cat:
        def raw_glb(self, asset):
            return None

        def row(self, asset):
            raise KeyError(asset)
    for launch in (lambda: render._launch(Cat(), None, [], 64, 1, None, (0, 0), 1.0),
                   lambda: bpy_run.run(Cat(), None, tmp_path / "s.py", tmp_path / "o.json"),
                   lambda: ir.render_interior(Cat(), "Cell", out=tmp_path / "c.png")):
        try:
            launch()
        except Launched:
            pass
    assert len(seen) == 3
    for cmd in seen:
        assert cmd[:2] == ["bash", str(paths.JOB_GUARD)] and cmd[3] == "--"
        assert cmd[4] == str(paths.LINUX_BLENDER)
    monkeypatch.setenv("ES_JOB_GUARD", "1")
    assert paths.guarded(["blender"]) == ["blender"]


def _gap_deg(a, b, hub):
    aa = math.atan2(a[1] - hub[1], a[0] - hub[0])
    bb = math.atan2(b[1] - hub[1], b[0] - hub[0])
    g = abs(math.degrees(aa - bb)) % 360.0
    return min(g, 360.0 - g)


def test_scored_corners_stand_inside_apart_and_see_the_hub():
    """A 12 x 8 m room, the hub in it: two candidates 90+ degrees apart
    round the hub, both over the floor, each scoring MIN_SCORE_M or more,
    the best one down the long axis; a room too small to hold a 3 m score
    has no corners (the plan camera is the fallback)."""
    cast = _solids_cast([(-1.0, -1.0, -0.2, 13.0, 9.0, 0.0), (-1.0, -1.0, 4.0, 13.0, 9.0, 4.2),
                         (-1.0, -1.0, 0.0, 0.0, 9.0, 4.0), (12.0, -1.0, 0.0, 13.0, 9.0, 4.0),
                         (0.0, -1.0, 0.0, 12.0, 0.0, 4.0), (0.0, 8.0, 0.0, 12.0, 9.0, 4.0)])
    hub, target = (4.0, 4.0), (4.0, 4.0, 1.0)
    cands = ir.candidate_eyes(cast, hub, 0.0)
    assert len(cands) == ir.CORNER_DIRS * len(ir.CANDIDATE_FRACS)
    picked = ir.pick_corners(cast, cands, target, 0.0)
    assert len(picked) == 2
    for c in picked:
        assert c["score"] >= ir.MIN_SCORE_M and ir.floor_ok(cast, c["eye"], 0.0)
        assert 0.0 < c["eye"][0] < 12.0 and 0.0 < c["eye"][1] < 8.0 and c["eye"][2] == ir.EYE_M
    assert picked[0]["eye"][0] > 5.0                 # looks back down the long axis
    assert _gap_deg(picked[0]["eye"], picked[1]["eye"], hub) >= ir.CORNER_APART_DEG - 1e-6
    tiny = _solids_cast([(-1.0, -1.0, -0.2, 2.0, 2.0, 0.0), (-1.0, -1.0, 4.0, 2.0, 2.0, 4.2),
                         (-1.0, -1.0, 0.0, 0.0, 2.0, 4.0), (1.5, -1.0, 0.0, 2.0, 2.0, 4.0),
                         (0.0, -1.0, 0.0, 1.5, 0.0, 4.0), (0.0, 1.5, 0.0, 1.5, 2.0, 4.0)])
    assert ir.pick_corners(tiny, ir.candidate_eyes(tiny, (0.75, 0.75), 0.0),
                           (0.75, 0.75, 1.0), 0.0) == []


def test_an_eye_behind_a_post_is_scored_out():
    """16k walk 5 (the Lilmoth houses): corner-b faced a post 0.05 m clear.
    An eye right behind a post scores its hit (~0) times a blocked fan, under
    MIN_SCORE_M; no picked corner has the post within FAN_CLEAR_M across
    its view."""
    walls = [(-1.0, -1.0, -0.2, 13.0, 9.0, 0.0), (-1.0, -1.0, 4.0, 13.0, 9.0, 4.2),
             (-1.0, -1.0, 0.0, 0.0, 9.0, 4.0), (12.0, -1.0, 0.0, 13.0, 9.0, 4.0),
             (0.0, -1.0, 0.0, 12.0, 0.0, 4.0), (0.0, 8.0, 0.0, 12.0, 9.0, 4.0)]
    post = (8.5, 3.8, 0.0, 8.9, 4.2, 4.0)
    cast = _solids_cast(walls + [post])
    target = (4.0, 4.0, 1.0)
    assert ir.score_eye(cast, (9.0, 4.0, 1.6), target) < ir.MIN_SCORE_M
    picked = ir.pick_corners(cast, ir.candidate_eyes(cast, (4.0, 4.0), 0.0), target, 0.0)
    assert len(picked) == 2
    for c in picked:
        e = c["eye"]
        assert not (8.4 <= e[0] <= 12.0 and 3.4 <= e[1] <= 4.6)     # not behind the post
        assert ir.score_eye(cast, e, target) == c["score"] >= ir.MIN_SCORE_M


# a 10 x 10 m room, ceiling underside z 6, and a 3 m wide landing along its
# west wall standing 3 m over the floor, the door in the west wall on it
# (KeebaHouseElder, the Lilmoth houses: the arrival on a landing)
TALL = [(-0.2, -0.2, -0.2, 10.2, 10.2, 0.0), (-0.2, -0.2, 6.0, 10.2, 10.2, 6.2),
        (-0.2, -0.2, 0.0, 0.0, 10.2, 6.0), (10.0, -0.2, 0.0, 10.2, 10.2, 6.0),
        (0.0, -0.2, 0.0, 10.0, 0.0, 6.0), (0.0, 10.0, 0.0, 10.0, 10.2, 6.0),
        (0.0, 0.0, 0.0, 3.0, 10.0, 3.0)]


def test_a_landing_over_the_main_floor_splits_the_eyes():
    """Arrival 3 m over the main floor (> SPLIT_M): the corners stand on the
    main floor round its centroid, the doorway on the landing EDGE_BACK_M
    back from its edge on the door-to-hub line, and every view looks at
    the hub 1 m over the main floor."""
    cast = _solids_cast(TALL)
    plan = ir.floor_plan(cast, (-0.2, -0.2, -0.2), (10.2, 10.2, 6.2), (1.0, 5.0, 3.05))
    assert abs(plan["belowZ"] - 3.0) < 1e-6 and abs(plan["mainZ"]) < 1e-6
    assert 4.5 <= plan["centroid"][0] <= 8.0 and 4.0 <= plan["centroid"][1] <= 6.0
    eyes = ir.eye_plan(cast, plan, (0.05, 5.0, 3.0))
    assert eyes["cornerZ"] == plan["mainZ"] and eyes["doorZ"] == plan["belowZ"]
    assert eyes["target"] == (*plan["centroid"], 1.0)
    assert len(eyes["corners"]) == 2
    for e in eyes["corners"]:
        assert e[0] > 3.0 and abs(e[2] - ir.EYE_M) < 1e-9       # on the main floor, off the landing
    d, aim = eyes["doorway"]
    assert abs(d[2] - (3.0 + ir.EYE_M)) < 1e-9
    # the edge eye looks steeply down past the landing's own floor (walk 5,
    # KeebaHouseCrafter): the view that scores looks across the room
    assert 0.0 < d[0] <= 3.0 - ir.EDGE_BACK_M + 1e-9 and aim[2] > eyes["target"][2]
    assert ir.score_eye(cast, d, aim) >= ir.MIN_SCORE_M
    # no drop on the line (arrival on the main floor): 1.2 m in from the door
    flat, _ = ir.doorway_eye(cast, (3.05, 5.0, 0.0), (8.0, 5.0), 0.0)
    assert abs(flat[0] - (3.05 + ir.DOOR_IN_M)) < 1e-9 and abs(flat[2] - ir.EYE_M) < 1e-9


_BOX12 = [(-1.0, -1.0, -0.2, 13.0, 9.0, 0.0), (-1.0, -1.0, 4.0, 13.0, 9.0, 4.2),
          (-1.0, -1.0, 0.0, 0.0, 9.0, 4.0), (12.0, -1.0, 0.0, 13.0, 9.0, 4.0),
          (0.0, -1.0, 0.0, 12.0, 0.0, 4.0), (0.0, 8.0, 0.0, 12.0, 9.0, 4.0)]


def test_a_thin_rail_near_the_eye_vetoes_it():
    """A 4 cm ladder rail 1 m ahead and 20 degrees off the line slips between
    the 10-degree frame probes (Plantation doorway, walk 5); the 5-degree
    near grid rejects the eye."""
    eye, target = (9.0, 4.0, 1.6), (3.0, 4.0, 1.0)
    rail = (7.92, 4.34, 0.0, 7.96, 4.38, 4.0)    # ~1.1 m away, ~19 deg left
    assert ir.score_eye(_solids_cast(_BOX12), eye, target) >= ir.MIN_SCORE_M
    assert ir.score_eye(_solids_cast(_BOX12 + [rail]), eye, target) == 0.0


def test_a_corner_under_a_low_overhang_is_rejected():
    """KeebaHouseElder corner-a stood under the arrival landing, its underside
    over the top of the frame: a candidate whose up ray hits within
    OVERHEAD_M is no corner."""
    overhang = (8.0, -1.0, 3.4, 12.0, 9.0, 3.6)    # 1.8 m over the eye
    cast = _solids_cast(_BOX12 + [overhang])
    picked = ir.pick_corners(cast, ir.candidate_eyes(cast, (4.0, 4.0), 0.0), (4.0, 4.0, 1.0), 0.0)
    assert picked and all(c["eye"][0] < 8.0 for c in picked)
    free = ir.pick_corners(_solids_cast(_BOX12), ir.candidate_eyes(_solids_cast(_BOX12), (4.0, 4.0), 0.0),
                           (4.0, 4.0, 1.0), 0.0)
    assert free[0]["eye"][0] > 8.0          # without it the best corner stands there
