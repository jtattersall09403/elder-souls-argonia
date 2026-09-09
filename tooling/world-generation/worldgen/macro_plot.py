"""Phase 11 Part 3 — the MACRO PLOT: an approximate position for every live place.

    cd tooling/world-generation
    python3 -m worldgen.macro_plot            # plots, writes catalogue + report
    python3 -m worldgen.macro_plot --dry-run  # report only, catalogue untouched

WHAT IT DOES (decision 0041 Part 3)
-----------------------------------
Matches the catalogue's DEMAND (every live record's siting preferences) to the
province's SUPPLY of ground — the terrain scour's candidate sites plus a seeded
lattice of "free ground" for records that just want firm land, shallow marsh or
a channel bank — tier by tier, in importance order, so the important places
take the good sites. Each assignment records its why. Anything that cannot be
placed honestly goes to a HOMELESS batch, re-tried with relaxed rules, and
reported rather than force-fitted.

Positions are approximate (2D, on the 5.5 m analysis grid); Part 6's compiler
sites the actual footprint on real terrain. The nine settlement anchors keep
their owner-approved positions exactly.

DETERMINISM (engineering standard 6)
------------------------------------
No randomness in the scoring at all; the only RNG seeds the free-ground jitter
and every tie is broken by id. Re-running reproduces the catalogue byte for
byte. The catalogue is written through `catalogue.dump_json`.

WHAT IT WRITES
--------------
* Every plotted record gains `position {u,v}`, `positionM [x,z]`,
  `scourSiteId` (when a scour site won), `candidatesConsidered` (the runners-
  up and why they lost), `whySiteWon`, `plotFacts` (the land under the dot),
  and `workflow: "plotted"`.
* `world/sources/sites/macro-plot.json` + `.md`: the coverage report — per-
  zone counts, landform usage, spacing and route-distance stats, the
  anti-sameyness quotas, the route-visibility sweep, the homeless batch.

The scoring weights below are the plot's "siting grammar" in one place; if a
family of places keeps landing wrong, change the weight and re-run, never
hand-move a dot (hand moves are a Part 6 blueprint concern and go on the
record as `plotOverride` with a reason — see `pin_overrides` / `worldgen.apply_sitings`).
"""

from __future__ import annotations

import argparse
import json
import math
import re
import zlib
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from . import catalogue
from .regions import REGION_CLASSES
from . import plot_stats
from .site_fields import ProvinceSurvey

REPO_ROOT = Path(__file__).resolve().parents[3]
SITES_DIR = REPO_ROOT / "world" / "sources" / "sites"
SCOUR_PATH = SITES_DIR / "candidate-sites.json"
REPORT_JSON = SITES_DIR / "macro-plot.json"
REPORT_MD = SITES_DIR / "macro-plot.md"
OVERRIDES_PATH = SITES_DIR / "macro-plot-overrides.json"
RECIPES_PATH = catalogue.CATALOGUE_DIR / "type-recipes.json"

SCHEMA_VERSION = 1
DEFAULT_SEED = 1103                      # phase 11, part 3

REGION_NAME_TO_ID = {name: i for i, (name, _rgb) in REGION_CLASSES.items()}
FIRM_REGIONS = {"upland hills", "border mountains", "raised hammock", "firm lowland",
                "fringe marsh", "seasonal floodplain", "tropical jungle", "upland plateau"}
MARSH_REGIONS = {"interior swamp", "rootland deep marsh", "mangrove forest",
                 "coastal lagoon & salt marsh", "tidal delta", "fringe marsh"}
WATER_REGIONS = {"ocean", "lake & standing water", "deep river corridor"}
FREE_LANDFORMS = ("any-firm-ground", "any-shallow-marsh", "any-channel-bank")

SAME_TYPE_MIN_M = 300.0          # "never two of the same template in sight" — marsh sightlines are short
# The range an `outOfSightOf` rule reaches when its type declares no paired
# `maxFromM` for that class: the widest authored neighbour range in the
# catalogue (smugglers-ledge, 800 m from its pass post).
OUT_OF_SIGHT_DEFAULT_M = 800.0
SAME_TYPE_LANDMARK_MIN_M = 700.0
COLLISION_MIN_M = 30.0           # absolute floor: two dots are never one dot
# Places have EXTENT, not just a position (owner ruling 2026-09-09). Every type
# carries `footprintRadiusM` in type-recipes.json (derived from the authored
# blueprint boundary where one exists — see worldgen.author_type_siting), and
# the physical clearance between two dots is the SUM of their two radii. A type
# with no radius falls back to half the old flat floor, which reproduces it.
DEFAULT_FOOTPRINT_M = COLLISION_MIN_M / 2.0
FREE_SPACING_M = 140.0           # free-ground lattice pitch
SUBMERGED_SPACING_M = 60.0       # underwater POIs need distinct candidate footprints too
ACCEPT_SCORE = 0.9               # below this a pair is not an honest fit
RELAXED_SCORE = 0.35
ZONE_SPILL_M = 350.0             # a place may sit this far outside its culture zone when its own zone has no ground left
ROADSIDE_STEP_M = 110.0          # roadside lattice: a candidate this often along every road and lane
ROADSIDE_OFFSETS_M = (35.0, 90.0)

DANGER_TIER = {"D0": 1, "D1": 1, "D2": 2, "D3": 3, "D4": 4, "D5": 5}
SIGHTLINE_MAX_M = 1500.0         # a "within sight of X" claim further than this is not a sightline
BOUND_MAX_M = 250.0              # "inside / part of / off the bank of X"
ON_ROUTE_MAX_M = 220.0           # "on the road" further than this is a false claim (strict stages)
NEAR_POINT_RELAX = 2.0           # homeless-batch multiplier on sitingPrefs.nearPoint.maxM
ON_ROUTE_RELAXED_M = 380.0       # ...and even the homeless batch may not put it further than this
SATELLITE_MAX_M = 450.0          # a record NAMED after a settlement (mazzatun-hist, archon-harbour-hist) sits at it
D5_MIN_ROUTE_M = 200.0           # deep peril never sits on the road
ROUTE_REPEAT_MIN_M = 900.0       # same type twice along the same road
HARD_REGION_CLASSES = {"settlement", "works", "transit"}   # a village's region wish is a requirement

# --- owner feedback round (Part 4 step 2, 2026-09-03) ---------------------
# Danger is a HARD fit now: a quiet village never sits in deep peril (the
# semantic audit found six D2 villages in band 5). Lived-in classes tolerate a
# one-band gap, everything else two (three once the homeless stages relax).
LIVED_IN_CLASSES = {"settlement", "civic", "works", "transit"}
DANGER_GAP_LIVED = 1
DANGER_GAP_OTHER = 2
# City hinterland rings: what a *collection* around a city should read like —
# city edge (wards, docks, gates, the city's own shrines) → hinterland (farms,
# works, villages, civil camps) → rural (villages, shrines, the first ruins)
# → wilds. A bandit camp 400 m from a city gate is a mistake, not a challenge.
RING_EDGE_M = 350.0
RING_HINTERLAND_M = 1200.0
EDGE_OK_CLASSES = {"civic", "works", "transit", "martial", "sacred"}
HINTERLAND_HOSTILE_PENALTY = 0.9
# The opening ring around the start (Alten Corimont; docs/research/quests-and-cast/opening-hours-and-start-area.md):
# ring A 0–250 m danger ≤2, ring B 250–600 m danger ≤3 except the ONE telegraphed hostile quadrant.
OPENING_ANCHOR = "alten-corimont"
OPENING_RING_A_M, OPENING_RING_B_M = 250.0, 600.0
OPENING_ALLOW = {"place.pirate-freeholds.the-wading-ground"}
# Hostile places: a SHARE rule, not a fixed count (recalibrated 2026-09-04 for
# the owner's hostile-mix ruling, docs/research/placement-settlements/place-purpose-hostility-and-dungeon-balance.md
# §8b). The old rule allowed 3 unrelated hostile-baseline places within 800 m.
# That was calibrated when 85 of 576 records were hostile; once the province is
# 55-65 % hostile-or-clearable, as Skyrim and Morrowind are, an 800 m circle
# holds roughly fifty places and half of them are meant to be hostile, so a
# fixed 3 rejects almost every hostile site and the plot cannot solve. The rule
# now says: unrelated hostile neighbours may not exceed HOSTILE_CLUSTER_SHARE of
# everything already plotted within HOSTILE_CLUSTER_M, and never bites below
# HOSTILE_CLUSTER_FLOOR. One owner's territory is still free (owner match is
# excluded from the count), which was the rule's real intent.
# ...and (2026-09-09) the count is of hostile places that HOLD the ground: a
# record with occupants or a named `hostility.owner`. "One owner's territory is
# free" only means anything about territory-holders, and an unoccupied hostile
# ruin holds none — `horwalli-waterworks-deeps` is a lost-peoples waterworks
# whose own record says "Unstaffed; the works run themselves, badly", with no
# occupants and no owner faction, and it went homeless because thirteen other
# places within 800 m of its authored drainage pinch were also hostile. Danger
# is not a claim; a claimant is. Both sides of the pair must hold ground, so
# this narrows the rule to the rivalry it was written for and leaves the
# province's hostility frequency untouched.
HOSTILE_CLUSTER_M = 800.0
HOSTILE_CLUSTER_FLOOR = 4
HOSTILE_CLUSTER_SHARE = 0.7
# Purpose repetition: the same primary purpose twice along one road within this
# distance is wallpaper (research §5.3 rule 1, approximated pairwise).
PURPOSE_REPEAT_ROUTE_M = 500.0
PURPOSE_REPEAT_ANY_M = 200.0
# Swap pass: after the greedy solve, try exchanging sites between pairs of
# records to lift the worst fits (the anti-greedy step the owner asked about).
SWAP_CANDIDATES = 24
SWAP_MIN_GAIN = 0.25
PLACE_ID = re.compile(r"place\.[a-z0-9-]+\.[a-z0-9-]+")

# A Thomas process has separated latent parents and children clustered around
# them. The mask geometry differs sharply by culture, so parent pitch and
# clump width are authored per culture rather than smuggled in through one
# province-wide spacing number. `childRadiusM` is the accepted owner ceiling.
THOMAS_CULTURES = {
    "dunmer-north": {"parentFloorM": 600.0, "sigmaM": 150.0},
    "hist-heartland": {"parentFloorM": 650.0, "sigmaM": 170.0},
    "imperial-fringe": {"parentFloorM": 550.0, "sigmaM": 130.0},
    "imperial-penal-south": {"parentFloorM": 400.0, "sigmaM": 110.0},
    "mercantile-coast": {"parentFloorM": 500.0, "sigmaM": 120.0},
    "naga-kur-deeps": {"parentFloorM": 700.0, "sigmaM": 180.0},
    "pirate-freeholds": {"parentFloorM": 400.0, "sigmaM": 110.0},
    "saxhleel-coast": {"parentFloorM": 500.0, "sigmaM": 140.0},
}
THOMAS_CHILD_RADIUS_M = 300.0
# Seven, not eight (2026-09-09). Once places have EXTENT a 300 m kernel
# cannot hold eight of them: eight children in a 300 m disc average ~106 m
# apart, and two M3 villages alone need 230 m. Seven is as far as the
# authored per-culture parent floors allow (six needs 22 parents in
# dunmer-north and only 19 clear its 600 m floor).
THOMAS_CHILDREN_PER_PARENT = 7
THOMAS_WEIGHT = 1.2

# A navigable identity is a hard physical claim.  The reach is the place's own
# waterfront rather than its landward map dot; hull classes match B5.
HULL_CLASS_M = {"canoe": 0.6, "small-draft": 1.2, "keeled": 3.0}
NAVIGABLE_HULL_CLASS = {
    "port-town": "keeled", "legal-harbour-city": "keeled", "neutral-free-port": "keeled",
    "shipyard": "keeled", "head-of-navigation": "keeled",
    "ferry-stage": "small-draft", "customs-town": "small-draft", "tradehouse": "small-draft",
    "bonded-warehouse": "small-draft", "pirate-anchorage": "small-draft",
    "salvage-divers-yard": "small-draft", "monsoon-barrier": "small-draft",
}
NAVIGABLE_DEFAULT_CLASS = "canoe"
NAVIGABLE_REACH_M = 150.0


# --------------------------------------------------------------------------- #
# data
# --------------------------------------------------------------------------- #
@dataclass
class Candidate:
    id: str
    kind: str              # scour | free
    landform: str
    x: float
    z: float
    region: str
    danger: int
    zone: str | None
    route_m: float
    water_m: float
    depth_m: float
    slope: float
    prominence: float      # 0..1
    visibility: float      # 0..1
    concealment: float     # 0..1
    water_relation: float  # 0..1
    anchor_m: float
    anchor_id: str | None = None                            # nearest anchor (for the ring rules)
    used_by: str | None = None
    zone_dist: dict = field(default_factory=dict)   # metres to each culture zone (filled by attach_zone_distances)
    navigable_depth_m: float = 0.0          # deepest published water within NAVIGABLE_REACH_M


@dataclass
class Demand:
    id: str
    zone: str
    tier: int
    layer: str
    magnitude: str | None
    cls: str
    type: str
    danger: int
    landforms: list[str]
    landforms_from_recipe: bool
    regions: set[str]
    parents: list[str]
    hints: dict = field(default_factory=dict)
    record: dict = field(default_factory=dict)
    sightline_to: list[str] = field(default_factory=list)   # must have line of sight to these (hard)
    bound_to: str | None = None                              # must sit within bound_max of this (hard)
    bound_max: float = BOUND_MAX_M
    near_point: tuple[float, float, float] | None = None       # (x, z, maxM): typed `sitingPrefs.nearPoint`
    scour_site_ids: list[str] = field(default_factory=list)  # typed `sitingPrefs.scourSiteIds`: the record's own claim
    purpose: str = "wonder-oddity"                           # playerPurpose.primary (v2)
    stance: str = "neutral"                                  # hostility.baseline (v2)
    owner: str | None = None                                 # hostility.owner (v2)
    footprint_m: float = DEFAULT_FOOTPRINT_M                 # type-recipe footprintRadiusM
    proximity: dict = field(default_factory=dict)            # type-recipe proximity block

    def may_abut(self, other_cls: str) -> bool:
        return other_cls in (self.proximity.get("mayAbut") or ())

HINT_PATTERNS = [
    ("submerged", re.compile(r"\b(fully )?submerged|underwater|below (the )?water|beneath the water|drowned\b", re.I)),
    ("on_route", re.compile(r"\bon (the|a) (road|route|lane)|astride|road junction|at a crossing|crossroad|junction of", re.I)),
    ("concealed", re.compile(r"conceal|hidden|screened|no sightline|no line of sight|out of sight|secret", re.I)),
    ("commanding", re.compile(r"commands?|overlook|visible from|within sight|line of sight|silhouette|landmark", re.I)),
    ("remote", re.compile(r"\bisolated|remote|far from|deliberately isolated|nowhere near", re.I)),
    ("inside_parent", re.compile(r"inside the settlement|within the settlement|clearance mask|inside the city|in the city", re.I)),
    ("navigable", re.compile(r"navigable|laden hull|deep water|quay|harbour|anchorage", re.I)),
    ("above_flood", re.compile(r"above the flood|never floods|above flood|dry rise|dry knoll|above water", re.I)),
]
SIGHT_PATTERN = re.compile(r"within sight of|visible from|line of sight to|overlook(?:s|ing)?|above ", re.I)
BOUND_PATTERN = re.compile(r"inside the (?:settlement|city)|within the settlement|clearance mask|part of|off the city|"
                           r"at the edge of|on the edge of|in the city|beside the", re.I)


def _named_refs(text: str, zone_names: dict[str, str], own_id: str) -> list[str]:
    """Place ids referenced in constraint prose: literal ids first, then the
    names of records in the same zone (longest names first so 'Wolk Market'
    beats 'Wolk')."""
    refs = [m for m in PLACE_ID.findall(text) if m != own_id]
    low = text.lower()
    for name, pid in sorted(zone_names.items(), key=lambda kv: -len(kv[0])):
        if pid != own_id and pid not in refs and len(name) >= 4 and name.lower() in low:
            refs.append(pid)
    return refs
KM_PATTERN = re.compile(r"within (\d+(?:\.\d+)?) ?km", re.I)


def _hash01(*parts: str) -> float:
    return (zlib.crc32("|".join(parts).encode()) & 0xFFFFFFFF) / 0xFFFFFFFF


def build_thomas_prior(demands: list[Demand], cands: list[Candidate], seed: int) -> dict[str, dict]:
    """Choose deterministic latent parent sites in each culture mask.

    Parents are candidate ground, ordered by a stable seeded hash and admitted
    only when they clear that culture's parent floor. Roughly seven catalogue
    records share a parent. They consume no candidate and are not places; they
    are solely a density prior for the subsequent assignment.
    """
    counts: dict[str, int] = {}
    for d in demands:
        counts[d.zone] = counts.get(d.zone, 0) + 1
    out: dict[str, dict] = {}
    for zone, count in sorted(counts.items()):
        cfg = THOMAS_CULTURES.get(zone)
        if cfg is None:
            raise ValueError(f"no Thomas-process culture parameters for {zone!r}")
        target = max(1, math.ceil(count / THOMAS_CHILDREN_PER_PARENT))
        # Underwater infill exists to give submerged children physical room;
        # it must not move the culture-wide parent process off inhabited land.
        eligible = sorted((c for c in cands if c.zone == zone and c.kind != "free-water"),
                          key=lambda c: (_hash01(str(seed), zone, c.id), c.id))
        parents: list[tuple[float, float]] = []
        floor = float(cfg["parentFloorM"])
        for c in eligible:
            if all(math.hypot(c.x - px, c.z - pz) >= floor for px, pz in parents):
                parents.append((c.x, c.z))
                if len(parents) == target:
                    break
        if not parents:
            raise ValueError(f"culture {zone!r} has demand but no candidate ground for a Thomas parent")
        if len(parents) != target:
            raise ValueError(
                f"culture {zone!r} needs {target} Thomas parents but only {len(parents)} "
                f"clear the {floor:.0f} m floor; adjust the culture policy or candidate mask"
            )
        out[zone] = {**cfg, "childRadiusM": THOMAS_CHILD_RADIUS_M,
                     "targetParents": target, "parents": parents}
    return out


def thomas_parent_points(d: Demand, prior: dict[str, dict],
                         plotted: dict[str, tuple[float, float]] | None = None) -> list[tuple[float, float]]:
    """Return the latent parents which may generate ``d``.

    The culture-wide points model ordinary clumping.  A hard authored locality
    is itself a conditional parent: otherwise a perfectly valid ``nearPoint``
    or ``boundTo`` can lie outside every randomly selected culture kernel and
    become mathematically impossible.  This does not relax the child radius;
    it makes the density model conditional on the stronger authored fact.
    """
    points = list(prior[d.zone]["parents"])
    if d.near_point is not None:
        points.append((d.near_point[0], d.near_point[1]))
    if d.bound_to and plotted and d.bound_to in plotted:
        points.append(plotted[d.bound_to])
    return points


def has_resolved_locality(d: Demand, plotted: dict[str, tuple[float, float]]) -> bool:
    """Whether this demand competes for a small, already knowable domain."""
    return d.near_point is not None or bool(d.bound_to and d.bound_to in plotted)


def reference_supports_local_dependents(
        reference_id: str, candidate: Candidate, dependents: dict[str, list[Demand]],
        relaxed: bool, survey: ProvinceSurvey,
        local_candidates: dict[str, list[Candidate]] | None = None,
        plotted: dict[str, tuple[float, float]] | None = None) -> bool:
    """Look one edge ahead before placing a named reference.

    A child may promise both an authored point and a bind/sightline to another
    place.  Placing that other place arbitrarily can make the child's two hard
    facts disjoint.  Reject reference sites which cannot support the child's
    local domain; this is constraint propagation, not a radius relaxation.
    """
    for child in dependents.get(reference_id, []):
        if plotted and child.id in plotted:
            cx, cz = plotted[child.id]
            sites = [Candidate(
                id=f"fixed.{child.id}", kind="fixed", landform="fixed", x=cx, z=cz,
                region="", danger=0, zone=child.zone, route_m=0, water_m=0,
                depth_m=0, slope=0, prominence=0, visibility=0, concealment=0,
                water_relation=0, anchor_m=0)]
        else:
            sites = (local_candidates or {}).get(child.id, [])
        if child.bound_to == reference_id and not any(
                math.hypot(site.x - candidate.x, site.z - candidate.z) <= child.bound_max
                for site in sites):
            return False
        if reference_id in child.sightline_to and not any(
                math.hypot(site.x - candidate.x, site.z - candidate.z) <= SIGHTLINE_MAX_M
                and survey.line_of_sight(site.x, site.z, candidate.x, candidate.z,
                                         eye_a=1.7, eye_b=8.0)
                for site in sites):
            return False
    return True


def thomas_exempt(d: Demand) -> bool:
    """Is this record, by its own typed fields, not a clump CHILD at all?

    The Thomas prior models small places clustering around latent parents. Two
    authored facts make membership of a 300 m kernel arithmetically impossible,
    and neither is a preference the solver may trade away (2026-09-09):

    * **it is too big to be one of a clump.** A place whose own
      `footprintRadiusM` is at least half the child radius fills the kernel: a
      230 m wamasu pond and a 115 m M3 village need 345 m of clearance, more
      than the kernel's whole diameter, so the pond can never be a child
      beside anything.
    * **it is authored to stand apart.** A type whose `minFromClassM` puts it
      further from settlements than the child radius is being asked to sit
      inside a settlement clump and far from settlements at once. The
      snowline hermitage's own recipe says "deliberately alone".

    Exempt records score 0 from the prior rather than None — no clumping
    bonus, no clumping veto — which is the same treatment
    `thomas_parent_points` already gives a stronger authored locality. It
    exempts 12 of 350 types: the eight capitals (owner-pinned anchors in any
    case), the wamasu pond, and the isolation types above 300 m.
    """
    if d.footprint_m * 2.0 >= THOMAS_CHILD_RADIUS_M:
        return True
    floors = (d.proximity.get("minFromClassM") or {}).values()
    return max(floors, default=0.0) > THOMAS_CHILD_RADIUS_M


def thomas_prior_score(d: Demand, c: Candidate, prior: dict[str, dict], relaxed: bool,
                       plotted: dict[str, tuple[float, float]] | None = None) -> float | None:
    """Density score for a child candidate, or None outside its strict clump.

    The Gaussian is the Thomas-process kernel. Every stage keeps children
    within 300 m; authored localities add conditional parents rather than
    weakening that ceiling, and records that cannot be children at all
    (`thomas_exempt`) are scored flat rather than vetoed.
    """
    if thomas_exempt(d):
        return 0.0
    cluster = prior[d.zone]
    distance = min(math.hypot(c.x - px, c.z - pz)
                   for px, pz in thomas_parent_points(d, prior, plotted))
    radius = float(cluster["childRadiusM"])
    if distance > radius:
        return None
    sigma = float(cluster["sigmaM"])
    gaussian = math.exp(-0.5 * (distance / sigma) ** 2)
    return THOMAS_WEIGHT * gaussian


def thomas_outcome(prior: dict[str, dict], demands: list[Demand], result: dict[str, dict],
                   unresolved: list[dict]) -> tuple[dict, list[str]]:
    """Audit the delivered assignment, not only the clustering primitives.

    Owner anchors and explicit blueprint pins are declared exceptions; every
    other resolved child must occupy one of the requested parents' 300 m
    kernels, every latent parent must have a child, and a resolve-all result
    must not hide homeless records.
    """
    by_id = {d.id: d for d in demands}
    pinned = {row["id"] for row in load_overrides()}
    occupancy = {zone: [0] * len(row["parents"]) for zone, row in prior.items()}
    outside: list[str] = []
    all_positions = {rid: (row["candidate"].x, row["candidate"].z)
                     for rid, row in result.items()}
    for did, assignment in result.items():
        demand = by_id.get(did)
        if demand is None or demand.tier == 0 or did in pinned:
            continue
        cluster = prior[demand.zone]
        candidate = assignment["candidate"]
        # Occupancy is credited to EVERY parent whose kernel holds the record,
        # not just the nearest one (fixed 2026-09-09). Every culture's
        # `parentFloorM` (400-700 m) is below 2 x the 300 m child radius, so
        # kernels legitimately overlap; crediting only the nearest parent let a
        # parent whose kernel was full of children read as empty because a
        # neighbour 442 m away was marginally nearer to each of them. That is
        # an artefact of the attribution, not a hole in the plot, and it was
        # failing `--resolve-all` on `imperial-penal-south` parent 0.
        radius = float(cluster["childRadiusM"]) + 1e-6
        for i, (x, z) in enumerate(cluster["parents"]):
            if math.hypot(candidate.x - x, candidate.z - z) <= radius:
                occupancy[demand.zone][i] += 1
        # A record that cannot be a clump child (`thomas_exempt`) still counts
        # towards parent occupancy when it happens to land in a kernel — it is
        # only the "child must be inside a kernel" rule it is exempt from.
        if thomas_exempt(demand):
            continue
        distance = min(math.hypot(candidate.x - x, candidate.z - z)
                       for x, z in thomas_parent_points(demand, prior, all_positions))
        if distance > float(cluster["childRadiusM"]) + 1e-6:
            outside.append(did)
    empty = {zone: [i for i, count in enumerate(counts) if count == 0]
             for zone, counts in occupancy.items() if any(count == 0 for count in counts)}
    unresolved_ids = sorted(row["id"] for row in unresolved)
    errors = []
    if unresolved_ids:
        errors.append(f"resolve-all left homeless records {unresolved_ids}")
    if outside:
        errors.append(f"Thomas children outside {THOMAS_CHILD_RADIUS_M:.0f} m kernels {sorted(outside)}")
    if empty:
        errors.append(f"Thomas parents with no children {empty}")
    return ({"unresolved": unresolved_ids, "outsideRadius": sorted(outside),
             "parentOccupancy": occupancy, "emptyParents": empty}, errors)


# --------------------------------------------------------------------------- #
# demand
# --------------------------------------------------------------------------- #
def load_recipes() -> dict[str, dict]:
    data = json.loads(RECIPES_PATH.read_text())
    return {t["type"]: t for t in data["types"]}


def build_demand(recipes: dict[str, dict]) -> tuple[list[Demand], dict[str, catalogue.RegionFile]]:
    files = {rf.region: rf for rf in catalogue.load_region_files()}
    settlements_by_id = {rec["id"]: rec for rf in files.values() for rec in rf.places
                         if rec["classification"]["class"] == "settlement"
                         and rec.get("status") not in {"cut", "deferred"}}
    demands: list[Demand] = []
    for region, rf in sorted(files.items()):
        zone_names = {rec["name"]: rec["id"] for rec in rf.places
                      if rec.get("name") and rec.get("status") not in {"cut", "deferred"}}
        for rec in rf.places:
            if rec.get("status") in {"cut", "deferred"}:
                continue
            prefs = rec.get("sitingPrefs", {})
            typ = rec["classification"]["type"]
            recipe = recipes.get(typ, {})
            landforms = list(prefs.get("landformClasses") or [])
            from_recipe = False
            if not landforms:
                landforms = list((recipe.get("siting") or {}).get("landformClasses") or [])
                from_recipe = True
            if not landforms:
                landforms = ["any-firm-ground"]
            regions = set(prefs.get("regionClasses") or (recipe.get("siting") or {}).get("regionClasses") or [])
            rel = rec.get("relations", {}) or {}
            parents = [p for k in ("reachedVia", "dependsOn", "visibleFrom") for p in rel.get(k, []) or []]
            text = " ".join(list(prefs.get("hardConstraints") or []) + list(prefs.get("preferences") or []))
            hints = {name: bool(pat.search(text)) for name, pat in HINT_PATTERNS}
            km = KM_PATTERN.search(text)
            hints["within_km"] = float(km.group(1)) if km else None
            sight: list[str] = []
            bound: str | None = None
            bound_by_prose = False
            for line in list(prefs.get("hardConstraints") or []):
                refs = _named_refs(line, zone_names, rec["id"])
                if refs and SIGHT_PATTERN.search(line):
                    sight += [r for r in refs if r not in sight]
                elif BOUND_PATTERN.search(line):
                    bound = bound or (refs[0] if refs else None)
                    bound_by_prose = True
            for r in rel.get("visibleFrom", []) or []:
                if r not in sight:
                    sight.append(r)
            bound_max = BOUND_MAX_M
            # Typed siting (2026-09-04): `sitingPrefs.boundTo {place, maxM}` and
            # `sitingPrefs.sightlineTo [ids]` are honoured without any prose
            # pattern — the quest map's "reached THROUGH the Lost City" had been
            # sitting in `preferences` where nothing read it.
            typed_bound = prefs.get("boundTo")
            if isinstance(typed_bound, dict) and typed_bound.get("place"):
                bound = typed_bound["place"]
                bound_max = float(typed_bound.get("maxM") or BOUND_MAX_M)
                bound_by_prose = True
            for r in prefs.get("sightlineTo") or []:
                if r not in sight and r != rec["id"]:
                    sight.append(r)
            # `sitingPrefs.nearPoint {x, z, maxM}` (metres): a hard radius around a
            # world point — how the hostility-frequency report's route gaps are
            # filled without hand-writing a position (positions stay plot-owned).
            np_ = prefs.get("nearPoint")
            near_point = None
            if isinstance(np_, dict) and "x" in np_ and "z" in np_:
                near_point = (float(np_["x"]), float(np_["z"]), float(np_.get("maxM") or 400.0))
            if bound is None:
                # a satellite named after its settlement (mazzatun-hist, archon-harbour-hist,
                # rootworm-station-helstrom, gideon-rootworm-terminus) belongs at it
                own = set(rec["id"].rsplit(".", 1)[-1].split("-"))
                for pid in list(rel.get("dependsOn", []) or []) + list(rel.get("reachedVia", []) or []):
                    other = settlements_by_id.get(pid)
                    if other and set(pid.rsplit(".", 1)[-1].split("-")) < own:
                        bound, bound_max = pid, (BOUND_MAX_M if bound_by_prose else SATELLITE_MAX_M)
                        break
                if bound is None and bound_by_prose:
                    # "inside the settlement" with no name: the first place it is reached through
                    bound = (rel.get("reachedVia") or [None])[0]
            demands.append(Demand(
                id=rec["id"], zone=region, tier=int(rec["importanceTier"]),
                layer=rec["densityLayer"], magnitude=rec["classification"].get("magnitude"),
                cls=rec["classification"]["class"], type=typ,
                danger=DANGER_TIER.get(rec["dangerTier"], 3), landforms=landforms,
                landforms_from_recipe=from_recipe, regions=regions,
                parents=parents, hints=hints, record=rec, sightline_to=sight, bound_to=bound,
                bound_max=bound_max, near_point=near_point,
                scour_site_ids=[str(sid) for sid in (prefs.get("scourSiteIds") or [])],
                purpose=(rec.get("playerPurpose") or {}).get("primary", "wonder-oddity"),
                stance=(rec.get("hostility") or {}).get("baseline", "neutral"),
                owner=(rec.get("hostility") or {}).get("owner"),
                footprint_m=float(recipe.get("footprintRadiusM") or DEFAULT_FOOTPRINT_M),
                proximity=dict(recipe.get("proximity") or {})))
    live = {d.id for d in demands}
    for d in demands:   # refs to deferred/cut records cannot bind
        d.sightline_to = [r for r in d.sightline_to if r in live]
        if d.bound_to not in live:
            d.bound_to = None
    return demands, files


# --------------------------------------------------------------------------- #
# supply
# --------------------------------------------------------------------------- #
def load_scour(s: ProvinceSurvey) -> list[Candidate]:
    doc = json.loads(SCOUR_PATH.read_text())
    out = []
    for site in doc["sites"]:
        sc = site["scores"]
        x, z = site["worldM"]
        row, col = s.grid_px(x, z)
        out.append(Candidate(
            id=site["id"], kind="scour", landform=site["landform"], x=x, z=z,
            region=site["regionName"], danger=int(site["dangerBand"]),
            zone=site.get("cultureTerritory"),
            route_m=float(sc["distanceToNearestRouteM"]), water_m=float(sc["distanceToWaterM"]),
            depth_m=float(sc.get("waterDepthM", 0.0)), slope=float(site["slopeDeg"]),
            prominence=float(sc["prominenceScore"]), visibility=float(sc["visibilityScore"]),
            concealment=float(sc["concealmentScore"]), water_relation=float(sc["waterRelationScore"]),
            anchor_m=float(sc["distanceToNearestAnchorM"])))
    return out


def free_ground(s: ProvinceSurvey, seed: int, spacing_m: float = FREE_SPACING_M) -> list[Candidate]:
    """A jittered lattice over authored land, each point classified as firm
    ground, shallow marsh or channel bank. Seeded jitter only; classification
    is read straight off the rasters."""
    rng = np.random.default_rng([seed, zlib.crc32(b"free-ground")])
    n = s.grid_n
    px = s.grid_px_m
    pitch = spacing_m / px
    land = s.land
    region = s.region_grid
    water_m = s.dist_to_water_m
    route_m = s.dist_to_route_m
    depth = s.water_depth_grid if hasattr(s, "water_depth_grid") else None
    out: list[Candidate] = []
    anchors = s.anchor_points_m
    rows = np.arange(pitch / 2, n - 1, pitch)
    k = 0
    for r0 in rows:
        for c0 in rows:
            jr = (rng.random() - 0.5) * pitch * 0.8
            jc = (rng.random() - 0.5) * pitch * 0.8
            row = int(min(n - 1, max(0, round(r0 + jr))))
            col = int(min(n - 1, max(0, round(c0 + jc))))
            if not land[row, col]:
                continue
            rname = REGION_CLASSES[int(region[row, col])][0]
            if rname in WATER_REGIONS:
                continue
            slope = float(s.slope_grid[row, col])
            if slope > 30.0:
                continue
            wm = float(water_m[row, col])
            wet = bool(s.wetlands[row, col]) or bool(s.flood[row, col] >= 2)
            if rname in MARSH_REGIONS and (wet or rname != "fringe marsh"):
                landform = "any-shallow-marsh"
            elif wm <= 45.0 and int(s.river_band[row, col]) > 0:
                landform = "any-channel-bank"
            elif rname in FIRM_REGIONS:
                landform = "any-firm-ground"
            else:
                continue
            x = (col + 0.5) * px
            z = (row + 0.5) * px
            zone_id = int(s.culture[row, col])
            k += 1
            out.append(Candidate(
                id=f"site.free.{landform}-{k:04d}", kind="free", landform=landform, x=x, z=z,
                region=rname, danger=int(s.danger[row, col]),
                zone=s.culture_names.get(zone_id),
                route_m=float(route_m[row, col]), water_m=wm, depth_m=0.0, slope=slope,
                prominence=0.0, visibility=0.0,
                concealment=min(1.0, 0.3 + 0.5 * (rname in {"tropical jungle", "rootland deep marsh", "mangrove forest"})),
                water_relation=max(0.0, 1.0 - wm / 300.0),
                anchor_m=min(math.hypot(x - ax, z - az) for ax, az in anchors.values()),
                anchor_id=min(anchors, key=lambda k: math.hypot(x - anchors[k][0], z - anchors[k][1]))))
    return out


def free_submerged(s: ProvinceSurvey, seed: int, zones: set[str],
                   spacing_m: float = SUBMERGED_SPACING_M) -> list[Candidate]:
    """Supply distinct underwater footprints, not just sparse scour landmarks.

    The land lattice deliberately omits open water.  Without its water-side
    counterpart, two related submerged records can have only two scour points
    a few metres apart and become impossible under the immutable 30 m physical
    clearance.  This deterministic lattice is considered only by water-suited
    demands (ordinary records fail ``water_identity_ok`` at these points).
    """
    rng = np.random.default_rng([seed, zlib.crc32(b"free-submerged")])
    anchors = s.anchor_points_m
    pitch = spacing_m / s.grid_px_m
    rows = np.arange(pitch / 2, s.grid_n - 1, pitch)
    out: list[Candidate] = []
    k = 0
    for r0 in rows:
        for c0 in rows:
            row = int(min(s.grid_n - 1, max(0, round(r0 + (rng.random() - 0.5) * pitch * 0.5))))
            col = int(min(s.grid_n - 1, max(0, round(c0 + (rng.random() - 0.5) * pitch * 0.5))))
            zone = s.culture_names.get(int(s.culture[row, col]))
            if zone not in zones:
                continue
            x = (col + 0.5) * s.grid_px_m
            z = (row + 0.5) * s.grid_px_m
            depth = _point_depth_m(s, x, z)
            if depth + 1e-9 < SUBMERGED_MIN_DEPTH_M:
                continue
            rname = REGION_CLASSES[int(s.region_grid[row, col])][0]
            k += 1
            out.append(Candidate(
                id=f"site.free.open-water-{k:04d}", kind="free-water",
                landform="open-water", x=x, z=z, region=rname,
                danger=int(s.danger[row, col]), zone=zone,
                route_m=float(s.dist_to_route_m[row, col]), water_m=0.0,
                depth_m=depth, slope=float(s.slope_grid[row, col]),
                prominence=0.0, visibility=0.0, concealment=0.0,
                water_relation=1.0,
                anchor_m=min(math.hypot(x - ax, z - az) for ax, az in anchors.values()),
                anchor_id=min(anchors, key=lambda name: math.hypot(
                    x - anchors[name][0], z - anchors[name][1]))))
    return out


def _classify_free(s: ProvinceSurvey, row: int, col: int) -> str | None:
    rname = REGION_CLASSES[int(s.region_grid[row, col])][0]
    if rname in WATER_REGIONS or not s.land[row, col]:
        return None
    if float(s.slope_grid[row, col]) > 30.0:
        return None
    wm = float(s.dist_to_water_m[row, col])
    wet = bool(s.wetlands[row, col]) or bool(s.flood[row, col] >= 2)
    if rname in MARSH_REGIONS and (wet or rname != "fringe marsh"):
        return "any-shallow-marsh"
    if wm <= 45.0 and int(s.river_band[row, col]) > 0:
        return "any-channel-bank"
    if rname in FIRM_REGIONS:
        return "any-firm-ground"
    return None


def roadside_ground(s: ProvinceSurvey, seed: int) -> list[Candidate]:
    """Candidates strung along every road and boat lane, offset to one side or
    the other — the Morrowind rule is "something named every 200–300 m of
    road", and the plain lattice does not put enough ground within reach of
    the routes to honour it. Seeded only in which side gets the near offset."""
    rng = np.random.default_rng([seed, zlib.crc32(b"roadside")])
    anchors = s.anchor_points_m
    out: list[Candidate] = []
    n = s.grid_n
    k = 0
    for r in s.routes:
        pts = r.points_m
        if pts.shape[0] < 2:
            continue
        acc = ROADSIDE_STEP_M
        for i in range(1, pts.shape[0]):
            seg = pts[i] - pts[i - 1]
            L = float(np.hypot(*seg))
            if L < 1e-6:
                continue
            acc += L
            if acc < ROADSIDE_STEP_M:
                continue
            acc = 0.0
            nx, nz = -seg[1] / L, seg[0] / L
            side = 1.0 if rng.random() < 0.5 else -1.0
            for off, sgn in zip(ROADSIDE_OFFSETS_M, (side, -side)):
                x = float(pts[i][0] + nx * off * sgn)
                z = float(pts[i][1] + nz * off * sgn)
                if not (0 <= x < s.extent_m and 0 <= z < s.extent_m):
                    continue
                row, col = s.grid_px(x, z)
                landform = _classify_free(s, row, col)
                if landform is None:
                    continue
                rname = REGION_CLASSES[int(s.region_grid[row, col])][0]
                wm = float(s.dist_to_water_m[row, col])
                k += 1
                out.append(Candidate(
                    id=f"site.free.roadside-{k:04d}", kind="free", landform=landform, x=x, z=z,
                    region=rname, danger=int(s.danger[row, col]), zone=s.culture_names.get(int(s.culture[row, col])),
                    route_m=float(s.dist_to_route_m[row, col]), water_m=wm, depth_m=0.0,
                    slope=float(s.slope_grid[row, col]), prominence=0.0, visibility=0.0,
                    concealment=0.2, water_relation=max(0.0, 1.0 - wm / 300.0),
                    anchor_m=min(math.hypot(x - ax, z - az) for ax, az in anchors.values()),
                    anchor_id=min(anchors, key=lambda k: math.hypot(x - anchors[k][0], z - anchors[k][1]))))
    return out


def attach_water_depth(s: ProvinceSurvey, cands: list[Candidate]) -> None:
    """Deepest published water within ~15 m of the candidate, so 'submerged'
    can demand real depth rather than nearness to a shoreline. Also measure
    the full waterfront reach used by hull-class validation."""
    from scipy import ndimage
    deep = ndimage.maximum_filter(s.water_depth_m, size=9)
    n = s.water_depth_m.shape[0]
    px = s.extent_m / n
    nav_deep = ndimage.maximum_filter(
        s.water_depth_m, size=int(round(2 * NAVIGABLE_REACH_M / px)) + 1)
    for c in cands:
        row = min(n - 1, max(0, int(c.z / px)))
        col = min(n - 1, max(0, int(c.x / px)))
        c.depth_m = max(c.depth_m, float(deep[row, col]))
        c.navigable_depth_m = float(nav_deep[row, col])


def measure_candidate_water(s: ProvinceSurvey, c: Candidate) -> None:
    """Single-candidate equivalent used by fixed anchors and blueprint pins."""
    n = s.water_depth_m.shape[0]
    px = s.extent_m / n
    row = min(n - 1, max(0, int(c.z / px)))
    col = min(n - 1, max(0, int(c.x / px)))
    local_radius = 4
    nav_radius = int(round(NAVIGABLE_REACH_M / px))
    local = s.water_depth_m[max(0, row - local_radius):min(n, row + local_radius + 1),
                            max(0, col - local_radius):min(n, col + local_radius + 1)]
    nav = s.water_depth_m[max(0, row - nav_radius):min(n, row + nav_radius + 1),
                          max(0, col - nav_radius):min(n, col + nav_radius + 1)]
    c.depth_m = max(c.depth_m, float(local.max(initial=0.0)))
    c.navigable_depth_m = float(nav.max(initial=0.0))


def attach_anchor_ids(s: ProvinceSurvey, cands: list[Candidate]) -> None:
    anchors = s.anchor_points_m
    for c in cands:
        if c.anchor_id is None:
            c.anchor_id = min(anchors, key=lambda k: math.hypot(c.x - anchors[k][0], c.z - anchors[k][1]))


def attach_zone_distances(s: ProvinceSurvey, cands: list[Candidate]) -> None:
    """Metres from each candidate to every culture zone, so spill-over can be
    capped at ZONE_SPILL_M instead of letting a place wander across the map."""
    from scipy import ndimage
    fields = {name: ndimage.distance_transform_edt(s.culture != i) * s.grid_px_m
              for i, name in s.culture_names.items()}
    for c in cands:
        row, col = s.grid_px(c.x, c.z)
        c.zone_dist = {name: float(f[row, col]) for name, f in fields.items()}


# --------------------------------------------------------------------------- #
# scoring
# --------------------------------------------------------------------------- #
def _band(v: float, lo: float, hi: float, fade: float) -> float:
    """1 inside [lo, hi], fading linearly to 0 over `fade` metres outside."""
    if v < lo:
        return max(0.0, 1.0 - (lo - v) / fade)
    if v > hi:
        return max(0.0, 1.0 - (v - hi) / fade)
    return 1.0


def ring_fit(d: Demand, c: Candidate, relaxed: bool) -> float | None:
    """None = forbidden here; otherwise a score term. Rings are measured from
    the nearest anchor city (the start freehold counts as a city)."""
    if d.tier == 0 or d.bound_to or d.hints.get("inside_parent"):
        return 0.0
    if c.anchor_m <= RING_EDGE_M:
        # the city edge: the city's own wards, docks, gates, works and shrines
        if d.cls in EDGE_OK_CLASSES or d.cls == "settlement" and d.magnitude in (None, "M1"):
            return 0.2
        return None if not relaxed else -0.8
    if c.anchor_m <= RING_HINTERLAND_M:
        # hinterland: farms, works, villages, civil camps, shrines; hostile
        # places and deep-peril lairs only if they hide (concealed) and even
        # then it costs
        if d.stance == "hostile" or (d.cls in {"lair", "ruin"} and d.danger >= 3):
            if d.danger >= 4 and not relaxed:
                return None
            return -HINTERLAND_HOSTILE_PENALTY + (0.3 if d.hints.get("concealed") else 0.0)
        if d.cls in {"works", "settlement", "civic", "camp"} and d.stance != "hostile":
            return 0.3
        return 0.0
    return 0.0


def navigable_need_m(d: Demand) -> float:
    hull = NAVIGABLE_HULL_CLASS.get(d.type, NAVIGABLE_DEFAULT_CLASS)
    return HULL_CLASS_M[hull]


def promised_navigable_depth_m(d: Demand) -> float:
    """Deepest typed, executable carve promised at this place.

    ``depthClass`` is resolved through the terrain compiler's closed policy,
    rather than treated as decorative prose. Raise requests and untyped notes
    cannot excuse shallow published water.
    """
    from . import terrain_requests
    promised = 0.0
    for request in d.record.get("terrainRequests") or []:
        spec = terrain_requests.KIND_SPECS.get(request.get("kind"))
        delivery = request.get("delivery")
        if spec is None or spec.action != "carve" or not isinstance(delivery, dict):
            continue
        if delivery.get("depthM") is None and delivery.get("depthClass") is None:
            continue
        promised = max(promised, terrain_requests.delivery_delta(spec, delivery))
    return promised


def water_identity_ok(d: Demand, c: Candidate, survey: ProvinceSurvey) -> bool:
    if d.hints.get("submerged"):
        return c.depth_m + 1e-9 >= SUBMERGED_MIN_DEPTH_M
    if _point_depth_m(survey, c.x, c.z) > OPEN_WATER_ALLOWANCE_M:
        return False
    if d.hints.get("navigable"):
        need = navigable_need_m(d)
        return (c.navigable_depth_m + 1e-9 >= need
                or promised_navigable_depth_m(d) + 1e-9 >= need)
    return True


def score_pair(d: Demand, c: Candidate, plotted: dict[str, tuple[float, float]],
               relaxed: bool = False, survey: ProvinceSurvey | None = None,
               relax_region: bool = False, plotted_meta: dict[str, "Demand"] | None = None) -> tuple[float, dict[str, float]]:
    parts: dict[str, float] = {}
    if survey is not None and not water_identity_ok(d, c, survey):
        return -9.0, {"water-identity": -9.0}
    # named constraints are HARD: "within sight of X" needs a real line of sight,
    # "inside / part of X" needs to be at X. (Plot review 2026-09-03, finding 1.)
    for ref in d.sightline_to:
        if ref in plotted:
            rx, rz = plotted[ref]
            if math.hypot(c.x - rx, c.z - rz) > SIGHTLINE_MAX_M:
                return -9.0, {"sightline": -9.0}
            if survey is not None and not survey.line_of_sight(c.x, c.z, rx, rz, eye_a=1.7, eye_b=8.0):
                return -9.0, {"sightline": -9.0}
            other = plotted_meta.get(ref) if plotted_meta is not None else None
            if other is not None and d.id in other.sightline_to and survey is not None \
                    and not survey.line_of_sight(rx, rz, c.x, c.z, eye_a=1.7, eye_b=8.0):
                return -9.0, {"mutual-sightline": -9.0}
            parts["sightline"] = 0.6
    if d.bound_to and d.bound_to in plotted:
        bx, bz = plotted[d.bound_to]
        if math.hypot(c.x - bx, c.z - bz) > d.bound_max:
            return -9.0, {"bound": -9.0}
        parts["bound"] = 0.8
    # "on the road" is a claim, not a wish: strictly, further than ON_ROUTE_MAX_M
    # from any route is a contradiction (owner case 2026-09-04: a gate "on the
    # one stretch of road" 400 m from the road). Relaxed stages may still take it.
    if d.hints.get("on_route") and c.route_m > (ON_ROUTE_RELAXED_M if relaxed else ON_ROUTE_MAX_M):
        return -9.0, {"on-route": -9.0}
    if d.near_point is not None:
        px_, pz_, pmax = d.near_point
        # a typed point never strands a record: the homeless batch widens the
        # radius (×2), so a too-tight maxM degrades to "near", not "nowhere"
        if relaxed:
            pmax *= NEAR_POINT_RELAX
        if math.hypot(c.x - px_, c.z - pz_) > pmax:
            return -9.0, {"nearPoint": -9.0}
        parts["nearPoint"] = 0.8
    if d.danger >= 5 and c.route_m < D5_MIN_ROUTE_M and not d.hints.get("on_route"):
        return -9.0, {"d5-route": -9.0}
    # zone (culture territory): hard unless relaxed, and never further than ZONE_SPILL_M outside
    if c.zone != d.zone:
        spill = c.zone_dist.get(d.zone, math.inf)
        if not relaxed or spill > ZONE_SPILL_M:
            return -9.0, {"zone": -9.0}
        parts["zone"] = -0.3 - 0.3 * spill / ZONE_SPILL_M
    # landform
    if c.landform in d.landforms:
        rank = d.landforms.index(c.landform)
        parts["landform"] = 1.0 - 0.12 * rank
    elif c.kind in {"free", "free-water"}:
        # a record that wants a specific landform but is offered plain ground;
        # fine-tempo places care more about being on the way than about the landform
        parts["landform"] = (0.4 if d.layer == "fine-tempo" else 0.15) if not relaxed else 0.4
    else:
        parts["landform"] = -0.4  # a wrong landform is worse than none: it reads as a mistake
    # region class: a requirement for the built classes, a preference for the rest
    if d.regions:
        if c.region in d.regions:
            parts["region"] = 0.6
        elif d.cls in HARD_REGION_CLASSES and not relax_region:
            return -9.0, {"region": -9.0}
        else:
            parts["region"] = -0.7
    # danger: hard beyond the class's tolerated gap (owner feedback: no quiet
    # villages in deep peril), soft inside it
    gap = abs(c.danger - d.danger)
    allowed = (DANGER_GAP_LIVED if d.cls in LIVED_IN_CLASSES else DANGER_GAP_OTHER) + (1 if relaxed else 0)
    if gap > allowed and not (d.tier == 0):
        return -9.0, {"danger": -9.0}
    parts["danger"] = 0.5 - 0.35 * gap
    # city rings: what belongs at a city's edge, in its hinterland, and not
    ring_gate = ring_fit(d, c, relaxed)
    if ring_gate is None:
        return -9.0, {"ring": -9.0}
    if ring_gate:
        parts["ring"] = ring_gate
    # opening ring around the start
    if c.anchor_id == OPENING_ANCHOR and d.id not in OPENING_ALLOW and not d.bound_to:
        if c.anchor_m <= OPENING_RING_A_M and d.danger >= 3:
            return -9.0, {"opening": -9.0}
        if c.anchor_m <= OPENING_RING_B_M and d.danger >= 4:
            return -9.0, {"opening": -9.0}
    # hostile clustering and purpose repetition against what is already plotted
    if plotted_meta is not None:
        hostile_near = 0
        near_total = 0
        for oid, (ox, oz) in plotted.items():
            om = plotted_meta.get(oid)
            if om is None:
                continue
            dist = math.hypot(c.x - ox, c.z - oz)
            if dist <= HOSTILE_CLUSTER_M:
                near_total += 1
                if holds_ground(d) and holds_ground(om) \
                        and (d.owner is None or d.owner != om.owner):
                    hostile_near += 1
            if om.purpose == d.purpose and oid != d.bound_to and oid not in d.parents:
                if dist <= PURPOSE_REPEAT_ANY_M:
                    parts["purpose"] = parts.get("purpose", 0.0) - 0.5
                if dist <= PURPOSE_REPEAT_ROUTE_M and c.route_m <= 300.0 and d.layer != "landmark":
                    # both on the road, same beat: -9 unless relaxed
                    if not relaxed:
                        return -9.0, {"purpose": -9.0}
                    parts["purpose"] = parts.get("purpose", 0.0) - 0.4
        if hostile_near > max(HOSTILE_CLUSTER_FLOOR, HOSTILE_CLUSTER_SHARE * near_total):
            return -9.0, {"hostile-cluster": -9.0}
    if d.danger >= 4 and c.danger <= 2:
        parts["danger"] -= 0.8
    if d.danger <= 1 and c.danger >= 4:
        parts["danger"] -= 0.8
    # route relation, by density layer and danger
    if d.hints.get("on_route"):
        parts["route"] = 0.7 * _band(c.route_m, 0, 80, 250)
    elif d.layer == "fine-tempo":
        parts["route"] = 1.0 * _band(c.route_m, 0, 260, 260)
    elif d.layer == "destination":
        parts["route"] = 0.4 * _band(c.route_m, 60, 900, 1200)
    else:  # landmark: wants to be seen, not to be on the road
        parts["route"] = 0.25 * _band(c.route_m, 150, 1400, 1500) + 0.5 * c.visibility + 0.3 * c.prominence
    if d.danger >= 4 and not d.hints.get("on_route"):
        parts["remote"] = 0.6 * min(1.0, c.route_m / 500.0)
    if d.hints.get("remote"):
        parts["remote"] = parts.get("remote", 0.0) + 0.3 * min(1.0, c.route_m / 700.0)
    if d.hints.get("concealed") or d.cls in {"lair", "camp"}:
        parts["concealment"] = 0.35 * c.concealment
    if d.hints.get("commanding"):
        parts["commanding"] = 0.4 * c.visibility + 0.2 * c.prominence
    if d.hints.get("submerged"):
        parts["submerged"] = 0.6
    if d.hints.get("navigable"):
        parts["navigable"] = 0.4 * c.water_relation
    if d.hints.get("above_flood"):
        parts["above_flood"] = 0.3 if c.landform in {"flood-high", "ridge-end", "cliff-bench", "summit", "saddle", "any-firm-ground"} else -0.2
    # parents already on the map: be near them, not on top of them
    near = [math.hypot(c.x - plotted[p][0], c.z - plotted[p][1]) for p in d.parents if p in plotted]
    if near:
        dmin = min(near)
        if d.hints.get("inside_parent"):
            parts["parent"] = 0.8 * _band(dmin, 0, 260, 400)
        elif d.hints.get("within_km"):
            parts["parent"] = 0.6 * _band(dmin, 150, d.hints["within_km"] * 1000.0, 600)
        else:
            parts["parent"] = 0.5 * _band(dmin, 150, 1600, 1800)
    # civilisation gradient: settled-band fill clusters on hinterlands, deep-band stays sparse
    if d.tier >= 2 and d.danger <= 3:
        parts["hinterland"] = 0.6 * _band(c.anchor_m, 0, 1200, 1800)
    # water for water-bound classes / region wishes
    if d.regions & (WATER_REGIONS | {"tidal delta", "coastal lagoon & salt marsh", "mangrove forest"}):
        parts["water"] = 0.3 * c.water_relation
    parts["tie"] = 0.02 * _hash01(d.id, c.id)
    return sum(parts.values()), parts


def related_pair(d: Demand, od: Demand) -> bool:
    """A relationship between two records is SYMMETRIC: if a hist is bound to
    its city, the city is related to its hist. The gate used to read the
    relationship only from the record being placed, so which of the pair the
    solver happened to reach first changed the answer."""
    return (od.id in d.parents or d.id in od.parents
            or od.id in d.sightline_to or d.id in od.sightline_to
            or od.id == d.bound_to or d.id == od.bound_to)


def abuts(d: Demand, od: Demand) -> bool:
    """May these two share ground rather than clear each other's footprint?

    Two authored reasons, both typed, neither guessed from prose:
    * `bound_to` — "inside / part of / at the edge of X" (or a satellite named
      for X). The record is sited WITHIN the other's ground by definition, so
      demanding the sum of the two radii would push a city's own quarter off
      its own city.
    * `proximity.mayAbut` — the type recipe naming the classes it attaches to
      ("attached to a living settlement", "beneath or beside an Ayleid ruin").

    An abutting pair clears only the SMALLER of the two footprints — they are
    still two distinct dots, but the small one sits inside the big one's
    ground, which is what "inside the city" means. (The brief proposed the
    larger radius; measured, that is infeasible: it puts a satellite at or
    beyond the city rim while `boundTo.maxM` (250 m) and the type's own
    `maxFromM` (250 m) require it closer than a 265 m city radius, so 24
    tier-0 satellites went homeless. Smaller radius, same intent.)

    Everything else clears the SUM: an unrelated lighthouse 38 m off a city
    still fails, which is the point of the rule."""
    if d.bound_to == od.id or od.bound_to == d.id:
        return True
    return d.may_abut(od.cls) or od.may_abut(d.cls)


def holds_ground(d: Demand) -> bool:
    """A hostile CLAIMANT: hostile baseline, plus somebody there to hold it.

    See HOSTILE_CLUSTER_M. Occupants or a named `hostility.owner` is what makes
    a hostile place a territory another hostile place can be crowded by."""
    return d.stance == "hostile" and bool(d.owner or (d.record.get("occupants") or []))


def out_of_sight_binds(d: Demand, od: Demand, dist: float) -> bool:
    """Does `d`'s (or `od`'s) `outOfSightOf` rule bind against THIS pair?

    Both authored `outOfSightOf` rows name the neighbour they are hiding from
    in the same breath as the neighbour they belong to — "a short walk from a
    village, out of ITS sight"; "beside a pass, out of sight of ITS post" —
    and both carry the paired `maxFromM` that says how far that neighbour is.
    Judging the rule against every settlement in the province instead read the
    prose as "out of sight of everything", and it is not a small difference:
    `dream-wallow-sap-pool` went homeless on line of sight to settlements
    1.3 km away, in a marsh whose own repetition rule is 300 m because
    "sightlines are short". The rule binds within the relationship's own
    range and says nothing outside it.

    A future `outOfSightOf` written without a `maxFromM` for that class has no
    authored range, so it falls back to the widest one in the catalogue.
    """
    for owner, other in ((d, od), (od, d)):
        if other.cls not in set(owner.proximity.get("outOfSightOf") or ()):
            continue
        reach = (owner.proximity.get("maxFromM") or {}).get(other.cls)
        if dist <= float(reach if reach is not None else OUT_OF_SIGHT_DEFAULT_M):
            return True
    return False


def effort_metric(s: "ProvinceSurvey | None"):
    """The survey's cached Tobler effort metric (see `worldgen.travel_cost`).

    Isolation floors are judged in EQUIVALENT FLAT METRES, not plan metres:
    the type prose they come from says the effort-to-reach IS the design.
    Without a survey there is no terrain, so the gates fall back to plan
    distance — that is what the pure-unit tests exercise."""
    if s is None or getattr(s, "height_grid", None) is None:
        return None
    m = getattr(s, "_effort_metric", None)
    if m is None:
        from . import travel_cost
        m = travel_cost.EffortMetric(s)
        s._effort_metric = m
    return m


def isolation_distance(metric, c_x: float, c_z: float, o_x: float, o_z: float,
                       plan: float, floor: float) -> float:
    """Distance an isolation floor is judged on: effort, short-circuited."""
    from . import travel_cost
    return travel_cost.effort_or_plan(metric, c_x, c_z, o_x, o_z, plan, floor)


def separation_ok(d: Demand, c: Candidate, plotted_d: dict[str, tuple[Demand, Candidate]],
                  factor: float = 1.0, s: "ProvinceSurvey | None" = None
                  ) -> tuple[bool, str | None]:
    """Protect physical footprints, typed proximity semantics and authored
    repetition rules — not evenness.

    The former general 100–800 m hard floor necessarily produced regular
    spacing. Density now comes from `thomas_prior_score`; this predicate keeps
    only relationships that mean something in the authored world:

    * **footprints** (2026-09-09): a place occupies ground, so two dots must be
      at least the SUM of their two `footprintRadiusM` apart. A related pair
      whose type declares `proximity.mayAbut` for the other's class shares
      ground instead, and takes the MAX — that is how a city's own hist sits
      inside the city while an unrelated lighthouse 38 m off still fails.
    * **typed proximity**: `proximity.minFromClassM` / `maxFromM` /
      `outOfSightOf`, read from the type's own `neighbourRelation` prose. These
      used to be prose the solver never read; they are hard gates now.
      `minFromClassM` is judged in EQUIVALENT FLAT METRES of walking (Tobler
      travel cost) rather than plan metres — see `worldgen.travel_cost`. On
      flat ground the two are identical, so the authored floors keep their
      calibration; a rim face costs what it costs to climb.
    * **authored repetition**: same type / same type on one road.

    Only the repetition rules relax; footprints and proximity never do.
    """
    prox = d.proximity
    min_from = prox.get("minFromClassM") or {}
    max_from = prox.get("maxFromM") or {}
    out_of_sight = set(prox.get("outOfSightOf") or ())
    nearest_by_class: dict[str, float] = {}
    metric = effort_metric(s)

    for oid, (od, oc) in plotted_d.items():
        dist = math.hypot(c.x - oc.x, c.z - oc.z)
        related = related_pair(d, od)
        # Every map dot represents a distinct footprint.
        if related and abuts(d, od):
            physical_need = max(COLLISION_MIN_M, min(d.footprint_m, od.footprint_m))
        else:
            physical_need = max(COLLISION_MIN_M, d.footprint_m + od.footprint_m)
        semantic_need = 0.0
        if not related:
            if od.type == d.type:
                semantic_need = (SAME_TYPE_LANDMARK_MIN_M
                                 if d.layer == "landmark" and od.layer == "landmark"
                                 else SAME_TYPE_MIN_M)
                if c.route_m <= 300.0 and oc.route_m <= 300.0:
                    semantic_need = max(semantic_need, ROUTE_REPEAT_MIN_M)
        # Relaxation applies only to authored repetition. Distinct footprints
        # and related dots retain their physical clearance at every stage.
        need = max(physical_need, semantic_need * factor)
        if dist < need:
            return False, oid
        # Typed proximity, judged against everything already on the map — in
        # BOTH directions. A hermitage's 800 m floor is a property of the pair,
        # so a village plotted later may not walk into it either.
        if not related:
            o_prox = od.proximity
            floor = max(min_from.get(od.cls) or 0.0,
                        (o_prox.get("minFromClassM") or {}).get(d.cls) or 0.0)
            if floor and isolation_distance(metric, c.x, c.z, oc.x, oc.z, dist, floor) < floor:
                return False, oid
            if s is not None and out_of_sight_binds(d, od, dist) \
                    and s.line_of_sight(c.x, c.z, oc.x, oc.z):
                return False, oid
        if od.cls in max_from:
            nearest_by_class[od.cls] = min(nearest_by_class.get(od.cls, float("inf")), dist)

    # `route` is a pseudo-class: distance to the nearest route line, measured
    # on the candidate itself.
    if "route" in min_from and c.route_m < min_from["route"]:
        return False, "route"
    if "route" in max_from and c.route_m > max_from["route"]:
        return False, "route"
    # A ceiling can only be judged against records that are already plotted.
    # If nothing of that class is on the map yet the constraint is not
    # violated — it is unjudgeable, and `report_proximity` re-checks every
    # ceiling against the finished plot so an unjudged one cannot hide.
    for cls, limit in max_from.items():
        if cls == "route":
            continue
        near = nearest_by_class.get(cls)
        if near is not None and near > limit:
            return False, f"max-from:{cls}"
    return True, None


# --------------------------------------------------------------------------- #
# assignment
# --------------------------------------------------------------------------- #
def pinned_candidate(s: ProvinceSurvey, rid: str, x: float, z: float) -> Candidate:
    """A Part 6 siting, measured off the survey at the pinned point (the plot
    facts are real even though the choice was made by hand)."""
    row, col = s.grid_px(x, z)
    anchors = s.anchor_points_m
    wm = float(s.dist_to_water_m[row, col])
    candidate = Candidate(
        id=f"pinned.{rid.rsplit('.', 1)[-1]}", kind="pinned", landform="pinned (Part 6 meso siting)", x=x, z=z,
        region=REGION_CLASSES[int(s.region_grid[row, col])][0], danger=int(s.danger[row, col]),
        zone=s.culture_names.get(int(s.culture[row, col])),
        route_m=float(s.dist_to_route_m[row, col]), water_m=wm, depth_m=0.0,
        slope=float(s.slope_grid[row, col]), prominence=0.0, visibility=0.0, concealment=0.0,
        water_relation=max(0.0, 1.0 - wm / 300.0),
        anchor_m=min(math.hypot(x - ax, z - az) for ax, az in anchors.values()),
        anchor_id=min(anchors, key=lambda k: math.hypot(x - anchors[k][0], z - anchors[k][1])))
    measure_candidate_water(s, candidate)
    return candidate


# --------------------------------------------------------------------------- #
# the committed plot as the SEED of the solve (2026-09-07)
# --------------------------------------------------------------------------- #
# The scorer is globally sensitive to its input rasters: a small, legitimate
# terrain edit (river channels carved to their water profile, 2026-09-07)
# moved 342 of 579 records in a from-scratch solve. Phase 11 blueprints,
# routes and quests are built on the COMMITTED plot, and decision 0041
# reserves a re-plot for a deliberate owner-approved step. So the committed
# position is the seed: every record keeps it unless its cell is no longer
# VALID under the current fields, and only the invalid ones are re-sited.
# `--resolve-all` restores the from-scratch solve for that owner step.
COMMITTED_SEED_KIND = "committed"
SUBMERGED_MIN_DEPTH_M = 0.8      # physical identity: no relaxation stage may
                                 # turn a submerged place into a shallow one
# Standing water a DRY record tolerates at its own dot. Measured at the dot,
# not over a reach: a marsh village is meant to have water beside it, but a
# metre of it on the dot means the dot is now channel, not bank.
OPEN_WATER_ALLOWANCE_M = 1.0
DRY_RECORD_SHORE_M = 25.0        # why_text's "at the water's edge" threshold


def _point_depth_m(s: ProvinceSurvey, x: float, z: float) -> float:
    n = s.water_depth_m.shape[0]
    px = s.extent_m / n
    return float(s.water_depth_m[min(n - 1, max(0, int(z / px))), min(n - 1, max(0, int(x / px)))])


def committed_candidate(s: ProvinceSurvey, rec: dict, x: float, z: float) -> Candidate:
    """The committed dot as a candidate. Region class, danger band, landform
    and the route/water distances are read from the record's own `plotFacts`
    (they ARE the winning candidate's facts, and the grid at the dot can
    disagree by a pixel with the scour site that won it); the water depth and
    the ground classification are re-measured off the CURRENT survey, because
    those are what a terrain edit moves."""
    rid = rec["id"]
    facts = rec.get("plotFacts") or {}
    row, col = s.grid_px(x, z)
    anchors = s.anchor_points_m
    wm = float(facts.get("distanceToWaterM", s.dist_to_water_m[row, col]))
    return Candidate(
        id=f"committed.{rid.rsplit('.', 1)[-1]}", kind=COMMITTED_SEED_KIND,
        landform=facts.get("landform") or _classify_free(s, row, col) or "off-lattice",
        x=x, z=z,
        region=facts.get("regionClass") or REGION_CLASSES[int(s.region_grid[row, col])][0],
        danger=int(facts.get("dangerBand", s.danger[row, col])),
        zone=s.culture_names.get(int(s.culture[row, col])),
        route_m=float(facts.get("distanceToRouteM", s.dist_to_route_m[row, col])),
        water_m=wm, depth_m=0.0,
        slope=float(s.slope_grid[row, col]), prominence=0.0, visibility=0.0, concealment=0.0,
        water_relation=max(0.0, 1.0 - wm / 300.0),
        anchor_m=min(math.hypot(x - ax, z - az) for ax, az in anchors.values()),
        anchor_id=min(anchors, key=lambda k: math.hypot(x - anchors[k][0], z - anchors[k][1])))


def _raster_still_reads(grid, row: int, col: int, value) -> bool:
    """True when `value` is still what the raster says at (row, col) or in its
    immediate neighbourhood — the tolerance that separates a raster EDIT from a
    one-pixel disagreement between a scour site and the survey grid."""
    r0, r1 = max(0, row - 1), min(grid.shape[0], row + 2)
    c0, c1 = max(0, col - 1), min(grid.shape[1], col + 2)
    return bool((grid[r0:r1, c0:c1] == value).any())


def committed_invalid_reason(d: Demand, c: Candidate, plotted: dict[str, tuple[float, float]],
                             s: ProvinceSurvey) -> str | None:
    """Why the committed cell can no longer carry this record, or None.

    Only the HARD constraints a terrain or water edit can break:
      * water: a submerged record must still have real depth, and a dry
        record must not now stand in open water at its own dot;
      * danger band and region class, if the RASTER has moved under the dot
        (not merely disagreed by a pixel) and the new value fails the gate;
      * sightline and bind gates, re-measured against the current terrain.
    Crowding (separation, hostile clustering, purpose repetition) is not
    re-judged: those gates were satisfied when the plot was solved, and
    re-judging them against the whole committed plot would evict records the
    greedy solve legitimately placed."""
    row, col = s.grid_px(c.x, c.z)
    if d.hints.get("submerged"):
        if c.depth_m < SUBMERGED_MIN_DEPTH_M:
            return f"submerged record now in {c.depth_m:.1f} m of water"
    elif c.water_m > DRY_RECORD_SHORE_M:
        # A record the plot placed AWAY from water (its own plotFacts say so)
        # that now stands in open water has had its ground taken by a channel.
        # A record plotted at the water's edge was always wet-footed: that is
        # the committed plot's own choice, not a change, and re-judging it here
        # would re-plot the whole waterfront.
        point = _point_depth_m(s, c.x, c.z)
        if point > OPEN_WATER_ALLOWANCE_M:
            return f"dry record now stands in {point:.1f} m of open water"
    # Danger band and region class are authored rasters, and the committed
    # facts are the winning candidate's own (a scour site's cell can disagree
    # with the grid by a pixel), so the test is "did the RASTER move": the
    # recorded value must still be somewhere in the dot's 3x3 neighbourhood.
    if not _raster_still_reads(s.danger, row, col, c.danger):
        gap = abs(int(s.danger[row, col]) - d.danger)
        allowed = (DANGER_GAP_LIVED if d.cls in LIVED_IN_CLASSES else DANGER_GAP_OTHER) + 1
        if gap > allowed and d.tier != 0:
            return f"danger band moved to {int(s.danger[row, col])}, {gap} off the record's D{d.danger}"
    if d.regions and d.cls in HARD_REGION_CLASSES \
            and not _raster_still_reads(s.region_grid, row, col, REGION_NAME_TO_ID.get(c.region, -1)):
        now_region = REGION_CLASSES[int(s.region_grid[row, col])][0]
        if now_region not in d.regions:
            return f"region class moved {c.region} -> {now_region}, outside {sorted(d.regions)}"
    # Sightlines: only the TERRAIN test. The distance test and the bind
    # (`bound_to`) distance are pure geometry between two committed dots —
    # nothing a raster edit can change — so re-judging them here would re-plot
    # records the committed solve accepted, which is `apply_sitings`' job.
    for ref in d.sightline_to:
        if ref in plotted and math.hypot(c.x - plotted[ref][0], c.z - plotted[ref][1]) <= SIGHTLINE_MAX_M:
            rx, rz = plotted[ref]
            if not s.line_of_sight(c.x, c.z, rx, rz, eye_a=1.7, eye_b=8.0):
                return f"sightline to {ref} no longer clears the terrain"
    return None


def seed_from_committed(s: ProvinceSurvey, demands: list[Demand],
                        files: dict[str, catalogue.RegionFile]) -> tuple[dict[str, dict], list[dict], list[dict]]:
    """{record id: pre-placed result} for every live record whose committed
    cell is still valid, and the list of records that must be re-sited.

    The third return value is retained as an empty compatibility field for the
    report schema; invalid committed sites are never exempted."""
    committed = {rec["id"]: rec for rf in files.values() for rec in rf.places}
    # a record pinned by a Part 6 blueprint siting is never re-judged here:
    # `pin_overrides` is the authority for those dots (owner ruling, 0041)
    pinned_ids = {o["id"] for o in load_overrides()}
    scour_depth = {c.id: c.depth_m for c in load_scour(s)}
    cands: dict[str, Candidate] = {}
    plotted: dict[str, tuple[float, float]] = {}
    for d in demands:
        pos = committed.get(d.id, {}).get("positionM")
        if isinstance(pos, list) and len(pos) == 2:
            c0 = committed_candidate(s, committed[d.id], float(pos[0]), float(pos[1]))
            # the solver's own depth for this dot: the scour site's published
            # depth, maxed with the raster (`attach_water_depth`), so the seed
            # gate judges exactly what the solve judged
            c0.depth_m = scour_depth.get(committed[d.id].get("scourSiteId", ""), 0.0)
            cands[d.id] = c0
            plotted[d.id] = (float(pos[0]), float(pos[1]))
    attach_zone_distances(s, list(cands.values()))
    attach_water_depth(s, list(cands.values()))
    seeded: dict[str, dict] = {}
    resite: list[dict] = []
    pinned: list[dict] = []
    for d in sorted(demands, key=lambda d: d.id):
        c = cands.get(d.id)
        if c is None:
            resite.append({"id": d.id, "reason": "no committed position"})
            continue
        why = None if (d.id in pinned_ids or committed.get(d.id, {}).get("plotOverride")) \
            else committed_invalid_reason(d, c, plotted, s)
        if why is not None:
            entry = {"id": d.id, "reason": why, "fromM": [round(c.x, 1), round(c.z, 1)]}
            resite.append(entry)
            continue
        c.used_by = d.id
        seeded[d.id] = {"candidate": c, "score": None, "parts": {}, "runners": [],
                        "seeded": True, "demand": d,
                        "why": committed.get(d.id, {}).get("whySiteWon", "")}
    return seeded, resite, pinned


def assign(demands: list[Demand], cands: list[Candidate], s: ProvinceSurvey,
           anchors: dict[str, tuple[float, float]],
           preplaced: dict[str, dict] | None = None,
           thomas_prior: dict[str, dict] | None = None) -> tuple[dict[str, dict], list[dict]]:
    """Tier by tier, best-pair-first. Returns {record id: assignment} and the
    homeless batch (with the reason each record could not be honestly placed)."""
    plotted_xy: dict[str, tuple[float, float]] = {}
    plotted_d: dict[str, tuple[Demand, Candidate]] = {}
    result: dict[str, dict] = {}
    by_id = {c.id: c for c in cands}
    if thomas_prior is None:
        thomas_prior = build_thomas_prior(demands, cands, DEFAULT_SEED)

    # 1. the owner-approved anchors, exactly where they are
    for d in demands:
        slug = d.id.rsplit(".", 1)[-1]
        if d.tier == 0 and slug in anchors:
            ax, az = anchors[slug]
            c = Candidate(id=f"anchor.{slug}", kind="anchor", landform="anchor", x=ax, z=az,
                          region=REGION_CLASSES[int(s.region_grid[s.grid_px(ax, az)])][0],
                          danger=int(s.danger[s.grid_px(ax, az)]), zone=d.zone,
                          route_m=0.0, water_m=0.0, depth_m=0.0, slope=0.0, prominence=0.0,
                          visibility=0.0, concealment=0.0, water_relation=1.0, anchor_m=0.0)
            measure_candidate_water(s, c)
            plotted_xy[d.id] = (ax, az)
            plotted_d[d.id] = (d, c)
            result[d.id] = {"candidate": c, "score": None, "parts": {}, "runners": [],
                            "why": f"Owner-approved settlement anchor '{slug}' (world/sources/anchors, Phase 2 gate); position kept exactly."}

    # 1b. the committed plot, seeded: these records are already on the map, so
    # every gate the solver judges (sightlines, binds, separation, clustering)
    # sees them, and only the re-sited records compete for ground.
    by_did_all = {d.id: d for d in demands}
    for did, entry in (preplaced or {}).items():
        if did in result or did not in by_did_all:
            continue
        c = entry["candidate"]
        result[did] = entry
        plotted_xy[did] = (c.x, c.z)
        plotted_d[did] = (by_did_all[did], c)

    homeless: list[dict] = []

    dependents: dict[str, list[Demand]] = {}
    for d in demands:
        needs_reservation = (d.near_point is not None or d.hints.get("submerged")
                             or d.hints.get("navigable") or d.id in (preplaced or {}))
        if not needs_reservation:
            continue
        for ref in set(d.sightline_to + ([d.bound_to] if d.bound_to else [])):
            dependents.setdefault(ref, []).append(d)
    dependent_ids = {d.id for rows in dependents.values() for d in rows}
    local_candidates = {}
    for d in demands:
        if d.id not in dependent_ids:
            continue
        sites = [c for c in cands if water_identity_ok(d, c, s)]
        if d.near_point is not None:
            x, z, radius = d.near_point
            sites = [c for c in sites if math.hypot(c.x - x, c.z - z)
                     <= min(radius * NEAR_POINT_RELAX, THOMAS_CHILD_RADIUS_M)]
        local_candidates[d.id] = sites
    reserved_by: dict[str, set[str]] = {}
    # An authored `sitingPrefs.scourSiteIds` is a claim on a NAMED site — the
    # strongest siting evidence a record carries short of a pin, and until
    # 2026-09-09 the plot read it nowhere at all (189 records carry one). A
    # flexible record could therefore take the one ridge a hermitage was
    # authored onto and push the hermitage off the map, which is what happened
    # to `rim-snowline-hermitage`: `veterans-holding`, which has its own
    # authored site and its own nearPoint, took both of the hermitage's. So a
    # named site is reserved for its claimants, exactly as a nearPoint domain
    # is; claimants themselves are never blocked, and a claim on a site the
    # scour no longer produces simply reserves nothing.
    for d in demands:
        for sid in d.scour_site_ids:
            reserved_by.setdefault(sid, set()).add(d.id)
    for d in demands:
        if d.near_point is None:
            continue
        x, z, radius = d.near_point
        for c in cands:
            if math.hypot(c.x - x, c.z - z) <= min(
                    radius * NEAR_POINT_RELAX, THOMAS_CHILD_RADIUS_M) \
                    and water_identity_ok(d, c, s):
                reserved_by.setdefault(c.id, set()).add(d.id)

    def _refs_of(rid: str) -> list[str]:
        o = by_did.get(rid)
        return (list(o.sightline_to) + ([o.bound_to] if o.bound_to else [])) if o else []

    def run_tier(pool: list[Demand], relaxed: bool, sep_factor: float, min_score: float,
                 relax_region: bool = False, final: bool = False) -> list[Demand]:
        """Best pair first. A record that names another (sightline / bound)
        waits until the named record is on the map, so its gate can be judged:
        rounds repeat until nothing more can be placed."""
        pool_ids = {d.id for d in pool}
        done: set[str] = set()
        best_by_d: dict[str, list] = {}
        # One pass normally empties the pool.  Dependency placements may end a
        # pass early so newly unlocked local children can compete; the pool
        # size is a deterministic upper bound on those recomputations.
        for _round in range(len(pool) + 1):
            pairs = []
            for d in pool:
                if d.id in done:
                    continue
                refs = list(d.sightline_to) + ([d.bound_to] if d.bound_to else [])
                # wait for the named record — unless it names us back (a mutual
                # sightline pair): then the first by id goes first and the second
                # is gated against it
                # ...and a named record that fell into the homeless batch is
                # waited for too (2026-09-04: the Vellum Estate went homeless and
                # its survey was plotted 2 km away before it existed). Relaxation
                # cannot erase a hard relationship to an unresolved reference.
                if any(r in by_did and r not in plotted_xy
                       and not (d.id in _refs_of(r) and d.id < r) for r in refs):
                    continue
                meta = {oid: od for oid, (od, _oc) in plotted_d.items()}
                for c in cands:
                    if c.used_by:
                        continue
                    owners = reserved_by.get(c.id, set())
                    if d.id not in owners and any(owner not in result and owner not in done
                                                  for owner in owners):
                        continue
                    if not reference_supports_local_dependents(
                            d.id, c, dependents, relaxed, s, local_candidates, plotted_xy):
                        continue
                    sc, parts = score_pair(d, c, plotted_xy, relaxed, s, relax_region, meta)
                    cluster_score = thomas_prior_score(d, c, thomas_prior, relaxed, plotted_xy)
                    if cluster_score is None:
                        continue
                    parts["culture-clump"] = cluster_score
                    sc += cluster_score
                    if sc >= min_score:
                        pairs.append((sc, d.id, c.id, parts))
            if not pairs:
                break
            # Give genuinely scarce domains first refusal so flexible records
            # cannot consume their few valid cells. This is deterministic
            # minimum-remaining-values ordering; score orders equal domains.
            domain_size: dict[str, int] = {}
            for _score, demand_id, _candidate_id, _parts in pairs:
                domain_size[demand_id] = domain_size.get(demand_id, 0) + 1
            pairs.sort(key=lambda p: (
                0 if has_resolved_locality(by_did[p[1]], plotted_xy) else 1,
                domain_size[p[1]], -p[0], p[1], p[2]))
            placed_this_round = _take(pairs, pool, done, best_by_d, relaxed, sep_factor)
            if not placed_this_round:
                break
        return [d for d in pool if d.id not in done]

    def _take(pairs, pool, done, best_by_d, relaxed, sep_factor) -> int:
        placed = 0
        unlocks_locality = {d.bound_to for d in pool if d.id not in done and d.bound_to}
        for sc, did, cid, parts in pairs:
            d = next(x for x in pool if x.id == did)
            c = by_id[cid]
            best_by_d.setdefault(did, [])
            if did in done:
                if len(best_by_d[did]) < 3:
                    best_by_d[did].append((cid, sc, "lost on score"))
                continue
            if c.used_by:
                if len(best_by_d[did]) < 3:
                    best_by_d[did].append((cid, sc, f"taken by {c.used_by}"))
                continue
            ok, blocker = separation_ok(d, c, plotted_d, sep_factor, s)
            if not ok:
                if len(best_by_d[did]) < 3:
                    best_by_d[did].append((cid, sc, f"too close to {blocker}"))
                continue
            c.used_by = did
            done.add(did)
            placed += 1
            plotted_xy[did] = (c.x, c.z)
            plotted_d[did] = (d, c)
            result[did] = {"candidate": c, "score": sc, "parts": parts,
                           "runners": best_by_d[did], "relaxed": relaxed}
            # Recompute immediately when this placement reveals the centre of
            # a bound child's small feasible domain.  Consuming the rest of a
            # round first lets flexible peers fill that locality before the
            # child is even eligible to compete.
            if did in unlocks_locality:
                break
        return placed

    # a record that names another is plotted no earlier than the named record,
    # whatever its own tier, so the sightline/bound gate can always be judged
    by_did = {d.id: d for d in demands}
    eff_tier = {d.id: d.tier for d in demands}
    for _ in range(5):
        for d in demands:
            for ref in list(d.sightline_to) + ([d.bound_to] if d.bound_to else []):
                if ref in eff_tier and eff_tier[ref] > eff_tier[d.id]:
                    eff_tier[d.id] = eff_tier[ref]
                elif d.bound_to == ref and (d.hints.get("submerged") or d.hints.get("navigable")) \
                        and ref in eff_tier and eff_tier[ref] < eff_tier[d.id]:
                    # A water-bound child has a small physical domain around
                    # its parent. Solve it in the parent's tier so intervening
                    # flexible tiers cannot consume that waterfront.
                    eff_tier[d.id] = eff_tier[ref]
    for tier in range(0, 5):
        pool = [d for d in demands if eff_tier[d.id] == tier and d.id not in result]
        left = run_tier(pool, relaxed=False, sep_factor=1.0, min_score=ACCEPT_SCORE)
        for d in left:
            homeless.append({"id": d.id, "tier": tier, "stage": "strict"})

    # 2. the homeless batch, reconsidered as a whole with honest relaxations
    # (name, zone relaxed, spacing factor, score bar, region wish relaxed) — the
    # region wish of a settlement is the LAST thing to give, after zone and spacing
    stages = [("relaxed-score", False, 1.0, RELAXED_SCORE, False),
              ("neighbour-zone", True, 1.0, RELAXED_SCORE, False),
              ("spacing-3/4", True, 0.75, RELAXED_SCORE, False),
              ("spacing-1/2", True, 0.5, RELAXED_SCORE, False),
              ("region-relaxed", True, 0.75, RELAXED_SCORE, True),
              # The matrix had a hole: no stage relaxed BOTH the repetition
              # spacing and the region wish, so a record whose only free ground
              # was off-region and near a same-type neighbour had nowhere to go
              # even though a valid cell existed (found 2026-09-09 by the
              # whyHomeless diagnostic: "would have fitted", 65 cells).
              # `sep_factor` never touches the footprint or proximity gates.
              ("spacing-1/2-region-relaxed", True, 0.5, RELAXED_SCORE, True)]
    for si, (name, relaxed, factor, min_score, relax_region) in enumerate(stages):
        pool = [d for d in demands if d.id not in result]
        if not pool:
            break
        left = run_tier(pool, relaxed=relaxed, sep_factor=factor, min_score=min_score, relax_region=relax_region,
                        final=(si == len(stages) - 1))
        placed = {d.id for d in pool} - {d.id for d in left}
        for h in homeless:
            if h["id"] in placed:
                h["resolvedAt"] = name
    # 3. EVICTION REPAIR (2026-09-09). The stages above are greedy and never
    # take a site back, so a record can be homeless purely because a more
    # flexible peer reached its one good cell first. Once footprints make sites
    # genuinely contested that stops being rare. For each record still
    # homeless, in id order: find a plotted, movable, unreferenced record whose
    # site this record can honestly use, move it in, and re-place the evicted
    # record anywhere still valid. Rolled back unless BOTH succeed, so it can
    # only ever reduce the homeless batch, and every gate is still judged.
    def _free_site(rid: str) -> tuple[Candidate, dict]:
        entry = result.pop(rid)
        plotted_xy.pop(rid, None)
        plotted_d.pop(rid, None)
        entry["candidate"].used_by = None
        return entry["candidate"], entry

    def _place(d: Demand, c: Candidate, sc: float, parts: dict, note: str) -> None:
        c.used_by = d.id
        plotted_xy[d.id] = (c.x, c.z)
        plotted_d[d.id] = (d, c)
        result[d.id] = {"candidate": c, "score": sc, "parts": parts,
                        "runners": [], "relaxed": True, "repair": note}

    def _best_free(d: Demand) -> tuple[float, Candidate, dict] | None:
        meta_now = {oid: od for oid, (od, _oc) in plotted_d.items()}
        best = None
        for c in cands:
            if c.used_by or not water_identity_ok(d, c, s):
                continue
            sc, parts = score_pair(d, c, plotted_xy, True, s, True, meta_now)
            cluster = thomas_prior_score(d, c, thomas_prior, True, plotted_xy)
            if cluster is None or sc + cluster < RELAXED_SCORE:
                continue
            if not separation_ok(d, c, plotted_d, 0.5, s)[0]:
                continue
            key = (sc + cluster, c.id)
            if best is None or key > (best[0], best[1].id):
                best = (sc + cluster, c, parts)
        return best

    referenced_ids = {ref for d in demands
                      for ref in d.sightline_to + ([d.bound_to] if d.bound_to else [])}

    # A `maxFromM` ceiling is satisfied by whichever record of that class is
    # NEAREST, so moving a record can break the ceiling of a third record that
    # neither repair ever looked at — a dig that needs a ruin within 500 m
    # loses its ruin when the ruin is re-sited. Both repairs therefore ask, of
    # every record that was relying on the mover, whether something of the
    # class is still inside its ceiling; a move that strands one is rolled
    # back like any other failed move.
    def _ceiling_dependents(od: Demand, at: Candidate) -> list[tuple[str, float]]:
        out = []
        for rid, (m, oc) in plotted_d.items():
            if rid == od.id:
                continue
            limit = (m.proximity.get("maxFromM") or {}).get(od.cls)
            if limit is not None and math.hypot(oc.x - at.x, oc.z - at.z) <= float(limit):
                out.append((rid, float(limit)))
        return out

    def _ceilings_hold(deps: list[tuple[str, float]], cls: str) -> bool:
        for rid, limit in deps:
            entry = plotted_d.get(rid)
            if entry is None:
                continue
            _m, oc = entry
            if not any(m2.cls == cls and rid2 != rid
                       and math.hypot(oc.x - oc2.x, oc.z - oc2.z) <= limit
                       for rid2, (m2, oc2) in plotted_d.items()):
                return False
        return True
    # Repeated: freeing one site can unblock the next record, so the pass
    # runs until it stops helping (bounded, deterministic).
    for _repair_pass in range(8):
        if all(h["id"] in result for h in homeless):
            break
        for h in sorted(homeless, key=lambda h: h["id"]):
            if h["id"] in result:
                continue
            d = by_did[h["id"]]
            meta_now = {oid: od for oid, (od, _oc) in plotted_d.items()}
            options = []
            for c in cands:
                holder = c.used_by
                if holder is None or holder in referenced_ids:
                    continue
                od = by_did.get(holder)
                entry = result.get(holder)
                if od is None or entry is None or od.tier == 0 or od.bound_to or od.sightline_to:
                    continue
                if entry["candidate"].kind in ("anchor", "pinned", COMMITTED_SEED_KIND):
                    continue
                if not water_identity_ok(d, c, s):
                    continue
                sc, parts = score_pair(d, c, plotted_xy, True, s, True, meta_now)
                cluster = thomas_prior_score(d, c, thomas_prior, True, plotted_xy)
                if cluster is None or sc + cluster < RELAXED_SCORE:
                    continue
                options.append((sc + cluster, c.id, c, parts, holder))
            options.sort(key=lambda o: (-o[0], o[1]))
            for total, _cid, c, parts, holder in options:
                evicted_c, evicted_entry = _free_site(holder)
                if not separation_ok(d, c, plotted_d, 0.5, s)[0]:
                    _place(by_did[holder], evicted_c, evicted_entry.get("score"),
                           evicted_entry.get("parts") or {}, "")
                    result[holder] = evicted_entry
                    continue
                _place(d, c, total, parts, f"took the site of {holder}")
                moved = _best_free(by_did[holder])
                if moved is None:                       # roll back: nobody is evicted for nothing
                    _free_site(d.id)
                    _place(by_did[holder], evicted_c, evicted_entry.get("score"),
                           evicted_entry.get("parts") or {}, "")
                    result[holder] = evicted_entry
                    continue
                msc, mc, mparts = moved
                deps = _ceiling_dependents(by_did[holder], evicted_c)
                _place(by_did[holder], mc, msc, mparts, f"re-sited so {d.id} could take its site")
                if not _ceilings_hold(deps, by_did[holder].cls):
                    _free_site(holder)
                    _free_site(d.id)
                    _place(by_did[holder], evicted_c, evicted_entry.get("score"),
                           evicted_entry.get("parts") or {}, "")
                    result[holder] = evicted_entry
                    continue
                h["resolvedAt"] = "eviction-repair"
                break
            if h["id"] in result:
                continue
            # 3b. NEIGHBOUR REPAIR (2026-09-09). The pass above only reclaims a
            # site somebody is standing ON. Once footprints are hard gates the
            # commoner case is a FREE cell that one movable neighbour's
            # clearance reaches into — the last records out of the plot each
            # had twenty or thirty cells failing on separation alone. Same
            # bargain: move the one neighbour, take the cell, roll back unless
            # both land honestly, and judge every gate at each step.
            options = []
            for c in cands:
                if c.used_by or not water_identity_ok(d, c, s):
                    continue
                sc, parts = score_pair(d, c, plotted_xy, True, s, True, meta_now)
                cluster = thomas_prior_score(d, c, thomas_prior, True, plotted_xy)
                if cluster is None or sc + cluster < RELAXED_SCORE:
                    continue
                ok, blocker = separation_ok(d, c, plotted_d, 0.5, s)
                if ok or blocker not in plotted_d or blocker in referenced_ids:
                    continue
                od = by_did.get(blocker)
                entry = result.get(blocker)
                if od is None or entry is None or od.tier == 0 or od.bound_to or od.sightline_to:
                    continue
                if entry["candidate"].kind in ("anchor", "pinned", COMMITTED_SEED_KIND):
                    continue
                options.append((sc + cluster, c.id, c, parts, blocker))
            options.sort(key=lambda o: (-o[0], o[1]))
            for total, _cid, c, parts, blocker in options:
                evicted_c, evicted_entry = _free_site(blocker)
                if not separation_ok(d, c, plotted_d, 0.5, s)[0]:
                    _place(by_did[blocker], evicted_c, evicted_entry.get("score"),
                           evicted_entry.get("parts") or {}, "")
                    result[blocker] = evicted_entry
                    continue
                _place(d, c, total, parts, f"neighbour {blocker} re-sited to clear this ground")
                moved = _best_free(by_did[blocker])
                if moved is None:
                    _free_site(d.id)
                    _place(by_did[blocker], evicted_c, evicted_entry.get("score"),
                           evicted_entry.get("parts") or {}, "")
                    result[blocker] = evicted_entry
                    continue
                msc, mc, mparts = moved
                deps = _ceiling_dependents(by_did[blocker], evicted_c)
                _place(by_did[blocker], mc, msc, mparts, f"re-sited to clear ground for {d.id}")
                if not _ceilings_hold(deps, by_did[blocker].cls):
                    _free_site(blocker)
                    _free_site(d.id)
                    _place(by_did[blocker], evicted_c, evicted_entry.get("score"),
                           evicted_entry.get("parts") or {}, "")
                    result[blocker] = evicted_entry
                    continue
                h["resolvedAt"] = "neighbour-repair"
                break

    for h in homeless:
        if h["id"] in result:
            result[h["id"]]["homelessStage"] = h.get("resolvedAt")
    unresolved = [h for h in homeless if h["id"] not in result]
    # WHY it failed, not just that it did (2026-09-09): re-walk every candidate
    # under the loosest stage and judge EVERY gate independently, so a homeless
    # record names the constraint to argue with. A first-gate-wins tally lies
    # here: it reports whichever gate happens to be tested first (the culture
    # prior rejects thousands of cells for every record, homeless or not), and
    # hides the gate that is actually the last one standing. What resolves a
    # record is `soleBlocker`: candidates that fail exactly ONE gate. Fix that
    # gate and those cells become sitable; a record with no sole blocker
    # anywhere is one the province has no ground for.
    diag_meta = {oid: od for oid, (od, _oc) in plotted_d.items()}
    for h in unresolved:
        d = by_did[h["id"]]
        why: dict[str, int] = {}
        sole: dict[str, int] = {}
        blockers: dict[str, int] = {}
        for c in cands:
            sc, _parts = score_pair(d, c, plotted_xy, True, s, True, diag_meta)
            cluster = thomas_prior_score(d, c, thomas_prior, True, plotted_xy)
            sep_ok, blocker = separation_ok(d, c, plotted_d, 0.5, s)
            failed = []
            if c.used_by:
                failed.append("site taken")
            if not water_identity_ok(d, c, s):
                failed.append("water identity")
            if cluster is None:
                failed.append("culture clump")
            elif sc + cluster < RELAXED_SCORE:
                failed.append("score below the honest bar")
            if not sep_ok:
                failed.append("separation")
                blockers[str(blocker)] = blockers.get(str(blocker), 0) + 1
            for g in failed:
                why[g] = why.get(g, 0) + 1
            if not failed:
                why["would have fitted"] = why.get("would have fitted", 0) + 1
            elif len(failed) == 1:
                sole[failed[0]] = sole.get(failed[0], 0) + 1
        h["whyHomeless"] = dict(sorted(why.items(), key=lambda kv: -kv[1]))
        h["soleBlocker"] = dict(sorted(sole.items(), key=lambda kv: -kv[1]))
        h["separationBlockers"] = dict(sorted(blockers.items(), key=lambda kv: -kv[1])[:5])
    return result, unresolved


def plotted_meta_of(result: dict[str, dict]) -> dict[str, Demand]:
    return {rid: r["demand"] for rid, r in result.items() if "demand" in r}


def swap_pass(demands: list[Demand], result: dict[str, dict], meta: dict[str, Demand],
              s: ProvinceSurvey, thomas_prior: dict[str, dict]) -> int:
    """Anti-greedy improvement: for the worst-fitting quarter of plotted
    records, try exchanging sites with nearby records of the same zone; keep a
    swap when both gates still pass and the summed score rises by
    SWAP_MIN_GAIN. Deterministic (ordered by score then id), bounded by
    SWAP_CANDIDATES partners per record, one sweep."""
    by_d = {d.id: d for d in demands}
    for rid, r in result.items():
        r.setdefault("demand", by_d[rid])
    referenced = {ref for d in demands for ref in d.sightline_to + ([d.bound_to] if d.bound_to else [])}
    movable = [rid for rid, r in result.items() if r.get("score") is not None and by_d[rid].tier > 0
               and r["candidate"].kind not in ("anchor", "pinned", COMMITTED_SEED_KIND)
               and not r.get("seeded")
               and rid not in referenced
               and not by_d[rid].bound_to and not by_d[rid].sightline_to]
    movable.sort(key=lambda rid: (result[rid]["score"], rid))
    worst = movable[: max(1, len(movable) // 4)]
    xy = {rid: (r["candidate"].x, r["candidate"].z) for rid, r in result.items()}
    swaps = 0
    for a in worst:
        da, ca = by_d[a], result[a]["candidate"]
        partners = sorted((b for b in movable if b != a and by_d[b].zone == da.zone
                           and not by_d[b].sightline_to and not by_d[b].bound_to),
                          key=lambda b: (math.hypot(xy[b][0] - xy[a][0], xy[b][1] - xy[a][1]), b))[:SWAP_CANDIDATES]
        best = None
        for b in partners:
            db, cb = by_d[b], result[b]["candidate"]
            others = {k: v for k, v in xy.items() if k not in (a, b)}
            meta_o = {k: v for k, v in meta.items() if k not in (a, b)}
            sa, pa = score_pair(da, cb, others, True, s, True, meta_o)
            sb, pb = score_pair(db, ca, others, True, s, True, meta_o)
            ta = thomas_prior_score(da, cb, thomas_prior, True, others)
            tb = thomas_prior_score(db, ca, thomas_prior, True, others)
            if ta is None or tb is None:
                continue
            pa["culture-clump"], pb["culture-clump"] = ta, tb
            sa, sb = sa + ta, sb + tb
            if sa < RELAXED_SCORE or sb < RELAXED_SCORE:
                continue
            plotted_d = {k: (by_d[k], result[k]["candidate"])
                         for k in result if k not in (a, b)}
            if not separation_ok(da, cb, plotted_d, 1.0, s)[0] or not separation_ok(db, ca, plotted_d, 1.0, s)[0]:
                continue
            gain = (sa + sb) - (result[a]["score"] + result[b]["score"])
            if gain >= SWAP_MIN_GAIN and (best is None or gain > best[0]):
                best = (gain, b, sa, pa, sb, pb)
        if best:
            gain, b, sa, pa, sb, pb = best
            ca, cb = result[a]["candidate"], result[b]["candidate"]
            ca.used_by, cb.used_by = b, a
            result[a].update({"candidate": cb, "score": sa, "parts": pa, "swapped": f"with {b} (+{gain:.2f})"})
            result[b].update({"candidate": ca, "score": sb, "parts": pb, "swapped": f"with {a} (+{gain:.2f})"})
            xy[a], xy[b] = (cb.x, cb.z), (ca.x, ca.z)
            swaps += 1
    return swaps


# --------------------------------------------------------------------------- #
# why text and record update
# --------------------------------------------------------------------------- #
LANDFORM_WORDS = {
    "any-firm-ground": "firm ground", "any-shallow-marsh": "shallow marsh",
    "any-channel-bank": "a channel bank",
}


def why_text(d: Demand, c: Candidate, parts: dict[str, float], relaxed_stage: str | None) -> str:
    lf = LANDFORM_WORDS.get(c.landform, c.landform.replace("-", " "))
    bits = [f"{lf} in {c.region} (danger band {c.danger}), {c.route_m:.0f} m from the nearest route"]
    if c.water_m <= 25:
        bits.append("at the water's edge")
    wanted = d.landforms[0] if d.landforms else "any-firm-ground"
    if c.landform in d.landforms:
        rank = d.landforms.index(c.landform)
        bits.append("its first-choice landform" if rank == 0 else f"its choice #{rank + 1} landform")
    elif c.kind == "free":
        bits.append(f"no free '{wanted}' site was left in the zone, so plain ground")
    strong = sorted(((k, v) for k, v in parts.items() if k != "tie" and v > 0.25), key=lambda kv: -kv[1])[:3]
    if strong:
        bits.append("won on " + ", ".join(k for k, _ in strong))
    if relaxed_stage:
        bits.append(f"placed from the homeless batch at stage '{relaxed_stage}'")
    if d.landforms_from_recipe:
        bits.append("landform wishes taken from the type recipe (record had none)")
    return "; ".join(bits) + "."


def apply_to_records(files: dict[str, catalogue.RegionFile], demands: list[Demand],
                     result: dict[str, dict], s: ProvinceSurvey) -> None:
    by_d = {d.id: d for d in demands}
    for rf in files.values():
        for rec in rf.places:
            r = result.get(rec["id"])
            if not r:
                if rec.get("status") in ("deferred", "cut"):
                    # a record deferred after an earlier plot must not keep a stale dot
                    for k in ("position", "positionM", "scourSiteId", "candidatesConsidered", "whySiteWon", "plotFacts"):
                        rec.pop(k, None)
                    if rec.get("workflow") == "plotted":
                        rec["workflow"] = "derived"
                continue
            if r.get("seeded"):
                continue    # committed dot kept: the record is not rewritten
            d = by_d[rec["id"]]
            c: Candidate = r["candidate"]
            u, v = s.m_to_uv(c.x, c.z)
            rec["position"] = {"u": round(u, 5), "v": round(v, 5)}
            rec["positionM"] = [round(c.x, 1), round(c.z, 1)]
            if c.kind == "scour":
                rec["scourSiteId"] = c.id
            else:
                rec.pop("scourSiteId", None)
            rec["candidatesConsidered"] = [
                {"siteId": cid, "score": round(sc, 3), "whyLost": why} for cid, sc, why in r["runners"]]
            rec["whySiteWon"] = r["why"] if "why" in r else why_text(d, c, r["parts"], r.get("homelessStage"))
            if r.get("swapped"):
                rec["whySiteWon"] = rec["whySiteWon"][:-1] + f"; site exchanged in the swap pass {r['swapped']}."
            rec["plotFacts"] = {
                "landform": c.landform, "regionClass": c.region, "dangerBand": c.danger,
                "distanceToRouteM": round(c.route_m, 1), "distanceToWaterM": round(c.water_m, 1),
                "score": None if r["score"] is None else round(r["score"], 3),
            }
            rec["workflow"] = "plotted"
            if c.kind == "pinned":
                rec["plotOverride"] = {"source": "blueprint", "why": r["why"]}
            else:
                rec.pop("plotOverride", None)
            # sitingPrefs ordering must stay; nothing else on the record changes


def load_overrides() -> list[dict]:
    """Part 6 sitings pinned from blueprints — written by `worldgen.apply_sitings`,
    never by hand. `macro-plot-overrides.json`:
    {"overrides": [{"id": ..., "u":..., "v":..., "why": ..., "source": ...}]}."""
    if not OVERRIDES_PATH.exists():
        return []
    return json.loads(OVERRIDES_PATH.read_text()).get("overrides", [])


def pin_overrides(result: dict[str, dict], cands: list[Candidate], s: ProvinceSurvey) -> int:
    """AFTER the solve: replace each pinned record's candidate with the sited
    point. Doing it after (not as a pre-placed anchor) keeps the greedy solve
    byte-identical for every other record — pinning four records inside the
    solve moved 106 others, some by kilometres (2026-09-05). The freed site
    goes back to the pool for a future run. Anchors are never overridden."""
    n = 0
    for o in load_overrides():
        r = result.get(o["id"])
        if not r or r["candidate"].kind == "anchor" or r.get("seeded"):
            continue
        x, z = s.uv_to_m(float(o["u"]), float(o["v"]))
        r["candidate"].used_by = None
        c = pinned_candidate(s, o["id"], x, z)
        c.used_by = o["id"]
        cands.append(c)
        r["candidate"] = c
        r["score"] = None
        r["parts"] = {}
        r["why"] = f"Pinned by the Part 6 meso siting ({o.get('source', 'blueprint')}): {o.get('why', '').rstrip('.')}."
        n += 1
    return n


def preplace_overrides(demands: list[Demand], cands: list[Candidate],
                       s: ProvinceSurvey) -> dict[str, dict]:
    """Place blueprint pins before a deliberate resolve-all.

    A whole-province replot must let collision, sightline and bind constraints
    see authored fixed sitings. Seeded mode keeps its stability-preserving
    post-solve application.
    """
    live = {d.id for d in demands}
    out: dict[str, dict] = {}
    for override in load_overrides():
        rid = override["id"]
        if rid not in live:
            continue
        x, z = s.uv_to_m(float(override["u"]), float(override["v"]))
        c = pinned_candidate(s, rid, x, z)
        c.used_by = rid
        cands.append(c)
        out[rid] = {
            "candidate": c, "score": None, "parts": {}, "runners": [],
            "why": (f"Pinned by the Part 6 meso siting "
                    f"({override.get('source', 'blueprint')}): "
                    f"{override.get('why', '').rstrip('.')}."),
        }
    return out


# --------------------------------------------------------------------------- #
# report
# --------------------------------------------------------------------------- #
def route_visibility_sweep(s: ProvinceSurvey, plotted: dict[str, tuple[Demand, Candidate]],
                           step_m: float = 150.0, radius_m: float = 450.0) -> dict:
    """The two-visible rule, statically: walk every road and boat lane, count
    destination/landmark places within `radius_m` that have line of sight."""
    pts = []
    for r in s.routes:
        if r.points_m.shape[0] < 2:
            continue
        acc = 0.0
        last = r.points_m[0]
        pts.append((r.kind, r.frm, r.to, float(last[0]), float(last[1])))
        for p in r.points_m[1:]:
            seg = float(np.hypot(*(p - last)))
            acc += seg
            if acc >= step_m:
                pts.append((r.kind, r.frm, r.to, float(p[0]), float(p[1])))
                acc = 0.0
            last = p
    heavy = [(d, c) for d, c in plotted.values() if d.layer in {"destination", "landmark"}]
    xs = np.array([c.x for _d, c in heavy]) if heavy else np.zeros(0)
    zs = np.array([c.z for _d, c in heavy]) if heavy else np.zeros(0)
    counts = []
    dead = []
    crowded = []
    for kind, frm, to, x, z in pts:
        if xs.size == 0:
            counts.append(0)
            continue
        dist = np.hypot(xs - x, zs - z)
        near = np.nonzero(dist <= radius_m)[0]
        n = 0
        for i in near:
            if s.line_of_sight(x, z, float(xs[i]), float(zs[i]), eye_a=1.7, eye_b=6.0):
                n += 1
        counts.append(n)
        if n == 0:
            dead.append({"route": f"{kind}:{frm}-{to}", "worldM": [round(x), round(z)]})
        elif n >= 4:
            crowded.append({"route": f"{kind}:{frm}-{to}", "worldM": [round(x), round(z)], "visible": n})
    arr = np.array(counts) if counts else np.zeros(1)
    return {
        "routeSamples": len(pts), "stepM": step_m, "radiusM": radius_m,
        "visibleMean": round(float(arr.mean()), 2),
        "deadFraction": round(float((arr == 0).mean()), 3),
        "crowdedFraction": round(float((arr >= 4).mean()), 3),
        "deadSamples": dead[:400], "crowdedSamples": crowded[:200],
    }


def typed_siting_violations(demands: list[Demand], result: dict[str, dict],
                            s: ProvinceSurvey | None = None) -> list[dict]:
    """Re-check the footprint and proximity gates against the FINISHED plot.

    `separation_ok` judges each record against what was already on the map, so
    a ceiling whose target had not been plotted yet went unjudged and a floor
    could be crossed by a later record. This is the closing pass: every live
    pair, every gate, no ordering. It is what the tests assert on, and an
    empty list is the contract."""
    plotted = [(d, result[d.id]["candidate"]) for d in demands if d.id in result]
    out: list[dict] = []
    metric = effort_metric(s)
    for i, (d, c) in enumerate(plotted):
        min_from = d.proximity.get("minFromClassM") or {}
        max_from = d.proximity.get("maxFromM") or {}
        out_of_sight = set(d.proximity.get("outOfSightOf") or ())
        nearest: dict[str, float] = {}
        for j, (od, oc) in enumerate(plotted):
            if i == j:
                continue
            dist = math.hypot(c.x - oc.x, c.z - oc.z)
            related = related_pair(d, od)
            abut = related and abuts(d, od)
            need = (max(COLLISION_MIN_M, min(d.footprint_m, od.footprint_m)) if abut
                    else max(COLLISION_MIN_M, d.footprint_m + od.footprint_m))
            if i < j and dist < need:
                out.append({"id": d.id, "gate": "footprint", "other": od.id,
                            "distM": round(dist, 1), "needM": round(need, 1)})
            if not related:
                floor = min_from.get(od.cls) or 0.0
                effort = (isolation_distance(metric, c.x, c.z, oc.x, oc.z, dist, floor)
                          if floor else dist)
                if floor and effort < floor:
                    out.append({"id": d.id, "gate": "minFromClassM", "other": od.id,
                                "distM": round(dist, 1), "effortM": round(effort, 1),
                                "needM": floor})
                if out_of_sight and od.cls in out_of_sight and s is not None \
                        and out_of_sight_binds(d, od, dist) \
                        and s.line_of_sight(c.x, c.z, oc.x, oc.z):
                    out.append({"id": d.id, "gate": "outOfSightOf", "other": od.id,
                                "distM": round(dist, 1), "needM": None})
            if od.cls in max_from:
                nearest[od.cls] = min(nearest.get(od.cls, float("inf")), dist)
        if "route" in min_from and c.route_m < min_from["route"]:
            out.append({"id": d.id, "gate": "minFromClassM", "other": "route",
                        "distM": round(c.route_m, 1), "needM": min_from["route"]})
        for cls, limit in max_from.items():
            near = c.route_m if cls == "route" else nearest.get(cls)
            if near is None or near > limit:
                out.append({"id": d.id, "gate": "maxFromM", "other": cls,
                            "distM": None if near is None else round(near, 1), "needM": limit})
    return sorted(out, key=lambda r: (r["id"], r["gate"], str(r["other"])))


def build_report(demands: list[Demand], result: dict[str, dict], unresolved: list[dict],
                 plotted: dict[str, tuple[Demand, Candidate]], s: ProvinceSurvey, seed: int,
                 n_scour: int, n_free: int) -> dict:
    by_zone: dict[str, dict] = {}
    for d in demands:
        z = by_zone.setdefault(d.zone, {"live": 0, "plotted": 0, "homeless": 0, "fromRecipe": 0,
                                        "byLandform": {}, "byLayer": {}, "typeShare": {}})
        z["live"] += 1
        if d.landforms_from_recipe:
            z["fromRecipe"] += 1
        r = result.get(d.id)
        if r:
            z["plotted"] += 1
            lf = r["candidate"].landform
            z["byLandform"][lf] = z["byLandform"].get(lf, 0) + 1
            z["byLayer"][d.layer] = z["byLayer"].get(d.layer, 0) + 1
            z["typeShare"][d.type] = z["typeShare"].get(d.type, 0) + 1
        else:
            z["homeless"] += 1
    quota_breaches = []
    for zone, z in by_zone.items():
        for typ, n in z["typeShare"].items():
            if z["plotted"] and n / z["plotted"] > 0.25 and n >= 4:
                quota_breaches.append({"zone": zone, "type": typ, "count": n, "share": round(n / z["plotted"], 2)})
        z["typeShare"] = dict(sorted(z["typeShare"].items(), key=lambda kv: (-kv[1], kv[0]))[:6])
        z["byLandform"] = dict(sorted(z["byLandform"].items(), key=lambda kv: (-kv[1], kv[0])))

    # nearest-neighbour spacing and route distance
    ids = sorted(plotted)
    xy = np.array([[plotted[i][1].x, plotted[i][1].z] for i in ids]) if ids else np.zeros((0, 2))
    nn = []
    if len(ids) > 1:
        for i in range(len(ids)):
            dd = np.hypot(xy[:, 0] - xy[i, 0], xy[:, 1] - xy[i, 1])
            dd[i] = np.inf
            nn.append(float(dd.min()))
    nn_arr = np.array(nn) if nn else np.zeros(1)
    route_d = np.array([plotted[i][1].route_m for i in ids]) if ids else np.zeros(1)
    fine_l = [plotted[i][1].route_m for i in ids if plotted[i][0].layer == "fine-tempo"]
    fine = np.array(fine_l) if fine_l else np.zeros(1)

    same_type_pairs = []
    for i in range(len(ids)):
        for j in range(i + 1, len(ids)):
            di, dj = plotted[ids[i]][0], plotted[ids[j]][0]
            if di.type == dj.type:
                dist = float(np.hypot(*(xy[i] - xy[j])))
                if dist < SAME_TYPE_MIN_M:
                    same_type_pairs.append({"a": ids[i], "b": ids[j], "distM": round(dist)})

    stages = {}
    relaxed_records = []
    for did, r in sorted(result.items()):
        st = r.get("homelessStage")
        if st:
            stages[st] = stages.get(st, 0) + 1
            relaxed_records.append({"id": did, "stage": st, "site": r["candidate"].id})
    live_ids = {d.id for d in demands}
    all_ids = set()
    deferred_ids = set()
    for rf in catalogue.load_region_files():
        for rec in rf.places:
            all_ids.add(rec["id"])
            if rec.get("status") in {"deferred", "cut"}:
                deferred_ids.add(rec["id"])
    dangling = []
    for d in demands:
        rel = d.record.get("relations", {}) or {}
        for k in ("dependsOn", "supplies", "rivals", "patrols", "tolls", "visibleFrom", "reachedVia"):
            for ref in rel.get(k, []) or []:
                if ref in deferred_ids:
                    dangling.append({"from": d.id, "field": k, "to": ref, "why": "deferred/cut"})
                elif ref not in all_ids:
                    dangling.append({"from": d.id, "field": k, "to": ref, "why": "unknown id"})
    named_checks = []
    for d in demands:
        if d.id not in result:
            continue
        c = result[d.id]["candidate"]
        for ref in d.sightline_to:
            if ref in result:
                rc = result[ref]["candidate"]
                named_checks.append({"id": d.id, "kind": "sightline", "to": ref,
                                     "distM": round(math.hypot(c.x - rc.x, c.z - rc.z)),
                                     "lineOfSight": bool(s.line_of_sight(c.x, c.z, rc.x, rc.z, eye_a=1.7, eye_b=8.0))})
        if d.bound_to and d.bound_to in result:
            rc = result[d.bound_to]["candidate"]
            named_checks.append({"id": d.id, "kind": "bound", "to": d.bound_to,
                                 "distM": round(math.hypot(c.x - rc.x, c.z - rc.z))})

    landform_used = {}
    for r in result.values():
        lf = r["candidate"].landform
        landform_used[lf] = landform_used.get(lf, 0) + 1

    return {
        "schemaVersion": SCHEMA_VERSION, "kind": "macro-plot", "seed": seed,
        "generatedBy": "worldgen.macro_plot (Phase 11 Part 3, decision 0041)",
        "supply": {"scourSites": n_scour, "freeGroundSites": n_free},
        "demand": {"live": len(demands), "plotted": len(result), "homelessUnresolved": len(unresolved),
                   "placedFromHomelessBatch": stages},
        "byZone": dict(sorted(by_zone.items())),
        "landformUsed": dict(sorted(landform_used.items(), key=lambda kv: (-kv[1], kv[0]))),
        "spacing": {"nearestNeighbourP5M": round(float(np.percentile(nn_arr, 5))),
                    "nearestNeighbourMedianM": round(float(np.median(nn_arr))),
                    "nearestNeighbourP95M": round(float(np.percentile(nn_arr, 95))),
                    "sameTypeWithinSightPairs": same_type_pairs},
        "routeDistance": {"medianM": round(float(np.median(route_d))),
                          "fineTempoWithin300mFraction": round(float((np.asarray(fine) <= 300).mean()), 3)},
        "typedSitingViolations": typed_siting_violations(demands, result, s),
        "antiSameynessQuotaBreaches": quota_breaches,
        "relaxedRecords": relaxed_records,
        "namedConstraintChecks": named_checks,
        "danglingRelations": dangling,
        "routeVisibility": route_visibility_sweep(s, plotted),
        "homeless": unresolved,
    }


REST_STANCES = {"friendly", "sanctuary"}
REST_PURPOSES = {"safe-rest", "service-hub"}


def feedback_checks(demands: list[Demand], result: dict[str, dict], s: ProvinceSurvey) -> dict:
    """Owner-feedback round checks that are REPORTED, not gated (they need
    new records, which is the region review pass's job): rest cadence near
    delves, each city's hinterland purpose coverage, hostile counts and the
    ring mix around every city."""
    by_d = {d.id: d for d in demands}
    xy = {rid: (r["candidate"].x, r["candidate"].z) for rid, r in result.items()}
    rests = [rid for rid in xy if by_d[rid].stance in REST_STANCES or by_d[rid].purpose in REST_PURPOSES]
    gaps = []
    for rid, (x, z) in xy.items():
        d = by_d[rid]
        if d.purpose in {"dungeon-delve", "combat-challenge"} and d.danger >= 3:
            need = 1200.0 if d.danger >= 4 else 600.0
            near = min((math.hypot(x - xy[o][0], z - xy[o][1]) for o in rests if o != rid), default=1e9)
            if near > need:
                gaps.append({"id": rid, "danger": d.danger, "nearestRestM": round(near)})
    anchors = s.anchor_points_m
    cities = {}
    for aid, (ax, az) in anchors.items():
        purposes = {}
        rings = {"edge": {}, "hinterland": {}, "rural": {}}
        hostile = 0
        for rid, (x, z) in xy.items():
            dist = math.hypot(x - ax, z - az)
            d = by_d[rid]
            if dist <= 2000.0:
                purposes[d.purpose] = purposes.get(d.purpose, 0) + 1
                if d.stance == "hostile":
                    hostile += 1
            ring = "edge" if dist <= RING_EDGE_M else "hinterland" if dist <= RING_HINTERLAND_M else "rural" if dist <= 2500.0 else None
            if ring:
                rings[ring][d.cls] = rings[ring].get(d.cls, 0) + 1
        missing = sorted({"dungeon-delve", "combat-challenge", "lore-reveal", "safe-rest", "resource-source"} - set(purposes))
        cities[aid] = {"purposesWithin2km": dict(sorted(purposes.items())), "purposeCount": len(purposes),
                       "missingCorePurposes": missing, "hostileWithin2km": hostile, "rings": rings}
    stances = {}
    for rid in xy:
        stances[by_d[rid].stance] = stances.get(by_d[rid].stance, 0) + 1
    swapped = sorted(rid for rid, r in result.items() if r.get("swapped"))
    return {"restCadenceGaps": gaps, "cities": cities, "stances": stances, "swapped": swapped}


def digest(rep: dict, result: dict[str, dict], demands: list[Demand]) -> str:
    L = ["# Macro plot — coverage report (Phase 11 Part 3)", "",
         f"Seed {rep['seed']}. Supply: {rep['supply']['scourSites']} scour sites + "
         f"{rep['supply']['freeGroundSites']} free-ground points. Demand: {rep['demand']['live']} live records; "
         f"**{rep['demand']['plotted']} plotted**, {rep['demand']['homelessUnresolved']} unresolved.",
         f"Placed from the homeless batch: {rep['demand']['placedFromHomelessBatch'] or 'none'}.", "",
         "| zone | live | plotted | homeless | landform wishes from recipe | top landforms |",
         "|---|---|---|---|---|---|"]
    for zone, z in rep["byZone"].items():
        top = ", ".join(f"{k} {v}" for k, v in list(z["byLandform"].items())[:4])
        L.append(f"| {zone} | {z['live']} | {z['plotted']} | {z['homeless']} | {z['fromRecipe']} | {top} |")
    sp = rep["spacing"]
    rd = rep["routeDistance"]
    rv = rep["routeVisibility"]
    L += ["", "## Spacing and routes", "",
          f"- nearest-neighbour distance p5 / median / p95: {sp['nearestNeighbourP5M']} / "
          f"{sp['nearestNeighbourMedianM']} / {sp['nearestNeighbourP95M']} m",
          f"- same-type pairs closer than {SAME_TYPE_MIN_M:.0f} m: {len(sp['sameTypeWithinSightPairs'])}",
          f"- median distance to a route: {rd['medianM']} m; fine-tempo records within 300 m of a route: "
          f"{rd['fineTempoWithin300mFraction'] * 100:.0f} %",
          f"- route-visibility sweep ({rv['routeSamples']} samples every {rv['stepM']:.0f} m, radius {rv['radiusM']:.0f} m): "
          f"mean {rv['visibleMean']} destination/landmark places in sight; dead {rv['deadFraction'] * 100:.0f} %, "
          f"crowded (4+) {rv['crowdedFraction'] * 100:.0f} %",
          "", "## Anti-sameyness quota (no type > 25 % of a zone)", ""]
    if rep["antiSameynessQuotaBreaches"]:
        for b in rep["antiSameynessQuotaBreaches"]:
            L.append(f"- {b['zone']}: {b['type']} × {b['count']} ({b['share'] * 100:.0f} %)")
    else:
        L.append("- none")
    L += ["", "## Named constraints (sightline / bound), as plotted", "",
          "| record | kind | to | m | line of sight |", "|---|---|---|---|---|"]
    for n in rep["namedConstraintChecks"]:
        L.append(f"| `{n['id']}` | {n['kind']} | `{n['to']}` | {n['distM']} | {n.get('lineOfSight', '—')} |")
    L += ["", "## Records placed from the homeless batch", "", "| record | stage | site |", "|---|---|---|"]
    for r in rep["relaxedRecords"]:
        L.append(f"| `{r['id']}` | {r['stage']} | {r['site']} |")
    dang = rep["danglingRelations"]
    L += ["", f"## Dangling relations: {len(dang)} edges point at deferred/cut/unknown records", "",
          "(Part 4 catalogue work: promote the depended-upon record or prune the edge. First 40:)", ""]
    for e in dang[:40]:
        L.append(f"- `{e['from']}`.{e['field']} → `{e['to']}` ({e['why']})")
    L += ["", "## Landforms used", "",
          ", ".join(f"{k} {v}" for k, v in rep["landformUsed"].items()), "",
          "## Homeless batch (unresolved)", ""]
    if rep["homeless"]:
        for h in rep["homeless"]:
            L.append(f"- `{h['id']}` (tier {h['tier']})")
    else:
        L.append("- none: every live record found ground")
    L += ["", "## Tier 0–1 placements", "", "| record | site | landform | region | why |", "|---|---|---|---|---|"]
    by_d = {d.id: d for d in demands}
    for did in sorted(result):
        d = by_d[did]
        if d.tier > 1:
            continue
        c = result[did]["candidate"]
        why = result[did].get("why") or why_text(d, c, result[did]["parts"], result[did].get("homelessStage"))
        L.append(f"| `{did}` | {c.id} | {c.landform} | {c.region} | {why} |")
    fc = rep.get("feedbackChecks")
    if fc:
        L += ["", "## Owner-feedback checks (Part 4 step 2)", "",
              f"- stances: {fc['stances']}",
              f"- swap pass exchanged {len(fc['swapped'])} sites",
              f"- delves/combat places (D3+) with no friendly/sanctuary rest within 600 m (1200 m in D4–D5): {len(fc['restCadenceGaps'])}",
              "", "| city | purposes in 2 km | missing core purposes | hostile in 2 km | edge / hinterland / rural counts |", "|---|---|---|---|---|"]
        for aid, c in fc["cities"].items():
            rings = " / ".join(str(sum(c["rings"][k].values())) for k in ("edge", "hinterland", "rural"))
            L.append(f"| {aid} | {c['purposeCount']} | {', '.join(c['missingCorePurposes']) or '—'} | {c['hostileWithin2km']} | {rings} |")
        if fc["restCadenceGaps"]:
            L += ["", "Rest-cadence gaps (add a rest or soften): " + ", ".join(f"`{g['id']}` ({g['nearestRestM']} m)" for g in fc["restCadenceGaps"][:40])]
    if rep.get("clarkEvans"):
        L += plot_stats.digest_section(rep["clarkEvans"])
    return "\n".join(L) + "\n"


def positions_by_zone(by_id, demands) -> dict[str, list[tuple[float, float]]]:
    """{zone: [(x, z), ...]} for the plotted records, for `plot_stats` (97 G3).

    `by_id` maps a record id to anything with `.x` / `.z` (a Candidate) or to an
    [x, z] pair (a committed `positionM`), so the same function serves the solve
    and the report-only pass over the committed catalogue."""
    zone_of = {d.id: d.zone for d in demands}
    out: dict[str, list[tuple[float, float]]] = {}
    for did, pos in by_id.items():
        zone = zone_of.get(did)
        if zone is None:
            continue
        x, z = (pos.x, pos.z) if hasattr(pos, "x") else (float(pos[0]), float(pos[1]))
        out.setdefault(zone, []).append((x, z))
    return out


# --------------------------------------------------------------------------- #
# main
# --------------------------------------------------------------------------- #
def ceiling_repair_pass(demands: list[Demand], result: dict[str, dict], cands: list[Candidate],
                        s: ProvinceSurvey, thomas_prior: dict[str, dict],
                        rounds: int = 3) -> list[dict]:
    """Close the ORDERING HOLE in the `maxFromM` ceilings.

    `separation_ok` can only judge a ceiling against records already on the
    map, so a record plotted before the nearest member of its target class
    exists is admitted un-judged and may end up outside its own ceiling — the
    2026-09-09 plot missed three by 0.3 m, 37 m and 201 m. Re-checking against
    the finished plot (`typed_siting_violations`) finds them but cannot fix
    them.

    This pass lifts each offender off the map and re-solves it with every
    other record fixed, so its ceiling is now judged against the whole plot.
    A round is kept only if it leaves nobody homeless and strictly fewer
    violations; otherwise the previous plot is restored. Deterministic:
    `assign` is, and the offenders are taken in sorted order.
    """
    trace: list[dict] = []
    for _ in range(rounds):
        before = typed_siting_violations(demands, result, s)
        offenders = sorted({v["id"] for v in before if v["gate"] == "maxFromM"})
        if not offenders:
            break
        kept = {rid: row for rid, row in result.items() if rid not in offenders}
        candidate_result, unresolved = assign(demands, cands, s, s.anchor_points_m,
                                              preplaced=kept, thomas_prior=thomas_prior)
        after = typed_siting_violations(demands, candidate_result, s)
        accepted = not unresolved and len(after) < len(before)
        trace.append({"offenders": offenders, "violationsBefore": len(before),
                      "violationsAfter": len(after),
                      "homeless": sorted(r["id"] for r in unresolved),
                      "accepted": accepted})
        if not accepted:
            break
        result.clear()
        result.update(candidate_result)
    return trace


def solve(s: ProvinceSurvey, seed: int = DEFAULT_SEED, resolve_all: bool = False):
    """The whole solve, for `run` and for the determinism test alike.

    By default the COMMITTED plot is the seed: a record keeps its committed
    cell unless that cell is no longer valid under the current fields, and the
    solver re-sites only those. `resolve_all=True` (CLI `--resolve-all`) is the
    owner's deliberate from-scratch re-plot (decision 0041)."""
    recipes = load_recipes()
    demands, files = build_demand(recipes)
    scour = load_scour(s)
    submerged_zones = {d.zone for d in demands if d.hints.get("submerged")}
    free = (free_ground(s, seed) + roadside_ground(s, seed)
            + free_submerged(s, seed, submerged_zones))
    cands = scour + free
    attach_zone_distances(s, cands)
    attach_water_depth(s, cands)
    attach_anchor_ids(s, cands)
    thomas_prior = build_thomas_prior(demands, cands, seed)
    seeded: dict[str, dict] = {}
    resite: list[dict] = []
    pinned: list[dict] = []
    if not resolve_all:
        seeded, resite, pinned = seed_from_committed(s, demands, files)
    else:
        seeded = preplace_overrides(demands, cands, s)
    result, unresolved = assign(demands, cands, s, s.anchor_points_m,
                                preplaced=seeded, thomas_prior=thomas_prior)
    swap_pass(demands, result, plotted_meta_of(result), s, thomas_prior)
    if not resolve_all:
        pin_overrides(result, cands, s)
    if unresolved:
        # A quality-improving swap or an authored blueprint pin can release
        # exactly the scarce local cell a previously homeless record needed.
        # Re-run assignment with every existing result fixed, so completeness
        # gets first use of that newly available capacity without moving or
        # weakening any placement.
        result, unresolved = assign(demands, cands, s, s.anchor_points_m,
                                    preplaced=result, thomas_prior=thomas_prior)
    # Only in a re-plot. A seeded solve's whole contract is that a committed
    # cell does not move (`test_the_solve_keeps_every_committed_cell`), and the
    # shipped catalogue's ceiling breaches are exactly what the re-plot is for.
    ceiling_trace = (ceiling_repair_pass(demands, result, cands, s, thomas_prior)
                     if resolve_all else [])
    return (demands, files, scour, free, result, unresolved, resite, pinned,
            ceiling_trace)


def run(seed: int = DEFAULT_SEED, write: bool = True, report_only_to: Path | None = None,
        resolve_all: bool = False) -> dict:
    s = ProvinceSurvey()
    (demands, files, scour, free, result, unresolved, resite, pinned,
     ceiling_trace) = solve(s, seed, resolve_all=resolve_all)
    plotted = {did: (next(d for d in demands if d.id == did), r["candidate"]) for did, r in result.items()}
    apply_to_records(files, demands, result, s)
    rep = build_report(demands, result, unresolved, plotted, s, seed, len(scour), len(free))
    rep["feedbackChecks"] = feedback_checks(demands, result, s)
    rep["seeding"] = {
        "mode": "resolve-all" if resolve_all else "seeded-from-committed",
        "seeded": sum(1 for r in result.values() if r.get("seeded")),
        "reSited": sorted(resite, key=lambda h: h["id"]),
        "pinnedInvalid": sorted(pinned, key=lambda h: h["id"]),
    }
    prior = build_thomas_prior(demands, scour + free, seed)
    rep["clusteringPrior"] = {
        "model": "culture-specific Thomas process",
        "childrenPerParent": THOMAS_CHILDREN_PER_PARENT,
        "childRadiusM": THOMAS_CHILD_RADIUS_M,
        "weight": THOMAS_WEIGHT,
        "byZone": {
            zone: {
                "parentFloorM": row["parentFloorM"], "sigmaM": row["sigmaM"],
                "targetParents": row["targetParents"], "actualParents": len(row["parents"]),
                "parentsM": [[round(x, 1), round(z, 1)] for x, z in row["parents"]],
            }
            for zone, row in prior.items()
        },
    }
    rep["ceilingRepair"] = ceiling_trace
    rep["clusteringOutcome"], clustering_errors = thomas_outcome(
        prior, demands, result, unresolved)
    rep["clarkEvans"] = plot_stats.clark_evans(
        positions_by_zone({did: r["candidate"] for did, r in result.items()}, demands),
        plot_stats.zone_land_area_m2(s), plot_stats.zone_land_masks(s), s.grid_px_m,
        seed=seed)
    if write:
        for rf in files.values():
            catalogue.dump_json(rf.path, {"schemaVersion": catalogue.PLACES_SCHEMA_VERSION, "region": rf.region,
                                          "seed": rf.seed, "places": rf.places})
    if write or report_only_to is not None:
        rj, rm = (REPORT_JSON, REPORT_MD) if write else (report_only_to / "macro-plot.json", report_only_to / "macro-plot.md")
        rj.write_text(json.dumps(rep, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        rm.write_text(digest(rep, result, demands), encoding="utf-8")
    # The failure is raised AFTER the report is written (2026-09-09): a
    # resolve-all that leaves records homeless is exactly when the per-record
    # reasons are needed, and raising first threw them away.
    if resolve_all and clustering_errors:
        raise RuntimeError("; ".join(clustering_errors))
    return rep


# --------------------------------------------------------------------------- #
# 97 A8 / G5 — a navigable role needs navigable water
# --------------------------------------------------------------------------- #
# A8: "a place whose identity is a network role sits where the role exists or
# is cut", and a port sits on NAVIGABLE water. The `navigable` hint says the
# record's own prose claims deep water, a quay, a harbour, an anchorage or a
# laden hull; this checks the published water raster agrees.
#
# The ladder is 97 B5's hull classes, one step per thing that floats:
#   canoe / raft / lighter   >= 0.6 m
#   small-draft boat station >= 1.2 m
#   keeled hull berth        >= 3.0 m
# Type -> class is a table, not a guess: a place is keel-class only when its
# identity IS a seagoing hull tying up (a port, a harbour city, a shipyard, the
# head of navigation — the point where keels stop). Lilmoth is deliberately
# canoe-class: its living is lighters BECAUSE hulls cannot berth (B5).
def navigable_violations(s: ProvinceSurvey) -> list[dict]:
    """97 A8/G5 over the COMMITTED plot: every record whose prose claims
    navigable water but whose deepest water within `NAVIGABLE_REACH_M` is under
    its hull class. Report-only — it moves nothing."""
    from scipy import ndimage

    demands, files = build_demand(load_recipes())
    positions = {rec["id"]: rec.get("positionM")
                 for rf in files.values() for rec in rf.places}
    n = s.water_depth_m.shape[0]
    px = s.extent_m / n
    deep = ndimage.maximum_filter(s.water_depth_m, size=int(round(2 * NAVIGABLE_REACH_M / px)) + 1)
    out: list[dict] = []
    for d in sorted(demands, key=lambda d: d.id):
        if not d.hints.get("navigable"):
            continue
        pos = positions.get(d.id)
        if not isinstance(pos, list) or len(pos) != 2:
            continue
        row = min(n - 1, max(0, int(pos[1] / px)))
        col = min(n - 1, max(0, int(pos[0] / px)))
        depth = float(deep[row, col])
        hull = NAVIGABLE_HULL_CLASS.get(d.type, NAVIGABLE_DEFAULT_CLASS)
        need = HULL_CLASS_M[hull]
        promised = promised_navigable_depth_m(d)
        if depth + 1e-9 < need and promised + 1e-9 < need:
            out.append({"id": d.id, "type": d.type, "hullClass": hull,
                        "needM": need, "depthM": round(depth, 2),
                        "promisedDepthM": round(promised, 2)})
    return out


CLUSTER_HEADING = "## Clustering — Clark-Evans R per zone (97 A5 / G3)"


def report_only() -> dict:
    """Recompute the report-only statistics (97 G3) over the COMMITTED plot and
    write them into `macro-plot.json` / `macro-plot.md`, without re-solving:
    the plotted positions are read back out of the catalogue, so no record can
    move. Returns the stats."""
    s = ProvinceSurvey()
    demands, files = build_demand(load_recipes())
    live = {d.id for d in demands}
    positions = {rec["id"]: rec["positionM"]
                 for rf in files.values() for rec in rf.places
                 if rec["id"] in live and isinstance(rec.get("positionM"), list)}
    stats = plot_stats.clark_evans(positions_by_zone(positions, demands),
                                   plot_stats.zone_land_area_m2(s),
                                   plot_stats.zone_land_masks(s), s.grid_px_m,
                                   seed=DEFAULT_SEED)
    rep = json.loads(REPORT_JSON.read_text(encoding="utf-8"))
    rep["clarkEvans"] = stats
    REPORT_JSON.write_text(json.dumps(rep, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    md = REPORT_MD.read_text(encoding="utf-8")
    head = md.split(CLUSTER_HEADING)[0].rstrip("\n")
    REPORT_MD.write_text(head + "\n" + "\n".join(plot_stats.digest_section(stats)) + "\n",
                         encoding="utf-8")
    return stats


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--seed", type=int, default=DEFAULT_SEED)
    ap.add_argument("--dry-run", action="store_true", help="do not touch the catalogue; report goes to --report-dir")
    ap.add_argument("--report-dir", type=Path, default=REPO_ROOT / "output" / "macro-plot")
    ap.add_argument("--validate", action="store_true",
                    help="97 G5: check every navigable-hint record against its hull class over the "
                         "COMMITTED plot; exits non-zero on any violation")
    ap.add_argument("--resolve-all", action="store_true",
                    help="owner's deliberate re-plot (decision 0041): solve from scratch instead of "
                         "seeding from the committed plot")
    ap.add_argument("--report-only", action="store_true",
                    help="97 G3: recompute the Clark-Evans clustering stats over the COMMITTED "
                         "plot and write them into the report; does not solve or move anything")
    a = ap.parse_args(argv)
    if a.validate:
        bad = navigable_violations(ProvinceSurvey())
        for v in bad:
            print(f"[macro-plot] 97 A8/G5 {v['id']} ({v['type']}, {v['hullClass']}): "
                  f"{v['depthM']} m within {NAVIGABLE_REACH_M:.0f} m, needs {v['needM']} m"
                  )
        print(f"[macro-plot] {len(bad)} navigable-depth violations")
        raise SystemExit(1 if bad else 0)
    if a.report_only:
        stats = report_only()
        print(f"[macro-plot] Clark-Evans median R {stats['median']}; "
              f"evener than random (R >= 1): {', '.join(stats['zonesEvenerThanRandom']) or 'none'}")
        return
    if a.dry_run:
        a.report_dir.mkdir(parents=True, exist_ok=True)
    rep = run(a.seed, write=not a.dry_run, report_only_to=a.report_dir if a.dry_run else None,
              resolve_all=a.resolve_all)
    sd = rep["seeding"]
    print(f"[macro-plot] seeding {sd['mode']}: {sd['seeded']} records kept their committed cell, "
          f"{len(sd['reSited'])} re-sited, "
          f"{len(sd.get('pinnedInvalid', []))} pinned to their committed dot")
    for h in sd["reSited"]:
        print(f"   re-sited {h['id']}: {h['reason']}")
    for h in sd.get("pinnedInvalid", []):
        print(f"   PINNED {h['id']}: {h['reason']} — {h['pin']}")
    print(f"[macro-plot] plotted {rep['demand']['plotted']}/{rep['demand']['live']} live records; "
          f"unresolved {rep['demand']['homelessUnresolved']}; "
          f"dead route fraction {rep['routeVisibility']['deadFraction']}")
    for zone, z in rep["byZone"].items():
        print(f"   {zone:22s} {z['plotted']:4d}/{z['live']:<4d} homeless {z['homeless']}")


if __name__ == "__main__":
    main()
