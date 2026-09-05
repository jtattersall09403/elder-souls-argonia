"""Phase 3 fields on top of the hydrology solve: flood frequency (via HAND —
height above nearest drainage), soil stability classes and first-pass
ecological region classes (master plan §16 taxonomy, coarse rule-based cut).

Cultural/political regions are Phase 4; these are physical classes only.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy import ndimage

import json
from pathlib import Path

from PIL import Image, ImageDraw

from .condition import interiorness
from .hydrology import HydrologyResult
from .scale import TUNE, TUNE_S

# x3-era tuned constants converted via scale.TUNE* (0015) — see scale.py.
SOIL_ROCK_SLOPE = 0.08 * TUNE_S
PEAT_MIN_SEA_DIST_M = 2500 * TUNE
SWAMP_MIN_SEA_DIST_M = 1200 * TUNE
DEEP_MARSH_MIN_SEA_DIST_M = 2500 * TUNE

# --- saturated-ground rebalance (owner decision, 2026-08-30; decision 0036 Q4)
#
# The first cut called ground "swamp" only where the hydrology solve had
# modelled standing water — 7.6 % of land — and sent everything above 30 m to
# the hills, which left the province reading 72 % dry against canon's
# "enormous swamp". A marsh is not only where water stands: it is low, flat,
# slow-draining ground that saturates. These constants say so, in the terms
# the hydrology already computes.
#
# The terrain itself is genuinely high in places (43 % of land is above 30 m,
# 24 % above 150 m) and no reclassification should pretend otherwise — a
# 300 m hillside must not become "interior swamp". What changes is the low,
# flat, wet-indexed ground that was being called "firm lowland" by default.
SATURATED_MAX_HEIGHT_M = 30.0     # above this the ground drains; it is not marsh
SATURATED_MAX_SLOPE_DEG = 6.0     # marsh is flat; a slope sheds water
SATURATED_MAX_HAND_M = 6.0        # within this of the water table it stays wet
SATURATED_MIN_TWI = 6.0           # or the topographic wetness index says it pools
HILL_MIN_HEIGHT_M = 60.0          # was 30 m — too low for a 654 m province
HILL_MIN_SLOPE_DEG = 3.0          # a flat terrace above a marsh is not a hill
MOUNTAIN_MIN_HEIGHT_M = 150.0     # was 40 m, which made a quarter of the land alpine

# --- mangrove forest (owner-approved, Phase 10 round 4) -----------------------
#
# Canon puts a "nigh-impenetrable" ten-mile wall of mangroves near Lilmoth
# (lore/regions/murkmire.md; lore/topics/fauna-hazards.md § Flora) and
# mangrove-screened estuaries at Soulrest and Bramman's river
# (lore/regions/waters.md; topics/history-timeline.md, 1E 1033).
# Real-world grounding: docs/research/world-terrain/mangrove-coastal-ecology.md — a mangal
# is the INTERTIDAL fringe of SHELTERED, low-energy saline coasts and estuary
# mouths, on fine mud, in belts typically tens to hundreds of metres deep.
# Salinity here is geodesic-through-water (hydrology.py), which already
# encodes estuary reach; exposure to OPEN sea (the storm-exposure construction
# from climate-weather, decision 0032) excludes high-energy outer coasts.
MANGROVE_MIN_SALINITY = 0.30      # tidal needs 0.15; the mangal wants near-sea brack
MANGROVE_MAX_SEA_DIST_M = 700.0   # belt depth: tens-hundreds of m, not km (research §3)
MANGROVE_MAX_SLOPE_DEG = 8.0      # prop roots need mud flats, not banks
MANGROVE_MAX_EXPOSURE = 0.55      # e^(-d_openSea/1200 m); excludes wave-beaten fronts
MANGROVE_INTERTIDAL_MIN_Z = -2.0  # the fringe stands in shallow water at high tide
MANGROVE_INTERTIDAL_REACH_M = 60.0  # how far the stand walks out over the shallows
OPEN_SEA_MIN_LAND_DIST_M = 2500.0   # ocean this far from any land = open sea (0032)

OVERRIDES_PATH = Path(__file__).resolve().parents[3] / "world" / "sources" / "regions" / "authored-overrides.json"


def apply_authored_overrides(regions: np.ndarray) -> np.ndarray:
    """Rasterize owner-authored region polygons over the rule-based classes.
    Each override replaces only its listed source classes, so hydrological
    classes (wetland, lakes, rivers' corridors) survive inside the shape.
    Polygon boundaries are noised (deterministic) so authored straight edges
    read as organic ecotones, not ruled lines (owner feedback 2026-08-23)."""
    if not OVERRIDES_PATH.exists():
        return regions
    spec = json.loads(OVERRIDES_PATH.read_text())
    h, w = regions.shape
    out = regions.copy()
    rng = np.random.default_rng(20260823)
    for ov in spec.get("overrides", []):
        img = Image.new("L", (w, h), 0)
        ImageDraw.Draw(img).polygon([(u * w, v * h) for u, v in ov["polygonUV"]], fill=1)
        poly = np.array(img, dtype=bool)
        # organic boundary: signed distance to the polygon edge + smooth noise
        d_out = ndimage.distance_transform_edt(~poly)
        d_in = ndimage.distance_transform_edt(poly)
        signed = d_in - d_out  # px, >0 inside
        noise = np.zeros((h, w), dtype=np.float32)
        for sigma, amp in ((28, 22.0), (7, 7.0)):  # ~460 m waves + ~115 m fingers
            octv = ndimage.gaussian_filter(rng.standard_normal((h, w)), sigma)
            noise += amp * octv / max(octv.std(), 1e-9)
        mask = (signed + noise > 0) & np.isin(out, ov["appliesToClasses"])
        out[mask] = ov["regionClass"]
    return out

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
    13: ("tropical jungle", (55, 175, 45)),
    14: ("mangrove forest", (0, 120, 105)),
}

# Macro climate/atmosphere profile per region class (master plan §33.1):
# humidity and mist 0..1, visibility in rough metres under canopy/weather.
# canopy = canopy closure 0..1 (module 55 §96: "canopy is a light property of
# place") — permanent-dusk forest classes (rootland deep marsh, tropical
# jungle) near 1.0; swamp forest / mangrove fringe / tree-island hammock mid;
# open marsh, floodplain, delta reed low; crag, mountains and open water ~0.
CLIMATE = {
    0: {"humidity": 0.7, "mist": 0.2, "rain": "sea squalls", "visibility": 2000, "canopy": 0.0},
    1: {"humidity": 0.5, "mist": 0.4, "rain": "orographic", "visibility": 1200, "canopy": 0.05},
    2: {"humidity": 0.6, "mist": 0.3, "rain": "showers", "visibility": 1000, "canopy": 0.25},
    3: {"humidity": 0.9, "mist": 0.6, "rain": "tidal storms", "visibility": 500, "canopy": 0.2},
    4: {"humidity": 0.9, "mist": 0.6, "rain": "tidal storms", "visibility": 600, "canopy": 0.5},
    5: {"humidity": 0.8, "mist": 0.5, "rain": "monsoonal", "visibility": 700, "canopy": 0.4},
    6: {"humidity": 1.0, "mist": 0.9, "rain": "constant drip", "visibility": 120, "canopy": 0.95},
    7: {"humidity": 1.0, "mist": 0.8, "rain": "monsoonal", "visibility": 200, "canopy": 0.65},
    8: {"humidity": 0.9, "mist": 0.6, "rain": "monsoonal", "visibility": 350, "canopy": 0.3},
    9: {"humidity": 0.8, "mist": 0.5, "rain": "seasonal flood rains", "visibility": 600, "canopy": 0.15},
    10: {"humidity": 0.7, "mist": 0.4, "rain": "showers", "visibility": 700, "canopy": 0.6},
    11: {"humidity": 0.7, "mist": 0.3, "rain": "seasonal", "visibility": 900, "canopy": 0.35},
    12: {"humidity": 1.0, "mist": 0.8, "rain": "monsoonal", "visibility": 300, "canopy": 0.05},
    13: {"humidity": 0.95, "mist": 0.7, "rain": "monsoonal downpour", "visibility": 90, "canopy": 1.0},
    14: {"humidity": 0.95, "mist": 0.6, "rain": "tidal storms", "visibility": 150, "canopy": 0.8},
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


def compute_regions(z: np.ndarray, hydro: HydrologyResult, metres_per_px: float,
                    apply_overrides: bool = True) -> RegionsResult:
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
    soil[hydro.wetlands & (hydro.salinity < 0.2) & (dist_sea_m > PEAT_MIN_SEA_DIST_M)] = 4
    near_river = ndimage.binary_dilation(hydro.rivers >= 2, iterations=2)
    soil[hydro.tidal | ((flood == 3) & near_river)] = 5
    soil[(slope > SOIL_ROCK_SLOPE) | (z > 35)] = 1
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

    # Ground that saturates, whether or not the solve put standing water on it:
    # low, flat, and either close to the water table or topographically prone
    # to pooling. This is what makes the province read as marsh rather than as
    # lowland with ponds in it (decision 0036 Q4).
    slope_deg = np.degrees(np.arctan(slope))
    saturated = (
        land
        & (z < SATURATED_MAX_HEIGHT_M)
        & (slope_deg < SATURATED_MAX_SLOPE_DEG)
        & ((hand < SATURATED_MAX_HAND_M) | (hydro.twi > SATURATED_MIN_TWI))
    )
    marsh = hydro.wetlands | saturated

    regions = np.full(z.shape, 11, dtype=np.uint8)  # default firm lowland
    regions[marsh] = 8
    regions[marsh & (dist_sea_m > SWAMP_MIN_SEA_DIST_M)] = 7
    regions[marsh & (dist_sea_m > DEEP_MARSH_MIN_SEA_DIST_M)] = 6
    regions[(flood >= 2) & ~marsh & land & near_water] = 9
    regions[land & near_major & ~hydro.tidal] = 5
    regions[hammock] = 10
    regions[hydro.tidal & land] = 4
    regions[(hydro.tidal | marsh) & land & river_mouth] = 3
    # Mangrove forest: the seaward, strongly saline, flat, SHELTERED mud
    # fringe of the tidal band — a wall read from the sea (canon: the Lilmoth
    # mangrove wall, Bramman's screened river mouth; real siting rules in
    # docs/research/world-terrain/mangrove-coastal-ecology.md §1). Takes the fringe from
    # salt marsh AND from delta mouths (mangroves line estuary channels), but
    # never wave-beaten open-sea fronts or rocky ground.
    land_over_ocean_m = ndimage.distance_transform_edt(hydro.ocean) * metres_per_px
    open_sea = hydro.ocean & (land_over_ocean_m > OPEN_SEA_MIN_LAND_DIST_M)
    if open_sea.any():
        dist_open_m = ndimage.distance_transform_edt(~open_sea) * metres_per_px
        exposure = np.exp(-dist_open_m / 1200.0)
    else:
        exposure = np.zeros(z.shape, dtype=np.float32)  # enclosed water: all sheltered
    mangrove = (hydro.tidal & land
                & (hydro.salinity >= MANGROVE_MIN_SALINITY)
                & (dist_sea_m < MANGROVE_MAX_SEA_DIST_M)
                & (slope_deg < MANGROVE_MAX_SLOPE_DEG)
                & (exposure < MANGROVE_MAX_EXPOSURE)
                & (soil != 1))
    regions[mangrove] = 14
    # Uplands need height *and* drainage: a flat terrace standing over a marsh
    # is hammock or lowland, not hills.
    regions[land & (z > HILL_MIN_HEIGHT_M) & (slope_deg > HILL_MIN_SLOPE_DEG)] = 2
    regions[land & (z > MOUNTAIN_MIN_HEIGHT_M) & (interiorness(*z.shape) < 0.35)] = 1
    regions[hydro.lakes] = 12
    if apply_overrides:
        regions = apply_authored_overrides(regions)
    regions[~land] = 0
    # The mangrove fringe stands IN the water: extend class 14 over the
    # adjoining shallow intertidal (research §1 — between low water and the
    # spring-tide line), so the seaward wall is classified where it grows,
    # not clipped at the land raster's edge. Sheltered shallows only.
    reach_px = max(1, int(round(MANGROVE_INTERTIDAL_REACH_M / metres_per_px)))
    intertidal = (hydro.ocean & (z > MANGROVE_INTERTIDAL_MIN_Z)
                  & (exposure < MANGROVE_MAX_EXPOSURE)
                  & ndimage.binary_dilation(regions == 14, iterations=reach_px))
    regions[intertidal] = 14

    fractions = {name: round(float((regions == cid).mean()), 4) for cid, (name, _) in REGION_CLASSES.items()}
    stats = {
        "floodFractions": {k: round(float((flood == v).mean()), 3) for k, v in
                           (("none", 0), ("rare", 1), ("seasonal", 2), ("frequent", 3))},
        "soilFractions": {name: round(float((soil == cid).mean()), 3) for cid, name in SOIL_CLASSES.items()},
        "regionFractions": fractions,
        "handPercentilesM": {p: round(float(np.percentile(hand[land], p)), 2) for p in (25, 50, 75, 95)},
    }
    return RegionsResult(hand, flood, soil, regions, stats)
