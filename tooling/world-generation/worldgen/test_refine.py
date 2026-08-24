import numpy as np

from .refine_province import (CHANNELS, LAKE_BED_M, RAW_M, carve_channels,
                               carve_polyline, detail_noise,
                               impose_blackrose_lake)


def test_carve_channels_deepens_centreline_only():
    h = np.full((80, 80), 5.0, dtype=np.float32)
    rivers = np.zeros((80, 80), dtype=np.uint8)
    rivers[40, :] = 3
    out, dist = carve_channels(h.copy(), rivers)
    assert out[40, 40] < 5.0 - CHANNELS[3][1] * 0.9   # near-full depth on line
    assert abs(out[10, 40] - 5.0) < 0.01              # untouched far away
    assert dist[40, 40] == 0.0


def test_noise_suppressed_near_channels():
    rng = np.random.default_rng(1)
    regions = np.full((120, 120), 11, dtype=np.uint8)
    dist = np.full((120, 120), 1e9)
    dist[:, :20] = 0.0
    field = detail_noise((120, 120), regions, dist, rng)
    assert field[:, :10].std() < field[:, 60:].std() * 0.5
    assert field[:, 60:].std() > 0.2  # firm lowland gets real texture


def test_blackrose_lake_bed_island_and_feeders():
    # window covering the anchor: full-res px of (0.32, 0.87) is (1290, 3509)
    oy, ox = 3509 - 150, 1290 - 150
    h = np.full((300, 300), 4.0, dtype=np.float32)
    rivers = np.zeros((300, 300), dtype=np.uint8)
    rivers[20, :] = 2  # a river north of the lake for the NE feeder to find
    rng = np.random.default_rng(2)
    out = impose_blackrose_lake(h.copy(), (oy, ox), rivers, rng)
    # island (offset + irregular) rises above water somewhere near the centre
    assert out[130:170, 130:170].max() > 0.0
    assert out[130:170, 130:170].min() < -2.0  # lake bed well below sea level
    assert (out < 0).sum() > 2000              # a real lake, not a puddle
    assert (out[:140, :] < h[:140, :] - 0.5).any()  # a feeder carved northward


def test_carve_polyline_reaches_bed_level():
    h = np.full((100, 100), 3.0, dtype=np.float32)
    out = carve_polyline(h.copy(), (10, 10), (90, 90), 12.0, -1.0, np.random.default_rng(3))
    assert (out < -0.5).sum() > 50   # floor reaches near bed along the line
    assert out.min() >= -1.01        # never carves below the bed level
