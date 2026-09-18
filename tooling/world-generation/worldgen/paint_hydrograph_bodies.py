"""Repaint the studio's `hydrograph-bodies` overlay FROM THE COMPILED RECORD.

The overlay `derive` writes (`hydrology_graph.write_layers`) paints the coarse
sea MASK and then gives a whole 8-connected sea-level piece the kind of the one
body inside it, so it showed 74.9 ha of lagoon against the record's 8.5 ha and
only 73.5 ha of swamp against 213 ha. That painter sits above the freeze gate
and is never re-run. This script refreshes the layer below the gate from what
actually shipped: `water/water-id.png` joined to `water-meta.json` entity kinds
through `water_report.ShippedWater`, nearest-downsampled to the overlay grid.

Bodies draw at alpha 200 in `hydrology_graph.BODY_COLOUR`, the ocean at 120 (as
before); reach kinds are not drawn at all — the rivers layer is theirs.

    python3 -m worldgen.paint_hydrograph_bodies [--out PATH] [--check]
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image

from .hydrology_graph import BODY_COLOUR, STEP
from .scale import RAW_M
from .water_report import ShippedWater

REPO_ROOT = Path(__file__).resolve().parents[3]
OVERLAY_PATH = REPO_ROOT / "apps" / "world-studio" / "public" / "province" / "hydrograph-bodies.png"
OVERLAY_N = 1345
COARSE_M_PER_PX = RAW_M * STEP      # the overlay grid the studio expects
OCEAN_ALPHA = 120
BODY_ALPHA = 200


def paint(water: ShippedWater | None = None, n: int = OVERLAY_N) -> np.ndarray:
    """RGBA array of the overlay, painted from the shipped id raster."""
    w = water if water is not None else ShippedWater()
    kinds = w.kind_index_grid()
    if kinds is None:
        raise SystemExit("no compiled water id raster to paint from")
    names = w.kind_names()
    # nearest downsample: overlay pixel centre -> source texel
    src = np.minimum((np.arange(n) + 0.5) * kinds.shape[0] / n, kinds.shape[0] - 1).astype(np.int32)
    coarse = kinds[np.ix_(src, src)]
    lut = np.zeros((len(names), 4), dtype=np.uint8)
    for i, name in enumerate(names):
        rgb = BODY_COLOUR.get(name)
        if rgb is None:          # "none" and every reach kind: the rivers layer
            continue
        lut[i] = (*rgb, OCEAN_ALPHA if name == "ocean" else BODY_ALPHA)
    return lut[coarse]


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", type=Path, default=OVERLAY_PATH)
    ap.add_argument("--check", action="store_true",
                    help="report the per-kind hectares without writing")
    args = ap.parse_args(argv)
    arr = paint()
    px_ha = (COARSE_M_PER_PX ** 2) / 10000.0
    for name, rgb in BODY_COLOUR.items():
        hit = (arr[..., 0] == rgb[0]) & (arr[..., 1] == rgb[1]) & (arr[..., 2] == rgb[2]) & (arr[..., 3] > 0)
        n_px = int(hit.sum())
        if n_px:
            print(f"{name:14s} {n_px * px_ha:9.1f} ha")
    if not args.check:
        Image.fromarray(arr, "RGBA").save(args.out)
        print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
