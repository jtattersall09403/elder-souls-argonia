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
* :data:`MEASURED_DELIVERED_PER_HA` / :data:`MEASURED_ATTENUATION` — measured
  from the shipped bundles, re-fitted 2026-09-09 against the first
  post-re-base bake. Re-measure and re-fit them whenever the scatter, the
  gates or the region raster move; they are a MEASUREMENT of what the world
  does, never a knob to turn until a gate goes green.
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
    11: 0.55,  # firm lowland — our largest lowland class, must sit below 13
    12: 0.02,  # lake & standing water — drowned snags only
    13: 1.00,  # tropical jungle — the reference (owner: do not change)
    14: 1.40,  # mangrove forest — more STEMS, lower roof: a thicket
}

#: What the UNREBASED region tables in `build_palettes.REGIONS` deliver, in
#: stems per hectare, measured PER REGION PIXEL (`measure_delivered_by_region`),
#: not per dominant chunk. This is the denominator `multipliers()` divides
#: into, so it must stay on the *base* authoring basis even after a re-base:
#: it is re-fitted as `delivered_measured / ladderMultiplierApplied`.
#:
#: The per-pixel measure matters: the 2026-09-08 audit's dominant-chunk figures
#: put the lake at 54.4/ha, which is its NEIGHBOURS' forest counted inside
#: lake-dominated chunks. Measured per pixel the lake carries under 1/ha, which
#: is what open water should carry — the anomaly was attribution, not scatter.
#:
#: Re-fitted 2026-09-09 (decision 0048 round 14) as the MEAN of four
#: post-re-base bakes. The originals were fitted from the pre-re-base bake on
#: the assumption that delivery is linear in the authored count; it is not
#: quite, because clearance rejection eases as density falls, so the hard-cut
#: classes came back above the linear prediction.
#:
#: WHY A MEAN, and not the last bake. A single bake is one draw. Re-fitting
#: from one draw and re-baking is an undamped fixed-point iteration, and for
#: the two densest/thinnest classes its gain exceeds one: mangrove forest (14)
#: read 157.3, 154.9, 173.1, 153.2 across successive bakes and the delivered
#: ratio swung 1.38 → 1.56 → 1.24 without settling; tidal delta (3), on 3.8 ha,
#: swung as hard. The quantity is the same each time — D is normalised back to
#: the base authoring basis — so the honest estimator of a noisy measurement is
#: the mean of the draws, not the newest one. Averaging converged in one bake
#: where chasing the last draw did not converge in three.
#:
#: RE-FITTING PROCEDURE for the next agent: run `build_palettes`, then
#: `compile_scatter`, then `measure_delivered_by_region`; set
#: D[r] = delivered[r] / palettes[r]["ladderMultiplierApplied"] and
#: A[r] = delivered[r] / authored_stem_density(r); average over several bakes
#: before writing them back. Never edit these to make a gate go green.
MEASURED_DELIVERED_PER_HA: dict[int, float] = {
    1: 13.44, 2: 34.36, 3: 36.18, 4: 61.54, 5: 8.53, 6: 138.24, 7: 133.45,
    8: 25.24, 9: 25.52, 11: 29.24, 12: 0.69, 13: 39.10, 14: 159.63,
}

#: delivered / authored for the same shipping. This is the fraction of an
#: authored hectare that survives the altitude band, the slope and depth
#: gates, clearance rejection and `composition.py`'s cluster division. It is
#: MEASURED for every class — including 3, 4, 5 and 9, which the earlier
#: dominant-chunk audit could not see, because the per-pixel measure needs no
#: chunk to be dominated by the class to count its instances.
#:
#: Re-fitted 2026-09-09 as the mean of four post-re-base bakes, at the authored
#: levels the ladder now ships. Attenuation is mildly density-dependent
#: (clearance rejection eases as density falls), so it is measured at the
#: level it describes rather than carried over from the pre-re-base bake, and
#: averaged for the reason given on MEASURED_DELIVERED_PER_HA above.
MEASURED_ATTENUATION: dict[int, float] = {
    1: 0.198, 2: 0.234, 3: 0.213, 4: 0.184, 5: 0.077, 6: 0.742, 7: 0.660,
    8: 0.536, 9: 0.227, 11: 0.531, 12: 0.115, 13: 0.461, 14: 0.355,
}

#: Classes whose region covers so little of the province that their per-pixel
#: sample is thin. Their attenuation is real but noisy; the gates widen for
#: them. Measured areas (2026-09-09, `region_area_ha`, after class 10 was
#: retired): 3 → 3.8 ha, 5 → 10.3 ha, 4 → 17.3 ha.
THIN_SAMPLE_CLASSES = frozenset({3, 4, 5})

#: Below this the per-hectare sample cannot answer the question at all, and a
#: wider tolerance is not the honest response — silence is, provided it is a
#: NAMED silence.
#:
#: Derivation: the loose gate tests a delivered ratio to ±0.35, so the class
#: needs enough instances that Poisson noise is smaller than that. At the
#: 1/sqrt(n) relative error of a count, ±0.35 on a ratio near 1 needs n ≳ 8,
#: and the thinnest classes deliver 12–74 stems per hectare, so one hectare is
#: the floor at which the measure starts meaning anything.
#:
#: On the shipped bake of 2026-09-09 exactly one class fell below it — raised
#: hammock (class 10), 18 pixels, 0.05 ha of a 37 km² province, reading 4× its
#: target on a sample far too thin to act on. That was a hole in the region
#: grammar, not a vegetation defect, and it was closed by RETIRING the class
#: (decision 0050). **No class is below the floor now**, and
#: `test_no_region_class_leaves_the_delivered_gate_silently` holds it there.
#:
#: The gate still REPORTS every class it would exclude, by name, in the same
#: style as `conftest.py`'s KNOWN RED banner: a class must never leave the
#: ladder quietly, which is how region 10's 4× overshoot went unnoticed.
MIN_MEASURABLE_AREA_HA = 1.0

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


# --- region adjacency (understory exclusivity) -------------------------------

#: A pair of region classes counts as adjacent once they share this many
#: 4-neighbour cells on the shipped region raster. At 468 m/chunk and the
#: hydrology raster's metres-per-pixel this is a seam of real length, not the
#: handful of stray pixels two classes trade where a third separates them.
ADJACENCY_MIN_SHARED_EDGES = 250


def _region_classes(province: Path = PROVINCE):
    """The region raster decoded to class ids, 255 where no class matches."""
    import numpy as np
    from PIL import Image

    from .regions import REGION_CLASSES

    rgb = np.asarray(Image.open(province / "hydro-regions.png").convert("RGB"))
    classes = np.full(rgb.shape[:2], 255, np.uint8)
    for class_id, (_name, colour) in REGION_CLASSES.items():
        classes[np.all(rgb == np.array(colour, np.uint8), axis=-1)] = class_id
    return classes


def region_area_ha(province: Path = PROVINCE) -> dict[int, float]:
    """How much province each region class actually covers, in hectares.

    Measured from the shipped raster, because a per-hectare density is only
    as meaningful as the hectares under it and the region solve moves. This
    is what decides whether a class can be held to the delivered ladder at
    all (:data:`MIN_MEASURABLE_AREA_HA`).
    """
    from .scale import PROVINCE_EXTENT_M

    classes = _region_classes(province)
    cell_ha = (PROVINCE_EXTENT_M / classes.shape[0]) ** 2 / 10_000.0
    return {int(c): float((classes == c).sum()) * cell_ha
            for c in sorted(set(classes.flatten().tolist())) if c != 255}


def region_adjacency(province: Path = PROVINCE) -> dict[int, set[int]]:
    """Which region classes physically touch, measured from the raster.

    Exclusivity is a claim about what a player meets when they walk across a
    boundary, so it has to be checked against the boundaries that exist —
    not against a hand-written neighbour table that would go stale the next
    time the regions are re-rastered.
    """
    import numpy as np
    from PIL import Image

    from .regions import REGION_CLASSES

    rgb = np.asarray(Image.open(province / "hydro-regions.png").convert("RGB"))
    classes = np.full(rgb.shape[:2], 255, np.uint8)
    for class_id, (_name, colour) in REGION_CLASSES.items():
        classes[np.all(rgb == np.array(colour, np.uint8), axis=-1)] = class_id
    counts: dict[tuple[int, int], int] = {}
    for a, b in ((classes[:, :-1], classes[:, 1:]),
                 (classes[:-1], classes[1:])):
        differs = a != b
        for x, y in zip(a[differs].tolist(), b[differs].tolist()):
            if x == 255 or y == 255:
                continue
            key = (min(x, y), max(x, y))
            counts[key] = counts.get(key, 0) + 1
    adjacency: dict[int, set[int]] = {c: set() for c in REGION_CLASSES}
    for (x, y), shared in counts.items():
        if shared >= ADJACENCY_MIN_SHARED_EDGES:
            adjacency[x].add(y)
            adjacency[y].add(x)
    return adjacency


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
