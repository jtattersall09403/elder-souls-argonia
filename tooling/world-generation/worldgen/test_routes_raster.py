"""Minor routes reach the ground paint and the scatter's clearance corridor."""

import json

import numpy as np

from .landcover import PATH, TRACK
from .routes_raster import (ABUTMENT_INSET_M, MINOR_PATH, MINOR_TRACK,
                            corridor_masks, major_spanning_mask,
                            rasterize_minor_paint)
from .scale import RAW_M
from .scatter import ROUTE_CLEAR, ROUTE_THIN, Layer, route_allows


def _write(tmp_path):
    (tmp_path / "routes.json").write_text(json.dumps({"routes": [
        {"id": "route.road.a", "class": "road", "px": [[60, 10], [60, 40]]},
    ]}))
    (tmp_path / "routes-minor.json").write_text(json.dumps({"tracks": [
        {"id": "track.a", "kind": "track", "px": [[10, 10], [10, 40]]},
        {"id": "track.b", "kind": "footpath", "px": [[30, 10], [30, 40]]},
        {"id": "track.c", "kind": "boardwalk", "px": [[50, 10], [50, 40]]},
    ]}))
    return tmp_path


# Chainage 40..100 m along each way. Samples are RAW_M apart from px y=30
# (macro 10 x step 3), so chainage z sits at full-res row 30 + z / RAW_M.
_FROM_M, _TO_M = 40.0, 100.0


def _row(z_m):
    return 30 + int(round(z_m / RAW_M))


def _structures(tmp_path, kinds=("bridge", "stair", "bridge")):
    path = tmp_path / "route-structures.json"
    path.write_text(json.dumps({"structures": [
        {"id": f"structure.{w}.1", "wayId": w, "kind": k,
         "fromM": _FROM_M, "toM": _TO_M}
        for w, k in zip(("track.a", "track.b", "route.road.a"), kinds)]}))
    return path


def test_ground_under_a_span_is_not_painted_but_stairs_keep_theirs(tmp_path):
    province = _write(tmp_path)
    minor = rasterize_minor_paint((200, 200), 3, path=province / "routes-minor.json",
                                  structures=_structures(tmp_path))
    mid = _row(0.5 * (_FROM_M + _TO_M))
    # track.a is carried over the dip on a bridge: no road surface below it.
    assert minor[mid, 30] == 0
    assert not minor[mid - 3:mid + 4, 27:34].any()      # nor a fringe of it
    # track.b's stair rests on the slope it climbs, so its ground stays painted.
    assert minor[mid, 90] == MINOR_PATH
    # …and the track is painted normally on either side of the span.
    assert minor[_row(_FROM_M - 10.0), 30] == MINOR_TRACK
    assert minor[_row(_TO_M + 10.0), 30] == MINOR_TRACK


def test_paint_runs_in_under_the_abutments(tmp_path):
    province = _write(tmp_path)
    minor = rasterize_minor_paint((200, 200), 3, path=province / "routes-minor.json",
                                  structures=_structures(tmp_path))
    # Paint stops inside the window, not dead on its edge: the last metres run
    # in under the deck ends instead of stopping in mid-air at the abutment.
    assert minor[_row(_FROM_M + 0.5 * ABUTMENT_INSET_M), 30] == MINOR_TRACK
    assert minor[_row(_TO_M - 0.5 * ABUTMENT_INSET_M), 30] == MINOR_TRACK


def test_major_span_mask_covers_the_road_stripe(tmp_path):
    province = _write(tmp_path)
    mask = major_spanning_mask((200, 200), 3, province=province,
                               structures=_structures(tmp_path))
    mid = _row(0.5 * (_FROM_M + _TO_M))
    assert mask[mid, 180] and mask[mid, 180 - 3] and mask[mid, 180 + 3]
    assert not mask[_row(_FROM_M - 10.0), 180]
    assert not mask[:, 30].any()                        # minor ways are not majors


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
