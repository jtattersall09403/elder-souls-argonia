"""Audit one published interior cell on its actual geometry and its shipped
textures (16k walk 6, decision 0106 decision 11): the measurements the
reader checklist rows 'texture resolves', 'support below', 'stairs land',
'hearth lit' and 'lit density' read.

    wb.py audit-interior [CELL ...] [--out JSON]      (no CELL: every published cell)

Per cell, from `public/province/interiors/<cell>.json` and the kits it names:

* **textures**: every texture a placed piece's parts GLB names exists under
  `parts/tex/`; a diffuse the kit build left missing, or stood in by a LOD
  copy (a `/lod/` path in the kit's `texturesSubstituted`) on a piece larger
  than `LOD_OK_M`, is red: at room distance it reads as a flat colour (the
  Lilmoth shells' teal walls, walk 6).
* **floating**: a piece touches nothing within `SUPPORT_M` in any of six
  directions (down from its bottom points, up from its top, out from its
  four sides), skipping its own faces. Covers a table in the air, a floor
  plank hanging, a candle off its wall.
* **stairs**: a stair piece's bottom rests on a surface and a surface lies
  within `LANDING_M` of its top step, `LANDING_REACH_M` past its top edge.
* **hearth**: a hearth, fireplace or fire pit piece, or a dropped plugin
  fire effect (`FXfire*`), has a flame-bearing piece within `HEARTH_M`; a
  dropped `FXfire*` ref is red on its own. An extinguished plugin fire
  (`FXfireWithEmbersOut`, the `*Out` dead-embers forms) is the author's cold
  hearth: its drop is no defect and it counts as the hearth's fire.
* **lit density** (decision 0109 rule 4): lit fixtures (a kit asset with a
  mined `light`) >= reachable floor m2 / `M2_PER_LIT` (walk cells flooded
  from the door arrivals; a table top or shelf is not floor).

The measurement reads the shipped bundle and the raw kit geometry the
exporter measured; it fails on a real defect (`test_interior_audit.py`).
"""
from __future__ import annotations

import json
import re
import struct
import sys
from pathlib import Path

import numpy as np

from workbench import paths

if str(paths.WORLDGEN) not in sys.path:
    sys.path.insert(0, str(paths.WORLDGEN))

from worldgen import interior_support as isup  # noqa: E402
from worldgen import interior_walk as iw  # noqa: E402

SUPPORT_M = 0.05
LANDING_M = 0.30
LANDING_REACH_M = 0.30
HEARTH_M = 1.5
M2_PER_LIT = 12.0
LOD_OK_M = 3.0
HEARTH_RE = re.compile(r"hearth|fireplace|firepit", re.I)
FLAME_RE = re.compile(r"fxfirewithembers|burning|campfire", re.I)
COLD_FIRE_RE = re.compile(r"^fxfire\w*out$", re.I)
PROBE = 0.03   # rays start this far inside the piece; hits closer than it are the piece's own skin


def _glb_json(path: Path) -> dict:
    b = path.read_bytes()
    n = struct.unpack("<I", b[12:16])[0]
    return json.loads(b[20:20 + n])


class Kits:
    """The published kit manifests and parts indexes, loaded once."""

    def __init__(self, kits_dir: Path):
        self.dir = kits_dir
        self.assets: dict[tuple[str, str], dict] = {}
        self.subst: dict[str, dict[str, str]] = {}
        self.missing: dict[str, set[str]] = {}
        self.parts: dict[str, dict] = {}
        for path in sorted(kits_dir.glob("*.kit.json")):
            kit = path.name[: -len(".kit.json")]
            d = json.loads(path.read_text())
            for a in d.get("assets") or []:
                self.assets[(kit, a["id"])] = a
            self.subst[kit] = {Path(k).name.lower(): v for k, v in (d.get("texturesSubstituted") or {}).items()}
            self.missing[kit] = {Path(k).name.lower() for k in d.get("texturesMissing") or []}
            idx = kits_dir / kit / "parts" / "index.json"
            if idx.exists():
                self.parts[kit] = json.loads(idx.read_text()).get("assets") or {}

    def lit(self, kit: str, asset: str) -> bool:
        a = self.assets.get((kit, asset)) or {}
        return isinstance(a.get("light"), dict) or bool(a.get("flames"))

    def living(self, kit: str, asset: str) -> bool:
        """A piece someone lives at (0109 rule 4's living zones: bed, table,
        seat, workstation, hearth): kit category furniture, or a hearth."""
        a = self.assets.get((kit, asset)) or {}
        return a.get("category") == "furniture" or bool(HEARTH_RE.search(asset))


def texture_rows(bundle: dict, kits: Kits) -> list[dict]:
    rows, seen = [], set()
    for p in bundle["placements"]:
        kit, asset = p["kit"], p["assetId"]
        if (kit, asset) in seen:
            continue
        seen.add((kit, asset))
        a = kits.assets.get((kit, asset))
        if a is None:
            rows.append({"assetId": asset, "kit": kit, "why": "asset not in the published kit"})
            continue
        part = kits.parts.get(kit, {}).get(asset)
        if part is None:
            rows.append({"assetId": asset, "kit": kit, "why": "no parts GLB in the kit's parts index"})
        else:
            pdir = kits.dir / kit / "parts"
            for im in _glb_json(pdir / part["file"]).get("images") or []:
                uri = im.get("uri")
                if uri and not (pdir / uri).exists():
                    rows.append({"assetId": asset, "kit": kit, "why": f"texture {uri} not published"})
        big = max(a.get("sizeM") or [0]) * float(p.get("scale", 1.0)) > LOD_OK_M
        for t in a.get("textures") or []:
            t = t.lower()
            if t.endswith("_n.dds") or t.endswith("_m.dds"):
                continue
            if t in kits.missing.get(kit, ()):
                rows.append({"assetId": asset, "kit": kit, "texture": t, "why": "diffuse missing from the kit build"})
            stand = kits.subst.get(kit, {}).get(t)
            if big and stand and "/lod/" in stand.lower() and a.get("category") in ("architecture", "misc"):
                rows.append({"assetId": asset, "kit": kit, "texture": t, "standIn": stand,
                             "why": "diffuse stood in by a LOD copy on a room-sized piece (reads flat)"})
    return rows


def _first_hit(mesh, owner, i: int, origins: np.ndarray, d: np.ndarray) -> float:
    """Smallest gap along `d` from `origins` (already pulled PROBE inside) to a face not piece i's."""
    if not len(origins):
        return float("inf")
    dirs = np.tile(d, (len(origins), 1))
    ri, ti, dist = isup.all_hits(mesh, np.asarray(origins, float), dirs)
    if not len(ri):
        return float("inf")
    dist = dist - PROBE
    keep = owner[ti] != i
    return float(max(dist[keep].min(), 0.0)) if keep.any() else float("inf")


def _pick(v: np.ndarray, n: int = 10) -> np.ndarray:
    if len(v) <= n:
        return v
    return v[np.linspace(0, len(v) - 1, n).astype(int)]


def _foot_under_floor(mesh, owner, i: int, foot: np.ndarray, rise: float) -> bool:
    """The stair's lowest vertices run under another piece's floor within the
    lower half of its rise: the plugin sank the stringer through the floor
    (KeebaHouseSnailMinder's `mudhutintstairs` foot sits 0.83 m under its
    `floor02`, above the pod's sunken shell; walk 6), so the stair lands on
    that floor and its buried foot is no gap."""
    if not len(foot):
        return False
    ri, ti, dist = isup.all_hits(mesh, foot - [0, PROBE, 0], np.tile([0, 1.0, 0], (len(foot), 1)))
    return bool(((owner[ti] != i) & (np.abs(mesh.face_normals[ti][:, 1]) > 0.7)
                 & (dist - PROBE <= rise)).any())


def stair_rows(bundle: dict, mesh, owner) -> list[dict]:
    rows = []
    for i, p in enumerate(bundle["placements"]):
        if "stair" not in p["assetId"].lower():
            continue
        f = np.where(owner == i)[0]
        if not len(f):
            continue
        v = mesh.vertices[mesh.faces[f].ravel()]
        lo, hi = v.min(0), v.max(0)
        foot = _pick(v[v[:, 1] < lo[1] + 0.02])
        bottom = _first_hit(mesh, owner, i, foot + [0, PROBE, 0], np.array([0, -1.0, 0]))
        if bottom > SUPPORT_M and _foot_under_floor(mesh, owner, i, foot, (hi[1] - lo[1]) / 2):
            bottom = 0.0
        top = v[v[:, 1] > hi[1] - 0.05]
        c = (lo + hi) / 2
        off = top.mean(0) - c
        off[1] = 0
        ax = int(np.argmax(np.abs(off[[0, 2]]))) * 2
        d = np.zeros(3)
        d[ax] = np.sign(off[ax]) or 1.0
        edge = top.mean(0).copy()
        edge[ax] = hi[ax] if d[ax] > 0 else lo[ax]
        probe = edge + d * LANDING_REACH_M + [0, 1.0, 0]
        _, ti, dist = isup.all_hits(mesh, probe[None], np.array([[0, -1.0, 0]]))
        ys = [float(probe[1] - t_) for t_, t in zip(dist, ti) if owner[t] != i and abs(probe[1] - t_ - hi[1]) <= LANDING_M]
        ok_top = bool(ys)
        if bottom > SUPPORT_M or not ok_top:
            rows.append({"id": p["id"], "assetId": p["assetId"], "bottomGapM": round(bottom, 3),
                         "topLanding": ok_top, "topY": round(float(hi[1]), 3)})
    return rows


def hearth_rows(bundle: dict, kits: Kits) -> list[dict]:
    pieces = bundle["placements"] + [dict(s, assetId=s["standInAsset"]) for s in bundle.get("substitutions") or []]
    flames = [np.asarray(p["positionM"], float) for p in pieces
              if FLAME_RE.search(p["assetId"]) or (kits.assets.get((p["kit"], p["assetId"])) or {}).get("flames")
              and "candle" not in p["assetId"] and "lantern" not in p["assetId"]]
    rows = []
    beds = [(p["id"], p["assetId"], p["positionM"]) for p in bundle["placements"] if HEARTH_RE.search(p["assetId"])]
    cold = [d for d in bundle.get("drops") or [] if COLD_FIRE_RE.match(d.get("base") or "")]
    flames += [np.asarray(d["positionM"], float) for d in cold if d.get("positionM")]
    for d in bundle.get("drops") or []:
        if d in cold:
            continue
        if (d.get("base") or "").lower().startswith("fxfire") and not any(
                np.linalg.norm(f - np.asarray(d.get("positionM") or [1e9] * 3, float)) <= HEARTH_M for f in flames):
            rows.append({"refId": d["refId"], "base": d["base"], "why": "the plugin's hearth fire is dropped"})
    for pid, asset, pos in beds:
        near = [np.linalg.norm((f - pos)[[0, 2]]) for f in flames]
        if not near or min(near) > HEARTH_M + 2.0:   # a hearth wall piece's pivot sits off its fire bed
            rows.append({"id": pid, "assetId": asset, "why": "no fire within reach of the hearth"})
    return rows


def reachable_floor_m2(mesh, owner, starts: list) -> tuple[float, str]:
    """The floor the player can reach: walk cells flooded from the door
    arrivals, so a table top, a shelf or a bed (a step too high to climb) is
    not floor. A cell with no arrival on a walkable surface (a pool cell)
    falls back to every roofed standable node, and says so. Surfaces stacked
    in one walk column less than a storey (the character's height) apart are
    one floor cell: a rug on the floor, a plank laid over a plank, a low step
    (KeebaHouseFisher counted 1097 cells for 627, walk 6)."""
    ch = iw.character()
    walk = iw.walk_mesh(mesh, owner, starts, [], want_reached=True)
    pts, how = walk.get("reachedPositions") or [], "reached"
    if not pts:
        pts, how = iw.walk_mesh(mesh, owner, starts, [], nodes_only=True).get("positions") or [], \
            "roofedNodes"
    cols: dict[tuple, list] = {}
    for x, y, z in pts:
        cols.setdefault((round(x, 2), round(z, 2)), []).append(y)
    n = 0
    for ys in cols.values():
        last = None
        for y in sorted(ys):
            if last is None or y - last > ch["heightM"]:
                n, last = n + 1, y
    return n * ch["cellM"] ** 2, how


def audit_cell(cell: str, kits: Kits, interiors_dir: Path) -> dict:
    bundle = json.loads((interiors_dir / f"{cell}.json").read_text())
    mesh, owner, missing = iw.bundle_mesh(bundle, iw.RAW_KITS)
    floating = []
    gaps = isup.contact_gaps(mesh, owner, len(bundle["placements"]))
    span = mesh.bounds[1] - mesh.bounds[0]
    for i, p in enumerate(bundle["placements"]):
        g = gaps[i]
        f = np.where(owner == i)[0]
        if len(f):
            v = mesh.vertices[mesh.faces[f].ravel()]
            if ((v.max(0) - v.min(0)) >= 0.8 * span).sum() >= 2:
                continue    # the shell: it encloses the room, nothing lies outside it
        if len(f) and g > SUPPORT_M:
            floating.append({"id": p["id"], "assetId": p["assetId"], "source": p.get("source") or "plugin",
                             "gapM": None if g == float("inf") else round(g, 3),
                             "positionM": [round(x, 2) for x in p["positionM"]]})
    starts = [d["arrivalMarker"]["positionM"] for d in bundle.get("doors") or []
              if d.get("arrivalMarker")] + [bundle["arrivalMarker"]["positionM"]]
    area, area_from = reachable_floor_m2(mesh, owner, starts)
    lit = sum(1 for p in bundle["placements"] if kits.lit(p["kit"], p["assetId"]))
    living = sum(1 for p in bundle["placements"] if kits.living(p["kit"], p["assetId"]))
    # 0109 rule 4 lights the zones people live in; a cell with none (a beast's
    # cave, 16k walk 9) keeps its plugin's own lights and its dark
    needed = int(np.ceil(area / M2_PER_LIT)) if living else 0
    out = {
        "cell": cell,
        "textures": texture_rows(bundle, kits),
        "floating": floating,
        "stairs": stair_rows(bundle, mesh, owner),
        "hearth": hearth_rows(bundle, kits),
        "litDensity": {"walkableM2": round(area, 1), "areaFrom": area_from, "litFixtures": lit,
                       "livingPieces": living, "needed": needed, "ok": bool(lit >= needed)},
        "assetsWithoutGeometry": sorted(set(missing)),
    }
    # two surfaces on one plane z-fight (16k walk 6); worldgen/coplanar.py
    from worldgen import coplanar
    out["coplanar"] = coplanar.find(coplanar.pieces_from_bundle(bundle["placements"], coplanar.KitGeometry()),
                                    coplanar.decals_biased("cell"))
    out["red"] = {k: len(out[k]) for k in ("textures", "floating", "stairs", "hearth", "coplanar") if out[k]}
    if not out["litDensity"]["ok"]:
        out["red"]["litDensity"] = 1
    return out


def audit(cells: list[str] | None = None, interiors_dir: Path | None = None,
          kits_dir: Path | None = None) -> list[dict]:
    interiors_dir = interiors_dir or paths.PUBLIC / "province" / "interiors"
    kits = Kits(kits_dir or paths.PUBLIC / "kits")
    cells = cells or sorted(p.stem for p in interiors_dir.glob("*.json"))
    return [audit_cell(c, kits, interiors_dir) for c in cells]
