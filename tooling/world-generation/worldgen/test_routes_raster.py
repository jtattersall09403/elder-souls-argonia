"""Minor routes reach the ground paint and the scatter's clearance corridor."""

import json

import numpy as np

from .landcover import PATH, TRACK
from .routes_raster import (MINOR_PATH, MINOR_TRACK, corridor_masks,
                            rasterize_minor_paint)
from .scatter import ROUTE_CLEAR, ROUTE_THIN, Layer, route_allows


def _write(tmp_path):
    (tmp_path / "routes.json").write_text(json.dumps({"routes": []}))
    (tmp_path / "routes-minor.json").write_text(json.dumps({"tracks": [
        {"kind": "track", "px": [[10, 10], [10, 40]]},
        {"kind": "footpath", "px": [[30, 10], [30, 40]]},
        {"kind": "boardwalk", "px": [[50, 10], [50, 40]]},
    ]}))
    return tmp_path


def test_minor_pixels_are_painted(tmp_path):
    minor = rasterize_minor_paint((200, 200), 3, path=_write(tmp_path) / "routes-minor.json")
    assert minor[75, 30] == MINOR_TRACK        # on the track line (px*step)
    assert minor[75, 90] == MINOR_PATH         # on the footpath line
    assert minor[75, 150] == 0                 # boardwalks paint no ground

    # …and the land-cover bake turns those classes into worn surfaces.
    mat = np.zeros((200, 200), dtype=np.int16)
    mat = np.where(minor == MINOR_TRACK, TRACK, mat)
    mat = np.where(minor == MINOR_PATH, PATH, mat)
    assert mat[75, 30] == TRACK and mat[75, 90] == PATH


def test_every_route_kind_clears_a_corridor(tmp_path):
    province = _write(tmp_path)
    trunk, ground = corridor_masks((200, 200), 3, province=province)
    assert trunk[75, 30] and trunk[75, 90] and trunk[75, 150]
    assert ground[75, 30]                      # track thins groundcover
    assert ground[75, 90]                      # footpath too (owner 2026-09-04: paths cut through the growth)
    assert trunk.sum() > ground.sum()


def test_route_allows_drops_trees_and_thins_herbs():
    tree, herb = Layer(species="t", tier="T2"), Layer(species="h", tier="T3")
    assert not route_allows(tree, ROUTE_CLEAR, 0.9)
    assert route_allows(tree, ROUTE_THIN, 0.9)
    assert route_allows(herb, ROUTE_CLEAR, 0.9)
    assert route_allows(herb, ROUTE_THIN, 0.01)
    assert not route_allows(herb, ROUTE_THIN, 0.99)
    assert route_allows(tree, 0, 0.99)
