"""Re-derive every poi type's `countBand` in type-recipes.json from the live catalogue.

    cd tooling/world-generation
    python3 -m worldgen.rederive_count_bands          # rewrites type-recipes.json
    python3 -m worldgen.rederive_count_bands --dry    # prints the changes only

The bands are an anti-drift check (test_type_recipes): each poi type's band
must contain the number of live records of that type. After a deliberate
rebalance (a region repair round that promotes reserves and defers fill) the
bands are re-based on the actuals with a little slack — floor = max(0, n − 1),
ceiling = n + 2 — so the next accidental drift is caught, not the one just
approved. Types with zero live records keep a [0, 2] band. Run this only after
a rebalance the owner has seen (the change is recorded in decision 0041).
"""

from __future__ import annotations

import collections
import json
import sys

from . import catalogue

RECIPES_PATH = catalogue.CATALOGUE_DIR / "type-recipes.json"


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    live: collections.Counter[str] = collections.Counter()
    for rf in catalogue.load_region_files():
        for rec in rf.places:
            if rec.get("status") not in {"deferred", "cut"}:
                live[rec["classification"]["type"]] += 1
    data = json.loads(RECIPES_PATH.read_text())
    changed = 0
    for r in data["types"]:
        if r.get("recordScope") != "poi":
            continue
        n = live.get(r["type"], 0)
        band = [max(0, n - 1), n + 2] if n else [0, 2]
        if r.get("countBand") != band:
            print(f"{r['type']}: {r.get('countBand')} -> {band} (live {n})")
            r["countBand"] = band
            changed += 1
    if "--dry" not in argv and changed:
        RECIPES_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"count bands: {changed} changed{' (dry run)' if '--dry' in argv else ''}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
