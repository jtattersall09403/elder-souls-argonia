"""Which social setting each kit piece's makers placed it in (decision 0105 R1).

Walk-3 ruling R1 (planner 2026-09-28): a kit piece is placed only in the
setting class its own plugin places it in, read from the plugin's placement
cells and worldspaces, never from the piece's name. Candle sconces are interior
pieces by this rule; a keep's stone stable never stands in a hamlet.

**Evidence.** Every reference to a kit piece (or a composite's first part, the
shell the composite is built on) in the plugins of the piece's OWN pool
(``mine_designed_sink.pool_plugins``; King of the Murkmire is split by model
path, ``mine_assemblies.PLUGIN_PATH_POOLS``). A vanilla piece a mod places is
counted apart (``otherFileRefs``) and never votes.

**Per reference:** interior or exterior (the cell kind), then the social class
of the cell's location: the cell's ``XLCN`` location, else (exterior) its
worldspace's ``XLCN``, walked up the ``PNAM`` parent chain; every ``LocType*``
keyword on that chain votes and the highest class in ``CLASS_ORDER`` wins
(an inn inside a city is ``town``; a farm inside a hold is ``village``).
A cell with no location, or none whose chain carries a class keyword, is
``wild``. ``KEYWORD_CLASS`` is the whole mapping. The cell, worldspace,
location and keyword records are the ones the referencing plugin sees (its
on-disk masters in master order, then itself; masters are always loaded),
so a piece's row never depends on which other kits are mined beside it.

**Per piece:** ``interior`` / ``exterior`` counts, ``classes`` (class -> n),
``settings``: a setting (interior, exterior) is licensed when it holds at
least ``floor`` of the piece's own references and ``MIN_SHARE`` of them all;
inside it, each class with at least ``floor`` references, ``floor`` =
min(``MIN_REFS``, ceil(n x ``MIN_SHARE``)) (a stray reference does not
license a class; a piece placed once or twice is licensed where it stands),
except that a social class needs ``CLASS_MIN_REFS`` (2) references (0105
R23: a piece placed once holds its setting but no class; such classes are
written as ``classNotMeasured`` {setting: {class: n}}). ``wild`` licenses the setting but no social class: the
mod plugins (BM&V, Mud Mother) set no locations, so their pieces carry the
interior/exterior licence only, and a gate reads a class only when one is
licensed. up to ``CELLS_KEPT``
source cells (the cell or location editor ids, most frequent first). A piece
with no own reference is ``unplaced`` (n 0): R1 gives it no licence anywhere.
A water craft (``VEHICLE_KIT``'s hulls and oars) carries ``vehicle: true``:
its mod places it by script, and the gate exempts it from the
interior/exterior axis (0105 R15).

Output: ``world/sources/placement/kit-setting-class.json``; the manifests read
it through ``placement_metadata --refresh-built-manifests`` (``settingClass``
on each row), never by hand.

    cd tooling/world-generation && python3 -m worldgen.mine_setting_class \
        [--kits KIT ...] [--merge] [--out PATH]
"""
from __future__ import annotations

import argparse
import json
import math
import struct
import sys
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

from . import asset_registry
from .esp_index import Plugin, _cstr
from .mine_assemblies import PLUGIN_PATH_POOLS
from .mine_designed_sink import LoadOrderIndex, PoolJoin, pool_plugins

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_OUT = REPO_ROOT / "world" / "sources" / "placement" / "kit-setting-class.json"
KIT_CONFIG_DIR = REPO_ROOT / "tooling" / "asset-pipeline" / "pipeline" / "config" / "kits"
#: The two settlement kits the 16k places build from (walk-3 L4), the keep
#: kit whose stable Claywater stood (the R1 breach the owner saw), and the
#: works kit the 16k yards dress from (walk 3 L9): the default run
#: reproduces the committed record.
DEFAULT_KITS = ("settlement-imperial-v1", "settlement-mud-v1", "imperial-keep", "works-v1")
SCHEMA_VERSION = 1
#: 2: a reference's class is read from what its own plugin sees (its on-disk
#: masters, then itself), and every selected plugin's masters are loaded, so
#: a piece's row no longer depends on which other kits are co-mined (L9 rec 3);
#: water craft carry ``vehicle`` (0105 R15)
#: 3: a social class needs ``CLASS_MIN_REFS`` references (0105 R23)
MINER_VERSION = 3
#: 0105 R15: vehicles and water craft are exempt from the interior/exterior
#: axis; their mods place them by script. The province's craft are the
#: watercraft kit's hulls and oars (its config is the one list of them);
#: ``NOT_VEHICLES`` are the kit's pieces that are no craft (an anchor, loose
#: planks) or a wreck a plugin places as a static.
VEHICLE_KIT = "watercraft-v1"
NOT_VEHICLES = frozenset({
    "canoe:weapons/sfss/anchor",
    "ferryraft:snt/ferry/norbridgewoodplanks01", "ferryraft:snt/ferry/norbridgewoodplanks02",
    "bmv:architecture/boats/rowboatbrokenback", "bmv:architecture/boats/rowboatbrokenfront",
    "bmv:nordships/shipnordtradeshipbeached",
})

#: Highest first: a location chain carrying several classes takes the first.
CLASS_ORDER = ("keep", "town", "village", "camp", "ruin")
#: Skyrim.esm location-type keywords -> R1 class. Keywords absent here carry
#: no social class (LocTypeHabitation, LocTypeDwelling, LocTypeHouse,
#: LocTypeInn, LocTypeStore ... are read through the chain's parent).
KEYWORD_CLASS = {
    "LocTypeCastle": "keep", "LocTypeMilitaryFort": "keep", "LocTypeJail": "keep",
    "LocTypeOrcStronghold": "keep", "LocTypeGuardTower": "keep",
    "LocTypeCity": "town", "LocTypeTown": "town",
    "LocTypeSettlement": "village", "LocTypeFarm": "village",
    "LocTypeLumberMill": "village", "LocTypeMine": "village",
    "LocTypeMilitaryCamp": "camp", "LocTypeBanditCamp": "camp",
    "LocTypeGiantCamp": "camp", "LocTypeForswornCamp": "camp",
    "LocTypeDungeon": "ruin", "LocTypeNordicRuin": "ruin",
    "LocTypeDwarvenAutomatons": "ruin", "LocTypeFalmerHive": "ruin",
    "LocTypeDraugrCrypt": "ruin", "LocTypeAnimalDen": "ruin",
    "LocTypeVampireLair": "ruin", "LocTypeWarlockLair": "ruin",
    "LocTypeHagravenNest": "ruin", "LocTypeDragonLair": "ruin",
    "LocTypeClearable": None,
}
WILD = "wild"
#: A class is a licence when at least this share of the piece's own refs
#: (in that setting) carry it; a stray reference does not license a class.
MIN_SHARE = 0.1
MIN_REFS = 3
#: 0105 R23: a social class (axis ii) is licensed from this many references;
#: one reference licenses the setting (axis i) but no class, and the gate
#: reads that piece NOT_MEASURED on axis ii (the genericwell01 case, n 1)
CLASS_MIN_REFS = 2
CELLS_KEPT = 8
#: Cells that are no played place: Bethesda's asset-storage warehouses and
#: navmesh/test cells (``WarehouseFences``, ``NavMeshGenCellDUPLICATE001``) and
#: test worldspaces (``CWTestHold``). Their references never vote.
EXCLUDED_PREFIXES = ("warehouse", "navmeshgen", "zz", "test")
EXCLUDED_WORLD_TERMS = ("test",)


def excluded(cell_edid: str | None, world_edid: str | None) -> bool:
    cell = (cell_edid or "").lower()
    world = (world_edid or "").lower()
    return (cell.startswith(EXCLUDED_PREFIXES) or "test" in cell
            or any(term in world for term in EXCLUDED_WORLD_TERMS))


def piece_ids(kits: list[str]) -> dict[str, str]:
    """``manifest asset id -> id whose plugin refs are read``: the piece
    itself, a composite's first part (the shell it is built on), or a
    texture variant's base (``variantOf``: the same mesh re-textured)."""
    out: dict[str, str] = {}
    for kit in kits:
        config = json.loads((KIT_CONFIG_DIR / f"{kit}.json").read_text())
        for entry in config.get("assets", []):
            parts = (entry.get("compose") or {}).get("parts") or []
            out[entry["asset"]] = (parts[0]["asset"] if parts
                                   else entry.get("variantOf") or entry["asset"])
    return out


def vehicle_assets() -> frozenset[str]:
    """0105 R15: the asset ids that are water craft (``VEHICLE_KIT``'s
    config less ``NOT_VEHICLES``)."""
    config = json.loads((KIT_CONFIG_DIR / f"{VEHICLE_KIT}.json").read_text())
    return frozenset(e["asset"] for e in config.get("assets", [])) - NOT_VEHICLES


def with_masters(selected: list[tuple[str, Path]], every: list[tuple[str, Path]]) -> list[tuple[str, Path]]:
    """``selected`` plus, transitively, every on-disk master of each of its
    plugins (``every`` is the whole pool list): a reference's location and
    keyword records come from the files its plugin sees, whichever kits are
    mined with it."""
    by_name = {path.name.casefold(): row for row in every for path in [row[1]]}
    out = {row[1].name.casefold(): row for row in selected}
    queue = list(out)
    while queue:
        for master in Plugin(out[queue.pop()][1]).masters:
            key = master.casefold()
            if key in by_name and key not in out:
                out[key] = by_name[key]
                queue.append(key)
    return list(out.values())


def location_tables(plugin: Plugin, resolve) -> tuple[dict, dict, dict, dict]:
    """``(keywords, locations, cell_loc, world_loc)`` from one plugin, form ids
    resolved: KYWD id -> edid; LCTN id -> (edid, [keyword ids], parent id);
    CELL id -> XLCN; WRLD id -> XLCN."""
    keywords, locations, cell_loc, world_loc = {}, {}, {}, {}
    for rec, _stack in plugin.records():
        kind = rec.type
        if kind not in (b"KYWD", b"LCTN", b"CELL", b"WRLD"):
            continue
        edid, kwda, parent, xlcn = None, [], None, None
        for sub, payload in rec.subrecords():
            if sub == b"EDID":
                edid = _cstr(payload)
            elif sub == b"KWDA":
                kwda = [resolve(v) for v in struct.unpack(f"<{len(payload) // 4}I", payload)]
            elif sub == b"PNAM" and kind == b"LCTN" and len(payload) == 4:
                parent = resolve(struct.unpack("<I", payload)[0])
            elif sub == b"XLCN" and len(payload) == 4:
                xlcn = resolve(struct.unpack("<I", payload)[0])
        fid = resolve(rec.form_id)
        if kind == b"KYWD":
            keywords[fid] = edid
        elif kind == b"LCTN":
            locations[fid] = (edid, kwda, parent)
        elif kind == b"CELL" and xlcn is not None:
            cell_loc[fid] = xlcn
        elif kind == b"WRLD" and xlcn is not None:
            world_loc[fid] = xlcn
    return keywords, locations, cell_loc, world_loc


def classify(loc: int | None, keywords: dict, locations: dict) -> tuple[str, str | None]:
    """``(class, location edid)`` for a location id, walking PNAM parents."""
    seen: set[int] = set()
    found: set[str] = set()
    first_edid = None
    while loc is not None and loc in locations and loc not in seen:
        seen.add(loc)
        edid, kwda, parent = locations[loc]
        first_edid = first_edid or edid
        for kw in kwda:
            cls = KEYWORD_CLASS.get(keywords.get(kw) or "")
            if cls:
                found.add(cls)
        loc = parent
    for cls in CLASS_ORDER:
        if cls in found:
            return cls, first_edid
    return WILD, first_edid


def mine(kits: list[str], vault: Path, progress: bool = True) -> dict:
    pieces = piece_ids(kits)
    wanted = set(pieces.values())
    joins: dict[str, PoolJoin] = {}
    by_pool: dict[str, list[str]] = defaultdict(list)
    for asset_id in wanted:
        by_pool[asset_id.split(":", 1)[0]].append(asset_id)
    for pool, ids in by_pool.items():
        joins[pool] = PoolJoin(ids)
    every = pool_plugins(vault)
    rows = with_masters([row for row in every
                         if row[0] in by_pool or any(
                             pool in by_pool
                             for _prefix, pool in PLUGIN_PATH_POOLS.get(row[1].name.lower(), ()))],
                        every)
    index = LoadOrderIndex(rows)
    vehicles = vehicle_assets()
    file_tables: dict[str, tuple[dict, dict, dict, dict]] = {}
    for _pool, path in index.rows:
        plugin = Plugin(path)
        file_tables[path.name.casefold()] = location_tables(plugin, index.resolver.of(plugin))

    def seen_by(name: str) -> tuple[dict, dict, dict, dict]:
        """The location tables ``name`` sees: its on-disk masters in master
        order, then its own records (the latest file it loads owns a record)."""
        merged: tuple[dict, dict, dict, dict] = ({}, {}, {}, {})
        for source in [m for m in index.masters_of[name] if m in file_tables] + [name]:
            for into, part in zip(merged, file_tables[source]):
                into.update(part)
        return merged
    counts: dict[str, dict] = {a: {"interior": Counter(), "exterior": Counter(),
                                   "cells": Counter(), "otherFileRefs": 0,
                                   "plugins": set()} for a in wanted}
    row_excluded = [0]
    for row_pool, path in index.rows:
        plugin = Plugin(path)
        name = path.name.casefold()
        resolve = index.resolver.of(plugin)
        visible = index.visible(name)
        keywords, locations, cell_loc, world_loc = seen_by(name)
        if progress:
            print(f"[setting] {path.name}", file=sys.stderr)

        def walk(cell, setting: str) -> None:
            cls = edid = None
            world = index.worlds.get(resolve(cell.world)) if setting == "exterior" else None
            if excluded(cell.editor_id, world[0].editor_id if world else None):
                row_excluded[0] += 1
                return
            for ref in cell.refs:
                hit = visible.get(resolve(ref.base))
                if hit is None:
                    continue
                base, source = hit
                key = getattr(base, "model_key", None)
                if not key:
                    continue
                asset_id = index.kit_asset(joins, index.pool_of.get(source), source, key,
                                           referrer=name)
                if asset_id not in counts:
                    continue
                own = index.model_pool(name, key, row_pool) == asset_id.split(":", 1)[0]
                if not own:
                    counts[asset_id]["otherFileRefs"] += 1
                    continue
                if cls is None:
                    loc = cell_loc.get(resolve(cell.form_id))
                    if loc is None and setting == "exterior":
                        loc = world_loc.get(resolve(cell.world))
                    cls, edid = classify(loc, keywords, locations)
                    label = cell.editor_id or edid or (world[0].editor_id if world else "?")
                row = counts[asset_id]
                row[setting][cls] += 1
                row["cells"][f"{setting}:{cls}:{label}"] += 1
                row["plugins"].add(path.name)

        for cell in plugin.interior_cells():
            walk(cell, "interior")
        for cell in plugin.exterior_cells(with_land=False):
            walk(cell, "exterior")
        del plugin

    assets: dict[str, dict] = {}
    for manifest_id, source_id in sorted(pieces.items()):
        row = counts[source_id]
        n_int, n_ext = sum(row["interior"].values()), sum(row["exterior"].values())
        n = n_int + n_ext
        # A piece its makers placed fewer than MIN_REFS / MIN_SHARE times: every
        # placement they made is its evidence (the whole population).
        floor = min(MIN_REFS, max(1, math.ceil(n * MIN_SHARE)))
        settings, thin = {}, {}
        for setting, total in (("interior", n_int), ("exterior", n_ext)):
            if total >= floor and total / n >= MIN_SHARE:
                settings[setting] = sorted(
                    (cls for cls, k in row[setting].items()
                     if k >= (floor if cls == WILD else max(floor, CLASS_MIN_REFS))),
                    key=lambda c: (CLASS_ORDER + (WILD,)).index(c))
                # R23: classes the ordinary floor licensed that fall under
                # CLASS_MIN_REFS: the gate reads them NOT_MEASURED on axis ii
                under = {cls: k for cls, k in row[setting].items()
                         if cls != WILD and floor <= k < CLASS_MIN_REFS}
                if under:
                    thin[setting] = under

        assets[manifest_id] = {
            "n": n,
            "interior": dict(row["interior"]),
            "exterior": dict(row["exterior"]),
            "settings": settings,
            "sourceCells": [c for c, _k in row["cells"].most_common(CELLS_KEPT)],
            "plugins": sorted(row["plugins"]),
            "otherFileRefs": row["otherFileRefs"],
            "evidence": "plugin" if n else "unplaced",
            **({"classNotMeasured": thin} if thin else {}),
            **({"vehicle": True} if manifest_id in vehicles or source_id in vehicles else {}),
            **({"readFrom": source_id} if source_id != manifest_id else {}),
        }
    return {
        "schemaVersion": SCHEMA_VERSION,
        "provenance": {"miner": "worldgen.mine_setting_class", "minerVersion": MINER_VERSION,
                       "runDate": date.today().isoformat(), "kits": sorted(kits),
                       "plugins": [p.name for _pool, p in index.rows]},
        "rule": "decision 0105 R1 (planner 2026-09-28): a piece is placed only in the "
                "setting class its own plugin places it in",
        "method": __doc__.split("**Per piece:**")[0].split("**Evidence.**")[1].strip(),
        "classOrder": list(CLASS_ORDER) + [WILD],
        "keywordClass": {k: v for k, v in KEYWORD_CLASS.items() if v},
        "minShare": MIN_SHARE,
        "minRefs": MIN_REFS,
        "classMinRefs": CLASS_MIN_REFS,
        "excludedCellPrefixes": list(EXCLUDED_PREFIXES),
        "excludedCells": row_excluded[0],
        "vehicleKit": VEHICLE_KIT,
        "notVehicles": sorted(NOT_VEHICLES),
        "assets": assets,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("--kits", nargs="+", default=list(DEFAULT_KITS))
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--vault", type=Path, default=asset_registry.DEFAULT_VAULT)
    parser.add_argument("--merge", action="store_true",
                        help="keep the --out record's rows for kits not named here")
    args = parser.parse_args()
    record = mine(args.kits, args.vault)
    if args.merge and args.out.exists():
        old = json.loads(args.out.read_text())
        kept = {k: v for k, v in old.get("assets", {}).items() if k not in record["assets"]}
        record["assets"] = dict(sorted({**kept, **record["assets"]}.items()))
        record["provenance"]["kits"] = sorted(set(old["provenance"]["kits"]) | set(args.kits))
    args.out.write_text(json.dumps(record, indent=1) + "\n")
    placed = sum(1 for a in record["assets"].values() if a["n"])
    print(f"[setting] {len(record['assets'])} pieces, {placed} placed by their own plugin "
          f"-> {args.out}")


if __name__ == "__main__":
    main()
