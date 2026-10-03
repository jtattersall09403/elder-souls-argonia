"""Sibling look-up for the place-build palette step (palette-and-breadth.md § Siblings).

Prints, for the place's type, every published same-type place: id, culture,
region classes, the distinct parcel `assetRef`s and `buildingFamily`s its
blueprint uses, split into same-region siblings (share a region class with the
place; the shared grammar) and other-region siblings (what must differ more).

Run from the repo root:
    python3 tooling/placement-workbench/scripts/sibling_palette.py --place-id <place id>
"""
from __future__ import annotations

import argparse
import glob
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CATALOGUE = "world/sources/catalogue/places-*.json"
BLUEPRINTS = "apps/world-studio/public/province/blueprints.json"


def load_catalogue(root: Path = ROOT) -> dict:
    out = {}
    for f in glob.glob(str(root / CATALOGUE)):
        for p in json.load(open(f))["places"]:
            out[p["id"]] = p
    return out


def siblings(place_id: str, catalogue: dict, blueprints: list) -> dict:
    """Same-type published places other than `place_id`, as two lists of rows."""
    me = catalogue[place_id]
    my_type = me["classification"]["type"]
    my_regions = set(me["sitingPrefs"]["regionClasses"])
    rows = {"same_region": [], "other_region": []}
    for b in blueprints:
        p = catalogue.get(b["id"])
        if not p or b["id"] == place_id or p["classification"]["type"] != my_type:
            continue
        regions = p["sitingPrefs"]["regionClasses"]
        row = {
            "id": b["id"],
            "culture": p.get("culture"),
            "regions": regions,
            "assets": sorted({str(q["assetRef"]) for q in b["parcels"]}),
            "families": sorted({q["buildingFamily"] for q in b["parcels"] if q.get("buildingFamily")}),
        }
        rows["same_region" if my_regions & set(regions) else "other_region"].append(row)
    return rows


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--place-id", required=True)
    ap.add_argument("--root", default=str(ROOT))
    a = ap.parse_args(argv)
    root = Path(a.root)
    cat = load_catalogue(root)
    if a.place_id not in cat:
        raise SystemExit(f"unknown place id {a.place_id}")
    bps = json.load(open(root / BLUEPRINTS))["blueprints"]
    res = siblings(a.place_id, cat, bps)
    for key, title in (("same_region", "same type, same region (shared grammar)"),
                       ("other_region", "same type, other regions (must differ more)")):
        print(f"## {title}")
        if not res[key]:
            print("(none published)")
        for r in res[key]:
            print(r["id"], "|", r["culture"], "|", ",".join(r["regions"]), "|", r["assets"], "|", r["families"])
    region_args = " ".join(f"--region-class '{c}'" for c in cat[a.place_id]["sitingPrefs"]["regionClasses"])
    print(f"## same-region architecture (registry regionClasses)\n"
          f"cd tooling/world-generation && python3 -m worldgen.asset_registry query --category architecture {region_args}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
