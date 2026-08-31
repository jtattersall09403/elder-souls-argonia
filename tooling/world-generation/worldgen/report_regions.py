"""Recompute the ecological region classes and print the fractions — no writes.

Retuning the region classifier changes what every downstream compile believes
about the province (climate air, weather, visibility, danger, flora palettes),
so it needs a way to be *measured* before it is *applied*. This reads the
cached hydrology solve, runs `compute_regions`, and reports; it never touches
`apps/world-studio/public/`, which matters when another phase is mid-playtest
against those rasters.

Usage:
  python3 -m worldgen.report_regions "<vault>/argonia-heightfield/hydrology-pass1.npz"
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

from .hydrology import HydrologyResult
from .regions import REGION_CLASSES, compute_regions
from .scale import RAW_METRES_PER_SAMPLE

STEP = 3   # compile_hydrology's decimation; keeps this comparable to the shipped raster

#: Classes that should read as wetland when the province is described as "an
#: enormous swamp" — the number the 2026-08-30 rebalance is judged on.
WETLAND_CLASSES = (3, 4, 5, 6, 7, 8, 9, 12, 14)
DRY_CLASSES = (1, 2, 10, 11)


def load(npz_path: Path) -> tuple[np.ndarray, HydrologyResult, float]:
    npz = np.load(npz_path)
    fields = {name: npz[name] for name in npz.files}
    known = set(HydrologyResult.__dataclass_fields__) - {"stats"}
    result = HydrologyResult(stats={}, **{k: v for k, v in fields.items() if k in known})
    # `conditioned` is the terrain the hydrology solve ran on — the same array
    # compile_hydrology passes to compute_regions.
    return fields["conditioned"], result, RAW_METRES_PER_SAMPLE * STEP


def report(regions: np.ndarray) -> dict:
    land = regions != 0
    total_land = int(land.sum())
    shares = {
        name: int((regions == cid).sum()) / total_land
        for cid, (name, _) in REGION_CLASSES.items() if cid != 0
    }
    return {
        "landPixels": total_land,
        "shareOfLand": shares,
        "wetlandShare": sum(
            shares[REGION_CLASSES[c][0]] for c in WETLAND_CLASSES),
        "dryShare": sum(shares[REGION_CLASSES[c][0]] for c in DRY_CLASSES),
    }


def main() -> None:
    npz_path = Path(sys.argv[1])
    z, hydro, metres = load(npz_path)
    result = compute_regions(z, hydro, metres)
    summary = report(result.regions)
    print(f"land pixels {summary['landPixels']:,} @ {metres:.2f} m/px\n")
    for name, share in sorted(summary["shareOfLand"].items(), key=lambda kv: -kv[1]):
        if share >= 0.0005:
            print(f"  {name:30s} {share * 100:6.2f}% of land")
    print(f"\n  WETLAND classes total {summary['wetlandShare'] * 100:6.2f}%")
    print(f"  DRY classes total     {summary['dryShare'] * 100:6.2f}%")


if __name__ == "__main__":
    main()
