#!/usr/bin/env python3
"""The agent walk's route for one built place (tooling/gpu-lane/walk/README.md).

    python3 tooling/gpu-lane/walk/walk_route.py <placeId> [--out route.json] [--public DIR] [--only door5,fire2]

Reads only the PUBLISHED data the studio loads (public/province/settlements/
<placeId>.json, the kits' parts indexes, public/province/interiors/<cell>.json)
and writes route JSON (schemaVersion 2). Deterministic: inputs are sorted, no
randomness, no clock. Bearings are COMPASS radians (0 = north = -z, pi/2 =
east = +x; doors.ts compassDirection); the runner converts them to the follow
camera's yaw. Pitches are follow-camera pitch: POSITIVE looks DOWN.
"""
from __future__ import annotations

import argparse
import json
import math
import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
PUBLIC = REPO / "apps/world-studio/public"
SCHEMA = 2
DOOR_APPROACH_M = 0.6  # outward from the threshold; DOOR_REACH_M is 1.5 planar (game-core interior/doors.ts:4)
DOOR_OUT_M = 3.0  # out shot stand-off after leaving
INTERIOR_STEP_M = 1.5  # walked forward into the room before the interior shots
FIRE_CLUSTER_M = 6.0
FIRE_STAND_M = 4.0
CLOSE_STAND_M = 6.0
SIGN_CLUSTER_M = 3.0
WALK_MAX_M = 40.0
CLEAR_M = 0.5  # every stand point clears every collider footprint by this much
PUSH_STEP_M, PUSH_MAX_M = 0.25, 8.0
DETOUR_M = 1.2  # a detour corner sits this far out from a footprint corner
FIRE_FRAMES, FIRE_DT_S = 6, 0.25
FREE_WALK_S = 20.0
WALK_SPEED_MPS = 3.5  # walk_run.mjs --speed default
# Follow camera (packages/game-core/src/camera/followCamera.ts:9, :25): the view ray passes through
# the look target 1.45 m over the feet; positive pitch looks down, negative looks up.
LOOK_ABOVE_FEET_M = 1.45
EYE_M = 1.6  # close-up pitches are computed from this eye height over the stand ground
CLOSE_FILL = 1 / 3  # a close-up subject fills this share of the frame height
CLOSE_FOV_RAD = math.radians(60)  # vertical field of view the fill is sized for
CLOSE_MIN_M, CLOSE_MAX_M = 3.0, 12.0
# audit10 H9: a look-up over ~7 deg frames sky (the arm drops under the look target and the subject sits on
# a roof or a post over a sky backdrop): close-ups stand far enough back to stay under this, and every
# pitch is clamped to it (walk-lib.mjs MAX_UP_RAD is the runner's copy of this number)
CLOSE_MAX_UP_RAD = 0.12
MAX_DOWN_RAD = 0.6
CENTRE_REGION_RAD = math.radians(10)  # a framed target sits within this of the view ray (tests)
FIRE_SIZE_M = 0.6
FLAME_ABOVE_ORIGIN_M = 0.3  # a fixture with no light, flame or size row: the flame sits this far over its origin
SIGN_STAND_M = 3.0  # sign close-ups stand at least this far off the board, on its reading side
SIGN_SIZE_M = 1.0
FEATURE_SIZE_MIN_M, FEATURE_SIZE_MAX_M = 2.5, 8.0  # a parcel feature shot frames its footprint extent, clamped
LOS_NEAR_M = 1.0  # footprints this close to a target are its own (a lantern's shed): they never block its sight line
PROMISE_SIZE_M = 2.5  # a promised thing (shed, bones, steps, a seep) is framed at this size
PROMISE_AIM_M = 0.8  # aimed this far over the filler's origin
THING_ROW_RE = re.compile(r"\.thing-")  # the physical-promise rows (promise_gate.PHYSICAL_NOUNS)
END_CLEAR_M = 2.0  # the free-walk end shot: nothing within this of the stand or the camera behind it
END_BACK_STEP_M = 0.5
YAW_CHECK_M = 4.0  # the runner's yaw check walks ~1 s (3.5 m) north then east from the first waypoint
OVERVIEW_PITCH = 0.08
INTERIOR_PITCH = round(math.radians(5), 4)  # 5 deg down (follow-camera convention), stood at the floor centre
# A placement burns when its kit's fires map gives it a light or flame cards,
# or its asset is a burning piece by name (campfire01burning has no fires-map row).
BURNING_RE = re.compile(r"burning|brazier|candle|lantern|torch|fxfire", re.I)
SIGN_RE = re.compile(r"sign", re.I)

Pt = tuple[float, float]
Poly = list[Pt]


def bearing(fx: float, fz: float, tx: float, tz: float) -> float:
    """Compass radians from (fx, fz) towards (tx, tz)."""
    return round(math.atan2(tx - fx, -(tz - fz)), 4)


def compass(deg: float) -> tuple[float, float]:
    r = math.radians(deg)
    return math.sin(r), -math.cos(r)


def wrap(a: float) -> float:
    return round(math.atan2(math.sin(a), math.cos(a)), 4)


def r2(x: float) -> float:
    return round(x, 2)


def burning_assets(bundle: dict, public: Path) -> dict[str, dict]:
    """Fires-map rows (light, flame cards) of every burning asset in the bundle's kits, by asset id."""
    out: dict[str, dict] = {}
    for kit_id in sorted(bundle.get("kits", {})):
        idx = public / (bundle["kits"][kit_id]["glb"][:-4] + "/parts/index.json")
        if not idx.exists():
            continue
        for aid, row in sorted((json.loads(idx.read_text()).get("fires") or {}).items()):
            if any(k in row for k in ("light", "flames", "flameCardMaterials")):
                out.setdefault(aid, row)
    return out


def flame_rise_m(row: dict | None) -> float:
    """Height of the flame over the fixture's origin, from its fires-map row (game frame, y up): the light's
    offset, else the first flame's, else the middle of a flame-card volume (sizeM z-up over originOffsetM),
    else FLAME_ABOVE_ORIGIN_M."""
    row = row or {}
    for off in ((row.get("light") or {}).get("offsetM"), ((row.get("flames") or [{}])[0] or {}).get("offsetM")):
        if off and len(off) == 3:
            return float(off[1])
    if row.get("sizeM") and row.get("originOffsetM"):
        return row["sizeM"][2] / 2 - row["originOffsetM"][2]
    return FLAME_ABOVE_ORIGIN_M


def sign_board_y(p: dict) -> float:
    """World y of a sign board's centre: halfway between the origin and the piece's lowest point (a hanging
    blade hangs below its hook; groundContactOffsetM is origin-to-bottom), the origin when unknown."""
    drop = (p.get("anchor") or {}).get("groundContactOffsetM") or 0.0
    return p["positionM"][1] - drop / 2


def target_y(p: dict) -> float:
    """World y of a placement's visual centre: a hanging piece (origin over its lowest point by more than
    0.3 m, groundContactOffsetM) halfway down from its origin; a standing one PROMISE_AIM_M over it."""
    drop = (p.get("anchor") or {}).get("groundContactOffsetM") or 0.0
    return p["positionM"][1] - drop / 2 if drop > 0.3 else p["positionM"][1] + PROMISE_AIM_M


def sign_shot(x: float, y: float, z: float, yaw_deg: float, centre: Pt, ground: list[tuple],
              polys: list[Poly], box: tuple) -> tuple[float, float, float, float]:
    """(stand x, stand z, compass yaw, pitch) for a sign board at (x, y, z) facing compass `yaw_deg`: a blade
    reads from both faces, so the stand is SIGN_STAND_M off along whichever face points towards the place
    centre (the street it is hung for), pushed clear; the yaw aims at the board, the pitch from EYE_M over the
    stand ground to the board centre. The stand-off follows the close-up rule (close_stand_m: a high board
    is shot from far enough back to stay under CLOSE_MAX_UP_RAD), never under SIGN_STAND_M."""
    fx, fz = compass(yaw_deg)
    if fx * (centre[0] - x) + fz * (centre[1] - z) < 0:
        fx, fz = -fx, -fz
    gy = ground_y(x, z, ground, y - 2.0)
    for _ in range(3):
        d = max(SIGN_STAND_M, close_stand_m(y - (gy + EYE_M), SIGN_SIZE_M))
        sx, sz = clear_stand(x, z, x + fx * d, z + fz * d, polys, box, los=True)
        gy = ground_y(sx, sz, ground, y - 2.0)
    return sx, sz, bearing(sx, sz, x, z), aim_pitch(sx, sz, x, y, z, gy, EYE_M)


def is_burning(p: dict, fire_assets: set[str]) -> bool:
    if p.get("kind") == "effect":
        return False  # smoke columns
    return p["assetId"] in fire_assets or bool(BURNING_RE.search(p["assetId"]))


def clusters(points: list[tuple], radius: float) -> list[list[tuple]]:
    """Single-linkage clusters on (id, x, z, ...), stable: input sorted by id, clusters by first id."""
    pts = sorted(points)
    parent = list(range(len(pts)))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i in range(len(pts)):
        for j in range(i + 1, len(pts)):
            if math.hypot(pts[i][1] - pts[j][1], pts[i][2] - pts[j][2]) <= radius:
                parent[find(j)] = find(i)
    groups: dict[int, list] = {}
    for i, p in enumerate(pts):
        groups.setdefault(find(i), []).append(p)
    return sorted(groups.values(), key=lambda g: g[0][0])


def parcels(bundle: dict) -> dict[str, list[dict]]:
    """Placements with a position by parcel (the `<parcel>` of `…parcel.<place>.<parcel>.…` ids), sorted by id."""
    out: dict[str, list[dict]] = {}
    for p in sorted(bundle["placements"], key=lambda p: p["id"]):
        if ".parcel." in p["id"] and p.get("positionM"):
            out.setdefault(p["id"].split(".parcel.", 1)[1].split(".")[1], []).append(p)
    return out


def feature_target(parts: list[dict]) -> tuple[float, float, float, float]:
    """(x, y, z, size) of a parcel: the centre of the box over its footprints (the position where a piece
    has none), y the median visual centre (target_y), size the longer box side clamped to FEATURE_SIZE_*."""
    pts = [tuple(q) for p in parts for q in (p.get("footprintM") or [(p["positionM"][0], p["positionM"][2])])]
    xs, zs = [q[0] for q in pts], [q[1] for q in pts]
    ys = sorted(target_y(p) for p in parts)
    size = max(FEATURE_SIZE_MIN_M, min(FEATURE_SIZE_MAX_M, max(max(xs) - min(xs), max(zs) - min(zs))))
    return (min(xs) + max(xs)) / 2, ys[len(ys) // 2], (min(zs) + max(zs)) / 2, size


# ---- collider geometry (planar, settlement x/z metres) ----

def colliders(bundle: dict) -> list[Poly]:
    """Footprints of every placement that has a collider (collision kind other than none), by id."""
    return [[(q[0], q[1]) for q in p["footprintM"]] for p in sorted(bundle["placements"], key=lambda p: p["id"])
            if (p.get("collision") or {}).get("kind", "none") != "none" and len(p.get("footprintM") or []) >= 3]


def edges(poly: Poly) -> list[tuple[Pt, Pt]]:
    return list(zip(poly, poly[1:] + poly[:1]))


def inside(x: float, z: float, poly: Poly) -> bool:
    c = False
    for (ax, az), (bx, bz) in edges(poly):
        if (az > z) != (bz > z) and x < ax + (z - az) * (bx - ax) / (bz - az):
            c = not c
    return c


def seg_dist(x: float, z: float, a: Pt, b: Pt) -> float:
    dx, dz = b[0] - a[0], b[1] - a[1]
    t = max(0.0, min(1.0, ((x - a[0]) * dx + (z - a[1]) * dz) / ((dx * dx + dz * dz) or 1.0)))
    return math.hypot(x - a[0] - t * dx, z - a[1] - t * dz)


def clearance(x: float, z: float, polys: list[Poly]) -> float:
    """Distance to the nearest collider footprint edge, negative when inside one."""
    best = math.inf
    for poly in polys:
        d = min(seg_dist(x, z, a, b) for a, b in edges(poly))
        best = min(best, -d if inside(x, z, poly) else d)
    return best


def _cross(p1: Pt, p2: Pt, p3: Pt, p4: Pt) -> bool:
    def o(a, b, c):
        return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
    return o(p1, p2, p3) * o(p1, p2, p4) < 0 and o(p3, p4, p1) * o(p3, p4, p2) < 0


def blocking(a: Pt, b: Pt, polys: list[Poly]) -> list[Poly]:
    """Footprints the segment a-b crosses or ends inside."""
    return [poly for poly in polys
            if inside(*a, poly) or inside(*b, poly) or any(_cross(a, b, p, q) for p, q in edges(poly))]


def in_box(x: float, z: float, box: tuple) -> bool:
    return box[0] <= x <= box[1] and box[2] <= z <= box[3]


def clear_stand(tx: float, tz: float, sx: float, sz: float, polys: list[Poly], box: tuple, los: bool = False) -> Pt:
    """Push (sx, sz) outward along target->stand until it clears every footprint by CLEAR_M; when that
    bearing cannot clear within PUSH_MAX_M, try the next bearing in 30 deg steps, alternating sides.
    `los` (close-ups, audit10 H9): the sight line stand->target must also cross no footprint but the
    target's own (those within LOS_NEAR_M of it), so a shot is never taken through a roof or a wall;
    when no bearing has one, the first clear stand is used."""
    dist = math.hypot(sx - tx, sz - tz) or 1.0
    b0 = math.atan2(sx - tx, sz - tz)
    others = [q for q in polys if clearance(tx, tz, [q]) > LOS_NEAR_M] if los else []
    first = None
    for k in (0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6):
        b = b0 + math.radians(30 * k)
        d = dist
        while d <= dist + PUSH_MAX_M:
            x, z = tx + math.sin(b) * d, tz + math.cos(b) * d
            if in_box(x, z, box) and clearance(x, z, polys) >= CLEAR_M:
                if not blocking((x, z), (tx, tz), others):
                    return x, z
                first = first or (x, z)
                break
            d += PUSH_STEP_M
    return first or (sx, sz)


def ground_y(x: float, z: float, ground: list[tuple], default: float) -> float:
    """Ground height at (x, z): the nearest published walk-route sample within 10 m."""
    best = min(ground, key=lambda g: (math.hypot(g[0] - x, g[2] - z), g), default=None)
    if best is None or math.hypot(best[0] - x, best[2] - z) > 10.0:
        return default
    return best[1]


def aim_pitch(sx: float, sz: float, tx: float, ty: float, tz: float, gy: float, eye: float = LOOK_ABOVE_FEET_M) -> float:
    """Follow-camera pitch (positive = down) that puts (tx, ty, tz) on the view ray through the point
    `eye` m over the feet standing at (sx, gy, sz), clamped to [-CLOSE_MAX_UP_RAD, MAX_DOWN_RAD]."""
    p = math.atan2(gy + eye - ty, max(0.5, math.hypot(tx - sx, tz - sz)))
    return round(max(-CLOSE_MAX_UP_RAD, min(MAX_DOWN_RAD, p)), 4)


def close_stand_m(rise: float, size: float) -> float:
    """Planar stand-off for a close-up of a subject `size` m tall whose centre is `rise` m above the eye:
    it fills CLOSE_FILL of the frame, and far enough that the look-up stays under CLOSE_MAX_UP_RAD."""
    fill = size / (CLOSE_FILL * 2 * math.tan(CLOSE_FOV_RAD / 2))
    up = max(0.0, rise) / math.tan(CLOSE_MAX_UP_RAD)
    return max(CLOSE_MIN_M, min(CLOSE_MAX_M, max(fill, up)))


def close_up(tx: float, ty: float, tz: float, size: float, centre: Pt, ground: list[tuple], default_gy: float,
             polys: list[Poly], box: tuple) -> tuple[float, float, float, float]:
    """(stand x, stand z, compass yaw, pitch) for a close-up of the world point (tx, ty, tz): the target is
    the fixture's actual position (mount height included), the pitch is measured from EYE_M over the
    stand ground."""
    gy = ground_y(tx, tz, ground, default_gy)
    for _ in range(3):  # the stand ground differs from the target's on a slope: settle the distance on it
        d = close_stand_m(ty - (gy + EYE_M), size)
        sx, sz = clear_stand(tx, tz, *stand_off(tx, tz, centre, d), polys, box, los=True)
        gy = ground_y(sx, sz, ground, default_gy)
    return sx, sz, bearing(sx, sz, tx, tz), aim_pitch(sx, sz, tx, ty, tz, gy, EYE_M)


def yaw_check_clear(p: Pt, polys: list[Poly]) -> bool:
    """True when walking YAW_CHECK_M north and east from p stays clear of every collider footprint."""
    for end in ((p[0], p[1] - YAW_CHECK_M), (p[0] + YAW_CHECK_M, p[1])):
        if clearance(*end, polys) < CLEAR_M or blocking(p, end, polys):
            return False
    return True


def stand_off(cx: float, cz: float, centre: Pt, dist: float) -> Pt:
    """A point `dist` from (cx, cz) on the side facing the place centre."""
    dx, dz = centre[0] - cx, centre[1] - cz
    n = math.hypot(dx, dz)
    if n < 1e-6:
        dx, dz, n = 0.0, 1.0, 1.0
    return cx + dx / n * dist, cz + dz / n * dist


# ---- land: the painted ways ----

def painted_ways(bundle: dict) -> list[tuple[str, list[Pt]]]:
    """Every groundPaint centreline (footpaths and roads: land inside the place), by id."""
    out = []
    for e in sorted(bundle.get("settlement", {}).get("groundPaint", {}).get("entries", []), key=lambda e: e["id"]):
        c = [(q[0], q[1]) for q in e.get("centrelineM") or []]
        if len(c) >= 2:
            out.append((e["id"], c))
    return out


def plen(c: list[Pt]) -> float:
    return sum(math.dist(a, b) for a, b in zip(c, c[1:]))


def land_points(ways: list[tuple[str, list[Pt]]], step: float = 1.0) -> list[Pt]:
    """Painted centrelines sampled every `step` metres, sorted."""
    out = set()
    for _, c in ways:
        for a, b in zip(c, c[1:]):
            n = max(1, int(math.dist(a, b) / step))
            for i in range(n + 1):
                out.add((round(a[0] + (b[0] - a[0]) * i / n, 2), round(a[1] + (b[1] - a[1]) * i / n, 2)))
    return sorted(out)


def free_walk(ways: list[tuple[str, list[Pt]]]) -> dict | None:
    """A turning walk along the longest painted way: one compass leg per centreline segment, timed
    at WALK_SPEED_MPS and cut at FREE_WALK_S. Never a fixed heading, never off the path."""
    if not ways:
        return None
    wid, pts = max(ways, key=lambda w: (plen(w[1]), w[0]))
    legs, left = [], FREE_WALK_S
    for a, b in zip(pts, pts[1:]):
        sec = min(left, math.dist(a, b) / WALK_SPEED_MPS)
        if sec < 0.05:
            continue
        frac = sec * WALK_SPEED_MPS / math.dist(a, b)
        end = (a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac)
        legs.append({"bearing": bearing(*a, *b), "seconds": r2(sec), "toM": [r2(end[0]), r2(end[1])]})
        left -= sec
        if left <= 1e-6:
            break
    return {"routeId": wid, "seconds": r2(sum(l["seconds"] for l in legs)), "speedMps": WALK_SPEED_MPS,
            "startM": [r2(pts[0][0]), r2(pts[0][1])], "legs": legs}


def fallback_loop(stands: list[Pt], anchor: Pt, polys: list[Poly]) -> list[tuple[str, list[Pt]]]:
    """A place with no painted way walks a closed loop through its door-base and fixture stands: walkable
    points only (clear of every footprint by CLEAR_M), sorted by compass angle around the anchor (ties by
    point), closed back to the first. Empty under two points."""
    pts = sorted({(r2(x), r2(z)) for x, z in stands if clearance(x, z, polys) >= CLEAR_M},
                 key=lambda p: (round(math.atan2(p[0] - anchor[0], -(p[1] - anchor[1])) % (2 * math.pi), 6), p))
    return [("fallback-loop", pts + pts[:1])] if len(pts) >= 2 else []


def end_shot(fw: dict | None, polys: list[Poly], box: tuple) -> dict | None:
    """The free-walk end shot: looks along the last leg at horizon pitch from a stand backed off along that
    leg until the stand and the camera END_CLEAR_M behind it both clear every footprint by END_CLEAR_M."""
    if not fw or not fw["legs"]:
        return None
    last = fw["legs"][-1]
    b = last["bearing"]
    dx, dz = math.sin(b), -math.cos(b)
    ex, ez = last["toM"]
    sx, sz = ex, ez
    back = 0.0
    while back <= PUSH_MAX_M:
        x, z = ex - dx * back, ez - dz * back
        cam = (x - dx * END_CLEAR_M, z - dz * END_CLEAR_M)
        if in_box(x, z, box) and min(clearance(x, z, polys), clearance(*cam, polys)) >= END_CLEAR_M:
            sx, sz = x, z
            break
        back += END_BACK_STEP_M
    return {"standM": [r2(sx), r2(sz)], "yaw": b, "pitch": 0.0}


# ---- ordering and arrival ----

def leave_point(w: dict) -> Pt:
    """Where the body is when it leaves a waypoint: the out-shot stand after a door action (the
    runner stands there for the out shot; the approach itself sits inside the building's footprint)."""
    for a in w["actions"]:
        if a["type"] == "door":
            return tuple(a["outShot"]["standM"])
    return w["xM"], w["zM"]


def detour(a: Pt, b: Pt, block: list[Poly], polys: list[Poly], box: tuple) -> Pt | None:
    """The shortest single corner point around the blocking footprints with both legs clear."""
    cands = []
    for poly in block:
        cx = sum(p[0] for p in poly) / len(poly)
        cz = sum(p[1] for p in poly) / len(poly)
        for px, pz in poly:
            n = math.hypot(px - cx, pz - cz) or 1.0
            v = (round(px + (px - cx) / n * DETOUR_M, 2), round(pz + (pz - cz) / n * DETOUR_M, 2))
            if in_box(*v, box) and clearance(*v, polys) >= CLEAR_M and not blocking(a, v, polys) and not blocking(v, b, polys):
                cands.append((math.dist(a, v) + math.dist(v, b), v))
    return min(cands)[1] if cands else None


def set_arrivals(wps: list[dict], polys: list[Poly], box: tuple) -> list[dict]:
    """Walk under WALK_MAX_M when the straight line is clear; a blocked line gets `detourM` (one
    clear corner inside the boundary, walked before the waypoint) when one exists, else teleport."""
    out: list[dict] = []
    for i, w in enumerate(wps):
        w = dict(w, arrive="teleport")
        if i > 0:
            a, b = leave_point(out[-1]), (w["xM"], w["zM"])
            if math.dist(a, b) < WALK_MAX_M:
                block = blocking(a, b, polys)
                if not block:
                    w["arrive"] = "walk"
                else:
                    v = detour(a, b, block, polys, box)
                    if v is not None:
                        w["detourM"] = [list(v)]
                        w["arrive"] = "walk"
        out.append(w)
    return out


def build_route(place_id: str, public: Path = PUBLIC, only: list[str] | None = None) -> dict:
    bundle = json.loads((public / f"province/settlements/{place_id}.json").read_text())
    xs = sorted(p[0] for p in bundle["settlement"]["boundaryM"])
    zs = sorted(p[1] for p in bundle["settlement"]["boundaryM"])
    x0, x1, z0, z1 = xs[0], xs[-1], zs[0], zs[-1]
    box = (x0, x1, z0, z1)
    centre = ((x0 + x1) / 2, (z0 + z1) / 2)
    polys = colliders(bundle)
    ground = sorted((q[0], q[1], q[2]) for r in bundle["settlement"].get("walkRoutes", {}).get("routes", {}).values()
                    for q in r.get("points", []))
    ways = painted_ways(bundle)
    land = [p for p in land_points(ways) if clearance(*p, polys) >= CLEAR_M]
    wps: list[dict] = []

    def wp(wid: str, x: float, z: float, yaw: float, actions: list) -> None:
        wps.append({"id": wid, "xM": r2(x), "zM": r2(z), "yawRad": yaw, "arrive": "teleport", "actions": actions})

    def stand(tx: float, tz: float, sx: float, sz: float) -> Pt:
        return clear_stand(tx, tz, sx, sz, polys, box)

    # 4 overviews: the clear painted-way point nearest each boundary corner (land, never water)
    for name, corner in (("overview-nw", (x0, z0)), ("overview-ne", (x1, z0)),
                         ("overview-se", (x1, z1)), ("overview-sw", (x0, z1))):
        pool = land
        if name == "overview-nw":  # the first waypoint hosts the yaw check: its north and east legs must be clear
            pool = [p for p in land if yaw_check_clear(p, polys)] or land
        x, z = min(pool, key=lambda p: (math.dist(p, corner), p)) if pool else stand(*centre, corner[0], corner[1])
        b = bearing(x, z, *centre)
        wp(name, x, z, b, [{"type": "shot", "name": name, "yaw": b, "pitch": OVERVIEW_PITCH}])

    # doors: close-up of the base from 6 m out, then the door action from the threshold
    for d in sorted(bundle.get("doors", []), key=lambda d: d["id"]):
        claim = d.get("interiorClaim") or {}
        tx, tz = d["thresholdM"]
        ox, oz = compass(d.get("facingDeg", 0.0))
        tag = d["id"].rsplit(".", 1)[-1]
        gy = ground_y(tx, tz, ground, 0.0)
        sx, sz = stand(tx, tz, tx + ox * CLOSE_STAND_M, tz + oz * CLOSE_STAND_M)
        face = bearing(sx, sz, tx, tz)
        actions: list = [{"type": "shot", "name": f"door{tag}-base", "yaw": face,
                          "pitch": aim_pitch(sx, sz, tx, gy + 1.2, tz, gy)}]
        if claim.get("cellId"):
            cell = claim["cellId"]
            ipath = public / f"province/interiors/{cell}.json"
            cell_doc = json.loads(ipath.read_text()) if ipath.exists() else {}
            exit_door = cell_doc.get("exitDoor", {})
            exit_yaw = math.radians(exit_door.get("yawDeg", 0.0))
            # the floor centre: the mean of the cell's sockets (they stand on the floor), else of its placements
            floor = [s["positionM"] for s in cell_doc.get("sockets") or [] if s.get("positionM")] or \
                    [p["positionM"] for p in cell_doc.get("placements") or [] if p.get("positionM")]
            centre_local = [r2(sum(q[0] for q in floor) / len(floor)), 0.0, r2(sum(q[2] for q in floor) / len(floor))] if floor else None
            qx, qz = stand(tx, tz, tx + ox * DOOR_OUT_M, tz + oz * DOOR_OUT_M)
            out_face = bearing(qx, qz, tx, tz)
            actions.append({
                "type": "door", "doorId": d["id"], "cellId": cell, "thresholdM": [r2(tx), r2(tz)],
                "approach": [r2(tx + ox * DOOR_APPROACH_M), r2(tz + oz * DOOR_APPROACH_M)],
                "faceYaw": bearing(tx + ox * DOOR_APPROACH_M, tz + oz * DOOR_APPROACH_M, tx, tz),
                "exitDoorLocalM": exit_door.get("positionM"),
                "interiorStep": INTERIOR_STEP_M,
                "interiorCentreLocalM": centre_local,
                "interiorShots": [{"name": f"door{tag}-int{i}", "yaw": wrap(exit_yaw + math.radians(dd)), "pitch": INTERIOR_PITCH}
                                  for i, dd in enumerate((180, 60, -60))],
                "outShot": {"standM": [r2(qx), r2(qz)], "yaw": out_face, "pitch": aim_pitch(qx, qz, tx, gy + 1.2, tz, gy)},
            })
        wp(f"door{tag}", sx, sz, face, actions)

    # fires: clusters within 6 m, stood 4 m off on the centre side, clear of colliders, aimed at the flame
    fire_assets = burning_assets(bundle, public)
    # each fixture's flame point: its position plus the flame height from its fires-map row
    burning = [(p["id"], p["positionM"][0], p["positionM"][2], p["positionM"][1] + flame_rise_m(fire_assets.get(p["assetId"])))
               for p in bundle["placements"] if is_burning(p, fire_assets)]
    for i, g in enumerate(clusters(burning, FIRE_CLUSTER_M)):
        cx = sum(p[1] for p in g) / len(g)
        cz = sum(p[2] for p in g) / len(g)
        cy = sum(p[3] for p in g) / len(g)
        sx, sz, b, pitch = close_up(cx, cy, cz, FIRE_SIZE_M, centre, ground,
                                    min(p[3] for p in g) - FLAME_ABOVE_ORIGIN_M, polys, box)
        wp(f"fire{i}", sx, sz, b, [{"type": "fire", "name": f"fire{i}", "fixtureIds": [p[0] for p in g],
                                    "aimM": [r2(cx), r2(cy), r2(cz)], "yaw": b,
                                    "pitch": pitch, "n": FIRE_FRAMES, "dtS": FIRE_DT_S}])

    # signs: per cluster, the highest board, shot from SIGN_STAND_M off its reading face
    signs = sorted((p["id"], p["positionM"][0], p["positionM"][2], sign_board_y(p), p.get("yawDeg", 0.0))
                   for p in bundle["placements"] if SIGN_RE.search(p["assetId"]))
    for i, g in enumerate(clusters(signs, SIGN_CLUSTER_M)):
        top = max(g, key=lambda p: (p[3], p[0]))
        sx, sz, b, pitch = sign_shot(top[1], top[3], top[2], top[4], centre, ground, polys, box)
        wp(f"sign{i}", sx, sz, b, [{"type": "shot", "name": f"sign{i}", "subjects": [p[0] for p in g], "yaw": b,
                                    "pitch": pitch, "aimM": [r2(top[1]), r2(top[3]), r2(top[2])]}])

    # promises: one close-up per filled physical promise (`thing-<noun>` rows of
    # the compile's promiseFills), aimed at the first filler the bundle places,
    # so a promise built out of every other shot is still seen (audit10)
    where = {p["id"]: (p["positionM"][0], p["positionM"][2], target_y(p)) for p in bundle["placements"] if p.get("positionM")}
    where.update({s["id"]: (s["positionM"][0], s["positionM"][2], s["positionM"][1] + PROMISE_AIM_M)
                  for s in bundle["settlement"].get("sockets") or [] if s.get("positionM")})
    seen: set[str] = set()  # building pieces a promise shot already frames
    promised = []
    for pid, fillers in sorted((bundle["settlement"].get("promiseFills") or {}).items()):
        if not THING_ROW_RE.search(pid):
            continue
        hits = [(f, where[k]) for f in fillers for k in sorted(where) if k == f or k.endswith("." + f)]
        if not hits:
            continue
        f, (tx, tz, ty) = hits[0]
        seen.update(k for f2 in fillers for k in where if (k == f2 or k.endswith("." + f2)) and k.endswith(".building"))
        sx, sz, b, pitch = close_up(tx, ty, tz, PROMISE_SIZE_M, centre, ground, ty - PROMISE_AIM_M, polys, box)
        tag = pid.rsplit(".thing-", 1)[-1]
        promised.append(pid)
        wp(f"promise-{tag}", sx, sz, b, [{"type": "shot", "name": f"promise-{tag}", "promiseId": pid,
                                          "subjects": [f], "yaw": b, "pitch": pitch, "aimM": [r2(tx), r2(ty), r2(tz)]}])

    # features (audit10 H9): every parcel (a stable, a stair, each crossing) that no door-base or promise
    # shot already frames gets one close-up of its footprint-box centre, sized to its extent (a fire or a
    # sign close-up frames its fixture, not the structure it hangs on)
    doors_xz = [tuple(d["thresholdM"]) for d in bundle.get("doors", [])]
    features = []
    for key, parts in sorted(parcels(bundle).items()):
        if any(p["id"] in seen for p in parts) or \
                any(math.dist((p["positionM"][0], p["positionM"][2]), q) <= 3.0 for p in parts for q in doors_xz):
            continue
        tx, ty, tz, size = feature_target(parts)
        sx, sz, b, pitch = close_up(tx, ty, tz, size, centre, ground, ty - PROMISE_AIM_M, polys, box)
        features.append(key)
        wp(f"feature-{key}", sx, sz, b, [{"type": "shot", "name": f"feature-{key}", "parcel": key,
                                          "subjects": [p["id"] for p in parts], "yaw": b, "pitch": pitch,
                                          "aimM": [r2(tx), r2(ty), r2(tz)]}])

    # visiting order: overviews first, then nearest-neighbour from the last overview
    head, rest = wps[:4], wps[4:]
    ordered = list(head)
    while rest:
        last = ordered[-1]
        k = min(range(len(rest)), key=lambda i: (math.hypot(rest[i]["xM"] - last["xM"], rest[i]["zM"] - last["zM"]), rest[i]["id"]))
        ordered.append(rest.pop(k))
    if not ways:  # no painted way: loop through every stand (overviews, door bases, fixtures, signs)
        anchor = tuple((bundle.get("settlement") or {}).get("anchorM") or centre)[:2]
        ways = fallback_loop([(w["xM"], w["zM"]) for w in wps], anchor, polys)
    fw = free_walk(ways)
    if fw:
        fw["endShot"] = end_shot(fw, polys, box)
    if only:
        ordered = [w for w in ordered if w["id"] in set(only)]
    return {"schemaVersion": SCHEMA, "placeId": place_id, "bearing": "compass radians: 0 north (-z), pi/2 east (+x)",
            "pitch": "follow-camera radians: positive looks down",
            "boundaryM": [[x0, z0], [x1, z1]], "centreM": [r2(centre[0]), r2(centre[1])],
            "fixtures": sorted(p[0] for p in burning), "doors": sorted(d["id"] for d in bundle.get("doors", []) if (d.get("interiorClaim") or {}).get("cellId")),
            "promises": promised, "features": features, "only": sorted(only) if only else None,
            "freeWalk": fw, "waypoints": set_arrivals(ordered, polys, box)}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("placeId")
    ap.add_argument("--out")
    ap.add_argument("--public", default=str(PUBLIC))
    ap.add_argument("--only", help="comma-separated waypoint ids to keep (a smoke route), e.g. door5,fire2")
    a = ap.parse_args()
    route = build_route(a.placeId, Path(a.public), a.only.split(",") if a.only else None)
    text = json.dumps(route, indent=1) + "\n"
    if a.out:
        Path(a.out).parent.mkdir(parents=True, exist_ok=True)
        Path(a.out).write_text(text)
        w = route["waypoints"]
        print(f"walk_route: {len(w)} waypoints ({sum(1 for x in w if x.get('detourM'))} detours, "
              f"{sum(1 for x in w[1:] if x['arrive'] == 'teleport')} teleports after the first), "
              f"{len(route['doors'])} doors, {len(route['fixtures'])} fixtures -> {a.out}")
    else:
        print(text, end="")


if __name__ == "__main__":
    main()
