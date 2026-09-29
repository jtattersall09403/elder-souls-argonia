"""The runtime pad overlay (decision 0102 decision 1): the chain's pad maths
without the chain, and the golden fixture the TypeScript twin reads."""

import json
from pathlib import Path

import numpy as np
import pytest

from . import pad_overlay as po
from .settlement_bundles import load_published

REPO = Path(__file__).resolve().parents[3]
FIXTURE = REPO / "packages/game-core/src/terrain/__fixtures__/ground-overlays-claywater.json"
PROVINCE_DIR = REPO / "apps/world-studio/public/province"   # the place bundles (S8)


def test_the_grid_form_holds_the_golden_points():
    """apply_grid (the grid form, which replaced the chain's retired
    `apply_settlement_pad`) gives every golden point's expected height when
    the point is a sample of the grid."""
    doc = json.loads(FIXTURE.read_text())
    for pt in doc["points"]:
        got = po.apply_grid(np.array([[pt["baseM"]]], np.float32), (pt["x"], pt["z"]), 1.0,
                            doc["overlays"])
        assert abs(float(got[0, 0]) - pt["expectedM"]) < 1e-4, pt


def test_the_grid_form_is_the_point_form_on_every_sample():
    """apply_grid over a sloping, bumpy grid equals overlay_height at every
    sample, overlays in id order."""
    overlays = json.loads(FIXTURE.read_text())["overlays"]
    mps = 1.0
    ny, nx = 160, 140
    zz, xx = np.mgrid[0:ny, 0:nx].astype(np.float64)
    ox, oz = 240.0, 2970.0
    base = (34.0 + 0.02 * xx - 0.015 * zz + 0.4 * np.sin(xx / 7.0) * np.cos(zz / 5.0)).astype(np.float32)
    ours = po.apply_grid(base, (ox, oz), mps, overlays)
    for r in range(0, ny, 3):
        for c in range(0, nx, 3):
            want = po.overlay_height(float(base[r, c]), ox + c * mps, oz + r * mps, overlays)
            assert abs(float(ours[r, c]) - want) < 1e-4, (r, c)
    assert np.abs(ours - base).max() > 0.1          # the pads do move the ground here


def test_the_golden_points_hold():
    doc = json.loads(FIXTURE.read_text())
    assert doc["schemaVersion"] == 1 and len(doc["points"]) == 12
    zones = {p["zone"] for p in doc["points"]}
    assert zones == {"core", "blend", "outside"}
    for pt in doc["points"]:
        got = po.overlay_height(pt["baseM"], pt["x"], pt["z"], doc["overlays"])
        assert abs(got - pt["expectedM"]) < 1e-9, pt
        if pt["zone"] == "outside":
            assert got == pt["baseM"]


def test_a_declared_pad_without_an_overlay_is_named():
    site = {"id": "place.t", "placementIds": ["a", "b"], "groundOverlays": {"schemaVersion": 1, "pads": [
        {"id": "o", "bboxM": [0, 0, 1, 1], "blendM": 3.0, "hardM": 0.0,
         "pieces": [{"placementId": "a", "polygonM": [[0, 0], [1, 0], [1, 1]], "datumM": 1.0}]}]}}
    rows = {"a": {"pad": {"datumM": 1.0}}, "b": {"pad": {"datumM": 2.0}}}
    assert po.missing_overlays(site, rows) == ["b"]


def test_the_published_bundle_carries_every_declared_pad():
    """The real defect 0102 names: Claywater's pads waited for the chain."""
    bundle = load_published(PROVINCE_DIR)
    by_id = {p["id"]: p for p in bundle["placements"]}
    missing = [(s["id"], pid) for s in bundle["settlements"]
               for pid in po.missing_overlays(s, by_id)]
    assert missing == []
    assert "pendingPadGrades" not in bundle
    clay = next(s for s in bundle["settlements"] if s["id"] == "place.imperial-fringe.claywater-station")
    assert clay["groundOverlays"]["schemaVersion"] == 1
    assert clay["vegetationClearance"]["hardClear"]


def _square(x0, z0, x1, z1):
    return [[x0, z0], [x1, z0], [x1, z1], [x0, z1]]


def test_a_building_pad_outranks_a_run_pad_where_they_overlap():
    """16k r7 rule 1: a retaining run's pad whose hard zone covers a hut's
    plinth pad must not lift the plinth. Ids chosen so the run sorts AFTER
    the building (the id-order maths let the run win: b2 stood 1.18 m off)."""
    building = po.building_overlay("a-hut", _square(0, 0, 4, 4), 10.0, 3.0)
    run = {"id": "z-wall", "kind": "run", "bboxM": [3.0, -2.0, 5.0, 6.0], "blendM": 3.0,
           "hardM": 2.74, "pieces": [{"placementId": "w1", "polygonM": _square(3, -2, 5, 6),
                                      "datumM": 11.2}]}
    top = 10.0 - po.PAD_FLOOR_CLEARANCE_M     # the pad grades under its floor datum (R75)
    for x, z in ((1.0, 2.0), (3.5, 2.0), (2.0, 0.5)):
        assert po.overlay_height(9.0, x, z, [building, run]) == top, (x, z)
        assert po.overlay_height(9.0, x, z, [run, building]) == top, (x, z)
        assert po.ground(lambda _x, _z: 9.0, [run, building])(x, z) == top
        got = po.apply_grid(np.array([[9.0]], np.float32), (x, z), 1.0, [run, building])
        assert abs(float(got[0, 0]) - top) < 1e-5
    # outside the building polygon the run pad still holds its wall
    assert po.overlay_height(9.0, 7.5, 2.0, [building, run]) == 11.2


def test_the_apply_order_is_runs_then_buildings_and_old_bundles_classify_by_hard_radius():
    legacy_building = {"id": "a", "bboxM": [0, 0, 1, 1], "blendM": 3.0, "hardM": 0.0, "pieces": []}
    legacy_run = {"id": "b", "bboxM": [0, 0, 1, 1], "blendM": 3.0, "hardM": 2.7, "pieces": []}
    assert [o["id"] for o in po.apply_order([legacy_building, legacy_run])] == ["b", "a"]
    patch = {"id": "p", "bboxM": [0, 0, 1, 1], "blendM": 3.0, "source": {"buildingId": "x"},
             "params": {"pieces": []}}
    assert po.overlay_from_patch(patch, 2.7)["kind"] == "building"
    assert po.overlay_from_patch({**patch, "source": {"runId": "r"}}, 2.7)["kind"] == "run"


POOL_OP = {"op": "pool", "uid": "spring", "centreM": [10.0, 20.0], "radiusM": 4.0,
           "depthM": 0.6, "why": "w", "sources": ["s"]}


def test_a_pool_op_is_a_24_vertex_basin_overlay_and_a_still_water_record():
    ground = lambda x, z: 30.0 + 0.1 * x          # noqa: E731  (31.0 at the centre)
    o = po.pool_overlay(POOL_OP, "place.t", ground)
    assert o["id"] == "pool.place.t.spring" and o["kind"] == "pool"
    assert o["hardM"] == 0.0 and o["blendM"] == 1.0         # rimM default
    (piece,) = o["pieces"]
    assert len(piece["polygonM"]) == 24
    assert piece["datumM"] == pytest.approx(31.0 - 0.6)
    assert all(np.hypot(x - 10.0, z - 20.0) == pytest.approx(4.0) for x, z in piece["polygonM"])
    assert o["bboxM"] == pytest.approx([6.0, 16.0, 14.0, 24.0])
    assert po.pool_overlay({**POOL_OP, "rimM": 2.5}, "place.t", ground)["blendM"] == 2.5
    rec = po.pool_record(POOL_OP, "place.t", ground)
    assert rec == {"id": "pool.place.t.spring", "centreM": [10.0, 20.0], "radiusM": 4.0,
                   "levelM": pytest.approx(31.0 - 0.08), "bedM": pytest.approx(30.4)}
    assert rec["bedM"] == pytest.approx(piece["datumM"])
    # the basin cuts the ground at the centre, and is not a building pad
    assert po.overlay_height(31.0, 10.0, 20.0, [o]) == pytest.approx(30.4)
    assert not po.is_building(o)
    assert po.pool_op_errors(POOL_OP) == []
