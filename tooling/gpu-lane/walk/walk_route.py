#!/usr/bin/env python3
"""The agent walk's route for one built place (tooling/gpu-lane/walk/README.md).

    python3 tooling/gpu-lane/walk/walk_route.py <placeId> [--out route.json] [--public DIR]

Reads only the PUBLISHED data the studio loads (public/province/settlements/
<placeId>.json, the kits' parts indexes, public/province/interiors/<cell>.json)
and writes route JSON (schemaVersion 1). Deterministic: inputs are sorted, no
randomness, no clock. Bearings are COMPASS radians (0 = north = -z, pi/2 =
east = +x; doors.ts compassDirection); the runner converts them to the follow
camera's yaw.
"""
from __future__ import annotations

import argparse
import json
import math
import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
PUBLIC = REPO / "apps/world-studio/public"
SCHEMA = 1
DOOR_APPROACH_M = 1.0  # outward from the threshold; DOOR_REACH_M is 1.5 (doors.ts)
FIRE_CLUSTER_M = 6.0
FIRE_STAND_M = 4.0
CLOSE_STAND_M = 6.0
SIGN_CLUSTER_M = 3.0
WALK_MAX_M = 40.0
FIRE_FRAMES, FIRE_DT_S = 6, 0.25
FREE_WALK_S = 20.0
# A placement burns when its kit's fires map gives it a light or flame cards,
# or its asset is a burning piece by name (campfire01burning has no fires-map row).
BURNING_RE = re.compile(r"burning|brazier|candle|lantern|torch|fxfire", re.I)
SIGN_RE = re.compile(r"sign", re.I)


def bearing(fx: float, fz: float, tx: float, tz: float) -> float:
    """Compass radians from (fx, fz) towards (tx, tz)."""
    return round(math.atan2(tx - fx, -(tz - fz)), 4)


def compass(deg: float) -> tuple[float, float]:
    r = math.radians(deg)
    return math.sin(r), -math.cos(r)


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


def clusters(points: list[tuple[str, float, float]], radius: float) -> list[list[tuple[str, float, float]]]:
    """Single-linkage clusters, stable: input sorted by id, clusters by first id."""
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


def stand_off(cx: float, cz: float, centre: tuple[float, float], dist: float) -> tuple[float, float]:
    """A point `dist` from (cx, cz) on the side facing the place centre."""
    dx, dz = centre[0] - cx, centre[1] - cz
    n = math.hypot(dx, dz) or 1.0
    if n < 1e-6:
        dx, dz, n = 0.0, 1.0, 1.0
    return cx + dx / n * dist, cz + dz / n * dist


def free_walk(bundle: dict) -> dict | None:
    """A turning walk along the longest published walk route, as compass legs."""
    routes = bundle.get("settlement", {}).get("walkRoutes", {}).get("routes", {})
    if not routes:
        return None
    key = max(sorted(routes), key=lambda k: len(routes[k].get("points", [])))
    pts = [(p[0], p[2]) for p in routes[key]["points"]]
    if len(pts) < 2:
        return None
    # at most 4 legs: split the polyline at equal point counts
    n = min(4, len(pts) - 1)
    marks = [round(i * (len(pts) - 1) / n) for i in range(n + 1)]
    legs = [(pts[marks[i]], pts[marks[i + 1]]) for i in range(n)]
    lens = [math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in legs]
    total = sum(lens) or 1.0
    return {
        "routeId": key, "seconds": FREE_WALK_S, "startM": [r2(pts[0][0]), r2(pts[0][1])],
        "legs": [{"bearing": bearing(a[0], a[1], b[0], b[1]), "seconds": r2(FREE_WALK_S * l / total)}
                 for (a, b), l in zip(legs, lens)],
    }


def build_route(place_id: str, public: Path = PUBLIC) -> dict:
    bundle = json.loads((public / f"province/settlements/{place_id}.json").read_text())
    xs = sorted(p[0] for p in bundle["settlement"]["boundaryM"])
    zs = sorted(p[1] for p in bundle["settlement"]["boundaryM"])
    x0, x1, z0, z1 = xs[0], xs[-1], zs[0], zs[-1]
    centre = ((x0 + x1) / 2, (z0 + z1) / 2)
    wps: list[dict] = []

    def wp(wid: str, x: float, z: float, yaw: float, actions: list) -> None:
        wps.append({"id": wid, "xM": r2(x), "zM": r2(z), "yawRad": yaw, "arrive": "teleport", "actions": actions})

    # 4 overviews from the boundary corners, 5 m in, looking at the centre
    for name, (x, z) in (("overview-nw", (x0 + 5, z0 + 5)), ("overview-ne", (x1 - 5, z0 + 5)),
                         ("overview-se", (x1 - 5, z1 - 5)), ("overview-sw", (x0 + 5, z1 - 5))):
        b = bearing(x, z, *centre)
        wp(name, x, z, b, [{"type": "shot", "name": name, "yaw": b, "pitch": -0.12}])

    # doors: close-up of the base from 6 m out, then the door action from the threshold
    for d in sorted(bundle.get("doors", []), key=lambda d: d["id"]):
        claim = d.get("interiorClaim") or {}
        tx, tz = d["thresholdM"]
        ox, oz = compass(d.get("facingDeg", 0.0))
        face = round(math.atan2(-ox, oz), 4)  # compass bearing looking back in at the door
        tag = d["id"].rsplit(".", 1)[-1]
        sx, sz = tx + ox * CLOSE_STAND_M, tz + oz * CLOSE_STAND_M
        actions: list = [{"type": "shot", "name": f"door{tag}-base", "yaw": face, "pitch": -0.2}]
        if claim.get("cellId"):
            cell = claim["cellId"]
            ipath = public / f"province/interiors/{cell}.json"
            exit_local = None
            if ipath.exists():
                exit_local = json.loads(ipath.read_text()).get("exitDoor", {}).get("positionM")
            actions.append({
                "type": "door", "doorId": d["id"], "cellId": cell,
                "approach": [r2(tx + ox * DOOR_APPROACH_M), r2(tz + oz * DOOR_APPROACH_M)], "faceYaw": face,
                "exitDoorLocalM": exit_local,
                "interiorShots": [{"name": f"door{tag}-int{i}", "yaw": round(i * 2 * math.pi / 3, 4), "pitch": -0.15}
                                  for i in range(3)],
            })
        wp(f"door{tag}", sx, sz, face, actions)

    # fires: clusters within 6 m, stood 4 m off on the centre side
    fire_assets = burning_assets(bundle, public)
    burning = [(p["id"], p["positionM"][0], p["positionM"][2]) for p in bundle["placements"] if is_burning(p, fire_assets)]
    for i, g in enumerate(clusters(burning, FIRE_CLUSTER_M)):
        cx = sum(p[1] for p in g) / len(g)
        cz = sum(p[2] for p in g) / len(g)
        sx, sz = stand_off(cx, cz, centre, FIRE_STAND_M)
        b = bearing(sx, sz, cx, cz)
        wp(f"fire{i}", sx, sz, b, [{"type": "fire", "name": f"fire{i}", "fixtureIds": [p[0] for p in g],
                                    "centreM": [r2(cx), r2(cz)], "yaw": b, "pitch": -0.3, "n": FIRE_FRAMES, "dtS": FIRE_DT_S}])

    # signs: close-ups
    signs = sorted((p["id"], p["positionM"][0], p["positionM"][2]) for p in bundle["placements"] if SIGN_RE.search(p["assetId"]))
    for i, g in enumerate(clusters(signs, SIGN_CLUSTER_M)):
        x = sum(p[1] for p in g) / len(g)
        z = sum(p[2] for p in g) / len(g)
        sx, sz = stand_off(x, z, centre, FIRE_STAND_M)
        b = bearing(sx, sz, x, z)
        wp(f"sign{i}", sx, sz, b, [{"type": "shot", "name": f"sign{i}", "subjects": [p[0] for p in g], "yaw": b, "pitch": -0.1}])

    # visiting order: overviews first, then nearest-neighbour from the last overview
    head, rest = wps[:4], wps[4:]
    ordered = list(head)
    while rest:
        last = ordered[-1]
        k = min(range(len(rest)), key=lambda i: (math.hypot(rest[i]["xM"] - last["xM"], rest[i]["zM"] - last["zM"]), rest[i]["id"]))
        ordered.append(rest.pop(k))
    for a, b in zip(ordered, ordered[1:]):
        if math.hypot(b["xM"] - a["xM"], b["zM"] - a["zM"]) < WALK_MAX_M:
            b["arrive"] = "walk"
    return {"schemaVersion": SCHEMA, "placeId": place_id, "bearing": "compass radians: 0 north (-z), pi/2 east (+x)",
            "boundaryM": [[x0, z0], [x1, z1]], "centreM": [r2(centre[0]), r2(centre[1])],
            "fixtures": sorted(p[0] for p in burning), "doors": sorted(d["id"] for d in bundle.get("doors", []) if (d.get("interiorClaim") or {}).get("cellId")),
            "freeWalk": free_walk(bundle), "waypoints": ordered}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("placeId")
    ap.add_argument("--out")
    ap.add_argument("--public", default=str(PUBLIC))
    a = ap.parse_args()
    route = build_route(a.placeId, Path(a.public))
    text = json.dumps(route, indent=1) + "\n"
    if a.out:
        Path(a.out).parent.mkdir(parents=True, exist_ok=True)
        Path(a.out).write_text(text)
        print(f"walk_route: {len(route['waypoints'])} waypoints, {len(route['doors'])} doors, {len(route['fixtures'])} fixtures -> {a.out}")
    else:
        print(text, end="")


if __name__ == "__main__":
    main()
