"""How far into the ground the makers sank each kit piece, measured.

Phase 16h item 1. Until now every kit asset took its burial from a per-kit
*policy* (`pipeline/config/placement-policies.json`): a hand-picked "bury this
class 0.12 m" number applied to 59 stilt pieces alike. The evidence for the
right number already exists — the mod and vanilla authors placed these exact
meshes tens of thousands of times on their own terrain, and the gap between
the ground under a reference and that reference's pivot IS the designed ground
contact.

Measured quantity (the SHARED CONTRACT for 16h, sign included):

    designedSinkM = groundZ - pivotZ          (metres, z-up)

positive means the pivot sits BELOW the local ground line. It is the same
vertical axis as a kit manifest's ``originOffsetM[2]``, and the negative of
``mine_placement.py``'s per-species ``sink_m`` (which measures pivot minus
ground for the scatter compiler; that module's contract is deliberately left
alone — see § Why a new module).

Method:

1. Read the published kit manifests, so the mine covers exactly the assets the
   game ships and nothing else.
2. For every pool in ``asset_registry.POOLS`` that names plugins, walk the
   plugin's exterior cells with LAND and references. A reference joins to a kit
   asset when the base object's ``model_key`` matches the asset id's path tail
   (``<pool>:<path>`` -> ``<path>.nif``), or, failing that, matches uniquely on
   file name and is a path suffix of it — pools whose ids carry the mod's own
   folder prefix (HTBM) need that fallback. Base records resolve through the
   plugin's on-disk masters (``LoadOrderIndex``, 16h round 9), so a reference
   to a master's base (Black Marsh North placing Black Marsh.esm's lily pads)
   is measured too.
3. Per reference: ``(terrain height under the pivot, bilinear) - pivot z``,
   converted to metres. The terrain is the placing file's own LAND for the
   cell; where that file carries none, or only a flat placeholder, it is the
   LAND of its last-loaded on-disk master that holds real terrain there (R12,
   16k walk 3: Skyfall overrides a Skyrim.esm tree and carries no LAND, so
   the tree was never measured). Rows count the references read that way
   (``refsMasterLand``) and those with no LAND anywhere (``refsNoLand``: a
   city worldspace drawing its parent's, a cell with no LAND). The ground cell
   is the one under the pivot, not the parent cell: a worldspace's persistent
   cell can carry XCLC 0,0 (SNT ferry.esp's rafts at cell -16,22) and read
   (0,0)'s LAND 116 m above them (``refsOutsideCell``); its water is that
   cell's too (the latest file defining the cell; ``refsParentCellWater``
   counts those left on the parent cell's water because none does). Every row
   seated by the mesh-sill tell instead of plugin ground says so
   (``fallback: true``) and the record counts them (``sinkFallback``).
   References at a scale other than 1.0 are left out of
   the unit-scale sample: the pivot offset scales with the mesh and the sample
   would mix two geometries. They are measured in their own group per
   placement scale (``byScale``, planner ruling 2026-09-27, scaled
   references): a composite whose part 0 is the base piece at that scale
   takes that group's sink (``base:<id>@<scale>``, BM&V's ``hutexterior``,
   placed only at 1.30).
   Decision 0105 R19: the whole-population rule (``--whole-population``)
   also reads every scaled reference, divided by its scale
   (``refsScaledNormalised``), and a tree (a TREE base 3 m or taller, not an
   aquatic plant) standing in water under ``TREE_SHALLOWS_M`` is on the
   ground (``refsTreeShallows``): the Skyfall Hist tree, one reference at
   1.40 in 1.33 m of cell water.
4. Per asset: p25/p50/p75 over the samples, n, and ``slopeTermMPerDeg`` — the
   least-squares gradient of sink against the local terrain slope in degrees,
   which is how much deeper the makers set the same piece on steeper ground.
   The record also carries the interquartile width, because that is the
   discriminator that matters downstream (below).
5. Hulls and anything else the makers put over water get
   ``designedWaterlineM``: the cell's water height minus the pivot z, same sign
   convention (positive = pivot below the surface). A cell's XCLW carries
   sentinels for "no water here"; ``esp_index._sane_height`` rejects them
   (fixed with this module — the int32-minimum spelling used to pass through
   and produced a -30,545,608 m waterline).

**anchorClass** is decided in ``worldgen/mine_mounts.py`` (its docstring holds
the rule) and applied by ``pipeline/placement_metadata.py``. This module
measures two of its terms: the sink percentiles and the waterline. The
interquartile width, not the asset's category label, is the discriminator:
every ground asset measured has IQR < 1 m and every elevated one > 2 m
(`/tmp/16h-laneA-research.md` §5).

Why a new module rather than an extension of ``mine_placement.py``: that module
aggregates by *species* (taxonomy class) at ``MIN_INSTANCES = 30`` and feeds
``compile_scatter.py``'s defaults. Per-asset architecture evidence needs a
different key (the base object) and a much lower threshold (n >= 3); changing
either in place would silently move the flora scatter defaults.

Usage:
  python3 -m worldgen.mine_designed_sink \\
      --out ../../world/sources/placement/kit-designed-sink.json
"""

from __future__ import annotations

import argparse
import contextlib
import json
import math
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Iterable, Iterator

from . import asset_registry
from .atomic_write import locked_write_text, write_lock
from .esp_index import UNITS_PER_METRE, Plugin, height_at, slope_degrees_at

REPO_ROOT = Path(__file__).resolve().parents[3]
if str(REPO_ROOT / "tooling" / "asset-pipeline") not in sys.path:
    sys.path.insert(0, str(REPO_ROOT / "tooling" / "asset-pipeline"))
# The evidence vocabulary lives once in the manifest writer (16h round 17 ruling 5).
from pipeline.placement_metadata import (  # noqa: E402
    PLUGIN_SPREAD_SILL,
    PLUGIN_UNSUPPORTED_SILL,
    SINK_EVIDENCE_PREFIXES,
    STATIC_SUPPORTED_SILL,
)

from .mine_assemblies import PLUGIN_PATH_POOLS, PLUGIN_POOLS, STRUCTURAL_CATEGORIES, pool_for  # noqa: E402

PUBLISHED_KITS_DIR = REPO_ROOT / "apps" / "world-studio" / "public" / "kits"
BUILT_KITS_DIR = REPO_ROOT / "tooling" / "asset-pipeline" / "output" / "kits"
DEFAULT_OUT = REPO_ROOT / "world" / "sources" / "placement" / "kit-designed-sink.json"

MIN_SAMPLES = 3
"""Fewest references that make an asset's percentiles evidence rather than noise."""

SCALE_TOLERANCE = 1e-3

UNSUPPORTED_GAP_M = 0.10
"""Round 13: a reference whose mesh bottom stands this far above the highest
LAND under its footprint touches nothing the terrain test can see."""

TREE_SHALLOWS_M = 2.0
"""0105 R19: a tree (a TREE base record, the plugin's own type, whose kit
mesh stands at least ``TREE_MIN_HEIGHT_M``) standing in water shallower than
this counts as on the ground: the Skyfall Hist tree stands in 1.33 m of cell
water and is rooted, not afloat."""

TREE_MIN_HEIGHT_M = 3.0
"""A TREE record under this height is a shrub, fern or floating plant (Skyrim
files lily pads and shrubs as TREE): R19 does not seat those on the bed."""

WATER_PLANT_CATEGORIES = ("aquatic-plant",)
"""Kit categories that grow in water by design (BM&V's tall kelp is a TREE
record over 3 m): their waterline is the measurement, R19 leaves them as
they were (L12 batch 1, 2026-09-28)."""

WATER_COVERS_GROUND_UNITS = 8.0
"""Ground this far under the cell's water surface counts as water, not soil.

Every exterior cell carries a water height (the worldspace default where it
sets none), so "the cell has water" says nothing. A reference is over water
only where the water surface stands clear of the ground beneath its pivot;
without this test every measured asset came back with a waterline."""


# --------------------------------------------------------------------------- #
# kit assets and the join to plugin base objects
# --------------------------------------------------------------------------- #
def kit_assets(*kits_dirs: Path) -> dict[str, dict]:
    """``assetId -> {kit, sizeM, originOffsetM}`` over every kit manifest.

    Both roots by default: the published kits the game loads and the raw build
    they are compressed from, so a kit that is built but not yet published is
    measured too (they share asset ids).
    """
    out: dict[str, dict] = {}
    roots = list(kits_dirs) or [PUBLISHED_KITS_DIR, BUILT_KITS_DIR]
    for path in sorted(q for root in roots if root.is_dir()
                       for q in root.glob("*.kit.json")):
        document = json.loads(path.read_text())
        kit = document.get("kit", path.name.removesuffix(".kit.json"))
        for asset in document.get("assets", []):
            asset_id = asset.get("id")
            if isinstance(asset_id, str):
                out.setdefault(asset_id, {
                    "kit": kit,
                    "sizeM": asset.get("sizeM"),
                    "originOffsetM": asset.get("originOffsetM"),
                    "category": asset.get("category"),
                    "variantOf": asset.get("variantOf"),
                })
    return out


def asset_tail(asset_id: str) -> str:
    """The model path a plugin would name for this asset id."""
    return asset_id.partition(":")[2].lower() + ".nif"


class PoolJoin:
    """Resolve a pool's plugin ``model_key`` to one of its kit asset ids."""

    def __init__(self, asset_ids: Iterable[str]) -> None:
        self.by_tail: dict[str, str] = {}
        by_name: dict[str, list[str]] = defaultdict(list)
        for asset_id in asset_ids:
            tail = asset_tail(asset_id)
            self.by_tail.setdefault(tail, asset_id)
            by_name[tail.rsplit("/", 1)[-1]].append(asset_id)
        # Only unambiguous file names may take the suffix fallback.
        self.by_name = {name: ids[0] for name, ids in by_name.items() if len(ids) == 1}

    def resolve(self, model_key: str) -> str | None:
        key = model_key.lower()
        hit = self.by_tail.get(key)
        if hit is not None:
            return hit
        candidate = self.by_name.get(key.rsplit("/", 1)[-1])
        if candidate is None:
            return None
        tail = asset_tail(candidate)
        if tail.endswith("/" + key) or key.endswith("/" + tail):
            return candidate
        return None


#: Pools whose mod ships a plugin that ``asset_registry.POOLS`` does not
#: declare, because the registry only needs a plugin where it improves an
#: asset's *name* or *role*. They place their own meshes in their own
#: worldspaces, so they are evidence here. Pools left out deliberately:
#: ``xanmeer``, ``sailboats`` (resource-only plugins, zero exterior
#: references) and ``hlaalu``/``rowboats``/``sbot``/``sirenroot``/
#: ``shores``/``hoddminir``/``drjacopo``/``impships``/``composite`` (no
#: plugin at all; impships' register row says so, ``plugin_evidence``).
#: ``boatsanim`` ships nine FOMOD-option plugins; its register row names the
#: variant that stands as evidence and the counts that chose it.
EXTRA_POOL_PLUGINS: dict[str, list[str]] = {
    "htbm": ["{vault}/skyrim-source/mod-sources/here-there-be-monsters-cipactli-35933"
             "/extracted/Here There Be Monsters - Curse of Cipactli.esp"],
    "ayleidcc": ["{vault}/skyrim-source/mod-sources/cc-ayleid-ruin-resources-83999"
                 "/extracted/CCAyliedRuinsResources.esp"],
    "jokerine": ["{vault}/skyrim-source/mod-sources/seashells-jokerine-4492"
                 "/extracted/Seashells SE 2/Seashells.esp"],
    "ferries": ["{vault}/skyrim-source/mod-sources/skyrim-ferries-109843"
                "/extracted/main/Ferries.esp"],
    "ferryraft": ["{vault}/skyrim-source/mod-sources/solitude-ghost-ferry-89948"
                  "/extracted/SNT ferry.esp"],
    "canoe": ["{vault}/skyrim-source/mod-sources/script-free-ship-sailing-67727"
              "/extracted/Script free ship sailing 2.3/Scriptfreeshipsailing.esp"],
    # player homes that place their own meshes (16k remine r1; the door-link
    # miner already walks both by directory)
    "xalfek": ["{vault}/skyrim-source/mod-sources/xalfek-55595/extracted/DMArgonianHaus.esp"],
    "darkwater": ["{vault}/skyrim-source/mod-sources/darkwater-den-52630/extracted"
                  "/DarkwaterDen.esp"],
    "boatsanim": ["{vault}/skyrim-source/mod-sources/boats-operational-animated-110882"
                  "/fomod-source/Boats - Operational Animated Travel/SSKMovingBoats.esp"],
}


def pool_plugins(vault: Path) -> list[tuple[str, Path]]:
    """``(pool id, plugin path)`` for every pool that names an existing plugin,
    each plugin once: a plugin two pools declare (King of the Murkmire: the
    `mwkeep` keep set it places and its own `kotm` meshes) is read once under
    the pool ``mine_assemblies.PLUGIN_POOLS`` names, and its models are split
    by path in ``LoadOrderIndex.model_pool``."""
    rows: list[tuple[str, Path]] = []
    seen: set[Path] = set()
    declared: dict[str, list[str]] = {pool.id: list(pool.plugins)
                                      for pool in asset_registry.POOLS}
    for pool_id, extra in EXTRA_POOL_PLUGINS.items():
        declared.setdefault(pool_id, []).extend(extra)
    for pool_id, templates in declared.items():
        for template in templates:
            path = asset_registry._resolve(template, vault)
            if path.exists() and path not in seen:
                seen.add(path)
                rows.append((PLUGIN_POOLS.get(path.name.lower(), pool_id), path))
    return rows


# --------------------------------------------------------------------------- #
# the load order (16h round 9)
# --------------------------------------------------------------------------- #
def plugin_masters(path: Path) -> list[str]:
    """The MAST names in a plugin's TES4 header, read without loading the file."""
    from .esp import _record_at
    with open(path, "rb") as handle:
        head = handle.read(24)
        size = int.from_bytes(head[4:8], "little")
        buf = head + handle.read(size)
    header, _ = _record_at(buf, 0)
    return [payload.rstrip(b"\0").decode("latin-1") for kind, payload in header.subrecords()
            if kind == b"MAST"]


def load_order(plugin_rows: list[tuple[str, Path]]) -> list[tuple[str, Path]]:
    """The pool as one load order: vanilla masters, then ``.esm`` files, then
    the ``.esp``/``.esl`` files (declaration order within each), with every
    on-disk master ahead of the plugins that name it."""
    rank = {pool_path: (pool_path[0] != "vanilla", pool_path[1].suffix.lower() != ".esm",
                        index)
            for index, pool_path in enumerate(plugin_rows)}
    ordered = sorted(plugin_rows, key=rank.get)
    # A master declared after its dependant (an .esp master) moves ahead of it.
    placed: list[tuple[str, Path]] = []
    by_name = {path.name.casefold(): row for row in ordered for path in [row[1]]}

    def place(row, seen=()):
        if row in placed or row in seen:
            return
        for master in plugin_masters(row[1]):
            if master.casefold() in by_name:
                place(by_name[master.casefold()], (*seen, row))
        placed.append(row)

    for row in ordered:
        place(row)
    return placed


class FormResolver:
    """Resolved form ids: ``(load-order index of the defining file) << 24 |
    low 24 bits``, so two plugins' records (and a master's record seen through
    a plugin's master index) compare equal exactly when they are one form."""

    def __init__(self, names: Iterable[str]):
        self.index: dict[str, int] = {}
        for name in names:
            self.index.setdefault(name.casefold(), len(self.index))

    def of(self, plugin: Plugin) -> Callable[[int], int]:
        masters = [self.index.setdefault(m.casefold(), len(self.index))
                   for m in plugin.masters]
        own = self.index.setdefault(plugin.path.name.casefold(), len(self.index))

        def resolve(form_id: int) -> int:
            index = form_id >> 24
            return ((masters[index] if index < len(masters) else own) << 24) \
                | (form_id & 0xFFFFFF)
        return resolve


class LoadOrderIndex:
    """Pass 1 over the pool as one load order (16h round 9): every file's base
    objects and worldspaces keyed by resolved form id, and what each plugin
    sees (its on-disk masters' bases, then its own). Shared by this miner and
    ``mine_mounts`` so a reference to a master's base is read the same way."""

    def __init__(self, plugin_rows: list[tuple[str, Path]]):
        self.rows = load_order(plugin_rows)
        self.resolver = FormResolver(path.name for _pool, path in self.rows)
        self.pool_of = {path.name.casefold(): pool for pool, path in self.rows}
        self.file_bases: dict[str, dict[int, object]] = {}
        self.masters_of: dict[str, list[str]] = {}
        self.worlds: dict[int, tuple[object, int | None]] = {}
        """resolved WRLD id -> (WorldSpace, resolved parent id); last override wins."""
        for _pool, path in self.rows:
            plugin = Plugin(path)
            resolve = self.resolver.of(plugin)
            name = path.name.casefold()
            self.masters_of[name] = [m.casefold() for m in plugin.masters]
            self.file_bases[name] = {resolve(fid): base
                                     for fid, base in plugin.base_objects().items()}
            for fid, world in plugin.worldspaces().items():
                self.worlds[resolve(fid)] = (
                    world, None if world.parent is None else resolve(world.parent))
            del plugin
        self._names = {index: name for name, index in self.resolver.index.items()}

    def file_of(self, form_id: int) -> str:
        """The (case-folded) file name that defines a resolved form id."""
        return self._names.get(form_id >> 24, "")

    def visible(self, name: str) -> dict[int, tuple[object, str]]:
        """``resolved id -> (base, defining-or-overriding file)`` as ``name``
        sees them: its on-disk masters in master order, then its own records."""
        seen: dict[int, tuple[object, str]] = {}
        for source in [m for m in self.masters_of[name] if m in self.file_bases] + [name]:
            for gid, base in self.file_bases[source].items():
                seen[gid] = (base, source)
        return seen

    def model_pool(self, name: str, model_key: str, default: str | None) -> str | None:
        """The pool a file's model belongs to: split by path for the plugins in
        ``mine_assemblies.PLUGIN_PATH_POOLS``, else ``default``."""
        return pool_for(name, model_key) if name in PLUGIN_PATH_POOLS else default

    def kit_asset(self, joins: dict[str, "PoolJoin"], pool: str, source: str,
                  model_key: str, referrer: str = "") -> str | None:
        """The kit asset a base's model is: the referencing plugin's pool
        (``referrer``, the plugin's case-folded file name, splits it by path)
        first, then the pool of the file the base comes from."""
        pool = self.model_pool(referrer, model_key, pool)
        join = joins.get(pool)
        asset_id = join.resolve(model_key) if join is not None else None
        other = self.model_pool(source, model_key, self.pool_of.get(source))
        if asset_id is None and other != pool and other in joins:
            asset_id = joins[other].resolve(model_key)
        return asset_id


# --------------------------------------------------------------------------- #
# measurement
# --------------------------------------------------------------------------- #
@dataclass
class AssetSamples:
    sink: list[float] = field(default_factory=list)
    slope_deg: list[float] = field(default_factory=list)
    waterline: list[float] = field(default_factory=list)
    waterline_own: list[float] = field(default_factory=list)
    """Waterline samples placed by the file that defines the base (round 11)."""
    base_objects: set[str] = field(default_factory=set)
    plugins: set[str] = field(default_factory=set)
    scaled_refs: int = 0
    static_supported: int = 0
    """Terrain-sample references standing on a static or kit mesh, clear of
    the LAND (round 10; round 18 ruling 2)."""
    plugin_unsupported: int = 0
    """Round 13: references whose mesh bottom stands clear above every LAND
    point under their footprint with no mesh contact seen (``totem03``)."""
    by_scale: dict[str, list[float]] = field(default_factory=lambda: defaultdict(list))
    """Planner ruling 2026-09-27 (scaled references): terrain sinks of the
    non-unit-scale references, per placement scale (``scale_key``)."""
    scaled_unit: list[float] = field(default_factory=list)
    """0105 R19: the ``by_scale`` samples each divided by its placement scale
    (the unit-scale sink the same seating gives); only the whole-population
    rule reads them."""
    tree_shallows: int = 0
    """0105 R19: TREE references in water under ``TREE_SHALLOWS_M`` read as
    on the ground."""
    scaled_dropped: int = 0
    """Scaled references left out of ``by_scale`` by the support tests (on a
    static or kit mesh, clear of the LAND, over water, no LAND)."""
    master_land: int = 0
    """R12 (16k walk 3): references read against a master's LAND because the
    placing file's cell carries none (or only a flat placeholder)."""
    no_land: int = 0
    """References with no LAND under them in the placing file or any of its
    on-disk masters (counted, never silently dropped)."""


SCALED_REFS_RULING = "planner 2026-09-27, scaled references (16k slice 2)"


def scale_key(scale: float) -> str:
    """A placement scale as a ``byScale`` key (two decimals: ``1.30``)."""
    return f"{float(scale):.2f}"


def percentiles(values: list[float]) -> tuple[float, float, float]:
    ordered = sorted(values)
    n = len(ordered)

    def at(fraction: float) -> float:
        return ordered[min(n - 1, int(fraction * n))]

    return at(0.25), at(0.50), at(0.75)


def least_squares_gradient(xs: list[float], ys: list[float]) -> float | None:
    """Gradient of y on x, or None when x does not vary enough to carry one."""
    if len(xs) < 8:
        return None
    mean_x = sum(xs) / len(xs)
    mean_y = sum(ys) / len(ys)
    denominator = sum((x - mean_x) ** 2 for x in xs)
    if denominator < 1e-9:
        return None
    return sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys)) / denominator


def _rotation(rot: tuple[float, float, float]):
    """Local -> world rotation of a reference's DATA angles (radians,
    clockwise, x then y then z; the convention of ``mine_mounts.rotation``)."""
    import numpy as np
    ax, ay, az = (-float(a) for a in rot)
    cx, sx, cy, sy, cz, sz = (math.cos(ax), math.sin(ax), math.cos(ay),
                              math.sin(ay), math.cos(az), math.sin(az))
    rx = np.array([[1, 0, 0], [0, cx, -sx], [0, sx, cx]])
    ry = np.array([[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]])
    rz = np.array([[cz, -sz, 0], [sz, cz, 0], [0, 0, 1]])
    return rz @ ry @ rx


def bottom_clear_of_land(kit: dict, ref, land, grid) -> bool:
    """The reference's bounds bottom stands more than ``UNSUPPORTED_GAP_M``
    above the highest LAND under its eight bounds corners and its pivot
    (bilinear, clamped to the cell). The bounds bottom is never above the mesh
    bottom, so this only ever under-counts."""
    import numpy as np
    size, offset = kit.get("sizeM"), kit.get("originOffsetM")
    if not (isinstance(size, list) and isinstance(offset, list)
            and len(size) == 3 and len(offset) == 3):
        return False
    low = -np.asarray(offset, float)
    high = low + np.asarray(size, float)
    corners = np.array([[x, y, z] for x in (low[0], high[0]) for y in (low[1], high[1])
                        for z in (low[2], high[2])]) * UNITS_PER_METRE * float(ref.scale)
    world = corners @ _rotation(ref.rot).T + np.asarray(ref.pos, float)
    points = [(ref.pos[0], ref.pos[1])] + [(x, y) for x, y, _ in world]
    heights = [height_at(land, x, y, grid) for x, y in points]
    heights = [h for h in heights if h is not None]
    if not heights:
        return False
    return float(world[:, 2].min()) > max(heights) + UNSUPPORTED_GAP_M * UNITS_PER_METRE


def is_real_land(land) -> bool:
    """A LAND with heights that are not one flat value (BM&V ships flat
    placeholders; ``mine_mounts.is_placeholder_land`` is the same test)."""
    if land is None or land.heights is None:
        return False
    flat = [h for row in land.heights for h in row]
    return min(flat) != max(flat)


CELL_UNITS = 4096.0


def cell_of(pos) -> tuple[int, int]:
    """The exterior grid cell holding a world position (units)."""
    return (math.floor(pos[0] / CELL_UNITS), math.floor(pos[1] / CELL_UNITS))


def master_lands(index: "LoadOrderIndex", on_disk: dict[str, Path],
                 needed: dict[str, set[tuple[int, int, int]]]
                 ) -> tuple[dict[tuple, object], dict[tuple, float | None]]:
    """R12: ``(file, (world, gx, gy)) -> LandData`` for exactly the cells
    ``needed`` names in each file (the placing file's masters, and the
    placing file itself for a reference standing outside its parent cell),
    one walk per file; and the same cells' water heights (the cell's XCLW,
    else its worldspace default), so a reference outside its parent cell
    reads the water of the cell under its pivot too."""
    lands: dict[tuple, object] = {}
    waters: dict[tuple, float | None] = {}
    for name, keys in needed.items():
        plugin = Plugin(on_disk[name])
        resolve = index.resolver.of(plugin)
        for cell in plugin.exterior_cells(with_land=True, with_refs=False,
                                          land_layers=False):
            key3 = (resolve(cell.world), *cell.grid)
            if key3 not in keys:
                continue
            waters[(name, key3)] = cell.water_height
            if cell.land is not None and cell.land.heights is not None:
                lands[(name, key3)] = cell.land
        del plugin
    return lands, waters


def measure_ref(entry: "AssetSamples", stats: dict, kit: dict, land, reading: tuple,
                supported: set[int]) -> None:
    """One reference against ``land`` (its own cell's, or a master's, R12):
    the unit-scale sink sample, the scale group, the waterline, or the count
    of why it gave none."""
    ref, grid, water, form_gid, base_gid, base_type = reading
    x, y, z = ref.pos
    terrain = height_at(land, x, y, grid) if land is not None else None
    if terrain is None:
        entry.no_land += 1
        stats["refsNoLand"] += 1
    over_water = water is not None and (
        terrain is None or terrain < water - WATER_COVERS_GROUND_UNITS)
    if (over_water and base_type == "TREE" and terrain is not None
            and float((kit.get("sizeM") or [0, 0, 0])[2]) >= TREE_MIN_HEIGHT_M
            and kit.get("category") not in WATER_PLANT_CATEGORIES
            and water - terrain < TREE_SHALLOWS_M * UNITS_PER_METRE):
        over_water = False            # R19: rooted in the shallows
        entry.tree_shallows += 1
    if abs(ref.scale - 1.0) > SCALE_TOLERANCE:
        entry.scaled_refs += 1
        # ruling 2026-09-27: its own scale group, on the same
        # terrain-support tests as the unit-scale sample. The
        # contact scan (mine_mounts) skips scaled refs, so
        # ``supported`` rarely names one; a scaled ref on a mesh
        # and clear of the LAND is caught by bottom_clear_of_land,
        # and one touching the LAND stays in (round 18 ruling 2).
        if (terrain is not None and not over_water
                and form_gid not in supported
                and not bottom_clear_of_land(kit, ref, land, grid)):
            entry.by_scale[scale_key(ref.scale)].append(
                (terrain - z) / UNITS_PER_METRE)
            entry.scaled_unit.append((terrain - z) / UNITS_PER_METRE / float(ref.scale))
        else:
            entry.scaled_dropped += 1
        return
    stats["refsJoined"] += 1
    if terrain is not None and not over_water and form_gid in supported:
        entry.static_supported += 1
    elif (terrain is not None and not over_water
            and bottom_clear_of_land(kit, ref, land, grid)):
        # Round 13: it stands on something no contact test saw.
        entry.plugin_unsupported += 1
        stats["refsPluginUnsupported"] += 1
    elif terrain is not None and not over_water:
        entry.sink.append((terrain - z) / UNITS_PER_METRE)
        slope = slope_degrees_at(land, x, y, grid)
        entry.slope_deg.append(float("nan") if slope is None else slope)
    if over_water:
        entry.waterline.append((water - z) / UNITS_PER_METRE)
        if (form_gid >> 24) == (base_gid >> 24):
            entry.waterline_own.append((water - z) / UNITS_PER_METRE)


def measure(kits: dict[str, dict], vault: Path, progress: bool = False,
            plugins: list[tuple[str, Path]] | None = None,
            supported: set[int] | None = None,
            ) -> tuple[dict[str, AssetSamples], dict]:
    """Per-asset samples. ``supported``: resolved ids of references standing
    on a static or kit mesh and clear of the LAND
    (``mine_mounts.static_supported_refs``); they are not read against the
    heightmap (16h round 10; round 18 ruling 2: a reference touching the
    terrain stays in the terrain sample whatever it overlaps)."""
    supported = supported or set()
    by_pool: dict[str, list[str]] = defaultdict(list)
    for asset_id in kits:
        by_pool[asset_id.partition(":")[0]].append(asset_id)
    joins = {pool: PoolJoin(ids) for pool, ids in by_pool.items()}

    samples: dict[str, AssetSamples] = defaultdict(AssetSamples)
    stats = {"pluginsRead": 0, "cellsWalked": 0, "refsJoined": 0,
             "refsJoinedMasterBase": 0, "refsPluginUnsupported": 0,
             "refsMasterLand": 0, "refsNoLand": 0, "refsOutsideCell": 0,
             "refsParentCellWater": 0}
    # Round 9: a reference whose base a master defines (a Black Marsh North
    # lily pad placed from Black Marsh.esm) is measured like the plugin's own.
    index = LoadOrderIndex(pool_plugins(vault) if plugins is None else plugins)
    on_disk = {path.name.casefold(): path for _pool, path in index.rows}
    # R12 (16k walk 3): a reference in a cell whose placing file carries no
    # real LAND (an override of a master's cell: Skyfall's Hist tree, the
    # Mud Mother .esl) waits until its masters' LAND for that cell is read.
    deferred: list[tuple] = []
    needed: dict[str, set[tuple[int, int, int]]] = defaultdict(set)
    for pool, path in index.rows:
        name = path.name.casefold()
        wanted: dict[int, tuple[str, str, str]] = {}
        from_master: set[int] = set()
        for gid, (base, source) in index.visible(name).items():
            if not base.model_key:
                continue
            asset_id = index.kit_asset(joins, pool, source, base.model_key, name)
            if asset_id is not None:
                wanted[gid] = (asset_id, base.model_key, base.type)
                if source != name:
                    from_master.add(gid)
        stats["pluginsRead"] += 1
        if not wanted:
            continue
        # the placing file's on-disk masters, last-loaded first
        chain = [m for m in reversed(index.masters_of[name]) if m in on_disk]
        plugin = Plugin(path)
        resolve = index.resolver.of(plugin)
        for cell in plugin.exterior_cells(with_land=True, with_refs=True,
                                            land_layers=False):
            stats["cellsWalked"] += 1
            world_gid = resolve(cell.world)
            own_real = is_real_land(cell.land)
            for ref in cell.refs:
                hit = wanted.get(resolve(ref.base))
                if hit is None:
                    continue
                stats["refsJoinedMasterBase"] += resolve(ref.base) in from_master
                asset_id, model_key, base_type = hit
                entry = samples[asset_id]
                entry.base_objects.add(f"{pool}:{model_key}")
                entry.plugins.add(path.name)
                # the ground is the LAND of the cell under the pivot: a
                # reference in the worldspace's persistent cell (XCLC 0,0 in
                # SNT ferry.esp) stands elsewhere than its parent cell
                grid = cell_of(ref.pos)
                reading = (ref, grid, cell.water_height,
                           resolve(ref.form_id), resolve(ref.base), base_type)
                if grid == cell.grid and (own_real or not chain):
                    measure_ref(entry, stats, kits[asset_id], cell.land, reading, supported)
                    continue
                if grid != cell.grid:
                    stats["refsOutsideCell"] += 1
                files = chain if grid == cell.grid else [name, *chain]
                key3 = (world_gid, *grid)
                deferred.append((asset_id, cell.land if grid == cell.grid else None,
                                 key3, files, name, reading, grid != cell.grid))
                for source in files:
                    needed[source].add(key3)
        del plugin
        if progress:
            print(f"  {path.name}: {len(wanted)} kit base objects "
                  f"({len(from_master)} from masters)", flush=True)
    lands, waters = master_lands(index, on_disk, needed)
    for asset_id, own_land, key3, chain, name, reading, outside in deferred:
        entry = samples[asset_id]
        if outside:
            # outside its parent cell: the water is the pivot cell's, from
            # the latest file that defines that cell (the placing file, then
            # its masters); the parent cell's water stands only where none does
            water = next((waters[(m, key3)] for m in chain
                          if waters.get((m, key3)) is not None), None)
            if water is None:
                stats["refsParentCellWater"] += 1
            else:
                reading = (reading[0], reading[1], water, *reading[3:])
        source = next((m for m in chain if is_real_land(lands.get((m, key3)))), None)
        land = None if source is None else lands[(source, key3)]
        if source is not None and source != name:
            entry.master_land += 1
            stats["refsMasterLand"] += 1
        else:
            # no real terrain anywhere in the chain: the placing file's flat
            # placeholder, else a master's, stands (as before R12)
            land = own_land if own_land is not None else next(
                (lands[(m, key3)] for m in chain if (m, key3) in lands), None)
        measure_ref(entry, stats, kits[asset_id], land, reading, supported)
    if progress and deferred:
        print(f"  R12: {len(deferred)} references deferred to their masters' LAND, "
              f"{stats['refsMasterLand']} read against it", flush=True)
    return samples, stats


def summarise(samples: dict[str, AssetSamples],
              min_samples: int = MIN_SAMPLES) -> dict[str, dict]:
    records: dict[str, dict] = {}
    for asset_id, entry in sorted(samples.items()):
        record: dict = {}
        # 0105 R19: the whole-population rule (min_samples below MIN_SAMPLES)
        # reads every placement the makers made, a scaled one divided by its
        # scale; the full run's unit-scale sample never mixes them
        whole = min_samples < MIN_SAMPLES and entry.scaled_unit
        sink = entry.sink + entry.scaled_unit if whole else entry.sink
        if len(sink) >= min_samples:
            p25, p50, p75 = percentiles(sink)
            pairs = [(s, v) for s, v in zip(entry.slope_deg, entry.sink)
                     if not math.isnan(s)]
            gradient = least_squares_gradient([s for s, _ in pairs],
                                              [v for _, v in pairs])
            record.update({
                "p25": round(p25, 4),
                "p50": round(p50, 4),
                "p75": round(p75, 4),
                "n": len(sink),
                "iqrM": round(p75 - p25, 4),
                "slopeTermMPerDeg": None if gradient is None else round(gradient, 5),
                "evidence": "plugin",
            })
            # 16k r8 rule 3: the spread check reads only references standing
            # on their ground (genericwell01's Skyrim.esm reference 10.77 m
            # above LAND made its IQR 10.77 m).
            grounded = [v for v in sink if v >= -CLEAR_OF_GROUND_M]
            if len(grounded) != len(sink):
                g25, _g50, g75 = (percentiles(grounded) if grounded else (0.0, 0.0, 0.0))
                record["spreadIqrM"] = round(g75 - g25, 4)
                record["spreadN"] = len(grounded)
        # Round 11: like the mounts vote, the defining file's waterline samples
        # decide while it has MIN_SAMPLES of them; else every file's.
        waterline = (entry.waterline_own if len(entry.waterline_own) >= min_samples
                     else entry.waterline)
        if len(waterline) >= min_samples:
            w25, w50, w75 = percentiles(waterline)
            record["waterline"] = {
                "p25": round(w25, 4), "p50": round(w50, 4), "p75": round(w75, 4),
                "n": len(waterline), "iqrM": round(w75 - w25, 4),
                "definingFileOnly": waterline is entry.waterline_own,
            }
        groups = {}
        for key, values in sorted(entry.by_scale.items()):
            if len(values) >= min_samples:
                s25, s50, s75 = percentiles(values)
                groups[key] = {"p25": round(s25, 4), "p50": round(s50, 4),
                               "p75": round(s75, 4), "n": len(values),
                               "iqrM": round(s75 - s25, 4)}
        if groups:
            record["byScale"] = groups
        if entry.scaled_dropped:
            record["byScaleRefsDropped"] = entry.scaled_dropped
        if entry.static_supported:
            record["refsDroppedStaticSupported"] = entry.static_supported
        if entry.plugin_unsupported:
            record["refsDroppedPluginUnsupported"] = entry.plugin_unsupported
        left_out = entry.static_supported + entry.plugin_unsupported
        if (left_out and len(entry.sink) < min_samples
                and len(entry.sink) + left_out >= min_samples):
            # Its plugin refs stand on statics or on nothing seen: the mesh
            # tell decides (evidence names which left it short).
            if entry.static_supported >= entry.plugin_unsupported:
                record["staticSupportedFallback"] = True
            else:
                record["pluginUnsupportedFallback"] = True
        if not record and not (entry.scaled_refs or entry.no_land or entry.master_land):
            # ruling 2026-09-27: a row whose every reference is scaled keeps
            # its refsDroppedNonUnitScale count (it never reads as unplaced);
            # R12: nor does one whose references found no LAND
            continue
        record["baseObject"] = sorted(entry.base_objects)
        record["plugins"] = sorted(entry.plugins)
        if entry.scaled_refs:
            record["refsDroppedNonUnitScale"] = entry.scaled_refs
        if whole and len(sink) >= min_samples:
            record["refsScaledNormalised"] = len(entry.scaled_unit)
        if entry.tree_shallows:
            record["refsTreeShallows"] = entry.tree_shallows
        if entry.master_land:
            record["refsMasterLand"] = entry.master_land
        if entry.no_land:
            record["refsNoLand"] = entry.no_land
        records[asset_id] = record
    return records


RAW_KITS_DIR = Path(__file__).resolve().parents[3] / "tooling/asset-pipeline/output/kits"


def raw_mesh_tells(raw_kits: Path = RAW_KITS_DIR) -> dict[str, dict]:
    """The mesh-sill tells of the raw kit GLBs (``pipeline.mesh_ground_line``).
    Every tell is kept: the r8 4 % floor-share rule rejected five real pieces
    and was dropped (16k fix 2 layout pre-step); the grounded-spread fix is
    what seats genericwell01."""
    import sys
    sys.path.insert(0, str(raw_kits.parents[1]))
    from pipeline.mesh_ground_line import measure_mesh_tells
    return measure_mesh_tells(raw_kits)


KIT_CONFIG_DIR = RAW_KITS_DIR.parents[1] / "pipeline" / "config" / "kits"
SAME_BOUNDS_M = 1e-3
"""A composite whose sizeM and originOffsetM each match its base piece's to
this is the base piece's shape (round 14)."""


def composite_bases(config_dir: Path = KIT_CONFIG_DIR) -> dict[str, str]:
    """``composite id -> its base piece`` (``compose.parts[0]``, the part at
    the composite's origin) from the kit build configs (read only)."""
    bases: dict[str, str] = {}
    for path in sorted(config_dir.glob("*.json")):
        try:
            entries = json.loads(path.read_text()).get("assets", [])
        except (OSError, ValueError):
            continue
        for entry in entries:
            parts = (entry.get("compose") or {}).get("parts") or []
            if isinstance(entry.get("asset"), str) and parts and "offsetM" not in parts[0]:
                bases.setdefault(entry["asset"], parts[0]["asset"])
    return bases


def composite_posed_bases(config_dir: Path = KIT_CONFIG_DIR) -> set[str]:
    """Composites whose part 0 turns its base piece into the plugin's own pose
    (``pitchDeg``/``rollDeg`` on part 0, no offset: the KotM pod turned over
    as its references place it, walk 2 lane P, planner 2026-09-27). The pivot
    is the base's pivot and the base's plugin references are these placements,
    so the base's plugin sink is the composite's whatever parts it adds."""
    posed: set[str] = set()
    for path in sorted(config_dir.glob("*.json")):
        try:
            entries = json.loads(path.read_text()).get("assets", [])
        except (OSError, ValueError):
            continue
        for entry in entries:
            parts = (entry.get("compose") or {}).get("parts") or []
            if (isinstance(entry.get("asset"), str) and parts and "offsetM" not in parts[0]
                    and any(float(parts[0].get(k) or 0.0) for k in ("pitchDeg", "rollDeg"))):
                posed.add(entry["asset"])
    return posed


def composite_base_scales(config_dir: Path = KIT_CONFIG_DIR) -> dict[str, float]:
    """Composites whose part 0 (no offset) carries a non-unit ``scale``: the
    base piece at the scale the plugin places it (``hut-with-entrance``, the
    hut at 1.30; planner ruling 2026-09-27, scaled references). Such a
    composite takes the base's ``byScale`` group at that scale."""
    scales: dict[str, float] = {}
    for path in sorted(config_dir.glob("*.json")):
        try:
            entries = json.loads(path.read_text()).get("assets", [])
        except (OSError, ValueError):
            continue
        for entry in entries:
            parts = (entry.get("compose") or {}).get("parts") or []
            if isinstance(entry.get("asset"), str) and parts and "offsetM" not in parts[0]:
                scale = float(parts[0].get("scale") or 1.0)
                if abs(scale - 1.0) > SCALE_TOLERANCE:
                    scales.setdefault(entry["asset"], scale)
    return scales


COMPOSITE_SEATED_BY_PART: dict[str, tuple[str, str]] = {
    # composite id -> (the part whose plugin sink seats it, the ruling)
    "composite:mud/kotm-house-pod": (
        "kotm:argonia/mudhuts/smpodextdoor",
        "planner ruling 2026-09-27 walk 2 round 5: the entrance height the plugin "
        "builds; the pod's own sink (1.6468) left the porch 0.35 m high"),
}
"""A composite seated by one of its parts: the porch the plugin builds the
entrance on, not the base shell (walk 2 round 5). Its sink is that part's
plugin sink carried to the composite's pivot through the part's ``offsetM``
z (sink = ground - pivot, and the part's pivot stands offset z above the
composite's), ``part:<id>``. It outranks the base rule."""


def composite_part_offsets(config_dir: Path = KIT_CONFIG_DIR) -> dict[str, dict[str, list[dict]]]:
    """``composite id -> {part asset -> [its compose part entries]}`` from the
    kit build configs (read only). Every entry is kept, so a part placed twice
    is seen twice and `seat_row` refuses it as ambiguous; the composite's own
    ``anchorScale`` rides on each entry as ``_anchorScale``."""
    offsets: dict[str, dict[str, list[dict]]] = {}
    for path in sorted(config_dir.glob("*.json")):
        try:
            entries = json.loads(path.read_text()).get("assets", [])
        except (OSError, ValueError):
            continue
        for entry in entries:
            compose = entry.get("compose") or {}
            parts = compose.get("parts") or []
            if isinstance(entry.get("asset"), str) and parts:
                row = offsets.setdefault(entry["asset"], {})
                for part in parts:
                    row.setdefault(part["asset"], []).append(
                        {**part, "_anchorScale": compose.get("anchorScale", 1.0)})
    return offsets


def seat_row(asset_id: str, part: str, ruling: str, source: dict | None,
             entries: list[dict] | None) -> dict:
    """The record row of a composite seated by ``part`` (COMPOSITE_SEATED_BY_PART):
    the part's plugin sink plus the part's offsetM z. Refuses what the z shift
    does not model: no plugin row for the part, the part absent or placed more
    than once in the composite, or a part or anchor that is scaled, pitched or
    rolled (the part's sink would then not carry through a plain z offset)."""
    if not source or source.get("evidence") != "plugin" or "p50" not in source:
        raise ValueError(f"{asset_id}: seated by {part}, which has no plugin sink row")
    if not entries:
        raise ValueError(f"{asset_id}: seated by {part}, which is not one of its parts")
    if len(entries) != 1:
        raise ValueError(f"{asset_id}: seated by {part}, placed {len(entries)} times in it")
    entry = entries[0]
    for key, neutral in (("scale", 1.0), ("_anchorScale", 1.0), ("pitchDeg", 0.0),
                         ("rollDeg", 0.0), ("partScaleInAnchor", 1.0)):
        if abs(float(entry.get(key, neutral)) - neutral) > 1e-9:
            raise ValueError(f"{asset_id}: seated by {part}, whose {key.lstrip('_')} is "
                             f"{entry[key]}; a part-seated sink models a z offset only")
    dz = float((entry.get("offsetM") or [0.0, 0.0, 0.0])[2])
    row = {key: round(source[key] + dz, 4) for key in ("p25", "p50", "p75")}
    row.update({key: source[key] for key in ("n", "iqrM", "slopeTermMPerDeg")})
    row["evidence"] = f"part:{part}"
    row["seatedBy"] = {"part": part, "partP50": source["p50"], "partOffsetZM": dz,
                       "ruling": ruling}
    return row


def same_shape(a: dict, b: dict) -> bool:
    """Equal measured bounds and origin (``sizeM``, ``originOffsetM``)."""
    for key in ("sizeM", "originOffsetM"):
        x, y = a.get(key), b.get(key)
        if not (isinstance(x, list) and isinstance(y, list) and len(x) == len(y) == 3
                and all(abs(float(u) - float(v)) <= SAME_BOUNDS_M for u, v in zip(x, y))):
            return False
    return True


CLEAR_OF_GROUND_M = 1.0
"""16k r8 rule 3: a reference whose pivot stands more than this above its
LAND stands clear of the ground; the spread check ignores it."""
SPREAD_IQR_M = 1.0
"""A plugin sink sample wider than this (IQR) is a candidate spread row."""
SPREAD_MAX_N = 6
"""Round 20 fix (b): a spread row with fewer references than this is too thin
to outvote the mesh."""
SPREAD_HEIGHT_SHARE = 0.5
"""Round 20 fix (b): a spread over this share of the mesh height is no sink."""
PLUGIN_FIELDS = ("p25", "p50", "p75", "n", "iqrM", "slopeTermMPerDeg", "spreadIqrM", "spreadN")


def is_plugin_spread(record: dict, kit: dict | None) -> bool:
    """Round 20 fix (b) (M19 ruling 3, scoped): a STRUCTURE piece
    (``mine_assemblies.STRUCTURAL_CATEGORIES``) whose plugin sink spreads over
    ``SPREAD_IQR_M`` with n < ``SPREAD_MAX_N`` or an IQR over half its mesh
    height: the makers set it at many depths (a trunk on cliff slopes,
    ``housetronc001``), so no one sink is designed. Rocks, plants and effects
    keep their plugin rows (0075 rock seating)."""
    if kit is None or kit.get("category") not in STRUCTURAL_CATEGORIES:
        return False
    iqr = record.get("spreadIqrM", record.get("iqrM", 0.0))
    n = record.get("spreadN", record.get("n", 0))
    size = kit.get("sizeM")
    height = float(size[2]) if isinstance(size, list) and len(size) == 3 else 0.0
    return iqr > SPREAD_IQR_M and (n < SPREAD_MAX_N or iqr > SPREAD_HEIGHT_SHARE * height)


def complete_record(assets: dict[str, dict], kits: dict[str, dict],
                    tells: dict[str, dict],
                    bases: dict[str, str] | None = None,
                    posed: set[str] | None = None,
                    part_offsets: dict[str, dict[str, list[dict]]] | None = None,
                    seated_by: dict[str, tuple[str, str]] | None = None,
                    known: dict[str, dict] | None = None,
                    base_scales: dict[str, float] | None = None) -> dict[str, int]:
    """Give every kit asset without plugin samples the best other evidence, IN
    the record, so every manifest writer reads one value (16h round 6: two
    writers disagreed, the kit build falling back to policy where the refresh
    used the mesh tell). Order: a composite whose bounds and origin equal its
    base piece's takes the base piece's plugin sink (``base:<id>``, round 14:
    the farmhouse with its door leaf is the farmhouse; a composite with bounds
    of its own, a quay run, keeps its own tell, unless its part 0 carries the
    plugin's pose, ``composite_posed_bases``); ahead of that, a composite
    named in ``COMPOSITE_SEATED_BY_PART`` takes its named part's plugin sink
    plus the part's offsetM z (``part:<id>``); a composite whose part 0 is
    its base at a non-unit scale takes the base's plugin sink at that scale
    (``base:<id>@<scale>``, ``composite_base_scales``, planner ruling
    2026-09-27); a measured twin shipping the
    same mesh (``swap:<id>``); then the mesh-sill tell (``mesh-sill``, n 0).
    Assets with none keep no p50 and take the policy fallback at write time."""
    bases = composite_bases() if bases is None else bases
    posed = composite_posed_bases() if posed is None else posed
    part_offsets = composite_part_offsets() if part_offsets is None else part_offsets
    seated_by = COMPOSITE_SEATED_BY_PART if seated_by is None else seated_by
    base_scales = composite_base_scales() if base_scales is None else base_scales
    for record in assets.values():
        # Idempotent: a spread row keeps its plugin measurement in pluginSpread.
        if record.get("evidence") == PLUGIN_SPREAD_SILL and "pluginSpread" in record:
            record.update(record.pop("pluginSpread"), evidence="plugin")
            record.pop("groundLineTell", None)
    spread = {asset_id for asset_id, record in assets.items()
              if record.get("evidence") == "plugin" and asset_id in tells
              and is_plugin_spread(record, kits.get(asset_id))}
    plugin = {asset_id: record for asset_id, record in sorted(assets.items())
              if record.get("evidence") == "plugin" and asset_id not in spread}
    twins: dict[str, str] = {}
    for asset_id in plugin:
        twins.setdefault(asset_id.partition(":")[2].casefold(), asset_id)
    counts = {"part": 0, "base": 0, "swap": 0, "mesh-sill": 0, "plugin-spread": 0}
    for asset_id in sorted(set(kits) | set(assets)):
        record = assets.get(asset_id, {})
        if asset_id in spread:
            value = tells[asset_id]["valueM"]
            record["pluginSpread"] = {key: record[key] for key in PLUGIN_FIELDS if key in record}
            for key in ("spreadIqrM", "spreadN"):
                record.pop(key, None)
            record.update({"p25": value, "p50": value, "p75": value, "n": 0,
                           "iqrM": 0.0, "slopeTermMPerDeg": None,
                           "evidence": PLUGIN_SPREAD_SILL,
                           "groundLineTell": tells[asset_id]})
            counts["plugin-spread"] += 1
            continue
        if record.get("evidence") == "plugin":
            continue
        for key in ("p25", "p50", "p75", "n", "iqrM", "slopeTermMPerDeg",
                    "evidence", "groundLineTell", "spreadIqrM", "spreadN", "seatedBy",
                    "scaleGroup"):
            record.pop(key, None)
        seat = seated_by.get(asset_id)
        if seat is not None and asset_id in kits:
            part, ruling = seat
            # a per-asset run (--merge) measures the composite without its
            # part: the part's committed plugin row (``known``) stands in
            source = plugin.get(part) or (known or {}).get(part)
            record = seat_row(asset_id, part, ruling, source,
                              (part_offsets.get(asset_id) or {}).get(part))
            counts["part"] += 1
            assets[asset_id] = record
            continue
        twin = twins.get(asset_id.partition(":")[2].casefold())
        base = bases.get(asset_id)
        scaled = base_scales.get(asset_id)
        group = (((assets.get(base) or (known or {}).get(base) or {}).get("byScale") or {})
                 .get(scale_key(scaled)) if scaled is not None and base else None)
        if group is not None and asset_id in kits and base in kits:
            record.update({key: group[key] for key in ("p25", "p50", "p75", "n", "iqrM")})
            record["slopeTermMPerDeg"] = None
            record["evidence"] = f"base:{base}@{scale_key(scaled)}"
            record["scaleGroup"] = {"base": base, "scale": scale_key(scaled),
                                    "ruling": SCALED_REFS_RULING}
            counts["base"] += 1
            assets[asset_id] = record
            continue
        inherits = (base in plugin and asset_id in kits and base in kits
                    and (asset_id in posed or same_shape(kits[asset_id], kits[base])))
        fallback = (STATIC_SUPPORTED_SILL if record.get("staticSupportedFallback")
                    else PLUGIN_UNSUPPORTED_SILL if record.get("pluginUnsupportedFallback")
                    else None)
        if fallback is not None and asset_id in tells:
            # 16h rounds 10 and 13: its placements stand on statics, or on
            # nothing the contact test saw, so the plugin sink is not a ground
            # line; the mesh tell is.
            value = tells[asset_id]["valueM"]
            record.update({"p25": value, "p50": value, "p75": value, "n": 0,
                           "iqrM": 0.0, "slopeTermMPerDeg": None,
                           "evidence": fallback,
                           "groundLineTell": tells[asset_id]})
            counts["mesh-sill"] += 1
        elif inherits:
            source = plugin[base]
            record.update({key: source[key] for key in
                           ("p25", "p50", "p75", "n", "iqrM", "slopeTermMPerDeg")})
            record["evidence"] = f"base:{base}"
            counts["base"] += 1
        elif twin is not None and twin != asset_id:
            source = plugin[twin]
            record.update({key: source[key] for key in
                           ("p25", "p50", "p75", "n", "iqrM", "slopeTermMPerDeg")})
            record["evidence"] = f"swap:{twin}"
            counts["swap"] += 1
        elif asset_id in tells:
            value = tells[asset_id]["valueM"]
            record.update({"p25": value, "p50": value, "p75": value, "n": 0,
                           "iqrM": 0.0, "slopeTermMPerDeg": None,
                           "evidence": "mesh-sill",
                           "groundLineTell": tells[asset_id]})
            counts["mesh-sill"] += 1
        if record:
            assets[asset_id] = record
    counts["variant"] = resolve_variants(assets, kits)
    mark_fallbacks(assets)
    return counts


SINK_FIELDS = ("p25", "p50", "p75", "n", "iqrM", "slopeTermMPerDeg", "evidence",
               "groundLineTell", "seatedBy", "scaleGroup", "fallback")


def resolve_variants(assets: dict[str, dict], kits: dict[str, dict]) -> int:
    """A texture variant (manifest ``variantOf``, the sick Hist tree) ships
    its base's mesh, so it takes its base's row: a plugin row as
    ``swap:<base>``, any other evidence as the base carries it (walk 3 L5
    rec 2, the miner side). Returns the rows resolved."""
    resolved = 0
    for asset_id, kit in sorted(kits.items()):
        base = kit.get("variantOf")
        source = assets.get(base) if isinstance(base, str) else None
        if not source or "p50" not in source:
            continue
        row = {key: source[key] for key in SINK_FIELDS if key in source}
        if row.get("evidence") == "plugin":
            row["evidence"] = f"swap:{base}"
        row["variantOf"] = base
        assets[asset_id] = row
        resolved += 1
    return resolved


FALLBACK_RULING = "R12 (16k walk 3, decision 0105 addendum)"


def mark_fallbacks(assets: dict[str, dict]) -> None:
    """R12: a row seated by the mesh's lowest-vertex tell, not by plugin
    ground, says so (``fallback: true``); every other row carries no flag."""
    for record in assets.values():
        if str(record.get("evidence", "")).startswith("mesh-sill"):
            record["fallback"] = True
        else:
            record.pop("fallback", None)


def fallback_summary(assets: dict[str, dict]) -> dict:
    """R12: the fallback rows counted for the record and the miner's report."""
    from collections import Counter
    by = Counter(str(r["evidence"]) for r in assets.values() if r.get("fallback"))
    return {"rows": sum(by.values()), "of": len(assets),
            "byEvidence": dict(sorted(by.items())), "ruling": FALLBACK_RULING}


def evidence_findings(assets: dict[str, dict]) -> list[str]:
    """Rows whose evidence is outside the vocabulary (placement_metadata)."""
    return [f"{asset_id}: sink evidence {record.get('evidence')!r} is not in "
            "placement_metadata.EVIDENCE_VOCABULARY"
            for asset_id, record in sorted(assets.items())
            if "evidence" in record
            and not str(record["evidence"]).startswith(SINK_EVIDENCE_PREFIXES)]


METHOD = ("designedSinkM = groundZ - pivotZ (metres, z-up, positive = "
          "pivot below the ground line) per exterior reference at unit "
          "scale; terrain from esp_index.height_at (bilinear on the "
          "LAND of the cell under the pivot, which for a reference in a "
          "worldspace's persistent cell is not its parent cell, refsOutsideCell, "
          "whose water it reads too, refsParentCellWater where no file defines it; "
          "where the placing file carries no real LAND there, "
          "the LAND of its last-loaded on-disk master that has one, R12, "
          "refsMasterLand; references with no LAND anywhere are counted, "
          "refsNoLand); a reference with mesh contact from below on a "
          "static or kit piece (worldgen/mine_mounts.py contact) is left "
          "out, and so is one whose bounds bottom stands more than 0.10 m "
          "above the highest LAND under its corners and pivot with no "
          "contact seen (refsDroppedPluginUnsupported); percentiles over n >= 3 references; "
          "slopeTermMPerDeg = least-squares gradient of sink on local "
          "terrain slope in degrees; designedWaterlineM from the cell "
          "water height on the same sign convention (the defining file's "
          "references only when it has 3 or more). Assets without "
          "n >= 3 samples: a composite whose bounds and origin equal its "
          "base piece's (compose.parts[0]) takes the base piece's plugin "
          "sink (evidence base:<id>; so does one whose part 0 carries the "
          "plugin's pitch/roll, the pose its references hold; one whose part 0 "
          "is its base at a non-unit scale takes the base's plugin sink over "
          "the references at that scale, byScale, evidence base:<id>@<scale>, "
          "planner ruling 2026-09-27), else a measured twin shipping the same mesh "
          "(evidence swap:<id>), else the mesh-sill ground-line tell of "
          "the raw kit GLB (pipeline/mesh_ground_line.py, evidence "
          "mesh-sill, n 0; evidence 'mesh-sill (plugin refs static-supported)' "
          "when the left-out references are what left it short, 'mesh-sill "
          "(plugin-unsupported)' when the unsupported ones are); a structure "
          "piece (architecture, ruin, dungeon-kit, bridge) whose plugin IQR "
          "exceeds 1.0 m with n < 6 or over half its mesh height takes its "
          "mesh-sill tell (evidence 'mesh-sill (plugin-spread)', the plugin "
          "percentiles kept in pluginSpread); a stilt-fit "
          "asset's mesh tell is its deck top minus the stilt policy's "
          "deckClearanceM (tell deck-top); every mesh-sill row carries "
          "fallback: true and the record counts them (sinkFallback, R12); "
          "a texture variant (manifest variantOf) takes its base's row "
          "(a plugin row as swap:<base>); neither: "
          "no p50 (policy fallback at write "
          "time). worldgen/mine_designed_sink.py")


def build_document(kits: dict[str, dict], vault: Path,
                   progress: bool = False,
                   tells: dict[str, dict] | None = None,
                   plugins: list[tuple[str, Path]] | None = None,
                   supported: set[int] | None = None, jobs: int = 5,
                   min_samples: int = MIN_SAMPLES,
                   known: dict[str, dict] | None = None) -> dict:
    if supported is None:
        from .mine_mounts import static_supported_refs  # imports this module
        supported = static_supported_refs(kits, vault, plugins=plugins, jobs=jobs,
                                          progress=progress)
    samples, stats = measure(kits, vault, progress=progress, plugins=plugins,
                             supported=supported)
    assets = summarise(samples, min_samples)
    if tells is None:
        tells = raw_mesh_tells()
    complete_record(assets, kits, tells, known=known)
    from .mine_assemblies import provenance
    walked = pool_plugins(vault) if plugins is None else plugins
    return {
        "schemaVersion": 1,
        "provenance": provenance(__file__, [path.name for _pool, path in walked],
                                 [pool for pool, _path in walked]),
        "source": "vanilla Skyrim.esm plus every source-mod plugin named by "
                  "worldgen.asset_registry.POOLS",
        "method": METHOD,
        "kitAssetsConsidered": len(kits),
        "assetsMeasured": len(assets),
        "refsJoined": stats["refsJoined"],
        "refsJoinedMasterBase": stats["refsJoinedMasterBase"],
        "refsStaticSupported": len(supported),
        "refsPluginUnsupported": stats["refsPluginUnsupported"],
        "refsMasterLand": stats["refsMasterLand"],
        "refsNoLand": stats["refsNoLand"],
        "refsOutsideCell": stats["refsOutsideCell"],
        "refsParentCellWater": stats["refsParentCellWater"],
        "sinkFallback": fallback_summary(assets),
        "assets": assets,
    }


def mark_whole_population(asset_id: str, row: dict, ruling: str) -> None:
    """A row measured below MIN_SAMPLES is the record only when its samples
    are every placement the makers made: plugin evidence, no reference
    dropped for scale, static support or no support. Marks the row with the
    ruling; refuses anything else by name (a dropped reference means the
    sample is not the population)."""
    dropped = {k: row[k] for k in ("refsDroppedNonUnitScale", "refsDroppedStaticSupported",
                                   "refsDroppedPluginUnsupported", "byScaleRefsDropped")
               if row.get(k)}
    # 0105 R19: scaled references divided by their scale are in the sample
    if dropped.get("refsDroppedNonUnitScale") == row.get("refsScaledNormalised"):
        dropped.pop("refsDroppedNonUnitScale")
    if row.get("evidence") != "plugin" or dropped:
        raise SystemExit(f"{asset_id}: not a whole-population plugin sample "
                         f"(evidence {row.get('evidence')!r}, dropped {dropped})")
    row["wholePopulation"] = {"n": row["n"], "minSamples": MIN_SAMPLES, "ruling": ruling}


def sample_assets(kits: dict[str, dict], n: int, seed: int,
                  always: Iterable[str] = ()) -> list[str]:
    """``--sample N --seed S``: N kit asset ids drawn seeded from the sorted
    ids, plus the named ones (write their expected p50 first, kit-mining §3)."""
    import random
    named = [a for a in always if a in kits]
    rest = sorted(set(kits) - set(named))
    return sorted(named + random.Random(seed).sample(rest, min(n, len(rest))))


def main(argv: Iterable[str] | None = None) -> int:
    """The CLI, holding the kit-list lock SHARED (16k r8 rule 4): no kit
    build rewrites the manifests this run reads."""
    from . import mine_designed_sink  # noqa: F401  (puts pipeline/ on the path)
    from pipeline.kit_lock import kit_list_lock
    with kit_list_lock("shared", "mine_designed_sink"):
        return _main(argv)


def _main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--kits-dir", type=Path, action="append", default=None,
                        help="kit manifest directory; repeatable "
                             "(default: published kits plus the raw build)")
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--vault", type=Path, default=asset_registry.DEFAULT_VAULT)
    parser.add_argument("--quiet", action="store_true")
    parser.add_argument("--complete-only", action="store_true",
                        help="keep the mined plugin samples in --out and only "
                             "re-derive the swap and mesh-sill entries")
    parser.add_argument("--sample", type=int, default=None,
                        help="sample-first batch: measure N seeded kit assets (plus "
                             "--assets) and write them to --out, never the record")
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--rule-change", action="store_true",
                        help="names a full run as one a miner rule change needs (the "
                             "preflight_guard hook refuses a full run without it, 0106)")
    parser.add_argument("--assets", nargs="+", default=[],
                        help="with --sample: always include these asset ids")
    parser.add_argument("--merge", action="store_true",
                        help="per-asset sink run (16k r7 rule 4): measure only --assets "
                             "and replace their rows in the tracked record (--out)")
    parser.add_argument("--whole-population", default=None, metavar="RULING",
                        help="with --merge: every named asset's plugin references, fewer "
                             "than MIN_SAMPLES, are ALL the placements its makers made "
                             "(none dropped as scaled, static-supported or unsupported), "
                             "so they are the record (16k walk 2 T1: KotM mudhut01, one "
                             "reference); RULING names who ruled it and is written on the row")
    parser.add_argument("--ruling", default=None,
                        help="with --merge: the ruling this per-asset re-mine applies; "
                             "written to provenance.merges with the assets, date and miner "
                             "version")
    args = parser.parse_args(list(argv) if argv is not None else None)

    if args.ruling and not args.merge:
        raise SystemExit("--ruling is written by --merge only")
    kits = kit_assets(*(args.kits_dir or []))
    if args.merge:
        if args.sample is not None or args.complete_only or not args.assets:
            raise SystemExit("--merge takes --assets only (no --sample, no --complete-only)")
        missing = [a for a in args.assets if a not in kits]
        if missing:
            raise SystemExit(f"not a kit asset: {missing}")
        got = build_document({a: kits[a] for a in args.assets}, args.vault,
                             progress=not args.quiet,
                             min_samples=1 if args.whole_population else MIN_SAMPLES,
                             known=json.loads(args.out.read_text())["assets"])["assets"]
        # read, merge and write under the record's write lock: two lanes merging
        # at once each wrote the record they had read before measuring, and the
        # later dump dropped the other's rows (16k walk 9: the type-5 lane's
        # rockcaveentrance02 row lost to the dressing lane's 1 s later)
        held = contextlib.ExitStack()
        held.enter_context(write_lock(args.out))
        record = json.loads(args.out.read_text())
        for asset in args.assets:
            if asset not in got:
                raise SystemExit(f"{asset}: the run measured no row")
            if args.whole_population:
                mark_whole_population(asset, got[asset], args.whole_population)
            record["assets"][asset] = got[asset]
        # a re-mined base carries the composites that place it at a scale
        base_scales = composite_base_scales()
        scaled_comps = {comp for comp, base in composite_bases().items()
                        if base in args.assets and comp in base_scales
                        and comp in record["assets"] and comp not in args.assets}
        if scaled_comps:
            carried = {comp: {} for comp in scaled_comps}
            complete_record(carried, {c: kits[c] for c in scaled_comps if c in kits}
                            | {b: kits[b] for b in args.assets},
                            {}, known=record["assets"])
            for comp in sorted(scaled_comps):
                # whatever the re-completion gives (a group gone below
                # MIN_SAMPLES falls back to the tell), never the stale row
                if carried.get(comp):
                    record["assets"][comp] = carried[comp]
                else:
                    record["assets"].pop(comp, None)
        # a re-mined seating part carries its composites with it
        offsets = composite_part_offsets()
        for comp, (part, ruling) in sorted(COMPOSITE_SEATED_BY_PART.items()):
            if part in args.assets and comp in record["assets"]:
                try:
                    record["assets"][comp] = seat_row(comp, part, ruling,
                                                      record["assets"].get(part),
                                                      (offsets.get(comp) or {}).get(part))
                except ValueError as exc:
                    raise SystemExit(f"refused, the record is unchanged: {exc}") from None
        # a re-mined base carries its texture variants (L12: the sick Hist
        # tree kept the base's old mesh-sill row after the R19 merge)
        variants = {v: row for v, row in kits.items() if row.get("variantOf") in args.assets}
        if variants:
            resolve_variants(record["assets"], variants)
        mark_fallbacks(record["assets"])
        record["assetsMeasured"] = len(record["assets"])
        record["sinkFallback"] = fallback_summary(record["assets"])
        if args.ruling:
            from datetime import date
            from .mine_assemblies import provenance as _provenance
            version = _provenance(__file__, [], []).get("minerVersion")
            record.setdefault("provenance", {}).setdefault("merges", []).append({
                "assets": list(args.assets), "ruling": args.ruling,
                "runDate": date.today().isoformat(), "minerVersion": version})
        findings = evidence_findings(record["assets"])
        if findings:
            raise ValueError("; ".join(findings[:20]))
        locked_write_text(args.out, json.dumps(record, indent=1, sort_keys=False) + "\n")
        held.close()
        print(json.dumps({a: record["assets"][a] for a in args.assets}, indent=1))
        return 0
    if args.sample is not None:
        if args.out.resolve() == DEFAULT_OUT.resolve():
            raise SystemExit("--sample never writes the tracked record")
        kits = {a: kits[a] for a in sample_assets(kits, args.sample, args.seed, args.assets)}
    if args.complete_only:
        document = json.loads(args.out.read_text())
        tells = raw_mesh_tells()
        document.pop("floorTellsRejected", None)
        counts = complete_record(document["assets"], kits, tells)
        document["assetsMeasured"] = len(document["assets"])
        document["method"] = METHOD
        document["sinkFallback"] = fallback_summary(document["assets"])
        print(f"completed the record: {counts}")
    else:
        document = build_document(kits, args.vault, progress=not args.quiet)
    findings = evidence_findings(document["assets"])
    if findings:
        raise ValueError("; ".join(findings[:20]))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(document, indent=1, sort_keys=False) + "\n",
                        encoding="utf-8")
    if "sinkFallback" in document:
        print(f"sink fallback rows: {document['sinkFallback']['rows']} of "
              f"{document['sinkFallback']['of']}")
    if not args.quiet:
        print(f"{document['assetsMeasured']} of {document['kitAssetsConsidered']} "
              f"kit assets measured from {document['refsJoined']} references "
              f"-> {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
