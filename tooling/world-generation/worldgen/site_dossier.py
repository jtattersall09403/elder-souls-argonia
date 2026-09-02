"""Site dossier — everything the repo knows about one piece of ground.

HOW TO USE
----------
    cd tooling/world-generation

    # by world metres, 400 m radius
    python3 -m worldgen.site_dossier --id gideon-bluff --x 1327 --z 3097 --radius 400

    # by province UV (the coordinate settlement-anchors.json uses)
    python3 -m worldgen.site_dossier --id lilmoth --u 0.30 --v 0.93 --radius 600

    # by an existing anchor id
    python3 -m worldgen.site_dossier --anchor stormhold --radius 700

Writes `world/sources/sites/dossiers/<id>.json` (the structured artefact) and
`<id>.md` (the human digest), or use `--out <dir>` / `--stdout`.

WHY
---
Phase 11 Part 0 item 1 (decision 0041): "a settlement proposal made without
reading the terrain is a guess". Every siting or layout proposal in Phase 11
must cite its dossier. The dossier serves three consumers — the authoring
agent's own reasoning, the causal "why here" record (module 40 §28), and the
owner's review packets — so it is deliberately one artefact, not three.

WHAT IT IS NOT
--------------
It reports the land; it does not judge it. No suitability score, no "this is a
good village site" — that call is the author's, made in the open, with the
numbers cited. The one derived judgement it does make is the mined-form
analogue, which is a statement about which real cluster shape this ground
resembles, not about whether to build one.

Deterministic: no randomness. `--seed` exists only so a dossier records the
seed of the sweep or compile it is being read alongside.
"""

from __future__ import annotations

import argparse
import json
import math
from collections import Counter
from pathlib import Path

import numpy as np

from .compile_scatter import CHUNK_M
from .regions import REGION_CLASSES, SOIL_CLASSES
from .scatter import decode as decode_vegetation
from .site_fields import REPO_ROOT, ProvinceSurvey

SCHEMA_VERSION = 1
DEFAULT_OUT = REPO_ROOT / "world" / "sources" / "sites" / "dossiers"

# Slope bands that decide how a building meets the ground (decision 0041's
# "slopes and uneven ground" rules, expressed as terrain-side thresholds).
SLOPE_BANDS = [(0.0, 3.0, "flat"), (3.0, 8.0, "gentle"), (8.0, 15.0, "moderate"),
               (15.0, 30.0, "steep"), (30.0, 45.0, "very steep"), (45.0, 90.0, "cliff")]
COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]


def _bearing(dx: float, dz: float) -> float:
    """Compass bearing from +X east / +Z south deltas."""
    return math.degrees(math.atan2(dx, -dz)) % 360.0


def _compass(bearing: float) -> str:
    return COMPASS[int((bearing + 22.5) % 360.0 // 45.0)]


def _pct(a: np.ndarray, qs=(0, 5, 50, 95, 100)) -> dict:
    if a.size == 0:
        return {}
    return {f"p{q}": round(float(np.percentile(a, q)), 2) for q in qs}


def _disc(n: int, px_m: float, x: float, z: float, radius_m: float):
    """Boolean disc mask + its (row, col) bounding slice on an n x n raster."""
    r = radius_m / px_m
    cr, cc = z / px_m, x / px_m
    r0, r1 = max(0, int(cr - r) - 1), min(n, int(cr + r) + 2)
    c0, c1 = max(0, int(cc - r) - 1), min(n, int(cc + r) + 2)
    rows = np.arange(r0, r1)[:, None] + 0.5
    cols = np.arange(c0, c1)[None, :] + 0.5
    mask = (rows - cr) ** 2 + (cols - cc) ** 2 <= r * r
    return mask, (slice(r0, r1), slice(c0, c1))


def terrain_section(s: ProvinceSurvey, x: float, z: float, radius: float) -> dict:
    n = s.fields.height_m.shape[0]
    mask, sl = _disc(n, s.height_px_m, x, z, radius)
    h = s.fields.height_m[sl][mask]
    slope = s.fields.slope_deg[sl][mask]
    gmask, gsl = _disc(s.grid_n, s.grid_px_m, x, z, radius)
    aspect = s.aspect_grid[gsl][gmask]
    cell_ha = (s.height_px_m ** 2) / 10_000.0
    bands = {name: round(float(((slope >= lo) & (slope < hi)).sum() * cell_ha), 3)
             for lo, hi, name in SLOPE_BANDS}
    sectors = Counter(_compass(float(a)) for a in aspect[::7])
    # buildable: gentle enough to grade, and above the local water level
    # (water-surface.png shares the refined raster's 2017 grid, so the same
    # mask and slice apply).
    level = s.water_level_m[sl][mask]
    buildable = (slope < 8.0) & (h > level + 0.5)
    return {
        "radiusM": radius,
        "elevationM": _pct(h),
        "reliefM": round(float(h.max() - h.min()), 2),
        "slopeDeg": _pct(slope, (5, 50, 95)),
        "slopeAreaHa": bands,
        "aspectSectorsPct": {k: round(100.0 * v / max(1, sum(sectors.values())), 1)
                             for k, v in sorted(sectors.items())},
        "buildableAreaHa": round(float(buildable.sum() * cell_ha), 3),
        "buildableFraction": round(float(buildable.mean()), 3),
        "note": "buildable = slope < 8 deg and > 0.5 m above the local water "
                "level; 0041's ground-fitting ladder grades up to Delta 2.0 m, "
                "beyond which a site must stilt or move.",
    }


def profiles(s: ProvinceSurvey, x: float, z: float, radius: float,
             step_m: float = 20.0) -> dict:
    """Four elevation cross-sections through the site (N-S, E-W and diagonals),
    with the water level alongside so flood exposure reads off the same line."""
    out = {}
    for name, (dx, dz) in (("N-S", (0, 1)), ("E-W", (1, 0)),
                           ("NE-SW", (0.7071, 0.7071)), ("NW-SE", (-0.7071, 0.7071))):
        n = int(radius / step_m)
        ds, hs, ws = [], [], []
        for i in range(-n, n + 1):
            d = i * step_m
            px, pz = x + dx * d, z + dz * d
            if not (0 <= px < s.extent_m and 0 <= pz < s.extent_m):
                continue
            ds.append(round(d, 1))
            hs.append(round(s.height_at(px, pz), 2))
            row, col = s._px(px, pz, s.height_px_m, s.water_level_m.shape[0])
            ws.append(round(float(s.water_level_m[row, col]), 2))
        out[name] = {"offsetM": ds, "elevationM": hs, "waterLevelM": ws}
    return out


def hydrology_section(s: ProvinceSurvey, x: float, z: float, radius: float) -> dict:
    mask, sl = _disc(s.grid_n, s.grid_px_m, x, z, radius)
    cell_ha = (s.grid_px_m ** 2) / 10_000.0
    band = s.river_band[sl][mask]
    flood = s.flood[sl][mask]
    sal = s.salinity[sl][mask]
    hmask, hsl = _disc(s.fields.height_m.shape[0], s.height_px_m, x, z, radius)
    depth = s.water_depth_m[hsl][hmask]
    wet_n = s.wet_season.shape[0]
    wmask, wsl = _disc(wet_n, s.extent_m / wet_n, x, z, radius)
    wet_season = s.wet_season[wsl][wmask]

    channels = []
    for b in (1, 2, 3):
        cells = np.argwhere(s.river_band[sl] == b)
        if not cells.size:
            continue
        pts = np.stack([(cells[:, 1] + sl[1].start + 0.5) * s.grid_px_m,
                        (cells[:, 0] + sl[0].start + 0.5) * s.grid_px_m], axis=1)
        d = np.hypot(pts[:, 0] - x, pts[:, 1] - z)
        keep = d <= radius
        if not keep.any():
            continue
        i = int(np.argmin(np.where(keep, d, np.inf)))
        channels.append({
            "riverBand": b,
            "label": {1: "headwater/minor", 2: "secondary", 3: "major"}[b],
            "cellsInRadius": int(keep.sum()),
            "lengthInRadiusM": round(float(keep.sum()) * s.grid_px_m, 1),
            "nearestDistanceM": round(float(d[i]), 1),
            "nearestBearing": _compass(_bearing(pts[i, 0] - x, pts[i, 1] - z)),
        })
    return {
        "channels": channels,
        "waterDepthM": _pct(depth[depth > 0.05], (5, 50, 95, 100)) if (depth > 0.05).any() else {},
        "openWaterAreaHa": round(float((depth > 0.05).sum())
                                 * (s.height_px_m ** 2) / 10_000.0, 3),
        "floodBandAreaHa": {str(b): round(float((flood == b).sum() * cell_ha), 3)
                            for b in (0, 1, 2, 3)},
        "wetSeasonNewlyInundatedFraction": round(float(wet_season.mean()), 3),
        "wetlandFraction": round(float(s.wetlands[sl][mask].mean()), 3),
        "tidalFraction": round(float(s.tidal[sl][mask].mean()), 3),
        "lakeFraction": round(float(s.lakes[sl][mask].mean()), 3),
        "salinity": _pct(sal, (5, 50, 95)),
        "salineFraction": round(float((sal > 0.05).mean()), 3),
        "distanceToOpenSeaM": round(float(s.fields.coast_m[s.grid_px(x, z)]), 1),
        "floodBandLegend": {"0": "dry", "1": "occasional", "2": "seasonal",
                            "3": "permanent/near-permanent"},
    }


def context_section(s: ProvinceSurvey, x: float, z: float, radius: float) -> dict:
    mask, sl = _disc(s.grid_n, s.grid_px_m, x, z, radius)
    reg = s.region_grid[sl][mask]
    dng = s.danger[sl][mask]
    cul = s.culture[sl][mask]
    total = max(1, reg.size)
    return {
        "regionMixPct": {REGION_CLASSES[int(v)][0]: round(100.0 * c / total, 1)
                         for v, c in zip(*np.unique(reg, return_counts=True))},
        "dangerMixPct": {str(int(v)): round(100.0 * c / total, 1)
                         for v, c in zip(*np.unique(dng, return_counts=True))},
        "cultureMixPct": {s.culture_names.get(int(v), "unclaimed"): round(100.0 * c / total, 1)
                          for v, c in zip(*np.unique(cul, return_counts=True))},
        "soilMixPct": {SOIL_CLASSES.get(int(v), "unclassified"): round(100.0 * c / total, 1)
                       for v, c in zip(*np.unique(s.soil[sl][mask], return_counts=True))},
    }


def access_section(s: ProvinceSurvey, x: float, z: float, radius: float) -> dict:
    routes = []
    for r in s.routes:
        if r.points_m.size == 0:
            continue
        d = np.hypot(r.points_m[:, 0] - x, r.points_m[:, 1] - z)
        i = int(np.argmin(d))
        if float(d[i]) > max(radius, 2500.0):
            continue
        routes.append({
            "kind": r.kind, "from": r.frm, "to": r.to, "lengthKm": r.length_km,
            "nearestDistanceM": round(float(d[i]), 1),
            "nearestPointM": [round(float(r.points_m[i, 0]), 1),
                              round(float(r.points_m[i, 1]), 1)],
            "nearestBearing": _compass(_bearing(float(r.points_m[i, 0]) - x,
                                                float(r.points_m[i, 1]) - z)),
            "withinRadius": bool(float(d[i]) <= radius),
        })
    routes.sort(key=lambda r: (r["nearestDistanceM"], r["kind"], r["from"], r["to"]))
    neighbours = sorted(
        ({"id": aid,
          "straightLineM": round(math.hypot(ax - x, az - z), 1),
          "bearing": _compass(_bearing(ax - x, az - z))}
         for aid, (ax, az) in s.anchor_points_m.items()),
        key=lambda a: a["straightLineM"])
    return {"routes": routes, "neighbourAnchors": neighbours,
            **s.effort_to_reach(x, z)}


def vegetation_section(s: ProvinceSurvey, x: float, z: float, radius: float) -> dict:
    """Compiled scatter within the radius, where Phase 10 has dressed it."""
    index = s.vegetation_index
    order = index.get("speciesOrder", [])
    chunks, missing = [], []
    cx0, cx1 = int((x - radius) // CHUNK_M), int((x + radius) // CHUNK_M)
    cz0, cz1 = int((z - radius) // CHUNK_M), int((z + radius) // CHUNK_M)
    species: Counter = Counter()
    total = 0
    for cx in range(cx0, cx1 + 1):
        for cz in range(cz0, cz1 + 1):
            key = f"{cx}_{cz}"
            rec = index.get("chunks", {}).get(key)
            if rec is None:
                missing.append([cx, cz])
                continue
            chunks.append(rec)
            blob = s.province / "vegetation" / f"chunk_{cx}_{cz}_vegetation.bin"
            if not blob.exists():
                continue
            for group in decode_vegetation(blob.read_bytes()):
                name = order[group["index"]] if group["index"] < len(order) else "?"
                for inst in group["instances"]:
                    if math.hypot(inst["x"] - x, inst["z"] - z) <= radius:
                        species[name] += 1
                        total += 1
    area_ha = math.pi * (radius ** 2) / 10_000.0
    if not chunks:
        return {"compiled": False, "chunksMissing": missing,
                "note": "Phase 10 has dressed %d chunks province-wide; this site "
                        "is not among them. Density here must be inferred from "
                        "the region class." % len(index.get("chunks", {}))}
    return {
        "compiled": True,
        "chunksRead": [c["chunk"] for c in chunks],
        "chunksMissing": missing,
        "instancesInRadius": total,
        "perHectare": round(total / area_ha, 1),
        "canopyClosureFromClimate": round(float(s.canopy[s.grid_px(x, z)]), 3),
        "speciesMixTop": [{"species": k, "count": v,
                           "pct": round(100.0 * v / max(1, total), 1)}
                          for k, v in species.most_common(12)],
        "distinctSpecies": len(species),
        "chunkRecords": chunks,
    }


def viewshed_section(s: ProvinceSurvey, x: float, z: float, radius: float,
                     landmark_radius_m: float, landmarks: list[dict]) -> dict:
    view = s.viewshed(x, z, max(radius, 1500.0))
    visible, hidden = [], []
    for lm in landmarks:
        d = math.hypot(lm["x"] - x, lm["z"] - z)
        if d > landmark_radius_m or d < 1.0:
            continue
        rec = {"id": lm["id"], "kind": lm.get("kind", "anchor"),
               "distanceM": round(d, 1),
               "bearing": _compass(_bearing(lm["x"] - x, lm["z"] - z)),
               "elevationM": round(s.height_at(lm["x"], lm["z"]), 1)}
        (visible if s.line_of_sight(x, z, lm["x"], lm["z"], eye_b=lm.get("height", 1.7))
         else hidden).append(rec)
    # "where is this site visible FROM": sample the route network, which is
    # where players actually are.
    # Concealment is judged on the APPROACH band (2 km), not the whole
    # network: whether a traveller a day away can see you is a landmark
    # question, already answered above.
    approach_m = 2000.0
    seen_from, hits_total, pts_total = [], 0, 0
    for r in s.routes:
        if r.points_m.size == 0:
            continue
        pts = r.points_m[::4]
        d = np.hypot(pts[:, 0] - x, pts[:, 1] - z)
        near = pts[d <= approach_m]
        if not len(near):
            continue
        hits = sum(1 for px, pz in near
                   if s.line_of_sight(float(px), float(pz), x, z))
        hits_total += hits
        pts_total += len(near)
        seen_from.append({"kind": r.kind, "from": r.frm, "to": r.to,
                          "sampledPointsWithin2km": int(len(near)),
                          "withLineOfSight": hits,
                          "fraction": round(hits / len(near), 3)})
    seen_from.sort(key=lambda v: (-v["fraction"], v["from"], v["to"]))
    approach_visibility = hits_total / pts_total if pts_total else 0.0
    return {
        "radial": view,
        "landmarksVisible": sorted(visible, key=lambda v: v["distanceM"]),
        "landmarksOccluded": sorted(hidden, key=lambda v: v["distanceM"]),
        "visibleFromRoutes": seen_from,
        "approachVisibility": round(approach_visibility, 3),
        "routePointsSampledWithin2km": pts_total,
        "concealment": round(1.0 - approach_visibility, 3),
        "method": "radial (R2) line of sight over the terrain skeleton "
                  "(height smoothed to ~11 m); 1.7 m eye. Vegetation and "
                  "buildings are not occluders here.",
    }


def build_dossier(s: ProvinceSurvey, site_id: str, x: float, z: float,
                  radius: float, landmark_radius_m: float, seed: int,
                  landmarks: list[dict] | None = None) -> dict:
    centre = s.sample(x, z)
    hyd = hydrology_section(s, x, z, radius)
    acc = access_section(s, x, z, radius)
    terr = terrain_section(s, x, z, radius)
    nearest_water = min([c["nearestDistanceM"] for c in hyd["channels"]]
                        + [abs(centre["hydrology"]["shoreDistanceM"])])
    nearest_road = min([r["nearestDistanceM"] for r in acc["routes"]
                        if r["kind"] == "road"] or [9999.0])
    buildable_radius = max(20.0, math.sqrt(
        max(terr["buildableAreaHa"], 0.01) * 10_000.0 / math.pi))
    lm = landmarks if landmarks is not None else [
        {"id": aid, "kind": "anchor", "x": ax, "z": az, "height": 12.0}
        for aid, (ax, az) in s.anchor_points_m.items()]
    return {
        "schemaVersion": SCHEMA_VERSION,
        "kind": "site-dossier",
        "id": f"dossier.phase11.{site_id}",
        "siteId": site_id,
        "seed": seed,
        "generatedBy": "worldgen.site_dossier (Phase 11 Part 0 item 1, decision 0041)",
        "sources": [
            "apps/world-studio/public/province/{meta,hydrology-meta,society-meta}.json",
            "apps/world-studio/public/province/hydro-*.png, soc-*.png, climate-*.png",
            "apps/world-studio/public/province/refined/*, water/*, vegetation/*",
            "world/sources/anchors/settlement-anchors.json",
            "world/sources/placement/*-settlement-form.json",
        ],
        "centre": centre,
        "terrain": terr,
        "profiles": profiles(s, x, z, radius),
        "hydrology": hyd,
        "context": context_section(s, x, z, radius),
        "access": acc,
        "vegetation": vegetation_section(s, x, z, radius),
        "viewshed": viewshed_section(s, x, z, radius, landmark_radius_m, lm),
        "minedFormAnalogues": s.nearest_mined_form(
            nearest_water, nearest_road, buildable_radius),
    }


def digest(d: dict) -> str:
    c, t, h, a, v = (d["centre"], d["terrain"], d["hydrology"],
                     d["access"], d["viewshed"])
    lines = [
        f"# Site dossier — {d['siteId']}",
        "",
        f"`{d['id']}` · schemaVersion {d['schemaVersion']} · "
        f"radius {t['radiusM']:.0f} m · seed {d['seed']}",
        "",
        "## The ground",
        f"- Centre {c['worldM'][0]:.0f}, {c['worldM'][1]:.0f} m "
        f"(uv {c['uv'][0]}, {c['uv'][1]}) — **{c['elevationM']:.1f} m**, "
        f"slope {c['slopeDeg']:.1f}°, facing {c['aspectDeg']:.0f}°.",
        f"- Region **{c['regionName']}**, soil {c['soilName']}, "
        f"danger band **{c['dangerBand']}**, culture {c['cultureTerritory']}.",
        f"- Relief across the disc {t['reliefM']:.1f} m "
        f"(p5 {t['elevationM']['p5']:.1f} → p95 {t['elevationM']['p95']:.1f} m); "
        f"slope p50 {t['slopeDeg']['p50']:.1f}°, p95 {t['slopeDeg']['p95']:.1f}°.",
        f"- Buildable (slope < 8°, dry) **{t['buildableAreaHa']:.2f} ha** "
        f"({t['buildableFraction'] * 100:.0f}% of the disc).",
        "",
        "## Water",
        f"- {c['hydrology']['heightAboveWaterTableM']:.2f} m above the local water "
        f"table; shore {c['hydrology']['shoreDistanceM']:.0f} m; "
        f"open sea {h['distanceToOpenSeaM'] / 1000:.2f} km.",
        f"- Flood band {c['hydrology']['floodBand']}; "
        f"{h['wetSeasonNewlyInundatedFraction'] * 100:.0f}% of the disc floods anew "
        f"in the wet season; salinity p50 {h['salinity'].get('p50', 0):.2f} "
        f"({h['salineFraction'] * 100:.0f}% saline).",
    ]
    for ch in h["channels"]:
        lines.append(f"- Channel ({ch['label']}): {ch['nearestDistanceM']:.0f} m "
                     f"to the {ch['nearestBearing']}, {ch['lengthInRadiusM']:.0f} m "
                     f"of it inside the radius.")
    lines += [
        "",
        "## Reach",
        f"- Nearest route: " + (
            f"{a['routes'][0]['kind']} {a['routes'][0]['from']}→{a['routes'][0]['to']}, "
            f"{a['routes'][0]['nearestDistanceM']:.0f} m {a['routes'][0]['nearestBearing']}"
            if a["routes"] else "none within 2.5 km"),
        f"- Nearest anchor {a['nearestAnchor']} at "
        f"{a['distanceToNearestAnchorM'] / 1000:.2f} km; effort score "
        f"**{a['effortScore']:.2f}** (0 easy → 1 hard).",
        "",
        "## Sight",
        f"- Sees {v['radial']['visibleFraction'] * 100:.0f}% of its "
        f"{v['radial']['radiusM']:.0f} m surroundings; horizon p50 "
        f"{v['radial']['horizonAngleDeg']['p50']:.1f}°; open sky on "
        f"{v['radial']['openAzimuthFraction'] * 100:.0f}% of azimuths.",
        f"- Visible landmarks: " + (", ".join(
            f"{l['id']} ({l['distanceM'] / 1000:.1f} km {l['bearing']})"
            for l in v["landmarksVisible"][:8]) or "none"),
        f"- Concealment {v['concealment']:.2f} — seen from "
        f"{v['approachVisibility'] * 100:.0f}% of the "
        f"{v['routePointsSampledWithin2km']} route points within 2 km.",
        "",
        "## Green",
    ]
    veg = d["vegetation"]
    if veg.get("compiled"):
        lines.append(f"- {veg['instancesInRadius']} compiled plants "
                     f"({veg['perHectare']:.0f}/ha), {veg['distinctSpecies']} species; "
                     f"canopy closure {veg['canopyClosureFromClimate']:.2f}.")
        lines += [f"  - {sp['species']} {sp['pct']:.0f}%"
                  for sp in veg["speciesMixTop"][:6]]
    else:
        lines.append(f"- No compiled scatter here. {veg['note']}")
    lines += ["", "## Nearest mined settlement forms"]
    for f in d["minedFormAnalogues"]:
        kits = ", ".join(k[0] for k in f["kits"][:3])
        lines.append(f"- {f['source']} #{f['index']}: {f['buildings']} buildings, "
                     f"r {f['radiusM']:.0f} m, {f['buildingsPerHectare']:.1f}/ha, "
                     f"water {f['medianWaterDistanceM']:.0f} m, coherence "
                     f"{f['orientationCoherence']:.2f} — kits: {kits}")
    lines += ["", "*Reports the land; it does not judge it. Cite this dossier in "
              "the siting record (module 40 §28).*", ""]
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--id", help="site id (lower kebab); defaults to the anchor id")
    p.add_argument("--x", type=float), p.add_argument("--z", type=float)
    p.add_argument("--u", type=float), p.add_argument("--v", type=float)
    p.add_argument("--anchor", help="centre on a settlement anchor by id")
    p.add_argument("--radius", type=float, default=400.0, help="survey radius, metres")
    p.add_argument("--landmark-radius", type=float, default=6000.0,
                   help="how far to test landmark line of sight, metres")
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--out", type=Path, default=DEFAULT_OUT)
    p.add_argument("--stdout", action="store_true", help="print the digest only")
    args = p.parse_args(argv)

    s = ProvinceSurvey()
    if args.anchor:
        x, z = s.anchor_points_m[args.anchor]
        site_id = args.id or args.anchor
    elif args.u is not None and args.v is not None:
        x, z = s.uv_to_m(args.u, args.v)
        site_id = args.id or f"uv-{args.u:.4f}-{args.v:.4f}".replace(".", "")
    elif args.x is not None and args.z is not None:
        x, z = args.x, args.z
        site_id = args.id or f"xz-{int(x)}-{int(z)}"
    else:
        p.error("give --anchor, or --u/--v, or --x/--z")

    d = build_dossier(s, site_id, x, z, args.radius, args.landmark_radius, args.seed)
    text = digest(d)
    if args.stdout:
        print(text)
        return
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / f"{site_id}.json").write_text(json.dumps(d, indent=1) + "\n")
    (args.out / f"{site_id}.md").write_text(text)
    print(f"wrote {args.out / (site_id + '.json')} and {site_id}.md")


if __name__ == "__main__":
    main()
