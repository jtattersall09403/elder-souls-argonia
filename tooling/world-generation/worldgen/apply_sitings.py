"""Write Part 6 sitings back to the plotted map — and re-run what depends on it.

    cd tooling/world-generation
    python3 -m worldgen.apply_sitings            # blueprints → overrides → re-plot → routes/waterways/exports
    python3 -m worldgen.apply_sitings --dry-run  # show which places would move, and by how much
    python3 -m worldgen.apply_sitings --stage    # chain mode: the write-back only (no replot, no dependants)

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
                                   (and, where a blueprint declares
                                   `networkTerminals[]`, ending at the declared
                                   gate/landing rather than the plotted dot — 97 C-stitch)
  worldgen.compile_minor_waterways
  worldgen.hostility_frequency   → the travel measure
  worldgen.export_places / export_routes → the studio layers
"""

from __future__ import annotations

import argparse
import json
import math
import os
import subprocess
import sys
from pathlib import Path

from . import blueprint as bp_mod
from . import catalogue
from .macro_plot import OVERRIDES_PATH
from .remeasure_plot_facts import measure as measure_facts
#: The water facts every dot this module seats carries, measured by the one
#: writer `remeasure_plot_facts` uses: `plotFacts.water` is the graph-id join
#: (decision 0066) and its distance IS `distanceToWaterM`.
PLOT_WATER_FACTS = ("distanceToWaterM", "water")
from .site_fields import ProvinceSurvey, shared_survey

MOVE_THRESHOLD_M = 5.0
#: The override `kind` that moves an ALREADY-COMMITTED record (see
#: `apply_reseats`). `worldgen.plot_remedies` writes these rows.
RESEAT_KIND = "reseat"
#: Where a reseat run records what it moved, and on what.
RESEAT_RECEIPTS_PATH = (Path(__file__).resolve().parents[3]
                        / "world" / "sources" / "sites" / "reseat-receipts.json")
#: The five Part 6 exemplars. 16g re-solves the plot with the cities pinned by
#: their anchors and everything else free, so a run with
#: ES_16G_NO_EXEMPLAR_PINS=1 drops these five blueprint pins rather than
#: carrying a 2026-09 hand-siting into the new plot (`--drop-exemplar-pins`
#: takes them out of the committed overrides for good).
EXEMPLAR_PINS = ("place.mercantile-coast.lilmoth",
                 "place.dunmer-north.mazzatun",
                 "place.hist-heartland.nine-trunks",
                 "place.hist-heartland.sap-tapping-licensed",
                 "place.naga-kur-deeps.wamasu-pond-adult")
NEIGHBOUR_WARN_M = 120.0
CHAIN = ["worldgen.compile_minor_routes", "worldgen.compile_minor_waterways",
         "worldgen.hostility_frequency", "worldgen.export_places", "worldgen.export_routes",
         # the studio blueprint bundle carries the neighbour context and the
         # city markers stand on it: it goes stale after every move (review 2026-09-07)
         "worldgen.export_blueprints"]


def replot_command() -> list[str]:
    """The owner-authorised B5 solve must not seed from committed positions."""
    return [sys.executable, "-m", "worldgen.macro_plot", "--resolve-all"]


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
                            "distanceToRouteM": round(c.route_m, 1),
                            **measure_facts(s, x, z, PLOT_WATER_FACTS), "score": None}
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


# --------------------------------------------------------------------- reseat
# A `reseat` row moves a record the solver has ALREADY committed (`seeded`).
# `macro_plot.pin_overrides` cannot: it skips every seeded result, so the only
# mechanism was `macro_plot --resolve-all`, a hand step that moved 106
# unrelated records the one time it was used (2026-09-05). This seats exactly
# the named record and nothing else, on the frozen ground, and refuses a point
# the record's own site fields cannot carry.


class ReseatRefused(Exception):
    """A reseat row that the ground or the neighbours will not take."""


def reseat_rows(path: Path = OVERRIDES_PATH) -> list[dict]:
    if not path.exists():
        return []
    return [o for o in json.loads(path.read_text(encoding="utf-8")).get("overrides", [])
            if o.get("kind") == RESEAT_KIND]


def reseat_points_m(s: ProvinceSurvey, path: Path = OVERRIDES_PATH) -> dict[str, tuple[float, float]]:
    """record id -> its reseat point in metres, rounded as `seat_record` writes
    `positionM`. The ONE lookup every reader of a committed reseat uses
    (`macro_plot.city_centres`, `city_layout.solve`)."""
    out: dict[str, tuple[float, float]] = {}
    for o in reseat_rows(path):
        x, z = s.uv_to_m(float(o["u"]), float(o["v"]))
        out[o["id"]] = (round(x, 1), round(z, 1))
    return out


def reseat_landform(o: dict) -> str:
    """The `plotFacts.landform` a reseated record carries. One text for
    `seat_record` and `macro_plot`'s anchor branch, so a re-plot never
    rewrites a reseated city back to its anchor wording."""
    return f"reseated ({o.get('ownerCall', 'owner call')})"


def reseat_why(o: dict) -> str:
    """The `whySiteWon` a reseated record carries (see `reseat_landform`)."""
    return f"Reseated ({o.get('ownerCall', 'owner call')}): {str(o.get('why', '')).rstrip('.')}."


def reseat_override(o: dict) -> dict:
    """The `plotOverride` a reseated record carries (see `reseat_landform`)."""
    return {"source": o.get("source", RESEAT_KIND), "why": o.get("why", ""), "kind": RESEAT_KIND}


def _needs_water(rec: dict) -> bool:
    """The record asks to stand IN water: a declared `minDepthM` above zero.
    Everything else is a land record (a bank dot beside water is land)."""
    prefs = rec.get("sitingPrefs") or {}
    try:
        return float(prefs.get("minDepthM") or 0.0) > 0.0
    except (TypeError, ValueError):
        return False


def _isolation_floors(rec: dict, recipes: dict) -> dict[str, float]:
    """{other class: metres} the record's own type demands it keeps."""
    typ = (rec.get("classification") or {}).get("type")
    prox = ((recipes.get(typ) or {}).get("proximity") or {})
    return {k: float(v) for k, v in (prox.get("minFromClassM") or {}).items() if v}


def check_reseat(s: ProvinceSurvey, rec: dict, x: float, z: float,
                 live: list[tuple[str, list[float], str]], recipes: dict) -> dict:
    """Refuse or accept the point; returns the measured facts either way."""
    water = s.water_at(x, z)
    depth = float((water or {}).get("depthM") or 0.0)
    facts = {"waterEntityId": (water or {}).get("id"), "depthM": round(depth, 2),
             "needsWater": _needs_water(rec)}
    if facts["needsWater"] and water is None:
        raise ReseatRefused(f"{rec['id']} needs water (minDepthM > 0) and {x:.1f}, {z:.1f} is dry ground")
    if not facts["needsWater"] and water is not None:
        raise ReseatRefused(f"{rec['id']} is a land record and {x:.1f}, {z:.1f} is water "
                            f"({facts['waterEntityId']}, {depth:.2f} m)")
    floors = _isolation_floors(rec, recipes)
    for oid, pm, ocls in live:
        if oid == rec["id"]:
            continue
        floor = floors.get(ocls)
        if not floor:
            continue
        d = math.hypot(pm[0] - x, pm[1] - z)
        if d < floor:
            raise ReseatRefused(f"{rec['id']} keeps {floor:.0f} m from class '{ocls}' and "
                                f"{oid} is {d:.0f} m from {x:.1f}, {z:.1f}")
    facts["isolationFloors"] = floors
    return facts


def apply_reseats(s: ProvinceSurvey, rows: list[dict], apply: bool = True,
                  catalogue_dir: Path | None = None) -> tuple[list[dict], list[str]]:
    """Seat each reseat row's record and NOTHING else. (receipts, errors)."""
    from . import plot_remedies
    files = list(catalogue.load_region_files(catalogue_dir or catalogue.CATALOGUE_DIR))
    by_id = {rec["id"]: (rf, rec) for rf in files for rec in rf.places}
    live = [(rec["id"], rec["positionM"], (rec.get("classification") or {}).get("class", ""))
            for rf in files for rec in rf.places
            if rec.get("positionM") and rec.get("status") not in ("cut", "deferred")]
    recipes = plot_remedies.load_type_recipes()
    on_file = {}
    if RESEAT_RECEIPTS_PATH.exists():
        on_file = {r["id"]: r for r in
                   json.loads(RESEAT_RECEIPTS_PATH.read_text(encoding="utf-8")).get("receipts", [])}
    receipts, errors, touched = [], [], set()
    for o in rows:
        entry = by_id.get(o["id"])
        if entry is None:
            errors.append(f"reseat {o['id']}: not a catalogue record")
            continue
        rf, rec = entry
        old = rec.get("positionM")
        if not (isinstance(old, list) and len(old) == 2):
            errors.append(f"reseat {o['id']}: no committed position (the plot sites it)")
            continue
        x, z = s.uv_to_m(float(o["u"]), float(o["v"]))
        try:
            facts = check_reseat(s, rec, x, z, live, recipes)
        except ReseatRefused as e:
            errors.append(f"reseat refused: {e}")
            continue
        moved_m = math.hypot(x - old[0], z - old[1])
        # Re-running a realised reseat must not rewrite its provenance to
        # "moved 0 m from where it already is": the receipt keeps the dot the
        # record was seated FROM the first time.
        prior = on_file.get(rec["id"])
        if prior and prior.get("toM") == [round(x, 1), round(z, 1)]:
            from_m, moved_m = prior["fromM"], prior["movedM"]
        else:
            from_m = [round(old[0], 1), round(old[1], 1)]
        receipts.append({"id": rec["id"], "fromM": from_m,
                         "toM": [round(x, 1), round(z, 1)], "movedM": round(moved_m, 1),
                         "why": o.get("why", ""), "ownerCall": o.get("ownerCall"),
                         "sources": o.get("sources", []), "measured": facts})
        if apply:
            seat_record(s, rec, x, z, o)
            touched.add(rf.path)
    if apply and touched:
        for rf in files:
            if rf.path in touched:
                catalogue.dump_json(rf.path, {"schemaVersion": catalogue.PLACES_SCHEMA_VERSION,
                                              "region": rf.region, "seed": rf.seed, "places": rf.places})
        RESEAT_RECEIPTS_PATH.write_text(json.dumps(
            {"schemaVersion": 1,
             "generatedBy": "worldgen.apply_sitings --reseat; one row per reseat override realised",
             "receipts": receipts}, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    return receipts, errors


def seat_record(s: ProvinceSurvey, rec: dict, x: float, z: float, o: dict) -> None:
    """Write one record's position and re-measure its plot facts there."""
    from .macro_plot import pinned_candidate
    u, v = s.m_to_uv(x, z)
    c = pinned_candidate(s, rec["id"], x, z)
    rec["position"] = {"u": round(u, 5), "v": round(v, 5)}
    rec["positionM"] = [round(x, 1), round(z, 1)]
    # `pinned_candidate` labels every hand-placed dot a Part 6 meso siting; a
    # reseat is not one, and the landform reaches the studio and the record.
    rec["plotFacts"] = {"landform": reseat_landform(o),
                        "regionClass": c.region, "dangerBand": c.danger,
                        "distanceToRouteM": round(c.route_m, 1),
                        **measure_facts(s, x, z, PLOT_WATER_FACTS), "score": None}
    rec["whySiteWon"] = reseat_why(o)
    rec["plotOverride"] = reseat_override(o)
    rec["candidatesConsidered"] = [k for k in rec.get("candidatesConsidered", [])
                                   if not str(k.get("siteId", "")).startswith("pinned.")]
    rec["workflow"] = "plotted"
    # A reseated CITY moves its centre with it (decision 0085 §4: the reseat
    # row is the committed record, and `macro_plot.city_centres` reads it):
    # the gate stays on the road, and the street and the footprint polygon are
    # re-derived at the new centre by `city_layout`'s own derivation, never
    # left on a radius band.
    if isinstance(rec.get("cityLayout"), dict):
        _reseat_city_layout(s, rec, x, z)
    # A polygon footprint is DERIVED at the old dot (`blueprint_footprints`):
    # carried across a reseat it no longer contains the record's own position
    # and `catalogue.validate_catalogue` fails. The record falls back to its
    # radius footprint until the deriving stage runs again.
    if rec.get("footprintSource") == "polygon" and not _polygon_contains(rec.get("footprintPolygon"), x, z):
        rec.pop("footprintPolygon", None)
        rec["footprintSource"] = "band"


def _reseat_city_layout(s: ProvinceSurvey, rec: dict, x: float, z: float) -> None:
    """Centre, street and footprint polygon of a reseated city, derived the
    way `city_layout.solve` derives them, at the reseat point."""
    from . import city_layout
    layout = rec["cityLayout"]
    centre = (round(x, 1), round(z, 1))
    gate = tuple(float(g) for g in layout["gate"])
    why = (f"The main approach into {rec.get('name', rec['id'])}: the road gate "
           f"to the city centre, on the ground it crosses.")
    layout["centre"] = [centre[0], centre[1]]
    layout["way"] = city_layout.city_way(s, gate, centre, why)
    poly, why = city_layout.city_footprint(s, centre, float(rec["footprintRadiusM"]), True)
    city_layout.apply_footprint(rec, poly, why)


def _polygon_contains(poly, x: float, z: float) -> bool:
    """Even-odd test, the same rule `catalogue.validate_catalogue` applies."""
    if not isinstance(poly, list) or len(poly) < 3:
        return False
    inside = False
    for i in range(len(poly)):
        ax, az = poly[i]
        bx, bz = poly[i - 1]
        if (az > z) != (bz > z) and x < (bx - ax) * (z - az) / (bz - az) + ax:
            inside = not inside
    return inside


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


def merge_overrides(blueprint_rows: list[dict], path: Path = OVERRIDES_PATH) -> list[dict]:
    """The overrides file is shared: `apply_sitings` owns the blueprint-sourced
    rows, `worldgen.plot_remedies` owns `source == "plot-remedies"` rows, and a
    future writer may own others. Re-deriving the whole file dropped every row
    this tool does not produce (11 plot-remedies rows were lost that way), so
    the write MERGES by (id, source): a blueprint-sourced row is replaced by
    the freshly derived one, every other source's row is preserved verbatim.
    """
    on_file = []
    if path.exists():
        on_file = json.loads(path.read_text(encoding="utf-8")).get("overrides", [])
    fresh = {(o["id"], o.get("source")) for o in blueprint_rows}
    kept = [o for o in on_file
            if not _is_blueprint_source(o.get("source")) and (o["id"], o.get("source")) not in fresh]
    merged = kept + list(blueprint_rows)
    merged.sort(key=lambda o: (o["id"], str(o.get("source", ""))))
    return merged


def _is_blueprint_source(source) -> bool:
    """A blueprint-sourced row records the blueprint file it came from
    (`build_overrides` writes the repo-relative path)."""
    return isinstance(source, str) and source.endswith(".json") and "blueprint" in source


def drop_exemplar_pins() -> int:
    """Remove the five exemplar rows from the committed overrides file."""
    if not OVERRIDES_PATH.exists():
        print(f"{OVERRIDES_PATH.name}: not present; nothing to drop")
        return 0
    doc = json.loads(OVERRIDES_PATH.read_text(encoding="utf-8"))
    kept = [o for o in doc.get("overrides", []) if o["id"] not in EXEMPLAR_PINS]
    dropped = [o["id"] for o in doc.get("overrides", []) if o["id"] in EXEMPLAR_PINS]
    doc["overrides"] = kept
    OVERRIDES_PATH.write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    for i in dropped:
        print(f"  dropped exemplar pin {i}")
    print(f"wrote {OVERRIDES_PATH.relative_to(catalogue.REPO_ROOT)} "
          f"({len(kept)} pinned, {len(dropped)} exemplar pin(s) removed)")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--stage", action="store_true",
                    help="chain mode: the write-back ONLY (overrides, the incremental move, the "
                         "neighbour report). No replot, no dependants — the chain runs macro_plot "
                         "and the rest itself as its own stages.")
    ap.add_argument("--drop-exemplar-pins", action="store_true",
                    help=f"remove the {len(EXEMPLAR_PINS)} Part 6 exemplar rows from "
                         f"macro-plot-overrides.json and exit")
    ap.add_argument("--no-chain", action="store_true", help="write the overrides and move the records only; do not re-run the dependants")
    ap.add_argument("--replot", action="store_true", help="full whole-province re-solve with the sitings pinned (moves other records too)")
    ap.add_argument("--reseat", action="store_true",
                    help="realise the `reseat` override rows ONLY (one committed record each, "
                         "no blueprint write-back, no replot, no dependants) and exit")
    a = ap.parse_args(argv)
    if a.drop_exemplar_pins:
        return drop_exemplar_pins()
    s = shared_survey()
    if a.reseat:
        receipts, errors = apply_reseats(s, reseat_rows(), apply=not a.dry_run)
        for r in receipts:
            print(f"  {'would ' if a.dry_run else ''}RESEAT {r['id']:55s} {r['fromM']} -> {r['toM']}  {r['movedM']} m")
        for e in errors:
            print(f"  FAIL {e}", file=sys.stderr)
        print(f"reseat: {len(receipts)} record(s), {len(errors)} refused")
        return 1 if errors else 0
    overrides, moves = build_overrides(s)
    if a.stage and os.environ.get("ES_16G_NO_EXEMPLAR_PINS") == "1":
        skipped = [o["id"] for o in overrides if o["id"] in EXEMPLAR_PINS]
        overrides = [o for o in overrides if o["id"] not in EXEMPLAR_PINS]
        moves = [m for m in moves if m["id"] not in EXEMPLAR_PINS]
        for i in skipped:
            print(f"  SKIP exemplar pin {i} (ES_16G_NO_EXEMPLAR_PINS=1)")
    for m in moves:
        flag = "ANCH" if m.get("anchor") else ("MOVE" if m["moved"] else "same")
        print(f"  {flag:4s} {m['id']:55s} {m['distanceM']} m")
    if a.dry_run:
        return 0
    merged = merge_overrides(overrides)
    OVERRIDES_PATH.write_text(json.dumps({"schemaVersion": 1, "generatedBy": "worldgen.apply_sitings — do not hand-edit; each row's `source` names the tool that owns it (a blueprint path here, worldgen.plot_remedies for `plot-remedies`)",
                                          "overrides": merged}, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {OVERRIDES_PATH.relative_to(catalogue.REPO_ROOT)} "
          f"({len(overrides)} pinned from blueprints, {len(merged) - len(overrides)} row(s) from other sources preserved)")
    if a.stage:
        receipts, rs_errors = apply_reseats(s, reseat_rows())
        for r in receipts:
            print(f"  RESEAT {r['id']:55s} {r['fromM']} -> {r['toM']}  {r['movedM']} m")
        for e in rs_errors:
            print(f"  FAIL {e}", file=sys.stderr)
        if rs_errors:
            return 1
        for w in apply_incremental(s, overrides):
            print(f"  WARN {w}")
        print(f"moved {sum(1 for m in moves if m['moved'])} record(s) in place; plot facts "
              f"re-measured (--stage: the chain runs macro_plot and the dependants itself)")
        return 0
    if a.replot:
        r = subprocess.run(replot_command(), cwd=Path(__file__).resolve().parents[1])
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
