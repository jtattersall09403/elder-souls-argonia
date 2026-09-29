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

Three views: from the doorway looking in (the exit door, stepped toward the
arrival marker, at eye height) and from two opposite corners of the room.
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
    """(min, max) game-frame bounds of the room: the architecture pieces'
    manifest boxes through their matrices (every drawn piece when the cell
    has none), the arrival marker and exit door included."""
    places = drawn_placements(bundle)
    arch = [p for p in places if p.get("category") == "architecture"] or places
    pts = []
    for p in arch:
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
    CORNER_INSET of the extent), looking at the centre, a little down."""
    arrive = np.array(bundle["arrivalMarker"]["positionM"], float)
    door = np.array((bundle.get("exitDoor") or bundle["arrivalMarker"])["positionM"], float)
    floor = arrive[1]
    eye_y = min(floor + EYE_M, hi[1] - 0.2)
    centre = (lo + hi) / 2
    look_at = np.array([centre[0], floor + 1.0, centre[2]])
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
    for name, eye in (("doorway", d_eye), ("corner-a", a), ("corner-b", b)):
        out.append({"name": name, "eyeGame": [round(float(v), 3) for v in eye],
                    "matrix": _look_matrix(to_blender(eye), to_blender(look_at)),
                    "targetBlender": to_blender(look_at),
                    "lens": LENS_MM})
    return out


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


def fire_list(bundle: dict, row_of) -> tuple[list[dict], list[str]]:
    """(fires in the render fire pass's shape {at, heightM, fallback, id},
    the flame-card material names the loader leaves undrawn), per
    fx/fire/interiorFires.ts: mined emitters; else a flame-card piece's one
    bed at its base centre; else a lit fixture's fallback (a hanging one's
    body, any other its top centre), unless a burning piece stands in its
    bounds."""
    fires, cards, own, lit = [], set(), [], []
    for p in drawn_placements(bundle):
        row = row_of(p)
        if not row:
            continue
        m = placement_matrix(p)
        box = _box(row)
        flames = row.get("flames") or []
        if flames:
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
    return fires, sorted(cards)


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
                    samples: int = 24) -> dict:
    from PIL import Image, ImageDraw
    from .kits import glb_file_signature
    from .render import BLEND_CACHE
    t0 = time.time()
    bundle = json.loads(bundle_path(cell).read_text())
    row_of = row_lookup(cat)
    lo, hi = room_bounds(bundle, row_of)
    cams = cameras(bundle, lo, hi)
    job_pieces, missing = pieces(bundle, cat)
    fires, cards = fire_list(bundle, row_of)
    lights = light_list(bundle)
    out = Path(out or REPORTS / f"{cell}.png")
    out.parent.mkdir(parents=True, exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix="wb-irender-", dir=paths.OUTPUT))
    try:
        shots = [{**c, "name": f"{r}-{c['name']}", "row": r, "view": c["name"],
                  "out": str(work / f"{r}-{c['name']}.png")} for r in rows for c in cams]
        job = {"pieces": job_pieces, "fires": fires, "flameCards": cards, "lights": lights,
               **ambient_of(bundle), "shots": shots, "res": list(res), "samples": samples,
               "kitCache": {"dir": str(BLEND_CACHE),
                            "signatures": {g: glb_file_signature(Path(g))
                                           for g in sorted({p["glb"] for p in job_pieces})}}}
        (work / "job.json").write_text(json.dumps(job))
        t1 = time.time()
        proc = subprocess.run([str(paths.LINUX_BLENDER), "-b", "--factory-startup", "--python",
                               str(BLENDER_SCRIPT)], env=dict(os.environ, JOB=str(work / "job.json")),
                              capture_output=True, text=True, timeout=TIMEOUT_S)
        if proc.returncode != 0 or "[wb-irender] done" not in proc.stdout:
            raise RuntimeError("render-interior failed:\n" + proc.stdout[-4000:] + proc.stderr[-2000:])
        warnings = [l for l in proc.stdout.splitlines() if "[wb-render] missing" in l
                    or "[wb-render] warning" in l or "[wb-irender] warning" in l]
        stepped = [l.split("] ", 1)[1] for l in proc.stdout.splitlines() if "stepped" in l]
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
            "hiddenFlameCards": cards, "warnings": warnings, "camerasStepped": stepped,
            "prepS": round(t1 - t0, 2), "blenderS": round(time.time() - t1, 2),
            "totalS": round(time.time() - t0, 2)}
