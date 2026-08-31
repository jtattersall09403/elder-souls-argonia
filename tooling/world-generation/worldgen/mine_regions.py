"""Mine `REGN` records: which region data blocks a plugin ships, and what its
procedural object generator actually contains.

Oblivion's region generator (`RDAT` type 2 + an `RDOT` object table carrying
density, clustering, slope limits, sink and scale variance) survives into
Skyrim's format. Module 65 §110 splits vegetation into compiler-placed statics
over a procedural groundcover ring, and the question this tool answers is
whether Bethesda themselves used the object generator or left it empty — i.e.
whether our split matches shipped practice (research rule R11).

It emits a census (regions, which data types each carries, how many object
entries and grasses) plus every decoded `RDOT` row it finds, so if a plugin
*does* carry tables the numbers land in the same file.

Usage:
  python3 -m worldgen.mine_regions \\
      --plugin "<vault>/skyrim-source/Data/Skyrim.esm" \\
      --out world/sources/placement/vanilla-region-object-tables.json
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import struct
from collections import Counter
from pathlib import Path

from .esp_index import Plugin, decode_rdot

#: `RDAT` data-type enum (UESP Skyrim Mod:Mod File Format, REGN).
DATA_TYPES = {
    2: "objects",
    3: "weather",
    4: "map",
    5: "land",
    6: "grass",
    7: "sound",
}


def census(plugin: Plugin) -> dict:
    regions: list[dict] = []
    types = Counter()
    for rec, _ in plugin.records():
        if rec.type != b"REGN":
            continue
        entry = {
            "editorId": None,
            "formId": f"{rec.form_id:08X}",
            "dataTypes": [],
            "objectTableBytes": 0,
            "objectEntries": 0,
            "grasses": 0,
            "objects": [],
        }
        for st, payload in rec.subrecords():
            if st == b"EDID":
                entry["editorId"] = payload.split(b"\0", 1)[0].decode("cp1252", "replace")
            elif st == b"RDAT" and len(payload) >= 4:
                kind = struct.unpack_from("<I", payload)[0]
                name = DATA_TYPES.get(kind, str(kind))
                entry["dataTypes"].append(name)
                types[name] += 1
            elif st == b"RDOT":
                entry["objectTableBytes"] += len(payload)
                for obj in decode_rdot(payload):
                    entry["objectEntries"] += 1
                    entry["objects"].append({
                        "object": f"{obj.object:08X}",
                        "definedIn": plugin.source_of(obj.object),
                        "density": obj.density,
                        "clustering": obj.clustering,
                        "slopeDeg": [obj.min_slope, obj.max_slope],
                        "radiusUnits": obj.radius,
                        "heightUnits": [obj.min_height, obj.max_height],
                        "sinkUnits": obj.sink,
                        "sinkVarianceUnits": obj.sink_variance,
                        "sizeVariance": obj.size_variance,
                        "angleVarianceDeg": list(obj.angle_variance),
                        "flags": obj.flags,
                    })
            elif st == b"RDGS":
                entry["grasses"] += max(0, len(payload) // 8)
        regions.append(entry)
    return {"regions": regions, "dataTypeCounts": dict(sorted(types.items()))}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--plugin", action="append", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    per_plugin = {}
    regions: list[dict] = []
    for path in args.plugin:
        plugin = Plugin(path)
        result = census(plugin)
        per_plugin[Path(path).name] = {
            "regions": len(result["regions"]),
            "dataTypeCounts": result["dataTypeCounts"],
            "regionsWithObjectBlock": sum(
                1 for r in result["regions"] if "objects" in r["dataTypes"]
            ),
            "regionsWithObjectEntries": sum(
                1 for r in result["regions"] if r["objectEntries"]
            ),
            "objectEntries": sum(r["objectEntries"] for r in result["regions"]),
            "regionsWithGrass": sum(1 for r in result["regions"] if r["grasses"]),
        }
        for r in result["regions"]:
            r["plugin"] = Path(path).name
        regions.extend(result["regions"])

    report = {
        "source": {
            "method": (
                "worldgen.mine_regions — REGN census and RDOT object-table decode "
                "(module 95 §86.0b: mine the shipped worlds for rules, never for places)"
            ),
            "date": dt.date.today().isoformat(),
            "plugins": [Path(p).name for p in args.plugin],
            "regionsRead": len(regions),
        },
        "perPlugin": per_plugin,
        "note": (
            "Evidence counts sit beside every number. An empty objectTableBytes "
            "means the region declares an object-generator block and ships no "
            "rows in it."
        ),
        "regionsWithObjectEntries": [r for r in regions if r["objectEntries"]],
        "regionsWithObjectBlockButNoEntries": sorted(
            r["editorId"] or r["formId"]
            for r in regions
            if "objects" in r["dataTypes"] and not r["objectEntries"]
        ),
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=1) + "\n")
    print(f"{len(regions)} REGN records -> {out}")


if __name__ == "__main__":
    main()
