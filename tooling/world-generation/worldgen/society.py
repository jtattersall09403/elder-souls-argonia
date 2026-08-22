"""Phase 4 fields: fixed regional danger and culture territories (pass 2).

Danger is a place property — the player's level never appears here (decision
0004). Canon rule (owner-confirmed, cf. PGE3 / Helstrom lore): the province
EDGES are the safer, settled, Imperial-touched zones; danger grows with depth
into the marsh, and the heart around Helstrom is the most dangerous ground in
the province, with Helstrom itself reached only through it.

Depth is a cost-distance from the outside world (all major cities except
Helstrom, plus the coastline; Alten Corimont counts as a minor access point),
travelled over a surface where wetland is the hardest ground to penetrate —
mountains are difficult but chartable, marsh is disease-ridden maze. A small
terrain-hazard base per region class rides on top, roads relieve slightly.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy import ndimage

from .routes import cost_distance_field

# Terrain-hazard base per region class id (regions.REGION_CLASSES); the depth
# term carries the main gradient, so these stay modest.
DANGER_BASE = {
    0: 1.6,   # ocean
    1: 2.2,   # border mountains
    2: 1.9,   # upland hills
    3: 1.7,   # tidal delta
    4: 1.7,   # coastal lagoon & salt marsh
    5: 1.6,   # deep river corridor
    6: 2.8,   # rootland deep marsh
    7: 2.5,   # interior swamp
    8: 1.9,   # fringe marsh
    9: 1.8,   # seasonal floodplain
    10: 2.0,  # raised hammock
    11: 1.5,  # firm lowland
    12: 2.0,  # lake & standing water
}
DEPTH_GAIN = 2.9
DEPTH_SCALE_KM = 12.0        # cost-km at which depth saturates
COAST_ACCESS_KM = 2.0        # landing on a wild coast is possible but not free
MINOR_PORT_ACCESS_KM = 3.0   # Alten Corimont: smuggler port, limited access
ROAD_RELIEF = 0.6
ROAD_RELIEF_RADIUS_M = 400.0
CITY_SAFE_RADIUS_M = 1000.0  # majors except Helstrom — its approach stays wild
# Border mountains are hard wilderness but not the province's deep peril
# (canon: the marsh heart is the deadliest ground) — cap their band at 4.
MOUNTAIN_DANGER_CAP = 4.0
# "Middle Argonia": canon holds Helstrom's surrounds as the most dangerous part
# of the province (Lore:Helstrom / PGE3) — explicit peril boost around it.
HEART_BOOST = 1.2
HEART_SIGMA_KM = 2.5

# Depth travel cost: marsh is the true barrier (impenetrable, disease-ridden),
# mountains hard but chartable, big rivers/lakes crossable by boat.
DEPTH_SLOPE_FACTOR = 20.0
DEPTH_WETLAND = 5.0
DEPTH_FLOOD_FREQUENT = 2.0
DEPTH_MOUNTAIN = 1.8
DEPTH_RIVER = 3.0
DEPTH_LAKE = 4.0

DANGER_BANDS = {
    1: ("danger 1 — settled", (90, 180, 90)),
    2: ("danger 2 — travelled", (170, 200, 90)),
    3: ("danger 3 — wild", (225, 185, 70)),
    4: ("danger 4 — perilous", (220, 110, 60)),
    5: ("danger 5 — deep peril", (150, 55, 130)),
}

# Culture zones map to the master plan §82 demographic chart zones (see
# world/sources/demographics/population-priors.json).
CULTURES = {
    "imperial-fringe": {"colour": (200, 70, 60), "seeds": {"gideon": 3.0}},
    "dunmer-north": {"colour": (150, 110, 200), "seeds": {"stormhold": 2.5, "thorn": 2.5}},
    "mercantile-coast": {"colour": (220, 170, 60), "seeds": {"soulrest": 2.5, "lilmoth": 3.0}},
    "argonian-settled": {"colour": (80, 170, 150), "seeds": {"blackrose": 2.5, "archon": 2.5}},
    "pirate-freeholds": {"colour": (125, 125, 145), "seeds": {"alten-corimont": 1.4}},
    "hist-heartland": {"colour": (50, 130, 60), "seeds": {"helstrom": 4.0}},
}
HEARTLAND_REGION_BOOST = {6: 1.2, 7: 0.9, 8: 0.4}  # deep marsh favours the Hist tribes


@dataclass
class SocietyResult:
    danger: np.ndarray        # float32 1..5
    danger_band: np.ndarray   # uint8 1..5
    depth_km: np.ndarray      # float64 cost-km from the outside world
    culture: np.ndarray       # uint8 index into culture_names, 0 = hinterland
    culture_names: list[str]
    stats: dict


def depth_cost_surface(z: np.ndarray, slope: np.ndarray, ocean: np.ndarray, lakes: np.ndarray,
                       rivers: np.ndarray, wetlands: np.ndarray, flood: np.ndarray) -> np.ndarray:
    cost = 1.0 + slope * DEPTH_SLOPE_FACTOR
    cost = np.where(wetlands, cost * DEPTH_WETLAND, cost)
    cost = np.where(flood == 3, cost * DEPTH_FLOOD_FREQUENT, cost)
    cost = np.where(z > 40.0, cost * DEPTH_MOUNTAIN, cost)
    cost = np.where(rivers >= 2, cost * DEPTH_RIVER, cost)
    cost = np.where(lakes, cost * DEPTH_LAKE, cost)
    cost = np.where(ocean, 1.0, cost)  # sea itself is open to sail
    return cost.astype(np.float64)


def _distance_km_from(points_px: list[tuple[int, int]], shape, metres_per_px: float) -> np.ndarray:
    mask = np.ones(shape, dtype=bool)
    for x, y in points_px:
        mask[y, x] = False
    return ndimage.distance_transform_edt(mask) * metres_per_px / 1000.0


def compute_society(regions: np.ndarray, anchors_px: dict[str, tuple[int, int]],
                    road_mask: np.ndarray, depth_cost: np.ndarray, ocean: np.ndarray,
                    metres_per_px: float) -> SocietyResult:
    shape = regions.shape

    # Depth into the marsh: seeded from the outside world.
    seeds: list[tuple[int, int, float]] = []
    for name, (x, y) in anchors_px.items():
        if name == "helstrom":
            continue
        seeds.append((x, y, MINOR_PORT_ACCESS_KM if name == "alten-corimont" else 0.0))
    coast = ~ocean & ndimage.binary_dilation(ocean)
    for y, x in zip(*np.where(coast)):
        seeds.append((int(x), int(y), COAST_ACCESS_KM))
    depth_km = cost_distance_field(depth_cost, seeds, metres_per_px)
    depth_norm = np.clip(np.nan_to_num(depth_km, posinf=DEPTH_SCALE_KM) / DEPTH_SCALE_KM, 0.0, 1.0)

    danger = np.zeros(shape, dtype=np.float32)
    for cid, base in DANGER_BASE.items():
        danger[regions == cid] = base
    danger += (DEPTH_GAIN * depth_norm).astype(np.float32)
    if "helstrom" in anchors_px:
        d_heart = _distance_km_from([anchors_px["helstrom"]], shape, metres_per_px)
        danger += (HEART_BOOST * np.exp(-(d_heart ** 2) / (2 * HEART_SIGMA_KM ** 2))).astype(np.float32)
    danger[regions == 1] = np.minimum(danger[regions == 1], MOUNTAIN_DANGER_CAP)

    road_km = ndimage.distance_transform_edt(~road_mask) * metres_per_px / 1000.0 \
        if road_mask.any() else np.full(shape, np.inf)
    danger -= ROAD_RELIEF * np.clip(1.0 - road_km / (ROAD_RELIEF_RADIUS_M / 1000.0), 0.0, 1.0)

    safe_px = [p for n, p in anchors_px.items() if n not in ("helstrom", "alten-corimont")]
    city_km = _distance_km_from(safe_px, shape, metres_per_px)
    near_city = city_km < CITY_SAFE_RADIUS_M / 1000.0
    danger[near_city] = np.minimum(danger[near_city], 1.5)
    danger = np.clip(danger, 1.0, 5.0)
    band = np.clip(np.round(danger), 1, 5).astype(np.uint8)

    names = list(CULTURES.keys())
    influence = np.zeros((len(names), *shape), dtype=np.float32)
    for ci, (name, spec) in enumerate(CULTURES.items()):
        for seed, sigma_km in spec["seeds"].items():
            if seed not in anchors_px:
                continue
            d = _distance_km_from([anchors_px[seed]], shape, metres_per_px)
            influence[ci] += np.exp(-(d ** 2) / (2 * sigma_km ** 2))
    hi = names.index("hist-heartland")
    for cid, boost in HEARTLAND_REGION_BOOST.items():
        influence[hi][regions == cid] += boost

    dominant = np.argmax(influence, axis=0).astype(np.uint8) + 1
    dominant[influence.max(axis=0) < 0.06] = 0  # unclaimed hinterland
    dominant[regions == 0] = 0

    finite_depth = depth_km[np.isfinite(depth_km) & (regions != 0)]
    stats = {
        "dangerBandFractions": {DANGER_BANDS[b][0]: round(float((band == b).mean()), 3)
                                for b in DANGER_BANDS},
        "depthKmPercentiles": {p: round(float(np.percentile(finite_depth, p)), 1)
                               for p in (50, 75, 90, 99)},
        "cultureFractions": {"hinterland": round(float((dominant == 0).mean()), 3),
                             **{n: round(float((dominant == i + 1).mean()), 3)
                                for i, n in enumerate(names)}},
    }
    return SocietyResult(danger, band, depth_km, dominant, names, stats)
