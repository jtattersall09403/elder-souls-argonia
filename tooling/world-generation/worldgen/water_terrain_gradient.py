"""Sparse matched terrain-normal corrections, never a replacement art asset.

Run after the matched adaptive-terrain export; adds its optional gradientPatch
descriptor and a sorted RG8 replacement sidecar. Original gradient pixels and
native PNGs remain immutable. Unaffected texels retain every original byte.
"""
from __future__ import annotations

import argparse
from functools import lru_cache
import hashlib
import json
from pathlib import Path
import struct

import numpy as np
from PIL import Image

from .water_terrain_lod import decode_native, sha256


def gradient_replacements(rgb, before, after, changed_indices, flipped_cells, metres_per_pixel, clamp=8.0):
    """Apply native-face GRADIENT delta to the original smoothed map. Keeping
    its original bias avoids restyling unrelated terrain. Native area weights
    include explicit topology flips; central differences alone miss those.
    """
    height, width = rgb.shape[:2]
    if width != height or rgb.dtype != np.uint8 or clamp != 8.0:
        raise ValueError("Expected square original signed-sqrt gradient, clamp8")
    affected = set()
    flips = set(flipped_cells)
    for index in changed_indices:
        z, x = divmod(index, width)
        for dz in (-1, 0, 1):
            for dx in (-1, 0, 1):
                if 0 <= x + dx < width and 0 <= z + dz < height:
                    affected.add((x + dx, z + dz))
    for index in flips:
        z, x = divmod(index, width - 1)
        affected.update(((x, z), (x + 1, z), (x, z + 1), (x + 1, z + 1)))

    def slope(x, z, sample, use_flips):
        normal = np.zeros(3)
        for qz in range(max(0, z - 1), min(height - 1, z + 1)):
            for qx in range(max(0, x - 1), min(width - 1, x + 1)):
                corners = ((qx, qz), (qx + 1, qz), (qx, qz + 1), (qx + 1, qz + 1))
                faces = ((0, 2, 3), (0, 3, 1)) if use_flips and qz * (width - 1) + qx in flips else ((0, 2, 1), (1, 2, 3))
                for face in faces:
                    if (x, z) not in [corners[i] for i in face]:
                        continue
                    points = [np.array([float(np.float32(corners[i][0] * metres_per_pixel)), sample(*corners[i]),
                                        float(np.float32(corners[i][1] * metres_per_pixel))]) for i in face]
                    normal += np.cross(points[1] - points[0], points[2] - points[0])
        return -normal[[0, 2]] / normal[1]

    replacements = []
    for x, z in sorted(affected, key=lambda p: p[1] * width + p[0]):
        delta = slope(x, z, after, True) - slope(x, z, before, False)
        signed = rgb[z, x, :2].astype(np.float64) / 127.5 - 1
        original = np.sign(signed) * signed * signed * clamp
        target = original + delta
        encoded = np.clip(np.rint((np.sign(target) * np.sqrt(np.clip(abs(target) / clamp, 0, 1)) + 1) * 127.5), 0, 255).astype(np.uint8)
        if not np.array_equal(encoded, rgb[z, x, :2]):
            replacements.append((z * width + x, int(encoded[0]), int(encoded[1])))
    return replacements


def export_gradient_patch(province, water_dir, terrain_dir):
    province, water_dir, terrain_dir = map(Path, (province, water_dir, terrain_dir))
    manifest_path = terrain_dir / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    source_path = province / "chunks/chunks-web-manifest.json"
    overlay_path, topology_path = water_dir / "water-bed-overlay.json", water_dir / "water-terrain-topology.json"
    dependencies = {"nativeManifest": source_path, "bedOverlay": overlay_path, "topology": topology_path}
    for name, path in dependencies.items():
        if manifest["sources"][name]["sha256"] != sha256(path):
            raise ValueError(f"Matched gradient dependency mismatch: {name}")
    source, overlay, topology = (json.loads(path.read_text()) for path in (source_path, overlay_path, topology_path))
    original_path = province / "chunks" / source["gradients"]["file"]
    original = np.asarray(Image.open(original_path).convert("RGB"))
    grid, samples = overlay["gridSize"], source["chunkSamples"]
    if original.shape[:2] != (grid, grid) or grid > 4096:
        raise ValueError("Original gradient dimensions do not match native terrain")
    chunks = {(c["cx"], c["cy"]): c for c in source["chunks"]}
    deltas = {index: target - old for index, target, old in overlay["changes"]}

    @lru_cache(maxsize=256)
    def native(cx, cz):
        return decode_native(province, chunks[cx, cz], samples, {"gridSize": grid, "changes": []})

    def before(x, z):
        cx, cz = min(x // samples, source["grid"][0] - 1), min(z // samples, source["grid"][1] - 1)
        return float(native(cx, cz)[z - cz * samples, x - cx * samples])

    def after(x, z):
        return float(np.float32(before(x, z) + deltas.get(z * grid + x, 0)))

    records = gradient_replacements(original, before, after, deltas, topology["flippedCells"], overlay["metresPerPixel"], source["gradients"]["clamp"])
    if len(records) > 1000000:
        raise ValueError("Gradient patch exceeds sparse record budget")
    payload = b"ESGRAD01" + struct.pack("<4I", 1, grid, grid, len(records)) + b"".join(struct.pack("<IBB", *r) for r in records)
    descriptor = {"schemaVersion": 1, "format": "es-gradient-rg8-v1", "file": "normal-gradient-patch.bin",
                  "bytes": len(payload), "sha256": hashlib.sha256(payload).hexdigest(), "size": [grid, grid], "count": len(records),
                  "baseGradient": {"file": "chunks/" + source["gradients"]["file"], "sha256": sha256(original_path)},
                  **{name + "Sha256": sha256(path) for name, path in dependencies.items()}}
    (terrain_dir / descriptor["file"]).write_bytes(payload)
    manifest["gradientPatch"] = descriptor
    manifest_path.write_text(json.dumps(manifest, separators=(",", ":")) + "\n")
    return descriptor


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--province", required=True, type=Path)
    parser.add_argument("--water-dir", required=True, type=Path)
    parser.add_argument("--terrain-dir", required=True, type=Path)
    args = parser.parse_args()
    print(json.dumps(export_gradient_patch(args.province, args.water_dir, args.terrain_dir), indent=2))


if __name__ == "__main__":
    main()
