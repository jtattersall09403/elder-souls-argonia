"""Sparse exact runtime terrain for shared water native-crease refinement."""
from __future__ import annotations

import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path
import struct

import numpy as np

from .water_terrain_lod import decode_native, sha256


def export_native_ground(province, protected_path, water_dir, out):
    province, water_dir, out = Path(province), Path(water_dir), Path(out)
    source_path = province / "chunks/chunks-web-manifest.json"
    overlay_path, topology_path = water_dir / "water-bed-overlay.json", water_dir / "water-terrain-topology.json"
    source = json.loads(source_path.read_text())
    overlay, topology = json.loads(overlay_path.read_text()), json.loads(topology_path.read_text())
    grid, mpp = overlay["gridSize"], overlay["metresPerPixel"]
    if topology.get("schemaVersion") != 1 or topology["gridSize"] != grid or topology["metresPerPixel"] != mpp:
        raise ValueError("Native ground topology and overlay mismatch")
    mask = np.load(protected_path, allow_pickle=False)
    if mask.dtype != np.bool_ or mask.shape != (grid, grid):
        raise ValueError("Native ground requires exact native vertex protection mask")
    cells = mask[:-1, :-1] | mask[:-1, 1:] | mask[1:, :-1] | mask[1:, 1:]
    chunk_cells = source["chunkSamples"]
    tile_cells = max(size for size in range(1, 17) if chunk_cells % size == 0 and (grid - 1) % size == 0)
    stride = (grid - 1) // tile_cells
    records = []
    for chunk in sorted(source["chunks"], key=lambda item: (item["cy"], item["cx"])):
        ox, oz = chunk["cx"] * chunk_cells, chunk["cy"] * chunk_cells
        heights = decode_native(province, chunk, chunk_cells, overlay)
        nz, nx = np.array(heights.shape) - 1
        if nx % tile_cells or nz % tile_cells:
            raise ValueError("Native ground tile does not align with source chunk")
        for z in range(0, nz, tile_cells):
            for x in range(0, nx, tile_cells):
                if not np.any(cells[oz + z:oz + z + tile_cells, ox + x:ox + x + tile_cells]):
                    continue
                index = ((oz + z) // tile_cells) * stride + (ox + x) // tile_cells
                records.append((index, heights[z:z + tile_cells + 1, x:x + tile_cells + 1].astype("<f4").tobytes()))
    records.sort(key=lambda record: record[0])
    flips = topology["flippedCells"]
    if any(not isinstance(index, int) or index < 0 or index >= (grid - 1) ** 2 for index in flips) or flips != sorted(set(flips)):
        raise ValueError("Native ground flips must be sorted unique native cells")
    header = b"ESWGRND1" + struct.pack("<6Id2I", 1, grid, tile_cells, len(records), len(flips), 0, mpp, chunk_cells, 0)
    payload = header + np.asarray(flips, dtype="<u4").tobytes() + b"".join(struct.pack("<I", index) + height for index, height in records)
    stream = io.BytesIO()
    with gzip.GzipFile(fileobj=stream, mode="wb", filename="", mtime=0, compresslevel=6) as zipped:
        zipped.write(payload)
    compressed = stream.getvalue()
    out.mkdir(parents=True, exist_ok=True)
    filename = "water-native-ground.bin.gz"
    (out / filename).write_bytes(compressed)
    descriptor = {"file": filename, "compression": "gzip", "bytes": len(payload), "downloadBytes": len(compressed),
                  "sha256": hashlib.sha256(payload).hexdigest(), "nativeManifestSha256": sha256(source_path),
                  "bedOverlaySha256": sha256(overlay_path), "topologySha256": sha256(topology_path)}
    report = {"descriptor": descriptor, "stats": {"tileCells": tile_cells, "tileCount": len(records),
              "coveredCells": len(records) * tile_cells ** 2, "coveredVerticesWithBorders": len(records) * (tile_cells + 1) ** 2,
              "protectedVertices": int(np.count_nonzero(mask)), "flippedCells": len(flips)}}
    (out / "water-native-ground-descriptor.json").write_text(json.dumps(report, separators=(",", ":")) + "\n")
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--province", type=Path, required=True)
    parser.add_argument("--protected", type=Path, required=True)
    parser.add_argument("--water-dir", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(export_native_ground(args.province, args.protected, args.water_dir, args.out), indent=2))


if __name__ == "__main__":
    main()
