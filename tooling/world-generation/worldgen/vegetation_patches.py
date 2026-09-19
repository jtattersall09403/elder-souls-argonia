"""Vegetation clearance patches — the typed patch vocabulary the published
vegetation bundles and the runtime groundcover ring both obey (16f, decision
0070; the grading rule carried over verbatim from decision 0041).

A patch of kind ``vegetation-clearance`` is a typed record in
``world/sources/flora/vegetation-patches.json``. It carries, in world metres:

* ``hardClear`` — polygons of built ground: building parcels, streets, the
  commons, a track's running surface. Nothing wild grows there. A builder does
  not leave a tree standing in the middle of a floor.
* ``thinned``  — the worked fringe around the core: coppice, garden plots,
  trodden ground, reed beds cut for thatch. Growth is reduced, not removed.
* ``kept``     — the managed plants the place exists around, the Hist tree
  above all. These are protected: the patch never clears their ground.
* ``fringeFalloffM`` — optional per-patch override of the fringe width.

The scatter compiler no longer reads any of this. The patches are applied to
the *published* bundles by ``worldgen.apply_vegetation_patches`` after the
scatter (16g emits them for minor tracks, 16h for settlements, Phase 15 per
packet), and the runtime groundcover ring evaluates the same published list.

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
in ``packages/game-core/src/vegetation/vegetationPatches.ts``. Keep the two in
step: the Python decides which published instances go, the TypeScript evaluates
points for the runtime groundcover ring, and both must agree or grass grows
through floors the patch cleared.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np

from .scale import RAW_M

REPO_ROOT = Path(__file__).resolve().parents[3]
PROVINCE = REPO_ROOT / "apps" / "world-studio" / "public" / "province"
#: The authored patch list — one record, one source.
PATCHES_PATH = REPO_ROOT / "world" / "sources" / "flora" / "vegetation-patches.json"
#: The only patch kind this module knows.
PATCH_KIND = "vegetation-clearance"

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


# --- polygon geometry (mirrored in vegetationPatches.ts) ------------------

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


# --- the authored patch list ----------------------------------------------------------

def load_patches(path: Path | None = None) -> list[dict]:
    """The validated patch list from ``vegetation-patches.json``.

    One record, one source: 16g/16h/Phase 15 append patches here, the stage
    applies them to the published bundles and publishes a copy the runtime
    streams. Validation is strict and names the offender — a malformed patch
    that silently does nothing is a settlement full of trees.
    """
    path = Path(path) if path is not None else PATCHES_PATH
    if not path.exists():
        return []
    data = json.loads(path.read_text())
    if data.get("schemaVersion") != 1:
        raise ValueError(
            f"{path}: schemaVersion {data.get('schemaVersion')!r}, expected 1")
    patches = data.get("patches")
    if not isinstance(patches, list):
        raise ValueError(f"{path}: 'patches' must be a list")
    seen: set[str] = set()
    for index, patch in enumerate(patches):
        if not isinstance(patch, dict):
            raise ValueError(f"{path}: patch #{index} is not an object")
        pid = patch.get("id")
        where = f"patch {pid!r}" if isinstance(pid, str) else f"patch #{index}"
        if not isinstance(pid, str) or not pid:
            raise ValueError(f"{where}: 'id' must be a non-empty string")
        if pid in seen:
            raise ValueError(f"{where}: duplicate 'id'")
        seen.add(pid)
        if patch.get("kind") != PATCH_KIND:
            raise ValueError(f"{where}: 'kind' must be {PATCH_KIND!r}")
        owner = patch.get("owner")
        if not isinstance(owner, dict):
            raise ValueError(f"{where}: 'owner' must be an object")
        for key in ("record", "chunk"):
            if not isinstance(owner.get(key), str) or not owner[key]:
                raise ValueError(f"{where}: 'owner.{key}' must be a non-empty string")
        if not isinstance(patch.get("why"), str) or not patch["why"]:
            raise ValueError(f"{where}: 'why' must be a non-empty string")
        for field in ("hardClear", "thinned"):
            polys = patch.get(field)
            if polys is None:
                continue
            if not isinstance(polys, list):
                raise ValueError(f"{where}: '{field}' must be a list of polygons")
            for poly in polys:
                if not isinstance(poly, list) or len(poly) < 3:
                    raise ValueError(
                        f"{where}: '{field}' polygon needs at least 3 points")
                for point in poly:
                    if (not isinstance(point, (list, tuple)) or len(point) != 2
                            or not all(isinstance(v, (int, float)) for v in point)):
                        raise ValueError(
                            f"{where}: '{field}' point must be [x, z] metres")
        kept = patch.get("kept")
        if kept is not None:
            if not isinstance(kept, list):
                raise ValueError(f"{where}: 'kept' must be a list")
            for plant in kept:
                pos = plant.get("positionM") if isinstance(plant, dict) else None
                if (not isinstance(pos, (list, tuple)) or len(pos) != 2
                        or not all(isinstance(v, (int, float)) for v in pos)):
                    raise ValueError(f"{where}: 'kept.positionM' must be [x, z]")
                if not isinstance(plant.get("kind"), str):
                    raise ValueError(f"{where}: 'kept.kind' must be a string")
        if not (patch.get("hardClear") or patch.get("thinned") or patch.get("kept")):
            raise ValueError(
                f"{where}: declares no 'hardClear', 'thinned' or 'kept'")
    return patches


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

    The bbox is only the candidate set. A chunk is kept when the clearance
    actually reaches into it: a settlement wider than a chunk still keeps its
    interior chunks (they have no vertex in them, and leaving one out is
    exactly 0041 gotcha (c) — a chunk that keeps its old trees next to
    recompiled neighbours), while a long diagonal track no longer drags in the
    whole rectangle it happens to span.
    """
    x0, z0, x1, z1 = bounds_m(clearance)
    if x1 <= x0 and z1 <= z0:
        return []
    polys = [p for p in (clearance.get("hardClear") or []) + (clearance.get("thinned") or [])
             if p and len(p) >= 3]
    boxes = []
    for kept in clearance.get("kept", []) or []:
        x, z = kept["positionM"]
        r = KEPT_RADIUS_M.get(kept.get("kind"), DEFAULT_KEPT_RADIUS_M)
        boxes.append((x - r, z - r, x + r, z + r))

    out: list[tuple[int, int]] = []
    for cz in range(int(z0 // chunk_m), int(z1 // chunk_m) + 1):
        for cx in range(int(x0 // chunk_m), int(x1 // chunk_m) + 1):
            ax, az = cx * chunk_m, cz * chunk_m
            bx, bz = ax + chunk_m, az + chunk_m
            if any(bxa <= bx and ax <= bxb and bza <= bz and az <= bzb
                   for bxa, bza, bxb, bzb in boxes):
                out.append((cx, cz))
                continue
            probes = ((ax, az), (bx, az), (ax, bz), (bx, bz),
                      (ax + chunk_m / 2.0, az + chunk_m / 2.0))
            hit = False
            for poly in polys:
                # a chunk fully inside the polygon (interior), or a polygon
                # vertex inside the chunk (a thin shape crossing it)
                # or an edge crossing it with neither end in it (a band
                # thinner than a chunk, whose vertices are all outside)
                if any(_point_in_poly(p, poly) for p in probes) or \
                        any(ax <= float(vx) <= bx and az <= float(vz) <= bz for vx, vz in poly) or \
                        _edge_crosses_box(poly, ax, az, bx, bz):
                    hit = True
                    break
            if hit:
                out.append((cx, cz))
    return out


def _edge_crosses_box(poly, ax: float, az: float, bx: float, bz: float) -> bool:
    """Does any polygon edge pass through the axis-aligned box? Liang–Barsky."""
    n = len(poly)
    for i in range(n):
        x1, z1 = float(poly[i][0]), float(poly[i][1])
        x2, z2 = float(poly[(i + 1) % n][0]), float(poly[(i + 1) % n][1])
        dx, dz = x2 - x1, z2 - z1
        t0, t1 = 0.0, 1.0
        ok = True
        for p, q in ((-dx, x1 - ax), (dx, bx - x1), (-dz, z1 - az), (dz, bz - z1)):
            if p == 0.0:
                if q < 0.0:
                    ok = False
                    break
                continue
            r = q / p
            if p < 0.0:
                if r > t1:
                    ok = False
                    break
                t0 = max(t0, r)
            else:
                if r < t0:
                    ok = False
                    break
                t1 = min(t1, r)
        if ok and t0 <= t1:
            return True
    return False


def _point_in_poly(pt: tuple[float, float], poly) -> bool:
    """Even-odd ray cast; a point on the boundary may fall either way, which is
    harmless here (a boundary chunk is touched by the polygon regardless)."""
    x, z = pt
    inside = False
    n = len(poly)
    for i in range(n):
        x1, z1 = float(poly[i][0]), float(poly[i][1])
        x2, z2 = float(poly[(i + 1) % n][0]), float(poly[(i + 1) % n][1])
        if (z1 > z) != (z2 > z) and x < (x2 - x1) * (z - z1) / (z2 - z1) + x1:
            inside = not inside
    return inside


def keep_raster(shape: tuple[int, int], px_m: float,
                patches: list[dict] | None = None,
                path: Path | None = None) -> np.ndarray:
    """uint8 keep field over the province grid: 255 = wild, 0 = built ground.

    Only the settlements' own bounding windows are evaluated — the province is
    7.4 km of marsh with a handful of towns in it, and filling 60 M cells to
    255 costs nothing while evaluating them would cost minutes on every
    compile.
    """
    keep = np.full(shape, 255, dtype=np.uint8)
    records = patches if patches is not None else load_patches(path)
    for clearance in records:
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
