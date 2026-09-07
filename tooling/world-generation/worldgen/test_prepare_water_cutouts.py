import numpy as np
from shapely.geometry import Polygon, box
from shapely.ops import unary_union
from worldgen.prepare_water_cutouts import cutout_triangles, densify_tile_edges

HEADER = {"surfaceGrid": {"size": 65, "metresPerPixel": 1, "gridOriginM": 0},
          "classGrid": {"size": 65, "metresPerPixel": 1, "gridOriginM": 0}}


def test_preserves_holes_and_disconnected_regions():
    region = box(0, 0, 16, 16).difference(unary_union([box(5, -1, 6, 17), box(10, 5, 12, 7)]))
    triangles = cutout_triangles(region, (0, 0, 64, 64), HEADER)
    actual = unary_union([Polygon(t.reshape(3, 2)) for t in triangles])
    assert actual.symmetric_difference(region).area < 1e-8
    for triangle in triangles.reshape(-1, 3, 2):
        a, b = triangle[1] - triangle[0], triangle[2] - triangle[0]
        assert a[0] * b[1] - a[1] * b[0] < 0


def test_preserves_every_shared_edge_knot_after_triangulation():
    region = box(0, 0, 16, 16).difference(box(0, 4.2, 2, 6.2))
    dense = densify_tile_edges(region, (0, 0, 64, 64), HEADER)
    expected = {tuple(np.float32(p)) for p in dense.exterior.coords if p[0] == 0 or p[1] == 0}
    actual = {tuple(p) for p in cutout_triangles(region, (0, 0, 64, 64), HEADER).reshape(-1, 2)}
    assert expected <= actual


def test_empty_cell_has_no_triangles():
    assert cutout_triangles(Polygon(), (0, 0, 64, 64), HEADER).shape == (0, 6)
