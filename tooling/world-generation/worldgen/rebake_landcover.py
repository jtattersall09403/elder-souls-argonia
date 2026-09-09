"""Re-bake the ground-material control map water-aware (Phase 8b round 2).

Re-runs `compile_ground_control` over the refined terrain with the compiled
water surface (`water-pass1.npz` w2) as the LOCAL water level, so mountain
tarns, high rivers and marsh pools get silt/mud beds and shoreline grammar
instead of dry-land paint. Standalone so the (slow) full refine_province run
isn't needed after a water recompile.

Differences vs the in-refine bake: a fresh rng(SEED) (noise fields re-draw —
same character, different lattice) and portage boardwalk tracks are not
painted (they return with the next full refine_province run).

NOT INCREMENTAL, on purpose. The other per-tile stages take a `--footprint`
and redo only the chunks a local edit touched; this one cannot, and pretending
otherwise would ship a control map a full rebuild would not produce:

* it writes two PROVINCE-WIDE files (`ground-control.png`,
  `landcover-i16.npy`), not a tile per chunk, so there is no tile to skip;
* `compile_ground_control` is global by construction — shoreline and channel
  distance transforms, a nearest-wet-cell lookup and warped noise fields all
  read the whole grid, and a windowed re-bake gives different values at the
  window's edge; and
* its noise is drawn from one `default_rng(SEED)` stream over the full raster,
  so re-drawing a window is not the same draw.

Its ~38 s is therefore a floor on any rebuild, alongside `compile_water`'s
province-wide flood solve. Both are cheap next to the 153 s refine the
footprint path removes.

Usage: python3 -m worldgen.rebake_landcover
"""

from __future__ import annotations

import numpy as np
from PIL import Image
from scipy import ndimage

from .compile_chunks import DEFAULT_HEIGHTS
from .landcover import compile_ground_control
from .refine_province import REPO_ROOT, SEED, STEP, rasterize_roads
from .routes_raster import rasterize_minor_paint
from .scale import RAW_M

STUDIO_DIR = REPO_ROOT / "apps" / "world-studio" / "public" / "province" / "refined"


def main() -> None:
    vault_dir = DEFAULT_HEIGHTS.parent
    h = np.load(DEFAULT_HEIGHTS).astype(np.float32)
    npz = np.load(vault_dir.parent / "hydrology-pass1.npz")
    water = np.load(vault_dir.parent / "water-pass1.npz")

    def up(a):
        return ndimage.zoom(a.astype(np.float32), h.shape[0] / a.shape[0], order=1)[: h.shape[0], : h.shape[1]]

    rng = np.random.default_rng(SEED)
    gy, gx = np.gradient(h, RAW_M)
    slope_f = np.hypot(gx, gy).astype(np.float32)
    del gy, gx
    v_frac = np.broadcast_to(
        (np.arange(h.shape[0], dtype=np.float32) / h.shape[0])[:, None], h.shape)
    roads = rasterize_roads(h.shape, (0, 0))
    minor = rasterize_minor_paint(h.shape, STEP, (0, 0))
    w4 = up(water["w2"])

    landcover_mat, control = compile_ground_control(
        h, up(npz["regions"]).round().astype(np.uint8),
        up(npz["rivers"]).round().astype(np.uint8), slope_f, RAW_M, rng,
        salinity=up(npz["salinity"]), twi=up(npz["twi"]),
        wetlands=up(npz["wetlands"]) > 0.5, roads=roads, minor_routes=minor, v_frac=v_frac,
        water_level=w4)
    Image.fromarray(control, "RGBA").save(STUDIO_DIR / "ground-control.png")
    np.save(vault_dir / "landcover-i16.npy", landcover_mat)
    wet_frac = float((h < w4 + 0.05).mean())
    print(f"rebaked ground-control (water-aware): wet frac {wet_frac:.3f}")


if __name__ == "__main__":
    main()
