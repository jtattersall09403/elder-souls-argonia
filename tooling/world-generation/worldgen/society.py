"""Phase 4 fields: fixed regional danger and culture territories (pass 1).

Danger is a place property — the player's level never appears here (decision
0004). It combines a per-region-class base with remoteness from cities and
relief near roads, clamped to bands 1 (settled fringe) … 5 (deepest peril).

Culture territories are influence fields seeded at the anchor cities plus a
Hist-heartland boost in the deep marsh classes; the dominant culture per cell
gives a pass-1 territory map for Phase 4 review. Tribes subdivide later.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy import ndimage

# Danger base per region class id (regions.REGION_CLASSES).
DANGER_BASE = {
    0: 2.0,   # ocean
    1: 3.5,   # border mountains
    2: 2.5,   # upland hills
    3: 2.0,   # tidal delta
    4: 2.0,   # coastal lagoon & salt marsh
    5: 2.2,   # deep river corridor
    6: 4.5,   # rootland deep marsh
    7: 3.6,   # interior swamp
    8: 2.6,   # fringe marsh
    9: 2.4,   # seasonal floodplain
    10: 3.0,  # raised hammock
    11: 1.8,  # firm lowland
    12: 3.0,  # lake & standing water
}
REMOTENESS_PER_KM = 0.35
REMOTENESS_CAP = 2.2
ROAD_RELIEF = 0.8
ROAD_RELIEF_RADIUS_M = 400.0
CITY_SAFE_RADIUS_M = 1000.0

DANGER_BANDS = {
    1: ("danger 1 — settled", (90, 180, 90)),
    2: ("danger 2 — travelled", (170, 200, 90)),
    3: ("danger 3 — wild", (225, 185, 70)),
    4: ("danger 4 — perilous", (220, 110, 60)),
    5: ("danger 5 — deep peril", (150, 55, 130)),
}

CULTURES = {
    "imperial-fringe": {"colour": (200, 70, 60), "seeds": {"gideon": 3.0}},
    "dunmer-north": {"colour": (150, 110, 200), "seeds": {"stormhold": 2.5, "thorn": 2.5}},
    "mercantile-coast": {"colour": (220, 170, 60), "seeds": {"soulrest": 2.5, "lilmoth": 3.0, "alten-corimont": 1.5}},
    "argonian-settled": {"colour": (80, 170, 150), "seeds": {"blackrose": 2.5, "archon": 2.5}},
    "hist-heartland": {"colour": (50, 130, 60), "seeds": {"helstrom": 4.0}},
}
HEARTLAND_REGION_BOOST = {6: 1.2, 7: 0.9, 8: 0.4}  # deep marsh favours the Hist tribes


@dataclass
class SocietyResult:
    danger: np.ndarray        # float32 1..5
    danger_band: np.ndarray   # uint8 1..5
    culture: np.ndarray       # uint8 index into culture_names, 0 = hinterland
    culture_names: list[str]
    stats: dict


def _distance_km_from(points_px: list[tuple[int, int]], shape, metres_per_px: float) -> np.ndarray:
    mask = np.ones(shape, dtype=bool)
    for x, y in points_px:
        mask[y, x] = False
    return ndimage.distance_transform_edt(mask) * metres_per_px / 1000.0


def compute_society(regions: np.ndarray, anchors_px: dict[str, tuple[int, int]],
                    road_mask: np.ndarray, metres_per_px: float) -> SocietyResult:
    shape = regions.shape
    danger = np.zeros(shape, dtype=np.float32)
    for cid, base in DANGER_BASE.items():
        danger[regions == cid] = base

    major_px = [p for name, p in anchors_px.items() if name != "alten-corimont"]
    city_km = _distance_km_from(major_px, shape, metres_per_px)
    danger += np.minimum(city_km * REMOTENESS_PER_KM, REMOTENESS_CAP)

    road_km = ndimage.distance_transform_edt(~road_mask) * metres_per_px / 1000.0 \
        if road_mask.any() else np.full(shape, np.inf)
    danger -= ROAD_RELIEF * np.clip(1.0 - road_km / (ROAD_RELIEF_RADIUS_M / 1000.0), 0.0, 1.0)
    danger[city_km < CITY_SAFE_RADIUS_M / 1000.0] = np.minimum(
        danger[city_km < CITY_SAFE_RADIUS_M / 1000.0], 1.5)
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

    stats = {
        "dangerBandFractions": {DANGER_BANDS[b][0]: round(float((band == b).mean()), 3)
                                for b in DANGER_BANDS},
        "cultureFractions": {"hinterland": round(float((dominant == 0).mean()), 3),
                             **{n: round(float((dominant == i + 1).mean()), 3)
                                for i, n in enumerate(names)}},
    }
    return SocietyResult(danger, band, dominant, names, stats)
