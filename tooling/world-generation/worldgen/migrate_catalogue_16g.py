"""One-shot migration: stamp the 16g record fields on the place catalogue.

Run once (`python3 -m worldgen.migrate_catalogue_16g --apply`); it is
idempotent, so a second run writes nothing. It ONLY adds the fields 16g's
schema made required or knowable, and it loads and dumps through
`worldgen.catalogue`, so anything another stage has written to the same
records (Lane A's `plotFacts.water`) survives untouched.

What it stamps:

  schemaVersion       2 on every record (the file-level number is the maximum
                      over its records, so the files do not move).
  designGroup         `group.lost-city` on the two records that register says
                      are one blueprint and one build.
  heroHist.status     "hero" where the block names a power slot, "reserve"
                      where powerSlot is null.
  footprintRadiusM    the ground the place occupies, on every POSITIONED
  footprintSource     record: the five authored blueprints take their own
                      measured built ground ("blueprint"); everyone else takes
                      their type recipe's radius, `band` where the recipe's
                      radius is a type band and `blueprint` where the recipe
                      itself was measured off built ground.

Nothing else is stamped: coSitedWith, ownerGuided, reservedFor,
footprintPolygon, cityLayout and underwaterAccessDetail are authoring
decisions, not derivable facts, and the delivering agent makes them.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import catalogue

RECIPES_PATH = catalogue.CATALOGUE_DIR / "type-recipes.json"

# The one design group 16g ships with (plan 16 §10 item F1).
LOST_CITY_GROUP = "group.lost-city"
LOST_CITY_MEMBERS = ("place.hist-heartland.lost-city",
                     "place.hist-heartland.xal-krona-making-ground")

# The five authored blueprints, measured off their built ground
# (decision 0041 Part 3c). These are the records, not the types: another
# record of the same type has no blueprint and takes the recipe band.
BLUEPRINT_FOOTPRINT_M = {
    "place.mercantile-coast.lilmoth": 225.0,
    "place.dunmer-north.mazzatun": 105.0,
    "place.hist-heartland.nine-trunks": 105.0,
    "place.hist-heartland.sap-tapping-licensed": 30.0,
    "place.naga-kur-deeps.wamasu-pond-adult": 175.0,
}
# type-recipes.json says where ITS radius came from; the record vocabulary is
# {band, blueprint, polygon}, and a recipe measured off built ground is a
# blueprint measurement carried to every record of that type.
RECIPE_SOURCE_TO_RECORD = {"band": "band", "built-ground": "blueprint"}


def _insert_after(rec: dict, after: str, items: dict) -> dict:
    """Return `rec` with `items` inserted straight after key `after` (or at the
    end when it is absent). Key order is the diff's readability, and it is
    deterministic."""
    out: dict = {}
    placed = False
    for k, v in rec.items():
        if k in items:
            continue
        out[k] = v
        if k == after:
            out.update(items)
            placed = True
    if not placed:
        out.update(items)
    return out


def recipe_footprints() -> dict[str, tuple[float, str]]:
    data = json.loads(RECIPES_PATH.read_text(encoding="utf-8"))
    out = {}
    for t in data["types"]:
        src = RECIPE_SOURCE_TO_RECORD.get(t.get("footprintSource"))
        if src and catalogue._is_num(t.get("footprintRadiusM")):
            out[t["type"]] = (float(t["footprintRadiusM"]), src)
    return out


def migrate(catalogue_dir: Path = catalogue.CATALOGUE_DIR, apply: bool = False) -> dict[str, int]:
    recipes = recipe_footprints()
    counts = {"schemaVersion": 0, "designGroup": 0, "heroHist.status": 0,
              "footprintRadiusM": 0, "footprintSource": 0}
    missing_recipe: list[str] = []
    for rf in catalogue.load_region_files(catalogue_dir):
        places = []
        for rec in rf.places:
            rid = rec["id"]
            if "schemaVersion" not in rec:
                rec = _insert_after(rec, "id", {"schemaVersion": catalogue.RECORD_SCHEMA_VERSION})
                counts["schemaVersion"] += 1
            if rid in LOST_CITY_MEMBERS and rec.get("designGroup") != LOST_CITY_GROUP:
                rec = _insert_after(rec, "schemaVersion", {"designGroup": LOST_CITY_GROUP})
                counts["designGroup"] += 1
            hh = rec.get("heroHist")
            if isinstance(hh, dict) and "status" not in hh:
                rec = dict(rec)
                rec["heroHist"] = _insert_after(
                    hh, "powerSlot", {"status": "reserve" if hh.get("powerSlot") is None else "hero"})
                counts["heroHist.status"] += 1
            if rec.get("positionM") is not None:
                typ = (rec.get("classification") or {}).get("type")
                if rid in BLUEPRINT_FOOTPRINT_M:
                    radius, source = BLUEPRINT_FOOTPRINT_M[rid], "blueprint"
                elif typ in recipes:
                    radius, source = recipes[typ]
                else:
                    missing_recipe.append(rid)
                    places.append(rec)
                    continue
                add = {}
                if rec.get("footprintRadiusM") != radius:
                    add["footprintRadiusM"] = radius
                    counts["footprintRadiusM"] += 1
                if rec.get("footprintSource") != source:
                    add["footprintSource"] = source
                    counts["footprintSource"] += 1
                if add:
                    rec = _insert_after(rec, "positionM", add)
            places.append(rec)
        if apply:
            data = json.loads(rf.path.read_text(encoding="utf-8"))
            data["places"] = sorted(places, key=lambda r: r["id"])
            data["schemaVersion"] = max(
                [catalogue.PLACES_SCHEMA_VERSION]
                + [r["schemaVersion"] for r in places if isinstance(r.get("schemaVersion"), int)])
            catalogue.dump_json(rf.path, data)
    if missing_recipe:
        raise SystemExit("no type recipe footprint for: " + ", ".join(sorted(missing_recipe)))
    return counts


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true", help="write the files (default: dry run)")
    args = ap.parse_args(argv)
    counts = migrate(apply=args.apply)
    for key, n in counts.items():
        print(f"{'stamped' if args.apply else 'would stamp'} {key}: {n}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
