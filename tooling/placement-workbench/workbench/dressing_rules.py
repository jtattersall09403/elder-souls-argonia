"""Dressing `check` rules read on the actual geometry (16k walk 8):

* ``seatFacingRule``: a seat with a back faces as someone would sit on it.
  Its forward is measured from the kit mesh: the back is the centroid of the
  seat's top 30 % of height, and the sitter faces from the back through the
  footprint centre (the woven chair's back stands at kit -y, so it faces
  +y). A seat within ``TABLE_M`` of a table faces the table; else a seat
  within ``WALL_M`` of a building's footprint faces away from that wall;
  each within ``SEAT_TOL_DEG``. A free-standing seat faces within
  ``FREE_TOL_DEG`` of the nearest path point when one lies within
  ``WAY_M``. A backless bench has no forward and is listed, never judged.
* ``socketCoherenceRule``: every ``idle`` socket of the layout stands at the
  thing its activity names (``ACTIVITY_NEAR``), or is hosted on it: sit by
  a seat, cook by a fire or hearth, fish/pole by water or a deck edge,
  sleep indoors (an interior cell, a building's footprint or a roofed
  shelter), work-at/tend by a workplace, a crop or pen, or a shrine, or on
  an open building's floor.

Tooling text for the agent, not player-facing.
"""
from __future__ import annotations

import math
from functools import lru_cache

import numpy as np

SEAT_TOKENS = ("chair", "bench", "stool", "seat")
TABLE_TOKENS = ("table",)
TABLE_M = 1.5           # a seat this near a table sits at it
WALL_M = 2.0            # a seat this near a building's footprint stands against its wall
WAY_M = 15.0            # a free seat looks toward a path this near
SEAT_TOL_DEG = 45.0
FREE_TOL_DEG = 90.0
BACK_MIN_M = 0.08       # a top centroid this far off centre is a back
SHELL_KINDS = ("parcel",)

FIRE_TOKENS = ("fire", "cookingstand", "spit", "hearth", "cookpot", "pot", "oven", "brazier")
WATER_TOKENS = ("dock", "jetty", "pier", "boat", "canoe", "raft", "boardwalk", "fishtrap", "fishing")
WORK_TOKENS = ("table", "counter", "stall", "chest", "barrel", "crate", "anvil", "forge", "grindstone",
               "workbench", "tanning", "rack", "loom", "basket", "sack", "woodchop", "chopping",
               "firewood", "cart", "trough", "shrine", "altar", "statue", "garden", "crop", "plant",
               "pen", "fence", "hay", "bucket", "well", "pot", "cookingstand", "fire", "tree")
# activity -> (asset tokens of the thing it is done at, metres)
ACTIVITY_NEAR = {
    "sit": (SEAT_TOKENS, 1.0),
    "cook": (FIRE_TOKENS, 2.0),
    "fish": (WATER_TOKENS, 3.0),
    "pole": (WATER_TOKENS, 3.0),
    "work-at": (WORK_TOKENS, 2.0),
    "tend": (WORK_TOKENS, 2.0),
    "stand": (None, None),           # stands anywhere walkable (walkRule reaches it)
}


def _has(asset: str, tokens) -> bool:
    stem = asset.rsplit("/", 1)[-1].lower()
    return any(t in stem for t in tokens)


def _bearing(dx: float, dn: float) -> float:
    """Bearing clockwise from north of a wb (east, north) vector."""
    return math.degrees(math.atan2(dx, dn)) % 360.0


def _off(a: float, b: float) -> float:
    return abs((a - b + 180.0) % 360.0 - 180.0)


# bounded: the key holds the Catalogue (and its meshes) alive (memory discipline)
@lru_cache(maxsize=256)
def _kit_forward(cat, asset: str) -> float | None:
    """The seat's front as a kit bearing (0 = kit +y), measured from its
    mesh: back = top-30 %-of-height centroid; front = from the back through
    the footprint centre. None for a backless seat."""
    v = np.asarray(cat.mesh(asset).vertices)
    z = v[:, 2]
    top = v[z >= z.min() + 0.7 * (z.max() - z.min())]
    centre = (v[:, :2].min(0) + v[:, :2].max(0)) / 2.0
    d = centre - top[:, :2].mean(0)
    if float(np.hypot(*d)) < BACK_MIN_M:
        return None
    return _bearing(float(d[0]), float(d[1]))


def seat_facing_deg(cat, p) -> float | None:
    """A placed seat's front bearing (clockwise from north), or None."""
    k = _kit_forward(cat, p.asset)
    if k is None:
        return None
    return ((-k if p.mirror else k) + p.yaw) % 360.0


def _footprints(cat, scene):
    """{uid: shapely polygon} of every building shell (a parcel-bound piece)."""
    from shapely.geometry import MultiPoint
    out = {}
    for p in scene.pieces:
        if (p.role or {}).get("kind") in SHELL_KINDS and p.y is not None:
            pts = p.world_points(np.asarray(cat.mesh(p.asset).vertices))[:, :2]
            out[p.uid] = MultiPoint([tuple(q) for q in pts[:: max(1, len(pts) // 400)]]).convex_hull
    return out


def _path_points(scene) -> list:
    pts = []
    for path in scene.paths:
        pp = path["pointsM"]
        for (ax, az), (bx, bz) in zip(pp, pp[1:]):
            n = max(1, int(math.hypot(bx - ax, bz - az) // 1.0))
            pts += [(ax + (bx - ax) * i / n, -(az + (bz - az) * i / n)) for i in range(n + 1)]
    return pts


def seat_facing(cat, scene) -> dict:
    """seatFacingRule over every seat piece of the scene."""
    from shapely.geometry import Point
    from shapely.ops import nearest_points
    seats = [p for p in scene.pieces if p.y is not None and _has(p.asset, SEAT_TOKENS)]
    tables = [p for p in scene.pieces if p.y is not None and _has(p.asset, TABLE_TOKENS)]
    feet = _footprints(cat, scene) if seats else {}
    ways = _path_points(scene) if seats else []
    rows, fails = {}, []
    for p in seats:
        face = seat_facing_deg(cat, p)
        here = (p.x, -p.z)
        if face is None:
            rows[p.uid] = {"ok": True, "facingDeg": None, "why": "backless: no front"}
            continue
        want, tol, why = None, SEAT_TOL_DEG, None
        t = min(tables, key=lambda q: math.hypot(q.x - p.x, q.z - p.z), default=None)
        if t is not None and math.hypot(t.x - p.x, t.z - p.z) <= TABLE_M:
            want, why = _bearing(t.x - p.x, -(t.z - p.z)), f"at table {t.uid}"
        else:
            pt = Point(here)
            near = min(((poly.distance(pt), u, poly) for u, poly in feet.items()),
                       default=None, key=lambda r: r[0])
            if near is not None and near[0] <= WALL_M:
                if near[0] < 1e-6:
                    want, why = None, f"inside {near[1]}'s footprint"
                else:
                    q = nearest_points(near[2].exterior, pt)[0]
                    want, why = _bearing(here[0] - q.x, here[1] - q.y), f"against {near[1]} ({near[0]:.1f} m)"
            if want is None and why is None and ways:
                w = min(ways, key=lambda q: math.hypot(q[0] - here[0], q[1] - here[1]))
                if math.hypot(w[0] - here[0], w[1] - here[1]) <= WAY_M:
                    want, tol, why = _bearing(w[0] - here[0], w[1] - here[1]), FREE_TOL_DEG, "toward the nearest way"
        row = {"facingDeg": round(face, 1), "wantDeg": None if want is None else round(want, 1),
               "why": why, "ok": True}
        if want is not None:
            row["offDeg"] = round(_off(face, want), 1)
            row["ok"] = row["offDeg"] <= tol
            if not row["ok"]:
                fails.append(f"{p.uid}: seat faces {face:.0f} deg, {why} it should face "
                             f"{want:.0f} (+-{tol:.0f}; off {row['offDeg']})")
        rows[p.uid] = row
    return {"ok": not fails, "failures": fails, "rows": rows}


def _socket_xy(scene, s: dict):
    """A layout socket's wb (east, north), or (None, reason)."""
    if s.get("at"):
        return (s["at"][0], -s["at"][1]), None
    host = s.get("host")
    for p in scene.pieces:
        if p.uid == host or ((p.role or {}).get("kind") in SHELL_KINDS and (p.role or {}).get("id") == host):
            return (p.x, -p.z), p
    return None, None


def socket_coherence(cat, scene) -> dict:
    """socketCoherenceRule over the layout's idle sockets."""
    from shapely.geometry import Point
    from . import rules
    socks = [s for s in rules._layout_sockets(scene) if s.get("kind") == "idle"]
    if not socks:
        return {"ok": True, "failures": [], "rows": {}}
    feet = _footprints(cat, scene)
    g = rules._ground(cat, scene)
    placed = [p for p in scene.pieces if p.y is not None]
    rows, fails = {}, []
    for s in socks:
        act, sid = s.get("activity"), s["id"]
        if s.get("interiorCell"):
            rows[sid] = {"ok": True, "why": f"indoors in {s['interiorCell']} at {s.get('host')}"}
            continue
        xy, host = _socket_xy(scene, s)
        if xy is None:
            rows[sid] = {"ok": False, "why": f"host {s.get('host')} not in the scene"}
            fails.append(f"{sid}: idle {act}: host {s.get('host')} is not in the scene")
            continue
        pt = Point(xy)
        ok, why = True, "anywhere walkable"
        if act == "sleep":
            inside = [u for u, poly in feet.items() if poly.buffer(0.2).contains(pt)]
            ok = bool(inside) or (host is not None and (host.role or {}).get("kind") in SHELL_KINDS)
            why = f"under {inside[0]}'s roof" if inside else "not under a roof or in a cell"
        elif act in ACTIVITY_NEAR and ACTIVITY_NEAR[act][0]:
            tokens, reach = ACTIVITY_NEAR[act]
            if host is not None and (_has(host.asset, tokens) or (host.role or {}).get("kind") in SHELL_KINDS
                                     and act in ("work-at", "tend", "pole", "fish")):
                why = f"hosted on {host.uid}"
            elif act in ("work-at", "tend") and any(poly.contains(pt) for poly in feet.values()):
                why = "indoors (an open building's floor)"
            else:
                near = min(((math.hypot(q.x - xy[0], -q.z - xy[1]), q.uid) for q in placed
                            if _has(q.asset, tokens)), default=(None, None))
                from .seat_rules import _over_water
                wet = act in ("fish", "pole") and any(
                    _over_water(g, xy[0] + dx, -(xy[1] + dz)) is not None
                    for dx in (-reach, 0, reach) for dz in (-reach, 0, reach))
                ok = wet or (near[0] is not None and near[0] <= reach)
                why = ("by water" if wet else
                       f"nearest {act} prop {near[1]} {near[0]:.1f} m (<= {reach})" if near[0] is not None
                       else f"no {act} prop in the scene")
        rows[sid] = {"ok": ok, "activity": act, "why": why}
        if not ok:
            fails.append(f"{sid}: idle {act} at ({xy[0]:.1f}, {-xy[1]:.1f}): {why}")
    return {"ok": not fails, "failures": fails, "rows": rows}


# serviceSign: a building that sells, lodges or stables carries its board by
# the door where its culture pool has a published sign family (Skyrim hangs
# the board on a bracket post or a wall bracket beside the door, never over
# the opening). Pool = the place id's region token; a pool with no family
# in a published kit is listed (a sourcing row), never failed.
SIGN_SERVICES = ("lodging", "trader", "stable", "smith")
SIGN_POOLS = {"imperial-fringe": ("signwr",),
              "hist-heartland": ("sign",), "dunmer-north": ("sign",)}   # KotM blackwood/sign (R99)
SIGN_DOOR_M = 4.0


def _blueprint(scene) -> dict:
    import json
    from . import paths
    f = paths.BLUEPRINTS / f"{scene.placeId}.json"   # honours WB_BLUEPRINTS, like rules.py
    return json.loads(f.read_text())["blueprint"] if f.exists() else {}


def service_sign(cat, scene) -> dict:
    """serviceSignRule over the blueprint's parcels with a sign service."""
    from shapely.geometry import Point
    bp = _blueprint(scene)
    region = (scene.placeId or "").split(".")[1] if (scene.placeId or "").count(".") >= 2 else ""
    fams = SIGN_POOLS.get(region)
    want = [p for p in bp.get("parcels") or [] if set(p.get("services") or []) & set(SIGN_SERVICES)]
    if not want:
        return {"ok": True, "failures": [], "rows": {}}
    feet = _footprints(cat, scene)
    shell = {(p.role or {}).get("id"): p.uid for p in scene.pieces if (p.role or {}).get("kind") in SHELL_KINDS}
    signs = [p for p in scene.pieces if p.y is not None and _has(p.asset, ("sign",))
             and not _has(p.asset, ("roadsign",))]
    rows, fails = {}, []
    for par in want:
        pid = par["id"]
        if not fams:
            rows[pid] = {"ok": True, "why": f"pool {region!r} has no published sign family (sourcing row)"}
            continue
        poly = feet.get(shell.get(pid))
        if poly is None:
            rows[pid] = {"ok": False, "why": "no shell in the scene"}
            fails.append(f"{pid}: sells {par['services']} but has no shell in the scene")
            continue
        near = [(poly.distance(Point(s.x, -s.z)), s.uid) for s in signs if _has(s.asset, fams)]
        best = min(near, default=None)
        ok = best is not None and best[0] <= SIGN_DOOR_M
        rows[pid] = {"ok": ok, "sign": best and best[1], "distM": best and round(best[0], 2)}
        if not ok:
            fails.append(f"{shell.get(pid)}: {pid} ({', '.join(par['services'])}) carries no "
                         f"{'/'.join(fams)} sign within {SIGN_DOOR_M} m of its walls")
    return {"ok": not fails, "failures": fails, "rows": rows}
