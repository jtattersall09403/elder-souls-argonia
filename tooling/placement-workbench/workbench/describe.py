"""The structured descriptor of one kit piece, generated ONCE per asset
and cached (`output/descriptors/`, keyed on the raw GLB signature and the
manifest row, `schemaVersion` inside).

Geometry (kit frame, z up, pivot at the origin; plan offsets also given as
(x east, z south) to match the sidecars):

* bounds, size, pivot-to-base;
* floors / ceilings: up- / down-facing triangle area binned by height
  (0.05 m) — the planes a thing stands on or under;
* wall faces: side-facing area binned by bearing (15 deg) and plane offset
  (0.1 m);
* openings: a radial ray scan toward the plan centre (every 3 deg, every
  0.2 m of height); a ray that runs clear past the bearing's own wall
  radius is open; connected open cells walled on both sides and above are
  an opening (doorway / window / gap), with bearing, centre, width, height
  and sill;
* symmetry: mean nearest-vertex distance of the mirrored mesh (x and y);
* attachment points: the kit's measured connectors.

Evidence (what the mod authors did with the piece, read from the mined
records, never re-derived): designed sink row, mount anchor + pairs as
child and as parent, abuts pairs / end faces / terminates / single use,
template co-placements, the interiors entrance.
"""
from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path

import numpy as np

from . import paths
from .kits import Catalogue, fit_of

SCHEMA_VERSION = 2
RAY_STEP_M = 0.2
BEARING_STEP_DEG = 3.0
OPEN_BEYOND_M = 0.6         # clear this far inside the bearing's median wall radius = open
SILL_TO_FLOOR_M = 0.6
MIN_OPENING_CELLS = 6
DOOR_PROBE_Z_M = 1.2


EVIDENCE_RECORDS = ("kit-designed-sink.json", "kit-mounts-mined.json",
                    "kit-assemblies-mined.json")


def _key(cat: Catalogue, asset_id: str) -> str:
    """Mesh signature + manifest row + the mined records the evidence is read
    from (size and mtime), so a re-mine or a rebuild invalidates the entry."""
    row = cat.row(asset_id)
    records = [f"{n}|{(paths.PLACEMENT_RECORDS / n).stat().st_size}|"
               f"{int((paths.PLACEMENT_RECORDS / n).stat().st_mtime)}" for n in EVIDENCE_RECORDS]
    sig = cat._glb_signature(asset_id) + json.dumps(row, sort_keys=True) + "|".join(records)
    return hashlib.sha1((asset_id + sig).encode()).hexdigest()[:20]


def describe(cat: Catalogue, asset_id: str, refresh: bool = False) -> dict:
    path = paths.DESCRIPTOR_CACHE / f"{_key(cat, asset_id)}.json"
    if path.exists() and not refresh:
        got = json.loads(path.read_text())
        if got.get("schemaVersion") == SCHEMA_VERSION:
            return got
    out = build(cat, asset_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(out, indent=1))
    return out


def build(cat: Catalogue, asset_id: str) -> dict:
    row = cat.row(asset_id)
    mesh = cat.mesh(asset_id)
    low, high = (np.asarray(v, float) for v in mesh.bounds)
    floors = _planes(mesh, up=True)
    evidence = _evidence(asset_id)
    entrance = (cat.interiors(asset_id) or {}).get("entrance")
    return {
        "schemaVersion": SCHEMA_VERSION,
        "id": asset_id, "kit": row["kit"], "category": row.get("category"),
        "frame": "kit: x east, y north at yaw 0, z up, pivot at origin; planXZ: x east, z south",
        "boundsM": [low.round(3).tolist(), high.round(3).tolist()],
        "sizeM": (high - low).round(3).tolist(),
        "pivotAboveBaseM": round(-float(low[2]), 3),
        "triangles": int(len(mesh.faces)),
        "manifest": {k: row.get(k) for k in ("anchorClass", "anchorClassEvidence",
                                             "designedSinkM", "designedWaterlineM",
                                             "collision", "undersideClosed")}
                    | {"fit": fit_of(row),
                       "anchorMode": (row.get("placement") or {}).get("anchorMode")},
        "floors": floors,
        "ceilings": _planes(mesh, up=False),
        "wallFaces": _walls(mesh),
        "openings": _openings(mesh, floors),
        "symmetry": _symmetry(mesh),
        "footprintM": cat.footprint(asset_id),
        "entrance": entrance,
        "doorways": _doorways(mesh, entrance, evidence.get("doorwaysFromAssemblies"), floors),
        "connectors": cat.connectors(asset_id),
        "evidence": evidence,
    }


# -- geometry ---------------------------------------------------------------
def _planes(mesh, up: bool) -> list[dict]:
    n = mesh.face_normals
    sel = n[:, 2] >= 0.9 if up else n[:, 2] <= -0.9
    if not sel.any():
        return []
    centres = mesh.triangles_center[sel]
    areas = mesh.area_faces[sel]
    bins = np.round(centres[:, 2] / 0.05).astype(int)
    out = []
    for b in np.unique(bins):
        m = bins == b
        area = float(areas[m].sum())
        if area < 0.5:
            continue
        c = centres[m]
        out.append({"zM": round(float(np.average(c[:, 2], weights=areas[m])), 3),
                    "areaM2": round(area, 2),
                    "xRangeM": [round(float(c[:, 0].min()), 2), round(float(c[:, 0].max()), 2)],
                    "yRangeM": [round(float(c[:, 1].min()), 2), round(float(c[:, 1].max()), 2)]})
    out.sort(key=lambda p: -p["areaM2"])
    return out[:8]


def _walls(mesh) -> list[dict]:
    n = mesh.face_normals
    side = np.abs(n[:, 2]) < 0.3
    if not side.any():
        return []
    nn = n[side]
    bearing = (np.degrees(np.arctan2(nn[:, 0], nn[:, 1])) + 360.0) % 360.0
    bb = (np.round(bearing / 15.0).astype(int)) % 24
    centres = mesh.triangles_center[side]
    areas = mesh.area_faces[side]
    out = []
    for b in np.unique(bb):
        m = bb == b
        theta = math.radians(b * 15.0)
        d = np.array([math.sin(theta), math.cos(theta)])
        off = centres[m][:, :2] @ d
        ob = np.round(off / 0.1).astype(int)
        for o in np.unique(ob):
            k = ob == o
            area = float(areas[m][k].sum())
            if area < 1.0:
                continue
            c = centres[m][k]
            out.append({"bearingDeg": b * 15.0, "planeOffsetM": round(o * 0.1, 2),
                        "areaM2": round(area, 2),
                        "zRangeM": [round(float(c[:, 2].min()), 2), round(float(c[:, 2].max()), 2)]})
    out.sort(key=lambda w: -w["areaM2"])
    return out[:12]


def _openings(mesh, floors: list[dict]) -> list[dict]:
    """Radial ray scan: from outside the bounds toward the plan centre, every
    BEARING_STEP_DEG and RAY_STEP_M of height. The wall radius per bearing is
    the median first-hit radius; a ray that runs clear past it by
    OPEN_BEYOND_M is open. Connected open cells with wall on both sides and
    above are an opening. Kind: `doorway` when its sill is within
    SILL_TO_FLOOR_M of a floor plane (the ground line counts) and it is
    0.7-4.5 m wide and 1.6-4 m high; `window` when it sits higher; `gap`
    otherwise (between stilts, under a deck)."""
    from scipy import ndimage
    low, high = (np.asarray(v, float) for v in mesh.bounds)
    centre = (low + high) / 2
    reach = float(np.hypot(high[0] - low[0], high[1] - low[1])) / 2 + 1.0
    bearings = np.arange(0.0, 360.0, BEARING_STEP_DEG)
    zs = np.arange(low[2] + RAY_STEP_M / 2, high[2], RAY_STEP_M)
    if len(zs) < 3:
        return []
    b = np.radians(np.repeat(bearings, len(zs)))
    out_dir = np.column_stack([np.sin(b), np.cos(b), np.zeros_like(b)])
    origins = np.column_stack([centre[0] + out_dir[:, 0] * reach, centre[1] + out_dir[:, 1] * reach,
                               np.tile(zs, len(bearings))])
    locs, idx, _ = mesh.ray.intersects_location(origins, -out_dir, multiple_hits=False)
    radius = np.full(len(origins), -np.inf)
    radius[idx] = reach - np.linalg.norm(locs[:, :2] - origins[idx, :2], axis=1)
    grid = radius.reshape(len(bearings), len(zs)).T          # rows z, cols bearing
    hit = np.isfinite(grid)
    wall = np.array([np.median(col[np.isfinite(col)]) if np.isfinite(col).sum() >= 3 else np.nan
                     for col in grid.T])
    open_ = ~hit | (grid < wall[None, :] - OPEN_BEYOND_M)
    open_[:, np.isnan(wall)] = False
    closed = ~open_
    # roll so a closed column comes first: an opening never straddles the seam
    shift = int(np.argmax(closed.any(axis=0))) if closed.any() else 0
    open_r, closed_r = np.roll(open_, -shift, axis=1), np.roll(closed, -shift, axis=1)
    left = np.maximum.accumulate(closed_r, axis=1)
    right = np.maximum.accumulate(closed_r[:, ::-1], axis=1)[:, ::-1]
    above = np.maximum.accumulate(closed_r[::-1], axis=0)[::-1]
    labels, count = ndimage.label(open_r & left & right & above)
    floor_z = [low[2]] + [f["zM"] for f in floors if f["areaM2"] >= 2.0]
    out = []
    for k in range(1, count + 1):
        cells = np.argwhere(labels == k)
        if len(cells) < MIN_OPENING_CELLS:
            continue
        r0, r1 = cells[:, 0].min(), cells[:, 0].max()
        cols = (np.unique(cells[:, 1]) + shift) % len(bearings)
        c_lo, c_hi = cells[:, 1].min(), cells[:, 1].max()
        mid = ((c_lo + c_hi) / 2 + shift) % len(bearings)
        bearing = float(mid * BEARING_STEP_DEG)
        r_wall = float(np.nanmedian(wall[cols]))
        width = math.radians((c_hi - c_lo + 1) * BEARING_STEP_DEG) * r_wall
        height = (r1 - r0 + 1) * RAY_STEP_M
        sill = float(zs[r0] - RAY_STEP_M / 2)
        if width < 0.5 or height < 0.6:
            continue
        on_floor = min(abs(sill - fz) for fz in floor_z) <= SILL_TO_FLOOR_M
        kind = ("doorway" if on_floor and 0.7 <= width <= 4.5 and 1.6 <= height <= 4.0
                else "window" if not on_floor and height <= 3.0 else "gap")
        rb = math.radians(bearing)
        x, y = centre[0] + r_wall * math.sin(rb), centre[1] + r_wall * math.cos(rb)
        out.append({"bearingDeg": round(bearing, 1), "kind": kind,
                    "centreKitM": [round(x, 2), round(y, 2), round(sill + height / 2, 2)],
                    "centrePlanXZ": [round(x, 2), round(-y, 2)],
                    "wallRadiusM": round(r_wall, 2), "widthM": round(width, 2),
                    "heightM": round(height, 2), "sillM": round(sill, 2)})
    order = {"doorway": 0, "window": 1, "gap": 2}
    out.sort(key=lambda o: (order[o["kind"]], -o["widthM"] * o["heightM"]))
    return out[:12]


def _doorways(mesh, entrance: dict | None, assembly: dict | None,
              floors: list[dict]) -> list[dict]:
    """The doorways the RECORDS give (the kit's measured entrance, the mined
    assembly doorways), each checked against the mesh: a ray cast inward
    along the doorway's bearing DOOR_PROBE_Z_M over the base and over each
    floor plane, and the radius where it first meets the mesh. A `-with-door` composite carries
    its door leaf, so a doorway is usually closed geometry: the probe shows
    whether the mesh stands in the doorway's wall line (|probe - record|
    small), not whether it is open."""
    low, high = (np.asarray(v, float) for v in mesh.bounds)
    rows = []
    if entrance and entrance.get("offsetM"):
        x, z = entrance["offsetM"][:2]
        rows.append({"source": f"entrance:{entrance.get('kind')}", "planXZ": [x, z],
                     "sideDeg": entrance.get("sideDeg")})
    for d in (assembly or {}).get("doorways", []) if isinstance(assembly, dict) else []:
        ox, oy = d["offsetLocalM"][:2]
        rows.append({"source": f"assembly:{d.get('doorPiece')}", "planXZ": [ox, -oy],
                     "sideDeg": d.get("sideDeg"), "riseM": d.get("riseM")})
    reach = float(np.hypot(high[0] - low[0], high[1] - low[1])) + 2.0
    for row in rows:
        x, z = row["planXZ"]
        r = math.hypot(x, z)
        bearing = row["sideDeg"] if row["sideDeg"] is not None else math.degrees(math.atan2(x, -z))
        b = math.radians(bearing)
        out = np.array([math.sin(b), math.cos(b), 0.0])
        probes = []
        for floor_z in sorted({float(low[2])} | {f["zM"] for f in floors if f["areaM2"] >= 2.0}):
            origin = out * reach
            origin[2] = floor_z + DOOR_PROBE_Z_M
            locs, _i, _t = mesh.ray.intersects_location([origin], [-out], multiple_hits=False)
            probes.append({"floorZM": round(floor_z, 2),
                           "meshRadiusM": None if not len(locs)
                           else round(float(np.linalg.norm(locs[0][:2])), 2)})
        row.update({"bearingDeg": round(float(bearing) % 360.0, 2), "radiusM": round(r, 2),
                    "probes": probes})
    return rows


def _symmetry(mesh) -> dict:
    from scipy.spatial import cKDTree
    v = np.asarray(mesh.vertices)
    if len(v) > 6000:
        v = v[np.linspace(0, len(v) - 1, 6000).astype(int)]
    tree = cKDTree(v)
    c = (np.asarray(mesh.bounds[0]) + np.asarray(mesh.bounds[1])) / 2
    out = {}
    for name, axis in (("mirrorX", 0), ("mirrorY", 1)):
        m = v.copy()
        m[:, axis] = 2 * c[axis] - m[:, axis]
        d, _ = tree.query(m)
        out[name] = {"meanM": round(float(d.mean()), 3), "symmetric": bool(d.mean() < 0.05)}
    return out


# -- evidence ---------------------------------------------------------------
_RECORDS: dict[str, dict] = {}


def _record(name: str) -> dict:
    if name not in _RECORDS:
        _RECORDS[name] = json.loads((paths.PLACEMENT_RECORDS / name).read_text())
    return _RECORDS[name]


def _evidence(asset_id: str) -> dict:
    sink = _record("kit-designed-sink.json").get("assets", {}).get(asset_id)
    mounts = _record("kit-mounts-mined.json")
    asm = _record("kit-assemblies-mined.json")
    abuts = asm.get("abuts", {})
    short = lambda p: {k: p.get(k) for k in ("kind", "child", "parent", "n", "offsetM", "yawDeg",
                                            "alongAxis", "alongMinM", "alongMaxM")}
    pairs = [dict(p, offsetM=p.get("offsetM")) for p in abuts.get("pairs", [])
             if asset_id in (p["parent"], p["child"])]
    templates = []
    for set_id, s in asm.get("sets", {}).items():
        for t in s.get("templates", []):
            if asset_id in (t.get("anchor"), t.get("part")):
                templates.append({k: t.get(k) for k in ("id", "anchor", "part", "count", "offsetM",
                                                        "yawDeg", "isDoor")})
    templates.sort(key=lambda t: -(t["count"] or 0))
    return {
        "designedSink": sink,
        "mountAnchor": mounts.get("anchors", {}).get(asset_id),
        "mountsAsChild": [short(p) for p in mounts.get("pairs", []) if p["child"] == asset_id],
        "mountsAsParent": [short(p) for p in mounts.get("pairs", []) if p["parent"] == asset_id][:12],
        "abutsPairs": sorted(pairs, key=lambda p: -p["count"])[:12],
        "endFaces": abuts.get("endFaces", {}).get(asset_id),
        "terminates": abuts.get("terminates", {}).get(asset_id),
        "singleUse": asset_id in set(abuts.get("singleUse", [])),
        "placedByPlugins": abuts.get("placedAssets", {}).get(asset_id),
        "coPlacements": templates[:12],
        "doorwaysFromAssemblies": asm.get("doorwaysFromAssemblies", {}).get(asset_id),
    }
