"""`wb.py render-interior <cell> [--night | --day] [--out PNG]`: one contact
sheet per interior cell for a reader to judge the lighting (readable, warm,
lit by its sources, not flat) before any walk.

Input is the PUBLISHED interior bundle (`public/province/interiors/<cell>.json`,
the file the studio loads): every drawn placement (placements + substitutions,
interiorLoader.ts `drawnPlacements`) posed with the runtime's matrix
(`interiorPlacementMatrix`: Euler(pitch, -yaw, roll, 'YXZ'), uniform scale),
the cell's own light records at the runtime's intensity and decay
(`interiorLightIntensity`, `interiorLightDecay`, three.js's range window),
the cell ambient and directional as the loader adds them, and a flame proxy
at every fire the loader burns (fx/fire/interiorFires.ts: mined emitters,
else a flame-card bed, else a lit fixture's fallback) drawn by the render's
fire pass (render_scene.py `add_fire_light_pass`), with the flame cards the
loader hides left undrawn.

The floor the eyes stand on is ray-cast in Blender (`floor_plan`): the
floor straight below the arrival marker against the room's main floor, its
largest walkable level by area. The eyes come from a scored search
(`eye_plan`): candidates along 24 free rays from the hub (`candidate_eyes`),
each scored by its free distance toward the hub times the clear fraction of
a 60-degree fan (`score_eye`); the corners are the two best 90+ degrees
apart (`pick_corners`); the doorway stands at the landing edge on the
door-to-hub line or 1.2 m in (`doorway_eye`). An arrival more than 1.5 m
off the main floor (the Lilmoth houses, KeebaHouseElder) puts the corners
on the main floor round its centroid and the doorway on the arrival's
level; every view looks at the hub 1 m over the corners' floor. A view
with no scored eye falls back to its plan camera walked by `settle_eye`,
with a warning.
Two rows: `day` = the runtime's lighting (ambient + directional + records +
fires); `night` = the SOURCES ONLY (ambient and directional off). The runtime
lights an interior the same at every hour (interiorLoader.ts: "an interior
burns at any hour"), so the second row is the sources pass: a room that is
dark there is lit only by its flat ambient. Default renders both rows;
`--night` or `--day` renders one.

Frames: the bundle is the game frame (x east, y up, z south); Blender's is
(x east, y north, z up): (x, y, z) -> (x, -z, y).
"""
from __future__ import annotations

import json
import math
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

import numpy as np

from . import paths

INTERIORS = paths.PROVINCE / "interiors"
REPORTS = paths.REPO_ROOT / "tooling" / ".reports" / "16k" / "interior-renders"
BLENDER_SCRIPT = paths.WORKBENCH / "blender" / "render_interior.py"
EYE_M = 1.6                     # camera height above the arrival marker's floor
MIN_EYE_M = 1.0                 # the ceiling cap never takes the eye lower than this
DOOR_STEP_M = 0.4               # the doorway camera stands this far in from the door
CORNER_INSET = 0.18             # corners stand this fraction of the room's extent in
LENS_MM = 14.0                  # ~104 deg horizontal: a small room reads whole
LIGHT_INTENSITY_PER_FADE = math.pi   # interiorLoader.ts INTERIOR_LIGHT_INTENSITY_PER_FADE
LIGHT_DECAY = 2.0                    # interiorLoader.ts INTERIOR_LIGHT_DECAY
AMBIENT_SCALE = math.pi              # interiorLoader.ts INTERIOR_AMBIENT_SCALE
TIMEOUT_S = 600
_C = np.array([[1.0, 0, 0, 0], [0, 0, -1.0, 0], [0, 1.0, 0, 0], [0, 0, 0, 1.0]])


def bundle_path(cell: str) -> Path:
    path = INTERIORS / f"{cell}.json"
    if not path.exists():
        have = sorted(p.stem for p in INTERIORS.glob("*.json"))
        raise ValueError(f"no published interior bundle {path.name}; published: {', '.join(have)}")
    return path


def to_blender(p) -> list[float]:
    x, y, z = (float(v) for v in p)
    return [x, -z, y]


def srgb_to_linear(rgb) -> list[float]:
    """sRGB bytes to linear (interiorLoader.ts `colorFromRGB`)."""
    out = []
    for c in rgb:
        c = float(c) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return out


def _euler_yxz(pitch: float, yaw: float, roll: float) -> np.ndarray:
    """three.js Euler(x, y, z, 'YXZ') as a matrix: Ry @ Rx @ Rz."""
    cx, sx, cy, sy, cz, sz = (math.cos(pitch), math.sin(pitch), math.cos(yaw), math.sin(yaw),
                              math.cos(roll), math.sin(roll))
    rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return ry @ rx @ rz


def placement_matrix(p: dict) -> np.ndarray:
    """The runtime's placement matrix in the game frame (Y up)."""
    d = [math.radians(float(v)) for v in p["rotationDeg"]]
    m = np.eye(4)
    m[:3, :3] = _euler_yxz(d[0], -d[1], d[2]) * float(p.get("scale", 1.0))
    m[:3, 3] = [float(v) for v in p["positionM"]]
    return m


def blender_matrix(m: np.ndarray) -> np.ndarray:
    """A game-frame (Y up) matrix acting on an asset's glTF-local points, as
    Blender's matrix on the imported (Z up) asset."""
    return _C @ m @ np.linalg.inv(_C)


def substitution_placement(s: dict) -> dict:
    """interiorLoader.ts `substitutionPlacement`: a stand-in draws its
    `standInAsset` in its `standInCategory`."""
    return {"id": s["id"], "assetId": s["standInAsset"], "kit": s["kit"],
            "positionM": s["positionM"], "rotationDeg": s["rotationDeg"], "scale": s["scale"],
            "category": s.get("standInCategory")}


def drawn_placements(bundle: dict) -> list[dict]:
    """Everything the loader draws (interiorLoader.ts `drawnPlacements`, then
    the swing doors it builds from `doors[]` with doorType `swing`); load
    doors carry no mesh of their own."""
    swing = [{"id": d["id"], "assetId": d["assetId"], "kit": d["kit"],
              "positionM": d["positionM"], "rotationDeg": d["rotationDeg"],
              "scale": d["scale"], "category": "door"}
             for d in bundle.get("doors") or [] if d.get("doorType") == "swing"]
    return (list(bundle.get("placements") or [])
            + [substitution_placement(x) for x in bundle.get("substitutions") or []] + swing)


def _box(row: dict):
    """manifestBoxYUp: (min, max) in the asset's glTF frame, or None."""
    s, o = row.get("sizeM"), row.get("originOffsetM")
    if not s or not o or len(s) < 3 or len(o) < 3:
        return None
    return (np.array([-o[0], -o[2], -(s[1] - o[1])], float),
            np.array([s[0] - o[0], s[2] - o[2], o[1]], float))


def _world(m: np.ndarray, local) -> np.ndarray:
    return (m @ np.array([*local, 1.0]))[:3]


def room_bounds(bundle: dict, row_of) -> tuple[np.ndarray, np.ndarray]:
    """(min, max) game-frame bounds of the room: every drawn piece's
    manifest box through its matrix, the arrival marker and exit door
    included. Never the `architecture` category alone: a mod shell is filed
    `misc` (KotM's pod and Murkmire shells), and KeebaHouseElder's only
    `architecture` pieces were the woven fences of the lower level, so the
    ceiling cap put every camera 0.12 m under the arrival floor (walk 5)."""
    pts = []
    for p in drawn_placements(bundle):
        box = _box(row_of(p) or {})
        if box is None:
            pts.append(np.array(p["positionM"], float))
            continue
        m = placement_matrix(p)
        lo, hi = box
        for cx in (lo[0], hi[0]):
            for cy in (lo[1], hi[1]):
                for cz in (lo[2], hi[2]):
                    pts.append(_world(m, (cx, cy, cz)))
    for key in ("arrivalMarker", "exitDoor"):
        if bundle.get(key):
            pts.append(np.array(bundle[key]["positionM"], float))
    pts = np.array(pts)
    return pts.min(axis=0), pts.max(axis=0)


def _look_matrix(eye, target) -> list:
    """Blender camera matrix (looks down its -Z, +Y up) at ``eye`` toward
    ``target`` (both Blender frame)."""
    eye, target = np.asarray(eye, float), np.asarray(target, float)
    z = eye - target
    z /= np.linalg.norm(z)
    x = np.cross([0.0, 0.0, 1.0], z)
    x = x / np.linalg.norm(x) if np.linalg.norm(x) > 1e-6 else np.array([1.0, 0, 0])
    y = np.cross(z, x)
    m = np.eye(4)
    m[:3, 0], m[:3, 1], m[:3, 2], m[:3, 3] = x, y, z, eye
    return m.tolist()


def cameras(bundle: dict, lo: np.ndarray, hi: np.ndarray) -> list[dict]:
    """The three views (Blender frame): `doorway` from the exit door stepped
    DOOR_STEP_M toward the arrival marker at eye height, looking at the room
    centre; `corner-a` / `corner-b` from two opposite plan corners (inset by
    CORNER_INSET of the extent), looking at the arrival point 1 m over its
    floor (the bounds' centre can lie outside the room: KeebaHouseElder's
    lower-level poles widen them). Blender then walks each eye along its
    line toward its target until `settle_eye` accepts it."""
    arrive = np.array(bundle["arrivalMarker"]["positionM"], float)
    door = np.array((bundle.get("exitDoor") or bundle["arrivalMarker"])["positionM"], float)
    floor = arrive[1]
    # Eye height, lowered under a low ceiling but never below MIN_EYE_M
    # over the arrival floor: a camera under the floor draws the floor's
    # underside across half the frame (walk 5, KeebaHouseElder).
    eye_y = max(floor + MIN_EYE_M, min(floor + EYE_M, hi[1] - 0.2))
    centre = (lo + hi) / 2
    look_at = np.array([centre[0], floor + 1.0, centre[2]])
    arrival_at = np.array([arrive[0], floor + 1.0, arrive[2]])
    inward = arrive - door
    inward[1] = 0.0
    if np.linalg.norm(inward) < 1e-3:          # arrival on the door: step toward the centre
        inward = look_at - door
        inward[1] = 0.0
    inward /= max(np.linalg.norm(inward), 1e-6)
    d_eye = door + inward * DOOR_STEP_M
    d_eye[1] = eye_y
    ext = hi - lo
    a = np.array([lo[0] + ext[0] * CORNER_INSET, eye_y, lo[2] + ext[2] * CORNER_INSET])
    b = np.array([hi[0] - ext[0] * CORNER_INSET, eye_y, hi[2] - ext[2] * CORNER_INSET])
    out = []
    for name, eye, at in (("doorway", d_eye, look_at), ("corner-a", a, arrival_at),
                          ("corner-b", b, arrival_at)):
        out.append({"name": name, "eyeGame": [round(float(v), 3) for v in eye],
                    "matrix": _look_matrix(to_blender(eye), to_blender(at)),
                    "targetBlender": to_blender(at), "eyeHeightM": round(float(eye_y - floor), 3),
                    "lens": LENS_MM})
    # Blender re-places every eye from the floor plan (`eye_plan`); these
    # are the fallbacks when the plan has no eye for a view
    out[1]["arrivalEye"] = out[2]["arrivalEye"] = to_blender([arrive[0], eye_y, arrive[2]])
    return out


# The eye rule (Blender frame, z up), run inside Blender with the scene's ray
# cast: `cast(origin, direction, max_m)` -> hit distance or None.
STEP_M = 0.35       # the eye walks toward its target in steps of this
ENCLOSED_M = 30.0   # inside = 8 horizontal rays and the up ray hit within this
FLOOR_M = 3.0       # ... and a floor lies within this below the eye
AHEAD_M = 3.0       # a blocked forward line scores its hit over this (walk 5: corner-a faced a wall)
CLEAR_M = 1.5       # ... and every ray of the fan across the frame this far
FAN_DEG = (-40.0, -20.0, 20.0, 40.0)
NEAR_TARGET_M = 2.0  # the eye never walks nearer its target than this


LEVEL_TOL_M = 0.5   # the floor under an eye lies within this of its eye height below


def on_level(cast, p, eye_h) -> bool:
    """The floor under p is the arrival's level: eye_h below, within
    LEVEL_TOL_M (walk 5, KeebaHouseElder corner-a stood over the lower
    level and framed the upper floor's edge across half the view)."""
    down = cast(p, (0.0, 0.0, -1.0), eye_h + LEVEL_TOL_M)
    return down is not None and abs(down - eye_h) <= LEVEL_TOL_M


def _rot_z(v, deg):
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    return (v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2])


def is_inside(cast, p) -> bool:
    """8 horizontal rays and the up ray all hit within ENCLOSED_M and a floor
    lies within FLOOR_M below: the eye stands in a room, not outside its
    shell looking at the void (walk 5: KeebaHouseElder's corners)."""
    rays = [(math.cos(a), math.sin(a), 0.0) for a in (i * math.pi / 4.0 for i in range(8))]
    if any(cast(p, r, ENCLOSED_M) is None for r in rays + [(0.0, 0.0, 1.0)]):
        return False
    return cast(p, (0.0, 0.0, -1.0), FLOOR_M) is not None


def view_clear(cast, p, target) -> float:
    """How clear the view from p toward target is, as a fraction of its bar
    (1 = the view passes): the target itself is in sight (nothing on the
    line to within 0.2 m of it; walk 5, KeebaHouseElder corner-b framed a
    rock wall past a pod's opening), nothing within AHEAD_M straight ahead
    even past the target (walk 5: corner-a faced a wall at close range),
    nothing within CLEAR_M on the fan across the frame. A blocked line
    scores its hit / max(AHEAD_M, line), below 1."""
    d = [t - q for t, q in zip(target, p)]
    n = math.sqrt(sum(v * v for v in d)) or 1e-9
    ahead = tuple(v / n for v in d)
    reach = max(n - 0.2, AHEAD_M)
    hit = cast(p, ahead, reach)
    score = 1.0 if hit is None or (hit >= n - 0.2 and hit >= AHEAD_M) else min(hit / reach, 0.99)
    for deg in FAN_DEG:
        hit = cast(p, _rot_z(ahead, deg), CLEAR_M)
        if hit is not None:
            score = min(score, hit / CLEAR_M)
    return score


CORNER_DIRS = 24      # horizontal rays from the hub that seed the candidate eyes
CANDIDATE_FRACS = (0.35, 0.55, 0.75)   # candidates stand at these fractions of a free ray
FAN_RAYS = 9          # the view fan: this many rays across FAN_SPAN_DEG toward the target
FAN_SPAN_DEG = 60.0
FAN_CLEAR_M = 3.0     # a fan ray is clear when nothing lies within this
MIN_SCORE_M = 3.0     # a candidate scoring below this is rejected
CORNER_APART_DEG = 90.0
SPLIT_M = 1.5         # arrival and main floor further apart: corners on main, doorway on arrival
DOOR_IN_M = 1.2       # no drop on the door-to-hub line: the doorway eye stands this far in
EDGE_BACK_M = 0.4     # ... else this far back from the landing edge
DROP_M = 0.5          # a floor this far below the level is a drop (the landing edge)
DOOR_STEP = 0.1       # the doorway walk samples the door-to-hub line at this spacing


def floor_ok(cast, p, level_z: float) -> bool:
    """The floor under eye p is its level: no more than LEVEL_TOL_M above
    it and no more than SPLIT_M below (a step down within the room is still
    the room; a landing's edge over the room below is not)."""
    down = cast(p, (0.0, 0.0, -1.0), p[2] - level_z + SPLIT_M)
    if down is None:
        return False
    fz = p[2] - down
    return level_z - SPLIT_M <= fz <= level_z + LEVEL_TOL_M


def candidate_eyes(cast, hub, level_z: float) -> list[dict]:
    """Candidate eyes on one level (Blender frame): CORNER_DIRS horizontal
    rays from the hub at eye height (level_z + EYE_M); along each ray that
    hits a wall within ENCLOSED_M (a free one leaves the room), a candidate
    at each CANDIDATE_FRACS of its free length. Each is {eye, ray, frac}."""
    z = level_z + EYE_M
    out = []
    for i in range(CORNER_DIRS):
        a = 2.0 * math.pi * i / CORNER_DIRS
        d = (math.cos(a), math.sin(a), 0.0)
        hit = cast((hub[0], hub[1], z), d, ENCLOSED_M)
        if hit is None:
            continue
        for f in CANDIDATE_FRACS:
            out.append({"eye": (hub[0] + d[0] * hit * f, hub[1] + d[1] * hit * f, z),
                        "ray": i, "frac": f})
    return out


# The frame probes past the brief's level fan (yaw, pitch off the line to
# the target, bar): the 14 mm lens spans ~104 x 88 degrees, so a table top
# or a sack under the frame's lower half (Lilmoth Glassworks corner-a,
# KeebaHouseCrafter), a post or a ladder at its edge (Plantation and
# Glassworks corner-b) or a landing's underside over it (KeebaHouseElder
# corner-a) fills it while the level fan runs clear. A grid every 10
# degrees across the frame.
FRAME_ROWS = ((30.0, 3.0), (15.0, 2.5), (0.0, 3.0), (-15.0, 2.5), (-30.0, 2.0), (-42.0, 1.8))
FRAME_PROBES = tuple((float(y), pt, bar) for pt, bar in FRAME_ROWS for y in range(-50, 51, 10))
MIN_FRAME_CLEAR = 0.85   # a frame with more of its probes blocked is rejected
FREE_CAP_M = 12.0        # the free distance ahead counts to this


def _turn(ahead, yaw_deg: float, pitch_deg: float):
    """`ahead` turned by yaw about z and its pitch raised by pitch_deg."""
    yaw = math.atan2(ahead[1], ahead[0]) + math.radians(yaw_deg)
    pitch = math.asin(max(-1.0, min(1.0, ahead[2]))) + math.radians(pitch_deg)
    return (math.cos(pitch) * math.cos(yaw), math.cos(pitch) * math.sin(yaw), math.sin(pitch))


def score_eye(cast, eye, target) -> float:
    """The free distance straight ahead from eye toward target (ENCLOSED_M
    when nothing is hit), times the fraction of FAN_RAYS level rays across
    FAN_SPAN_DEG toward the target that run FAN_CLEAR_M clear (16k walk 5:
    corner-b faced a post at 0.05 m, the Plantation doorway hay bales),
    times the fraction of the FRAME_PROBES that run their bar clear. The
    free distance counts to FREE_CAP_M: past it a room view gains nothing,
    and an uncapped 30 m line outscored a clean frame (Plantation corner-b
    kept a post over a third of its frame, walk 5). A frame with fewer
    than MIN_FRAME_CLEAR of its probes clear scores 0."""
    d = [t - e for t, e in zip(target, eye)]
    n = math.sqrt(sum(v * v for v in d)) or 1e-9
    ahead = tuple(v / n for v in d)
    hit = cast(eye, ahead, ENCLOSED_M)
    free = min(FREE_CAP_M, ENCLOSED_M if hit is None else hit)
    half = FAN_SPAN_DEG / 2.0
    clear = sum(1 for k in range(FAN_RAYS)
                if cast(eye, _rot_z(ahead, -half + k * FAN_SPAN_DEG / (FAN_RAYS - 1)),
                        FAN_CLEAR_M) is None)
    frame = sum(1 for y, pt, bar in FRAME_PROBES
                if cast(eye, _turn(ahead, y, pt), bar) is None) / len(FRAME_PROBES)
    if frame < MIN_FRAME_CLEAR:
        return 0.0
    return free * clear / FAN_RAYS * frame


def pick_corners(cast, cands, target, level_z: float) -> list[dict]:
    """The two best-scoring candidates at least CORNER_APART_DEG apart round
    the hub (their seed rays), each on its floor (`floor_ok`) and scoring
    MIN_SCORE_M or more; fewer when the room has none."""
    scored = []
    for c in cands:
        if not floor_ok(cast, c["eye"], level_z):
            continue
        s = score_eye(cast, c["eye"], target)
        if s >= MIN_SCORE_M:
            scored.append({**c, "score": s})
    scored.sort(key=lambda c: (-c["score"], c["ray"], c["frac"]))
    if not scored:
        return []
    picked = [scored[0]]
    for c in scored[1:]:
        gap = abs(c["ray"] - picked[0]["ray"]) * 360.0 / CORNER_DIRS
        if min(gap, 360.0 - gap) >= CORNER_APART_DEG - 1e-6:
            picked.append(c)
            break
    return picked


def doorway_eye(cast, door, hub, level_z: float, target=None) -> tuple:
    """The doorway eye (Blender frame) on the door's level and its target:
    along the door-to-hub line, EDGE_BACK_M back from the landing edge (the
    last on-floor point before a drop of more than DROP_M, or no floor);
    with no drop, DOOR_IN_M in from the door (never nearer the hub than
    1 m); looking at `target`. When that view scores under MIN_SCORE_M
    (16k walk 5: the KeebaHouseCrafter doorway looked down at a rug, the
    Plantation's at hay bales), the first view scoring MIN_SCORE_M over the
    line's on-floor points at DOOR_STEP x 3 spacing (the edge end first),
    aimed at the target, then higher on the hub's vertical (half-way to eye
    height, then eye height less 0.3 m: from a landing, across the room
    rather than down at its floor); none: the best-scoring. Returns (eye,
    target)."""
    dx, dy = hub[0] - door[0], hub[1] - door[1]
    length = math.hypot(dx, dy)
    u = (dx / length, dy / length) if length > 1e-6 else (1.0, 0.0)
    z = level_z + EYE_M
    target = tuple(target) if target is not None else (hub[0], hub[1], level_z + 1.0)
    first = last = edge = None
    on = []
    s = DOOR_STEP
    while s <= length:
        p = (door[0] + u[0] * s, door[1] + u[1] * s, z)
        down = cast(p, (0.0, 0.0, -1.0), EYE_M + 3.0)
        fz = z - down if down is not None else None
        if fz is not None and abs(fz - level_z) <= DROP_M:
            first = s if first is None else first
            last = s
            on.append(s)
        elif last is not None and (fz is None or fz < level_z - DROP_M):
            edge = last
            break
        s += DOOR_STEP
    if edge is not None:
        at = max(first, edge - EDGE_BACK_M)
    else:
        at = min(DOOR_IN_M, max(length - 1.0, 0.0))
    eye = (door[0] + u[0] * at, door[1] + u[1] * at, z)
    if score_eye(cast, eye, target) >= MIN_SCORE_M:
        return eye, target
    aims = [target]
    if z - 0.3 > target[2]:
        aims += [(target[0], target[1], (target[2] + z) / 2.0), (target[0], target[1], z - 0.3)]
    limit = edge - EDGE_BACK_M if edge is not None else max(length - 1.0, 0.0)
    spots = [x for x in on[::3] if x <= limit + 1e-9][::-1]      # the edge end first
    best = (score_eye(cast, eye, target), eye, target)
    for t in aims:                   # the lowest aim that passes, from the spot nearest the edge
        for x in spots:
            p = (door[0] + u[0] * x, door[1] + u[1] * x, z)
            sc = score_eye(cast, p, t)
            if sc >= MIN_SCORE_M:
                return p, t
            if sc > best[0] + 1e-9:
                best = (sc, p, t)
    return best[1], best[2]


def eye_plan(cast, plan: dict, door) -> dict:
    """The three eyes (Blender frame) from the floor plan: the corners on the
    main floor when it lies more than SPLIT_M from the arrival's level
    (round the main floor's centroid), else on the arrival's level (round
    the arrival point); the doorway always on the arrival's level. Every
    view looks at the hub 1 m over the corners' floor (the doorway higher on
    its vertical when that view fails, `doorway_eye`). {target, hub,
    corners: [eye..], scores, doorway: (eye, target), cornerZ, doorZ}."""
    split = abs(plan["belowZ"] - plan["mainZ"]) > SPLIT_M
    corner_z = plan["mainZ"] if split else plan["belowZ"]
    hub = plan["centroid"] if split else plan["arrivalXY"]
    target = (hub[0], hub[1], corner_z + 1.0)
    corners = pick_corners(cast, candidate_eyes(cast, hub, corner_z), target, corner_z)
    return {"target": target, "hub": tuple(hub), "cornerZ": corner_z, "doorZ": plan["belowZ"],
            "corners": [c["eye"] for c in corners],
            "scores": [round(c["score"], 2) for c in corners],
            "doorway": doorway_eye(cast, door, hub, plan["belowZ"], target)}


def settle_eye(cast, eye, target, eye_h: float | None = None) -> tuple[tuple, float]:
    """Walk the eye from `eye` toward `target` in STEP_M steps (never nearer
    the target than NEAR_TARGET_M) and stand it at the first step that is
    inside the room (`is_inside`), over the arrival's floor level when
    `eye_h` is given (`on_level`), with its view clear (`view_clear` = 1):
    the target in sight, nothing within AHEAD_M ahead or CLEAR_M across the
    frame. Walking the line toward the target keeps the aim. No such step:
    the inside step with the clearest view; no inside step: the target. Returns (eye, metres moved)."""
    d = [t - e for t, e in zip(target, eye)]
    length = math.sqrt(sum(v * v for v in d))
    reach = max(0.0, length - NEAR_TARGET_M)
    n = int(reach / STEP_M)
    best, best_score = None, -1.0
    for i in range(n + 1):
        k = (i * STEP_M) / length if length > 1e-9 else 0.0
        p = tuple(e + v * k for e, v in zip(eye, d))
        if not is_inside(cast, p) or (eye_h is not None and not on_level(cast, p, eye_h)):
            continue
        score = view_clear(cast, p, target)
        if score >= 1.0:
            return p, round(i * STEP_M, 2)
        if score > best_score:
            best, best_score = (p, round(i * STEP_M, 2)), score
    if best is not None:
        return best
    return tuple(target), round(length, 2)


FLOOR_GRID_M = 0.5    # the floor survey casts one column per cell of this plan grid
HEADROOM_M = 1.8      # a walkable surface has this much clear above it, under a ceiling
LEVEL_GAP_M = 0.3     # surface heights further apart than this are different levels
MAX_HITS = 24         # surfaces one survey column passes through at most


def column_floors(cast, x: float, y: float, top: float, bottom: float) -> list[float]:
    """The walkable surfaces of one plan column (Blender frame): cast down
    from `top`, and from just under every hit, to `bottom`; a hit is
    walkable when the up ray from just over it runs at least HEADROOM_M and
    hits a ceiling within ENCLOSED_M (a roof top has no ceiling; a slab's
    underside or a surface under a shelf has no headroom), and at least 3
    of the four level rays at eye height EYE_M over it hit within
    ENCLOSED_M (the open ground under a stilt house is no room; a small
    arrival room with a window or a door still is)."""
    out, z = [], top
    for _ in range(MAX_HITS):
        hit = cast((x, y, z), (0.0, 0.0, -1.0), z - bottom)
        if hit is None:
            break
        fz = z - hit
        up = cast((x, y, fz + 0.05), (0.0, 0.0, 1.0), ENCLOSED_M)
        if up is not None and up + 0.05 >= HEADROOM_M and sum(
                cast((x, y, fz + EYE_M), d, ENCLOSED_M) is not None
                for d in ((1.0, 0.0, 0.0), (-1.0, 0.0, 0.0), (0.0, 1.0, 0.0), (0.0, -1.0, 0.0))) >= 3:
            out.append(fz)
        z = fz - 0.02
    return out


def floor_levels(heights, cell_m2: float) -> list[tuple[float, float]]:
    """The room's walkable levels from the survey's surface heights: sorted
    heights split wherever two neighbours lie more than LEVEL_GAP_M apart;
    each level is (median height, floor area = samples x cell_m2), largest
    area first (ties: the lower level)."""
    hs = sorted(float(h) for h in heights)
    if not hs:
        return []
    groups, cur = [], [hs[0]]
    for h in hs[1:]:
        if h - cur[-1] > LEVEL_GAP_M:
            groups.append(cur)
            cur = []
        cur.append(h)
    groups.append(cur)
    levels = [(g[len(g) // 2], len(g) * cell_m2) for g in groups]
    return sorted(levels, key=lambda lv: (-lv[1], lv[0]))


def floor_plan(cast, lo_b, hi_b, arrival_b) -> dict:
    """Which floor the eyes stand on (Blender frame; lo_b/hi_b the room
    bounds, arrival_b the arrival marker). The floor straight below the
    marker is ray-cast, never read from the marker's height; the room's
    main floor is its largest walkable level by area (`floor_levels` over a
    FLOOR_GRID_M survey). A marker whose floor is off the main level (a
    stair, a landing: the Lilmoth houses, 16k walk 5) puts the eyes on the
    main floor, over its surveyed column nearest the marker (`hub`)."""
    top, bottom = hi_b[2] + 1.0, lo_b[2] - 1.0
    ax, ay, az = arrival_b
    below = cast((ax, ay, az + 0.5), (0.0, 0.0, -1.0), FLOOR_M + 0.5)
    below_z = az + 0.5 - below if below is not None else az
    cols = []
    nx = max(1, int((hi_b[0] - lo_b[0]) / FLOOR_GRID_M))
    ny = max(1, int((hi_b[1] - lo_b[1]) / FLOOR_GRID_M))
    for i in range(nx):         # cell centres: never a column on the bounds' own faces
        for j in range(ny):
            x, y = lo_b[0] + (i + 0.5) * FLOOR_GRID_M, lo_b[1] + (j + 0.5) * FLOOR_GRID_M
            cols.extend((x, y, z) for z in column_floors(cast, x, y, top, bottom))
    levels = floor_levels([c[2] for c in cols], FLOOR_GRID_M * FLOOR_GRID_M)
    main = levels[0][0] if levels else below_z
    on_main = abs(below_z - main) <= LEVEL_GAP_M
    floor_z = below_z if on_main else main
    if on_main or not cols:
        hub = (ax, ay)
    else:
        on = [c for c in cols if abs(c[2] - main) <= LEVEL_GAP_M]
        hub = min(on, key=lambda c: ((c[0] - ax) ** 2 + (c[1] - ay) ** 2, c[0], c[1]))[:2]
    on = [c for c in cols if abs(c[2] - main) <= LEVEL_GAP_M]
    if on:        # the main floor's centroid, snapped to its nearest surveyed column
        mx, my = sum(c[0] for c in on) / len(on), sum(c[1] for c in on) / len(on)
        centroid = min(on, key=lambda c: ((c[0] - mx) ** 2 + (c[1] - my) ** 2, c[0], c[1]))[:2]
    else:
        centroid = (ax, ay)
    return {"arrivalZ": az, "belowZ": below_z, "mainZ": main, "onMain": on_main,
            "floorZ": floor_z, "hub": tuple(hub), "centroid": tuple(centroid),
            "arrivalXY": (ax, ay),
            "levels": [(round(z, 2), round(a, 1)) for z, a in levels[:4]]}


def on_floor(shot: dict, plan: dict, arrival_floor: float) -> dict:
    """The shot moved onto the plan's floor: its eye, its target and its
    arrival eye rise or fall by floorZ - arrival_floor (the marker's own
    height, which `cameras` used); off the main floor the corners' arrival
    eye and every target over the arrival move to the hub."""
    s = dict(shot)
    dz = plan["floorZ"] - arrival_floor
    dz_eye = dz
    if not plan["onMain"]:
        # the cap under a low ceiling was taken over the marker's floor
        dz_eye += EYE_M - shot["eyeHeightM"]
        s["eyeHeightM"] = EYE_M
    m = [list(r) for r in shot["matrix"]]
    m[2][3] += dz_eye
    t = list(shot["targetBlender"])
    t[2] += dz
    if "arrivalEye" in shot:
        e = list(shot["arrivalEye"])
        e[2] += dz_eye
        if not plan["onMain"]:
            e[0], e[1] = plan["hub"]
            t[0], t[1] = plan["hub"]
        s["arrivalEye"] = e
    s["matrix"], s["targetBlender"] = m, t
    if not plan["onMain"] and "arrivalEye" not in shot:
        s["matrix"] = _look_matrix([m[0][3], m[1][3], m[2][3]], t)
        # the doorway's fallback: the door on its own level, looking down
        # into the main room (a door on a landing over the room)
        o = shot["matrix"]
        s["alt"] = {"matrix": _look_matrix([o[0][3], o[1][3], o[2][3]], t),
                    "eyeHeightM": shot["eyeHeightM"]}
    return s


def light_list(bundle: dict) -> list[dict]:
    """The cell's LIGH records as the loader adds them: a point light at the
    record's position (Blender frame), linear colour, three.js intensity
    (fade x pi, candela), range (radiusM) and decay (2 x falloff exponent)."""
    out = []
    for light in bundle.get("lights") or []:
        out.append({"refId": light.get("refId"), "base": light.get("base"),
                    "at": to_blender(light["positionM"]),
                    "colour": srgb_to_linear(light["colorRGB"]),
                    "intensity": float(light.get("fade", 1.0) or 1.0) * LIGHT_INTENSITY_PER_FADE,
                    "radiusM": float(light["radiusM"]),
                    "decay": LIGHT_DECAY * float(light.get("falloffExponent", 1.0) or 1.0)})
    return out


def ambient_of(bundle: dict) -> dict:
    """{ambient: linear rgb x intensity x pi (the AmbientLight), directional:
    linear rgb (intensity pi, straight down) or None}."""
    amb = bundle.get("ambient") or {}
    lin = srgb_to_linear(amb.get("colorRGB", [0, 0, 0]))
    k = float(amb.get("intensity", 1.0)) * AMBIENT_SCALE
    d = (bundle.get("lighting") or {}).get("directionalRGB")
    return {"ambient": [c * k for c in lin],
            "directional": srgb_to_linear(d) if d else None}


def fire_list(bundle: dict, row_of) -> tuple[list[dict], list[str], list[str]]:
    """(fires in the render fire pass's shape {at, heightM, fallback, id},
    the flame-card material names the loader leaves undrawn, the flame-card
    materials of a piece with mined `flames`, which the loader draws and
    the render draws emissive and additive), per
    fx/fire/interiorFires.ts: mined emitters; else a flame-card piece's one
    bed at its base centre; else a lit fixture's fallback (a hanging one's
    body, any other its top centre), unless a burning piece stands in its
    bounds."""
    fires, cards, glow, own, lit = [], set(), set(), [], []
    for p in drawn_placements(bundle):
        row = row_of(p)
        if not row:
            continue
        m = placement_matrix(p)
        box = _box(row)
        flames = row.get("flames") or []
        if flames:
            glow.update(row.get("flameCardMaterials") or [])
            beds = set()
            for f in flames:
                src = f.get("source")
                if src in beds:
                    continue
                if src:
                    beds.add(src)
                at = _world(m, f["offsetM"])
                fires.append({"id": p["id"], "at": to_blender(at), "fallback": False,
                              "heightM": min(0.9, max(0.08, float(f.get("sizeM", 0.1)) * 2.0))
                              * float(p.get("scale", 1.0))})
                own.append(at)
            continue
        if row.get("flameCardMaterials") and box is not None:
            cards.update(row["flameCardMaterials"])
            lo, hi = box
            at = _world(m, ((lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2))
            fires.append({"id": p["id"], "at": to_blender(at), "fallback": False,
                          "heightM": 0.45})
            own.append(at)
            continue
        if (row.get("light") or {}).get("fixtureKind") and box is not None:
            lit.append((p, m, box, row))
    for p, m, (lo, hi), row in lit:
        inv = np.linalg.inv(m)
        if any(np.all(_world(inv, a) >= lo - 0.05) and np.all(_world(inv, a) <= hi + 0.05)
               for a in own):
            continue
        c = (lo + hi) / 2
        if row.get("anchorClass") == "hanging":
            size = hi - lo
            local = (c[0], lo[1] + min(size) * 0.5, c[2])
        else:
            local = (c[0], hi[1], c[2])
        fires.append({"id": p["id"], "at": to_blender(_world(m, local)), "fallback": True,
                      "heightM": 0.12})
    return fires, sorted(cards), sorted(glow - cards)


def pieces(bundle: dict, cat) -> tuple[list[dict], list[str]]:
    """(the render job's pieces: raw kit GLB, asset id, Blender matrix, id;
    ids with no raw mesh)."""
    out, missing = [], []
    for p in drawn_placements(bundle):
        got = cat.raw_glb(p["assetId"])
        if got is None:
            missing.append(p["id"])
            continue
        out.append({"glb": str(got[0]), "assetId": p["assetId"], "uid": p["id"],
                    "matrix": blender_matrix(placement_matrix(p)).tolist(), "tint": None})
    return out, missing


def row_lookup(cat):
    def row_of(p):
        try:
            return cat.row(p["assetId"])
        except KeyError:
            return None
    return row_of


def render_interior(cat, cell: str, rows: tuple[str, ...] = ("day", "night"),
                    out: Path | None = None, res: tuple[int, int] = (640, 480),
                    samples: int = 24, survey_only: bool = False) -> dict:
    from PIL import Image, ImageDraw
    from .kits import glb_file_signature
    from .render import BLEND_CACHE
    t0 = time.time()
    bundle = json.loads(bundle_path(cell).read_text())
    row_of = row_lookup(cat)
    lo, hi = room_bounds(bundle, row_of)
    cams = cameras(bundle, lo, hi)
    job_pieces, missing = pieces(bundle, cat)
    fires, cards, glow = fire_list(bundle, row_of)
    arrive = bundle["arrivalMarker"]["positionM"]
    lights = light_list(bundle)
    out = Path(out or REPORTS / f"{cell}.png")
    out.parent.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix="wb-irender-", dir=paths.OUTPUT))
    try:
        shots = [{**c, "name": f"{r}-{c['name']}", "row": r, "view": c["name"],
                  "out": str(work / f"{r}-{c['name']}.png")} for r in rows for c in cams]
        job = {"pieces": job_pieces, "fires": fires, "flameCards": cards, "glowCards": glow,
               "lights": lights, "arrivalBlender": to_blender(arrive),
               "arrivalFloor": float(arrive[1]),
               "doorBlender": to_blender((bundle.get("exitDoor") or bundle["arrivalMarker"])["positionM"]),
               "boundsBlender": [to_blender([lo[0], lo[1], hi[2]]), to_blender([hi[0], hi[1], lo[2]])],
               "surveyOnly": survey_only,
               **ambient_of(bundle), "shots": shots, "res": list(res), "samples": samples,
               "kitCache": {"dir": str(BLEND_CACHE),
                            "signatures": {g: glb_file_signature(Path(g))
                                           for g in sorted({p["glb"] for p in job_pieces})}}}
        (work / "job.json").write_text(json.dumps(job))
        t1 = time.time()
        proc = subprocess.run(paths.guarded([str(paths.LINUX_BLENDER), "-b", "--factory-startup",
                                             "--python", str(BLENDER_SCRIPT)], "render-interior"),
                              env=dict(os.environ, JOB=str(work / "job.json")),
                              capture_output=True, text=True, timeout=TIMEOUT_S)
        if proc.returncode != 0 or "[wb-irender] done" not in proc.stdout:
            raise RuntimeError("render-interior failed:\n" + proc.stdout[-4000:] + proc.stderr[-2000:])
        floors = [l.split("] ", 1)[1] for l in proc.stdout.splitlines() if l.startswith("[wb-irender] floor ")]
        if survey_only:
            return {"cell": cell, "floor": floors, "totalS": round(time.time() - t0, 2)}
        eyes = [l.split("] ", 1)[1] for l in proc.stdout.splitlines() if l.startswith("[wb-irender] eyes ")]
        warnings = [l for l in proc.stdout.splitlines() if "[wb-render] missing" in l
                    or "[wb-render] warning" in l or "[wb-irender] warning" in l]
        stepped = [l.split("] ", 1)[1] for l in proc.stdout.splitlines() if "stepped" in l]
        started = [float(l.split()[2]) for l in proc.stdout.splitlines()
                   if l.startswith("[wb-irender] start ")]
        t_start = started[0] if started else t1
        phases = {l.split()[2]: [float(l.split()[3]), float(l.split()[5])] for l in proc.stdout.splitlines()
                  if l.startswith("[wb-irender] time ")}
        t_end = time.time()
        rx, ry = res
        sheet = Image.new("RGB", (len(cams) * rx, len(rows) * ry), "black")
        draw = ImageDraw.Draw(sheet)
        for i, s in enumerate(shots):
            col, rw = i % len(cams), i // len(cams)
            sheet.paste(Image.open(s["out"]).convert("RGB"), (col * rx, rw * ry))
            label = f"{s['row']} {s['view']}"
            draw.text((col * rx + 6, rw * ry + 4), label, fill=(255, 255, 0))
        sheet.save(out)
    finally:
        shutil.rmtree(work, ignore_errors=True)
    return {"cell": cell, "png": str(out), "rows": list(rows),
            "views": [c["name"] for c in cams], "pieces": len(job_pieces),
            "missingMesh": missing, "lights": len(lights), "fires": len(fires),
            "fallbackFires": sum(1 for f in fires if f["fallback"]),
            "hiddenFlameCards": cards, "emissiveFlameCards": glow, "floor": floors, "eyes": eyes, "warnings": warnings, "camerasStepped": stepped,
            "prepS": round(t1 - t0, 2), "phaseS": phases,
            "queueS": round(t_start - t1, 2), "blenderS": round(t_end - t_start, 2),
            "totalS": round(time.time() - t0, 2)}
