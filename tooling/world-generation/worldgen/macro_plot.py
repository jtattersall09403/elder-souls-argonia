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
record as `plotOverride` with a reason — see `apply_overrides`).
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

# Minimum separation between two plotted places, by magnitude (settlements)
# or by density layer (everything else). Between a pair, the larger applies.
# Sized to the zones as the culture raster actually draws them (0.8–9 km² of
# land each): imperial-penal-south holds 21 places on 0.94 km², so a pitch much
# above ~200 m is unachievable there and the strict pass would fail wholesale.
SEPARATION_M = {"M5": 800.0, "M4": 450.0, "M3": 300.0, "M2": 220.0, "M1": 150.0,
                "landmark": 200.0, "destination": 160.0, "fine-tempo": 110.0}
SAME_TYPE_MIN_M = 300.0          # "never two of the same template in sight" — marsh sightlines are short
SAME_TYPE_LANDMARK_MIN_M = 700.0
RELATED_MIN_M = 60.0             # parent/child pairs may sit together
FREE_SPACING_M = 140.0           # free-ground lattice pitch
ACCEPT_SCORE = 0.9               # below this a pair is not an honest fit
RELAXED_SCORE = 0.35
ZONE_SPILL_M = 350.0             # a place may sit this far outside its culture zone when its own zone has no ground left
ROADSIDE_STEP_M = 110.0          # roadside lattice: a candidate this often along every road and lane
ROADSIDE_OFFSETS_M = (35.0, 90.0)

DANGER_TIER = {"D0": 1, "D1": 1, "D2": 2, "D3": 3, "D4": 4, "D5": 5}


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
    used_by: str | None = None
    zone_dist: dict = field(default_factory=dict)   # metres to each culture zone (filled by attach_zone_distances)


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

    @property
    def separation(self) -> float:
        return SEPARATION_M.get(self.magnitude or "", SEPARATION_M[self.layer])


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
KM_PATTERN = re.compile(r"within (\d+(?:\.\d+)?) ?km", re.I)


def _hash01(*parts: str) -> float:
    return (zlib.crc32("|".join(parts).encode()) & 0xFFFFFFFF) / 0xFFFFFFFF


# --------------------------------------------------------------------------- #
# demand
# --------------------------------------------------------------------------- #
def load_recipes() -> dict[str, dict]:
    data = json.loads(RECIPES_PATH.read_text())
    return {t["type"]: t for t in data["types"]}


def build_demand(recipes: dict[str, dict]) -> tuple[list[Demand], dict[str, catalogue.RegionFile]]:
    files = {rf.region: rf for rf in catalogue.load_region_files()}
    demands: list[Demand] = []
    for region, rf in sorted(files.items()):
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
            demands.append(Demand(
                id=rec["id"], zone=region, tier=int(rec["importanceTier"]),
                layer=rec["densityLayer"], magnitude=rec["classification"].get("magnitude"),
                cls=rec["classification"]["class"], type=typ,
                danger=DANGER_TIER.get(rec["dangerTier"], 3), landforms=landforms,
                landforms_from_recipe=from_recipe, regions=regions,
                parents=parents, hints=hints, record=rec))
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
                anchor_m=min(math.hypot(x - ax, z - az) for ax, az in anchors.values())))
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
                    anchor_m=min(math.hypot(x - ax, z - az) for ax, az in anchors.values())))
    return out


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


def score_pair(d: Demand, c: Candidate, plotted: dict[str, tuple[float, float]],
               relaxed: bool = False) -> tuple[float, dict[str, float]]:
    parts: dict[str, float] = {}
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
    elif c.kind == "free":
        # a record that wants a specific landform but is offered plain ground;
        # fine-tempo places care more about being on the way than about the landform
        parts["landform"] = (0.4 if d.layer == "fine-tempo" else 0.15) if not relaxed else 0.4
    else:
        parts["landform"] = -0.4  # a wrong landform is worse than none: it reads as a mistake
    # region class
    if d.regions:
        parts["region"] = 0.6 if c.region in d.regions else -0.7
    # danger
    gap = abs(c.danger - d.danger)
    parts["danger"] = 0.5 - 0.35 * gap
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
        parts["remote"] = 0.35 * min(1.0, c.route_m / 500.0)
    if d.hints.get("remote"):
        parts["remote"] = parts.get("remote", 0.0) + 0.3 * min(1.0, c.route_m / 700.0)
    if d.hints.get("concealed") or d.cls in {"lair", "camp"}:
        parts["concealment"] = 0.35 * c.concealment
    if d.hints.get("commanding"):
        parts["commanding"] = 0.4 * c.visibility + 0.2 * c.prominence
    if d.hints.get("submerged"):
        parts["submerged"] = 0.6 if (c.depth_m > 0.8 or c.water_m <= 8.0) else -0.6
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
    if d.tier >= 3 and d.danger <= 3:
        parts["hinterland"] = 0.25 * _band(c.anchor_m, 0, 1800, 2500)
    # water for water-bound classes / region wishes
    if d.regions & (WATER_REGIONS | {"tidal delta", "coastal lagoon & salt marsh", "mangrove forest"}):
        parts["water"] = 0.3 * c.water_relation
    parts["tie"] = 0.02 * _hash01(d.id, c.id)
    return sum(parts.values()), parts


def separation_ok(d: Demand, c: Candidate, plotted_d: dict[str, tuple[Demand, Candidate]],
                  factor: float = 1.0) -> tuple[bool, str | None]:
    for oid, (od, oc) in plotted_d.items():
        dist = math.hypot(c.x - oc.x, c.z - oc.z)
        related = oid in d.parents or d.id in od.parents
        if related:
            need = RELATED_MIN_M
        elif d.cls == "settlement" and od.cls == "settlement":
            need = max(d.separation, od.separation)      # settlements keep each other at arm's length
        else:
            # a city's hinterland is FULL of small places: a shrine or camp
            # takes only its own spacing against a settlement, never the city's
            need = max(100.0, min(d.separation, od.separation))
            if od.type == d.type:
                need = max(need, SAME_TYPE_LANDMARK_MIN_M if d.layer == "landmark" and od.layer == "landmark"
                           else SAME_TYPE_MIN_M)
        if dist < need * factor:
            return False, oid
    return True, None


# --------------------------------------------------------------------------- #
# assignment
# --------------------------------------------------------------------------- #
def assign(demands: list[Demand], cands: list[Candidate], s: ProvinceSurvey,
           anchors: dict[str, tuple[float, float]]) -> tuple[dict[str, dict], list[dict]]:
    """Tier by tier, best-pair-first. Returns {record id: assignment} and the
    homeless batch (with the reason each record could not be honestly placed)."""
    plotted_xy: dict[str, tuple[float, float]] = {}
    plotted_d: dict[str, tuple[Demand, Candidate]] = {}
    result: dict[str, dict] = {}
    by_id = {c.id: c for c in cands}

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
            plotted_xy[d.id] = (ax, az)
            plotted_d[d.id] = (d, c)
            result[d.id] = {"candidate": c, "score": None, "parts": {}, "runners": [],
                            "why": f"Owner-approved settlement anchor '{slug}' (world/sources/anchors, Phase 2 gate); position kept exactly."}

    homeless: list[dict] = []

    def run_tier(pool: list[Demand], relaxed: bool, sep_factor: float, min_score: float) -> list[Demand]:
        pairs = []
        for d in pool:
            for c in cands:
                if c.used_by:
                    continue
                sc, parts = score_pair(d, c, plotted_xy, relaxed)
                if sc >= min_score:
                    pairs.append((sc, d.id, c.id, parts))
        pairs.sort(key=lambda p: (-p[0], p[1], p[2]))
        best_by_d: dict[str, list] = {}
        done: set[str] = set()
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
            ok, blocker = separation_ok(d, c, plotted_d, sep_factor)
            if not ok:
                if len(best_by_d[did]) < 3:
                    best_by_d[did].append((cid, sc, f"too close to {blocker}"))
                continue
            c.used_by = did
            done.add(did)
            plotted_xy[did] = (c.x, c.z)
            plotted_d[did] = (d, c)
            result[did] = {"candidate": c, "score": sc, "parts": parts,
                           "runners": best_by_d[did], "relaxed": relaxed}
        return [d for d in pool if d.id not in done]

    for tier in range(0, 5):
        pool = [d for d in demands if d.tier == tier and d.id not in result]
        left = run_tier(pool, relaxed=False, sep_factor=1.0, min_score=ACCEPT_SCORE)
        for d in left:
            homeless.append({"id": d.id, "tier": tier, "stage": "strict"})

    # 2. the homeless batch, reconsidered as a whole with honest relaxations
    stages = [("relaxed-score", False, 1.0, RELAXED_SCORE),
              ("neighbour-zone", True, 1.0, RELAXED_SCORE),
              ("spacing-3/4", True, 0.75, RELAXED_SCORE),
              ("spacing-1/2", True, 0.5, RELAXED_SCORE)]
    for name, relaxed, factor, min_score in stages:
        pool = [d for d in demands if d.id not in result]
        if not pool:
            break
        left = run_tier(pool, relaxed=relaxed, sep_factor=factor, min_score=min_score)
        placed = {d.id for d in pool} - {d.id for d in left}
        for h in homeless:
            if h["id"] in placed:
                h["resolvedAt"] = name
    for h in homeless:
        if h["id"] in result:
            result[h["id"]]["homelessStage"] = h.get("resolvedAt")
    unresolved = [h for h in homeless if h["id"] not in result]
    return result, unresolved


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
                continue
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
            rec["plotFacts"] = {
                "landform": c.landform, "regionClass": c.region, "dangerBand": c.danger,
                "distanceToRouteM": round(c.route_m, 1), "distanceToWaterM": round(c.water_m, 1),
                "score": None if r["score"] is None else round(r["score"], 3),
            }
            rec["workflow"] = "plotted"
            # sitingPrefs ordering must stay; nothing else on the record changes


def apply_overrides(result: dict[str, dict], cands_by_id: dict[str, Candidate], s: ProvinceSurvey) -> list[dict]:
    """Hand placements (Parts 4–6 may pin a dot). `macro-plot-overrides.json`:
    {"overrides": [{"id": ..., "u":..., "v":..., "why": ...}]}. A pinned record
    is removed from the automatic solve entirely."""
    if not OVERRIDES_PATH.exists():
        return []
    doc = json.loads(OVERRIDES_PATH.read_text())
    return doc.get("overrides", [])


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
    for r in result.values():
        st = r.get("homelessStage")
        if st:
            stages[st] = stages.get(st, 0) + 1

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
        "antiSameynessQuotaBreaches": quota_breaches,
        "routeVisibility": route_visibility_sweep(s, plotted),
        "homeless": unresolved,
    }


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
    return "\n".join(L) + "\n"


# --------------------------------------------------------------------------- #
# main
# --------------------------------------------------------------------------- #
def run(seed: int = DEFAULT_SEED, write: bool = True, report_only_to: Path | None = None) -> dict:
    s = ProvinceSurvey()
    recipes = load_recipes()
    demands, files = build_demand(recipes)
    scour = load_scour(s)
    free = free_ground(s, seed) + roadside_ground(s, seed)
    cands = scour + free
    attach_zone_distances(s, cands)
    anchors = s.anchor_points_m
    result, unresolved = assign(demands, cands, s, anchors)
    plotted = {did: (next(d for d in demands if d.id == did), r["candidate"]) for did, r in result.items()}
    apply_to_records(files, demands, result, s)
    rep = build_report(demands, result, unresolved, plotted, s, seed, len(scour), len(free))
    if write:
        for rf in files.values():
            catalogue.dump_json(rf.path, {"schemaVersion": catalogue.SCHEMA_VERSION, "region": rf.region,
                                          "seed": rf.seed, "places": rf.places})
    if write or report_only_to is not None:
        rj, rm = (REPORT_JSON, REPORT_MD) if write else (report_only_to / "macro-plot.json", report_only_to / "macro-plot.md")
        rj.write_text(json.dumps(rep, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        rm.write_text(digest(rep, result, demands), encoding="utf-8")
    return rep


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--seed", type=int, default=DEFAULT_SEED)
    ap.add_argument("--dry-run", action="store_true", help="do not touch the catalogue; report goes to --report-dir")
    ap.add_argument("--report-dir", type=Path, default=REPO_ROOT / "output" / "macro-plot")
    a = ap.parse_args(argv)
    if a.dry_run:
        a.report_dir.mkdir(parents=True, exist_ok=True)
    rep = run(a.seed, write=not a.dry_run, report_only_to=a.report_dir if a.dry_run else None)
    print(f"[macro-plot] plotted {rep['demand']['plotted']}/{rep['demand']['live']} live records; "
          f"unresolved {rep['demand']['homelessUnresolved']}; "
          f"dead route fraction {rep['routeVisibility']['deadFraction']}")
    for zone, z in rep["byZone"].items():
        print(f"   {zone:22s} {z['plotted']:4d}/{z['live']:<4d} homeless {z['homeless']}")


if __name__ == "__main__":
    main()
