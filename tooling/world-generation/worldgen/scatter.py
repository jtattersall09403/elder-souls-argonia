"""Deterministic clustered scatter — the vegetation compiler pass (module 65
§111), built on the mined placement rules (`docs/research/shipped-world-placement-rules.md`).

Two things drive the design, and both come from measurement rather than taste:

* **Hand placement clumps** (rule R1). Every species in both mined worldspaces
  sits at a Clark-Evans R of roughly 0.45 — neighbours half as far apart as
  random. A jittered grid scores *above* 1.0, more even than random, which is
  why this sampler places clump centres first and members around them, and why
  `clark_evans` ships alongside as a probe rather than as an afterthought.
* **Density is a field, not a number** (rules R2, R3). It peaks at the
  waterline, falls by half per ~12° of slope to a floor, and is gated by hard
  water-depth and slope limits per layer.

Determinism is a hash of (seed, layer, cell), never a stateful RNG: the same
seed must produce byte-identical bundles on any machine, in any order, so
chunks can be recompiled independently (module 65 acceptance).
"""

from __future__ import annotations

import math
import struct
from dataclasses import dataclass, field
from typing import Callable, Iterable

# --- deterministic hashing ---------------------------------------------------

_MASK = 0xFFFFFFFFFFFFFFFF


def hash64(*values: int) -> int:
    """SplitMix64 over a tuple — order-sensitive, avalanche-quality, and the
    same on every machine (Python's `hash` is salted and must never be used)."""
    state = 0x9E3779B97F4A7C15
    for value in values:
        state = (state + (int(value) & _MASK) * 0x9E3779B97F4A7C15) & _MASK
        state ^= state >> 30
        state = (state * 0xBF58476D1CE4E5B9) & _MASK
        state ^= state >> 27
        state = (state * 0x94D049BB133111EB) & _MASK
        state ^= state >> 31
    return state


def uniform(*values: int) -> float:
    """A stable float in [0, 1) from a hash of the given ints."""
    return (hash64(*values) >> 11) * (1.0 / (1 << 53))


def uniform_at(salt: int, *values: int) -> float:
    return uniform(salt, *values)


# --- response curves ---------------------------------------------------------


def slope_response(slope_deg: float, half_angle: float = 12.0,
                   floor: float = 0.2, cutoff: float = 60.0) -> float:
    """Mined rule R3: density halves per ~12° and flattens out, rather than
    being clipped by a single slope threshold."""
    if slope_deg >= cutoff:
        return 0.0
    return max(floor, 0.5 ** (slope_deg / half_angle))


GLADE_WAVELENGTH_M = 90.0
"""Openings big enough to walk into and notice — a glade, a thicket.

Measured, not guessed: in both mined worldspaces density correlation is half
gone by ~58 m and nearly gone by ~175 m, and the median open space between
plants is ~10 m with the largest gaps ~30 m
(research/vegetation-density-design.md). A 90 m glade wavelength puts
clearings at roughly that human scale."""

STAND_WAVELENGTH_M = 190.0
"""Whole-neighbourhood variation — one part of a jungle thicker than another.

The mined correlation reaches the noise floor by ~200 m, so stand-scale
variation must play out over that distance, not over the 340 m first guessed."""


def value_noise(salt: int, x: float, z: float, wavelength: float) -> float:
    """Smooth deterministic noise in [0, 1] — bilinear over a hash lattice.

    Density has to vary *inside* a region as well as between regions (owner,
    2026-08-30), or a jungle is uniformly a jungle everywhere and reads as
    wallpaper. Hash-lattice noise keeps that variation reproducible: the same
    seed puts the same glade in the same place forever.
    """
    gx, gz = x / wavelength, z / wavelength
    x0, z0 = math.floor(gx), math.floor(gz)
    fx, fz = gx - x0, gz - z0
    # Smoothstep the interpolant so lattice lines do not show as creases.
    sx = fx * fx * (3 - 2 * fx)
    sz = fz * fz * (3 - 2 * fz)
    corners = [
        uniform(salt, (x0 + i) & 0xFFFFFFFF, (z0 + j) & 0xFFFFFFFF)
        for j in (0, 1) for i in (0, 1)
    ]
    top = corners[0] + (corners[1] - corners[0]) * sx
    bottom = corners[2] + (corners[3] - corners[2]) * sx
    return top + (bottom - top) * sz


def patch_factor(noise: float, strength: float) -> float:
    """A mean-one multiplier: thickets above 1, glades below, average unchanged
    so patchiness never quietly changes how much of a species there is."""
    return max(0.0, 1.0 + strength * (noise * 2.0 - 1.0))


def depth_response(depth_m: float, peak_m: float = 0.0,
                   half_width_m: float = 2.0) -> float:
    """Mined rule R2: a single peak in density at the waterline.

    `depth_m` is metres of standing water over the ground — negative on dry
    ground. Species that want open water set `peak_m` positive.
    """
    if half_width_m <= 0:
        return 1.0
    return math.exp(-((depth_m - peak_m) / half_width_m) ** 2)


# --- palette -----------------------------------------------------------------


@dataclass
class Layer:
    """One species' placement rule. Densities are per hectare of *eligible*
    ground, matching how the mined figures were measured."""

    species: str
    tier: str = "T2"                      # T1 hero | T2 mid | T3 groundcover
    instances_per_hectare: float = 20.0
    """Instances per hectare of **ideal** ground, before the depth and slope
    responses thin them. Authored in the same unit the mining measured, so a
    palette number can be compared straight against the research doc."""
    clump_size_median: float = 3.0
    clump_size_tail: float = 0.45         # 0 = every clump the median, 1 = wild
    clump_radius_m: float = 8.0
    singleton_share: float = 0.10
    """Share of *instances* standing alone between the clumps.

    Calibrated against Clark-Evans rather than against the mined
    fraction-in-clumps: that fraction was measured at a link distance derived
    from the data's own spacing, so it is not the same quantity as this knob,
    whereas R is defined identically on both sides. At these defaults the
    sampler lands at R ≈ 0.5–0.6 across clump sizes, against the mined 0.43–0.49
    (`_calibration` in the tests pins this).
    """
    # Hard gates.
    region_classes: tuple[int, ...] = ()
    water_depth_m: tuple[float, float] = (-99.0, 99.0)
    slope_deg_max: float = 45.0
    land_cover: tuple[int, ...] = ()
    # Soft response.
    depth_peak_m: float = 0.0
    depth_half_width_m: float = 0.0
    """0 = flat across the whole gated range. Only species that genuinely
    taper away from a preferred depth set this: forcing a waterline peak on
    every layer annihilates dry-ground species (a jungle 6 m above the water
    table would keep 0.01 % of its trees), and the aggregate waterline peak
    of rule R2 emerges from the *gates* anyway — marsh species outnumber
    upland ones, so density peaks where they overlap."""
    slope_half_angle_deg: float = 12.0
    patchiness: float = 0.85
    """How strongly this species alone thickens and thins across a landscape.

    The mined worlds vary hugely: the standard deviation of density between
    neighbouring dressed cells is 2.3-3.1x the mean. An evenly-spread scatter
    would be markedly *less* varied than the reference, which is the "samey"
    failure the owner called out."""
    glade_response: float = 0.7
    """How strongly it follows the *shared* openness field — the glades and
    thickets every species in a place agrees on. Species that fill gaps
    (reeds in an opening) can set this negative to grow where trees do not."""
    # Presentation.
    scale_range: tuple[float, float] = (0.9, 1.2)
    yaw_random: bool = True
    tilt_deg_max: float = 4.0
    # Clearance: what this layer stamps, and what it refuses to grow inside.
    clearance_radius_m: float = 0.0
    respects_clearance: bool = True

    def gate(self, depth_m: float, slope_deg: float, region: int,
             cover: int) -> bool:
        if self.region_classes and region not in self.region_classes:
            return False
        if not (self.water_depth_m[0] <= depth_m <= self.water_depth_m[1]):
            return False
        if slope_deg > self.slope_deg_max:
            return False
        if self.land_cover and cover not in self.land_cover:
            return False
        return True

    def weight(self, depth_m: float, slope_deg: float) -> float:
        return (
            depth_response(depth_m, self.depth_peak_m, self.depth_half_width_m)
            * slope_response(slope_deg, self.slope_half_angle_deg)
        )

    def patchiness_at(self, salt: int, glade: float, x: float, z: float) -> float:
        """The local thick/thin multiplier at a position: this species' own
        variation times the openness every species shares."""
        own = value_noise(salt ^ 0x9E37, x, z, STAND_WAVELENGTH_M)
        return patch_factor(own, self.patchiness) * patch_factor(
            glade, self.glade_response)


@dataclass
class Palette:
    """An ordered set of layers. Order is meaningful: layers stamp clearance
    for the layers after them, so hero assets come first (module 65 §111's
    one-directional big-to-small rule)."""

    id: str
    layers: list[Layer] = field(default_factory=list)

    #: Keys a palette may carry for humans and tooling that the sampler
    #: ignores — `role` labels a layer's purpose in the design, `note`
    #: explains it. Silently dropping unknown keys would hide typos, so the
    #: allowed ones are named.
    ANNOTATION_KEYS = frozenset({"role", "note"})

    @classmethod
    def from_dict(cls, data: dict) -> "Palette":
        layers = []
        for entry in data["layers"]:
            fields = {k: v for k, v in entry.items() if k not in cls.ANNOTATION_KEYS}
            for key in ("region_classes", "land_cover"):
                if key in fields:
                    fields[key] = tuple(fields[key])
            for key in ("water_depth_m", "scale_range"):
                if key in fields:
                    fields[key] = tuple(fields[key])
            layers.append(Layer(**fields))
        return cls(id=data["id"], layers=layers)


# --- the sampler -------------------------------------------------------------


@dataclass
class Instance:
    species: str
    tier: str
    x: float
    y: float
    """Ground height at the instance, metres — sea level is 0 (decision 0003)."""
    z: float
    yaw: float
    scale: float
    tilt_x: float
    tilt_z: float


@dataclass
class Fields:
    """Everything the sampler asks about a world position, in metres.

    Deliberately a plain callable bundle: the province compiler passes raster
    lookups, tests pass closures, and the micro-lab passes a flat plane. The
    sampler never learns where the numbers came from.
    """

    height: Callable[[float, float], float]
    water_depth: Callable[[float, float], float]
    slope: Callable[[float, float], float]
    region: Callable[[float, float], int]
    land_cover: Callable[[float, float], int] = lambda x, z: 0


HECTARE_M2 = 10_000.0


def _layer_salt(seed: int, layer: Layer) -> int:
    """A layer's identity, independent of its position in the palette.

    Filtering a merged palette down to the layers a chunk can use must not
    change any surviving layer's pattern, so the salt cannot be a list index.
    """
    name = layer.species + "|" + layer.tier
    return hash64(seed, *[ord(c) for c in name], *layer.region_classes)


def _mean_clump_size(median: float, tail: float, samples: int = 64) -> float:
    """Expected members per clump, by quadrature over the size law — cheap,
    exact enough, and deterministic (no sampling noise in the density)."""
    total = sum(
        _clump_size((i + 0.5) / samples, median, tail) for i in range(samples)
    )
    return total / samples


def _clump_size(rand: float, median: float, tail: float) -> int:
    """Heavy-tailed clump sizes: the median clump is small, but most *plants*
    live in the big ones — which is what the mined size-weighted percentiles
    say (rule R1)."""
    if tail <= 0:
        return max(1, int(round(median)))
    # Inverse-CDF of a geometric-ish law, shaped so `median` is the median.
    scale = max(1e-6, median)
    value = scale * ((1.0 - rand) ** -tail - 1.0) / (2.0 ** tail - 1.0)
    return max(1, int(round(value)))


def scatter_chunk(origin_x: float, origin_z: float, size_m: float,
                  palette: Palette, fields: Fields, seed: int,
                  chunk_id: tuple[int, int] = (0, 0)) -> list[Instance]:
    """Every instance a palette places in one chunk.

    Chunk-local determinism: sampling is driven entirely by
    `hash(seed, layer, cell)`, so a chunk compiles identically whether or not
    its neighbours ever compile. Clump members may fall outside the chunk and
    are dropped — the neighbouring chunk generates its own copy of the same
    clump from the same hash, so nothing is lost or doubled at the seam.
    """
    instances: list[Instance] = []
    stamps: list[tuple[float, float, float]] = []
    area_ha = (size_m * size_m) / HECTARE_M2
    # One openness field for the whole palette: a glade is a glade for every
    # species, which is what makes clearings read as places rather than as
    # per-species noise.
    glade_salt = hash64(seed, 0x61ADE)

    for layer in palette.layers:
        salt = _layer_salt(seed, layer)
        mean_members = _mean_clump_size(layer.clump_size_median, layer.clump_size_tail)
        wanted = max(0.0, layer.instances_per_hectare * area_ha)
        # Solve for centres: singletons contribute one instance each, clumps
        # contribute `mean_members`. Authoring density per instance and
        # deriving the centre count is what keeps the clumping knobs from
        # silently changing how much of a species there is.
        singles_wanted = wanted * layer.singleton_share
        clumps_wanted = wanted * (1.0 - layer.singleton_share) / max(1e-6, mean_members)
        expected_centres = singles_wanted + clumps_wanted
        singleton_centre_share = (
            singles_wanted / expected_centres if expected_centres > 0 else 1.0
        )
        if expected_centres <= 0:
            continue
        # A **global** jittered grid, not a chunk-relative one: a clump
        # straddling a chunk edge must be generated identically from both
        # sides, or every seam thins by half a clump radius. The grid is
        # walked with a margin so those neighbours are seen at all.
        cell_m = size_m / max(1.0, math.sqrt(expected_centres))
        per_cell = expected_centres / ((size_m / cell_m) ** 2)
        margin = layer.clump_radius_m
        gx0 = math.floor((origin_x - margin) / cell_m)
        gx1 = math.floor((origin_x + size_m + margin) / cell_m)
        gz0 = math.floor((origin_z - margin) / cell_m)
        gz1 = math.floor((origin_z + size_m + margin) / cell_m)

        for cell_z in range(gz0, gz1 + 1):
            for cell_x in range(gx0, gx1 + 1):
                cell_key = hash64(salt, cell_x & 0xFFFFFFFF, cell_z & 0xFFFFFFFF)
                # Patchiness scales how many clumps a cell gets, rather than
                # whether one survives a roll. As a rejection test it could
                # only ever *thin* — the upper half of a mean-one field was
                # thrown away, capping achievable variation at about a third
                # of what the source shows.
                seed_x = (cell_x + 0.5) * cell_m
                seed_z = (cell_z + 0.5) * cell_m
                expected_here = per_cell * layer.patchiness_at(
                    salt,
                    value_noise(glade_salt, seed_x, seed_z, GLADE_WAVELENGTH_M),
                    seed_x, seed_z,
                )
                centres = int(expected_here)
                if uniform_at(cell_key, 0) < expected_here - centres:
                    centres += 1
                for centre in range(centres):
                    key = hash64(cell_key, centre)
                    cx = (cell_x + uniform_at(key, 1)) * cell_m
                    cz = (cell_z + uniform_at(key, 2)) * cell_m

                    depth = fields.water_depth(cx, cz)
                    slope = fields.slope(cx, cz)
                    if not layer.gate(depth, slope, fields.region(cx, cz),
                                      fields.land_cover(cx, cz)):
                        continue
                    if uniform_at(key, 3) > layer.weight(depth, slope):
                        continue

                    singles = uniform_at(key, 4) < singleton_centre_share
                    count = 1 if singles else _clump_size(
                        uniform_at(key, 5), layer.clump_size_median,
                        layer.clump_size_tail)

                    for member in range(count):
                        mkey = hash64(key, member)
                        if member == 0:
                            px, pz = cx, cz
                        else:
                            angle = uniform_at(mkey, 0) * math.tau
                            # sqrt keeps members uniform over the disc rather
                            # than piling them on the centre.
                            radius = layer.clump_radius_m * math.sqrt(
                                uniform_at(mkey, 1))
                            px = cx + math.cos(angle) * radius
                            pz = cz + math.sin(angle) * radius
                        if not (origin_x <= px < origin_x + size_m
                                and origin_z <= pz < origin_z + size_m):
                            continue

                        depth_m = fields.water_depth(px, pz)
                        slope_m = fields.slope(px, pz)
                        if not layer.gate(depth_m, slope_m, fields.region(px, pz),
                                          fields.land_cover(px, pz)):
                            continue
                        if uniform_at(mkey, 2) > layer.weight(depth_m, slope_m):
                            continue
                        if layer.respects_clearance and _blocked(px, pz, stamps):
                            continue

                        lo, hi = layer.scale_range
                        scale = lo + (hi - lo) * uniform_at(mkey, 3)
                        yaw = (uniform_at(mkey, 4) * math.tau
                               if layer.yaw_random else 0.0)
                        tilt = math.radians(layer.tilt_deg_max)
                        instances.append(Instance(
                            species=layer.species,
                            tier=layer.tier,
                            x=px, z=pz,
                            y=fields.height(px, pz),
                            yaw=yaw,
                            scale=scale,
                            tilt_x=(uniform_at(mkey, 5) * 2 - 1) * tilt,
                            tilt_z=(uniform_at(mkey, 6) * 2 - 1) * tilt,
                        ))
                        if layer.clearance_radius_m > 0:
                            stamps.append(
                                (px, pz, layer.clearance_radius_m * scale))
    return instances


def _blocked(x: float, z: float, stamps: Iterable[tuple[float, float, float]]) -> bool:
    for sx, sz, radius in stamps:
        if (x - sx) ** 2 + (z - sz) ** 2 < radius * radius:
            return True
    return False


# --- probes ------------------------------------------------------------------


def clark_evans(points: list[tuple[float, float]], area_m2: float) -> float | None:
    """The one-number check that scatter reads as hand-placed (rule R1).

    <1 clumped, 1 random, >1 dispersed. The mined worlds sit at ~0.45; a plain
    jittered grid lands above 1.0.
    """
    if len(points) < 2 or area_m2 <= 0:
        return None
    total = 0.0
    for i, (x, z) in enumerate(points):
        best = math.inf
        for j, (ox, oz) in enumerate(points):
            if i == j:
                continue
            d = (x - ox) ** 2 + (z - oz) ** 2
            if d < best:
                best = d
        total += math.sqrt(best)
    mean_nn = total / len(points)
    expected = 0.5 / math.sqrt(len(points) / area_m2)
    return mean_nn / expected


# --- bundle format -----------------------------------------------------------

MAGIC = b"ESVG"
VERSION = 1
INSTANCE_STRUCT = struct.Struct("<3f4B")
assert INSTANCE_STRUCT.size == 16


def encode(instances: list[Instance], species_order: list[str]) -> bytes:
    """Pack instances into the chunk bundle's `vegetation-instances.bin`.

    16 bytes per instance (module 65's ~12–16 B budget): position as three
    float32s, then yaw, scale and two tilt axes quantised to a byte each —
    1.4° of yaw and sub-percent scale steps, both well under what anyone can
    see on a shrub.
    """
    by_species: dict[str, list[Instance]] = {name: [] for name in species_order}
    for instance in instances:
        by_species.setdefault(instance.species, []).append(instance)

    header = bytearray(MAGIC + struct.pack("<II", VERSION, len(species_order)))
    body = bytearray()
    for index, name in enumerate(species_order):
        group = by_species.get(name, [])
        scales = [i.scale for i in group] or [1.0]
        lo, hi = min(scales), max(scales)
        header += struct.pack("<IIff", index, len(group), lo, hi)
        span = (hi - lo) or 1.0
        for instance in group:
            body += INSTANCE_STRUCT.pack(
                instance.x, instance.y, instance.z,
                _quantise(instance.yaw / math.tau),
                _quantise((instance.scale - lo) / span),
                _quantise(instance.tilt_x / math.pi + 0.5),
                _quantise(instance.tilt_z / math.pi + 0.5),
            )
    return bytes(header + body)


def _quantise(value: float) -> int:
    return max(0, min(255, int(round(value * 255.0))))


def decode(blob: bytes) -> list[dict]:
    """Read a bundle back — used by the probes and by anything auditing a
    compiled chunk without a browser."""
    if blob[:4] != MAGIC:
        raise ValueError("not a vegetation bundle")
    version, count = struct.unpack_from("<II", blob, 4)
    if version != VERSION:
        raise ValueError(f"unsupported vegetation bundle version {version}")
    groups = []
    offset = 12
    for _ in range(count):
        index, n, lo, hi = struct.unpack_from("<IIff", blob, offset)
        offset += 16
        groups.append({"index": index, "count": n, "scaleRange": (lo, hi)})
    for group in groups:
        span = (group["scaleRange"][1] - group["scaleRange"][0]) or 1.0
        items = []
        for _ in range(group["count"]):
            x, y, z, yaw, scale, tilt_x, tilt_z = INSTANCE_STRUCT.unpack_from(blob, offset)
            offset += INSTANCE_STRUCT.size
            items.append({
                "x": x, "y": y, "z": z,
                "yaw": yaw / 255.0 * math.tau,
                "scale": group["scaleRange"][0] + scale / 255.0 * span,
                "tiltX": (tilt_x / 255.0 - 0.5) * math.pi,
                "tiltZ": (tilt_z / 255.0 - 0.5) * math.pi,
            })
        group["instances"] = items
    return groups
