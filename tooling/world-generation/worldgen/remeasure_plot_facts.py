"""Re-measure the committed `plotFacts` physical distances against the rasters.

    cd tooling/world-generation
    python3 -m worldgen.remeasure_plot_facts --dry-run   # report, write nothing
    python3 -m worldgen.remeasure_plot_facts             # write the corrected facts

WHY
---
`plotFacts.distanceToWaterM` and `distanceToRouteM` are MEASUREMENTS, but for
the nine owner-approved anchors they were literal zeros written by
`macro_plot.assign()`, and `committed_candidate()` read the number back out of
the record's own `plotFacts` — so a placeholder was copied forward on every
re-plot and could never self-correct. Eight of the nine anchors shipped a wrong
distance to water (Lilmoth 0.0 recorded, 107.7 m measured; Stormhold 109.7 m).
Full diagnosis:
`docs/research/world-terrain/place-water-facts-vs-shipped-water.md` §5.1–5.2.

Both root causes are fixed in `macro_plot`, but a seeded (committed) record is
never rewritten by the plot — `apply_to_records` skips it — so nothing in the
chain would ever correct the numbers already in the catalogue. This tool is
that one pass.

WHAT IT DOES NOT DO
-------------------
It rewrites FACTS, never POSITIONS. `positionM` and `position` are captured
before the pass and asserted byte-identical after it; a single changed dot
aborts the write. No other field on the record is touched. It runs nothing
downstream: no terrain chain, no re-plot, no settlement compile.

WHICH SEASON (decision 0049)
----------------------------
`plotFacts.distanceToWaterM` means: **metres to the nearest cell that holds
standing water in the DRY (base) season** — water that is there all year. That
is `ProvinceSurvey.dist_to_water_m`, the Euclidean distance transform of
`ShippedWater.wet_grid("dry")`, and it is the harsher of the two seasons: a
berth, a lane or a quay has to satisfy it. Anything wanting the seasonal
maximum asks `wet_season_grid` explicitly and says so. One season, named once,
shared by the writer here, by `macro_plot`, by `audit_place_semantics` and by
the gate in `test_committed_water_facts.py`.
"""

from __future__ import annotations

import argparse
import json
from copy import deepcopy

from . import catalogue
from .site_fields import ProvinceSurvey

#: The season a `plotFacts` distance means. See the module docstring.
PLOT_FACT_SEASON = "dry"

#: A rewrite this small is rounding, not a correction; reported, not counted.
REPORT_EPS_M = 0.05


#: Every physical distance `plotFacts` carries, and the raster that owns it.
#: `distanceToRouteM` is off by default (`--with-route`): the route network is
#: being re-published by the route-structures work as of 2026-09-09, so
#: re-measuring it now would bake a mid-flight raster into the catalogue. It is
#: queued for the terrain-chain pass that re-runs the route compilers — the
#: nine anchors' literal `distanceToRouteM: 0.0` is still in the data until
#: then, though `macro_plot` no longer writes or trusts one.
MEASURED_FIELDS = ("distanceToWaterM", "distanceToRouteM")


def measure(s: ProvinceSurvey, x: float, z: float,
            fields: tuple[str, ...] = MEASURED_FIELDS) -> dict[str, float]:
    """The physical facts of one dot, off the current rasters."""
    row, col = s.grid_px(float(x), float(z))
    all_of = {
        "distanceToRouteM": round(float(s.dist_to_route_m[row, col]), 1),
        "distanceToWaterM": round(float(s.dist_to_water_m[row, col]), 1),
    }
    return {k: v for k, v in all_of.items() if k in fields}


def remeasure(s: ProvinceSurvey, files: list[catalogue.RegionFile],
              fields: tuple[str, ...] = MEASURED_FIELDS) -> list[dict]:
    """Rewrite the measured facts in place. Returns one row per change."""
    changes: list[dict] = []
    for rf in files:
        for rec in rf.places:
            pos = rec.get("positionM")
            facts = rec.get("plotFacts")
            if not (isinstance(pos, list) and len(pos) == 2 and isinstance(facts, dict)):
                continue
            now = measure(s, pos[0], pos[1], fields)
            for key, value in now.items():
                was = facts.get(key)
                facts[key] = value
                if was is None or abs(float(was) - value) > REPORT_EPS_M:
                    changes.append({"id": rec["id"], "field": key,
                                    "was": None if was is None else float(was),
                                    "now": value, "positionM": list(pos)})
    return changes


def _positions(files: list[catalogue.RegionFile]) -> dict[str, str]:
    """A canonical dump of every dot, for the no-place-moved assertion."""
    return {rec["id"]: json.dumps([rec.get("position"), rec.get("positionM")],
                                  sort_keys=True)
            for rf in files for rec in rf.places}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true", help="report, write nothing")
    ap.add_argument("--top", type=int, default=25, help="how many changes to print")
    ap.add_argument("--with-route", action="store_true",
                    help="also re-measure distanceToRouteM (see MEASURED_FIELDS)")
    args = ap.parse_args(argv)
    fields = MEASURED_FIELDS if args.with_route else ("distanceToWaterM",)

    s = ProvinceSurvey()
    files = list(catalogue.load_region_files())
    before_pos = _positions(files)
    before_recs = {rec["id"]: deepcopy(rec) for rf in files for rec in rf.places}

    changes = remeasure(s, files, fields)

    after_pos = _positions(files)
    moved = [rid for rid in before_pos if before_pos[rid] != after_pos.get(rid)]
    assert not moved, f"THIS TOOL MUST NOT MOVE A PLACE; moved: {moved[:10]}"
    # ...and nothing but the two measured keys may differ, anywhere.
    touched: set[tuple[str, str]] = set()
    for rf in files:
        for rec in rf.places:
            old = before_recs[rec["id"]]
            assert set(old) == set(rec), rec["id"]
            for k in rec:
                if k == "plotFacts":
                    continue
                assert old[k] == rec[k], f"{rec['id']}: {k} changed"
            of, nf = old.get("plotFacts") or {}, rec.get("plotFacts") or {}
            assert set(of) == set(nf), rec["id"]
            for k in nf:
                if of[k] != nf[k]:
                    touched.add((rec["id"], k))
    stray = {k for _, k in touched} - set(fields)
    assert not stray, f"fields rewritten that are not measurements: {sorted(stray)}"

    changes.sort(key=lambda c: -abs(c["now"] - (c["was"] or 0.0)))
    print(f"season: {PLOT_FACT_SEASON}; fields: {', '.join(fields)}; records with a position and plotFacts: "
          f"{len(before_pos)}; facts corrected: {len(changes)}")
    for c in changes[: args.top]:
        print(f"  {c['id']:<58} {c['field']:<18} {c['was']} -> {c['now']}")
    if len(changes) > args.top:
        print(f"  ... and {len(changes) - args.top} more")
    print(f"positions verified byte-identical: {len(before_pos)}/{len(before_pos)}")

    if args.dry_run:
        print("--dry-run: nothing written")
        return 0
    for rf in files:
        catalogue.dump_json(rf.path, {"schemaVersion": catalogue.PLACES_SCHEMA_VERSION,
                                      "region": rf.region, "seed": rf.seed,
                                      "places": rf.places})
    print(f"written: {len(files)} region files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
