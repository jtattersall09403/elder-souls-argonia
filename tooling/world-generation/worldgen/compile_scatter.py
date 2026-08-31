"""Compile vegetation scatter for the province from the committed rasters.

Reads exactly the data the runtime reads — the studio's height, water, region
and ground-control rasters — so the compiler and the game can never disagree
about where the waterline is (00-core: rendering and gameplay sample the same
water data). Emits one `vegetation-instances.bin` per chunk plus an index.

Usage:
  python3 -m worldgen.compile_scatter --palettes world/sources/flora/palettes.json
  python3 -m worldgen.compile_scatter --chunk 8,8 --chunk 3,12 --report
"""

from __future__ import annotations

import argparse
import json
import math
from collections import Counter
from dataclasses import replace
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

from .composition import Composition
from .regions import REGION_CLASSES
from .scale import RAW_M
from .scatter import Fields, Palette, clark_evans, encode, scatter_chunk

REPO_ROOT = Path(__file__).resolve().parents[3]
PROVINCE = REPO_ROOT / "apps" / "world-studio" / "public" / "province"
CHUNK_SAMPLES = 256                       # matches compile_chunks
CHUNK_M = CHUNK_SAMPLES * RAW_M           # 467.9 m
DEFAULT_SEED = 0x5CA77E5


class ProvinceFields:
    """Raster-backed `Fields` for the whole province.

    The one derived quantity is **height above the local water table**: the
    water raster stores depth only where water is visible, but the mined rule
    that matters (R2 — density peaks at the waterline) needs a signed value on
    dry ground too. Taking each dry cell's nearest wet cell's water level
    generalises BM&V's single flat water plane to our varied one.
    """

    def __init__(self, province: Path = PROVINCE):
        refined = json.loads((province / "refined" / "meta.json").read_text())
        water_meta = json.loads((province / "water" / "water-meta.json").read_text())
        hydro = json.loads((province / "hydrology-meta.json").read_text())

        self.px_m = refined["metresPerPixel"]
        rgb = np.asarray(Image.open(province / "refined" / "height-rg.png")
                         .convert("RGB")).astype(np.float32)
        lo, hi = refined["heightMinMetres"], refined["heightMaxMetres"]
        self.height_m = (rgb[..., 0] * 256 + rgb[..., 1]) / 65535.0 * (hi - lo) + lo

        surface = np.asarray(Image.open(province / "water" / "water-surface.png")
                             .convert("RGB")).astype(np.float32)
        wlo, whi = water_meta["surface"]["minM"], water_meta["surface"]["maxM"]
        water_level = (surface[..., 0] * 256 + surface[..., 1]) / 65535.0 * (whi - wlo) + wlo
        depth = surface[..., 2] * 0.1
        wet = depth > 0.05

        # Nearest wet cell's water level, everywhere.
        land_d, (iy, ix) = ndimage.distance_transform_edt(~wet, return_indices=True)
        table = water_level[iy, ix]
        self.depth_m = np.where(wet, depth, table - self.height_m).astype(np.float32)
        # Signed distance to the water's EDGE (+ land, − water): the meso
        # 'scene' field — reed belts, bank thickets and riparian galleries all
        # band on it (research/openworld-vegetation-placement-architecture.md).
        water_d = ndimage.distance_transform_edt(wet)
        self.shore_m = (np.where(wet, -water_d, land_d) * self.px_m).astype(np.float32)
        # Beyond a few metres the distinction stops meaning anything, and an
        # unclamped value would let a distant mountain read as "-200 m above
        # the water table" and skew every response curve.
        np.clip(self.depth_m, -20.0, 25.5, out=self.depth_m)

        gy, gx = np.gradient(self.height_m, self.px_m)
        self.slope_deg = np.degrees(np.arctan(np.hypot(gx, gy))).astype(np.float32)

        region_rgb = np.asarray(Image.open(province / "hydro-regions.png")
                                .convert("RGB"))
        self.region_px_m = hydro["metresPerPixel"]
        self.region = np.zeros(region_rgb.shape[:2], dtype=np.uint8)
        for class_id, (_name, colour) in REGION_CLASSES.items():
            match = np.all(region_rgb == np.array(colour, dtype=np.uint8), axis=-1)
            self.region[match] = class_id

        # Salt-exposure field (round 4): signed distance to the OCEAN, from
        # the region raster's ocean class. Distinct from `shore_m` (nearest
        # water of any kind) — an interior lake is wet but not salty.
        # Mangrove-classified intertidal shallows count as land here: they
        # are the coast's own vegetation, not open sea.
        ocean = self.region == 0
        coast_in = ndimage.distance_transform_edt(~ocean) * self.region_px_m
        coast_out = ndimage.distance_transform_edt(ocean) * self.region_px_m
        self.coast_m = np.where(ocean, -coast_out, coast_in).astype(np.float32)

        control = np.asarray(Image.open(province / "refined" / "ground-control.png")
                             .convert("RGBA"))
        self.land_cover = control[..., 0].copy()

        self.extent_m = self.height_m.shape[0] * self.px_m
        # ground-control ships at FULL resolution (double the refined height
        # raster) — sampling it with px_m read the wrong quadrant entirely.
        self.control_px_m = self.extent_m / control.shape[0]

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
                v if (v := self._pixel(self.depth_m, x, z, self.px_m)) is not None else -20.0),
            slope=lambda x, z: float(
                v if (v := self._pixel(self.slope_deg, x, z, self.px_m)) is not None else 90.0),
            region=lambda x, z: int(
                v if (v := self._pixel(self.region, x, z, self.region_px_m)) is not None else 0),
            land_cover=lambda x, z: int(
                v if (v := self._pixel(self.land_cover, x, z, self.control_px_m)) is not None else 0),
            shore=lambda x, z: float(
                v if (v := self._pixel(self.shore_m, x, z, self.px_m)) is not None else 9999.0),
            coast=lambda x, z: float(
                v if (v := self._pixel(self.coast_m, x, z, self.region_px_m)) is not None else 99999.0),
        )

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
    return Palette(id="province", layers=layers)


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
    order = species_order(palette)
    instances, counts = composition.compose(
        instances, attachment_layers, fields, seed,
        area_ha=CHUNK_M * CHUNK_M / 10_000, allowed=set(order))
    return present, instances, encode(instances, order), counts


def variation_probe(instances, size_m: float, cell_m: float = 58.0) -> dict:
    """Does the compiled scatter vary as much as the source does?

    The two numbers the reference was measured on
    (research/vegetation-density-design.md): the coefficient of variation of
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
    ap.add_argument("--report", action="store_true")
    args = ap.parse_args()

    data = json.loads(Path(args.palettes).read_text())
    scale = args.density_scale if args.density_scale is not None else float(
        data.get("densityScale", 1.0))
    palette = merge_palettes({
        int(region): Palette.from_dict(entry)
        for region, entry in data["byRegionClass"].items()
    }, scale)
    print(f"density scale x{scale:g}")
    source = ProvinceFields()
    grid = source.chunk_grid()
    if args.chunk:
        wanted = [tuple(int(v) for v in c.split(",")) for c in args.chunk]
    else:
        wanted = [(cx, cz) for cz in range(grid) for cx in range(grid)]

    out_dir = Path(args.out) if args.out else None
    if out_dir:
        out_dir.mkdir(parents=True, exist_ok=True)

    index = {}
    totals: Counter = Counter()
    species_totals: Counter = Counter()
    class_counts: Counter = Counter()
    class_area_px: Counter = Counter()
    fields_for_report = source.as_fields()
    composition = Composition.load()
    per_chunk = []
    for cx, cz in wanted:
        present, instances, blob, counts = compile_chunk(
            source, palette, cx, cz, args.seed, composition)
        if not instances:
            continue
        tiers = Counter(i.tier for i in instances)
        totals.update(tiers)
        totals.update(counts)
        totals["chunks"] += 1
        species_totals.update(i.species for i in instances)
        if args.report:
            # Delivered density per REGION CLASS at the instance, against the
            # class's own area — the per-modal-chunk numbers mix classes and
            # understate every dense class that shares its chunks.
            class_counts.update(
                fields_for_report.region(i.x, i.z) for i in instances)
            window = source._region_window(cx, cz)
            for value, count in zip(*np.unique(window, return_counts=True)):
                class_area_px[int(value)] += int(count)
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
        if args.report:
            # Per *species*, to compare like with like: the mined 0.45 is a
            # per-species figure, and pooling every layer's points would
            # measure the palette's overlap rather than its clumping.
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
        per_chunk.append(record)
        if out_dir:
            (out_dir / f"chunk_{cx}_{cz}_vegetation.bin").write_bytes(blob)
            index[f"{cx}_{cz}"] = record

    if out_dir:
        (out_dir / "vegetation-index.json").write_text(
            json.dumps({"seed": args.seed, "chunkMetres": round(CHUNK_M, 2),
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
