"""How much of the sourced pool the world actually uses.

Owner ruling 2026-09-07: the interiors work "must not quietly narrow at
rollout". Sourcing a hundred buildings and then placing four of them is the
failure this measures. It answers two questions with numbers:

* **per culture** — of the exterior shells we hold that a plugin links to an
  interior (the manifest from `worldgen.mine_door_links`, restricted to shells
  a BUILT kit ships), what fraction is used anywhere across all blueprints?
* **per blueprint** — how many distinct shells does this place stand on, out of
  those available to its culture?

The floor is not set here. The owner's intent, recorded verbatim for Part 8:
"breadth of the sourced pool is used, mods tailored to our aesthetic preferred
over vanilla, vanilla where appropriate." `BREADTH_FLOOR` stays `None` until
Part 8 sets it; when it is a number, `check()` fails under it and `npm test`
inherits the gate through `test_asset_breadth.py`.

Run (from tooling/world-generation/):
  python3 -m worldgen.asset_breadth
  python3 -m worldgen.asset_breadth --json
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
LINKS_PATH = REPO_ROOT / "world" / "sources" / "placement" / "exterior-interior-links.json"
BLUEPRINT_DIR = REPO_ROOT / "world" / "sources" / "blueprints"
KITS_DIR = REPO_ROOT / "tooling" / "asset-pipeline" / "output" / "kits"
KIT_CONFIG_DIR = REPO_ROOT / "tooling" / "asset-pipeline" / "pipeline" / "config" / "kits"

#: TODO(Part 8): the owner sets the floor. Until then this reports, never gates.
#: Owner 2026-09-07, verbatim: "breadth of the sourced pool is used, mods
#: tailored to our aesthetic preferred over vanilla, vanilla where appropriate."
BREADTH_FLOOR: float | None = None


def load_links(path: Path = LINKS_PATH) -> dict[str, list[dict]]:
    try:
        return json.loads(path.read_text()).get("shells", {})
    except (OSError, json.JSONDecodeError):
        return {}


def kit_cultures(config_dir: Path = KIT_CONFIG_DIR) -> dict[str, str]:
    out: dict[str, str] = {}
    for path in sorted(config_dir.glob("*.json")):
        try:
            cfg = json.loads(path.read_text())
        except json.JSONDecodeError:
            continue
        out[path.stem] = cfg.get("culture") or "unclassified"
    return out


def available(links: dict[str, list[dict]] | None = None,
              kits_dir: Path = KITS_DIR) -> dict[str, dict]:
    """Linked shell -> `{kit, culture, interiorKit, cells}` for shells we ship.

    A linked shell nobody built into a kit is a sourcing gap, not availability,
    so it is excluded here and listed by `gaps()`.
    """
    links = load_links() if links is None else links
    cultures = kit_cultures()
    out: dict[str, dict] = {}
    for path in sorted(kits_dir.glob("*.interiors.json")):
        data = json.loads(path.read_text())
        kit = data.get("kit", path.stem.removesuffix(".interiors"))
        for asset_id, record in data.get("assets", {}).items():
            if record.get("interior") == "none":
                continue
            # A COMPOSITE carries the link of the shell it is built on, so it
            # counts as the same availability — a blueprint that stands on the
            # composite has used that shell.
            linked = record.get("interiorSource") == "esp-door" or asset_id in links
            if not linked:
                continue
            rows = links.get(asset_id) or []
            cells = sorted({r.get("interiorCell") for r in rows if r.get("interiorCell")})
            if not cells and record.get("espLink"):
                cells = [record["espLink"].get("interiorCell")]
            out.setdefault(asset_id, {
                "kit": kit,
                "culture": cultures.get(kit, "unclassified"),
                "interiorKit": record.get("tileset"),
                "cells": cells,
            })
    return out


def gaps(links: dict[str, list[dict]] | None = None) -> list[str]:
    """Shells a plugin links to an interior that no built kit ships."""
    links = load_links() if links is None else links
    have = set(available(links))
    return sorted(s for s in links if s not in have)


def blueprint_usage(directory: Path = BLUEPRINT_DIR) -> dict[str, set[str]]:
    """Blueprint id -> the distinct parcel `assetRef`s it stands on."""
    usage: dict[str, set[str]] = {}
    for path in sorted(directory.glob("*.json")):
        try:
            doc = json.loads(path.read_text())
        except json.JSONDecodeError:
            continue
        bp = doc.get("blueprint", doc)   # files wrap the record in schemaVersion
        refs = {p.get("assetRef") for p in bp.get("parcels", []) if p.get("assetRef")}
        usage[bp.get("id", path.stem)] = refs
    return usage


def report() -> dict:
    pool = available()
    usage = blueprint_usage()
    used_anywhere: set[str] = set()
    for refs in usage.values():
        used_anywhere |= refs

    by_culture: dict[str, dict] = defaultdict(lambda: {"available": 0, "used": 0,
                                                       "unused": []})
    for shell, meta in sorted(pool.items()):
        row = by_culture[meta["culture"]]
        row["available"] += 1
        if shell in used_anywhere:
            row["used"] += 1
        else:
            row["unused"].append(shell)
    for row in by_culture.values():
        row["fraction"] = round(row["used"] / row["available"], 3) if row["available"] else 0.0

    per_blueprint = {}
    for bp_id, refs in sorted(usage.items()):
        linked = sorted(refs & set(pool))
        cultures = sorted({pool[s]["culture"] for s in linked})
        pool_for = [s for s, m in pool.items() if m["culture"] in cultures] if cultures else []
        per_blueprint[bp_id] = {
            "distinctShells": len(refs),
            "distinctLinkedShells": len(linked),
            "availableToItsCultures": len(pool_for),
            "cultures": cultures,
        }

    return {
        "schemaVersion": 1,
        "floor": BREADTH_FLOOR,
        "linkedShellsAvailable": len(pool),
        "linkedShellsUsed": len(used_anywhere & set(pool)),
        "byCulture": {k: dict(v) for k, v in sorted(by_culture.items())},
        "perBlueprint": per_blueprint,
        "linkedShellsNoKitShips": gaps(),
    }


#: The vegetation side of the same question. Until 2026-09-09 this module had
#: no flora term at all, so nothing here would have noticed that nine of
#: fourteen region classes carried no understory species of their own and the
#: border mountains carried exactly ONE species below the trees. The gate
#: itself is `test_vegetation_ladder.py`; this reports the numbers next to the
#: settlement ones so a breadth review sees the whole pool in one place.
def understory_breadth() -> dict:
    from .vegetation_ladder import ROCK_ROLES, is_stem_layer, load_palettes

    palettes = load_palettes()
    by_region = {
        region: {layer["species"] for layer in entry["layers"]
                 if not is_stem_layer(layer)
                 and layer.get("role") not in ROCK_ROLES}
        for region, entry in palettes.items()
    }
    everywhere: dict[str, int] = defaultdict(int)
    for species in by_region.values():
        for one in species:
            everywhere[one] += 1
    kit_path = KIT_CONFIG_DIR / "flora-province-v1.json"
    kit = {a["asset"] for a in json.loads(kit_path.read_text())["assets"]}
    used = {layer["species"] for entry in palettes.values()
            for layer in entry["layers"]}
    return {
        "distinctUnderstorySpecies": len(everywhere),
        "floraKitAssets": len(kit),
        "floraKitUnusedByAnyPalette": sorted(kit - used),
        "byRegionClass": {
            region: {
                "species": len(species),
                "regionExclusive": sorted(
                    s.rsplit("/", 1)[-1] for s in species if everywhere[s] == 1),
            }
            for region, species in sorted(by_region.items(), key=lambda kv: int(kv[0]))
        },
    }


def check() -> list[str]:
    """Breadth failures. Empty until Part 8 sets `BREADTH_FLOOR`."""
    if BREADTH_FLOOR is None:
        return []
    data = report()
    return [f"culture {culture}: {row['fraction']:.0%} of {row['available']} linked shells "
            f"are used across all blueprints; the floor is {BREADTH_FLOOR:.0%}"
            for culture, row in data["byCulture"].items()
            if row["available"] and row["fraction"] < BREADTH_FLOOR]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    data = report()
    if args.json:
        print(json.dumps(data, indent=1))
        return 0
    print(f"asset breadth: {data['linkedShellsUsed']}/{data['linkedShellsAvailable']} "
          f"linked exterior shells used across all blueprints "
          f"(floor: {'unset — Part 8' if data['floor'] is None else data['floor']})")
    for culture, row in data["byCulture"].items():
        print(f"  {culture:22s} {row['used']}/{row['available']} ({row['fraction']:.0%})"
              + (f"  unused: {', '.join(s.rsplit('/', 1)[-1] for s in row['unused'][:6])}"
                 if row["unused"] else ""))
    for bp_id, row in data["perBlueprint"].items():
        print(f"  {bp_id}: {row['distinctLinkedShells']} linked shells of "
              f"{row['availableToItsCultures']} available to {', '.join(row['cultures']) or 'no culture'}"
              f" ({row['distinctShells']} distinct parcels' pieces in all)")
    flora = understory_breadth()
    print(f"  understory: {flora['distinctUnderstorySpecies']} distinct species "
          f"across {len(flora['byRegionClass'])} region classes; "
          f"{len(flora['floraKitUnusedByAnyPalette'])} of "
          f"{flora['floraKitAssets']} flora-kit assets unused")
    for region, row in flora["byRegionClass"].items():
        print(f"    region {region:>2}: {row['species']} species, "
              f"{len(row['regionExclusive'])} region-exclusive "
              f"({', '.join(row['regionExclusive']) or 'none'})")
    if data["linkedShellsNoKitShips"]:
        print(f"  {len(data['linkedShellsNoKitShips'])} linked shells no built kit ships "
              f"(sourcing gaps): {', '.join(data['linkedShellsNoKitShips'][:5])}…")
    for problem in check():
        print(f"  FAIL {problem}")
    return 1 if check() else 0


if __name__ == "__main__":
    raise SystemExit(main())
