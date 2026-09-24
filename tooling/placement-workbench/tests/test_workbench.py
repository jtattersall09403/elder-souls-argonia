"""Round 1 answers (tests/expected_round1.json, written before the code).

Needs the raw kit builds (tooling/asset-pipeline/output/kits) and the
published province rasters: a local test, not a CI one (like the miners').
The ground window is extracted once per session (~15 s: the survey load).
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from workbench import describe, ground, measure, paths, snap  # noqa: E402
from workbench.kits import Catalogue  # noqa: E402
from workbench.scene import Piece, Scene  # noqa: E402

pytestmark = pytest.mark.skipif(not paths.RAW_KITS.exists(), reason="raw kit builds absent")

FENCE = "vanilla:architecture/whiterun/wrfarmfence/wrfencebasestr01"
WALL = "vanilla:dungeons/imperial/clutterkits/impfreewall01"
SCONCE = "vanilla:clutter/imperial/impwallsconcecandle01"
KEEP = "mwkeep:tesak1243/mwimperialarchitecture/architecture/keep/exterior/walls/"
PUBLISHED = paths.PROVINCE / "settlements.json"
YARD = "place.fixture.proving-ground."


@pytest.fixture(scope="session")
def cat():
    return Catalogue()


@pytest.fixture(scope="session")
def scene(tmp_path_factory):
    tmp = tmp_path_factory.mktemp("wb")
    stem = tmp / "ground"
    ground.extract((4310.0, 5740.0), 150.0, stem)
    s = Scene(path=tmp / "scene.json", groundStem=str(stem))
    return s


@pytest.fixture(scope="session")
def published():
    bundle = json.loads(PUBLISHED.read_text())
    return {p["id"].rsplit("proving-ground.", 1)[1]: p for p in bundle["placements"]
            if p["id"].startswith(YARD)}


def _settled(cat, scene, piece: Piece, source="chunks") -> Piece:
    piece.y = measure.seat(cat, scene.ground(), piece, source)["y"]
    return piece


def test_the_expectations_file_names_the_eleven_cases():
    cases = json.loads((HERE / "expected_round1.json").read_text())["cases"]
    assert len(cases) == 11


def test_a_geometric_fence_snap_touches_at_zero_gap(cat, scene):
    a = _settled(cat, scene, Piece("f1", FENCE, 4300.0, 5750.0, 30.0))
    b = Piece("f2", FENCE, 4310.0, 5750.0, 0.0)
    snap.snap_geometry(cat, b, a, "-y", "+y")
    got = measure.contact(cat, b, a)
    assert got["gapM"] <= 0.002 and (got["penetrationM"] or 0.0) <= 0.002, got
    assert math.isclose(b.yaw, 30.0)


def test_an_evidence_fence_snap_takes_the_plugins_pitch(cat, scene):
    a = _settled(cat, scene, Piece("f1", FENCE, 4300.0, 5750.0, 30.0))
    b = Piece("f2", FENCE, 0.0, 0.0)
    got = snap.snap_evidence(b, a, "-y", "+y")
    assert got["used"]["count"] == 19
    assert math.isclose(math.dist((a.x, a.z), (b.x, b.z)), 3.64, abs_tol=0.001)
    assert measure.contact(cat, b, a)["gapM"] <= 0.02


def test_the_wall_run_by_evidence_matches_the_compiled_yard(cat, published):
    p1, p2 = (published["imperial-wall-run.piece.1"], published["imperial-wall-run.piece.2"])
    a = Piece("w1", p1["assetId"], p1["positionM"][0], p1["positionM"][2], p1["yawDeg"], 0.0)
    b = Piece("w2", p2["assetId"], 0.0, 0.0)
    snap.snap_evidence(b, a)
    assert math.isclose(b.x, p2["positionM"][0], abs_tol=0.001)
    assert math.isclose(b.z, p2["positionM"][2], abs_tol=0.001)


def test_the_mud_hut_doorway_is_where_the_record_puts_it_on_the_mesh(cat):
    """Amended expectation (recorded in round-1.md): the `-with-door`
    composite carries its door leaf, so the doorway is closed geometry and
    the ray scan cannot see it as an opening. The descriptor gives the
    record's doorway, and the mesh stands in that doorway's wall line."""
    d = describe.describe(cat, "composite:mud/hut-with-entrance")
    door = d["doorways"][0]
    assert door["planXZ"] == [3.09, 5.72] and math.isclose(door["bearingDeg"], 151.59,
                                                            abs_tol=0.1)
    ground_probe = door["probes"][0]
    assert abs(ground_probe["meshRadiusM"] - door["radiusM"]) <= 1.0, door


def test_the_stilt_hut_front_is_open_on_its_record_bearing(cat):
    """Amended: an `open-front` entrance is a porch, not a hole; the record
    bearing is 0.13 deg and no mesh stands on that line at deck level."""
    d = describe.describe(cat, "composite:stilt/stilthouse-with-door")
    door = d["doorways"][0]
    assert abs(door["bearingDeg"]) <= 30
    assert any(p["meshRadiusM"] is None for p in door["probes"] if p["floorZM"] > -2.0)


def _audit_y(cat, scene, placement) -> float:
    """test_proving_ground.ground_audit's y on the published record."""
    row = cat.row(placement["assetId"])
    fp = placement["footprintM"] or [[placement["positionM"][0], placement["positionM"][2]]]
    g = scene.ground()
    heights = [g.survey_height(x, z) for x, z in fp]
    fit = ((row.get("placement") or {}).get("evidence") or {}).get("policyId")
    line = min(heights) if fit == "dug-in" else sum(heights) / len(heights)
    # the runtime reads the sink from the kit MANIFEST (createPlacementResolver
    # `meta.designedSinkM`), not from the bundle's copy in `anchor`
    return line - row["designedSinkM"]["p50"] * placement.get("scale", 1.0)


@pytest.mark.parametrize("key", ["imperial-house.building", "cave-mouth.building"])
def test_settle_matches_the_compiles_ground_audit(cat, scene, published, key):
    p = published[key]
    piece = Piece("x", p["assetId"], p["positionM"][0], p["positionM"][2], p["yawDeg"])
    got = measure.seat(cat, scene.ground(), piece, "survey")
    assert abs(got["y"] - _audit_y(cat, scene, p)) <= 0.02


def test_the_raft_floats_at_the_recorded_level(cat, scene, published):
    p = published["hull-berth.building"]
    piece = Piece("raft", p["assetId"], p["positionM"][0], p["positionM"][2], p["yawDeg"])
    got = measure.seat(cat, scene.ground(), piece)
    line = cat.row(p["assetId"])["designedWaterlineM"]
    assert math.isclose(got["waterLevelM"], p["waterLevelM"], abs_tol=0.01)
    assert math.isclose(got["y"], p["waterLevelM"] - line, abs_tol=0.01)


def test_the_sconce_mounts_on_the_wall_by_its_band(cat, scene):
    wall = _settled(cat, scene, Piece("wall", WALL, 4265.265, 5685.496, 180.0))
    sconce = Piece("sconce", SCONCE, 0.0, 0.0)
    snap.mount(sconce, wall)
    got = measure.contact(cat, sconce, wall)
    assert got["gapM"] <= 0.03 and got["patchOfA"] == "side", got
    assert math.isclose(sconce.yaw, (180.0 + 90.24) % 360, abs_tol=0.01)


def test_a_one_metre_gap_measures_one_metre(cat, scene):
    a = _settled(cat, scene, Piece("a", WALL, 4300.0, 5750.0, 0.0))
    width = cat.mesh(WALL).bounds[1][0] - cat.mesh(WALL).bounds[0][0]
    b = Piece("b", WALL, a.x + width + 1.0, a.z, 0.0, a.y)
    got = measure.contact(cat, a, b)
    assert math.isclose(got["gapM"], 1.0, abs_tol=0.01) and not got["intersecting"], got


def test_a_raised_piece_reports_its_float(cat, scene):
    a = _settled(cat, scene, Piece("a", WALL, 4300.0, 5750.0, 0.0))
    before = measure.float_under(cat, scene.ground(), a)
    a.y += 0.5
    after = measure.float_under(cat, scene.ground(), a)
    assert math.isclose(after["footFloatMinM"] - before["footFloatMinM"], 0.5, abs_tol=0.001)
    assert math.isclose(after["footFloatMaxM"], before["footFloatMaxM"] + 0.5, abs_tol=0.001)
    assert abs(after["footFloatMeanM"] - 0.5) <= 0.1, after


def test_the_chunk_sampler_agrees_with_the_survey_on_the_yard_to_a_pixel(scene):
    """The two samplers read different rasters (streamed lod1 vs refined);
    on the flat yard they agree to well under a metre (a sampler bug, e.g.
    a swapped axis, would not)."""
    g = scene.ground()
    for x, z in ((4276.2, 5795.2), (4320.1, 5736.7), (4252.5, 5674.5)):
        assert abs(g.chunk_height(x, z) - g.survey_height(x, z)) < 0.5


def test_export_writes_the_compiles_own_centre_back(cat, scene, published, tmp_path):
    """A scene piece posed at a compiled parcel's pivot exports the
    blueprint's own centreUV (9 dp) and yaw: the record round-trips."""
    from workbench import export
    src = paths.BLUEPRINTS / "place.fixture.proving-ground.json"
    doc = json.loads(src.read_text())
    target = tmp_path / "bp.json"
    target.write_text(json.dumps(doc))
    p = published["mud-hut.building"]
    piece = Piece("hut", p["assetId"], p["positionM"][0], p["positionM"][2], p["yawDeg"],
                  role={"kind": "parcel", "id": "parcel.proving-ground.mud-hut"})
    s = Scene(path=tmp_path / "s.json", groundStem=scene.groundStem, pieces=[piece])
    export.export(s, target, write=True)
    before = next(q for q in doc["blueprint"]["parcels"] if q["id"] == piece.role["id"])
    after = next(q for q in json.loads(target.read_text())["blueprint"]["parcels"]
                 if q["id"] == piece.role["id"])
    # the published positionM is rounded to 1 mm: 1e-7 UV is 0.7 mm
    assert all(abs(a - b) <= 1e-7 for a, b in zip(after["centreUV"], before["centreUV"]))
    assert math.isclose(after["yawDeg"], before["yawDeg"], abs_tol=0.05)
    assert after["why"] == before["why"]


def test_an_exported_run_is_laid_exactly_where_the_workbench_put_it(tmp_path, scene):
    """The `atM` schema field: export a run turned 37 deg, lay it with the
    compile's own `lay_pieces`, get the scene poses back (1 mm, 0.01 deg)."""
    from workbench import export
    paths.bridge()
    from worldgen import blueprint_footprints as fp
    run = [Piece(f"w{i}", KEEP + name, 4300.0 + 7.27 * i * math.sin(math.radians(37)),
                 5750.0 - 7.27 * i * math.cos(math.radians(37)), 37.0 + (180.0 if i == 2 else 0.0),
                 role={"kind": "run", "id": "parcel.t.run", "index": i})
           for i, name in enumerate(("mwimparchwall01destroyed01", "mwimparchwallgate01",
                                     "mwimparchwalltower01"))]
    s = Scene(path=tmp_path / "s.json", groundStem=scene.groundStem, pieces=run)
    parcel = export.poses(s, scene.ground().extent_m)["parcels"]["parcel.t.run"]
    assert all("atM" in q for q in parcel["pieces"])
    laid, errors = fp.lay_pieces(parcel)
    assert errors == [] and all(row["pair"] == "authored" for row in laid)
    cx, cz = (v * scene.ground().extent_m for v in parcel["centreUV"])
    for piece, row in zip(run, laid):
        assert math.isclose(cx + row["xM"], piece.x, abs_tol=1e-3)
        assert math.isclose(cz + row["zM"], piece.z, abs_tol=1e-3)
        assert abs(((row["yawDeg"] - piece.yaw) + 180) % 360 - 180) < 0.01


def test_a_run_mixing_authored_and_solved_members_is_refused():
    paths.bridge()
    from worldgen import blueprint as bp_mod
    parcel = {"id": "parcel.t.run", "districtId": "d", "use": "civic", "centreUV": [0.5, 0.5],
              "yawDeg": 0.0, "orientationWhy": "Faces the test way for the check.",
              "pieces": [{"asset": KEEP + "mwimparchwall01destroyed01", "atM": [0.0, 0.0]},
                         {"asset": KEEP + "mwimparchwallgate01"}]}
    errors = bp_mod.validate_blueprint({"id": "place.t", "parcels": [parcel]})
    assert any("every piece carries an authored atM or none" in e for e in errors), errors


def test_an_assembly_is_realised_where_the_workbench_put_it(tmp_path, scene, cat):
    """Export a shell with a piece hung on it (turned, pitched) and a piece
    on the ground; compile them with the compile's own `assembly_placements`;
    compose the hung one the way the runtime does (`mountedTransform`): it
    lands on the scene pose (1 mm, 0.01 deg)."""
    from workbench import export
    paths.bridge()
    from worldgen import compile_settlement as cs
    shell = _settled(cat, scene, Piece("house", "composite:farmhouse/farmhouse01-with-door",
                                       4276.232, 5795.167, 33.0,
                                       role={"kind": "parcel", "id": "parcel.t.house"}))
    hung = Piece("sconce", SCONCE, shell.x + 2.0, shell.z - 1.0, 120.0, shell.y + 2.5, pitch=7.0,
                 role={"kind": "assembly", "id": "parcel.t.house", "layer": "light",
                       "on": "parent", "evidence": "measured"})
    barrel = Piece("wall", WALL, shell.x - 9.0, shell.z + 6.0, 80.0,
                   role={"kind": "assembly", "id": "parcel.t.house", "layer": "clutter",
                         "on": "ground", "evidence": "measured"})
    s = Scene(path=tmp_path / "s.json", groundStem=scene.groundStem, pieces=[shell, hung, barrel])
    fields = export.poses(s, scene.ground().extent_m)["parcels"]["parcel.t.house"]
    parcel = {"id": "parcel.t.house", **fields}
    building = {"id": "b.parcel.t.house.building", "positionM": [shell.x, shell.y, shell.z],
                "yawDeg": fields["yawDeg"], "scale": 1.0}
    errors = []

    class _Survey:
        height_at = staticmethod(lambda x, z: scene.ground().survey_height(x, z))

    rows = cs.assembly_placements("b", "seed", parcel, building, cat.shelf, _Survey(), errors)
    assert errors == [] and len(rows) == 2
    got = next(r for r in rows if r["assetId"] == SCONCE)
    world = snap.runtime_mounted_pose(shell, got["mountOffsetM"], got["yawDeg"])
    assert math.isclose(world["x"], hung.x, abs_tol=1e-3)
    assert math.isclose(world["z"], hung.z, abs_tol=1e-3)
    assert math.isclose(world["y"], hung.y, abs_tol=1e-3)
    assert abs(((world["worldYawDeg"] - hung.yaw) + 180) % 360 - 180) < 0.01
    assert got["pitchDeg"] == 7.0 and got["footprintM"] == []
    on_ground = next(r for r in rows if r["assetId"] == WALL)
    assert math.isclose(on_ground["positionM"][0], barrel.x, abs_tol=1e-3)
    assert abs(((on_ground["yawDeg"] - barrel.yaw) + 180) % 360 - 180) < 0.01
    assert len(on_ground["footprintM"]) == 4


def test_the_assembly_validator_names_each_bad_member():
    paths.bridge()
    from worldgen import blueprint as bp_mod
    parcel = {"assetRef": "x", "assembly": [
        {"asset": WALL, "atM": [0, 0], "on": "parent", "layer": "window", "evidence": "measured"},
        {"asset": WALL, "atM": [0], "on": "roof", "layer": "gargoyle", "evidence": ""}]}
    got = bp_mod.assembly_failures(parcel)
    assert any("assembly[0]: a piece on its parent needs upM" in e for e in got)
    assert {"atM", "on must", "layer must", "evidence must"} <= {
        k for e in got for k in ("atM", "on must", "layer must", "evidence must")
        if e.startswith("assembly[1]") and k in e}


def test_penetration_is_the_same_whichever_piece_is_named_first(cat, scene):
    a = _settled(cat, scene, Piece("a", WALL, 4300.0, 5750.0, 0.0))
    b = Piece("b", WALL, a.x + 5.9, a.z, 0.0, a.y)      # 0.2 m overlap at the ends
    ab, ba = measure.contact(cat, a, b), measure.contact(cat, b, a)
    assert ab["intersecting"] and ab["penetrationM"] is not None
    assert math.isclose(ab["penetrationM"], ba["penetrationM"], abs_tol=0.002)
    assert 0.15 <= ab["penetrationM"] <= 0.25, ab
