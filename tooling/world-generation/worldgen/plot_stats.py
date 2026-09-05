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

CLARK-EVANS R
-------------
    R = (observed mean nearest-neighbour distance) / (0.5 * sqrt(A / n))

with A the zone's LAND area and n the plotted records in it. R = 1 is a random
(Poisson) scatter, R > 1 is regular/even spacing — the procedural tell — and
R < 1 is clustered. Target: R < 1 in every zone, and near the hand-placed 0.5
in the settled zones. It is a REPORT, not a gate: what R should be per zone is
a design judgement (a deep-wilds zone is legitimately closer to random than a
city hinterland), and the gate for spacing is `SEPARATION_M`.

The area is the zone's own land: the culture raster's territory for that zone
intersected with `ProvinceSurvey.land` (authored, walkable/wadeable ground —
shallow marsh counts, open water does not), in the plot's own metres.

Report-only: nothing here moves a record or touches the solve.
"""

from __future__ import annotations

import math

# a zone with fewer than this many plotted records has no meaningful R
MIN_RECORDS_FOR_R = 8


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


def clark_evans(positions_by_zone: dict[str, list[tuple[float, float]]],
                area_by_zone: dict[str, float]) -> dict:
    """{zone: {n, areaKm2, meanNearestM, expectedM, R}} plus a `target` note."""
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
        total = 0.0
        for i, (x, z) in enumerate(pts):
            nearest = min(math.hypot(x - ox, z - oz)
                          for j, (ox, oz) in enumerate(pts) if j != i)
            total += nearest
        observed = total / n
        expected = 0.5 * math.sqrt(area / n)
        zones[zone] = {"n": n, "areaKm2": round(area / 1e6, 2),
                       "meanNearestM": round(observed, 1),
                       "expectedM": round(expected, 1),
                       "R": round(observed / expected, 3)}
    ratios = [z["R"] for z in zones.values() if z.get("R") is not None]
    return {
        "measure": "Clark-Evans nearest-neighbour ratio R = observed mean NN distance / (0.5*sqrt(A/n)), "
                   "A = the zone's land area (culture territory ∧ authored land)",
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
             "| zone | plotted | land km² | mean NN m | expected m | R |", "|---|---:|---:|---:|---:|---:|"]
    for zone, z in stats["byZone"].items():
        if z.get("R") is None:
            lines.append(f"| {zone} | {z['n']} | {z['areaKm2']} | — | — | — ({z.get('note', '')}) |")
        else:
            lines.append(f"| {zone} | {z['n']} | {z['areaKm2']} | {z['meanNearestM']} | "
                         f"{z['expectedM']} | **{z['R']}** |")
    return lines
