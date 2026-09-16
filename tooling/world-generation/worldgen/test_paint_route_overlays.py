"""The overlay painter draws the published records, and only those."""

import json

import numpy as np

from worldgen import paint_route_overlays as p


def _routes(tmp_path, px, junctions=()):
    (tmp_path / "routes.json").write_text(json.dumps({
        "schemaVersion": 1,
        "routes": [{"id": "route.road.a-b", "class": "road", "px": px}],
        "junctions": list(junctions),
    }))
    return tmp_path


def test_road_cells_are_tan_and_dilated(tmp_path):
    cells = [[10, 10], [11, 10], [12, 10]]
    img = p.paint_routes(_routes(tmp_path, cells))
    for x, y in cells:
        assert tuple(img[y, x]) == p.ROAD_RGBA
    assert tuple(img[11, 11]) == p.ROAD_RGBA          # dilated by one px
    assert tuple(img[10, 14]) == (0, 0, 0, 0)         # nothing two px away
    # tan only on/around the line: a 3-cell line dilates to 11 texels (4-connected)
    assert int((img[..., 3] > 0).sum()) == 11


def test_minor_tracks_unpainted_when_stage_disabled(tmp_path, monkeypatch):
    prov = _routes(tmp_path, [[10, 10]])
    (prov / "routes-minor.json").write_text(json.dumps(
        {"tracks": [{"id": "track.x", "px": [[100, 100], [101, 100]]}]}))

    monkeypatch.setenv("CHAIN_ENABLED", "compile_society compile_water")
    img = p.paint_routes(prov)
    assert tuple(img[100, 100]) == (0, 0, 0, 0)

    monkeypatch.setenv("CHAIN_ENABLED", "compile_minor_routes")
    img = p.paint_routes(prov)
    assert tuple(img[100, 100]) == p.TRACK_RGBA

    monkeypatch.delenv("CHAIN_ENABLED")        # unset means all stages
    assert tuple(p.paint_routes(prov)[100, 100]) == p.TRACK_RGBA


def test_lanes_painted_cyan(tmp_path):
    (tmp_path / "waterways.json").write_text(json.dumps(
        {"lanes": [{"id": "route.boat.a-b", "px": [[40, 40], [41, 40]]}]}))
    img = p.paint_waterways(tmp_path)
    assert tuple(img[40, 40]) == p.LANE_RGBA


def test_junction_paints_a_magenta_square(tmp_path):
    cell = p.MACRO_CELL_M
    prov = _routes(tmp_path, [[10, 10]], [{"id": "junction.x",
                                           "positionM": [50 * cell, 60 * cell]}])
    img = p.paint_junctions(prov)
    square = img[57:64, 47:54]
    assert np.all(square == np.array(p.JUNCTION_RGBA, dtype=np.uint8))
    assert int((img[..., 3] > 0).sum()) == 49


def test_rootways_from_travel_services(tmp_path):
    cell = p.MACRO_CELL_M
    services = tmp_path / "routes"
    services.mkdir()
    (services / "travel-services.json").write_text(json.dumps({
        "stations": [
            {"id": "root-a", "positionM": [100 * cell, 100 * cell]},
            {"id": "root-b", "positionM": [200 * cell, 100 * cell]},
        ],
        "rootways": [{"id": "rootway.a-b", "from": "root-a", "to": "root-b"}],
    }))
    img = p.paint_rootways(tmp_path, tmp_path)
    assert tuple(img[100, 100]) == p.ROOT_STATION_RGBA
    assert tuple(img[100, 200]) == p.ROOT_STATION_RGBA
    assert tuple(img[100, 148]) == p.ROOTWAY_RGBA      # dotted line between
