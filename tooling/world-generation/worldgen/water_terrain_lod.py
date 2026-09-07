"""Versioned adaptive terrain derived from actual runtime native PNGs.

Run with --province apps/world-studio/public/province --protected <cache.npy>
--out <staging-directory>. The caller publishes only with the matching water
overlay/topology; this exporter never modifies immutable source terrain.
"""
from __future__ import annotations

import argparse
import hashlib
import gzip
import io
import json
from pathlib import Path
import struct

import numpy as np
from PIL import Image

from .adaptive_terrain import adaptive_terrain

MAGIC = b"ESATLOD1"


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def encode_mesh(vertices, triangles, cells_x, cells_z):
    vertices = np.asarray(vertices, np.float32)
    indices = np.asarray(triangles, np.uint32).reshape(-1)
    if not np.isfinite(vertices).all() or len(vertices) > 66049 or len(indices) > cells_x * cells_z * 6 or len(indices) % 3 or np.any(indices >= len(vertices)):
        raise ValueError("Invalid adaptive terrain mesh size/height")
    lattice = vertices[:, (0, 2)]
    if np.any(lattice != np.floor(lattice)) or np.any(lattice < 0) or np.any(lattice > (cells_x, cells_z)):
        raise ValueError("Adaptive vertices must remain on the native lattice")
    index_bytes = 2 if len(vertices) <= 65535 else 4
    header = MAGIC + struct.pack("<6I", 1, len(vertices), len(indices), index_bytes, cells_x, cells_z)
    return header + lattice.astype("<u2").tobytes() + vertices[:, 1].astype("<f4").tobytes() + indices.astype("<u2" if index_bytes == 2 else "<u4").tobytes()


def decode_native(province, chunk, chunk_samples, overlay):
    """Mirror Float32 PNG decode followed by Float32(original+overlay delta)."""
    source = chunk["lods"]["1"]
    pixels = np.asarray(Image.open(province / "chunks" / source["file"]).convert("RGB"))
    if list(pixels.shape[:2]) != source["shape"]:
        raise ValueError("Native terrain PNG shape disagrees with manifest")
    code = pixels[..., 0].astype(np.float64) * 256 + pixels[..., 1]
    heights = (source["minM"] + code / 65535 * (source["maxM"] - source["minM"])).astype(np.float32)
    ox, oz = chunk["cx"] * chunk_samples, chunk["cy"] * chunk_samples
    grid = overlay["gridSize"]
    for index, target, original in overlay["changes"]:
        z, x = divmod(index, grid)
        if ox <= x < ox + heights.shape[1] and oz <= z < oz + heights.shape[0]:
            heights[z - oz, x - ox] = float(heights[z - oz, x - ox]) + (target - original)
    return heights


def bank_world_roundoff_bound(vertices, triangles, origin_m, metres_per_sample, cells):
    """Conservative physical-domain correction for final Float32 XZ.

    Native and coarse world triangulations each move their ideal lattice
    point by at most q. Their inverse positions differ by at most2q; the
    coarse mesh's global Lipschitz gradient bounds the resulting height
    difference. This is in addition to the proven protected-domain error.
    """
    q = max(float(np.max(np.abs((origin + np.arange(size + 1) * metres_per_sample).astype(np.float32).astype(np.float64)
                                 - (origin + np.arange(size + 1) * metres_per_sample))))
            for origin, size in zip(origin_m, cells))
    points = np.asarray(vertices, dtype=np.float64)[triangles]
    u, v = points[:, 1] - points[:, 0], points[:, 2] - points[:, 0]
    area = u[:, 0] * v[:, 2] - u[:, 2] * v[:, 0]
    slope_x = (u[:, 1] * v[:, 2] - v[:, 1] * u[:, 2]) / area / metres_per_sample
    slope_z = (u[:, 0] * v[:, 1] - v[:, 0] * u[:, 1]) / area / metres_per_sample
    return float(2 * q * np.max(np.abs(slope_x) + np.abs(slope_z), initial=0)) + 1e-9


def export_terrain(province, protected_path, out, water_dir=None, bank_errors=()):
    province, out = Path(province), Path(out)
    source_path = province / "chunks/chunks-web-manifest.json"
    water_dir = Path(water_dir) if water_dir else province / "water/v2"
    overlay_path = water_dir / "water-bed-overlay.json"
    topology_path = water_dir / "water-terrain-topology.json"
    source = json.loads(source_path.read_text())
    overlay = json.loads(overlay_path.read_text())
    topology = json.loads(topology_path.read_text())
    grid_size, mpp = overlay["gridSize"], overlay["metresPerPixel"]
    if topology.get("schemaVersion") != 1 or topology.get("gridSize") != grid_size or topology.get("metresPerPixel") != mpp:
        raise ValueError("Terrain topology and bed overlay do not share their native grid")
    protected = np.load(protected_path, allow_pickle=False)
    if protected.dtype != np.bool_ or protected.shape != (grid_size, grid_size):
        raise ValueError("Protected mask must be a native-grid Boolean vertex mask")
    protected_cells = protected[:-1, :-1] | protected[:-1, 1:] | protected[1:, :-1] | protected[1:, 1:]
    flipped = np.zeros_like(protected_cells)
    previous = -1
    for index in topology["flippedCells"]:
        if not isinstance(index, int) or index <= previous or index >= (grid_size - 1) ** 2:
            raise ValueError("Topology flips must be sorted unique native cell indices")
        flipped.flat[index] = True
        previous = index
    protected_cells |= flipped
    out.mkdir(parents=True, exist_ok=True)
    manifest = {"schemaVersion": 1, "format": "es-adaptive-terrain-v1", "gridSize": grid_size,
                "nativeMetresPerSample": mpp, "chunkSamples": source["chunkSamples"],
                "sources": {"nativeManifest": {"file": "chunks/chunks-web-manifest.json", "sha256": sha256(source_path)},
                            "bedOverlay": {"file": "water/v2/water-bed-overlay.json", "sha256": sha256(overlay_path)},
                            "topology": {"file": "water/v2/water-terrain-topology.json", "sha256": sha256(topology_path)},
                            "protectionMaskSha256": sha256(protected_path)}, "chunks": []}
    if any(error not in (.1, .25, .5, 1.) for error in bank_errors):
        raise ValueError("Supported bank error levels are0.1,0.25,0.5 and1 metre")
    variants = [(str(lod), lod, None) for lod in (2, 4)] + [(f"4-e{round(error * 100):03d}", 4, error) for error in sorted(set(bank_errors))]
    totals = {key: {"triangles": 0, "vertices": 0, "bytes": 0, "downloadBytes": 0, "renderBytes": 0, "legacyTriangles": 0} for key, _, _ in variants}
    max_border_error = 0.0
    borders = {}
    for chunk in sorted(source["chunks"], key=lambda c: (c["cy"], c["cx"])):
        cx, cy = chunk["cx"], chunk["cy"]
        ox, oz = cx * source["chunkSamples"], cy * source["chunkSamples"]
        heights = decode_native(province, chunk, source["chunkSamples"], overlay)
        nz, nx = np.array(heights.shape) - 1
        if (cx - 1, cy) in borders:
            max_border_error = max(max_border_error, float(np.max(np.abs(heights[:, 0] - borders[(cx - 1, cy)][0]))))
        if (cx, cy - 1) in borders:
            max_border_error = max(max_border_error, float(np.max(np.abs(heights[0, :] - borders[(cx, cy - 1)][1]))))
        borders[(cx, cy)] = (heights[:, -1].copy(), heights[-1, :].copy())
        local_mask = protected_cells[oz:oz + nz, ox:ox + nx]
        local_flips = flipped[oz:oz + nz, ox:ox + nx]
        record = {"cx": cx, "cy": cy, "originM": [ox * mpp, oz * mpp], "cells": [int(nx), int(nz)],
                  "nativeFileSha256": sha256(province / "chunks" / chunk["lods"]["1"]["file"]),
                  "flippedCells": np.flatnonzero(local_flips).tolist(), "lods": {}}
        for key, lod, error in variants:
            vertices, triangles = adaptive_terrain(heights, local_mask, lod, local_flips, max_error_m=error)
            payload = encode_mesh(vertices, triangles, int(nx), int(nz))
            compressed = io.BytesIO()
            with gzip.GzipFile(fileobj=compressed, mode="wb", filename="", mtime=0, compresslevel=6) as gz:
                gz.write(payload)
            download = compressed.getvalue()
            # Compression is explicit in the manifest. A .gz suffix lets
            # static hosts transparently decode the file before its packed
            # download hash can be verified by the browser.
            filename = f"chunk_{cx}_{cy}_lod{key}.bin"
            (out / filename).write_bytes(download)
            meta = {"file": filename, "bytes": len(payload), "vertices": len(vertices), "triangles": len(triangles),
                    "compression": "gzip", "downloadBytes": len(download),
                    "renderBytes": len(vertices) * 20 + len(triangles) * 3 * (2 if len(vertices) <= 65535 else 4),
                    "sha256": hashlib.sha256(download).hexdigest(), "minM": float(np.min(vertices[:, 1])), "maxM": float(np.max(vertices[:, 1]))}
            if error is not None:
                margin = bank_world_roundoff_bound(vertices, triangles, record["originM"], mpp, (int(nx), int(nz)))
                meta.update(baseLod="4", maximumBankErrorM=error + margin,
                            worldFloat32ErrorAllowanceM=margin, bankLatticeErrorM=error)
            record["lods"][key] = meta
            for metric in ("vertices", "triangles", "bytes", "downloadBytes", "renderBytes"):
                totals[key][metric] += meta[metric]
            old_shape = chunk["lods"][str(lod)]["shape"]
            totals[key]["legacyTriangles"] += (old_shape[0] - 1) * (old_shape[1] - 1) * 2
        manifest["chunks"].append(record)
    manifest["stats"] = {"lods": totals, "protectedCells": int(np.count_nonzero(protected_cells)),
                         "flippedCells": int(np.count_nonzero(flipped)), "maximumNativeBorderQuantizationDifferenceM": max_border_error}
    (out / "manifest.json").write_text(json.dumps(manifest, separators=(",", ":")) + "\n")
    return manifest


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--province", type=Path, required=True)
    parser.add_argument("--protected", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--water-dir", type=Path)
    parser.add_argument("--bank-errors", type=float, nargs="*", default=[])
    args = parser.parse_args()
    result = export_terrain(args.province, args.protected, args.out, args.water_dir, args.bank_errors)
    print(json.dumps(result["stats"], indent=2))


if __name__ == "__main__":
    main()
