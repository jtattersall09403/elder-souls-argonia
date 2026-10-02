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
                       "walkRoutes": {"routes": {"r": {"points": [[10, 0, 10], [20, 0, 10], [30, 0, 20]]}}}},
        "doors": [
            {"id": "d.2", "thresholdM": [70, 70], "facingDeg": 90.0, "interiorClaim": {"cellId": "CellA"}},
            {"id": "d.1", "thresholdM": [30, 30], "facingDeg": 0.0, "interiorClaim": {"cellId": "CellA"}},
            {"id": "d.3", "thresholdM": [50, 10], "facingDeg": 0.0},
        ],
        "placements": [
            pl("p.lamp", "a:lamp-ish", 40, 40), pl("p.camp", "x:campfire01burning", 43, 40),
            pl("p.far", "x:torch", 80, 20), pl("p.win", "a:window", 10, 90),
            pl("p.smoke", "fx:smoke-fire", 40, 41, "effect"), pl("p.sign", "x:roadsignpost", 60, 60),
        ],
    }
    (pub / f"province/settlements/{PID}.json").write_text(json.dumps(bundle))
    return pub


def test_coverage_rules(tmp_path):
    r = walk_route.build_route(PID, fixture(tmp_path))
    assert r["schemaVersion"] == 1
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
    # door approach is 1 m outward along the compass facing (90 deg = +x), facing back in (west = -pi/2)
    d2 = next(a for a in acts if a.get("doorId") == "d.2")
    assert d2["approach"] == [71.0, 70.0] and math.isclose(d2["faceYaw"], -math.pi / 2, abs_tol=1e-3)
    assert d2["exitDoorLocalM"] == [1.0, 0.0, 2.0] and len(d2["interiorShots"]) == 3
    # walk under 40 m, else teleport; first is always a teleport
    wps = r["waypoints"]
    assert wps[0]["arrive"] == "teleport"
    for a, b in zip(wps, wps[1:]):
        near = math.hypot(b["xM"] - a["xM"], b["zM"] - a["zM"]) < 40
        assert b["arrive"] == ("walk" if near else "teleport")
    assert r["freeWalk"]["seconds"] == 20.0 and math.isclose(sum(l["seconds"] for l in r["freeWalk"]["legs"]), 20, abs_tol=0.05)


def test_deterministic(tmp_path):
    pub = fixture(tmp_path)
    assert json.dumps(walk_route.build_route(PID, pub)) == json.dumps(walk_route.build_route(PID, pub))


def test_judge_groups(tmp_path):
    rep = tmp_path / "rep"
    rep.mkdir()
    (rep / "summary.json").write_text(json.dumps({"placeId": PID, "passes": []}))
    for f in ["t12-overview-nw.jpg", "t22-overview-nw.jpg", "t12-door1-int0.jpg", "t22-fire0-f0.jpg", "t12-door1-base.jpg"]:
        (rep / f).write_bytes(b"")
    for i in range(13):
        (rep / f"t12-x{i:02d}.jpg").write_bytes(b"")
    names = sorted(p.name for p in walk_judge.briefs(rep))
    assert names == ["exterior-day-1.md", "exterior-day-2.md", "exterior-night-1.md", "fires-closeups-1.md", "interiors-1.md"]
    text = (rep / "judge/interiors-1.md").read_text()
    assert "row 48:" in text and "reader.md" in text and "Nothing" in text
