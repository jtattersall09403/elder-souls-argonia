"""Encode the vault's terrain chunks for the browser (Phase 7).

The chunk compiler (`compile_chunks`) writes float32 `.npy` grids into the
vault, which CI and GitHub Pages can never see. This exporter re-encodes every
chunk LOD as a 16-bit-quantised RG PNG (R = high byte, G = low byte — the
studio's established height encoding) into `apps/world-studio/public/`, plus a
web manifest with per-LOD min/max for exact dequantisation. Quantisation error
is bounded by (maxM - minM) / 65535 per chunk — millimetres.

Heights stay true metres (vertical scale, ×1 per decision 0015, applied where
data becomes geometry/collision); sea level y = 0.

Usage:
  python3 -m worldgen.export_web_chunks [vault-chunks-dir] [--changed]

INCREMENTAL. With `--changed` only the chunk LODs `compile_chunks` actually
re-cut this run (its `chunks-changed.json`) are re-encoded; every other PNG is
left byte-for-byte as it is and its manifest entry is rebuilt from the range
already recorded in the web manifest. The province-wide gradient texture is
NOT incremental — it is one image over the whole heightfield, so it is
re-encoded every run, and it is the floor on this stage's cost.
"""

from __future__ import annotations

import json
import sys
from multiprocessing import Pool, cpu_count
from pathlib import Path

import numpy as np
from PIL import Image

from .compile_chunks import DEFAULT_HEIGHTS

REPO_ROOT = Path(__file__).resolve().parents[3]
OUT_DIR = REPO_ROOT / "apps" / "world-studio" / "public" / "province" / "chunks"


def encode_rg16(heights: np.ndarray, min_m: float, max_m: float) -> Image.Image:
    """Quantise a float32 height grid to 16 bits packed as R=high, G=low."""
    span = max(max_m - min_m, 1e-6)
    q = np.clip(np.round((heights - min_m) / span * 65535.0), 0, 65535).astype(np.uint32)
    rgb = np.zeros((*heights.shape, 3), dtype=np.uint8)
    rgb[..., 0] = (q >> 8) & 0xFF
    rgb[..., 1] = q & 0xFF
    return Image.fromarray(rgb, mode="RGB")


def decode_rg16(image: Image.Image, min_m: float, max_m: float) -> np.ndarray:
    rgb = np.asarray(image.convert("RGB"), dtype=np.uint32)
    q = (rgb[..., 0] << 8) | rgb[..., 1]
    return (q.astype(np.float32) / 65535.0) * (max_m - min_m) + min_m


GRADIENT_CLAMP = 8.0  # |dh/dx| in true m/m; 6b cliffs reach ~5-6 (was 1.0 pre-orogeny)


def export_gradients(mps: float) -> dict:
    """One province-wide slope-gradient texture (R = dh/dx, G = dh/dz, true
    metres per metre, signed-sqrt encoded: byte = (sign(g)*sqrt(|g|/clamp)+1)
    * 127.5. The sqrt keeps marsh-flat precision (~0.5 deg) while the clamp
    reaches cliff gradients; the shader decodes with sign(s)*s*s*clamp.

    The terrain shader lights every chunk mesh from this single continuous
    texture (scaled by the live vertical scale) instead of per-chunk vertex
    normals — per-chunk normals disagree along shared edges and painted a
    visible seam down every chunk border.
    """
    heights = np.load(DEFAULT_HEIGHTS)
    gz, gx = np.gradient(heights, mps)
    rgb = np.zeros((*heights.shape, 3), dtype=np.uint8)
    for channel, g in ((0, gx), (1, gz)):
        s = np.sign(g) * np.sqrt(np.clip(np.abs(g) / GRADIENT_CLAMP, 0.0, 1.0))
        rgb[..., channel] = np.clip(np.round((s + 1.0) * 127.5), 0, 255).astype(np.uint8)
    name = "normal-grad.png"
    Image.fromarray(rgb, mode="RGB").save(OUT_DIR / name, optimize=True)
    return {"file": name, "clamp": GRADIENT_CLAMP, "encoding": "signed-sqrt",
            "size": list(heights.shape)}


def _encode_one(job: tuple[str, str, str]) -> tuple[str, float, float, int]:
    """Encode one chunk LOD to its PNG. Pure per-file work — the whole export
    is a few hundred independent zlib compressions, so it runs across the
    cores in a worker pool. Each worker touches its own file only, and the
    manifest is assembled from the results in the manifest's own order, so
    the output is exactly what the serial loop produced.
    """
    src, out_path, name = job
    heights = np.load(src)
    min_m = float(heights.min())
    max_m = float(heights.max())
    encode_rg16(heights, min_m, max_m).save(out_path, optimize=True)
    return name, min_m, max_m, Path(out_path).stat().st_size


def main() -> None:
    args = list(sys.argv[1:])
    only_changed = "--changed" in args
    args = [a for a in args if a != "--changed"]
    chunks_dir = Path(args[0]) if args else DEFAULT_HEIGHTS.parent / "chunks"
    manifest = json.loads((chunks_dir / "chunks-manifest.json").read_text())
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    web_path = OUT_DIR / "chunks-web-manifest.json"
    known: dict[str, tuple[float, float, int]] = {}
    if only_changed and web_path.exists():
        changed_path = chunks_dir / "chunks-changed.json"
        changed = set(json.loads(changed_path.read_text())["chunks"]) \
            if changed_path.exists() else None
        if changed is not None:
            for entry in json.loads(web_path.read_text())["chunks"]:
                if f"{entry['cx']}_{entry['cy']}" in changed:
                    continue
                for lod, meta in entry["lods"].items():
                    name = f"chunk_{entry['cx']}_{entry['cy']}_lod{lod}.png"
                    if (OUT_DIR / name).exists():
                        known[name] = (meta["minM"], meta["maxM"],
                                       (OUT_DIR / name).stat().st_size)
            print(f"changed set: {len(changed)} chunks re-encoded, "
                  f"{len(known)} PNGs kept")

    jobs = []
    for entry in manifest["chunks"]:
        for lod, meta in entry["lods"].items():
            name = f"chunk_{entry['cx']}_{entry['cy']}_lod{lod}.png"
            if name in known:
                continue
            jobs.append((str(chunks_dir / meta["file"]), str(OUT_DIR / name), name))
    # The province-wide gradient texture is one 4k PNG and takes longer than
    # all the chunk tiles together, so it goes into the pool first and encodes
    # alongside them rather than after.
    mps = manifest["chunks"][0]["lods"]["1"]["metresPerSample"]
    with Pool(min(cpu_count(), len(jobs) + 1)) as pool:
        pending_gradients = pool.apply_async(export_gradients, (mps,))
        encoded = {name: (lo, hi, size)
                   for name, lo, hi, size in pool.imap(_encode_one, jobs, chunksize=8)}
        gradients = pending_gradients.get()
    # PNGs this run did not touch keep the range already published for them:
    # re-deriving it would mean re-reading every chunk to learn what the
    # manifest already records.
    encoded.update(known)

    web_chunks = []
    total_bytes = 0
    for entry in manifest["chunks"]:
        web_entry = {
            "cx": entry["cx"],
            "cy": entry["cy"],
            "originM": entry["originM"],
            "lods": {},
        }
        for lod, meta in entry["lods"].items():
            name = f"chunk_{entry['cx']}_{entry['cy']}_lod{lod}.png"
            min_m, max_m, size = encoded[name]
            total_bytes += size
            web_entry["lods"][lod] = {
                "file": name,
                "shape": meta["shape"],
                "metresPerSample": meta["metresPerSample"],
                "minM": round(min_m, 3),
                "maxM": round(max_m, 3),
            }
        web_chunks.append(web_entry)

    web_manifest = {
        "gradients": gradients,
        "chunkSamples": manifest["chunkSamples"],
        "chunkMetres": manifest["chunkMetres"],
        "sourceGridSamples": manifest["sourceGridSamples"],
        "extentM": manifest["extentM"],
        "terrainSupportExtentM": manifest["terrainSupportExtentM"],
        "authoredUvExtentM": manifest["authoredUvExtentM"],
        "hydrologyRasterEdgeExtentM": manifest["hydrologyRasterEdgeExtentM"],
        "verticalScaleAtGeometry": manifest["verticalScaleAtGeometry"],
        "heightsAre": manifest["heightsAre"],
        "encoding": "RG16 PNG: height = minM + ((R<<8)|G) / 65535 * (maxM - minM), per chunk per LOD",
        "collision": manifest["collision"],
        "grid": manifest["grid"],
        "sourceSha256": manifest["sha256"],
        "chunks": web_chunks,
    }
    (OUT_DIR / "chunks-web-manifest.json").write_text(json.dumps(web_manifest, indent=1))
    print(f"{len(web_chunks)} chunks x {len(web_chunks[0]['lods'])} LODs -> {OUT_DIR}")
    print(f"total {total_bytes / 1e6:.1f} MB")


if __name__ == "__main__":
    main()
