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
PROP_FLOAT_MAX_M = measure.PROP_FLOAT_MAX_M   # propSeatRule: a prop's foot / pose at most this ABOVE its seat
PROP_SINK_MAX_M = 0.05       # ... and at most this BELOW it (owner 2026-09-27: 3 cm is visible)
# 16k walk 2 rules (place-diag P1-P4, runtime-diag D2/D6)
BC_ROAD = 30                 # roadSurfaceRule: the ground-control material the road paints
ROAD_BLEND_MIN = 64          # ... a secondary road texel counts at blend weight over this (/255)
ROAD_OVERLAP_MIN_M2 = 0.05   # ... a footprint over the painted road by more than this fails
ROAD_SIGN_VERGE_M = 1.5      # ... a signpost whose pivot is off the paint within this of it passes
ROAD_WAY_TOKENS = ("bridge", "walkway", "boardwalk", "dock", "pier", "jetty", "ramp",
                   "stair", "steps", "crossing", "ford")
ROAD_SIGN_TOKENS = ("signpost", "milestone")
SILL_MAX_M = 0.20            # sillRule: a door threshold within this of the walk surface
SILL_PROBE_M = 0.3           # ... the walk surface is read this far out along the door's facing
SILL_FLOOR_BAND_M = 1.5      # ... with no sill record, the floor is read within this of the mesh base
SILL_WAY_TOKENS = ("stair", "steps", "walkway", "porch", "ramp", "boardwalk", "dock", "plank")
SILL_OWN_DECK_M = 0.5        # ... a threshold on its own assembly's deck (the pod's porch) within this
PORCH_STEP_MAX_M = 0.45      # ... and that deck reaches the ground by a step no higher than this
PORCH_REACH_M = 8.0          # ... read along the facing at most this far out
SIGN_BEARING_MAX_DEG = 15.0  # signRule: a board's arm within this of the road's bearing
SIGN_HEIGHT_M = (1.7, 2.4)   # ... the board's centre this high over the ground
SIGN_BOARD_TOKENS = ("roadsign",)  # a board: the name says roadsign and not signpost
BERTH_REACH_M = 1.0          # berthReachRule: a way or landing end within this of the hull
BERTH_DRY_M = 0.2            # ... its other end on ground this far over the water
BERTH_WAY_TOKENS = ("dock", "plank", "walkway", "bridge", "pier", "jetty", "landing",
                   "steps", "ramp", "boardwalk", "stage")
COLLIDER_MIN_PLAN_M = 0.3    # colliderRule: plan size in both axes at least this ...
COLLIDER_MIN_HEIGHT_M = 0.3  # ... and at least this tall needs a collider in the manifest
PHYSICS_TS = paths.REPO_ROOT / "packages" / "game-core" / "src" / "physics" / "characterPhysics.ts"

# The first fix to try for each rule's failure, beside the bars it answers
# (the round summary prints it beside the count; the bars and their rulings are the placement-workbench
# skill's section 5). Tooling text for the agent, not player-facing.
FIX_HINTS = {
    "slopeRule": "re-site (wb.py scan / site) or give the parcel a pad or a fit made for the slope",
    "deltaRule": "re-site, declare a pad, or author a groundFit that takes the delta, with its reason",
    "sillRule": "bring the threshold within 0.20 m of the walk surface: re-seat, pad, or lay the "
                "steps or porch its assembly names",
    "yardSillRule": "the ground line stands off the ground at the pivot: re-site or pad it",
    "padRule": "move the building (wb.py scan ranks pad legality), lay the kit's retaining wall "
               "along the named edges, or batter a mud pad (<= 1.2 m)",
    "beachedRule": "move the hull onto a gentler bank within 1.5 m of the water line",
    "notExportable": "remove the roll / mirror: the runtime turns by yaw and pitch only",
    "footFloat": "settle it, move it onto flatter ground, or pad the ground under it",
    "hullWater": "move the hull out to at least the least depth all round its halo",
    "quayBank": "slide the stage along its axis until its landward end meets the bank",
    "unrelatedPair": "the two pieces cross: move one (wb.py measure A B gives the slide)",
    "run-jointPair": "re-snap the run step by evidence (snap --by evidence --settle)",
    "mountedPair": "re-mount the child on its parent by the mined pair",
    "doorReach": "turn the building or move the path so the threshold is within 4 m of it",
    "walkRule": "clear the blocking cell the failure names, or lay a walkable way over it",
    "floorEdgeRule": "re-seat or pad the building, or lay a retaining piece under the named edge",
    "pathReachRule": "end a path within 1 m of the door, its last leg on the door's facing",
    "propSeatRule": "re-settle the prop, or move it off uneven ground (site --free)",
    "roadSurfaceRule": "move the piece off the road paint (wb.py scan reports the overlap)",
    "signRule": "turn the board's arm onto the road's bearing and mount it at 1.7-2.4 m",
    "berthReachRule": "lay a landing or plank from dry ground to within 1 m of the hull",
    "colliderRule": "use a piece whose kit manifest carries a collider, or source one",
}


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
    return [d for p in scene.pieces for d in piece_doors(cat, scene, p, every)]


def piece_doors(cat, scene, p, every: bool = False, rep: dict | None = None) -> list[dict]:
    """`doors` of one piece (``rep``: its `door_report`, when already read)."""
    rep = measure.door_report(cat, scene, p) if rep is None else rep
    if not rep:
        return []
    out = []
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


def _piled_deck_y(cat, p) -> float | None:
    """A piled deck's walk height (its seated pivot + the manifest deck top
    over the pivot, lessons L65), or None for any other piece."""
    row = cat.row(p.asset)
    if not row.get("piled") or p.y is None:
        return None
    top = (row.get("groundLineTell") or {}).get("deckTopM")
    return float(p.y) + (float(top) * p.scale if isinstance(top, (int, float)) else 0.0)


def _piled_box(cat, p):
    """A piled deck's walk plan box: its mesh's kit-frame plan bounds, turned
    and placed by the pose (province metres), never the footprint rectangle
    (dockstrent02: footprint 6.3 m long, mesh 7.74 m; the mined run joint
    overlaps the meshes by 0.43 m but left a 0.98 m hole between the
    footprints; walk 2 round 5, wb-gaps-1)."""
    from shapely.geometry import Polygon
    (x0, y0, _), (x1, y1, _) = cat.mesh(p.asset).bounds
    corners = np.array([[x0, y0, 0.0, 1.0], [x1, y0, 0.0, 1.0],
                        [x1, y1, 0.0, 1.0], [x0, y1, 0.0, 1.0]])
    w = corners @ measure._transform4(p).T
    return Polygon([(float(v[0]), -float(v[1])) for v in w])


def _surface_m(cat, scene, ground, x: float, z: float) -> float:
    """The walk surface at (x, z), as WalkGrid reads it: the padded ground,
    or the top of a walkable deck there where one stands higher (a head
    clearance is measured from what the player stands on; r5 review)."""
    from shapely.geometry import Point, Polygon
    h = float(ground.chunk_height(x, z))
    for p in scene.pieces:
        if not (getattr(p, "walkable", False) and p.y is not None):
            continue
        piled = _piled_deck_y(cat, p)
        if piled is not None:
            if _piled_box(cat, p).contains(Point(x, z)):
                h = max(h, piled)
            continue
        poly = Polygon(measure.footprint_province(cat, p))
        if not poly.contains(Point(x, z)):
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
        piled = _piled_deck_y(cat, p)
        if piled is not None:
            # a piled deck (dock, jetty) is ONE walk surface at its seated deck
            # height over its whole plan box: plank gaps never read as water
            # (planner ruling 2026-09-27, walk 2 round 5); the box is the
            # mesh's plan bounds, not the footprint's (`_piled_box`)
            box = _piled_box(cat, p)
            inside = contains_xy(box, self.X, self.Z)
            self.H[inside] = piled
            self.src[inside] = i
            if inside.any():
                self.decks.append(p.uid)
            return
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


def _floor_edge_ctx(cat, scene):
    from shapely.ops import unary_union
    from shapely.geometry import Polygon
    walls = [Polygon(measure.footprint_province(cat, q)) for q in scene.pieces
             if _retaining(cat, q)]
    return {"g": _ground(cat, scene),
            "wall_zone": unary_union(walls).buffer(EDGE_INSET_M) if walls else None}


def floor_edge_piece(cat, scene, ctx, p, fit_for) -> tuple[dict, list]:
    """floorEdgeRule for one building: ({uid: row}, failures)."""
    from shapely.geometry import Point
    g, wall_zone = ctx["g"], ctx["wall_zone"]
    fit = fit_for(p)
    band = FLOOR_BANDS.get(fit)
    if band is None:
        return {p.uid: {"fit": fit, "note": f"fit {fit!r} has no floor-edge band (direct, "
                                            f"plinth, pad only)"}}, []
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
    failures = []
    if over:
        failures.append(f"{p.uid}: floor edge stands {worst_over['gapM']:.2f} m over the padded "
                        f"ground at {worst_over['atM']} (> {band} m for {fit}; the geometry "
                        f"there is {worst_over['aboveBaseM']:.2f} m over the piece's base); {over} of "
                        f"{len(perim)} perimeter samples over the band, no retaining run "
                        f"under them")
    return {p.uid: row}, failures


def floor_edge(cat, scene, fit_for, uids=None) -> dict:
    """floorEdgeRule: every EDGE_STEP_M round a building's outline, the
    lowest underside within EDGE_INSET_M inside it over the padded ground
    below that point; a gap over the fit's band fails unless a retaining run
    piece stands under the sample. Only underside geometry within
    UNDERSIDE_BAND_M over the piece's base is a floor edge: a sample whose
    lowest geometry stands higher (an eave, a dome's bulge) is counted as
    `overhang` and not judged. ``fit_for(piece)`` is the parcel's
    groundFit (the blueprint's override, else the kit record's). ``uids``:
    judge only these pieces (`piece_rule`)."""
    return piece_rule("floorEdge", cat, scene, uids, fit_for=fit_for)


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


def _prop_seat_ctx(cat, scene):
    return {"g": _ground(cat, scene), "members": _set_members(scene)}


def prop_seat_piece(cat, scene, ctx, p) -> tuple[dict, list]:
    """propSeatRule for one prop: ({uid: row}, failures)."""
    up, down = PROP_FLOAT_MAX_M, PROP_SINK_MAX_M
    g, members = ctx["g"], ctx["members"]
    failures = []
    row = cat.row(p.asset)
    parent = _parent_of(scene, p)
    r = {}
    if parent is not None and parent.y is not None:
        got = measure.contact(cat, p, parent)
        r = {"on": parent.uid, "gapM": got["gapM"], "bandM": [0.0, up]}
        if got["gapM"] > up:
            failures.append(f"{p.uid}: stands {got['gapM']:.3f} m off {parent.uid} "
                            f"(> {up} m)")
    else:
        fl = measure.float_under(cat, g, p)
        seat = measure.prop_seat(cat, g, p)     # the settle's own seat (one helper)
        off = p.y - seat["y"]
        ev = str((row.get("designedSinkM") or {}).get("evidence") or "none")
        gap = fl["footFloatMinM"]
        r = {"on": "ground", "gapM": gap, "offSeatM": round(off, 3),
             "bandM": [-down, up], "sinkEvidence": ev,
             "designedSinkM": round(seat["designedSinkM"], 3)}
        if gap > up:
            failures.append(f"{p.uid}: floats {gap:.3f} m over the padded ground "
                            f"(its lowest foot point; > {up} m)")
        if off > up or off < -down:
            failures.append(f"{p.uid}: stands {off:+.3f} m off its designed seat (the "
                            f"runtime's seat on the padded ground; band -{down}..+{up} m)")
        rise = fl["groundRiseM"]
        allow = min(rise, UNEVEN_SINK_CAP_M)
        r.update(groundRiseM=rise, burialAllowM=round(allow, 3))
        if gap < -down and ev.startswith("policy"):
            if seat["designedSinkM"] > down:
                failures.append(f"{p.uid}: sunk {-gap:.3f} m into the padded ground at its "
                                f"lowest foot point by a designed sink with no evidence "
                                f"({ev}, {seat['designedSinkM']:.2f} m)")
            elif -gap > allow + down:
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
    return {p.uid: r}, failures


def prop_seat(cat, scene, uids=None) -> dict:
    """propSeatRule (bars PROP_FLOAT_MAX_M up, PROP_SINK_MAX_M down; owner
    2026-09-27, was a flat 0.03 m): a mounted item's exact gap to its parent
    at most PROP_FLOAT_MAX_M. A ground item: its lowest foot point
    (`float_under`) at most PROP_FLOAT_MAX_M over the padded ground; its pose
    between PROP_SINK_MAX_M below and PROP_FLOAT_MAX_M above the runtime's
    seat (`measure.seat`: the designed sink, on the padded ground); and a
    burial deeper than PROP_SINK_MAX_M only where that sink has evidence (a
    `policy-fallback` sink is none) or, for a no-evidence prop, up to the
    ground's rise under its foot (`groundRiseM`: the runtime seat on sloping
    ground buries the uphill foot) capped at UNEVEN_SINK_CAP_M, beyond which
    it fails "uneven ground: move it". A yard-set member within
    SET_SPACING_TOL_M of its declared offset from the set's anchor.
    ``uids``: judge only these pieces (`piece_rule`)."""
    return piece_rule("propSeat", cat, scene, uids)


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


# --------------------------------------------------------------------------
# 16k walk 2 rules: road surface, sill, sign, berth reach, collider
# --------------------------------------------------------------------------
def _stem(asset: str) -> str:
    return asset.rsplit("/", 1)[-1].lower()


def _has(asset: str, tokens) -> bool:
    stem = _stem(asset)
    return any(t in stem for t in tokens)


def _hung(p) -> bool:
    from .scene import hung_on
    return hung_on(p) is not None


@lru_cache(maxsize=1)
def _road_paint() -> tuple[np.ndarray, float]:
    """The painted road AS DRAWN (`refined/ground-control.png`: ch0 the
    winning material, ch1 the second, ch2 its blend): a texel is road where
    ch0 is BC_ROAD, or ch1 is BC_ROAD at a blend over ROAD_BLEND_MIN. The
    paint, never the route centreline: place-diag P2 measured the paint
    1.83 m off the centreline record (routes_raster.py:224,421). Returns the
    mask and the texel size in metres (the province extent over its width)."""
    from PIL import Image
    im = np.asarray(Image.open(paths.PROVINCE / "refined" / "ground-control.png").convert("RGBA"))
    mask = (im[..., 0] == BC_ROAD) | ((im[..., 1] == BC_ROAD) & (im[..., 2] > ROAD_BLEND_MIN))
    meta = json.loads((paths.PROVINCE / "refined" / "meta.json").read_text())
    extent = float(meta["extentKm"][0]) * 1000.0
    return mask, extent / mask.shape[1]


def _road_cells(poly) -> list:
    """The painted road texels (shapely boxes) under a plan polygon."""
    from shapely.geometry import box
    mask, px = _road_paint()
    x0, z0, x1, z1 = poly.bounds
    out = []
    for j in range(max(0, int(z0 // px)), min(mask.shape[0], int(z1 // px) + 1)):
        for i in range(max(0, int(x0 // px)), min(mask.shape[1], int(x1 // px) + 1)):
            if mask[j, i]:
                out.append(box(i * px, j * px, (i + 1) * px, (j + 1) * px))
    return out


def _road_surface_target(cat, p) -> bool:
    if p.y is None or _hung(p) or _has(p.asset, ROAD_WAY_TOKENS):
        return False
    return (cat.row(p.asset).get("anchorClass") or "ground") != "water"


def road_surface_piece(cat, scene, ctx, p) -> tuple[dict, list]:
    """roadSurfaceRule for one piece: ({uid: row} or {}, failures)."""
    from shapely.geometry import Point, Polygon
    from shapely.ops import unary_union
    poly = Polygon(measure.footprint_province(cat, p))
    cells = _road_cells(poly)
    if not cells:
        return {}, []
    road = unary_union(cells)
    area = float(poly.intersection(road).area)
    if area <= ROAD_OVERLAP_MIN_M2:
        return {}, []
    r = {"onRoadM2": round(area, 2), "footprintM2": round(poly.area, 2)}
    if _has(p.asset, ROAD_SIGN_TOKENS):
        near = unary_union(_road_cells(Point(p.x, p.z).buffer(ROAD_SIGN_VERGE_M + 2.0)))
        pivot = Point(p.x, p.z)
        r["pivotToPaintM"] = round(float(near.distance(pivot)), 2)
        if not near.contains(pivot) and near.distance(pivot) <= ROAD_SIGN_VERGE_M:
            r["verge"] = True
            return {p.uid: r}, []
    return {p.uid: r}, [f"{p.uid}: {area:.1f} m2 of its {poly.area:.1f} m2 footprint lies on "
                        f"the painted road (> {ROAD_OVERLAP_MIN_M2} m2; the paint as drawn)"]


def road_surface(cat, scene, uids=None) -> dict:
    """roadSurfaceRule: no placed piece's footprint lies on the painted road
    surface (`_road_paint`) by more than ROAD_OVERLAP_MIN_M2, except a way
    or crossing piece (ROAD_WAY_TOKENS), a piece hung on another (it stands
    on its host), a water-class piece, and a signpost (ROAD_SIGN_TOKENS)
    whose pivot is off the paint and within ROAD_SIGN_VERGE_M of it.
    ``uids``: judge only these pieces (`piece_rule`)."""
    return piece_rule("roadSurface", cat, scene, uids)


def _sill_rise(cat, p, k: int) -> float | None:
    """The doorway's sill over the piece's pivot from its record: the
    interiors row at that doorway (entrance or provenance) with a plugin
    door's `heightM` (the door reference's z on the shell; a `leaf` row's
    heightM is the opening's height, not a sill), else the mined assembly
    doorway's `riseM` on the piece or, for a composite, on its base piece;
    None where no record gives one."""
    d = cat.doorways(p.asset)[k]
    x, z = d["offsetInPieceM"]
    near = lambda off, zz: (off is not None and len(off) >= 2  # noqa: E731
                            and abs(off[0] - x) < 0.05 and abs(zz(off) - z) < 0.05)
    rec = cat.interiors(p.asset)
    for row in [rec.get("entrance") or {}] + list(rec.get("provenance") or []):
        if (row.get("kind") != "leaf" and isinstance(row.get("heightM"), (int, float))
                and near(row.get("offsetM"), lambda o: o[1])):
            return float(row["heightM"])
    paths.bridge()
    from worldgen import compile_settlement as cs
    from worldgen.mine_designed_sink import composite_bases
    for shell in (p.asset, composite_bases().get(p.asset)):
        for row in (cs.assembly_doorways().get(shell) or {}).get("doorways") or []:
            if near(row.get("offsetLocalM"), lambda o: -float(o[1])):
                return float(row.get("riseM") or 0.0)
    return None


def _top_at(cat, p, x: float, z: float, below: float, above: float = -1e9) -> float | None:
    """The highest surface of piece p at (x, z) between ``above`` and ``below``."""
    mesh = _world_mesh(cat, p)
    locs, _r, _t = mesh.ray.intersects_location([[x, -z, below]], [[0.0, 0.0, -1.0]],
                                                multiple_hits=True)
    return max((float(v[2]) for v in locs if float(v[2]) >= above), default=None)


def _stair_to_deck(cat, scene, p, deck_m: float) -> str | None:
    """The stair or walkway piece of ``p``'s own assembly (bound to the same
    parcel, SILL_WAY_TOKENS) whose top reaches ``p``'s deck (within
    SILL_MAX_M) and which touches ``p``: the step piece the ruling asks a
    raised deck to reach the ground by (farmhouse02's walkwaystairs8 at its
    mined template t0749; planner rulings 2026-09-27 rounds 4-5)."""
    pid = (p.role or {}).get("id")
    for q in scene.pieces:
        if q is p or q.y is None or not _has(q.asset, SILL_WAY_TOKENS):
            continue
        if pid is None or (q.role or {}).get("id") != pid:
            continue
        top = float(_world_mesh(cat, q).bounds[1][2])
        if abs(top - deck_m) <= SILL_MAX_M + 0.1 and measure.contact(cat, q, p)["contact"]:
            return q.uid
    return None


def _own_deck(cat, p, g, tx, tz, dx, dz, sill_y) -> dict | None:
    """Planner ruling 2026-09-27 (walk 2 round 4): a threshold measured
    against the walkable surface of its own assembly, the piece's mesh top
    within SILL_OWN_DECK_M outside it (the KotM pod's porch deck); that deck
    is then judged like a deck: walking out along the facing, its last top
    (its foot) stands at most PORCH_STEP_MAX_M over the padded ground."""
    best = None
    for k in range(1, int(SILL_OWN_DECK_M / 0.1) + 1):
        t = _top_at(cat, p, tx + dx * 0.1 * k, tz + dz * 0.1 * k, sill_y + 0.3, sill_y - 1.0)
        if t is not None and (best is None or abs(sill_y - t) < abs(sill_y - best)):
            best = t
    if best is None:
        return None
    on = abs(sill_y - best) <= SILL_MAX_M
    foot = best
    step = None
    for k in range(1, int(PORCH_REACH_M / 0.25) + 1):
        x, z = tx + dx * 0.25 * k, tz + dz * 0.25 * k
        t = _top_at(cat, p, x, z, foot + 0.3, foot - PORCH_STEP_MAX_M - 1.0)
        ground = g.chunk_height(x, z)
        if t is None or t <= ground + 0.02:
            step = round(max(0.0, foot - ground), 3)
            break
        foot = t
    return {"deckM": round(best, 3), "offM": round(abs(sill_y - best), 3), "onDeck": on,
            "footM": round(foot, 3), "footStepM": step}


def _sill_ctx(cat, scene):
    return {"g": _ground(cat, scene)}


def sill_piece(cat, scene, ctx, p) -> tuple[dict, list]:
    """sillRule for one piece's bound door: ({door id: row}, failures)."""
    g = ctx["g"]
    rows, failures = {}, []
    if p.y is None:
        return rows, failures
    rep = measure.door_report(cat, scene, p)
    for d in piece_doors(cat, scene, p, rep=rep):
        k = rep["doorways"].index(rep["best"])
        tx, tz = d["thresholdM"]
        dx, dz = _bearing_vec(d["facingDeg"])
        ox, oz = tx + dx * SILL_PROBE_M, tz + dz * SILL_PROBE_M
        walk = _surface_m(cat, scene, g, ox, oz)
        rise = _sill_rise(cat, p, k)
        if rise is not None:
            sill_y, how = p.y + rise * p.scale, "record"
        else:
            # no record: the floor just inside, within SILL_FLOOR_BAND_M of the
            # mesh's base (a dome's roof above it is not a floor), else the ground
            base = float(_world_mesh(cat, p).bounds[0][2])
            inside = _top_at(cat, p, tx - dx * SILL_PROBE_M, tz - dz * SILL_PROBE_M,
                             base + SILL_FLOOR_BAND_M, base - 0.01)
            sill_y, how = (inside, "mesh") if inside is not None else (walk, "ground")
        ways = [t for q in scene.pieces if q.uid != p.uid and q.y is not None
                and _has(q.asset, SILL_WAY_TOKENS)
                for t in [_top_at(cat, q, ox, oz, sill_y + 1.0)] if t is not None]
        off = min(abs(sill_y - v) for v in [walk, *ways])
        porch = None
        if off > SILL_MAX_M:
            porch = _own_deck(cat, p, g, tx, tz, dx, dz, sill_y)
            if porch is not None and porch["onDeck"] and (porch["footStepM"] is None
                                                          or porch["footStepM"] > PORCH_STEP_MAX_M):
                stair = _stair_to_deck(cat, scene, p, porch["deckM"])
                if stair:
                    porch.update(footStepM=0.0, byStair=stair)
        rows[d["id"]] = {"sillM": round(sill_y, 3), "walkM": round(walk, 3), "from": how,
                         "wayTopsM": [round(v, 3) for v in ways], "offM": round(off, 3),
                         **({"ownDeck": porch} if porch else {})}
        if porch is not None and porch["onDeck"]:
            if porch["footStepM"] is None or porch["footStepM"] > PORCH_STEP_MAX_M:
                failures.append(f"{d['id']}: its own deck (the threshold's porch) reaches the ground "
                                f"by a {porch['footStepM']} m step at its foot (> {PORCH_STEP_MAX_M} m): "
                                f"the porch needs its step piece")
            continue
        if off > SILL_MAX_M:
            failures.append(f"{d['id']}: sill {sill_y:.2f} m stands {sill_y - walk:+.2f} m off "
                            f"the walk surface outside it (> {SILL_MAX_M} m; no stair or "
                            f"walkway reaches it)")
    return rows, failures


def sill(cat, scene, uids=None) -> dict:
    """sillRule: every bound doorway's threshold stands within SILL_MAX_M of
    the walk surface just outside it (SILL_PROBE_M out along its facing: the
    padded ground or a walkable deck, `_surface_m`), or of the top of a
    stair or walkway piece (SILL_WAY_TOKENS) standing there. The sill is the
    record's (`_sill_rise`) on the piece's pose; a doorway whose record
    gives none is read on the shell's mesh just inside, else the ground.
    ``uids``: judge only these pieces' doors (`piece_rule`)."""
    return piece_rule("sill", cat, scene, uids)


@lru_cache(maxsize=1)
def _published_roads() -> tuple:
    """Every published route (`routes.json`) as metre polylines: macro px
    (x, z) x (px + 0.5) x the macro texel (the extent over 1345), the
    registration the compile and the street router use."""
    doc = json.loads((paths.PROVINCE / "routes.json").read_text())
    meta = json.loads((paths.PROVINCE / "refined" / "meta.json").read_text())
    step = float(meta["extentKm"][0]) * 1000.0 / 1345.0
    return tuple((r["id"], tuple(((x + 0.5) * step, (z + 0.5) * step) for x, z in r["px"]))
                 for r in doc.get("routes") or [] if len(r.get("px") or []) >= 2)


def _road_bearing(scene, x: float, z: float) -> tuple[float, float, str] | None:
    """(bearing mod 180, distance, road id) of the nearest road segment: the
    published routes and the scene's road/street paths."""
    lines = list(_published_roads()) + [(q["id"], tuple(map(tuple, q["pointsM"])))
                                        for q in scene.paths if len(q["pointsM"]) >= 2
                                        and q.get("kind") in ("road", "street")]
    best = None
    for rid, pts in lines:
        for (ax, az), (bx, bz) in zip(pts, pts[1:]):
            vx, vz = bx - ax, bz - az
            ll = vx * vx + vz * vz
            if ll <= 0:
                continue
            t = max(0.0, min(1.0, ((x - ax) * vx + (z - az) * vz) / ll))
            dist = math.hypot(ax + t * vx - x, az + t * vz - z)
            if best is None or dist < best[1]:
                best = (math.degrees(math.atan2(vx, -vz)) % 180.0, dist, rid)
    return best


def _layout_sockets(scene) -> list[dict]:
    """The authored socket ops of the layout the scene was applied from."""
    from . import layout as lay
    ref = (scene.layout or {}).get("path")
    full = paths.REPO_ROOT / ref if ref else None
    if not (full and full.exists()):
        return []
    return list(lay.split_sockets(json.loads(full.read_text()), ref).get("sockets") or [])


def _sign_target(p) -> bool:
    return (p.y is not None and _has(p.asset, SIGN_BOARD_TOKENS)
            and not _has(p.asset, ROAD_SIGN_TOKENS))


def sign_piece(cat, scene, ctx, p) -> tuple[dict, list]:
    """signRule for one board: ({uid: row}, failures)."""
    g = ctx["g"]
    failures = []
    parent = _parent_of(scene, p)
    r = {"post": parent.uid if parent is not None else None}
    if parent is None or not _has(parent.asset, ROAD_SIGN_TOKENS):
        failures.append(f"{p.uid}: a sign board hangs on a signpost, not "
                        f"{parent.uid if parent is not None else 'nothing'}")
    mesh = _world_mesh(cat, p)
    cx, cy, cz = (mesh.bounds[0] + mesh.bounds[1]) / 2.0     # (x, -z, up)
    wx, wz = float(cx), float(-cy)
    up = float(cz) - float(g.chunk_height(wx, wz))
    arm = (p.yaw + 90.0) % 180.0
    road = _road_bearing(scene, wx, wz)
    r.update(armBearingDeg=round(arm, 1), centreOverGroundM=round(up, 2))
    if road is not None:
        off = _angle_off(arm * 2, road[0] * 2) / 2.0     # mod-180 difference
        r.update(roadBearingDeg=round(road[0], 1), road=road[2], offDeg=round(off, 1))
        if off > SIGN_BEARING_MAX_DEG:
            failures.append(f"{p.uid}: its arm reads {arm:.0f} deg, the road {road[2]} runs "
                            f"{road[0]:.0f} deg ({off:.0f} deg off; > {SIGN_BEARING_MAX_DEG})")
    if not SIGN_HEIGHT_M[0] <= up <= SIGN_HEIGHT_M[1]:
        failures.append(f"{p.uid}: its centre stands {up:.2f} m over the ground "
                        f"(not {SIGN_HEIGHT_M[0]}-{SIGN_HEIGHT_M[1]} m)")
    return {p.uid: r}, failures


def _sign_posts(cat, scene, uids) -> list:
    """signRule's post half: every signpost carrying boards has a `sign`
    socket whose `pointsTo` has one entry per board on it; with ``uids``,
    only the posts named or carrying a named board."""
    socks = [s for s in _layout_sockets(scene) if s.get("kind") == "sign"]
    boards_on = {}
    for p in scene.pieces:
        if not _sign_target(p):
            continue
        parent = _parent_of(scene, p)
        if parent is not None and _has(parent.asset, ROAD_SIGN_TOKENS):
            boards_on.setdefault(parent.uid, []).append(p.uid)
    failures = []
    for post, boards in sorted(boards_on.items()):
        if uids is not None and post not in uids and not set(boards) & uids:
            continue
        s = next((s for s in socks if s.get("host") == post), None)
        if s is None:
            failures.append(f"{post}: {len(boards)} board(s) and no sign socket on the post "
                            f"(pointsTo one entry per board)")
        elif len(s.get("pointsTo") or []) != len(boards):
            failures.append(f"{post}: sign socket {s['id']} points to {len(s.get('pointsTo') or [])} "
                            f"places for {len(boards)} board(s)")
    return failures


def sign(cat, scene, uids=None) -> dict:
    """signRule: every road-sign board (SIGN_BOARD_TOKENS) hangs on its
    post, its arm (the board's local +x: world yaw + 90, place-diag P4)
    within SIGN_BEARING_MAX_DEG of the nearest road's bearing, its centre
    SIGN_HEIGHT_M over the ground; and a `sign` socket on the post whose
    `pointsTo` has one entry per board on it (0104 decision 4). ``uids``:
    judge only these boards and their posts (`piece_rule`)."""
    return piece_rule("sign", cat, scene, uids)


def _ends(cat, p) -> tuple[tuple[float, float], tuple[float, float]]:
    """A way piece's two ends: the middles of the short sides of its
    footprint's minimum rotated rectangle; a piled deck's from its mesh plan
    box (`_piled_box`, the walk grid's own box, so the two rules agree)."""
    from shapely.geometry import Polygon
    box = (_piled_box(cat, p) if cat.row(p.asset).get("piled")
           else Polygon(measure.footprint_province(cat, p)).minimum_rotated_rectangle)
    rect = list(box.exterior.coords)[:4]
    sides = [((rect[i][0] + rect[(i + 1) % 4][0]) / 2, (rect[i][1] + rect[(i + 1) % 4][1]) / 2,
              math.dist(rect[i], rect[(i + 1) % 4])) for i in range(4)]
    a, b = sorted(sides, key=lambda s: s[2])[:2]
    return (a[0], a[1]), (b[0], b[1])


def _way_ends(cat, scene, q) -> list:
    """(near, far) end pairs of a way piece; a run member is judged as its
    whole run (lessons L65, round 4): its near end is the member's, its far
    end the run's end farthest from it (the landing's dry foot, not the
    deck span's own other end over the water)."""
    a, b = _ends(cat, q)
    role = q.role or {}
    if role.get("kind") != "run":
        return [(a, b), (b, a)]
    ends = [e for m in scene.pieces if m.y is not None and (m.role or {}).get("kind") == "run"
            and (m.role or {}).get("id") == role.get("id") for e in _ends(cat, m)]
    return [(n, max(ends, key=lambda e: math.dist(e, n))) for n in (a, b)]


def berth_reach(cat, scene) -> dict:
    """berthReachRule: every berth (a water-class piece bound to a parcel: a
    ferry or boat hull) has a way or landing piece (BERTH_WAY_TOKENS) with
    one end within BERTH_REACH_M of the hull and the other on dry ground
    (BERTH_DRY_M over the water there); every idle or npc socket placed by
    `at` stands on dry ground or a walkable deck, never in water."""
    from shapely.geometry import Point, Polygon
    g = _ground(cat, scene)
    rows, failures = {}, []
    ways = [q for q in scene.pieces if q.y is not None and _has(q.asset, BERTH_WAY_TOKENS)]
    for p in scene.pieces:
        if p.y is None or (p.role or {}).get("kind") != "parcel":
            continue
        if (cat.row(p.asset).get("anchorClass") or "ground") != "water":
            continue
        hull = Polygon(measure.footprint_province(cat, p))
        level = g.water_level(p.x, p.z)
        best = None
        for q in ways:
            for near, far in _way_ends(cat, scene, q):
                gap = hull.distance(Point(near))
                dry = float(g.chunk_height(*far)) - (level if level is not None else -1e9)
                if best is None or (gap, -dry) < (best[1], -best[2]):
                    best = (q.uid, gap, dry)
        r = {"waterLevelM": level, "way": best and best[0],
             "gapM": best and round(best[1], 2), "farEndOverWaterM": best and round(best[2], 2)}
        rows[p.uid] = r
        if best is None or best[1] > BERTH_REACH_M or best[2] < BERTH_DRY_M:
            failures.append(f"{p.uid}: no way or landing reaches the berth from dry ground "
                            f"(nearest {r['way']}: gap {r['gapM']} m, far end "
                            f"{r['farEndOverWaterM']} m over the water; bars {BERTH_REACH_M} m, "
                            f"{BERTH_DRY_M} m)")
    for s in _layout_sockets(scene):
        if s.get("kind") not in ("idle", "npc") or "at" not in s:
            continue
        x, z = (float(v) for v in s["at"])
        level, ground = g.water_level(x, z), float(g.chunk_height(x, z))
        # the recorded water over the ground the runtime draws, where the
        # water mask says wet (the depth grid is coarser than a socket)
        depth = (level - ground) if (level is not None and g.wet(x, z)) else 0.0
        deck = _surface_m(cat, scene, g, x, z) - ground
        rows[f"socket:{s['id']}"] = {"depthM": round(depth, 2), "deckM": round(deck, 2)}
        if depth > 0.0 and deck <= 0.0:
            failures.append(f"socket {s['id']}: stands in {depth:.2f} m of water, not on dry "
                            f"ground or a deck")
    return {"pieces": rows, "failures": failures}


def collider_piece(cat, scene, ctx, p) -> tuple[dict, list]:
    """colliderRule for one piece: ({uid: row} or {}, failures)."""
    row = cat.row(p.asset)
    if (row.get("category") or "") == "effect":
        return {}, []
    sx, sy, sz = (float(v) * p.scale for v in row["sizeM"])
    if min(sx, sy) < COLLIDER_MIN_PLAN_M or sz < COLLIDER_MIN_HEIGHT_M:
        return {}, []
    kind = row.get("collision") or "none"
    failures = []
    if kind == "none":
        failures.append(f"{p.uid}: {_stem(p.asset)} ({row['kit']}) is {sx:.2f} x {sy:.2f} x "
                        f"{sz:.2f} m and has no collider in its manifest")
    return {p.uid: {"collision": kind, "sizeM": [round(sx, 2), round(sy, 2), round(sz, 2)]}}, failures


def collider(cat, scene, uids=None) -> dict:
    """colliderRule: every placed kit piece at least COLLIDER_MIN_PLAN_M in
    both plan axes and COLLIDER_MIN_HEIGHT_M tall (at its scale) has a
    collider in its manifest row (`collision` not "none"); candles and small
    lanterns fall under the size. ``uids``: judge only these pieces."""
    return piece_rule("collider", cat, scene, uids)


# --------------------------------------------------------------------------
# per-piece rules (speed lane 3B, 2026-09-27): each of these six judges one
# piece at a time against a context built once per scene, so `check`'s
# pool splits them by piece and `check --only` judges only the named ones
# --------------------------------------------------------------------------
PIECE_RULES = ("floorEdge", "propSeat", "roadSurface", "sill", "sign", "collider")
_ROWS_KEY = {"sill": "doors", "sign": "boards"}


def warm() -> None:
    """Load the read-only records the rules share (the road paint, the
    published roads) once in the parent, so the forked workers inherit
    them instead of each reading them again."""
    _road_paint()
    _published_roads()


def piece_targets(key: str, cat, scene) -> list[str]:
    """The uids a per-piece rule judges, in the order its output lists them."""
    if key == "floorEdge":
        return [p.uid for p in buildings(cat, scene)]
    if key == "propSeat":
        return [p.uid for p in props(cat, scene)]
    if key == "roadSurface":
        return [p.uid for p in scene.pieces if _road_surface_target(cat, p)]
    if key == "sill":
        return [p.uid for p in scene.pieces if p.y is not None]
    if key == "sign":
        return [p.uid for p in scene.pieces if _sign_target(p)]
    if key == "collider":
        return [p.uid for p in scene.pieces]
    raise KeyError(key)


def piece_context(key: str, cat, scene) -> dict:
    return {"floorEdge": _floor_edge_ctx, "propSeat": _prop_seat_ctx, "sill": _sill_ctx,
            "sign": lambda c, s: {"g": _ground(c, s)}}.get(key, lambda c, s: {})(cat, scene)


def piece_part(key: str, cat, scene, uids: list, fit_for=None) -> tuple[dict, list]:
    """(rows, failures) of a per-piece rule over ``uids`` (targets, in order)."""
    ctx = piece_context(key, cat, scene)
    fn = {"floorEdge": lambda c, s, x, p: floor_edge_piece(c, s, x, p, fit_for),
          "propSeat": prop_seat_piece, "roadSurface": road_surface_piece,
          "sill": sill_piece, "sign": sign_piece, "collider": collider_piece}[key]
    rows, failures = {}, []
    for uid in uids:
        r, f = fn(cat, scene, ctx, scene.piece(uid))
        rows.update(r)
        failures += f
    return rows, failures


def piece_merge(key: str, cat, scene, parts: list, uids=None) -> dict:
    """The rule's output from its parts (in target order); ``uids`` the
    scope a scoped run asked for (None: the whole scene)."""
    rows, failures = {}, []
    for r, f in parts:
        rows.update(r)
        failures += f
    if key == "sign":
        failures += _sign_posts(cat, scene, None if uids is None else set(uids))
    return {_ROWS_KEY.get(key, "pieces"): rows, "failures": failures}


def piece_rule(key: str, cat, scene, uids=None, fit_for=None) -> dict:
    """A per-piece rule over the whole scene, or over ``uids`` only."""
    targets = piece_targets(key, cat, scene)
    if uids is not None:
        want = set(uids)
        targets = [u for u in targets if u in want]
    return piece_merge(key, cat, scene, [piece_part(key, cat, scene, targets, fit_for)], uids)
