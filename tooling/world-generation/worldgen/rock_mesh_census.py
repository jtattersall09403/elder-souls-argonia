"""Measure every shipped rock's ACTUAL mesh against the ground (16f round 5).

`rock_census.py` measures a base PLANE through the pivot; a cliff shell is
not a plane. This decodes the same bundles, places each rock's LOD0
vertices exactly as the renderer does (`Vegetation.tsx`: position, Euler
YXZ (tiltX, yaw, tiltZ), uniform scale, pivot at ground − sink) and, in a
grid of cells over its footprint, takes the LOWEST vertex per cell (the
underside there) and its height above the ground under it. A positive gap
in any cell is a visible hole under the rock; the largest is `gapM`.

Run:  python3 -m worldgen.rock_mesh_census --near 1590,2300 --radius 40
      python3 -m worldgen.rock_mesh_census --summary
"""
from __future__ import annotations

import argparse
import json
import math
import struct
from collections import defaultdict
from pathlib import Path

import numpy as np

from .rock_census import iter_rocks, load_fields

REPO_ROOT = Path(__file__).resolve().parents[3]
RAW_KITS = [REPO_ROOT / "tooling" / "asset-pipeline" / "output" / "kits" / name
            for name in ("flora-province-v1.glb", "underwater-v1.glb")]
GRID = 16
MIN_CELL_M = 0.4
#: The cut's own threshold (`compile_scatter.CUT_GAP_M`): a boulder or pile
#: whose lower half stands further than this off the ground is what ships
#: cut, so the census counts what the compiler counts. Cliff shells are
#: reported separately and never cut (their hollow sits against the hill).
GAP_TOLERANCE_M = 0.75
#: The lowest share of a rock's height that is its BASE: the lowest vertex
#: per footprint cell among these is the underside that must meet the
#: ground. Measured on the shipped province (16f round 5): 0.5 is the band
#: at which a boulder or pile the owner sees as floating (a pile whose side
#: boulder hung 1.3 m off a 30° slope) reads as hanging, while a boulder's
#: belly on a hillside — which Skyrim shows too — mostly does not.
BASE_BAND = 0.5


def _glb(path: Path):
    with path.open("rb") as f:
        f.seek(12)
        ln, _ = struct.unpack("<II", f.read(8))
        js = json.loads(f.read(ln))
        ln2, _ = struct.unpack("<II", f.read(8))
        blob = f.read(ln2)
    return js, blob


def _accessor(js, blob, ai):
    a = js["accessors"][ai]
    v = js["bufferViews"][a["bufferView"]]
    off = v.get("byteOffset", 0) + a.get("byteOffset", 0)
    ct = {5123: np.uint16, 5125: np.uint32, 5126: np.float32}[a["componentType"]]
    n = {"SCALAR": 1, "VEC2": 2, "VEC3": 3}[a["type"]]
    return np.frombuffer(blob, dtype=ct, count=a["count"] * n, offset=off).reshape(a["count"], n)


def _node_matrix(nd) -> np.ndarray:
    m = np.eye(4)
    if "matrix" in nd:
        return np.array(nd["matrix"]).reshape(4, 4).T
    t = nd.get("translation", [0, 0, 0]); s = nd.get("scale", [1, 1, 1]); q = nd.get("rotation", [0, 0, 0, 1])
    x, y, z, w = q
    r = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                  [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                  [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
    m[:3, :3] = r * np.array(s)[None, :]
    m[:3, 3] = t
    return m


def lod0_vertices() -> dict[str, np.ndarray]:
    """LOD0 vertices per asset id as N×3 rows (x, y, z; y up, node transforms
    applied), from both raw kits; the land kit wins a shared id (the
    renderer's rule)."""
    out: dict[str, np.ndarray] = {}
    for kit in RAW_KITS:
        if kit.exists():
            _collect(kit, out)
    return out


def _collect(kit: Path, out: dict[str, np.ndarray]) -> None:
    js, blob = _glb(kit)
    nodes = js["nodes"]

    def walk(n, parent, acc):
        nd = nodes[n]
        m = parent @ _node_matrix(nd)
        ex = nd.get("extras", {})
        if "mesh" in nd and ex.get("lod", 0) == 0 and not ex.get("billboard"):
            for pr in js["meshes"][nd["mesh"]]["primitives"]:
                p = _accessor(js, blob, pr["attributes"]["POSITION"]).astype(np.float64)
                acc.append((np.c_[p, np.ones(len(p))] @ m.T)[:, :3])
        for c in nd.get("children", []):
            walk(c, m, acc)

    for r in js["scenes"][0]["nodes"]:
        aid = nodes[r].get("extras", {}).get("assetId")
        if not aid or aid in out:
            continue
        acc: list = []
        walk(r, np.eye(4), acc)
        if acc:
            out[aid] = np.vstack(acc)


def euler_yxz(tx: float, yaw: float, tz: float) -> np.ndarray:
    """three.js Euler order YXZ: R = Ry(yaw) · Rx(tx) · Rz(tz)."""
    cx, sx, cy, sy, cz, sz = math.cos(tx), math.sin(tx), math.cos(yaw), math.sin(yaw), math.cos(tz), math.sin(tz)
    rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return ry @ rx @ rz


def underside(verts: np.ndarray) -> np.ndarray:
    ymin, ymax = float(verts[:, 1].min()), float(verts[:, 1].max())
    return verts[verts[:, 1] <= ymin + BASE_BAND * (ymax - ymin) + 1e-6]


def underside_gaps(points: np.ndarray, x: float, pivot_y: float, z: float,
                   yaw: float, tilt_x: float, tilt_z: float, scale: float,
                   height) -> list[float]:
    """Pose `points` (N×3 model space) as the renderer does and return, per
    ground cell under the footprint, the height of the lowest posed vertex
    above the ground there. Shared by the census and `scatter.burial`."""
    w = points @ (euler_yxz(tilt_x, yaw, tilt_z) * scale).T + np.array([x, pivot_y, z])
    xmin, zmin, xmax, zmax = w[:, 0].min(), w[:, 2].min(), w[:, 0].max(), w[:, 2].max()
    cell = max(MIN_CELL_M, max(xmax - xmin, zmax - zmin) / GRID)
    key = (np.floor((w[:, 0] - xmin) / cell).astype(np.int64) * 1024
           + np.floor((w[:, 2] - zmin) / cell).astype(np.int64))
    order = np.lexsort((w[:, 1], key))
    key_sorted = key[order]
    first = np.ones(len(order), dtype=bool)
    first[1:] = key_sorted[1:] != key_sorted[:-1]
    lows = order[first]
    return [float(w[i, 1] - height(float(w[i, 0]), float(w[i, 2]))) for i in lows]


def underside_gaps_and_ground(points: np.ndarray, x: float, pivot_y: float, z: float,
                              yaw: float, tilt_x: float, tilt_z: float, scale: float,
                              height) -> tuple[list[float], float]:
    """`underside_gaps` plus the lowest ground under the footprint cells."""
    w = points @ (euler_yxz(tilt_x, yaw, tilt_z) * scale).T + np.array([x, pivot_y, z])
    xmin, zmin, xmax, zmax = w[:, 0].min(), w[:, 2].min(), w[:, 0].max(), w[:, 2].max()
    cell = max(MIN_CELL_M, max(xmax - xmin, zmax - zmin) / GRID)
    key = (np.floor((w[:, 0] - xmin) / cell).astype(np.int64) * 1024
           + np.floor((w[:, 2] - zmin) / cell).astype(np.int64))
    order = np.lexsort((w[:, 1], key))
    key_sorted = key[order]
    first = np.ones(len(order), dtype=bool)
    first[1:] = key_sorted[1:] != key_sorted[:-1]
    gaps, lowest = [], math.inf
    for i in order[first]:
        ground = height(float(w[i, 0]), float(w[i, 2]))
        gaps.append(float(w[i, 1] - ground))
        lowest = min(lowest, ground)
    return gaps, lowest


def measure(verts: np.ndarray, inst: dict, fields) -> tuple[float, list[float]]:
    """(largest gap, gap per footprint cell) for one placed rock. `verts` is
    the species' underside set — the mined profile the compiler seats on
    (`rock_bottom_profiles.py`, one vertex per 0.25 m voxel, well inside the
    0.3 m tolerance), so the census and the compiler measure one thing."""
    x, z = inst["x"], inst["z"]
    gaps = underside_gaps(verts, x, fields.height(x, z) - inst["sink"], z,
                          inst["yaw"], inst["tiltX"], inst["tiltZ"], inst["scale"], fields.height)
    return (max(gaps) if gaps else 0.0), gaps


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--near")
    ap.add_argument("--radius", type=float, default=40.0)
    ap.add_argument("--summary", action="store_true")
    ap.add_argument("--chunks", type=int, default=0, help="limit to the first N chunks")
    args = ap.parse_args()
    fields = load_fields()
    from .rock_dressing import bottom_profile
    verts = {aid: np.asarray(bottom_profile(aid), dtype=float)
             for aid in lod0_vertices() if bottom_profile(aid)}
    near = tuple(float(v) for v in args.near.split(",")) if args.near else None
    per_species: dict = defaultdict(lambda: {"n": 0, "gapping": 0, "worst": 0.0})
    seen_chunks: set = set()
    for chunk, species, inst in iter_rocks():
        if args.chunks and chunk not in seen_chunks and len(seen_chunks) >= args.chunks:
            break
        seen_chunks.add(chunk)
        if near and math.hypot(inst["x"] - near[0], inst["z"] - near[1]) > args.radius:
            continue
        v = verts.get(species)
        if v is None:
            continue
        gap, gaps = measure(v, inst, fields)
        s = per_species[species]
        s["n"] += 1
        if gap > GAP_TOLERANCE_M:
            s["gapping"] += 1
        s["worst"] = max(s["worst"], gap)
        if near:
            d = math.hypot(inst["x"] - near[0], inst["z"] - near[1])
            print(f"{d:5.1f} m {species.split('/')[-1]:18} scale {inst['scale']:.2f} yaw {math.degrees(inst['yaw']) % 360:5.1f} "
                  f"tilt {math.degrees(inst['tiltX']):5.1f}/{math.degrees(inst['tiltZ']):5.1f} sink {inst['sink']:.2f} "
                  f"slope {fields.slope(inst['x'], inst['z']):4.1f} gapM {gap:+.2f} cells>0 "
                  + " ".join(f"{g:+.1f}" for g in sorted(gaps, reverse=True) if g > 0))
    total = sum(s["n"] for s in per_species.values())
    gapping = sum(s["gapping"] for s in per_species.values())
    cliffs = sum(s["gapping"] for k, s in per_species.items() if "cliff" in k)
    print(json.dumps({"rocks": total, "gapping": gapping, "gappingCliffShells": cliffs,
                      "gappingBouldersAndPiles": gapping - cliffs,
                      "share": round(gapping / total, 4) if total else 0,
                      "bySpecies": {k: v for k, v in sorted(per_species.items(), key=lambda kv: -kv[1]["gapping"]) if v["gapping"]}},
                     indent=1))


if __name__ == "__main__":
    main()
