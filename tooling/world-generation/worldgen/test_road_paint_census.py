"""Road paint census on synthetic rasters (never reads the province files)."""

import numpy as np

from .landcover import BC_ROAD, PATH, TRACK, MOSS
from .road_paint_census import census, check, metres_to_sample
from .scale import RAW_M


def _synthetic():
    mat = np.full((64, 64), MOSS, dtype=np.int16)
    mat[10, 20:23] = BC_ROAD      # a 3-texel strip
    mat[40, 50] = TRACK           # a lone road texel
    return mat


def test_counts_and_cluster_sizes():
    data = census(_synthetic())
    assert data["totals"] == {"BC_ROAD": 3, "TRACK": 1, "PATH": 0}
    assert data["roadTexels"] == 4
    assert data["clusterCount"] == 2
    assert [c["texels"] for c in data["clusters"]] == [3, 1]
    big = data["clusters"][0]
    assert big["bboxM"]["eastMin"] == 20 * RAW_M
    assert big["bboxM"]["eastMax"] == 22 * RAW_M
    assert big["bboxM"]["southMin"] == big["bboxM"]["southMax"] == 10 * RAW_M


def test_spot_lookup_returns_code_at_metres():
    mat = _synthetic()
    spot = (50 * RAW_M, 40 * RAW_M)     # the lone TRACK texel
    data = census(mat, spot_m=spot)
    s = data["ownerSpot"]
    assert s["sample"] == [40, 50]
    assert s["code"] == TRACK and s["codeName"] == "TRACK"
    assert s["isRoad"] is True
    assert s["cluster"]["texels"] == 1

    off = census(mat, spot_m=(5 * RAW_M, 5 * RAW_M))["ownerSpot"]
    assert off["code"] == MOSS and off["isRoad"] is False
    assert metres_to_sample(5 * RAW_M) == 5


def test_check_passes_paint_on_the_line_and_fails_paint_off_it():
    """A road texel a couple of metres off a ladder line passes; one 12 m off fails."""
    mat = np.full((64, 64), MOSS, dtype=np.int16)
    # One macro-px polyline down x = 10 -> full-res column 30, rows 30..120.
    lines = [[[10, 10], [10, 18]]]
    near_col, far_col = 30 + 2, 30 + 7        # 3.7 m and 12.8 m at RAW_M
    mat[40, near_col] = BC_ROAD
    res = check(mat, lines)
    assert res["roadTexels"] == 1 and res["lineTexels"] > 0
    assert res["offTrackTexels"] == 0 and res["ok"] is True

    mat[40, far_col] = TRACK
    res = check(mat, lines)
    assert res["offTrackTexels"] == 1 and res["ok"] is False
    worst = res["worstOffenders"][0]
    assert worst["sample"] == [40, far_col]
    assert 12.0 < worst["distanceM"] < 13.0


def test_check_with_no_ladder_lines_flags_every_road_texel():
    data = check(_synthetic(), [])
    assert data["lineTexels"] == 0
    assert data["offTrackTexels"] == 4 and data["ok"] is False
    assert data["worstOffenders"][0]["distanceM"] == float("inf")
