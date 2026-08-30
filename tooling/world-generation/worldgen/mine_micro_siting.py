"""Mine **micro-siting**: where flora sits relative to the waterline.

One level below `mine_placement`'s per-species percentiles (module 95 §86.0b):

* per-species **water-relation classes** — how often a species stands in open
  water, in the shallows, at the waterline, or on dry ground, with the depth
  it tolerates *conditional on being flooded*;
* the **riparian profile** — placed density as a function of horizontal
  distance to the nearest waterline, on both the wet and the dry side, which
  is the shore/river density multiplier the scatter compiler needs;
* **pool scenes** — connected standing-water bodies and the ring structure of
  their dressing: what floats in the water, what rings the margin, what
  stands back.

Distances come from a chamfer distance transform over a strided terrain grid
(every 2nd LAND vertex, 3.64 m spacing), seeded at flooded/dry boundaries, so
no per-instance nearest-point search is needed. Only dressed cells (cells
carrying at least one placed reference) and their 1-ring neighbours enter the
grid — consistent with `mine_placement`'s per-dressed-cell densities.

Usage:
  python3 -m worldgen.mine_micro_siting \\
      --plugin "<vault>/plugins/Black Marsh.esm" \\
      --plugin "<vault>/plugins/Black Marsh North.esp" \\
      --names "<vault>/Tropical Skyrim.esp" \\
      --world BlackMarsh --world BlackMarsh2 --world BlackMarshNorth \\
      --out world/sources/placement/bmv-blackmarsh-micrositing.json
"""

from __future__ import annotations

import argparse
import json
import math
from collections import Counter, defaultdict, deque
from pathlib import Path

from .esp_index import CELL_SIZE_UNITS, UNITS_PER_METRE, Plugin
from .mine_placement import Instance, _percentiles, collect

STRIDE = 2
"""Every STRIDE-th LAND vertex enters the grid (33x33 -> 17x17 per cell)."""

NODE_M = (CELL_SIZE_UNITS / 32) * STRIDE / UNITS_PER_METRE  # ~3.64 m
NODE_AREA_M2 = NODE_M * NODE_M

MAX_DIST_M = 120.0
"""Beyond this the transform stops; further ground lands in the last band."""

#: Signed distance to the waterline, metres; positive = into the water.
#: Bands are (name, lo, hi) over that axis, water side first.
RIPARIAN_BANDS = (
    ("water >20m from shore", 20.0, 9e9),
    ("water 5-20m", 5.0, 20.0),
    ("water 0-5m", 0.0, 5.0),
    ("shore 0-5m", -5.0, 0.0),
    ("bank 5-10m", -10.0, -5.0),
    ("back 10-20m", -20.0, -10.0),
    ("back 20-40m", -40.0, -20.0),
    ("hinterland >40m", -9e9, -40.0),
)

#: Pool-scene rings over the same axis, for composition rather than density.
SCENE_RINGS = (
    ("open water >5m in", 5.0, 9e9),
    ("shallows 0-5m in", 0.0, 5.0),
    ("margin 0-3m out", -3.0, 0.0),
    ("bank 3-10m out", -10.0, -3.0),
    ("backdrop 10-25m out", -25.0, -10.0),
)

POOL_MIN_M2 = 100.0
POOL_MAX_M2 = 25_000.0
"""Flooded bodies in this range are 'pools'; bigger is river/lake/sea."""

MIN_SPECIES = 100
"""Species below this count are folded into their category, not profiled."""


def band_of(signed_m: float, bands=RIPARIAN_BANDS) -> str | None:
    for name, lo, hi in bands:
        if lo <= signed_m < hi:
            return name
    return None


def build_grid(plugins: list[Plugin], world_names: set[str],
               keep_cells: set[tuple[int, int]]) -> dict[tuple[int, int], float]:
    """Grid node -> standing-water depth over the ground (m, +ve = flooded).

    Nodes are global integer coordinates at NODE_M spacing; only cells in
    `keep_cells` contribute. The 33rd row/column of each cell duplicates the
    neighbour's first, so striding from index 0 tiles cleanly.
    """
    grid: dict[tuple[int, int], float] = {}
    per_cell = 32 // STRIDE  # nodes contributed per cell edge
    for plugin in plugins:
        worlds = {
            fid for fid, world in plugin.worldspaces().items()
            if world.editor_id in world_names
        }
        for cell in plugin.exterior_cells():
            if cell.world not in worlds or cell.grid not in keep_cells:
                continue
            if cell.land is None or cell.land.heights is None:
                continue
            if cell.water_height is None:
                continue
            cx, cy = cell.grid
            for gy in range(per_cell):
                row = cell.land.heights[gy * STRIDE]
                for gx in range(per_cell):
                    depth = (cell.water_height - row[gx * STRIDE]) / UNITS_PER_METRE
                    grid[(cx * per_cell + gx, cy * per_cell + gy)] = depth
    return grid


def label_water_bodies(grid: dict[tuple[int, int], float]) -> dict[tuple[int, int], int]:
    """4-connected component label for every flooded node."""
    labels: dict[tuple[int, int], int] = {}
    next_label = 0
    for start, depth in grid.items():
        if depth <= 0 or start in labels:
            continue
        queue = deque([start])
        labels[start] = next_label
        while queue:
            x, y = queue.popleft()
            for nb in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if nb in labels or grid.get(nb, 0.0) <= 0:
                    continue
                labels[nb] = next_label
                queue.append(nb)
        next_label += 1
    return labels


def distance_transform(
    grid: dict[tuple[int, int], float],
    labels: dict[tuple[int, int], int],
) -> dict[tuple[int, int], tuple[float, int]]:
    """Node -> (distance to the nearest waterline in metres, water-body label).

    Chamfer 6-8 over the node grid via a bucket queue: orthogonal steps cost
    6, diagonal 8, distance = cost / 6 * NODE_M (max ~6 % metric error, far
    below the band width). The waterline runs *between* a flooded and a dry
    node, so flooded boundary nodes seed at cost 0 and their dry 4-neighbours
    at cost 3 (half an orthogonal step); each seed carries its water body's
    label outward.
    """
    ORTH = ((1, 0), (-1, 0), (0, 1), (0, -1))
    DIAG = ((1, 1), (1, -1), (-1, 1), (-1, -1))
    max_cost = int(MAX_DIST_M / NODE_M * 6) + 1
    buckets: list[list[tuple[int, int]]] = [[] for _ in range(max_cost + 9)]
    best: dict[tuple[int, int], int] = {}
    label_out: dict[tuple[int, int], int] = {}
    for node, depth in grid.items():
        if depth <= 0:
            continue
        x, y = node
        dry_neighbours = [
            nb for dx, dy in ORTH
            if (nb := (x + dx, y + dy)) in grid and grid[nb] <= 0
        ]
        if not dry_neighbours:
            continue
        best[node] = 0
        label_out[node] = labels[node]
        buckets[0].append(node)
        for nb in dry_neighbours:
            if 3 < best.get(nb, 1 << 30):
                best[nb] = 3
                label_out[nb] = labels[node]
                buckets[3].append(nb)
    for cost in range(max_cost + 1):
        for node in buckets[cost]:
            if best.get(node, 1 << 30) < cost:
                continue
            x, y = node
            here = label_out[node]
            for step, moves in ((6, ORTH), (8, DIAG)):
                for dx, dy in moves:
                    nb = (x + dx, y + dy)
                    if nb not in grid:
                        continue
                    nc = cost + step
                    if nc < best.get(nb, 1 << 30):
                        best[nb] = nc
                        label_out[nb] = here
                        buckets[nc].append(nb)
    return {
        node: (cost / 6.0 * NODE_M, label_out[node]) for node, cost in best.items()
    }


def node_of(inst: Instance) -> tuple[int, int]:
    return (int(math.floor(inst.x / NODE_M)), int(math.floor(inst.y / NODE_M)))


def signed_distance(inst: Instance,
                    grid: dict[tuple[int, int], float],
                    dist: dict[tuple[int, int], tuple[float, int]],
                    ) -> tuple[float, int] | None:
    """(signed metres to waterline, water-body label); +ve = flooded ground."""
    node = node_of(inst)
    if node not in grid:
        return None
    if node not in dist:  # further than MAX_DIST_M from any waterline
        return (-MAX_DIST_M, -1)
    d, label = dist[node]
    return (d, label) if grid[node] > 0 else (-d, label)


def species_water_relation(instances: list[Instance]) -> dict:
    """Per-species flooding classes with conditional depth/height percentiles."""
    by_species: dict[str, list[Instance]] = defaultdict(list)
    for inst in instances:
        by_species[inst.species].append(inst)
    out: dict[str, dict] = {}
    for species, group in sorted(by_species.items(), key=lambda kv: -len(kv[1])):
        if len(group) < MIN_SPECIES:
            continue
        known = [i for i in group if i.ground_water_depth_m is not None]
        if not known:
            continue
        flooded = [i.ground_water_depth_m for i in known if i.ground_water_depth_m > 0.05]
        dry = [-i.ground_water_depth_m for i in known if i.ground_water_depth_m <= 0.05]
        submerged = [
            -i.above_water_m for i in known
            if i.above_water_m is not None and i.above_water_m < -0.05
        ]

        def frac(pred) -> float:
            return round(sum(1 for i in known if pred(i.ground_water_depth_m)) / len(known), 3)

        out[species] = {
            "category": group[0].category,
            "count": len(group),
            "class": {
                "deepWater>1m": frac(lambda d: d > 1.0),
                "shallows0.3-1m": frac(lambda d: 0.3 < d <= 1.0),
                "waterline±0.3m": frac(lambda d: -0.3 <= d <= 0.3),
                "damp0.3-1m above": frac(lambda d: -1.0 <= d < -0.3),
                "dry>1m above": frac(lambda d: d < -1.0),
            },
            "standingWaterDepthWhenFloodedM": _percentiles(flooded),
            "groundHeightAboveWaterWhenDryM": _percentiles(dry),
            "originDepthBelowSurfaceM": _percentiles(submerged),
            "originSubmergedFraction": round(len(submerged) / len(known), 3),
        }
    return out


def riparian_profile(instances: list[Instance],
                     grid: dict[tuple[int, int], float],
                     dist: dict[tuple[int, int], tuple[float, int]],
                     dressed: set[tuple[int, int]]) -> dict:
    """Density per hectare against distance from the waterline."""
    per_cell_nodes = 32 // STRIDE
    area_nodes: Counter = Counter()
    for node, depth in grid.items():
        cell = (node[0] // per_cell_nodes, node[1] // per_cell_nodes)
        if cell not in dressed:
            continue
        entry = dist.get(node)
        d = entry[0] if entry else MAX_DIST_M
        band = band_of(d if depth > 0 else -d)
        if band:
            area_nodes[band] += 1

    counts: Counter = Counter()
    placed = skipped = 0
    for inst in instances:
        sd = signed_distance(inst, grid, dist)
        if sd is None:
            skipped += 1
            continue
        band = band_of(sd[0])
        if band:
            counts[band] += 1
            placed += 1

    bands_out = []
    densities = {}
    for name, _, _ in RIPARIAN_BANDS:
        area_ha = area_nodes[name] * NODE_AREA_M2 / 10_000
        density = round(counts[name] / area_ha, 1) if area_ha > 0.5 else None
        densities[name] = density
        bands_out.append({
            "band": name,
            "instances": counts[name],
            "areaHa": round(area_ha, 1),
            "perHectare": density,
        })
    base = densities.get("hinterland >40m")
    for row in bands_out:
        row["multiplierVsHinterland"] = (
            round(row["perHectare"] / base, 2)
            if base and row["perHectare"] is not None else None
        )
    return {
        "nodeSpacingM": round(NODE_M, 2),
        "instancesBanded": placed,
        "instancesOffGrid": skipped,
        "bands": bands_out,
    }


def pool_scenes(instances: list[Instance],
                grid: dict[tuple[int, int], float],
                labels: dict[tuple[int, int], int],
                dist: dict[tuple[int, int], tuple[float, int]],
                examples: int = 6) -> dict:
    """Ring composition around standing-water bodies of pool size."""
    body_nodes: Counter = Counter(labels.values())
    body_area = {b: n * NODE_AREA_M2 for b, n in body_nodes.items()}
    pools = {b for b, a in body_area.items() if POOL_MIN_M2 <= a <= POOL_MAX_M2}

    by_pool_ring: dict[int, dict[str, list[Instance]]] = defaultdict(lambda: defaultdict(list))
    aggregate: dict[str, list[Instance]] = defaultdict(list)
    for inst in instances:
        sd = signed_distance(inst, grid, dist)
        if sd is None or sd[1] not in pools:
            continue
        ring = band_of(sd[0], SCENE_RINGS)
        if ring is None:
            continue
        by_pool_ring[sd[1]][ring].append(inst)
        aggregate[ring].append(inst)

    def summarise(group: list[Instance], top: int) -> dict:
        return {
            "instances": len(group),
            "categoryShare": {
                c: round(n / len(group), 3)
                for c, n in Counter(i.category for i in group).most_common(6)
            },
            "topSpecies": [
                (s, n) for s, n in Counter(i.species for i in group).most_common(top)
            ],
        } if group else {"instances": 0}

    ranked = sorted(
        by_pool_ring, key=lambda b: -sum(len(v) for v in by_pool_ring[b].values())
    )
    example_out = []
    for body in ranked[:examples]:
        example_out.append({
            "waterAreaM2": round(body_area[body]),
            "rings": {
                name: summarise(by_pool_ring[body].get(name, []), 6)
                for name, _, _ in SCENE_RINGS
            },
        })
    return {
        "waterBodies": len(body_area),
        "poolCount": len(pools),
        "poolAreaM2": _percentiles([body_area[b] for b in pools]),
        "dressedPools": len(by_pool_ring),
        "aggregateRings": {
            name: summarise(aggregate.get(name, []), 12) for name, _, _ in SCENE_RINGS
        },
        "examplePools": example_out,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--plugin", action="append", required=True)
    ap.add_argument("--names", action="append", default=[],
                    help="extra plugin read only for base-object names")
    ap.add_argument("--world", action="append", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--label", default="")
    args = ap.parse_args()

    plugins = [Plugin(p) for p in args.plugin]
    names = [Plugin(p) for p in args.names]
    instances, macro = collect(plugins, set(args.world), names)
    dressed = {i.cell for i in instances}
    keep = {
        (cx + dx, cy + dy)
        for cx, cy in dressed for dx in (-1, 0, 1) for dy in (-1, 0, 1)
    }
    grid = build_grid(plugins, set(args.world), keep)
    labels = label_water_bodies(grid)
    dist = distance_transform(grid, labels)

    report = {
        "source": {
            "label": args.label or ", ".join(Path(p).name for p in args.plugin),
            "worldspaces": args.world,
            "instances": len(instances),
            "dressedCells": len(dressed),
            "gridNodes": len(grid),
            "floodedNodeFraction": round(
                sum(1 for d in grid.values() if d > 0) / len(grid), 3
            ) if grid else None,
        },
        "speciesWaterRelation": species_water_relation(instances),
        "riparian": riparian_profile(instances, grid, dist, dressed),
        "pools": pool_scenes(instances, grid, labels, dist),
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=1) + "\n")
    print(f"{len(instances)} instances, {len(grid)} nodes -> {out}")


if __name__ == "__main__":
    main()
