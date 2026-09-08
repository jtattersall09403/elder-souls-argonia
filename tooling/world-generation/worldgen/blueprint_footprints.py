"""Derive parcel footprints from the measured kit geometry (Part 6, 2026-09-05).

Owner ruling 2026-09-05: a blueprint must show each building's ACTUAL outline,
and every building's orientation must be authored with a reason. So a parcel is
authored as **where** (`centreUV`), **which piece** (`assetRef`), **which way**
(`yawDeg`) and **why that way** (`orientationWhy`); its `footprint` polygon is
DERIVED here and never hand-edited.

Derivation: take the asset's measured ground hull from
``tooling/asset-pipeline/output/kits/<kit>.footprints.json`` (metres, in the
asset's local frame, centred on the pivot ``compile_settlement`` places — see
``pipeline/measure_footprints.py``), rotate it by `yawDeg`, translate it to
`centreUV` in metres, and convert back to province UV.

Angle convention (shared with the door arrows in ``render_blueprint``): world
axes are x = east, z = south, so north is −z and `yawDeg` is a compass bearing,
degrees CLOCKWISE from north. Rotating a local point (x, z) by θ gives
``(x·cosθ − z·sinθ, x·sinθ + z·cosθ)``, which reads clockwise on the map because
z runs south.

Run (from tooling/world-generation/):
  python3 -m worldgen.blueprint_footprints --apply <blueprint.json> [...]
  python3 -m worldgen.blueprint_footprints --check <blueprint.json> [...]
  python3 -m worldgen.blueprint_footprints --doors <blueprint.json> [...]
  python3 -m worldgen.blueprint_footprints --orient [--apply] [--parcels a,b] <blueprint.json>

`--orient` closes the loop the owner asked for (2026-09-05): "doors in the
right place and facing the right way is really crucial". A building is sited so
that its entrance faces the way the player arrives on, so the tool SOLVES the
parcel's `yawDeg` from the canonical entrance and the way it opens onto,
then rewrites the derived `footprint`, `facingDeg` and `thresholdUV`. It never
touches `orientationWhy`: the reason is the designer's, so the tool only prints
the parcels whose why now has to be re-read.

`--doors` checks the other half of the same contract: that every door sits on
its piece's ONE canonical `entrance` (owner ruling 2026-09-07 — the index ranks
the door evidence and exports a single answer, so there is no index to record
and any legacy `doorwayRef` is stripped). It writes footprints too, because an
entrance is only meaningful against the outline it was measured on.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

from . import blueprint_interiors as bi

REPO_ROOT = Path(__file__).resolve().parents[3]
KITS_DIR = REPO_ROOT / "tooling" / "asset-pipeline" / "output" / "kits"
# ProvinceSurvey().extent_m — the single province square (module 00-core §8,
# ×3 world scale, decision 0006). Held as a constant so the validator does not
# have to load the raster stack for a schema check. It is the SAME number
# render_blueprint holds; if the province is ever rescaled, both move together
# and every blueprint needs --apply re-running.
PROVINCE_EXTENT_M = 7373.50656
UV_ROUND = 9
DERIVED_TOLERANCE_UV = 1e-6


class FootprintLibrary:
    """Measured footprints for every built kit, keyed by kit asset id."""

    def __init__(self, kits_dir: Path = KITS_DIR):
        self.by_asset: dict[str, dict] = {}
        self.kit_of: dict[str, str] = {}
        if not kits_dir.exists():
            return
        for path in sorted(kits_dir.glob("*.footprints.json")):
            data = json.loads(path.read_text())
            for asset_id, record in data.get("assets", {}).items():
                self.by_asset.setdefault(asset_id, record)
                self.kit_of.setdefault(asset_id, data.get("kit", path.stem))

    def __bool__(self) -> bool:
        return bool(self.by_asset)

    def get(self, asset_ref: str) -> dict | None:
        return self.by_asset.get(asset_ref)


_LIBRARY: FootprintLibrary | None = None


def library(kits_dir: Path = KITS_DIR) -> FootprintLibrary:
    """Process-wide cache (read-only data, loaded once)."""
    global _LIBRARY
    if _LIBRARY is None or _LIBRARY_DIR[0] != kits_dir:
        _LIBRARY_DIR[0] = kits_dir
        _LIBRARY = FootprintLibrary(kits_dir)
    return _LIBRARY


_LIBRARY_DIR: list[Path] = [KITS_DIR]


def rotate_m(points_m, yaw_deg: float) -> list[tuple[float, float]]:
    t = math.radians(float(yaw_deg))
    c, s = math.cos(t), math.sin(t)
    return [(x * c - z * s, x * s + z * c) for x, z in points_m]


def derive_footprint(record: dict, centre_uv, yaw_deg: float,
                     extent_m: float = PROVINCE_EXTENT_M,
                     outline_key: str = "footprintM", scale: float = 1.0) -> list[list[float]]:
    """The parcel's UV polygon: measured hull → uniform scale → rotated → placed at centreUV."""
    poly_m = [[p[0] * scale, p[1] * scale] for p in (record.get(outline_key) or record.get("planOutlineM") or [])]
    cx = float(centre_uv[0]) * extent_m
    cz = float(centre_uv[1]) * extent_m
    out = []
    for x, z in rotate_m([(p[0], p[1]) for p in poly_m], yaw_deg):
        out.append([round((cx + x) / extent_m, UV_ROUND),
                    round((cz + z) / extent_m, UV_ROUND)])
    return out


def parcel_footprint(parcel: dict, lib: FootprintLibrary | None = None,
                     extent_m: float = PROVINCE_EXTENT_M) -> list[list[float]] | None:
    """Derived footprint for one parcel, or None if it cannot be derived."""
    lib = lib if lib is not None else library()
    ref = parcel.get("assetRef")
    if not isinstance(ref, str):
        return None
    record = lib.get(ref)
    if record is None:
        return None
    if not isinstance(parcel.get("centreUV"), list) or len(parcel["centreUV"]) != 2:
        return None
    if not isinstance(parcel.get("yawDeg"), (int, float)):
        return None
    outline = parcel.get("outline", "footprintM")
    scale = parcel.get("scale", 1.0)
    if not isinstance(scale, (int, float)) or scale <= 0:
        return None
    return derive_footprint(record, parcel["centreUV"], parcel["yawDeg"],
                            extent_m, outline, float(scale))


def polygons_match(a, b, tolerance: float = DERIVED_TOLERANCE_UV) -> bool:
    if not isinstance(a, list) or not isinstance(b, list) or len(a) != len(b):
        return False
    return all(abs(p[0] - q[0]) <= tolerance and abs(p[1] - q[1]) <= tolerance
               for p, q in zip(a, b))


def apply_to_blueprint(bp: dict, lib: FootprintLibrary | None = None,
                       extent_m: float = PROVINCE_EXTENT_M) -> list[str]:
    """Rewrite every parcel's `footprint` from its measured assetRef."""
    lib = lib if lib is not None else library()
    problems: list[str] = []
    for parcel in bp.get("parcels", []):
        derived = parcel_footprint(parcel, lib, extent_m)
        if derived is None:
            problems.append(
                f"{parcel.get('id')}: cannot derive footprint — needs assetRef "
                f"(measured), centreUV [u,v] and numeric yawDeg "
                f"(assetRef={parcel.get('assetRef')!r})")
            continue
        parcel["footprint"] = derived
    return problems


def parcel_centre_m(parcel: dict, extent_m: float = PROVINCE_EXTENT_M):
    """The parcel pivot in world metres — what a doorway offset is measured from."""
    c = parcel.get("centreUV")
    if not (isinstance(c, list) and len(c) == 2):
        return None
    return (float(c[0]) * extent_m, float(c[1]) * extent_m)


def apply_doors_to_blueprint(bp: dict, interiors: "bi.InteriorLibrary | None" = None,
                             extent_m: float = PROVINCE_EXTENT_M) -> list[str]:
    """Report the doors that do not sit on their piece's canonical entrance (the
    validator fails those, this only reports), and strip any legacy
    `doorwayRef` — there is one entrance now, so there is no index to keep."""
    interiors = interiors if interiors is not None else bi.library()
    parcels = {p.get("id"): p for p in bp.get("parcels", [])}
    problems: list[str] = []
    for door in bp.get("doors", []) or []:
        parcel = parcels.get(door.get("parcelId"))
        if parcel is None:
            continue
        record = interiors.get(parcel.get("assetRef"))
        centre = parcel_centre_m(parcel, extent_m)
        th = door.get("thresholdUV")
        threshold = (float(th[0]) * extent_m, float(th[1]) * extent_m) \
            if isinstance(th, list) and len(th) == 2 else None
        facing = door.get("facingDeg")
        ok, why = bi.match_entrance(record, float(parcel.get("yawDeg") or 0.0),
                                    float(facing) if isinstance(facing, (int, float)) else None,
                                    threshold, centre)
        door.pop("doorwayRef", None)
        if not ok:
            problems.append(f"{door.get('id')}: does not sit on the canonical entrance of "
                            f"{parcel.get('assetRef')} ({why})")
    return problems


# --------------------------------------------------------------------------- #
# orientation from the doorway (owner ruling 2026-09-05)
# --------------------------------------------------------------------------- #
WAY_KEYS_FOR_DOORS = ("routes", "canals", "boardwalks")
# A parcel is turned only when its doorway is further off its way than the
# ruling allows (the validator's 60°). Snapping every building exactly at its
# street would read as a surveyed grid, which module 97 C8 refuses, so the cant
# a designer authored inside the tolerance is left alone. `--exact` overrides.
ORIENT_TOLERANCE_DEG = 60.0
ORIENT_EXACT_EPSILON_DEG = 0.5
YAW_ROUND = 1


def ways_of(bp: dict):
    """(way, its plotted points) for every way a door can open onto."""
    for key in WAY_KEYS_FOR_DOORS:
        for w in bp.get(key, []) or []:
            pts = w.get("points") or w.get("via") or []
            if len(pts) >= 2:
                yield w, pts


def nearest_point_on_way(pts, point_uv):
    """(nearest [u,v] on the polyline, distance in UV)."""
    px, pz = float(point_uv[0]), float(point_uv[1])
    best = None
    for i in range(len(pts) - 1):
        ax, az = float(pts[i][0]), float(pts[i][1])
        bx, bz = float(pts[i + 1][0]), float(pts[i + 1][1])
        ex, ez = bx - ax, bz - az
        l2 = ex * ex + ez * ez
        if l2 == 0:
            continue
        t = max(0.0, min(1.0, ((px - ax) * ex + (pz - az) * ez) / l2))
        qx, qz = ax + t * ex, az + t * ez
        dist = math.hypot(px - qx, pz - qz)
        if best is None or dist < best[1]:
            best = ((qx, qz), dist)
    return best


def nearest_way(bp: dict, point_uv):
    """(way, nearest point on it, distance in UV) for the closest way to a point."""
    best = None
    for w, pts in ways_of(bp):
        near = nearest_point_on_way(pts, point_uv)
        if near is None:
            continue
        (qx, qz), dist = near
        if best is None or dist < best[2]:
            best = (w, (qx, qz), dist)
    return best


def way_by_id(bp: dict, way_id: str):
    for w, pts in ways_of(bp):
        if w.get("id") == way_id:
            return w, pts
    return None


def threshold_uv(parcel: dict, doorway: dict, yaw_deg: float,
                 lib: FootprintLibrary | None = None,
                 extent_m: float = PROVINCE_EXTENT_M,
                 facing_deg: float | None = None):
    """Where the player stands to use this doorway: the point at which the
    doorway's line of sight crosses the building's own outline.

    A doorway's measured `offsetM` is the opening's position inside the piece,
    which for a big hall sits well in from the wall, so it is the wrong point to
    call a threshold. Casting the doorway's bearing out from the pivot to the
    derived outline puts the threshold ON the wall the door claims, which is
    what the validator's edge check reads. The offset is the fallback when no
    outline can be derived.
    """
    centre = parcel_centre_m(parcel, extent_m)
    if centre is None:
        return None
    poly = parcel.get("footprint") or (parcel_footprint(parcel, lib, extent_m) or [])
    side = doorway.get("sideDeg")
    # Where the evidence is a PLACEMENT — the plugin's own load door, a door
    # part the authors stood against the shell, the family's door mesh — the
    # offset IS the door, and it may stand well off the shell's own outline
    # (a Telvanni door piece sits 6 m from the hut's pivot). Only a measured
    # opening in the mesh is a hole in the outline, and only that one is cast.
    placed = doorway.get("kind") in ("esp-door", "assembly", "door-piece")
    if poly and side is not None and not bi.is_radial(doorway) and not placed:
        bearing = math.radians((float(side) + float(yaw_deg)) % 360.0)
        dx, dz = math.sin(bearing), -math.cos(bearing)
        cu, cv = centre[0] / extent_m, centre[1] / extent_m
        hit = None
        for i in range(len(poly)):
            ax, az = float(poly[i][0]), float(poly[i][1])
            bx, bz = float(poly[(i + 1) % len(poly)][0]), float(poly[(i + 1) % len(poly)][1])
            ex, ez = bx - ax, bz - az
            den = dx * ez - dz * ex
            if abs(den) < 1e-15:
                continue
            t = ((ax - cu) * ez - (az - cv) * ex) / den
            # u is the parameter along the edge, from the same 2x2 solve
            u = (dx * (az - cv) - dz * (ax - cu)) / -den
            if t > 0 and 0.0 <= u <= 1.0 and (hit is None or t > hit):
                hit = t
        if hit is not None:
            return [round(cu + dx * hit, UV_ROUND), round(cv + dz * hit, UV_ROUND)]
    if bi.is_radial(doorway) and facing_deg is not None:
        # A radial entrance says the door stands ON the ring and lets the placer
        # choose the bearing; the door's own facing IS that bearing, so the
        # threshold is the ring point it looks out from.
        radius = bi.entrance_radius_m(doorway)
        if radius is not None:
            bearing = math.radians(float(facing_deg) % 360.0)
            return [round((centre[0] + math.sin(bearing) * radius) / extent_m, UV_ROUND),
                    round((centre[1] - math.cos(bearing) * radius) / extent_m, UV_ROUND)]
    off = bi.entrance_offset_m(doorway, yaw_deg)
    if off is None:
        return None
    return [round((centre[0] + off[0]) / extent_m, UV_ROUND),
            round((centre[1] + off[1]) / extent_m, UV_ROUND)]


def _trim_snapped_end(parcel_id: str, way: dict, pts):
    """The stretch of a way a player walks, with the end the router snapped to
    THIS parcel dropped.

    `street_router` pulls a way that `endsAt` a building onto its hull, so that
    last vertex is the building, not the street. Aiming a door at it would chase
    the door round the parcel as it turns; dropping it makes the target
    yaw-independent, which is what makes this tool idempotent.
    """
    if parcel_id not in (way.get("endsAt") or []) or len(pts) < 2:
        return pts
    return pts[:-1]


def way_point_facing(parcel: dict, way: dict, way_pts, extent_m: float = PROVINCE_EXTENT_M):
    """The point on the way this parcel's door should look at: the nearest point
    of the walked line to the parcel pivot."""
    centre = parcel_centre_m(parcel, extent_m)
    pts = _trim_snapped_end(parcel.get("id"), way, list(way_pts or []))
    if centre is None or not pts:
        return None
    if len(pts) == 1:
        # A two-point way that ends at this building: what is left of it is the
        # line the player walks in on, so the door looks back down that line.
        return (float(pts[0][0]) * extent_m, float(pts[0][1]) * extent_m)
    near = nearest_point_on_way(pts, [centre[0] / extent_m, centre[1] / extent_m])
    if near is None:
        return None
    (qu, qv), _dist = near
    return (qu * extent_m, qv * extent_m)


def solve_yaw(bp: dict, parcel: dict, doorway: dict, way: dict, way_pts,
              extent_m: float) -> float | None:
    """The yaw that turns this doorway to face the way the player walks on.

    Solved from the parcel PIVOT, which does not move, so the answer is the same
    however many times the tool is run — a bearing taken from the threshold
    would chase itself, because turning the parcel moves the threshold.
    """
    side = doorway.get("sideDeg")
    if side is None or bi.is_radial(doorway):
        return None
    centre = parcel_centre_m(parcel, extent_m)
    target = way_point_facing(parcel, way, way_pts, extent_m)
    if centre is None or target is None:
        return None
    bearing = math.degrees(math.atan2(target[0] - centre[0], -(target[1] - centre[1]))) % 360.0
    return (bearing - float(side)) % 360.0


def orient_blueprint(bp: dict, parcel_ids: set[str] | None = None,
                     interiors: "bi.InteriorLibrary | None" = None,
                     lib: FootprintLibrary | None = None,
                     extent_m: float = PROVINCE_EXTENT_M,
                     exact: bool = False) -> list[dict]:
    """Solve each doored parcel's yaw from its entrance and the way it opens onto.

    Returns one report row per parcel considered:
    {parcelId, doorId, wayId, oldYawDeg, newYawDeg, deltaDeg, moved, note}.
    The blueprint is MUTATED only for rows with `moved` True; `orientationWhy`
    is never touched (the caller re-reads the whys the report names).
    """
    interiors = interiors if interiors is not None else bi.library()
    lib = lib if lib is not None else library()
    parcels = {p.get("id"): p for p in bp.get("parcels", []) or []}
    seen: set[str] = set()
    rows: list[dict] = []
    for door in bp.get("doors", []) or []:
        pid = door.get("parcelId")
        if pid in seen or pid not in parcels:
            continue
        if parcel_ids is not None and pid not in parcel_ids:
            continue
        seen.add(pid)
        parcel = parcels[pid]
        record = interiors.get(parcel.get("assetRef"))
        doorway = bi.entrance(record)
        if doorway is None:
            rows.append({"parcelId": pid, "doorId": door.get("id"), "wayId": None,
                         "oldYawDeg": parcel.get("yawDeg"), "newYawDeg": None,
                         "deltaDeg": None, "moved": False,
                         "note": "the kit derives no entrance for this piece"})
            continue
        if bi.is_radial(doorway):
            # The yaw is free, but the threshold is not: it has to stand on the
            # ring the authors' own placements measured, on the bearing this
            # door looks out along.
            note = "radial entrance — any bearing is a way in, so yaw is free"
            th = threshold_uv(parcel, doorway, float(parcel.get("yawDeg") or 0.0), lib,
                              extent_m, facing_deg=door.get("facingDeg"))
            if th is not None and th != door.get("thresholdUV"):
                door["thresholdUV"] = th
                note += "; the threshold was moved onto the ring"
            rows.append({"parcelId": pid, "doorId": door.get("id"), "wayId": None,
                         "oldYawDeg": parcel.get("yawDeg"), "newYawDeg": None,
                         "deltaDeg": None, "moved": False, "note": note})
            continue
        hint = door.get("facesWay") or parcel.get("facesWay")
        target = way_by_id(bp, hint) if hint else None
        if hint and target is None:
            rows.append({"parcelId": pid, "doorId": door.get("id"), "wayId": hint,
                         "oldYawDeg": parcel.get("yawDeg"), "newYawDeg": None,
                         "deltaDeg": None, "moved": False,
                         "note": f"facesWay {hint!r} names no way in this blueprint"})
            continue
        if target is None:
            th = door.get("thresholdUV") or threshold_uv(
                parcel, doorway, float(parcel.get("yawDeg") or 0.0), lib, extent_m)
            near = nearest_way(bp, th) if th else None
            if near is None:
                rows.append({"parcelId": pid, "doorId": door.get("id"), "wayId": None,
                             "oldYawDeg": parcel.get("yawDeg"), "newYawDeg": None,
                             "deltaDeg": None, "moved": False,
                             "note": "no way to face — the door opens onto nothing"})
                continue
            target = (near[0], near[0].get("points") or near[0].get("via"))
        way, way_pts = target
        old = float(parcel.get("yawDeg") or 0.0)
        new = solve_yaw(bp, parcel, doorway, way, way_pts, extent_m)
        if new is None:
            rows.append({"parcelId": pid, "doorId": door.get("id"), "wayId": way.get("id"),
                         "oldYawDeg": old, "newYawDeg": None, "deltaDeg": None,
                         "moved": False, "note": "yaw could not be solved (no offset measured)"})
            continue
        new = round(new, YAW_ROUND)
        delta = abs((new - old + 180.0) % 360.0 - 180.0)
        row = {"parcelId": pid, "doorId": door.get("id"), "wayId": way.get("id"),
               "oldYawDeg": old, "newYawDeg": new, "deltaDeg": round(delta, 2),
               "moved": delta > (ORIENT_EXACT_EPSILON_DEG if exact else ORIENT_TOLERANCE_DEG),
               "note": ""}
        if row["moved"]:
            parcel["yawDeg"] = new
            derived = parcel_footprint(parcel, lib, extent_m)
            if derived is not None:
                parcel["footprint"] = derived
            door["facingDeg"] = round((float(doorway["sideDeg"]) + new) % 360.0, YAW_ROUND)
            th = threshold_uv(parcel, doorway, new, lib, extent_m)
            if th is not None:
                door["thresholdUV"] = th
        else:
            # The parcel keeps its authored cant, but the threshold is derived:
            # refresh it, or a door goes on standing where an older rule put it.
            th = threshold_uv(parcel, doorway, old, lib, extent_m)
            if th is not None and th != door.get("thresholdUV"):
                door["thresholdUV"] = th
            row["note"] = ("already faces its way" if delta <= ORIENT_EXACT_EPSILON_DEG
                           else f"within the {ORIENT_TOLERANCE_DEG:.0f}° the ruling allows, "
                                f"so the authored cant stands")
        rows.append(row)
    return rows


def orient_file(path: Path, parcel_ids: set[str] | None = None,
                apply: bool = False, exact: bool = False) -> list[dict]:
    text = path.read_text()
    data = json.loads(text)
    rows = orient_blueprint(data.get("blueprint", {}), parcel_ids, exact=exact)
    # A radial entrance never "moves" a parcel but may still have its threshold
    # pulled onto the ring, so the write is gated on the blueprint changing.
    changed = json.dumps(data, sort_keys=True) != json.dumps(json.loads(text), sort_keys=True)
    if apply and changed:
        path.write_text(json.dumps(data, indent=_indent_of(text)) + "\n")
    return rows


def _indent_of(text: str) -> int:
    """The file's own indent, so --apply does not reformat the whole blueprint
    (the live files are indent 1, the fixture is indent 2)."""
    for line in text.splitlines()[1:]:
        stripped = line.lstrip(" ")
        if stripped:
            return len(line) - len(stripped) or 1
    return 1


def apply_to_file(path: Path, lib: FootprintLibrary | None = None,
                  doors: bool = False) -> list[str]:
    text = path.read_text()
    data = json.loads(text)
    bp = data.get("blueprint", {})
    problems = apply_to_blueprint(bp, lib)
    if doors:
        problems += apply_doors_to_blueprint(bp)
    path.write_text(json.dumps(data, indent=_indent_of(text)) + "\n")
    return problems


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--apply", action="store_true", help="rewrite footprints in place")
    ap.add_argument("--check", action="store_true", help="report mismatches only")
    ap.add_argument("--doors", action="store_true",
                    help="also check every door against its piece's canonical entrance, "
                         "stripping any legacy doorwayRef (implies --apply)")
    ap.add_argument("--orient", action="store_true",
                    help="solve each doored parcel's yaw so the doorway faces the way it opens "
                         "onto; reports old vs new, and writes only with --apply")
    ap.add_argument("--parcels", default="",
                    help="comma-separated parcel ids to limit --orient to")
    ap.add_argument("--exact", action="store_true",
                    help="with --orient: aim every doorway exactly at its way, not only "
                         "the ones outside the 60 deg the ruling allows")
    ap.add_argument("paths", nargs="+")
    args = ap.parse_args()
    if args.doors:
        args.apply = True
    if not args.orient and args.apply == args.check:
        ap.error("choose exactly one of --apply / --check / --doors")

    lib = library()
    if not lib:
        print("blueprint_footprints: no <kit>.footprints.json found — run "
              "python3 -m pipeline.measure_footprints from tooling/asset-pipeline/",
              file=sys.stderr)
        return 1

    if args.orient:
        only = {s.strip() for s in args.parcels.split(",") if s.strip()} or None
        turned = 0
        for raw in args.paths:
            path = Path(raw)
            rows = orient_file(path, only, apply=args.apply, exact=args.exact)
            for row in rows:
                if row["newYawDeg"] is None:
                    print(f"blueprint_footprints: {path.name}: {row['parcelId']}: {row['note']}")
                    continue
                mark = "TURNED" if row["moved"] else "kept  "
                print(f"blueprint_footprints: {path.name}: {mark} {row['parcelId']} "
                      f"{row['oldYawDeg']:.1f}° → {row['newYawDeg']:.1f}° "
                      f"({row['deltaDeg']:.1f}° to face {row['wayId']})"
                      + (f" — {row['note']}" if row["note"] else ""))
            moved = [r["parcelId"] for r in rows if r["moved"]]
            turned += len(moved)
            if moved:
                print(f"blueprint_footprints: {path.name}: re-read orientationWhy on "
                      + ", ".join(moved))
        print(f"blueprint_footprints: {'applied' if args.apply else 'dry run'} — "
              f"{turned} parcel(s) turned")
        return 0

    failures = 0
    for raw in args.paths:
        path = Path(raw)
        data = json.loads(path.read_text())
        bp = data.get("blueprint", {})
        if args.apply:
            problems = apply_to_file(path, lib, doors=args.doors)
            for p in problems:
                print(f"blueprint_footprints: {path.name}: {p}", file=sys.stderr)
            failures += len(problems)
            print(f"blueprint_footprints: {path.name} — "
                  f"{len(bp.get('parcels', []))} parcels, {len(problems)} unresolved")
        else:
            for parcel in bp.get("parcels", []):
                derived = parcel_footprint(parcel, lib)
                if derived is None or not polygons_match(parcel.get("footprint"), derived):
                    print(f"blueprint_footprints: {path.name}: {parcel.get('id')}: "
                          "footprint is not the derived polygon — run --apply",
                          file=sys.stderr)
                    failures += 1
    print(f"blueprint_footprints: {'FAIL' if failures else 'OK'}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
