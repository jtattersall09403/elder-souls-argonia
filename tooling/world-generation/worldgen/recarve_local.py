"""Re-apply the LOCAL carves without rebuilding the province.

WHAT THIS IS FOR
----------------
`refine_province` re-derives the whole 4033² province — sculpt, detail noise,
lake, portages, fluvial continuum, typed terrain requests, the channel long
profile — and only then makes two edits that touch a bounded patch of ground:
`authored_waterways.carve_authored` (a poling channel) and
`dock_dredge.dredge_docks` (a dredged dock approach). Changing one dock's hull
class used to cost the entire refine (153 s) plus every derived stage, with
every byte outside the 172 m × 12 m dredge recomputed identically.

So refine snapshots the ground at that boundary
(`refined-height-prelocal-f32.npy`) with the water solution the carves read
(`local-carve-inputs.npz`), and this stage restarts from exactly there: it
re-runs `refine_province.apply_local_carves` on the snapshot and writes the
refined heightfield the rest of the chain consumes. It starts from the same
ground the slow path ends on, so a fast run and a slow run agree — and it says
so rather than assuming it (see THE GUARD).

WHAT IT IS VALID FOR
--------------------
Edits whose whole effect on the terrain is one of those two carves:

* a blueprint dock's `hullClass`, `position` or `networkTerminals` entry;
* a line in `world/sources/routes/authored-minor-waterways.json`.

NOT valid for anything upstream of the boundary — the sculpt, the hydrology,
the region fields, the fluvial pass, the typed terrain requests, the channel
solve — and not for route geometry, because the route networks are solved
before grading and this path does not re-solve them. Those take the slow path
(`scripts/terrain-chain.sh` with no `--footprint`). The guard below refuses
rather than trusting the caller to have read this paragraph.

THE GUARD
---------
The snapshot is only the right ground if nothing upstream has moved since it
was taken. That is checkable, not assumable: the ungraded heightfield refine
last wrote (`refined-height-ungraded-f32.npy`) must equal the snapshot
everywhere OUTSIDE the footprint the carves reported last run. Any upstream
change — a re-sculpt, a hand edit, a stale snapshot from a different terrain —
shows up as a differing cell outside that footprint, and this stage exits
non-zero telling you to run the full chain.

WHAT IT WRITES
--------------
Everything `refine_province` writes that depends on the carved ground and that
no later stage regenerates: the refined heightfield, the studio half-res
height raster, `meta.json` (its height range and the channel-carve report),
the terrain-request fulfilment receipt's post-refine hash, and the flood
states. It does NOT rewrite `ground-control.png` / `landcover-i16.npy` —
`rebake_landcover` overwrites both later in the chain from the shipped ground,
so refine's copies are intermediates — nor `ground-tint.png`, whose draws use
the height grid's SHAPE only, nor `portages.json`, which is upstream.

It also writes `chain-footprint.json` beside the heights: the changed region
the per-tile stages downstream (`compile_chunks`, `export_web_chunks`,
`compile_scatter`) restrict themselves to.

Usage:
  python3 -m worldgen.recarve_local
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import numpy as np

from . import footprint as fp
from .compile_chunks import DEFAULT_HEIGHTS
from .refine_province import (STUDIO_DIR, apply_local_carves, write_flood_states,
                              write_height_raster)
from .scale import RAW_M

VAULT_DIR = DEFAULT_HEIGHTS.parent
PRELOCAL = VAULT_DIR / "refined-height-prelocal-f32.npy"
CARVE_INPUTS = VAULT_DIR / "local-carve-inputs.npz"
UNGRADED = VAULT_DIR / "refined-height-ungraded-f32.npy"
CARVE_FOOTPRINT = VAULT_DIR / "local-carve-footprint.json"
CHAIN_FOOTPRINT = VAULT_DIR / "chain-footprint.json"
CHANNELS_SOLUTION = VAULT_DIR / "channels-pass1.npz"
FULFILMENTS = "terrain-request-fulfillments.json"


class NotApplicable(SystemExit):
    """The fast path cannot honestly be taken; the message says why."""

    def __init__(self, why: str) -> None:
        super().__init__(f"recarve_local: {why}\n"
                         f"  -> run the full chain: ./scripts/terrain-chain.sh")


def _require(path: Path) -> Path:
    if not path.exists():
        raise NotApplicable(f"{path.name} is missing — no refine has left a "
                            f"snapshot at the local-carve boundary")
    return path


def check_upstream_unchanged(prelocal: np.ndarray, ungraded: np.ndarray,
                             old_boxes) -> None:
    """Refuse unless the only difference from the snapshot is the old carves.

    `refined-height-ungraded-f32.npy` is what the last `refine_province` run
    produced. It differs from the pre-local snapshot exactly where the local
    carves cut. A differing cell anywhere else means something upstream of the
    boundary moved, and the snapshot is no longer the ground the slow path
    would start from.
    """
    if prelocal.shape != ungraded.shape:
        raise NotApplicable(
            f"snapshot is {prelocal.shape} and the refined heightfield is "
            f"{ungraded.shape} — different terrain")
    outside = ungraded != prelocal
    outside &= ~fp.mask(old_boxes, prelocal.shape)
    stray = int(outside.sum())
    if stray:
        ys, xs = np.nonzero(outside)
        raise NotApplicable(
            f"{stray} samples differ from the pre-local snapshot OUTSIDE the "
            f"footprint the carves reported (first at sample "
            f"[{ys[0]}, {xs[0]}]) — something upstream of the local carves "
            f"changed, so a fast re-carve would not agree with a full rebuild")


def _post_carve_stats(h: np.ndarray) -> dict:
    """Refine's own self-consistency report, recomputed on the new ground.

    The compiler floods THIS terrain and keeps the saved profile; a lake the
    trench breached shows here as a pooled station whose flood level moved.
    The numbers go into `meta.json`'s channel-carve report, so a fast run's
    meta has to carry the same ones a full run would.
    """
    from . import channels
    from . import standing_water as sw
    sol = channels.ChannelSolution.load(_require(CHANNELS_SOLUTION))
    npz = np.load(VAULT_DIR.parent / "hydrology-pass1.npz")
    placement = sw.load_placement(VAULT_DIR / "placement-at-carve.npz")
    bodies2 = sw.solve_bodies(h, npz, step=3, mpp=RAW_M, placement=placement)
    pooled = sol.pooled & ~sol.shore
    iy = np.clip(np.round(sol.y[pooled]).astype(int), 0, h.shape[0] - 1)
    ix = np.clip(np.round(sol.x[pooled]).astype(int), 0, h.shape[1] - 1)
    lvl2 = np.nan_to_num(bodies2.level_with_sea[iy, ix], nan=-np.inf, neginf=-np.inf)
    delta = np.abs(lvl2 - sol.pool[pooled])
    return {
        "pooledLevelMoved": int((delta > 0.1).sum()),
        "pooledLevelMovedMaxM": (round(float(delta[np.isfinite(lvl2)].max()), 3)
                                 if np.isfinite(lvl2).any() else 0.0),
        "pooledLevelLost": int((~np.isfinite(lvl2)).sum()),
    }


def _rewrite_meta(lo: float, hi: float, q_shape, channel_stats: dict) -> None:
    """Put `meta.json` back into the state a fresh refine leaves it in.

    Only the height range, the image size and the channel-carve report depend
    on the carved ground; everything else in the file (portage counts,
    terrain-request digest, extents) is upstream of the boundary and is kept
    exactly as it stands. `naturalHeight` is dropped because refine does not
    write it — `grade_routes` adds it back in the same chain position it
    always did, so the file a fast run ends with is the file a full run ends
    with, key order included.
    """
    path = STUDIO_DIR / "meta.json"
    meta = json.loads(path.read_text())
    meta.pop("naturalHeight", None)
    meta["heightMinMetres"], meta["heightMaxMetres"] = lo, hi
    meta["imageWidth"], meta["imageHeight"] = int(q_shape[1]), int(q_shape[0])
    meta["extentKm"] = [round(q_shape[1] * RAW_M * 2 / 1000, 2),
                        round(q_shape[0] * RAW_M * 2 / 1000, 2)]
    meta["channelCarve"] = channel_stats
    path.write_text(json.dumps(meta, indent=2))


def _rewrite_fulfilments(h: np.ndarray) -> None:
    """Refresh the post-refine height hash in the terrain-request receipt.

    It is an operation receipt for the raster refine ended on; the fast path
    ends on a different raster, so leaving the old hash would make the receipt
    describe ground that no longer exists (engineering standard 12).
    """
    digest = hashlib.sha256(h.tobytes()).hexdigest()
    for directory in (VAULT_DIR, STUDIO_DIR):
        path = directory / FULFILMENTS
        if not path.exists():
            continue
        doc = json.loads(path.read_text())
        doc["postRefineHeightSha256"] = digest
        path.write_text(json.dumps(doc, indent=2, ensure_ascii=False,
                                   sort_keys=True) + "\n")


def main() -> None:
    if len(sys.argv) > 1:
        raise SystemExit(__doc__)
    prelocal = np.load(_require(PRELOCAL))
    inputs = np.load(_require(CARVE_INPUTS))
    ungraded = np.load(_require(UNGRADED))
    old_boxes = fp.load(CARVE_FOOTPRINT)
    check_upstream_unchanged(prelocal, ungraded, old_boxes)

    from . import channels
    sol = channels.ChannelSolution.load(_require(CHANNELS_SOLUTION))
    h, authored_stats, dredge_stats, new_boxes = apply_local_carves(
        prelocal.copy(), inputs["level_with_sea"], inputs["wet"],
        (sol.y, sol.x, sol.L), log=print)

    # The footprint the chain acts on is MEASURED (where the new ground
    # differs from the last run's), then widened by the boxes both runs
    # reported. A measured region cannot under-report; the boxes cover the
    # case where a carve moved without changing a single sample's value.
    measured = fp.changed_boxes(h, ungraded)
    boxes = fp.union(old_boxes, new_boxes, measured if measured is not None else [])
    changed_cells = int((h != ungraded).sum())

    np.save(DEFAULT_HEIGHTS, h)
    lo, hi, q_shape = write_height_raster(h)
    channel_stats = dict(json.loads((STUDIO_DIR / "meta.json").read_text())
                         .get("channelCarve", {}))
    channel_stats["authoredWaterways"] = authored_stats
    channel_stats["dockApproaches"] = dredge_stats
    channel_stats.update(_post_carve_stats(h))
    _rewrite_meta(lo, hi, q_shape, channel_stats)
    _rewrite_fulfilments(h)
    write_flood_states(h)
    fp.save(CARVE_FOOTPRINT, new_boxes, grid_shape=h.shape)
    fp.save(CHAIN_FOOTPRINT, boxes, grid_shape=h.shape)
    print(f"recarve: {changed_cells} samples changed, footprint {len(boxes)} "
          f"box(es) over {fp.cells(boxes, h.shape)} samples "
          f"({fp.cells(boxes, h.shape) * 100.0 / h.size:.4f}% of the province)")


if __name__ == "__main__":
    main()
