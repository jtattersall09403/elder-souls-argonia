"""Smoke tests for the second-pass settlement-form miner.

No plugin is read: the analysis takes plain data structures, so a synthetic
world exercises clustering, the measures and the report renderer.
"""

import json
import math

from . import mine_settlement_form_stats as mod


def _world() -> mod.World:
    world = mod.World()
    # a 3x3 grid of one-piece buildings, 15 m apart, on a slope, beside a road
    for i in range(3):
        for j in range(3):
            x, y = 100.0 + i * 15.0, 100.0 + j * 15.0
            world.pieces.append(mod.Piece(
                "meshes/architecture/testkit/house01.nif", "architecture/testkit",
                x, y, 10.0, 0.0, (6.0, 8.0, 5.0)))
            world.doors.append((x + 3.0, y, 10.0))
    for k in range(40):
        world.roads.append((80.0, 90.0 + k * 2.0))
    for k in range(40):
        world.water.append((250.0, 90.0 + k * 2.0))
    for gx in range(0, 40):
        for gy in range(0, 40):
            v = mod.CELL_SIZE_UNITS / (mod.LAND_DIM - 1) / mod.UNITS_PER_METRE
            world.heights[(gx * 4, gy * 4)] = gx * 4 * v * 0.1
    world.water_height[(1, 1)] = -5.0
    world.macro = {"cellsWalked": 4, "unresolvedRefs": 0, "architecturePieces": 9,
                   "worldspacesSeen": ["TestWorld"], "enclosurePieces": 0,
                   "doorRefs": 9, "roadSamples": 40, "dockRefs": 0,
                   "waterSamples": 40, "dressingRefs": 0, "heightSamples": 1600,
                   "heightSampleSpacingM": 7.28}
    return world


def test_buildings_and_settlement_are_found():
    form = mod.analyse(_world(), 45.0, 8.0, 4, 20.0)
    assert form["buildingsClustered"] == 9
    assert form["settlementCount"] == 1
    assert form["settlements"][0]["buildings"] == 9


def test_spacing_matches_the_synthetic_grid():
    form = mod.analyse(_world(), 45.0, 8.0, 4, 20.0)
    spacing = form["spacingBySize"]["7-12"]
    assert spacing["n"] == 9
    assert math.isclose(spacing["p50"], 15.0, abs_tol=0.1)


def test_measures_carry_their_sample_size():
    form = mod.analyse(_world(), 45.0, 8.0, 4, 20.0)
    for key in ("roadDistanceM", "waterDistanceM", "yawVsContourDeg",
                "doorSideVsRoadBearingDeg", "enclosurePiecesWithin15m"):
        assert "n" in form[key]
    assert form["buildingsNearRoad"]["within20m"] >= form["buildingsNearRoad"]["within5m"]


def test_family_and_enclosure_heuristics():
    assert mod.family_of("meshes/architecture/whiterun/wrhouse01.nif") == "dwelling"
    assert mod.family_of("meshes/architecture/farmhouse/farmhouse01.nif") == "work"
    assert mod.family_of("meshes/architecture/x/whatsit.nif") == "unclassified"
    assert mod.is_enclosure("meshes/architecture/farmhouse/wrfence01.nif")
    assert not mod.is_enclosure("meshes/architecture/whiterun/wrwall01.nif")


def test_report_renders_deterministically():
    report = {"schemaVersion": 1,
              "source": {"label": "Test", "worldspaces": ["TestWorld"]},
              "macro": _world().macro,
              "form": mod.analyse(_world(), 45.0, 8.0, 4, 20.0)}
    first = mod.render_report([report])
    second = mod.render_report([json.loads(json.dumps(report))])
    assert first == second
    assert "## Sources" in first and "what this evidence implies" in first.lower()
