"""Paint the studio's 2D route overlays from the PUBLISHED route records.

Usage:
  python3 -m worldgen.paint_route_overlays

Decision 0068: the roads are re-solved BELOW the freeze gate, so the overlays
can no longer be painted by ``compile_society`` (a stage above the gate that
never re-runs). This stage reads only published records — it derives nothing —
and repaints:

  soc-routes.png      roads/trunks from routes.json (+ tracks from
                      routes-minor.json when that stage is enabled)
  soc-waterways.png   lanes from waterways.json (+ minor channels likewise)
  soc-rootways.png    the rootworm transit schematic
  soc-junctions.png   the road junctions of routes.json

Everything is deterministic and written atomically.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

from .scale import RAW_M

REPO_ROOT = Path(__file__).resolve().parents[3]
PROVINCE = REPO_ROOT / "apps" / "world-studio" / "public" / "province"
SOURCES = REPO_ROOT / "world" / "sources"

GRID = 1345                     # macro (society/route) raster, cell-centred
MACRO_CELL_M = RAW_M * 3        # one macro cell in world metres

ROAD_RGBA = (225, 205, 160, 235)
TRACK_RGBA = (200, 180, 140, 200)
LANE_RGBA = (120, 215, 255, 220)
MINOR_LANE_RGBA = (90, 170, 205, 190)
ROOTWAY_RGBA = (150, 240, 150, 235)
ROOT_STATION_RGBA = (110, 230, 110, 255)
JUNCTION_RGBA = (255, 0, 255, 235)

ROAD_CLASSES = {"road", "trunk"}


def stage_enabled(stage: str) -> bool:
    """Is `stage` in the CHAIN_ENABLED stage list? Unset means 'all'."""
    enabled = os.environ.get("CHAIN_ENABLED")
    if enabled is None:
        return True
    names = enabled.split()
    return "all" in names or stage in names


def _blank() -> np.ndarray:
    return np.zeros((GRID, GRID, 4), dtype=np.uint8)


def _mask_from_px(runs: list, mask: np.ndarray) -> int:
    """Set every in-bounds [col, row] cell; returns the count set."""
    n = 0
    for px in runs:
        for cell in px:
            x, y = int(cell[0]), int(cell[1])
            if 0 <= x < GRID and 0 <= y < GRID:
                mask[y, x] = True
                n += 1
    return n


def _paint(img: np.ndarray, mask: np.ndarray, rgba: tuple[int, int, int, int]) -> None:
    if mask.any():
        img[ndimage.binary_dilation(mask)] = rgba


def _save(img: np.ndarray, name: str) -> int:
    path = PROVINCE / name
    tmp = path.with_name(path.name + ".tmp")
    Image.fromarray(img).save(tmp, format="PNG")
    os.replace(tmp, path)
    painted = int((img[..., 3] > 0).sum())
    print(f"{name}: {painted} texels")
    return painted


def _px_lists(doc: dict, keys: tuple[str, ...], classes: set[str] | None = None) -> list:
    out = []
    for key in keys:
        for entry in doc.get(key, []):
            if classes is not None and entry.get("class") not in classes:
                continue
            px = entry.get("px")
            if px:
                out.append(px)
    return out


def paint_routes(province: Path = PROVINCE) -> np.ndarray:
    img = _blank()
    doc = json.loads((province / "routes.json").read_text())
    major = np.zeros((GRID, GRID), dtype=bool)
    cells = _mask_from_px(_px_lists(doc, ("routes",), ROAD_CLASSES), major)
    print(f"soc-routes.png: routes.json, {cells} road cells")
    _paint(img, major, ROAD_RGBA)

    minor_path = province / "routes-minor.json"
    if not minor_path.exists():
        print("soc-routes.png: no routes-minor.json — minor tracks unpainted")
    elif not stage_enabled("compile_minor_routes"):
        print("soc-routes.png: compile_minor_routes not in CHAIN_ENABLED — "
              "minor tracks unpainted")
    else:
        minor = np.zeros((GRID, GRID), dtype=bool)
        mdoc = json.loads(minor_path.read_text())
        mcells = _mask_from_px(_px_lists(mdoc, ("tracks",)), minor)
        minor &= ~major
        print(f"soc-routes.png: routes-minor.json, {mcells} track cells")
        if minor.any():
            img[ndimage.binary_dilation(minor) & (img[..., 3] == 0)] = TRACK_RGBA
    return img


def paint_waterways(province: Path = PROVINCE) -> np.ndarray:
    img = _blank()
    lanes = np.zeros((GRID, GRID), dtype=bool)
    path = province / "waterways.json"
    if path.exists():
        doc = json.loads(path.read_text())
        cells = _mask_from_px(_px_lists(doc, ("lanes",)), lanes)
        print(f"soc-waterways.png: waterways.json, {cells} lane cells")
        _paint(img, lanes, LANE_RGBA)
    else:
        print("soc-waterways.png: no waterways.json — lanes unpainted")

    minor_path = province / "waterways-minor.json"
    if not minor_path.exists():
        print("soc-waterways.png: no waterways-minor.json — minor channels unpainted")
    elif not stage_enabled("compile_minor_waterways"):
        print("soc-waterways.png: compile_minor_waterways not in CHAIN_ENABLED — "
              "minor channels unpainted")
    else:
        mdoc = json.loads(minor_path.read_text())
        minor = np.zeros((GRID, GRID), dtype=bool)
        mcells = _mask_from_px(_px_lists(mdoc, ("lanes", "channels")), minor)
        minor &= ~lanes
        print(f"soc-waterways.png: waterways-minor.json, {mcells} channel cells")
        if minor.any():
            img[ndimage.binary_dilation(minor) & (img[..., 3] == 0)] = MINOR_LANE_RGBA
    return img


def _rootway_stations(province: Path, sources: Path) -> tuple[dict, list, str]:
    """{station id: (x, y)}, [(from, to)], source label."""
    services = sources / "routes" / "travel-services.json"
    if services.exists():
        doc = json.loads(services.read_text())
        px = {}
        for st in doc.get("stations", []):
            if not st.get("positionM"):          # a deferred station with no siting yet (16g's)
                continue
            east, south = st["positionM"]
            px[st["id"]] = (int(east / MACRO_CELL_M), int(south / MACRO_CELL_M))
        edges = [(e["from"], e["to"]) for e in doc.get("rootways", [])]
        return px, edges, "world/sources/routes/travel-services.json"

    return {}, [], "none"


def paint_rootways(province: Path = PROVINCE, sources: Path = SOURCES) -> np.ndarray:
    img = _blank()
    px, edges, label = _rootway_stations(province, sources)
    print(f"soc-rootways.png: source {label}, {len(px)} stations, {len(edges)} edges")
    for a, b in edges:
        if a not in px or b not in px:
            continue
        (x0, y0), (x1, y1) = px[a], px[b]
        n = int(max(abs(x1 - x0), abs(y1 - y0)))
        for i in range(0, n, 4):  # dotted
            t = i / n
            y = int(y0 + (y1 - y0) * t)
            x = int(x0 + (x1 - x0) * t)
            if 0 <= x < GRID and 0 <= y < GRID:
                img[y, x] = ROOTWAY_RGBA
    if edges:
        img = np.array(Image.fromarray(img).filter(ImageFilter.MaxFilter(3)))
    for x, y in px.values():
        img[max(y - 2, 0):y + 3, max(x - 2, 0):x + 3] = ROOT_STATION_RGBA
    return img


def paint_junctions(province: Path = PROVINCE) -> np.ndarray:
    img = _blank()
    doc = json.loads((province / "routes.json").read_text())
    junctions = doc.get("junctions", [])
    for j in junctions:
        east, south = j["positionM"]
        x, y = int(east / MACRO_CELL_M), int(south / MACRO_CELL_M)
        img[max(y - 3, 0):y + 4, max(x - 3, 0):x + 4] = JUNCTION_RGBA
    print(f"soc-junctions.png: routes.json, {len(junctions)} junctions")
    return img


def main() -> None:
    _save(paint_routes(), "soc-routes.png")
    _save(paint_waterways(), "soc-waterways.png")
    _save(paint_rootways(), "soc-rootways.png")
    _save(paint_junctions(), "soc-junctions.png")


if __name__ == "__main__":
    main()
