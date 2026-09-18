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
# The route registry: the AUTHORED state of repair of every route (`condition`,
# and optional `conditionSections` chainage windows in metres along the
# resampled published polyline — the same chainage the structures use).
REGISTRY_PATH = REPO_ROOT / "world" / "sources" / "routes" / "registry.json"

# Condition codes written into the condition raster (0 = off-road).
CONDITION_CODES = {"maintained": 1, "worn": 2, "decayed": 3, "broken": 4}
DEFAULT_CONDITION = 2           # an unregistered road is a used, rutted road
# How much of the authored clearance width a road of each condition actually
# holds open: a maintained road is cut verge to verge, a broken one keeps
# half its width as a cleared trace. Factor 0 for broken (the 2026-09-16
# value) meant no corridor existed at all, so trees grew over the line and
# nothing was cleared or painted - the owner could not find the road
# (owner walk 2026-09-18).
CONDITION_WIDTH_FACTOR = {1: 1.0, 2: 0.85, 3: 0.7, 4: 0.5}

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
    return _corridor_masks(shape, step, origin_full, routes)


def major_corridor_masks(shape, step: int, origin_full=(0, 0),
                         province: Path | None = None,
                         registry: Path | None = None):
    """(trunk_mask, ground_mask, condition_raster) over the MAJOR roads only.

    The vegetation scatter clears for roads and trunk roads; the minor network
    (tracks, footpaths, boardwalks) is cleared as a vegetation PATCH instead
    (16f), so the scatter must not bake it in a second time.

    The cleared widths follow the road's AUTHORED STATE OF REPAIR (owner
    2026-09-16): the clearance width is scaled by `CONDITION_WIDTH_FACTOR`, so
    a maintained road is held open verge to verge, a decayed one is half
    closed in, and a broken one clears nothing — the growth runs right across
    it. The third return is `condition_raster` on the same grid, for callers
    that paint or thin by condition."""
    province = province or PROVINCE
    lines = _condition_lines(shape, step, origin_full, province, registry)
    widths = CLEARANCE_M["road"]         # road and trunk_road are the same
    trunk = np.zeros(shape, dtype=bool)
    ground = np.zeros(shape, dtype=bool)
    for code, line in lines.items():
        if not line.any():
            continue
        factor = CONDITION_WIDTH_FACTOR[code]
        for width, target in ((widths["trunk"], trunk), (widths["ground"], ground)):
            w = width * factor
            if w <= 0.0:
                continue
            it = _iterations(w)
            target |= ndimage.binary_dilation(line, iterations=it) if it else line
    return trunk, ground, condition_raster(shape, step, origin_full,
                                           province, registry)


def _corridor_masks(shape, step: int, origin_full, routes):
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


def route_conditions(path: Path | None = None) -> dict[str, tuple[int, list]]:
    """routeId -> (condition code, [(fromM, toM, code)]) from the registry.

    Windows are metres of chainage along `grade_routes.resample(px, STEP)` of
    the PUBLISHED polyline, the same chainage `_span_line` walks."""
    path = REGISTRY_PATH if path is None else path
    out: dict[str, tuple[int, list]] = {}
    if not path.exists():
        return out
    for r in json.loads(path.read_text()).get("routes", []):
        code = CONDITION_CODES.get(str(r.get("condition", "")), DEFAULT_CONDITION)
        sections = []
        for s in (r.get("conditionSections") or []):
            a, b = float(s["fromM"]), float(s["toM"])
            sections.append((min(a, b), max(a, b),
                             CONDITION_CODES.get(str(s.get("condition", "")), code)))
        out[str(r.get("id", ""))] = (code, sections)
    return out


def _condition_lines(shape, step: int, origin_full, province: Path | None,
                     registry: Path | None) -> dict[int, np.ndarray]:
    """{condition code: 1 px centreline mask} over the major roads."""
    province = province or PROVINCE
    conditions = route_conditions(registry)
    lines = {c: np.zeros(shape, dtype=bool) for c in CONDITION_CODES.values()}
    for wid, _kind, px in major_ways(province / "routes.json"):
        if len(px) < 2:
            continue
        code, sections = conditions.get(wid, (DEFAULT_CONDITION, []))
        pts = resample(px, step)
        if len(pts) < 2:
            continue
        seg = np.hypot(*np.diff(pts, axis=0).T) * RAW_M
        chain = np.concatenate([[0.0], np.cumsum(seg)])
        codes = np.full(len(chain), code, dtype=np.int8)
        for a, b, sec in sections:
            codes[(chain >= a) & (chain <= b)] = sec
        xs = np.rint(pts[:, 0]).astype(int) - origin_full[1]
        ys = np.rint(pts[:, 1]).astype(int) - origin_full[0]
        ok = (xs >= 0) & (xs < shape[1]) & (ys >= 0) & (ys < shape[0])
        for c in CONDITION_CODES.values():
            sel = ok & (codes == c)
            if sel.any():
                lines[c][ys[sel], xs[sel]] = True
    return lines


def condition_raster(shape, step: int, origin_full=(0, 0),
                     province: Path | None = None,
                     registry: Path | None = None) -> np.ndarray:
    """int8 raster of the authored ROAD CONDITION along every major road.

    0 off-road, 1 maintained, 2 worn, 3 decayed, 4 broken, stamped at the road
    clearance width (`CLEARANCE_M["road"]["trunk"]`). Where two roads overlap
    the BETTER condition wins (the ground is the better road's ground)."""
    lines = _condition_lines(shape, step, origin_full, province, registry)
    it = _iterations(CLEARANCE_M["road"]["trunk"])
    out = np.zeros(shape, dtype=np.int8)
    for c in sorted(CONDITION_CODES.values(), reverse=True):   # lower wins last
        line = lines[c]
        if not line.any():
            continue
        band = ndimage.binary_dilation(line, iterations=it) if it else line
        out[band] = c
    return out


def published_major_polylines(province: Path | None = None) -> list[list]:
    """`px` polylines of every published road and trunk (never a boat lane)."""
    path = (province or PROVINCE) / "routes.json"
    if not path.exists():
        return []
    return [r["px"] for r in json.loads(path.read_text()).get("routes", [])
            if r.get("class") in ("road", "trunk")]


def rasterize_roads(shape, origin_full=(0, 0), step: int = 3) -> np.ndarray:
    """The PUBLISHED major roads (`routes.json`, macro [x, y] px) as a bool
    mask ~27 m wide at full resolution: the line the character walks is the
    line that is painted (16e, decision 0068). Water rules override later, so
    crossings stay unpainted (bridges/ferries are placed features). The old
    reason to paint the frozen carve lines instead (a chain that could not
    settle) expired when the roads moved below the gate and started reading
    the natural array only."""
    mask = np.zeros(shape, dtype=bool)
    for px in published_major_polylines():
        for (x0m, y0m), (x1m, y1m) in zip(px, px[1:]):
            x0, y0 = x0m * step - origin_full[1], y0m * step - origin_full[0]
            x1, y1 = x1m * step - origin_full[1], y1m * step - origin_full[0]
            steps = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
            xs = np.linspace(x0, x1, steps).round().astype(int)
            ys = np.linspace(y0, y1, steps).round().astype(int)
            ok = (xs >= 0) & (xs < shape[1]) & (ys >= 0) & (ys < shape[0])
            mask[ys[ok], xs[ok]] = True
    return ndimage.binary_dilation(mask, iterations=2)
