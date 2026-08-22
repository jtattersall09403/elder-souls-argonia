import numpy as np

from .routes import cost_surface, routes_from
from .society import compute_society


def test_route_prefers_cheap_ground_and_connects():
    n = 40
    z = np.full((n, n), 10.0, dtype=np.float32)
    slope = np.zeros((n, n))
    ocean = np.zeros((n, n), dtype=bool)
    lakes = np.zeros((n, n), dtype=bool)
    rivers = np.zeros((n, n), dtype=np.uint8)
    wetlands = np.zeros((n, n), dtype=bool)
    flood = np.zeros((n, n), dtype=np.uint8)
    # an open-water band across the middle with a land bridge at column 30
    # (short wetland wades are legitimately cheaper than long detours — that's
    # a causeway — but open water at 25x forces the crossing point)
    lakes[18:22, :] = True
    lakes[18:22, 29:32] = False
    cost = cost_surface(z, slope, ocean, lakes, rivers, wetlands, flood)
    result = routes_from(cost, (5, 5), [(5, 35)], metres_per_px=100.0)
    path, length = result[(5, 35)]
    assert path[0] == (5, 5) and path[-1] == (5, 35)
    assert length > 0
    # the path detours through the causeway instead of wading straight across
    crossing_cols = [x for x, y in path if 18 <= y <= 21]
    assert crossing_cols and all(29 <= x <= 31 for x in crossing_cols)


def test_danger_bands_and_culture_coverage():
    n = 60
    regions = np.full((n, n), 11, dtype=np.uint8)   # firm lowland
    regions[20:40, 20:40] = 6                        # rootland core
    regions[:, :3] = 0                               # ocean strip
    anchors = {"gideon": (5, 30), "helstrom": (30, 30), "stormhold": (50, 5),
               "thorn": (55, 5), "soulrest": (5, 55), "lilmoth": (50, 55),
               "blackrose": (30, 55), "archon": (55, 30), "alten-corimont": (40, 10)}
    roads = np.zeros((n, n), dtype=bool)
    roads[30, 5:30] = True
    soc = compute_society(regions, anchors, roads, metres_per_px=400.0)
    assert soc.danger.min() >= 1.0 and soc.danger.max() <= 5.0
    # deep rootland outdangers the settled fringe near a city+road
    assert soc.danger[30, 25] < soc.danger[35, 35]
    # every non-ocean cell has a culture or hinterland label; ocean has none
    assert (soc.culture[regions == 0] == 0).all()
    assert soc.stats["cultureFractions"]["hist-heartland"] > 0
