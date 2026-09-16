"""The water gate after the patches (Phase 16b): the bounded re-flood.

    python3 -m worldgen.patch_water
    python3 -m worldgen.patch_water --in DIR     # gate a dry run apply_terrain_patches --out DIR wrote

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
from .compile_chunks import NATURAL_HEIGHTS
from .vault import HEIGHTFIELD_DIR

RECEIPT = VAULT_DIR / "patch-water-receipt.json"


def main(argv: list[str] | None = None) -> int:
    import argparse
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--in", dest="src", type=Path, default=None,
                    help="read the natural ground and receipt from a dry-run directory (and write the receipt there)")
    ap.add_argument("--graded", action="store_true",
                    help="16e: prove the route-grade patches instead — base = the natural array, patched = the "
                         "graded refined-height-f32.npy, receipt route-grade-applied.json")
    args = ap.parse_args(argv)
    src = args.src if args.src is not None else VAULT_DIR
    receipt_name = "patch-water-graded-receipt.json" if args.graded else RECEIPT.name
    receipt_path = (src / receipt_name) if args.src is not None else (VAULT_DIR / receipt_name)
    if args.graded:
        from .compile_chunks import DEFAULT_HEIGHTS
        frozen = np.load(NATURAL_HEIGHTS)                       # the base the grading started from
        natural = np.load(src / DEFAULT_HEIGHTS.name)            # the graded ground
        applied = json.loads((src / "route-grade-applied.json").read_text())
    else:
        frozen = np.load(FROZEN_PATH)
        natural = np.load(src / NATURAL_HEIGHTS.name)
        applied = json.loads((src / "terrain-patches-applied.json").read_text())
    patches_by_id = {p["id"]: p for p in tp.load(Path(applied["patchesFile"]) if applied.get("patchesFile") else tp.PATCHES_PATH)}
    if applied["frozenSha256"] != freeze.sha256_of(frozen):
        raise SystemExit("patch_water: the receipt was written for a different base array")
    if applied["naturalSha256"] != freeze.sha256_of(natural):
        raise SystemExit("patch_water: refined-height-natural-f32.npy is not the array apply_terrain_patches wrote — "
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
    region_mask = fp.mask(regions, frozen.shape)
    applied_rows = [r for r in applied["patches"] if r["status"] == "applied"]
    per_patch = []
    for r in applied_rows:
        ry0, ry1, rx0, rx1 = r["region"]
        wy0, wy1 = max(ry0 - pad, 0), min(ry1 + pad, frozen.shape[0])
        wx0, wx1 = max(rx0 - pad, 0), min(rx1 + pad, frozen.shape[1])
        patch = patches_by_id[r["id"]]
        # the window holds the CUMULATIVE change of every applied patch whose
        # region overlaps it (each was checked alone by the applier): what
        # the gate proves is that nothing moved the water beyond their union
        overlapping = [patches_by_id[o["id"]] for o in applied_rows
                       if tp._intersects(tuple(o["region"]), (wy0, wy1, wx0, wx1))]
        bed_kinds = tp.CHANNEL_CLASS_KINDS + tp.SHOULDER_RAISE_KINDS
        width = ctx.channel_masks((wy0, wy1, wx0, wx1))[0] if any(o["kind"] in bed_kinds for o in overlapping) else None
        errs = tp.water_violations(frozen[wy0:wy1, wx0:wx1], natural[wy0:wy1, wx0:wx1],
                                   ctx.level[wy0:wy1, wx0:wx1],
                                   region_mask[wy0:wy1, wx0:wx1],
                                   any(bool(o.get("makesWater")) for o in overlapping),
                                   any(tp.dries_body_cells(o) for o in overlapping), channel_width=width)
        per_patch.append({"id": r["id"], "waterViolations": errs})
        problems += [f"{r['id']}: {e}" for e in errs]
    receipt = {"schemaVersion": 1, "frozenSha256": applied["frozenSha256"], "naturalSha256": applied["naturalSha256"],
               "graded": bool(args.graded),
               "status": "pass" if not problems else "fail", "problems": problems, "patches": per_patch}
    receipt_path.write_text(json.dumps(receipt, indent=1) + "\n")
    print(f"patch_water: {receipt['status']} — {len(per_patch)} applied patches re-flooded, {len(problems)} problems")
    for p in problems[:10]:
        print("  " + p)
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
