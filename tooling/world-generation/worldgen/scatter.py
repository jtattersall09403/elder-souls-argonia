"""Deterministic clustered scatter — the vegetation compiler pass (module 65
§111), built on the mined placement rules (`docs/research/placement-settlements/shipped-world-placement-rules.md`).

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

import numpy as np
import struct
from dataclasses import dataclass, field
from typing import Any, Callable, Iterable

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
(research/vegetation/vegetation-density-design.md). A 90 m glade wavelength puts
clearings at roughly that human scale."""

STAND_WAVELENGTH_M = 190.0
"""Whole-neighbourhood variation — one part of a jungle thicker than another.

The mined correlation reaches the noise floor by ~200 m, so stand-scale
variation must play out over that distance, not over the 340 m first guessed."""

GUILD_WAVELENGTH_M = 220.0
"""Water-guild theming patch size (rule M3). The mined pools are 100–25,000 m²
(median ~30 m across, p95 ~110 m), so a 220 m selector field makes almost
every pool fall wholly inside one guild's patch — a lilypad pond OR a reed
bed, never a per-instance mix."""


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
    slope_deg_min: float = 0.0
    """Lower slope gate. Almost everything wants only the upper one; cliff
    dressing is the exception — a shell authored to be embedded in a rock face
    needs a rock face to be embedded in, and on flat ground it reads as a
    hollow open-backed slab (owner round 4)."""
    land_cover: tuple[int, ...] = ()
    land_cover_not: tuple[int, ...] = ()
    """Covers this layer refuses (16f deliverable 10, the litter mask's twin).

    An EXCLUDE list rather than an allow-list because the woody layers it
    gates already carry their own ecology; naming every cover a jungle tree
    may stand on would re-author thirteen regions to say "not bare rock"."""
    cliff_m: tuple[float, float] = (-1.0, 1e12)
    """Band on the distance to the nearest CLIFF texel (ground >= 28 deg),
    metres. Rock piles gather at the foot of a cliff wherever they are, which
    is a distance-to-feature gate, not a region one (mined rule 3)."""
    zone: str = ""
    """Authored dressing zone id (16f deliverable 4). Empty = everywhere;
    set = this layer only places inside that zone's polygon."""
    altitude_m: tuple[float, float] = (-999.0, 9999.0)
    """Height above sea level, metres — montane species vs lowland species.
    Region class is a coarse proxy; this is the direct control."""
    shore_m: tuple[float, float] = (-9999.0, 9999.0)
    """Signed horizontal distance to the water's EDGE: positive on land,
    negative in water. This is the meso 'scene' control the open-world
    placement research says every engine expresses as distance-to-feature
    fields (research/vegetation/openworld-vegetation-placement-architecture.md): reed
    belts hug the edge, shrub thickets band behind it, gallery forest ribbons
    follow watercourses through open country. Depth gates are the vertical
    relation; this is the horizontal one, and they compose."""
    glade_band: tuple[float, float] = (0.0, 1.0)
    """Band on the shared openness field (0 closed .. 1 open). The ecology
    research's edge effects live here: 'green wall' species take the band
    around a clearing (~[0.45, 0.75]), gap-fill pioneers take the open end
    ([0.7, 1.0]), deep-interior species the closed end ([0.0, 0.55])."""
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
    # Riparian response (mined rule M2, research/vegetation/mod-vegetation-micro-siting.md):
    # Black Marsh's density peaks at ~2.1x just OFF the shore and holds ~1.4x
    # for 40 m inland; Valenwood's dry forest inverts and stands back. A
    # signed, per-layer gaussian boost on the cell's shore distance —
    # deliberately NOT mean-one: water margins really do carry more plants.
    shore_boost_gain: float = 0.0
    """0 = off. Positive thickens the band (marsh), negative thins it
    (dry-country species that stand back from rivers; floor 0.15)."""
    shore_boost_peak_m: float = 0.0
    """Where the boost peaks — negative is just off the bank, in the water."""
    shore_boost_half_width_m: float = 25.0
    # Coastal gradient (Phase 10 round 4, research/world-terrain/mangrove-coastal-ecology.md
    # §4): salt exposure grades ~0.5-2 km inland from any coast, so coastal
    # influence is a graded FACTOR on every layer, not just the two thin
    # tidal region classes. `coast_m` is horizontal distance to the OCEAN
    # (not to the nearest pond — that is `shore_m`).
    coast_m: tuple[float, float] = (-9999.0, 99999.0)
    """Hard gate on distance to the ocean, metres (negative = in the sea).
    Obligate-coastal species (kelp beds, strand palms) band on it."""
    coast_boost_gain: float = 0.0
    """0 = off. Positive mixes a salt-tolerant species IN toward the coast;
    negative fades a salt-intolerant one OUT (floor 0.15). Peak is at the
    coast itself; there is no inland peak because salt exposure is monotone."""
    coast_half_width_m: float = 800.0
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
    guild: str = ""
    """Mined rule M3: a dressed pool is matrix + ONE water guild (lilypad
    pond / reed bed / drowned thicket), themed per water body, never mixed
    per instance. Layers sharing a region and carrying different guild names
    are mutually exclusive: a ~220 m guild-noise field picks which one is
    active locally, approximating per-pool theming without water-body ids.
    Empty = always active (the matrix)."""
    guild_off_share: float = 0.0
    """Density multiplier where ANOTHER guild wins the tile (Phase 10 round
    4, owner: water edges must never be bare). 0 = hard exclusivity (the
    original M3 behaviour); e.g. 0.45 keeps a thinned baseline everywhere so
    guilds THEME the extras rather than suppress the belt — reed layers use
    this so a lilypad tile still carries its reed margin."""
    # Presentation.
    scale_range: tuple[float, float] = (0.9, 1.2)
    yaw_random: bool = True
    tilt_deg_max: float = 4.0
    sink_jitter: tuple[float, float] = (0.5, 1.5)
    """Multiplier band on the composed sink (composition C2). The default is
    the historic fixed +-50 %; an OPEN-BOTTOMED rock raises its floor to
    (0.8, 1.5) so its hollow underside is never left showing (16f)."""
    back_yaw_deg: float | None = None
    """The bearing, in the MODEL's own frame, of the face the mesh has no
    geometry on (the kit manifest's `openBackYawDeg`; degrees from +Z toward
    +X). `None` = the piece has no open back.

    The yaw is solved so that this face ends up pointing UPHILL:
    `yaw = downhill_aim + pi - back_yaw_deg`, whose world bearing for the open
    face is `back_yaw_deg + yaw = downhill + 180`. The old rule added the
    offset to the aim, which put the open face at `downhill + 2 x back`, and so
    faced uphill only for a back at 90 or 270 deg (owner walk 2026-09-18:
    rockcliff02, back 258.8, missed uphill by a median 26.7 deg). Meaningless
    without `align_to_slope`."""
    footprint_half_m: tuple[float, float] | None = None
    """Half the model's footprint (x, z) in metres, before scale — from the
    kit manifest's `sizeM`, filled in by `rock_dressing.rock_layer`. Set it
    and the sampler applies the burial rule: no rock floats, i.e. its
    footprint's lowest ground sample sits at or below the pivot's sink."""
    height_m: float | None = None
    """The model's height in metres before scale (`sizeM[2]`). Only used to
    cap the burial rule, so a piece can never be sunk out of sight."""
    pivot_above_base_m: float = 0.0
    """How far the model's pivot sits above its own lowest point along its
    up-axis, metres before scale (the kit manifest's `pivotAboveBaseM`). The
    burial rule measures the BASE plane, which is this far below the pivot:
    measuring at the pivot over-demanded ~5 m of burial on every cliff shell
    (rockcliff07 pivot 5.4 m up), so every shell hit its cap (16f round 4)."""
    bottom_profile: Any = None
    """The rock's own underside vertices (N×3, model space, glb y-up, metres
    before scale; `rock-bottom-profiles.json`, mined from the kit by
    `rock_bottom_profiles.py`). NOT a seating input: the owner reverted
    underside seating (it sank every rock too deep, 16f round 5) and the
    base plane above seats rocks. `compile_scatter.cut_hanging_rocks` uses
    the set to CUT the few rocks that still hang after seating."""
    sink_deep_m: float = 0.0
    """The deepest quartile of the species' mined pivot sink, metres (the
    mine's `sinkM.p25`, negated). The burial cap is never below it: a cliff
    shell's mined median sink (rockcliff02: 8.6 m of a 10.8 m mesh) exceeds
    0.6 x its height, and a cap at 0.6 x height clipped the mined figure."""
    align_to_slope: float = 0.0
    """How much of the hillside's pitch this layer's up-axis takes on
    (0 = stands vertical, 1 = lies fully with the ground).

    Trees grow vertical whatever the hillside does; rocks and deadfall do not
    — they settle into the slope, long axis following it (owner Phase 10
    round 4). For a rock layer this is a MINED ratio, `tiltDeg.p50 /
    slopeDeg.p50` (`rock_dressing.rock_layer`): Bethesda tilts a boulder
    about as much as the ground it sits on (rockl02: 22.9 deg on 24.0 deg
    ground, ratio 0.95) and a cliff shell hardly at all (rockcliff02: 3.8 deg
    on 32.6 deg ground, ratio 0.12 — the shell is buried upright, not laid
    along the face). When set, yaw comes from the downhill azimuth and the
    tilt tips the model's up-axis toward the terrain normal by this fraction
    of the local slope; `tilt_deg_max` is then the RESIDUAL jitter on top
    (the mined `tiltDeg.p25`, the tilt Bethesda gives even on flat ground),
    never the whole band. Round 3 drew the whole band (2 x p50 per axis) AND
    added the pitch, which laid 30 m shells at 43-70 deg on 45 deg faces where
    the mine allows 23 deg (16f round 4). Never give this to a tree layer."""
    # --- the water record (0066) ---------------------------------------
    # Hard gates read from the SIGNED hydrology record, never re-derived: the
    # kind, season and identity of the water nearest this position, and the
    # channel geometry the record declares. A depth number cannot say "this is
    # a river" or "this is the sea"; these can.
    water_kinds: tuple[str, ...] = ()
    """If set, the NEAREST water's graph kind must be one of these (a reach
    kind or a body kind from the graph vocabulary)."""
    season_kinds: tuple[str, ...] = ()
    """If set, the nearest water's season must be one of these — a kelp bed
    cannot stand in water that is gone for half the year."""
    water_entities: tuple[str, ...] = ()
    """If set, the nearest water's entity id OR its river id must be one of
    these: a species authored for one named river or lake."""
    channel_exclusion: bool = False
    """Refuse to stand inside a flowing channel or on its wetted bank margin
    (`channel(x, z) < bank_margin(x, z)`). Everything but the water-edge and
    aquatic layers sets this: a tree does not grow in the river."""
    corridor_m: tuple[float, float] = (-1.0, 1e12)
    """Band on the distance to the nearest band-3 (major) reach, metres."""
    # Clearance: what this layer stamps, and what it refuses to grow inside.
    clearance_radius_m: float = 0.0
    respects_clearance: bool = True

    def gate(self, depth_m: float, slope_deg: float, region: int,
             cover: int, altitude_m: float = 0.0,
             shore_m: float = 0.0, glade: float = 0.5,
             coast_m: float = 99999.0,
             water_kind: str = "none", water_season: str = "none",
             water_entity: tuple[str, str] = ("", ""),
             channel_m: float = 1e9, bank_margin_m: float = 0.0,
             corridor_m: float = 1e9, cliff_m: float = 1e9,
             zone: str = "") -> bool:
        if self.zone and zone != self.zone:
            return False
        if not (self.cliff_m[0] <= cliff_m <= self.cliff_m[1]):
            return False
        if self.land_cover_not and cover in self.land_cover_not:
            return False
        if self.region_classes and region not in self.region_classes:
            return False
        if not (self.water_depth_m[0] <= depth_m <= self.water_depth_m[1]):
            return False
        if not (self.slope_deg_min <= slope_deg <= self.slope_deg_max):
            return False
        if self.land_cover and cover not in self.land_cover:
            return False
        if not (self.altitude_m[0] <= altitude_m <= self.altitude_m[1]):
            return False
        if not (self.shore_m[0] <= shore_m <= self.shore_m[1]):
            return False
        if not (self.glade_band[0] <= glade <= self.glade_band[1]):
            return False
        if not (self.coast_m[0] <= coast_m <= self.coast_m[1]):
            return False
        if self.water_kinds and water_kind not in self.water_kinds:
            return False
        if self.season_kinds and water_season not in self.season_kinds:
            return False
        if self.water_entities and not set(water_entity) & set(self.water_entities):
            return False
        if self.channel_exclusion and channel_m < bank_margin_m:
            return False
        if not (self.corridor_m[0] <= corridor_m <= self.corridor_m[1]):
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

    def shore_factor(self, shore_m: float) -> float:
        """Riparian density multiplier at a shore distance (1 when off)."""
        if self.shore_boost_gain == 0.0:
            return 1.0
        bell = math.exp(-((shore_m - self.shore_boost_peak_m)
                          / self.shore_boost_half_width_m) ** 2)
        return max(0.15, 1.0 + self.shore_boost_gain * bell)

    def coast_factor(self, coast_m: float) -> float:
        """Salt-exposure density multiplier at a distance from the ocean
        (1 when off). Monotone: peaks at the coast, fades away on BOTH sides.

        `coast_m` is SIGNED (positive inland, negative at sea), so the bell
        reads `abs(coast_m)` - distance from the shoreline itself. With the
        old `max(0.0, coast_m)` every sea texel read 0 m and took the full
        boost, which made the sea-bed ramp inert: the whole bed ran at its
        shoreline density. Land layers are unaffected: they never place at
        sea, so they only ever see coast_m >= 0, where abs() is identity."""
        if self.coast_boost_gain == 0.0:
            return 1.0
        bell = math.exp(-(abs(coast_m) / self.coast_half_width_m) ** 2)
        return max(0.15, 1.0 + self.coast_boost_gain * bell)


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
            for key in ("region_classes", "land_cover", "land_cover_not"):
                if key in fields:
                    fields[key] = tuple(fields[key])
            for key in ("water_depth_m", "scale_range", "altitude_m",
                        "shore_m", "glade_band", "coast_m", "corridor_m",
                        "cliff_m", "sink_jitter", "footprint_half_m",
                        "water_kinds", "season_kinds", "water_entities"):
                if key in fields:
                    fields[key] = tuple(fields[key])
            for key, legal in (("water_kinds", WATER_KINDS),
                               ("season_kinds", SEASON_KINDS)):
                for value in fields.get(key, ()):
                    if value not in legal:
                        raise ValueError(
                            f"layer {fields.get('species', '?')}: {key} entry "
                            f"{value!r} is not in the hydrology graph's "
                            f"vocabulary ({sorted(legal)})")
            layers.append(Layer(**fields))
        return cls(id=data["id"], layers=layers)


# --- the sampler -------------------------------------------------------------


# Anchor modes (bundle v2, composition rules C1/C3/C5 — see composition.py).
ANCHOR_TERRAIN = 0
"""Pivot to the ground: renderer places pivot at runtimeGround(x,z) − sink.
Never add a bbox-derived lift — the pivot IS the anchor (rule C1)."""
ANCHOR_WATER_SURFACE = 1
"""`y` is the ABSOLUTE water-surface elevation; use it as-is (lilypads)."""
ANCHOR_ATTACHED = 2
"""`y` is an ABSOLUTE elevation up a host (vines, moss); use it as-is."""


@dataclass
class Instance:
    species: str
    tier: str
    x: float
    y: float
    """ANCHOR_TERRAIN: ground height at the instance, metres (sea level 0,
    decision 0003). Other anchor modes: the absolute pivot elevation."""
    z: float
    yaw: float
    scale: float
    tilt_x: float
    tilt_z: float
    anchor: int = ANCHOR_TERRAIN
    sink: float = 0.0
    """Metres the pivot sits BELOW the ground (rule C2); ≥ 0, terrain mode only."""
    extra_sink_m: float = 0.0
    """Burial the SAMPLER measured for this instance on top of the composed
    sink (`composition.finalise_anchors` adds it): how far the tilted base
    plane would stand above the ground at the footprint's edge. An
    open-bottomed piece on curving ground shows its base plane otherwise."""
    sink_cap_m: float = math.inf
    """Ceiling on the TOTAL sink for this instance, metres — 0.6 x the model's
    scaled height, so burying a rock can never swallow it."""


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
    shore: Callable[[float, float], float] = lambda x, z: 9999.0
    """Signed distance to the water's edge, metres (+ land, − water)."""
    route_corridor: Callable[[float, float], int] = lambda x, z: 0
    """Route-corridor bits at this position, packed as
    `clear/thin bits | (condition << 4)`:

    * bit 0 ROUTE_CLEAR — a road/track/path keeps woody layers out
    * bit 1 ROUTE_THIN  — groundcover is trodden down
    * bits 4-6 (ROUTE_CONDITION_SHIFT/MASK) — the major road's authored state
      of repair, 0 off-road else 1 maintained .. 4 broken
      (`routes_raster.CONDITION_CODES`)

    Zero everywhere off a route. Fed by `routes_raster.corridor_masks` /
    `major_corridor_masks` + `condition_raster`."""
    coast: Callable[[float, float], float] = lambda x, z: 99999.0
    """Signed distance to the OCEAN, metres (+ inland, − at sea) — the salt-
    exposure field the coastal gradient reads (round 4)."""
    water_kind: Callable[[float, float], str] = lambda x, z: "none"
    """Graph kind of the NEAREST water (reach or body kind, "none" if the
    record knows of none). Read from the signed record (0066)."""
    water_season: Callable[[float, float], str] = lambda x, z: "none"
    """Season of the nearest water: perennial | seasonal | ephemeral."""
    water_entity: Callable[[float, float], tuple] = lambda x, z: ("", "")
    """(entity id, river id) of the nearest water."""
    channel: Callable[[float, float], float] = lambda x, z: 1e9
    """Signed distance to the nearest flowing CHANNEL, metres (negative
    inside one)."""
    bank_margin: Callable[[float, float], float] = lambda x, z: 0.0
    """The wetted bank margin of the nearest channel, metres — its declared
    width scaled and clamped, the belt a trunk may not stand in."""
    corridor: Callable[[float, float], float] = lambda x, z: 1e9
    """Distance to the nearest band-3 (major) reach, metres."""
    cliff: Callable[[float, float], float] = lambda x, z: 1e9
    """Distance to the nearest cliff texel (slope >= CLIFF_SLOPE_DEG), metres."""
    zone: Callable[[float, float], str] = lambda x, z: ""
    """Authored dressing-zone id at this position, "" off every zone."""


# The hydrology graph's own vocabulary (`world/sources/hydrology/
# hydrology-graph.json`, block `vocabulary`), held here so a palette typo is
# a load-time error rather than a layer that silently never places.
# `test_vegetation_record.py` asserts these against the graph itself.
WATER_KINDS = frozenset({
    "horizontal-channel", "horizontal-tidal", "horizontal-backwater",
    "sloped-riffle", "sloped-rapid", "sloped-chute", "vertical-fall",
    "ocean", "lagoon", "lake-lowland", "tarn-upland", "pond", "pool",
    "plunge-pool", "marsh-fringe", "marsh-deep", "swamp", "backswamp",
    "mudflat",
})
SEASON_KINDS = frozenset({"perennial", "seasonal", "ephemeral"})

#: What counts as a cliff for `Fields.cliff` and the cliff-dressing gate:
#: the mined slope floor for open-backed cliff pieces (rock rule 3).
CLIFF_SLOPE_DEG = 28.0

HECTARE_M2 = 10_000.0

# Route corridors (Phase 11). Anything a traveller walks on is kept clear of
# trunks and trodden thin at the herb layer — the same rule for a trunk road,
# a cart track, a footpath and a boardwalk, only the width differs (widths
# live in routes_raster.CLEARANCE_M).
ROUTE_CLEAR = 1                 # woody layers (T1/T2) removed
ROUTE_THIN = 2                  # groundcover (T3) survives at this share
ROUTE_THIN_KEEP = 0.08          # owner 2026-09-04: trodden, not carpeted (was 0.25)
ROUTE_CONDITION_SHIFT = 4       # bits 4-6 carry the major road's condition
ROUTE_CONDITION_MASK = 0b111
# How much groundcover survives on the road by its state of repair (owner
# 2026-09-16): a maintained road is trodden bare, a broken one is untouched.
ROUTE_THIN_KEEP_BY_CONDITION = {1: 0.08, 2: 0.25, 3: 0.6, 4: 1.0}


def route_allows(layer: "Layer", corridor: int, roll: float) -> bool:
    """False if this instance falls in a route corridor that excludes it."""
    if not corridor:
        return True
    if layer.tier == "T3":
        if not (corridor & ROUTE_THIN):
            return True
        cond = (corridor >> ROUTE_CONDITION_SHIFT) & ROUTE_CONDITION_MASK
        keep = ROUTE_THIN_KEEP_BY_CONDITION.get(cond, ROUTE_THIN_KEEP)
        return roll < keep
    return not (corridor & ROUTE_CLEAR)


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
    # Water-guild selector (rule M3). A layer's competitors are the other
    # guild names sharing a region class with it, so each region themes its
    # own pools from its own guild list.
    guild_salt = hash64(seed, 0x9011D)
    guild_pools: dict[int, list[str]] = {}
    for layer in palette.layers:
        if layer.guild:
            mine = set(layer.region_classes)
            guild_pools[id(layer)] = sorted({
                other.guild for other in palette.layers if other.guild
                and (not mine or not other.region_classes
                     or mine & set(other.region_classes))
            })

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
                # One openness value per cell: it multiplies the density AND
                # gates glade_band, so a clump is wholly of its place — an
                # edge-wall thicket does not straddle into the deep interior.
                glade_cell = value_noise(glade_salt, seed_x, seed_z,
                                         GLADE_WAVELENGTH_M)
                guild_scale = 1.0
                if layer.guild:
                    # One guild per global 220 m tile — hard patch identity,
                    # like the source's per-pool theming, not a soft blend.
                    # `guild_off_share` softens it (round 4): a losing layer
                    # keeps that fraction as a baseline instead of vanishing,
                    # so guilds theme the extras without baring the edges.
                    pool = guild_pools[id(layer)]
                    tile_x = math.floor(seed_x / GUILD_WAVELENGTH_M)
                    tile_z = math.floor(seed_z / GUILD_WAVELENGTH_M)
                    pick = min(len(pool) - 1, int(uniform(
                        guild_salt, tile_x & 0xFFFFFFFF, tile_z & 0xFFFFFFFF)
                        * len(pool)))
                    if pool[pick] != layer.guild:
                        if layer.guild_off_share <= 0.0:
                            continue
                        guild_scale = layer.guild_off_share
                expected_here = per_cell * guild_scale * layer.patchiness_at(
                    salt, glade_cell, seed_x, seed_z,
                ) * layer.shore_factor(fields.shore(seed_x, seed_z)) \
                    * layer.coast_factor(fields.coast(seed_x, seed_z))
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
                                      fields.land_cover(cx, cz),
                                      altitude_m=fields.height(cx, cz),
                                      shore_m=fields.shore(cx, cz),
                                      glade=glade_cell,
                                      coast_m=fields.coast(cx, cz),
                                      water_kind=fields.water_kind(cx, cz),
                                      water_season=fields.water_season(cx, cz),
                                      water_entity=fields.water_entity(cx, cz),
                                      channel_m=fields.channel(cx, cz),
                                      bank_margin_m=fields.bank_margin(cx, cz),
                                      corridor_m=fields.corridor(cx, cz),
                                      cliff_m=fields.cliff(cx, cz),
                                      zone=fields.zone(cx, cz)):
                        continue
                    # The soft response is rolled ONCE, per member. Rolling it
                    # here as well squared it (slope 0.7 delivered 0.49) —
                    # authored density silently under-delivered everywhere
                    # (round-2 sparse-jungle root cause #1). The centre keeps
                    # only the hard gate: a clump seeded on ineligible ground
                    # still dies.

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
                                          fields.land_cover(px, pz),
                                          altitude_m=fields.height(px, pz),
                                          shore_m=fields.shore(px, pz),
                                          glade=glade_cell,
                                          coast_m=fields.coast(px, pz),
                                          water_kind=fields.water_kind(px, pz),
                                          water_season=fields.water_season(px, pz),
                                          water_entity=fields.water_entity(px, pz),
                                          channel_m=fields.channel(px, pz),
                                          bank_margin_m=fields.bank_margin(px, pz),
                                          corridor_m=fields.corridor(px, pz),
                                          cliff_m=fields.cliff(px, pz),
                                          zone=fields.zone(px, pz)):
                            continue
                        if uniform_at(mkey, 2) > layer.weight(depth_m, slope_m):
                            continue
                        if not route_allows(layer, fields.route_corridor(px, pz),
                                            uniform_at(mkey, 7)):
                            continue
                        if layer.respects_clearance and _blocked(px, pz, stamps):
                            continue

                        lo, hi = layer.scale_range
                        scale = lo + (hi - lo) * uniform_at(mkey, 3)
                        yaw = (uniform_at(mkey, 4) * math.tau
                               if layer.yaw_random else 0.0)
                        tilt = math.radians(layer.tilt_deg_max)
                        tilt_x = (uniform_at(mkey, 5) * 2 - 1) * tilt
                        tilt_z = (uniform_at(mkey, 6) * 2 - 1) * tilt
                        if layer.align_to_slope > 0.0:
                            aim, pitch = terrain_aim(fields, px, pz)
                            if layer.back_yaw_deg is None:
                                # No open face: yaw so the model's +Z points
                                # downhill, jittered, or every boulder on a
                                # hillside faces alike.
                                yaw = aim + (uniform_at(mkey, 4) - 0.5) * 0.8
                            else:
                                # An open face is SOLVED to uphill: its world
                                # bearing is back_yaw_deg + yaw, and uphill is
                                # aim + 180. The jitter is +-8 deg, not the
                                # +-22.9 deg the general case takes, because
                                # that alone could turn a hollow back out of
                                # the hill (owner walk 2026-09-18).
                                yaw = (aim + math.pi
                                       - math.radians(layer.back_yaw_deg)
                                       + (uniform_at(mkey, 4) - 0.5) * 0.28)
                            tilt_x = pitch * layer.align_to_slope + tilt_x
                        extra_sink, sink_cap = burial(
                            fields, layer, px, pz, yaw, tilt_x, tilt_z, scale)
                        if extra_sink > sink_cap:
                            # The ground under this footprint falls away
                            # further than the piece may be buried: it
                            # cannot be seated here, so it is not placed
                            # here. A rock that cannot sit is a gap, never
                            # a floating shell (16f round 4; the cap is the
                            # species' mined deep-quartile sink).
                            continue
                        instances.append(Instance(
                            species=layer.species,
                            tier=layer.tier,
                            x=px, z=pz,
                            y=fields.height(px, pz),
                            yaw=yaw,
                            scale=scale,
                            tilt_x=tilt_x,
                            tilt_z=tilt_z,
                            extra_sink_m=extra_sink,
                            sink_cap_m=sink_cap,
                        ))
                        if layer.clearance_radius_m > 0:
                            stamps.append(
                                (px, pz, layer.clearance_radius_m * scale))
    return instances


#: Finite-difference step for the terrain-normal estimate, metres. Wider than
#: the raster's own cell so the aim follows the hillside a boulder rests on
#: rather than a single noisy texel.
AIM_STEP_M = 6.0


def terrain_aim(fields: Fields, x: float, z: float) -> tuple[float, float]:
    """(downhill azimuth in radians, slope angle in radians) at a position.

    Derived from `fields.height` rather than a new raster: every caller — the
    province compiler, the tests' closures, the micro-lab's flat plane —
    already provides it, and the gradient of the surface a thing actually sits
    on is exactly the quantity wanted. The azimuth is measured so that a yaw
    of this value points the model's +Z axis downhill, matching the renderer's
    YXZ euler convention.
    """
    step = AIM_STEP_M
    dhdx = (fields.height(x + step, z) - fields.height(x - step, z)) / (2 * step)
    dhdz = (fields.height(x, z + step) - fields.height(x, z - step)) / (2 * step)
    # Downhill is the negative gradient; slope angle is its magnitude.
    grade = math.hypot(dhdx, dhdz)
    if grade < 1e-6:
        return 0.0, 0.0
    return math.atan2(-dhdx, -dhdz), math.atan(grade)


#: Ground exposure the burial rule tolerates before it sinks a piece, metres.
#: Under this the base plane is within the raster's own noise of the ground.
BURIAL_TOLERANCE_M = 0.15
#: How far PAST the measured exposure a buried piece goes, metres — the plane
#: has to be under the ground, not level with it.
BURIAL_MARGIN_M = 0.25
#: Fraction of a model's scaled height the TOTAL sink may never exceed.
BURIAL_HEIGHT_SHARE = 0.6
#: Bearings sampled around the footprint ellipse.
BURIAL_SAMPLES = 8


def rotate_yxz(px: float, py: float, pz: float, yaw: float, tilt_x: float,
               tilt_z: float) -> tuple[float, float, float]:
    """A model-space point under the renderer's Euler YXZ:
    R = Ry(yaw) · Rx(tilt_x) · Rz(tilt_z)."""
    cz, sz = math.cos(tilt_z), math.sin(tilt_z)
    x1, y1, z1 = px * cz - py * sz, px * sz + py * cz, pz
    cx, sx = math.cos(tilt_x), math.sin(tilt_x)
    x2, y2, z2 = x1, y1 * cx - z1 * sx, y1 * sx + z1 * cx
    cy, sy = math.cos(yaw), math.sin(yaw)
    return x2 * cy + z2 * sy, y2, -x2 * sy + z2 * cy


def base_plane_normal(yaw: float, tilt_x: float, tilt_z: float
                      ) -> tuple[float, float, float]:
    """World normal of the model's base plane, for a YXZ euler (the renderer's
    convention: R = Ry(yaw) . Rx(tilt_x) . Rz(tilt_z) applied to local +Y)."""
    ax = -math.sin(tilt_z)
    ay = math.cos(tilt_z) * math.cos(tilt_x)
    az = math.cos(tilt_z) * math.sin(tilt_x)
    cy, sy = math.cos(yaw), math.sin(yaw)
    return (ax * cy + az * sy, ay, -ax * sy + az * cy)


def burial(fields: Fields, layer: Layer, x: float, z: float, yaw: float,
           tilt_x: float, tilt_z: float, scale: float) -> tuple[float, float]:
    """(extra sink, total-sink cap) for one instance, both metres.

    The rule (owner walk 2026-09-18, "the rock has a hollow back and does not
    sit in the hill"): NO ROCK FLOATS — the lowest ground sample under its
    footprint must be at or below the pivot's sink. A single scalar sink under
    a pivot cannot say that on curving ground, and 38 of the kit's 41 rocks are
    open underneath (`undersideCoverage` < 0.3), so wherever the hill falls
    away faster than the tilted base plane does, the base plane itself shows.

    So the plane is measured, not assumed: take the plane through the pivot
    with the tilt this instance actually baked, sample the ground at eight
    bearings on the (scaled, yawed) footprint ellipse, and take the worst
    height of plane over ground. Layers with no `footprint_half_m` — every
    plant — are untouched.
    """
    if layer.footprint_half_m is None:
        return 0.0, math.inf
    # The cap is 0.6 x the scaled height OR the species' mined deep-quartile
    # sink, whichever is larger: the mined sink is Bethesda's own answer for
    # how deep this piece goes, and a cap below it clipped every cliff shell.
    cap = (max(BURIAL_HEIGHT_SHARE * layer.height_m, layer.sink_deep_m) * scale
           if layer.height_m else math.inf)
    rx = layer.footprint_half_m[0] * scale
    rz = layer.footprint_half_m[1] * scale
    nx, ny, nz = base_plane_normal(yaw, tilt_x, tilt_z)
    if abs(ny) < 1e-6:
        return 0.0, math.inf
    # The BASE point: the pivot (on the ground before any sink) moved down
    # the model's own up-axis by the pivot's height above the base.
    drop = layer.pivot_above_base_m * scale
    bx, bz = x - nx * drop, z - nz * drop
    base_y = fields.height(x, z) - ny * drop
    cy, sy = math.cos(yaw), math.sin(yaw)
    exposure = base_y - fields.height(bx, bz)
    for i in range(BURIAL_SAMPLES):
        theta = math.tau * i / BURIAL_SAMPLES
        lx, lz = rx * math.cos(theta), rz * math.sin(theta)
        dx = lx * cy + lz * sy
        dz = -lx * sy + lz * cy
        plane = base_y - (nx * dx + nz * dz) / ny
        exposure = max(exposure, plane - fields.height(bx + dx, bz + dz))
    if exposure <= BURIAL_TOLERANCE_M:
        return 0.0, cap
    # The DEMAND, uncapped: the caller compares it with the cap and refuses
    # the placement when the piece cannot be seated (round 3 clamped it here,
    # so the refusal could never fire and capped shells shipped floating).
    return exposure + BURIAL_MARGIN_M, cap


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
VERSION = 2
INSTANCE_STRUCT = struct.Struct("<3f5B")
assert INSTANCE_STRUCT.size == 17
SPECIES_HEADER_STRUCT = struct.Struct("<IIffffB3x")
assert SPECIES_HEADER_STRUCT.size == 28


def encode(instances: list[Instance], species_order: list[str]) -> bytes:
    """Pack instances into the chunk bundle's `vegetation-instances.bin`.

    v2 (composition rules): per species the header carries the anchor MODE
    and a sink range; per instance a fifth quantised byte carries the sink
    within that range. 17 bytes per instance (module 65's ~12–16 B budget,
    +1 for anchoring): position as three float32s, then yaw, scale, two tilt
    axes and sink quantised to a byte each.
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
        sinks = [i.sink for i in group] or [0.0]
        sink_lo, sink_hi = min(sinks), max(sinks)
        anchor = group[0].anchor if group else ANCHOR_TERRAIN
        header += SPECIES_HEADER_STRUCT.pack(
            index, len(group), lo, hi, sink_lo, sink_hi, anchor)
        span = (hi - lo) or 1.0
        sink_span = (sink_hi - sink_lo) or 1.0
        for instance in group:
            body += INSTANCE_STRUCT.pack(
                instance.x, instance.y, instance.z,
                # WRAP the yaw, never clamp it: a solved yaw is often negative
            # (`downhill + 180 - back` for an open-backed shell, `aim +
            # jitter` for a boulder), and clamping it to 0 turned 54 % of the
            # shipped rocks — 75-85 % of the cliff shells — to yaw 0, with
            # their open backs facing wherever (16f round 4, owner walk).
            _quantise((instance.yaw % math.tau) / math.tau),
                _quantise((instance.scale - lo) / span),
                _quantise(instance.tilt_x / math.pi + 0.5),
                _quantise(instance.tilt_z / math.pi + 0.5),
                _quantise((instance.sink - sink_lo) / sink_span),
            )
    return bytes(header + body)


def _quantise(value: float) -> int:
    return max(0, min(255, int(round(value * 255.0))))


def _quantise_up(value: float) -> int:
    """Never below the value: a sink must not ship shallower than seated."""
    return max(0, min(255, int(math.ceil(value * 255.0 - 1e-9))))


def shipped_pose(yaw: float, tilt_x: float, tilt_z: float) -> tuple[float, float, float]:
    """The yaw and tilts exactly as the bundle will carry them (a byte each:
    1.4° of yaw, 0.7° of tilt). The burial rule must seat the rock at THIS
    pose, not the sampled one: a 12 m cliff slab a degree off swings its far
    edge 0.3 m, and 2.4 % of rocks shipped hanging by that much after being
    seated exactly (16f round 5)."""
    yaw_q = _quantise((yaw % math.tau) / math.tau) / 255.0 * math.tau
    tx_q = (_quantise(tilt_x / math.pi + 0.5) / 255.0 - 0.5) * math.pi
    tz_q = (_quantise(tilt_z / math.pi + 0.5) / 255.0 - 0.5) * math.pi
    return yaw_q, tx_q, tz_q


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
        index, n, lo, hi, sink_lo, sink_hi, anchor = \
            SPECIES_HEADER_STRUCT.unpack_from(blob, offset)
        offset += SPECIES_HEADER_STRUCT.size
        groups.append({"index": index, "count": n, "scaleRange": (lo, hi),
                       "sinkRange": (sink_lo, sink_hi), "anchor": anchor})
    for group in groups:
        span = (group["scaleRange"][1] - group["scaleRange"][0]) or 1.0
        sink_span = (group["sinkRange"][1] - group["sinkRange"][0]) or 1.0
        items = []
        for _ in range(group["count"]):
            x, y, z, yaw, scale, tilt_x, tilt_z, sink = \
                INSTANCE_STRUCT.unpack_from(blob, offset)
            offset += INSTANCE_STRUCT.size
            items.append({
                "x": x, "y": y, "z": z,
                "yaw": yaw / 255.0 * math.tau,
                "scale": group["scaleRange"][0] + scale / 255.0 * span,
                "tiltX": (tilt_x / 255.0 - 0.5) * math.pi,
                "tiltZ": (tilt_z / 255.0 - 0.5) * math.pi,
                "sink": group["sinkRange"][0] + sink / 255.0 * sink_span,
                "anchor": group["anchor"],
            })
        group["instances"] = items
    return groups
