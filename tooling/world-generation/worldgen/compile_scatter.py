"""Compile vegetation scatter for the province from the committed rasters.

Reads exactly the data the runtime reads — the studio's height, water, region
and ground-control rasters — so the compiler and the game can never disagree
about where the waterline is (00-core: rendering and gameplay sample the same
water data). Emits one `vegetation-instances.bin` per chunk plus an index.

Usage:
  python3 -m worldgen.compile_scatter --palettes world/sources/flora/palettes.json
  python3 -m worldgen.compile_scatter --chunk 8,8 --chunk 3,12 --report
  python3 -m worldgen.compile_scatter --out <dir> --footprint chain-footprint.json

INCREMENTAL. `--footprint` re-scatters only the chunks that intersect the
changed region and merges them into the existing index in the full grid's
order, so the index after an incremental run is the file a full run would have
written. The changed region is the footprint UNIONED with what actually moved
in this compiler's own inputs — the height, water and ground-control rasters
are diffed against snapshots of the ones it last read, because a dredge moves
the waterline, the waterline moves the shore field, and the shore field bands
the reed belts a chunk or two further out than the cut itself. A missing
snapshot means no measurement, and no measurement means every chunk.
"""

from __future__ import annotations

import argparse
import json
import math
from collections import Counter
from dataclasses import replace
from multiprocessing import Pool, cpu_count
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

from . import dressing_zones as dz
from . import rock_dressing as rd
from .composition import Composition
from .regions import REGION_CLASSES
from .routes_raster import major_corridor_masks
from .scale import PROVINCE_EXTENT_M, RAW_M
from .scatter import (ANCHOR_TERRAIN, CLIFF_SLOPE_DEG, ROUTE_CLEAR, ROUTE_CONDITION_SHIFT,
                      ROUTE_THIN, Fields, Instance, Palette, clark_evans, encode,
                      scatter_chunk)
from .water_report import CHANNEL_REACH_KINDS, ShippedWater, WATER_DIR

REPO_ROOT = Path(__file__).resolve().parents[3]
PROVINCE = REPO_ROOT / "apps" / "world-studio" / "public" / "province"
CHUNK_SAMPLES = 256                       # matches compile_chunks
CHUNK_M = CHUNK_SAMPLES * RAW_M           # 467.9 m
DEFAULT_SEED = 0x5CA77E5
#: `ShippedWater.season_index_grid` index -> the graph's season name.
SEASON_NAMES = ("none", "perennial", "seasonal", "ephemeral")
#: How anything downstream names one plant (16f). Written into the index so a
#: patch receipt and a bundle can never disagree about what an ordinal means.
IDENTITY = ("an instance is addressed as (chunk, species, ordinal) in the "
            "PUBLISHED bundle, after vegetation patches; a patch receipt "
            "lists what it removed per chunk and species")


class ProvinceFields:
    """Raster-backed `Fields` for the whole province.

    The one derived quantity is **height above the local water table**: the
    water raster stores depth only where water is visible, but the mined rule
    that matters (R2 — density peaks at the waterline) needs a signed value on
    dry ground too. Taking each dry cell's nearest wet cell's water level
    generalises BM&V's single flat water plane to our varied one.
    """

    def __init__(self, province: Path = PROVINCE,
                 height_file: str = "height-rg.png"):
        refined = json.loads((province / "refined" / "meta.json").read_text())
        hydro = json.loads((province / "hydrology-meta.json").read_text())

        self.px_m = refined["metresPerPixel"]
        rgb = np.asarray(Image.open(province / "refined" / height_file)
                         .convert("RGB")).astype(np.float32)
        lo, hi = refined["heightMinMetres"], refined["heightMaxMetres"]
        self.height_m = (rgb[..., 0] * 256 + rgb[..., 1]) / 65535.0 * (hi - lo) + lo

        # --- the water, read from the signed record (decision 0066) --------
        # Nothing here decides what water IS: kind, season, identity, width
        # and band all come from the hydrology graph through `ShippedWater`,
        # on the surface grid (same registration as the refined height
        # raster). Only distances and depths are MEASURED off it.
        w = ShippedWater()
        self.water = w
        self.depth_m = w.signed_depth_m("wet").copy()
        wet = self.depth_m > 0.0
        # The encoding clamps dry ground at -6 m, so anything below that is
        # simply "dry"; the old -20 floor no longer means anything.
        np.clip(self.depth_m, -6.0, 25.5, out=self.depth_m)
        # Signed distance to the water's EDGE (+ land, − water): the meso
        # 'scene' field — reed belts, bank thickets and riparian galleries all
        # band on it (research/vegetation/openworld-vegetation-placement-architecture.md).
        land_d, (iy, ix) = ndimage.distance_transform_edt(~wet, return_indices=True)
        water_d = ndimage.distance_transform_edt(wet)
        self.shore_m = (np.where(wet, -water_d, land_d) * w.mpp2).astype(np.float32)

        # The record AT the nearest water, everywhere: on dry ground the
        # local water is the water you can see from it.
        self.kind_idx = w.kind_index_grid()
        self.kind_names = w.kind_names()
        season_idx = w.season_index_grid()
        self.near_kind = self.kind_idx[iy, ix]
        self.near_season = season_idx[iy, ix]
        self.near_label = w.ids[iy, ix]

        # Salt exposure: signed distance to SALT water by KIND (ocean, lagoon,
        # tidal reach) — an interior lake is wet but not salty.
        salt = w.kind_grid({"ocean", "lagoon", "horizontal-tidal"})
        salt_in = ndimage.distance_transform_edt(~salt) * w.mpp2
        salt_out = ndimage.distance_transform_edt(salt) * w.mpp2
        self.coast_m = np.where(salt, -salt_out, salt_in).astype(np.float32)

        # Channels and their wetted banks: the belt no trunk may stand in.
        channel = w.kind_grid(CHANNEL_REACH_KINDS)
        ch_out, (cy, cx) = ndimage.distance_transform_edt(
            ~channel, return_indices=True)
        ch_in = ndimage.distance_transform_edt(channel)
        self.channel_m = (np.where(channel, -ch_in, ch_out) * w.mpp2).astype(np.float32)
        widths = w.reach_width_grid()
        self.bank_margin_m = np.clip(
            widths[cy, cx] * 0.3, 2.0, 10.0).astype(np.float32)

        # Distance to the nearest MAJOR (band 3) reach — the record's own
        # river ranking, for layers that band on the big water.
        band3 = w.reach_band_grid() == 3
        self.corridor_m = ((ndimage.distance_transform_edt(~band3) * w.mpp2)
                           .astype(np.float32) if band3.any()
                           else np.full(band3.shape, 1e9, dtype=np.float32))
        self.water_px_m = w.mpp2

        gy, gx = np.gradient(self.height_m, self.px_m)
        self.slope_deg = np.degrees(np.arctan(np.hypot(gx, gy))).astype(np.float32)
        # Distance to the nearest CLIFF texel (16f): fallen stone gathers at
        # the foot of a face wherever the face is, so "near a cliff" is a
        # distance-to-feature field like the shore, not a region class.
        cliff = self.slope_deg >= CLIFF_SLOPE_DEG
        self.cliff_m = ((ndimage.distance_transform_edt(~cliff) * self.px_m)
                        .astype(np.float32) if cliff.any()
                        else np.full(cliff.shape, 1e9, dtype=np.float32))

        region_rgb = np.asarray(Image.open(province / "hydro-regions.png")
                                .convert("RGB"))
        self.region_px_m = hydro["metresPerPixel"]
        self.region = np.zeros(region_rgb.shape[:2], dtype=np.uint8)
        for class_id, (_name, colour) in REGION_CLASSES.items():
            match = np.all(region_rgb == np.array(colour, dtype=np.uint8), axis=-1)
            self.region[match] = class_id

        control = np.asarray(Image.open(province / "refined" / "ground-control.png")
                             .convert("RGBA"))
        self.land_cover = control[..., 0].copy()

        # Route corridors on the ground-control grid: MAJOR roads only —
        # trunks cleared, groundcover thinned. The minor network's clearance
        # is a vegetation PATCH applied after the scatter (16f).
        # Route px are on the 1345 macro grid; the control raster is the
        # full-res one, so the step is its size ratio.
        step = int(round(control.shape[0] / 1345))
        # The cleared widths and the packed condition both come from the
        # authored state of repair (owner 2026-09-16); bits 4-6 carry it so
        # `scatter.route_allows` can keep more groundcover on a worse road.
        trunk, ground, condition = major_corridor_masks(control.shape[:2], step,
                                                        province=province)
        self.corridor = ((trunk.astype(np.uint8) * ROUTE_CLEAR
                          | ground.astype(np.uint8) * ROUTE_THIN)
                         | (condition.astype(np.uint8) << ROUTE_CONDITION_SHIFT))

        # The height raster is a vertex lattice: N samples span N - 1
        # intervals.  Use the source-derived shared extent rather than adding
        # a phantom texel beyond the east/south boundary.
        self.extent_m = PROVINCE_EXTENT_M
        # ground-control ships at FULL resolution (double the refined height
        # raster) — sampling it with px_m read the wrong quadrant entirely.
        self.control_px_m = self.extent_m / control.shape[0]

        # Authored dressing zones (16f deliverable 4): a small integer raster
        # on the control grid, 0 off every zone. Rasterised over each
        # polygon's own bounding box, so this costs the zones' area.
        self.zones = dz.load_zones()
        self.zone_names = [""] + [z["id"] for z in self.zones]
        self.zone_idx = dz.rasterise(self.zones, control.shape[:2],
                                     self.control_px_m)

    # -- sampling --

    def _pixel(self, array, x: float, z: float, px_m: float):
        col = int(x / px_m)
        row = int(z / px_m)
        if not (0 <= row < array.shape[0] and 0 <= col < array.shape[1]):
            return None
        return array[row, col]

    def as_fields(self) -> Fields:
        return Fields(
            height=lambda x, z: float(self._pixel(self.height_m, x, z, self.px_m) or 0.0),
            water_depth=lambda x, z: float(
                v if (v := self._pixel(self.depth_m, x, z, self.water_px_m)) is not None else -6.0),
            slope=lambda x, z: float(
                v if (v := self._pixel(self.slope_deg, x, z, self.px_m)) is not None else 90.0),
            region=lambda x, z: int(
                v if (v := self._pixel(self.region, x, z, self.region_px_m)) is not None else 0),
            land_cover=lambda x, z: int(
                v if (v := self._pixel(self.land_cover, x, z, self.control_px_m)) is not None else 0),
            route_corridor=lambda x, z: int(
                v if (v := self._pixel(self.corridor, x, z, self.control_px_m)) is not None else 0),
            shore=lambda x, z: float(
                v if (v := self._pixel(self.shore_m, x, z, self.water_px_m)) is not None else 9999.0),
            coast=lambda x, z: float(
                v if (v := self._pixel(self.coast_m, x, z, self.water_px_m)) is not None else 99999.0),
            water_kind=lambda x, z: self._kind_at(x, z),
            water_season=lambda x, z: self._season_at(x, z),
            water_entity=lambda x, z: self._entity_at(x, z),
            channel=lambda x, z: float(
                v if (v := self._pixel(self.channel_m, x, z, self.water_px_m)) is not None else 1e9),
            bank_margin=lambda x, z: float(
                v if (v := self._pixel(self.bank_margin_m, x, z, self.water_px_m)) is not None else 0.0),
            corridor=lambda x, z: float(
                v if (v := self._pixel(self.corridor_m, x, z, self.water_px_m)) is not None else 1e9),
            cliff=lambda x, z: float(
                v if (v := self._pixel(self.cliff_m, x, z, self.px_m)) is not None else 1e9),
            zone=lambda x, z: self._zone_at(x, z),
        )

    def _zone_at(self, x: float, z: float) -> str:
        v = self._pixel(self.zone_idx, x, z, self.control_px_m)
        return self.zone_names[int(v)] if v is not None else ""

    # -- the record at a position (never a re-derivation) --

    def _kind_at(self, x: float, z: float) -> str:
        v = self._pixel(self.near_kind, x, z, self.water_px_m)
        return self.kind_names[int(v)] if v is not None else "none"

    def _season_at(self, x: float, z: float) -> str:
        v = self._pixel(self.near_season, x, z, self.water_px_m)
        return SEASON_NAMES[int(v)] if v is not None else "none"

    def _entity_at(self, x: float, z: float) -> tuple[str, str]:
        label = self._pixel(self.near_label, x, z, self.water_px_m)
        if label is None or int(label) <= 0:
            return ("", "")
        entity_id = self.water.entities[int(label) - 1]["id"]
        return (entity_id, self.water.river_of(entity_id) or "")

    def chunk_grid(self) -> int:
        return int(math.ceil(self.extent_m / CHUNK_M))

    def modal_region(self, cx: int, cz: int) -> int:
        """The region class most of a chunk sits in — a report label only,
        never a palette selector (see `regions_in`)."""
        window = self._region_window(cx, cz)
        return int(np.bincount(window.ravel()).argmax()) if window.size else 0

    def _region_window(self, cx: int, cz: int):
        step = self.region_px_m
        x0, z0 = int(cx * CHUNK_M / step), int(cz * CHUNK_M / step)
        x1, z1 = int((cx + 1) * CHUNK_M / step) + 1, int((cz + 1) * CHUNK_M / step) + 1
        return self.region[z0:z1, x0:x1]

    def regions_in(self, cx: int, cz: int) -> set[int]:
        """Every region class a chunk touches.

        Argonia's regions interdigitate well below the 468 m chunk — the
        province has swamp, lowland and lake threading through single chunks —
        so a chunk cannot have "a" palette. Layers are gated per sample
        instead, and this set only decides which layers are worth evaluating.
        """
        window = self._region_window(cx, cz)
        return set(np.unique(window).tolist()) if window.size else set()


def attach_bottom_profiles(palette: Palette) -> Palette:
    """Give every rock layer its species' mined underside (16f round 5).

    The palettes file carries the layer's footprint and height, which switch
    the burial rule on; the underside point list is mined per species from
    the kit (`rock_bottom_profiles.py`) and would bloat the palettes file, so
    it is attached here, at compile time, by species. A layer that has no
    profile keeps the base-plane rule."""
    from . import rock_dressing as rd
    from dataclasses import replace
    layers = []
    for layer in palette.layers:
        profile = rd.bottom_profile(layer.species) if layer.footprint_half_m else None
        layers.append(replace(layer, bottom_profile=np.asarray(profile, dtype=float))
                      if profile else layer)
    return Palette(id=palette.id, layers=layers)


def merge_palettes(palettes: dict[int, Palette], density_scale: float = 1.0) -> Palette:
    """One province palette whose layers carry their own region gate.

    Ordering is by clearance radius, largest first, because clearance stamping
    is one-directional big-to-small (module 65 §111) — and a merged palette
    must keep that property across regions, not just within one.
    """
    layers = []
    for region, palette in sorted(palettes.items()):
        for layer in palette.layers:
            if not layer.region_classes:
                layer.region_classes = (region,)
            layer.instances_per_hectare *= density_scale
            layers.append(layer)
    layers.sort(key=lambda layer: (-layer.clearance_radius_m, layer.species))
    return attach_bottom_profiles(Palette(id="province", layers=layers))


def species_order(palette: Palette) -> list[str]:
    """The species index every bundle is written against.

    Derived from the whole palette, not from the layers a given chunk happens
    to activate, so one index in the manifest decodes every chunk.
    """
    return sorted({layer.species for layer in palette.layers})


def compile_chunk(fields_source: ProvinceFields, palette: Palette,
                  cx: int, cz: int, seed: int,
                  composition: Composition | None = None):
    present = fields_source.regions_in(cx, cz)
    active = [
        layer for layer in palette.layers
        if not layer.region_classes or present & set(layer.region_classes)
    ]
    if not active:
        return present, [], b"", {}
    fields = fields_source.as_fields()
    composition = composition or Composition.load()
    # C3: attachment species never free-scatter; C4: cluster-part densities
    # are pre-divided so the clump pass keeps totals authored.
    scatter_layers, attachment_layers = composition.split_layers(
        [replace(layer) for layer in active])
    instances = scatter_chunk(
        cx * CHUNK_M, cz * CHUNK_M, CHUNK_M, Palette(palette.id, scatter_layers),
        fields, seed, chunk_id=(cx, cz),
    )
    # Record-driven rock passes (16f deliverable 3): rocks whose positions
    # come from the hydrology record rather than from a density — the bed of
    # every steep reach and both sides of every cascade. They run AFTER the
    # scatter (so they are never blocked by it) and BEFORE composition (so
    # their sink, anchor and clumping are composed like any other instance).
    bounds = (cx * CHUNK_M, cz * CHUNK_M, (cx + 1) * CHUNK_M, (cz + 1) * CHUNK_M)
    bed, bed_records = rd.bed_boulders(fields_source.water, bounds, seed, fields)
    casc, casc_records = rd.cascade_rocks(fields_source.water, bounds, seed, fields)
    instances += bed + casc
    order = species_order(palette)
    # An open-bottomed rock keeps its own sink floor (Layer.sink_jitter).
    jitter = {layer.species: tuple(layer.sink_jitter) for layer in scatter_layers}
    instances, counts = composition.compose(
        instances, attachment_layers, fields, seed,
        area_ha=CHUNK_M * CHUNK_M / 10_000, allowed=set(order),
        sink_jitter=jitter)
    instances = cut_hanging_rocks(instances, palette, fields, order)
    return (present, instances, encode(instances, order), counts,
            bed_records + casc_records)


def cut_hanging_rocks(instances: list[Instance], palette: Palette, fields: Fields,
                      order: list[str]) -> list[Instance]:
    """The last word on a rock: measured at the pose and sink the BUNDLE will
    carry (encoded, then decoded — the encoder rounds scale and sink to a
    byte over each group's range) by the same underside rule the census
    applies, and cut if it still gaps (16f round 5, owner: "you could just
    cut them"). Nothing the census can find ships."""
    from .rock_mesh_census import underside_gaps
    from .scatter import BURIAL_TOLERANCE_M, decode
    profiles = {layer.species: layer.bottom_profile for layer in palette.layers
                if layer.bottom_profile is not None}
    if not any(inst.species in profiles for inst in instances):
        return instances
    shipped = {order[group["index"]]: group["instances"] for group in decode(encode(instances, order))}
    cursor = {species: 0 for species in shipped}
    kept = []
    for inst in instances:
        profile = profiles.get(inst.species)
        if profile is None or inst.anchor != ANCHOR_TERRAIN or inst.species not in shipped:
            kept.append(inst)
            continue
        as_shipped = shipped[inst.species][cursor[inst.species]]
        cursor[inst.species] += 1
        gaps = underside_gaps(profile, as_shipped["x"], fields.height(as_shipped["x"], as_shipped["z"]) - as_shipped["sink"],
                              as_shipped["z"], as_shipped["yaw"], as_shipped["tiltX"], as_shipped["tiltZ"],
                              as_shipped["scale"], fields.height)
        if gaps and max(gaps) > BURIAL_TOLERANCE_M:
            continue
        kept.append(inst)
    return kept


# Set once in the parent before the worker pool forks, so every worker
# inherits the (large, read-only) rasters instead of pickling them per chunk.
_WORK: dict = {}


def _compile_one(cell: tuple[int, int]):
    """One chunk's whole contribution, summarised in the worker.

    Chunks are independent — each is scattered from its own chunk-id-derived
    seed over shared read-only rasters — so the province compiles across the
    cores. Only the summary (its index record, its counters and its encoded
    bundle) crosses back, never the instance list, and the parent folds the
    results in the order it asked for them, so the totals and the report add
    up exactly as the serial loop's did.
    """
    source, palette, composition, seed, report = (
        _WORK["source"], _WORK["palette"], _WORK["composition"],
        _WORK["seed"], _WORK["report"])
    cx, cz = cell
    present, instances, blob, counts, bed_rocks = compile_chunk(
        source, palette, cx, cz, seed, composition)
    if not instances:
        return None
    # Under-canopy litter (deliverable 10): the discs the ground mask is
    # accumulated from, measured off each instance's own crown.
    crowns = _WORK["crowns"]
    litter = [(i.x, i.z, crowns[i.species] * i.scale) for i in instances
              if i.tier in ("T1", "T2") and i.species in crowns]
    tiers = Counter(i.tier for i in instances)
    species = Counter(i.species for i in instances)
    region = source.modal_region(cx, cz)
    record = {
        "chunk": [cx, cz],
        "region": region,
        "regionName": REGION_CLASSES[region][0],
        "regionsPresent": sorted(present),
        "instances": len(instances),
        "tiers": dict(tiers),
        "perHectare": round(len(instances) / (CHUNK_M * CHUNK_M / 10_000), 1),
    }
    class_counts: Counter = Counter()
    class_area: Counter = Counter()
    if report:
        fields = _WORK["fields_for_report"]
        class_counts.update(fields.region(i.x, i.z) for i in instances)
        window = source._region_window(cx, cz)
        for value, count in zip(*np.unique(window, return_counts=True)):
            class_area[int(value)] += int(count)
        by_species: dict[str, list[tuple[float, float]]] = {}
        for instance in instances:
            by_species.setdefault(instance.species, []).append((instance.x, instance.z))
        values = [
            r for points in by_species.values() if len(points) >= 40
            for r in [clark_evans(points[:1200], CHUNK_M * CHUNK_M)] if r
        ]
        if values:
            values.sort()
            record["clarkEvansR"] = round(values[len(values) // 2], 3)
        record["variation"] = variation_probe(instances, CHUNK_M)
    return (record, blob, tiers, species, counts, class_counts, class_area,
            bed_rocks, litter)


#: Roles whose instances put a crown over the ground — the discs the litter
#: mask is accumulated from (16f deliverable 10).
CANOPY_ROLES = frozenset({"canopy", "emergent", "landmark-giant", "gallery"})
#: Ground the litter mask blends toward leaf litter (landcover ids).
LITTER_BLEND_COVERS = (23, 31, 36)          # BC_ROCK, MOUNTAIN_ROCK, DIRT_CLIFF


#: Roles whose pieces live wholly UNDER the water, so the water has to be deep
#: enough to cover the mesh. Named explicitly, never by an `aquatic-` prefix:
#: reeds grow UP out of shallow water and lilypads float ON it, so both stand
#: proud by design, as do `drowned-tree` and `drowned-thicket`.
SUBMERGED_ROLES = frozenset({
    "aquatic-kelp", "aquatic-kelp-deep", "aquatic-seaweed", "aquatic-coral",
    "aquatic-algae", "aquatic-shells", "aquatic-deadfall", "aquatic-debris",
    # The sea-bed band (2026-09-18). Pebbles, shells, starfish, sponges and
    # stones are NOT here: they lie flat on the bed and read correctly in any
    # depth the band admits. The rock layers are not here either - a rock is
    # seated by the sampler's burial rule off its `footprint_half_m`, which is
    # the right mechanism for a boulder, and the role they carry (`wet-rock`)
    # is shared with the surf band, which stands half out of the water on
    # purpose.
    "seabed-coral", "seabed-debris", "seabed-bones", "seabed-clutter",
    "seabed-boat", "seabed-algae",
    # Low seagrass (16f round 4): a 0.6-1.4 m tuft has to be under the
    # surface, or it is a reed.
    "seabed-seagrass",
})


def _kit_heights() -> dict[str, float]:
    """species -> how far the piece's TOP stands above the bed it is seated
    on, metres, from both kits the scatter places from.

    Not `sizeM[2]`. The scatter seats a piece by its authored PIVOT, and
    `pivotAboveBaseM` (a verbatim copy of `originOffsetM[2]`, written back by
    `vet_kit`) is how far that pivot sits above the mesh's own lowest point.
    So the part that has to be under the water is
    `sizeM[2] - pivotAboveBaseM`, and using the whole box instead over-floors
    every piece whose pivot is up inside it. The two meshes that prove it are
    `waterkelptall02` and `waterkelptall03`: byte-identical 3.983 m boxes,
    pivots 0.090 and 0.801, so `03` stands 0.71 m shorter above the bed for
    exactly the same drawn geometry.
    """
    out: dict[str, float] = {}
    for name in ("flora-province-v1.kit.json", "underwater-v1.kit.json"):
        path = PROVINCE.parent / "kits" / name
        if not path.exists():
            continue
        for asset in json.loads(path.read_text(encoding="utf-8"))["assets"]:
            pivot = float(asset.get("pivotAboveBaseM",
                                    asset.get("originOffsetM", [0, 0, 0])[2]))
            out.setdefault(asset["id"], float(asset["sizeM"][2]) - pivot)
    return out


def floor_submerged_depths(data: dict, heights: dict[str, float] | None = None) -> list[str]:
    """Raise every SUBMERGED layer's minimum water depth to the piece's own
    TOP ABOVE THE BED (`sizeM[2] - pivotAboveBaseM`, times the layer's
    largest scale), in place.

    An authored band like [0.8, 6.0] on a 3.98 m kelp put the plant's top
    2-3 m above the sea surface wherever the bed was shallow (owner walk
    2026-09-17, `x=0.15&z=6.35`): a rigid mesh cannot bend with the swell,
    so the only depth it can stand in is one that covers it. Returns the
    layers it changed, for the report.
    """
    heights = _kit_heights() if heights is None else heights
    changed: list[str] = []
    for region, entry in data["byRegionClass"].items():
        for layer in entry["layers"]:
            role = layer.get("role") or ""
            if role not in SUBMERGED_ROLES:
                continue
            top_above_bed = heights.get(layer["species"])
            if top_above_bed is None:
                continue
            lo, hi = layer.get("scale_range", (1.0, 1.0))
            need = round(top_above_bed * max(lo, hi), 2)
            band = layer.get("water_depth_m")
            if band is None or band[0] >= need:
                continue
            # The band SLIDES down-to-up; it is not just clipped. The author
            # chose how thick a band the species occupies and only its floor
            # is physically wrong, so clipping alone would leave a sliver:
            # coral's authored 2-6 m became 4.28-6 m, which is 20 ha of the
            # whole province against 66 ha when the 4 m thickness is kept.
            ceiling = round(max(band[1], need + (band[1] - band[0])), 2)
            layer["water_depth_m"] = [need, ceiling]
            changed.append(f"region {region} {role} {layer['species']}: "
                           f"{band[0]}-{band[1]} -> {need}-{ceiling} m")
    return changed


def canopy_crowns(data: dict) -> dict[str, float]:
    """species -> crown RADIUS in metres, for every canopy-role species.

    Read from the palette DOCUMENT rather than from `Palette`, because `role`
    is an annotation the sampler drops. The radius is measured off the kit's
    own `sizeM` (the mesh's z-up box, so the crown is the larger of components
    0 and 1), never a per-species guess.
    """
    manifest = rd._manifest()
    out: dict[str, float] = {}
    for entry in data["byRegionClass"].values():
        for layer in entry["layers"]:
            species = layer["species"]
            if layer.get("role") not in CANOPY_ROLES or species in out:
                continue
            asset = manifest.get(species)
            if asset is not None:
                out[species] = max(asset["sizeM"][0], asset["sizeM"][1]) / 2.0
    return out


def litter_alpha(discs, size_px: int, metres_per_px: float,
                 threshold: float = 0.5) -> np.ndarray:
    """The under-canopy litter mask: 255 where crowns cover the texel.

    Accumulated like a coverage (overlapping crowns add), thresholded, then
    blurred one texel so the blend has no stair-step edge.
    """
    acc = np.zeros((size_px, size_px), dtype=np.float32)
    for x, z, radius in discs:
        if radius <= 0:
            continue
        r_px = radius / metres_per_px
        c, r = x / metres_per_px, z / metres_per_px
        c0, c1 = max(0, int(c - r_px)), min(size_px, int(c + r_px) + 1)
        r0, r1 = max(0, int(r - r_px)), min(size_px, int(r + r_px) + 1)
        if c0 >= c1 or r0 >= r1:
            continue
        ys = np.arange(r0, r1)[:, None] + 0.5 - r
        xs = np.arange(c0, c1)[None, :] + 0.5 - c
        acc[r0:r1, c0:c1] += (ys * ys + xs * xs) <= r_px * r_px
    mask = (acc >= threshold).astype(np.float32)
    mask = ndimage.uniform_filter(mask, size=3)
    return np.clip(mask * 255.0, 0, 255).astype(np.uint8)


def litter_from_bundles(out_dir: Path, order: list[str], crowns: dict[str, float]) -> list:
    """Every crown disc in every published bundle (the merge source for a
    partial run's litter mask)."""
    from .scatter import decode
    discs: list = []
    for path in sorted(out_dir.glob("chunk_*_vegetation.bin")):
        for group in decode(path.read_bytes()):
            species = order[group["index"]]
            r0 = crowns.get(species)
            if r0 is None or group["anchor"] != 0:
                continue
            for inst in group["instances"]:
                discs.append((inst["x"], inst["z"], r0 * inst["scale"]))
    return discs


def write_litter_mask(discs, province: Path = PROVINCE) -> int:
    """Write the litter mask into the ALPHA of `refined/ground-tint.png`.

    The tint raster's RGB is the macro climate tint; its alpha was unused, so
    the mask rides in it and the splat shader reads one texture it already
    samples. Returns the number of texels set.
    """
    path = province / "refined" / "ground-tint.png"
    tint = np.asarray(Image.open(path).convert("RGB"))
    alpha = litter_alpha(discs, tint.shape[0], PROVINCE_EXTENT_M / tint.shape[0])
    Image.fromarray(np.dstack([tint, alpha]), "RGBA").save(path)
    return int((alpha > 0).sum())


def variation_probe(instances, size_m: float, cell_m: float = 58.0) -> dict:
    """Does the compiled scatter vary as much as the source does?

    The two numbers the reference was measured on
    (research/vegetation/vegetation-density-design.md): the coefficient of variation of
    density between neighbouring cells (mined 2.3-3.1), and the open-space
    radius a player actually walks through (mined p50 ~10 m, p95 ~31 m).
    """
    if not instances:
        return {}
    counts: Counter = Counter()
    for i in instances:
        counts[(int(i.x // cell_m), int(i.z // cell_m))] += 1
    grid = max(1, int(size_m // cell_m))
    origin_x = min(int(i.x // cell_m) for i in instances)
    origin_z = min(int(i.z // cell_m) for i in instances)
    values = [counts.get((origin_x + x, origin_z + z), 0)
              for x in range(grid) for z in range(grid)]
    mean = sum(values) / len(values)
    if mean <= 0:
        return {}
    sd = (sum((v - mean) ** 2 for v in values) / len(values)) ** 0.5

    buckets: dict[tuple[int, int], list] = {}
    probe_m = 12.0
    for i in instances:
        buckets.setdefault((int(i.x // probe_m), int(i.z // probe_m)), []).append(i)
    gaps = []
    base_x = min(i.x for i in instances)
    base_z = min(i.z for i in instances)
    for step in range(400):
        px = base_x + (step % 20 + 0.5) * size_m / 20
        pz = base_z + (step // 20 + 0.5) * size_m / 20
        bx, bz = int(px // probe_m), int(pz // probe_m)
        best = math.inf
        for ix in (-2, -1, 0, 1, 2):
            for iz in (-2, -1, 0, 1, 2):
                for q in buckets.get((bx + ix, bz + iz), ()):
                    best = min(best, math.hypot(px - q.x, pz - q.z))
        if best is not math.inf:
            gaps.append(best)
    gaps.sort()
    def pct(q):
        return round(gaps[min(len(gaps) - 1, int(len(gaps) * q))], 1) if gaps else None
    return {
        "coefficientOfVariation": round(sd / mean, 2),
        "openSpaceRadiusM": {"p50": pct(0.5), "p75": pct(0.75), "p95": pct(0.95)},
    }


# The rasters this compiler reads that the ground can move, and the snapshot
# of each one it last read. Kept in the vault (never in the repo: they are
# 4 k images, and a scratch copy of the vault keeps its own book).
def scatter_inputs(province: Path = PROVINCE) -> list[Path]:
    """The rasters this compiler reads, as absolute paths.

    Derived from the water record's own meta rather than named here, so the
    record decides which files it ships (0066) and this module never hard-codes
    a water raster's file name."""
    meta = json.loads((WATER_DIR / "water-meta.json").read_text())
    surface = WATER_DIR / meta["surface"]["file"]
    ids = WATER_DIR / meta["surface"].get("idFile", meta.get("idFile", "water-id.png"))
    return [province / "refined" / "height-rg.png",
            province / "refined" / "ground-control.png", surface, ids]


def _snapshot_name(source: Path) -> str:
    """Snapshot file name for an input: its last two path parts, flattened."""
    return f"{source.parent.name}_{source.name}"


def _snapshot_dir() -> Path:
    from .compile_chunks import DEFAULT_HEIGHTS
    return DEFAULT_HEIGHTS.parent / "scatter-input-snapshots"


def recipe_hash() -> str:
    """One hash of everything that changes EVERY chunk's answer without
    moving a raster: the palettes, the composition rules, the dressing zones,
    the kit manifests and this compiler's own code. A footprint run whose
    recipe moved re-scatters the whole province; the raster diff alone
    re-did 125 of 256 chunks after a palette rebuild (16f) and left the rest
    on the old rules."""
    import hashlib
    from .chain_stages import module_closure
    h = hashlib.sha256()
    for path in [REPO_ROOT / "world" / "sources" / "flora" / "palettes.json",
                 REPO_ROOT / "world" / "sources" / "flora" / "dressing-zones.json",
                 REPO_ROOT / "world" / "sources" / "placement" / "composition-rules.json",
                 PROVINCE.parent / "kits" / "flora-province-v1.kit.json",
                 PROVINCE.parent / "kits" / "underwater-v1.kit.json",
                 *module_closure("compile_scatter")]:
        if path.exists():
            h.update(path.name.encode())
            h.update(path.read_bytes())
    return h.hexdigest()


def record_inputs(province: Path = PROVINCE) -> None:
    """Remember the rasters (and the recipe) this run scattered from.

    Written on EVERY run, incremental or not: the next run can only measure
    what moved if the previous one left something to measure against, and a
    full run that forgets to leave one silently costs the next edit a full
    province.
    """
    snaps = _snapshot_dir()
    snaps.mkdir(parents=True, exist_ok=True)
    for source in scatter_inputs(province):
        if source.exists():
            np.save(snaps / (_snapshot_name(source) + ".npy"),
                    np.asarray(Image.open(source).convert("RGBA")))
    (snaps / "recipe.sha256").write_text(recipe_hash())


def changed_chunks(footprint_path, province: Path = PROVINCE,
                   sample_rows: int | None = None) -> set | None:
    """Chunks to re-scatter, or None for "all of them".

    The footprint is in full-resolution sample coordinates; each input raster
    has its own resolution, so a measured box is scaled by the row ratio
    before it is unioned in.
    """
    from . import footprint as fp
    boxes = fp.load_or_none(footprint_path)
    if boxes is None:
        return None
    doc_shape = json.loads(Path(footprint_path).read_text()).get("gridShape")
    rows = sample_rows or (doc_shape[0] if doc_shape else None)
    snaps = _snapshot_dir()
    snaps.mkdir(parents=True, exist_ok=True)
    recipe = snaps / "recipe.sha256"
    if not recipe.exists() or recipe.read_text().strip() != recipe_hash():
        print("footprint: the recipe (palettes, rules, kits or code) moved — compiling every chunk")
        record_inputs(province)
        return None
    measured: list = []
    for source in scatter_inputs(province):
        if not source.exists():
            return None
        current = np.asarray(Image.open(source).convert("RGBA"))
        snap = snaps / (_snapshot_name(source) + ".npy")
        previous = np.load(snap) if snap.exists() else None
        found = fp.changed_boxes(current, previous)
        np.save(snap, current)
        if found is None or rows is None:
            return None
        ratio = rows / current.shape[0]
        measured += [(int(y0 * ratio), int(np.ceil(y1 * ratio)),
                      int(x0 * ratio), int(np.ceil(x1 * ratio)))
                     for y0, y1, x0, x1 in found]
    return fp.chunks(fp.union(boxes, measured), CHUNK_SAMPLES)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--palettes",
                    default=str(REPO_ROOT / "world/sources/flora/palettes.json"))
    ap.add_argument("--out", default=None,
                    help="write bundles here (default: report only)")
    ap.add_argument("--chunk", action="append", default=[],
                    help="cx,cz — repeatable; default is every chunk")
    ap.add_argument("--seed", type=lambda v: int(v, 0), default=DEFAULT_SEED)
    ap.add_argument("--density-scale", type=float, default=None,
                    help="global multiplier on every layer's authored density "
                         "— the one knob the density decision turns")
    ap.add_argument("--footprint", default=None,
                    help="changed-region file: re-scatter only the chunks it "
                         "touches and merge into the existing index")
    ap.add_argument("--report", action="store_true")
    args = ap.parse_args()

    data = json.loads(Path(args.palettes).read_text())
    for line in floor_submerged_depths(data):
        print("submerged floor:", line)
    scale = args.density_scale if args.density_scale is not None else float(
        data.get("densityScale", 1.0))
    palette = merge_palettes({
        int(region): Palette.from_dict(entry)
        for region, entry in data["byRegionClass"].items()
    }, scale)
    print(f"density scale x{scale:g}")
    crowns = canopy_crowns(data)
    source = ProvinceFields()
    grid = source.chunk_grid()
    all_cells = [(cx, cz) for cz in range(grid) for cx in range(grid)]
    footprint_cells = None
    if not args.footprint:
        # A whole-province run leaves the snapshot the next footprint run
        # measures against. A `--chunk` probe run must NOT: it stamped the
        # new recipe before the chain ran, so the chain believed the recipe
        # unchanged and re-scattered 125 of 256 chunks, leaving the rest on
        # the old rules (16f round 4).
        if not args.chunk:
            record_inputs()
    else:
        footprint_cells = changed_chunks(args.footprint)
        if footprint_cells is None:
            print("footprint: no usable measurement of what moved — "
                  "compiling every chunk")
    if args.chunk:
        wanted = [tuple(int(v) for v in c.split(",")) for c in args.chunk]
    elif footprint_cells is not None:
        # Kept in the full grid's order, so the merged index below is byte for
        # byte the file a whole-province run would write.
        wanted = [cell for cell in all_cells if cell in footprint_cells]
        print(f"footprint: {len(wanted)} of {len(all_cells)} chunks re-scattered")
    else:
        wanted = all_cells

    out_dir = Path(args.out) if args.out else None
    if out_dir:
        out_dir.mkdir(parents=True, exist_ok=True)
    # An incremental run keeps every record it did not recompute, in grid
    # order: a partial index would delete the province's vegetation outside
    # the edit.
    carried: dict = {}
    if out_dir and footprint_cells is not None and not args.chunk:
        index_path = out_dir / "vegetation-index.json"
        if index_path.exists():
            carried = json.loads(index_path.read_text()).get("chunks", {})

    index = {}
    totals: Counter = Counter()
    species_totals: Counter = Counter()
    class_counts: Counter = Counter()
    class_area_px: Counter = Counter()
    _WORK.update(source=source, palette=palette, composition=Composition.load(),
                 seed=args.seed, report=args.report,
                 crowns=crowns, fields_for_report=source.as_fields())
    per_chunk = []
    all_bed_rocks: list = []
    all_litter: list = []
    with Pool(min(cpu_count(), len(wanted))) as pool:
        results = pool.imap(_compile_one, wanted, chunksize=1)
        for (cx, cz), result in zip(wanted, results):
            if result is None:
                continue
            (record, blob, tiers, species, counts, class_hits, class_area,
             bed_rocks, litter) = result
            all_bed_rocks += bed_rocks
            all_litter += litter
            totals.update(tiers)
            totals.update(counts)
            totals["chunks"] += 1
            species_totals.update(species)
            # Delivered density per REGION CLASS at the instance, against the
            # class's own area — the per-modal-chunk numbers mix classes and
            # understate every dense class that shares its chunks.
            class_counts.update(class_hits)
            class_area_px.update(class_area)
            per_chunk.append(record)
            if out_dir:
                (out_dir / f"chunk_{cx}_{cz}_vegetation.bin").write_bytes(blob)
                index[f"{cx}_{cz}"] = record

    # The record the water renderer stamps foam from, and the ground mask the
    # splat shader blends litter by. Both are whole-province files: a run
    # that compiled every chunk writes them outright; a partial run (a
    # --chunk list, or a chain footprint) MERGES — the compiled chunks'
    # rocks replace those chunks' entries in the existing record, and the
    # litter mask is re-rendered from every bundle on disk — so neither a
    # one-chunk run nor a chain run can delete a rock or a crown it never
    # compiled (the 16f chain run did exactly that until this merge).
    if out_dir:
        compiled = {(cx, cz) for cx, cz in wanted}
        whole_province = len(compiled) == len(all_cells)
        if whole_province:
            bed_rocks_out = all_bed_rocks
        else:
            bed_rocks_out = [r for r in rd.read_bed_rocks()
                             if (int(r["x"] // CHUNK_M), int(r["z"] // CHUNK_M)) not in compiled]
            bed_rocks_out += all_bed_rocks
        rd.write_bed_rocks(bed_rocks_out)
        litter_all = all_litter if whole_province else litter_from_bundles(
            out_dir, species_order(palette), _WORK["crowns"])
        set_px = write_litter_mask(litter_all)
        print(f"  bed rocks: {len(bed_rocks_out):,} in {rd.BED_ROCKS_PATH.name} "
              f"({len(all_bed_rocks):,} from this run); litter mask {set_px:,} "
              f"texels from {len(litter_all):,} crowns"
              + ("" if whole_province else " (merged: partial run)"))

    if out_dir:
        if carried:
            recomputed, index = index, {}
            for cx, cz in all_cells:
                key = f"{cx}_{cz}"
                if key in recomputed:
                    index[key] = recomputed[key]
                elif (cx, cz) not in footprint_cells and key in carried:
                    index[key] = carried[key]
                elif (cx, cz) in footprint_cells:
                    # re-scattered and dressed nothing: its bundle is gone
                    (out_dir / f"chunk_{cx}_{cz}_vegetation.bin").unlink(missing_ok=True)
        (out_dir / "vegetation-index.json").write_text(
            json.dumps({"schemaVersion": 3,
                        "identity": IDENTITY,
                        "seed": args.seed, "chunkMetres": round(CHUNK_M, 2),
                        "speciesOrder": species_order(palette),
                        "chunks": index}, indent=1) + "\n")

    dressed = len(per_chunk)
    if dressed:
        counts = sorted(r["instances"] for r in per_chunk)
        print(f"{dressed} chunks dressed of {len(wanted)}; "
              f"instances total {sum(counts):,}")
        print("  per chunk  p5 %d  p50 %d  p95 %d  max %d" % (
            counts[len(counts) // 20], counts[len(counts) // 2],
            counts[min(len(counts) - 1, 19 * len(counts) // 20)], counts[-1]))
        skip = ("chunks", "clumpPieces", "attachments")
        print("  tiers:", {k: v for k, v in totals.items() if k not in skip})
        print(f"  composition: {totals['clumpPieces']:,} clump companion "
              f"pieces, {totals['attachments']:,} attachments on hosts")
        by_region: dict[str, list[int]] = {}
        for record in per_chunk:
            by_region.setdefault(record["regionName"], []).append(record["instances"])
        for name, values in sorted(by_region.items(), key=lambda kv: -len(kv[1])):
            per_ha = sum(values) / len(values) / (CHUNK_M * CHUNK_M / 10_000)
            print(f"  {name:28s} {len(values):3d} chunks  "
                  f"mean {sum(values)//len(values):6d}/chunk  {per_ha:6.1f}/ha")
        if args.report and class_counts:
            print("  delivered per region class (/ha of that class's area):")
            for class_id, count in class_counts.most_common():
                ha = class_area_px[class_id] * (source.region_px_m ** 2) / 10_000
                if ha > 0:
                    name = REGION_CLASSES.get(class_id, ("?",))[0]
                    print(f"    {name:28s} {count:8,d}  {count / ha:8.1f}")
        if args.report:
            # Delivered per species over the dressed area — read against the
            # palette's authored instances_per_hectare to see what the gates
            # and responses actually let through (the round-2 sparse-jungle
            # defect was invisible without this).
            dressed_ha = dressed * (CHUNK_M * CHUNK_M / 10_000)
            print("  delivered per species (/ha of dressed area):")
            for name, count in species_totals.most_common():
                print(f"    {name:56s} {count:8,d}  {count / dressed_ha:8.2f}")
            covs = sorted(r["variation"]["coefficientOfVariation"]
                          for r in per_chunk if r.get("variation"))
            if covs:
                print(f"  density coefficient of variation: p50 "
                      f"{covs[len(covs)//2]:.2f} (mined 2.3-3.1)")
                gaps = [r["variation"]["openSpaceRadiusM"] for r in per_chunk
                        if r.get("variation", {}).get("openSpaceRadiusM", {}).get("p50")]
                if gaps:
                    for key, mined in (("p50", 10.2), ("p75", 21.1), ("p95", 31.5)):
                        vals = sorted(g[key] for g in gaps if g.get(key))
                        if vals:
                            print(f"  open space {key}: {vals[len(vals)//2]:5.1f} m "
                                  f"(mined {mined} m)")
            rs = [r["clarkEvansR"] for r in per_chunk if r.get("clarkEvansR")]
            if rs:
                rs.sort()
                print(f"  Clark-Evans R: p5 {rs[len(rs)//20]:.2f} "
                      f"p50 {rs[len(rs)//2]:.2f} p95 {rs[19*len(rs)//20]:.2f} "
                      f"(mined worlds sit at ~0.45)")
    else:
        print("no chunks dressed — check the palettes' region classes")


if __name__ == "__main__":
    main()
