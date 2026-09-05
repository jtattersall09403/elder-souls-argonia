"""Write Part 6 sitings back to the plotted map — and re-run what depends on it.

    cd tooling/world-generation
    python3 -m worldgen.apply_sitings            # blueprints → overrides → re-plot → routes/waterways/exports
    python3 -m worldgen.apply_sitings --dry-run  # show which places would move, and by how much

WHY (owner ruling 2026-09-05)
-----------------------------
Four of the five Part 6 exemplars could not stand on their plotted point and
were re-sited on measurement, 69–149 m away. A blueprint that moves a place
must move the DOT too, or the map, the minor routes, the waterways, the
hostility measure and the studio all describe a place that is not there. So:
the blueprint's chosen siting is the source of truth for its position; this
tool copies every chosen siting into `macro-plot-overrides.json`, re-runs the
macro plot (which pins those records and solves everything else around them),
then re-runs the dependants. Standing rule, now and for every future move —
see docs/world/96-placement-playbook.md.

Incremental by default (owner intent: correct the affected places and their
paths, not re-shuffle the province): the sited records are moved in place,
their plot facts re-measured, neighbours within NEIGHBOUR_WARN_M reported, and
the plot's dependants re-run. A full re-solve (`--replot`) pins the same
records inside `worldgen.macro_plot` so a future whole-province plot cannot
drift them either — but a greedy re-solve moves everything else too (106
records, some by kilometres, when this was first tried), so it is not the
default.

What re-runs after a move (the plot's dependants):
  [--replot only] worldgen.macro_plot → whole-province solve with the sitings pinned
  worldgen.compile_minor_routes  → tracks/footpaths/boardwalks from the plot
  worldgen.compile_minor_waterways
  worldgen.hostility_frequency   → the travel measure
  worldgen.export_places / export_routes → the studio layers
"""

from __future__ import annotations

import argparse
import json
import math
import subprocess
import sys
from pathlib import Path

from . import blueprint as bp_mod
from . import catalogue
from .macro_plot import OVERRIDES_PATH
from .site_fields import ProvinceSurvey

MOVE_THRESHOLD_M = 5.0
NEIGHBOUR_WARN_M = 120.0
CHAIN = ["worldgen.compile_minor_routes", "worldgen.compile_minor_waterways",
         "worldgen.hostility_frequency", "worldgen.export_places", "worldgen.export_routes"]


def apply_incremental(s: ProvinceSurvey, overrides: list[dict]) -> list[str]:
    """Move only the sited records: position, plotFacts (re-measured at the
    new point), whySiteWon, plotOverride. Returns neighbour warnings."""
    from .macro_plot import pinned_candidate
    files = list(catalogue.load_region_files())
    by_id = {rec["id"]: (rf, rec) for rf in files for rec in rf.places}
    live = [(rec["id"], rec["positionM"]) for rf in files for rec in rf.places
            if rec.get("positionM") and rec.get("status") not in ("cut", "deferred")]
    warnings, touched = [], set()
    for o in overrides:
        rf, rec = by_id[o["id"]]
        x, z = s.uv_to_m(float(o["u"]), float(o["v"]))
        c = pinned_candidate(s, rec["id"], x, z)
        rec["position"] = {"u": round(o["u"], 5), "v": round(o["v"], 5)}
        rec["positionM"] = [round(x, 1), round(z, 1)]
        rec["plotFacts"] = {"landform": c.landform, "regionClass": c.region, "dangerBand": c.danger,
                            "distanceToRouteM": round(c.route_m, 1), "distanceToWaterM": round(c.water_m, 1), "score": None}
        rec["whySiteWon"] = f"Pinned by the Part 6 meso siting ({o['source']}): {o['why'].rstrip('.')}."
        rec["plotOverride"] = {"source": "blueprint", "why": o["why"], "candidateId": o.get("candidateId")}
        rec["candidatesConsidered"] = [c for c in rec.get("candidatesConsidered", []) if not str(c.get("siteId", "")).startswith("pinned.")]
        rec["workflow"] = "plotted"
        touched.add(rf.path)
        for oid, pm in live:
            if oid != rec["id"] and math.hypot(pm[0] - x, pm[1] - z) < NEIGHBOUR_WARN_M:
                warnings.append(f"{rec['id']} now {math.hypot(pm[0] - x, pm[1] - z):.0f} m from {oid} — check spacing / the blueprint's boundary")
    for rf in files:
        if rf.path in touched:
            catalogue.dump_json(rf.path, {"schemaVersion": catalogue.PLACES_SCHEMA_VERSION, "region": rf.region,
                                          "seed": rf.seed, "places": rf.places})
    return warnings


def chosen_sitings() -> list[dict]:
    """[{id, positionM, why}] for every blueprint with a chosen candidate."""
    out = []
    for path in sorted(bp_mod.BLUEPRINT_DIR.glob("place.*.json")):
        bp = json.loads(path.read_text(encoding="utf-8"))["blueprint"]
        cands = (bp.get("siting") or {}).get("candidates") or []
        chosen = [c for c in cands if c.get("chosen")]
        if len(chosen) != 1:
            continue
        c = chosen[0]
        out.append({"id": bp["id"], "positionM": [float(c["positionM"][0]), float(c["positionM"][1])],
                    "why": c.get("why", ""), "candidateId": c.get("id"), "blueprint": str(path.relative_to(catalogue.REPO_ROOT))})
    return out


def current_positions() -> dict[str, list[float]]:
    return {rec["id"]: rec["positionM"] for rf in catalogue.load_region_files() for rec in rf.places if rec.get("positionM")}


def build_overrides(s: ProvinceSurvey) -> tuple[list[dict], list[dict]]:
    """Every chosen siting becomes an override (pinned, whether or not it moved,
    so a later re-plot cannot drift it). Returns (overrides, moves report)."""
    now = current_positions()
    anchors = s.anchor_points_m
    overrides, moves = [], []
    for st in chosen_sitings():
        x, z = st["positionM"]
        if st["id"].rsplit(".", 1)[-1] in anchors:
            # a major city keeps its owner-approved anchor dot; the blueprint's
            # geometry sits around it (candidates there are about the districts)
            moves.append({"id": st["id"], "from": now.get(st["id"]), "to": [x, z], "distanceM": None, "moved": False, "anchor": True})
            continue
        u, v = s.m_to_uv(x, z)
        overrides.append({"id": st["id"], "u": round(u, 6), "v": round(v, 6), "why": st["why"],
                          "source": st["blueprint"], "candidateId": st["candidateId"]})
        old = now.get(st["id"])
        dist = math.hypot(x - old[0], z - old[1]) if old else None
        moves.append({"id": st["id"], "from": old, "to": [x, z], "distanceM": None if dist is None else round(dist, 1),
                      "moved": dist is None or dist > MOVE_THRESHOLD_M})
    overrides.sort(key=lambda o: o["id"])
    return overrides, moves


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-chain", action="store_true", help="write the overrides and move the records only; do not re-run the dependants")
    ap.add_argument("--replot", action="store_true", help="full whole-province re-solve with the sitings pinned (moves other records too)")
    a = ap.parse_args(argv)
    s = ProvinceSurvey()
    overrides, moves = build_overrides(s)
    for m in moves:
        flag = "ANCH" if m.get("anchor") else ("MOVE" if m["moved"] else "same")
        print(f"  {flag:4s} {m['id']:55s} {m['distanceM']} m")
    if a.dry_run:
        return 0
    OVERRIDES_PATH.write_text(json.dumps({"schemaVersion": 1, "generatedBy": "worldgen.apply_sitings — do not hand-edit; the blueprint's chosen siting is the source",
                                          "overrides": overrides}, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {OVERRIDES_PATH.relative_to(catalogue.REPO_ROOT)} ({len(overrides)} pinned)")
    if a.replot:
        r = subprocess.run([sys.executable, "-m", "worldgen.macro_plot"], cwd=Path(__file__).resolve().parents[1])
        if r.returncode != 0:
            return r.returncode
    else:
        for w in apply_incremental(s, overrides):
            print(f"  WARN {w}")
        print(f"moved {sum(1 for m in moves if m['moved'])} record(s) in place; plot facts re-measured")
    if a.no_chain:
        return 0
    for mod in CHAIN:
        print(f"== {mod}")
        r = subprocess.run([sys.executable, "-m", mod], cwd=Path(__file__).resolve().parents[1])
        if r.returncode != 0:
            print(f"apply_sitings: {mod} failed ({r.returncode})", file=sys.stderr)
            return r.returncode
    return 0


if __name__ == "__main__":
    sys.exit(main())
