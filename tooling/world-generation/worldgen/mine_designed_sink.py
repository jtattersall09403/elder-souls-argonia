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
   converted to metres. References at a scale other than 1.0 are dropped: the
   pivot offset scales with the mesh and the sample would mix two geometries.
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
import json
import math
import sys
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Iterable, Iterator

from . import asset_registry
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
#: ``shores``/``hoddminir``/``drjacopo``/``composite`` (no plugin at all).
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
                        for z in (low[2], high[2])]) * UNITS_PER_METRE
    world = corners @ _rotation(ref.rot).T + np.asarray(ref.pos, float)
    points = [(ref.pos[0], ref.pos[1])] + [(x, y) for x, y, _ in world]
    heights = [height_at(land, x, y, grid) for x, y in points]
    heights = [h for h in heights if h is not None]
    if not heights:
        return False
    return float(world[:, 2].min()) > max(heights) + UNSUPPORTED_GAP_M * UNITS_PER_METRE


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
             "refsJoinedMasterBase": 0, "refsPluginUnsupported": 0}
    # Round 9: a reference whose base a master defines (a Black Marsh North
    # lily pad placed from Black Marsh.esm) is measured like the plugin's own.
    index = LoadOrderIndex(pool_plugins(vault) if plugins is None else plugins)
    for pool, path in index.rows:
        name = path.name.casefold()
        wanted: dict[int, tuple[str, str]] = {}
        from_master: set[int] = set()
        for gid, (base, source) in index.visible(name).items():
            if not base.model_key:
                continue
            asset_id = index.kit_asset(joins, pool, source, base.model_key, name)
            if asset_id is not None:
                wanted[gid] = (asset_id, base.model_key)
                if source != name:
                    from_master.add(gid)
        stats["pluginsRead"] += 1
        if not wanted:
            continue
        plugin = Plugin(path)
        resolve = index.resolver.of(plugin)
        for cell in plugin.exterior_cells(with_land=True, with_refs=True,
                                            land_layers=False):
            stats["cellsWalked"] += 1
            for ref in cell.refs:
                hit = wanted.get(resolve(ref.base))
                if hit is None:
                    continue
                stats["refsJoinedMasterBase"] += resolve(ref.base) in from_master
                asset_id, model_key = hit
                entry = samples[asset_id]
                entry.base_objects.add(f"{pool}:{model_key}")
                entry.plugins.add(path.name)
                if abs(ref.scale - 1.0) > SCALE_TOLERANCE:
                    entry.scaled_refs += 1
                    continue
                stats["refsJoined"] += 1
                x, y, z = ref.pos
                terrain = (height_at(cell.land, x, y, cell.grid)
                           if cell.land is not None else None)
                water = cell.water_height
                over_water = water is not None and (
                    terrain is None or terrain < water - WATER_COVERS_GROUND_UNITS)
                if (terrain is not None and not over_water
                        and resolve(ref.form_id) in supported):
                    entry.static_supported += 1
                elif (terrain is not None and not over_water
                        and bottom_clear_of_land(kits[asset_id], ref, cell.land, cell.grid)):
                    # Round 13: it stands on something no contact test saw.
                    entry.plugin_unsupported += 1
                    stats["refsPluginUnsupported"] += 1
                elif terrain is not None and not over_water:
                    entry.sink.append((terrain - z) / UNITS_PER_METRE)
                    slope = slope_degrees_at(cell.land, x, y, cell.grid)
                    entry.slope_deg.append(
                        float("nan") if slope is None else slope)
                if over_water:
                    entry.waterline.append((water - z) / UNITS_PER_METRE)
                    if (resolve(ref.form_id) >> 24) == (resolve(ref.base) >> 24):
                        entry.waterline_own.append((water - z) / UNITS_PER_METRE)
        del plugin
        if progress:
            print(f"  {path.name}: {len(wanted)} kit base objects "
                  f"({len(from_master)} from masters)", flush=True)
    return samples, stats


def summarise(samples: dict[str, AssetSamples],
              min_samples: int = MIN_SAMPLES) -> dict[str, dict]:
    records: dict[str, dict] = {}
    for asset_id, entry in sorted(samples.items()):
        record: dict = {}
        if len(entry.sink) >= min_samples:
            p25, p50, p75 = percentiles(entry.sink)
            pairs = [(s, v) for s, v in zip(entry.slope_deg, entry.sink)
                     if not math.isnan(s)]
            gradient = least_squares_gradient([s for s, _ in pairs],
                                              [v for _, v in pairs])
            record.update({
                "p25": round(p25, 4),
                "p50": round(p50, 4),
                "p75": round(p75, 4),
                "n": len(entry.sink),
                "iqrM": round(p75 - p25, 4),
                "slopeTermMPerDeg": None if gradient is None else round(gradient, 5),
                "evidence": "plugin",
            })
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
        if not record:
            continue
        record["baseObject"] = sorted(entry.base_objects)
        record["plugins"] = sorted(entry.plugins)
        if entry.scaled_refs:
            record["refsDroppedNonUnitScale"] = entry.scaled_refs
        records[asset_id] = record
    return records


RAW_KITS_DIR = Path(__file__).resolve().parents[3] / "tooling/asset-pipeline/output/kits"


def raw_mesh_tells(raw_kits: Path = RAW_KITS_DIR) -> dict[str, dict]:
    """The mesh-sill tells of the raw kit GLBs (``pipeline.mesh_ground_line``)."""
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


def same_shape(a: dict, b: dict) -> bool:
    """Equal measured bounds and origin (``sizeM``, ``originOffsetM``)."""
    for key in ("sizeM", "originOffsetM"):
        x, y = a.get(key), b.get(key)
        if not (isinstance(x, list) and isinstance(y, list) and len(x) == len(y) == 3
                and all(abs(float(u) - float(v)) <= SAME_BOUNDS_M for u, v in zip(x, y))):
            return False
    return True


SPREAD_IQR_M = 1.0
"""A plugin sink sample wider than this (IQR) is a candidate spread row."""
SPREAD_MAX_N = 6
"""Round 20 fix (b): a spread row with fewer references than this is too thin
to outvote the mesh."""
SPREAD_HEIGHT_SHARE = 0.5
"""Round 20 fix (b): a spread over this share of the mesh height is no sink."""
PLUGIN_FIELDS = ("p25", "p50", "p75", "n", "iqrM", "slopeTermMPerDeg")


def is_plugin_spread(record: dict, kit: dict | None) -> bool:
    """Round 20 fix (b) (M19 ruling 3, scoped): a STRUCTURE piece
    (``mine_assemblies.STRUCTURAL_CATEGORIES``) whose plugin sink spreads over
    ``SPREAD_IQR_M`` with n < ``SPREAD_MAX_N`` or an IQR over half its mesh
    height: the makers set it at many depths (a trunk on cliff slopes,
    ``housetronc001``), so no one sink is designed. Rocks, plants and effects
    keep their plugin rows (0075 rock seating)."""
    if kit is None or kit.get("category") not in STRUCTURAL_CATEGORIES:
        return False
    iqr, n = record.get("iqrM", 0.0), record.get("n", 0)
    size = kit.get("sizeM")
    height = float(size[2]) if isinstance(size, list) and len(size) == 3 else 0.0
    return iqr > SPREAD_IQR_M and (n < SPREAD_MAX_N or iqr > SPREAD_HEIGHT_SHARE * height)


def complete_record(assets: dict[str, dict], kits: dict[str, dict],
                    tells: dict[str, dict],
                    bases: dict[str, str] | None = None) -> dict[str, int]:
    """Give every kit asset without plugin samples the best other evidence, IN
    the record, so every manifest writer reads one value (16h round 6: two
    writers disagreed, the kit build falling back to policy where the refresh
    used the mesh tell). Order: a composite whose bounds and origin equal its
    base piece's takes the base piece's plugin sink (``base:<id>``, round 14:
    the farmhouse with its door leaf is the farmhouse; a composite with bounds
    of its own, a quay run, keeps its own tell); a measured twin shipping the
    same mesh (``swap:<id>``); then the mesh-sill tell (``mesh-sill``, n 0).
    Assets with none keep no p50 and take the policy fallback at write time."""
    bases = composite_bases() if bases is None else bases
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
    counts = {"base": 0, "swap": 0, "mesh-sill": 0, "plugin-spread": 0}
    for asset_id in sorted(set(kits) | set(assets)):
        record = assets.get(asset_id, {})
        if asset_id in spread:
            value = tells[asset_id]["valueM"]
            record["pluginSpread"] = {key: record[key] for key in PLUGIN_FIELDS}
            record.update({"p25": value, "p50": value, "p75": value, "n": 0,
                           "iqrM": 0.0, "slopeTermMPerDeg": None,
                           "evidence": PLUGIN_SPREAD_SILL,
                           "groundLineTell": tells[asset_id]})
            counts["plugin-spread"] += 1
            continue
        if record.get("evidence") == "plugin":
            continue
        for key in ("p25", "p50", "p75", "n", "iqrM", "slopeTermMPerDeg",
                    "evidence", "groundLineTell"):
            record.pop(key, None)
        twin = twins.get(asset_id.partition(":")[2].casefold())
        base = bases.get(asset_id)
        inherits = (base in plugin and asset_id in kits and base in kits
                    and same_shape(kits[asset_id], kits[base]))
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
    return counts


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
          "cell LAND); a reference with mesh contact from below on a "
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
          "sink (evidence base:<id>), else a measured twin shipping the same mesh "
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
          "deckClearanceM (tell deck-top); neither: "
          "no p50 (policy fallback at write "
          "time). worldgen/mine_designed_sink.py")


def build_document(kits: dict[str, dict], vault: Path,
                   progress: bool = False,
                   tells: dict[str, dict] | None = None,
                   plugins: list[tuple[str, Path]] | None = None,
                   supported: set[int] | None = None, jobs: int = 5) -> dict:
    if supported is None:
        from .mine_mounts import static_supported_refs  # imports this module
        supported = static_supported_refs(kits, vault, plugins=plugins, jobs=jobs,
                                          progress=progress)
    samples, stats = measure(kits, vault, progress=progress, plugins=plugins,
                             supported=supported)
    assets = summarise(samples)
    complete_record(assets, kits, raw_mesh_tells() if tells is None else tells)
    return {
        "schemaVersion": 1,
        "source": "vanilla Skyrim.esm plus every source-mod plugin named by "
                  "worldgen.asset_registry.POOLS",
        "method": METHOD,
        "kitAssetsConsidered": len(kits),
        "assetsMeasured": len(assets),
        "refsJoined": stats["refsJoined"],
        "refsJoinedMasterBase": stats["refsJoinedMasterBase"],
        "refsStaticSupported": len(supported),
        "refsPluginUnsupported": stats["refsPluginUnsupported"],
        "assets": assets,
    }


def main(argv: Iterable[str] | None = None) -> int:
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
    args = parser.parse_args(list(argv) if argv is not None else None)

    kits = kit_assets(*(args.kits_dir or []))
    if args.complete_only:
        document = json.loads(args.out.read_text())
        counts = complete_record(document["assets"], kits, raw_mesh_tells())
        document["assetsMeasured"] = len(document["assets"])
        document["method"] = METHOD
        print(f"completed the record: {counts}")
    else:
        document = build_document(kits, args.vault, progress=not args.quiet)
    findings = evidence_findings(document["assets"])
    if findings:
        raise ValueError("; ".join(findings[:20]))
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(document, indent=1, sort_keys=False) + "\n",
                        encoding="utf-8")
    if not args.quiet:
        print(f"{document['assetsMeasured']} of {document['kitAssetsConsidered']} "
              f"kit assets measured from {document['refsJoined']} references "
              f"-> {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
