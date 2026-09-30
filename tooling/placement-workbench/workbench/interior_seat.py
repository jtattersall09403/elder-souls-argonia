"""Seat one interior fixture addition (a candle, a wall horn, a lantern) in a
published interior cell, on the cell's actual geometry: on a table top,
against a wall, on the floor, or hung from a ceiling (16k walk 5/6 lighting
additions; doors-interiors-sockets.md § 7).

    wb.py seat-interior CELL ASSET ZONE|X,Y,Z [--mount table|wall|floor|ceiling]

prints the seated ``pos`` and ``rotZDeg`` (the additions-file fields).

The wall rule (16k walk 6, decision 0106 decision 11): **a wall piece's
front is the side its mined light is on.** `back_axis` takes the side
opposite the kit manifest's `light.offsetM`; only a piece with no mined
light falls back to its flattest side. `rear_extent` measures how far the
piece reaches toward the wall ignoring a lone spike (candlehornwall01's
mounting spike runs 0.5 m past the plate and goes INTO the wall). The old
vertex-count rule read the spike side as the front and mounted every
candlehornwall01 backwards (flame to the wall, light 0.7 m behind it).

Frames: vertices are the game frame (Y up); a yaw is the plugin's Z
rotation in degrees (`rotZDeg`), turned into the runtime rotation by
`export_interior_bundle.game_rotation_deg`.
"""
from __future__ import annotations

import functools
import json
import math
import sys

import numpy as np

from workbench import paths

if str(paths.WORLDGEN) not in sys.path:
    sys.path.insert(0, str(paths.WORLDGEN))

from worldgen import export_interior_bundle as ex  # noqa: E402
from worldgen import interior_walk as iw  # noqa: E402

MOUNTS = ("table", "wall", "floor", "ceiling")
WALL_EYE_M = 1.75        # a wall fixture's plate height above the floor
WALL_REACH_M = 0.9       # the wall must be this close to the aim point
FLAT_TOL_M = 0.03        # plate-to-wall gap bar, and the hang/table bars
TABLE_TOL_M = 0.02
HANG_CLEAR_M = 2.0       # a hung piece's bottom stays this far above the floor


def yaw_matrix(yaw_deg: float) -> np.ndarray:
    """The game-frame rotation of a piece turned `yaw_deg` about the plugin Z."""
    return iw.euler_matrix(ex.game_rotation_deg((0, 0, math.radians(yaw_deg))))


def back_axis(verts: np.ndarray, light_offset=None) -> np.ndarray:
    """The piece's local horizontal axis that faces the wall. The front is
    the side its mined light is on, so the back is the opposite side; with
    no mined light (offset under 0.3 m) the flattest side (most vertices on
    its extreme plane) is the back."""
    off = np.asarray(light_offset if light_offset is not None else (0, 0, 0), float).copy()
    off[1] = 0
    e = np.zeros(3)
    if np.linalg.norm(off) > 0.3:
        ax = int(np.argmax(np.abs(off)))
        e[ax] = -np.sign(off[ax])
        return e
    v = np.asarray(verts, float)
    best = None
    for ax in (0, 2):
        for sg in (1, -1):
            s = v[:, ax] * sg
            cnt = int((s > s.max() - 0.01).sum())
            if best is None or cnt > best[0]:
                best = (cnt, ax, sg)
    e[best[1]] = best[2]
    return e


def rear_extent(verts: np.ndarray, back: np.ndarray) -> float:
    """How far the piece reaches along `back` from its pivot, ignoring a lone
    spike: the first gap over 0.1 m among the top 5 % of reaches cuts it."""
    d = np.sort(np.asarray(verts, float) @ np.asarray(back, float))[::-1]
    gaps = np.where(-np.diff(d[: len(d) // 20 + 2]) > 0.1)[0]
    return float(d[gaps[-1] + 1] if len(gaps) else d[0])


def wall_pose(verts: np.ndarray, light_offset, wall_point, wall_normal) -> tuple[list, int]:
    """(pos, rotZDeg) of a wall piece whose plate touches the wall at
    `wall_point`, `wall_normal` pointing out of the wall into the room: the
    back axis turned into the wall, the pivot stood off by the rear extent."""
    n = np.asarray(wall_normal, float).copy()
    n[1] = 0
    n /= np.linalg.norm(n)
    b = back_axis(verts, light_offset)
    yaw = min(range(360), key=lambda y: float(np.linalg.norm(yaw_matrix(y) @ b + n)))
    v = np.asarray(verts, float) @ yaw_matrix(yaw).T
    pos = np.asarray(wall_point, float) + n * rear_extent(v, -n)
    return [round(float(x), 3) for x in pos], int(yaw)


class Cell:
    """One published interior cell's collision mesh and the kit data the
    seaters read. Built once per call (~2–5 s for a tier A cell)."""

    def __init__(self, cell: str):
        from worldgen import interior_light as il
        self.cell = cell
        self.bundle = json.loads((paths.PUBLIC / "province" / "interiors" / f"{cell}.json").read_text())
        # the published additions are what is being (re)seated: never a surface
        self.bundle["placements"] = [p for p in self.bundle["placements"] if p.get("source") != "addition"]
        self.mesh, self.owner, _ = iw.bundle_mesh(self.bundle, iw.RAW_KITS)
        self.kit_lights = il.kit_lights(ex.KITS_DIR)
        self.kit_assets = ex.published_kit_assets(ex.KITS_DIR)

    @functools.lru_cache(None)
    def verts(self, asset: str) -> np.ndarray:
        one = {"placements": [{"id": "x", "assetId": asset, "kit": self.kit_assets[asset][0],
                               "positionM": [0, 0, 0], "rotationDeg": ex.game_rotation_deg((0, 0, 0)),
                               "scale": 1.0}]}
        m, _, _ = iw.bundle_mesh(one, iw.RAW_KITS)
        return np.asarray(m.vertices)

    def light_offset(self, asset: str):
        return (self.kit_lights.get(asset) or {}).get("offsetM")

    def ray(self, o, d, skip=()):
        """(distance, point, face) of the first hit along d, or None."""
        o = np.asarray(o, float) + [1.37e-4, 0.91e-4, 0.53e-4]
        d = np.asarray(d, float)
        loc, _, ti = self.mesh.ray.intersects_location(o[None], d[None], multiple_hits=True)
        if not len(loc):
            return None
        dist = (loc - o) @ d
        k = [j for j in np.argsort(dist) if dist[j] > 1e-4 and self.owner[ti[j]] not in skip]
        return (float(dist[k[0]]), loc[k[0]], int(ti[k[0]])) if k else None

    def zone(self, spec: str):
        """A zone is a placement (id, or a case-insensitive substring of its
        base / asset name) -> (index, lo, hi); or a point 'x,y,z' -> (None, p, p)."""
        try:
            p = np.array([float(v) for v in spec.split(",")])
            if len(p) == 3:
                return None, p, p
        except ValueError:
            pass
        for i, pl in enumerate(self.bundle["placements"]):
            nm = f"{pl.get('id')} {pl.get('base') or ''} {pl['assetId']}".lower()
            if pl.get("id") == spec or spec.lower() in nm:
                f = np.where(self.owner == i)[0]
                if len(f):
                    v = self.mesh.vertices[self.mesh.faces[f].ravel()]
                    return i, v.min(0), v.max(0)
        raise SystemExit(f"seat-interior: no placement matches {spec!r} in {self.cell}")

    def floor_y(self, x, z, above):
        r = self.ray([x, above, z], [0, -1, 0])
        return None if r is None else float(r[1][1])

    # ---- the four seaters ------------------------------------------------
    def seat_table(self, asset, x, z, top_y, surface_ids):
        """Pivot y when every contact vertex lands on one of `surface_ids`
        within TABLE_TOL_M of one height, else None."""
        v = self.verts(asset)
        c = np.unique(np.round(v[v[:, 1] < v[:, 1].min() + 0.01][:, [0, 2]], 3), axis=0)
        ys = []
        for cx, cz in c:
            r = self.ray([cx + x, top_y, cz + z], [0, -1, 0])
            if r is None or self.owner[r[2]] not in surface_ids:
                return None
            ys.append(r[1][1])
        ys = np.array(ys)
        y = float(np.median(ys))
        if np.abs(ys - y).max() > TABLE_TOL_M:
            return None
        return y - float(v[:, 1].min())

    def seat_on_table(self, asset, idx, lo, hi):
        v = self.verts(asset)
        ex_, ez_ = np.abs(v[:, [0, 2]]).max(0)
        c = (lo + hi) / 2
        hx, hz = (hi - lo)[[0, 2]] / 2
        if idx is None:     # a point: the surface under it
            r = self.ray([c[0], c[1] + 0.3, c[2]], [0, -1, 0])
            if r is None:
                return None
            idx, hx, hz, ex_, ez_ = self.owner[r[2]], 0.0, 0.0, 0.0, 0.0
        offs = sorted(((ox, oz) for ox in np.arange(-hx + ex_, hx - ex_ + 1e-6, 0.05)
                       for oz in np.arange(-hz + ez_, hz - ez_ + 1e-6, 0.05)),
                      key=lambda o: o[0] ** 2 + o[1] ** 2) or [(0.0, 0.0)]
        for ox, oz in offs:
            y = self.seat_table(asset, c[0] + ox, c[2] + oz, hi[1] + 0.4, {idx})
            if y is not None:
                return [round(float(c[0] + ox), 3), round(y, 3), round(float(c[2] + oz), 3)], 0
        return None

    def seat_on_wall(self, asset, idx, lo, hi):
        """The nearest flat vertical shell face within WALL_REACH_M of the
        aim (a point as given; a zone's centre at WALL_EYE_M above its floor),
        the plate flush (5 rays)."""
        c = (lo + hi) / 2
        if idx is None:
            o = c
        else:
            fy = self.floor_y(c[0], c[2], lo[1] + 0.3)
            o = np.array([c[0], (fy if fy is not None else lo[1]) + WALL_EYE_M, c[2]])
        hits = []
        for t in range(16):
            d = np.array([math.cos(t * math.pi / 8), 0, math.sin(t * math.pi / 8)])
            r = self.ray(o, d)
            if r is None or r[0] > WALL_REACH_M + float(np.abs((hi - lo)[[0, 2]]).max()) / 2:
                continue
            nrm = self.mesh.face_normals[r[2]].copy()
            if abs(nrm[1]) > 0.2 or self.bundle["placements"][self.owner[r[2]]].get(
                    "category") not in ("architecture", "misc", None):
                continue
            nrm[1] = 0
            nrm /= np.linalg.norm(nrm)
            if nrm @ d > 0:
                nrm = -nrm
            hits.append((r[0], r[1], nrm))
        v0 = self.verts(asset)
        for _, P, nrm in sorted(hits, key=lambda h: h[0]):
            side = np.cross([0, 1, 0], nrm)
            gaps = []
            for s, u in ((0, 0), (0.3, 0), (-0.3, 0), (0, 0.1), (0, -0.3)):
                r = self.ray(P + nrm * 0.2 + side * s + [0, u, 0], -nrm)
                gaps.append(abs(r[0] - 0.2) if r else 9)
            if max(gaps) <= FLAT_TOL_M:
                return wall_pose(v0, self.light_offset(asset), P, nrm)
        return None

    def seat_on_floor(self, asset, idx, lo, hi):
        v = self.verts(asset)
        h = float(v[:, 1].max() - v[:, 1].min())
        c = (lo + hi) / 2
        rings = [(0.0, 0.0)] if idx is None else [
            (r * math.cos(a), r * math.sin(a)) for r in (0.4, 0.7, 1.0, 1.3, 1.6)
            for a in np.linspace(0, 2 * math.pi, 16, endpoint=False)]
        half = np.zeros(3) if idx is None else (hi - lo) / 2
        for dx, dz in rings:
            x = c[0] + dx + math.copysign(half[0], dx) * (dx != 0)
            z = c[2] + dz + math.copysign(half[2], dz) * (dz != 0)
            fy = self.floor_y(x, z, lo[1] + 0.5)
            if fy is None or abs(fy - lo[1]) > 0.3:
                continue
            up = self.ray([x, fy + 0.05, z], [0, 1, 0])
            if up and up[0] < h + 0.1:
                continue
            return [round(float(x), 3), round(fy - float(v[:, 1].min()), 3), round(float(z), 3)], 0
        return None

    def seat_from_ceiling(self, asset, lo, hi):
        v = self.verts(asset)
        vlo, vhi = v.min(0), v.max(0)
        t = v[v[:, 1] > vhi[1] - 0.03].mean(0)
        x, z = float((lo[0] + hi[0]) / 2), float((lo[2] + hi[2]) / 2)
        fy = self.floor_y(x, z, lo[1] + 0.3)
        if fy is None:
            return None
        r = self.ray([x + t[0], fy + 0.3, z + t[2]], [0, 1, 0])
        if r is None:
            return None
        ceil = float(r[1][1])
        if ceil - (vhi[1] - vlo[1]) < fy + HANG_CLEAR_M:
            return None
        return [round(x, 3), round(ceil - float(vhi[1]), 3), round(z, 3)], 0


def default_mount(asset: str) -> str:
    a = asset.lower()
    if "wall" in a:
        return "wall"
    if "chandelier" in a or "lantern" in a:
        return "ceiling"
    if "floor" in a or a.endswith("/candle01"):
        return "floor"
    return "table"


def seat(cell: str, asset: str, where: str, mount: str | None = None) -> dict:
    """The module entry point behind `wb.py seat-interior`."""
    c = Cell(cell)
    mount = mount or default_mount(asset)
    idx, lo, hi = c.zone(where)
    got = {"table": lambda: c.seat_on_table(asset, idx, lo, hi),
           "wall": lambda: c.seat_on_wall(asset, idx, lo, hi),
           "floor": lambda: c.seat_on_floor(asset, idx, lo, hi),
           "ceiling": lambda: c.seat_from_ceiling(asset, lo, hi)}[mount]()
    if got is None:
        return {"cell": cell, "assetId": asset, "mount": mount, "seated": False}
    pos, yaw = got
    out = {"cell": cell, "assetId": asset, "mount": mount, "seated": True, "pos": pos, "rotZDeg": yaw}
    off = c.light_offset(asset)
    if off is not None:
        out["lightPos"] = [round(float(x), 3) for x in np.asarray(pos) + yaw_matrix(yaw) @ np.asarray(off)]
    return out
