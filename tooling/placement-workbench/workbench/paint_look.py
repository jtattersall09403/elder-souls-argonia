"""The painted ways of a PUBLISHED place as the studio draws them, seen from
above, with no GPU (16k walk 6): `wb.py paint-look PLACE_ID X Z`.

The ground is the frozen land cover (the bake's per-texel material,
`landcover-i16.npy`, blended bilinearly between texels as the terrain's
splat does) textured with the studio's own ground set
(`public/textures/ground/<default>/materials.json`, tiled at each row's
`tileM`); the paint is `groundPaint.ts`'s surface computed the same way
(per texture: max over entries of smoothstep(edge distance / edgeM) x
peakAlpha; colour = weight-blended textures; alpha = the largest weight),
composited over it. Building footprints are outlined thin grey and door
thresholds dotted cyan so a reader can judge "the way reaches the door".
Albedo only: this is for colour, blend, joins and gaps, not lighting.

`ground_image` also returns the composite as an array with its bounds, so
the Blender eye-level render can drape it (`render_scene.py` JOB
`groundImage`).
"""
from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np

DOOR_RGB = (0, 220, 255)
FOOTPRINT_RGB = (150, 150, 150)


def _srgb_to_linear(a):
    return np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)


def _linear_to_srgb(a):
    a = np.clip(a, 0, 1)
    return np.where(a <= 0.0031308, a * 12.92, 1.055 * a ** (1 / 2.4) - 0.055)


class _Textures:
    """The studio's ground set, loaded once per material id, linear float32."""

    def __init__(self, public: Path):
        idx = json.loads((public / "textures" / "ground" / "index.json").read_text())
        self.dir = public / "textures" / "ground" / idx["default"]
        rows = json.loads((self.dir / "materials.json").read_text())["materials"]
        self.by_id = {r["id"]: r for r in rows}
        self.by_name = {r["name"]: r for r in rows}
        self.cache: dict[str, np.ndarray] = {}

    def image(self, row) -> np.ndarray:
        from PIL import Image
        if row["name"] not in self.cache:
            a = np.asarray(Image.open(self.dir / row["file"]).convert("RGB"), dtype=np.float32) / 255.0
            self.cache[row["name"]] = _srgb_to_linear(a).astype(np.float32)
        return self.cache[row["name"]]

    def sample(self, row, X, Z) -> np.ndarray:
        img = self.image(row)
        h, w = img.shape[:2]
        u = ((X / row["tileM"]) % 1.0 * w).astype(np.int32) % w
        v = ((Z / row["tileM"]) % 1.0 * h).astype(np.int32) % h
        return img[v, u]


def paint_weights(entries: list[dict], X: np.ndarray, Z: np.ndarray, textures: list[str]) -> np.ndarray:
    """(H, W, len(textures)) weights: groundPaint.ts `paintSurface` per pixel.
    Chunked per entry's bounding box (never pixels x entries at once)."""
    import shapely
    from shapely.geometry import Polygon
    H, W = X.shape
    out = np.zeros((H, W, len(textures)), dtype=np.float32)
    x0, z0 = X[0, 0], Z[0, 0]
    dx = X[0, 1] - X[0, 0] if W > 1 else 1.0
    dz = Z[1, 0] - Z[0, 0] if H > 1 else 1.0
    for e in entries:
        poly = Polygon(e["polygonM"]).buffer(0)
        bx0, bz0, bx1, bz1 = poly.bounds
        i0, i1 = max(0, int((bx0 - x0) / dx)), min(W, int((bx1 - x0) / dx) + 2)
        j0, j1 = max(0, int((bz0 - z0) / dz)), min(H, int((bz1 - z0) / dz) + 2)
        if i0 >= i1 or j0 >= j1:
            continue
        xs, zs = X[j0:j1, i0:i1].ravel(), Z[j0:j1, i0:i1].ravel()
        inside = shapely.contains_xy(poly, xs, zs)
        d = shapely.distance(poly.boundary, shapely.points(xs[inside], zs[inside]))
        t = np.clip(d / max(float(e["edgeM"]), 1e-3), 0, 1)
        a = np.zeros(xs.shape, dtype=np.float32)
        a[inside] = (t * t * (3 - 2 * t) * float(e["peakAlpha"])).astype(np.float32)
        ch = textures.index(e["texture"])
        block = out[j0:j1, i0:i1, ch]
        np.maximum(block, a.reshape(block.shape), out=block)
    return out


def ground_image(place_id: str, cx: float, cz: float, span: float, ppm: float = 20.0,
                 paint: bool = True, marks: bool = True, doc: dict | None = None) -> dict:
    """The composite over the square ``span`` metres centred on (cx, cz);
    ``doc``: the bundle to draw (default the published one)."""
    from workbench import paths
    paths.bridge()
    from worldgen.road_paint_census import material_path
    from worldgen.scale import RAW_M
    public = paths.REPO_ROOT / "apps" / "world-studio" / "public"
    if doc is None:
        doc = json.loads((paths.PROVINCE / "settlements" / f"{place_id}.json").read_text())
    tex = _Textures(public)
    n = int(round(span * ppm))
    x0, z0 = cx - span / 2, cz - span / 2
    xs = x0 + (np.arange(n, dtype=np.float64) + 0.5) / ppm
    zs = z0 + (np.arange(n, dtype=np.float64) + 0.5) / ppm
    X, Z = np.meshgrid(xs, zs)
    # the land cover, bilinear between texel centres (k * RAW_M)
    t = RAW_M
    mat = np.load(material_path(), mmap_mode="r")
    ti0, tj0 = int(math.floor(x0 / t)) - 1, int(math.floor(z0 / t)) - 1
    ti1, tj1 = int(math.ceil((x0 + span) / t)) + 2, int(math.ceil((z0 + span) / t)) + 2
    win = np.asarray(mat[tj0:tj1, ti0:ti1])
    fx, fz = X / t - ti0, Z / t - tj0
    i, j = np.floor(fx).astype(np.int32), np.floor(fz).astype(np.int32)
    ax, az = (fx - i).astype(np.float32), (fz - j).astype(np.float32)
    colour = np.zeros((n, n, 3), dtype=np.float32)
    for m in np.unique(win).tolist():
        row = tex.by_id.get(int(m))
        if row is None:
            continue
        ind = (win == m).astype(np.float32)
        w = (ind[j, i] * (1 - ax) * (1 - az) + ind[j, i + 1] * ax * (1 - az)
             + ind[j + 1, i] * (1 - ax) * az + ind[j + 1, i + 1] * ax * az)
        if w.max() <= 0:
            continue
        colour += w[..., None] * tex.sample(row, X, Z)
    if paint:
        entries = (doc["settlement"].get("groundPaint") or {}).get("entries") or []
        names = sorted({e["texture"] for e in entries})
        if names:
            wts = paint_weights(entries, X, Z, names)
            total = wts.sum(axis=2, keepdims=True)
            pc = sum(wts[..., k:k + 1] * tex.sample(tex.by_name[nm], X, Z) for k, nm in enumerate(names))
            pc = pc / np.maximum(total, 1e-4)
            a = wts.max(axis=2, keepdims=True)
            colour = colour * (1 - a) + pc * a
    rgb = (_linear_to_srgb(colour) * 255).astype(np.uint8)
    if marks:
        from PIL import Image, ImageDraw
        im = Image.fromarray(rgb)
        dr = ImageDraw.Draw(im)
        to_px = lambda x, z: ((x - x0) * ppm, (z - z0) * ppm)
        ids = set(doc["settlement"].get("placementIds") or [])
        for p in doc.get("placements") or []:
            fp = p.get("footprintM") or []
            if p.get("id") in ids and len(fp) >= 3 and p["id"].endswith(".building"):
                dr.line([to_px(*q) for q in fp + fp[:1]], fill=FOOTPRINT_RGB, width=max(1, int(ppm / 20)))
        for d in doc.get("doors") or []:
            px, pz = to_px(*d["thresholdM"])
            r = max(2, ppm * 0.15)
            dr.ellipse([px - r, pz - r, px + r, pz + r], outline=DOOR_RGB, width=max(1, int(ppm / 20)))
        rgb = np.asarray(im)
    return {"rgb": rgb, "boundsM": [x0, z0, x0 + span, z0 + span], "ppm": ppm}


def paint_look(place_id: str, spots: list[tuple[float, float]], span: float, ppm: float,
               out_dir: Path, tag: str = "", preview: bool = False) -> list[str]:
    """One PNG per spot (top-down, north up: +z south is down the image);
    ``preview``: the paint the next publish will ship (`paint_rules.load_doc`)."""
    from PIL import Image
    from workbench import paint_rules
    out_dir.mkdir(parents=True, exist_ok=True)
    doc = paint_rules.load_doc(place_id, preview)
    written = []
    for x, z in spots:
        got = ground_image(place_id, x, z, span, ppm, doc=doc)
        path = out_dir / f"{place_id.split('.')[-1]}{tag}-{x:.0f}-{z:.0f}-top.png"
        Image.fromarray(got["rgb"]).save(path)
        written.append(str(path))
    return written


def eye_spec(place_id: str, shots: list[dict], out_dir: Path, tag: str = "", preview: bool = False,
             ppm: float = 10.0, res=(960, 540), samples: int = 16) -> Path:
    """The composite under every eye-level shot (``shots``: {name, eye [x, z],
    look [x, z]}) and the JSON spec `blender/examples/paint_eye.py` reads."""
    from PIL import Image
    from workbench import paint_rules
    out_dir.mkdir(parents=True, exist_ok=True)
    doc = paint_rules.load_doc(place_id, preview)
    pts = [p for s in shots for p in (s["eye"], s["look"])]
    xs, zs = [p[0] for p in pts], [p[1] for p in pts]
    cx, cz = (min(xs) + max(xs)) / 2, (min(zs) + max(zs)) / 2
    span = max(max(xs) - min(xs), max(zs) - min(zs)) + 60.0
    got = ground_image(place_id, cx, cz, span, ppm, marks=False, doc=doc)
    image = out_dir / f"{place_id.split('.')[-1]}{tag}-ground.png"
    Image.fromarray(got["rgb"]).save(image)
    spec = out_dir / f"{place_id.split('.')[-1]}{tag}-eye.json"
    spec.write_text(json.dumps({"image": str(image.resolve()), "boundsM": got["boundsM"],
                                "shots": [{**s, "name": f"{place_id.split('.')[-1]}{tag}-{s['name']}-eye"}
                                          for s in shots],
                                "outDir": str(out_dir.resolve()), "res": list(res), "samples": samples}))
    return spec
