"""Phase 3 fields on top of the hydrology solve: flood frequency (via HAND —
height above nearest drainage), soil stability classes and first-pass
ecological region classes (master plan §16 taxonomy, coarse rule-based cut).

Cultural/political regions are Phase 4; these are physical classes only.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy import ndimage

from .condition import interiorness
from .hydrology import HydrologyResult

FLOOD_FREQUENT_HAND_M = 0.75
FLOOD_SEASONAL_HAND_M = 2.0
FLOOD_RARE_HAND_M = 4.0

SOIL_CLASSES = {1: "rock/upland firm", 2: "firm lowland", 3: "soft marsh", 4: "peat", 5: "mud"}

REGION_CLASSES = {
    0: ("ocean", (20, 45, 90)),
    1: ("border mountains", (150, 150, 160)),
    2: ("upland hills", (176, 160, 120)),
    3: ("tidal delta", (196, 176, 88)),
    4: ("coastal lagoon & salt marsh", (150, 190, 120)),
    5: ("deep river corridor", (70, 130, 200)),
    6: ("rootland deep marsh", (30, 110, 60)),
    7: ("interior swamp", (60, 150, 90)),
    8: ("fringe marsh", (110, 180, 110)),
    9: ("seasonal floodplain", (170, 200, 140)),
    10: ("raised hammock", (200, 150, 90)),
    11: ("firm lowland", (140, 160, 110)),
    12: ("lake & standing water", (70, 140, 215)),
}


@dataclass
class RegionsResult:
    hand: np.ndarray         # float32 m above nearest drainage
    flood: np.ndarray        # uint8: 0 none, 1 rare, 2 seasonal, 3 frequent
    soil: np.ndarray         # uint8 SOIL_CLASSES
    regions: np.ndarray      # uint8 REGION_CLASSES
    stats: dict


def height_above_drainage(z: np.ndarray, hydro: HydrologyResult) -> np.ndarray:
    """HAND: trace each cell's flow path to its nearest flood-capable water and
    take the elevation difference. Only medium+ rivers, lakes and the sea count
    — minor creeks don't flood whole uplands, and using them as reference water
    painted every gentle hillside as floodplain."""
    water = hydro.ocean | hydro.lakes | (hydro.rivers >= 2)
    # Reference is the water SURFACE, not the bed: sea surface is 0, a lake's
    # surface is its spill level (filled), a river's bed ~ its surface here.
    surface = np.where(hydro.ocean, 0.0, np.where(hydro.lakes, hydro.filled, z))
    drain_elev = np.where(water, surface, np.nan).reshape(-1)
    order = np.argsort(hydro.filled, axis=None)  # ascending: downstream first
    flow = hydro.flow_to
    z_flat = z.reshape(-1)
    for i in order:
        if np.isnan(drain_elev[i]):
            j = flow[i]
            if j >= 0 and not np.isnan(drain_elev[j]):
                drain_elev[i] = drain_elev[j]
            else:
                # Path leaves the map without meeting water: not flood-prone.
                # (A zero fallback here painted whole border catchments blue.)
                drain_elev[i] = z_flat[i] - 1e6
    return np.maximum(z - drain_elev.reshape(z.shape), 0.0).astype(np.float32)


def compute_regions(z: np.ndarray, hydro: HydrologyResult, metres_per_px: float) -> RegionsResult:
    land = ~hydro.ocean
    hand = height_above_drainage(z, hydro)

    flood = np.zeros(z.shape, dtype=np.uint8)
    flood[land & (hand < FLOOD_RARE_HAND_M)] = 1
    flood[land & (hand < FLOOD_SEASONAL_HAND_M)] = 2
    flood[land & ((hand < FLOOD_FREQUENT_HAND_M) | hydro.tidal)] = 3
    flood[hydro.lakes] = 0

    gy, gx = np.gradient(z, metres_per_px)
    slope = np.hypot(gx, gy)
    # Marsh "depth" is distance from open sea: at province scale nowhere is
    # further than ~6 km from the ocean, so bands are in low kilometres.
    dist_sea_m = ndimage.distance_transform_edt(land) * metres_per_px

    soil = np.full(z.shape, 2, dtype=np.uint8)
    soil[hydro.wetlands] = 3
    soil[hydro.wetlands & (hydro.salinity < 0.2) & (dist_sea_m > 2500)] = 4
    near_river = ndimage.binary_dilation(hydro.rivers >= 2, iterations=2)
    soil[hydro.tidal | ((flood == 3) & near_river)] = 5
    soil[(slope > 0.08) | (z > 35)] = 1
    soil[~land] = 0

    # Raised hammocks: locally prominent dry ground surrounded by wetland.
    prominence = z - ndimage.gaussian_filter(z, 10)
    wet_neighbourhood = ndimage.uniform_filter(hydro.wetlands.astype(np.float32), 15)
    hammock = land & ~hydro.wetlands & (prominence > 3.0) & (z < 30) & (wet_neighbourhood > 0.35)

    near_major = ndimage.binary_dilation(hydro.rivers == 3, iterations=3)
    # Deltas are point features where rivers actually meet the sea.
    river_mouth = ndimage.binary_dilation(
        (hydro.rivers >= 1) & ndimage.binary_dilation(hydro.ocean, iterations=2), iterations=8)
    near_water = ndimage.binary_dilation((hydro.rivers >= 1) | hydro.lakes, iterations=12)

    regions = np.full(z.shape, 11, dtype=np.uint8)  # default firm lowland
    regions[hydro.wetlands] = 8
    regions[hydro.wetlands & (dist_sea_m > 1200)] = 7
    regions[hydro.wetlands & (dist_sea_m > 2500)] = 6
    regions[(flood >= 2) & ~hydro.wetlands & land & near_water] = 9
    regions[land & near_major & ~hydro.tidal] = 5
    regions[hammock] = 10
    regions[hydro.tidal & land] = 4
    regions[(hydro.tidal | hydro.wetlands) & land & river_mouth] = 3
    regions[land & (z > 30)] = 2
    regions[land & (z > 40) & (interiorness(*z.shape) < 0.35)] = 1
    regions[hydro.lakes] = 12
    regions[~land] = 0

    fractions = {name: round(float((regions == cid).mean()), 4) for cid, (name, _) in REGION_CLASSES.items()}
    stats = {
        "floodFractions": {k: round(float((flood == v).mean()), 3) for k, v in
                           (("none", 0), ("rare", 1), ("seasonal", 2), ("frequent", 3))},
        "soilFractions": {name: round(float((soil == cid).mean()), 3) for cid, name in SOIL_CLASSES.items()},
        "regionFractions": fractions,
        "handPercentilesM": {p: round(float(np.percentile(hand[land], p)), 2) for p in (25, 50, 75, 95)},
    }
    return RegionsResult(hand, flood, soil, regions, stats)
