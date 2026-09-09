"""The between-region tree-density ladder — targets, measure, and re-basing.

Why this module exists: the ladder drifted for four authoring rounds because
nothing checked it. Round 7 traded jungle stem count for wide crowns
(`build_palettes.py`, region 13's note) and nothing else was re-based, so by
2026-09-09 the shipped province delivered the tropical jungle at the 37th
percentile of its own lowland chunks — the owner's report that "everything
below the mountains looks the same" was correct.

Everything the ladder needs lives here so the generator, the tests and the
next agent read the SAME numbers:

* :data:`TARGET_RATIOS` — the delivered ladder, jungle = 1.00 (decision 0048).
* :data:`MEASURED_DELIVERED_PER_HA` / :data:`MEASURED_ATTENUATION` — what the
  shipped bundles actually carried on 2026-09-09, before the re-base.
* :func:`multipliers` — authored re-base factors derived from those two.
* :func:`authored_stem_density` / :func:`measure_delivered_by_region` — the
  one stem measure, used by both gates so they cannot disagree.

THE STEM MEASURE. "Trees per hectare" is *T1-tier instances whose role is not
rock or cliff dressing*: the hero stratum the player reads as forest —
giants, emergents, canopy, gallery, waterline and drowned trees, basin
mangrove, and the rootland's tree-scale fungi. It deliberately excludes the
T2 understory, lianas, epiphytes, aquatics and the boulder ladder (counting
boulders is why region 1 and 2 read denser than they are).

CLOSURE IS NOT GATED, and that is a recorded gap, not an oversight: crown
diameter is not a field `palettes.json` carries, so canopy CLOSURE cannot be
computed from the shipped record. Asserting it from stem counts would be
standard-12 prose — a claim the typed fields cannot deliver. The backlog row
(`docs/polish-backlog.md`, "vegetation crown diameters") is the fix.
"""

from __future__ import annotations

import json
import statistics
import struct
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
PALETTES = REPO_ROOT / "world" / "sources" / "flora" / "palettes.json"
PROVINCE = REPO_ROOT / "apps" / "world-studio" / "public" / "province"
VEGETATION = PROVINCE / "vegetation"

#: Roles carried at T1 that are rock, not vegetation.
ROCK_ROLES = frozenset({"rock", "cliff-dressing"})

#: The delivered ladder, tropical jungle (class 13) = 1.00. Owner constraint
#: 2026-09-09: the jungle's current level FEELS RIGHT and does not move; every
#: other class is re-based relative to it. Grounding per row is in
#: docs/decisions/0048-vegetation-density-ladder.md and in the region notes in
#: build_palettes.py; the ecology numbers are
#: docs/research/vegetation/tropical-vegetation-ecology-targets.md §7.1/§7.2.
TARGET_RATIOS: dict[int, float] = {
    0: 0.00,   # ocean
    1: 0.15,   # border mountains — treeline gates stay, level drops
    2: 0.60,   # upland hills — "more temperate grasslands" (Thornmarsh)
    3: 0.45,   # tidal delta — type 3 landward band over mudflat and salt pan
    4: 0.35,   # coastal lagoon & salt marsh — trees patchy on saline flats
    5: 0.60,   # deep river corridor — §7.2 gallery ribbon, open midchannel
    6: 0.76,   # rootland deep marsh — type 4: fewer, far bigger trunks
    7: 0.67,   # interior swamp — type 2 flooded forest
    8: 0.40,   # fringe marsh — the legible ecotone step
    9: 0.12,   # seasonal floodplain — 5c savanna; the open counterpoint
    10: 0.45,  # raised hammock — dry palm islands on the hummocks
    11: 0.55,  # firm lowland — our largest lowland class, must sit below 13
    12: 0.02,  # lake & standing water — drowned snags only
    13: 1.00,  # tropical jungle — the reference (owner: do not change)
    14: 1.40,  # mangrove forest — more STEMS, lower roof: a thicket
}

#: Delivered stems per hectare in the bundles shipped on 2026-09-09, measured
#: PER REGION PIXEL (`measure_delivered_by_region`), not per dominant chunk.
#: The per-pixel measure matters: the audit's dominant-chunk figures put the
#: lake at 54.4/ha, which is its NEIGHBOURS' forest counted inside lake-
#: dominated chunks. Measured per pixel the lake carries 0.87/ha, which is
#: what open water should carry — the anomaly was attribution, not scatter.
MEASURED_DELIVERED_PER_HA: dict[int, float] = {
    1: 12.74, 2: 32.60, 3: 26.03, 4: 69.17, 5: 11.73, 6: 115.68, 7: 119.32,
    8: 19.22, 9: 15.27, 10: 18.48, 11: 26.97, 12: 0.87, 13: 39.00, 14: 149.06,
}

#: delivered / authored for the same shipping. This is the fraction of an
#: authored hectare that survives the altitude band, the slope and depth
#: gates, clearance rejection and `composition.py`'s cluster division. It is
#: MEASURED for every class — including 3, 4, 5, 9 and 10, which the earlier
#: dominant-chunk audit could not see, because the per-pixel measure needs no
#: chunk to be dominated by the class to count its instances.
MEASURED_ATTENUATION: dict[int, float] = {
    1: 0.187, 2: 0.222, 3: 0.153, 4: 0.206, 5: 0.107, 6: 0.621, 7: 0.590,
    8: 0.408, 9: 0.136, 10: 0.176, 11: 0.490, 12: 0.144, 13: 0.459, 14: 0.331,
}

#: Classes whose region covers so little of the province that their per-pixel
#: sample is thin (region area in hectares: 3 → 4, 5 → 10, 10 → 0.4, 4 → 17).
#: Their attenuation is real but noisy; the gates widen for them.
THIN_SAMPLE_CLASSES = frozenset({3, 4, 5, 10})

#: Ladder tolerance. The re-base is linear in the authored count, but
#: attenuation is not quite linear — clearance rejection eases as density
#: falls, so a class cut hard lands a little ABOVE its target. ±0.15 on the
#: ratio absorbs that; thin-sample classes get ±0.35.
RATIO_TOLERANCE = 0.15
THIN_RATIO_TOLERANCE = 0.35


def is_stem_layer(layer: dict) -> bool:
    """True for the layers the stem measure counts (see module docstring)."""
    return layer.get("tier") == "T1" and layer.get("role") not in ROCK_ROLES


def load_palettes(path: Path = PALETTES) -> dict[str, dict]:
    return json.loads(path.read_text())["byRegionClass"]


def authored_stem_density(palettes: dict[str, dict], region: int) -> float:
    """Authored stems per hectare for one region class."""
    entry = palettes.get(str(region))
    if entry is None:
        return 0.0
    return sum(layer["instances_per_hectare"]
               for layer in entry["layers"] if is_stem_layer(layer))


def delivered_equivalent(palettes: dict[str, dict], region: int) -> float:
    """Authored stems put through the measured attenuation.

    This is the fast, CI-cheap stand-in for decoding 200 chunk bundles: it is
    what the shipped province WILL deliver once the scatter rollout runs, on
    the assumption that attenuation is unchanged by the re-base.
    """
    return authored_stem_density(palettes, region) * MEASURED_ATTENUATION.get(region, 0.0)


def multipliers() -> dict[int, float]:
    """Authored re-base factor per region class.

    ``target_delivered / delivered_today``: because delivery is (near) linear
    in the authored count, scaling the authored stems by this lands the class
    on its target ratio. Region 13 is exactly 1.0 — the owner's constraint.
    """
    reference = MEASURED_DELIVERED_PER_HA[13]
    out: dict[int, float] = {}
    for region, ratio in TARGET_RATIOS.items():
        delivered = MEASURED_DELIVERED_PER_HA.get(region, 0.0)
        if delivered <= 0.0:
            continue
        out[region] = round(ratio * reference / delivered, 4)
    out[13] = 1.0
    return out


# --- delivered measure (gate 2) ---------------------------------------------

_BUNDLE_MAGIC = 0x45535647
_INSTANCE_BYTES = 17          # keep in step with vegetationBundle.ts
_SPECIES_HEADER_BYTES = 28


def _decode_positions(path: Path, order: list[str]):
    """Yield ``(species_id, x_array, z_array)`` per group in one bundle.

    Format v2, mirroring `apps/world-studio/src/vegetation/vegetationBundle.ts`.
    """
    import numpy as np

    blob = path.read_bytes()
    if struct.unpack_from(">I", blob, 0)[0] != _BUNDLE_MAGIC:
        raise ValueError(f"{path.name} is not a vegetation bundle")
    if struct.unpack_from("<I", blob, 4)[0] != 2:
        raise ValueError(f"{path.name} is not bundle format version 2")
    groups = struct.unpack_from("<I", blob, 8)[0]
    offset = 12
    headers = []
    for _ in range(groups):
        index, count = struct.unpack_from("<II", blob, offset)
        headers.append((index, count))
        offset += _SPECIES_HEADER_BYTES
    for index, count in headers:
        raw = np.frombuffer(blob, dtype=np.uint8, count=count * _INSTANCE_BYTES,
                            offset=offset).reshape(count, _INSTANCE_BYTES)
        pos = np.frombuffer(np.ascontiguousarray(raw[:, :12]).tobytes(),
                            dtype="<f4").reshape(count, 3)
        yield order[index], pos[:, 0], pos[:, 2]
        offset += count * _INSTANCE_BYTES


def measure_delivered_by_region(
    province: Path = PROVINCE, palettes_path: Path = PALETTES,
) -> dict[int, float]:
    """Delivered stems per hectare of each region class, from the shipped data.

    Per REGION PIXEL, not per dominant chunk: every instance is attributed to
    the region class of the raster cell it stands in, and divided by that
    class's own area. Chunks interdigitate several classes below the 468 m
    chunk (`compile_scatter.ProvinceFields.regions_in`), so dominant-chunk
    attribution measures a class's neighbours as much as the class itself.
    """
    import numpy as np
    from PIL import Image

    from .regions import REGION_CLASSES

    palettes = load_palettes(palettes_path)
    stems = {layer["species"]
             for entry in palettes.values() for layer in entry["layers"]
             if is_stem_layer(layer)}

    hydro = json.loads((province / "hydrology-meta.json").read_text())
    rgb = np.asarray(Image.open(province / "hydro-regions.png").convert("RGB"))
    classes = np.full(rgb.shape[:2], 255, np.uint8)
    for class_id, (_name, colour) in REGION_CLASSES.items():
        classes[np.all(rgb == np.array(colour, np.uint8), axis=-1)] = class_id
    px_m = hydro["metresPerPixel"]
    height, width = classes.shape

    index = json.loads((province / "vegetation" / "vegetation-index.json").read_text())
    order = index["speciesOrder"]

    counts: dict[int, int] = {}
    for key in index["chunks"]:
        bundle = province / "vegetation" / f"chunk_{key}_vegetation.bin"
        if not bundle.exists():
            continue
        for species, xs, zs in _decode_positions(bundle, order):
            if species not in stems or xs.size == 0:
                continue
            ix = np.clip((xs / px_m).astype(int), 0, width - 1)
            iz = np.clip((zs / px_m).astype(int), 0, height - 1)
            for class_id, n in zip(*np.unique(classes[iz, ix], return_counts=True)):
                counts[int(class_id)] = counts.get(int(class_id), 0) + int(n)

    hectares = {int(c): float((classes == c).sum()) * px_m * px_m / 1e4
                for c in REGION_CLASSES}
    return {c: (counts.get(c, 0) / hectares[c] if hectares[c] > 0 else 0.0)
            for c in sorted(REGION_CLASSES)}


def dominant_chunk_medians(province: Path = PROVINCE) -> dict[int, float]:
    """The audit's coarser view: median stems/ha over each class's dominant
    chunks. Kept because it is the number the owner's report was made against
    and the number the 2026-09-08 audit published; `measure_delivered_by_region`
    is the one the ladder is set from."""
    palettes = load_palettes()
    rocks = {layer["species"] for entry in palettes.values()
             for layer in entry["layers"] if layer.get("role") in ROCK_ROLES}
    index = json.loads((province / "vegetation" / "vegetation-index.json").read_text())
    order = index["speciesOrder"]
    hectares = index["chunkMetres"] ** 2 / 1e4
    by_region: dict[int, list[float]] = {}
    for key, entry in index["chunks"].items():
        bundle = province / "vegetation" / f"chunk_{key}_vegetation.bin"
        if not bundle.exists():
            continue
        rock = sum(int(xs.size) for species, xs, _ in _decode_positions(bundle, order)
                   if species in rocks)
        density = (entry["tiers"].get("T1", 0) - rock) / hectares
        by_region.setdefault(entry["region"], []).append(density)
    return {r: statistics.median(v) for r, v in sorted(by_region.items())}


def main() -> None:
    palettes = load_palettes()
    factors = multipliers()
    print(f"{'reg':>3} {'target':>7} {'mult':>7} {'authored':>9} {'equiv':>7} {'ratio':>6}")
    reference = delivered_equivalent(palettes, 13)
    for region in sorted(TARGET_RATIOS):
        if region not in factors:
            continue
        authored = authored_stem_density(palettes, region)
        equivalent = delivered_equivalent(palettes, region)
        print(f"{region:>3} {TARGET_RATIOS[region]:7.2f} {factors[region]:7.3f} "
              f"{authored:9.1f} {equivalent:7.2f} {equivalent / reference:6.2f}")


if __name__ == "__main__":
    main()
