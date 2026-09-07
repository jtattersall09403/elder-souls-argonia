"""Prepare static native-channel cutouts from the exact runtime footprint export."""
from __future__ import annotations
import argparse
import gzip
import hashlib
import json
import math
from pathlib import Path
import struct
import numpy as np
import shapely
from shapely.geometry import Polygon, box
from shapely.ops import unary_union

STEPS = (4, 8, 16)


def axis_knots(header: dict, start: float, end: float) -> list[float]:
    values = {start, end}
    for grid, half in ((header["surfaceGrid"], True), (header["classGrid"], False)):
        mpp = grid["metresPerPixel"]
        origin = grid.get("gridOriginM", mpp * .5)
        step, offset = (mpp * .5, origin) if half else (mpp, origin + mpp * .5)
        for i in range(math.floor((start - offset) / step) + 1, math.ceil((end - offset) / step)):
            value = offset + i * step
            if start < value < end:
                values.add(value)
    return sorted(values)


def densify_tile_edges(polygon: Polygon, bounds, header: dict) -> Polygon:
    """Constrain shared tile-edge knots, including otherwise collinear ones."""
    min_x, min_z, max_x, max_z = bounds
    def ring(coords):
        result = []
        for a, b in zip(coords, coords[1:]):
            result.append(a)
            if a[0] == b[0] and a[0] in (min_x, max_x):
                values = axis_knots(header, min(a[1], b[1]), max(a[1], b[1]))[1:-1]
                result.extend((a[0], v) for v in (values if a[1] < b[1] else reversed(values)))
            elif a[1] == b[1] and a[1] in (min_z, max_z):
                values = axis_knots(header, min(a[0], b[0]), max(a[0], b[0]))[1:-1]
                result.extend((v, a[1]) for v in (values if a[0] < b[0] else reversed(values)))
        return result
    return Polygon(ring(list(polygon.exterior.coords)), [ring(list(r.coords)) for r in polygon.interiors])


def cutout_triangles(region, tile_bounds, header) -> np.ndarray:
    polygons = [region] if region.geom_type == "Polygon" else [p for p in getattr(region, "geoms", ()) if p.geom_type == "Polygon"]
    triangles = []
    area = 0.0
    for polygon in polygons:
        if polygon.is_empty:
            continue
        dense = densify_tile_edges(polygon, tile_bounds, header)
        for triangle in shapely.constrained_delaunay_triangles(dense).geoms:
            points = np.asarray(triangle.exterior.coords[:3], dtype="<f4")
            a, b = points[1].astype(float) - points[0], points[2].astype(float) - points[0]
            cross = a[0] * b[1] - a[1] * b[0]
            if cross > 0:  # Counter-clockwise XZ faces downward in Three XYZ.
                points[[1, 2]] = points[[2, 1]]
            if cross != 0:
                triangles.append(points.reshape(6))
            area += triangle.area
    if abs(area - region.area) > max(1e-7, region.area * 1e-10):
        raise ValueError("Constrained cutout triangulation did not preserve its region area")
    return np.asarray(triangles, dtype="<f4").reshape(-1, 6)


def prepare(source: Path, output: Path, tile: tuple[int, int] | None = None) -> dict:
    output.mkdir(parents=True, exist_ok=True)
    records = triangles = 0
    raw = output / "water-cutouts.bin"
    with source.open() as lines, raw.open("w+b") as target:
        header = json.loads(next(lines))
        tile_count = math.ceil(header["gridSize"] / 64)
        mpp = header["metresPerPixel"]
        target.write(struct.pack("<8sII", b"ESWCUT01", 1, 0))
        for line in lines:
            data = json.loads(line)
            tx, tz = data["tx"], data["tz"]
            if tile is not None and (tx, tz) != tile:
                continue
            bounds = (tx * 64 * mpp, tz * 64 * mpp, (tx + 1) * 64 * mpp, (tz + 1) * 64 * mpp)
            shapes = [Polygon(np.asarray(p).reshape(3, 2)) for p in data["positions"]]
            mask = unary_union([p for p in shapes if p.area > 0]).intersection(box(*bounds))
            if mask.is_empty:
                continue
            for variant, step in enumerate(STEPS):
                span = step * mpp
                for row in range(64 // step):
                    for col in range(64 // step):
                        cell = box(bounds[0] + col * span, bounds[1] + row * span,
                                   bounds[0] + (col + 1) * span, bounds[1] + (row + 1) * span)
                        if not mask.intersects(cell) or mask.intersection(cell).area == 0:
                            continue
                        values = cutout_triangles(cell.difference(mask), bounds, header)
                        key = (((variant * tile_count + tz) * tile_count + tx) * 16 + row) * 16 + col
                        target.write(struct.pack("<II", key, len(values)))
                        target.write(values.tobytes())
                        records += 1
                        triangles += len(values)
            if (tz * tile_count + tx) % 32 == 0:
                print(json.dumps({"tile": [tx, tz], "cells": records, "triangles": triangles}), flush=True)
        target.seek(12)
        target.write(struct.pack("<I", records))
    content = raw.read_bytes()
    compressed = gzip.compress(content, mtime=0)
    (output / "water-cutouts.bin.gz").write_bytes(compressed)
    result = {"schemaVersion": 1, "file": "water-cutouts.bin.gz", "compression": "gzip",
              "sha256": hashlib.sha256(content).hexdigest(), "bytes": len(content), "downloadBytes": len(compressed),
              "sourceRibbonsSha256": header["sourceRibbonsSha256"], "crossSectionsSha256": header.get("crossSectionsSha256"),
              "surfaceOriginM": header["surfaceGrid"].get("gridOriginM", mpp * .5),
              "classGrid": {**header["classGrid"], "gridOriginM": header["classGrid"].get("gridOriginM", header["classGrid"]["metresPerPixel"] * .5)},
              "gridSize": header["gridSize"], "metresPerPixel": mpp, "tileCells": 64, "steps": list(STEPS),
              "cells": records, "triangles": triangles, "complete": tile is None,
              "sourceFootprintsSha256": hashlib.sha256(source.read_bytes()).hexdigest(), "builderSourceHashes": header["builderSourceHashes"]}
    (output / "water-cutouts-meta.json").write_text(json.dumps(result, indent=2) + "\n")
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--tile", nargs=2, type=int)
    args = parser.parse_args()
    print(json.dumps(prepare(args.source, args.output, tuple(args.tile) if args.tile else None)))


if __name__ == "__main__":
    main()
