import numpy as np

from .condition import condition, interiorness
from .hydrology import compute, fill_depressions, ocean_mask, resolve_flats


def _valley_world(n=60):
    """Tilted plane draining south to an ocean strip, with a pit and a flat."""
    z = np.zeros((n, n), dtype=np.float32)
    for y in range(n):
        z[y, :] = 30.0 - 28.0 * (y / (n - 1))  # high north, low south
    z[:, n // 2] -= 3.0          # a north-south valley line
    z[-4:, :] = -5.0             # southern ocean
    z[20:24, 10:14] -= 10.0      # a closed pit
    z[30:34, 30:38] = z[30, 30]  # a flat shelf
    return z


def test_ocean_fill_and_flat_resolution_leave_no_pits():
    z = _valley_world()
    ocean = ocean_mask(z)
    assert ocean[-1].all() and not ocean[0].any()
    drain = resolve_flats(fill_depressions(z, ocean), ocean)
    # every land cell has a strictly lower 8-neighbour (drains somewhere)
    h, w = z.shape
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            if not ocean[y, x]:
                nb = drain[y - 1 : y + 2, x - 1 : x + 2].min()
                assert nb < drain[y, x]


def test_flow_reaches_ocean_and_accumulation_grows():
    z = _valley_world()
    res = compute(z, metres_per_px=500.0)
    flow = res.flow_to
    ocean_flat = res.ocean.reshape(-1)
    # walk from a headwater cell; must reach ocean/outlet without cycling
    i = 5 * z.shape[1] + z.shape[1] // 2
    seen = set()
    while flow[i] >= 0 and not ocean_flat[flow[i]]:
        assert i not in seen
        seen.add(i)
        assert res.accum_km2.reshape(-1)[flow[i]] >= res.accum_km2.reshape(-1)[i]
        i = flow[i]
    assert len(seen) > 10  # actually travelled down the valley
    # the valley concentrates drainage into a river
    assert (res.rivers > 0).any()
    # land basins labelled
    assert (res.watersheds[~res.ocean] != 0).all()


def test_condition_matches_studio_formula():
    g = np.full((200, 200), 100.0, dtype=np.float32)
    out = condition(g)
    centre = out[100, 100]
    # deep interior: 20 + 80 * 0.5
    assert abs(centre - 60.0) < 1e-3
    # map edge: untouched
    assert abs(out[0, 0] - 100.0) < 1e-3
    # below threshold never changes
    low = condition(np.full((50, 50), 5.0, dtype=np.float32))
    assert np.allclose(low, 5.0)
    w = interiorness(200, 200)
    assert w.max() <= 1.0 and w.min() >= 0.0
