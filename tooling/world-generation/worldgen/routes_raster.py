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

**Spans carry the road clear of the ground.** Where an authored bridge or deck
carries a way over a dip, the ground below is ground the road never touches, so
it is not painted (see `SPANNING_KINDS`). Vegetation clearance is deliberately
NOT cut back the same way — a tree growing up through a deck is worse than a
gap in the canopy — so `corridor_masks` ignores structures entirely.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from scipy import ndimage

from .grade_routes import resample
from .scale import RAW_M

REPO_ROOT = Path(__file__).resolve().parents[3]
PROVINCE = REPO_ROOT / "apps" / "world-studio" / "public" / "province"
# Authored route structures (worldgen.author_route_structures); chainage
# windows are metres along `grade_routes.resample`d centrelines.
STRUCTURES_PATH = REPO_ROOT / "world" / "sources" / "routes" / "route-structures.json"

# Structure kinds whose running surface is CARRIED CLEAR of the ground: the
# road is up on the piece, so the dip, river or gully underneath keeps its
# natural cover and gets no road paint.
SPANNING_KINDS = frozenset({"bridge", "deck"})
# Kinds that REST on the slope they climb — their ground stays painted, because
# the player walks on ground-hugging masonry, not over a void.
GROUNDED_KINDS = frozenset({"lip-step", "stair", "stepped-ascent"})
# NOT `compile_route_structures.RAMP_KINDS` ({deck, bridge, lip-step}). That set
# splits level-surface pieces from climbing pieces; this one splits carried-clear
# from on-ground. A lip-step is level AND on the ground, so the two disagree.

# The window includes an 8 m landing pad at each end (grade_routes
# .STRETCH_LANDING_M) that the piece's abutment sits on. Stopping the paint dead
# on the window edge would leave the road ending in mid-air at the abutment, so
# the erase is inset this far at each end and the last metres of paint run in
# under the deck ends.
ABUTMENT_INSET_M = 4.0
# Erase width for the major-road stripe: `routes_raster.rasterize_roads`
# dilates 2 iterations (~9 m); one iteration more, so the whole stripe goes even
# where the frozen carve line and the published centreline the structures were
# measured on have drifted by a texel.
ROAD_ERASE_WIDTH_M = 12.0

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


def minor_ways(path: Path | None = None) -> list[tuple[str, str, list]]:
    """[(id, kind, px polyline)] from routes-minor.json (empty if absent)."""
    path = path or (PROVINCE / "routes-minor.json")
    if not path.exists():
        return []
    data = json.loads(path.read_text())
    return [(t.get("id", ""), t.get("kind", "footpath"), t.get("px", []))
            for t in data.get("tracks", [])]


def major_ways(path: Path | None = None) -> list[tuple[str, str, list]]:
    """[(id, kind, px polyline)] of the road/trunk classes in routes.json."""
    path = path or (PROVINCE / "routes.json")
    if not path.exists():
        return []
    out = []
    for route in json.loads(path.read_text()).get("routes", []):
        cls = route.get("class")
        if cls in ("road", "trunk"):
            out.append((route.get("id", ""),
                        "trunk_road" if cls == "trunk" else "road",
                        route.get("px", [])))
    return out


def minor_routes(path: Path | None = None) -> list[tuple[str, list]]:
    """[(kind, px polyline)] from routes-minor.json (empty if absent)."""
    return [(k, px) for _, k, px in minor_ways(path)]


def major_routes(path: Path | None = None) -> list[tuple[str, list]]:
    """[(kind, px polyline)] of the road/trunk classes in routes.json."""
    return [(k, px) for _, k, px in major_ways(path)]


def spanning_spans(path: Path | None = None) -> dict[str, list[tuple[float, float]]]:
    """wayId -> [(fromM, toM)] for the CARRIED-CLEAR structures only.

    Windows are metres of chainage along `grade_routes.resample(px, STEP)`, the
    same centreline the grader and the structure compiler use."""
    path = STRUCTURES_PATH if path is None else path
    out: dict[str, list[tuple[float, float]]] = {}
    if not path.exists():
        return out
    for s in json.loads(path.read_text()).get("structures", []):
        if s.get("kind") not in SPANNING_KINDS:
            continue
        a, b = float(s["fromM"]), float(s["toM"])
        out.setdefault(str(s.get("wayId", "")), []).append((min(a, b), max(a, b)))
    return out


def _span_line(shape, ways, spans, step: int, origin_full=(0, 0),
               inset_m: float = ABUTMENT_INSET_M) -> np.ndarray:
    """Centreline samples that sit under a span, as a 1 px bool mask.

    Ways are matched to structures BY ID against the very polylines being
    painted, so chainage is measured on the same geometry the paint follows.
    """
    mask = np.zeros(shape, dtype=bool)
    for wid, px in ways:
        windows = spans.get(wid)
        if not windows or len(px) < 2:
            continue
        pts = resample(px, step)
        if len(pts) < 2:
            continue
        seg = np.hypot(*np.diff(pts, axis=0).T) * RAW_M
        chain = np.concatenate([[0.0], np.cumsum(seg)])
        inside = np.zeros(len(chain), dtype=bool)
        for a, b in windows:
            lo, hi = a + inset_m, b - inset_m
            if hi <= lo:
                continue
            inside |= (chain >= lo) & (chain <= hi)
        if not inside.any():
            continue
        xs = np.rint(pts[inside, 0]).astype(int) - origin_full[1]
        ys = np.rint(pts[inside, 1]).astype(int) - origin_full[0]
        ok = (xs >= 0) & (xs < shape[1]) & (ys >= 0) & (ys < shape[0])
        mask[ys[ok], xs[ok]] = True
    return mask


def major_spanning_mask(shape, step: int, origin_full=(0, 0), province: Path | None = None,
                        structures: Path | None = None,
                        width_m: float = ROAD_ERASE_WIDTH_M) -> np.ndarray:
    """Full-res mask of ground carried clear by a bridge/deck on a MAJOR road.

    Call sites subtract it from the road paint (`rasterize_roads`), which knows
    nothing about structures."""
    province = province or PROVINCE
    ways = [(wid, px) for wid, _k, px in major_ways(province / "routes.json")]
    line = _span_line(shape, ways, spanning_spans(structures), step, origin_full)
    it = _iterations(width_m)
    return ndimage.binary_dilation(line, iterations=it) if it and line.any() else line


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


def rasterize_minor_paint(shape, step: int, origin_full=(0, 0), path: Path | None = None,
                          structures: Path | None = None):
    """int8 raster of minor-route surface classes (MINOR_TRACK / MINOR_PATH).

    Deterministic; narrower kinds are drawn last so a footpath never
    overwrites the wider track it joins. Ground under a bridge or deck is left
    unpainted — the way is up on the piece and never touches it — while stairs,
    stepped ascents and lip-steps keep their paint, because they rest on the
    slope (`SPANNING_KINDS` vs `GROUNDED_KINDS`)."""
    out = np.zeros(shape, dtype=np.int8)
    ways = minor_ways(path)
    spans = spanning_spans(structures)
    for kind in ("track", "causeway", "footpath"):
        width = PAINT_WIDTH_M.get(kind, 0.0)
        if width <= 0.0:
            continue
        mask = np.zeros(shape, dtype=bool)
        for _wid, k, px in ways:
            if k == kind:
                stamp(mask, px, step, origin_full)
        it = _iterations(width)
        if it:
            mask = ndimage.binary_dilation(mask, iterations=it)
        carried = _span_line(shape, [(w, px) for w, k, px in ways if k == kind],
                             spans, step, origin_full)
        if carried.any():
            # One iteration wider than the stripe, so no fringe survives.
            mask &= ~ndimage.binary_dilation(carried, iterations=it + 1)
        out[mask & (out == 0)] = PAINT_CLASS[kind]
    return out


def corridor_masks(shape, step: int, origin_full=(0, 0), province: Path | None = None):
    """(trunk_mask, ground_mask): where woody layers are cleared, and where
    groundcover is additionally thinned. Covers both networks.

    Structures are deliberately ignored: clearance under a bridge or deck STAYS.
    A canopy tree growing up through the deck the player is walking on is a
    worse artefact than a gap in the canopy below a span, and the span's own
    piercing/soffit clearance is not modelled anywhere else."""
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


def rasterize_roads(shape, origin_full=(0, 0), step: int = 3) -> np.ndarray:
    """The FROZEN major-road corridors (macro [x, y] px) as a bool mask ~27 m
    wide at full resolution. Water rules override later, so crossings stay
    unpainted (bridges/ferries are placed features). Reads `carve_routes`'
    frozen network, never the published `routes.json` that `reroute_majors`
    rewrites from this very ground (the chain could not settle otherwise)."""
    from .carve_routes import carve_polylines
    mask = np.zeros(shape, dtype=bool)
    for px in carve_polylines():
        for (x0m, y0m), (x1m, y1m) in zip(px, px[1:]):
            x0, y0 = x0m * step - origin_full[1], y0m * step - origin_full[0]
            x1, y1 = x1m * step - origin_full[1], y1m * step - origin_full[0]
            steps = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
            xs = np.linspace(x0, x1, steps).round().astype(int)
            ys = np.linspace(y0, y1, steps).round().astype(int)
            ok = (xs >= 0) & (xs < shape[1]) & (ys >= 0) & (ys < shape[0])
            mask[ys[ok], xs[ok]] = True
    return ndimage.binary_dilation(mask, iterations=2)
