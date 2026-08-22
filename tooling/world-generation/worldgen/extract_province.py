"""Extract the Argonia province heightfield from the Tamriel Worldspaces esp.

Stitches all LAND cells into one grid (32 samples per cell edge; the 33rd row/
column of each cell overlaps its neighbour), writes:

- full-resolution float32 .npy + metadata into the asset vault (build cache);
- a downsampled 16-bit PNG + meta.json into apps/world-studio/public/province/
  for the browser preview.

Usage:
  python3 -m worldgen.extract_province <path-to-Argonia.esp>

Skyrim game units: 1 unit = 0.01428 m; a 4096-unit cell edge is ~58.5 m.
Horizontal province rescaling is a later, explicit decision (docs/decisions).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

from .esp import extract_land_cells

UNITS_TO_METRES = 0.01428
CELL_UNITS = 4096.0
SAMPLES_PER_CELL = 32
PREVIEW_MAX_EDGE = 1600

REPO_ROOT = Path(__file__).resolve().parents[3]
PREVIEW_DIR = REPO_ROOT / "apps" / "world-studio" / "public" / "province"


def stitch(cells: dict[tuple[int, int], list[list[float]]]) -> tuple[np.ndarray, dict]:
    xs = [c[0] for c in cells]
    ys = [c[1] for c in cells]
    min_x, max_x, min_y, max_y = min(xs), max(xs), min(ys), max(ys)
    width = (max_x - min_x + 1) * SAMPLES_PER_CELL + 1
    height = (max_y - min_y + 1) * SAMPLES_PER_CELL + 1
    grid = np.full((height, width), np.nan, dtype=np.float32)
    for (cx, cy), rows in cells.items():
        gx = (cx - min_x) * SAMPLES_PER_CELL
        gy = (cy - min_y) * SAMPLES_PER_CELL
        block = np.asarray(rows, dtype=np.float32) * UNITS_TO_METRES
        # VHGT rows run south->north; row index 0 is the cell's south edge.
        grid[gy : gy + 33, gx : gx + 33] = block
    meta = {
        "cellRange": {"minX": min_x, "maxX": max_x, "minY": min_y, "maxY": max_y},
        "cellCount": len(cells),
        "samplesPerCell": SAMPLES_PER_CELL,
        "metresPerSample": CELL_UNITS * UNITS_TO_METRES / SAMPLES_PER_CELL,
        "gridWidth": width,
        "gridHeight": height,
        "units": "metres",
        "yAxis": "row 0 is the southernmost sample (north is up when flipped)",
    }
    return grid, meta


def write_preview(grid: np.ndarray, meta: dict) -> dict:
    filled = np.nan_to_num(grid, nan=float(np.nanmin(grid)))
    step = max(1, int(np.ceil(max(filled.shape) / PREVIEW_MAX_EDGE)))
    small = filled[::step, ::step]
    lo, hi = float(small.min()), float(small.max())
    norm = np.flipud((small - lo) / (hi - lo))  # flip so image row 0 is north
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    Image.fromarray((norm * 65535.0).astype(np.uint16)).save(PREVIEW_DIR / "height16.png")
    # 8-bit copy for the browser: canvas pixel reads are 8-bit per channel.
    Image.fromarray((norm * 255.0).astype(np.uint8)).save(PREVIEW_DIR / "height8.png")
    preview_meta = {
        **meta,
        "downsampleStep": step,
        "metresPerPixel": meta["metresPerSample"] * step,
        "heightMinMetres": lo,
        "heightMaxMetres": hi,
        "imageWidth": norm.shape[1],
        "imageHeight": norm.shape[0],
        "imageOrientation": "row 0 is north",
        "source": "Tamriel Worldspaces (Nexus SSE mod 118678), Argonia.esp, via worldgen.extract_province",
    }
    (PREVIEW_DIR / "meta.json").write_text(json.dumps(preview_meta, indent=2))
    return preview_meta


def main() -> None:
    esp_path = Path(sys.argv[1])
    cells = extract_land_cells(esp_path)
    if not cells:
        raise SystemExit("no LAND cells found — wrong file?")
    grid, meta = stitch(cells)
    vault_out = esp_path.parent / "argonia-heightfield"
    vault_out.mkdir(exist_ok=True)
    np.save(vault_out / "heightfield-f32.npy", grid)
    (vault_out / "meta.json").write_text(json.dumps(meta, indent=2))
    preview_meta = write_preview(grid, meta)
    print(json.dumps({k: preview_meta[k] for k in (
        "cellRange", "cellCount", "gridWidth", "gridHeight", "metresPerSample",
        "heightMinMetres", "heightMaxMetres", "imageWidth", "imageHeight")}, indent=2))


if __name__ == "__main__":
    main()
