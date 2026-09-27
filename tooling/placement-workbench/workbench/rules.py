"""The measurable walk-packet checks as `check` rules (decision 0102
decision 2): `walkRule`, `floorEdgeRule`, `pathReachRule`, `propSeatRule`.

Every rule reads the PADDED ground (`pads.ground_for`: the frozen ground
with the scene's declared pads applied, the surface the runtime seats on)
and the loaded meshes, never a label. Each returns its measurements and a
list of failure strings (empty = pass); `check` puts both in its output and
`layout.check_failures` lists the strings.

The character limits are read from the controller's own source, never
copied: the capsule radius and the float height (ecctrl's `floatHeight`,
the most the suspension ray steps up) in
packages/game-core/src/physics/characterPhysics.ts, which
packages/character/src/PlayerBody.tsx:81 hands to ecctrl.
"""
from __future__ import annotations

import json
import math
import re
from functools import lru_cache

import numpy as np

from . import measure, paths
from .scene import plan_to_province

SCHEMA_VERSION = 1
CELL_M = 0.5                 # the walk grid
SLOPE_MAX_DEG = 30.0         # world 97 C14: ramps run <= 30 deg
GRID_MARGIN_M = 8.0          # the walk grid reaches this far beyond the place's pieces
DOOR_APPROACH_M = 10.0       # how far out from a threshold the approach cell is looked for
OPENING_REACH_M = 1.0        # a yard opening is reached within this of its outline
NO_OBSTACLE_KINDS = {"path", "paint"}
PATH_REACH_M = 1.0           # pathReachRule: a path ends within this of a threshold
PATH_BEARING_DEG = 45.0      # ... its last leg within this of the door's facing
EDGE_STEP_M = 0.25           # floorEdgeRule: perimeter sample spacing
EDGE_INSET_M = 0.3           # ... the underside is read this far inside the outline
FLOOR_BANDS = {"direct": 0.15, "plinth": 0.60, "pad": 0.10}
UNDERSIDE_BAND_M = 1.0       # ... only underside geometry within this over the piece's base
                             # is a floor edge; eaves and domes above it are out (planner
                             # ruling 2, 2026-09-26)
WADE_MAX_M = 0.7             # walkRule: a wet cell is walkable at most this deep over the
                             # padded ground (decision 0093: grounded under 0.77 m); deeper
                             # is "wading" (planner ruling 7, 2026-09-26)
SEAL_M = 0.5                 # walkRule: a doorway with a placed piece within this in front
HEAD_CLEARANCE_M = 1.9       # walkRule: a piece whose lowest point stands this far or more over
                             # the ground is walked under, never an obstacle (r5 review)
                             # of it is sealed and not a target (planner ruling 8, 2026-09-26)
SET_SPACING_TOL_M = 0.5      # propSeatRule: a yard-set member off its declared offset
UNEVEN_SINK_CAP_M = 0.15     # propSeatRule: a no-evidence prop may sink up to the ground's rise
                             # under its foot, at most this; beyond, "uneven ground: move it"
                             # (planner ruling 3, 16k fix 2 workbench round 3)
PHYSICS_TS = paths.REPO_ROOT / "packages" / "game-core" / "src" / "physics" / "characterPhysics.ts"


@lru_cache(maxsize=1)
def character() -> dict:
    """{capsuleRadiusM, stepM, source}: read from characterPhysics.ts."""
    text = PHYSICS_TS.read_text().splitlines()
    got = {}
    for name, key in (("CHARACTER_CAPSULE_RADIUS", "capsuleRadiusM"),
                      ("CHARACTER_FLOAT_HEIGHT", "stepM")):
        for n, line in enumerate(text, 1):
            m = re.match(rf"export const {name} = ([0-9.]+);", line.strip())
            if m:
                got[key] = float(m.group(1))
                got[key + "Source"] = f"{PHYSICS_TS.relative_to(paths.REPO_ROOT)}:{n} {name}"
                break
        else:
            raise ValueError(f"{PHYSICS_TS}: no `export const {name} = <number>;`")
    return got


def _srp():
    paths.bridge()
    from worldgen import settlement_run_pads as srp
    return srp


def _ground(cat, scene):
    from . import pads
    return pads.ground_for(cat, scene, None)


def _world_mesh(cat, p):
    return cat.mesh(p.asset).copy().apply_transform(measure._transform4(p))


def _lowest_m(cat, p) -> float | None:
    """The piece's lowest point (its world mesh's least height), or None
    without a pose."""
    if p.y is None:
        return None
    t = measure._transform4(p)
    return float((cat.mesh(p.asset).vertices @ t[2, :3]).min() + t[2, 3])


def _bearing_vec(deg: float) -> tuple[float, float]:
    """Province (dx, dz) of a bearing clockwise from north (north = -z)."""
    b = math.radians(deg)
    return math.sin(b), -math.cos(b)


def _angle_off(a: float, b: float) -> float:
    return abs((a - b + 180.0) % 360.0 - 180.0)


def _retaining(cat, p) -> bool:
    fams = [f for fam in _srp().RETAINING_WALLS.values() for f in fam]
    return any(p.asset.startswith(f) for f in fams)


# --------------------------------------------------------------------------
# doors and openings
# --------------------------------------------------------------------------
def _facing(d: dict) -> float | None:
    """A doorway's facing out: the record's facing, or the outline's outward
    bearing where the record's sideDeg is a radial bearing (or absent)."""
    return d["outwardDeg"] if d.get("facingOffOutwardDeg") or d["facingDeg"] is None \
        else d["facingDeg"]


def doors(cat, scene, every: bool = False) -> list[dict]:
    """The door each parcel binds (`door_report` best: the doorway the
    compile binds, id `door:<uid>`), facing out. With ``every``, also each
    other doorway record of the piece (id `door:<uid>.<k>`, k its index in
    the record), `bound` False; a record with no facing is skipped."""
    out = []
    for p in scene.pieces:
        rep = measure.door_report(cat, scene, p)
        if not rep:
            continue
        for k, d in enumerate(rep["doorways"]):
            bound = d is rep["best"]
            if not (bound or every):
                continue
            facing = _facing(d)
            if facing is None:
                continue
            out.append({"id": f"door:{p.uid}" if bound else f"door:{p.uid}.{k}", "uid": p.uid,
                        "kind": "door", "doorway": k, "bound": bound, "source": d["source"],
                        "thresholdM": d["thresholdM"], "facingDeg": facing,
                        "otherDoorways": len(rep["doorways"]) - 1})
    return out


def sealed_by(cat, scene, target: dict) -> str | None:
    """The placed piece (not the door's own building, not a path) within
    SEAL_M in front of a doorway, sampled every 0.1 m out along its facing
    from the threshold; None when the doorway is open."""
    from shapely.geometry import LineString, Polygon
    own = _own_pieces(scene, target["uid"])
    dx, dz = _bearing_vec(target["facingDeg"])
    tx, tz = target["thresholdM"]
    line = LineString([(tx + dx * 0.05, tz + dz * 0.05), (tx + dx * SEAL_M, tz + dz * SEAL_M)])
    ground = _ground(cat, scene)
    for q in scene.pieces:
        if q.uid in own or q.y is None:
            continue
        if (q.role or {}).get("kind") in NO_OBSTACLE_KINDS or \
                cat.row(q.asset).get("category") in NO_OBSTACLE_KINDS:
            continue
        if not Polygon(measure.footprint_province(cat, q)).intersects(line):
            continue
        low = _lowest_m(cat, q)
        if low is not None and low - max(_surface_m(cat, scene, ground, x, z)
                                         for x, z in line.coords) >= HEAD_CLEARANCE_M:
            continue                 # hung over the doorway's approach, walked under
        return q.uid
    return None


def _surface_m(cat, scene, ground, x: float, z: float) -> float:
    """The walk surface at (x, z), as WalkGrid reads it: the padded ground,
    or the top of a walkable deck there where one stands higher (a head
    clearance is measured from what the player stands on; r5 review)."""
    from shapely.geometry import Point, Polygon
    h = float(ground.chunk_height(x, z))
    for p in scene.pieces:
        if not (getattr(p, "walkable", False) and p.y is not None):
            continue
        if not Polygon(measure.footprint_province(cat, p)).contains(Point(x, z)):
            continue
        mesh = _world_mesh(cat, p)
        top = float(mesh.bounds[1][2]) + 1.0
        locs, _r, _t = mesh.ray.intersects_location([[x, -z, top]], [[0.0, 0.0, -1.0]],
                                                    multiple_hits=False)
        if len(locs):
            h = max(h, float(locs[0][2]))
    return h


def openings(cat, scene) -> list[dict]:
    """A parcel with no doorway (a well, a yard): reached at its outline."""
    out = []
    for p in scene.pieces:
        if (p.role or {}).get("kind") != "parcel" or cat.doorways(p.asset):
            continue
        if (cat.row(p.asset).get("anchorClass") or "ground") == "water":
            continue
        out.append({"id": f"opening:{p.uid}", "uid": p.uid, "kind": "opening",
                    "outlineM": measure.footprint_province(cat, p)})
    return out


def socket_targets(cat, scene) -> list[dict]:
    """The sockets walkRule targets in their own right (planner ruling 1, 16k
    round 5): every npc, idle and container socket of the layout the scene
    was applied from (its `socket` ops and the yard sets its `group place`
    ops lay, by the compile's rule `sockets.socket_ops`; a scene with no
    layout file: the `role.socket` its members carry) and the class-default socket
    of every other container piece (`fill.<uid slug>`), the same ids the
    compile gives them (`worldgen.sockets`). Each: {id, kind, socketKind,
    uid (the host piece, or None), outlineM (the host's footprint, or a
    point's), reason (why it has no place in the scene, or None)}."""
    from shapely.geometry import Point
    from . import layout as lay
    paths.bridge()
    from worldgen import sockets as sk
    vocab = sk.load_vocabulary()

    def category_of(asset: str) -> str | None:
        try:
            return cat.row(asset).get("category")
        except (KeyError, ValueError):
            return None
    ref = (scene.layout or {}).get("path")
    full = paths.REPO_ROOT / ref if ref else None      # absolute stays absolute
    if full and full.exists():
        # the compile's own rule over the same layout (`sockets.socket_ops`)
        ops = sk.socket_ops(lay.split_sockets(json.loads(full.read_text()), ref),
                            category_of, vocab)
    else:
        # a scene with no layout file: the sockets its yard-set members carry
        ops = [{**p.role["socket"], "op": "socket", "host": p.uid} for p in scene.pieces
               if (p.role or {}).get("socket")]
    hosted = {op["host"] for op in ops if op.get("kind") == "container" and op.get("host")}
    for q in scene.pieces:
        if q.uid not in hosted and category_of(q.asset) == "container":
            ring = (q.role or {}).get("kind") == "ring"      # the compile's id (16k r8 rule 5)
            sid = (sk.fill_socket_id(q.role["placementId"], scene.placeId) if ring
                   else sk.FILL_PREFIX + sk.slug(q.uid))
            ops.append(sk.default_fill_op(q.uid, sid, q.asset, vocab,
                                          "dressing" if ring else "placed"))
    parcels = {(q.role or {}).get("id"): q for q in scene.pieces
               if (q.role or {}).get("kind") == "parcel"}
    by_uid = {q.uid: q for q in scene.pieces}
    out = []
    for op in ops:
        if op.get("kind") not in sk.REACH_KINDS:
            continue
        row = {"id": f"socket:{op['id']}", "kind": "socket", "socketKind": op["kind"],
               "uid": None, "outlineM": None, "reason": None}
        if op.get("host"):
            host = by_uid.get(op["host"]) or parcels.get(op["host"])
            if host is None:
                row["reason"] = f"host {op['host']!r} is no piece of the scene"
            else:
                row.update(uid=host.uid, outlineM=measure.footprint_province(cat, host))
        else:
            x, z = (float(v) for v in op["at"])
            row["outlineM"] = list(Point(x, z).buffer(0.05, 8).exterior.coords)
        out.append(row)
    return out


def _own_pieces(scene, uid: str) -> set[str]:
    """The door's own building: the piece and the assembly members bound to
    its parcel (a porch, steps or a door leaf stand in front of it)."""
    shell = scene.piece(uid)
    pid = (shell.role or {}).get("id")
    return {uid} | {q.uid for q in scene.pieces if pid and (q.role or {}).get("kind") == "assembly"
                    and q.role.get("id") == pid and q.role.get("layer") in ("door", "porch", "steps")}


def terminal(scene) -> tuple[float, float] | None:
    """The place's road terminal: the start of the layout's the-street, else
    the blueprint's first networkTerminal (entryUV x the province extent)."""
    for path in scene.paths:
        if path["id"].endswith(".the-street") and path["pointsM"]:
            return tuple(path["pointsM"][0])
    import json
    bp = paths.BLUEPRINTS / f"{scene.placeId}.json"
    if bp.exists():
        terms = json.loads(bp.read_text())["blueprint"].get("networkTerminals") or []
        if terms:
            extent = scene.ground().extent_m
            u, v = terms[0]["entryUV"]
            return (u * extent, v * extent)
    return None


# --------------------------------------------------------------------------
# walkRule
# --------------------------------------------------------------------------
class WalkGrid:
    """The 0.5 m walk grid over the place: surface height (padded ground, or
    a declared walkable deck's top), the surface's source (-1 ground, else
    the deck's index) and the piece blocking each cell (-1 none)."""

    def __init__(self, cat, scene):
        from shapely import contains_xy
        from shapely.geometry import Polygon
        ch = character()
        self.step_m, self.radius_m = ch["stepM"], ch["capsuleRadiusM"]
        g = _ground(cat, scene)
        meta = g.meta
        polys = {p.uid: measure.footprint_province(cat, p) for p in scene.pieces}
        pts = [xz for poly in polys.values() for xz in poly]
        pts += [tuple(q) for path in scene.paths for q in path["pointsM"]]
        term = terminal(scene)
        if term:
            pts.append(term)
        xs, zs = [p[0] for p in pts], [p[1] for p in pts]
        cx, cz = meta["centreM"]
        lim = meta["halfM"] - 1.0
        x0 = max(min(xs) - GRID_MARGIN_M, cx - lim)
        x1 = min(max(xs) + GRID_MARGIN_M, cx + lim)
        z0 = max(min(zs) - GRID_MARGIN_M, cz - lim)
        z1 = min(max(zs) + GRID_MARGIN_M, cz + lim)
        self.nx = int((x1 - x0) / CELL_M) + 1
        self.nz = int((z1 - z0) / CELL_M) + 1
        self.x0, self.z0 = x0, z0
        gx = x0 + np.arange(self.nx) * CELL_M
        gz = z0 + np.arange(self.nz) * CELL_M
        self.X, self.Z = np.meshgrid(gx, gz)            # [iz, ix]
        # vectorised samplers, identical to the pointwise ones (r4 review)
        self.H = g.chunk_heights(self.X, self.Z)
        # the recorded water level where the survey marks water (NaN elsewhere);
        # its depth is read over the final surface (padded ground or deck top)
        self.level = g.water_levels_where_wet(self.X, self.Z)
        self.src = np.full(self.X.shape, -1, int)
        self.block = np.full(self.X.shape, -1, int)
        self.uids = [p.uid for p in scene.pieces]
        self.decks = []
        obstacles = []
        for i, p in enumerate(scene.pieces):
            row = cat.row(p.asset)
            if (p.role or {}).get("kind") in NO_OBSTACLE_KINDS or row.get("category") in NO_OBSTACLE_KINDS:
                continue
            poly = Polygon(polys[p.uid])
            if getattr(p, "walkable", False) and p.y is not None:
                self._deck(cat, p, i, poly)
                continue
            obstacles.append((i, p, poly))
        # every deck is laid before any obstacle is judged: a head clearance
        # is read over the final walk surface, whatever the pieces' order
        for i, p, poly in obstacles:
            inside = contains_xy(poly.buffer(self.radius_m), self.X, self.Z)
            low = _lowest_m(cat, p)
            if low is not None:
                # a piece hung at or above head height over a cell is walked
                # under there (a lantern under an eave; r5 review)
                inside &= ~((low - self.H) >= HEAD_CLEARANCE_M)   # no ground: blocked
            self.block[inside & (self.block < 0)] = i
        with np.errstate(invalid="ignore"):
            self.depth = np.where(np.isnan(self.level), 0.0, np.maximum(0.0, self.level - self.H))
        self.wet = self.depth > 0.0
        self.deep = self.depth > WADE_MAX_M

    def _deck(self, cat, p, i, poly):
        from shapely import contains_xy
        inside = contains_xy(poly, self.X, self.Z)
        if not inside.any():
            return
        mesh = _world_mesh(cat, p)
        iz, ix = np.nonzero(inside)
        top = float(mesh.bounds[1][2]) + 1.0
        origins = np.column_stack([self.X[iz, ix], -self.Z[iz, ix], np.full(len(iz), top)])
        dirs = np.tile([0.0, 0.0, -1.0], (len(iz), 1))
        locs, rays, _tri = mesh.ray.intersects_location(origins, dirs, multiple_hits=False)
        for loc, r in zip(locs, rays):
            self.H[iz[r], ix[r]] = float(loc[2])
            self.src[iz[r], ix[r]] = i
        self.decks.append(p.uid)

    def cell(self, x: float, z: float) -> tuple[int, int] | None:
        ix, iz = int(round((x - self.x0) / CELL_M)), int(round((z - self.z0) / CELL_M))
        if 0 <= ix < self.nx and 0 <= iz < self.nz:
            return iz, ix
        return None

    def xz(self, c) -> tuple[float, float]:
        return float(self.X[c]), float(self.Z[c])

    def edge(self, a, b) -> tuple[bool, str | None, float]:
        """(walkable, reason, value) for the edge a -> b."""
        if self.block[b] >= 0:
            return False, f"obstacle {self.uids[self.block[b]]}", 0.0
        if self.deep[b]:
            return False, "wading", float(self.depth[b])
        run = CELL_M * math.hypot(a[0] - b[0], a[1] - b[1])
        dh = abs(float(self.H[b] - self.H[a]))
        slope = math.degrees(math.atan2(dh, run))
        if self.src[a] != self.src[b] and dh > self.step_m:
            return False, "step", dh
        if slope > SLOPE_MAX_DEG:
            return False, "slope", slope
        return True, None, slope

    def graph(self):
        """(csr graph of walkable edges weighted by 3D length, per-edge slope
        and step arrays keyed by (i, j) flat index)."""
        from scipy.sparse import csr_matrix
        n = self.nx * self.nz
        idx = np.arange(n).reshape(self.nz, self.nx)
        free = (self.block < 0) & ~self.deep
        rows, cols, w = [], [], []
        for dz, dx in ((0, 1), (1, 0), (1, 1), (1, -1)):
            a = (slice(0, self.nz - dz), slice(max(0, -dx), self.nx - max(0, dx)))
            b = (slice(dz, self.nz), slice(max(0, dx), self.nx + min(0, dx)))
            run = CELL_M * math.hypot(dx, dz)
            dh = np.abs(self.H[b] - self.H[a])
            ok = free[a] & free[b] & (np.degrees(np.arctan2(dh, run)) <= SLOPE_MAX_DEG)
            ok &= (self.src[a] == self.src[b]) | (dh <= self.step_m)
            ia, ib = idx[a][ok], idx[b][ok]
            ww = np.sqrt(run * run + dh[ok] ** 2)
            rows += [ia, ib]
            cols += [ib, ia]
            w += [ww, ww]
        rows, cols, w = np.concatenate(rows), np.concatenate(cols), np.concatenate(w)
        return csr_matrix((w, (rows, cols)), shape=(n, n))


def _free_near(grid: WalkGrid, x: float, z: float, reach: float = 2.0):
    """The free cell nearest (x, z) within `reach`, or None."""
    best = None
    k = int(reach / CELL_M) + 1
    c = grid.cell(x, z)
    if c is None:
        return None
    for iz in range(max(0, c[0] - k), min(grid.nz, c[0] + k + 1)):
        for ix in range(max(0, c[1] - k), min(grid.nx, c[1] + k + 1)):
            if grid.block[iz, ix] >= 0:
                continue
            d = math.hypot(grid.X[iz, ix] - x, grid.Z[iz, ix] - z)
            if d <= reach and (best is None or d < best[0]):
                best = (d, (iz, ix))
    return None if best is None else best[1]


def _door_cells(grid: WalkGrid, scene, target: dict):
    """The approach cell out along the door's facing: the first free cell
    from the threshold out to DOOR_APPROACH_M, stepping over the door's own
    building (a recessed doorway, a porch); a cell another piece blocks
    first is the blocker."""
    own = _own_pieces(scene, target["uid"])
    dx, dz = _bearing_vec(target["facingDeg"])
    tx, tz = target["thresholdM"]
    for i in range(int(DOOR_APPROACH_M / 0.25) + 1):
        d = i * 0.25
        c = grid.cell(tx + dx * d, tz + dz * d)
        if c is None:
            return [], f"the approach leaves the walk grid at {d:.2f} m"
        b = grid.block[c]
        if b < 0:
            return [c], None
        if grid.uids[b] not in own:
            return [], (f"the approach is blocked by {grid.uids[b]} {d:.2f} m out along the "
                        f"facing {target['facingDeg']:.0f} deg (cell "
                        f"[{grid.X[c]:.1f}, {grid.Z[c]:.1f}])")
    return [], f"no free cell within {DOOR_APPROACH_M} m out along the facing"


def _opening_cells(grid: WalkGrid, target: dict):
    from shapely import contains_xy
    from shapely.geometry import Polygon
    poly = Polygon(target["outlineM"])
    ring = poly.buffer(grid.radius_m + OPENING_REACH_M).difference(poly.buffer(grid.radius_m))
    inside = contains_xy(ring, grid.X, grid.Z) & (grid.block < 0)
    cells = list(zip(*np.nonzero(inside)))
    return cells, None if cells else f"no free cell within {OPENING_REACH_M} m of its outline"


def _why_unreached(grid: WalkGrid, dist: np.ndarray, goal) -> dict:
    """The reached cell nearest the goal and the edge out of it toward the
    goal that fails: the blocking cell and the reason (slope, step, obstacle)."""
    reached = np.isfinite(dist.reshape(grid.nz, grid.nx))
    gz, gx = grid.xz(goal)[1], grid.xz(goal)[0]
    dd = np.where(reached, np.hypot(grid.X - gx, grid.Z - gz), np.inf)
    a = np.unravel_index(int(np.argmin(dd)), dd.shape)
    best = None
    for dz in (-1, 0, 1):
        for dx in (-1, 0, 1):
            b = (a[0] + dz, a[1] + dx)
            if (dz, dx) == (0, 0) or not (0 <= b[0] < grid.nz and 0 <= b[1] < grid.nx):
                continue
            if reached[b]:
                continue
            ok, why, val = grid.edge(a, b)
            gain = dd[a] - math.hypot(grid.X[b] - gx, grid.Z[b] - gz)
            if not ok and (best is None or gain > best[0]):
                best = (gain, b, why, val)
    out = {"lastReachedM": [round(v, 2) for v in grid.xz(a)],
           "lastReachedToTargetM": round(float(dd[a]), 2)}
    if best:
        _g, b, why, val = best
        out.update({"blockingCellM": [round(v, 2) for v in grid.xz(b)], "reason": why,
                    "value": round(val, 3)})
    return out


def _route_stats(grid: WalkGrid, pred: np.ndarray, start: int, end: int) -> dict:
    cells = [end]
    while cells[-1] != start:
        cells.append(int(pred[cells[-1]]))
    cells.reverse()
    pts, length, steep, step, wet, wade = [], 0.0, 0.0, 0.0, 0, 0.0
    for k, i in enumerate(cells):
        c = divmod(i, grid.nx)
        pts.append([round(float(grid.X[c]), 2), round(float(grid.H[c]), 2),
                    round(float(grid.Z[c]), 2)])
        wet += int(grid.wet[c])
        wade = max(wade, float(grid.depth[c]))
        if k:
            p = divmod(cells[k - 1], grid.nx)
            run = CELL_M * math.hypot(c[0] - p[0], c[1] - p[1])
            dh = abs(float(grid.H[c] - grid.H[p]))
            length += math.hypot(run, dh)
            steep = max(steep, math.degrees(math.atan2(dh, run)))
            if grid.src[c] != grid.src[p]:
                step = max(step, dh)
    return {"routeM": round(length, 2), "steepestDeg": round(steep, 1),
            "largestStepM": round(step, 3), "wetCells": wet, "deepestWadeM": round(wade, 3),
            "points": pts}


def walk(cat, scene, keep_points: bool = False) -> dict:
    """walkRule: a route from the road terminal to every doorway record of
    every placed building (the bound one always; any other unless a placed
    piece stands within SEAL_M in front of it: `sealed`), every yard
    opening and every npc, idle and container socket (`socket_targets`:
    reached at a free cell within OPENING_REACH_M of its host's footprint or
    its point; target id `socket:<id>`, the route the compile's reach gate
    reads), over the padded ground and the placed pieces (footprints grown
    by the capsule radius; declared walkable decks are surface). Each edge
    is within the slope limit; the step limit applies only where the surface
    changes source (ground to deck, deck to deck: what ecctrl's float ray
    steps over), slope governs ground to ground; a cell whose water stands
    deeper than WADE_MAX_M over the surface is not walkable ("wading"). One
    shortest-path search from the terminal (Dijkstra: A* with a zero
    heuristic, every target at once)."""
    from scipy.sparse.csgraph import dijkstra
    ch = character()
    grid = WalkGrid(cat, scene)
    out = {"schemaVersion": SCHEMA_VERSION, "cellM": CELL_M, "slopeMaxDeg": SLOPE_MAX_DEG,
           "stepM": grid.step_m, "stepSource": ch["stepMSource"],
           "capsuleRadiusM": grid.radius_m, "radiusSource": ch["capsuleRadiusMSource"],
           "wadeMaxM": WADE_MAX_M, "grid": [grid.nx, grid.nz], "walkableDecks": grid.decks,
           "targets": [], "sealed": [], "failures": []}
    term = terminal(scene)
    if term is None:
        out["failures"].append("walk: the place has no road terminal (no the-street path, "
                               "no networkTerminals)")
        return out
    start = _free_near(grid, *term)
    out["terminalM"] = [round(term[0], 2), round(term[1], 2)]
    if start is None:
        out["failures"].append(f"walk: the road terminal {out['terminalM']} has no free cell "
                               f"within 2 m")
        return out
    csr = grid.graph()
    s = start[0] * grid.nx + start[1]
    dist, pred = dijkstra(csr, directed=False, indices=s, return_predecessors=True)
    for t in doors(cat, scene, every=True) + openings(cat, scene) + socket_targets(cat, scene):
        row = {k: t[k] for k in ("id", "uid", "kind")}
        what = t["kind"]
        if t["kind"] == "socket":
            what = f"{t['socketKind']} socket {t['id'].removeprefix('socket:')}"
            if t["reason"]:
                row.update(ok=False, reason=t["reason"])
                out["failures"].append(f"{t['uid'] or t['id']}: walk to its {what}: {t['reason']}")
                out["targets"].append(row)
                continue
        if t["kind"] == "door":
            row.update(thresholdM=t["thresholdM"], facingDeg=round(t["facingDeg"], 1),
                       doorway=t["doorway"], bound=t["bound"], source=t["source"])
            if not t["bound"]:
                what = f"doorway {t['doorway']} ({t['source']})"
                seal = sealed_by(cat, scene, t)
                if seal:
                    out["sealed"].append({**row, "sealedBy": seal})
                    continue
        cells, why = (_door_cells(grid, scene, t) if t["kind"] == "door"
                      else _opening_cells(grid, t))
        if not cells:
            row.update(ok=False, reason=why)
            out["failures"].append(f"{t['uid'] or t['id']}: walk to its {what}: {why}")
            out["targets"].append(row)
            continue
        flat = [c[0] * grid.nx + c[1] for c in cells]
        end = min(flat, key=lambda i: dist[i])
        if not np.isfinite(dist[end]):
            got = _why_unreached(grid, dist, cells[0])
            row.update(ok=False, **got)
            why = (f"no route from the terminal; blocked at {got.get('blockingCellM')} by "
                   f"{got.get('reason')} ({got.get('value')}), last reached cell "
                   f"{got['lastReachedToTargetM']} m short")
            row["reason"] = why
            out["failures"].append(f"{t['uid'] or t['id']}: walk to its {what}: {why}")
        else:
            stats = _route_stats(grid, pred, s, end)
            if not keep_points:
                stats.pop("points")
            row.update(ok=True, **stats)
        out["targets"].append(row)
    return out


def _polyline(points: list) -> list:
    """The route's cell centres with every point dropped whose step in and
    step out are the same vector (to 1 mm): the same polyline, fewer points."""
    if len(points) < 3:
        return points
    out = [points[0]]
    for prev, here, nxt in zip(points, points[1:], points[2:]):
        if any(abs((here[k] - prev[k]) - (nxt[k] - here[k])) > 0.001 for k in range(3)):
            out.append(here)
    out.append(points[-1])
    return out


def walk_routes(cat, scene) -> dict:
    """The navmesh socket's walkable ways (planner ruling 1, 16k fix 2
    workbench round 3: routes only, the walk grid is never written):
    {schemaVersion, cellM, stepM, slopeMaxDeg, wadeMaxM, routes {target id:
    {points [[x, y, z]] province metres, routeM, steepestDeg, largestStepM,
    deepestWadeM}}} for every target walkRule reached. `wb.py export
    --write` puts it in the blueprint as `walkRoutes`; the bundle export
    copies it onto the place (`walk_routes_field`)."""
    got = walk(cat, scene, keep_points=True)
    # a bound door's route names the parcel its piece is bound to, so the
    # compile's door-reach gate finds it by the door record's parcelId (16k
    # fix 2 ruling 4: walkRule's route is the one door-reach gate)
    parcel_of = {p.uid: (p.role or {}).get("id") for p in scene.pieces
                 if (p.role or {}).get("kind") == "parcel"}
    routes = {t["id"]: {"points": _polyline(t["points"]),
                        **{k: t[k] for k in ("routeM", "steepestDeg", "largestStepM",
                                             "deepestWadeM")},
                        **({"parcelId": parcel_of[t["uid"]]}
                           if t.get("kind") == "door" and t.get("bound")
                           and parcel_of.get(t.get("uid")) else {})}
              for t in got["targets"] if t.get("ok")}
    return {"schemaVersion": SCHEMA_VERSION, "cellM": CELL_M, "stepM": got["stepM"],
            "slopeMaxDeg": SLOPE_MAX_DEG, "wadeMaxM": WADE_MAX_M, "routes": routes}


# --------------------------------------------------------------------------
# floorEdgeRule
# --------------------------------------------------------------------------
def underside(cat, p, points_xz) -> list[float | None]:
    """The lowest mesh geometry straight above each province point (an
    upward ray from below the piece, its first hit), None where the ray
    meets nothing."""
    mesh = _world_mesh(cat, p)
    low = float(mesh.bounds[0][2]) - 1.0
    origins = np.array([[x, -z, low] for x, z in points_xz])
    dirs = np.tile([0.0, 0.0, 1.0], (len(origins), 1))
    locs, rays, _tri = mesh.ray.intersects_location(origins, dirs, multiple_hits=False)
    out: list[float | None] = [None] * len(origins)
    for loc, r in zip(locs, rays):
        out[r] = float(loc[2])
    return out


def _perimeter(outline, step: float):
    """(point, inward unit normal) every `step` metres round the outline."""
    from shapely.geometry import Point, Polygon
    poly = Polygon(outline)
    ring = poly.exterior
    n = max(4, int(ring.length / step))
    out = []
    for k in range(n):
        s = ring.interpolate(k * ring.length / n)
        t = ring.interpolate(min(ring.length, k * ring.length / n + 0.05))
        tx, tz = t.x - s.x, t.y - s.y
        norm = math.hypot(tx, tz) or 1.0
        nx, nz = -tz / norm, tx / norm
        if not poly.contains(Point(s.x + nx * 0.05, s.y + nz * 0.05)):
            nx, nz = -nx, -nz
        out.append(((s.x, s.y), (nx, nz)))
    return out


def buildings(cat, scene) -> list:
    """Building / shell pieces: parcels on the ground with a doorway or a
    declared pad; retaining walls (0101) and water pieces excluded."""
    out = []
    for p in scene.pieces:
        if (p.role or {}).get("kind") != "parcel" or p.y is None or _retaining(cat, p):
            continue
        if (cat.row(p.asset).get("anchorClass") or "ground") == "water":
            continue
        if cat.doorways(p.asset) or p.pad is not None:
            out.append(p)
    return out


def floor_edge(cat, scene, fit_for) -> dict:
    """floorEdgeRule: every EDGE_STEP_M round a building's outline, the
    lowest underside within EDGE_INSET_M inside it over the padded ground
    below that point; a gap over the fit's band fails unless a retaining run
    piece stands under the sample. Only underside geometry within
    UNDERSIDE_BAND_M over the piece's base is a floor edge: a sample whose
    lowest geometry stands higher (an eave, a dome's bulge) is counted as
    `overhang` and not judged. ``fit_for(piece)`` is the parcel's
    groundFit (the blueprint's override, else the kit record's)."""
    from shapely.geometry import Point, Polygon
    from shapely.ops import unary_union
    g = _ground(cat, scene)
    walls = [Polygon(measure.footprint_province(cat, q)) for q in scene.pieces
             if _retaining(cat, q)]
    wall_zone = unary_union(walls).buffer(EDGE_INSET_M) if walls else None
    rows, failures = {}, []
    for p in buildings(cat, scene):
        fit = fit_for(p)
        band = FLOOR_BANDS.get(fit)
        if band is None:
            rows[p.uid] = {"fit": fit, "note": f"fit {fit!r} has no floor-edge band (direct, "
                                               f"plinth, pad only)"}
            continue
        perim = _perimeter(measure.footprint_province(cat, p), EDGE_STEP_M)
        insets = (0.02, 0.1, 0.2, EDGE_INSET_M)
        pts = [(s[0] + n[0] * d, s[1] + n[1] * d) for s, n in perim for d in insets]
        hits = underside(cat, p, pts)
        base = p.y - float(cat.row(p.asset)["originOffsetM"][2]) * p.scale
        worst, worst_over, over, empty, retained, overhang = None, None, 0, 0, 0, 0
        for k, (s, _n) in enumerate(perim):
            best, high = None, False
            for j in range(len(insets)):
                h = hits[k * len(insets) + j]
                if h is None:
                    continue
                if h - base > UNDERSIDE_BAND_M:
                    high = True
                    continue
                x, z = pts[k * len(insets) + j]
                if best is None or h < best[0]:
                    best = (h, h - g.chunk_height(x, z), (x, z))
            if best is None:
                overhang += int(high)
                empty += int(not high)
                continue
            # how high over the piece's own base the geometry is: an eave or a
            # dome's bulge reads metres up, a floor edge near 0
            got = {"gapM": round(best[1], 3), "atM": [round(v, 2) for v in best[2]],
                   "aboveBaseM": round(best[0] - base, 3)}
            if worst is None or best[1] > worst["gapM"]:
                worst = got
            if best[1] <= band:
                continue
            if wall_zone is not None and wall_zone.contains(Point(*s)):
                retained += 1
                continue
            over += 1
            if worst_over is None or best[1] > worst_over["gapM"]:
                worst_over = got
        row = {"fit": fit, "bandM": band, "samples": len(perim), "noGeometry": empty,
               "overhang": overhang, "overBand": over, "retained": retained, "worst": worst,
               "worstUnretained": worst_over}
        rows[p.uid] = row
        if over:
            failures.append(f"{p.uid}: floor edge stands {worst_over['gapM']:.2f} m over the padded "
                            f"ground at {worst_over['atM']} (> {band} m for {fit}; the geometry "
                            f"there is {worst_over['aboveBaseM']:.2f} m over the piece's base); {over} of "
                            f"{len(perim)} perimeter samples over the band, no retaining run "
                            f"under them")
    return {"pieces": rows, "failures": failures}


# --------------------------------------------------------------------------
# pathReachRule
# --------------------------------------------------------------------------
def path_reach(cat, scene) -> dict:
    """pathReachRule: every bound door has a path END within PATH_REACH_M of
    its threshold whose last leg (end back to the previous point) bears
    within PATH_BEARING_DEG of the door's facing; every yard opening a path
    end within PATH_REACH_M of its outline."""
    from shapely.geometry import Point, Polygon
    ends = []
    for path in scene.paths:
        pts = path["pointsM"]
        if len(pts) < 2:
            continue
        for end, prev in ((pts[-1], pts[-2]), (pts[0], pts[1])):
            leg = math.degrees(math.atan2(prev[0] - end[0], -(prev[1] - end[1]))) % 360.0
            ends.append({"path": path["id"], "endM": end, "legDeg": leg})
    rows, failures = {}, []
    for t in doors(cat, scene):
        best = None
        for e in ends:
            d = math.hypot(e["endM"][0] - t["thresholdM"][0], e["endM"][1] - t["thresholdM"][1])
            off = _angle_off(e["legDeg"], t["facingDeg"])
            ok = d <= PATH_REACH_M and off <= PATH_BEARING_DEG
            key = (not ok, d)
            if best is None or key < best[0]:
                best = (key, {"path": e["path"], "endToThresholdM": round(d, 2),
                              "legOffFacingDeg": round(off, 1), "ok": ok})
        row = best[1] if best else {"ok": False, "path": None}
        rows[t["uid"]] = row
        if not row["ok"]:
            failures.append(
                f"{t['uid']}: no path ends at its door: nearest end "
                + (f"{row['path']} {row['endToThresholdM']} m off (<= {PATH_REACH_M}), last leg "
                   f"{row['legOffFacingDeg']} deg off the facing (<= {PATH_BEARING_DEG})"
                   if row["path"] else "none (no paths)"))
    for t in openings(cat, scene):
        poly = Polygon(t["outlineM"])
        best = min(((poly.distance(Point(*e["endM"])), e["path"]) for e in ends), default=None)
        ok = best is not None and best[0] <= PATH_REACH_M
        rows[t["uid"]] = {"path": best and best[1],
                          "endToOutlineM": None if best is None else round(best[0], 2), "ok": ok}
        if not ok:
            failures.append(f"{t['uid']}: no path ends within {PATH_REACH_M} m of the opening "
                            f"(nearest end {rows[t['uid']]['endToOutlineM']} m)")
    return {"pieces": rows, "failures": failures}


# --------------------------------------------------------------------------
# propSeatRule
# --------------------------------------------------------------------------
def _parent_of(scene, p):
    from workbench.scene import hung_on
    uid = hung_on(p)
    if uid:
        try:
            return scene.piece(uid)
        except KeyError:
            return None
    return None


def props(cat, scene) -> list:
    """Dressing: assembly members and unbound pieces (no parcel, run or
    landmark role), on the ground or mounted; hulls and beached craft are
    judged by their own rules."""
    out = []
    for p in scene.pieces:
        kind = (p.role or {}).get("kind")
        if kind in ("parcel", "run", "landmark") or p.beached or p.y is None:
            continue
        if (cat.row(p.asset).get("anchorClass") or "ground") == "water":
            continue
        out.append(p)
    return out


def _set_members(scene) -> dict:
    """{uid: (set, member, anchor piece)} for every yard-set member placed by
    `group place` whose anchor is still in the scene."""
    from . import assembly
    # a malformed set raises: a spacing check that silently judges nothing
    # is a gate that cannot fail (r4 review)
    sets = assembly.yard_sets()
    out = {}
    for p in scene.pieces:
        name = next((n.split("from group ", 1)[1].split(":", 1)[0] for n in p.notes
                     if n.startswith("from group ")), None)
        st = sets.get(name)
        if not st:
            continue
        # the longest member uid the piece's uid ends with (`spit-pot` over
        # `pot`), so the prefix is the group op's own
        m = max((m for m in st["members"] if p.uid.endswith(m["uid"])),
                key=lambda m: len(m["uid"]), default=None)
        if m is None:
            continue
        prefix = p.uid[: len(p.uid) - len(m["uid"])]
        try:
            anchor = scene.piece(prefix + st["anchor"])
        except KeyError:
            continue
        out[p.uid] = (st, m, anchor)
    return out


def prop_seat(cat, scene) -> dict:
    """propSeatRule: a mounted item's exact gap to its parent within the
    miner's contact (0.03 m). A ground item: its lowest foot point
    (`float_under`) no more than 0.03 m over the padded ground; its pose
    within 0.03 m of the runtime's seat (`measure.seat`: the designed sink,
    the row's sink evidence, on the padded ground); and a burial deeper than
    0.03 m only where that sink has evidence (a `policy-fallback` sink is
    none) or, for a no-evidence prop, up to the ground's rise under its foot
    (`groundRiseM`: the runtime seat on sloping ground buries the uphill
    foot) capped at UNEVEN_SINK_CAP_M, beyond which it fails "uneven
    ground: move it". A yard-set member within SET_SPACING_TOL_M of its declared offset
    from the set's anchor."""
    mm = measure._mm()
    tol = mm.CONTACT_M
    g = _ground(cat, scene)
    members = _set_members(scene)
    rows, failures = {}, []
    for p in props(cat, scene):
        row = cat.row(p.asset)
        parent = _parent_of(scene, p)
        r = {}
        if parent is not None and parent.y is not None:
            got = measure.contact(cat, p, parent)
            r = {"on": parent.uid, "gapM": got["gapM"], "bandM": [0.0, tol]}
            if got["gapM"] > tol:
                failures.append(f"{p.uid}: stands {got['gapM']:.3f} m off {parent.uid} "
                                f"(> {tol} m contact)")
        else:
            fl = measure.float_under(cat, g, p)
            seat = measure.seat(cat, g, p)
            off = p.y - seat["y"]
            ev = str((row.get("designedSinkM") or {}).get("evidence") or "none")
            gap = fl["footFloatMinM"]
            r = {"on": "ground", "gapM": gap, "offSeatM": round(off, 3),
                 "bandM": [-tol, tol], "sinkEvidence": ev,
                 "designedSinkM": round(seat["designedSinkM"], 3)}
            if gap > tol:
                failures.append(f"{p.uid}: floats {gap:.3f} m over the padded ground "
                                f"(its lowest foot point; > {tol} m)")
            if abs(off) > tol:
                failures.append(f"{p.uid}: stands {off:+.3f} m off its designed seat (the "
                                f"runtime's seat on the padded ground; > {tol} m)")
            rise = fl["groundRiseM"]
            allow = min(rise, UNEVEN_SINK_CAP_M)
            r.update(groundRiseM=rise, burialAllowM=round(allow, 3))
            if gap < -tol and ev.startswith("policy"):
                if seat["designedSinkM"] > tol:
                    failures.append(f"{p.uid}: sunk {-gap:.3f} m into the padded ground at its "
                                    f"lowest foot point by a designed sink with no evidence "
                                    f"({ev}, {seat['designedSinkM']:.2f} m)")
                elif -gap > allow + tol:
                    failures.append(f"{p.uid}: uneven ground: move it (sunk {-gap:.3f} m at its "
                                    f"lowest foot point by the runtime's {seat['mode']} seat; "
                                    f"the ground rises {rise:.3f} m under its foot, allowance "
                                    f"{allow:.3f} m, cap {UNEVEN_SINK_CAP_M} m)")
        if p.uid in members:
            st, m, anchor = members[p.uid]
            am = next(x for x in st["members"] if x["uid"] == st["anchor"])
            yaw = anchor.yaw - float(am["yaw"])
            rel = (m["offsetM"][0] - am["offsetM"][0], m["offsetM"][1] - am["offsetM"][1])
            # the set's plan offsets turn with the group yaw about the anchor
            ex, ez = plan_to_province((anchor.x, anchor.z), yaw, rel)
            off = math.hypot(p.x - ex, p.z - ez)
            r.update(set=st["id"], offDeclaredM=round(off, 2))
            if off > SET_SPACING_TOL_M:
                failures.append(f"{p.uid}: stands {off:.2f} m from where yard set {st['id']} "
                                f"declares it from its anchor {anchor.uid} "
                                f"(> {SET_SPACING_TOL_M} m)")
        rows[p.uid] = r
    return {"pieces": rows, "failures": failures}


# --------------------------------------------------------------------------
# beached profile (the packet's numbers for R5)
# --------------------------------------------------------------------------
def beached_profile(cat, g, p) -> dict:
    """A beached hull's keel gap (the foot band's highest float) and its bow
    height: the underside over the ground at the landward end of its long
    axis (the end whose ground is drier)."""
    out = {"keelGapM": measure.float_under(cat, g, p)["footFloatMaxM"]}
    row = cat.row(p.asset)
    size, off = row["sizeM"], row["originOffsetM"]
    long_y = size[1] >= size[0]
    ends = []
    for sign in (-1.0, 1.0):
        if long_y:
            local = (size[0] / 2 - off[0], -(sign * (size[1] / 2 - 0.3) + size[1] / 2 - off[1]))
        else:
            local = (sign * (size[0] / 2 - 0.3) + size[0] / 2 - off[0], -(size[1] / 2 - off[1]))
        ends.append(plan_to_province((p.x, p.z), p.yaw, (local[0] * p.scale, local[1] * p.scale)))
    hits = underside(cat, p, ends)
    land = max(range(2), key=lambda k: -g.depth(*ends[k]))
    h = hits[land]
    out["bowHeightM"] = None if h is None else round(h - g.chunk_height(*ends[land]), 3)
    out["bowAtM"] = [round(v, 2) for v in ends[land]]
    return out


# --------------------------------------------------------------------------
# the walk packet's measured column
# --------------------------------------------------------------------------
def measured(check: dict) -> dict[str, str]:
    """{uid: the rule numbers for that item} from a `check` output: walk
    (route m / steepest deg / largest step m to its door or opening),
    floor edge (worst gap), beached (keel gap, bow height), prop seat (gap,
    off seat)."""
    out: dict[str, list[str]] = {}
    add = lambda uid, text: out.setdefault(uid, []).append(text)
    for t in (check.get("walk") or {}).get("targets", []):
        add(t["uid"], _walk_text(t))
    for uid, r in (check.get("floorEdge") or {}).get("pieces", {}).items():
        if r.get("worst"):
            add(uid, f"floorEdge worst {r['worst']['gapM']} m"
                     + (" FAIL" if r.get("overBand") else ""))
    for uid, r in (check.get("pieces") or {}).items():
        b = r.get("beachedProfile")
        if b:
            add(uid, f"keel gap {b['keelGapM']} m, bow {b['bowHeightM']} m")
    for uid, r in (check.get("propSeat") or {}).get("pieces", {}).items():
        if "gapM" in r:
            add(uid, f"propSeat gap {r['gapM']} m"
                     + (f", off seat {r['offSeatM']} m" if "offSeatM" in r else "")
                     + (f", off set {r['offDeclaredM']} m" if "offDeclaredM" in r else ""))
    return {uid: "; ".join(v) for uid, v in out.items()}


def _walk_text(t: dict) -> str:
    which = "walk" if t.get("bound", True) else f"walk doorway {t['doorway']}"
    return (f"{which} {t['routeM']} m / {t['steepestDeg']} deg / step {t['largestStepM']} m"
            if t.get("ok") else f"{which} FAIL")


def door_walk(check: dict, uid: str) -> str:
    """The measured walk of the door the compile binds on piece ``uid`` (its
    own target, `door:<uid>`, never another doorway of the piece; r5
    review), or "-"."""
    for t in (check.get("walk") or {}).get("targets", []):
        if t.get("id") == f"door:{uid}":
            return _walk_text(t)
    return "-"


def bundle_uid(scene, placement_id: str, site_id: str) -> str | None:
    """The scene piece a published placement id came from: an assembly
    member (`.assembly.<uid>`), a parcel's building (`<parcel>.building`) or
    a run piece (`<run>.piece.<n>`, 1-based) or a compile ring piece the
    apply loaded (`ring:<id>`, its role's `placementId`; r4 review); else
    None."""
    rest = placement_id.removeprefix(site_id + ".")
    if ".assembly." in rest:
        return rest.rsplit(".assembly.", 1)[1]
    for p in scene.pieces:
        role = p.role or {}
        if role.get("kind") == "parcel" and rest == f"{role.get('id')}.building":
            return p.uid
        if role.get("kind") == "run" and rest == f"{role.get('id')}.piece.{int(role.get('index', 0)) + 1}":
            return p.uid
        if role.get("kind") == "ring" and role.get("placementId") == placement_id:
            return p.uid
    return None
