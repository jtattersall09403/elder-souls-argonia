"""Re-bake the ground-material control map water-aware (Phase 8b round 2).

Re-runs `compile_ground_control` over the refined terrain with the compiled
water surface (`water-pass1.npz` w2) as the LOCAL water level, so mountain
tarns, high rivers and marsh pools get silt/mud beds and shoreline grammar
instead of dry-land paint. Standalone so the (slow) full refine_province run
isn't needed after a water recompile.

Differences vs the in-refine bake: a fresh rng(SEED) (noise fields re-draw —
same character, different lattice) and portage boardwalk tracks are not
painted (they return with the next full refine_province run).

Usage: python3 -m worldgen.rebake_landcover
"""

from __future__ import annotations

import numpy as np
from PIL import Image
from scipy import ndimage

from .compile_chunks import DEFAULT_HEIGHTS
from .landcover import compile_ground_control
from .refine_province import REPO_ROOT, SEED, rasterize_roads
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
    w4 = up(water["w2"])

    landcover_mat, control = compile_ground_control(
        h, up(npz["regions"]).round().astype(np.uint8),
        up(npz["rivers"]).round().astype(np.uint8), slope_f, RAW_M, rng,
        salinity=up(npz["salinity"]), twi=up(npz["twi"]),
        wetlands=up(npz["wetlands"]) > 0.5, roads=roads, v_frac=v_frac,
        water_level=w4)
    Image.fromarray(control, "RGBA").save(STUDIO_DIR / "ground-control.png")
    np.save(vault_dir / "landcover-i16.npy", landcover_mat)
    wet_frac = float((h < w4 + 0.05).mean())
    print(f"rebaked ground-control (water-aware): wet frac {wet_frac:.3f}")


if __name__ == "__main__":
    main()
