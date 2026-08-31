"""Mine shipped worldspaces for **settlement form** (Phase 11 input).

`mine_placement.py` mines the scatter between places; this mines the places:
how many buildings a settlement holds, how far apart they stand, whether they
share an orientation, and how they sit relative to water and to the road
network. Statistics only — we never lift anyone's town (00-core rule 6).

Method:

1. Walk exterior cells; keep every reference whose mesh classifies as
   `architecture` (plus `dock`/`bridge`, kept separately as waterfront and
   crossing evidence). Vanilla-master references resolve when Skyrim.esm is
   passed via `--names`.
2. Single-link cluster buildings at `--link` metres. A cluster with at least
   `--min-buildings` members is a settlement.
3. Per settlement: building count, nearest-neighbour spacing, radius, plan
   density, and orientation coherence — the share of buildings whose yaw sits
   within 10 degrees of the settlement's modal yaw, modulo 90 degrees (a
   building rotated a quarter turn still shares the street grid).
4. Water: each exterior cell's LAND grid is sampled and any vertex below the
   cell water height is a water sample. Per building we report distance to the
   nearest water sample and the angle between its facing and the bearing to
   that water — i.e. do buildings turn to face the water or turn their backs.
   Resolution is the LAND vertex spacing (~1.8 m), so distances under ~2 m are
   "on the waterline" rather than exact.
5. Roads: road evidence is taken from references whose mesh classifies with a
   `road` tag or as a `bridge`, and from road-painted landscape textures where
   the source paints them. Per building: distance to the nearest road sample
   and the angle between its facing and the local road tangent (PCA over road
   samples within `--road-window` metres).

Usage:
  python3 -m worldgen.mine_settlements \\
      --plugin "<bmv>/Black Marsh.esm" --plugin "<bmv>/Black Marsh North.esp" \\
      --names "<vault>/skyrim-source/Data/Skyrim.esm" \\
      --world BlackMarsh --world BlackMarsh2 --world BlackMarshNorth \\
      --out world/sources/placement/bmv-settlement-form.json
"""

from __future__ import annotations

import argparse
import json
import math
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path

from .asset_taxonomy import classify
from .esp_index import (
    CELL_SIZE_UNITS,
    LAND_DIM,
    UNITS_PER_METRE,
    Plugin,
)

LAND_SAMPLE_STRIDE = 4
"""Sample every Nth LAND vertex (33x33 per cell) — 4 gives ~7 m spacing."""

ROAD_TEXTURE_HINTS = ("road", "path", "cobble")


@dataclass
class Building:
    species: str
    kit: str
    x: float          # metres
    y: float
    z: float
    yaw_deg: float
    size_m: tuple[float, float, float] | None


def _pct(values, points=(5, 25, 50, 75, 95)) -> dict:
    vals = [v for v in values if v is not None]
    if not vals:
        return {}
    ordered = sorted(vals)
    return {
        f"p{p}": round(ordered[min(len(ordered) - 1,
                                   max(0, int(round((p / 100) * (len(ordered) - 1)))))], 2)
        for p in points
    }


def _kit(model_key: str) -> str:
    parts = [p for p in model_key.split("/") if p not in ("meshes", "mesh")]
    return "/".join(parts[:2]) if len(parts) > 2 else (parts[0] if parts else "?")


class Grid:
    """Uniform point hash for nearest-sample queries, in metres."""

    def __init__(self, points: list[tuple[float, float]], cell: float = 32.0):
        self.cell = cell
        self.buckets: dict[tuple[int, int], list[tuple[float, float]]] = defaultdict(list)
        for p in points:
            self.buckets[(int(p[0] // cell), int(p[1] // cell))].append(p)

    def nearest(self, x: float, y: float, rings: int = 6):
        bx, by = int(x // self.cell), int(y // self.cell)
        for r in range(rings):
            best, best_d = None, math.inf
            for dx in range(-r, r + 1):
                for dy in range(-r, r + 1):
                    if r and max(abs(dx), abs(dy)) != r:
                        continue
                    for q in self.buckets.get((bx + dx, by + dy), ()):
                        d = (x - q[0]) ** 2 + (y - q[1]) ** 2
                        if d < best_d:
                            best_d, best = d, q
            if best is not None and math.sqrt(best_d) <= (r + 1) * self.cell:
                return best, math.sqrt(best_d)
        return None, None

    def within(self, x: float, y: float, radius: float):
        bx, by = int(x // self.cell), int(y // self.cell)
        span = int(radius // self.cell) + 1
        out = []
        for dx in range(-span, span + 1):
            for dy in range(-span, span + 1):
                for q in self.buckets.get((bx + dx, by + dy), ()):
                    if (x - q[0]) ** 2 + (y - q[1]) ** 2 <= radius * radius:
                        out.append(q)
        return out


def collect(plugins: list[Plugin], worlds: set[str], name_sources: list[Plugin]):
    """Buildings, water samples and road samples for the requested worldspaces."""
    bases: dict[tuple[str, int], object] = {}
    ltex: dict[tuple[str, int], object] = {}
    for plugin in plugins + name_sources:
        for form_id, base in plugin.base_objects().items():
            if base.model:
                bases.setdefault(
                    (plugin.source_of(form_id).lower(), form_id & 0xFFFFFF), base)
        for form_id, entry in plugin.landscape_textures().items():
            ltex.setdefault(
                (plugin.source_of(form_id).lower(), form_id & 0xFFFFFF), entry)

    buildings: list[Building] = []
    water: list[tuple[float, float]] = []
    roads: list[tuple[float, float]] = []
    docks: list[tuple[float, float]] = []
    cells_seen = 0
    road_from_texture = 0
    unresolved = 0

    for plugin in plugins:
        wanted = {fid for fid, w in plugin.worldspaces().items()
                  if w.editor_id in worlds}
        if not wanted:
            continue
        for cell in plugin.exterior_cells():
            if cell.world not in wanted:
                continue
            cells_seen += 1
            # -- water samples from the LAND grid --
            if cell.land is not None and cell.land.heights and cell.water_height is not None:
                step = CELL_SIZE_UNITS / (LAND_DIM - 1)
                for r in range(0, LAND_DIM, LAND_SAMPLE_STRIDE):
                    for c in range(0, LAND_DIM, LAND_SAMPLE_STRIDE):
                        if cell.land.heights[r][c] < cell.water_height:
                            water.append((
                                (cell.grid[0] * CELL_SIZE_UNITS + c * step) / UNITS_PER_METRE,
                                (cell.grid[1] * CELL_SIZE_UNITS + r * step) / UNITS_PER_METRE,
                            ))
            # -- road-painted ground, where the source paints it --
            if cell.land is not None:
                painted = set(cell.land.base_texture.values())
                painted.update(fid for _, fid, _ in cell.land.layers)
                for fid in painted:
                    entry = ltex.get((plugin.source_of(fid).lower(), fid & 0xFFFFFF))
                    name = (entry.editor_id or "").lower() if entry else ""
                    if any(h in name for h in ROAD_TEXTURE_HINTS):
                        road_from_texture += 1
                        roads.append((
                            (cell.grid[0] + 0.5) * CELL_SIZE_UNITS / UNITS_PER_METRE,
                            (cell.grid[1] + 0.5) * CELL_SIZE_UNITS / UNITS_PER_METRE,
                        ))
                        break
            for ref in cell.refs:
                if ref.distant:
                    continue
                base = bases.get((plugin.source_of(ref.base).lower(), ref.base & 0xFFFFFF))
                if base is None or not base.model:
                    unresolved += 1
                    continue
                cls = classify(base.model)
                x = ref.pos[0] / UNITS_PER_METRE
                y = ref.pos[1] / UNITS_PER_METRE
                if cls.category == "architecture":
                    size = None
                    if base.bounds:
                        x1, y1, z1, x2, y2, z2 = base.bounds
                        size = tuple(round((b - a) * ref.scale / UNITS_PER_METRE, 2)
                                     for a, b in ((x1, x2), (y1, y2), (z1, z2)))
                    buildings.append(Building(
                        species=base.model_key, kit=_kit(base.model_key),
                        x=x, y=y, z=ref.pos[2] / UNITS_PER_METRE,
                        yaw_deg=math.degrees(ref.rot[2]) % 360, size_m=size,
                    ))
                elif cls.category == "bridge" or "road" in cls.tags:
                    roads.append((x, y))
                elif cls.category == "dock":
                    docks.append((x, y))

    macro = {
        "cellsWalked": cells_seen,
        "buildingRefs": len(buildings),
        "waterSamples": len(water),
        "roadSamples": len(roads),
        "roadSamplesFromPaintedGround": road_from_texture,
        "dockRefs": len(docks),
        "unresolvedRefs": unresolved,
        "landSampleSpacingM": round(
            CELL_SIZE_UNITS / (LAND_DIM - 1) * LAND_SAMPLE_STRIDE / UNITS_PER_METRE, 2),
    }
    return buildings, water, roads, docks, macro


def cluster(buildings: list[Building], link_m: float) -> list[list[int]]:
    buckets: dict[tuple[int, int], list[int]] = defaultdict(list)
    for i, b in enumerate(buildings):
        buckets[(int(b.x // link_m), int(b.y // link_m))].append(i)
    parent = list(range(len(buildings)))

    def find(a: int) -> int:
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    link2 = link_m * link_m
    for (bx, by), members in buckets.items():
        near: list[int] = []
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                near.extend(buckets.get((bx + dx, by + dy), ()))
        for i in members:
            for j in near:
                if j <= i:
                    continue
                if ((buildings[i].x - buildings[j].x) ** 2
                        + (buildings[i].y - buildings[j].y) ** 2) <= link2:
                    ra, rb = find(i), find(j)
                    if ra != rb:
                        parent[ra] = rb
    groups: dict[int, list[int]] = defaultdict(list)
    for i in range(len(buildings)):
        groups[find(i)].append(i)
    return list(groups.values())


def _angle_diff_mod90(a: float, b: float) -> float:
    d = abs(a - b) % 90.0
    return min(d, 90.0 - d)


def _principal_axis_deg(points: list[tuple[float, float]]) -> float | None:
    if len(points) < 3:
        return None
    cx = sum(p[0] for p in points) / len(points)
    cy = sum(p[1] for p in points) / len(points)
    sxx = sum((p[0] - cx) ** 2 for p in points)
    syy = sum((p[1] - cy) ** 2 for p in points)
    sxy = sum((p[0] - cx) * (p[1] - cy) for p in points)
    if abs(sxy) < 1e-9 and abs(sxx - syy) < 1e-9:
        return None
    return math.degrees(0.5 * math.atan2(2 * sxy, sxx - syy)) % 180.0


@dataclass
class Structure:
    """One building: a tight cluster of architecture pieces.

    Mod and vanilla towns are assembled from modular architecture kits, so a
    raw `architecture` reference is a wall segment as often as it is a house.
    Clustering at a few metres first is what makes "buildings per settlement"
    and "building spacing" mean what Phase 11 needs them to mean.
    """

    x: float
    y: float
    pieces: int
    yaw_deg: float
    kit: str
    long_m: float
    height_m: float


def structures(buildings: list[Building], link_m: float) -> list[Structure]:
    out = []
    for g in cluster(buildings, link_m):
        members = [buildings[i] for i in g]
        cx = sum(b.x for b in members) / len(members)
        cy = sum(b.y for b in members) / len(members)
        span = 2 * max(math.hypot(b.x - cx, b.y - cy) for b in members)
        biggest = max(members, key=lambda b: (b.size_m[2] if b.size_m else 0))
        long_m = max(
            span,
            max((max(b.size_m[0], b.size_m[1]) for b in members if b.size_m), default=0.0),
        )
        out.append(Structure(
            x=cx, y=cy, pieces=len(members),
            yaw_deg=biggest.yaw_deg,
            kit=Counter(b.kit for b in members).most_common(1)[0][0],
            long_m=round(long_m, 2),
            height_m=round(biggest.size_m[2], 2) if biggest.size_m else 0.0,
        ))
    return out


def analyse(buildings, water, roads, docks, link_m: float, min_buildings: int,
            road_window: float) -> dict:
    water_grid = Grid(water)
    road_grid = Grid(roads)
    dock_grid = Grid(docks)
    groups = [g for g in cluster(buildings, link_m) if len(g) >= min_buildings]

    settlements = []
    spacings_all: list[float] = []
    water_d_all: list[float] = []
    water_facing_all: list[float] = []
    road_d_all: list[float] = []
    road_align_all: list[float] = []
    coherence_all: list[float] = []

    for g in sorted(groups, key=len, reverse=True):
        members = [buildings[i] for i in g]
        cx = sum(b.x for b in members) / len(members)
        cy = sum(b.y for b in members) / len(members)
        radius = max(math.hypot(b.x - cx, b.y - cy) for b in members)
        # nearest-neighbour spacing between buildings
        spacings = []
        for i, b in enumerate(members):
            best = min((math.hypot(b.x - o.x, b.y - o.y)
                        for j, o in enumerate(members) if j != i), default=None)
            if best is not None:
                spacings.append(best)
        spacings_all.extend(spacings)
        # orientation coherence: modal yaw mod 90, share within 10 degrees
        yaw_bins = Counter(round((b.yaw_deg % 90) / 5) * 5 for b in members)
        modal = yaw_bins.most_common(1)[0][0]
        coherent = sum(1 for b in members
                       if _angle_diff_mod90(b.yaw_deg, modal) <= 10) / len(members)
        coherence_all.append(coherent)

        w_d, w_face, r_d, r_align = [], [], [], []
        for b in members:
            q, d = water_grid.nearest(b.x, b.y)
            if q is not None:
                w_d.append(d)
                bearing = math.degrees(math.atan2(q[1] - b.y, q[0] - b.x)) % 360
                w_face.append(_angle_diff_mod90(b.yaw_deg, bearing))
            q, d = road_grid.nearest(b.x, b.y)
            if q is not None:
                r_d.append(d)
                axis = _principal_axis_deg(road_grid.within(b.x, b.y, road_window))
                if axis is not None:
                    r_align.append(_angle_diff_mod90(b.yaw_deg, axis))
        water_d_all.extend(w_d)
        water_facing_all.extend(w_face)
        road_d_all.extend(r_d)
        road_align_all.extend(r_align)
        _, dock_d = dock_grid.nearest(cx, cy)

        plan_axis = _principal_axis_deg([(b.x, b.y) for b in members])
        settlements.append({
            "buildings": len(members),
            "centreM": [round(cx, 1), round(cy, 1)],
            "radiusM": round(radius, 1),
            "buildingsPerHectare": round(
                len(members) / max(0.01, math.pi * radius * radius / 10_000), 2),
            "spacingM": _pct(spacings),
            "orientationCoherence": round(coherent, 3),
            "planAxisDeg": round(plan_axis, 1) if plan_axis is not None else None,
            "kits": Counter(b.kit for b in members).most_common(3),
            "medianWaterDistanceM": round(sorted(w_d)[len(w_d) // 2], 1) if w_d else None,
            "medianRoadDistanceM": round(sorted(r_d)[len(r_d) // 2], 1) if r_d else None,
            "nearestDockM": round(dock_d, 1) if dock_d is not None else None,
        })

    sizes = [s["buildings"] for s in settlements]
    return {
        "settlementCount": len(settlements),
        "linkDistanceM": link_m,
        "minBuildings": min_buildings,
        "buildingsPerSettlement": _pct([float(s) for s in sizes]),
        "sizeHistogram": {
            "4-6": sum(1 for s in sizes if s < 7),
            "7-12": sum(1 for s in sizes if 7 <= s < 13),
            "13-25": sum(1 for s in sizes if 13 <= s < 26),
            "26-60": sum(1 for s in sizes if 26 <= s < 61),
            "61+": sum(1 for s in sizes if s >= 61),
        },
        "buildingSpacingM": _pct(spacings_all),
        "settlementRadiusM": _pct([s["radiusM"] for s in settlements]),
        "buildingsPerHectare": _pct([s["buildingsPerHectare"] for s in settlements]),
        "orientationCoherence": _pct(coherence_all),
        "waterDistanceM": _pct(water_d_all),
        "facingVsWaterBearingDeg": _pct(water_facing_all),
        "roadDistanceM": _pct(road_d_all),
        "facingVsRoadAxisDeg": _pct(road_align_all),
        "settlements": settlements[:60],
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--plugin", action="append", required=True)
    ap.add_argument("--names", action="append", default=[])
    ap.add_argument("--world", action="append", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--label", default="")
    ap.add_argument("--link", type=float, default=45.0,
                    help="settlement link distance between buildings, metres")
    ap.add_argument("--structure-link", type=float, default=8.0,
                    help="link distance that fuses kit pieces into one building")
    ap.add_argument("--min-buildings", type=int, default=4)
    ap.add_argument("--road-window", type=float, default=40.0)
    ap.add_argument("--date", default="2026-08-31")
    args = ap.parse_args()

    plugins = [Plugin(p) for p in args.plugin]
    names = [Plugin(p) for p in args.names]
    buildings, water, roads, docks, macro = collect(plugins, set(args.world), names)
    built = structures(buildings, args.structure_link)
    macro["buildings"] = len(built)
    macro["structureLinkM"] = args.structure_link
    report = {
        "source": {
            "label": args.label or ", ".join(Path(p).name for p in args.plugin),
            "plugins": [Path(p).name for p in args.plugin],
            "nameSources": [Path(p).name for p in args.names],
            "worldspaces": args.world,
            "method": "worldgen.mine_settlements — architecture refs single-link "
                      "clustered; water from LAND vertices below the cell water "
                      "height; roads from road/bridge refs and road-painted "
                      "ground. Statistics only, no authored layouts.",
            "date": args.date,
        },
        "macro": macro,
        "form": analyse(built, water, roads, docks,
                        args.link, args.min_buildings, args.road_window),
        "buildingKits": Counter(b.kit for b in built).most_common(20),
        "kitPiecesPerBuilding": _pct([float(s.pieces) for s in built]),
        "buildingPlanLongM": _pct([s.long_m for s in built]),
        "buildingHeightM": _pct([s.height_m for s in built]),
        "pieceFootprintM": {
            "long": _pct([max(b.size_m[0], b.size_m[1]) for b in buildings if b.size_m]),
            "short": _pct([min(b.size_m[0], b.size_m[1]) for b in buildings if b.size_m]),
            "height": _pct([b.size_m[2] for b in buildings if b.size_m]),
        },
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=1) + "\n")
    print(f"{len(built)} buildings, {report['form']['settlementCount']} "
          f"settlements -> {out}")


if __name__ == "__main__":
    main()
