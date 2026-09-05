"""Export the settlement blueprints for World Studio's interactive Blueprint view.

    python3 -m worldgen.export_blueprints            # from tooling/world-generation

Writes:

  * ``apps/world-studio/public/province/blueprints.json`` — one entry per
    ``world/sources/blueprints/place.*.json``, with **every coordinate already
    in world metres** (X east, Z south, origin at the province's north-west
    corner — module 00-core §8). The browser never converts UV.

The viewer draws the blueprint geometry straight onto the coloured province map
(the ``map`` layer, from the same rasters the map screen uses) inside the
exported ``contextM`` box. There is no separate hillshade backdrop: the greyscale
crop it used to export painted a square over the province map (owner, 2026-09-05).

Why this exists (owner, 2026-09-05): the static ``render_blueprint`` PNGs put
everything on one sheet, and at village density that reads as "a lot of stuff
jumbled on top of each other". The studio view can zoom, pan, hide classes and
show a thing's *why* on click; this exporter is the data feed for it. The
static renderer stays — it is the print medium, this is the review medium.

Round 2 (owner feedback 2026-09-05) added, at ``schemaVersion`` 2: the
plain-English ``why`` blocks on districts / parcels / landmarks / docks (and the
one-sentence ``why`` on ways and combat spaces), the ``approaches[]`` list,
``scaleGrounding``, the ``fences`` way group, ways' ``via`` / ``routing`` /
``endsAt``, parcels' ``spans`` / ``interior``, and ``contextM`` — the metre
rectangle the viewer paints the MAIN 2D province map and its neighbouring
places / routes over, so a blueprint is read in its setting. Every one of these
is optional on the way in: the live blueprints are being re-authored and a
missing field exports as ``null`` (the viewer shows it in red as "not yet
written") rather than failing the export.

Determinism (standard 6): sorted keys, ``indent=2``, one trailing newline, and
geometry that is a pure function of the source blueprints, so a clean re-run is
byte-identical.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from .blueprint import BLUEPRINT_DIR
from .render_blueprint import PROVINCE_EXTENT_M, crop_box
from .site_fields import REPO_ROOT

SCHEMA_VERSION = 2
OUT_DIR = REPO_ROOT / "apps" / "world-studio" / "public" / "province"
OUT_PATH = OUT_DIR / "blueprints.json"
PAD_M = 60.0
# How far beyond the blueprint's own crop the viewer shows the province map and
# its neighbouring places / routes (owner 2026-09-05 item 1: the blueprint must
# be read in its setting, not on a blank grey square).
CONTEXT_PAD_M = 1500.0

# Object classes the viewer can toggle; the order is the checklist order.
# "map" is the main 2D province map, painted in the browser from the SAME
# rasters App.tsx uses — the blueprint is drawn directly on it.
LAYERS = ["map", "context", "boundary", "clearance", "districts",
          "ways", "fences", "parcels", "doors", "landmarks", "docks",
          "combatSpaces", "approaches", "questSockets", "siting"]

# The plain-English `why` blocks (blueprint.py WHY_KEYS_*): carried through
# verbatim, key by key, so the viewer can show "not yet written" per field
# while the blueprints are being re-authored.
WHY_KEYS_FULL = ("what", "whyHere", "whySpot", "whyNeighbours", "playerPurpose", "microGeography")
WHY_KEYS_AREA = ("what", "whyHere", "whyNeighbours", "playerPurpose", "microGeography")


def _why(obj: dict, keys) -> dict | None:
    """One `why` block → {key: sentence or None}, or None when unwritten."""
    why = obj.get("why")
    if not isinstance(why, dict):
        return None
    out = {k: (why[k] if isinstance(why.get(k), str) and why[k].strip() else None) for k in keys}
    return out if any(v for v in out.values()) else None


def _why_text(obj: dict) -> str | None:
    """A way's / combat space's `why` — a single sentence, not a block."""
    why = obj.get("why")
    return why if isinstance(why, str) and why.strip() else None


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
    """Routes, canals, boardwalks and fences in one list, each tagged with its group so
    the viewer can style and toggle them together or apart."""
    out = []
    for group in ("routes", "canals", "boardwalks", "fences"):
        for w in bp.get(group) or []:
            # `points` is derived from `via`; a way that has not been routed yet
            # still draws (as its waypoint line) rather than vanishing.
            via = _poly_m(w.get("via"), extent_m)
            pts = _poly_m(w.get("points"), extent_m) or via
            if not pts:
                continue
            out.append({
                "id": w.get("id"),
                "group": group,
                "kind": w.get("kind") or group[:-1],
                "widthM": w.get("widthM"),
                "assetRef": w.get("assetRef"),
                "routing": w.get("routing"),
                "endsAt": [r for r in (w.get("endsAt") or []) if isinstance(r, str)],
                "why": _why_text(w),
                "notes": w.get("notes"),
                "via": via,
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
            "spans": p.get("spans"),
            "interior": p.get("interior") if isinstance(p.get("interior"), dict) else None,
            "why": _why(p, WHY_KEYS_FULL),
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


def _approaches(bp: dict) -> list[dict]:
    """How a WALKING player arrives (blueprint.py `approaches[]`). Passed through
    verbatim — the viewer resolves `fromRouteId` / `firstSeen` against the ids it
    already holds and draws the arrow itself."""
    out = []
    for a in bp.get("approaches") or []:
        out.append({
            "id": a.get("id"),
            "mode": a.get("mode"),
            "fromRouteId": a.get("fromRouteId"),
            "fromDirection": a.get("fromDirection"),
            "firstSeen": a.get("firstSeen"),
            "sequence": a.get("sequence"),
            "wayfinding": a.get("wayfinding"),
            "notes": a.get("notes"),
        })
    out.sort(key=lambda a: str(a["id"]))
    return out


def context_box(bp: dict, extent_m: float) -> dict:
    """The metre rectangle the viewer draws the province map and the neighbouring
    places / routes over: the blueprint's own crop, opened out by CONTEXT_PAD_M.
    Deterministic (it is a function of the geometry alone)."""
    x0, z0, x1, z1 = crop_box(bp, extent_m, PAD_M + CONTEXT_PAD_M)
    return {"x0": round(float(x0), 3), "z0": round(float(z0), 3),
            "x1": round(float(x1), 3), "z1": round(float(z1), 3)}


def project(doc: dict, extent_m: float) -> dict:
    """One blueprint document → the studio entry, everything in metres."""
    bp = doc["blueprint"]
    districts = []
    for d in bp.get("districts") or []:
        poly = _poly_m(d.get("boundary"), extent_m)
        districts.append({
            "id": d.get("id"), "kind": d.get("kind"), "cultureKit": d.get("cultureKit"),
            "wealth": d.get("wealth"), "notes": d.get("notes"),
            "why": _why(d, WHY_KEYS_AREA),
            "polygon": poly, "centreM": _centroid(poly),
        })
    districts.sort(key=lambda d: str(d["id"]))

    landmarks = sorted(
        ({"id": lm.get("id"), "kind": lm.get("kind"), "assetRef": lm.get("assetRef"),
          "notes": lm.get("notes"), "why": _why(lm, WHY_KEYS_FULL),
          "positionM": _point_m(lm.get("position"), extent_m)}
         for lm in bp.get("landmarks") or []),
        key=lambda lm: str(lm["id"]))
    docks = sorted(
        ({"id": dk.get("id"), "waterBodyId": dk.get("waterBodyId"),
          "piledToBed": dk.get("piledToBed"), "notes": dk.get("notes"),
          "why": _why(dk, WHY_KEYS_AREA),
          "positionM": _point_m(dk.get("position"), extent_m)}
         for dk in bp.get("docks") or []),
        key=lambda dk: str(dk["id"]))
    combat = sorted(
        ({"id": cs.get("id"), "clearanceClass": cs.get("clearanceClass"),
          "notes": cs.get("notes"), "why": _why_text(cs),
          "polygon": _poly_m(cs.get("boundary"), extent_m)}
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
        "approaches": _approaches(bp),
        "scaleGrounding": bp.get("scaleGrounding") if isinstance(bp.get("scaleGrounding"), dict) else None,
        "contextM": context_box(bp, extent_m),
        "clearance": _clearance(bp, extent_m),
        "siting": _siting(bp, extent_m),
        "budget": bp.get("budget") or {},
        "provision": bp.get("provision") or {},
        "assetConstraints": list(bp.get("assetConstraints") or []),
        "summary": {},
    }
    entry["summary"] = {
        "districts": len(districts), "parcels": len(parcels), "ways": len(ways),
        "landmarks": len(landmarks), "docks": len(docks), "doors": len(entry["doors"]),
        "combatSpaces": len(combat), "questSockets": len(sockets),
        "fences": len([w for w in ways if w["group"] == "fences"]),
        "approaches": len(entry["approaches"]),
        "keptTrees": len(entry["clearance"]["kept"]),
        "sitingCandidates": len((entry["siting"] or {}).get("candidates") or []),
    }
    return entry


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


def build_bundle(src_dir: Path = BLUEPRINT_DIR) -> dict:
    docs = load_docs(src_dir)
    extent_m = PROVINCE_EXTENT_M
    entries = [project(doc, extent_m) for doc in docs]
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


def export(out_path: Path = OUT_PATH, *, src_dir: Path = BLUEPRINT_DIR) -> dict:
    bundle = build_bundle(src_dir)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(render(bundle), encoding="utf-8")
    return bundle


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--out", type=Path, default=OUT_PATH)
    args = ap.parse_args(argv)
    bundle = export(args.out)
    print(f"{len(bundle['blueprints'])} blueprints → {args.out}")
    for e in bundle["blueprints"]:
        s = e["summary"]
        print(f"  {e['id']}: {s['districts']} districts, {s['parcels']} parcels, "
              f"{s['doors']} doors, {s['questSockets']} sockets")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
