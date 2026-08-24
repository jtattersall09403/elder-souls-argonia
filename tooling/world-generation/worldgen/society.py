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
from .scale import TUNE

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
    7: 2.7,   # interior swamp
    8: 2.0,   # fringe marsh
    9: 1.8,   # seasonal floodplain
    10: 2.0,  # raised hammock
    11: 1.5,  # firm lowland
    12: 2.0,  # lake & standing water
    13: 2.6,  # tropical jungle — dense, low visibility, predator country
}
# Naga are deep-swamp people (Lore:Naga) — their influence exists only on
# swampy ground, never on firm lowland/jungle/uplands.
SWAMP_CLASSES = (6, 7, 8, 9, 12)
DEPTH_GAIN = 2.9
# Distance/km constants tuned at x3 convert via scale.TUNE (0015 — scale.py).
DEPTH_SCALE_KM = 10.0 * TUNE     # cost-km at which depth saturates
COAST_ACCESS_KM = 3.0 * TUNE     # landing on a wild coast is possible but not free
MINOR_PORT_ACCESS_KM = 3.0 * TUNE  # Alten Corimont: smuggler port, limited access
ROAD_RELIEF = 0.6
ROAD_RELIEF_RADIUS_M = 400.0 * TUNE
CITY_SAFE_RADIUS_M = 1000.0 * TUNE  # majors except Helstrom — its approach stays wild
# Border mountains are chartable frontier hills, not the province's peril
# (canon: the marsh heart is the deadliest ground) — cap their band at 3.
MOUNTAIN_DANGER_CAP = 3.4  # band 3 max - frontier hills, not deep peril
# "Middle Argonia": canon holds Helstrom's surrounds as the most dangerous part
# of the province (Lore:Helstrom / PGE3) — explicit peril boost around it.
HEART_BOOST = 1.2
HEART_SIGMA_KM = 2.5 * TUNE

# Depth travel cost: marsh is the true barrier (impenetrable, disease-ridden),
# mountains hard but chartable, big rivers/lakes crossable by boat.
DEPTH_SLOPE_FACTOR = 20.0 * TUNE
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

# Culture zones, lore-grounded via world/sources/lore/ dossiers; mapped to the
# §82 demographic chart zones in world/sources/demographics/.
# seeds: anchor-city gaussians (sigma km). uvSeeds: non-city gaussians for
# cultures whose centre is a territory, not a settlement. regionBoost: added
# influence on ecological region classes (deep marsh belongs to its tribes).
CULTURES = {
    # Gideon: Nibenese Imperials + Argonian majority on the Blackwood road (Lore:Gideon)
    "imperial-fringe": {"colour": (200, 70, 60), "seeds": {"gideon": 3.0}},
    # Stormhold/Thorn: Dres slavery history, Dunmer minorities (Lore:Stormhold, Lore:Thorn)
    "dunmer-north": {"colour": (150, 110, 200), "seeds": {"stormhold": 2.5, "thorn": 2.5}},
    # Soulrest (3E capital, most mixed) and Lilmoth (merchant council) (Lore:Soulrest, Lore:Lilmoth)
    "mercantile-coast": {"colour": (220, 170, 60), "seeds": {"soulrest": 2.5, "lilmoth": 3.0}},
    # Blackrose: "Argonians and the Imperials … lay claim"; Versidue-Shaie's
    # prison institution to its south (Lore:Blackrose, ON:Blackrose Prison)
    "imperial-penal-south": {"colour": (235, 130, 120), "seeds": {"blackrose": 2.2}},
    # Archon: Argonian-majority east coast over a Cantemiric Velothi layer,
    # Shadowscales facility (Lore:Archon)
    "saxhleel-coast": {"colour": (80, 170, 150), "seeds": {"archon": 2.5}},
    # Alten Corimont: Argonian pirate/smuggler river-port (ON:Alten Corimont)
    "pirate-freeholds": {"colour": (125, 125, 145), "seeds": {"alten-corimont": 1.4}},
    # Middle Argonia around Helstrom: Hist-bound tribes (Lore:Helstrom, Lore:Hist)
    "hist-heartland": {"colour": (50, 130, 60), "seeds": {"helstrom": 4.0},
                       "regionBoost": {6: 1.2, 7: 0.9, 8: 0.4}},
    # Naga-Kur and tribeless Naga "control much of the inner swamps" of the
    # south (northern Murkmire) (Lore:Naga, Lore:Naga-Kur)
    "naga-kur-deeps": {"colour": (110, 125, 45), "uvSeeds": [[0.47, 0.68, 3.0]],
                       "regionBoost": {6: 1.2, 7: 0.9}, "swampOnly": True},
}


@dataclass
class SocietyResult:
    danger: np.ndarray        # float32 1..5
    danger_band: np.ndarray   # uint8 1..5
    depth_km: np.ndarray      # float64 cost-km from the outside world
    culture: np.ndarray       # uint8 index into culture_names, 0 = hinterland
    culture_names: list[str]
    stats: dict


def depth_cost_surface(z: np.ndarray, slope: np.ndarray, ocean: np.ndarray, lakes: np.ndarray,
                       rivers: np.ndarray, wetlands: np.ndarray, flood: np.ndarray,
                       jungle: np.ndarray | None = None) -> np.ndarray:
    cost = 1.0 + slope * DEPTH_SLOPE_FACTOR
    cost = np.where(wetlands, cost * DEPTH_WETLAND, cost)
    if jungle is not None:  # dense canopy: harder than open ground, softer than marsh
        cost = np.where(jungle & ~wetlands, cost * 2.5, cost)
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
    # Cap ALL high dry ground (mountains and upland hills) — capping only the
    # mountain class left a hard straight seam along the class boundary.
    high_ground = (regions == 1) | (regions == 2)
    danger[high_ground] = np.minimum(danger[high_ground], MOUNTAIN_DANGER_CAP)
    # Jungle is perilous but the marsh heart stays the province's deadliest.
    danger[regions == 13] = np.minimum(danger[regions == 13], 4.4)

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
    h, w = shape
    for ci, (name, spec) in enumerate(CULTURES.items()):
        for seed, sigma_km in spec.get("seeds", {}).items():
            if seed not in anchors_px:
                continue
            d = _distance_km_from([anchors_px[seed]], shape, metres_per_px)
            influence[ci] += np.exp(-(d ** 2) / (2 * (sigma_km * TUNE) ** 2))
        for u, v, sigma_km in spec.get("uvSeeds", []):
            d = _distance_km_from([(int(u * w), int(v * h))], shape, metres_per_px)
            influence[ci] += np.exp(-(d ** 2) / (2 * (sigma_km * TUNE) ** 2))
        for cid, boost in spec.get("regionBoost", {}).items():
            influence[ci][regions == cid] += boost
        if spec.get("swampOnly"):
            influence[ci][~np.isin(regions, SWAMP_CLASSES)] = 0.0

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
