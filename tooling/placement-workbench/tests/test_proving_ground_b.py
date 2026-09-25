"""The second proving yard (`place.fixture.proving-ground-b`), built only in
the placement workbench (lane round 3): the original yard's gates adapted
to the new fixture id, plus two the workbench makes possible — every run
joint of the PUBLISHED record is real mesh contact, and the published
poses are the workbench scene's poses (the compile realised the record
unchanged).

Reuses the original yard's own checks (`worldgen.test_proving_ground`:
`slope_failures`, `ground_audit`) where they take the place as input.
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

from workbench import measure, paths  # noqa: E402
from workbench.kits import Catalogue  # noqa: E402
from workbench.scene import Piece, Scene  # noqa: E402

paths.bridge()
from shapely.geometry import LineString, Point, Polygon  # noqa: E402
from worldgen import compile_settlement as cs  # noqa: E402
from worldgen import test_proving_ground as tpg  # noqa: E402

PLACE = "place.fixture.proving-ground-b"
BLUEPRINT = paths.BLUEPRINTS / f"{PLACE}.json"
SITE = paths.REPO_ROOT / "world/sources/sites/proving-ground-b.json"
PUBLISHED = paths.PROVINCE / "settlements.json"
SCENE = paths.OUTPUT / "scenes" / "yard-b.json"
JOINT_GAP_M = 0.03
JOINT_PENETRATION_M = 0.05
DOOR_TO_WAY_M = 4.0

pytestmark = pytest.mark.skipif(not BLUEPRINT.exists(), reason="yard B not authored yet")


@pytest.fixture(scope="module")
def survey():
    from worldgen.street_router import default_survey
    got = default_survey()
    if got is None:
        pytest.fail("the province survey rasters are unavailable")
    return got


@pytest.fixture(scope="module")
def bp():
    return json.loads(BLUEPRINT.read_text())["blueprint"]


@pytest.fixture(scope="module")
def bundle():
    return json.loads(PUBLISHED.read_text())


def _mine(bundle):
    return [p for p in bundle["placements"] if p["id"].startswith(PLACE + ".")]


def _by_parcel(bundle, suffix):
    return next(p for p in _mine(bundle) if p["id"].endswith(suffix))


def test_the_site_record_is_a_fixture():
    site = json.loads(SITE.read_text())
    assert site["id"] == PLACE and site["fixture"] is True


def test_yard_b_is_published(bundle):
    assert any(s["id"] == PLACE for s in bundle["settlements"])
    assert len(_mine(bundle)) >= 15


def test_every_parcel_sits_within_its_fit_slope_limit(bp, survey):
    assert tpg.slope_failures(bp, survey, cs.FIT_SLOPE_LIMIT_DEG) == []


def test_no_published_piece_floats_or_misplaces_its_sill(bundle, survey):
    rows = tpg.ground_audit(bundle, survey, tpg._published_kits(bundle), place=PLACE)
    checked = [r for r in rows if not (r["slopeExempt"] or r["dockExempt"])]
    assert rows and checked
    assert [r["id"] for r in checked if r["floatM"] > tpg.FLOAT_LIMIT_M] == []
    assert [r["id"] for r in rows if r["sillM"] > tpg.SILL_LIMIT_M] == []


def test_the_hull_floats_on_a_metre_of_water_all_round(bp, survey):
    hull = next(p for p in bp["parcels"] if p["id"] == "parcel.proving-ground-b.hull-berth")
    halo = Polygon([survey.uv_to_m(u, v) for u, v in hull["footprint"]]).buffer(tpg.HULL_HALO_M)
    depth = survey.water_signed_depth_m
    pm = survey.extent_m / depth.shape[0]
    x0, z0, x1, z1 = halo.bounds
    cells = [float(depth[r, c]) for r in range(int(z0 // pm), int(z1 // pm) + 1)
             for c in range(int(x0 // pm), int(x1 // pm) + 1)
             if halo.contains(Point((c + .5) * pm, (r + .5) * pm))]
    assert cells and min(cells) >= tpg.HULL_MIN_DEPTH_M, min(cells)


def test_the_landing_stage_runs_from_the_shore_to_the_hull(bundle, survey):
    from worldgen.blueprint_integration import runtime_world_xz
    stage = _by_parcel(bundle, "landing-stage.building")
    hull = _by_parcel(bundle, "hull-berth.building")
    kits = tpg._published_kits(bundle)
    landward, seaward = cs.quay_run_ends_local(kits[stage["kit"]][stage["assetId"]])
    centre = (stage["positionM"][0], stage["positionM"][2])

    def wet(t):
        return bool(survey.wet_grid[survey.grid_px(*runtime_world_xz(centre, stage["yawDeg"],
                                                                        (0.0, t)))])

    assert not wet(landward - tpg.DOOR_DOORWAY_M) and wet(landward + tpg.DOOR_DOORWAY_M)
    h = kits[hull["kit"]][hull["assetId"]]
    size, off = h["sizeM"], h["originOffsetM"]
    corners = [(-off[0], -(size[1] - off[1])), (size[0] - off[0], -(size[1] - off[1])),
               (size[0] - off[0], off[1]), (-off[0], off[1])]
    outline = Polygon([runtime_world_xz((hull["positionM"][0], hull["positionM"][2]),
                                        hull["yawDeg"], c) for c in corners])
    tip = Point(runtime_world_xz(centre, stage["yawDeg"], (0.0, seaward)))
    assert outline.exterior.distance(tip) <= tpg.DOOR_DOORWAY_M or outline.contains(tip)


@pytest.mark.parametrize("asset_id", [tpg.SCONCE, tpg.SIGN])
def test_the_mounted_children_hang_off_a_parent(bundle, asset_id):
    rows = [p for p in _mine(bundle) if p["assetId"] == asset_id]
    assert rows and all(r.get("parentPlacementId") and len(r.get("mountOffsetM") or []) == 3
                        for r in rows)


def test_every_door_opens_onto_a_way(bundle, bp, survey):
    ways = [LineString([survey.uv_to_m(u, v) for u, v in r["points"]]) for r in bp["routes"]]
    doors = [d for d in bundle["doors"] if d["settlementId"] == PLACE]
    assert doors
    far = {d["id"]: round(min(w.distance(Point(d["thresholdM"])) for w in ways), 2)
           for d in doors}
    assert all(v <= DOOR_TO_WAY_M for v in far.values()), far


def _published_piece(p) -> Piece:
    """A published placement as a workbench piece (height set by the caller)."""
    return Piece(p["id"], p["assetId"], p["positionM"][0], p["positionM"][2], p["yawDeg"],
                 None, float(p.get("scale", 1.0)))


def test_every_run_joint_of_the_published_record_is_real_contact(bundle):
    cat = Catalogue()
    scene = Scene.load(SCENE) if SCENE.exists() else None
    if scene is None or not scene.groundStem:
        pytest.skip("the workbench scene (gitignored output) is not on this machine")
    ground = scene.ground()
    run = sorted((p for p in _mine(bundle) if ".imperial-wall-run.piece." in p["id"]),
                 key=lambda p: int(p["id"].rsplit(".", 1)[-1]))
    assert len(run) >= 2
    pieces = []
    for p in run:
        piece = _published_piece(p)
        piece.y = measure.seat(cat, ground, piece)["y"]
        pieces.append(piece)
    bad = {}
    for a, b in zip(pieces, pieces[1:]):
        got = measure.contact(cat, a, b)
        if got["gapM"] > JOINT_GAP_M or (got["penetrationM"] or 0) > JOINT_PENETRATION_M:
            bad[f"{a.uid}>{b.uid}"] = got
    assert not bad, bad


def test_the_published_poses_are_the_workbench_poses(bundle):
    """The record is the output: every bound scene piece is published where
    the agent put it (1 cm, 0.1 deg). A quay run within half the compile's
    bank-search step: `anchor_quay_run` slides every quay pose by at least
    that (its line sits half a step off the grid it walks), so no authored
    pose is kept to the centimetre (`wb.py check` reports the slide)."""
    if not SCENE.exists():
        pytest.skip("the workbench scene (gitignored output) is not on this machine")
    scene = Scene.load(SCENE)
    published = _mine(bundle)
    missing, moved = [], {}
    for p in scene.pieces:
        kind, rid = p.role.get("kind"), p.role.get("id")
        if kind in (None, "landmark"):
            continue      # landmarks are seated by their mined pair (mount_children)
        suffix = (rid.rsplit("proving-ground-b.", 1)[1]
                  + (f".piece.{p.role['index'] + 1}" if kind == "run" else ".building"))
        row = next((q for q in published if q["id"].endswith(suffix)), None)
        if row is None:
            missing.append(suffix)
            continue
        d = math.hypot(row["positionM"][0] - p.x, row["positionM"][2] - p.z)
        dyaw = abs(((row["yawDeg"] - p.yaw) + 180) % 360 - 180)
        reach = (cs.QUAY_SHORE_STEP_M / 2 + 0.001
                 if p.asset.startswith(cs.QUAY_RUN_PREFIX) else 0.01)
        if d > reach or dyaw > 0.1:
            moved[suffix] = (round(d, 3), round(dyaw, 2))
    assert not missing and not moved, (missing, moved)
