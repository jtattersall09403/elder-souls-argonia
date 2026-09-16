"""Census of the road surface paint actually present in the shipped land cover.

Diagnostic for Phase 16e: the ladder that built the current province skipped
every route stage, yet road paint can still be in the bake (rebake_landcover
rasterises the *published* routes.json / routes-minor.json, which are still on
disk). This module counts it, clusters it and locates it.

What it reads: the int16 material raster the bake writes beside the refined
heights (`landcover-i16.npy`, written by rebake_landcover.main). The shipped
`ground-control.png` is NOT a faithful source for a per-texel material: its R
channel is `id0`, the winner of a 1.5-px blur over per-material masks, so a
road texel's own code is only guaranteed there because routes are forced back
in afterwards — everything else is a blurred neighbourhood vote.

It is also the GATE for that defect (`--check`): every road-class texel must
lie within `TOL_M` of a route line the ladder actually produced. Stale paint —
lines re-rasterised from files no stage on this ladder wrote — shows up as
texels with no line anywhere near them, and the check exits 1.

Usage:
    python3 -m worldgen.road_paint_census [--json out.json] [--report PATH]
    python3 -m worldgen.road_paint_census --check
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
from scipy import ndimage

from .landcover import BC_ROAD, TRACK, PATH
from .scale import RAW_M, HYDRO_PX_M, HYDRO_STEP

REPO_ROOT = Path(__file__).resolve().parents[3]
PROVINCE = REPO_ROOT / "apps" / "world-studio" / "public" / "province"
REPORT_PATH = REPO_ROOT / "docs" / "research" / "phase16" / "16e-road-paint-census.md"

ROAD_CODES = {"BC_ROAD": BC_ROAD, "TRACK": TRACK, "PATH": PATH}
OWNER_SPOT_M = (80.0, 2970.0)   # 0.08 km E, 2.97 km S
TOP_CLUSTERS = 30
# A road texel may sit this far from the centreline it belongs to: the paint is
# a dilated stripe (majors ~27 m wide, so ~13.5 m of half-width) plus the texel
# quantisation. The gate is about paint with NO line near it, not stripe width.
TOL_M = 5.0
TOP_OFFENDERS = 10


def material_path() -> Path:
    from .compile_chunks import DEFAULT_HEIGHTS
    return DEFAULT_HEIGHTS.parent / "landcover-i16.npy"


def sample_to_metres(index: float) -> float:
    """Full-res sample index -> world metres (east from x=0, south from z=0)."""
    return float(index) * RAW_M


def metres_to_sample(metres: float) -> int:
    return int(round(float(metres) / RAW_M))


def route_points_m(province: Path = PROVINCE) -> np.ndarray:
    """Every published route/track vertex as (east_m, south_m).

    Both files carry macro-pixel polylines on the 1345 grid as [x, y]; the
    centre of macro pixel i is (i + 0.5) * HYDRO_PX_M (scale.hydro_pixel_...).
    Stale by construction on a ladder that skipped the route stages — these
    distances are diagnostic only.
    """
    pts: list[tuple[float, float]] = []
    major = province / "routes.json"
    if major.exists():
        for r in json.loads(major.read_text()).get("routes", []):
            pts.extend((x, y) for x, y in r.get("px", []))
    minor = province / "routes-minor.json"
    if minor.exists():
        for t in json.loads(minor.read_text()).get("tracks", []):
            pts.extend((x, y) for x, y in t.get("px", []))
    if not pts:
        return np.zeros((0, 2), dtype=np.float32)
    a = np.asarray(pts, dtype=np.float32)
    return (a + 0.5) * HYDRO_PX_M


def census(mat: np.ndarray, routes: np.ndarray | None = None,
           spot_m: tuple[float, float] = OWNER_SPOT_M) -> dict:
    """Count, cluster and locate road paint in an int16 material raster."""
    totals = {name: int((mat == code).sum()) for name, code in ROAD_CODES.items()}
    mask = np.isin(mat, tuple(ROAD_CODES.values()))
    lab, n = ndimage.label(mask)   # 4-connectivity
    clusters = []
    if n:
        sizes = np.bincount(lab.ravel())
        objs = ndimage.find_objects(lab)
        ys, xs = np.nonzero(mask)
        ls = lab[ys, xs]
        sum_y = np.bincount(ls, weights=ys, minlength=n + 1)
        sum_x = np.bincount(ls, weights=xs, minlength=n + 1)
        for i, sl in enumerate(objs, start=1):
            if sl is None:
                continue
            cy = sum_y[i] / sizes[i]
            cx = sum_x[i] / sizes[i]
            clusters.append({
                "label": i,
                "texels": int(sizes[i]),
                "centroidM": [sample_to_metres(cx), sample_to_metres(cy)],
                "bboxM": {
                    "eastMin": sample_to_metres(sl[1].start),
                    "eastMax": sample_to_metres(sl[1].stop - 1),
                    "southMin": sample_to_metres(sl[0].start),
                    "southMax": sample_to_metres(sl[0].stop - 1),
                },
            })
    if routes is not None and len(routes):
        for c in clusters:
            e, s = c["centroidM"]
            d = np.hypot(routes[:, 0] - e, routes[:, 1] - s)
            c["nearestRouteM"] = float(d.min())
    clusters.sort(key=lambda c: -c["texels"])

    row = metres_to_sample(spot_m[1])
    col = metres_to_sample(spot_m[0])
    spot = {"eastM": spot_m[0], "southM": spot_m[1], "sample": [row, col]}
    if 0 <= row < mat.shape[0] and 0 <= col < mat.shape[1]:
        code = int(mat[row, col])
        spot["code"] = code
        spot["codeName"] = next((k for k, v in ROAD_CODES.items() if v == code), None)
        spot["isRoad"] = bool(mask[row, col])
        spot["clusterLabel"] = int(lab[row, col]) if mask[row, col] else None
        if spot["clusterLabel"]:
            spot["cluster"] = next(c for c in clusters if c["label"] == spot["clusterLabel"])
    else:
        spot["code"] = None
        spot["outOfRange"] = True
    return {
        "shape": list(mat.shape),
        "metresPerSample": RAW_M,
        "totals": totals,
        "roadTexels": int(mask.sum()),
        "clusterCount": int(n),
        "clusters": clusters,
        "ownerSpot": spot,
    }


def ladder_stages(province: Path = PROVINCE) -> set[str]:
    """Stage names in `ladder.json`'s `ran` list (empty set if no ladder)."""
    path = province / "ladder.json"
    if not path.exists():
        return set()
    return set(json.loads(path.read_text()).get("ran", []))


def ladder_route_polylines(province: Path = PROVINCE,
                           stages: set[str] | None = None) -> list[list]:
    """Macro-px polylines of the route lines THIS ladder produced.

    Majors from `routes.json` only if `solve_major_routes` ran; minors from
    `routes-minor.json` only if `compile_minor_routes` ran. A file on disk that
    no stage on this ladder wrote is last generation's geometry and is not a
    licence for paint (Phase 16e).
    """
    stages = ladder_stages(province) if stages is None else stages
    out: list[list] = []
    if "solve_major_routes" in stages and (province / "routes.json").exists():
        for r in json.loads((province / "routes.json").read_text()).get("routes", []):
            if len(r.get("px", [])) >= 2:
                out.append(r["px"])
    if "compile_minor_routes" in stages and (province / "routes-minor.json").exists():
        for t in json.loads((province / "routes-minor.json").read_text()).get("tracks", []):
            if len(t.get("px", [])) >= 2:
                out.append(t["px"])
    return out


def line_mask(shape, polylines, step: int = HYDRO_STEP) -> np.ndarray:
    """Macro-px polylines drawn as a 1-texel bool mask at full resolution."""
    from .routes_raster import stamp
    mask = np.zeros(shape, dtype=bool)
    for px in polylines:
        if len(px) >= 2:
            stamp(mask, px, step)
    return mask


def check(mat: np.ndarray, polylines, step: int = HYDRO_STEP,
          tol_m: float = TOL_M, top: int = TOP_OFFENDERS) -> dict:
    """Road-class texels further than `tol_m` from any ladder-produced line.

    Distance is the exact Euclidean distance transform of the line mask, in
    samples, scaled by `RAW_M`. With no lines at all, every road texel is an
    offender (distance reported as infinity).
    """
    mask = np.isin(mat, tuple(ROAD_CODES.values()))
    lines = line_mask(mat.shape, polylines, step)
    if lines.any():
        dist_m = ndimage.distance_transform_edt(~lines) * RAW_M
    else:
        dist_m = np.full(mat.shape, math.inf, dtype=np.float64)
    off = mask & (dist_m > tol_m)
    ys, xs = np.nonzero(off)
    order = np.argsort(-dist_m[ys, xs])[:top]
    return {
        "roadTexels": int(mask.sum()),
        "lineTexels": int(lines.sum()),
        "toleranceM": tol_m,
        "offTrackTexels": int(off.sum()),
        "worstOffenders": [
            {"sample": [int(ys[i]), int(xs[i])],
             "eastM": sample_to_metres(xs[i]),
             "southM": sample_to_metres(ys[i]),
             "code": int(mat[ys[i], xs[i]]),
             "distanceM": float(dist_m[ys[i], xs[i]])}
            for i in order],
        "ok": bool(off.sum() == 0),
    }


def _provenance() -> str:
    return (
        "**Which stage produced this paint; why it cannot happen again.** The "
        "raster is the one `worldgen.rebake_landcover.main` writes "
        "(`landcover-i16.npy` beside the refined heights, with the matching "
        "`ground-control.png`). `apps/world-studio/public/province/ladder.json` "
        "recorded the 16d build as `through: 16d` with `rebake_landcover` in `ran` "
        "and every route stage in `skipped`. That skip did not remove road paint, "
        "because the bake did not take its routes from the chain: it rasterised "
        "whatever `routes.json` / `routes-minor.json` were on disk and unioned the "
        "vault's `portage-track.npy`, so the 16b and 16d rebakes repainted 91,890 "
        "texels of the previous generation's route lines onto frozen ground that "
        "never carried them.\n\n"
        "Fixed in Phase 16e: the bake is now LADDER-GATED. `rebake_landcover.main` "
        "reads `CHAIN_ENABLED` (exported by `scripts/terrain-chain.sh`) and paints "
        "majors only when `solve_major_routes` is on that ladder; minor tracks and "
        "paths only when `compile_minor_routes` is; the portage tracks "
        "only when `compile_minor_waterways` is. With no ladder in the environment "
        "a hand run paints none of them (`--paint-all` overrides, deliberately "
        "explicitly). It prints one line per decision. The gate that proves it is "
        "`python3 -m worldgen.road_paint_census --check`: it exits 1 if any "
        "BC_ROAD/TRACK/PATH texel lies more than 5 m from a route line the ladder "
        "itself produced (majors from `routes.json` only if `solve_major_routes` is "
        "in `ladder.json`'s `ran`, minors from `routes-minor.json` only if "
        "`compile_minor_routes` is); it names the worst offenders in metres."
    )


def write_report(data: dict, path: Path = REPORT_PATH) -> None:
    L = []
    L.append("# 16e: road paint census on the shipped land cover")
    L.append("")
    L.append(f"Generated by `python3 -m worldgen.road_paint_census` from the int16 material "
             f"raster `landcover-i16.npy` ({data['shape'][0]}x{data['shape'][1]} samples, "
             f"{data['metresPerSample']:.3f} m per sample). Coordinates are metres east and "
             "metres south of the province origin.")
    L.append("")
    L.append("## Totals per road material code")
    L.append("")
    L.append("| material | code | texels |")
    L.append("| --- | ---: | ---: |")
    for name, code in ROAD_CODES.items():
        L.append(f"| {name} | {code} | {data['totals'][name]:,} |")
    L.append(f"| **all road** | | **{data['roadTexels']:,}** |")
    L.append("")
    L.append(f"Contiguous clusters (4-connected): **{data['clusterCount']:,}**.")
    L.append("")
    L.append(f"## Top {TOP_CLUSTERS} clusters by size")
    L.append("")
    L.append("| # | texels | east range (m) | south range (m) | centroid (m) | nearest published route point (m) |")
    L.append("| ---: | ---: | --- | --- | --- | ---: |")
    for i, c in enumerate(data["clusters"][:TOP_CLUSTERS], start=1):
        b = c["bboxM"]
        nr = c.get("nearestRouteM")
        L.append(
            f"| {i} | {c['texels']:,} | {b['eastMin']:.0f}-{b['eastMax']:.0f} | "
            f"{b['southMin']:.0f}-{b['southMax']:.0f} | "
            f"{c['centroidM'][0]:.0f}, {c['centroidM'][1]:.0f} | "
            + (f"{nr:.0f}" if nr is not None else "n/a") + " |")
    L.append("")
    L.append("Route distances are measured against the published `routes.json` and "
             "`routes-minor.json`, which are stale by construction on this ladder; they are "
             "diagnostic only.")
    L.append("")
    L.append("## The owner's spot (0.08 km E, 2.97 km S)")
    L.append("")
    s = data["ownerSpot"]
    L.append(f"- Sample (row, col): {s['sample'][0]}, {s['sample'][1]}")
    L.append(f"- Material code: {s['code']}"
             + (f" ({s['codeName']})" if s.get("codeName") else " (not a road code)"))
    L.append(f"- Road paint here: {'yes' if s.get('isRoad') else 'no'}")
    if s.get("clusterLabel"):
        c = s["cluster"]
        b = c["bboxM"]
        L.append(f"- Cluster: {c['texels']:,} texels, east {b['eastMin']:.0f}-{b['eastMax']:.0f} m, "
                 f"south {b['southMin']:.0f}-{b['southMax']:.0f} m"
                 + (f", nearest published route point {c['nearestRouteM']:.0f} m" if "nearestRouteM" in c else ""))
    L.append("")
    L.append("## Provenance")
    L.append("")
    L.append(_provenance())
    L.append("")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(L))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", dest="json_out", help="also write the census data as JSON")
    ap.add_argument("--report", default=str(REPORT_PATH))
    ap.add_argument("--check", action="store_true",
                    help="gate: exit 1 if road paint sits off every ladder-produced line")
    args = ap.parse_args()

    mat = np.load(material_path())
    if args.check:
        res = check(mat, ladder_route_polylines())
        print(f"road paint check: {res['roadTexels']} road texels, "
              f"{res['lineTexels']} ladder line texels, "
              f"{res['offTrackTexels']} further than {res['toleranceM']:.0f} m from any line")
        for o in res["worstOffenders"]:
            print(f"  worst: {o['eastM']:.0f} m E, {o['southM']:.0f} m S "
                  f"code {o['code']} at {o['distanceM']:.1f} m")
        if not res["ok"]:
            raise SystemExit(1)
        return
    data = census(mat, route_points_m())
    write_report(data, Path(args.report))
    if args.json_out:
        Path(args.json_out).write_text(json.dumps(data, indent=1))
    print(f"road texels: {data['roadTexels']} "
          + ", ".join(f"{k}={v}" for k, v in data["totals"].items())
          + f"; clusters {data['clusterCount']}")
    s = data["ownerSpot"]
    print(f"owner spot code {s['code']} ({s.get('codeName')}) cluster {s.get('clusterLabel')}")
    print(f"report -> {args.report}")


if __name__ == "__main__":
    main()
