"""Build the beyond-border apron: the land past the province's four edges (16d B2).

A chain stage (after `rebake_landcover`, before `rederive_blueprints`). It
reads the two crops `extract_apron_source` cut from the all-Tamriel
heightmap (B1; never the 670 MB PNG), the frozen+patched province heights
(`DEFAULT_HEIGHTS`), the province's exported border chunks and its ground
paint, and writes under `apps/world-studio/public/province/apron/`:

* ring 0 — 68 chunk tiles in the province chunk format (RG16 PNG per LOD
  1/2/4), one chunk deep around the province, so `ChunkTerrain` draws them
  with the same LOD rule and the border seam is an ordinary chunk seam;
* ring 1 — one square tile at 29.25 m (every 16th sample of the ring-1 box);
* ring 2 — one tile at 116.98 m to the map's edge (the far crop);
* the ground paint for the near (ring 0+1) and far (ring 2) sets, the
  province's own `compile_ground_control` rules with the border texels
  dithered to the province's edge texels;
* `apron-manifest.json` (committed; the PNGs are release artefacts).

The apron height is one line everywhere (brief 16d, Part B):

    h_apron(x, z) = canon(x, z) + delta(nearest border cell) * w(d)
    delta(cell)   = DEFAULT_HEIGHTS(cell) - canon(cell)
    w(d)          = 1 - smoothstep(0, 6000 m, d),  d = distance to the square

so the join is by construction (h_apron = DEFAULT_HEIGHTS at d = 0) and the
map's own ground is reached 6 km out. Seams between rings are exact by
construction too: ring 0's outer edge is piecewise linear between ring 1's
samples (knots every 16 samples), ring 1's outer edge between ring 2's
(every 4 of its samples), at every LOD, so the coarser ring meets the finer
one at every knot.

Deterministic: same inputs give byte-identical PNGs.

Usage: python3 -m worldgen.build_border_apron
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage
from scipy.special import ndtr

from .compile_chunks import CHUNK, DEFAULT_HEIGHTS, LODS, REPO_ROOT
from .export_web_chunks import GRADIENT_CLAMP, OUT_DIR as CHUNKS_DIR, decode_rg16, encode_rg16
from .extract_apron_source import (FAR_BLOCK, FAR_PATH, META_PATH as SOURCE_META_PATH,
                                   NEAR_PAD, NEAR_PATH, PNG_COL_SW, PNG_ROW_SW)
from .landcover import compile_ground_control
from .position_noise import white_field
from .regions import REGION_CLASSES
from .scale import RAW_M, SOURCE_GRID_SAMPLES, TERRAIN_SUPPORT_EXTENT_M
from .shape_province import SEED

PROVINCE_DIR = REPO_ROOT / "apps" / "world-studio" / "public" / "province"
OUT_DIR = PROVINCE_DIR / "apron"
RING0_DIR = OUT_DIR / "ring0"
MANIFEST_PATH = OUT_DIR / "apron-manifest.json"

N = SOURCE_GRID_SAMPLES          # 4033 province samples per axis
LAST = N - 1                     # 4032, the province's last sample index
E = TERRAIN_SUPPORT_EXTENT_M     # 7369.85088 m, the east/south border
NEAR_N = N + 2 * NEAR_PAD        # 5313, the ring-1 box
R0_OFF = NEAR_PAD - CHUNK        # 384: the ring-0 box's offset in the near crop
R0_N = N + 2 * CHUNK             # 4545: the ring-0 (extended) box
R1_STEP = 16                     # ring 1 pitch in samples (29.25 m)
R2_STEP = FAR_BLOCK              # ring 2 pitch in samples (116.98 m)
BAKE_STEP = 4                    # near paint pitch in samples (7.31 m)
R1_PITCH_M = R1_STEP * RAW_M
R2_PITCH_M = R2_STEP * RAW_M
BAKE_PITCH_M = BAKE_STEP * RAW_M
BLEND_M = 6000.0
PAINT_BLEND_M = 1500.0
NODATA_M = -40.0                 # seabed where the map has no data
NEUTRAL_TINT = 127               # the province tint writes 1.0 as 127
HYDRO_N = 1345                   # region raster texels per axis

# The far (whole-map) frame, north-up: province row 0 / col 0 in map samples.
MAP_ROWS = 16384
PROV_ROW0 = (MAP_ROWS - 1 - PNG_ROW_SW) - LAST     # 8958
PROV_COL0 = PNG_COL_SW                             # 11788
# Ring 2: 320 x 256 samples on the far pitch, west 174 / north 129 of ring 1.
R2_WEST, R2_NORTH = 174, 129
R2_NX, R2_NY = 320, 256
R2_INNER = NEAR_N // R2_STEP + 1                    # 84 samples cover ring 1
R2_ROW0 = PROV_ROW0 - NEAR_PAD - R2_NORTH * R2_STEP  # 62, map row of ring 2 sample 0
R2_COL0 = PROV_COL0 - NEAR_PAD - R2_WEST * R2_STEP   # 12
R1_ORIGIN_M = -NEAR_PAD * RAW_M
R2_ORIGIN_M = (R1_ORIGIN_M - R2_WEST * R2_PITCH_M, R1_ORIGIN_M - R2_NORTH * R2_PITCH_M)


def smoothstep(edge0: float, edge1: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def square_distance_m(rows: np.ndarray, cols: np.ndarray) -> np.ndarray:
    """Distance (m) from fine-sample coordinates to the province square."""
    dr = np.maximum(np.maximum(-rows, rows - LAST), 0.0)
    dc = np.maximum(np.maximum(-cols, cols - LAST), 0.0)
    return np.hypot(dr, dc) * RAW_M


def apron_height(canon: np.ndarray, rows: np.ndarray, cols: np.ndarray,
                 heights: np.ndarray, near: np.ndarray) -> np.ndarray:
    """h_apron at fine coordinates (rows, cols): canon + delta(nearest border cell) * w(d)."""
    rc = np.clip(np.rint(rows), 0, LAST).astype(np.int64)
    cc = np.clip(np.rint(cols), 0, LAST).astype(np.int64)
    delta = heights[rc, cc].astype(np.float64) - near[rc + NEAR_PAD, cc + NEAR_PAD]
    w = 1.0 - smoothstep(0.0, BLEND_M, square_distance_m(rows, cols))
    # float64 so that canon + (heights - canon) * 1 is heights exactly at d = 0.
    return (canon.astype(np.float64) + delta * w).astype(np.float32)


def linearised(edge: np.ndarray, knot_step: int, lod: int) -> np.ndarray:
    """A LOD-1 edge resampled at LOD `lod`, piecewise linear between its knots."""
    n = edge.shape[0]
    knots = np.arange(0, n, knot_step)
    positions = np.arange(0, n, lod)
    return np.interp(positions, knots, edge[knots]).astype(np.float32)


def ring0_span(c: int) -> tuple[int, int]:
    """[start, stop) of ring-0 cell `c` (-1..16) along one axis of the extended box."""
    if c == -1:
        return 0, CHUNK + 1
    start = CHUNK + c * CHUNK
    if c == 16:
        return CHUNK + LAST, R0_N
    return start, min(start + CHUNK + 1, CHUNK + LAST + 1)


def ring0_origin_m(c: int) -> float:
    if c == -1:
        return round(-CHUNK * RAW_M, 1)
    if c == 16:
        return E
    return round(c * CHUNK * RAW_M, 1)


def ring0_cells() -> list[tuple[int, int]]:
    cells = [(cx, cy) for cy in (-1, 16) for cx in range(-1, 17)]
    cells += [(cx, cy) for cy in range(0, 16) for cx in (-1, 16)]
    return sorted(cells, key=lambda k: (k[1], k[0]))


def province_edge(web: dict, cx: int, cy: int, lod: int, side: str) -> np.ndarray:
    """One decoded edge of province chunk (cx, cy) at `lod`; side in n/s/w/e."""
    meta = web[(cx, cy)]["lods"][str(lod)]
    arr = decode_rg16(Image.open(CHUNKS_DIR / meta["file"]), meta["minM"], meta["maxM"])
    return {"n": arr[0, :], "s": arr[-1, :], "w": arr[:, 0], "e": arr[:, -1]}[side]


def near_box(heights: np.ndarray, near: np.ndarray):
    """(rows, cols, h_full, edge_delta): fine coordinates of the ring-1 box, the
    heights over it (the province inside the square, h_apron outside) and the
    per-side delta = DEFAULT_HEIGHTS - canon along the border."""
    rows, cols = np.meshgrid(np.arange(NEAR_N, dtype=np.float64) - NEAR_PAD,
                             np.arange(NEAR_N, dtype=np.float64) - NEAR_PAD, indexing="ij")
    h_full = apron_height(near, rows, cols, heights, near)
    h_full[NEAR_PAD:NEAR_PAD + N, NEAR_PAD:NEAR_PAD + N] = heights
    edge_delta = {
        "north": heights[0, :] - near[NEAR_PAD, NEAR_PAD:NEAR_PAD + N],
        "south": heights[-1, :] - near[NEAR_PAD + LAST, NEAR_PAD:NEAR_PAD + N],
        "west": heights[:, 0] - near[NEAR_PAD:NEAR_PAD + N, NEAR_PAD],
        "east": heights[:, -1] - near[NEAR_PAD:NEAR_PAD + N, NEAR_PAD + LAST],
    }
    return rows, cols, h_full, edge_delta


def ring0_arrays(h_full: np.ndarray, heights: np.ndarray, web: dict):
    """Yield (cx, cy, {lod: grid}) for the 68 ring-0 chunks, pre-encode.

    The LOD low-pass and subsample are `compile_chunks.chunk_grid`'s three
    lines, on the extended (ring 0 + province) box; the east/south ring starts
    ON the province's last sample, which is not CHUNK-aligned, so the cut is
    made here rather than through `chunk_grid`. Then the edges are fixed:
    outer = piecewise linear between ring 1's knots; inner = the province's.
    """
    ext = h_full[R0_OFF:R0_OFF + R0_N, R0_OFF:R0_OFF + R0_N]
    canvas = {}
    for f in LODS:
        sm = ext if f == 1 else ndimage.gaussian_filter(ext, f * 0.5)
        canvas[f] = np.ascontiguousarray(sm[::f, ::f], dtype=np.float32)
        c = canvas[f]
        c[0, :] = linearised(ext[0, :], R1_STEP, f)
        c[-1, :] = linearised(ext[-1, :], R1_STEP, f)
        c[:, 0] = linearised(ext[:, 0], R1_STEP, f)
        c[:, -1] = linearised(ext[:, -1], R1_STEP, f)

    for cx, cy in ring0_cells():
        x0, x1 = ring0_span(cx)
        y0, y1 = ring0_span(cy)
        lods = {}
        for f in LODS:
            arr = canvas[f][y0 // f:(y1 - 1) // f + 1, x0 // f:(x1 - 1) // f + 1].copy()
            # Inner edge: the province's, exactly (LOD 1 = DEFAULT_HEIGHTS; LOD 2/4 =
            # the decoded edge of the adjacent province chunk, so both meshes agree
            # whatever the low-pass did at the array edge).
            px, py = min(max(cx, 0), 15), min(max(cy, 0), 15)
            if cy == -1 and 0 <= cx <= 15:
                arr[-1, :] = heights[0, x0 - CHUNK:x1 - CHUNK:f] if f == 1 else province_edge(web, px, 0, f, "n")
            elif cy == 16 and 0 <= cx <= 15:
                arr[0, :] = heights[-1, x0 - CHUNK:x1 - CHUNK:f] if f == 1 else province_edge(web, px, 15, f, "s")
            elif cx == -1 and 0 <= cy <= 15:
                arr[:, -1] = heights[y0 - CHUNK:y1 - CHUNK:f, 0] if f == 1 else province_edge(web, 0, py, f, "w")
            elif cx == 16 and 0 <= cy <= 15:
                arr[:, 0] = heights[y0 - CHUNK:y1 - CHUNK:f, -1] if f == 1 else province_edge(web, 15, py, f, "e")
            else:  # a corner: one shared sample, the province's corner
                r = -1 if cy == -1 else 0
                c = -1 if cx == -1 else 0
                if f == 1:
                    arr[r, c] = heights[0 if cy == -1 else -1, 0 if cx == -1 else -1]
                else:
                    side = "n" if cy == -1 else "s"
                    arr[r, c] = province_edge(web, px, py, f, side)[0 if cx == -1 else -1]
            lods[f] = arr
        yield cx, cy, lods


def load_web_manifest() -> dict:
    return {(e["cx"], e["cy"]): e
            for e in json.loads((CHUNKS_DIR / "chunks-web-manifest.json").read_text())["chunks"]}


def signed_sqrt_bytes(g: np.ndarray) -> np.ndarray:
    s = np.sign(g) * np.sqrt(np.clip(np.abs(g) / GRADIENT_CLAMP, 0.0, 1.0))
    return np.clip(np.round((s + 1.0) * 127.5), 0, 255).astype(np.uint8)


def decode_gradient(b: np.ndarray) -> np.ndarray:
    s = b.astype(np.float32) / 127.5 - 1.0
    return np.sign(s) * s * s * GRADIENT_CLAMP


def region_raster() -> np.ndarray:
    rgb = np.asarray(Image.open(PROVINCE_DIR / "hydro-regions.png").convert("RGB"))
    region = np.zeros(rgb.shape[:2], dtype=np.uint8)
    for class_id, (_name, colour) in REGION_CLASSES.items():
        region[np.all(rgb == np.array(colour, dtype=np.uint8), axis=-1)] = class_id
    return region



def save_png(img: Image.Image, path: Path) -> None:
    img.save(path, optimize=True)


class Paint:
    """The province's ground paint, read once, sampled at its nearest edge texel."""

    def __init__(self) -> None:
        self.control = np.asarray(Image.open(PROVINCE_DIR / "refined" / "ground-control.png").convert("RGBA"))
        self.tint = np.asarray(Image.open(PROVINCE_DIR / "refined" / "ground-tint.png").convert("RGB"))
        self.grad = np.asarray(Image.open(CHUNKS_DIR / "normal-grad.png").convert("RGB"))
        self.region = region_raster()
        self.tint_step = (N - 1) / (self.tint.shape[0] - 1)     # 4.0

    def bake(self, name: str, h: np.ndarray, rows: np.ndarray, cols: np.ndarray,
             pitch_m: float, origin: tuple[int, int]) -> dict:
        """Bake one paint set over `h` at fine coordinates (rows, cols) [2-D], then
        dither/blend its border toward the province's edge texels."""
        ridx = np.clip(np.rint(rows / ((N - 1) / (HYDRO_N - 1))), 0, HYDRO_N - 1).astype(np.int64)
        cidx = np.clip(np.rint(cols / ((N - 1) / (HYDRO_N - 1))), 0, HYDRO_N - 1).astype(np.int64)
        region = self.region[ridx, cidx]
        v_frac = np.clip(rows / N, 0.0, 1.0).astype(np.float32)
        gz, gx = np.gradient(h, pitch_m)
        slope = np.hypot(gx, gz).astype(np.float32)
        rivers = np.zeros(h.shape, dtype=np.int8)
        _mat, control = compile_ground_control(h, region, rivers, slope, pitch_m,
                                               origin=origin, seed=SEED, v_frac=v_frac)
        control = np.asarray(control, dtype=np.uint8).copy()

        # Seam blend: within PAINT_BLEND_M the categorical ids are dithered to the
        # province's nearest edge texel, the continuous channels mixed, with the
        # same weight w = 1 - smoothstep(0, 1500 m, d).
        w = (1.0 - smoothstep(0.0, PAINT_BLEND_M, square_distance_m(rows, cols))).astype(np.float32)
        fr = np.clip(np.rint(rows), 0, LAST).astype(np.int64)
        fc = np.clip(np.rint(cols), 0, LAST).astype(np.int64)
        u = ndtr(white_field(h.shape, "apron-seam-dither", origin, SEED))
        take = u < w
        control[take] = self.control[fr, fc][take]

        tr = np.clip(np.rint(rows / self.tint_step), 0, self.tint.shape[0] - 1).astype(np.int64)
        tc = np.clip(np.rint(cols / self.tint_step), 0, self.tint.shape[1] - 1).astype(np.int64)
        prov_tint = self.tint[tr, tc].astype(np.float32)
        tint = w[..., None] * prov_tint + (1.0 - w[..., None]) * NEUTRAL_TINT
        tint = np.clip(np.rint(tint), 0, 255).astype(np.uint8)

        prov_grad = decode_gradient(self.grad[fr, fc][..., :2])
        own_grad = np.stack([gx, gz], axis=-1).astype(np.float32)
        grad = w[..., None] * prov_grad + (1.0 - w[..., None]) * own_grad
        grad_rgb = np.zeros((*h.shape, 3), dtype=np.uint8)
        grad_rgb[..., :2] = signed_sqrt_bytes(grad)

        files = {"control": f"{name}-control.png", "tint": f"{name}-tint.png", "grad": f"{name}-grad.png"}
        save_png(Image.fromarray(control, "RGBA"), OUT_DIR / files["control"])
        save_png(Image.fromarray(tint, "RGB"), OUT_DIR / files["tint"])
        save_png(Image.fromarray(grad_rgb, "RGB"), OUT_DIR / files["grad"])
        print(f"paint {name}: {h.shape[1]}x{h.shape[0]} at {pitch_m:.2f} m, "
              f"dithered {int(take.sum())} texels, ")
        return files


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.parse_args()

    for path in (NEAR_PATH, FAR_PATH, SOURCE_META_PATH):
        if not path.exists():
            raise SystemExit(f"{path} is missing: run `python3 -m worldgen.extract_apron_source` "
                             "(16d B1, by hand) to cut the apron crops from the all-Tamriel heightmap")
    heights = np.load(DEFAULT_HEIGHTS).astype(np.float32)
    assert heights.shape == (N, N), heights.shape
    near = np.load(NEAR_PATH).astype(np.float32)
    assert near.shape == (NEAR_N, NEAR_N), near.shape
    far_npz = np.load(FAR_PATH)
    far = np.where(far_npz["valid"], far_npz["height"], np.float32(NODATA_M)).astype(np.float32)
    assert far.shape == (R2_NY, R2_NX), far.shape
    source_meta = json.loads(SOURCE_META_PATH.read_text())
    web = load_web_manifest()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    RING0_DIR.mkdir(parents=True, exist_ok=True)

    rows_n, cols_n, h_full, edge_delta = near_box(heights, near)
    print(f"h_apron on the near box")

    ring0_entries = []
    triangles = 0
    for cx, cy, lods in ring0_arrays(h_full, heights, web):
        entry = {"cx": cx, "cy": cy, "originM": [ring0_origin_m(cx), ring0_origin_m(cy)], "lods": {}}
        for f, arr in lods.items():
            min_m, max_m = float(arr.min()), float(arr.max())
            name = f"chunk_{cx}_{cy}_lod{f}.png"
            save_png(encode_rg16(arr, min_m, max_m), RING0_DIR / name)
            entry["lods"][str(f)] = {"file": name, "shape": list(arr.shape),
                                     "metresPerSample": round(RAW_M * f, 3),
                                     "minM": round(min_m, 6), "maxM": round(max_m, 6)}
            if f == 1:
                triangles += (arr.shape[0] - 1) * (arr.shape[1] - 1) * 2
        ring0_entries.append(entry)
    print(f"ring 0: {len(ring0_entries)} chunks x {len(LODS)} LODs")
    seam_max = 0.0

    # Seam report: the shipped ring-0 inner edge against the shipped province edge.
    for entry in ring0_entries:
        cx, cy = entry["cx"], entry["cy"]
        if not (0 <= cx <= 15 or 0 <= cy <= 15):
            continue
        for f in LODS:
            meta = entry["lods"][str(f)]
            ring = decode_rg16(Image.open(RING0_DIR / meta["file"]), meta["minM"], meta["maxM"])
            if cy == -1:
                mine, theirs = ring[-1, :], province_edge(web, cx, 0, f, "n")
            elif cy == 16:
                mine, theirs = ring[0, :], province_edge(web, cx, 15, f, "s")
            elif cx == -1:
                mine, theirs = ring[:, -1], province_edge(web, 0, cy, f, "w")
            else:
                mine, theirs = ring[:, 0], province_edge(web, 15, cy, f, "e")
            seam_max = max(seam_max, float(np.abs(mine - theirs).max()))

    # ---- Ring 1: every 16th sample of the near box; outer edge linear between every 4th.
    ring1 = np.ascontiguousarray(h_full[::R1_STEP, ::R1_STEP], dtype=np.float32)
    n1 = ring1.shape[0]
    assert n1 == 333, n1
    for sl in ((0, slice(None)), (-1, slice(None)), (slice(None), 0), (slice(None), -1)):
        ring1[sl] = linearised(ring1[sl], R2_STEP // R1_STEP, 1)
    r1_min, r1_max = float(ring1.min()), float(ring1.max())
    save_png(encode_rg16(ring1, r1_min, r1_max), OUT_DIR / "ring1-height.png")
    triangles += ((n1 - 1) ** 2 - (R0_N // R1_STEP) ** 2) * 2

    # ---- Ring 2: h_apron on the far crop (bilinear on the map's 64-px block
    # centres), the inner 84² replaced by the near box's every-64th sample so its
    # inner edge is exactly ring 1's outer knots.
    jj, ii = np.meshgrid(np.arange(R2_NY, dtype=np.float64), np.arange(R2_NX, dtype=np.float64), indexing="ij")
    map_rows = R2_ROW0 + jj * R2_STEP
    map_cols = R2_COL0 + ii * R2_STEP
    canon = ndimage.map_coordinates(far, [(map_rows - (R2_STEP - 1) / 2) / R2_STEP,
                                          (map_cols - (R2_STEP - 1) / 2) / R2_STEP],
                                    order=1, mode="nearest").astype(np.float32)
    rows2, cols2 = map_rows - PROV_ROW0, map_cols - PROV_COL0
    ring2 = apron_height(canon, rows2, cols2, heights, near)
    z0, x0 = R2_NORTH, R2_WEST
    ring2[z0:z0 + R2_INNER, x0:x0 + R2_INNER] = h_full[::R2_STEP, ::R2_STEP]
    r2_min, r2_max = float(ring2.min()), float(ring2.max())
    save_png(encode_rg16(ring2, r2_min, r2_max), OUT_DIR / "ring2-height.png")
    triangles += ((R2_NY - 1) * (R2_NX - 1) - (R2_INNER - 1) ** 2) * 2
    print(f"ring 1 ({n1}²) and ring 2 ({R2_NX}x{R2_NY})")

    # ---- Paint: the province's rules over the near and far sets.
    paint = Paint()
    near_files = paint.bake("near", np.ascontiguousarray(h_full[::BAKE_STEP, ::BAKE_STEP]),
                            rows_n[::BAKE_STEP, ::BAKE_STEP], cols_n[::BAKE_STEP, ::BAKE_STEP],
                            BAKE_PITCH_M, (-NEAR_PAD // BAKE_STEP, -NEAR_PAD // BAKE_STEP))
    far_files = paint.bake("far", ring2, rows2, cols2, R2_PITCH_M, (-R2_NORTH, -R2_WEST))

    # ---- Manifest.
    n_near = NEAR_N // BAKE_STEP + 1
    r1_inner0 = R0_OFF // R1_STEP
    manifest = {
        "schemaVersion": 1,
        "sourceSha256": source_meta["pngSha256"],
        "sourceCropSha256": {"near": source_meta["near"]["sha256"], "far": source_meta["far"]["sha256"]},
        "registration": {"pngRow": PNG_ROW_SW, "pngCol": PNG_COL_SW, "metresPerPx": RAW_M,
                         "unitToMetres": source_meta["registration"]["unitToMetres"]},
        "blendM": BLEND_M,
        "paintBlendM": PAINT_BLEND_M,
        "nodataM": NODATA_M,
        "ring0": {"dir": "province/apron/ring0/", "chunks": ring0_entries},
        "tiles": [
            {"id": "ring1", "file": "ring1-height.png",
             "originM": [round(R1_ORIGIN_M, 4), round(R1_ORIGIN_M, 4)], "shape": [n1, n1],
             "metresPerSample": round(R1_PITCH_M, 5), "minM": round(r1_min, 6), "maxM": round(r1_max, 6),
             "maskInnerSamples": [r1_inner0, r1_inner0 + R0_N // R1_STEP + 1], "paint": "near"},
            {"id": "ring2", "file": "ring2-height.png",
             "originM": [round(R2_ORIGIN_M[0], 4), round(R2_ORIGIN_M[1], 4)], "shape": [R2_NY, R2_NX],
             "metresPerSample": round(R2_PITCH_M, 5), "minM": round(r2_min, 6), "maxM": round(r2_max, 6),
             "maskInnerSamples": [z0, z0 + R2_INNER, x0, x0 + R2_INNER], "paint": "far"},
        ],
        "paint": {
            "near": {"originM": [round(R1_ORIGIN_M, 4), round(R1_ORIGIN_M, 4)],
                     "extentM": round((n_near - 1) * BAKE_PITCH_M, 4),
                     "shape": [n_near, n_near], "metresPerTexel": round(BAKE_PITCH_M, 5), **near_files},
            "far": {"originM": [round(R2_ORIGIN_M[0], 4), round(R2_ORIGIN_M[1], 4)],
                    "extentM": [round((R2_NX - 1) * R2_PITCH_M, 4), round((R2_NY - 1) * R2_PITCH_M, 4)],
                    "shape": [R2_NY, R2_NX], "metresPerTexel": round(R2_PITCH_M, 5), **far_files},
        },
        "report": {
            "seamMaxAbsM": round(seam_max, 5),
            "edgeDeltaM": {side: {"p50": round(float(np.median(np.abs(d))), 2),
                                  "max": round(float(np.abs(d).max()), 2)}
                           for side, d in edge_delta.items()},
            "triangles": int(triangles),
        },
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=1) + "\n")
    print(json.dumps(manifest["report"], indent=1))
    print(f"apron built -> {OUT_DIR}")


if __name__ == "__main__":
    main()
