"""Mine a shipped worldspace for **placement rules** (module 95 §86.0b).

We never lift another team's authored places (00-core rule 6). We measure what
they did and keep the *statistics*: which species sits on which painted ground,
at what slope, how far above the water table, how densely, how clumped, with
how much size and rotation jitter, and how much clearance it keeps from
buildings. Those numbers become the scatter compiler's defaults (module 65
§111) and the flora-palette starting point (Phase 10, decision 0034).

Usage:
  python3 -m worldgen.mine_placement \\
      --plugin "<vault>/plugins/Black Marsh.esm" \\
      --plugin "<vault>/plugins/Black Marsh North.esp" \\
      --world BlackMarsh --world BlackMarsh2 --world BlackMarshNorth \\
      --out world/sources/placement/bmv-placement-stats.json

Output is a compact JSON summary (committed) — the per-instance table stays in
memory unless --dump-instances is given.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import math
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path

from .asset_taxonomy import classify
from .esp_index import (
    CELL_AREA_M2,
    CELL_SIZE_M,
    UNITS_PER_METRE,
    Plugin,
    dominant_texture_at,
    height_at,
    slope_degrees_at,
)

MIN_INSTANCES = 30
"""Species below this count get counted but not profiled — too few to rule from."""


@dataclass
class Instance:
    species: str
    category: str
    cell: tuple[int, int]
    x: float
    y: float
    z: float
    scale: float
    size_m: tuple[float, float, float] | None
    """Base-object bounds (OBND) times ref scale, in metres."""
    rot_z: float
    tilt_deg: float
    slope_deg: float | None
    above_water_m: float | None
    sink_m: float | None
    """Ref origin relative to the terrain surface: negative = sunk into it."""
    ground_water_depth_m: float | None
    """Water plane minus terrain height at the ref: positive = flooded ground."""
    ground: str | None


def _key(source: str, form_id: int) -> tuple[str, int]:
    return (source.lower(), form_id & 0xFFFFFF)


def _percentiles(values: list[float], points=(5, 25, 50, 75, 95)) -> dict[str, float]:
    if not values:
        return {}
    ordered = sorted(values)
    out = {}
    for p in points:
        i = min(len(ordered) - 1, max(0, int(round((p / 100) * (len(ordered) - 1)))))
        out[f"p{p}"] = round(ordered[i], 3)
    return out


def _nearest_neighbour_metres(points: list[tuple[float, float]], cell_m: float = 12.0):
    """Mean nearest-neighbour distance via a uniform grid hash (metres)."""
    if len(points) < 2:
        return None
    buckets: dict[tuple[int, int], list[tuple[float, float]]] = defaultdict(list)
    for p in points:
        buckets[(int(p[0] // cell_m), int(p[1] // cell_m))].append(p)
    total = 0.0
    counted = 0
    for (bx, by), members in buckets.items():
        neighbourhood: list[tuple[float, float]] = []
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                neighbourhood.extend(buckets.get((bx + dx, by + dy), ()))
        for p in members:
            best = math.inf
            for q in neighbourhood:
                if q is p:
                    continue
                d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2
                if d < best:
                    best = d
            if best is not math.inf:
                total += math.sqrt(best)
                counted += 1
    return (total / counted) if counted else None


def collect(plugins: list[Plugin], world_names: set[str],
            name_sources: list[Plugin] | None = None) -> tuple[list[Instance], dict]:
    """Walk every requested worldspace and build the per-instance table.

    Two separate lookups, deliberately:

    * `bases` — records the **mined** plugins define. Their model path is what
      the world was authored with, so it is safe to call it the species.
    * `aliases` — editor ids contributed by `name_sources`. A retexture mod
      overrides a vanilla record *keeping its form id but replacing its model*,
      so its model is emphatically **not** what the mined world placed; only
      the editor id survives the override and is worth borrowing.
    """
    bases: dict[tuple[str, int], object] = {}
    ltex: dict[tuple[str, int], object] = {}
    aliases: dict[tuple[str, int], str] = {}
    for plugin in plugins:
        for form_id, base in plugin.base_objects().items():
            bases.setdefault(_key(plugin.source_of(form_id), form_id), base)
        for form_id, entry in plugin.landscape_textures().items():
            ltex.setdefault(_key(plugin.source_of(form_id), form_id), entry)
    for plugin in name_sources or []:
        for form_id, base in plugin.base_objects().items():
            if base.editor_id:
                aliases.setdefault(_key(plugin.source_of(form_id), form_id),
                                   base.editor_id)
        for form_id, entry in plugin.landscape_textures().items():
            ltex.setdefault(_key(plugin.source_of(form_id), form_id), entry)

    instances: list[Instance] = []
    cell_totals: Counter = Counter()
    cell_category: dict[tuple[int, int], Counter] = defaultdict(Counter)
    unresolved: Counter = Counter()
    water_missing = 0
    cells_seen = 0

    for plugin in plugins:
        worlds = {
            fid: world for fid, world in plugin.worldspaces().items()
            if world.editor_id in world_names
        }
        if not worlds:
            continue
        for cell in plugin.exterior_cells():
            if cell.world not in worlds:
                continue
            cells_seen += 1
            water = cell.water_height
            if water is None:
                water_missing += 1
            for ref in cell.refs:
                if ref.distant:
                    continue
                source = plugin.source_of(ref.base)
                base = bases.get(_key(source, ref.base))
                if base is None or not base.model:
                    # A reference into a master we do not hold (vanilla
                    # Skyrim/DLC). Keep it — it is a real placed object and its
                    # environment statistics are still evidence; it gains a
                    # mesh the moment the master lands in the vault.
                    alias = aliases.get(_key(source, ref.base))
                    unresolved[
                        f"{source}:{ref.base:08X}" + (f" ({alias})" if alias else "")
                    ] += 1
                    species = (
                        f"edid:{alias}" if alias
                        else f"{source.lower()}#{ref.base & 0xFFFFFF:06X}"
                    )
                    category = "unresolved"
                    size = None
                else:
                    species = base.model_key
                    category = classify(base.model).category
                    size = None
                    if base.bounds:
                        x1, y1, z1, x2, y2, z2 = base.bounds
                        size = tuple(
                            round((b - a) * ref.scale / UNITS_PER_METRE, 3)
                            for a, b in ((x1, x2), (y1, y2), (z1, z2))
                        )
                x, y, z = ref.pos
                slope = ground_id = terrain = None
                if cell.land is not None:
                    slope = slope_degrees_at(cell.land, x, y, cell.grid)
                    terrain = height_at(cell.land, x, y, cell.grid)
                    fid = dominant_texture_at(cell.land, x, y, cell.grid)
                    if fid is not None:
                        entry = ltex.get(_key(plugin.source_of(fid), fid))
                        ground_id = (
                            entry.editor_id if entry and entry.editor_id
                            else f"?{fid:08X}"
                        )
                tilt = math.degrees(math.hypot(ref.rot[0], ref.rot[1]))
                instances.append(Instance(
                    species=species,
                    category=category,
                    cell=cell.grid,
                    x=x / UNITS_PER_METRE,
                    y=y / UNITS_PER_METRE,
                    z=z / UNITS_PER_METRE,
                    scale=ref.scale,
                    size_m=size,
                    rot_z=ref.rot[2] % (2 * math.pi),
                    tilt_deg=tilt,
                    slope_deg=slope,
                    above_water_m=((z - water) / UNITS_PER_METRE) if water is not None else None,
                    sink_m=((z - terrain) / UNITS_PER_METRE) if terrain is not None else None,
                    ground_water_depth_m=(
                        (water - terrain) / UNITS_PER_METRE
                        if terrain is not None and water is not None else None
                    ),
                    ground=ground_id,
                ))
                cell_totals[cell.grid] += 1
                cell_category[cell.grid][category] += 1

    macro = {
        "cellsWalked": cells_seen,
        "cellsWithRefs": len(cell_totals),
        "cellAreaM2": round(CELL_AREA_M2, 1),
        "cellsMissingWaterHeight": water_missing,
        "unresolvedBaseRefs": sum(unresolved.values()),
        "unresolvedDistinctBases": len(unresolved),
        "topUnresolved": unresolved.most_common(20),
        "refsPerCell": _percentiles([float(v) for v in cell_totals.values()]),
        "refsPerHectare": _percentiles(
            [v / (CELL_AREA_M2 / 10_000) for v in cell_totals.values()]
        ),
    }
    per_category_cell = defaultdict(list)
    for grid, counter in cell_category.items():
        for category, n in counter.items():
            per_category_cell[category].append(n / (CELL_AREA_M2 / 10_000))
    macro["perHectareByCategory"] = {
        c: {"cells": len(v), **_percentiles(v)}
        for c, v in sorted(per_category_cell.items(), key=lambda kv: -len(kv[1]))
    }
    return instances, macro


def _clumps(points: list[tuple[float, float]], link_m: float) -> dict:
    """Single-link clustering at `link_m`, reported as compiler parameters.

    A jittered grid cannot reproduce hand placement (see the Clark-Evans
    numbers) — clustered scatter needs a clump count, a member count and a
    radius, which is what this returns.
    """
    if len(points) < 3 or link_m <= 0:
        return {}
    buckets: dict[tuple[int, int], list[int]] = defaultdict(list)
    for i, p in enumerate(points):
        buckets[(int(p[0] // link_m), int(p[1] // link_m))].append(i)
    parent = list(range(len(points)))

    def find(a: int) -> int:
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    link2 = link_m * link_m
    for (bx, by), members in buckets.items():
        neighbourhood: list[int] = []
        for dx in (0, 1):
            for dy in (-1, 0, 1):
                if dx == 0 and dy == -1:
                    continue
                neighbourhood.extend(buckets.get((bx + dx, by + dy), ()))
        for i in members:
            for j in neighbourhood:
                if j <= i:
                    continue
                px, py = points[i]
                qx, qy = points[j]
                if (px - qx) ** 2 + (py - qy) ** 2 <= link2:
                    ra, rb = find(i), find(j)
                    if ra != rb:
                        parent[ra] = rb
    groups: dict[int, list[int]] = defaultdict(list)
    for i in range(len(points)):
        groups[find(i)].append(i)
    sizes = [len(g) for g in groups.values()]
    radii = []
    for g in groups.values():
        if len(g) < 3:
            continue
        cx = sum(points[i][0] for i in g) / len(g)
        cy = sum(points[i][1] for i in g) / len(g)
        radii.append(max(math.hypot(points[i][0] - cx, points[i][1] - cy) for i in g))
    clumped = sum(s for s in sizes if s >= 3)
    # Size-weighted: the clump the *typical instance* belongs to, which is the
    # number a compiler needs (most clumps are singletons; most plants are not).
    weighted = sorted(s for size in sizes for s in [size] * size)
    return {
        "linkDistanceM": round(link_m, 2),
        "clumps": len(sizes),
        "clumpSize": _percentiles([float(s) for s in sizes]),
        "clumpSizeForTypicalInstance": _percentiles([float(s) for s in weighted]),
        "clumpRadiusM": _percentiles(radii) if radii else {},
        "fractionInClumps": round(clumped / len(points), 3),
    }


def profile(instances: list[Instance]) -> dict:
    """Per-species placement profile: the rules we actually want."""
    by_species: dict[str, list[Instance]] = defaultdict(list)
    for inst in instances:
        by_species[inst.species].append(inst)

    architecture = [
        (i.x, i.y) for i in instances
        if i.category in {"architecture", "ruin", "dungeon-kit", "bridge", "dock"}
    ]
    arch_buckets: dict[tuple[int, int], list[tuple[float, float]]] = defaultdict(list)
    for p in architecture:
        arch_buckets[(int(p[0] // 32), int(p[1] // 32))].append(p)

    def clearance(inst: Instance) -> float | None:
        bx, by = int(inst.x // 32), int(inst.y // 32)
        best = math.inf
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for q in arch_buckets.get((bx + dx, by + dy), ()):
                    d = (inst.x - q[0]) ** 2 + (inst.y - q[1]) ** 2
                    if d < best:
                        best = d
        return math.sqrt(best) if best is not math.inf else None

    out: dict[str, dict] = {}
    for species, group in sorted(by_species.items(), key=lambda kv: -len(kv[1])):
        if len(group) < MIN_INSTANCES:
            continue
        cells = {i.cell for i in group}
        occupied_area_ha = len(cells) * CELL_AREA_M2 / 10_000
        points = [(i.x, i.y) for i in group]
        mean_nn = _nearest_neighbour_metres(points)
        density_per_m2 = len(group) / (len(cells) * CELL_AREA_M2)
        expected_nn = 0.5 / math.sqrt(density_per_m2) if density_per_m2 > 0 else None
        ground = Counter(i.ground for i in group if i.ground)
        stride = max(1, len(group) // 400)
        clearances = [c for c in (clearance(i) for i in group[::stride]) if c is not None]
        in_water = [i for i in group if i.above_water_m is not None and i.above_water_m < 0]

        out[species] = {
            "category": group[0].category,
            "count": len(group),
            "cells": len(cells),
            "perHectareWhereFound": round(len(group) / occupied_area_ha, 2),
            "slopeDeg": _percentiles([i.slope_deg for i in group if i.slope_deg is not None]),
            "aboveWaterM": _percentiles(
                [i.above_water_m for i in group if i.above_water_m is not None]
            ),
            "sinkM": _percentiles([i.sink_m for i in group if i.sink_m is not None]),
            "groundWaterDepthM": _percentiles(
                [i.ground_water_depth_m for i in group if i.ground_water_depth_m is not None]
            ),
            "floodedGroundFraction": round(
                sum(
                    1 for i in group
                    if i.ground_water_depth_m is not None and i.ground_water_depth_m > 0
                ) / len(group), 3,
            ),
            "submergedFraction": round(len(in_water) / len(group), 3),
            "scale": _percentiles([i.scale for i in group]),
            "heightM": _percentiles([i.size_m[2] for i in group if i.size_m]),
            "widthM": _percentiles([max(i.size_m[0], i.size_m[1]) for i in group if i.size_m]),
            "tiltDeg": _percentiles([i.tilt_deg for i in group]),
            "rotationZUniformity": round(_rotation_uniformity(group), 3),
            "meanNearestNeighbourM": round(mean_nn, 2) if mean_nn else None,
            "clarkEvansR": (
                round(mean_nn / expected_nn, 3) if mean_nn and expected_nn else None
            ),
            "clumping": _clumps(points, (mean_nn or 0) * 2.0),
            "groundTop": ground.most_common(4),
            "clearanceToBuiltM": _percentiles(clearances) if clearances else {},
        }
    return out


def _rotation_uniformity(group: list[Instance]) -> float:
    """0 = every instance faces the same way, 1 = perfectly uniform yaw."""
    bins = [0] * 12
    for inst in group:
        bins[min(11, int(inst.rot_z / (2 * math.pi) * 12))] += 1
    n = len(group)
    entropy = -sum((b / n) * math.log(b / n) for b in bins if b)
    return entropy / math.log(12)


def variation(instances: list[Instance], sample_points: int = 4000) -> dict:
    """How much density varies *within* a dressed area, and at what scale.

    The owner's density brief (2026-08-30) is that thickness must vary by
    local geography and inside a single area, "so it's not all just samey".
    That needs two numbers the overall density cannot give: how strongly
    neighbouring ground differs, and over what distance the difference plays
    out. Both are measurable in the source.
    """
    by_cell: Counter = Counter()
    for inst in instances:
        by_cell[inst.cell] += 1
    if len(by_cell) < 20:
        return {}
    counts = list(by_cell.values())
    mean = sum(counts) / len(counts)
    spread = (sum((c - mean) ** 2 for c in counts) / len(counts)) ** 0.5

    # Density autocorrelation against cell-grid lag: how far apart two places
    # have to be before their thickness stops being related.
    correlations = {}
    for lag in (1, 2, 3, 4, 6, 8, 12):
        pairs = [
            (by_cell[c], by_cell.get((c[0] + lag, c[1]), 0))
            for c in by_cell
            if (c[0] + lag, c[1]) in by_cell
        ]
        if len(pairs) < 30:
            continue
        ax = sum(p[0] for p in pairs) / len(pairs)
        ay = sum(p[1] for p in pairs) / len(pairs)
        num = sum((p[0] - ax) * (p[1] - ay) for p in pairs)
        dx = sum((p[0] - ax) ** 2 for p in pairs) ** 0.5
        dy = sum((p[1] - ay) ** 2 for p in pairs) ** 0.5
        if dx > 0 and dy > 0:
            correlations[f"{round(lag * CELL_SIZE_M)}m"] = round(num / (dx * dy), 3)

    # Open-space radii: how big the gaps between plants are, which is what a
    # player actually experiences as "a clearing".
    from math import hypot
    cell_m = 12.0
    buckets: dict[tuple[int, int], list[tuple[float, float]]] = defaultdict(list)
    for inst in instances:
        buckets[(int(inst.x // cell_m), int(inst.z // cell_m))].append((inst.x, inst.z))
    dressed = sorted(by_cell, key=lambda c: -by_cell[c])[: max(1, len(by_cell) // 4)]
    gaps = []
    stride = max(1, len(dressed) * 16 // sample_points)
    for index, (cx, cz) in enumerate(dressed):
        if index % stride:
            continue
        for k in range(16):
            px = (cx + (k % 4 + 0.5) / 4) * CELL_SIZE_M
            pz = (cz + (k // 4 + 0.5) / 4) * CELL_SIZE_M
            bx, bz = int(px // cell_m), int(pz // cell_m)
            best = math.inf
            for ix in (-2, -1, 0, 1, 2):
                for iz in (-2, -1, 0, 1, 2):
                    for qx, qz in buckets.get((bx + ix, bz + iz), ()):
                        best = min(best, hypot(px - qx, pz - qz))
            if best is not math.inf:
                gaps.append(best)

    return {
        "perCellCount": {"mean": round(mean, 1), "sd": round(spread, 1),
                         "coefficientOfVariation": round(spread / mean, 3)},
        "densityCorrelationByDistance": correlations,
        "openSpaceRadiusM": _percentiles(gaps) if gaps else {},
    }


def composition(instances: list[Instance]) -> dict:
    """How concentrated the look is: does a place read from 5 species or 50?"""
    counts = Counter(i.species for i in instances)
    total = sum(counts.values())
    ordered = [n for _, n in counts.most_common()]
    cumulative = {}
    running = 0
    for i, n in enumerate(ordered, start=1):
        running += n
        if i in (1, 3, 5, 10, 20, 50, 100):
            cumulative[f"top{i}"] = round(running / total, 3)
    per_cell: dict[tuple[int, int], set[str]] = defaultdict(set)
    for inst in instances:
        per_cell[inst.cell].add(inst.species)
    return {
        "distinctSpecies": len(counts),
        "cumulativeShare": cumulative,
        "speciesPerDressedCell": _percentiles([float(len(v)) for v in per_cell.values()]),
        "categoryShare": {
            c: round(n / total, 3)
            for c, n in Counter(i.category for i in instances).most_common()
        },
    }


#: Water-table bands, in metres of standing water over the ground (negative =
#: dry ground that far above the water plane). Chosen to line up with our own
#: hydrology fields (module 50): open water, shallows, waterline, damp, dry.
DEPTH_BANDS = (
    ("deep>2m", 2.0, 99.0),
    ("shallow 0.5-2m", 0.5, 2.0),
    ("waterline 0-0.5m", 0.0, 0.5),
    ("damp 0-0.5m above", -0.5, 0.0),
    ("dry 0.5-2m above", -2.0, -0.5),
    ("high >2m above", -99.0, -2.0),
)

SLOPE_BANDS = ((0, 5), (5, 15), (15, 30), (30, 45), (45, 90))


def bands(instances: list[Instance], top: int = 14) -> dict:
    """Species mix per water-depth and per slope band.

    This is the artefact the flora palettes are authored from: our own wetness
    and slope rasters index the same axes, so a mined mix transfers directly
    without importing anyone's map.
    """
    depth: dict[str, list[Instance]] = {name: [] for name, _, _ in DEPTH_BANDS}
    for inst in instances:
        d = inst.ground_water_depth_m
        if d is None:
            continue
        for name, lo, hi in DEPTH_BANDS:
            if lo <= d < hi:
                depth[name].append(inst)
                break
    slope: dict[str, list[Instance]] = {f"{lo}-{hi}deg": [] for lo, hi in SLOPE_BANDS}
    for inst in instances:
        if inst.slope_deg is None:
            continue
        for lo, hi in SLOPE_BANDS:
            if lo <= inst.slope_deg < hi:
                slope[f"{lo}-{hi}deg"].append(inst)
                break

    def summarise(group: list[Instance]) -> dict:
        if not group:
            return {"instances": 0}
        counts = Counter(i.species for i in group)
        cells = {i.cell for i in group}
        return {
            "instances": len(group),
            "cells": len(cells),
            "perHectareWhereFound": round(
                len(group) / (len(cells) * CELL_AREA_M2 / 10_000), 2
            ),
            "categoryShare": {
                c: round(n / len(group), 3)
                for c, n in Counter(i.category for i in group).most_common(8)
            },
            "topSpecies": [
                (s, n, round(n / len(group), 4)) for s, n in counts.most_common(top)
            ],
        }

    return {
        "byWaterDepth": {k: summarise(v) for k, v in depth.items()},
        "bySlope": {k: summarise(v) for k, v in slope.items()},
    }


MIN_ASSOCIATION_SUPPORT = 15
"""Cells a species must appear in before it can be called anyone's companion."""


def associations(instances: list[Instance], top: int = 12) -> dict:
    """Which species share a cell more often than chance — palette guilds.

    Scored by **lift** (observed co-occurrence over the independent
    expectation) with a support floor: without the floor the ranking fills up
    with one-cell curiosities that trivially co-occur with everything.
    """
    by_cell: dict[tuple[int, int], set[str]] = defaultdict(set)
    for inst in instances:
        by_cell[inst.cell].add(inst.species)
    total_cells = len(by_cell)
    presence: Counter = Counter()
    for members in by_cell.values():
        presence.update(members)
    eligible = {s for s, n in presence.items() if n >= MIN_ASSOCIATION_SUPPORT}
    pair: Counter = Counter()
    for members in by_cell.values():
        ordered = sorted(members & eligible)
        for i, a in enumerate(ordered):
            for b in ordered[i + 1:]:
                pair[(a, b)] += 1

    ranked = Counter(i.species for i in instances)
    out: dict[str, list] = {}
    for species, _ in ranked.most_common(60):
        if species not in eligible:
            continue
        partners = []
        for (a, b), n in pair.items():
            if species not in (a, b):
                continue
            other = b if a == species else a
            expected = presence[a] * presence[b] / total_cells
            partners.append((other, n, round(n / expected, 2) if expected else None))
        partners.sort(key=lambda t: (-(t[2] or 0), -t[1]))
        out[species] = partners[:top]
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--plugin", action="append", required=True)
    ap.add_argument(
        "--names", action="append", default=[],
        help="extra plugin read only for base-object/LTEX names (overrides of "
             "vanilla records resolve references we would otherwise lose)",
    )
    ap.add_argument("--world", action="append", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--label", default="")
    ap.add_argument("--dump-instances", default=None)
    args = ap.parse_args()

    plugins = [Plugin(p) for p in args.plugin]
    names = [Plugin(p) for p in args.names]
    instances, macro = collect(plugins, set(args.world), names)
    report = {
        "source": {
            "label": args.label or ", ".join(Path(p).name for p in args.plugin),
            "method": (
                "worldgen.mine_placement — every placed reference measured against the "
                "terrain, water table and painted ground under it (module 95 §86.0b)"
            ),
            "date": dt.date.today().isoformat(),
            "plugins": [Path(p).name for p in args.plugin],
            "worldspaces": args.world,
            "instances": len(instances),
        },
        "macro": macro,
        "composition": composition(instances),
        "variation": variation(instances),
        "bands": bands(instances),
        "species": profile(instances),
        "associations": associations(instances),
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=1) + "\n")
    print(f"{len(instances)} instances -> {out}")

    if args.dump_instances:
        with Path(args.dump_instances).open("w") as fh:
            for inst in instances:
                fh.write(json.dumps(inst.__dict__, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    main()
