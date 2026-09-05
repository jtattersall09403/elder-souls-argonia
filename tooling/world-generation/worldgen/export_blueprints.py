"""Export the settlement blueprints for World Studio's interactive Blueprint view.

    python3 -m worldgen.export_blueprints            # from tooling/world-generation
    python3 -m worldgen.export_blueprints --no-terrain   # JSON only, no backdrops

Writes:

  * ``apps/world-studio/public/province/blueprints.json`` — one entry per
    ``world/sources/blueprints/place.*.json``, with **every coordinate already
    in world metres** (X east, Z south, origin at the province's north-west
    corner — module 00-core §8). The browser never converts UV.
  * ``apps/world-studio/public/province/blueprints/<id>.png`` — a small
    hillshade + water crop per blueprint, the viewer's terrain backdrop, with
    its metre extent recorded in the JSON.

Why this exists (owner, 2026-09-05): the static ``render_blueprint`` PNGs put
everything on one sheet, and at village density that reads as "a lot of stuff
jumbled on top of each other". The studio view can zoom, pan, hide classes and
show a thing's *why* on click; this exporter is the data feed for it. The
static renderer stays — it is the print medium, this is the review medium.

Determinism (standard 6): sorted keys, ``indent=2``, one trailing newline; the
PNGs are written by PIL from a deterministic float pipeline and carry no
timestamp, so a clean re-run is byte-identical.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np

from .blueprint import BLUEPRINT_DIR
from .render_blueprint import PROVINCE_EXTENT_M, crop_box
from .site_fields import PROVINCE, REPO_ROOT

SCHEMA_VERSION = 1
OUT_DIR = REPO_ROOT / "apps" / "world-studio" / "public" / "province"
OUT_PATH = OUT_DIR / "blueprints.json"
CROP_DIR = OUT_DIR / "blueprints"
CROP_PX = 600
PAD_M = 60.0

# Object classes the viewer can toggle; the order is the checklist order.
LAYERS = ["terrain", "boundary", "clearance", "districts", "ways", "parcels",
          "doors", "landmarks", "docks", "combatSpaces", "questSockets", "siting"]


# --------------------------------------------------------------------------- #
# coordinates
# --------------------------------------------------------------------------- #
def _m(pt, extent_m: float) -> list[float]:
    """One [u, v] pair → [x, z] metres, rounded to the millimetre."""
    return [round(float(pt[0]) * extent_m, 3), round(float(pt[1]) * extent_m, 3)]


def _poly_m(pts, extent_m: float) -> list[list[float]] | None:
    if not isinstance(pts, list) or not pts:
        return None
    if len(pts) == 2 and all(isinstance(c, (int, float)) for c in pts):
        return [_m(pts, extent_m)]
    out = [_m(p, extent_m) for p in pts
           if isinstance(p, list) and len(p) == 2 and all(isinstance(c, (int, float)) for c in p)]
    return out or None


def _point_m(pt, extent_m: float) -> list[float] | None:
    if isinstance(pt, list) and len(pt) == 2 and all(isinstance(c, (int, float)) for c in pt):
        return _m(pt, extent_m)
    return None


def _centroid(poly: list[list[float]] | None) -> list[float] | None:
    if not poly:
        return None
    xs = [p[0] for p in poly]
    zs = [p[1] for p in poly]
    return [round(sum(xs) / len(xs), 3), round(sum(zs) / len(zs), 3)]


# --------------------------------------------------------------------------- #
# projection
# --------------------------------------------------------------------------- #
def _ways(bp: dict, extent_m: float) -> list[dict]:
    """Routes, canals and boardwalks in one list, each tagged with its group so
    the viewer can style and toggle them together or apart."""
    out = []
    for group in ("routes", "canals", "boardwalks"):
        for w in bp.get(group) or []:
            pts = _poly_m(w.get("points"), extent_m)
            if not pts:
                continue
            out.append({
                "id": w.get("id"),
                "group": group,
                "kind": w.get("kind") or group[:-1],
                "widthM": w.get("widthM"),
                "notes": w.get("notes"),
                "points": pts,
            })
    out.sort(key=lambda w: (w["group"], str(w["id"])))
    return out


def _parcels(bp: dict, extent_m: float) -> list[dict]:
    """Parcels, read generically: whatever polygon the record holds (`footprint`
    today) becomes `polygon`, and the optional Part 7 fields (`centreUV`,
    `yawDeg`, `orientationWhy`) are carried through when present."""
    out = []
    for p in bp.get("parcels") or []:
        poly = _poly_m(p.get("footprint"), extent_m)
        centre = _point_m(p.get("centreUV"), extent_m) or _centroid(poly) \
            or _point_m(p.get("position"), extent_m)
        out.append({
            "id": p.get("id"),
            "districtId": p.get("districtId"),
            "use": p.get("use"),
            "buildingFamily": p.get("buildingFamily"),
            "assetRef": p.get("assetRef"),
            "groundFit": p.get("groundFit"),
            "yawDeg": p.get("yawDeg"),
            "orientationWhy": p.get("orientationWhy"),
            "notes": p.get("notes"),
            "polygon": poly,
            "centreM": centre,
        })
    out.sort(key=lambda p: str(p["id"]))
    return out


def _doors(bp: dict, extent_m: float) -> list[dict]:
    out = []
    for d in bp.get("doors") or []:
        claim = d.get("interiorClaim") or {}
        out.append({
            "id": d.get("id"),
            "parcelId": d.get("parcelId"),
            "facingDeg": d.get("facingDeg"),
            "thresholdM": _point_m(d.get("thresholdUV"), extent_m),
            "interiorClaim": {
                "sizeClass": claim.get("sizeClass"),
                "culture": claim.get("culture"),
                "owner": claim.get("owner"),
            },
        })
    out.sort(key=lambda d: str(d["id"]))
    return out


def _clearance(bp: dict, extent_m: float) -> dict:
    c = bp.get("clearance") or {}
    kept = []
    for k in c.get("kept") or []:
        kept.append({
            "id": k.get("id"), "kind": k.get("kind"), "notes": k.get("notes"),
            "positionM": _point_m(k.get("position"), extent_m),
        })
    kept.sort(key=lambda k: str(k["id"]))
    return {
        "hardClear": [poly for poly in (_poly_m(p, extent_m) for p in c.get("hardClear") or []) if poly],
        "thinned": [poly for poly in (_poly_m(p, extent_m) for p in c.get("thinned") or []) if poly],
        "kept": kept,
    }


def _siting(bp: dict, extent_m: float) -> dict | None:
    s = bp.get("siting") or {}
    if not s:
        return None
    cands = []
    for c in s.get("candidates") or []:
        pos = c.get("positionM")
        cands.append({
            "id": c.get("id"),
            "chosen": bool(c.get("chosen")),
            "why": c.get("why"),
            "rejectedBecause": c.get("rejectedBecause"),
            # positionM is already metres in the blueprint (Part 6 convention).
            "positionM": [round(float(pos[0]), 3), round(float(pos[1]), 3)]
            if isinstance(pos, list) and len(pos) == 2 else None,
        })
    cands.sort(key=lambda c: str(c["id"]))
    return {"dossier": s.get("dossier"), "candidates": cands}


def project(doc: dict, extent_m: float) -> dict:
    """One blueprint document → the studio entry, everything in metres."""
    bp = doc["blueprint"]
    districts = []
    for d in bp.get("districts") or []:
        poly = _poly_m(d.get("boundary"), extent_m)
        districts.append({
            "id": d.get("id"), "kind": d.get("kind"), "cultureKit": d.get("cultureKit"),
            "wealth": d.get("wealth"), "notes": d.get("notes"),
            "polygon": poly, "centreM": _centroid(poly),
        })
    districts.sort(key=lambda d: str(d["id"]))

    landmarks = sorted(
        ({"id": lm.get("id"), "kind": lm.get("kind"), "assetRef": lm.get("assetRef"),
          "notes": lm.get("notes"), "positionM": _point_m(lm.get("position"), extent_m)}
         for lm in bp.get("landmarks") or []),
        key=lambda lm: str(lm["id"]))
    docks = sorted(
        ({"id": dk.get("id"), "waterBodyId": dk.get("waterBodyId"),
          "piledToBed": dk.get("piledToBed"), "notes": dk.get("notes"),
          "positionM": _point_m(dk.get("position"), extent_m)}
         for dk in bp.get("docks") or []),
        key=lambda dk: str(dk["id"]))
    combat = sorted(
        ({"id": cs.get("id"), "clearanceClass": cs.get("clearanceClass"),
          "notes": cs.get("notes"), "polygon": _poly_m(cs.get("boundary"), extent_m)}
         for cs in bp.get("combatSpaces") or []),
        key=lambda cs: str(cs["id"]))
    sockets = sorted(
        ({"id": s.get("id"), "kind": s.get("kind"), "parcelId": s.get("parcelId"),
          "ownerQuestTier": s.get("ownerQuestTier"), "notes": s.get("notes"),
          "positionM": _point_m(s.get("position"), extent_m)}
         for s in bp.get("questSockets") or []),
        key=lambda s: str(s["id"]))

    parcels = _parcels(bp, extent_m)
    ways = _ways(bp, extent_m)
    entry = {
        "id": bp["id"],
        "seed": bp.get("seed"),
        "causalModel": bp.get("causalModel") or {},
        "boundary": _poly_m(bp.get("boundary"), extent_m),
        "districts": districts,
        "parcels": parcels,
        "ways": ways,
        "landmarks": landmarks,
        "docks": docks,
        "doors": _doors(bp, extent_m),
        "combatSpaces": combat,
        "questSockets": sockets,
        "clearance": _clearance(bp, extent_m),
        "siting": _siting(bp, extent_m),
        "budget": bp.get("budget") or {},
        "provision": bp.get("provision") or {},
        "assetConstraints": list(bp.get("assetConstraints") or []),
        "terrain": None,
        "summary": {},
    }
    entry["summary"] = {
        "districts": len(districts), "parcels": len(parcels), "ways": len(ways),
        "landmarks": len(landmarks), "docks": len(docks), "doors": len(entry["doors"]),
        "combatSpaces": len(combat), "questSockets": len(sockets),
        "keptTrees": len(entry["clearance"]["kept"]),
        "sitingCandidates": len((entry["siting"] or {}).get("candidates") or []),
    }
    return entry


# --------------------------------------------------------------------------- #
# terrain backdrop
# --------------------------------------------------------------------------- #
def _shade_rgb(height: np.ndarray, depth: np.ndarray, px_m: float) -> np.ndarray:
    """Hillshade in grey, open water tinted blue by depth. Pure float maths, so
    the same crop always yields the same bytes."""
    gz, gx = np.gradient(height.astype(np.float64), px_m)
    slope = np.arctan(np.hypot(gx, gz))
    aspect = np.arctan2(-gz, gx)
    az, alt = math.radians(315.0), math.radians(45.0)
    shade = np.clip(np.sin(alt) * np.cos(slope)
                    + np.cos(alt) * np.sin(slope) * np.cos(az - aspect), 0.0, 1.0)
    grey = 0.18 + 0.72 * shade
    rgb = np.repeat(grey[..., None], 3, axis=2)
    wet = np.clip(depth / 4.0, 0.0, 1.0)
    water = np.stack([0.16 + 0.10 * (1 - wet), 0.36 + 0.18 * (1 - wet),
                      0.55 + 0.20 * (1 - wet)], axis=2)
    a = np.where(depth > 0.05, 0.70, 0.0)[..., None]
    return np.clip(rgb * (1 - a) + water * a, 0.0, 1.0)


def write_crop(bp: dict, fields, extent_m: float, out_dir: Path) -> dict:
    """Write ``<id>.png`` for one blueprint; return its metre extent record."""
    from PIL import Image

    from .render_blueprint import TerrainCrop

    crop = TerrainCrop(crop_box(bp, extent_m, PAD_M), fields)
    rgb = _shade_rgb(crop.height, crop.depth, crop.px_m)
    if rgb.shape[0] < 2 or rgb.shape[1] < 2:
        return {}
    img = Image.fromarray(np.round(rgb * 255).astype(np.uint8), mode="RGB")
    img = img.resize((CROP_PX, CROP_PX), Image.BILINEAR)
    out_dir.mkdir(parents=True, exist_ok=True)
    img.save(out_dir / f"{bp['id']}.png", format="PNG", optimize=True)
    x0, x1, z1, z0 = crop.extent      # imshow extent, z down
    return {
        "image": f"province/blueprints/{bp['id']}.png",
        "x0": round(float(x0), 3), "z0": round(float(z0), 3),
        "x1": round(float(x1), 3), "z1": round(float(z1), 3),
        "pxM": round(float(crop.px_m), 6),
    }


# --------------------------------------------------------------------------- #
# bundle
# --------------------------------------------------------------------------- #
def load_docs(src_dir: Path) -> list[dict]:
    docs = []
    for path in sorted(src_dir.glob("place.*.json")):
        doc = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(doc, dict) and isinstance(doc.get("blueprint"), dict):
            docs.append(doc)
    return docs


def build_bundle(src_dir: Path = BLUEPRINT_DIR, *, terrain: bool = True,
                 crop_dir: Path = CROP_DIR, province: Path = PROVINCE) -> dict:
    docs = load_docs(src_dir)
    fields = None
    crop_extent_m = PROVINCE_EXTENT_M
    if terrain and docs:
        from .compile_scatter import ProvinceFields
        fields = ProvinceFields(province)
        # The raster's own extent (7373.507 m) crops the backdrop pixel-exactly;
        # the geometry always uses the published province extent, so the JSON is
        # identical with or without the rasters (the staleness test relies on it —
        # the two differ by 3 mm across the whole province).
        crop_extent_m = float(fields.height_m.shape[0] * fields.px_m)
    extent_m = PROVINCE_EXTENT_M
    entries = []
    for doc in docs:
        entry = project(doc, extent_m)
        if fields is not None:
            entry["terrain"] = write_crop(doc["blueprint"], fields, crop_extent_m, crop_dir) or None
        entries.append(entry)
    entries.sort(key=lambda e: e["id"])
    return {
        "schemaVersion": SCHEMA_VERSION,
        "source": "world/sources/blueprints/place.*.json via worldgen.export_blueprints",
        "units": "world metres, X east / Z south, origin at the province north-west corner",
        "provinceExtentM": round(extent_m, 3),
        "layers": list(LAYERS),
        "blueprints": entries,
    }


def render(bundle: dict) -> str:
    return json.dumps(bundle, indent=2, ensure_ascii=False, sort_keys=True) + "\n"


def export(out_path: Path = OUT_PATH, *, terrain: bool = True,
           src_dir: Path = BLUEPRINT_DIR, crop_dir: Path = CROP_DIR) -> dict:
    bundle = build_bundle(src_dir, terrain=terrain, crop_dir=crop_dir)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(render(bundle), encoding="utf-8")
    return bundle


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--no-terrain", action="store_true", help="skip the backdrop PNGs")
    ap.add_argument("--out", type=Path, default=OUT_PATH)
    args = ap.parse_args(argv)
    bundle = export(args.out, terrain=not args.no_terrain)
    print(f"{len(bundle['blueprints'])} blueprints → {args.out}")
    for e in bundle["blueprints"]:
        s = e["summary"]
        print(f"  {e['id']}: {s['districts']} districts, {s['parcels']} parcels, "
              f"{s['doors']} doors, {s['questSockets']} sockets")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
