"""Author the typed SIZE and PROXIMITY fields on every place type recipe.

    cd tooling/world-generation
    python3 -m worldgen.author_type_siting --check   # drift check (CI)
    python3 -m worldgen.author_type_siting --apply   # rewrite type-recipes.json

WHY (owner ruling 2026-09-09, decision 0041 Part 3b)
----------------------------------------------------
The macro plot treated every place as a POINT: a city and a cairn shared one
30 m collision floor, so records could be plotted inside a city's real
footprint, and a place whose whole identity is isolation could sit 96 m from a
village.  Two typed fields fix that at the type level, where the evidence is:

* ``footprintRadiusM`` — how much ground the type actually occupies.  DERIVED
  from the authored blueprint boundary wherever one exists (geometry, not
  labels — module 97 E2); banded from the type's own ``magnitude`` /
  ``class`` / ``complexityBudget`` otherwise.
* ``proximity`` — the type's own ``siting.neighbourRelation`` prose turned
  into distances the solver can obey.  Absent means NO constraint; that is the
  explicit default, and prose that states no distance gets no block.

Both are consumed by ``macro_plot.separation_ok`` as HARD gates and by
``audit_place_semantics.check_type_proximity``.

This module is the single source of the derivation so the numbers can be
re-derived when a blueprint boundary moves, rather than hand-maintained.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path

from . import catalogue
from .scale import PROVINCE_EXTENT_M

REPO_ROOT = Path(__file__).resolve().parents[3]
RECIPES_PATH = catalogue.CATALOGUE_DIR / "type-recipes.json"
BLUEPRINT_DIR = REPO_ROOT / "world" / "sources" / "blueprints"

# --------------------------------------------------------------------------- #
# 1. footprint radius
# --------------------------------------------------------------------------- #
# Settlement scale is the authored size axis (the recipe schema says magnitude
# is "SETTLEMENT SCALE ONLY"), so magnitude sets the band where it exists.
# Calibration: the five authored blueprint boundaries measure r = 273 (M5
# city), 128 / 118 (M3 villages), 32 (M1 works), 280 (a held wamasu pond).
MAGNITUDE_BASE_M = {"M5": 230.0, "M4": 140.0, "M3": 115.0, "M2": 65.0, "M1": 45.0}
# Non-settlement types have no magnitude, so the size evidence is the type's
# own authored production budget: complexityBudget is literally "how much
# place is here" (trivial = a prop cluster, complex = a Morrowind-ceiling
# build with its own interior programme).
COMPLEXITY_BASE_M = {"trivial": 25.0, "simple": 38.0, "standard": 60.0, "complex": 95.0}
# ...scaled by what the class physically is on the ground.  A ruin field and a
# lair chamber system spread; a hermitage, a camp and a road stage do not.
CLASS_FACTOR = {
    "ruin": 1.3, "lair": 1.15, "settlement": 1.0, "martial": 1.0,
    "sacred": 0.9, "civic": 0.85, "works": 0.85, "camp": 0.8,
    "transit": 0.8, "lone": 0.7,
}
FOOTPRINT_FLOOR_M = 20.0
# ...and a ceiling. A derived boundary can enclose a place's whole hazard or
# influence area rather than the ground it occupies (the wamasu pond boundary
# is the held water villages route around, 280 m, wider than Lilmoth). No place
# claims more exclusive ground than the province's largest city.
FOOTPRINT_CEILING_M = MAGNITUDE_BASE_M["M5"]

# A type whose countBand tops out in double figures is by construction a small
# repeated thing; one that is nearly unique is the province's big build.  This
# is a nudge on the band above, not a second axis.
def _count_nudge(count_band) -> float:
    if not count_band:
        return 1.0
    hi = float(count_band[1])
    if hi >= 12:
        return 0.85
    if hi <= 3:
        return 1.15
    return 1.0


def blueprint_radii() -> dict[str, float]:
    """Measured circumradius of each authored blueprint boundary, by TYPE.

    The boundary polygon is the truth about how much ground the place holds;
    the radius is measured about the polygon's own centroid (the record's map
    dot is not always its centre, and the footprint is a property of the
    place, not of where the dot landed)."""
    by_type: dict[str, float] = {}
    if not BLUEPRINT_DIR.exists():
        return by_type
    records: dict[str, dict] = {}
    for rf in catalogue.load_region_files():
        for rec in rf.places:
            records[rec["id"]] = rec
    for path in sorted(BLUEPRINT_DIR.glob("place.*.json")):
        bp = json.loads(path.read_text()).get("blueprint") or {}
        boundary = bp.get("boundary")
        rec = records.get(bp.get("id"))
        if not boundary or rec is None:
            continue
        pts = [(u * PROVINCE_EXTENT_M, v * PROVINCE_EXTENT_M) for u, v in boundary]
        cx = sum(p[0] for p in pts) / len(pts)
        cz = sum(p[1] for p in pts) / len(pts)
        r = max(math.hypot(x - cx, z - cz) for x, z in pts)
        typ = rec["classification"]["type"]
        by_type[typ] = max(by_type.get(typ, 0.0), r)
    return by_type


def derive_footprint_m(recipe: dict, measured: dict[str, float]) -> tuple[int, str]:
    typ = recipe["type"]
    if typ in measured:
        return int(round(min(measured[typ], FOOTPRINT_CEILING_M) / 5.0) * 5), "blueprint"
    mag = recipe.get("magnitude")
    if mag in MAGNITUDE_BASE_M:
        # Magnitude IS the authored size, calibrated against the measured
        # boundaries; nothing else modifies it. (The complexity/count nudges
        # below inflated every M5 to 265 m, which is wider than the one M5
        # boundary anyone has actually drawn.)
        return int(round(MAGNITUDE_BASE_M[mag] / 5.0) * 5), "band"
    base = COMPLEXITY_BASE_M.get(recipe.get("complexityBudget") or "simple", 38.0)
    r = base * CLASS_FACTOR.get(recipe["class"], 1.0) * _count_nudge(recipe.get("countBand"))
    return int(max(FOOTPRINT_FLOOR_M, round(r / 5.0) * 5)), "band"


# --------------------------------------------------------------------------- #
# 2. proximity, authored from each type's own neighbourRelation prose
# --------------------------------------------------------------------------- #
# Keys of minFromClassM / maxFromM are place CLASSES (settlement, works,
# transit, sacred, civic, martial, camp, ruin, lair, lone) plus the pseudo-key
# "route" (metres to the nearest route line).  minFromClassM is a floor
# against every live record of that class; maxFromM is a ceiling against the
# NEAREST already-plotted record of that class.  outOfSightOf lists classes
# the place must not have line of sight to.  mayAbut lists classes a RELATED
# neighbour of may overlap footprints with (max, not sum, of the two radii).
#
# Every row quotes the prose it was read from.  Where a type's prose states no
# distance relation, there is deliberately NO row: absent means unconstrained.
PROXIMITY: dict[str, dict] = {
    # --- isolation: the identity IS the distance ---------------------------
    "hermit-hut": {"minFromClassM": {"settlement": 600}},
    "snowline-hermitage": {"minFromClassM": {"settlement": 600}},
    "wild-hist": {"minFromClassM": {"settlement": 600}},
    "prison-ruin": {"minFromClassM": {"settlement": 600}},
    "fallen-flier": {"minFromClassM": {"settlement": 500, "route": 400},
                     "maxFromM": {"route": 1500}},
    "orma-tactile-ruin": {"minFromClassM": {"settlement": 500}},
    "upland-terrace-village": {"minFromClassM": {"settlement": 450}},
    "refuge-station": {"minFromClassM": {"settlement": 450}, "maxFromM": {"route": 300}},
    "field-station": {"minFromClassM": {"settlement": 350}},
    "sap-tapping-camp": {"minFromClassM": {"settlement": 400}},
    "blackguard-hideout": {"minFromClassM": {"settlement": 400}},
    "air-pocket-grotto": {"minFromClassM": {"settlement": 300}},
    "smugglers-ledge": {"minFromClassM": {"settlement": 250},
                        "maxFromM": {"settlement": 800},
                        "outOfSightOf": ["settlement"]},
    "pest-house": {"minFromClassM": {"settlement": 200}, "maxFromM": {"settlement": 600}},
    "urn-vault": {"minFromClassM": {"settlement": 150}, "maxFromM": {"settlement": 600}},
    "poacher-camp": {"minFromClassM": {"settlement": 150}, "maxFromM": {"settlement": 600}},
    "claimable-steading": {"minFromClassM": {"settlement": 150}, "maxFromM": {"settlement": 800}},
    "dream-wallow": {"minFromClassM": {"settlement": 120},
                     "maxFromM": {"settlement": 600},
                     "outOfSightOf": ["settlement"]},
    # --- just outside: no floor beyond the footprints, but a real ceiling ---
    "owing-eviction-camp": {"maxFromM": {"settlement": 300}},
    "refugee-camp": {"maxFromM": {"settlement": 350}},
    "withdrawal-house": {"maxFromM": {"settlement": 350}},
    "hist-less-refuge": {"maxFromM": {"settlement": 400}},
    "road-stage": {"maxFromM": {"route": 300}},
    "market-fair-ground": {"maxFromM": {"settlement": 350}},
    "drill-ground": {"maxFromM": {"settlement": 350}},
    "play-ground": {"maxFromM": {"settlement": 350}},
    "brewhouse": {"maxFromM": {"settlement": 350}},
    "teaching-ground": {"maxFromM": {"settlement": 350}},
    "floating-garden": {"maxFromM": {"settlement": 1500}},
    "hearth-house": {"maxFromM": {"route": 250}},
    "toll-bridge": {"maxFromM": {"route": 60}},
    "kwama-mine": {"maxFromM": {"route": 400}},
    "bog-iron-bloomery": {"maxFromM": {"route": 400}},
    "battlefield-ground": {"maxFromM": {"route": 400}},
    "pirate-anchorage": {"maxFromM": {"route": 300}},
    "naga-village": {"maxFromM": {"route": 400}},
    "calcinator-court": {"maxFromM": {"settlement": 500}},
    "knapping-floor": {"maxFromM": {"settlement": 600}},
    "shadowscale-ground": {"maxFromM": {"settlement": 600}},
    "yespest-misattributed-site": {"maxFromM": {"settlement": 600}},
    "drowned-hist": {"maxFromM": {"settlement": 800}},
    "oblivion-gate-scar": {"maxFromM": {"settlement": 800}},
    "bird-colony": {"maxFromM": {"settlement": 800}},
    "harmed-hist": {"maxFromM": {"settlement": 800}},
    "drowned-village": {"maxFromM": {"settlement": 500}},
    "convocation-ground": {"maxFromM": {"sacred": 400}},
    "bog-blight-ground": {"maxFromM": {"sacred": 400}},
    "buried-weapon-cache": {"maxFromM": {"martial": 800}},
    "prospectors-camp": {"maxFromM": {"works": 800}},
    "shell-beast-ground": {"maxFromM": {"works": 800}},
    "fenlord-tomb": {"maxFromM": {"ruin": 800}},
    "dig-camp": {"maxFromM": {"ruin": 500}},
    "treasure-hunters-camp": {"maxFromM": {"ruin": 500}},
    "cairn-field": {"maxFromM": {"ruin": 500}},
    "wild-rootworm-burrow": {"maxFromM": {"transit": 400}},
    # --- attached to / inside: related neighbours may share ground ---------
    "colonial-quarter": {"maxFromM": {"settlement": 250}, "mayAbut": ["settlement"]},
    "sacked-colonial-quarter": {"maxFromM": {"settlement": 250}, "mayAbut": ["settlement"]},
    "predator-pen": {"maxFromM": {"settlement": 250}, "mayAbut": ["settlement"]},
    "bonded-warehouse": {"maxFromM": {"settlement": 250}, "mayAbut": ["settlement"]},
    "lilmothiit-substratum": {"maxFromM": {"settlement": 300}, "mayAbut": ["settlement"]},
    "holding-pit": {"maxFromM": {"settlement": 300}, "mayAbut": ["settlement"]},
    "foreign-graveyard": {"maxFromM": {"settlement": 300}, "mayAbut": ["settlement"]},
    "maturity-trial-ground": {"maxFromM": {"settlement": 300}, "mayAbut": ["settlement"]},
    "placation-court": {"maxFromM": {"settlement": 300}, "mayAbut": ["settlement"]},
    "quarantine-shed": {"maxFromM": {"settlement": 300}, "mayAbut": ["settlement"]},
    "synod-outstation": {"maxFromM": {"settlement": 400}, "mayAbut": ["settlement"]},
    "tunnel-rat-gallery": {"maxFromM": {"martial": 500}, "mayAbut": ["martial"]},
    "second-empire-works": {"maxFromM": {"works": 300}, "mayAbut": ["works"]},
    "lamia-cavern": {"maxFromM": {"ruin": 300}, "mayAbut": ["ruin"]},
    "voriplasm-chamber": {"maxFromM": {"ruin": 200}, "mayAbut": ["ruin"]},
    # --- districts of a settlement sit INSIDE it: their footprint is part of
    #     the parent's, so a related pair takes max, not sum ---------------
    "city-hist": {"maxFromM": {"settlement": 250}, "mayAbut": ["settlement"]},
    "village-hist": {"maxFromM": {"settlement": 250}, "mayAbut": ["settlement"]},
}
# The prose these rows were read from, quoted so a later agent can re-check the
# reading against the recipe without re-deriving it.
PROXIMITY_WHY_FROM = "siting.neighbourRelation"
# One row is NOT read from its own prose: blackguard-hideout's neighbourRelation
# says only "answers to a reoccupied prison".  Its 400 m floor comes from the
# solver's own standing ruling (macro_plot: "a bandit camp 400 m from a city
# gate is a mistake, not a challenge"), which until now only moved score.
PROXIMITY_WHY_OVERRIDE = {
    "blackguard-hideout": "macro_plot city-ring ruling: a hostile camp at a city gate "
                          "is a mistake, not a challenge (was score-only until 2026-09-09)",
}


# --------------------------------------------------------------------------- #
# apply
# --------------------------------------------------------------------------- #
SCHEMA_NOTES = {
    "footprintRadiusM": "how much ground the type occupies, metres. DERIVED from the "
                        "authored blueprint boundary where one exists, else banded from "
                        "magnitude / class / complexityBudget. The macro plot's collision "
                        "floor for a pair is the SUM of the two radii.",
    "proximity": "typed siting gates read from this type's own siting.neighbourRelation. "
                 "minFromClassM = hard floor to every live record of that place class; "
                 "maxFromM = hard ceiling to the nearest already-plotted record of that "
                 "class ('route' = metres to the nearest route line); outOfSightOf = "
                 "classes it must have no line of sight to; mayAbut = classes a RELATED "
                 "neighbour may share ground with (max of the two radii, not the sum). "
                 "ABSENT MEANS NO CONSTRAINT - that is the default, and prose that states "
                 "no distance deliberately gets no block.",
}


def author(data: dict) -> dict:
    measured = blueprint_radii()
    unknown = set(PROXIMITY) - {t["type"] for t in data["types"]}
    if unknown:
        raise SystemExit(f"PROXIMITY names types that do not exist: {sorted(unknown)}")
    data["schema"].update(SCHEMA_NOTES)
    for recipe in data["types"]:
        radius, source = derive_footprint_m(recipe, measured)
        recipe["footprintRadiusM"] = radius
        recipe["footprintSource"] = source
        prox = PROXIMITY.get(recipe["type"])
        if prox is None:
            recipe.pop("proximity", None)
            continue
        why = PROXIMITY_WHY_OVERRIDE.get(
            recipe["type"],
            f"{PROXIMITY_WHY_FROM}: {(recipe.get('siting') or {}).get('neighbourRelation')}")
        recipe["proximity"] = dict(prox, why=why)
    return data


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--check", action="store_true")
    args = ap.parse_args(argv)
    before = RECIPES_PATH.read_text()
    data = author(json.loads(before))
    after = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
    if args.apply:
        RECIPES_PATH.write_text(after, encoding="utf-8")
        print(f"wrote {RECIPES_PATH}")
        return 0
    if after != before:
        print("type-recipes.json is out of date with the derivation "
              "(run: python3 -m worldgen.author_type_siting --apply)")
        return 1
    print("type-recipes.json footprint/proximity fields are up to date")
    return 0


if __name__ == "__main__":
    sys.exit(main())
