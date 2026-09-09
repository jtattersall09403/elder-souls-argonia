"""Re-solve the province region raster from the cached hydrology, without
re-running the hydrology solve.

Why this exists: `compile_hydrology` re-solves flow, rivers, lakes, wetlands
and salinity from the heightfield, and its outputs are what the plot, the
routes and the terrain were built on — so re-running it to change a region
*rule* invalidates work far beyond the rule. But the region classifier is a
pure function of the cached hydrology arrays (`hydrology-pass1.npz`, written
by `compile_hydrology` alongside the rasters), so a region-grammar change can
be applied exactly, deterministically and in seconds by replaying only
`regions.compute_regions` over that cache.

Verified 2026-09-09: replaying the classifier over the shipped npz reproduces
the shipped `regions` array with **zero** differing pixels (~4 s), so any
difference this tool writes is attributable to the code change under test and
nothing else. The tool refuses to write unless the differences it finds are
confined to the classes named with ``--expect-retired``.

Usage:
  python3 -m worldgen.reclassify_regions <path-to-hydrology-pass1.npz> \
      [--expect-retired 10] [--apply]

Without ``--apply`` it reports the diff and writes nothing.

Downstream: anything baked FROM the region raster (landcover, scatter, chunk
bundles, climate rasters) is not touched here; the caller must recompile it.
"""

from __future__ import annotations

import argparse
import collections
import json
from pathlib import Path

import numpy as np
from PIL import Image

from .hydrology import HydrologyResult
from .regions import REGION_CLASSES, compute_regions
from .scale import HSCALE, RAW_METRES_PER_SAMPLE

REPO_ROOT = Path(__file__).resolve().parents[3]
PROVINCE = REPO_ROOT / "apps" / "world-studio" / "public" / "province"

#: `compile_hydrology` decimates the heightfield by this before solving.
STEP = 3

_NPZ_FIELDS = ("ocean", "filled", "lakes", "flow_to", "accum_km2", "rivers",
               "watersheds", "twi", "wetlands", "tidal", "salinity")


def hydrology_from_cache(npz) -> HydrologyResult:
    return HydrologyResult(**{name: npz[name] for name in _NPZ_FIELDS})


def resolve(npz_path: Path):
    """Return ``(old_regions, new_regions, stats)`` for the cached hydrology."""
    npz = np.load(npz_path)
    result = compute_regions(npz["conditioned"], hydrology_from_cache(npz),
                             RAW_METRES_PER_SAMPLE * STEP * HSCALE)
    return npz["regions"], result.regions, result.stats


def write_region_png(regions: np.ndarray, path: Path) -> None:
    """Same encoding as `compile_hydrology`: class colour at alpha 120, ocean
    (class 0) left fully transparent."""
    img = np.zeros((*regions.shape, 4), dtype=np.uint8)
    for class_id, (_name, colour) in REGION_CLASSES.items():
        if class_id == 0:
            continue
        img[regions == class_id] = (*colour, 120)
    Image.fromarray(img).save(path)


def update_meta(stats: dict, path: Path) -> None:
    """Rewrite the region-dependent blocks of `hydrology-meta.json` in place."""
    from .regions import CLIMATE

    meta = json.loads(path.read_text())
    meta["regionsLegend"] = {str(cid): {"name": name, "rgb": list(colour)}
                             for cid, (name, colour) in REGION_CLASSES.items()}
    meta["climateProfiles"] = {REGION_CLASSES[cid][0]: prof
                               for cid, prof in CLIMATE.items()}
    meta["regionFractions"] = stats["regionFractions"]
    path.write_text(json.dumps(meta, indent=2) + "\n")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("npz", type=Path)
    ap.add_argument("--expect-retired", type=int, nargs="*", default=[],
                    help="class ids being retired; every changed pixel must "
                         "currently hold one of these")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()

    old, new, stats = resolve(args.npz)
    changed = new != old
    print(f"changed pixels: {int(changed.sum())}")
    for was in sorted(np.unique(old[changed]).tolist()):
        became = collections.Counter(new[changed & (old == was)].tolist())
        print(f"  {was} ({REGION_CLASSES.get(was, ('retired',))[0]}) -> "
              + ", ".join(f"{k}={v}" for k, v in sorted(became.items())))

    unexpected = int((changed & ~np.isin(old, args.expect_retired)).sum())
    if unexpected:
        raise SystemExit(f"REFUSING: {unexpected} changed pixels are outside "
                         f"the retired classes {args.expect_retired}")
    unmatched = int(np.isin(new, list(REGION_CLASSES), invert=True).sum())
    if unmatched:
        raise SystemExit(f"REFUSING: {unmatched} pixels hold no known class")

    if not args.apply:
        print("dry run; pass --apply to write")
        return

    write_region_png(new, PROVINCE / "hydro-regions.png")
    cache = dict(np.load(args.npz))
    cache["regions"] = new
    np.savez_compressed(args.npz, **cache)
    update_meta(stats, PROVINCE / "hydrology-meta.json")
    print("wrote hydro-regions.png, hydrology-meta.json and the npz cache")


if __name__ == "__main__":
    main()
