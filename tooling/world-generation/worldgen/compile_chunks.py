"""Phase 6 deliverable: chunked terrain + LOD + collision data for the
refined watershed.

Splits the refined full-resolution height grid (true metres, ~5.5 m/sample)
into fixed chunks with anti-aliased LOD pyramids and writes a deterministic
manifest. Consumers:

- **Collision (Phase 7)**: Rapier heightfield colliders take the LOD-0 grid
  per chunk directly (apply the ×5 vertical scale of decision 0006 when the
  data becomes geometry — the stored data stays true metres).
- **Rendering/streaming (Phases 7/14)**: LODs 1/2 are 2×/4× decimated with a
  low-pass filter (never naive slicing — that aliases, see 2026-08-23).

Each chunk edge duplicates its neighbour's first row/column (257 samples for
a 256-sample chunk) so meshes and colliders stitch without seams.

Usage:
  python3 -m worldgen.compile_chunks [refined-height-f32.npy]
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import numpy as np
from scipy import ndimage

CHUNK = 256          # samples per chunk edge (LOD0), ~1.4 km at 5.48 m
LODS = (1, 2, 4)     # decimation factors
RAW_M = 4096.0 * 0.01428 / 32.0 * 3.0
DEFAULT_HEIGHTS = Path(
    "/home/analyticalplatform/workspace/elder-souls-dev/elder-scrolls-asset-pipeline/"
    "skyrim-source/mod-sources/tamriel-worldspaces-118678/extracted/"
    "Argonia Worldspace/argonia-heightfield/province-refined/refined-height-f32.npy")
REPO_ROOT = Path(__file__).resolve().parents[3]
META_PATH = REPO_ROOT / "apps" / "world-studio" / "public" / "province" / "refined" / "meta.json"


def chunk_grid(h: np.ndarray):
    """Yield (cx, cy, lod_arrays) for every chunk; each LOD includes the
    +1 overlap row/column where available."""
    ny = (h.shape[0] + CHUNK - 1) // CHUNK
    nx = (h.shape[1] + CHUNK - 1) // CHUNK
    smoothed = {f: (h if f == 1 else ndimage.gaussian_filter(h, f * 0.5)) for f in LODS}
    for cy in range(ny):
        for cx in range(nx):
            y0, x0 = cy * CHUNK, cx * CHUNK
            y1 = min(y0 + CHUNK + 1, h.shape[0])
            x1 = min(x0 + CHUNK + 1, h.shape[1])
            lods = {}
            for f in LODS:
                lods[f] = smoothed[f][y0:y1:f, x0:x1:f].astype(np.float32)
            yield cx, cy, lods


def main() -> None:
    height_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_HEIGHTS
    h = np.load(height_path)
    out_dir = height_path.parent / "chunks"
    out_dir.mkdir(exist_ok=True)
    meta = json.loads(META_PATH.read_text())
    chunks = []
    sha = hashlib.sha256()
    for cx, cy, lods in chunk_grid(h):
        entry = {"cx": cx, "cy": cy,
                 "originM": [round(meta["originM"][0] + cx * CHUNK * RAW_M, 1),
                             round(meta["originM"][1] + cy * CHUNK * RAW_M, 1)],
                 "minM": round(float(lods[1].min()), 2),
                 "maxM": round(float(lods[1].max()), 2),
                 "lods": {}}
        for f, arr in lods.items():
            name = f"chunk_{cx}_{cy}_lod{f}.npy"
            np.save(out_dir / name, arr)
            sha.update(arr.tobytes())
            entry["lods"][str(f)] = {"file": name, "shape": list(arr.shape),
                                     "metresPerSample": round(RAW_M * f, 3)}
        chunks.append(entry)
    manifest = {
        "chunkSamples": CHUNK,
        "chunkMetres": round(CHUNK * RAW_M, 1),
        "verticalScaleAtGeometry": 5,
        "heightsAre": "true metres, y-up, sea level 0 (0003/0006)",
        "collision": "Rapier heightfield per chunk from lod1 grid (overlap row/col included for stitching)",
        "grid": [max(c["cx"] for c in chunks) + 1, max(c["cy"] for c in chunks) + 1],
        "sha256": sha.hexdigest(),
        "chunks": chunks,
    }
    (out_dir / "chunks-manifest.json").write_text(json.dumps(manifest, indent=1))
    print(f"{len(chunks)} chunks ({manifest['grid'][0]}x{manifest['grid'][1]}) -> {out_dir}")
    print("sha256", manifest["sha256"][:16])


if __name__ == "__main__":
    main()
