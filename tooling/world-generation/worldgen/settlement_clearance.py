"""Settlement vegetation clearance — the graded mask the scatter compiler and
the runtime groundcover ring both obey (decision 0041, "The compiler owns
vegetation clearing", owner 2026-09-01/2026-09-09).

A settlement's blueprint declares three things, in world metres:

* ``hardClear`` — polygons of built ground: building parcels, streets, the
  commons, kept sightlines. Nothing wild grows there. A builder does not leave
  a tree standing in the middle of a floor.
* ``thinned``  — the worked fringe around the core: coppice, garden plots,
  trodden ground, reed beds cut for thatch. Growth is reduced, not removed.
* ``kept``     — the managed plants the settlement exists around, the Hist tree
  above all. These are protected: the mask never clears their ground.

**The grading is a gradient, not a step.** Inside the thinned band the surviving
share ramps continuously from :data:`FRINGE_MIN_KEEP` at the built edge to a
full wild 1.0 at the band's outer boundary, on the *relative* distance between
the two boundaries, so the band grades correctly whether it is 20 m or 200 m
wide. The number is defensible rather than arbitrary: the route corridors
already keep 8 % of the herb layer under daily foot traffic
(``scatter.ROUTE_THIN_KEEP``) and wild ground keeps 100 %; a worked fringe is
cut and grazed but not walked flat, so it sits between them, nearer the wild
end because it is only *worked*, and it recovers outward. A quarter of the wild
stem count at the wall reads on the ground as "someone cuts here", which is the
whole point of not shipping a cut-out disc.

The keep factor is a plain function of position, evaluated identically here and
in ``packages/game-core/src/vegetation/settlementClearance.ts``. Keep the two in
step: the Python builds a raster for the compiler, the TypeScript evaluates
points for the runtime groundcover ring, and both must agree or grass grows
through floors the compiler cleared.

Nothing here hides anything at runtime: the compiler recompiles the affected
chunks so the instance list the colliders derive from is the cleared one
(0041 clearing gotcha (a)).
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np

from .scale import RAW_M

REPO_ROOT = Path(__file__).resolve().parents[3]
PROVINCE = REPO_ROOT / "apps" / "world-studio" / "public" / "province"

#: Share of wild growth surviving at the built edge of the worked fringe.
FRINGE_MIN_KEEP = 0.25
#: Falloff length of the worked fringe, metres — principle C13's vegetation
#: channel (ground material falls off over 8 m and terrain over 25 m; those
#: are other compilers' business). Beyond it the marsh is wild again even
#: inside a generously drawn `thinned` polygon: a town works the ground it
#: walks on, not everything a bounding box covers.
FRINGE_FALLOFF_M = 15.0
#: Amplitude and wavelengths of the wobble on the built edge, metres (C13:
#: "dilated by a jittered offset"). A cut edge wanders a metre or two; a
#: mathematically exact polygon boundary reads as a stencil from ten paces.
EDGE_JITTER_M = 1.5
EDGE_JITTER_WAVELENGTH_M = (11.3, 7.1)
#: Weeds and rubble gather at the foot of a wall, and that band is a
#: deliberate KEEP, not an oversight: it breaks the hard vertical/horizontal
#: join between a building and the ground
#: (research/rendering/building-placement-rendering-treatments.md §2.3). Growth
#: in the first metre outside built ground is enriched over the fringe rate,
#: falling to nothing by the band's edge. The gain is deliberately modest —
#: this is weeds at a wall foot, not a hedge.
WALL_ENRICH_BAND_M = 1.2
WALL_ENRICH_GAIN = 0.8
#: Protected radius, metres, around each declared kept plant, by its kind.
#: A Hist tree stands in its own cleared ground with its own canopy company;
#: a shade tree is a single crown; a worked reed bed is a stand.
KEPT_RADIUS_M = {"hist-tree": 18.0, "shade": 8.0, "reed-bed": 12.0}
DEFAULT_KEPT_RADIUS_M = 8.0

#: Chunk size the vegetation compiler works in (compile_scatter.CHUNK_M).
CHUNK_SAMPLES = 256
CHUNK_M = CHUNK_SAMPLES * RAW_M


# --- polygon geometry (mirrored in settlementClearance.ts) ------------------

def point_in_polygon(x: float, z: float, poly) -> bool:
    inside = False
    n = len(poly)
    for i in range(n):
        ax, az = poly[i]
        bx, bz = poly[(i + 1) % n]
        if (az > z) != (bz > z):
            t = (z - az) / (bz - az)
            if x < ax + t * (bx - ax):
                inside = not inside
    return inside


def distance_to_polygon(x: float, z: float, poly) -> float:
    """Distance to the polygon's boundary (unsigned), metres."""
    best = math.inf
    n = len(poly)
    for i in range(n):
        ax, az = poly[i]
        bx, bz = poly[(i + 1) % n]
        dx, dz = bx - ax, bz - az
        length2 = dx * dx + dz * dz
        t = 0.0 if length2 == 0 else max(
            0.0, min(1.0, ((x - ax) * dx + (z - az) * dz) / length2))
        best = min(best, math.hypot(x - (ax + t * dx), z - (az + t * dz)))
    return best


def _nearest(x: float, z: float, polys) -> tuple[bool, float]:
    inside = False
    best = math.inf
    for poly in polys:
        if len(poly) < 3:
            continue
        if point_in_polygon(x, z, poly):
            inside = True
        best = min(best, distance_to_polygon(x, z, poly))
    return inside, best


def edge_jitter(x: float, z: float) -> float:
    """The wobble on the built edge at this position, metres, in [0, 1] × amp.

    Deterministic and continuous — two out-of-phase sinusoids rather than a
    hashed noise field, because the runtime groundcover ring has to reproduce
    it exactly in TypeScript and this is the cheapest thing that does.
    """
    lx, lz = EDGE_JITTER_WAVELENGTH_M
    wobble = (math.sin(x / lx) * math.cos(z / lz)
              + 0.5 * math.sin(z / (lx * 0.6) + 1.7)) / 1.5
    return EDGE_JITTER_M * (wobble + 1.0) / 2.0


def keep_at(x: float, z: float, clearance: dict, margin_m: float = 0.0) -> float:
    """Share of wild vegetation that survives at this position, in [0, 1].

    1.0 is untouched marsh; 0.0 is built ground. ``margin_m`` is the
    conservative half-cell described on :func:`keep_field`.
    """
    for kept in clearance.get("kept", []) or []:
        px, pz = kept["positionM"]
        radius = KEPT_RADIUS_M.get(kept.get("kind"), DEFAULT_KEPT_RADIUS_M) - margin_m
        if radius > 0.0 and math.hypot(x - px, z - pz) <= radius:
            return 1.0

    hard = clearance.get("hardClear", []) or []
    thinned = clearance.get("thinned", []) or []
    falloff = float(clearance.get("fringeFalloffM") or FRINGE_FALLOFF_M)
    in_hard, d_hard = _nearest(x, z, hard)
    d_wall = math.inf
    if hard:
        d_hard = max(0.0, d_hard - margin_m)
        jitter = edge_jitter(x, z)
        if in_hard or d_hard <= jitter:
            return 0.0
        # Distance from the built edge as CUT, not from the drawn polygon.
        d_wall = d_hard - jitter
    in_thin, d_thin = _nearest(x, z, thinned)
    if not (in_thin or d_thin <= margin_m):
        return 1.0
    if not hard:
        # No built core declared: grade from the band's own edge inwards.
        d_hard = max(0.0, falloff - max(0.0, d_thin - margin_m))
    t = min(1.0, d_hard / falloff) if falloff > 0 else 1.0
    keep = FRINGE_MIN_KEEP + (1.0 - FRINGE_MIN_KEEP) * t
    if d_wall < WALL_ENRICH_BAND_M:
        keep *= 1.0 + WALL_ENRICH_GAIN * (1.0 - d_wall / WALL_ENRICH_BAND_M)
    return min(1.0, keep)


# --- province data ----------------------------------------------------------

def load_clearances(province: Path | None = None) -> list[dict]:
    """[{id, clearance}] from the published blueprints bundle.

    ``blueprints.json`` is what the runtime already streams and it carries the
    clearance declarations in world metres, so compiler and runtime read one
    published file (engineering standard: one record, one source).
    """
    province = province or PROVINCE
    path = province / "blueprints.json"
    if not path.exists():
        return []
    data = json.loads(path.read_text())
    out = []
    for bp in data.get("blueprints", []):
        clearance = bp.get("clearance") or {}
        if clearance.get("hardClear") or clearance.get("thinned"):
            out.append({"id": bp["id"], "clearance": clearance})
    return out


def bounds_m(clearance: dict) -> tuple[float, float, float, float]:
    xs, zs = [], []
    for poly in (clearance.get("hardClear") or []) + (clearance.get("thinned") or []):
        for x, z in poly:
            xs.append(x)
            zs.append(z)
    for kept in clearance.get("kept", []) or []:
        x, z = kept["positionM"]
        radius = KEPT_RADIUS_M.get(kept.get("kind"), DEFAULT_KEPT_RADIUS_M)
        xs += [x - radius, x + radius]
        zs += [z - radius, z + radius]
    if not xs:
        return (0.0, 0.0, 0.0, 0.0)
    return (min(xs), min(zs), max(xs), max(zs))


def affected_chunks(clearance: dict, chunk_m: float = CHUNK_M) -> list[tuple[int, int]]:
    """Every vegetation chunk this settlement's clearance touches.

    The whole bbox, not just the polygon vertices: a settlement wider than a
    chunk has interior chunks with no vertex in them, and leaving one out is
    exactly 0041 gotcha (c) — a chunk that keeps its old trees next to
    recompiled neighbours.
    """
    x0, z0, x1, z1 = bounds_m(clearance)
    if x1 <= x0 and z1 <= z0:
        return []
    return [(cx, cz)
            for cz in range(int(z0 // chunk_m), int(z1 // chunk_m) + 1)
            for cx in range(int(x0 // chunk_m), int(x1 // chunk_m) + 1)]


def keep_raster(shape: tuple[int, int], px_m: float,
                clearances: list[dict] | None = None,
                province: Path | None = None) -> np.ndarray:
    """uint8 keep field over the province grid: 255 = wild, 0 = built ground.

    Only the settlements' own bounding windows are evaluated — the province is
    7.4 km of marsh with a handful of towns in it, and filling 60 M cells to
    255 costs nothing while evaluating them would cost minutes on every
    compile.
    """
    keep = np.full(shape, 255, dtype=np.uint8)
    records = clearances if clearances is not None else load_clearances(province)
    for record in records:
        clearance = record["clearance"]
        x0, z0, x1, z1 = bounds_m(clearance)
        col0 = max(0, int(math.floor(x0 / px_m)) - 2)
        row0 = max(0, int(math.floor(z0 / px_m)) - 2)
        col1 = min(shape[1], int(math.ceil(x1 / px_m)) + 3)
        row1 = min(shape[0], int(math.ceil(z1 / px_m)) + 3)
        if col1 <= col0 or row1 <= row0:
            continue
        xs = (np.arange(col0, col1) + 0.5) * px_m
        zs = (np.arange(row0, row1) + 0.5) * px_m
        grid_x, grid_z = np.meshgrid(xs, zs)
        margin = px_m * math.sqrt(2.0) / 2.0
        value = np.rint(
            keep_field(grid_x, grid_z, clearance, margin) * 255.0).astype(np.uint8)
        window = keep[row0:row1, col0:col1]
        np.minimum(window, value, out=window)
    return keep


# --- vectorised evaluation (same rule as `keep_at`, tested to agree) --------

def _inside_and_distance(x: np.ndarray, z: np.ndarray, polys):
    inside = np.zeros(x.shape, dtype=bool)
    best = np.full(x.shape, np.inf, dtype=np.float64)
    for poly in polys:
        if len(poly) < 3:
            continue
        crossings = np.zeros(x.shape, dtype=bool)
        n = len(poly)
        for i in range(n):
            ax, az = poly[i]
            bx, bz = poly[(i + 1) % n]
            straddle = (az > z) != (bz > z)
            with np.errstate(divide="ignore", invalid="ignore"):
                t = np.where(straddle, (z - az) / (bz - az if bz != az else 1.0), 0.0)
            crossings ^= straddle & (x < ax + t * (bx - ax))
            dx, dz = bx - ax, bz - az
            length2 = dx * dx + dz * dz
            u = 0.0 if length2 == 0 else np.clip(
                ((x - ax) * dx + (z - az) * dz) / length2, 0.0, 1.0)
            best = np.minimum(best, np.hypot(x - (ax + u * dx), z - (az + u * dz)))
        inside |= crossings
    return inside, best


def keep_field(x: np.ndarray, z: np.ndarray, clearance: dict,
               margin_m: float = 0.0) -> np.ndarray:
    """`keep_at` over arrays of positions.

    ``margin_m`` makes the answer *conservative* over a cell of that half-
    diagonal: built ground grows by the margin, protected discs shrink by it,
    and the fringe grade is read from the nearer edge. A raster built without
    it lets a tree 20 cm inside a wall survive because the cell centre it
    sampled fell outside — which is precisely the failure this whole mask
    exists to stop.
    """
    hard = clearance.get("hardClear", []) or []
    thinned = clearance.get("thinned", []) or []
    falloff = float(clearance.get("fringeFalloffM") or FRINGE_FALLOFF_M)
    in_hard, d_hard = _inside_and_distance(x, z, hard)
    in_thin, d_thin = _inside_and_distance(x, z, thinned)
    d_thin = np.maximum(d_thin - margin_m, 0.0)
    in_thin = in_thin | (d_thin <= 0.0)
    d_wall = np.full(np.shape(x), np.inf, dtype=np.float64)
    if hard:
        d_hard = np.maximum(d_hard - margin_m, 0.0)
        lx, lz = EDGE_JITTER_WAVELENGTH_M
        wobble = (np.sin(x / lx) * np.cos(z / lz)
                  + 0.5 * np.sin(z / (lx * 0.6) + 1.7)) / 1.5
        jitter = EDGE_JITTER_M * (wobble + 1.0) / 2.0
        in_hard = in_hard | (d_hard <= jitter)
        d_wall = d_hard - jitter
    else:
        d_hard = np.maximum(0.0, falloff - d_thin)
    t = np.minimum(1.0, d_hard / falloff) if falloff > 0 else np.ones(np.shape(x))
    keep = FRINGE_MIN_KEEP + (1.0 - FRINGE_MIN_KEEP) * np.clip(t, 0.0, 1.0)
    if hard:
        keep = np.minimum(1.0, keep * np.where(
            d_wall < WALL_ENRICH_BAND_M,
            1.0 + WALL_ENRICH_GAIN * (1.0 - np.clip(d_wall, 0.0, WALL_ENRICH_BAND_M)
                                      / WALL_ENRICH_BAND_M),
            1.0))
    keep = np.where(in_thin, keep, 1.0)
    keep = np.where(in_hard, 0.0, keep)
    for kept in clearance.get("kept", []) or []:
        px, pz = kept["positionM"]
        radius = KEPT_RADIUS_M.get(kept.get("kind"), DEFAULT_KEPT_RADIUS_M) - margin_m
        if radius <= 0.0:
            continue
        keep = np.where(np.hypot(x - px, z - pz) <= radius, 1.0, keep)
    return keep
