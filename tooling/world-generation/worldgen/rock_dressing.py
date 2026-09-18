"""Rock placement: the mined Skyrim figures turned into palette layers and
two record-driven passes (16f deliverable 3).

Nothing here is typed from memory. Every number a rock layer carries is read
at build time from `world/sources/placement/vanilla-tamriel-placement.json`
(250,830 vanilla Tamriel instances, 57 rock species) and from the kit
manifest's measured mesh fields; the *rules* those numbers support are stated
once in `docs/research/vegetation/rock-placement-rules.md` and each layer's
`note` names the figure every field came from.

Two kinds of output:

* **Layers** (`boulders_dry`, `rock_piles`, `cliff_pieces`, `wet_rocks`,
  `fall_rocks`) — ordinary palette entries the scatter samples, gated on the
  region, the ground and the water record.
* **Record-driven passes** (`bed_boulders`, `cascade_rocks`) — rocks whose
  positions come from the hydrology record itself rather than from a density:
  one boulder per 160 m² of a steep reach's wetted bed, and boulders tight
  against a cascade's lip and around its plunge-pool rim. They are the Python
  home of the rule that used to live in `ChannelStrips.stripBoulderCandidates`
  (decision 0066: the compiler reads the record, the renderer draws it), and
  they also write `province/water/bed-rocks.json` so the water renderer can
  stamp foam on rocks it never places.

Mesh-side rules come from the kit manifest (`vet_kit.py` measures them):

* `undersideCoverage` — how much of the footprint has downward faces. Under
  0.3 the mesh is hollow beneath. A freestanding boulder that is hollow may
  only lie on gentle ground, sunk deeper (`OPEN_BOTTOM`); a pile or a cliff
  piece keeps its mined slope band, because the sources lay those flat on
  slopes, and the sampler's burial rule seats them instead.
* `sizeM` — the footprint every rock layer passes to the sampler
  (`footprint_half_m`, `height_m`), which is what turns the burial rule on:
  no rock floats, so where the hill falls away under the footprint the piece
  is sunk until its base plane is under the ground.
* `openBackYawDeg` — a horizontal direction with no faces. Such a piece is
  cliff dressing only, laid with that face into the hill: the sampler solves
  the yaw so the open face points UPHILL (`back_yaw_deg`).
"""

from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path

from .scatter import ANCHOR_TERRAIN, Instance, Layer, burial, hash64, shipped_pose, uniform_at
from .vegetation_ladder import ROCK_ROLES  # the one definition of the set

REPO_ROOT = Path(__file__).resolve().parents[3]
MINED_PATH = (REPO_ROOT / "world" / "sources" / "placement"
              / "vanilla-tamriel-placement.json")
KIT_MANIFEST_PATH = (REPO_ROOT / "apps" / "world-studio" / "public" / "kits"
                     / "flora-province-v1.kit.json")
#: The sea-bed rock family lives in the underwater kit, not the flora kit, so
#: the manifest lookup reads both. Flora wins a clash: it is the older kit and
#: nothing is authored twice.
UNDERWATER_MANIFEST_PATH = (REPO_ROOT / "apps" / "world-studio" / "public"
                            / "kits" / "underwater-v1.kit.json")
BED_ROCKS_PATH = (REPO_ROOT / "apps" / "world-studio" / "public" / "province"
                  / "water" / "bed-rocks.json")

# --- species ----------------------------------------------------------------

_ROCK = "vanilla:landscape/rocks/"
_WET = _ROCK + "wetrocks/"

#: Freestanding dry boulders: closed underneath AND no open back (the
#: predicate is checked against the manifest by `freestanding`).
LADDER = (f"{_ROCK}rockl01", f"{_ROCK}rockl04", f"{_ROCK}rockl05",
          f"{_ROCK}rockm03", f"{_ROCK}rocks01", f"{_ROCK}rocks02",
          f"{_ROCK}rocks03")
#: Authored shares of the freestanding ladder (rock rule 6's size ladder:
#: a few heroes, a broad middle, small stone everywhere).
LADDER_SHARE = {f"{_ROCK}rockl01": 0.06, f"{_ROCK}rockl04": 0.06,
                f"{_ROCK}rockl05": 0.08, f"{_ROCK}rockm03": 0.25,
                f"{_ROCK}rocks01": 0.55 / 3, f"{_ROCK}rocks02": 0.55 / 3,
                f"{_ROCK}rocks03": 0.55 / 3}
#: Dry boulders that are HOLLOW underneath (undersideCoverage < 0.3): they are
#: added to the ladder at 0.4x its total, split by mined count, and each is
#: held to gentle ground with its sink floor raised.
OPEN_BOTTOM = (f"{_ROCK}rockl02", f"{_ROCK}rockl03", f"{_ROCK}rockm01",
               f"{_ROCK}rockm02", f"{_ROCK}rockm04")
OPEN_BOTTOM_SHARE_TOTAL = 0.4
PILES = tuple(f"{_ROCK}rockpiles0{i}" for i in (1, 2, 3, 4)) + \
        tuple(f"{_ROCK}rockpilem0{i}" for i in (1, 2)) + \
        tuple(f"{_ROCK}rockpilel0{i}" for i in (1, 2, 3, 4))
CLIFFS = tuple(f"{_ROCK}rockcliff0{i}" for i in range(1, 9)) + \
         ("bmv:landscape/rocks/moss_rockcliff01",)
WET_ROCKS = (f"{_WET}rockl01wet", f"{_WET}rockl02wet", f"{_WET}rockl03wet",
             f"{_WET}rockl04wet", f"{_WET}rockl05wet", f"{_WET}rockm02wet",
             f"{_WET}rockpilel01wet", f"{_WET}rockpilel02wet",
             f"{_WET}rockpilel03wet", f"{_WET}rockpilem02wet")

#: The nine `wetrocks` meshes vanilla ships and never placed. They carry no
#: mined row of their own (vanilla placed only the ten above), so each takes
#: the mined profile of the DRY mesh it is a wet retexture of - same geometry,
#: same box, same pivot, different texture set - via `MINED_ALIAS` below.
SEABED_WET_SMALL = (f"{_WET}rocks01wet", f"{_WET}rocks02wet",
                    f"{_WET}rocks03wet")
SEABED_WET_MEDIUM = (f"{_WET}rockm01wet", f"{_WET}rockm03wet",
                     f"{_WET}rockm04wet", f"{_WET}rockpilem01wet",
                     f"{_WET}rockpilem03wet")
SEABED_WET_LARGE = (f"{_WET}rockl01wet", f"{_WET}rockl02wet",
                    f"{_WET}rockl03wet", f"{_WET}rockl04wet",
                    f"{_WET}rockl05wet", f"{_WET}rockpilel01wet",
                    f"{_WET}rockpilel02wet", f"{_WET}rockpilel03wet",
                    f"{_WET}rockshelf01wet")
#: Shores of Skyrim's twelve shore rocks. FrankBlack's own meshes: nobody has
#: ever placed them in a shipped worldspace, so there is no mine to read. They
#: take the MEAN of the three `rocks0*wet` figures, which is the nearest thing
#: the record holds - the same size class of wet shore stone, from the same
#: kind of ground - and every layer built from them says so in its note.
#: `shorerock05` is NOT here: the kit measures an open back at 112.5 deg on
#: it, so it is a cliff shell, not a free-standing stone, and a free-standing
#: layer would show its missing face (the mesh rule `freestanding` checks).
SHORE_ROCKS = tuple(f"shores:shoresofskyrim/shorerock{i:02d}"
                    for i in range(1, 13) if i != 5)

#: The water the wet family stands in (rule 5): every flowing channel kind
#: plus slack and standing water and the sea.
WET_KINDS = ("horizontal-channel", "horizontal-tidal", "sloped-riffle",
             "sloped-rapid", "sloped-chute", "vertical-fall",
             "horizontal-backwater", "lake-lowland", "tarn-upland",
             "lagoon", "ocean", "pond")
FALL_KINDS = ("vertical-fall", "plunge-pool", "sloped-chute")

#: Ground the lowland rock scatter is allowed on (rule 3's mined covers,
#: translated to our land-cover ids).
LOWLAND_COVERS = ("GRASS_DIRT", "SCRUB", "TROP_GRASS", "LITTER", "FOREST_FLOOR")
SURF_COVERS = ("BC_ROCK", "PEBBLES", "MOSSY_ROCK")

CLIFF_SLOPE_DEG = 28.0

#: The roles this module emits, re-exported from `vegetation_ladder` so there
#: is exactly one definition: "rock" (freestanding boulders AND the pile
#: family), "wet-rock", "cliff-dressing". Every layer carrying one of them
#: gets a `footprint_half_m`, which is what switches the sampler's burial rule
#: on.
assert ROCK_ROLES == frozenset({"rock", "wet-rock", "cliff-dressing"})


def _cover_ids(names) -> list[int]:
    from . import landcover as lc
    return [getattr(lc, name) for name in names]


# --- the mined record -------------------------------------------------------

@lru_cache(maxsize=1)
def _mined_doc() -> dict:
    return json.loads(MINED_PATH.read_text(encoding="utf-8"))["species"]


@lru_cache(maxsize=1)
def _manifest() -> dict[str, dict]:
    merged: dict[str, dict] = {}
    for path in (UNDERWATER_MANIFEST_PATH, KIT_MANIFEST_PATH):
        if not path.exists():
            continue
        doc = json.loads(path.read_text(encoding="utf-8"))
        for entry in doc["assets"]:
            merged[entry["id"]] = entry
    return merged


#: A mod rock that vanilla never placed takes its mined profile from the
#: vanilla mesh it IS. `moss_rockcliff01` is BM&V's moss retexture of
#: `rockcliff01` — the kit manifest measures both at the same 10.51 x 22.72 x
#: 9.89 m box, the same 4.96 m pivot and the same 270 deg open back — so the
#: 495 vanilla placements of rockcliff01 are its evidence.
MINED_ALIAS = {
    "bmv:landscape/rocks/moss_rockcliff01": "vanilla:landscape/rocks/rockcliff01",
    # The unplaced `wetrocks` are the wet retextures of dry meshes vanilla
    # placed in their thousands: same geometry, same box, same pivot.
    **{f"{_WET}{stem}wet": f"{_ROCK}{stem}" for stem in (
        "rocks01", "rocks02", "rocks03", "rockm01", "rockm03", "rockm04",
        "rockpilem01", "rockpilem03", "rockshelf01")},
}


def mined_key(species: str) -> str:
    """The mined table's key for a kit species id."""
    return MINED_ALIAS.get(species, species).split(":", 1)[1] + ".nif"


@lru_cache(maxsize=256)
def mined(species: str) -> dict:
    """Every mined figure a rock layer is built from, for one species.

    Raises rather than falling back: a rock with no mined profile must not
    quietly take a class default (rock rule 1).
    """
    if species in SHORE_ROCKS:
        # Never placed by anybody: the borrowed profile IS its record, and it
        # is derived from mined rows rather than typed (see `shore_rock_mean`).
        return shore_rock_mean()
    entry = _mined_doc().get(mined_key(species))
    if entry is None:
        raise KeyError(f"{species} has no mined profile in {MINED_PATH.name}")
    clump = entry.get("clumping") or {}
    return {
        "n": entry["count"],
        "sink_p25": -entry["sinkM"]["p25"],
        "sink_p50": -entry["sinkM"]["p50"],
        "sink_p75": -entry["sinkM"]["p75"],
        "tilt_p25": entry["tiltDeg"]["p25"],
        "tilt_p50": entry["tiltDeg"]["p50"],
        "tilt_p95": entry["tiltDeg"]["p95"],
        "slope_p50": entry["slopeDeg"]["p50"],
        "slope_p75": entry["slopeDeg"]["p75"],
        "yaw_uniformity": entry["rotationZUniformity"],
        "scale_p5": entry["scale"]["p5"],
        "scale_p95": entry["scale"]["p95"],
        "submerged_fraction": entry["submergedFraction"],
        "above_water_p50": entry["aboveWaterM"]["p50"],
        "mean_nn_m": entry.get("meanNearestNeighbourM"),
        "clark_evans_r": entry.get("clarkEvansR"),
        "clump_link_m": clump.get("linkDistanceM"),
    }


def footprint_half_m(species: str) -> tuple[float, float]:
    """Half the mesh's own footprint (x, y of the NIF's z-up `sizeM`), metres.

    The sampler needs this to sample the ground around a rock's footprint for
    the burial rule; it is passed on the Layer so `scatter.py` never reads the
    kit manifest itself.
    """
    size = _manifest()[species]["sizeM"]
    return (float(size[0]) / 2.0, float(size[1]) / 2.0)


def height_m(species: str) -> float:
    """The mesh's own height, metres (`sizeM[2]`; the NIF box is z-up)."""
    return float(_manifest()[species]["sizeM"][2])


BOTTOM_PROFILES_PATH = (Path(__file__).resolve().parents[3] / "world" / "sources"
                        / "placement" / "rock-bottom-profiles.json")


@lru_cache(maxsize=1)
def _bottom_profiles() -> dict[str, dict]:
    if not BOTTOM_PROFILES_PATH.exists():
        return {}
    return json.loads(BOTTOM_PROFILES_PATH.read_text(encoding="utf-8"))["species"]


def bottom_profile(species: str) -> tuple[tuple[float, float, float], ...] | None:
    """The rock's own rim, mined from its mesh (`rock_bottom_profiles.py`);
    None when the kit has not been profiled, and the plane rule stands in."""
    entry = _bottom_profiles().get(species)
    if not entry:
        return None
    return tuple(tuple(p) for p in entry["points"])


def pivot_above_base_m(species: str) -> float:
    """How far the pivot sits above the mesh's lowest point, metres
    (`pivotAboveBaseM`, written by `vet_kit` from `originOffsetM[2]`)."""
    entry = _manifest()[species]
    value = entry.get("pivotAboveBaseM")
    if value is None:
        value = (entry.get("originOffsetM") or [0, 0, 0])[2]
    return max(0.0, float(value))


def footprint_half_diagonal_m(species: str) -> float:
    """Half the diagonal of the mesh's own XY footprint (`sizeM`), metres.

    The kit's `sizeM` is the NIF's z-up box, so the footprint is components
    0 and 1 and the height is component 2.
    """
    size = _manifest()[species]["sizeM"]
    return math.hypot(size[0], size[1]) / 2.0


def underside_cover(species: str) -> float:
    entry = _manifest()[species]
    value = entry.get("undersideCoverage")
    if value is None:                       # older manifest: the bool only
        return 1.0 if entry.get("undersideClosed") else 0.0
    return float(value)


def open_back_yaw_deg(species: str):
    return _manifest()[species].get("openBackYawDeg")


def freestanding(species: str) -> bool:
    """Mesh-side rule: closed enough underneath to stand anywhere, and with
    no open back to hide in a hill."""
    return open_back_yaw_deg(species) is None and underside_cover(species) >= 0.3


# --- layers -----------------------------------------------------------------

def rock_layer(species: str, per_ha: float, *, wet: bool = False,
               role: str | None = None,
               depth: tuple[float, float] = (-1.0, 2.5),
               profile: dict | None = None, **gates) -> dict:
    """One rock layer, every presentation field set from the mined figures.

    Shape fields (sink jitter, tilt, yaw, scale, slope band, clumping,
    clearance) are DERIVED here; `gates` carries only where the layer is
    allowed to look (region, cover, shore, water kinds, zone).

    `depth` is the wet branch's water band. It defaults to the surf band
    (-1 m of dry bank to 2.5 m of water) that `wet_rocks`/`surf_rocks` have
    always used; the sea-bed bands below widen it, because the ocean floor
    runs far deeper than the surf line and had no rock in it at all.
    """
    m = profile if profile is not None else mined(species)
    role = role or ("wet-rock" if wet else "rock")
    assert role in ROCK_ROLES, role
    # Rule 2 (tilt), as the mine states it. `tiltDeg` is the placed
    # reference's total off-vertical angle, and it already CONTAINS the
    # slope-following: so the hillside pitch is taken on at the mined ratio
    # of median tilt to median slope, and the residual jitter is the mined
    # p25 — the tilt Bethesda gives even on flat ground. Round 3 drew 2 x p50
    # per axis and added the whole pitch on top, and shipped 25 % of all
    # rocks past their mined p95 (16f round 4).
    align = min(1.0, m["tilt_p50"] / max(m["slope_p50"], 1.0))
    tilt_max = m["tilt_p25"]
    link = m["clump_link_m"] or 2.0 * (m["mean_nn_m"] or 8.0)
    back = open_back_yaw_deg(species)
    entry = {
        "species": species,
        "tier": "T1",
        "instances_per_hectare": round(per_ha, 3),
        "role": role,
        "yaw_random": True,
        "tilt_deg_max": round(tilt_max, 2),
        "align_to_slope": round(align, 3),
        "scale_range": [m["scale_p5"], m["scale_p95"]],
        "slope_deg_max": round(m["slope_p75"] + 10.0, 2),
        "clump_size_median": 3,
        "clump_radius_m": round(link / 2.0, 2),
        "singleton_share": 0.15,
        "clearance_radius_m": round(footprint_half_diagonal_m(species) + 0.5, 2),
        # The sampler's burial rule reads these; no layer without them is
        # measured for exposure.
        "footprint_half_m": [round(v, 3) for v in footprint_half_m(species)],
        "height_m": round(height_m(species), 3),
        "sink_deep_m": round(max(0.0, m["sink_p25"]), 3),
        "pivot_above_base_m": round(pivot_above_base_m(species), 3),
        "patchiness": 1.1,
        "glade_response": 0.0,
        "note": (
            f"mined n={m['n']}: sink p50 {m['sink_p50']:.2f} m (composition "
            f"rules), burial cap floor = deep-quartile sink {m['sink_p25']:.2f}; "
            f"align_to_slope = tilt p50 {m['tilt_p50']:.2f} / slope p50 "
            f"{m['slope_p50']:.2f}; tilt_deg_max = residual tilt p25 "
            f"{m['tilt_p25']:.2f}; yaw "
            f"random (rotZ uniformity {m['yaw_uniformity']:.2f}); scale_range "
            f"= p5-p95 {m['scale_p5']:.2f}-{m['scale_p95']:.2f}; slope_deg_max "
            f"= slope p75 {m['slope_p75']:.2f} + 10; clump_radius_m = link "
            f"{link:.1f} / 2 (Clark-Evans R {m['clark_evans_r']}); "
            f"clearance = footprint half-diagonal "
            f"{footprint_half_diagonal_m(species):.2f} m + 0.5; "
            f"submerged fraction {m['submerged_fraction']:.3f}"),
    }
    if wet:
        entry["water_depth_m"] = [float(depth[0]), float(depth[1])]
        entry["water_kinds"] = list(WET_KINDS)
        entry["channel_exclusion"] = False
    else:
        entry["water_depth_m"] = [-6.0, 0.0]
        entry["channel_exclusion"] = True
    if back is not None:
        # An open-BACKED piece is cliff dressing: it needs a hill to put its
        # missing face into (rock rule, mesh side).
        entry["slope_deg_min"] = CLIFF_SLOPE_DEG
        entry["slope_deg_max"] = max(entry["slope_deg_max"], 70.0)
        entry["slope_half_angle_deg"] = 60.0
        entry["back_yaw_deg"] = float(back)
        entry["note"] += f"; open back at {back:.0f} deg laid into the hill"
    elif not wet and underside_cover(species) < 0.3:
        # Hollow underneath. A FREESTANDING boulder is held to gentle ground
        # and sunk past its own floor. A pile is not: the sources lay piles
        # flat on slopes, so a pile keeps its mined band, and the sampler's
        # burial rule (`scatter.burial`) is what stops its open bottom
        # showing. The 20 deg cap used to be applied to everything hollow,
        # which silenced a whole cliff piece: `rockcliff05` is open-bottomed
        # and has NO open back, so it took slope_deg_max 20 while
        # `cliff_pieces` gave it slope_deg_min 28 — an empty band, and zero
        # placements province-wide (owner walk 2026-09-18).
        if role == "rock" and species not in PILES:
            entry["slope_deg_max"] = 20.0
            entry["sink_jitter"] = [0.8, 1.5]
            entry["note"] += (
                f"; underside coverage {underside_cover(species):.3f}"
                " < 0.3 so <=20 deg ground and a raised sink floor")
        else:
            entry["note"] += (
                f"; underside coverage {underside_cover(species):.3f} < 0.3,"
                " but a pile/cliff piece keeps its mined slope band and is"
                " seated by the burial rule")
    entry.update(gates)
    return entry


def _by_mined_count(species_list) -> dict[str, float]:
    counts = {s: mined(s)["n"] for s in species_list}
    total = float(sum(counts.values()))
    return {s: n / total for s, n in counts.items()}


def boulders_dry(region_classes: tuple[int, ...], per_ha: float,
                 land_cover: tuple[str, ...] = (), **gates) -> list[dict]:
    """The freestanding size ladder, plus the hollow-bottomed boulders held
    to gentle ground. The hollow set ADDS 0.4x the ladder's total, split by
    mined count — it replaces none of the ladder."""
    covers = _cover_ids(land_cover) if land_cover else []
    out = []
    for species in LADDER:
        assert freestanding(species), species
        out.append(rock_layer(species, per_ha * LADDER_SHARE[species],
                              region_classes=list(region_classes),
                              **({"land_cover": covers} if covers else {}),
                              **gates))
    hollow = _by_mined_count(OPEN_BOTTOM)
    for species, share in hollow.items():
        out.append(rock_layer(species,
                              per_ha * OPEN_BOTTOM_SHARE_TOTAL * share,
                              region_classes=list(region_classes),
                              **({"land_cover": covers} if covers else {}),
                              **gates))
    return out


def rock_piles(region_classes: tuple[int, ...], per_ha: float,
               **gates) -> list[dict]:
    """The pile family at its mined share by count (rule 8: piles follow
    boulders as a smaller clump layer in the same palette)."""
    shares = _by_mined_count(PILES)
    return [rock_layer(species, per_ha * share,
                       region_classes=list(region_classes), **gates)
            for species, share in shares.items()]


def cliff_pieces(per_ha: float = 12.0) -> list[dict]:
    """The cliff shells, in EVERY region: a cliff is a cliff wherever it is.
    `back_yaw_deg` comes from each mesh's own manifest entry."""
    return [rock_layer(species, per_ha, role="cliff-dressing",
                       region_classes=[], slope_deg_min=CLIFF_SLOPE_DEG)
            for species in CLIFFS]


def wet_rocks(per_ha: float = 25.0, shore=(-6.0, 6.0), kinds=WET_KINDS,
              **gates) -> list[dict]:
    """The wet family in and beside the water (rule 5), at its mined share."""
    shares = _by_mined_count(WET_ROCKS)
    return [rock_layer(species, per_ha * share, wet=True, region_classes=[],
                       shore_m=list(shore), water_kinds=list(kinds), **gates)
            for species, share in shares.items()]


def surf_rocks(per_ha: float = 40.0) -> list[dict]:
    """Rocky surf: the same family on the sea's own rock and shingle covers."""
    return wet_rocks(per_ha, shore=(-6.0, 8.0), kinds=("ocean", "lagoon"),
                     land_cover=_cover_ids(SURF_COVERS))


#: The sea-bed ramp. Density is 1.0 at the shoreline, still ~0.9 at 300 m,
#: ~0.7 at 600 m, ~0.4 at 1 km and 0.2 far offshore, realised on the
#: sampler's existing `coast_factor` (scatter.py, a Gaussian bell on the
#: ABSOLUTE distance to the shoreline - `coast_m` is signed, negative at sea).
#: That factor only ever BOOSTS - it runs from 1 far out to 1+gain at the
#: coast - so the decay is got by authoring the layer at a fifth of its
#: shoreline density and setting the gain to 4: 0.2 x (1 + 4 x bell) is 1.0
#: on the bell's peak and 0.2 where the bell has died. The half-width was
#: 425 m (0.4 at 500 m) until 16f round 4, when the owner found the floor
#: thin a short swim out: the run is now 900 m, so the bed is still visibly
#: dressed well past where a swimmer turns back. `seabed_ramp_factor` below
#: is the same arithmetic, exposed so a test can assert the shape without
#: rebuilding a sampler.
SEABED_RAMP = dict(coast_boost_gain=4.0, coast_half_width_m=900.0)
SEABED_RAMP_FLOOR = 0.2


def seabed_ramp_factor(coast_m: float) -> float:
    """The shoreline density ramp at a signed distance from the ocean
    (negative = at sea; only the magnitude matters), normalised so
    the shoreline reads 1.0 (what the sampler computes is this divided by
    `SEABED_RAMP_FLOOR`, against a layer authored at that fraction)."""
    bell = math.exp(-(abs(coast_m) / SEABED_RAMP["coast_half_width_m"]) ** 2)
    return SEABED_RAMP_FLOOR * (1.0 + SEABED_RAMP["coast_boost_gain"] * bell)


def seabed_rocks(species_list, per_ha: float, depth: tuple[float, float],
                 role: str, *, shares: dict[str, float] | None = None,
                 borrowed_from: str | None = None,
                 profile: dict | None = None, **gates) -> list[dict]:
    """Rock on the sea bed proper: the same `rock_layer` shape as the surf
    band, with the water band widened past 2.5 m and the shoreline ramp on.

    `ocean` only - the record's word for the sea. Inland water that happens to
    sit at sea level (a lagoon, a tidal marsh reach) is not sea and gets no
    sea bed (decision 0065: the compile realises the graph's kind, it does not
    re-derive one from an elevation).
    """
    shares = shares or _by_mined_count(species_list)
    out = []
    for species in species_list:
        entry = rock_layer(species, per_ha * shares[species], wet=True,
                           role=role, depth=depth, region_classes=[],
                           profile=profile,
                           water_kinds=["ocean"], season_kinds=["perennial"],
                           **SEABED_RAMP, **gates)
        entry["note"] += (
            f"; SEABED: band {depth[0]:.1f}-{depth[1]:.1f} m in `ocean` only,"
            f" authored at {SEABED_RAMP_FLOOR:g}x the shoreline density with"
            f" coast_boost_gain {SEABED_RAMP['coast_boost_gain']:g} /"
            f" half-width {SEABED_RAMP['coast_half_width_m']:g} m, so density"
            " is 1.0 at the shore, ~0.7 at 600 m, ~0.4 at 1 km and 0.2 far"
            " offshore")
        if borrowed_from:
            entry["note"] += (
                f"; every mined figure here is BORROWED from {borrowed_from}"
                " - this mesh was authored by a mod and has never been placed"
                " in a shipped worldspace, so there is no mine of its own")
        out.append(entry)
    return out


def shore_rock_mean() -> dict:
    """The mean of the three `rocks0*wet` mined profiles, for Shores of
    Skyrim's twelve rocks (see `SHORE_ROCKS`)."""
    rows = [mined(s) for s in SEABED_WET_SMALL]
    keys = ("sink_p25", "sink_p50", "sink_p75", "tilt_p25", "tilt_p50",
            "tilt_p95", "slope_p50", "slope_p75", "yaw_uniformity",
            "scale_p5", "scale_p95",
            "submerged_fraction", "above_water_p50", "mean_nn_m",
            "clark_evans_r", "clump_link_m")
    out = {k: sum(float(r[k]) for r in rows) / len(rows) for k in keys}
    out["n"] = sum(r["n"] for r in rows)
    return out


def fall_rocks(per_ha: float = 60.0) -> list[dict]:
    """Wet rocks in the falls and chutes. The lip and plunge-rim rocks that
    the cascade RECORD places are `cascade_rocks`; this is the band around
    them."""
    return wet_rocks(per_ha, shore=(-4.0, 6.0), kinds=FALL_KINDS)


def cliff_foot_piles(per_ha: float = 1.5, within_m: float = 15.0) -> list[dict]:
    """Piles at the foot of any cliff, in every region: fallen stone gathers
    below a face wherever the face is (rule 3)."""
    return rock_piles((), per_ha, cliff_m=[0.0, within_m])


# --- record-driven passes ---------------------------------------------------

BED_M2_PER_ROCK = 160.0
"""Bethesda's own calibration: 6 boulders in a 24 x 40 m rapids patch
(`fxrapidsrocks01`, research/rendering/waterfalls-realtime.md 3.6)."""
BED_RADIUS_M = (0.6, 2.5)
BED_STEP_M = 4.0
BED_KINDS = ("sloped-riffle", "sloped-rapid", "sloped-chute")

#: Bed-rock species by radius. The WET family only — a bed rock stands in
#: flowing water, and every dry species is gated out of a channel
#: (`channel_exclusion`), so borrowing a dry mesh for a cobble puts a dry rock
#: in the river. The small end is scaled DOWN to its radius rather than
#: swapped for a dry mesh (`_bed_scale`).
_BED_BY_RADIUS = ((0.9, f"{_WET}rockm02wet"), (1.3, f"{_WET}rockm02wet"),
                  (1.8, f"{_WET}rockl03wet"), (1e9, f"{_WET}rockl01wet"))
#: A bed rock is the size the rule gives it, not the size the mesh happens to
#: be: the scale is the authored radius over the mesh's own footprint radius.
_BED_SCALE_RANGE = (0.35, 2.5)


def _bed_species(radius_m: float) -> str:
    for limit, species in _BED_BY_RADIUS:
        if radius_m < limit:
            return species
    return _BED_BY_RADIUS[-1][1]


def _seating_layer(species: str) -> Layer:
    """The mesh-side fields the sampler's burial rule reads, for a rock the
    RECORD places (bed and cascade rocks never pass through a palette layer,
    and round 3 shipped them unseated: cascade lip rocks 16-18 m proud on a
    gorge wall, 16f round 4)."""
    m = mined(species)
    return Layer(species=species,
                 footprint_half_m=footprint_half_m(species),
                 height_m=height_m(species),
                 pivot_above_base_m=pivot_above_base_m(species),
                 bottom_profile=bottom_profile(species),
                 sink_deep_m=max(0.0, m["sink_p25"]))


def _instance(species: str, x: float, z: float, fields, key: int,
              scale: float | None = None) -> Instance | None:
    """One record-placed rock, seated by the burial rule; None where the
    ground under its footprint falls away further than it may be buried."""
    m = mined(species)
    # A bed rock stands in a channel bed, which the record treats as level:
    # the residual mined tilt only (the same rule as `rock_layer`).
    tilt = math.radians(m["tilt_p25"])
    yaw = uniform_at(key, 10) * math.tau
    tilt_x = (uniform_at(key, 12) * 2 - 1) * tilt
    tilt_z = (uniform_at(key, 13) * 2 - 1) * tilt
    if scale is None:
        scale = m["scale_p5"] + (m["scale_p95"] - m["scale_p5"]) * uniform_at(key, 11)
    yaw, tilt_x, tilt_z = shipped_pose(yaw, tilt_x, tilt_z)
    extra, cap = burial(fields, _seating_layer(species), x, z, yaw,
                        tilt_x, tilt_z, scale)
    if extra > cap:
        return None
    return Instance(
        species=species, tier="T1", x=x, z=z,
        y=fields.height(x, z),
        yaw=yaw, scale=scale, tilt_x=tilt_x, tilt_z=tilt_z,
        anchor=ANCHOR_TERRAIN,
        sink=max(0.0, m["sink_p50"]),
        extra_sink_m=extra, sink_cap_m=cap,
    )


def _id_hash(seed: int, text: str) -> int:
    return hash64(seed, *[ord(c) for c in text])


def bed_boulders(water, chunk_bounds: tuple[float, float, float, float],
                 seed: int, fields) -> tuple[list[Instance], list[dict]]:
    """One boulder per 160 m2 of wetted bed in every steep reach the chunk
    holds — the Python home of the old `stripBoulderCandidates` rule.

    `chunk_bounds` is (x0, z0, x1, z1) in world metres. Returns
    (instances, bed-rock records).
    """
    x0, z0, x1, z1 = chunk_bounds
    instances: list[Instance] = []
    records: list[dict] = []
    for reach in water._graph_index[0].values():
        if reach.get("kind") not in BED_KINDS:
            continue
        line = reach.get("centreline") or []
        if len(line) < 2:
            continue
        if not any(x0 <= px < x1 and z0 <= pz < z1 for px, pz in line):
            continue
        half = float(reach.get("widthM", 0.0)) / 2.0
        if half <= 0.0:
            continue
        rng_key = _id_hash(seed, reach["id"])
        draw = [0]

        def nxt() -> float:
            draw[0] += 1
            return uniform_at(rng_key, draw[0])

        area = 0.0
        quota = BED_M2_PER_ROCK * (0.5 + nxt() * 0.5)   # start half a quota in
        placed = 0
        for i in range(1, len(line)):
            ax, az = line[i - 1]
            bx, bz = line[i]
            span = math.hypot(bx - ax, bz - az)
            steps = max(1, int(span / BED_STEP_M))
            for s in range(steps):
                t1 = (s + 1) / steps
                ds = span / steps
                px = ax + (bx - ax) * t1
                pz = az + (bz - az) * t1
                area += 2.0 * half * ds
                if area < quota:
                    continue
                area -= quota
                quota = BED_M2_PER_ROCK
                tx = (bx - ax) / span if span else 1.0
                tz = (bz - az) / span if span else 0.0
                side = (nxt() * 2 - 1) * 0.8 * half
                radius = BED_RADIUS_M[0] + nxt() ** 1.6 * (
                    BED_RADIUS_M[1] - BED_RADIUS_M[0])
                radius = min(radius, max(half * 0.9, BED_RADIUS_M[0]))
                rx, rz = px + -tz * side, pz + tx * side
                if not (x0 <= rx < x1 and z0 <= rz < z1):
                    placed += 1
                    continue
                key = hash64(rng_key, placed)
                placed += 1
                inst = _bed_instance(radius, rx, rz, fields, key)
                if inst is None:
                    continue
                instances.append(inst)
                records.append({"reachId": reach["id"], "x": round(rx, 2),
                                "z": round(rz, 2), "radiusM": round(radius, 2),
                                "tx": round(tx, 4), "tz": round(tz, 4)})
    return instances, records


def _bed_scale(species: str, radius_m: float) -> float:
    size = _manifest()[species]["sizeM"]
    mesh_radius = (size[0] + size[1]) / 4.0
    return min(_BED_SCALE_RANGE[1],
               max(_BED_SCALE_RANGE[0], radius_m / mesh_radius))


def _bed_instance(radius_m: float, x: float, z: float, fields, key: int
                  ) -> Instance | None:
    species = _bed_species(radius_m)
    return _instance(species, x, z, fields, key,
                     scale=_bed_scale(species, radius_m))


CASCADE_LIP_SPECIES = f"{_WET}rockl01wet"
CASCADE_RIM_SPECIES = f"{_WET}rockl03wet"
#: What a cascade rock falls back to when the big boulder cannot be seated
#: where the record puts it: the same wet family, one size down each time.
CASCADE_FALLBACK = (f"{_WET}rockl03wet", f"{_WET}rockm02wet")
#: How far out from the record's position a cascade rock may step, metres,
#: looking for bank it can sit on (the lip of a carved gorge is a 60-75 deg
#: wall where nothing seats; the bank top is a few metres further out).
CASCADE_SEAT_STEPS_M = (0.0, 2.0, 4.0, 6.0)


def _seat_cascade_rock(species: str, x: float, z: float, ax: float, az: float,
                       fields, key: int) -> Instance | None:
    """A cascade rock seated on the nearest ground that takes it: the
    record's position first, then outward along (ax, az) in
    `CASCADE_SEAT_STEPS_M`, the big boulder first and the smaller wet rocks
    after it. None only when nothing seats within the reach. Round 3 placed
    the record's position unseated (lip rocks 16-18 m proud on gorge walls)
    and the bare refusal rule then dropped 79 % of them (16f round 4)."""
    for step in CASCADE_SEAT_STEPS_M:
        px, pz = x + ax * step, z + az * step
        for candidate in (species, *CASCADE_FALLBACK):
            inst = _instance(candidate, px, pz, fields, key)
            if inst is not None:
                return inst
    return None


def cascade_rocks(water, chunk_bounds: tuple[float, float, float, float],
                  seed: int, fields) -> tuple[list[Instance], list[dict]]:
    """Boulders against both sides of a cascade's lip and around its
    plunge-pool rim (mined rule 8: the sources put big boulders and the fall
    FX together)."""
    x0, z0, x1, z1 = chunk_bounds
    instances: list[Instance] = []
    records: list[dict] = []
    for cascade in water.meta.get("cascades", []):
        lip, plunge = cascade["lip"], cascade["plunge"]
        if not (x0 <= lip["x"] < x1 and z0 <= lip["z"] < z1):
            continue
        key0 = _id_hash(seed, cascade["id"])
        dx, dz = plunge["x"] - lip["x"], plunge["z"] - lip["z"]
        run = math.hypot(dx, dz) or 1.0
        # across-vector: perpendicular to lip -> plunge, in the lip's plane
        ax, az = -dz / run, dx / run
        half = float(cascade.get("widthM", 4.0)) / 2.0
        n = 0
        for sign in (-1.0, 1.0):
            count = 2 + int(uniform_at(key0, n) * 3)      # 2-4 per side
            for _ in range(count):
                key = hash64(key0, n)
                n += 1
                off = half + 1.0 + uniform_at(key, 0) * 2.0   # 1-3 m clear
                px = lip["x"] + ax * sign * off
                pz = lip["z"] + az * sign * off
                inst = _seat_cascade_rock(CASCADE_LIP_SPECIES, px, pz,
                                          ax * sign, az * sign, fields, key)
                if inst is None:
                    continue
                instances.append(inst)
                records.append({"cascadeId": cascade["id"], "x": round(inst.x, 2),
                                "z": round(inst.z, 2),
                                "radiusM": round(half, 2),
                                "tx": round(dx / run, 4), "tz": round(dz / run, 4)})
        rim = 3 + int(uniform_at(key0, 99) * 3)                # 3-5 on the rim
        for i in range(rim):
            key = hash64(key0, 1000 + i)
            angle = uniform_at(key, 0) * math.tau
            radius = 6.0 + uniform_at(key, 1) * 4.0            # 6-10 m ring
            px = plunge["x"] + math.cos(angle) * radius
            pz = plunge["z"] + math.sin(angle) * radius
            if fields.water_depth(px, pz) < -1.0:              # wet or bank only
                continue
            inst = _seat_cascade_rock(CASCADE_RIM_SPECIES, px, pz,
                                      math.cos(angle), math.sin(angle),
                                      fields, key)
            if inst is None:
                continue
            instances.append(inst)
            records.append({"cascadeId": cascade["id"], "x": round(inst.x, 2),
                            "z": round(inst.z, 2), "radiusM": round(radius, 2),
                            "tx": round(math.cos(angle), 4),
                            "tz": round(math.sin(angle), 4)})
    return instances, records


def read_bed_rocks(path: Path = BED_ROCKS_PATH) -> list[dict]:
    """The rocks on record, or [] when no record ships yet."""
    if not path.exists():
        return []
    doc = json.loads(path.read_text(encoding="utf-8"))
    return list(doc.get("rocks", [])) if doc.get("schemaVersion") == 1 else []


def write_bed_rocks(records: list[dict], path: Path = BED_ROCKS_PATH) -> None:
    """The record the water renderer stamps foam from (schemaVersion 1)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({
        "schemaVersion": 1,
        "about": ("Rocks the scatter compiler placed in flowing water, from "
                  "the hydrology record: one per 160 m2 of a steep reach's "
                  "wetted bed (worldgen/rock_dressing.bed_boulders) plus the "
                  "lip and plunge-rim rocks of every cascade. The water "
                  "renderer stamps foam on them; it never places them."),
        "rocks": records,
    }, indent=1) + "\n", encoding="utf-8")
