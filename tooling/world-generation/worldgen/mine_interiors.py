"""Mine shipped **interiors** for kit-assembly rules (Phase 12 input).

Companion to `mine_placement.py` (which mines exterior scatter). Interiors are
where a modular kit demonstrates *its own grammar*: which pieces exist, which
pieces sit next to which, on what snap module, at what rotations, how big the
resulting chambers are and how much clutter a team puts in them.

As always we keep the **statistics, never the authored places** (00-core rule
6). Nothing here reproduces anyone's dungeon; it produces the numbers a
compiler needs to assemble our own.

What is measured, and why Phase 12 needs it:

* **snap module** — the offset quantisation between adjacent structural
  pieces. Measured three ways because kits use all three: shared coordinates
  (two pieces on the same axis line), offset moduli (a ladder of candidate
  grids, scored by hit rate), and the modal relative offset vectors for the
  commonest piece pairs.
* **rotation quantisation** — how often yaw is a multiple of 90/45/22.5°, and
  how often pieces are tilted off-axis at all.
* **piece pairs** — which pieces co-occur inside one chamber, ranked by lift,
  with the modal offsets that join them. This is the adjacency table an
  assembler samples from.
* **chambers** — structural pieces single-link clustered in 3D; their plan
  dimensions and ceiling heights are our room-size envelope.
* **clutter density** — furniture/clutter/light/container counts per 100 m² of
  chamber floor, per kit family and per interior.

Usage:
  python3 -m worldgen.mine_interiors \\
      --plugin "<vault>/skyrim-source/Data/Skyrim.esm" \\
      --plugin "<bmv>/Black Marsh.esm" --plugin "<bmv>/Black Marsh North.esp" \\
      --plugin "<bmv>/Valenwood.esp" \\
      --out world/sources/placement/bmv-interior-assembly.json
"""

from __future__ import annotations

import argparse
import json
import math
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path

from .asset_taxonomy import classify
from .esp_index import UNITS_PER_METRE, Plugin

#: Categories that make the shell of a room — the pieces that snap.
STRUCTURAL = frozenset({"architecture", "dungeon-kit", "ruin", "bridge", "dock"})
#: Categories that dress it.
DRESSING = frozenset({"furniture", "clutter", "container", "light", "signage",
                      "trap", "plant", "fungus", "misc"})

#: Candidate snap grids, in game units (1 unit = 1.4224 cm).
SNAP_GRIDS = (8, 16, 32, 64, 128, 256, 512, 1024)
SNAP_TOL_UNITS = 1.0
"""How far off a multiple a piece may sit and still count as snapped."""

#: Chamber segmentation: structural pieces closer than this (units) are one room.
CHAMBER_LINK_UNITS = 384.0     # 5.46 m
MIN_CHAMBER_PIECES = 8

MIN_INTERIOR_PIECES = 40
"""Interiors smaller than this are counted but not profiled."""

MIN_PAIR_SUPPORT = 20
"""Chambers a piece pair must share before it earns an adjacency row."""


@dataclass
class Piece:
    species: str
    category: str
    x: float
    y: float
    z: float
    rot: tuple[float, float, float]
    scale: float


def _pct(values, points=(5, 25, 50, 75, 95)) -> dict:
    vals = [v for v in values if v is not None]
    if not vals:
        return {}
    ordered = sorted(vals)
    return {
        f"p{p}": round(ordered[min(len(ordered) - 1,
                                   max(0, int(round((p / 100) * (len(ordered) - 1)))))], 3)
        for p in points
    }


def _kit_family(model_key: str) -> str:
    """Directory-first kit identity — `meshes/dungeons/nordic/...` -> `dungeons/nordic`.

    Directory names are the reliable signal in asset archives (CLAUDE.md); the
    filename is not.
    """
    parts = model_key.split("/")
    if parts and parts[0] in ("meshes", "mesh"):
        parts = parts[1:]
    return "/".join(parts[:2]) if len(parts) > 2 else (parts[0] if parts else "?")


def load_bases(plugins: list[Plugin]) -> dict[tuple[str, int], object]:
    bases: dict[tuple[str, int], object] = {}
    for plugin in plugins:
        for form_id, base in plugin.base_objects().items():
            key = (plugin.source_of(form_id).lower(), form_id & 0xFFFFFF)
            if base.model:
                bases.setdefault(key, base)
    return bases


def read_interiors(plugin: Plugin, bases) -> list[tuple[str, str, list[Piece]]]:
    """`(plugin name, cell editor id, pieces)` for every interior in a plugin."""
    out = []
    for cell in plugin.interior_cells(with_refs=True):
        pieces: list[Piece] = []
        for ref in cell.refs:
            base = bases.get((plugin.source_of(ref.base).lower(), ref.base & 0xFFFFFF))
            if base is None or not base.model:
                continue
            pieces.append(Piece(
                species=base.model_key,
                category=classify(base.model).category,
                x=ref.pos[0], y=ref.pos[1], z=ref.pos[2],
                rot=ref.rot, scale=ref.scale,
            ))
        if pieces:
            out.append((plugin.path.name, cell.editor_id or f"{cell.form_id:08X}", pieces))
    return out


# --- snap measurement --------------------------------------------------------


def _neighbours(pieces: list[Piece], radius: float):
    """Yield `(a, b)` for each piece and its nearest structural neighbour."""
    cell = radius
    buckets: dict[tuple[int, int, int], list[Piece]] = defaultdict(list)
    for p in pieces:
        buckets[(int(p.x // cell), int(p.y // cell), int(p.z // cell))].append(p)
    for p in pieces:
        bx, by, bz = int(p.x // cell), int(p.y // cell), int(p.z // cell)
        best, best_d = None, radius * radius
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    for q in buckets.get((bx + dx, by + dy, bz + dz), ()):
                        if q is p:
                            continue
                        d = (p.x - q.x) ** 2 + (p.y - q.y) ** 2 + (p.z - q.z) ** 2
                        if d < best_d:
                            best_d, best = d, q
        if best is not None:
            yield p, best


class SnapStats:
    """Accumulates snap evidence over many interiors without holding them."""

    def __init__(self) -> None:
        self.pairs = 0
        self.shared_axes = Counter()      # how many of x/y/z are identical
        self.grid_hits = Counter()
        self.axis_deltas = 0              # non-zero axis deltas
        self.axis_zero = 0
        self.axis_grid_hits = Counter()
        self.offset_hist = Counter()      # |delta| on x/y, rounded to 8 units
        self.offset_hist_z = Counter()
        self.yaw = Counter()
        self.tilted = 0
        self.rots = 0
        self.scaled = 0

    def add_pair(self, a: Piece, b: Piece) -> None:
        self.pairs += 1
        d = (abs(a.x - b.x), abs(a.y - b.y), abs(a.z - b.z))
        self.shared_axes[sum(1 for v in d if v < SNAP_TOL_UNITS)] += 1
        for grid in SNAP_GRIDS:
            if all(abs(v - round(v / grid) * grid) < SNAP_TOL_UNITS for v in d):
                self.grid_hits[grid] += 1
        for v in d:
            if v < SNAP_TOL_UNITS:
                self.axis_zero += 1
                continue
            self.axis_deltas += 1
            for grid in SNAP_GRIDS:
                if abs(v - round(v / grid) * grid) < SNAP_TOL_UNITS:
                    self.axis_grid_hits[grid] += 1
        for v in d[:2]:
            self.offset_hist[int(round(v / 8) * 8)] += 1
        self.offset_hist_z[int(round(d[2] / 8) * 8)] += 1

    def add_piece(self, p: Piece) -> None:
        self.rots += 1
        self.yaw[round(math.degrees(p.rot[2]) % 360, 1)] += 1
        if math.hypot(p.rot[0], p.rot[1]) > math.radians(0.5):
            self.tilted += 1
        if abs(p.scale - 1.0) > 0.001:
            self.scaled += 1

    def report(self) -> dict:
        if not self.pairs:
            return {}
        yaw_total = sum(self.yaw.values())

        def on_multiple(step: float) -> float:
            hit = sum(n for d, n in self.yaw.items()
                      if min(abs(d % step), step - abs(d % step)) < 0.6)
            return round(hit / yaw_total, 3)

        return {
            "adjacentPairs": self.pairs,
            "neighbourSearchRadiusUnits": 512,
            "caveat": "grids >= the 512-unit search radius cannot be observed; "
                      "their rows are structurally near zero.",
            "sharedAxisFraction": {
                str(k): round(v / self.pairs, 3)
                for k, v in sorted(self.shared_axes.items())
            },
            "gridHitFraction": {
                str(g): round(self.grid_hits[g] / self.pairs, 3) for g in SNAP_GRIDS
            },
            # The crisp quantisation number: of the axis offsets that are NOT
            # zero (identical coordinates are counted separately above), what
            # share lands on a multiple of each candidate module.
            "nonZeroAxisDeltas": self.axis_deltas,
            "zeroAxisFraction": round(
                self.axis_zero / max(1, self.axis_zero + self.axis_deltas), 3),
            "nonZeroAxisOnGrid": {
                str(g): round(self.axis_grid_hits[g] / max(1, self.axis_deltas), 3)
                for g in SNAP_GRIDS
            },
            # The share above is not comparable across grids: a coarse grid is
            # hit by chance far less often than a fine one. Divide by the
            # chance rate (2*tol/G) and a value near 1 means "no quantisation
            # at this module", while 10+ means the kit really is built on it.
            "nonZeroAxisOnGridLiftOverChance": {
                str(g): round(
                    (self.axis_grid_hits[g] / max(1, self.axis_deltas))
                    / min(1.0, 2 * SNAP_TOL_UNITS / g), 2)
                for g in SNAP_GRIDS
            },
            "gridHitFractionMetres": {
                str(round(g / UNITS_PER_METRE, 3)): round(self.grid_hits[g] / self.pairs, 3)
                for g in SNAP_GRIDS
            },
            "topOffsetsXYUnits": [
                [u, n, round(u / UNITS_PER_METRE, 2)]
                for u, n in self.offset_hist.most_common(12)
            ],
            "topOffsetsZUnits": [
                [u, n, round(u / UNITS_PER_METRE, 2)]
                for u, n in self.offset_hist_z.most_common(8)
            ],
            "yawOnMultipleOf": {
                "90": on_multiple(90), "45": on_multiple(45),
                "22.5": on_multiple(22.5), "15": on_multiple(15),
                "1": on_multiple(1.0),
            },
            "topYawDegrees": self.yaw.most_common(8),
            "tiltedFraction": round(self.tilted / self.rots, 3) if self.rots else None,
            "rescaledFraction": round(self.scaled / self.rots, 3) if self.rots else None,
        }


# --- chambers ----------------------------------------------------------------


def chambers(pieces: list[Piece], link: float = CHAMBER_LINK_UNITS) -> list[list[Piece]]:
    """Single-link clusters of structural pieces = rooms/chambers."""
    if not pieces:
        return []
    buckets: dict[tuple[int, int, int], list[int]] = defaultdict(list)
    for i, p in enumerate(pieces):
        buckets[(int(p.x // link), int(p.y // link), int(p.z // link))].append(i)
    parent = list(range(len(pieces)))

    def find(a: int) -> int:
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    link2 = link * link
    for (bx, by, bz), members in buckets.items():
        near: list[int] = []
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for dz in (-1, 0, 1):
                    near.extend(buckets.get((bx + dx, by + dy, bz + dz), ()))
        for i in members:
            pi = pieces[i]
            for j in near:
                if j <= i:
                    continue
                pj = pieces[j]
                if (pi.x - pj.x) ** 2 + (pi.y - pj.y) ** 2 + (pi.z - pj.z) ** 2 <= link2:
                    ra, rb = find(i), find(j)
                    if ra != rb:
                        parent[ra] = rb
    groups: dict[int, list[Piece]] = defaultdict(list)
    for i, p in enumerate(pieces):
        groups[find(i)].append(p)
    return [g for g in groups.values() if len(g) >= MIN_CHAMBER_PIECES]


def _extent_m(group: list[Piece]) -> tuple[float, float, float]:
    xs = [p.x for p in group]
    ys = [p.y for p in group]
    zs = [p.z for p in group]
    return (
        (max(xs) - min(xs)) / UNITS_PER_METRE,
        (max(ys) - min(ys)) / UNITS_PER_METRE,
        (max(zs) - min(zs)) / UNITS_PER_METRE,
    )


# --- adjacency ---------------------------------------------------------------


class Adjacency:
    """Piece-pair co-occurrence within a chamber, plus their modal offsets."""

    def __init__(self) -> None:
        self.chamber_presence = Counter()
        self.chambers = 0
        self.pair_chambers = Counter()
        self.pair_offsets: dict[tuple[str, str], Counter] = defaultdict(Counter)
        self.join_planar_units: list[float] = []

    def add_chamber(self, group: list[Piece]) -> None:
        self.chambers += 1
        names = {p.species for p in group}
        self.chamber_presence.update(names)
        ordered = sorted(names)
        for i, a in enumerate(ordered):
            for b in ordered[i + 1:]:
                self.pair_chambers[(a, b)] += 1
        # Modal joining offsets: nearest cross-species neighbour, rounded.
        for a, b in _neighbours(group, 512.0):
            if a.species == b.species:
                continue
            key = (a.species, b.species) if a.species < b.species else (b.species, a.species)
            first, second = (a, b) if key[0] == a.species else (b, a)
            vec = (
                int(round((second.x - first.x) / 8) * 8),
                int(round((second.y - first.y) / 8) * 8),
                int(round((second.z - first.z) / 8) * 8),
            )
            # Rotation-invariant magnitude form so a rotated copy of the same
            # join lands in the same bin: (planar distance, height offset).
            # Binned at 32 units (0.46 m) — finer bins fragment the modes.
            planar = math.hypot(vec[0], vec[1])
            self.join_planar_units.append(planar)
            self.pair_offsets[key][
                (int(round(planar / 32) * 32), int(round(vec[2] / 32) * 32))
            ] += 1

    def report(self, top: int = 40) -> list:
        out = []
        for (a, b), n in self.pair_chambers.most_common():
            if n < MIN_PAIR_SUPPORT:
                continue
            expected = self.chamber_presence[a] * self.chamber_presence[b] / max(1, self.chambers)
            offsets = self.pair_offsets.get((a, b), Counter()).most_common(3)
            out.append({
                "a": a, "b": b, "chambers": n,
                "lift": round(n / expected, 2) if expected else None,
                "joinOffsets": [
                    {"planarM": round(pl / UNITS_PER_METRE, 2),
                     "riseM": round(dz / UNITS_PER_METRE, 2), "n": c}
                    for (pl, dz), c in offsets
                ],
            })
            if len(out) >= top:
                break
        return out


# --- top level ---------------------------------------------------------------


def mine(plugins: list[Plugin], bases) -> dict:
    global_snap = SnapStats()
    kit_snap: dict[str, SnapStats] = defaultdict(SnapStats)
    kit_adj: dict[str, Adjacency] = defaultdict(Adjacency)
    kit_interiors: Counter = Counter()
    kit_pieces: Counter = Counter()
    kit_piece_names: dict[str, Counter] = defaultdict(Counter)
    kit_chamber_dims: dict[str, list[tuple[float, float, float]]] = defaultdict(list)
    kit_clutter: dict[str, list[float]] = defaultdict(list)
    kit_furniture: dict[str, list[float]] = defaultdict(list)
    interiors_seen = 0
    interiors_profiled = 0
    by_plugin: dict[str, Counter] = defaultdict(Counter)
    interior_rows: list[dict] = []
    all_chamber_dims: list[tuple[float, float, float]] = []
    category_totals: Counter = Counter()

    for plugin in plugins:
        for plugin_name, edid, pieces in read_interiors(plugin, bases):
            interiors_seen += 1
            by_plugin[plugin_name]["interiors"] += 1
            for p in pieces:
                category_totals[p.category] += 1
            shell = [p for p in pieces if p.category in STRUCTURAL]
            if len(shell) < MIN_INTERIOR_PIECES:
                continue
            interiors_profiled += 1
            families = Counter(_kit_family(p.species) for p in shell)
            family = families.most_common(1)[0][0]
            by_plugin[plugin_name]["profiled"] += 1
            by_plugin[plugin_name][f"kit:{family}"] += 1
            kit_interiors[family] += 1
            kit_pieces[family] += len(shell)
            kit_piece_names[family].update(p.species for p in shell)

            for a, b in _neighbours(shell, 512.0):
                global_snap.add_pair(a, b)
                kit_snap[family].add_pair(a, b)
            for p in shell:
                global_snap.add_piece(p)
                kit_snap[family].add_piece(p)

            rooms = chambers(shell)
            dressing = [p for p in pieces if p.category in DRESSING]
            floor_m2 = 0.0
            for room in rooms:
                dims = _extent_m(room)
                kit_chamber_dims[family].append(dims)
                all_chamber_dims.append(dims)
                floor_m2 += dims[0] * dims[1]
                kit_adj[family].add_chamber(room)
            if floor_m2 > 5:
                clutter_d = sum(
                    1 for p in dressing if p.category in {"clutter", "container", "misc"}
                ) / floor_m2 * 100
                furn_d = sum(
                    1 for p in dressing if p.category in {"furniture", "light", "signage"}
                ) / floor_m2 * 100
                kit_clutter[family].append(clutter_d)
                kit_furniture[family].append(furn_d)
            ext = _extent_m(shell)
            interior_rows.append({
                "plugin": plugin_name, "cell": edid, "kit": family,
                "shellPieces": len(shell), "dressingPieces": len(dressing),
                "chambers": len(rooms),
                "extentM": [round(v, 1) for v in ext],
                "floorM2": round(floor_m2, 1),
                "doors": sum(1 for p in pieces if p.category == "door"),
                "kitMix": families.most_common(3),
            })

    kits = {}
    for family in sorted(kit_interiors, key=lambda f: -kit_pieces[f]):
        dims = kit_chamber_dims[family]
        plan = sorted((max(d[0], d[1]), min(d[0], d[1])) for d in dims)
        kits[family] = {
            "interiors": kit_interiors[family],
            "shellPieces": kit_pieces[family],
            "distinctPieces": len(kit_piece_names[family]),
            "piecesPerInterior": round(kit_pieces[family] / kit_interiors[family], 1),
            "topPieces": [
                [name.split("/")[-1], n] for name, n in kit_piece_names[family].most_common(10)
            ],
            "chambers": len(dims),
            "chamberLongM": _pct([p[0] for p in plan]),
            "chamberShortM": _pct([p[1] for p in plan]),
            "chamberHeightSpreadM": _pct([d[2] for d in dims]),
            "clutterPer100m2": _pct(kit_clutter[family]),
            "furnitureLightPer100m2": _pct(kit_furniture[family]),
            "crossPieceJoinDistanceM": _pct(
                [v / UNITS_PER_METRE for v in kit_adj[family].join_planar_units]),
            "snap": kit_snap[family].report(),
            "adjacency": kit_adj[family].report(24),
        }

    return {
        "macro": {
            "interiorsWalked": interiors_seen,
            "interiorsProfiled": interiors_profiled,
            "byPlugin": {k: dict(v.most_common()) for k, v in by_plugin.items()},
            "chambers": len(all_chamber_dims),
            "categoryShare": {
                c: round(n / max(1, sum(category_totals.values())), 4)
                for c, n in category_totals.most_common(16)
            },
            "chamberLongM": _pct([max(d[0], d[1]) for d in all_chamber_dims]),
            "chamberShortM": _pct([min(d[0], d[1]) for d in all_chamber_dims]),
            "chamberHeightSpreadM": _pct([d[2] for d in all_chamber_dims]),
        },
        "snap": global_snap.report(),
        "kits": kits,
        "interiors": sorted(interior_rows, key=lambda r: -r["shellPieces"])[:120],
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--plugin", action="append", required=True,
                    help="mined for interiors AND read for base-object names")
    ap.add_argument("--names", action="append", default=[],
                    help="read only for base-object models/names (e.g. Skyrim.esm "
                         "when mining a mod that references it)")
    ap.add_argument("--out", required=True)
    ap.add_argument("--label", default="")
    ap.add_argument("--date", default="2026-08-31")
    args = ap.parse_args()

    plugins = [Plugin(p) for p in args.plugin]
    names = [Plugin(p) for p in args.names]
    bases = load_bases(plugins + names)
    report = mine(plugins, bases)
    report = {
        "source": {
            "label": args.label or "interior kit-assembly mining",
            "plugins": [Path(p).name for p in args.plugin],
            "nameSources": [Path(p).name for p in args.names],
            "method": "worldgen.mine_interiors — interior CELL refs; structural "
                      "categories snapped/clustered, dressing counted per chamber "
                      "floor area. Statistics only, no authored layouts.",
            "date": args.date,
            "unitsPerMetre": round(UNITS_PER_METRE, 4),
        },
        **report,
    }
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=1) + "\n")
    print(f"{report['macro']['interiorsProfiled']} interiors profiled -> {out}")


if __name__ == "__main__":
    main()
