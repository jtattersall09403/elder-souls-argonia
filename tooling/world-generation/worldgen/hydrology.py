"""First-pass province hydrology (master plan Part V, Phase 3).

Coarse, province-wide solution on the conditioned heightfield: ocean mask,
depression filling (priority-flood), D8 flow, accumulation, river hierarchy,
lakes, watershed labelling, topographic wetness, tidal/salinity fields and a
first-cut ecological classing. Watershed-level refinement comes in Phase 6.

All thresholds are pass-1 tuning values, exposed in the returned metadata so
later passes and validation reports can reason about them.
"""

from __future__ import annotations

import heapq
from dataclasses import dataclass, field

import numpy as np
from scipy import ndimage

SEA_LEVEL = 0.0
# Drainage-area thresholds (km^2, at world scale) for the river hierarchy.
RIVER_MAJOR_KM2 = 15.0
RIVER_MEDIUM_KM2 = 4.0
RIVER_MINOR_KM2 = 1.0
# Routing noise: correlated field added to the routing surface (not the real
# terrain) so channels meander and converge instead of running geometrically
# straight across flats. Deterministic seed for reproducible builds.
ROUTING_NOISE_SEED = 20260822
ROUTING_NOISE_AMP_M = 1.2
LAKE_MIN_DEPTH = 0.15          # filled - raw ground (m) that counts as standing water
WETLAND_MAX_ELEV = 8.0         # m; upper bound for marsh ground
TWI_WETLAND_PERCENTILE = 70    # of land cells, above which low ground reads wet
TIDAL_MAX_ELEV = 1.5           # m above sea level reachable by tide
SALINITY_DECAY_M = 1500.0      # e-folding distance of brackish influence inland

NEIGHBOR_OFFSETS = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


@dataclass
class HydrologyResult:
    ocean: np.ndarray          # bool
    filled: np.ndarray         # float32, depression-filled surface
    lakes: np.ndarray          # bool, standing interior water
    flow_to: np.ndarray        # int32 flat index of downstream cell, -1 = outlet
    accum_km2: np.ndarray      # float32 drainage area
    rivers: np.ndarray         # uint8: 0 none, 1 minor, 2 medium, 3 major
    watersheds: np.ndarray     # int32 basin label, 0 = ocean/none
    twi: np.ndarray            # float32 topographic wetness index
    wetlands: np.ndarray       # bool
    tidal: np.ndarray          # bool
    salinity: np.ndarray       # float32 0..1
    stats: dict = field(default_factory=dict)


def routing_noise(shape: tuple[int, int], amp_m: float = ROUTING_NOISE_AMP_M,
                  seed: int = ROUTING_NOISE_SEED) -> np.ndarray:
    """Two-octave smoothed gaussian field, std ≈ amp_m."""
    rng = np.random.default_rng(seed)
    coarse = ndimage.gaussian_filter(rng.standard_normal(shape), 8)
    fine = ndimage.gaussian_filter(rng.standard_normal(shape), 2)
    field = coarse / max(coarse.std(), 1e-9) + 0.35 * fine / max(fine.std(), 1e-9)
    return (field / max(field.std(), 1e-9) * amp_m).astype(np.float32)


def ocean_mask(z: np.ndarray) -> np.ndarray:
    """Below-sea-level cells connected to the map border are ocean."""
    below = z <= SEA_LEVEL
    lab, _ = ndimage.label(below)
    border_labels = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    return below & np.isin(lab, border_labels[border_labels != 0])


def fill_depressions(z: np.ndarray, ocean: np.ndarray) -> np.ndarray:
    """Priority-flood: raise every pit to its exact spill level so all land
    drains to the ocean or map border. Flats are resolved separately by
    resolve_flats — a naive epsilon fill makes broad marsh flats drain as
    thousands of parallel rills to the nearest coast instead of converging."""
    h, w = z.shape
    filled = z.astype(np.float64).copy()
    visited = ocean.copy()
    heap: list[tuple[float, int, int]] = []
    edge = ocean_edge_and_border(z, ocean)
    for y, x in zip(*np.where(edge)):
        visited[y, x] = True
        heapq.heappush(heap, (float(filled[y, x]), int(y), int(x)))
    while heap:
        zc, y, x = heapq.heappop(heap)
        for dy, dx in NEIGHBOR_OFFSETS:
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx]:
                visited[ny, nx] = True
                if filled[ny, nx] < zc:
                    filled[ny, nx] = zc
                heapq.heappush(heap, (float(filled[ny, nx]), ny, nx))
    return filled


def _bfs_distance(mask: np.ndarray, sources: np.ndarray) -> np.ndarray:
    """Chebyshev BFS steps within mask from sources; inf where unreached."""
    dist = np.full(mask.shape, np.inf, dtype=np.float64)
    frontier = sources & mask
    dist[frontier] = 0
    step = 0
    structure = np.ones((3, 3), dtype=bool)
    while frontier.any():
        step += 1
        frontier = ndimage.binary_dilation(frontier, structure=structure) & mask & np.isinf(dist)
        dist[frontier] = step
    return dist


def resolve_flats(filled: np.ndarray, ocean: np.ndarray, eps: float = 1e-5) -> np.ndarray:
    """Garbrecht & Martz flat resolution: on cells with no downslope neighbour,
    add a tiny gradient combining 'toward lower terrain' and 'away from higher
    terrain', so flow across marsh flats converges into channels instead of
    running parallel."""
    h, w = filled.shape
    pad = np.pad(filled, 1, mode="edge")
    has_lower = np.zeros((h, w), dtype=bool)
    tol = 1e-6
    near_lower_nonflat = np.zeros((h, w), dtype=bool)
    near_higher = np.zeros((h, w), dtype=bool)
    for dy, dx in NEIGHBOR_OFFSETS:
        nb = pad[1 + dy : 1 + dy + h, 1 + dx : 1 + dx + w]
        has_lower |= nb < filled - tol
        near_higher |= nb > filled + tol
    flat = ~has_lower & ~ocean
    pad_flat = np.pad(flat, 1, constant_values=False)
    pad_ocean = np.pad(ocean, 1, constant_values=True)
    for dy, dx in NEIGHBOR_OFFSETS:
        nb = pad[1 + dy : 1 + dy + h, 1 + dx : 1 + dx + w]
        nb_flat = pad_flat[1 + dy : 1 + dy + h, 1 + dx : 1 + dx + w]
        nb_ocean = pad_ocean[1 + dy : 1 + dy + h, 1 + dx : 1 + dx + w]
        # a flat's outlet edge: neighbour drains (non-flat or ocean) at <= height
        near_lower_nonflat |= (~nb_flat | nb_ocean) & (nb <= filled + tol)
    toward_lower = _bfs_distance(flat, flat & near_lower_nonflat)
    away_higher = _bfs_distance(flat, flat & near_higher)
    finite_max = np.nanmax(np.where(np.isfinite(away_higher), away_higher, 0.0)) + 1.0
    away = np.where(np.isfinite(away_higher), finite_max - away_higher, 0.0)
    toward = np.where(np.isfinite(toward_lower), toward_lower, finite_max)
    adjust = np.where(flat, 2.0 * toward + away, 0.0)
    return filled + adjust * eps


def ocean_edge_and_border(z: np.ndarray, ocean: np.ndarray) -> np.ndarray:
    """Seed cells for the flood: land touching ocean, plus map-border land."""
    coastal = ~ocean & ndimage.binary_dilation(ocean)
    border = np.zeros_like(ocean)
    border[0], border[-1], border[:, 0], border[:, -1] = True, True, True, True
    return coastal | (border & ~ocean)


def d8_flow(filled: np.ndarray, ocean: np.ndarray) -> np.ndarray:
    """Steepest-descent D8 downstream index per cell (flat), -1 at outlets."""
    h, w = filled.shape
    pad = np.pad(filled, 1, constant_values=-1e9)  # off-map is a perfect sink
    best_drop = np.full((h, w), -np.inf, dtype=np.float32)
    flow_to = np.full((h, w), -1, dtype=np.int64)
    for dy, dx in NEIGHBOR_OFFSETS:
        dist = np.hypot(dy, dx)
        nb = pad[1 + dy : 1 + dy + h, 1 + dx : 1 + dx + w]
        drop = (filled - nb) / dist
        target_y = np.clip(np.arange(h)[:, None] + dy, 0, h - 1)
        target_x = np.clip(np.arange(w)[None, :] + dx, 0, w - 1)
        target = target_y * w + target_x
        off_map = (np.arange(h)[:, None] + dy < 0) | (np.arange(h)[:, None] + dy >= h) | \
                  (np.arange(w)[None, :] + dx < 0) | (np.arange(w)[None, :] + dx >= w)
        target = np.where(off_map, -1, target)
        better = drop > best_drop
        best_drop = np.where(better, drop, best_drop)
        flow_to = np.where(better, target, flow_to)
    flow_to[ocean] = -1
    # cells flowing into ocean become outlets of their streams (keep index; the
    # accumulation walk stops at ocean/off-map)
    return flow_to.reshape(-1)


def accumulate(filled: np.ndarray, flow_to: np.ndarray, ocean: np.ndarray, cell_km2: float) -> np.ndarray:
    order = np.argsort(filled, axis=None)[::-1]  # high to low
    acc = np.full(filled.size, cell_km2, dtype=np.float32)
    acc[ocean.reshape(-1)] = 0.0
    ocean_flat = ocean.reshape(-1)
    for i in order:
        j = flow_to[i]
        if j >= 0 and not ocean_flat[i]:
            acc[j] += acc[i]
    return acc.reshape(filled.shape)


def label_watersheds(filled: np.ndarray, flow_to: np.ndarray, ocean: np.ndarray,
                     accum_km2: np.ndarray, min_basin_km2: float, cell_km2: float) -> np.ndarray:
    """Basin label per cell: inherit downstream label, new label at outlets.
    Basins smaller than min_basin_km2 are lumped as label -1 (coastal minor)."""
    h, w = filled.shape
    labels = np.zeros(filled.size, dtype=np.int32)
    order = np.argsort(filled, axis=None)  # low to high: downstream first
    ocean_flat = ocean.reshape(-1)
    next_label = 1
    for i in order:
        if ocean_flat[i]:
            continue
        j = flow_to[i]
        if j < 0 or ocean_flat[j]:
            labels[i] = next_label
            next_label += 1
        else:
            labels[i] = labels[j]
    labels = labels.reshape(h, w)
    # keep only basins with enough area; others -> -1
    sizes = np.bincount(labels.reshape(-1), minlength=next_label) * cell_km2
    keep = sizes >= min_basin_km2
    keep[0] = True
    out = np.where(keep[labels], labels, -1)
    out[ocean] = 0
    return out


def compute(z: np.ndarray, metres_per_px: float) -> HydrologyResult:
    cell_km2 = (metres_per_px / 1000.0) ** 2
    ocean = ocean_mask(z)
    land = ~ocean
    # Lakes come from real depressions in the clean terrain.
    filled = fill_depressions(z, ocean)
    lakes = land & ((filled - z) > LAKE_MIN_DEPTH)
    # Routing runs on a noised copy so channels meander and converge.
    z_route = z + routing_noise(z.shape)
    drain = resolve_flats(fill_depressions(z_route, ocean), ocean)
    flow_to = d8_flow(drain, ocean)
    accum = accumulate(drain, flow_to, ocean, cell_km2)
    rivers = np.zeros(z.shape, dtype=np.uint8)
    rivers[land & (accum >= RIVER_MINOR_KM2)] = 1
    rivers[land & (accum >= RIVER_MEDIUM_KM2)] = 2
    rivers[land & (accum >= RIVER_MAJOR_KM2)] = 3
    watersheds = label_watersheds(drain, flow_to, ocean, accum, min_basin_km2=5.0, cell_km2=cell_km2)

    gy, gx = np.gradient(filled, metres_per_px)
    slope = np.hypot(gx, gy)
    twi = np.log((accum * 1e6 / metres_per_px + 1.0) / (slope + 0.005))
    # Smooth the wetness field before thresholding: raw TWI carries the D8
    # drainage stripes that read as a circuit-board texture when masked.
    twi_smooth = ndimage.gaussian_filter(twi, 2.5)
    land_twi = twi_smooth[land & (z < WETLAND_MAX_ELEV)]
    twi_cut = float(np.percentile(land_twi, TWI_WETLAND_PERCENTILE)) if land_twi.size else 0.0
    near_water = ndimage.binary_dilation(lakes | (rivers >= 2), iterations=2)
    wetlands = land & (z > SEA_LEVEL) & (z < WETLAND_MAX_ELEV) & (slope < 0.03) & \
        ((twi_smooth > twi_cut) | lakes | near_water)
    # Despeckle so isolated single-cell wet/dry pixels don't read as noise.
    wetlands = ndimage.binary_opening(ndimage.binary_closing(wetlands))

    dist_m = ndimage.distance_transform_edt(~ocean) * metres_per_px
    tidal = land & (z <= TIDAL_MAX_ELEV) & (dist_m < 2.5 * SALINITY_DECAY_M)
    salinity = np.exp(-dist_m / SALINITY_DECAY_M).astype(np.float32)
    salinity[~(ocean | tidal | wetlands | (rivers > 0))] *= 0.0

    outlets = (flow_to.reshape(z.shape) == -1) & land
    stats = {
        "cellKm2": cell_km2,
        "oceanFraction": round(float(ocean.mean()), 3),
        "lakeFraction": round(float(lakes.mean()), 4),
        "wetlandFraction": round(float(wetlands.mean()), 3),
        "tidalFraction": round(float(tidal.mean()), 3),
        "riverCells": {k: int((rivers == v).sum()) for k, v in (("minor", 1), ("medium", 2), ("major", 3))},
        "basinCount": int(len(np.unique(watersheds[watersheds > 0]))),
        "landOutletCells": int(outlets.sum()),
        "maxFillDepthM": round(float((filled - z)[land].max()), 2),
        "twiWetlandCut": round(twi_cut, 2),
        "thresholds": {
            "riverKm2": [RIVER_MINOR_KM2, RIVER_MEDIUM_KM2, RIVER_MAJOR_KM2],
            "wetlandMaxElevM": WETLAND_MAX_ELEV,
            "tidalMaxElevM": TIDAL_MAX_ELEV,
            "salinityDecayM": SALINITY_DECAY_M,
        },
    }
    return HydrologyResult(ocean, filled, lakes, flow_to, accum, rivers,
                           watersheds, twi_smooth.astype(np.float32), wetlands, tidal, salinity, stats)
