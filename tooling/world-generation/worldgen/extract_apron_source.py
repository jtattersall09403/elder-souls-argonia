"""Cut the all-Tamriel heightmap's two apron crops into the vault (16d B1).

One-off, run by hand, never a chain stage: the 670 MB PNG decode lives here
so `build_border_apron` (the chain stage) reads two small float32 arrays and
runs in seconds. Idempotent: same PNG, same outputs, byte for byte.

The province is a 1:1 cut of `TamrielBeta_10_2016_01_prepped.png` (measured
2026-09-15, brief 16d "Starting state"): the province's south-west sample is
PNG (row 3393, col 11788), 1 px = 1 sample = 1.82784 m, and
`metres = 0.017093 * u - 91.745`. The PNG is stored south-up (row 0 = south)
like the raw ESP heightfield; both are flipped to north-up here, the frame
`DEFAULT_HEIGHTS` uses.

Outputs, under `$VAULT/province-refined/`:

* `apron-source-near.npy` — the ring-1 box at 1.82784 m: PNG rows
  3393-640 .. 3393+4032+640 and cols 11788-640 .. 11788+4032+640 inclusive
  (5313 x 5313, float32 metres, north-up; the province is the central 4033²);
* `apron-source-far.npz` — the whole PNG as 64 x 64 block means (256 rows x
  320 cols, 116.98 m per sample, north-up; sample (0, 0) is the block whose
  north-west corner is PNG row 16383 / col 0), `height` float32 metres and
  `valid` bool (False where the block was entirely zero: no data);
* `apron-source.json` — the PNG's SHA-256, the registration, the fit and
  the two output SHA-256s.

Asserts the central 4033² of the near crop matches the raw ESP heightfield
(`$VAULT/heightfield-f32.npy`, flipped) with rmse < 4 m and r > 0.99.

Usage: python3 -m worldgen.extract_apron_source [--png PATH]
"""

from __future__ import annotations

import argparse
import hashlib
import json
import time
from pathlib import Path

import numpy as np
from PIL import Image

from .vault import HEIGHTFIELD_DIR, asset_pipeline_root

PNG_REL = ("skyrim-source/mod-sources/all-tamriel-heightmap-573/extracted/"
           "TamrielBeta_10_2016_01_prepped.png")
PNG_SHA256 = "20c01d6cb35131da3f4d0cbdbf3f529d273f25b89d6df07bacd53ed05b1fa9fc"

# Registration (measured 2026-09-15; the brief's numbers, never re-fitted).
PNG_ROW_SW = 3393          # PNG row (south-up) of the province's south-west sample
PNG_COL_SW = 11788         # PNG col of the province's south-west sample
METRES_PER_PX = 1.82784
UNIT_TO_METRES = (0.017093, -91.745)   # metres = a * u + b
PROVINCE_SAMPLES = 4033
NEAR_PAD = 640             # ring-1 reach in samples (1169.82 m)
FAR_BLOCK = 64             # far crop block size in px (116.98 m)

OUT_DIR = HEIGHTFIELD_DIR / "province-refined"
NEAR_PATH = OUT_DIR / "apron-source-near.npy"
FAR_PATH = OUT_DIR / "apron-source-far.npz"
META_PATH = OUT_DIR / "apron-source.json"


def sha256_of(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 24), b""):
            h.update(block)
    return h.hexdigest()


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--png", type=Path, default=asset_pipeline_root() / PNG_REL)
    args = ap.parse_args()

    t0 = time.time()
    if not args.png.exists():
        raise SystemExit(f"all-Tamriel heightmap PNG not found at {args.png}; "
                         "extract it from the vault's 7z first (brief 16d, Starting state)")
    png_sha = sha256_of(args.png)
    if png_sha != PNG_SHA256:
        raise SystemExit(f"PNG sha256 {png_sha} != expected {PNG_SHA256}: the registration "
                         "below is measured on the expected file")
    Image.MAX_IMAGE_PIXELS = None
    u = np.asarray(Image.open(args.png), dtype=np.uint16)
    print(f"decoded {u.shape[1]}x{u.shape[0]} u16 in {time.time() - t0:.1f}s")
    if u.shape != (16384, 20480):
        raise SystemExit(f"unexpected PNG shape {u.shape}")
    a, b = UNIT_TO_METRES

    # Near crop, south-up rows then flipped so row 0 is north.
    r0, r1 = PNG_ROW_SW - NEAR_PAD, PNG_ROW_SW + PROVINCE_SAMPLES - 1 + NEAR_PAD
    c0, c1 = PNG_COL_SW - NEAR_PAD, PNG_COL_SW + PROVINCE_SAMPLES - 1 + NEAR_PAD
    near = np.flipud(u[r0:r1 + 1, c0:c1 + 1]).astype(np.float32) * np.float32(a) + np.float32(b)
    assert near.shape == (PROVINCE_SAMPLES + 2 * NEAR_PAD,) * 2, near.shape

    # Far crop: 64x64 block means of the whole map, north-up.
    flipped = np.flipud(u)
    ny, nx = flipped.shape[0] // FAR_BLOCK, flipped.shape[1] // FAR_BLOCK
    blocks = flipped.reshape(ny, FAR_BLOCK, nx, FAR_BLOCK)
    valid = blocks.max(axis=(1, 3)) > 0
    far = (blocks.mean(axis=(1, 3), dtype=np.float64) * a + b).astype(np.float32)
    del blocks, flipped, u

    # Registration check against the raw ESP heightfield (south-up, like the PNG).
    raw = np.flipud(np.load(HEIGHTFIELD_DIR / "heightfield-f32.npy")).astype(np.float32)
    centre = near[NEAR_PAD:NEAR_PAD + PROVINCE_SAMPLES, NEAR_PAD:NEAR_PAD + PROVINCE_SAMPLES]
    rmse = float(np.sqrt(np.mean((centre - raw) ** 2)))
    r = float(np.corrcoef(centre.ravel(), raw.ravel())[0, 1])
    print(f"near crop vs raw ESP heightfield: rmse {rmse:.2f} m, r {r:.4f}")
    assert rmse < 4.0 and r > 0.99, f"registration failed: rmse {rmse:.2f} m, r {r:.4f}"

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    np.save(NEAR_PATH, near)
    np.savez(FAR_PATH, height=far, valid=valid)
    meta = {
        "schemaVersion": 1,
        "png": PNG_REL,
        "pngSha256": png_sha,
        "registration": {"pngRow": PNG_ROW_SW, "pngCol": PNG_COL_SW,
                         "metresPerPx": METRES_PER_PX, "unitToMetres": list(UNIT_TO_METRES),
                         "storedSouthUp": True},
        "check": {"rmseM": round(rmse, 3), "r": round(r, 5)},
        "near": {"file": NEAR_PATH.name, "shape": list(near.shape), "pad": NEAR_PAD,
                 "sha256": sha256_of(NEAR_PATH)},
        "far": {"file": FAR_PATH.name, "shape": list(far.shape), "blockPx": FAR_BLOCK,
                "nodataBlocks": int((~valid).sum()), "sha256": sha256_of(FAR_PATH)},
    }
    META_PATH.write_text(json.dumps(meta, indent=1) + "\n")
    print(f"wrote {NEAR_PATH.name}, {FAR_PATH.name}, {META_PATH.name} "
          f"({(~valid).sum()} nodata far blocks) in {time.time() - t0:.1f}s")


if __name__ == "__main__":
    main()
