"""Mine each kit piece's plugin base-record editor id (EDID) for its display name.

Reads only base records (``Plugin.base_objects``), never cells, over the same
pool plugins and model-key join ``mine_setting_class`` uses. Several bases on
one mesh: the lexically first EDID of the first plugin in load order that
carries one (deterministic). Writes world/sources/placement/kit-base-names.json,
read by pipeline.build_kit.display_name_from_id.
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from datetime import date
from pathlib import Path

from . import asset_registry
from .esp_index import Plugin
from .mine_assemblies import PLUGIN_PATH_POOLS
from .mine_designed_sink import LoadOrderIndex, PoolJoin, pool_plugins
from .mine_setting_class import KIT_CONFIG_DIR, piece_ids, with_masters

REPO = Path(__file__).resolve().parents[3]
DEFAULT_OUT = REPO / "world/sources/placement/kit-base-names.json"


def pick(found: list[tuple[int, str, str]]) -> tuple[str, str]:
    """(load order, plugin, edid) rows -> (edid, plugin): earliest plugin, then
    the lexically first EDID within it."""
    order, plugin, edid = min(found)
    return edid, plugin


def mine(kits: list[str], vault: Path, progress: bool = True) -> dict:
    pieces = piece_ids(kits)
    wanted = set(pieces.values())
    by_pool: dict[str, list[str]] = defaultdict(list)
    for asset_id in wanted:
        by_pool[asset_id.split(":", 1)[0]].append(asset_id)
    joins = {pool: PoolJoin(ids) for pool, ids in by_pool.items()}
    every = pool_plugins(vault)
    rows = with_masters([row for row in every
                         if row[0] in by_pool or any(
                             pool in by_pool
                             for _prefix, pool in PLUGIN_PATH_POOLS.get(row[1].name.lower(), ()))],
                        every)
    index = LoadOrderIndex(rows)
    found: dict[str, list[tuple[int, str, str]]] = defaultdict(list)
    for order, (row_pool, path) in enumerate(index.rows):
        name = path.name.casefold()
        if progress:
            print(f"[names] {path.name}", file=sys.stderr)
        for base in Plugin(path).base_objects().values():
            key = base.model_key
            if not key or not base.editor_id:
                continue
            asset_id = index.kit_asset(joins, index.pool_of.get(name, row_pool), name, key,
                                       referrer=name)
            if asset_id in wanted:
                found[asset_id].append((order, path.name, base.editor_id))
    assets = {}
    for manifest_id, read_id in sorted(pieces.items()):
        if read_id in found:
            edid, plugin = pick(found[read_id])
            assets[manifest_id] = {"edid": edid, "plugin": plugin, "nBases": len(found[read_id])}
    return {"schemaVersion": 1,
            "provenance": {"tool": "tooling/world-generation/worldgen/mine_base_names.py",
                           "date": date.today().isoformat(),
                           "source": "base-record EDID + MODL of the pool plugins",
                           "pick": "earliest plugin in load order, then lexically first EDID"},
            "assets": assets}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--kits", nargs="+",
                        default=sorted(p.stem for p in KIT_CONFIG_DIR.glob("*.json")))
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--vault", type=Path, default=asset_registry.DEFAULT_VAULT)
    args = parser.parse_args()
    record = mine(args.kits, args.vault)
    args.out.write_text(json.dumps(record, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    print(f"[names] {len(record['assets'])} assets -> {args.out}")


if __name__ == "__main__":
    main()
