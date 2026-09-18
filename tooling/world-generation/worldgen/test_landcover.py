"""The ground bake paints from the WATER RECORD (decision 0066).

Every fixture here builds a `WaterPaint` the way the shipped bundle would:
bodies and reaches of a named KIND, with a signed depth per season and the
reach's own width. Nothing in the bake may decide "lake", "sea" or "marsh"
for itself, so nothing in these fixtures hands it a height threshold to do it
with.
"""

import numpy as np

from .landcover import (BC_MUD, BC_ROAD, BEACH_SAND, BLACK_MUD, CLAY,
                        MARSH_GRASS, MUCK, N_MATERIALS, OCEAN_FLOOR, PATH,
                        RIVER_MUD, SALT, SCUM, SEABED_SAND, SILT, SWAMP_GRASS, TRACK,
                        TROP_GRASS, WATER_PAINT_KINDS, WaterPaint,
                        compile_ground_control)
from .position_noise import normal_field
from .rebake_landcover import WINDOW_PAD_M, _bake
from .scale import RAW_M

M_PER_PX = RAW_M  # production full-res texel size (scale.py, 0015)

# The graph's vocabulary (hydrology-graph.json `vocabulary`), the order
# `ShippedWater.kind_names()` builds its index in.
KIND_NAMES = ["none",
              "horizontal-channel", "horizontal-tidal", "horizontal-backwater",
              "sloped-riffle", "sloped-rapid", "sloped-chute", "vertical-fall",
              "ocean", "lagoon", "lake-lowland", "tarn-upland", "pond", "pool",
              "plunge-pool", "marsh-fringe", "marsh-deep", "swamp", "backswamp",
              "mudflat"]
K = {n: i for i, n in enumerate(KIND_NAMES)}

CHANNEL_COLS = slice(132, 138)   # the fixture reach, 6 texels ~ 11 m
N = 260


def _fixture(seed=1, with_roads=False, n=N):
    """A synthetic province and its water record: a pond at the top with a
    graded shore, a lowland lake, a marsh body, a tidal ocean edge along the
    bottom, and one 16 m river reach crossing the map."""
    height = np.full((n, n), 3.0, dtype=np.float32)
    height[:12, :] = -1.0                                   # the pond
    height[12:26, :] = np.linspace(0.1, 1.5, 14)[:, None]   # gradual shore
    height[30:55, 170:210] = -1.0                           # the lake
    height[60:80, 0:30] = -0.4                              # the marsh
    height[224:236, :] = np.linspace(1.5, -2.0, 12)[:, None]  # graded sea shore
    height[236:, :] = -2.0                                  # the sea
    region = np.full((n, n), 7, dtype=np.uint8)   # interior swamp (left)
    region[:, n // 2:] = 9                         # seasonal floodplain (right)

    kind = np.zeros((n, n), dtype=np.uint8)
    klass = np.zeros((n, n), dtype=np.uint8)
    half_w = np.zeros((n, n), dtype=np.float32)
    depth = (-height).astype(np.float32)           # every level is 0 here
    kind[:12, :] = K["pond"]
    klass[:12, :] = 4
    kind[30:55, 170:210] = K["lake-lowland"]
    klass[30:55, 170:210] = 4
    kind[60:80, 0:30] = K["marsh-deep"]
    klass[60:80, 0:30] = 5
    sea = height < 0.0
    sea[:26] = False
    sea[30:80] = False
    kind[sea] = K["ocean"]
    klass[sea] = 1                             # coast: SALT water
    kind[:, CHANNEL_COLS] = K["horizontal-channel"]
    klass[:, CHANNEL_COLS] = 3
    half_w[:, CHANNEL_COLS] = 8.0                  # widthM 16 -> not a stream
    depth[:, CHANNEL_COLS] = 1.2
    # the dry season draws the marsh down below its bed: the record's own hollow
    depth_dry = depth.copy()
    depth_dry[60:80, 0:30] = -0.2
    water = WaterPaint(depth=depth, depth_dry=depth_dry, kind=kind,
                       kind_names=KIND_NAMES, half_width=half_w, klass=klass)

    gy, gx = np.gradient(height, M_PER_PX)
    slope = np.hypot(gx, gy).astype(np.float32)
    roads = None
    if with_roads:
        roads = np.zeros((n, n), dtype=bool)
        roads[148:151, :] = True                   # an east-west road
    return height, region, slope, M_PER_PX, water, seed, roads


def _compile(seed=1, with_roads=False):
    h, reg, slope, mpp, water, seed, roads = _fixture(seed, with_roads)
    return compile_ground_control(h, reg, slope, mpp, water=water, seed=seed,
                                  roads=roads)


def test_control_shape_ids_and_determinism():
    mat1, c1, p1 = _compile()
    mat2, c2, p2 = _compile()
    assert c1.shape == (N, N, 4) and c1.dtype == np.uint8
    assert mat1.max() < N_MATERIALS and mat1.min() >= 0
    assert np.array_equal(c1, c2) and np.array_equal(mat1, mat2)
    assert np.array_equal(p1, p2)


def test_channel_water_edge_gradient():
    mat, _, _ = _compile()
    assert (mat[100:180, CHANNEL_COLS] == SILT).mean() > 0.8   # bed
    assert (mat[100:180, 138] == RIVER_MUD).mean() > 0.5       # wet waterline
    assert (mat[100:180, 140] == CLAY).mean() > 0.5            # regional bank


def test_regional_palettes_differ_and_wetlands_not_grassy():
    mat, _, _ = _compile()
    swamp = mat[100:180, 10:60]     # far from border, water and channel
    plain = mat[100:180, 160:200]
    assert (swamp == MUCK).mean() > 0.15                 # swamp base is muck
    assert (plain == SWAMP_GRASS).mean() > 0.15          # floodplain grassy
    assert (swamp == TROP_GRASS).mean() < 0.02
    assert (swamp == SWAMP_GRASS).mean() < 0.05


def test_standing_water_edge_never_grass():
    # the fixture's top strip is a POND in the record -> black-mud waterline
    # (per-water-type shoreline grammar), never grass near water
    mat, _, _ = _compile()
    edge = mat[12:14, 20:80]                              # first ~4 m ashore
    assert (edge == BLACK_MUD).mean() > 0.5               # pool mud waterline
    near = mat[12:18, 20:80]                              # first ~11 m ashore
    grassy = np.isin(near, [TROP_GRASS, SWAMP_GRASS, MARSH_GRASS])
    assert grassy.mean() < 0.02


def test_roads_painted_on_ground_not_water():
    mat, _, _ = _compile(with_roads=True)
    road = np.isin(mat[149, 10:60], [BC_ROAD, PATH, TRACK])
    assert road.mean() > 0.7                              # road on dry ground
    assert (mat[149, CHANNEL_COLS] == SILT).all()         # channel wins at crossing


def test_beach_paints_only_on_salt_water():
    """A lake standing at level 0 is not the sea: the record's KIND decides.

    The old bake typed a shore salty from a Phase 3 salinity field and painted
    beach sand wherever the ground sat near height zero, so inland water at
    sea level grew a beach.
    """
    mat, _, _ = _compile()
    inland = mat[25:60, 160:220]                     # the lake and its shore
    assert (inland == BEACH_SAND).sum() == 0
    assert (inland == SEABED_SAND).sum() == 0
    sea = mat[225:235, 60:120]                       # the ocean's own shore
    assert np.isin(sea, [BEACH_SAND, SEABED_SAND, SALT, BC_MUD, BLACK_MUD, OCEAN_FLOOR]).mean() > 0.9


def test_provenance_names_the_deciding_kind():
    mat, _, prov = _compile()
    bed = prov[100:180, CHANNEL_COLS]
    assert (bed == K["horizontal-channel"]).all()
    assert (prov[mat == SILT] > 0).mean() > 0.9
    # every painted texel agrees with the contract the provenance gate checks
    for material, kinds in WATER_PAINT_KINDS.items():
        sel = prov[(mat == material) & (prov > 0)]
        if not sel.size:
            continue
        seen = {KIND_NAMES[i] for i in np.unique(sel)}
        assert seen <= set(kinds), f"material {material} painted by {seen - set(kinds)}"
    # ground nowhere near water was decided by region/slope/noise, not water
    assert (prov[100:130, 60:100] == 0).all()


def _mountain_fixture(seed=3):
    """A concave mountain flank: a near-vertical upper face relaxing into a
    debris apron, exactly the profile the Phase 6b thermal pass produces.
    No water record at all — `water=None` is sea level, and this flank is
    600 m above it."""
    n = 200
    y = np.arange(n, dtype=np.float32)
    prof = 600.0 * np.exp(-(y / 70.0) ** 1.6)
    height = np.repeat(prof[:, None], n, axis=1).astype(np.float32)
    region = np.full((n, n), 1, dtype=np.uint8)      # border mountains
    gy, gx = np.gradient(height, M_PER_PX)
    slope = np.hypot(gx, gy).astype(np.float32)
    return compile_ground_control(height, region, slope, M_PER_PX, seed=seed)


def test_scree_paints_the_debris_apron_not_the_crag_face():
    from .landcover import MOUNTAIN_ROCK, SCREE, SCREE_MAX_TAN
    from scipy import ndimage
    mat, _, _ = _mountain_fixture()
    h = np.repeat((600.0 * np.exp(-(np.arange(200, dtype=np.float32) / 70.0) ** 1.6))[:, None], 200, axis=1)
    gy, gx = np.gradient(h, M_PER_PX)
    slope_lf = ndimage.gaussian_filter(np.hypot(gx, gy).astype(np.float32), 22.0 / M_PER_PX / 3.0)
    assert (mat == SCREE).mean() > 0.02                    # apron exists
    # nothing above the angle debris can rest at is scree
    assert (mat[slope_lf > SCREE_MAX_TAN * 1.3] == SCREE).mean() < 0.02
    # the steepest ground keeps bare mountain slab
    assert (mat[slope_lf > SCREE_MAX_TAN * 1.3] == MOUNTAIN_ROCK).mean() > 0.5


def test_sea_level_apron_has_no_record_and_paints_coast_only_where_wet():
    """`water=None` (build_border_apron): the only water beyond the border is
    the sea at 0, so the record carries one kind and dry ground gets none."""
    h = np.linspace(-4.0, 4.0, 64, dtype=np.float32)[:, None].repeat(64, 1)
    wp = WaterPaint.from_sea_level(h)
    assert wp.kind_names == ["none", "ocean"]
    assert (wp.kind[h < 0] == 1).all() and (wp.kind[h > 0] == 0).all()
    assert (wp.klass[h < 0] == 1).all()
    assert np.array_equal(wp.depth, wp.depth_dry)


def test_normal_field_window_equals_the_global_field():
    whole = normal_field((600, 600), 12, "patch-broad")
    win = normal_field((300, 300), 12, "patch-broad", origin=(120, 80))
    assert np.allclose(win, whole[120:420, 80:380], atol=1e-4)


def test_normal_field_salts_give_different_fields():
    a = normal_field((128, 128), 6, "wear")
    b = normal_field((128, 128), 6, "macro")
    assert not np.allclose(a, b)


def _world(n=400):
    """A synthetic province: water record, shore, channel, two regions."""
    height, region, slope, mpp, water, seed, _roads = _fixture(n=n)
    fields = dict(
        regions=region,
        v_frac=np.broadcast_to(
            (np.arange(n, dtype=np.float32) / n)[:, None], (n, n)).copy(),
    )
    roads = np.zeros((n, n), dtype=bool)
    roads[300:303, :] = True
    minor = np.zeros((n, n), dtype=np.int8)
    return height, fields, water, roads, minor


def test_rebake_window_matches_global():
    """A padded window bakes exactly what the whole-province bake gives it.

    The window is kept clear of the fixture's water: the nearest-wet-cell
    lookup is global by nature and no pad covers it (see rebake_landcover's
    docstring).
    """
    n = 400
    h, fields, water, roads, minor = _world(n)
    _, whole, _ = _bake(h, fields, water, roads, minor, (0, 0))

    pad = int(np.ceil(WINDOW_PAD_M / M_PER_PX))
    y0, y1, x0, x1 = 200, 320, 160, 280
    py0, py1 = max(0, y0 - pad), min(n, y1 + pad)
    px0, px1 = max(0, x0 - pad), min(n, x1 + pad)
    sl = (slice(py0, py1), slice(px0, px1))
    _, part, _ = _bake(h[sl], {k: v[sl] for k, v in fields.items()}, water[sl],
                       roads[sl], minor[sl], (py0, px0))
    inner = (slice(y0 - py0, y1 - py0), slice(x0 - px0, x1 - px0))
    assert np.array_equal(part[inner], whole[y0:y1, x0:x1])


# --- the road SURFACE is continuous; condition changes the mix (2026-09-18) ---
#
# The owner's walk found decayed and broken major roads invisible from the air
# and on foot. The bake used to delete the road class outright over ~120 m
# stretches of `wear`, which left 82% of a broken road with no road texel at
# all. These three tests gate the rule that replaced it: a road of any
# condition is a continuous painted line, and condition moves the material MIX
# from built surface towards dirt path.

_ROAD_ROW = 149
_ROAD_COLS = slice(10, 250)


def _road_bake(condition, seed=1):
    """A straight east-west road of one authored condition across dry ground."""
    h, reg, slope, mpp, water, _seed, _ = _fixture(seed=seed)
    roads = np.zeros(h.shape, dtype=np.int8)
    roads[148:151, :] = condition
    mat, _, _ = compile_ground_control(h, reg, slope, mpp, water=water,
                                       seed=seed, roads=roads)
    return mat[_ROAD_ROW, _ROAD_COLS]


#: Three seeds, because one 240-texel line under a metres-wide noise field
#: carries enough sampling noise to swing a share by five points.
SEEDS = (1, 2, 3)


def _is_road(line):
    return np.isin(line, [BC_ROAD, PATH, TRACK])


def _paintable(seed):
    """Texels a road of ANY condition may paint: the bake leaves the river
    crossing and its bed unpainted whatever the state of repair, because a
    crossing is a placed bridge and not a painted surface. Measuring
    continuity over them would be measuring the river."""
    return _is_road(_road_bake(1, seed))


def _longest_gap_m(line, paintable):
    """Longest run of consecutive non-road texels, in metres."""
    off = ~_is_road(line) & paintable
    run = best = 0
    for v in off:
        run = run + 1 if v else 0
        best = max(best, run)
    return best * M_PER_PX


#: Road-class share the paintable centreline must hold, per authored condition.
CENTRELINE_FLOOR = {1: 0.95, 2: 0.95, 3: 0.90, 4: 0.80}
#: A hole longer than this reads as the road stopping, not as a washout.
MAX_GAP_M = 12.0


def test_every_condition_paints_a_continuous_road_line():
    for seed in SEEDS:
        paintable = _paintable(seed)
        for cond, floor in CENTRELINE_FLOOR.items():
            line = _road_bake(cond, seed)
            share = _is_road(line)[paintable].mean()
            assert share >= floor, (
                f"seed {seed}, condition {cond}: {share:.2f} of the paintable "
                f"centreline carries a road class, floor {floor}")
            gap = _longest_gap_m(line, paintable)
            assert gap <= MAX_GAP_M, (
                f"seed {seed}, condition {cond}: {gap:.1f} m of unbroken "
                f"non-road along the centreline, cap {MAX_GAP_M} m. Gaps are "
                f"potholes and washouts, never stretches of erased road")


def test_built_surface_recedes_as_the_road_decays():
    """The mix, not the existence, is what condition moves: cobbles give way to
    dirt path from maintained through to broken."""
    for seed in SEEDS:
        paintable = _paintable(seed)
        shares = [(_road_bake(c, seed) == BC_ROAD)[paintable].mean()
                  for c in (1, 2, 3, 4)]
        assert all(a >= b for a, b in zip(shares, shares[1:])), (
            f"seed {seed}: BC_ROAD share by condition "
            f"{[round(s, 3) for s in shares]} is not non-increasing")
        assert shares[0] > shares[3], (
            f"seed {seed}: a broken road keeps as much built surface as a new "
            f"one")


def test_a_broken_road_still_holds_a_cleared_trace_open():
    """Width factor 0 meant no corridor existed, so nothing cleared the trees
    off a broken road and nothing was painted under them."""
    from .routes_raster import CONDITION_WIDTH_FACTOR
    assert CONDITION_WIDTH_FACTOR[4] > 0
    assert (CONDITION_WIDTH_FACTOR[1] >= CONDITION_WIDTH_FACTOR[2]
            >= CONDITION_WIDTH_FACTOR[3] >= CONDITION_WIDTH_FACTOR[4])


def test_class_raster_coast_over_a_swamp_paints_no_salt():
    """The class raster is not a salt licence: the record's KIND alone is.

    `water-class.png` paints coast/estuary from the compile's sea MASK
    (ocean-connected ground below 0), so a swamp sheet inside that mask used
    to come back to the bake as salt water and grow beach sand and seabed.
    """
    h, reg, slope, mpp, water, seed, roads = _fixture()
    kind = water.kind.copy()
    klass = water.klass.copy()
    kind[60:80, 0:30] = K["swamp"]        # the record: fresh interior swamp
    klass[60:80, 0:30] = 1                # the class raster: "coast"
    mislabelled = WaterPaint(depth=water.depth, depth_dry=water.depth_dry,
                             kind=kind, kind_names=KIND_NAMES,
                             half_width=water.half_width, klass=klass)
    mat, _, _ = compile_ground_control(h, reg, slope, mpp, water=mislabelled,
                                       seed=seed, roads=roads)
    bed = mat[62:78, 2:28]                # the swamp's own shallow bed
    assert np.isin(bed, [SILT, SEABED_SAND, BEACH_SAND, SALT, OCEAN_FLOOR]).sum() == 0
    assert (bed == SCUM).mean() > 0.9
