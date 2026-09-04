"""Route corridors as rasters — the single source for BOTH ground paint and
vegetation clearance (Phase 11, minor-route painting).

Two networks feed it, in the same macro px frame (1345 grid, `STEP` full-res
samples per macro px):

* `routes.json`   — the Phase 4 major graph (`class` road/trunk; boat lanes
  are not roads and are skipped).
* `routes-minor.json` — the Part 3b derived network (`kind` track / footpath /
  boardwalk / causeway).

Widths are declared in **metres** and converted with `scale.RAW_M`, so a
scale change moves them together. At 1.83 m per full-res sample a footpath is
a single-pixel stripe — that is the resolution floor, and it is the right
answer: a 1.2 m worn strip cannot be wider than one texel.

Ground paint vs clearance are deliberately different widths: a cart track is
2.5 m of bare dirt but keeps trees off ~8 m, and a boardwalk paints nothing at
all (it is a placed asset over water) while still needing the reeds cut back.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from scipy import ndimage

from .scale import RAW_M

REPO_ROOT = Path(__file__).resolve().parents[3]
PROVINCE = REPO_ROOT / "apps" / "world-studio" / "public" / "province"

# Minor-route land-cover class ids used by `landcover.compile_ground_control`
# (1/2 map to TRACK / PATH there; 0 = unpainted).
MINOR_TRACK, MINOR_PATH = 1, 2

# Painted surface width, metres. Boardwalks paint nothing.
# Owner 2026-09-04: at ~1.8 m texels a 1.2 m footpath was under one texel and
# the control-map blur erased it — the minor roads were "not painted or too
# faint" in 3D. Paint at least two texels; the clearance corridors are unchanged.
PAINT_WIDTH_M = {
    "track": 3.6,
    "causeway": 3.6,
    "footpath": 2.4,
    "boardwalk": 0.0,
}
# Which land-cover class each painted minor kind gets.
PAINT_CLASS = {
    "track": MINOR_TRACK,
    "causeway": MINOR_TRACK,
    "footpath": MINOR_PATH,
}
# Vegetation clearance corridors, metres (full width). `trunk` clears T1/T2
# woody layers; `ground` additionally thins the T3 groundcover.
# Owner 2026-09-04: minor roads had "too much vegetation growing on them" —
# they are paths and should cut through the growth (a few overgrown stretches
# are fine, the default is not). Widened, and footpaths now thin the herb layer.
CLEARANCE_M = {
    "road": dict(trunk=14.0, ground=10.0),
    "trunk_road": dict(trunk=14.0, ground=10.0),
    "track": dict(trunk=10.0, ground=7.0),
    "causeway": dict(trunk=10.0, ground=7.0),
    "footpath": dict(trunk=6.0, ground=3.5),
    "boardwalk": dict(trunk=4.0, ground=4.0),
}


def _iterations(width_m: float) -> int:
    """Dilation iterations for a full width in metres around a 1 px stripe."""
    return max(0, int(round((width_m / RAW_M - 1.0) / 2.0)))


def minor_routes(path: Path | None = None) -> list[tuple[str, list]]:
    """[(kind, px polyline)] from routes-minor.json (empty if absent)."""
    path = path or (PROVINCE / "routes-minor.json")
    if not path.exists():
        return []
    data = json.loads(path.read_text())
    return [(t.get("kind", "footpath"), t.get("px", [])) for t in data.get("tracks", [])]


def major_routes(path: Path | None = None) -> list[tuple[str, list]]:
    """[(kind, px polyline)] of the road/trunk classes in routes.json."""
    path = path or (PROVINCE / "routes.json")
    if not path.exists():
        return []
    out = []
    for route in json.loads(path.read_text()).get("routes", []):
        cls = route.get("class")
        if cls in ("road", "trunk"):
            out.append(("trunk_road" if cls == "trunk" else "road", route.get("px", [])))
    return out


def stamp(mask, px, step: int, origin_full=(0, 0)) -> None:
    """Draw a polyline of macro px into a full-res bool mask (in place)."""
    for (x0m, y0m), (x1m, y1m) in zip(px, px[1:]):
        x0, y0 = x0m * step - origin_full[1], y0m * step - origin_full[0]
        x1, y1 = x1m * step - origin_full[1], y1m * step - origin_full[0]
        steps = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
        xs = np.linspace(x0, x1, steps).round().astype(int)
        ys = np.linspace(y0, y1, steps).round().astype(int)
        ok = (xs >= 0) & (xs < mask.shape[1]) & (ys >= 0) & (ys < mask.shape[0])
        mask[ys[ok], xs[ok]] = True


def rasterize_minor_paint(shape, step: int, origin_full=(0, 0), path: Path | None = None):
    """int8 raster of minor-route surface classes (MINOR_TRACK / MINOR_PATH).

    Deterministic; narrower kinds are drawn last so a footpath never
    overwrites the wider track it joins."""
    out = np.zeros(shape, dtype=np.int8)
    routes = minor_routes(path)
    for kind in ("track", "causeway", "footpath"):
        width = PAINT_WIDTH_M.get(kind, 0.0)
        if width <= 0.0:
            continue
        mask = np.zeros(shape, dtype=bool)
        for k, px in routes:
            if k == kind:
                stamp(mask, px, step, origin_full)
        it = _iterations(width)
        if it:
            mask = ndimage.binary_dilation(mask, iterations=it)
        out[mask & (out == 0)] = PAINT_CLASS[kind]
    return out


def corridor_masks(shape, step: int, origin_full=(0, 0), province: Path | None = None):
    """(trunk_mask, ground_mask): where woody layers are cleared, and where
    groundcover is additionally thinned. Covers both networks."""
    province = province or PROVINCE
    routes = (major_routes(province / "routes.json")
              + minor_routes(province / "routes-minor.json"))
    trunk = np.zeros(shape, dtype=bool)
    ground = np.zeros(shape, dtype=bool)
    for kind, widths in CLEARANCE_M.items():
        line = np.zeros(shape, dtype=bool)
        hit = False
        for k, px in routes:
            if k == kind:
                stamp(line, px, step, origin_full)
                hit = True
        if not hit:
            continue
        for width, target in ((widths["trunk"], trunk), (widths["ground"], ground)):
            if width <= 0.0:
                continue
            it = _iterations(width)
            target |= ndimage.binary_dilation(line, iterations=it) if it else line
    return trunk, ground
