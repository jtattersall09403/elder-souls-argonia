"""Renders of the scene for an agent (or a Sonnet reader) to LOOK at.

Views: ``top`` (plan, north up), ``front`` / ``side`` / ``back`` (level
orthographic elevations), ``iso`` (perspective from above), ``turntable``
(eight iso shots in one contact sheet), ``cutaway`` (an elevation whose
near clip plane slices through the focus at ``cut`` metres). Every view
has the ground grid (1 m lines, 5 m bright lines) in the world; the
orthographic ones also get a labelled metre scale bar, the piece labels at
their pivots, and for ``top`` the footprint outlines and a north arrow
(drawn after the render, from the exact camera projection).

Blender: the Linux 3.2.2 build (native, ~5 s start; the Windows 4.4.3
build under Wine is kept for NIF work), Cycles on CPU.
"""
from __future__ import annotations

import json
import math
import os
import subprocess
import tempfile
from pathlib import Path

import numpy as np

from . import paths
from .kits import Catalogue
from .measure import footprint_province
from .scene import Scene

TIMEOUT_S = 900
LENS_MM = 30.0
SENSOR_MM = 36.0            # Blender's default sensor width (fit: the wider side)
FRONT = {"front": 0.0, "side": 90.0, "back": 180.0}


def _look(d, up=(0.0, 0.0, 1.0)) -> np.ndarray:
    d = np.asarray(d, float)
    d /= np.linalg.norm(d)
    z = -d
    up = np.asarray(up, float)
    x = np.cross(up, z)
    if np.linalg.norm(x) < 1e-6:
        x = np.array([1.0, 0.0, 0.0])
    x /= np.linalg.norm(x)
    y = np.cross(z, x)
    return np.column_stack([x, y, z])


def _camera(rot: np.ndarray, pos) -> list:
    m = np.eye(4)
    m[:3, :3] = rot
    m[:3, 3] = pos
    return m.tolist()


def _frame(cat: Catalogue, scene: Scene, focus: list[str]) -> tuple[np.ndarray, np.ndarray]:
    """World (wb) bounds of the focused pieces (all pieces when none)."""
    chosen = [p for p in scene.pieces if not focus or p.uid in focus]
    if not chosen:
        raise ValueError("nothing to frame: no pieces (or no focus match)")
    lows, highs = [], []
    for p in chosen:
        m = cat.mesh(p.asset)
        corners = np.array([[x, y, z] for x in m.bounds[:, 0] for y in m.bounds[:, 1]
                            for z in m.bounds[:, 2]])
        if p.y is None:
            raise ValueError(f"{p.uid} has no height yet: settle it before rendering")
        w = p.world_points(corners)
        lows.append(w.min(axis=0))
        highs.append(w.max(axis=0))
    return np.min(lows, axis=0), np.max(highs, axis=0)


def _ground_arrays(ground, centre_wb, half: float, out: Path) -> None:
    step = float(min(2.0, max(0.5, half / 90.0)))
    n = int(2 * half / step) + 1
    cx, cn = centre_wb[0], centre_wb[1]
    verts = []
    for i in range(n):
        for j in range(n):
            x = cx - half + j * step
            north = cn + half - i * step
            try:
                h = ground.chunk_height(x, -north)
            except ValueError:
                h = float("nan")
            verts.append([x, north, h])
    verts = np.array(verts)
    ok = np.isfinite(verts[:, 2])
    fill = np.nanmin(verts[:, 2]) if ok.any() else 0.0
    verts[~ok, 2] = fill
    faces = []
    for i in range(n - 1):
        for j in range(n - 1):
            a, b, c, d = i * n + j, i * n + j + 1, (i + 1) * n + j, (i + 1) * n + j + 1
            faces += [[a, c, b], [b, c, d]]
    wv, wf = [], []
    for i in range(n - 1):
        for j in range(n - 1):
            x = cx - half + (j + 0.5) * step
            north = cn + half - (i + 0.5) * step
            level = ground.water_level(x, -north)
            if level is None:
                continue
            k = len(wv)
            h = step / 2
            wv += [[x - h, north + h, level], [x + h, north + h, level],
                   [x + h, north - h, level], [x - h, north - h, level]]
            wf += [[k, k + 2, k + 1], [k, k + 3, k + 2]]
    np.savez(out, verts=verts, faces=np.array(faces, dtype=np.int64),
             water_verts=np.array(wv, dtype=float).reshape(-1, 3),
             water_faces=np.array(wf, dtype=np.int64).reshape(-1, 3))


def render(cat: Catalogue, scene: Scene, view: str, focus: list[str] | None = None,
           res: int = 1024, out: Path | None = None, span: float | None = None,
           bearing: float | None = None, cut: float = 0.0, samples: int = 12,
           highlight: list[str] | None = None, pitch: float = 32.0) -> dict:
    focus = focus or []
    ground = scene.ground()
    low, high = _frame(cat, scene, focus)
    centre = (low + high) / 2
    extent = float(max(high[0] - low[0], high[1] - low[1], high[2] - low[2], 4.0))
    span = float(span or extent * 1.35)
    out = Path(out or paths.OUTPUT / "renders" / Path(scene.path).stem / f"{view}.png")
    out.parent.mkdir(parents=True, exist_ok=True)
    if bearing is None:
        bearing = 0.0
        if focus and view in FRONT:
            p = scene.piece(focus[0])
            ent = (cat.interiors(p.asset) or {}).get("entrance") or {}
            side = ent.get("sideDeg")
            # look AT the entrance (camera on the entrance side), else at +y
            base = (p.yaw + (float(side) if side is not None else 0.0) + 180.0) % 360.0
            bearing = (base + FRONT[view]) % 360.0
        elif view in FRONT:
            bearing = FRONT[view]
    shots = []
    dist = span * 3 + 50
    if view == "top":
        rot = _look((0, 0, -1), up=(0, 1, 0))
        pos = centre + np.array([0, 0, dist])
        shots.append({"name": view, "ortho": True, "rot": rot, "pos": pos})
    elif view in FRONT or view == "cutaway":
        b = math.radians(bearing)
        d = np.array([math.sin(b), math.cos(b), 0.0])
        rot = _look(d)
        pos = centre - d * dist
        # half the focus depth along the view: terrain in front of it is
        # clipped so it never hides a base (the red cut line shows the ground)
        depth = float(np.max(np.abs((np.array([[x, y] for x in (low[0], high[0])
                                              for y in (low[1], high[1])]) - centre[:2])
                                    @ d[:2])))
        shot = {"name": view, "ortho": True, "rot": rot, "pos": pos, "target": centre,
                "clipStart": dist - depth - 1.5, "cutLine": True}
        if view == "cutaway":
            shot["clipStart"] = dist + cut
            shot["lights"] = [list(centre), list(centre - d * (0.5 * depth))]
        shots.append(shot)
    elif view in ("iso", "turntable"):
        bearings = [bearing + 45.0] if view == "iso" else [bearing + k * 45.0 for k in range(8)]
        for i, bb in enumerate(bearings):
            b, p_ = math.radians(bb), math.radians(pitch)
            d = np.array([math.sin(b) * math.cos(p_), math.cos(b) * math.cos(p_), -math.sin(p_)])
            pos = centre - d * (span * 1.25)
            shots.append({"name": f"{view}{i}", "ortho": False, "rot": _look(d), "pos": pos,
                          "bearing": bb % 360.0})
    else:
        raise ValueError(f"unknown view {view!r}")
    work = Path(tempfile.mkdtemp(prefix="wb-render-", dir=paths.OUTPUT))
    half = span * (0.75 if view == "top" else 1.6)
    _ground_arrays(ground, centre, half, work / "ground.npz")
    pieces = []
    for p in scene.pieces:
        got = cat.raw_glb(p.asset)
        if got is None or p.y is None:
            continue
        a, b = p.matrix()
        m = np.eye(4)
        m[:3, :3], m[:3, 3] = a, b
        tint = [0.95, 0.25, 0.85] if highlight and p.uid in highlight else None
        pieces.append({"glb": str(got[0]), "assetId": p.asset, "matrix": m.tolist(),
                       "tint": tint, "uid": p.uid})
    rx, ry = res, res if view in ("top",) else int(res * 0.75)
    job = {"res": [rx, ry], "samples": samples, "pieces": pieces,
           "ground": str(work / "ground.npz"), "shots": []}
    for i, s in enumerate(shots):
        target = work / f"{s['name']}.png"
        job["shots"].append({"ortho": s["ortho"], "orthoScale": span, "lens": LENS_MM,
                             "matrix": _camera(s["rot"], s["pos"]),
                             "clipStart": s.get("clipStart", 0.1), "clipEnd": dist * 3,
                             "lights": s.get("lights", []),
                             "res": [rx, ry], "out": str(target)})
    (work / "job.json").write_text(json.dumps(job))
    env = dict(os.environ, JOB=str(work / "job.json"))
    proc = subprocess.run([str(paths.LINUX_BLENDER), "-b", "--factory-startup", "--python",
                           str(paths.BLENDER_SCRIPT)], env=env, capture_output=True, text=True,
                          timeout=TIMEOUT_S)
    if proc.returncode != 0 or "[wb-render] done" not in proc.stdout:
        raise RuntimeError("render failed:\n" + proc.stdout[-4000:] + proc.stderr[-2000:])
    warnings = [l for l in proc.stdout.splitlines() if "[wb-render] warning" in l
                or "[wb-render] missing" in l]
    from PIL import Image
    images = []
    for s, js in zip(shots, job["shots"]):
        img = Image.open(js["out"]).convert("RGB")
        if s["ortho"]:
            _annotate_ortho(img, cat, scene, s, span, view, bearing, ground)
        else:
            _label_pieces(img, scene, _perspective_projector(img, s))
            _caption(img, f"{view} bearing {s['bearing']:.0f} deg, pitch {pitch:.0f} deg; "
                          f"grid 1 m, bright 5 m")
        images.append(img)
    if len(images) == 1:
        images[0].save(out)
    else:
        cols = 4
        rows = math.ceil(len(images) / cols)
        sheet = Image.new("RGB", (cols * rx, rows * ry), "white")
        for i, img in enumerate(images):
            sheet.paste(img, ((i % cols) * rx, (i // cols) * ry))
        sheet.save(out)
    return {"png": str(out), "view": view, "spanM": round(span, 2),
            "bearingDeg": round(bearing, 1), "pieces": len(pieces), "warnings": warnings,
            "pxPerM": round(rx / span, 2) if shots[0]["ortho"] else None}


def _font(size: int):
    from PIL import ImageFont
    for name in ("DejaVuSans-Bold.ttf", "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
                 "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _caption(img, text: str) -> None:
    from PIL import ImageDraw
    draw = ImageDraw.Draw(img)
    f = _font(max(12, img.width // 60))
    draw.rectangle([0, 0, img.width, f.size + 10], fill=(0, 0, 0))
    draw.text((8, 4), text, fill=(255, 255, 255), font=f)


def _perspective_projector(img, shot):
    """World (wb) -> pixel for a perspective shot (Blender's default 36 mm
    sensor, fit on the wider side)."""
    w, h = img.size
    f = LENS_MM / SENSOR_MM * w
    rot, pos = shot["rot"], shot["pos"]

    def project(p_wb):
        rel = np.asarray(p_wb) - pos
        x, y, z = rel @ rot[:, 0], rel @ rot[:, 1], rel @ rot[:, 2]
        if z >= -0.1:
            return (-1e6, -1e6)
        return (w / 2 + f * x / -z, h / 2 - f * y / -z)
    return project


def _label_pieces(img, scene, project) -> None:
    from PIL import ImageDraw
    draw = ImageDraw.Draw(img)
    w, h = img.size
    f = _font(max(11, w // 70))
    for p in scene.pieces:
        if p.y is None:
            continue
        x, y = project((p.x, -p.z, p.y))
        if -20 < x < w + 20 and -20 < y < h + 20:
            draw.line([(x - 6, y), (x + 6, y)], fill=(255, 0, 0), width=2)
            draw.line([(x, y - 6), (x, y + 6)], fill=(255, 0, 0), width=2)
            draw.text((x + 8, y - 8), p.uid, fill=(255, 255, 0), font=f,
                      stroke_width=2, stroke_fill=(0, 0, 0))


def _annotate_ortho(img, cat, scene, shot, span, view, bearing, ground) -> None:
    from PIL import ImageDraw
    draw = ImageDraw.Draw(img)
    w, h = img.size
    ppm = w / span
    rot, pos = shot["rot"], shot["pos"]

    def project(p_wb):
        rel = np.asarray(p_wb) - pos
        return (w / 2 + (rel @ rot[:, 0]) * ppm, h / 2 - (rel @ rot[:, 1]) * ppm)

    f = _font(max(11, w // 70))
    if shot.get("cutLine"):
        # the terrain profile in the vertical plane through the frame centre
        target = np.asarray(shot["target"], float)
        pts = []
        for k in np.linspace(-span / 2, span / 2, 240):
            q = target + rot[:, 0] * k
            try:
                gz = ground.chunk_height(q[0], -q[1])
            except ValueError:
                continue
            pts.append(project((q[0], q[1], gz)))
        if len(pts) > 1:
            draw.line(pts, fill=(255, 30, 30), width=3)
    if view == "top":
        for p in scene.pieces:
            poly = footprint_province(cat, p)
            pts = [project((x, -z, 0.0)) for x, z in poly]
            draw.line(pts + [pts[0]], fill=(0, 230, 255), width=2)
        for path in scene.paths:
            pts = [project((x, -z, 0.0)) for x, z in path["pointsM"]]
            draw.line(pts, fill=(255, 140, 0), width=max(2, int(path.get("widthM", 2) * ppm / 3)))
        draw.polygon([(w - 40, 60), (w - 50, 90), (w - 30, 90)], fill=(255, 255, 255))
        draw.text((w - 46, 36), "N", fill=(255, 255, 255), font=f)
    _label_pieces(img, scene, project)
    # scale bar: the largest of 1/2/5/10/20/50 m under a quarter of the width
    bar = max(v for v in (1, 2, 5, 10, 20, 50, 100) if v * ppm <= w / 4 or v == 1)
    x0, y0 = 20, h - 30
    draw.rectangle([x0, y0, x0 + bar * ppm, y0 + 8], fill=(255, 255, 255), outline=(0, 0, 0))
    for k in range(bar + 1):
        if bar <= 10 or k % 5 == 0:
            xx = x0 + k * ppm
            draw.line([(xx, y0 - 4), (xx, y0 + 8)], fill=(0, 0, 0), width=1)
    draw.text((x0, y0 - 24), f"{bar} m  ({ppm:.1f} px/m)", fill=(255, 255, 255), font=f,
              stroke_width=2, stroke_fill=(0, 0, 0))
    label = {"top": "plan, north up"}.get(view, f"{view}: camera looks toward {bearing:.0f} deg")
    _caption(img, f"{label}; span {span:.1f} m; grid 1 m, bright 5 m")
