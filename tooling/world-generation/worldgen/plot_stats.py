"""Report-only statistics over the committed macro plot (97 G3 / rule A5).

    python3 -m worldgen.macro_plot --report-only   # recompute and write them

WHY
---
97 A5 says density is a CAUSAL GRADIENT, not a spread: thick on hinterlands,
roads, rivers, coasts and resources, thin and meaningful in the deep wilds.
Hand-placed worlds measure that way — the mined evidence puts hand placement at
a Clark-Evans nearest-neighbour ratio of about 0.5, i.e. strongly clustered.
The plot approximates within-cluster clumping with a lattice, and nothing said
whether the result actually clusters. This module says.

EDGE-CORRECTED R
----------------
    R = observed mean nearest-neighbour distance / same-mask Poisson mean

The null is Monte-Carlo sampled in the exact culture∧land mask, including its
coastlines, holes and thin corridors. R = 1 is random in that available shape,
R > 1 is regular/even spacing — the procedural tell — and R < 1 is clustered.
Target: R < 1 in every zone, near the hand-placed 0.5 in settled zones. It is
a report, not a gate: the deep wilds may legitimately sit closer to random.

The area is the zone's own land: the culture raster's territory for that zone
intersected with `ProvinceSurvey.land` (authored, walkable/wadeable ground —
shallow marsh counts, open water does not), in the plot's own metres.

Report-only: nothing here moves a record or touches the solve.
"""

from __future__ import annotations

import math
import zlib

import numpy as np

# a zone with fewer than this many plotted records has no meaningful R
MIN_RECORDS_FOR_R = 8
NULL_TRIALS = 128


def zone_land_area_m2(survey) -> dict[str, float]:
    """{zone name: land area in m^2} from the culture raster ∧ the land mask."""
    import numpy as np

    cell_m2 = float(survey.grid_px_m) ** 2
    land = survey.land
    culture = survey.culture
    if land.shape != culture.shape:      # both are published on the 1345 grid
        raise ValueError(f"land {land.shape} and culture {culture.shape} are not the same grid")
    out: dict[str, float] = {}
    for index, name in survey.culture_names.items():
        out[name] = float(np.count_nonzero((culture == index) & land)) * cell_m2
    return out


def zone_land_masks(survey) -> dict[str, np.ndarray]:
    """Boolean land mask per culture, on the survey's own analysis grid."""
    if survey.land.shape != survey.culture.shape:
        raise ValueError(f"land {survey.land.shape} and culture {survey.culture.shape} are not the same grid")
    return {name: (survey.culture == index) & survey.land
            for index, name in survey.culture_names.items()}


def _mean_nearest(points: np.ndarray) -> float:
    delta = points[:, None, :] - points[None, :, :]
    distances = np.hypot(delta[:, :, 0], delta[:, :, 1])
    np.fill_diagonal(distances, np.inf)
    return float(np.min(distances, axis=1).mean())


def same_mask_null_mean(mask: np.ndarray, n: int, cell_m: float, zone: str,
                        trials: int = NULL_TRIALS, seed: int = 1103) -> tuple[float, float]:
    """Monte-Carlo Poisson null conditional on this exact irregular mask.

    Sampling cells without replacement and jittering within each cell avoids a
    grid-spacing bias while retaining coastlines, holes and thin corridors.
    Returns mean expected nearest-neighbour distance and its trial SD.
    """
    cells = np.argwhere(mask)
    if n > len(cells):
        raise ValueError(f"cannot sample {n} points from a {len(cells)}-cell mask for {zone}")
    rng = np.random.default_rng([seed, zlib.crc32(zone.encode())])
    means = np.empty(trials, dtype=np.float64)
    for trial in range(trials):
        picked = cells[rng.choice(len(cells), size=n, replace=False)].astype(np.float64)
        jitter = rng.random((n, 2))
        # argwhere is row,z then col,x; orientation does not affect distances.
        points = (picked + jitter) * cell_m
        means[trial] = _mean_nearest(points)
    return float(means.mean()), float(means.std())


def clark_evans(positions_by_zone: dict[str, list[tuple[float, float]]],
                area_by_zone: dict[str, float],
                mask_by_zone: dict[str, np.ndarray] | None = None,
                cell_m: float | None = None,
                trials: int = NULL_TRIALS,
                seed: int = 1103) -> dict:
    """Clark-Evans-like R against a Poisson null in the same land mask.

    An analytical expectation remains available for small unit callers that
    provide no mask, but production reporting always supplies masks.
    """
    zones = {}
    for zone in sorted(positions_by_zone):
        pts = positions_by_zone[zone]
        area = area_by_zone.get(zone, 0.0)
        n = len(pts)
        if n < MIN_RECORDS_FOR_R or area <= 0.0:
            zones[zone] = {"n": n, "areaKm2": round(area / 1e6, 2), "R": None,
                           "note": "too few plotted records for a meaningful ratio"
                                   if n < MIN_RECORDS_FOR_R else "no land area for this zone"}
            continue
        observed = _mean_nearest(np.asarray(pts, dtype=np.float64))
        analytical = 0.5 * math.sqrt(area / n)
        if mask_by_zone is not None:
            if cell_m is None:
                raise ValueError("cell_m is required with mask_by_zone")
            expected, null_sd = same_mask_null_mean(mask_by_zone[zone], n, cell_m, zone, trials, seed)
            null_kind = "same-mask-monte-carlo"
        else:
            expected, null_sd = analytical, 0.0
            null_kind = "analytical-area"
        zones[zone] = {"n": n, "areaKm2": round(area / 1e6, 2),
                       "meanNearestM": round(observed, 1),
                       "expectedM": round(expected, 1),
                       "nullSdM": round(null_sd, 1),
                       "analyticalExpectedM": round(analytical, 1),
                       "null": null_kind,
                       "R": round(observed / expected, 3)}
    ratios = [z["R"] for z in zones.values() if z.get("R") is not None]
    return {
        "measure": "Edge-corrected nearest-neighbour ratio R = observed mean NN distance / the mean of "
                   f"{trials} deterministic Poisson trials in the same culture∧land mask",
        "target": "R < 1 (clustered); hand-placed worlds measure about 0.5 (97 A5). Reported, not gated.",
        "zonesOverTarget": sorted(z for z, v in zones.items() if v.get("R") is not None and v["R"] >= 1.0),
        "median": round(sorted(ratios)[len(ratios) // 2], 3) if ratios else None,
        "byZone": zones,
    }


def digest_section(stats: dict) -> list[str]:
    """The macro-plot.md section for `stats` (97 G3)."""
    lines = ["", "## Clustering — Clark-Evans R per zone (97 A5 / G3)", "",
             f"{stats['target']} Median R {stats['median']}; "
             f"over target: {', '.join(stats['zonesOverTarget']) or 'none'}.", "",
             "| zone | plotted | land km² | mean NN m | same-mask null m | R |", "|---|---:|---:|---:|---:|---:|"]
    for zone, z in stats["byZone"].items():
        if z.get("R") is None:
            lines.append(f"| {zone} | {z['n']} | {z['areaKm2']} | — | — | — ({z.get('note', '')}) |")
        else:
            lines.append(f"| {zone} | {z['n']} | {z['areaKm2']} | {z['meanNearestM']} | "
                         f"{z['expectedM']} | **{z['R']}** |")
    return lines
