import numpy as np

from .refine_province import (CHANNELS, LAKE_BED_M, RAW_M, TERRACE_FRAC,
                               carve_channels, carve_polyline,
                               carve_to_profile, detail_noise,
                               impose_blackrose_lake)


def test_carve_channels_cuts_a_terrace_not_a_ditch():
    """`carve_channels` is the floodplain TERRACE (2026-09-07): a shallow
    valley with a bank. The channel proper is cut to the water level by
    `carve_to_profile`, so this pass must NOT dig the full band depth."""
    h = np.full((80, 80), 5.0, dtype=np.float32)
    rivers = np.zeros((80, 80), dtype=np.uint8)
    rivers[40, :] = 3
    out, dist = carve_channels(h.copy(), rivers)
    cut = 5.0 - out[40, 40]
    assert abs(cut - CHANNELS[3][1] * TERRACE_FRAC) < 0.05
    assert cut < CHANNELS[3][1] * 0.6                 # a terrace, not a trough
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


def test_carve_to_profile_puts_the_bed_under_the_water_level():
    """The bed inside the hydraulic width ends up at least the band film
    below the conditioned station level, so the compiler's ribbon waters the
    whole carved bed (owner permission 2026-09-07)."""
    from .compile_water import FILM_DEPTH, station_long_profile

    n_c = 24
    # a gentle reach (the film is a film, not a cascade: a steep reach is a
    # strip, handled by compile_water's cascade records)
    h = np.tile(np.linspace(60.0, 57.0, n_c * 3, dtype=np.float32)[:, None],
                (1, n_c * 3))
    # a rough bed: bumps that used to punch dry gaps through the channel
    h[::7, :] += 1.5
    rivers = np.zeros((n_c, n_c), dtype=np.uint8)
    rivers[:, 12] = 2
    flow_to = np.full(n_c * n_c, -1, dtype=np.int64)
    for y in range(n_c - 1):
        flow_to[y * n_c + 12] = (y + 1) * n_c + 12
    npz = {"rivers": rivers, "accum_km2": np.full((n_c, n_c), 4.0, np.float32),
           "flow_to": flow_to, "filled": h[::3, ::3].copy()}
    out, stats = carve_to_profile(h.copy(), npz)
    assert stats["cellsLowered"] > 0
    assert (out <= h + 1e-4).all()                 # only ever lowered
    prof = station_long_profile(out, rivers, npz["accum_km2"], flow_to,
                                npz["filled"], bed_win=5)
    lvl = prof["w_st"]
    bed = out[prof["sy"], prof["sx"]]
    assert (lvl - bed >= 0.30).all()   # a real column over the whole reach
    assert (np.diff(lvl) <= 1e-3).all()            # monotone downstream
