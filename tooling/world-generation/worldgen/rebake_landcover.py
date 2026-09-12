"""Re-bake the ground-material control map water-aware (Phase 8b round 2).

Re-runs `compile_ground_control` over the refined terrain with the compiled
water surface (`water-pass1.npz` w2) as the LOCAL water level, so mountain
tarns, high rivers and marsh pools get silt/mud beds and shoreline grammar
instead of dry-land paint. Standalone so the (slow) full shape + carve run
isn't needed after a water recompile. It paints the portage drag-path tracks
too, from the shape stage's `portage-track.npy` when the vault carries one.

POSITION-SEEDED AND WINDOWABLE (Phase 16b item 6). Every noise field now comes
from `position_noise.normal_field`: its value at a sample is a function of the
absolute coordinate, the salt and the seed, never of the draw order, so a
window re-bakes the numbers the province-wide bake would have given it.

What a window still needs is a PAD, because the rest of the bake reads
neighbourhoods: Gaussian blurs (truncated at 4 sigma), shore and channel
distance transforms (clipped to their bands), local prominence. `WINDOW_PAD_M`
covers the widest-reaching term; `--window y0 y1 x0 x1` bakes the padded
window, crops it and writes it back into the existing province files.

Two terms remain genuinely global and are NOT covered by any pad: the
connected-component lake-area test (`near_big`) and the nearest-wet-cell
lookup, which both follow water bodies beyond the pad. A window whose shore
sits inside a water body larger than the window can therefore differ from the
global bake at that shore; keep windows away from big-water margins, or
re-bake whole.

Usage: python3 -m worldgen.rebake_landcover [--window y0 y1 x0 x1]
"""

from __future__ import annotations

import argparse

import os

import numpy as np
from PIL import Image
from scipy import ndimage

from .compile_chunks import DEFAULT_HEIGHTS
from .landcover import compile_ground_control
from .shape_province import REPO_ROOT, SEED, STEP
from .routes_raster import major_spanning_mask, rasterize_minor_paint, rasterize_roads
from .scale import RAW_M

STUDIO_DIR = REPO_ROOT / "apps" / "world-studio" / "public" / "province" / "refined"

# Reach of the widest neighbourhood term in landcover.py, in world metres.
# Candidates: the 130 m*TUNE shore band (43 m), the 110 m*TUNE channel band
# (37 m), the 40 px macro noise (73 m sigma -> 293 m), and the winner, the
# mountain belt-wobble noise at sigma 320 m*TUNE = 106.7 m -> 4 sigma = 427 m.
WINDOW_PAD_M = 440.0


def _bake(h, npz, water, roads, minor, origin, seed=SEED):
    gy, gx = np.gradient(h, RAW_M)
    slope_f = np.hypot(gx, gy).astype(np.float32)
    del gy, gx
    return compile_ground_control(
        h, npz["regions"], npz["rivers"], slope_f, RAW_M, origin, seed,
        salinity=npz["salinity"], twi=npz["twi"], wetlands=npz["wetlands"],
        roads=roads, minor_routes=minor, v_frac=npz["v_frac"],
        water_level=water)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--window", nargs=4, type=int, metavar=("Y0", "Y1", "X0", "X1"),
                    help="bake only this sample window (padded by WINDOW_PAD_M)")
    args = ap.parse_args()

    vault_dir = DEFAULT_HEIGHTS.parent
    h = np.load(DEFAULT_HEIGHTS).astype(np.float32)
    npz_raw = np.load(vault_dir.parent / "hydrology-pass1.npz")
    # The compiled water is the LOCAL water level for the shore grammar when
    # the water stage is on the chain's ladder for this run (CHAIN_ENABLED,
    # exported by terrain-chain.sh) and its file exists; otherwise the bake
    # runs sea-level only, as it did before Phase 8b — a ground-only build
    # (Phase 16b) paints no shoreline from water that was not compiled on it.
    enabled = os.environ.get("CHAIN_ENABLED")
    water_path = vault_dir.parent / "water-pass1.npz"
    use_water = water_path.exists() and (enabled is None or "compile_water" in enabled.split())
    water = np.load(water_path) if use_water else None
    print("rebake: water-aware" if use_water else "rebake: sea level only (no compiled water on this ladder)")

    def up(a):
        return ndimage.zoom(a.astype(np.float32), h.shape[0] / a.shape[0], order=1)[: h.shape[0], : h.shape[1]]

    fields = dict(
        regions=up(npz_raw["regions"]).round().astype(np.uint8),
        rivers=up(npz_raw["rivers"]).round().astype(np.uint8),
        salinity=up(npz_raw["salinity"]),
        twi=up(npz_raw["twi"]),
        wetlands=up(npz_raw["wetlands"]) > 0.5,
        v_frac=np.broadcast_to(
            (np.arange(h.shape[0], dtype=np.float32) / h.shape[0])[:, None], h.shape).copy(),
    )
    w4 = up(water["w2"]) if water is not None else None
    # Ground carried clear by a bridge/deck gets no road surface painted on it.
    roads = rasterize_roads(h.shape, (0, 0)) & ~major_spanning_mask(h.shape, STEP, (0, 0))
    portage = vault_dir / "portage-track.npy"
    if portage.exists():
        roads = roads | np.load(portage).astype(bool)
    minor = rasterize_minor_paint(h.shape, STEP, (0, 0))

    if args.window is None:
        mat, control = _bake(h, fields, w4, roads, minor, (0, 0))
        Image.fromarray(control, "RGBA").save(STUDIO_DIR / "ground-control.png")
        np.save(vault_dir / "landcover-i16.npy", mat)
        wet_frac = float((h < (w4 if w4 is not None else 0.0) + 0.05).mean())
        print(f"rebaked ground-control (water-aware): wet frac {wet_frac:.3f}")
        return

    y0, y1, x0, x1 = args.window
    pad = int(np.ceil(WINDOW_PAD_M / RAW_M))
    py0, py1 = max(0, y0 - pad), min(h.shape[0], y1 + pad)
    px0, px1 = max(0, x0 - pad), min(h.shape[1], x1 + pad)
    sl = (slice(py0, py1), slice(px0, px1))
    mat, control = _bake(h[sl], {k: v[sl] for k, v in fields.items()}, w4[sl],
                         roads[sl], minor[sl], (py0, px0))
    inner = (slice(y0 - py0, y1 - py0), slice(x0 - px0, x1 - px0))
    img = np.asarray(Image.open(STUDIO_DIR / "ground-control.png").convert("RGBA")).copy()
    img[y0:y1, x0:x1] = control[inner]
    Image.fromarray(img, "RGBA").save(STUDIO_DIR / "ground-control.png")
    full = np.load(vault_dir / "landcover-i16.npy")
    full[y0:y1, x0:x1] = mat[inner]
    np.save(vault_dir / "landcover-i16.npy", full)
    print(f"rebaked window y{y0}:{y1} x{x0}:{x1} (pad {pad} px / {WINDOW_PAD_M:.0f} m)")


if __name__ == "__main__":
    main()
