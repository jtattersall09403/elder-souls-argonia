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
OVERVIEW_PITCH = 0.08
INTERIOR_PITCH = 0.12
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


def burning_assets(bundle: dict, public: Path) -> set[str]:
    out: set[str] = set()
    for kit_id in sorted(bundle.get("kits", {})):
        idx = public / (bundle["kits"][kit_id]["glb"][:-4] + "/parts/index.json")
        if not idx.exists():
            continue
        for aid, row in (json.loads(idx.read_text()).get("fires") or {}).items():
            if any(k in row for k in ("light", "flames", "flameCardMaterials")):
                out.add(aid)
    return out


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


def clear_stand(tx: float, tz: float, sx: float, sz: float, polys: list[Poly], box: tuple) -> Pt:
    """Push (sx, sz) outward along target->stand until it clears every footprint by CLEAR_M; when that
    bearing cannot clear within PUSH_MAX_M, try the next bearing in 30 deg steps, alternating sides."""
    dist = math.hypot(sx - tx, sz - tz) or 1.0
    b0 = math.atan2(sx - tx, sz - tz)
    for k in (0, 1, -1, 2, -2, 3, -3, 4, -4, 5, -5, 6):
        b = b0 + math.radians(30 * k)
        d = dist
        while d <= dist + PUSH_MAX_M:
            x, z = tx + math.sin(b) * d, tz + math.cos(b) * d
            if in_box(x, z, box) and clearance(x, z, polys) >= CLEAR_M:
                return x, z
            d += PUSH_STEP_M
    return sx, sz


def ground_y(x: float, z: float, ground: list[tuple], default: float) -> float:
    """Ground height at (x, z): the nearest published walk-route sample within 10 m."""
    best = min(ground, key=lambda g: (math.hypot(g[0] - x, g[2] - z), g), default=None)
    if best is None or math.hypot(best[0] - x, best[2] - z) > 10.0:
        return default
    return best[1]


def aim_pitch(sx: float, sz: float, tx: float, ty: float, tz: float, gy: float) -> float:
    """Follow-camera pitch (positive = down) that puts (tx, ty, tz) on the view ray through the look
    target LOOK_ABOVE_FEET_M over the feet standing at (sx, gy, sz)."""
    return round(math.atan2(gy + LOOK_ABOVE_FEET_M - ty, max(0.5, math.hypot(tx - sx, tz - sz))), 4)


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
        x, z = min(land, key=lambda p: (math.dist(p, corner), p)) if land else stand(*centre, corner[0], corner[1])
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
            exit_door = json.loads(ipath.read_text()).get("exitDoor", {}) if ipath.exists() else {}
            exit_yaw = math.radians(exit_door.get("yawDeg", 0.0))
            qx, qz = stand(tx, tz, tx + ox * DOOR_OUT_M, tz + oz * DOOR_OUT_M)
            out_face = bearing(qx, qz, tx, tz)
            actions.append({
                "type": "door", "doorId": d["id"], "cellId": cell, "thresholdM": [r2(tx), r2(tz)],
                "approach": [r2(tx + ox * DOOR_APPROACH_M), r2(tz + oz * DOOR_APPROACH_M)],
                "faceYaw": bearing(tx + ox * DOOR_APPROACH_M, tz + oz * DOOR_APPROACH_M, tx, tz),
                "exitDoorLocalM": exit_door.get("positionM"),
                "interiorStep": INTERIOR_STEP_M,
                "interiorShots": [{"name": f"door{tag}-int{i}", "yaw": wrap(exit_yaw + math.radians(dd)), "pitch": INTERIOR_PITCH}
                                  for i, dd in enumerate((180, 135, -135))],
                "outShot": {"standM": [r2(qx), r2(qz)], "yaw": out_face, "pitch": aim_pitch(qx, qz, tx, gy + 1.2, tz, gy)},
            })
        wp(f"door{tag}", sx, sz, face, actions)

    # fires: clusters within 6 m, stood 4 m off on the centre side, clear of colliders, aimed at the flame
    fire_assets = burning_assets(bundle, public)
    burning = [(p["id"], p["positionM"][0], p["positionM"][2], p["positionM"][1])
               for p in bundle["placements"] if is_burning(p, fire_assets)]
    for i, g in enumerate(clusters(burning, FIRE_CLUSTER_M)):
        cx = sum(p[1] for p in g) / len(g)
        cz = sum(p[2] for p in g) / len(g)
        cy = sum(p[3] for p in g) / len(g)
        sx, sz = stand(cx, cz, *stand_off(cx, cz, centre, FIRE_STAND_M))
        b = bearing(sx, sz, cx, cz)
        gy = ground_y(sx, sz, ground, min(p[3] for p in g))
        wp(f"fire{i}", sx, sz, b, [{"type": "fire", "name": f"fire{i}", "fixtureIds": [p[0] for p in g],
                                    "centreM": [r2(cx), r2(cy), r2(cz)], "yaw": b,
                                    "pitch": aim_pitch(sx, sz, cx, cy + 0.3, cz, gy), "n": FIRE_FRAMES, "dtS": FIRE_DT_S}])

    # signs: close-ups, aimed at the board 1.5 m over the post foot
    signs = sorted((p["id"], p["positionM"][0], p["positionM"][2], p["positionM"][1])
                   for p in bundle["placements"] if SIGN_RE.search(p["assetId"]))
    for i, g in enumerate(clusters(signs, SIGN_CLUSTER_M)):
        x = sum(p[1] for p in g) / len(g)
        z = sum(p[2] for p in g) / len(g)
        y = sum(p[3] for p in g) / len(g)
        sx, sz = stand(x, z, *stand_off(x, z, centre, FIRE_STAND_M))
        b = bearing(sx, sz, x, z)
        gy = ground_y(sx, sz, ground, y)
        wp(f"sign{i}", sx, sz, b, [{"type": "shot", "name": f"sign{i}", "subjects": [p[0] for p in g], "yaw": b,
                                    "pitch": aim_pitch(sx, sz, x, y + 1.5, z, gy)}])

    # visiting order: overviews first, then nearest-neighbour from the last overview
    head, rest = wps[:4], wps[4:]
    ordered = list(head)
    while rest:
        last = ordered[-1]
        k = min(range(len(rest)), key=lambda i: (math.hypot(rest[i]["xM"] - last["xM"], rest[i]["zM"] - last["zM"]), rest[i]["id"]))
        ordered.append(rest.pop(k))
    if only:
        ordered = [w for w in ordered if w["id"] in set(only)]
    return {"schemaVersion": SCHEMA, "placeId": place_id, "bearing": "compass radians: 0 north (-z), pi/2 east (+x)",
            "pitch": "follow-camera radians: positive looks down",
            "boundaryM": [[x0, z0], [x1, z1]], "centreM": [r2(centre[0]), r2(centre[1])],
            "fixtures": sorted(p[0] for p in burning), "doors": sorted(d["id"] for d in bundle.get("doors", []) if (d.get("interiorClaim") or {}).get("cellId")),
            "only": sorted(only) if only else None,
            "freeWalk": free_walk(ways), "waypoints": set_arrivals(ordered, polys, box)}


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
