"""Phase 6 deliverable: chunked terrain + LOD + collision data for the
refined watershed.

Splits the refined full-resolution height grid (true metres, scale.RAW_M/sample)
into fixed chunks with anti-aliased LOD pyramids and writes a deterministic
manifest. Consumers:

- **Collision (Phase 7)**: Rapier heightfield colliders take the LOD-0 grid
  per chunk directly (apply scale.VERTICAL_SCALE_AT_GEOMETRY, decision 0015, when the
  data becomes geometry — the stored data stays true metres).
- **Rendering/streaming (Phases 7/14)**: LODs 1/2 are 2×/4× decimated with a
  low-pass filter (never naive slicing — that aliases, see 2026-08-23).

Each chunk edge duplicates its neighbour's first row/column (257 samples for
a 256-sample chunk) so meshes and colliders stitch without seams.

Usage:
  python3 -m worldgen.compile_chunks [refined-height-f32.npy]
  python3 -m worldgen.compile_chunks --footprint chain-footprint.json

INCREMENTAL. With `--footprint` only the chunks that intersect the changed
region (`worldgen.footprint`) are re-cut; every other chunk file is left
untouched on disk and its manifest entry is carried over unchanged. The
footprint is not trusted blindly: the heights are diffed against the snapshot
of what was last compiled (`chunks/compiled-height-f32.npy`), and the measured
changed region is unioned in, so a footprint that under-reports widens rather
than shipping a stale tile. No snapshot means no measurement, and no
measurement means everything is recut.

The manifest's `sha256` still covers every chunk of the province, read back
from disk, so it means the same thing after an incremental run as after a full
one.
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
from pathlib import Path

import numpy as np
from scipy import ndimage

CHUNK = 256          # samples per chunk edge (LOD0), ~1.4 km at 5.48 m
LODS = (1, 2, 4)     # decimation factors
from .scale import (AUTHORED_UV_EXTENT_M, HYDRO_RASTER_EDGE_EXTENT_M, RAW_M,
                    SOURCE_GRID_SAMPLES, TERRAIN_SUPPORT_EXTENT_M,
                    VERTICAL_SCALE_AT_GEOMETRY)
REPO_ROOT = Path(__file__).resolve().parents[3]
# The asset vault is the sibling checkout (memory: analytical-platform-environment);
# never an absolute path, so another checkout or CI resolves it the same way.
VAULT_ROOT = REPO_ROOT.parent / "elder-scrolls-asset-pipeline"
_HEIGHTFIELD_REL = ("skyrim-source/mod-sources/tamriel-worldspaces-118678/extracted/"
                    "Argonia Worldspace/argonia-heightfield")
# `ES_VAULT_ROOT` points the whole chain at a COPY of the vault's
# `argonia-heightfield` folder (scratch runs, benchmarking, a second worktree
# building at the same time). Unset — the normal case — it resolves to the
# sibling asset-pipeline checkout exactly as before.
_VAULT_ENV = os.environ.get("ES_VAULT_ROOT")
HEIGHTFIELD_DIR = (Path(_VAULT_ENV).expanduser().resolve() if _VAULT_ENV
                   else VAULT_ROOT / _HEIGHTFIELD_REL)
DEFAULT_HEIGHTS = HEIGHTFIELD_DIR / "province-refined" / "refined-height-f32.npy"
META_PATH = REPO_ROOT / "apps" / "world-studio" / "public" / "province" / "refined" / "meta.json"


def chunk_grid(h: np.ndarray, wanted: set | None = None):
    """Yield (cx, cy, lod_arrays) for every chunk; each LOD includes the
    +1 overlap row/column where available.

    `wanted` restricts the yield to a set of (cx, cy). The LOD low-pass is
    still taken over the WHOLE province — it is a couple of seconds, and
    filtering a window instead would give a different answer at the window's
    edge, which is exactly the kind of near-miss an incremental path must not
    ship.
    """
    ny = (h.shape[0] + CHUNK - 1) // CHUNK
    nx = (h.shape[1] + CHUNK - 1) // CHUNK
    smoothed = {f: (h if f == 1 else ndimage.gaussian_filter(h, f * 0.5)) for f in LODS}
    for cy in range(ny):
        for cx in range(nx):
            if wanted is not None and (cx, cy) not in wanted:
                continue
            y0, x0 = cy * CHUNK, cx * CHUNK
            y1 = min(y0 + CHUNK + 1, h.shape[0])
            x1 = min(x0 + CHUNK + 1, h.shape[1])
            lods = {}
            for f in LODS:
                lods[f] = smoothed[f][y0:y1:f, x0:x1:f].astype(np.float32)
            yield cx, cy, lods


def changed_chunks(h: np.ndarray, footprint_path, snapshot: Path) -> set | None:
    """Which chunks an edit can have moved, or None for "all of them".

    The footprint says where the edit landed; the snapshot of the heights this
    compiler last cut says where the ground actually moved. The union is used,
    because either alone can be short: the footprint is a claim, and the
    snapshot is absent on a first run.
    """
    from . import footprint as fp
    boxes = fp.load_or_none(footprint_path)
    if boxes is None:
        return None
    old = np.load(snapshot) if snapshot.exists() else None
    measured = fp.changed_boxes(h, old)
    if measured is None:
        return None
    return fp.chunks(fp.union(boxes, measured), CHUNK)


def main() -> None:
    args = [a for a in sys.argv[1:]]
    footprint_path = None
    if "--footprint" in args:
        i = args.index("--footprint")
        footprint_path = Path(args[i + 1])
        del args[i:i + 2]
    height_path = Path(args[0]) if args else DEFAULT_HEIGHTS
    h = np.load(height_path)
    out_dir = height_path.parent / "chunks"
    out_dir.mkdir(exist_ok=True)
    snapshot = out_dir / "compiled-height-f32.npy"
    manifest_path = out_dir / "chunks-manifest.json"
    wanted = None
    previous: dict = {}
    if footprint_path is not None and manifest_path.exists():
        wanted = changed_chunks(h, footprint_path, snapshot)
        if wanted is not None:
            previous = {(e["cx"], e["cy"]): e
                        for e in json.loads(manifest_path.read_text())["chunks"]}
            print(f"footprint: {len(wanted)} of {len(previous)} chunks re-cut")
    meta = json.loads(META_PATH.read_text())
    chunks = []
    fresh = {}
    for cx, cy, lods in chunk_grid(h, wanted):
        entry = {"cx": cx, "cy": cy,
                 "originM": [round(meta["originM"][0] + cx * CHUNK * RAW_M, 1),
                             round(meta["originM"][1] + cy * CHUNK * RAW_M, 1)],
                 "minM": round(float(lods[1].min()), 2),
                 "maxM": round(float(lods[1].max()), 2),
                 "lods": {}}
        for f, arr in lods.items():
            name = f"chunk_{cx}_{cy}_lod{f}.npy"
            np.save(out_dir / name, arr)
            entry["lods"][str(f)] = {"file": name, "shape": list(arr.shape),
                                     "metresPerSample": round(RAW_M * f, 3)}
        fresh[(cx, cy)] = entry
    if wanted is None:
        chunks = [fresh[key] for key in sorted(fresh, key=lambda k: (k[1], k[0]))]
    else:
        # Manifest order is the full grid's order, never "changed ones first":
        # a reordered manifest is a different file for the same province.
        chunks = [fresh.get(key, previous.get(key))
                  for key in sorted(set(previous) | set(fresh), key=lambda k: (k[1], k[0]))]
        chunks = [entry for entry in chunks if entry is not None]
    # The digest covers the whole province, read back from disk, so it means
    # the same after an incremental run as after a full one.
    sha = hashlib.sha256()
    for entry in chunks:
        for f in LODS:
            sha.update(np.load(out_dir / entry["lods"][str(f)]["file"]).tobytes())
    # What this run cut, so the next run can measure what moved.
    np.save(snapshot, h)
    changed_names = sorted(f"{cx}_{cy}" for cx, cy in fresh)
    (out_dir / "chunks-changed.json").write_text(json.dumps(
        {"schemaVersion": 1, "chunks": changed_names}, indent=1) + "\n")
    manifest = {
        "chunkSamples": CHUNK,
        "chunkMetres": round(CHUNK * RAW_M, 1),
        # The final chunk is partial. grid * chunkMetres is therefore only a
        # streaming allocation bound. Runtime movement stops at the last
        # terrain vertex (`extentM`); authored UV and raster coverage are
        # separate registration spans.
        "sourceGridSamples": SOURCE_GRID_SAMPLES,
        "extentM": TERRAIN_SUPPORT_EXTENT_M,
        "terrainSupportExtentM": TERRAIN_SUPPORT_EXTENT_M,
        "authoredUvExtentM": AUTHORED_UV_EXTENT_M,
        "hydrologyRasterEdgeExtentM": HYDRO_RASTER_EDGE_EXTENT_M,
        "verticalScaleAtGeometry": VERTICAL_SCALE_AT_GEOMETRY,
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
