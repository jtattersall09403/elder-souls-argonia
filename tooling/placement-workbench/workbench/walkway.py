"""walkwayRule: walk a player capsule along every built way and every door
approach, through the laid pieces' actual meshes (16k walk 6, owner: the
Riverwalk corner was two straights at a right angle, the rail of the piece
you stood on barred the turn; the house landing lay along the wall, its rail
across the door; a lantern hung in the doorway).

What is walked:

- every run of walkable pieces (bound `run` with an index, a lone walkable
  piece is its own run): from the ground WALK_OUT_M past the first piece's
  outward end, through every piece's deck centre in index order, to
  WALK_OUT_M past the last piece's outward end. An end over water is a
  berth (a landing's tip): the walk stops on the deck there.
- every bound door: from DOOR_OUT_M out along its facing (or the last
  DOOR_PATH_M of its path) to the threshold. A door is a load door (a TES
  transition, activated, never walked through), so the walk passes when it
  stops, on the door's own mesh, within the runtime's reach of the threshold
  (`DOOR_REACH_M` horizontally, `DOOR_REACH_VERTICAL_M` up to the sill
  surface, read from game-core `interior/doors.ts`); a block further out
  fails (16k walk 6: walking 1 m on into the shell hit its floor and door
  leaf at every door, 0.53-0.89 m, a measuring error).

At every SAMPLE_M along the line, three rays straight down (the centre and
the capsule radius either side) from HEAD_M over the last support find the
surface the capsule stands on: the first mesh hit, else the padded ground.
A rise past the controller step (`rules.character` stepM) is a BLOCK (a
rail, a wall, a post, a hanging fixture: the uid it hit is named); a fall
past FALL_M is a GAP (the deck is open under the line: a hole or a joint
that does not meet). Horizontal rays at CHEST_M over the support from each
sample to the next catch what the down rays pass under (a lantern hung at
head height). A start or end on the ground judges the ground within
FLAT_R_M round it: its steepest slope over FLAT_DEG is NOT-FLAT (owner:
the boardwalk started from a small steep bump beside flat ground); the dry
ground a walker steps onto (STEP_OFF_M on past the end, STEP_OFF_HALF_M
either side) rising over FLAT_DEG in STEP_OFF_BASE_M is BUMP-ON-STEP-OFF; a bank beside
the deck is not judged (walk 6).

Cost: one world mesh per piece near the line (loaded once), rays chunked by
`mesh_query.cast_rays`; Riverwalk ~1 s.
"""
from __future__ import annotations

import math

import numpy as np

from . import measure
from .mesh_query import cast_rays

SAMPLE_M = 0.2          # spacing of the capsule's stations along a line
WALK_OUT_M = 0.8        # a run's ends: how far onto the ground past the last deck
DOOR_OUT_M = 3.0        # a door approach starts this far out along the facing
DOOR_PATH_M = 8.0       # ... or along the last metres of the path that ends at it
DOOR_PATH_REACH_M = 5.0 # (a path end this close to the threshold)
HEAD_M = 1.8            # the down rays start this far over the last support (the capsule's height)
CHEST_M = (0.5, 0.8, 1.1, 1.4, 1.7)   # the capsule's body: rays over the deck, station to station
GAP_STATIONS = 2        # ... for this many stations in a row (the capsule's whole disc)
FALL_M = 0.6            # a drop past this between two stations is a gap
FLAT_R_M = 1.5          # the ground round a start or end judged for flatness ...
FLAT_DEG = 12.0         # ... steepest slope allowed there
STEP_OFF_M = 2.0        # ... and the ground a walker steps onto: this far on past the end ...
STEP_OFF_HALF_M = 1.5   # ... this far either side of the way (walk 6, bump-on-step-off) ...
STEP_OFF_BASE_M = 2.0   # ... its slope read over this baseline: a pad lip under the controller
                        # step is not a bump (Claywater's landing stage), a bump's flank is
JOIN_M = 1.5            # a run end over water this close to another walkable piece walks into it
NEAR_M = 2.0            # meshes whose plan bounds come this close to a line are walked against
OPENING_HALF_M = 0.6    # door opening box: this far either side of the threshold, across and through
OPENING_Y_M = (0.1, 2.1)  # ... and this high over the floor at the threshold
SKIP_TOKENS = ("fx:", "path:", "paint:")


def _plan_bounds(mesh):
    lo, hi = mesh.bounds
    return lo[0], -hi[1], hi[0], -lo[1]          # x0, z0, x1, z1 in province metres


class _World:
    """The walked-against meshes (one world mesh per piece, loaded once),
    queried as one concatenation whose faces map back to their uids."""

    def __init__(self, cat, scene, box, exclude=()):
        import trimesh
        x0, z0, x1, z1 = box
        parts, owners = [], []
        for p in scene.pieces:
            if p.y is None or p.uid in exclude or p.asset.startswith(SKIP_TOKENS):
                continue
            m = cat.mesh(p.asset).copy().apply_transform(measure._transform4(p))
            a, b, c, d = _plan_bounds(m)
            if c < x0 - NEAR_M or a > x1 + NEAR_M or d < z0 - NEAR_M or b > z1 + NEAR_M:
                continue
            parts.append(m)
            owners.append((p.uid, len(m.faces)))
        self.mesh = trimesh.util.concatenate(parts) if parts else None
        self.face_uid = np.concatenate([np.full(n, i) for i, (_u, n) in enumerate(owners)]) \
            if owners else np.zeros(0, int)
        self.uids = [u for u, _n in owners]

    def first_hits(self, origins, dirs):
        """(distance, uid) of each ray's first hit (inf, None where none)."""
        n = len(origins)
        dist = np.full(n, np.inf)
        who = [None] * n
        if self.mesh is None or not n:
            return dist, who
        locs, rays, tris = cast_rays(self.mesh, origins, dirs, multiple_hits=False)
        for loc, r, t in zip(locs, rays, tris):
            d = float(np.linalg.norm(loc - origins[r]))
            if d < dist[r]:
                dist[r] = d
                who[r] = self.uids[int(self.face_uid[t])]
        return dist, who


def _stations(points, step=SAMPLE_M):
    out = []
    for (ax, az), (bx, bz) in zip(points, points[1:]):
        n = max(1, int(math.ceil(math.dist((ax, az), (bx, bz)) / step)))
        for k in range(n):
            t = k / n
            out.append((ax + (bx - ax) * t, az + (bz - az) * t))
    out.append(tuple(points[-1]))
    return out


def _slope_deg(g, x, z, r=FLAT_R_M) -> float:
    """Steepest slope between the point and a ring at r/2 and r (8 bearings)."""
    h0 = g.height(x, z)
    worst = 0.0
    for k in range(8):
        b = math.radians(45 * k)
        prev = (0.0, h0)
        for rr in (r / 2, r):
            h = g.height(x + rr * math.sin(b), z - rr * math.cos(b))
            worst = max(worst, math.degrees(math.atan2(abs(h - prev[1]), rr - prev[0])))
            prev = (rr, h)
    return worst


def _step_off_slope_deg(g, x, z, out, reach=STEP_OFF_M, half=STEP_OFF_HALF_M, step=0.5,
                        base=STEP_OFF_BASE_M) -> tuple:
    """Steepest slope (over ``base`` metres) of the dry ground a walker steps onto off a run's
    end: a box from the end point (already WALK_OUT_M past the deck) out
    ``reach`` along the way on (``out``, a unit [dx, dz]) and ``half`` either
    side of it (walk 6: the 1.5 m disc passed a start whose step-off was the
    flank of a bump). A bank beside the deck is not the step-off and is not
    judged. Returns (deg, [x, z] of the worst cell)."""
    ux, uz = out
    vx, vz = -uz, ux
    ns, nt, k = int(round(reach / step)), int(round(half / step)), int(round(base / step))
    H = np.full((ns + 1, 2 * nt + 1), np.nan)
    XZ = np.zeros((ns + 1, 2 * nt + 1, 2))
    for i in range(ns + 1):
        for j in range(-nt, nt + 1):
            px, pz = x + ux * i * step + vx * j * step, z + uz * i * step + vz * j * step
            XZ[i, j + nt] = (px, pz)
            h = g.height(px, pz)
            w = g.water_level(px, pz)
            if w is None or w < h:
                H[i, j + nt] = h
    worst, at = 0.0, [round(x, 2), round(z, 2)]
    for dh, xz in ((np.abs(H[k:, :] - H[:-k, :]), XZ[:-k, :]), (np.abs(H[:, k:] - H[:, :-k]), XZ[:, :-k])):
        m = np.where(np.isfinite(dh), dh, -1.0)
        i, j = np.unravel_index(int(np.argmax(m)), m.shape)
        sl = math.degrees(math.atan(max(0.0, float(m[i, j])) / base))
        if sl > worst:
            worst, at = sl, [round(float(xz[i, j, 0]), 2), round(float(xz[i, j, 1]), 2)]
    return worst, at


def _disc(radius):
    """The capsule's footprint as ray offsets: its centre, a ring at half
    its radius and a ring at its radius (a crack between planks narrower than
    the capsule never drops it; a rail under its foot always lifts it)."""
    out = [(0.0, 0.0)]
    for r, n in ((radius / 2, 4), (radius, 8)):
        out += [(r * math.cos(2 * math.pi * k / n), r * math.sin(2 * math.pi * k / n)) for k in range(n)]
    return out


def walk_line(world, g, points, step_m, radius, start_y=None, name=""):
    """Walk the capsule along ``points`` (province x, z). Returns the row:
    `lengthM`, `stations`, `blocks` [{kind, atM, toM, xz, riseM|dropM|chestM,
    uid, why}], `largestStepM`."""
    st = _stations(points)
    n = len(st)
    disc = _disc(radius)
    if start_y is None:
        w0 = g.water_level(*st[0])
        start_y = max(g.height(*st[0]), w0 if w0 is not None else -math.inf)
    y = start_y
    blocks, largest, along = [], 0.0, 0.0
    low_run = []                 # stations in a row with no footing at the deck height
    ys = []                      # (station, where, deck y) of every station walked
    for i, (x, z) in enumerate(st):
        if i:
            along += math.dist(st[i - 1], st[i])
        top = y + HEAD_M
        origins = np.array([[x + ox, -(z + oz), top] for ox, oz in disc])
        dist, who = world.first_hits(origins, np.array([0.0, 0.0, -1.0]))
        best, uid, wet = -math.inf, None, 0
        for k, (ox, oz) in enumerate(disc):
            gy = float(g.height(x + ox, z + oz))
            w = g.water_level(x + ox, z + oz)
            my = top - dist[k] if math.isfinite(dist[k]) else -math.inf
            if my >= gy:
                s, u = my, who[k]
            elif w is not None and w - gy > 0.7:
                s, u = w - 0.7, "water"          # deeper than a walker wades: no footing
                wet += 1
            else:
                s, u = gy, "ground"
            if s > best:
                best, uid = s, u
        here = {"atM": round(along, 2), "xz": [round(x, 2), round(z, 2)]}
        if i == 0:
            y = best
            ys.append((i, here, y))
            continue
        rise = best - y
        if rise > step_m + 1e-6:
            blocks.append({"kind": "block", **here, "riseM": round(rise, 2), "uid": uid,
                           "standY": round(y, 3),
                           "why": f"a {rise:.2f} m rise under the capsule (step {step_m} m)"})
            low_run = []
        elif -rise > FALL_M or wet == len(disc):
            low_run.append((here, best, uid))
            if len(low_run) >= GAP_STATIONS:     # the whole capsule over no deck: it falls
                h0 = low_run[0][0]
                blocks.append({"kind": "gap", **h0, "dropM": round(y - best, 2), "uid": uid,
                               "why": f"no deck under the line for {len(low_run) * SAMPLE_M:.1f} m "
                                      f"(a hole, an open joint or open water)"})
                y = best
                low_run = []
        else:
            largest = max(largest, abs(rise))
            y = best
            low_run = []
        ys.append((i, here, y))
    # the capsule's body, segment by segment, in one cast: rays from each
    # station to the next at CHEST_M over its deck, at its centre and at
    # its radius either side (a post, a chain, a lantern in the doorway)
    rows, origins, dirs_, lens = [], [], [], []
    for (i0, _h0, y0), (i1, h1, _y1) in zip(ys, ys[1:]):
        (px, pz), (x, z) = st[i0], st[i1]
        seg = math.dist((px, pz), (x, z))
        if seg < 1e-6:
            continue
        ux, uz = (x - px) / seg, (z - pz) / seg
        for off in (-radius, 0.0, radius):
            for h in CHEST_M:
                origins.append([px - uz * off, -(pz + ux * off), y0 + h])
                dirs_.append([ux, -uz, 0.0])
                lens.append(seg)
                rows.append((h1, h, off, y0))
    if origins:
        cd, cw = world.first_hits(np.array(origins), np.array(dirs_))
        hit_at = {}
        for (h1, h, off, y0), dd, u, L in zip(rows, cd, cw, lens):
            if dd <= L and h1["atM"] not in hit_at:
                hit_at[h1["atM"]] = {"kind": "block", **h1, "chestM": h, "offM": off, "uid": u,
                                     "standY": round(y0, 3),
                                     "why": f"{u} across the way {h} m over the deck"}
        blocks += list(hit_at.values())
    blocks.sort(key=lambda b: b["atM"])
    merged = []
    for b in blocks:
        if merged and merged[-1]["uid"] == b["uid"] and merged[-1]["kind"] == b["kind"] \
                and b["atM"] - merged[-1]["toM"] <= 0.5:
            merged[-1]["toM"] = b["atM"]
            continue
        merged.append(dict(b, toM=b["atM"]))
    return {"name": name, "lengthM": round(along, 2), "stations": n, "blocks": merged,
            "largestStepM": round(largest, 2)}


def _deck_centre(cat, p):
    from shapely.geometry import Polygon
    c = Polygon(measure.footprint_province(cat, p)).minimum_rotated_rectangle.centroid
    return (float(c.x), float(c.y))


def run_lines(cat, scene, g):
    """{run id: (members, points, (start_on_ground, end_on_ground))}."""
    from .rules import _ends
    runs: dict[str, list] = {}
    for p in scene.pieces:
        if p.y is None or not getattr(p, "walkable", False):
            continue
        if measure.deck_seated(cat.row(p.asset)):
            continue                    # a house on stilts: its door approach walks its landing
        role = p.role or {}
        key = role["id"] if role.get("kind") == "run" else p.uid
        runs.setdefault(key, []).append(p)
    out = {}
    for key, members in runs.items():
        members.sort(key=lambda q: (q.role or {}).get("index", 0))
        cs = [_deck_centre(cat, q) for q in members]

        def outward(q, c, other):
            a, b = _ends(cat, q)
            e = max((a, b), key=lambda e_: math.dist(e_, other))
            dx, dz = e[0] - c[0], e[1] - c[1]
            L = math.hypot(dx, dz) or 1.0
            return e, (e[0] + dx / L * WALK_OUT_M, e[1] + dz / L * WALK_OUT_M)

        if len(members) == 1:
            a, b = _ends(cat, members[0])
            e0, s = a, (a[0] + (a[0] - b[0]) * WALK_OUT_M / max(math.dist(a, b), 1e-6),
                        a[1] + (a[1] - b[1]) * WALK_OUT_M / max(math.dist(a, b), 1e-6))
            e1, t = b, (b[0] + (b[0] - a[0]) * WALK_OUT_M / max(math.dist(a, b), 1e-6),
                        b[1] + (b[1] - a[1]) * WALK_OUT_M / max(math.dist(a, b), 1e-6))
        else:
            e0, s = outward(members[0], cs[0], cs[1])
            e1, t = outward(members[-1], cs[-1], cs[-2])
        ends_dry = []
        pts = []
        for e, beyond in ((e0, s), (e1, t)):
            w = g.water_level(*beyond)
            dry = w is None or g.height(*beyond) >= w - 0.05
            ends_dry.append(dry)
        joined = [None, None]
        for j, e in enumerate((e0, e1)):
            if not ends_dry[j]:
                joined[j] = _joined_piece(cat, scene, e, {q.uid for q in members})
        pts = (([s] if ends_dry[0] else ([_deck_centre(cat, joined[0])] if joined[0] else []) + [e0])
               + cs
               + ([t] if ends_dry[1] else [e1] + ([_deck_centre(cat, joined[1])] if joined[1] else [])))
        out[key] = (members, pts, tuple(ends_dry), tuple(q.uid if q else None for q in joined))
    return out


def _joined_piece(cat, scene, end, own: set):
    """The walkable piece (not of this run) whose footprint comes within
    JOIN_M of a run end over water: the run walks on into it (a junction,
    a corner, the next run), so the joint between them is walked."""
    from shapely.geometry import Point, Polygon
    best, bd = None, JOIN_M
    for q in scene.pieces:
        if q.uid in own or q.y is None or not getattr(q, "walkable", False):
            continue
        d = Polygon(measure.footprint_province(cat, q)).distance(Point(end))
        if d <= bd:
            best, bd = q, d
    return best


def _path_lines(scene):
    """[(id, [(x, z), ...])] of the scene's paths."""
    out = []
    for r in (getattr(scene, "paths", None) or []):
        pts = (r.get("pointsM") or r.get("points")) if isinstance(r, dict) else None
        if pts and len(pts) >= 2:
            out.append((r.get("id"), [tuple(map(float, q)) for q in pts]))
    return out


def _tail(points, length):
    """The last ``length`` metres of a polyline, in walking order."""
    out = [points[-1]]
    left = length
    for a, b in zip(points[::-1][1:], points[::-1]):
        d = math.dist(a, b)
        if d >= left:
            t = left / d
            out.append((b[0] + (a[0] - b[0]) * t, b[1] + (a[1] - b[1]) * t))
            break
        out.append(a)
        left -= d
    return out[::-1]


def door_lines(cat, scene):
    """[(door row, points)] for every bound door: the last DOOR_PATH_M of
    the path that ends within DOOR_PATH_REACH_M of its threshold (the way a
    walker comes: over a landing, up its steps), else DOOR_OUT_M out along
    the doorway record's own facing; then the threshold."""
    from . import rules
    out = []
    paths_ = _path_lines(scene)
    for p in scene.pieces:
        rep = measure.door_report(cat, scene, p)
        if not rep or not rep.get("best"):
            continue
        d = rep["best"]
        facing = d.get("facingDeg") if d.get("facingDeg") is not None else d.get("outwardDeg")
        if facing is None:
            continue
        tx, tz = float(d["thresholdM"][0]), float(d["thresholdM"][-1])
        fx, fz = rules._bearing_vec(facing)
        via = None
        for pid, pts in paths_:
            for seq in (pts, pts[::-1]):
                if math.dist(seq[-1], (tx, tz)) <= DOOR_PATH_REACH_M and \
                        (via is None or math.dist(seq[-1], (tx, tz)) < via[2]):
                    via = (pid, _tail(seq, DOOR_PATH_M), math.dist(seq[-1], (tx, tz)))
        head = via[1] if via else [(tx + fx * DOOR_OUT_M, tz + fz * DOOR_OUT_M)]
        if math.dist(head[-1], (tx, tz)) < 0.05:
            head = head[:-1]
        out.append(({"id": f"door:{p.uid}", "uid": p.uid, "facingDeg": facing,
                     "via": via[0] if via else "facing"},
                    head + [(tx, tz)]))
    return out


def door_openings(cat, scene):
    """[(door row, threshold)] for EVERY doorway opening the shell's doorway
    record lists (`measure.door_report` doorways: piece and interiors/approach
    doorways), enterable, hollow or promised alike (ruling R89: the owner
    judges a lantern in a doorway by how it looks, not whether the door
    loads). A landing's shore edge is not an opening and is skipped."""
    out = []
    for p in scene.pieces:
        rep = measure.door_report(cat, scene, p)
        for i, d in enumerate((rep or {}).get("doorways", [])):
            facing = d.get("facingDeg") if d.get("facingDeg") is not None else d.get("outwardDeg")
            if facing is None or d.get("source") == "landing":
                continue
            out.append(({"id": f"door:{p.uid}" + (f"#{i}" if i else ""), "uid": p.uid,
                         "facingDeg": facing},
                        (float(d["thresholdM"][0]), float(d["thresholdM"][-1]))))
    return out


def door_fixtures(cat, scene, door: dict, threshold) -> list[str]:
    """Every light or hanging piece (`seat_rules.is_fixture` / its hanging
    class) whose mesh enters the door opening: a box OPENING_HALF_M either
    side of the threshold, across and through, OPENING_Y_M over the floor
    (the highest mesh under the threshold) (16k walk 6: a lantern hung in
    the Riverwalk house doorway)."""
    from . import seat_rules
    from .mesh_query import cast_rays as _cr
    host = scene.piece(door["uid"])
    hm = cat.mesh(host.asset).copy().apply_transform(measure._transform4(host))
    tx, tz = threshold
    locs, _r, _t = _cr(hm, np.array([[tx, -tz, hm.bounds[1][2] + 1.0]]), np.array([0.0, 0.0, -1.0]),
                       multiple_hits=True)
    top = hm.bounds[1][2] + 1.0
    floor = None
    # the floor: the highest hit under a head-height band over the lowest walkable level
    zs = sorted(float(v) for v in locs[:, 2]) if len(locs) else []
    for i, zv in enumerate(zs):
        above = [z2 for z2 in zs[i + 1:] if z2 - zv > 0.05]
        if not above or above[0] - zv >= 2.0:
            floor = zv
            break
    if floor is None:
        return []
    f = math.radians(door["facingDeg"])
    ux, uz = math.sin(f), -math.cos(f)             # through the opening (province x, z)
    out = []
    for p in scene.pieces:
        if p.uid == host.uid or p.y is None:
            continue
        if not (seat_rules.is_fixture(cat, p) or seat_rules.hanging_class(cat, p.asset)):
            continue
        v = cat.mesh(p.asset).vertices @ measure._transform4(p)[:3, :3].T + measure._transform4(p)[:3, 3]
        dx, dz = v[:, 0] - tx, -v[:, 1] - tz
        through = dx * ux + dz * uz
        across = -dx * uz + dz * ux
        up = v[:, 2] - floor
        inside = (np.abs(through) <= OPENING_HALF_M) & (np.abs(across) <= OPENING_HALF_M) & \
            (up >= OPENING_Y_M[0]) & (up <= OPENING_Y_M[1])
        if inside.any():
            out.append(p.uid)
    del top
    return out


def door_reach() -> dict:
    """{reachM, verticalM, source}: the runtime's door reach, read live from
    game-core `interior/doors.ts` (DOOR_REACH_M, DOOR_REACH_VERTICAL_M)."""
    import re
    from . import paths
    f = paths.REPO_ROOT / "packages/game-core/src/interior/doors.ts"
    got = {}
    for name, key in (("DOOR_REACH_M", "reachM"), ("DOOR_REACH_VERTICAL_M", "verticalM")):
        m = re.search(rf"export const {name} = ([0-9.]+);", f.read_text())
        if not m:
            raise ValueError(f"{f}: no `export const {name} = <number>;`")
        got[key] = float(m.group(1))
    got["source"] = "packages/game-core/src/interior/doors.ts"
    return got


def door_arrival(world, g, row, pts, host: str, reach: dict) -> None:
    """A door walk ends where the walker stands to activate it. The first
    block on the host's own mesh within reach of the threshold is the door
    itself (its sill, leaf or mouth): the walk arrives there, and passes when
    the sill surface at the threshold stands within the vertical reach over
    the last footing. Anything else (another piece, a block further out, a
    sill out of reach) stays a block. Writes `arrival` on the row."""
    at = None
    if not row["blocks"]:
        stand, stop = None, 0.0
    else:
        # the host's own block nearest the threshold along the walked route;
        # an earlier block (a water gap) does not hide the door's arrival
        host_blocks = [i for i, x in enumerate(row["blocks"])
                       if x.get("uid") == host and x["kind"] == "block"]
        if not host_blocks:
            return
        at = max(host_blocks, key=lambda i: row["blocks"][i]["atM"])
        b = row["blocks"][at]
        stop = max(0.0, row["lengthM"] - b["atM"] + SAMPLE_M)
        if stop > reach["reachM"]:
            return
        stand = b.get("standY")
    tx, tz = pts[-1]
    if stand is None:
        stand = float(g.height(tx, tz))
    top = stand + HEAD_M
    dist, _who = world.first_hits(np.array([[tx, -tz, top]]), np.array([0.0, 0.0, -1.0]))
    sill = max(float(g.height(tx, tz)), top - float(dist[0]) if math.isfinite(dist[0]) else -math.inf)
    rise = sill - stand
    row["arrival"] = {"stopM": round(stop, 2), "sillRiseM": round(rise, 2), **reach}
    if rise <= reach["verticalM"] + 1e-6:
        first = 0 if at is None else at
        row["blocks"] = [x for i, x in enumerate(row["blocks"])
                         if i < first or (i > first and x.get("uid") != host)]
    else:
        row["blocks"].insert(0 if at is None else at, {"kind": "block", "atM": row["lengthM"], "toM": row["lengthM"],
                              "xz": [round(tx, 2), round(tz, 2)], "uid": host,
                              "why": f"the door's sill stands {rise:.2f} m over the last footing "
                                     f"(reach {reach['verticalM']} m)"})


def walkway(cat, scene, ys: dict | None = None) -> dict:
    """walkwayRule over the scene: {runs: {id: row}, doors: {id: row},
    failures: [text]}. ``ys`` ({uid: pivot y}) re-poses pieces first (the
    published bundle's heights, `--published`)."""
    from . import rules
    if ys:
        for p in scene.pieces:
            if p.uid in ys:
                p.y = ys[p.uid]
    g = rules._ground(cat, scene)
    ch = rules.character()
    step, radius = ch["stepM"], ch["capsuleRadiusM"]
    lines, members_of = [], {}
    for key, (members, pts, dry, _joined) in run_lines(cat, scene, g).items():
        lines.append(("run", key, pts, dry))
        members_of[key] = members[0].uid
    for d, pts in door_lines(cat, scene):
        lines.append(("door", d["id"], pts, (True, False)))
    if not lines:
        return {"runs": {}, "doors": {}, "failures": []}
    allp = np.array([p for _k, _i, pts, _d in lines for p in pts])
    world = _World(cat, scene, (allp[:, 0].min(), allp[:, 1].min(), allp[:, 0].max(), allp[:, 1].max()))
    runs, doors, fails = {}, {}, []
    for d, threshold in door_openings(cat, scene):
        for u in door_fixtures(cat, scene, d, threshold):
            fails.append(f"{d['id']}~{u}: {d['id']} a hung or standing fixture ({u}) inside the "
                         f"door opening (±{OPENING_HALF_M} m across and through the threshold, "
                         f"{OPENING_Y_M[0]}-{OPENING_Y_M[1]} m up): hang it beside the frame")
    reach = door_reach()
    for kind, key, pts, dry in lines:
        row = walk_line(world, g, pts, step, radius, name=key)
        if kind == "door":
            door_arrival(world, g, row, pts, key.removeprefix("door:"), reach)
        for end, ok, (x, z) in (("start", dry[0], pts[0]), ("end", dry[1], pts[-1])):
            if kind == "door" or not ok:
                continue
            sl = _slope_deg(g, x, z)
            (ax, az), (bx, bz) = (pts[1], pts[0]) if end == "start" else (pts[-2], pts[-1])
            dl = math.hypot(bx - ax, bz - az) or 1.0
            side, side_at = _step_off_slope_deg(g, x, z, ((bx - ax) / dl, (bz - az) / dl))
            row[end] = {"xz": [round(x, 2), round(z, 2)], "slopeDeg": round(sl, 1),
                        "stepOffDeg": round(side, 1), "stepOffXz": side_at}
            if sl > FLAT_DEG:
                row["blocks"].append({"kind": "not-flat", "atM": 0.0 if end == "start" else row["lengthM"],
                                      "xz": [round(x, 2), round(z, 2)], "uid": "ground",
                                      "why": f"the {end} stands on ground {sl:.1f} deg steep "
                                             f"(> {FLAT_DEG}): move it onto the flat ground beside it"})
            elif side > FLAT_DEG:
                row["blocks"].append({"kind": "bump-on-step-off", "atM": 0.0 if end == "start" else row["lengthM"],
                                      "xz": side_at, "uid": "ground",
                                      "why": f"the ground a walker steps onto off the {end} ({STEP_OFF_M} m on, "
                                             f"±{STEP_OFF_HALF_M} m) rises {side:.1f} deg over {STEP_OFF_BASE_M} m (> {FLAT_DEG}): "
                                             f"move the end onto the flat or level the bump with a pad "
                                             f"in the place's own ground (0102)"})
        head = key if kind == "door" else members_of[key]
        for b in row["blocks"]:
            who = b["uid"] if b["uid"] not in (None, "ground", "water") else None
            lead = f"{head}~{who}" if who and who != head.removeprefix("door:") else head
            fails.append(f"{lead}: {key} {b['kind']} at {b['atM']} m {b['xz']} by {b['uid']}: "
                         f"{b['why']}")
        (runs if kind == "run" else doors)[key] = row
    return {"runs": runs, "doors": doors, "failures": fails,
            "bars": {"stepM": step, "capsuleRadiusM": radius, "fallM": FALL_M, "flatDeg": FLAT_DEG}}
