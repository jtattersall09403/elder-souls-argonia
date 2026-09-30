"""Boardwalk routing (16k walk 6, owner: the Riverwalk boardwalk took a
long L round the cove, turned by butting two straights at a right angle
(the rail of the piece you stood on barred the turn) and started on a steep
bump beside flat ground).

The planner, in order:

1. Ends on flat ground: round each asked end (``--from``/``--to``), every
   cell within ``search_m`` that is dry, stands between the water and
   END_MAX_OVER_WATER_M over it, and whose steepest slope within
   `walkway.FLAT_R_M` is at most FLAT_PICK_DEG; the flattest wins, ties to
   the one nearest the other end (the short line).
2. The short sensible line: the straight between the two ends when it is
   clear (no ground standing into the deck, no placed piece within
   CLEAR_M of the deck edge, water no deeper than the piece's piles);
   else the shortest clear L with ONE turn of 90 deg at a junction piece
   (a piece MADE to turn: `docks-v1` dockstr4way01 / dockcorsol01, KotM
   dockscorner / docks3way / docks4way; modular-runs § F), plus
   TURN_PENALTY_M. Never a right angle between two straights.
3. Pieces: a whole number of run modules per leg (the mined run pair's
   step), the first piece's outer end on the start cell; the junction
   is snapped by geometry face to face, every straight by its mined pair.

It returns the plan and the layout ops (place, snap, bind); `wb.py
boardwalk ... --write` swaps them into the layout for the run. The laid
run is then walked by `walkway` (walkwayRule), which is the judge.
"""
from __future__ import annotations

import math

import numpy as np

FLAT_PICK_DEG = 6.0          # an end cell's steepest slope within walkway.FLAT_R_M
END_MAX_OVER_WATER_M = 0.6   # ... and its ground at most this over the water (deck reach)
DECK_OVER_WATER_M = 0.35     # the dock deck over the water (landingRule band 0.15-0.35)
CLEAR_M = 1.0                # nothing placed this close to the deck edge
MAX_DEPTH_M = 5.5            # the piles' reach (vanilla docks: 6.2 m under the deck)
TURN_PENALTY_M = 6.0         # a turn must save more than this to be taken
CELL_M = 0.5


def _bearing(a, b) -> float:
    return math.degrees(math.atan2(b[0] - a[0], -(b[1] - a[1]))) % 360.0


def _vec(bearing):
    r = math.radians(bearing)
    return math.sin(r), -math.cos(r)


def flat_ends(g, around, toward, search_m, slope_fn, keep=12):
    """The flat dry cells within ``search_m`` of ``around``, nearest to
    ``toward`` first (the short line): [(x, z, slopeDeg)], at most ``keep``
    spread at least 1 m apart."""
    got = []
    n = int(search_m / CELL_M)
    for i in range(-n, n + 1):
        for j in range(-n, n + 1):
            x, z = around[0] + i * CELL_M, around[1] + j * CELL_M
            if math.hypot(x - around[0], z - around[1]) > search_m:
                continue
            h = float(g.height(x, z))
            w = g.water_level(x, z)
            ref = w if w is not None else h
            if w is not None and h < w + 0.02:
                continue                       # wet
            if h - ref > END_MAX_OVER_WATER_M:
                continue
            got.append((math.dist((x, z), toward), x, z))
    got.sort()
    out = []
    for _d, x, z in got:
        if any(math.dist((x, z), (q[0], q[1])) < 1.0 for q in out):
            continue
        s = slope_fn(g, x, z)
        if s <= FLAT_PICK_DEG:
            out.append((x, z, s))
            if len(out) >= keep:
                break
    return out


def leg_clear(g, a, b, width_m, deck_y, obstacles, ends_m=3.0):
    """None when a deck from ``a`` to ``b`` is clear, else why (text)."""
    L = math.dist(a, b)
    ux, uz = (b[0] - a[0]) / max(L, 1e-9), (b[1] - a[1]) / max(L, 1e-9)
    n = max(2, int(L / 0.5))
    for k in range(n + 1):
        t = L * k / n
        for off in (-width_m / 2 + 0.3, 0.0, width_m / 2 - 0.3):
            x, z = a[0] + ux * t - uz * off, a[1] + uz * t + ux * off
            h = float(g.height(x, z))
            w = g.water_level(x, z)
            if ends_m < t < L - ends_m and h > deck_y + 0.05:     # ground standing into the deck
                return f"ground {h - deck_y:+.2f} m at the deck at {x:.1f},{z:.1f}"
            if w is not None and w - h > MAX_DEPTH_M:
                return f"water {w - h:.1f} m deep at {x:.1f},{z:.1f}"
    if obstacles is not None:
        from shapely.geometry import LineString
        band = LineString([a, b]).buffer(width_m / 2 + CLEAR_M)
        for uid, poly in obstacles:
            if band.intersects(poly):
                return f"{uid} stands within {CLEAR_M} m of the deck"
    return None


def plan(g, start, goal, *, step_m, width_m, slope_fn, search_m=8.0, obstacles=None,
         junction_m=None, deck_y=None):
    """The route: {start, end, legs [{from, to, bearing, pieces}], turns
    [{at, fromBearing, toBearing}], lengthM, rejected [why]} or raises
    ValueError naming why no route is clear."""
    starts = flat_ends(g, start, goal, search_m, slope_fn)
    ends = flat_ends(g, goal, start, search_m, slope_fn)
    if not starts or not ends:
        raise ValueError(f"no flat dry cell within {search_m} m of the "
                         f"{'start' if not starts else 'end'} (<= {FLAT_PICK_DEG} deg)")
    pairs = sorted(((math.dist(s_[:2], e_[:2]), s_, e_) for s_ in starts for e_ in ends),
                   key=lambda r: r[0])

    def deck_for(S, E):
        if deck_y is not None:
            return deck_y
        # level with the higher end's ground, and never under the water band
        mid = ((S[0] + E[0]) / 2, (S[1] + E[1]) / 2)
        w = [v for v in (g.water_level(*q) for q in (S, E, mid)) if v is not None]
        return max([float(g.height(*S)), float(g.height(*E))]
                   + ([max(w) + DECK_OVER_WATER_M] if w else []))

    why = None
    for _d, s, e in pairs:
        S, E = (s[0], s[1]), (e[0], e[1])
        dy = deck_for(S, E)
        why = leg_clear(g, S, E, width_m, dy, obstacles)
        if why is None:
            break
    else:
        _d, s, e = pairs[0]
        S, E = (s[0], s[1]), (e[0], e[1])
        dy = deck_for(S, E)
        why = leg_clear(g, S, E, width_m, dy, obstacles)
    deck_y = dy
    rejected = []

    def legs_for(points):
        legs = []
        for a, b in zip(points, points[1:]):
            L = math.dist(a, b)
            legs.append({"from": [round(a[0], 2), round(a[1], 2)], "to": [round(b[0], 2), round(b[1], 2)],
                         "bearing": round(_bearing(a, b), 2), "pieces": max(1, math.ceil(L / step_m))})
        return legs

    if why is None:
        return {"start": [*S, s[2]], "end": [*E, e[2]], "deckY": deck_y,
                "legs": legs_for([S, E]), "turns": [], "lengthM": round(math.dist(S, E), 2),
                "rejected": rejected}
    rejected.append(f"straight: {why}")
    if junction_m is None:
        raise ValueError(f"the straight is not clear ({why}) and no junction piece was given")
    best = None
    b0 = _bearing(S, E)
    for turn in (90.0, -90.0):
        # the corner lies on the circle over S-E (Thales): every bearing of the first leg
        for db in range(-60, 61, 5):
            b1 = (b0 + db) % 360.0
            b2 = (b1 + turn) % 360.0
            u1, u2 = _vec(b1), _vec(b2)
            # solve S + u1*l1 + u2*l2 = E
            det = u1[0] * u2[1] - u1[1] * u2[0]
            dx, dz = E[0] - S[0], E[1] - S[1]
            l1 = (dx * u2[1] - dz * u2[0]) / det
            l2 = (u1[0] * dz - u1[1] * dx) / det
            if l1 < step_m or l2 < step_m:
                continue
            n1 = math.ceil((l1 - junction_m / 2) / step_m)
            C = (S[0] + u1[0] * (n1 * step_m + junction_m / 2), S[1] + u1[1] * (n1 * step_m + junction_m / 2))
            a2 = (C[0] + u2[0] * junction_m / 2, C[1] + u2[1] * junction_m / 2)
            end2 = (a2[0] + u2[0] * max(step_m, l2 - junction_m / 2),
                    a2[1] + u2[1] * max(step_m, l2 - junction_m / 2))
            w1 = leg_clear(g, S, C, width_m, deck_y, obstacles)
            w2 = leg_clear(g, a2, end2, width_m, deck_y, obstacles)
            if w1 or w2:
                continue
            total = n1 * step_m + junction_m + math.dist(a2, end2) + TURN_PENALTY_M
            if best is None or total < best[0]:
                best = (total, C, a2, end2, b1, b2)
    if best is None:
        raise ValueError(f"no clear straight ({why}) and no clear L with one junction "
                         f"(start {S[0]:.1f},{S[1]:.1f}, end {E[0]:.1f},{E[1]:.1f}, deck {deck_y:.2f})")
    _t, C, a2, end2, b1, b2 = best
    legs = legs_for([S, (C[0] - _vec(b1)[0] * junction_m / 2, C[1] - _vec(b1)[1] * junction_m / 2)])
    legs += legs_for([a2, end2])
    return {"start": [*S, s[2]], "end": [*end2, e[2]], "deckY": deck_y, "legs": legs,
            "turns": [{"at": [round(C[0], 2), round(C[1], 2)], "fromBearing": round(b1, 2),
                       "toBearing": round(b2, 2)}],
            "lengthM": round(_t - TURN_PENALTY_M, 2), "rejected": rejected}


def ops_for(route, run_id, piece, *, prefix, step_m, junction=None, pick=None):
    """Layout ops laying ``route``: every straight placed on its leg and
    snapped to the one before by the mined pair (``pick`` its variant), the
    junction snapped face to face by geometry, the legs bound in order."""
    ops, uids = [], []
    k = 0
    prev = None
    for li, leg in enumerate(route["legs"]):
        ux, uz = _vec(leg["bearing"])
        a = leg["from"]
        for i in range(leg["pieces"]):
            uid = f"{prefix}{k:02d}"
            c = [round(a[0] + ux * step_m * (i + 0.5), 2), round(a[1] + uz * step_m * (i + 0.5), 2)]
            op = {"op": "place", "uid": uid, "asset": piece, "at": c, "yaw": round(leg["bearing"], 1),
                  "walkable": True}
            if prev is None:
                op["settle"] = True
            ops.append(op)
            if prev is not None:
                if i == 0 and li > 0:
                    turn = route["turns"][li - 1]
                    face = "east" if (turn["toBearing"] - turn["fromBearing"]) % 360 == 90 else "west"
                    ops.append({"op": "snap", "child": uid, "child_face": "south", "parent": prev,
                                "parent_face": face, "by": "geometry", "settle": True})
                else:
                    snap = {"op": "snap", "child": uid, "child_face": "south", "parent": prev,
                            "parent_face": "north", "by": "evidence", "settle": True}
                    if pick is not None:
                        snap["pick"] = pick
                    ops.append(snap)
            uids.append(uid)
            prev = uid
            k += 1
        if li < len(route["turns"]):
            t = route["turns"][li]
            uid = f"{prefix}j{li}"
            ops.append({"op": "place", "uid": uid, "asset": junction, "at": t["at"],
                        "yaw": round(t["fromBearing"], 1), "walkable": True})
            ops.append({"op": "snap", "child": uid, "child_face": "south", "parent": prev,
                        "parent_face": "north", "by": "geometry", "settle": True})
            uids.append(uid)
            prev = uid
    binds = [{"op": "bind", "uid": u, "kind": "run", "id": run_id, "index": n} for n, u in enumerate(uids)]
    return ops, binds


def obstacles_of(cat, scene, skip_prefix: str):
    """(uid, footprint polygon) of every placed piece but the run's own and paths."""
    from shapely.geometry import Polygon
    from . import measure
    out = []
    for p in scene.pieces:
        if p.uid.startswith(skip_prefix) or p.y is None or getattr(p, "walkable", False):
            continue
        try:
            out.append((p.uid, Polygon(measure.footprint_province(cat, p))))
        except Exception:                         # noqa: BLE001 - a piece with no footprint blocks nothing
            continue
    return out


def replace_in_layout(doc: dict, run_id: str, prefix: str, ops: list, binds: list) -> dict:
    """The layout with every op of the run's old members (bound to ``run_id``
    or uid starting ``prefix``) removed and the new ops put where the first
    old one stood (binds after the last place/snap of the file's first bind)."""
    old = {o.get("uid") for o in doc["ops"] if o.get("op") == "bind" and o.get("id") == run_id}
    old |= {o.get("uid") for o in doc["ops"] if str(o.get("uid", "")).startswith(prefix)}

    def mine(o):
        return (o.get("uid") in old or o.get("child") in old) and o.get("op") in (
            "place", "snap", "move", "bind", "settle", "edit")
    first = next((i for i, o in enumerate(doc["ops"]) if mine(o)), len(doc["ops"]))
    kept = [o for o in doc["ops"] if not mine(o)]
    at = sum(1 for o in doc["ops"][:first] if not mine(o))
    kept[at:at] = ops
    fb = next((i for i, o in enumerate(kept) if o.get("op") == "bind"), len(kept))
    kept[fb:fb] = binds
    return dict(doc, ops=kept)


def step_of(piece: str, pick: int = 0) -> float:
    """The run step of ``piece`` from its mined run pair with itself, north
    face to south face, as `snap --by evidence --pick` numbers them (0 = the
    most evidence)."""
    from . import snap
    steps = [s for s in snap.evidence_steps(piece, piece)
             if s["parentFace"] == "+y" and s["childFace"] == "-y"]
    if not steps:
        raise ValueError(f"{piece}: no mined run pair with itself (modular-runs § A)")
    s = steps[min(pick, len(steps) - 1)]
    return float(np.hypot(s["offsetM"][0], s["offsetM"][1]))
