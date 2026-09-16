"""Semantic land cover -> ground-material control map (decision 0011).

Two-level ground texturing on the Bethesda pattern (research:
docs/research/rendering/skyrim-morrowind-landscape-texture-granularity.md):

- **micro**: each texel gets a semantic land-cover treatment derived from the
  hydrology fields — a contour-following water-edge gradient around every
  water contact (submerged silt -> scum/puddle shallows -> wet bank ->
  mud -> muck fringe), channel bank gradients per river band, damp/wet/litter
  patches, hummocks, peat slopes, salt flats, dry pans, and roads where the
  Phase 4 corridors touch ground.
- **macro**: each ecological region class carries a palette mapping those
  slots to concrete materials from the global library built by
  build_ground_materials.py (Bitter Coast swamp set, Project Rainforest
  tropical set, CC0 PBR, retained vanilla). Region borders are domain-warped
  so ecotones interdigitate instead of following authored straight edges.

Output is a BotW/Terrain3D-style control map (id0, id1, blend, macro-mottle)
consumed by the studio's texture-array shader (Fly3D). The land-cover raster
is the future source of truth for footsteps, groundcover and encounters too.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy import ndimage

from .fastfilter import gaussian
from .position_noise import SEED_DEFAULT, normal_field
from .scale import TUNE, TUNE_S
from .sculpt import TALUS_FULL_TAN, TALUS_TAN
from .water_report import CHANNEL_REACH_KINDS

# Material ids — index order of build_ground_materials.MATERIALS.
(SILT, RIVER_MUD, BANK_WET, SCUM, BLACK_MUD, PUDDLE, CLAY, MUCK, BC_MUD,
 PEAT, MUD_LEAVES, MARSH_GRASS, UNDERGROWTH, BC_MOSS, MOSS, SWAMP_GRASS,
 TROP_GRASS, GRASS_DIRT, SCRUB, JUNGLE, FOREST_FLOOR, LITTER, MOSSY_ROCK,
 BC_ROCK, SAND, SALT, DRY_CLAY, PATH, PEAT_SLOPE, TRACK, BC_ROAD,
 MOUNTAIN_ROCK, BEACH_SAND, SEABED_SAND, PEBBLES, OCEAN_FLOOR,
 DIRT_CLIFF, SCREE) = range(38)
# Cliff materials (Phase 16b item 3): never painted on the control map — the
# splat shader samples them on the triplanar SIDE projections.
CLIFF_ROCK, CLIFF_DIRT = 38, 39
N_MATERIALS = 40

# Major-road state of repair, as `routes_raster.CONDITION_CODES` writes it.
ROAD_MAINTAINED, ROAD_WORN, ROAD_DECAYED, ROAD_BROKEN = 1, 2, 3, 4

# Per-region palettes (regions.py class ids). Slots: base ground, damp patch
# (mid wetness), wet patch (hollows), channel/shore bank, local-high ground,
# organic litter patch. Wetland regions are mud/muck/moss-first — grass only
# survives on raised ground (owner feedback 2026-08-23: "too grassy").
# Adjacent regions share materials deliberately (Morrowind pattern).
REGION_PALETTES = {
    0:  dict(base=SAND, damp=SILT, wet=SILT, bank=SILT, high=SAND, litter=SAND),            # ocean floor
    1:  dict(base=GRASS_DIRT, damp=PEAT, wet=PEAT, bank=CLAY, high=MOUNTAIN_ROCK, litter=MUD_LEAVES),  # border mountains
    2:  dict(base=TROP_GRASS, damp=GRASS_DIRT, wet=PEAT, bank=CLAY, high=SCRUB, litter=LITTER),     # upland hills
    3:  dict(base=PUDDLE, damp=BC_MUD, wet=SCUM, bank=BANK_WET, high=MARSH_GRASS, litter=SALT),     # tidal delta
    4:  dict(base=MARSH_GRASS, damp=PUDDLE, wet=SCUM, bank=BANK_WET, high=SCRUB, litter=SALT),      # lagoon & salt marsh
    5:  dict(base=SWAMP_GRASS, damp=MUD_LEAVES, wet=BC_MUD, bank=CLAY, high=SCRUB, litter=LITTER),  # deep river corridor
    6:  dict(base=BC_MOSS, damp=MUCK, wet=BLACK_MUD, bank=BC_MUD, high=MOSS, litter=UNDERGROWTH),   # rootland deep marsh
    7:  dict(base=MUCK, damp=BC_MUD, wet=BLACK_MUD, bank=BANK_WET, high=MARSH_GRASS, litter=UNDERGROWTH),  # interior swamp
    8:  dict(base=MARSH_GRASS, damp=MUCK, wet=BC_MUD, bank=BANK_WET, high=SWAMP_GRASS, litter=UNDERGROWTH),  # fringe marsh
    9:  dict(base=SWAMP_GRASS, damp=MUD_LEAVES, wet=PUDDLE, bank=CLAY, high=TROP_GRASS, litter=LITTER),      # seasonal floodplain
    11: dict(base=TROP_GRASS, damp=MARSH_GRASS, wet=MUCK, bank=CLAY, high=SCRUB, litter=GRASS_DIRT),  # firm lowland
    12: dict(base=SILT, damp=SILT, wet=SILT, bank=BANK_WET, high=SCRUB, litter=SILT),               # lake bed
    13: dict(base=JUNGLE, damp=BLACK_MUD, wet=BLACK_MUD, bank=BC_MUD, high=FOREST_FLOOR, litter=LITTER),  # tropical jungle
}
MARSHY = {3, 4, 6, 7, 8, 12}          # regions where wet-ground micro rules dominate

# Northern palette zone (owner 2026-08-23: the northern half — including the
# second big river basin around Helstrom's approaches — must feel distinct
# from the south while staying coherent). Climatology (docs/research/
# black-marsh-climatology.md): the north grades drier and duller toward
# Deshaan — so northern swamps read as peat/moss blackwater bog, firm ground
# as olive grass-dirt, versus the south's green muck-and-scum marsh. Shared
# vocabulary (same material library) keeps the world coherent.
NORTH_PALETTES = {
    2:  dict(base=GRASS_DIRT, damp=MUD_LEAVES, wet=PEAT, bank=CLAY, high=SCRUB, litter=LITTER),
    5:  dict(base=GRASS_DIRT, damp=MUD_LEAVES, wet=BC_MUD, bank=CLAY, high=SCRUB, litter=LITTER),
    6:  dict(base=MOSS, damp=PEAT, wet=BLACK_MUD, bank=PEAT, high=BC_MOSS, litter=UNDERGROWTH),
    7:  dict(base=PEAT, damp=MUCK, wet=BLACK_MUD, bank=BC_MUD, high=MOSS, litter=BC_MOSS),
    8:  dict(base=SWAMP_GRASS, damp=PEAT, wet=BC_MUD, bank=CLAY, high=GRASS_DIRT, litter=MOSS),
    9:  dict(base=GRASS_DIRT, damp=SWAMP_GRASS, wet=PUDDLE, bank=CLAY, high=GRASS_DIRT, litter=LITTER),
    11: dict(base=GRASS_DIRT, damp=SWAMP_GRASS, wet=PEAT, bank=CLAY, high=SCRUB, litter=MUD_LEAVES),
}
NORTH_V = 0.45              # province v-fraction where the northern zone ends
# Metre/area literals in this module were tuned at x3 and convert via
# scale.TUNE/TUNE_A so the approved control map survives rescales (0015).
# Mountain elevation belts (region 1; climatology: foothill forest ->
# low cloud-forest belt -> crag; montane cooling allowed, never frost).
# Phase 6b: belts rescaled to the sculpted ranges (summits ~650 m; foothill
# tropical forest -> cloud-forest belt -> crag, climatology exception 33.1).
MONT_FOREST_M, MONT_CLOUD_M, MONT_CRAG_M = 100.0, 280.0, 440.0
# Scree/talus aprons (Phase 10 B4). NOT a new slope threshold: the Phase 6b
# sculpt already decided where debris lies — its thermal passes relax mountain
# faces to the repose angle (sculpt.TALUS_TAN) and, at full res after
# benching, to sculpt.TALUS_FULL_TAN. Ground resting inside that angular
# window is therefore debris-mantled; anything steeper is a structural bench
# riser or crag face and stays bare slab. These are TRUE rise/run (the sculpt
# runs in metres), so they take no TUNE_S.
SCREE_MIN_TAN = 0.8 * TALUS_TAN     # below this the slope holds soil/vegetation
SCREE_MAX_TAN = TALUS_FULL_TAN      # above this loose debris cannot rest


# --- the water record (decision 0066) --------------------------------------
#
# The bake does NOT decide where water is, what kind it is, or how salt it is.
# Every water rule below joins through `WaterPaint`, which is the SIGNED
# hydrology graph realised by the water compile (`water_report.ShippedWater`),
# resampled onto the bake's grid. Nothing here re-derives a water class from a
# height threshold, a Phase 3 band raster or a connected-component area test.

# Kind names, from the graph vocabulary (`ShippedWater.kind_names`). Sets, not
# thresholds: what a texel's water IS decides how the ground around it paints.
STEEP_KINDS = frozenset({"sloped-riffle", "sloped-rapid", "sloped-chute", "vertical-fall"})
MARSH_PAINT_KINDS = frozenset({"marsh-fringe", "marsh-deep", "swamp", "backswamp"})
LAKE_KINDS = frozenset({"lake-lowland", "tarn-upland"})
POOL_KINDS = frozenset({"pond", "pool", "plunge-pool"})
SALT_KINDS = frozenset({"ocean", "lagoon", "horizontal-tidal"})
MANGROVE_KINDS = frozenset({"lagoon", "mudflat"})
STREAM_HALF_W_M = 4.0   # a reach narrower than 8 m banks as a stream (BANK_WET)

# The contract the provenance gate checks: which water kinds may decide each
# water-painted material. Written FROM the rules in compile_ground_control —
# if a rule changes, this changes with it (test_landcover_provenance).
_CH = CHANNEL_REACH_KINDS
WATER_PAINT_KINDS: dict[int, frozenset[str]] = {
    SILT:        _CH | SALT_KINDS | MANGROVE_KINDS | MARSH_PAINT_KINDS,
    RIVER_MUD:   _CH | LAKE_KINDS | POOL_KINDS | frozenset({"horizontal-backwater"}),
    BANK_WET:    _CH | LAKE_KINDS | frozenset({"horizontal-backwater"}),
    # the shallows of any fresh water that is not a lake and not a brisk reach
    SCUM:        (MARSH_PAINT_KINDS | POOL_KINDS | LAKE_KINDS | _CH
                  | frozenset({"horizontal-backwater", "mudflat"})),
    PUDDLE:      LAKE_KINDS,
    MUCK:        MARSH_PAINT_KINDS | POOL_KINDS | MANGROVE_KINDS,
    # mangrove mud also fringes an estuary CLASS whose nearest entity is the
    # tidal channel itself
    BC_MUD:      SALT_KINDS | MANGROVE_KINDS | MARSH_PAINT_KINDS | _CH,
    BLACK_MUD:   MARSH_PAINT_KINDS | POOL_KINDS | LAKE_KINDS | SALT_KINDS | MANGROVE_KINDS,
    PEBBLES:     STEEP_KINDS | frozenset({"tarn-upland"}),
    SALT:        SALT_KINDS | MANGROVE_KINDS,
    BEACH_SAND:  SALT_KINDS,
    SEABED_SAND: SALT_KINDS,
    OCEAN_FLOOR: SALT_KINDS,
}
WATER_DERIVED: frozenset[int] = frozenset(WATER_PAINT_KINDS)
_WATER_DERIVED_ARR = np.array(sorted(WATER_DERIVED), dtype=np.int16)


@dataclass
class WaterPaint:
    """The water record on the bake's own grid: what the ground is painted by.

    All grids are `height.shape`. `depth`/`depth_dry` are SIGNED depth in
    metres at the wet and dry seasons (> 0 is standing water); `kind` indexes
    `kind_names` (0 = none), `half_width` is the reach's widthM/2 where the
    texel is a reach (0 elsewhere), `klass` is the compiled water class
    realising the record's salinity (water-class.png R: 0 none, 1 coast,
    2 estuary, 3 river, 4 lake, 5 marsh).
    """

    depth: np.ndarray
    depth_dry: np.ndarray
    kind: np.ndarray
    kind_names: list[str]
    half_width: np.ndarray
    klass: np.ndarray

    def indices(self, names) -> np.ndarray:
        """uint8 indices of the named kinds that this vocabulary carries."""
        wanted = frozenset(names)
        return np.array([i for i, n in enumerate(self.kind_names) if n in wanted],
                        dtype=np.uint8)

    def __getitem__(self, sl):
        """The same record over a window (rebake_landcover --window)."""
        return WaterPaint(self.depth[sl], self.depth_dry[sl], self.kind[sl],
                          self.kind_names, self.half_width[sl], self.klass[sl])

    @staticmethod
    def _resample(a, shape, order):
        a = np.asarray(a)
        if a.shape[:2] == tuple(shape):
            return a
        z = (shape[0] / a.shape[0], shape[1] / a.shape[1])
        out = ndimage.zoom(a, z, order=order, mode="nearest", grid_mode=True)
        pad = [(0, max(0, shape[i] - out.shape[i])) for i in range(2)]
        return np.pad(out, pad, mode="edge")[: shape[0], : shape[1]]

    @classmethod
    def from_record(cls, shipped, shape, m_per_px) -> "WaterPaint":
        """Read the shipped water record (`water_report.ShippedWater`) and put
        it on a `shape` grid. Categorical grids resample nearest (order 0) so
        no texel is ever given a kind or a class nobody authored; the signed
        depth resamples bilinearly (order 1) so the waterline stays smooth."""
        names = shipped.kind_names()
        kind = shipped.kind_index_grid()
        width = shipped.reach_width_grid()
        if kind is None or width is None:
            raise ValueError("the shipped water bundle carries no water-id.png: "
                             "the ground cannot be painted from the record (0066)")
        return cls(
            depth=cls._resample(shipped.signed_depth_m("wet"), shape, 1).astype(np.float32),
            depth_dry=cls._resample(shipped.signed_depth_m("dry"), shape, 1).astype(np.float32),
            kind=cls._resample(kind, shape, 0).astype(np.uint8),
            kind_names=names,
            half_width=(cls._resample(width, shape, 0).astype(np.float32) * 0.5),
            klass=cls._resample(shipped.cls, shape, 0).astype(np.uint8),
        )

    @classmethod
    def from_sea_level(cls, height) -> "WaterPaint":
        """The apron beyond the province border, where the ONLY water is the
        sea at level 0 — there is no graph out there to read."""
        depth = (-np.asarray(height, dtype=np.float32)).astype(np.float32)
        wet = depth > 0.0
        return cls(
            depth=depth, depth_dry=depth.copy(),
            kind=np.where(wet, 1, 0).astype(np.uint8),
            kind_names=["none", "ocean"],
            half_width=np.zeros(depth.shape, dtype=np.float32),
            klass=np.where(wet, 1, 0).astype(np.uint8),
        )


def _region_map(region, slot):
    out = np.zeros(region.shape, dtype=np.int16)
    for rid, p in REGION_PALETTES.items():
        out[region == rid] = p[slot]
    return out


def _warp_regions(region, m_per_px, origin=(0, 0), seed=SEED_DEFAULT):
    """Domain-warp the region raster so borders (including authored straight
    polygon edges) read as organic interdigitated ecotones."""
    shape = region.shape
    amp_px = 160.0 * TUNE / m_per_px       # ~160 m broad waves
    amp2_px = 45.0 * TUNE / m_per_px       # ~45 m fine fingers
    dy = (normal_field(shape, 24, "region-warp-y-broad", origin, seed) * amp_px
          + normal_field(shape, 5, "region-warp-y-fine", origin, seed) * amp2_px)
    dx = (normal_field(shape, 24, "region-warp-x-broad", origin, seed) * amp_px
          + normal_field(shape, 5, "region-warp-x-fine", origin, seed) * amp2_px)
    yy = np.arange(shape[0], dtype=np.float32)[:, None] + dy
    xx = np.arange(shape[1], dtype=np.float32)[None, :] + dx
    del dy, dx
    return ndimage.map_coordinates(region, [yy, xx], order=0, mode="nearest")


def compile_ground_control(height, region, slope, m_per_px, water=None,
                           origin=(0, 0), seed=SEED_DEFAULT, roads=None,
                           minor_routes=None, v_frac=None):
    """Return (landcover material raster int16, control RGBA uint8, provenance uint8).

    height: metres relative to sea level; region: region class raster; slope:
    rise/run; origin/seed: absolute sample coordinate of this window's (0, 0)
    and the noise seed — every noise field is position-seeded
    (position_noise), so a window bakes the same numbers the whole-province
    bake would give it.

    water: the WATER RECORD on this grid (`WaterPaint`) — where water is, what
    kind it is and how deep it stands in each season, read from the signed
    hydrology graph as the water compile realised it (decision 0066). None
    means `WaterPaint.from_sea_level(height)`: beyond the province border the
    only water is the sea at level 0 and there is no record to read.

    roads: optional int8 CONDITION raster of the major roads (0 off-road,
    1 maintained .. 4 broken — `routes_raster.condition_raster`), which
    decides how much built surface still shows and how much of the underlying
    ground has broken back through. A plain bool mask is still accepted and
    read as `worn`. minor_routes: optional int8 raster of minor
    route surface classes (routes_raster.MINOR_TRACK / MINOR_PATH); v_frac:
    optional 0(north)..1(south) province-latitude raster enabling the northern
    palette zone — all at the same resolution as height.

    The third return is the PROVENANCE raster: for every texel a water rule
    decided, the kind index of the water that decided it (0 elsewhere). It is
    the evidence that each water-derived material was painted by the record
    and not by a height threshold.
    """
    shape = height.shape
    wp = water if water is not None else WaterPaint.from_sea_level(height)
    region = _warp_regions(region, m_per_px, origin, seed)

    # Palette zone: northern regions bind land-cover slots to different
    # materials (NORTH_PALETTES); the boundary is noise-blended so the two
    # halves interdigitate over ~1.5 km instead of switching on a line.
    if v_frac is not None:
        north = (v_frac + 0.06 * normal_field(shape, 260.0 * TUNE / m_per_px, "north-boundary", origin, seed)) < NORTH_V
    else:
        north = np.zeros(shape, dtype=bool)

    def rmap(slot):
        out = _region_map(region, slot)
        if north.any():
            out_n = out.copy()
            for rid, p in NORTH_PALETTES.items():
                if slot in p:
                    out_n[region == rid] = p[slot]
            out = np.where(north, out_n, out)
        return out

    mat = rmap("base")

    # Landform-scale slope for material rules (micro-relief bumps must not
    # paint slope bands — they striped the basin, owner report 2026-08-23).
    slope_lf = gaussian(slope, 22.0 * TUNE / m_per_px)

    # --- the record, joined once ------------------------------------------
    # Every water rule below asks two questions of the record and no others:
    # how deep does the water stand here (wet and dry season), and what KIND
    # is the nearest water. Nothing decides "lake", "sea" or "marsh" itself.
    water = wp.depth > 0.0
    kind = wp.kind
    i_chan = wp.indices(CHANNEL_REACH_KINDS)
    i_steep = wp.indices(STEEP_KINDS)
    i_marsh = wp.indices(MARSH_PAINT_KINDS)
    i_lake = wp.indices(LAKE_KINDS)
    i_pool = wp.indices(POOL_KINDS)
    i_salt = wp.indices(SALT_KINDS)
    i_mang = wp.indices(MANGROVE_KINDS)
    i_tarn = wp.indices(("tarn-upland",))
    i_mudflat = wp.indices(("mudflat",))
    i_pan = wp.indices(("mudflat", "lagoon"))
    i_body = wp.indices(set(wp.kind_names[1:]) - set(CHANNEL_REACH_KINDS)
                        - {"horizontal-backwater"})

    shore_d = (ndimage.distance_transform_edt(~water) * m_per_px).astype(np.float32)
    if water.any():
        _, (iy, ix) = ndimage.distance_transform_edt(~water, return_indices=True)
        near_kind = kind[iy, ix]
        near_klass = wp.klass[iy, ix]
    else:
        shore_d = np.full(shape, 1e9, dtype=np.float32)
        near_kind = np.zeros(shape, dtype=np.uint8)
        near_klass = np.zeros(shape, dtype=np.uint8)

    # The channel network of the record: reach kinds that flow (a
    # horizontal-backwater reach IS the body it crosses, so it banks as one).
    channel_bed = np.isin(kind, i_chan)
    if channel_bed.any():
        cd, (cy, cx) = ndimage.distance_transform_edt(~channel_bed, return_indices=True)
        chan_d = (cd * m_per_px).astype(np.float32)
        near_hw = wp.half_width[cy, cx]
        del cd
    else:
        chan_d = np.full(shape, 1e9, dtype=np.float32)
        near_hw = np.zeros(shape, dtype=np.float32)

    # Water provenance: the kind index of the water that decided each texel.
    prov = np.zeros(shape, dtype=np.uint8)

    def paint(mask):
        prov[mask] = near_kind[mask]

    # Multi-scale patchiness (owner 2026-08-23: uniform ~35 m blobs read as
    # camouflage). Fine-grained variation only where the ground is "doing
    # something" — near water, channels and on slopes; calm interior ground
    # gets broad coherent patches instead.
    activity = np.clip(
        np.clip(1.0 - shore_d / (130.0 * TUNE), 0, 1)
        + np.clip(1.0 - chan_d / (110.0 * TUNE), 0, 1)
        + np.clip(slope_lf / (0.05 * TUNE_S), 0, 1), 0, 1).astype(np.float32)
    broad = normal_field(shape, 200.0 * TUNE / m_per_px, "patch-broad", origin, seed)  # ~200 m stable patches
    patch = normal_field(shape, 35.0 * TUNE / m_per_px, "patch-active", origin, seed)   # ~35 m active patches
    fine = normal_field(shape, 14.0 * TUNE / m_per_px, "patch-fine", origin, seed)    # ~14 m speckle
    patch_mix = broad + patch * (0.25 + 0.75 * activity)

    # Wetness patches: the RECORD'S OWN hollows (ground that stands under
    # water in the wet season and dries out in the dry one) and the reach of
    # the marsh bodies, instead of the Phase 3 TWI/wetlands fields.
    wet_score = 0.8 * patch_mix
    wet_score = wet_score + np.where(water & (wp.depth_dry <= 0.0), 1.6, 0.0)
    marsh_cells = np.isin(kind, i_marsh)
    if marsh_cells.any():
        marsh_d = (ndimage.distance_transform_edt(~marsh_cells) * m_per_px).astype(np.float32)
        wet_score = (wet_score + np.where(marsh_d < 30.0 * TUNE, 0.9, 0.0)
                     + np.where(marsh_d < 60.0 * TUNE, 0.4, 0.0))
        del marsh_d
    mat = np.where(wet_score > 0.6, rmap("damp"), mat)
    mat = np.where(wet_score > 1.5, rmap("wet"), mat)
    mat = np.where(fine > 1.05 + 0.55 * (1.0 - activity), rmap("litter"), mat)
    mat = np.where((region == 9) & (wet_score < -0.9), DRY_CLAY, mat)

    # Mountain elevation belts (region 1; climatology §33.1): foothill forest
    # -> cloud-forest moss belt -> crag, with noise-wobbled belt edges. The
    # cloud belt sits low (small coastal-adjacent ranges) per the research.
    mont = region == 1
    if mont.any():
        belt_wob = 28.0 * normal_field(shape, 320.0 * TUNE / m_per_px, "belt-wobble", origin, seed)  # 6b: wobble scaled to the taller belts
        mat = np.where(mont & (height > MONT_FOREST_M + belt_wob), FOREST_FLOOR, mat)
        mat = np.where(mont & (height > MONT_CLOUD_M + belt_wob), BC_MOSS, mat)
        mat = np.where(mont & (height > MONT_CRAG_M + belt_wob), MOUNTAIN_ROCK, mat)

    # Raised ground: local prominence (~30 m window) reads drier everywhere.
    prom = height - gaussian(height, 28.0 * TUNE / m_per_px)
    marshy = np.isin(region, list(MARSHY))
    mat = np.where(prom > 0.35, rmap("high"), mat)

    # Slope: wet peat banks on marsh slopes; steep ground gets its region's
    # rock — tropical slab in the mountains/uplands, root-bound dirt cliffs
    # in the lowlands (owner round 5: the cold mossy-rock cobbles were being
    # slapped on every steep surface, INCLUDING underwater channel walls;
    # steep ground below the waterline keeps its bed material instead).
    above_water = wp.depth < 0.2
    mat = np.where(marshy & (slope_lf > 0.07 * TUNE_S) & above_water, PEAT_SLOPE, mat)
    steep_rock = np.where(np.isin(region, (1, 2)), MOUNTAIN_ROCK,
                          np.where(marshy | (region == 13), BC_ROCK, DIRT_CLIFF))
    mat = np.where((slope_lf > 0.14 * TUNE_S) & above_water, steep_rock, mat)

    # Scree/talus aprons over that rock (Phase 10 B4): mountain and upland
    # ground that sits inside the sculpt's debris-repose window (above) AND on
    # the accumulation side of the slope — prom < 0 is the gully floors, slope
    # feet and hollows debris runs INTO, so spurs and ridge crests keep their
    # bare slab and the mountainsides stop reading as one texture. Broken by
    # the broad noise field so aprons are patchy, not a slope-band stripe.
    repose = (slope_lf >= SCREE_MIN_TAN) & (slope_lf <= SCREE_MAX_TAN)
    scree = (np.isin(region, (1, 2)) & above_water & repose
             & (prom < 0.0) & (broad > -0.9))
    mat = np.where(scree, SCREE, mat)

    # Salt pans: the drying margin of the record's OWN salt flats — a mudflat
    # or a lagoon — never "low ground with a high Phase 3 salinity number".
    flat_pan = slope_lf < 0.012 * TUNE_S
    near_salty = np.isin(near_kind, i_salt) | np.isin(near_klass, (1, 2))
    pan = (np.isin(near_kind, i_pan) & flat_pan & (patch > 0.55)
           & (shore_d < 58.0 * TUNE))
    mat = np.where(pan, SALT, mat)
    paint(pan)

    # Channel gradient (the Bethesda 3-stage water edge): bed silt -> wet
    # river mud waterline -> bank, laid on the reach's compiled extent.
    # Streams (a reach narrower than 8 m, from the record's widthM) bank in
    # mossy pebbles; bigger rivers use the regional bank material — part of
    # the per-water-type shoreline grammar (owner 2026-08-23).
    if channel_bed.any():
        chan_near = np.isin(near_kind, i_chan) | (chan_d < 26.0 * TUNE)
        bank_mat = np.where(near_hw < STREAM_HALF_W_M, BANK_WET, rmap("bank"))
        m_bank = chan_near & (chan_d < 26.0 * TUNE)
        mat = np.where(m_bank, bank_mat, mat)
        paint(m_bank)
        m_mud = chan_near & (chan_d < 10.0 * TUNE)
        mat = np.where(m_mud, RIVER_MUD, mat)
        paint(m_mud)
        mat = np.where(channel_bed, SILT, mat)
        paint(channel_bed)

    # Standing-water gradient around every water contact — contour-following
    # distance bands, highest priority so nothing dry ever touches a
    # waterline. The band applies where the NEAREST water is a standing body,
    # so a texel is decided by the water nearest to it, once. Each water type
    # gets its own progression (owner 2026-08-23):
    #   sea coast (salty):  sand beach -> salt/sand -> damp fringe;
    #                       rocky cove where the shore is steep;
    #   lake (big fresh):   wet pebble bank -> regional bank mud -> damp;
    #   swamp pool (small): black mud -> muck -> damp (no pebble bank);
    # shallows likewise: sea sand / lake puddle-mud / marsh-pool scum.
    near_lake = np.isin(near_kind, i_lake)
    near_body = np.isin(near_kind, i_body)
    rocky = gaussian(slope_lf, 20.0 * TUNE / m_per_px) > 0.045 * TUNE_S
    low = wp.depth > -2.5
    band2 = (~water) & near_body & (shore_d < 58.0 * TUNE) & low          # damp fringe
    band1 = (~water) & near_body & (shore_d < 32.0 * TUNE) & low          # wet mud / salt / rock
    band0 = (~water) & near_body & (shore_d < 13.0 * TUNE) & (wp.depth > -3.0)
    mat = np.where(band2, rmap("damp"), mat)
    prov[band2] = 0
    # Coast typing (research: tropical-shoreline-materials Part D):
    # mangrove country is the record's own sheltered saline water — a lagoon,
    # a mudflat, an estuary class, or a marsh body standing in salt water —
    # and it is mud, never sand; exposed sediment coast is dry BEACH sand
    # above the wet swash line; very flat saline ground keeps its salt pans;
    # steep salty shore is a rocky cove.
    mangrove = (np.isin(near_kind, i_mang) | (near_klass == 2)
                | (np.isin(near_kind, i_marsh) & near_salty))
    b1_salty = np.where(mangrove, BC_MUD, np.where(flat_pan, SALT, BEACH_SAND))
    b1 = np.where(near_salty, b1_salty, np.where(near_lake, rmap("bank"), MUCK))
    mat = np.where(band1, b1, mat)
    paint(band1)
    # the waterline of an exposed sandy coast is WET SAND (seabed_sand, the
    # same sand the shallows show), not the pebble shore: `SAND` is vanilla
    # coastbeach01, a shingle, and painted 13 m either side of the waterline
    # it read as gravel where the map promised a beach (owner 2026-09-12)
    b0 = np.where(near_salty, np.where(mangrove, BLACK_MUD, SEABED_SAND),
                  np.where(near_lake, BANK_WET, BLACK_MUD))
    mat = np.where(band0, b0, mat)
    paint(band0)
    # rocky coves only where mountain spurs actually meet salt water — never
    # on low sandy delta bars (owner round 5: cobbles on sand islands)
    cove = rocky & np.isin(region, (1, 2, 10, 11)) & (height > 1.5) & near_salty
    m_cove = (band0 | band1) & cove
    mat = np.where(m_cove, BC_ROCK, mat)
    prov[m_cove] = 0
    # freshwater gravel bars on brisk reaches (research §1.2) — the record's
    # riffles, rapids, chutes and falls, the water that actually moves gravel
    upland_gravel = np.isin(near_kind, i_steep)
    shallow = water & (wp.depth <= 0.7)
    sh = np.where(near_salty, np.where(mangrove, SILT, SEABED_SAND),
                  np.where(upland_gravel, PEBBLES,
                           np.where(near_lake & ~marshy, PUDDLE, SCUM)))
    mat = np.where(shallow, sh, mat)
    paint(shallow)
    m_gravel = band0 & upland_gravel & ~near_salty
    mat = np.where(m_gravel, PEBBLES, mat)
    paint(m_gravel)
    # deep beds by the KIND of the water standing on them (owner rounds 4-5):
    # the pebbly riverbed texture belongs to moving water only — swamp and
    # lake beds are soft mud, the sea floor rippled sand, mountain water gravel
    deep = wp.depth > 0.7
    mat = np.where(deep, RIVER_MUD, mat)                                   # default
    mat = np.where(deep & np.isin(near_kind, i_chan), SILT, mat)           # channel bed
    mat = np.where(deep & np.isin(near_kind, i_steep), PEBBLES, mat)       # brisk reaches
    mat = np.where(deep & np.isin(near_kind, i_marsh), BLACK_MUD, mat)     # swamp beds
    mat = np.where(deep & np.isin(near_kind, i_salt), OCEAN_FLOOR, mat)    # sea floor
    mat = np.where(deep & np.isin(near_kind, i_tarn), PEBBLES, mat)        # tarn gravel
    mat = np.where(deep & np.isin(near_kind, i_mudflat), BC_MUD, mat)      # tidal flat
    paint(deep)

    # Roads LAST so the wet fringes can't swallow them (they previously ran
    # before the shore bands and vanished — owner report): Phase 4 corridors
    # are all major-city trunk roads (§88); built road surface degrading to
    # dirt path / churned mud by wear noise + ground wetness. Painted only on
    # dry ground — crossings over water/channel beds stay unpainted
    # (bridges/ferries/boardwalks are placed features, Phase 11+).
    if roads is not None:
        roads = np.asarray(roads)
        if roads.dtype == bool:
            # Legacy bool callers (the border apron, older fixtures): a road
            # with no authored state of repair is a worn road.
            cond = np.where(roads, ROAD_WORN, 0).astype(np.int8)
        else:
            cond = roads.astype(np.int8)
        wear = normal_field(shape, 120.0 * TUNE / m_per_px, "wear", origin, seed)   # ~120 m wear stretches
        on_road_all = (cond > 0) & ~water & ~channel_bed
        # The surface a road shows is its authored state of repair (owner
        # 2026-09-16): a maintained road is built surface with the odd worn
        # patch; a decayed one is a track with the underlying ground breaking
        # through; a broken one is all but gone, a few traces in the cover.
        road_mat = np.full(shape, BC_ROAD, dtype=np.int16)
        keep_under = np.zeros(shape, dtype=bool)

        m = cond == ROAD_MAINTAINED
        road_mat = np.where(m & (wear > 0.75), PATH, road_mat)

        m = cond == ROAD_WORN
        road_mat = np.where(m & (wear > 0.45), PATH, road_mat)
        road_mat = np.where(m & (wet_score > 1.2) & (wear > 0.3), TRACK, road_mat)

        m = cond == ROAD_DECAYED
        road_mat = np.where(m, TRACK, road_mat)
        road_mat = np.where(m & (wear > 0.2), PATH, road_mat)
        keep_under |= m & (wear > 0.55)

        m = cond == ROAD_BROKEN
        road_mat = np.where(m, TRACK, road_mat)
        keep_under |= m & (wear <= 0.85)

        on_road = on_road_all & ~keep_under
        mat = np.where(on_road, road_mat, mat)
        prov[on_road] = 0

    # Minor routes (Part 3b): a track is a cart-width worn dirt surface, a
    # footpath a single-texel trodden strip; boardwalks paint nothing (they
    # are placed assets over water — vegetation clearance only). Painted
    # after the trunk roads so a track joining a road cannot overwrite it,
    # and on dry ground only, same rule as above.
    if minor_routes is not None:
        dry = ~water & ~channel_bed
        m_track = (minor_routes == 1) & dry
        m_path = (minor_routes == 2) & dry
        mat = np.where(m_track, TRACK, mat)
        mat = np.where(m_path, PATH, mat)
        prov[m_track | m_path] = 0
        if roads is not None:
            on_road = (cond > 0) & dry & ~keep_under
            mat = np.where(on_road, road_mat, mat)
            prov[on_road] = 0

    # The provenance raster answers only for the materials the water rules
    # own: anywhere else the ground was decided by region, slope or noise.
    prov = np.where(np.isin(mat, _WATER_DERIVED_ARR), prov, 0).astype(np.uint8)

    # Control map: blur each material's mask a little and keep the top two per
    # texel -> (id0, id1, blend), tracked incrementally so a full-res compile
    # never holds a (H, W, 30) stack. Hardware-filterable never; the shader
    # does texelFetch + manual bilinear (see Fly3D).
    w0 = np.zeros(shape, dtype=np.float32)
    w1 = np.zeros(shape, dtype=np.float32)
    id0 = np.zeros(shape, dtype=np.uint8)
    id1 = np.zeros(shape, dtype=np.uint8)
    for i in range(N_MATERIALS):
        m = mat == i
        if not m.any():
            continue
        b = gaussian(m.astype(np.float32), 1.5)
        m0 = b > w0
        m1 = (~m0) & (b > w1)
        id1[m0] = id0[m0]
        w1[m0] = w0[m0]
        id0[m0] = i
        w0[m0] = b[m0]
        id1[m1] = i
        w1[m1] = b[m1]
    blend = w1 / np.maximum(w0 + w1, 1e-6)
    # Routes stay crisp: the blur above lets the surrounding material outvote
    # a two-texel track (owner 2026-09-04: minor roads invisible in 3D). On
    # route texels the painted surface wins outright, with a thin blend so
    # the edge is not a hard seam.
    route = np.isin(mat, (BC_ROAD, TRACK, PATH))
    swap = route & (id0 != mat)
    id1[swap] = id0[swap]
    id0[route] = mat[route].astype(np.uint8)
    blend[route] = np.minimum(blend[route], 0.25)
    macro = normal_field(shape, 40, "macro", origin, seed).clip(-2, 2) / 4 + 0.5
    control = np.stack([
        id0, id1,
        (blend * 255).astype(np.uint8),
        (macro * 255).astype(np.uint8),
    ], -1).astype(np.uint8)
    return mat.astype(np.int16), control, prov
