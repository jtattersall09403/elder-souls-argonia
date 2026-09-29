"""Octahedral impostors for the far tier of heavy trees (walk-5 perf lane).

A derived LOD, never new art: the tree's own mesh and textures rendered from
a hemi-octahedral grid of directions (agargaro/octahedral-impostor, research
item 4 in tooling/.reports/16k/walk5/perf/research.md), the way the baked
cards are rendered from the mesh (`build_kit.bakes_own_card`).

    python3 -m pipeline.impostor_bake --kit flora-province-v1 \
        --assets <id,...> --out <dir> [--glb-dir <preview glbs>] [--publish]

Per asset: `blender/impostor_bake.py` renders N x N views (albedo, world
normal, alpha) in one Cycles render; this driver un-rotates the normals to
object space, writes an albedo+alpha atlas and a half-size object-space
normal atlas, packs both into a one-quad GLB and runs it through the kit's
gltfpack policy (`kit_compress.compress`: UASTC KTX2). `--publish` copies the
GLBs under `apps/world-studio/public/kits/<kit>-impostors/` and writes the
sidecar `<kit>.impostors.json` (the flora kit's own manifest is never
touched).

Judge (`judge`): the source's G-buffer rendered from 8 azimuths at 5 degrees
and 2 elevations (30, 60) at the impostor's hand-over pixel height, the
impostor reconstructed in numpy with the SAME frame selection and per-frame
projection as the runtime shader (game-core `vegetation/impostor.ts`), both
shaded by one Lambert sun + ambient. Bar (decision 0108 §5, lead walk 5):
the impostor's silhouette IoU on closed masks beats the species' baked card
(`card_iou`, same views, same masks) in EVERY view, and 2 Sonnet judges pass
its sheets (`<out>/<asset>/judges.json`); the 0.90 same-view bar is for mesh
tiers only. `--publish-only` publishes from an earlier run's rows once the
judges' file is written.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import shutil
import struct
import subprocess
from pathlib import Path

import numpy as np

from . import kit_compress, tree_tiers, tree_tiers_check as ttc

BLENDER = ttc.BLENDER
SCRIPT = Path(__file__).resolve().parent / "blender" / "impostor_bake.py"
PUBLIC = kit_compress.PUBLIC_KITS
SCHEMA_VERSION = 1
#: Frames per side of the hemi-octahedral grid, and pixels per albedo frame.
GRID = 12
FRAME_PX = 192
#: The normal atlas is half the albedo's resolution (lighting only).
NORMAL_DIV = 2
#: The frame's cell is the largest projected extent over all views, padded
#: for view directions between the baked ones.
CELL_PAD = 1.04
#: Fixed-point steps walking a view ray onto a frame's depth surface.
PARALLAX_STEPS = 2
PARALLAX_MIN_COS = 0.2
JUDGE_AZIMUTHS = 8
JUDGE_LOW_ELEV_DEG = 5.0
JUDGE_ELEVATIONS_DEG = (30.0, 60.0)
SUN = np.array([0.45, 0.75, 0.48])
SUN = SUN / np.linalg.norm(SUN)
AMBIENT, SUN_GAIN = 0.4, 0.85


# --- the shared geometry (mirrored in game-core vegetation/impostor.ts) ------

def frame_basis(d: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """right = normalize(Y x d) (X where d is vertical), up = d x right."""
    r = np.array([d[2], 0.0, -d[0]])
    n = np.linalg.norm(r)
    r = np.array([1.0, 0.0, 0.0]) if n < 1e-6 else r / n
    return r, np.cross(d, r)


def grid_dir(i: int, j: int, n: int = GRID) -> np.ndarray:
    """Direction of frame (i, j) on the hemi-octahedron (vertex spacing, so
    the grid border is the horizon)."""
    gx, gy = i / (n - 1) * 2 - 1, j / (n - 1) * 2 - 1
    px, pz = (gx + gy) / 2, (gx - gy) / 2
    y = 1 - abs(px) - abs(pz)
    d = np.array([px, max(y, 0.0), pz])
    return d / np.linalg.norm(d)


def select_frames(v: np.ndarray, n: int = GRID):
    """The three frames around view direction `v` and their weights."""
    v = np.array([v[0], max(v[1], 0.0) + 1e-5, v[2]], dtype=float)
    s = abs(v[0]) + v[1] + abs(v[2])
    px, pz = v[0] / s, v[2] / s
    g = np.array([px + pz, px - pz])
    grid = (g * 0.5 + 0.5) * (n - 1)
    cell = np.clip(np.floor(grid), 0, n - 2)
    f = grid - cell
    c = cell.astype(int)
    h = (n - 1) / 2
    if (c[0] + 0.5 - h) * (c[1] + 0.5 - h) > 0:
        # Quadrants toward grid corners (0,0) and (n-1,n-1): split the cell
        # along its main diagonal, so the grid's main diagonal (the +-X
        # azimuths) is a triangle edge the way the anti-diagonal (+-Z) is
        # elsewhere. One split everywhere left a +-X horizon view to two
        # frames 5.7 degrees off-axis with the on-axis frame at weight 0.12.
        if f[0] >= f[1]:
            frames = [(c[0], c[1]), (c[0] + 1, c[1] + 1), (c[0] + 1, c[1])]
            w = [1 - f[0], f[1], f[0] - f[1]]
        else:
            frames = [(c[0], c[1]), (c[0] + 1, c[1] + 1), (c[0], c[1] + 1)]
            w = [1 - f[1], f[0], f[1] - f[0]]
    elif f[0] + f[1] < 1:
        frames = [(c[0], c[1]), (c[0] + 1, c[1]), (c[0], c[1] + 1)]
        w = [1 - f[0] - f[1], f[0], f[1]]
    else:
        frames = [(c[0] + 1, c[1] + 1), (c[0] + 1, c[1]), (c[0], c[1] + 1)]
        w = [f[0] + f[1] - 1, 1 - f[1], 1 - f[0]]
    return frames, np.array(w)


def grid_dirs(n: int = GRID) -> list[np.ndarray]:
    """Row-major: index j * n + i (atlas row j from the top, column i)."""
    return [grid_dir(i, j, n) for j in range(n) for i in range(n)]


def cell_size(verts: np.ndarray, centre: np.ndarray, dirs) -> float:
    rel = verts - centre
    ext = 0.0
    for d in dirs:
        r, u = frame_basis(d)
        ext = max(ext, float(np.abs(rel @ r).max()), float(np.abs(rel @ u).max()))
    return 2 * ext * CELL_PAD


# --- source -----------------------------------------------------------------

def source_vertices(glb: Path) -> np.ndarray:
    gltf, blob = tree_tiers.load_glb(glb)
    root = next(i for i, n in enumerate(gltf["nodes"]) if n.get("name") == "source")
    pts = []
    for c in gltf["nodes"][root]["children"]:
        for prim in gltf["meshes"][gltf["nodes"][c]["mesh"]]["primitives"]:
            pts.append(tree_tiers.accessor(gltf, blob, prim["attributes"]["POSITION"]))
    return np.concatenate(pts).astype(float)


def blender_views(glb: Path, dirs, cell_m: float, cell_px: int, cols: int, out: Path,
                  samples: int = 8) -> dict:
    out.mkdir(parents=True, exist_ok=True)
    job = out / "job.json"
    job.write_text(json.dumps({"glb": str(glb), "outDir": str(out),
                               "dirs": [list(map(float, d)) for d in dirs], "cols": cols,
                               "cellM": cell_m, "cellPx": cell_px, "samples": samples}))
    proc = subprocess.run([str(BLENDER), "-b", "--python", str(SCRIPT), "--", str(job)],
                          capture_output=True, text=True)
    if proc.returncode != 0 or not (out / "bounds.json").exists():
        raise RuntimeError(f"blender failed:\n{proc.stdout[-3000:]}{proc.stderr[-2000:]}")
    bounds = json.loads((out / "bounds.json").read_text())
    albedo, normal, alpha, depth = (np.load(out / f"{k}.npy")
                                    for k in ("albedo", "normal", "alpha", "depth"))
    a = alpha[..., 0]
    # Depth along the view direction (toward the viewer) from the cell's
    # centre plane, as a share of the cell: 0.5 is the plane through the
    # frame centre.
    dep = np.clip((bounds["far"] - depth[..., 0]) / cell_m + 0.5, 0, 1)
    cells = []
    for k in range(len(dirs)):
        col, row = k % cols, k // cols
        sl = (slice(row * cell_px, (row + 1) * cell_px), slice(col * cell_px, (col + 1) * cell_px))
        ca = a[sl]
        cov = np.maximum(ca, 1e-6)[..., None]
        alb = np.where(ca[..., None] > 1e-3, albedo[sl][..., :3] / cov, 0.0)
        M = np.array(bounds["rotations"][k])
        nb = normal[sl][..., :3] @ M          # M^T n, row vectors
        ng = np.stack([nb[..., 0], nb[..., 2], -nb[..., 1]], -1)
        ng = ng / np.maximum(np.linalg.norm(ng, axis=-1, keepdims=True), 1e-6)
        cells.append({"albedo": np.clip(alb, 0, 1), "normal": ng, "alpha": np.clip(ca, 0, 1),
                      "depth": np.where(ca > 0.5, dep[sl], 0.5)})
    return {"cells": cells, "bounds": bounds}


# --- atlas ------------------------------------------------------------------

def to_srgb(x: np.ndarray) -> np.ndarray:
    x = np.clip(x, 0, 1)
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)


def from_srgb(x: np.ndarray) -> np.ndarray:
    return np.where(x <= 0.04045, x / 12.92, np.power((x + 0.055) / 1.055, 2.4))


def dilate(rgb: np.ndarray, mask: np.ndarray, steps: int = 8) -> np.ndarray:
    """Bleed covered colour into the transparent texels (no dark fringe at the
    alpha edge under bilinear filtering and mips)."""
    from scipy import ndimage
    rgb, have = rgb.copy(), mask.copy()
    for _ in range(steps):
        grown = ndimage.binary_dilation(have)
        new = grown & ~have
        if not new.any():
            break
        acc = np.zeros_like(rgb)
        cnt = np.zeros(have.shape)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                sh = np.roll(np.roll(have, dy, 0), dx, 1)
                acc += np.roll(np.roll(rgb, dy, 0), dx, 1) * sh[..., None]
                cnt += sh
        rgb[new] = acc[new] / np.maximum(cnt[new], 1)[..., None]
        have = grown
    return rgb


def atlases(cells: list[dict], n: int, px: int):
    from PIL import Image
    alb = np.zeros((n * px, n * px, 4))
    nrm = np.zeros((n * px, n * px, 3))
    dep = np.zeros((n * px, n * px))
    for k, c in enumerate(cells):
        i, j = k % n, k // n
        sl = (slice(j * px, (j + 1) * px), slice(i * px, (i + 1) * px))
        m = c["alpha"] > 0.02
        alb[sl][..., :3] = dilate(c["albedo"], m)
        alb[sl][..., 3] = c["alpha"]
        nn = dilate(c["normal"], m)
        nrm[sl] = nn * 0.5 + 0.5
        dep[sl] = dilate(c["depth"][..., None], c["alpha"] > 0.5, 24)[..., 0]
    albedo = Image.fromarray((np.dstack([to_srgb(alb[..., :3]), alb[..., 3:]]) * 255 + 0.5)
                             .astype(np.uint8), "RGBA")
    half = n * px // NORMAL_DIV
    normal = Image.fromarray((np.clip(nrm, 0, 1) * 255 + 0.5).astype(np.uint8), "RGB") \
        .resize((half, half), Image.BILINEAR)
    depth = Image.fromarray((np.clip(dep, 0, 1) * 255 + 0.5).astype(np.uint8), "L") \
        .resize((half, half), Image.BILINEAR)
    return albedo, normal, depth


def quad_glb(albedo_png: bytes, normal_png: bytes, depth_png: bytes, name: str,
             path: Path) -> None:
    """One quad (the runtime builds its own; this carries the three atlases
    through gltfpack as base colour, normal and occlusion textures: the
    occlusion slot's red channel is the depth atlas)."""
    pos = np.array([[-.5, -.5, 0], [.5, -.5, 0], [.5, .5, 0], [-.5, .5, 0]], np.float32)
    nor = np.array([[0, 0, 1]] * 4, np.float32)
    uv = np.array([[0, 1], [1, 1], [1, 0], [0, 0]], np.float32)
    idx = np.array([0, 1, 2, 0, 2, 3], np.uint16)
    parts = [pos.tobytes(), nor.tobytes(), uv.tobytes(), idx.tobytes()]
    pad = lambda b: b + b"\0" * (-len(b) % 4)
    blob, views, off = b"", [], 0
    for p in parts + [albedo_png, normal_png, depth_png]:
        views.append({"buffer": 0, "byteOffset": off, "byteLength": len(p)})
        blob += pad(p)
        off = len(blob)
    gltf = {
        "asset": {"version": "2.0", "generator": "es impostor_bake"},
        "scene": 0, "scenes": [{"nodes": [0]}],
        "nodes": [{"name": name, "mesh": 0, "extras": {"impostor": True}}],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0, "NORMAL": 1, "TEXCOORD_0": 2},
                                    "indices": 3, "material": 0}]}],
        "materials": [{"name": "impostor", "alphaMode": "MASK", "alphaCutoff": 0.5,
                       "pbrMetallicRoughness": {"baseColorTexture": {"index": 0},
                                                "metallicFactor": 0, "roughnessFactor": 1},
                       "normalTexture": {"index": 1}, "occlusionTexture": {"index": 2}}],
        "textures": [{"source": 0}, {"source": 1}, {"source": 2}],
        "images": [{"bufferView": 4, "mimeType": "image/png"},
                   {"bufferView": 5, "mimeType": "image/png"},
                   {"bufferView": 6, "mimeType": "image/png"}],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": 4, "type": "VEC3",
             "min": [-.5, -.5, 0], "max": [.5, .5, 0]},
            {"bufferView": 1, "componentType": 5126, "count": 4, "type": "VEC3"},
            {"bufferView": 2, "componentType": 5126, "count": 4, "type": "VEC2"},
            {"bufferView": 3, "componentType": 5123, "count": 6, "type": "SCALAR"}],
        "buffers": [{"byteLength": len(blob)}],
        "bufferViews": views,
    }
    tree_tiers.save_glb(path, gltf, blob)


# --- impostor reconstruction (the runtime shader, in numpy) -----------------

def _bilinear(img: np.ndarray, u: np.ndarray, v: np.ndarray) -> np.ndarray:
    h, w = img.shape[:2]
    x, y = u * w - 0.5, v * h - 0.5
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    fx, fy = (x - x0)[..., None], (y - y0)[..., None]
    def at(yy, xx):
        return img[np.clip(yy, 0, h - 1), np.clip(xx, 0, w - 1)]
    return (at(y0, x0) * (1 - fx) * (1 - fy) + at(y0, x0 + 1) * fx * (1 - fy)
            + at(y0 + 1, x0) * (1 - fx) * fy + at(y0 + 1, x0 + 1) * fx * fy)


def reconstruct(albedo: np.ndarray, normal: np.ndarray, depth: np.ndarray, view: np.ndarray,
                cell_m: float, res: int, n: int = GRID, steps: int = PARALLAX_STEPS):
    """Impostor seen along `view` (toward the viewer), orthographic, on a
    res x res image spanning one cell. Returns (linear albedo, normal, alpha).
    Per frame, the pixel's view ray is walked onto the frame's depth surface
    (`steps` fixed-point steps from the centre plane) before the taps."""
    v = view / np.linalg.norm(view)
    rv, uv_ = frame_basis(v)
    t = (np.arange(res) + 0.5) / res - 0.5
    xx, yy = np.meshgrid(t, -t)
    P = (xx[..., None] * rv + yy[..., None] * uv_) * cell_m
    frames, w = select_frames(v, n)
    acc_c, acc_n, acc_a = 0.0, 0.0, 0.0
    for (i, j), wk in zip(frames, w):
        dk = grid_dir(i, j, n)
        r, u = frame_basis(dk)
        x0, y0, z0 = P @ r / cell_m, P @ u / cell_m, P @ dk / cell_m
        vr, vu, vd = v @ r, v @ u, max(float(v @ dk), PARALLAX_MIN_COS)
        t = np.zeros_like(x0)
        for _ in range(steps):
            fu, fv = x0 - t * vr + 0.5, y0 - t * vu + 0.5
            dm = _bilinear(depth[..., None], (i + np.clip(fu, 0, 1)) / n,
                           (j + 1 - np.clip(fv, 0, 1)) / n)[..., 0] - 0.5
            t = (z0 - dm) / vd
        fu, fv = x0 - t * vr + 0.5, y0 - t * vu + 0.5
        inside = ((fu >= 0) & (fu <= 1) & (fv >= 0) & (fv <= 1))[..., None]
        au, av = (i + fu) / n, (j + 1 - fv) / n
        s = _bilinear(albedo, au, av) * inside
        nn = _bilinear(normal, au, av) * inside
        a = s[..., 3:4] * wk
        acc_c = acc_c + s[..., :3] * a
        acc_n = acc_n + nn * a
        acc_a = acc_a + a
    col = acc_c / np.maximum(acc_a, 1e-6)
    nrm = acc_n / np.maximum(np.linalg.norm(acc_n, axis=-1, keepdims=True), 1e-6)
    return col, nrm, acc_a[..., 0]


def shade(albedo_lin, normal, alpha) -> np.ndarray:
    lit = albedo_lin * (AMBIENT + SUN_GAIN * np.clip(normal @ SUN, 0, 1))[..., None]
    rgb = to_srgb(lit)
    bg = np.array([0.55, 0.6, 0.66])
    m = (alpha > 0.5)[..., None]
    return np.where(m, rgb, bg)


def judge_dirs() -> list[np.ndarray]:
    out = []
    for k in range(JUDGE_AZIMUTHS):
        az = 2 * math.pi * k / JUDGE_AZIMUTHS
        el = math.radians(JUDGE_LOW_ELEV_DEG)
        out.append(np.array([math.sin(az) * math.cos(el), math.sin(el), math.cos(az) * math.cos(el)]))
    for e in JUDGE_ELEVATIONS_DEG:
        el = math.radians(e)
        out.append(np.array([math.sin(0.6) * math.cos(el), math.sin(el), math.cos(0.6) * math.cos(el)]))
    return out


def sweep_dirs(count: int = 12, span_deg: float = 33.0) -> list[np.ndarray]:
    """Azimuth sweep at 5 degrees elevation across three horizon frames, for
    the 'no frame popping' read."""
    el = math.radians(JUDGE_LOW_ELEV_DEG)
    return [np.array([math.sin(a) * math.cos(el), math.sin(el), math.cos(a) * math.cos(el)])
            for a in np.radians(np.linspace(10, 10 + span_deg, count))]


def content_px(height_m: float, cell_m: float, frame_px: int = FRAME_PX) -> float:
    """The tree's height in albedo texels in a horizon frame."""
    return frame_px * height_m / cell_m


def judge(glb: Path, albedo: np.ndarray, normal: np.ndarray, depth: np.ndarray, cell_m: float,
          height_m: float, out: Path, samples: int = 8, n: int = GRID,
          frame_px: int = FRAME_PX) -> dict:
    from PIL import Image
    px = int(round(min(content_px(height_m, cell_m, frame_px), 935.3 * height_m
                       / min(140.0, max(30.0, 5 * height_m)))))
    res = max(32, int(round(px * cell_m / height_m)))
    dirs = judge_dirs()
    sweep = sweep_dirs()
    src = blender_views(glb, dirs + sweep, cell_m, res, len(dirs), out / "src", samples)["cells"]
    radius = max(1, int(round(px * ttc.SILHOUETTE_CLOSE)))
    rows_src, rows_imp, sil, ratios = [], [], [], []
    for k, d in enumerate(dirs):
        s = src[k]
        col, nrm, a = reconstruct(albedo, normal, depth, d, cell_m, res, n)
        ma, mb = s["alpha"] > 0.5, a > 0.5
        sil.append(ttc.iou(ttc.closed(ma, radius), ttc.closed(mb, radius)))
        ratios.append(float(mb.sum() / max(ma.sum(), 1)))
        rows_src.append(shade(s["albedo"], s["normal"], s["alpha"]))
        rows_imp.append(shade(col, nrm, a))
    sweep_imp, sweep_src, pops = [], [], []
    prev = None
    for k, d in enumerate(sweep):
        col, nrm, a = reconstruct(albedo, normal, depth, d, cell_m, res, n)
        sweep_imp.append(shade(col, nrm, a))
        s = src[len(dirs) + k]
        sweep_src.append(shade(s["albedo"], s["normal"], s["alpha"]))
        m = ttc.closed(a > 0.5, radius)
        if prev is not None:
            pops.append(1 - ttc.iou(prev, m))
        prev = m
    def strip(imgs):
        return np.concatenate([np.pad(i, ((4, 4), (4, 4), (0, 0)), constant_values=1) for i in imgs], 1)
    views = np.concatenate([strip(rows_src), strip(rows_imp)], 0)
    Image.fromarray((views * 255).astype(np.uint8)).save(out / "sheet-views.png")
    sw = np.concatenate([strip(sweep_src), strip(sweep_imp)], 0)
    Image.fromarray((sw * 255).astype(np.uint8)).save(out / "sheet-sweep.png")
    # neighbour-step change on the SOURCE too: the popping floor
    src_steps = [1 - ttc.iou(ttc.closed(src[len(dirs) + k - 1]["alpha"] > 0.5, radius),
                             ttc.closed(src[len(dirs) + k]["alpha"] > 0.5, radius))
                 for k in range(1, len(sweep))]
    result = {"px": px, "res": res, "closeRadiusPx": radius,
              "silhouetteIou": [round(x, 3) for x in sil],
              "coverageRatio": [round(x, 3) for x in ratios],
              "iouMin": round(min(sil), 3), "worstLoss": round(1 - min(ratios), 3),
              "sweepStepChange": [round(x, 3) for x in pops],
              "sourceSweepStepChange": [round(x, 3) for x in src_steps],
              "pass": min(sil) >= ttc.IOU_MIN and 1 - min(ratios) <= ttc.VIEW_LOSS_MAX}
    (out / "judge.json").write_text(json.dumps(result, indent=1))
    return result


def card_iou(kit_glb: Path, asset_id: str, out: Path, cell_m: float, centre, res: int,
             radius: int, samples: int = 32) -> list[float]:
    """Silhouette IoU of the species' baked CARD against the source, per judge
    view, on the same masks as `judge` (its `judge/src/alpha.npy`): the
    number the impostor must beat in every view (decision 0108 §5, lead walk
    5). The card is rendered centred on its own bounds, so its mask is moved
    by the centre difference before the comparison."""
    gltf, blob = tree_tiers.load_glb(kit_glb)
    root = tree_tiers.asset_roots(gltf)[asset_id]
    cards = [c for c in gltf["nodes"][root]["children"]
             if (gltf["nodes"][c].get("extras") or {}).get("billboard")]
    if not cards:
        return []
    gltf["nodes"].append({"name": "source", "children": cards})
    gltf["scenes"] = [{"nodes": [len(gltf["nodes"]) - 1]}]
    gltf["scene"] = 0
    sub, sub_blob = tree_tiers.compact(gltf, blob)
    card_glb = out / "card.glb"
    tree_tiers.save_glb(card_glb, sub, sub_blob)
    dirs = judge_dirs()
    cells = blender_views(card_glb, dirs, cell_m, res, len(dirs), out / "card", samples)["cells"]
    src = np.load(out / "judge" / "src" / "alpha.npy")[..., 0]
    bc = json.loads((out / "card" / "bounds.json").read_text())["centre"]
    delta = np.asarray(centre, float) - np.asarray(bc, float)
    ious = []
    for k, d in enumerate(dirs):
        right, up = frame_basis(d)
        shift = (int(round(-(delta @ up) / cell_m * res)), int(round((delta @ right) / cell_m * res)))
        cm = np.roll(np.roll(cells[k]["alpha"] > 0.5, -shift[0], 0), -shift[1], 1)
        sm = src[0:res, k * res:(k + 1) * res] > 0.5
        ious.append(round(ttc.iou(ttc.closed(sm, radius), ttc.closed(cm, radius)), 3))
    return ious


def beats_card(impostor_iou: list[float], card_ious: list[float]) -> bool:
    """The far stand-in bar (decision 0108 §5): the impostor's silhouette IoU
    beats the card it replaces in EVERY view. The 0.90 same-view bar is for
    mesh tiers only."""
    return bool(card_ious) and len(card_ious) == len(impostor_iou) and all(
        i > c for i, c in zip(impostor_iou, card_ious))


JUDGES_FILE = "judges.json"


def judges_passed(asset_dir: Path) -> str | None:
    """None when `<asset dir>/judges.json` holds 2+ Sonnet verdicts, all PASS,
    on this bake's sheets, else why not. File: {"judges": [{"verdict":
    "PASS"|"FAIL", "note": ...}, ...]}."""
    path = asset_dir / JUDGES_FILE
    if not path.exists():
        return f"no {JUDGES_FILE} in {asset_dir}"
    verdicts = [j.get("verdict") for j in json.loads(path.read_text()).get("judges") or []]
    if len(verdicts) < ttc.JUDGES_MIN or any(v != "PASS" for v in verdicts):
        return f"{path} verdicts {verdicts} (need {ttc.JUDGES_MIN}+ PASS, no FAIL)"
    return None


# --- driver -----------------------------------------------------------------

def safe_id(asset_id: str) -> str:
    return asset_id.replace(":", "__").replace("/", "_")


def bake(asset_id: str, glb: Path, height_m: float, out: Path, samples: int = 8,
         n: int = GRID, frame_px: int = FRAME_PX, kit_glb: Path | None = None) -> dict:
    from PIL import Image
    verts = source_vertices(glb)
    lo, hi = verts.min(0), verts.max(0)
    centre = (lo + hi) / 2
    dirs = grid_dirs(n)
    cell_m = cell_size(verts, centre, dirs + judge_dirs())
    res = blender_views(glb, dirs, cell_m, frame_px, n, out / "grid", samples)
    albedo_img, normal_img, depth_img = atlases(res["cells"], n, frame_px)
    albedo_img.save(out / "albedo.png")
    normal_img.save(out / "normal.png")
    depth_img.save(out / "depth.png")
    albedo = np.asarray(albedo_img).astype(float) / 255
    albedo = np.dstack([from_srgb(albedo[..., :3]), albedo[..., 3:]])
    normal = np.asarray(normal_img).astype(float) / 255 * 2 - 1
    depth = np.asarray(depth_img).astype(float) / 255
    result = judge(glb, albedo, normal, depth, cell_m, height_m, out / "judge", samples, n,
                   frame_px)
    if kit_glb is not None:
        result["cardIou"] = card_iou(kit_glb, asset_id, out, cell_m, centre, result["res"],
                                     result["closeRadiusPx"], samples)
    result["pass"] = beats_card(result["silhouetteIou"], result.get("cardIou") or [])
    (out / "judge" / "judge.json").write_text(json.dumps(result, indent=1))
    raw = out / f"{safe_id(asset_id)}.raw.glb"
    quad_glb(*((out / f"{k}.png").read_bytes() for k in ("albedo", "normal", "depth")),
             safe_id(asset_id), raw)
    packed = out / f"{safe_id(asset_id)}.glb"
    record = kit_compress.compress(raw, packed, {**kit_compress.DEFAULT_POLICY, "enabled": True})
    return {"id": asset_id, "file": packed.name, "grid": n, "framePx": frame_px,
            "normalFramePx": frame_px // NORMAL_DIV, "cellM": round(cell_m, 4),
            "centreM": [round(float(x), 4) for x in centre],
            "boundsM": [[round(float(x), 4) for x in lo], [round(float(x), 4) for x in hi]],
            "contentPx": round(content_px(hi[1] - lo[1], cell_m, frame_px), 1),
            "bytes": record["bytesAfter"], "sha256": record["sha256"],
            "judge": {k: result.get(k) for k in ("px", "iouMin", "worstLoss", "cardIou", "pass")}}


def publish(kit_id: str, rows: list[dict], out: Path) -> Path:
    dest_dir = PUBLIC / f"{kit_id}-impostors"
    dest_dir.mkdir(parents=True, exist_ok=True)
    side = PUBLIC / f"{kit_id}.impostors.json"
    have = json.loads(side.read_text())["impostors"] if side.exists() else []
    keep = {r["id"]: r for r in have}
    for r in rows:
        shutil.copy(out / safe_id(r["id"]) / r["file"], dest_dir / r["file"])
        keep[r["id"]] = {**r, "path": f"{kit_id}-impostors/{r['file']}"}
    side.write_text(json.dumps({
        "schemaVersion": SCHEMA_VERSION, "kit": kit_id,
        "derivation": "rendered from the kit's own source mesh and textures "
                      "(pipeline/impostor_bake.py); no new art",
        "frameBasis": "right = normalize(cross(Y, d)), up = cross(d, right); glTF object space",
        "grid": "hemi-octahedral, vertex spacing (border = horizon), atlas row j from the top",
        "impostors": [keep[k] for k in sorted(keep)]}, indent=1) + "\n")
    return side


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--kit", default="flora-province-v1")
    ap.add_argument("--assets", required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--glb-dir", type=Path, help="existing tree_tiers.preview GLBs")
    ap.add_argument("--samples", type=int, default=32)
    ap.add_argument("--grid", type=int, default=GRID)
    ap.add_argument("--frame-px", type=int, default=FRAME_PX)
    ap.add_argument("--publish", action="store_true",
                    help="publish only assets that beat their card in every view and "
                         "carry 2 Sonnet PASS verdicts in <out>/<asset>/judges.json")
    ap.add_argument("--publish-only", action="store_true",
                    help="no bake: publish from the row.json files an earlier run wrote")
    a = ap.parse_args()
    if a.publish_only:
        rows = [json.loads((a.out / safe_id(i) / "row.json").read_text())
                for i in a.assets.split(",")]
        publish_passing(a.kit, rows, a.out)
        return
    kit = json.loads((tree_tiers.CONFIG / f"{a.kit}.json").read_text())
    manifest = json.loads((PUBLIC / f"{a.kit}.kit.json").read_text())
    heights = {x["id"]: x["sizeM"][2] for x in manifest["assets"]}
    rows = []
    for asset_id in a.assets.split(","):
        out = a.out / safe_id(asset_id)
        glb = (a.glb_dir or a.out / "glb") / f"{safe_id(asset_id)}.glb"
        if not glb.exists():
            src = (tree_tiers.REPO_ROOT / kit["output"]).resolve()
            tree_tiers.preview(src, [asset_id], glb.parent, kit)
        row = bake(asset_id, glb, heights[asset_id], out, a.samples, a.grid, a.frame_px,
                   kit_glb=(tree_tiers.REPO_ROOT / kit["output"]).resolve())
        (out / "row.json").write_text(json.dumps(row, indent=1))
        print(json.dumps(row))
        rows.append(row)
    if a.publish:
        publish_passing(a.kit, rows, a.out)


def publish_passing(kit_id: str, rows: list[dict], out: Path) -> None:
    passing = []
    for r in rows:
        why = None if r["judge"]["pass"] else "does not beat its card in every view"
        why = why or judges_passed(out / safe_id(r["id"]))
        print(f"{r['id']}: {'PUBLISH' if why is None else 'held: ' + why}")
        if why is None:
            passing.append(r)
    if passing:
        print("published", publish(kit_id, passing, out))


if __name__ == "__main__":
    main()
