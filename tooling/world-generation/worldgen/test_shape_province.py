import numpy as np

from .shape_province import (CHANNELS, LAKE_BED_M, RAW_M, TERRACE_FRAC,
                             carve_channels, carve_polyline, detail_noise,
                             impose_blackrose_lake)


def test_d8_targets_decode_to_world_xz_unit_vectors():
    # 0 -> east, 1 -> south, 2 is outlet, 3 -> north-west.
    from .terrain_patches import Context
    ctx = Context(np.full((6, 6), -np.inf, np.float32), np.zeros((6, 6), bool), None,
                  npz={"flow_to": np.array([1, 3, -1, 0], dtype=np.int64).reshape(2, 2)})
    vectors = ctx.flow_vectors((6, 6))[::3, ::3]
    np.testing.assert_allclose(vectors[0, 0], [1.0, 0.0])
    np.testing.assert_allclose(vectors[0, 1], [0.0, 1.0])
    np.testing.assert_allclose(vectors[1, 0], [0.0, 0.0])
    np.testing.assert_allclose(vectors[1, 1], [-2 ** -0.5, -2 ** -0.5])


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
    out, feeders = impose_blackrose_lake(h.copy(), (oy, ox), rivers, rng)
    assert len(feeders) == 3
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


def test_carve_cuts_a_wet_monotone_bed_to_the_graphs_solution():
    """The channel carve (decision 0047, solved once for the graph in 16b):
    the bed under every station ends up the band's centre depth below a
    monotone long profile, only ever lowered inside the trench."""
    from .carve_province import carve
    from .channels import CENTRE_DEPTH, _sample
    from .hydrology_graph import solve

    n_c = 24
    h = np.tile(np.linspace(60.0, 57.0, n_c * 3, dtype=np.float32)[:, None],
                (1, n_c * 3))
    h += 0.06 * np.abs(np.arange(n_c * 3) - 37)[None, :]      # a shallow V
    h[::7, :] += 1.5                                          # bumps across the bed
    rivers = np.zeros((n_c, n_c), dtype=np.uint8)
    rivers[:, 12] = 2
    flow_to = np.full(n_c * n_c, -1, dtype=np.int64)
    for y in range(n_c - 1):
        flow_to[y * n_c + 12] = (y + 1) * n_c + 12
    npz = {"rivers": rivers, "accum_km2": np.full((n_c, n_c), 4.0, np.float32),
           "flow_to": flow_to, "filled": h[::3, ::3].copy(),
           "ocean": np.zeros((n_c, n_c), bool), "regions": np.zeros((n_c, n_c), np.uint8),
           "wetlands": np.zeros((n_c, n_c), bool), "flood": np.zeros((n_c, n_c), np.uint8),
           "lakes": np.zeros((n_c, n_c), bool)}
    bodies, sol, _report = solve(h, npz, log=lambda *_: None)
    out, stats = carve(h.copy(), bodies, sol, log=lambda *_: None)
    assert stats["cellsLowered"] > 0
    sl = sol.stations_of(0)
    bed = _sample(out, sol.y[sl], sol.x[sl])
    assert (sol.L[sl] - bed >= CENTRE_DEPTH[2] - 0.05).all()   # a real column everywhere
    assert (np.diff(sol.L[sl]) <= 1e-4).all()                  # monotone downstream
    assert (np.diff(bed) <= 0.05).all()                        # the bumps are gone
    assert (out - h).max() <= 1.5 + 1e-4                       # shoulder raise is bounded
