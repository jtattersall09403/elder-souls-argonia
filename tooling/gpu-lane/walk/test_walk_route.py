"""walk_route.py coverage rules and walk_judge.py grouping on a fixture place (tmp dir)."""
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import walk_judge  # noqa: E402
import walk_route  # noqa: E402

PID = "place.fixture.walk"


def fixture(tmp: Path) -> Path:
    pub = tmp / "public"
    (pub / "province/settlements").mkdir(parents=True)
    (pub / "province/interiors").mkdir(parents=True)
    (pub / "kits/k1/parts").mkdir(parents=True)
    (pub / "kits/k1/parts/index.json").write_text(json.dumps({"fires": {"a:lamp-ish": {"light": {}}, "a:window": {"windowMaterials": []}}}))
    (pub / "province/interiors/CellA.json").write_text(json.dumps({"exitDoor": {"positionM": [1.0, 0.0, 2.0]}}))
    pl = lambda i, a, x, z, kind="settlement": {"id": i, "assetId": a, "kind": kind, "positionM": [x, 0, z]}
    bundle = {
        "kits": {"k1": {"glb": "kits/k1.glb"}},
        "settlement": {"boundaryM": [[0, 0], [100, 0], [100, 100], [0, 100]],
                       "walkRoutes": {"routes": {"r": {"points": [[10, 0, 10], [20, 0, 10], [30, 0, 20]]}}},
                       "groundPaint": {"entries": [
                           {"id": "paint.a", "kind": "road", "centrelineM": [[10, 10], [20, 10], [30, 20], [90, 90]]},
                           {"id": "paint.b", "kind": "footpath", "centrelineM": [[5, 95], [10, 95]]}]}},
        "doors": [
            {"id": "d.2", "thresholdM": [70, 70], "facingDeg": 90.0, "interiorClaim": {"cellId": "CellA"}},
            {"id": "d.1", "thresholdM": [30, 30], "facingDeg": 0.0, "interiorClaim": {"cellId": "CellA"}},
            {"id": "d.3", "thresholdM": [50, 10], "facingDeg": 0.0},
        ],
        "placements": [
            pl("p.lamp", "a:lamp-ish", 40, 40), pl("p.camp", "x:campfire01burning", 43, 40),
            pl("p.far", "x:torch", 80, 20), pl("p.win", "a:window", 10, 90),
            pl("p.smoke", "fx:smoke-fire", 40, 41, "effect"), pl("p.sign", "x:roadsignpost", 60, 60),
            # a hut over the fire cluster's first-choice stand point, and a ghost slab with no collider
            dict(pl("p.hut", "k:hut", 45, 43), collision={"kind": "mesh"}, footprintM=[[42.5, 41], [48, 41], [48, 46], [42.5, 46]]),
            dict(pl("p.ghost", "k:slab", 60, 62), collision={"kind": "none"}, footprintM=[[55, 58], [65, 58], [65, 66], [55, 66]]),
        ],
    }
    (pub / f"province/settlements/{PID}.json").write_text(json.dumps(bundle))
    return pub


def test_coverage_rules(tmp_path):
    r = walk_route.build_route(PID, fixture(tmp_path))
    assert r["schemaVersion"] == 2
    acts = [a for w in r["waypoints"] for a in w["actions"]]
    # every door with a linked cell gets a door action; the unlinked one does not
    assert sorted(a["doorId"] for a in acts if a["type"] == "door") == ["d.1", "d.2"] == r["doors"]
    # every burning fixture is in a fire action; windows and smoke are not fixtures; 6 m clustering
    fires = [a for a in acts if a["type"] == "fire"]
    assert sorted(f for a in fires for f in a["fixtureIds"]) == ["p.camp", "p.far", "p.lamp"] == r["fixtures"]
    assert len(fires) == 2 and all(a["n"] == 6 and a["dtS"] == 0.25 for a in fires)
    # 4 overviews first, a sign close-up, a base close-up per door
    assert [w["id"] for w in r["waypoints"][:4]] == ["overview-nw", "overview-ne", "overview-se", "overview-sw"]
    assert any(a.get("name") == "sign0" for a in acts)
    assert sum(1 for a in acts if a.get("name", "").endswith("-base")) == 3
    # door approach is 0.6 m outward along the compass facing (90 deg = +x), facing back in (west = -pi/2)
    d2 = next(a for a in acts if a.get("doorId") == "d.2")
    assert d2["approach"] == [70.6, 70.0] and math.isclose(d2["faceYaw"], -math.pi / 2, abs_tol=1e-3)
    assert d2["exitDoorLocalM"] == [1.0, 0.0, 2.0] and d2["interiorStep"] == 1.5
    # interior shots face into the room: exit door yaw (fixture 0) +180, +135, -135 deg, pitched down
    assert [round(math.degrees(s["yaw"])) for s in d2["interiorShots"]] == [180, 135, -135]
    assert all(s["pitch"] > 0 for s in d2["interiorShots"])
    assert d2["outShot"]["standM"] == [73.0, 70.0]
    # every stand point clears every collider by 0.5 m; the no-collider slab is ignored
    polys = walk_route.colliders(json.loads((tmp_path / f"public/province/settlements/{PID}.json").read_text()))
    assert len(polys) == 1
    for w in r["waypoints"]:
        assert walk_route.clearance(w["xM"], w["zM"], polys) >= 0.5, w["id"]
    # the fire cluster's stand was moved off the hut; pitch aims down at a ground fire from eye height
    f0 = next(a for a in fires if "p.camp" in a["fixtureIds"])
    assert f0["pitch"] > 0
    # overviews stand on a painted way (land)
    land = walk_route.land_points(walk_route.painted_ways(json.loads((tmp_path / f"public/province/settlements/{PID}.json").read_text())))
    for w in r["waypoints"][:4]:
        assert min(math.dist((w["xM"], w["zM"]), p) for p in land) < 0.01
    # walk only when under 40 m and the straight line is clear (or a -via detour precedes it)
    wps = r["waypoints"]
    assert wps[0]["arrive"] == "teleport"
    for a, b in zip(wps, wps[1:]):
        if b["arrive"] == "walk":
            legs = [walk_route.leave_point(a), *map(tuple, b.get("detourM", [])), (b["xM"], b["zM"])]
            assert math.dist(legs[0], legs[-1]) < 40
            assert not any(walk_route.blocking(p, q, polys) for p, q in zip(legs, legs[1:]))
    # the free walk follows the longest painted way, turning, at most 20 s
    fw = r["freeWalk"]
    assert fw["routeId"] == "paint.a" and fw["startM"] == [10, 10] and fw["seconds"] <= 20.0
    assert len({l["bearing"] for l in fw["legs"]}) >= 2


def test_blocked_line_gets_detour_or_teleport():
    wall = [(4.0, -1.0), (6.0, -1.0), (6.0, 1.0), (4.0, 1.0)]
    box = (0, 20, -20, 20)
    a = {"id": "a", "xM": 0.0, "zM": 0.0, "yawRad": 0, "actions": []}
    b = {"id": "b", "xM": 10.0, "zM": 0.0, "yawRad": 0, "actions": []}
    out = walk_route.set_arrivals([a, b], [wall], box)
    assert [w["id"] for w in out] == ["a", "b"] and out[1]["arrive"] == "walk"
    v = tuple(out[1]["detourM"][0])
    assert not walk_route.blocking((0, 0), v, [wall]) and not walk_route.blocking(v, (10, 0), [wall])
    # no room for a detour inside the boundary: teleport
    out = walk_route.set_arrivals([a, b], [wall], (0, 20, -0.2, 0.2))
    assert [w["arrive"] for w in out] == ["teleport", "teleport"]


def test_only_keeps_named(tmp_path):
    r = walk_route.build_route(PID, fixture(tmp_path), ["door2", "fire0"])
    assert sorted(w["id"] for w in r["waypoints"]) == ["door2", "fire0"]


def test_deterministic(tmp_path):
    pub = fixture(tmp_path)
    assert json.dumps(walk_route.build_route(PID, pub)) == json.dumps(walk_route.build_route(PID, pub))


def test_judge_groups(tmp_path):
    rep = tmp_path / "rep"
    rep.mkdir()
    (rep / "summary.json").write_text(json.dumps({"placeId": PID, "passes": []}))
    from PIL import Image
    for f in ["t12-overview-nw.jpg", "t22-overview-nw.jpg", "t12-door1-int0.jpg", "t12-door1-base.jpg"]:
        (rep / f).write_bytes(b"")
    for t in (12, 22):
        for k in range(2):
            for i in range(6):
                Image.new("RGB", (1000, 600), (i * 40, 0, 0)).save(rep / f"t{t}-fire{k}-f{i}.jpg")
    for i in range(13):
        (rep / f"t12-x{i:02d}.jpg").write_bytes(b"")
    written = walk_judge.briefs(rep)
    names = sorted(p.name for p in written)
    assert names == ["exterior-day-1.md", "exterior-day-2.md", "exterior-night-1.md", "fires-1.md", "interiors-1.md"]
    sheets = sorted(p.name for p in (rep / "judge/sheets").glob("*.jpg"))
    assert sheets == [f"t{t}-fire{k}-series.jpg" for t in (12, 22) for k in range(2)]
    for s in sheets:
        assert Image.open(rep / "judge/sheets" / s).width <= 2400
    fires = (rep / "judge/fires-1.md").read_text()
    assert "-f0.jpg" not in fires and "t12-fire0-series.jpg" in fires
    for p in written:
        assert p.read_text().count("\n- /") - p.read_text().count("\n- row") <= walk_judge.MAX_IMAGES
    text = (rep / "judge/interiors-1.md").read_text()
    assert "row 48:" in text and "reader.md" in text and "Nothing" in text


def test_close_up_pitch_from_eye_to_actual_target():
    ground = [(0.0, 10.0, 0.0)]
    centre, box = (0.0, 20.0), (-50, 50, -50, 50)
    # raised lantern 2.4 m over the ground: looks UP (negative) from 1.6 m eye height
    sx, sz, yaw, pitch = walk_route.close_up(0.0, 12.4, 0.0, walk_route.FIRE_SIZE_M, centre, ground, 10.0, [], box)
    assert pitch < 0 and math.isclose(pitch, -math.atan2(12.4 - 11.6, math.hypot(sx, sz)), abs_tol=1e-3)
    assert math.isclose(yaw, walk_route.bearing(sx, sz, 0.0, 0.0), abs_tol=1e-3)
    # ground campfire (flame 0.3 m over its origin): looks DOWN from the eye
    sx, sz, _, pitch = walk_route.close_up(0.0, 10.3, 0.0, walk_route.FIRE_SIZE_M, centre, ground, 10.0, [], box)
    assert pitch > 0 and math.isclose(pitch, math.atan2(11.6 - 10.3, math.hypot(sx, sz)), abs_tol=1e-3)
    # a high mount never asks for a look-up steeper than the camera arm allows
    _, _, _, steep = walk_route.close_up(0.0, 14.0, 0.0, walk_route.SIGN_SIZE_M, centre, ground, 10.0, [], box)
    assert -walk_route.CLOSE_MAX_UP_RAD - 0.01 <= steep < 0


def test_first_overview_has_clear_yaw_check_legs(tmp_path):
    pub = fixture(tmp_path)
    r = walk_route.build_route(PID, pub)
    polys = walk_route.colliders(json.loads((pub / f"province/settlements/{PID}.json").read_text()))
    w0 = r["waypoints"][0]
    assert w0["id"] == "overview-nw" and walk_route.yaw_check_clear((w0["xM"], w0["zM"]), polys)
