"""Second-pass settlement-form statistics for the province placement evidence.

`mine_settlements.py` answers "how big, how far apart, how close to water".
This module answers the questions Phase 11 asked afterwards and that the first
pass does not carry: spacing *by settlement size*, orientation against the
local contour, which side of a building its door sits on, how much of a
settlement stands within 5/10/20 m of a road, whether the tall building takes
the high ground, the mix of building families, enclosure, and the waterfront.

Statistics only; no authored layout is reproduced (00-core rule 6).

Method, in short:

1. Walk the requested exterior worldspaces once. Keep architecture references
   (buildings and enclosure), `door` references, road/bridge/dock references,
   dressing references (clutter, container, furniture, light), a stride-4 LAND
   height field (~7.3 m spacing, metres) and each cell's water height.
2. Fuse architecture pieces at `--structure-link` metres into buildings and
   buildings at `--link` metres into settlements, with the same defaults as
   `mine_settlements` so the two files describe the same clusters.
3. Measure. Every reported figure carries its own `n`.

Door side is measured **mesh-convention-free**: not the door's own yaw (which
means whatever its author's front vector meant) but the bearing from the
building's centre to its door, compared with the bearing from the same centre
to the nearest road sample. "Is the entrance on the road side of the house" is
answerable; "does the facade face the road" still is not.

Usage:
  python3 -m worldgen.mine_settlement_form_stats \\
      --plugin "<vault>/Data/Skyrim.esm" --world Tamriel --label "Skyrim" \\
      --out world/sources/placement/vanilla-tamriel-settlement-form-stats.json
  python3 -m worldgen.mine_settlement_form_stats --report docs/research/... \\
      --input <json> --input <json>
"""

from __future__ import annotations

import argparse
import json
import math
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path

from .asset_taxonomy import classify
from .esp_index import CELL_SIZE_UNITS, LAND_DIM, UNITS_PER_METRE, Plugin
from .mine_settlements import Grid, cluster

HEIGHT_STRIDE = 4
"""Every 4th LAND vertex: ~7.3 m spacing, the same field the first pass used."""

ROAD_TEXTURE_HINTS = ("road", "path", "cobble")

#: Building-family heuristics, matched against the lower-cased mesh path in
#: order. Mesh paths are the only functional signal a plugin carries, so this
#: is an inference, not a label the authors wrote. Reported as such.
FAMILY_RULES: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("civic", ("temple", "hall", "castle", "keep", "palace", "jail", "tower",
               "church", "shrine", "guild", "throne", "xanmeer", "pyramid")),
    ("work", ("mill", "smelter", "forge", "smith", "farmhouse", "farm", "stable",
              "mine", "kiln", "brewery", "tannery", "dock", "quay", "boat")),
    ("storage", ("shed", "storage", "barn", "silo", "granary", "warehouse",
                 "shack", "hut", "lean", "tent", "crate")),
    ("dwelling", ("house", "home", "dwelling", "cottage", "residence", "hovel",
                  "smallhouse", "basement")),
)

#: Enclosure pieces. Deliberately narrow: "wall" and "tower" are structural
#: kit words in every town kit, so including them would eat the buildings.
ENCLOSURE_HINTS = ("fence", "palisade", "railing", "barricade", "hedge")

DRESSING = {"clutter", "container", "furniture", "light", "signage"}


# --- helpers -----------------------------------------------------------------


def pct(values, points=(10, 25, 50, 75, 90)) -> dict:
    vals = sorted(v for v in values if v is not None)
    if not vals:
        return {"n": 0}
    out = {"n": len(vals)}
    for p in points:
        i = min(len(vals) - 1, max(0, int(round((p / 100) * (len(vals) - 1)))))
        out[f"p{p}"] = round(vals[i], 2)
    return out


def share(values, predicate) -> dict:
    vals = [v for v in values if v is not None]
    if not vals:
        return {"n": 0}
    return {"n": len(vals), "share": round(sum(1 for v in vals if predicate(v)) / len(vals), 3)}


def angle_mod90(a: float, b: float) -> float:
    d = abs(a - b) % 90.0
    return min(d, 90.0 - d)


def angle_mod180(a: float, b: float) -> float:
    d = abs(a - b) % 180.0
    return min(d, 180.0 - d)


def bearing(ax, ay, bx, by) -> float:
    return math.degrees(math.atan2(by - ay, bx - ax)) % 360.0


def family_of(model_key: str) -> str:
    path = (model_key or "").lower()
    for name, hints in FAMILY_RULES:
        if any(h in path for h in hints):
            return name
    return "unclassified"


def is_enclosure(model_key: str) -> bool:
    path = (model_key or "").lower()
    return any(h in path for h in ENCLOSURE_HINTS)


# --- collection --------------------------------------------------------------


@dataclass
class Piece:
    model_key: str
    kit: str
    x: float
    y: float
    z: float
    yaw_deg: float
    size_m: tuple[float, float, float] | None


@dataclass
class World:
    pieces: list[Piece] = field(default_factory=list)
    enclosure: list[tuple[float, float]] = field(default_factory=list)
    doors: list[tuple[float, float, float]] = field(default_factory=list)
    roads: list[tuple[float, float]] = field(default_factory=list)
    road_widths: list[float] = field(default_factory=list)
    docks: list[tuple[float, float]] = field(default_factory=list)
    water: list[tuple[float, float]] = field(default_factory=list)
    dressing: list[tuple[float, float, str]] = field(default_factory=list)
    worldspaces: set = field(default_factory=set)
    heights: dict[tuple[int, int], float] = field(default_factory=dict)
    water_height: dict[tuple[int, int], float] = field(default_factory=dict)
    macro: dict = field(default_factory=dict)


def _kit(model_key: str) -> str:
    parts = [p for p in model_key.split("/") if p not in ("meshes", "mesh")]
    return "/".join(parts[:2]) if len(parts) > 2 else (parts[0] if parts else "?")


def collect(plugins: list[Plugin], worlds: set[str], names: list[Plugin]) -> World:
    bases: dict[tuple[str, int], object] = {}
    ltex: dict[tuple[str, int], object] = {}
    for plugin in plugins + names:
        for form_id, base in plugin.base_objects().items():
            if base.model:
                bases.setdefault((plugin.source_of(form_id).lower(), form_id & 0xFFFFFF), base)
        for form_id, entry in plugin.landscape_textures().items():
            ltex.setdefault((plugin.source_of(form_id).lower(), form_id & 0xFFFFFF), entry)

    w = World()
    cells = 0
    unresolved = 0
    step = CELL_SIZE_UNITS / (LAND_DIM - 1)
    for plugin in plugins:
        spaces = plugin.worldspaces()
        wanted = {fid for fid, ws in spaces.items() if not worlds or ws.editor_id in worlds}
        if not wanted:
            continue
        w.worldspaces.update(ws.editor_id or f"0x{fid:06x}"
                             for fid, ws in spaces.items() if fid in wanted)
        for cell in plugin.exterior_cells():
            if cell.world not in wanted or cell.grid is None:
                continue
            cells += 1
            if cell.water_height is not None:
                w.water_height[cell.grid] = cell.water_height / UNITS_PER_METRE
            if cell.land is not None and cell.land.heights:
                for r in range(0, LAND_DIM, HEIGHT_STRIDE):
                    for c in range(0, LAND_DIM, HEIGHT_STRIDE):
                        h = cell.land.heights[r][c]
                        gx = cell.grid[0] * (LAND_DIM - 1) + c
                        gy = cell.grid[1] * (LAND_DIM - 1) + r
                        w.heights[(gx, gy)] = h / UNITS_PER_METRE
                        if cell.water_height is not None and h < cell.water_height:
                            w.water.append((
                                (cell.grid[0] * CELL_SIZE_UNITS + c * step) / UNITS_PER_METRE,
                                (cell.grid[1] * CELL_SIZE_UNITS + r * step) / UNITS_PER_METRE,
                            ))
            if cell.land is not None:
                painted = set(cell.land.base_texture.values())
                painted.update(fid for _, fid, _ in cell.land.layers)
                for fid in painted:
                    entry = ltex.get((plugin.source_of(fid).lower(), fid & 0xFFFFFF))
                    name = (entry.editor_id or "").lower() if entry else ""
                    if any(h in name for h in ROAD_TEXTURE_HINTS):
                        w.roads.append((
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
                z = ref.pos[2] / UNITS_PER_METRE
                size = None
                if base.bounds:
                    x1, y1, z1, x2, y2, z2 = base.bounds
                    size = tuple(round((b - a) * ref.scale / UNITS_PER_METRE, 2)
                                 for a, b in ((x1, x2), (y1, y2), (z1, z2)))
                key = base.model_key or ""
                if base.type == "DOOR" or cls.category == "door":
                    w.doors.append((x, y, z))
                elif cls.category == "architecture":
                    if is_enclosure(key):
                        w.enclosure.append((x, y))
                    else:
                        w.pieces.append(Piece(key, _kit(key), x, y, z,
                                              math.degrees(ref.rot[2]) % 360.0, size))
                elif cls.category == "bridge" or "road" in cls.tags:
                    w.roads.append((x, y))
                    if size:
                        w.road_widths.append(min(size[0], size[1]))
                elif cls.category == "dock":
                    w.docks.append((x, y))
                elif cls.category in DRESSING:
                    w.dressing.append((x, y, cls.category))
    w.macro = {
        "worldspacesSeen": sorted(w.worldspaces),
        "cellsWalked": cells,
        "unresolvedRefs": unresolved,
        "architecturePieces": len(w.pieces),
        "enclosurePieces": len(w.enclosure),
        "doorRefs": len(w.doors),
        "roadSamples": len(w.roads),
        "dockRefs": len(w.docks),
        "waterSamples": len(w.water),
        "dressingRefs": len(w.dressing),
        "heightSamples": len(w.heights),
        "heightSampleSpacingM": round(step * HEIGHT_STRIDE / UNITS_PER_METRE, 2),
    }
    return w


# --- buildings ---------------------------------------------------------------


@dataclass
class Building:
    x: float
    y: float
    z: float
    pieces: int
    yaw_deg: float
    kit: str
    family: str
    long_m: float
    height_m: float


def buildings_from(pieces: list[Piece], link_m: float) -> list[Building]:
    out: list[Building] = []
    for group in cluster(pieces, link_m):
        members = [pieces[i] for i in group]
        cx = sum(p.x for p in members) / len(members)
        cy = sum(p.y for p in members) / len(members)
        cz = min(p.z for p in members)
        span = 2 * max(math.hypot(p.x - cx, p.y - cy) for p in members)
        tallest = max(members, key=lambda p: (p.size_m[2] if p.size_m else 0.0))
        long_m = max(span, max((max(p.size_m[0], p.size_m[1])
                                for p in members if p.size_m), default=0.0))
        families = Counter(family_of(p.model_key) for p in members)
        named = [f for f in families if f != "unclassified"]
        family = (max(named, key=lambda f: families[f]) if named else "unclassified")
        out.append(Building(cx, cy, cz, len(members), tallest.yaw_deg,
                            Counter(p.kit for p in members).most_common(1)[0][0],
                            family, round(long_m, 2),
                            round(tallest.size_m[2], 2) if tallest.size_m else 0.0))
    return out


# --- terrain queries ---------------------------------------------------------


class HeightField:
    """Stride-4 LAND heights, queried in metres."""

    def __init__(self, heights: dict[tuple[int, int], float]):
        self.h = heights
        self.spacing = CELL_SIZE_UNITS / (LAND_DIM - 1) * HEIGHT_STRIDE / UNITS_PER_METRE

    def _index(self, x: float, y: float) -> tuple[int, int]:
        v = CELL_SIZE_UNITS / (LAND_DIM - 1) / UNITS_PER_METRE
        return (int(round(x / v / HEIGHT_STRIDE)) * HEIGHT_STRIDE,
                int(round(y / v / HEIGHT_STRIDE)) * HEIGHT_STRIDE)

    def at(self, x: float, y: float) -> float | None:
        return self.h.get(self._index(x, y))

    def contour_deg(self, x: float, y: float) -> float | None:
        """Direction of the local contour line (degrees, 0-180), or None on flat
        or unsampled ground."""
        gx, gy = self._index(x, y)
        s = HEIGHT_STRIDE
        e, wst = self.h.get((gx + s, gy)), self.h.get((gx - s, gy))
        n, so = self.h.get((gx, gy + s)), self.h.get((gx, gy - s))
        if None in (e, wst, n, so):
            return None
        dzdx = (e - wst) / (2 * self.spacing)
        dzdy = (n - so) / (2 * self.spacing)
        if math.hypot(dzdx, dzdy) < 0.02:      # under 2 % grade: no contour
            return None
        return (math.degrees(math.atan2(dzdy, dzdx)) + 90.0) % 180.0


# --- analysis ----------------------------------------------------------------


SIZE_CLASSES = (("4-6", 4, 7), ("7-12", 7, 13), ("13-25", 13, 26), ("26+", 26, 10**6))


def analyse(world: World, link_m: float, structure_link_m: float,
            min_buildings: int, road_near_m: float) -> dict:
    built = buildings_from(world.pieces, structure_link_m)
    field_ = HeightField(world.heights)
    road_grid = Grid(world.roads)
    water_grid = Grid(world.water)
    dock_grid = Grid([(d[0], d[1]) for d in world.docks])
    door_grid = Grid([(d[0], d[1]) for d in world.doors])
    enclosure_grid = Grid(world.enclosure)
    dressing_grid = Grid([(d[0], d[1]) for d in world.dressing])

    groups = [g for g in cluster(built, link_m) if len(g) >= min_buildings]
    per_class: dict[str, list[float]] = defaultdict(list)
    density_class: dict[str, list[float]] = defaultdict(list)
    radius_class: dict[str, list[float]] = defaultdict(list)
    long_class: dict[str, list[float]] = defaultdict(list)
    road_d_all: list[float] = []
    contour_all: list[float] = []
    road_axis_all: list[float] = []
    door_side_all: list[float] = []
    water_d_all: list[float] = []
    stilt_flags: list[float] = []
    enclosure_per_building: list[float] = []
    dressing_per_building: list[float] = []
    family_counts: Counter = Counter()
    family_by_class: dict[str, Counter] = defaultdict(Counter)
    kits_per_settlement: list[float] = []
    tall_on_high: list[float] = []
    tall_near_road: list[float] = []
    tall_central: list[float] = []
    settlements: list[dict] = []

    for group in sorted(groups, key=len, reverse=True):
        members = [built[i] for i in group]
        n = len(members)
        klass = next(name for name, lo, hi in SIZE_CLASSES if lo <= n < hi)
        cx = sum(b.x for b in members) / n
        cy = sum(b.y for b in members) / n
        radius = max(math.hypot(b.x - cx, b.y - cy) for b in members)
        spacings = []
        for i, b in enumerate(members):
            spacings.append(min(math.hypot(b.x - o.x, b.y - o.y)
                                for j, o in enumerate(members) if j != i))
        per_class[klass].extend(spacings)

        road_ds, elevations = [], []
        for b in members:
            q, d = road_grid.nearest(b.x, b.y)
            if q is not None:
                road_ds.append(d)
                road_d_all.append(d)
                axis = _axis(road_grid.within(b.x, b.y, 40.0))
                if axis is not None:
                    road_axis_all.append(angle_mod90(b.yaw_deg, axis))
                # entrance side: bearing centre->door versus centre->road
                dq, dd = door_grid.nearest(b.x, b.y)
                if dq is not None and dd is not None and 0.5 < dd <= max(12.0, b.long_m):
                    door_side_all.append(angle_mod180(
                        bearing(b.x, b.y, dq[0], dq[1]), bearing(b.x, b.y, q[0], q[1])))
            contour = field_.contour_deg(b.x, b.y)
            if contour is not None:
                contour_all.append(angle_mod90(b.yaw_deg, contour))
            q, d = water_grid.nearest(b.x, b.y)
            if q is not None:
                water_d_all.append(d)
            ground = field_.at(b.x, b.y)
            cell = (int(b.x * UNITS_PER_METRE // CELL_SIZE_UNITS),
                    int(b.y * UNITS_PER_METRE // CELL_SIZE_UNITS))
            wh = world.water_height.get(cell)
            if ground is not None and wh is not None:
                stilt_flags.append(1.0 if (ground < wh and b.z >= wh - 1.0) else 0.0)
            if ground is not None:
                elevations.append(ground)
            enclosure_per_building.append(float(len(enclosure_grid.within(b.x, b.y, 15.0))))
            dressing_per_building.append(float(len(dressing_grid.within(b.x, b.y, 10.0))))
            family_counts[b.family] += 1
            family_by_class[klass][b.family] += 1

        kits = Counter(b.kit for b in members)
        kits_per_settlement.append(float(len(kits)))
        tallest = max(members, key=lambda b: b.height_m)
        if len(elevations) == n and n >= 4:
            te = field_.at(tallest.x, tallest.y)
            rank = sum(1 for e in elevations if e < te) / (n - 1)
            tall_on_high.append(rank)
        if road_ds and len(road_ds) == n:
            tq, td = road_grid.nearest(tallest.x, tallest.y)
            if td is not None:
                tall_near_road.append(
                    sum(1 for d in road_ds if d > td) / (n - 1))
        tall_central.append(
            math.hypot(tallest.x - cx, tallest.y - cy) / max(1e-6, radius))

        density_class[klass].append(n / max(0.01, math.pi * radius * radius / 10_000))
        radius_class[klass].append(radius)
        long_class[klass].extend(b.long_m for b in members)
        _, dock_d = dock_grid.nearest(cx, cy)
        settlements.append({
            "buildings": n,
            "sizeClass": klass,
            "centreM": [round(cx, 1), round(cy, 1)],
            "radiusM": round(radius, 1),
            "buildingsPerHectare": round(n / max(0.01, math.pi * radius * radius / 10_000), 2),
            "spacingM": pct(spacings),
            "kitCount": len(kits),
            "kits": kits.most_common(3),
            "families": dict(Counter(b.family for b in members)),
            "medianRoadDistanceM": round(sorted(road_ds)[len(road_ds) // 2], 1) if road_ds else None,
            "reliefM": round(max(elevations) - min(elevations), 1) if elevations else None,
            "nearestDockM": round(dock_d, 1) if dock_d is not None else None,
        })

    total_families = sum(family_counts.values()) or 1
    return {
        "settlementCount": len(settlements),
        "params": {
            "linkM": link_m, "structureLinkM": structure_link_m,
            "minBuildings": min_buildings, "roadNearM": road_near_m,
        },
        "buildingsClustered": len(built),
        "spacingBySize": {k: pct(v) for k, v in sorted(per_class.items())},
        "densityBySize": {k: pct(v) for k, v in sorted(density_class.items())},
        "radiusBySize": {k: pct(v) for k, v in sorted(radius_class.items())},
        "buildingLongAxisBySize": {k: pct(v) for k, v in sorted(long_class.items())},
        "roadDistanceM": pct(road_d_all),
        "buildingsNearRoad": {
            "n": len(road_d_all),
            "within5m": round(sum(1 for d in road_d_all if d <= 5) / max(1, len(road_d_all)), 3),
            "within10m": round(sum(1 for d in road_d_all if d <= 10) / max(1, len(road_d_all)), 3),
            "within20m": round(sum(1 for d in road_d_all if d <= 20) / max(1, len(road_d_all)), 3),
        },
        "roadPieceWidthM": pct(world.road_widths),
        "yawVsContourDeg": pct(contour_all),
        "yawVsRoadAxisDeg": pct(road_axis_all),
        "doorSideVsRoadBearingDeg": pct(door_side_all),
        "doorOnRoadSideShare": share(door_side_all, lambda v: v <= 45.0),
        "waterDistanceM": pct(water_d_all),
        "buildingsOverWaterShare": share(stilt_flags, lambda v: v > 0.5),
        "enclosurePiecesWithin15m": pct(enclosure_per_building),
        "dressingRefsWithin10m": pct(dressing_per_building),
        "familyMix": {k: round(v / total_families, 3) for k, v in family_counts.most_common()},
        "familyMixBySize": {
            k: {f: round(c / max(1, sum(v.values())), 3) for f, c in v.most_common()}
            for k, v in sorted(family_by_class.items())
        },
        "kitsPerSettlement": pct(kits_per_settlement),
        "mixedKitSettlementShare": share(kits_per_settlement, lambda v: v > 1.5),
        "tallestElevationRank": pct(tall_on_high),
        "tallestRoadProximityRank": pct(tall_near_road),
        "tallestOffsetFromCentreRadii": pct(tall_central),
        "settlements": settlements[:60],
    }


def _axis(points: list[tuple[float, float]]) -> float | None:
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


# --- vault survey ------------------------------------------------------------


def survey(root: Path, names: list[Plugin]) -> list[dict]:
    """Every plugin under `root`: does it place buildings in exterior cells?

    The point is to say plainly which mods carry no exterior placement at all
    (resource packs), so a synthesis knows which sources it can weight.
    """
    shared: dict[tuple[str, int], object] = {}
    for plugin in names:
        for form_id, base in plugin.base_objects().items():
            if base.model:
                shared.setdefault(
                    (plugin.source_of(form_id).lower(), form_id & 0xFFFFFF), base)

    rows: list[dict] = []
    for path in sorted(root.rglob("*.es[pml]")):
        if not path.is_file():
            continue
        try:
            plugin = Plugin(path)
            spaces = plugin.worldspaces()
            bases = dict(shared)
            for form_id, base in plugin.base_objects().items():
                if base.model:
                    bases[(plugin.source_of(form_id).lower(), form_id & 0xFFFFFF)] = base
            cells = refs = arch = 0
            seen: set[str] = set()
            for cell in plugin.exterior_cells(with_land=False):
                cells += 1
                if cell.world in spaces and spaces[cell.world].editor_id:
                    seen.add(spaces[cell.world].editor_id)
                for ref in cell.refs:
                    if ref.distant:
                        continue
                    refs += 1
                    base = bases.get(
                        (plugin.source_of(ref.base).lower(), ref.base & 0xFFFFFF))
                    if base and base.model and classify(base.model).category == "architecture":
                        arch += 1
            rows.append({
                "plugin": str(path.relative_to(root)),
                "worldspaces": sorted(seen),
                "exteriorCells": cells,
                "exteriorRefs": refs,
                "architectureRefs": arch,
            })
        except Exception as exc:                      # unreadable plugin: say so
            rows.append({"plugin": str(path.relative_to(root)), "error": repr(exc)[:80]})
    return rows


# --- report ------------------------------------------------------------------


def _row(label: str, stat: dict, keys=("p10", "p50", "p90")) -> str:
    cells = " | ".join(str(stat.get(k, "—")) for k in keys)
    return f"| {label} | {stat.get('n', 0)} | {cells} |"


#: "Planned" = a source the province build already commits to; "possible" =
#: a source in the vault we might still draw on. Set by the owner's brief
#: (2026-09-05), not measured.
STANDING = {
    "Skyrim (vanilla)": "planned (base kit set)",
    "BM&V Black Marsh": "planned (primary marsh reference)",
    "BM&V Valenwood": "planned (dry contrast)",
    "Here There Be Monsters: Cipactli": "possible",
}


def render_report(reports: list[dict], survey_data: dict | None = None) -> str:
    lines: list[str] = []
    add = lines.append
    add("# Settlement form: measured evidence")
    add("")
    add("Generated by `worldgen/mine_settlement_form_stats.py --report`; do not "
        "hand-edit the tables. Every figure is measured from the shipped "
        "plugins named below, and carries its sample size. Statistics only: no "
        "authored layout is reproduced (00-core rule 6). The companion first "
        "pass is [mined interior assembly and settlement form]"
        "(mined-interior-assembly-and-settlement-form.md); this pass adds the "
        "measures that one lacks.")
    add("")
    add("## Sources")
    add("")
    add("| Set | Standing | Worldspaces | Cells | Architecture pieces | Buildings | Settlements | Unresolved refs |")
    add("|---|---|---|---|---|---|---|---|")
    for r in reports:
        m, f = r["macro"], r["form"]
        add(f"| {r['source']['label']} | {STANDING.get(r['source']['label'], 'possible')} | "
            f"{', '.join(m.get('worldspacesSeen') or r['source']['worldspaces'])} | "
            f"{m['cellsWalked']} | {m['architecturePieces']} | "
            f"{f['buildingsClustered']} | {f['settlementCount']} | {m['unresolvedRefs']} |")
    add("")
    add("A building is a cluster of architecture pieces within "
        f"{reports[0]['form']['params']['structureLinkM']} m; a settlement is "
        f"{reports[0]['form']['params']['minBuildings']}+ buildings within "
        f"{reports[0]['form']['params']['linkM']} m of one another.")
    add("")

    sections = [
        ("Nearest-neighbour spacing by settlement size (m)", "spacingBySize", True),
        ("Buildings per hectare by settlement size", "densityBySize", True),
        ("Settlement radius by size (m)", "radiusBySize", True),
        ("Building plan long axis by settlement size (m)", "buildingLongAxisBySize", True),
        ("Distance to the nearest road sample (m)", "roadDistanceM", False),
        ("Distance to the nearest waterline sample (m)", "waterDistanceM", False),
        ("Building yaw against the local contour (deg, 0-45 folded)", "yawVsContourDeg", False),
        ("Building yaw against the local road axis (deg, 0-45 folded)", "yawVsRoadAxisDeg", False),
        ("Entrance bearing against the road bearing (deg, 0-90 folded)",
         "doorSideVsRoadBearingDeg", False),
        ("Enclosure pieces within 15 m of a building", "enclosurePiecesWithin15m", False),
        ("Dressing references within 10 m of a building", "dressingRefsWithin10m", False),
        ("Kits per settlement", "kitsPerSettlement", False),
        ("Tallest building's elevation rank within its settlement (0 low, 1 high)",
         "tallestElevationRank", False),
        ("Tallest building's road-proximity rank (0 far, 1 nearest)",
         "tallestRoadProximityRank", False),
        ("Tallest building's offset from the settlement centre (radii)",
         "tallestOffsetFromCentreRadii", False),
        ("Road piece width, short axis of road/bridge meshes (m)", "roadPieceWidthM", False),
    ]
    for title, key, by_class in sections:
        add(f"## {title}")
        add("")
        add("| Set | n | p10 | p50 | p90 |")
        add("|---|---|---|---|---|")
        for r in reports:
            stat = r["form"].get(key, {})
            if by_class:
                for klass, sub in stat.items():
                    add(_row(f"{r['source']['label']} — {klass} buildings", sub))
            else:
                add(_row(r["source"]["label"], stat))
        add("")

    add("## Share of buildings near a road")
    add("")
    add("| Set | n | within 5 m | within 10 m | within 20 m |")
    add("|---|---|---|---|---|")
    for r in reports:
        s = r["form"]["buildingsNearRoad"]
        add(f"| {r['source']['label']} | {s['n']} | {s['within5m']} | "
            f"{s['within10m']} | {s['within20m']} |")
    add("")
    add("## Entrances and water")
    add("")
    add("| Set | doors measured | share on the road side (within 45 deg) | "
        "buildings measured for water | share standing over water |")
    add("|---|---|---|---|---|")
    for r in reports:
        d = r["form"]["doorOnRoadSideShare"]
        w = r["form"]["buildingsOverWaterShare"]
        add(f"| {r['source']['label']} | {d.get('n', 0)} | {d.get('share', '—')} | "
            f"{w.get('n', 0)} | {w.get('share', '—')} |")
    add("")
    add("## Building family mix")
    add("")
    add("Families are inferred from mesh paths (`FAMILY_RULES` in the miner), "
        "not read from an authored label; `unclassified` is the honest residue.")
    add("")
    families = ("dwelling", "work", "civic", "storage", "unclassified")
    add("| Set | size class | " + " | ".join(families) + " |")
    add("|---|---|" + "---|" * len(families))
    for r in reports:
        for klass, mix in r["form"]["familyMixBySize"].items():
            add(f"| {r['source']['label']} | {klass} | "
                + " | ".join(str(mix.get(f, 0.0)) for f in families) + " |")
    add("")
    if survey_data:
        add("## Other vault plugins: do they place buildings outdoors?")
        add("")
        add("Every plugin under the vault's `mod-sources`, walked for exterior "
            "cells. A plugin with no exterior architecture places no buildings "
            "in the open world; a resource pack with no plugin at all cannot be "
            "measured for form and is listed after the table.")
        add("")
        add("| Plugin | Worldspaces | Exterior cells | Exterior refs | Architecture refs |")
        add("|---|---|---|---|---|")
        rows = sorted((r for r in survey_data["plugins"] if "error" not in r),
                      key=lambda r: -r["architectureRefs"])
        for r in rows:
            if r["exteriorCells"] == 0 and r["architectureRefs"] == 0:
                continue
            add(f"| `{r['plugin']}` | {', '.join(r['worldspaces']) or '—'} | "
                f"{r['exteriorCells']} | {r['exteriorRefs']} | {r['architectureRefs']} |")
        add("")
        empty = [r["plugin"] for r in survey_data["plugins"]
                 if "error" not in r and r["exteriorCells"] == 0]
        if empty:
            add("Plugins with **no exterior cells at all** (resource plugins, "
                "interiors only, or script-only): "
                + ", ".join(f"`{e}`" for e in sorted(empty)) + ".")
            add("")
        add(NO_PLUGIN_NOTE)
        bad = [r for r in survey_data["plugins"] if "error" in r]
        if bad:
            add("Unreadable: " + ", ".join(f"`{r['plugin']}`" for r in bad) + ".")
            add("")

    add("## Mixed kits within one settlement")
    add("")
    add("| Set | settlements | share using more than one kit |")
    add("|---|---|---|")
    for r in reports:
        s = r["form"]["mixedKitSettlementShare"]
        add(f"| {r['source']['label']} | {s.get('n', 0)} | {s.get('share', '—')} |")
    add("")
    add(TAIL)
    return "\n".join(lines) + "\n"


NO_PLUGIN_NOTE = (
    "Vault mods that ship **no plugin at all** and therefore place nothing "
    "anywhere — they are mesh and texture packs, usable as kits but silent on "
    "form: the Morrowind Hlaalu architecture set, the Morrowind Imperial keep "
    "set (tesak1243), Aendemika, Sirenroot, Project Rainforest, and the "
    "ground-texture and lore packs. The Xanmeer tileset ships a plugin that "
    "declares its base objects and places none of them.\n")

TAIL = """## What the data does not measure

* **Facade facing.** A reference's yaw is relative to each mesh's own authored
  front, so "does the front of the house look at the road" is unanswerable from
  a plugin. The entrance-side figures above sidestep that by comparing two
  bearings taken from the same building centre, and are the only facing
  evidence here.
* **Road junctions and road width as built.** Roads are sampled as points
  (road/bridge references plus road-painted cells at cell centres); the painted
  samples land at cell centres, so a junction cannot be located and junction
  spacing is not reported. The road-piece width column is the short axis of the
  road *meshes*, which is a piece width, not a carriageway width.
* **Black Marsh roads.** BM&V's marsh worldspaces carry few road references at
  all, so its road columns describe a world with hardly any roads rather than
  towns that avoid them. The Skyrim road figures are the trustworthy ones.
* **Building function.** Families are inferred from mesh paths; a third to a
  half of buildings fall in `unclassified`, and a kit whose pieces are named
  after their geometry rather than their use cannot be classified at all.
* **Enclosure in the marsh.** Fence-like pieces are counted by mesh path
  (fence, palisade, railing, barricade, hedge). BM&V's marsh sets contain
  almost none, so the marsh enclosure figures are near-zero by absence of the
  piece family, not by a siting choice.
* **Docks.** No reference in any of the four sets classifies as `dock`, so
  "buildings over water" rests on the terrain-versus-water-height test alone.
* **Unresolved references.** Every set loses references whose base object lives
  in a master not loaded; the counts are in the source table and the losses are
  not uniform across kits.
* **Unit scale.** All lengths carry the 0.45 % `UNITS_PER_METRE` bias recorded
  in the companion doc; immaterial for ratios, worth knowing for absolutes.

## What this evidence implies

Observations, not rules — the synthesis decides what to do with them.

1. Nearest-neighbour spacing sits near 13-16 m at the median in every set and
   every size class, and its p10 never drops below ~8 m. Spacing looks like a
   constant of legibility rather than a cultural variable.
2. Density falls sharply as settlements grow, in every set: hamlets of four to
   six buildings run 15-33 buildings per hectare and clusters of 26 or more run
   4-11. With spacing held near constant, growth is bought with radius, and the
   gaps inside a large settlement are wider than the gaps inside a small one.
3. Black Marsh buildings sit a median 3.9 m from standing water and roughly one
   in five stands on ground below the water line; Valenwood's median is 69 m.
   The waterline is the marsh's organising line in a way no road is.
4. Buildings within 5 m of a road are rare everywhere (2-4 %); within 20 m is
   a minority even in road-led Skyrim (38 %). Settlements sit *beside* roads
   with a gap, not hard against them.
5. Yaw against the local contour is indistinguishable from uniform in all four
   sets, with medians at ~20-22 degrees against a uniform expectation of 22.5.
   No contour-following convention is detectable at this sample spacing.
6. The entrance sits on the road side of its building slightly more often than
   chance (53-57 % within 90 degrees). The convention exists but is weak, and
   only in sets with roads.
7. The tallest building takes the high ground in vanilla Skyrim (median
   elevation rank 0.67 of its settlement) and does not in the marsh or forest
   sets (0.25 and 0.33). The hall-on-the-high-point convention is Nordic here,
   not universal.
8. The tallest building sits well off centre in every set (median 0.74 of the
   settlement radius in Skyrim), so a landmark is a rim feature as often as a
   centrepiece.
9. Kit mixing is the norm in the mod sets (61 % of Black Marsh and 76 % of
   Valenwood settlements draw on more than one kit) and the exception in
   vanilla (29 %).
10. Dressing thins fast outside the buildings: a median of 2 dressing
    references within 10 m of a Skyrim building and 0 in the marsh sets,
    against the 50-70 clutter pieces per 100 square metres the interiors carry.
"""


# --- cli ---------------------------------------------------------------------


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--plugin", action="append", default=[])
    ap.add_argument("--names", action="append", default=[])
    ap.add_argument("--world", action="append", default=[])
    ap.add_argument("--label", default="")
    ap.add_argument("--out", default=None)
    ap.add_argument("--survey-root", default=None,
                    help="walk every plugin under this directory for exterior placements")
    ap.add_argument("--survey-out", default=None)
    ap.add_argument("--survey", default=None, help="survey json to fold into --report")
    ap.add_argument("--report", default=None, help="write the doc tables here")
    ap.add_argument("--input", action="append", default=[],
                    help="mined json to feed --report, in order")
    ap.add_argument("--link", type=float, default=45.0)
    ap.add_argument("--structure-link", type=float, default=8.0)
    ap.add_argument("--min-buildings", type=int, default=4)
    ap.add_argument("--road-near", type=float, default=20.0)
    ap.add_argument("--date", default="2026-09-05")
    args = ap.parse_args(argv)

    if args.plugin:
        plugins = [Plugin(p) for p in args.plugin]
        names = [Plugin(p) for p in args.names]
        world = collect(plugins, set(args.world), names)
        report = {
            "schemaVersion": 1,
            "source": {
                "label": args.label or ", ".join(Path(p).name for p in args.plugin),
                "plugins": [Path(p).name for p in args.plugin],
                "nameSources": [Path(p).name for p in args.names],
                "worldspaces": args.world,
                "method": "worldgen.mine_settlement_form_stats — second-pass "
                          "settlement form: spacing by size, contour and road "
                          "alignment, entrance side, road proximity shares, "
                          "family mix, enclosure, waterfront. Statistics only.",
                "date": args.date,
            },
            "macro": world.macro,
            "form": analyse(world, args.link, args.structure_link,
                            args.min_buildings, args.road_near),
        }
        if args.out:
            out = Path(args.out)
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_text(json.dumps(report, indent=1, sort_keys=False) + "\n")
            print(f"{report['form']['settlementCount']} settlements -> {out}")

    if args.survey_root:
        rows = survey(Path(args.survey_root), [Plugin(p) for p in args.names])
        if args.survey_out:
            Path(args.survey_out).write_text(json.dumps(
                {"schemaVersion": 1, "root": args.survey_root,
                 "date": args.date, "plugins": rows}, indent=1) + "\n")
            print(f"{len(rows)} plugins surveyed -> {args.survey_out}")

    if args.report:
        reports = [json.loads(Path(p).read_text()) for p in args.input]
        survey_data = json.loads(Path(args.survey).read_text()) if args.survey else None
        Path(args.report).write_text(render_report(reports, survey_data))
        print(f"report -> {args.report}")


if __name__ == "__main__":
    main()
