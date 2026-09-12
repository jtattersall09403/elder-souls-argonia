"""Apply the typed terrain patches to the frozen base (Phase 16b).

    python3 -m worldgen.apply_terrain_patches

Reads `refined-height-frozen-f32.npy` (never written after the freeze gate),
`world/sources/terrain/terrain-patches.json` and the frozen water the graph
derive left beside it, applies every patch in (order, id) order through
`terrain_patches.apply_all` — refusing any that fails an invariant — and
writes the NATURAL ground the rest of the chain builds on:
`refined-height-f32.npy` (route grading and pads then edit that file as
they always did), the studio's half-res height raster, the flood states,
`meta.json`, the terrain-request plan / fulfilments / stats for
`terrain_request_postconditions` (over the APPLIED requests; refused ones are
listed in `terrain-patches-applied.json` for 16g), and `chain-footprint.json`
— the changed region the per-tile stages downstream restrict themselves to.

Restarting from the frozen array is what makes this stage cheap: one patch
edit costs this stage and the tiles it touches, never a province rebuild.
"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

from . import footprint as fp
from . import freeze
from . import terrain_patches as tp
from .carve_province import FROZEN_PATH, VAULT_DIR
from .compile_chunks import DEFAULT_HEIGHTS
from .scale import RAW_M
from .shape_province import STUDIO_DIR
from .vault import HEIGHTFIELD_DIR

CHAIN_FOOTPRINT = VAULT_DIR / "chain-footprint.json"
WET_RISE_M = 1.4


def _atomic_json(path: Path, value) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(value, handle, indent=2, ensure_ascii=False, sort_keys=True)
            handle.write("\n")
        os.replace(temp_name, path)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)


def write_height_raster(h: np.ndarray):
    """The studio's half-res RG16 height raster; returns (lo, hi, shape).
    Low-passed before decimation (naive [::2] aliased the finest relief
    octave into moiré)."""
    half = ndimage.gaussian_filter(h, 1.0)[::2, ::2]
    lo, hi = float(half.min()), float(half.max())
    q = np.round((half - lo) / (hi - lo) * 65535.0).astype(np.uint16)
    rg = np.zeros((*q.shape, 3), dtype=np.uint8)
    rg[..., 0] = q >> 8
    rg[..., 1] = q & 0xFF
    STUDIO_DIR.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rg).save(STUDIO_DIR / "height-rg.png")
    return lo, hi, tuple(int(v) for v in q.shape)


def write_flood_states(h: np.ndarray) -> None:
    """Flood states (§36 FloodBasin + climatology) for the given ground."""
    current_water = h < 0.05
    below = h < 0.05 + WET_RISE_M
    lbl, _ = ndimage.label(below)
    wet_ids = np.unique(lbl[current_water])
    inund = np.isin(lbl, wet_ids[wet_ids > 0])
    newly = inund & ~current_water
    STUDIO_DIR.mkdir(parents=True, exist_ok=True)
    Image.fromarray((newly[::2, ::2] * 255).astype(np.uint8)).save(STUDIO_DIR / "flood-wet.png")
    (STUDIO_DIR / "flood-states.json").write_text(json.dumps({
        "basins": [{
            "id": "province-fresh", "meanLevelM": 0.0,
            "seasonalAmplitudeM": WET_RISE_M, "tidalAmplitudeM": 0.5,
            "surgeProfile": "monsoon-pulse-lagged",
            "inundationMask": "flood-wet.png",
            "note": "flood pulse lags the rains 1-2 months (docs/research/world-terrain/black-marsh-climatology.md)",
        }],
        "wetSeasonNewlyFloodedFracOfLand": round(float(newly.sum() / max((~current_water).sum(), 1)), 4),
    }, indent=1))


def merged_request_documents(receipts: list[dict]) -> tuple[dict, dict, list]:
    """The whole-plan documents `terrain_request_postconditions` verifies,
    assembled from the applied request patches' own receipts."""
    from . import terrain_requests as tr
    applied = [r for r in receipts if r["kind"] == "terrain-request" and r["status"] == "applied"]
    if not applied:
        return {}, {}, []
    records = [r["_kind_receipt"]["plan"]["requests"] for r in applied]   # unused shape guard
    plan_records = [r["_patch"]["params"]["record"] for r in applied]
    plan, errs = tr.build_plan(plan_records)
    if errs:
        raise ValueError("merged terrain-request plan: " + "; ".join(errs))
    rows = {}
    stats = []
    for r in applied:
        for row in r["_kind_receipt"]["manifest"]["fulfillments"]:
            rows[row["requestId"]] = row
        stats.extend(r["_kind_receipt"]["stats"])
    manifest = {"schemaVersion": tr.FULFILLMENT_SCHEMA_VERSION, "kind": "terrain-request-fulfillments",
                "sourceDigest": plan["sourceDigest"], "planDigest": plan["planDigest"],
                "fulfillments": [rows[q["id"]] for q in plan["requests"]]}
    errs = tr.verify_fulfillment_manifest(plan, manifest)
    if errs:
        raise ValueError("merged fulfilment manifest: " + "; ".join(errs[:5]))
    return plan, manifest, stats


def main() -> None:
    frozen = np.load(FROZEN_PATH)
    sha = freeze.sha256_of(frozen)
    if freeze.recorded(freeze.FROZEN) != sha:
        raise SystemExit(f"apply_terrain_patches: {FROZEN_PATH.name} is {sha[:16]}… but the record says "
                         f"{(freeze.recorded(freeze.FROZEN) or '?')[:16]}…; the frozen base has moved")
    patches = tp.load()
    ctx = tp.context_from_vault(HEIGHTFIELD_DIR)
    h, receipts, boxes = tp.apply_all(frozen, patches, ctx)
    by_id = {p["id"]: p for p in patches}
    for r in receipts:
        r["_patch"] = by_id[r["id"]]

    # the changed region: the applied patches, widened by what actually moved
    # against the ground the last run left (a re-frozen base moves everything)
    previous = np.load(DEFAULT_HEIGHTS) if DEFAULT_HEIGHTS.exists() else None
    measured = fp.changed_boxes(h, previous)
    footprint = fp.union(boxes, measured if measured is not None else [(0, h.shape[0], 0, h.shape[1])])
    freeze.atomic_save(DEFAULT_HEIGHTS, h)
    fp.save(CHAIN_FOOTPRINT, footprint, grid_shape=h.shape)

    plan, manifest, stats = merged_request_documents(receipts)
    fulfillment = dict(manifest)
    if fulfillment:
        fulfillment["postRefineHeightSha256"] = freeze.sha256_of(h)
        fulfillment["appliedHeightSha256"] = freeze.sha256_of(h)
    for name, doc in (("terrain-request-plan.json", plan), ("terrain-request-fulfillments.json", fulfillment),
                      ("terrain-request-stats.json", stats)):
        _atomic_json(VAULT_DIR / name, doc)
        _atomic_json(STUDIO_DIR / name, doc)
    public = [{k: v for k, v in r.items() if not k.startswith("_")} for r in receipts]
    applied_doc = {"schemaVersion": 1, "frozenSha256": sha, "naturalSha256": freeze.sha256_of(h),
                   "applied": sum(1 for r in public if r["status"] == "applied"),
                   "refused": sum(1 for r in public if r["status"] == "refused"), "patches": public}
    _atomic_json(VAULT_DIR / "terrain-patches-applied.json", applied_doc)
    _atomic_json(STUDIO_DIR / "terrain-patches-applied.json", applied_doc)

    lo, hi, q_shape = write_height_raster(h)
    write_flood_states(h)
    carve_meta = json.loads((VAULT_DIR / "carve-meta.json").read_text()) if (VAULT_DIR / "carve-meta.json").exists() else {}
    shape_meta = json.loads((HEIGHTFIELD_DIR / "shape-meta.json").read_text()) if (HEIGHTFIELD_DIR / "shape-meta.json").exists() else {}
    meta = {
        "originFullPx": [0, 0], "originM": [0.0, 0.0],
        "metresPerPixel": RAW_M * 2,
        "imageWidth": int(q_shape[1]), "imageHeight": int(q_shape[0]),
        "heightMinMetres": lo, "heightMaxMetres": hi,
        "extentKm": [round(q_shape[1] * RAW_M * 2 / 1000, 2), round(q_shape[0] * RAW_M * 2 / 1000, 2)],
        "groundControl": "ground-control.png",
        "frozen": {name: (freeze.recorded(name) or None) for name in (freeze.SCULPT, freeze.SHAPED, freeze.FROZEN)},
        "portages": shape_meta.get("portages", {}),
        "channelCarve": carve_meta.get("channelCarve", {}),
        "terrainStageBodies": carve_meta.get("terrainStageBodies", 0),
        "patches": {"applied": applied_doc["applied"], "refused": applied_doc["refused"],
                    "receipt": "terrain-patches-applied.json"},
        "terrainRequests": {
            "requests": len(plan.get("requests", [])), "operations": len(stats),
            "planDigest": plan.get("planDigest"), "fulfillment": "terrain-request-fulfillments.json",
        },
        "note": "whole province, true metres (x1 at geometry time, 0015); frozen base + typed patches; chunks via worldgen.compile_chunks",
    }
    (STUDIO_DIR / "meta.json").write_text(json.dumps(meta, indent=2))
    print(json.dumps({k: v for k, v in meta.items() if k in ("frozen", "patches", "terrainRequests", "heightMinMetres", "heightMaxMetres")}, indent=2))
    print(f"footprint: {len(footprint)} box(es) over {fp.cells(footprint, h.shape) * 100.0 / h.size:.2f}% of the province")


if __name__ == "__main__":
    main()
