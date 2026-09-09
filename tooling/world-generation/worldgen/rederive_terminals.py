"""Re-derive the values a blueprint holds AGAINST the province road network.

`street_router` derives a way's `points` from its authored `via`, and
`blueprint_footprints` derives footprints and doors from a parcel's `yawDeg`.
Neither of them re-reads the *province* network, so three authored numbers go
stale the moment a route is re-solved on new ground:

* `approaches[].viaUV` — the arrow the sequence is described along. Checked
  against the route by `blueprint_integration` (`APPROACH_ON_ROUTE_M`), so a
  road that moved leaves the prose describing a line the player is not on.
* `networkTerminals[].entryUV` — the point the road hands over at
  (`TERMINAL_ROUTE_M`).
* a gate parcel's `yawDeg` — a gate stands ACROSS its road, so its yaw runs
  parallel to the route bearing at the entry (`GATE_SQUARE_TOL_DEG`).

This module re-derives all three from the published network, in metres, using
the same helpers the checks use — so the fix for "the road moved" is a re-run,
never a hand-nudged coordinate (which the validators reject as drift).

The 180-degree choice for a gate yaw is made by keeping the sense the author
gave it: of the two yaws parallel to the road, the one nearer the authored
value wins, so the door the footprint derivation swings off it keeps facing
the side it was written to face.

    python3 -m worldgen.rederive_terminals --apply <blueprint.json> ...

then re-run `street_router --apply` and `blueprint_footprints --areas --doors
--orient`, which consume what this writes.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from shapely.geometry import LineString, Point

from . import blueprint_integration as bi
from . import province_network as pn
from .site_fields import ProvinceSurvey

UV_DP = 9


def _uv(survey, x: float, z: float) -> list[float]:
    u, v = survey.m_to_uv(x, z)
    return [round(float(u), UV_DP), round(float(v), UV_DP)]


def rederive(bp: dict, survey, network: dict) -> list[str]:
    """Rewrite the network-facing values in place; return one line per change."""
    changes: list[str] = []
    lines = {rid: LineString(r.points_m) for rid, r in network.items()
             if len(r.points_m) >= 2}

    # 1. terminals: the entry point sits ON the province line.
    entry_of: dict[str, Point] = {}
    bearing_of: dict[str, float] = {}
    for t in bp.get("networkTerminals") or []:
        line = lines.get(t.get("routeId"))
        entry = t.get("entryUV")
        if line is None or not (isinstance(entry, list) and len(entry) == 2):
            continue
        pt = Point(*bi._m(survey, entry))
        moved = line.interpolate(line.project(pt))
        d = pt.distance(moved)
        if d > bi.TERMINAL_ROUTE_M:
            t["entryUV"] = _uv(survey, moved.x, moved.y)
            changes.append(f"terminal {t['id']} entryUV moved {d:.1f} m onto {t['routeId']}")
            pt = moved
        entry_of[t["routeId"]] = pt
        b = bi._line_bearing_at(line, pt, bi.TERMINAL_BEARING_RUN_M)
        if b is not None:
            bearing_of[t["routeId"]] = b

    # 2. approaches: every arrow point projected onto the route it names, with
    #    the first point pushed out along the route to the standoff the
    #    sequence is judged from.
    for ap in bp.get("approaches") or []:
        rid = ap.get("fromRouteId")
        line = lines.get(rid)
        via = ap.get("viaUV")
        if line is None or not isinstance(via, list) or not via:
            continue
        pts = [Point(*bi._m(survey, p)) for p in via
               if isinstance(p, list) and len(p) == 2]
        if len(pts) != len(via):
            continue
        worst = max(line.distance(p) for p in pts)
        s = [line.project(p) for p in pts]
        entry = entry_of.get(rid)
        if entry is not None:
            s_entry = line.project(entry)
            # Keep the direction of travel the author digitised, and start the
            # arrow at least APPROACH_STANDOFF_M out from the gate. The check
            # measures that STRAIGHT, so on a bending road walk the arc out
            # until the straight-line standoff is met with a little to spare.
            sign = 1.0 if s[0] >= s_entry else -1.0
            walk = max(0.0, bi.APPROACH_STANDOFF_M)
            while walk <= line.length:
                cand = min(max(s_entry + sign * walk, 0.0), line.length)
                if line.interpolate(cand).distance(entry) >= bi.APPROACH_STANDOFF_M + 2.0:
                    break
                walk += 1.0
            floor = min(max(s_entry + sign * walk, 0.0), line.length)
            s[0] = max(s[0], floor) if sign > 0 else min(s[0], floor)
            # the arrow is a walk in, so the rest of it stays between the first
            # point and the entry, in order and never doubled back on itself
            for i in range(1, len(s)):
                lo, hi = sorted((s[0], s_entry))
                s[i] = min(max(s[i], lo), hi)
        moved = [line.interpolate(v) for v in s]
        new_uv = [_uv(survey, p.x, p.y) for p in moved]
        if new_uv == via:
            continue
        ap["viaUV"] = new_uv
        changes.append(f"approach {ap['id']} viaUV re-projected onto {rid} "
                       f"(worst point was {worst:.1f} m off)")

    # 3. gates: a gate stands across its road, so its yaw is parallel to the
    #    route bearing at the entry.
    span_route = {t.get("wayId"): t.get("routeId") for t in bp.get("networkTerminals") or []}
    for parcel in bp.get("parcels") or []:
        rid = span_route.get(parcel.get("spans"))
        yaw = parcel.get("yawDeg")
        b = bearing_of.get(rid)
        if b is None or not isinstance(yaw, (int, float)):
            continue
        off = bi._axis_delta(float(yaw), b)
        if off <= bi.GATE_SQUARE_TOL_DEG:
            continue
        candidates = (b % 360.0, (b + 180.0) % 360.0)
        best = min(candidates, key=lambda c: abs(((c - float(yaw) + 180.0) % 360.0) - 180.0))
        parcel["yawDeg"] = round(best, 3)
        changes.append(f"gate {parcel['id']} yawDeg {float(yaw):.1f} -> {best:.1f} "
                       f"(square to {rid} on {b:.1f}deg; was {off:.0f}deg off)")
    return changes


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("paths", nargs="+", type=Path)
    parser.add_argument("--apply", action="store_true",
                        help="rewrite the blueprint; without it, report only")
    args = parser.parse_args(argv)
    survey = ProvinceSurvey()
    network = pn.load_network()
    findings = 0
    for path in args.paths:
        doc = json.loads(path.read_text())
        bp = doc.get("blueprint", doc)
        changes = rederive(bp, survey, network)
        findings += len(changes)
        for line in changes:
            print(f"rederive_terminals: {path.name}: {line}")
        if changes and args.apply:
            path.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n")
    print(f"rederive_terminals: {findings} value(s) "
          f"{'rewritten' if args.apply else 'stale (dry run)'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
