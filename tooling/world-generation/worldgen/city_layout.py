"""The nine city layouts: where the gate stands, where the centre is, and the
street between them (owner rule 2026-09-18).

A city pin is where the city's GATE stands on its main road, not its centre.
The road network is frozen and every major road already ends AT its city's
anchor pixel, so the gate is read off the road, never re-solved: the terminal
pixel of the city's main approach, in metres. Helstrom and Alten Corimont are
reached by water, so their approach is a boat lane and their gate is a landing.

The CENTRE is then chosen on an 11 m lattice 60–320 m from the gate, scored
over the disc of the record's own `footprintRadiusM`:

    +1.0 × dry fraction               (s.dry_grid)
    +0.6 × fraction with slope ≤ 12°  (s.slope_grid)
    −0.5 × mean slope / 20
    −0.4 × |waterFrac − target|       (target from the type recipe's
                                       siting.waterRelation)
    −0.2 × distance(gate, centre) / 320

with a hard reject where the centre cell itself is wet or steeper than 15°,
and a dry-fraction floor of 0.9: a city with no candidate above it is an
OWNER CALL, reported with its numbers and given no block.

The WAY from gate to centre is the street router's terrain line — the same A*
over the same ground the settlement blueprints use — so the approach is worn,
not ruled. The FOOTPRINT POLYGON is the convex hull of the dry, walkable cells
inside the disc, simplified at 8 m: the shape the city occupies, instead of a
radius.

Determinism: a fixed lattice in absolute metres, no RNG, values rounded on the
way out; running twice writes byte-identical files.

Run (from tooling/world-generation/):

    python3 -m worldgen.city_layout              # write the blocks
    python3 -m worldgen.city_layout --dry-run    # print, write nothing
    python3 -m worldgen.city_layout --check      # fail on drift
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

import numpy as np

from . import catalogue, street_router
from .site_fields import PROVINCE, shared_survey

# anchor slug -> the main approach the city is entered by (owner-decided)
MAIN_APPROACH: dict[str, str] = {
    "stormhold": "route.road.gideon-stormhold",
    "thorn": "route.road.stormhold-thorn",
    "gideon": "route.road.gideon-blackwood-road",
    "archon": "route.road.archon-gideon",
    "blackrose": "route.road.soulrest-blackrose",
    "lilmoth": "route.road.blackrose-lilmoth",
    "soulrest": "route.road.gideon-soulrest",
    # water gates: the landing is the gate
    "helstrom": "route.boat.alten-corimont-helstrom",
    "alten-corimont": "route.boat.stormhold-alten-corimont",
}

LATTICE_M = 11.0
MIN_GATE_M = 60.0
MAX_GATE_M = 320.0
SLOPE_GENTLE_DEG = 12.0
SLOPE_MAX_DEG = 15.0
DRY_FLOOR = 0.9
POLY_EPS_M = 8.0
ROUND_M = 2
WAY_WIDTH_M = 4.0

# What the type recipe's water relation asks of the ground under the city.
WET_RELATION_WORDS = ("stilt", "port", "island", "river", "harbour", "harbor", "over water")
DRY_RELATION_WORDS = ("above water", "dry")
TARGET_WET = 0.25
TARGET_DRY = 0.0
TARGET_DEFAULT = 0.1


# --------------------------------------------------------------------------- #
# inputs
# --------------------------------------------------------------------------- #
def _approach_paths(province: Path) -> dict[str, list[list[float]]]:
    """Every road and lane id -> its pixel path on the 1345 analysis grid."""
    out: dict[str, list[list[float]]] = {}
    roads = json.loads((province / "routes.json").read_text())["routes"]
    for r in roads:
        out[r["id"]] = r["px"]
    lanes = json.loads((province / "waterways.json").read_text())["lanes"]
    for lane in lanes:
        out[lane["id"]] = lane["px"]
    return out


def city_records(files: list[catalogue.RegionFile]) -> dict[str, dict]:
    """anchor slug -> the catalogue record, for the nine cities."""
    out: dict[str, dict] = {}
    for rf in files:
        for rec in rf.places:
            slug = rec.get("id", "").rsplit(".", 1)[-1]
            if slug in MAIN_APPROACH:
                out[slug] = rec
    return out


def water_target(recipes: dict, rec: dict) -> float:
    """The disc's wanted water fraction, from the type recipe's siting."""
    typ = (rec.get("classification") or {}).get("type")
    relation = str(((recipes.get(typ) or {}).get("siting") or {}).get("waterRelation") or "").lower()
    if any(w in relation for w in WET_RELATION_WORDS):
        return TARGET_WET
    if any(w in relation for w in DRY_RELATION_WORDS):
        return TARGET_DRY
    return TARGET_DEFAULT


def load_recipes() -> dict:
    data = json.loads((catalogue.CATALOGUE_DIR / "type-recipes.json").read_text())
    return {t["type"]: t for t in data["types"]}


# --------------------------------------------------------------------------- #
# geometry
# --------------------------------------------------------------------------- #
LANDING_DEPTH_M = 0.6   # 97 B5: a canoe or raft landing floats at 0.6 m


def gate_point(s, px_path: list[list[float]], anchor_m: tuple[float, float],
               water: bool = False) -> tuple[float, float]:
    """The approach's terminal point AT the city: the pixel of the path nearest
    the anchor, in metres (the same pixel-centre frame the survey reads).

    A WATER gate is a landing, so it is the last point of the lane, walking in
    from the anchor end, whose RECORD depth floats a canoe (LANDING_DEPTH_M):
    the published lane runs its last metres onto dry ground to reach the
    anchor pixel, and a landing on dry ground is not a landing (measured
    2026-09-19: Helstrom's lane end lay 15 m up the shore at 0.0 m)."""
    pts = (np.asarray(px_path, dtype=np.float64) + 0.5) * s.grid_px_m
    d = np.hypot(pts[:, 0] - anchor_m[0], pts[:, 1] - anchor_m[1])
    i = int(np.argmin(d))
    if water:
        # walk from the far end towards the anchor end; the last point whose
        # record depth floats a canoe is the landing
        towards_anchor = range(len(pts)) if i >= len(pts) // 2 else range(len(pts) - 1, -1, -1)
        last = None
        for j in towards_anchor:
            row, col = s.grid_px(float(pts[j, 0]), float(pts[j, 1]))
            if float(s.recorded_depth_m[row, col]) >= LANDING_DEPTH_M:
                last = j
        if last is not None:
            i = last
    return (float(pts[i, 0]), float(pts[i, 1]))


def _disc_offsets(s, radius_m: float) -> tuple[np.ndarray, np.ndarray]:
    """Row/col offsets of the analysis cells inside a disc of `radius_m`."""
    r = int(math.ceil(radius_m / s.grid_px_m))
    dr, dc = np.mgrid[-r:r + 1, -r:r + 1]
    inside = (np.hypot(dr, dc) * s.grid_px_m) <= radius_m
    return dr[inside], dc[inside]


def score_centre(s, gate: tuple[float, float], centre: tuple[float, float],
                 radius_m: float, target: float,
                 offsets: tuple[np.ndarray, np.ndarray]) -> dict | None:
    """Score one candidate centre, or None where the cell itself is rejected."""
    row, col = s.grid_px(centre[0], centre[1])
    if bool(s.wet_grid[row, col]) or float(s.slope_grid[row, col]) > SLOPE_MAX_DEG:
        return None
    dr, dc = offsets
    rows = np.clip(row + dr, 0, s.grid_n - 1)
    cols = np.clip(col + dc, 0, s.grid_n - 1)
    dry = s.dry_grid[rows, cols]
    wet = s.wet_grid[rows, cols]
    slope = s.slope_grid[rows, cols]
    dry_frac = float(dry.mean())
    gentle = float((slope <= SLOPE_GENTLE_DEG).mean())
    mean_slope = float(slope.mean())
    water_frac = float(wet.mean())
    dist = math.dist(gate, centre)
    parts = {
        "dry": 1.0 * dry_frac,
        "gentle": 0.6 * gentle,
        "slope": -0.5 * mean_slope / 20.0,
        "water": -0.4 * abs(water_frac - target),
        "near": -0.2 * dist / MAX_GATE_M,
    }
    return {
        "centre": centre, "dryFrac": dry_frac, "gentleFrac": gentle,
        "meanSlopeDeg": mean_slope, "waterFrac": water_frac, "distM": dist,
        "parts": parts, "score": sum(parts.values()),
    }


def choose_centre(s, gate: tuple[float, float], radius_m: float,
                  target: float) -> tuple[dict | None, dict | None]:
    """(chosen, best_seen). `chosen` is None when no candidate clears the dry
    floor — an owner call, reported with the best numbers we did see."""
    offsets = _disc_offsets(s, radius_m)
    # a fixed lattice in ABSOLUTE metres: the candidate set does not depend on
    # where the gate happens to fall inside a cell.
    x0 = math.floor((gate[0] - MAX_GATE_M) / LATTICE_M) * LATTICE_M
    z0 = math.floor((gate[1] - MAX_GATE_M) / LATTICE_M) * LATTICE_M
    n = int(2 * MAX_GATE_M / LATTICE_M) + 2
    best_any: dict | None = None
    best_ok: dict | None = None
    for i in range(n + 1):
        for j in range(n + 1):
            x = round(x0 + i * LATTICE_M, ROUND_M)
            z = round(z0 + j * LATTICE_M, ROUND_M)
            if not (0.0 <= x < s.extent_m and 0.0 <= z < s.extent_m):
                continue
            d = math.dist(gate, (x, z))
            if not (MIN_GATE_M <= d <= MAX_GATE_M):
                continue
            cand = score_centre(s, gate, (x, z), radius_m, target, offsets)
            if cand is None:
                continue
            if best_any is None or cand["score"] > best_any["score"]:
                best_any = cand
            if cand["dryFrac"] > DRY_FLOOR and (best_ok is None or cand["score"] > best_ok["score"]):
                best_ok = cand
    return best_ok, best_any


def _way_blueprint(gate, centre, extent_m: float, why: str) -> tuple[dict, dict]:
    """The minimal blueprint the street router needs for one street: the way's
    own `via` sizes the local field, so no boundary or parcels are required."""
    way = {
        "id": "way.city-approach",
        "kind": "street",
        "class": "street",
        "routing": "terrain",
        "widthM": WAY_WIDTH_M,
        "why": why,
        "via": [[gate[0] / extent_m, gate[1] / extent_m],
                [centre[0] / extent_m, centre[1] / extent_m]],
    }
    bp = {"boundary": [], "parcels": [], "routes": [way], "canals": [],
          "boardwalks": [], "fences": [], "docks": [], "landmarks": []}
    return bp, way


def city_way(s, gate, centre, why: str) -> list[list[float]]:
    """The worn line from the gate to the centre, in metres."""
    bp, way = _way_blueprint(gate, centre, s.extent_m, why)
    pts_uv = street_router.route_way(way, bp, s)
    pts = [[round(p[0] * s.extent_m, ROUND_M), round(p[1] * s.extent_m, ROUND_M)]
           for p in pts_uv]
    # the router rounds in UV; pin the terminals so the way meets gate and
    # centre exactly (the catalogue validator measures both at 5 m).
    pts[0] = [round(gate[0], ROUND_M), round(gate[1], ROUND_M)]
    pts[-1] = [round(centre[0], ROUND_M), round(centre[1], ROUND_M)]
    return pts


def footprint_polygon(s, centre: tuple[float, float], radius_m: float) -> list[list[float]] | None:
    """The convex hull of the dry, walkable cells in the disc, simplified."""
    dr, dc = _disc_offsets(s, radius_m)
    row, col = s.grid_px(centre[0], centre[1])
    rows = np.clip(row + dr, 0, s.grid_n - 1)
    cols = np.clip(col + dc, 0, s.grid_n - 1)
    keep = s.dry_grid[rows, cols] & (s.slope_grid[rows, cols] <= SLOPE_MAX_DEG)
    if int(keep.sum()) < 3:
        return None
    xs = (cols[keep].astype(np.float64) + 0.5) * s.grid_px_m
    zs = (rows[keep].astype(np.float64) + 0.5) * s.grid_px_m
    hull = street_router.convex_hull([(float(x), float(z)) for x, z in zip(xs, zs)])
    if len(hull) < 3:
        return None
    simple = street_router.douglas_peucker(list(hull) + [hull[0]], POLY_EPS_M)
    if simple and simple[0] == simple[-1]:
        simple = simple[:-1]
    if len(simple) < 3:
        simple = list(hull)
    return [[round(float(x), ROUND_M), round(float(z), ROUND_M)] for x, z in simple]


#: Below this, the dry ground joined to a reseated city's centre is an island.
ISLAND_MAX_HA = 1.0
ISLAND_FOOTPRINT_WHY = "island city; spreads over the lake and onto the shore, owner 2026-09-23"


def centre_component_ha(s, centre: tuple[float, float], radius_m: float) -> float:
    """Hectares of dry, walkable ground in the disc joined (4-neighbour) to
    the centre cell."""
    from scipy import ndimage
    dr, dc = _disc_offsets(s, radius_m)
    row, col = s.grid_px(centre[0], centre[1])
    rows = np.clip(row + dr, 0, s.grid_n - 1)
    cols = np.clip(col + dc, 0, s.grid_n - 1)
    keep = s.dry_grid[rows, cols] & (s.slope_grid[rows, cols] <= SLOPE_MAX_DEG)
    r = int(dr.max())
    local = np.zeros((2 * r + 1, 2 * r + 1), dtype=bool)
    local[dr + r, dc + r] = keep
    labels, _n = ndimage.label(local)
    own = labels[r, r]
    if own == 0:
        return 0.0
    return float((labels == own).sum()) * s.grid_px_m ** 2 / 10_000.0


def city_footprint(s, centre: tuple[float, float], radius_m: float,
                   reseated: bool) -> tuple[list[list[float]] | None, str | None]:
    """(polygon, footprintWhy). A city reseated onto an island (the dry ground
    joined to its centre under ISLAND_MAX_HA) spreads over the water by
    bridges and boardwalks and onto the shore: its footprint is the whole
    type-radius disc, water included (owner 2026-09-23), so no polygon."""
    if reseated and centre_component_ha(s, centre, radius_m) < ISLAND_MAX_HA:
        return None, ISLAND_FOOTPRINT_WHY
    return footprint_polygon(s, centre, radius_m), None


def apply_footprint(rec: dict, poly, why) -> None:
    """Write a city's footprint: the polygon, or the radius disc with its why."""
    if why:
        rec.pop("footprintPolygon", None)
        rec["footprintSource"] = "band"
        rec["footprintWhy"] = why
    elif poly:
        rec["footprintPolygon"] = poly
        rec["footprintSource"] = "polygon"
        rec.pop("footprintWhy", None)


def polygon_area_m2(poly: list[list[float]]) -> float:
    a = 0.0
    for (x0, z0), (x1, z1) in zip(poly, poly[1:] + poly[:1]):
        a += x0 * z1 - x1 * z0
    return abs(a) / 2.0


def way_length_m(pts: list[list[float]]) -> float:
    return sum(math.dist(a, b) for a, b in zip(pts, pts[1:]))


# --------------------------------------------------------------------------- #
# the solve
# --------------------------------------------------------------------------- #
def solve(s, files: list[catalogue.RegionFile], province: Path = PROVINCE) -> dict[str, dict]:
    """slug -> {block, polygon, report} or {ownerCall, report}."""
    paths = _approach_paths(province)
    recipes = load_recipes()
    records = city_records(files)
    anchors = s.anchor_points_m
    from .apply_sitings import reseat_points_m
    reseats = reseat_points_m(s)
    out: dict[str, dict] = {}
    for slug in sorted(MAIN_APPROACH):
        rec = records.get(slug)
        if rec is None:
            out[slug] = {"ownerCall": "no catalogue record", "report": {}}
            continue
        approach = MAIN_APPROACH[slug]
        px_path = paths.get(approach)
        if not px_path:
            out[slug] = {"ownerCall": f"approach {approach} has no path", "report": {}}
            continue
        gate = gate_point(s, px_path, anchors[slug], water=approach.startswith("route.boat."))
        radius = float(rec["footprintRadiusM"])
        target = water_target(recipes, rec)
        if rec["id"] in reseats:
            # A reseat row is the committed centre (decision 0085 §4): the
            # lattice is not searched, the owner's point is scored as it is.
            centre = reseats[rec["id"]]
            chosen = (score_centre(s, gate, centre, radius, target,
                                   _disc_offsets(s, radius)) or {"centre": centre})
            chosen["reseat"] = True
            best = chosen
        else:
            chosen, best = choose_centre(s, gate, radius, target)
        if chosen is None:
            out[slug] = {
                "ownerCall": f"no centre clears dry fraction {DRY_FLOOR}",
                "report": {"gate": gate, "approach": approach, "target": target,
                           "best": best},
            }
            continue
        centre = chosen["centre"]
        why = (f"The main approach into {rec.get('name', slug)}: the road gate "
               f"to the city centre, on the ground it crosses.")
        way = city_way(s, gate, centre, why)
        if len(way) < 2:
            out[slug] = {"ownerCall": "no way from gate to centre",
                         "report": {"gate": gate, "best": chosen}}
            continue
        poly, fp_why = city_footprint(s, centre, radius, rec["id"] in reseats)
        block = {
            "gate": [round(gate[0], ROUND_M), round(gate[1], ROUND_M)],
            "centre": [round(centre[0], ROUND_M), round(centre[1], ROUND_M)],
            "way": way,
            "source": "street_router",
        }
        out[slug] = {"block": block, "polygon": poly, "footprintWhy": fp_why, "report": {
            "approach": approach, "target": target, "wayLengthM": way_length_m(way),
            "polygonAreaHa": (polygon_area_m2(poly) / 10_000.0) if poly else None,
            **chosen,
        }}
    return out


def apply(files: list[catalogue.RegionFile], solved: dict[str, dict]) -> list[str]:
    """Write the blocks onto the records. Returns the ids changed."""
    changed: list[str] = []
    records = city_records(files)
    for slug, res in solved.items():
        rec = records.get(slug)
        if rec is None or "block" not in res:
            continue
        before = json.dumps([rec.get("cityLayout"), rec.get("footprintPolygon"),
                             rec.get("footprintSource"), rec.get("footprintWhy")], sort_keys=True)
        rec["cityLayout"] = res["block"]
        apply_footprint(rec, res.get("polygon"), res.get("footprintWhy"))
        after = json.dumps([rec.get("cityLayout"), rec.get("footprintPolygon"),
                            rec.get("footprintSource"), rec.get("footprintWhy")], sort_keys=True)
        if before != after:
            changed.append(rec["id"])
    return changed


def _write(files: list[catalogue.RegionFile]) -> None:
    for rf in files:
        data = json.loads(rf.path.read_text())
        data["places"] = rf.places
        catalogue.dump_json(rf.path, data)


def _print_report(solved: dict[str, dict]) -> None:
    for slug, res in solved.items():
        if "block" in res:
            r = res["report"]
            p = r["parts"]
            print(f"{slug}: gate {[round(v, 1) for v in res['block']['gate']]} "
                  f"centre {[round(v, 1) for v in res['block']['centre']]} "
                  f"dist {r['distM']:.1f} m  way {r['wayLengthM']:.1f} m  "
                  f"polygon {r['polygonAreaHa'] and round(r['polygonAreaHa'], 2)} ha")
            print(f"    score {r['score']:.3f} = dry {p['dry']:.3f} "
                  f"+ gentle {p['gentle']:.3f} + slope {p['slope']:.3f} "
                  f"+ water {p['water']:.3f} + near {p['near']:.3f} "
                  f"(dryFrac {r['dryFrac']:.3f}, waterFrac {r['waterFrac']:.3f}, "
                  f"target {r['target']}, meanSlope {r['meanSlopeDeg']:.2f}°)")
        else:
            best = (res.get("report") or {}).get("best")
            extra = ""
            if best:
                extra = (f" best dryFrac {best['dryFrac']:.3f} at "
                         f"{[round(v, 1) for v in best['centre']]}, "
                         f"score {best['score']:.3f}, waterFrac {best['waterFrac']:.3f}")
            print(f"{slug}: OWNER CALL — {res['ownerCall']}.{extra}")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--dry-run", action="store_true", help="print, write nothing")
    ap.add_argument("--check", action="store_true", help="fail on drift")
    args = ap.parse_args(argv)

    s = shared_survey()
    files = catalogue.load_region_files()
    solved = solve(s, files)
    _print_report(solved)

    if args.dry_run:
        return 0

    if args.check:
        bad: list[str] = []
        records = city_records(files)
        for slug, res in solved.items():
            rec = records.get(slug)
            if rec is None:
                continue
            if "block" not in res:
                if rec.get("cityLayout") is not None:
                    bad.append(f"{rec['id']}: carries a cityLayout but is an owner call")
                continue
            if rec.get("cityLayout") != res["block"]:
                bad.append(f"{rec['id']}: cityLayout has drifted from the solve")
            if res.get("polygon") and rec.get("footprintPolygon") != res["polygon"]:
                bad.append(f"{rec['id']}: footprintPolygon has drifted from the solve")
            pos = rec.get("positionM")
            poly = rec.get("footprintPolygon")
            if poly and pos and not catalogue._point_in_polygon(pos, poly):
                print(f"note: {rec['id']} positionM is outside the footprint polygon "
                      f"— expected until macro_plot re-plots the anchor at the centre")
        for line in bad:
            print(f"DRIFT {line}")
        return 1 if bad else 0

    changed = apply(files, solved)
    _write(files)
    print(f"wrote {len(changed)} record(s): {', '.join(changed) or 'none'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
