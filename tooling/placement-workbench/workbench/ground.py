"""The frozen ground of a km window, extracted ONCE per scene and sampled
from disk after that (the compile's survey takes ~12 s and ~0.9 GiB to load;
a place-and-check cycle must be seconds).

Two height samplers, both reused, never re-derived:

* ``chunks``: the studio's streamed terrain, the surface the runtime seats
  every ground piece on (`chunkWorld.groundHeight` ->
  `packages/game-core/src/terrain/heightfield.ts` `sampleChunkHeight`): the
  chunk's lod1 RG16 grid (`export_web_chunks.decode_rg16`), indexed with the
  manifest's own `originM` / `metresPerSample`, the anti-diagonal triangles
  (`terrain_triangles.sample_terrain`). Includes compiled pad grades.
* ``survey``: the compile's sampler (`ProvinceSurvey.height_at`, nearest
  pixel of the natural refined raster), which the proving-ground ground audit
  and the 97 B3 slope rule read.

Water: the survey's wet grid, signed depth and the recorded level of the
water entity under each window sample (`ProvinceSurvey.water_entity_at`).
"""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

import numpy as np

from . import paths

SCHEMA_VERSION = 1
WATER_STEP_M = 1.0


def _chunk_manifest() -> dict:
    return json.loads((paths.CHUNKS / "chunks-web-manifest.json").read_text())


def _sha256(path: Path) -> str:
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def window_chunks(centre_m: tuple[float, float], half_m: float,
                  manifest: dict | None = None) -> list[dict]:
    """The chunk manifest rows whose square touches the window: the files
    `extract` reads (their lod1 grids are the runtime's seat surface)."""
    manifest = manifest or _chunk_manifest()
    cx, cz = centre_m
    x0, x1, z0, z1 = cx - half_m, cx + half_m, cz - half_m, cz + half_m
    cell = float(manifest["chunkMetres"])
    return [c for c in manifest["chunks"]
            if not (c["originM"][0] > x1 or c["originM"][1] > z1
                    or c["originM"][0] + cell < x0 or c["originM"][1] + cell < z0)]


def provenance(chunks: list[dict]) -> dict:
    """{chunks: {key: sha256}, sha256}: one hash over the window's source
    chunk files, keyed so a changed chunk is named (0100 decision 6)."""
    per = {c["key"]: c["sha256"] for c in chunks}
    whole = hashlib.sha256("".join(f"{k}:{v}\n" for k, v in sorted(per.items())).encode())
    return {"chunks": per, "sha256": whole.hexdigest()}


def current_provenance(centre_m: tuple[float, float], half_m: float) -> dict:
    """The provenance of the chunk files on disk NOW for this window."""
    rows = [{"key": f"chunk_{c['cx']}_{c['cy']}",
             "sha256": _sha256(paths.CHUNKS / c["lods"]["1"]["file"])}
            for c in window_chunks(centre_m, half_m)]
    return provenance(rows)


def extract(centre_m: tuple[float, float], half_m: float, out: Path) -> dict:
    """Write the window's ground to ``out`` (npz + json meta); return the meta."""
    paths.bridge()
    from PIL import Image
    from worldgen.export_web_chunks import decode_rg16
    from worldgen.site_fields import shared_survey

    cx, cz = centre_m
    x0, x1, z0, z1 = cx - half_m, cx + half_m, cz - half_m, cz + half_m
    manifest = _chunk_manifest()
    cell = float(manifest["chunkMetres"])
    arrays: dict[str, np.ndarray] = {}
    chunks = []
    for chunk in window_chunks(centre_m, half_m, manifest):
        ox, oz = chunk["originM"]
        lod = chunk["lods"]["1"]
        heights = decode_rg16(Image.open(paths.CHUNKS / lod["file"]), lod["minM"], lod["maxM"])
        key = f"chunk_{chunk['cx']}_{chunk['cy']}"
        arrays[key] = heights.astype(np.float32)
        chunks.append({"key": key, "cx": chunk["cx"], "cy": chunk["cy"], "originM": [ox, oz],
                       "metresPerSample": lod["metresPerSample"],
                       "sha256": _sha256(paths.CHUNKS / lod["file"])})
    survey = shared_survey()
    hp = float(survey.height_px_m)
    gp = float(survey.grid_px_m)
    r0, r1 = int(z0 // hp), int(z1 // hp) + 1
    c0, c1 = int(x0 // hp), int(x1 // hp) + 1
    arrays["survey_height"] = np.asarray(survey.fields.height_m[r0:r1 + 1, c0:c1 + 1], np.float32)
    g0, g1 = int(z0 // gp), int(z1 // gp) + 1
    k0, k1 = int(x0 // gp), int(x1 // gp) + 1
    arrays["slope"] = np.asarray(survey.slope_grid[g0:g1 + 1, k0:k1 + 1], np.float32)
    arrays["wet"] = np.asarray(survey.wet_grid[g0:g1 + 1, k0:k1 + 1], bool)
    depth = survey.water_signed_depth_m
    dp = survey.extent_m / depth.shape[0]
    d0, d1 = int(z0 // dp), int(z1 // dp) + 1
    e0, e1 = int(x0 // dp), int(x1 // dp) + 1
    arrays["depth"] = np.asarray(depth[d0:d1 + 1, e0:e1 + 1], np.float32)
    n = int(round(2 * half_m / WATER_STEP_M)) + 1
    level = np.full((n, n), np.nan, np.float32)
    for i in range(n):
        for j in range(n):
            ent = survey.water_entity_at(x0 + j * WATER_STEP_M, z0 + i * WATER_STEP_M)
            if ent and ent.get("levelM") is not None:
                level[i, j] = ent["levelM"]
    arrays["water_level"] = level
    meta = {
        "schemaVersion": SCHEMA_VERSION,
        "centreM": [cx, cz], "halfM": half_m,
        "chunks": chunks,
        "survey": {"pxM": hp, "origin": [c0, r0]},
        "grid": {"pxM": gp, "origin": [k0, g0]},
        "depth": {"pxM": dp, "origin": [e0, d0]},
        "water": {"stepM": WATER_STEP_M, "originM": [x0, z0]},
        "extentM": float(survey.extent_m),
        "chunkMetres": cell,
    }
    out.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(out.with_suffix(".npz"), **arrays)
    out.with_suffix(".json").write_text(json.dumps(meta, indent=1))
    return meta


class Ground:
    """Samplers over an extracted window (fast: npz load only)."""

    def __init__(self, stem: Path):
        self.meta = json.loads(stem.with_suffix(".json").read_text())
        data = np.load(stem.with_suffix(".npz"))
        self.a = {k: data[k] for k in data.files}
        self._chunks = {(c["cx"], c["cy"]): c for c in self.meta["chunks"]}
        self.extent_m = self.meta["extentM"]

    def provenance(self) -> dict:
        """The source chunk files this window was read from (hashed at
        extraction; a window extracted before hashes were recorded is hashed
        from the files on disk now)."""
        if all("sha256" in c for c in self.meta["chunks"]):
            return provenance(self.meta["chunks"])
        return current_provenance(tuple(self.meta["centreM"]), float(self.meta["halfM"]))

    # -- heights -----------------------------------------------------------
    def _sampler(self):
        fn = self.__dict__.get("_sample_terrain")
        if fn is None:
            paths.bridge()
            from worldgen.terrain_triangles import sample_terrain as fn
            self.__dict__["_sample_terrain"] = fn
        return fn

    def chunk_height(self, x: float, z: float) -> float:
        """`chunkWorld.groundHeight`: the chunk under the point, its own grid."""
        sample_terrain = self._sampler()
        cell = self.meta["chunkMetres"]
        key = (int(math.floor(x / cell)), int(math.floor(z / cell)))
        chunk = self._chunks.get(key)
        if chunk is None:
            raise ValueError(f"({x:.1f}, {z:.1f}) is outside the scene's ground window")
        grid = self.a[chunk["key"]]
        mps = chunk["metresPerSample"]
        gx = (x - chunk["originM"][0]) / mps
        gz = (z - chunk["originM"][1]) / mps
        return float(sample_terrain(grid, np.array([[gz], [gx]]))[0])

    def survey_height(self, x: float, z: float) -> float:
        """`ProvinceSurvey.height_at`: nearest pixel of the refined raster."""
        s = self.meta["survey"]
        row = int(z / s["pxM"]) - s["origin"][1]
        col = int(x / s["pxM"]) - s["origin"][0]
        h = self.a["survey_height"]
        if not (0 <= row < h.shape[0] and 0 <= col < h.shape[1]):
            raise ValueError(f"({x:.1f}, {z:.1f}) is outside the scene's ground window")
        return float(h[row, col])

    def height(self, x: float, z: float, source: str = "chunks") -> float:
        return self.chunk_height(x, z) if source == "chunks" else self.survey_height(x, z)

    # -- slope and water ---------------------------------------------------
    def _grid(self, name: str, block: str, x: float, z: float):
        """The window's cell of `name` under (x, z). A point outside the
        window is refused like `survey_height` refuses it: a clamped edge
        cell (or a wrapped negative index) would read as real ground."""
        g = self.meta[block]
        return self._cell(name, int(z // g["pxM"]) - g["origin"][1],
                          int(x // g["pxM"]) - g["origin"][0], x, z)

    def _cell(self, name: str, row: int, col: int, x: float, z: float):
        arr = self.a[name]
        if not (0 <= row < arr.shape[0] and 0 <= col < arr.shape[1]):
            raise ValueError(f"({x:.1f}, {z:.1f}) is outside the scene's ground window")
        return arr[row, col]

    def footprint_max_slope_deg(self, polygon_m) -> float:
        """`compile_settlement.footprint_max_slope_deg` on the window's cells."""
        from shapely.geometry import Polygon, box
        poly = Polygon(polygon_m)
        g = self.meta["grid"]
        px = g["pxM"]
        x0, z0, x1, z1 = poly.bounds
        out = 0.0
        for r in range(int(z0 // px), int(z1 // px) + 1):
            for c in range(int(x0 // px), int(x1 // px) + 1):
                if box(c * px, r * px, (c + 1) * px, (r + 1) * px).intersects(poly):
                    out = max(out, float(self._cell("slope", r - g["origin"][1],
                                                    c - g["origin"][0], c * px, r * px)))
        return out

    def wet(self, x: float, z: float) -> bool:
        return bool(self._grid("wet", "grid", x, z))

    def depth(self, x: float, z: float) -> float:
        return float(self._grid("depth", "depth", x, z))

    def water_level(self, x: float, z: float) -> float | None:
        w = self.meta["water"]
        j = int(round((x - w["originM"][0]) / w["stepM"]))
        i = int(round((z - w["originM"][1]) / w["stepM"]))
        arr = self.a["water_level"]
        if not (0 <= i < arr.shape[0] and 0 <= j < arr.shape[1]):
            return None
        v = float(arr[i, j])
        return None if math.isnan(v) else v

