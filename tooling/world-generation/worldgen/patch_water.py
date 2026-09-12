"""The water gate after the patches (Phase 16b): the bounded re-flood.

    python3 -m worldgen.patch_water

Reads the frozen base, the natural ground `apply_terrain_patches` wrote and
the frozen water levels, and proves two things or exits non-zero:

1. the natural ground equals the frozen base everywhere outside the applied
   patches' regions — nothing but a typed patch has touched the base;
2. re-flooding every frozen body at its own level over the patched ground
   changes no level and no extent beyond the patch regions
   (`terrain_patches.water_violations`), so the water compile that follows
   finds exactly the bodies the graph names, plus what the patches declared.

It writes `patch-water-receipt.json` beside the heights. The province-wide
water compile still runs once after this stage; a per-window re-flood of the
shipped water rasters is 16c's compile_water reading `chain-footprint.json`.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np

from . import footprint as fp
from . import freeze
from . import terrain_patches as tp
from .carve_province import FROZEN_PATH, VAULT_DIR
from .compile_chunks import DEFAULT_HEIGHTS
from .vault import HEIGHTFIELD_DIR

RECEIPT = VAULT_DIR / "patch-water-receipt.json"


def main() -> int:
    frozen = np.load(FROZEN_PATH)
    natural = np.load(DEFAULT_HEIGHTS)
    applied = json.loads((VAULT_DIR / "terrain-patches-applied.json").read_text())
    if applied["frozenSha256"] != freeze.sha256_of(frozen):
        raise SystemExit("patch_water: the receipt was written for a different frozen base")
    if applied["naturalSha256"] != freeze.sha256_of(natural):
        raise SystemExit("patch_water: refined-height-f32.npy is not the array apply_terrain_patches wrote — "
                         "a stage between them touched the ground")
    regions = [tuple(r["region"]) for r in applied["patches"] if r["status"] == "applied"]
    outside = (natural != frozen) & ~fp.mask(regions, frozen.shape)
    problems: list[str] = []
    if outside.any():
        ys, xs = np.nonzero(outside)
        problems.append(f"{int(outside.sum())} samples differ from the frozen base outside every patch region "
                        f"(first at row {ys[0]}, col {xs[0]})")
    ctx = tp.context_from_vault(HEIGHTFIELD_DIR)
    pad = tp.WINDOW_PAD_PX
    per_patch = []
    for r in applied["patches"]:
        if r["status"] != "applied":
            continue
        ry0, ry1, rx0, rx1 = r["region"]
        wy0, wy1 = max(ry0 - pad, 0), min(ry1 + pad, frozen.shape[0])
        wx0, wx1 = max(rx0 - pad, 0), min(rx1 + pad, frozen.shape[1])
        patch = next(p for p in tp.load() if p["id"] == r["id"])
        errs = tp.water_violations(frozen[wy0:wy1, wx0:wx1], natural[wy0:wy1, wx0:wx1],
                                   ctx.level[wy0:wy1, wx0:wx1],
                                   (ry0 - wy0, ry1 - wy0, rx0 - wx0, rx1 - wx0),
                                   bool(patch.get("makesWater")))
        per_patch.append({"id": r["id"], "waterViolations": errs})
        problems += [f"{r['id']}: {e}" for e in errs]
    receipt = {"schemaVersion": 1, "frozenSha256": applied["frozenSha256"], "naturalSha256": applied["naturalSha256"],
               "status": "pass" if not problems else "fail", "problems": problems, "patches": per_patch}
    RECEIPT.write_text(json.dumps(receipt, indent=1) + "\n")
    print(f"patch_water: {receipt['status']} — {len(per_patch)} applied patches re-flooded, {len(problems)} problems")
    for p in problems[:10]:
        print("  " + p)
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
