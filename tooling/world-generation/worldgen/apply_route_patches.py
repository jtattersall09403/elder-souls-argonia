"""Apply the route-grade patches: natural ground in, graded ground out (16e).

    cd tooling/world-generation
    python3 -m worldgen.apply_route_patches
    python3 -m worldgen.apply_route_patches --out DIR   # dry run into DIR (gate it with patch_water --graded --in DIR)

Reads `refined-height-natural-f32.npy` (the frozen base plus the place
patches, written by `apply_terrain_patches` and never touched here) and
`world/sources/terrain/route-grade-patches.json` (authored by `grade_routes`
from that same array), applies every patch through `terrain_patches.apply_all`
with the same invariants the 16b stage uses, and writes
`refined-height-f32.npy` — the ground every downstream stage (chunks, water
proof, structures, land cover, scatter, settlements) builds on. The receipt
`route-grade-applied.json` has the shape of `terrain-patches-applied.json`
so `patch_water --graded` proves the grading moved no water.

A refused patch is a hard error: `grade_routes` proved each one on a scratch
window before writing it, so a refusal here means the natural ground moved
under the patches (re-run the grader) or the two stages disagree (a bug).
The chain footprint is widened by the applied regions and by what actually
moved against the previous graded array, so the tile stages recut only what
changed.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

from . import footprint as fp
from . import freeze
from . import terrain_patches as tp
from .apply_terrain_patches import CHAIN_FOOTPRINT as NATURAL_FOOTPRINT, STUDIO_DIR, VAULT_DIR, _atomic_json
from .compile_chunks import DEFAULT_HEIGHTS, HEIGHTFIELD_DIR, NATURAL_HEIGHTS
from .grade_routes import PATCHES_PATH

RECEIPT_NAME = "route-grade-applied.json"
CHAIN_FOOTPRINT = VAULT_DIR / "chain-footprint.json"     # what compile_chunks / export_web_chunks / compile_scatter read


def apply(natural: np.ndarray, patches: list[dict], ctx: tp.Context, log=print):
    """(graded heights, receipts, applied boxes); raises on any refusal."""
    h, receipts, boxes = tp.apply_all(natural, patches, ctx, log=log)
    refused = [r for r in receipts if r["status"] != "applied"]
    if refused:
        first = refused[0]
        raise SystemExit(f"apply_route_patches: {len(refused)} route-grade patch(es) refused; first {first['id']}: "
                         f"{first.get('reason')} — the grader proved these on the natural ground, so either that "
                         f"array moved (re-run grade_routes) or the two stages disagree")
    return h, receipts, boxes


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--out", type=Path, default=None, help="dry run: write the graded array, receipt and footprint here")
    ap.add_argument("--patches", type=Path, default=PATCHES_PATH)
    args = ap.parse_args(argv)
    natural = np.load(NATURAL_HEIGHTS)
    applied = json.loads((VAULT_DIR / "terrain-patches-applied.json").read_text())
    natural_sha = freeze.sha256_of(natural)
    if applied.get("naturalSha256") != natural_sha:
        raise SystemExit("apply_route_patches: refined-height-natural-f32.npy is not the array apply_terrain_patches "
                         "wrote; a stage between them touched the natural ground")
    patches = tp.load(args.patches) if args.patches.exists() else []
    ctx = tp.context_from_vault(HEIGHTFIELD_DIR)
    ctx.structures = []        # the grader keeps its patches and structure windows disjoint by construction
    h, receipts, boxes = apply(natural, patches, ctx)
    previous = np.load(DEFAULT_HEIGHTS) if DEFAULT_HEIGHTS.exists() else None
    measured = fp.changed_boxes(h, previous)
    graded_boxes = fp.union(boxes, measured if measured is not None else [(0, h.shape[0], 0, h.shape[1])])
    public = [{k: v for k, v in r.items() if not k.startswith("_")} for r in receipts]
    receipt = {"schemaVersion": 1, "frozenSha256": natural_sha, "naturalSha256": freeze.sha256_of(h),
               "base": NATURAL_HEIGHTS.name, "output": DEFAULT_HEIGHTS.name,
               "patchesFile": str(args.patches), "applied": len(public), "refused": 0, "patches": public,
               "_": "frozenSha256 is the NATURAL array this stage started from and naturalSha256 the graded array it "
                    "wrote: the same key names as terrain-patches-applied.json so patch_water --graded reads both."}
    if args.out is not None:
        args.out.mkdir(parents=True, exist_ok=True)
        freeze.atomic_save(args.out / DEFAULT_HEIGHTS.name, h)
        _atomic_json(args.out / RECEIPT_NAME, {**receipt, "dryRun": True})
        fp.save(args.out / CHAIN_FOOTPRINT.name, graded_boxes, grid_shape=h.shape)
        print(f"dry run -> {args.out}: {len(public)} route-grade patches applied")
        return 0
    freeze.atomic_save(DEFAULT_HEIGHTS, h)
    # the footprint the tile stages read: the place patches' region (already
    # written by apply_terrain_patches this run or an earlier one) plus ours
    natural_boxes = fp.load(NATURAL_FOOTPRINT) if NATURAL_FOOTPRINT.exists() else []
    fp.save(CHAIN_FOOTPRINT, fp.union(list(natural_boxes), graded_boxes), grid_shape=h.shape)
    _atomic_json(VAULT_DIR / RECEIPT_NAME, receipt)
    _atomic_json(STUDIO_DIR / RECEIPT_NAME, receipt)
    print(f"apply_route_patches: {len(public)} route-grade patches applied -> {DEFAULT_HEIGHTS.name}; "
          f"footprint {len(graded_boxes)} box(es) over {fp.cells(graded_boxes, h.shape) * 100.0 / h.size:.2f}% of the province")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
