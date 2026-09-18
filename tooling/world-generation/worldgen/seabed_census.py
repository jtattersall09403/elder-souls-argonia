"""Measure the SHIPPED sea-floor dressing by distance from the shore and by
depth (16f round 4).

Counts every instance in the published bundles that stands on an `ocean`
texel at least 0.3 m under water, against the ocean floor's own area in the
same band, so the number is pieces per 100 m^2 of floor — what a swimmer
sees — rather than a palette figure. Before the round-4 re-authoring the
floor held 2.3 pieces per 100 m^2 inside 50 m of the shore, 0.9 at
100-150 m and 0.02 past 400 m; the owner, 33 m out in 6.6 m of water, found
"some, but not very much".

Run:  python3 -m worldgen.seabed_census
"""

from __future__ import annotations

import collections
import json
from pathlib import Path

import numpy as np

from .rock_census import VEGETATION, species_order
from .scatter import decode

#: Edges of the distance-from-shore bands, metres (the last is open).
DISTANCE_BANDS = (0, 50, 100, 150, 200, 300, 400, 600, 800, 1000, 1500, 2000)
#: Edges of the depth bands, metres (the last is open).
DEPTH_BANDS = (0.3, 1.0, 2.0, 4.0, 6.0, 8.0, 12.0, 16.0, 25.0)
MIN_DEPTH_M = 0.3


def _band(edges, value) -> int:
    i = 0
    for k, edge in enumerate(edges):
        if value >= edge:
            i = k
    return i


def census(vegetation: Path = VEGETATION) -> dict:
    """Instances per 100 m^2 of ocean floor by distance band and by depth
    band, plus the distinct species standing on the floor."""
    from .compile_scatter import ProvinceFields
    pf = ProvinceFields()
    fields = pf.as_fields()
    ocean_kind = pf.kind_names.index("ocean")
    floor = (pf.depth_m >= MIN_DEPTH_M) & (pf.kind_idx == ocean_kind) & (pf.coast_m < 0)
    px_area = pf.water_px_m ** 2
    dist = -pf.coast_m
    area_d = {}
    for i in range(len(DISTANCE_BANDS)):
        lo = DISTANCE_BANDS[i]
        hi = DISTANCE_BANDS[i + 1] if i + 1 < len(DISTANCE_BANDS) else np.inf
        area_d[i] = float((floor & (dist >= lo) & (dist < hi)).sum() * px_area)
    area_z = {}
    for i in range(len(DEPTH_BANDS)):
        lo = DEPTH_BANDS[i]
        hi = DEPTH_BANDS[i + 1] if i + 1 < len(DEPTH_BANDS) else np.inf
        area_z[i] = float((floor & (pf.depth_m >= lo) & (pf.depth_m < hi)).sum() * px_area)

    order = species_order(vegetation)
    count_d: collections.Counter = collections.Counter()
    count_z: collections.Counter = collections.Counter()
    species: collections.Counter = collections.Counter()
    top_d: dict[int, collections.Counter] = collections.defaultdict(collections.Counter)
    for path in sorted(vegetation.glob("chunk_*_vegetation.bin")):
        for group in decode(path.read_bytes()):
            name = order[group["index"]]
            for inst in group["instances"]:
                x, z = inst["x"], inst["z"]
                depth = fields.water_depth(x, z)
                if depth < MIN_DEPTH_M or fields.water_kind(x, z) != "ocean":
                    continue
                di = _band(DISTANCE_BANDS, -fields.coast(x, z))
                count_d[di] += 1
                count_z[_band(DEPTH_BANDS, depth)] += 1
                species[name] += 1
                top_d[di][name.split("/")[-1]] += 1

    def rows(edges, areas, counts, tops=None):
        out = []
        for i in range(len(edges)):
            hi = edges[i + 1] if i + 1 < len(edges) else None
            out.append({
                "from": edges[i], "to": hi,
                "areaHa": round(areas[i] / 1e4, 1),
                "instances": counts[i],
                "per100m2": round(100.0 * counts[i] / max(areas[i], 1.0), 3),
                **({"top": tops[i].most_common(5)} if tops is not None else {}),
            })
        return out

    return {
        "instances": sum(species.values()),
        "distinctSpecies": len(species),
        "byDistanceM": rows(DISTANCE_BANDS, area_d, count_d, top_d),
        "byDepthM": rows(DEPTH_BANDS, area_z, count_z),
        "species": dict(species.most_common()),
    }


def main() -> None:
    doc = census()
    print(f"sea-floor instances {doc['instances']}, distinct species {doc['distinctSpecies']}")
    print("by distance from shore (m): area ha, instances, per 100 m2")
    for r in doc["byDistanceM"]:
        print(f"  {r['from']:>5}-{str(r['to'] or ''):<6} {r['areaHa']:8.1f} ha  "
              f"{r['instances']:7d}  {r['per100m2']:6.3f}   {r['top'][:4]}")
    print("by depth (m):")
    for r in doc["byDepthM"]:
        print(f"  {r['from']:>5}-{str(r['to'] or ''):<6} {r['areaHa']:8.1f} ha  "
              f"{r['instances']:7d}  {r['per100m2']:6.3f}")


if __name__ == "__main__":
    main()
