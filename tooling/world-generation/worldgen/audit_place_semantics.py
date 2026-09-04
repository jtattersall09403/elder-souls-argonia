"""Phase 11 Part 4 — SEMANTIC AUDIT of the plotted place catalogue.

    cd tooling/world-generation
    python3 -m worldgen.audit_place_semantics

WHY
---
`worldgen.macro_plot` places every live record on ground that *scores* well.
Scoring is not truth: when the zone runs out of the landform a record's
identity depends on, the plot silently takes plain ground and records the
relaxation in `whySiteWon`. The record's PROSE still claims the thing it did
not get. Owner review 2026-09-03 found two by eye:

  * `place.pirate-freeholds.trunk-toll-bridge` ("The Trunk Span") claims the
    Stormhold-to-Thorn trunk line; it sits on the Alten Corimont offshoot.
  * `place.pirate-freeholds.chasecreek` is founded on "the one dry rise at a
    creek mouth"; the plot gave it plain ground because no flood-high site
    was left.

This module finds the rest of that family MECHANICALLY: it reads what each
record CLAIMS (name, `why.*`, `vibe.*`, `sitingPrefs.*`, `relations.*`) and
measures what the ground and the route graph actually DO, then reports every
contradiction with a suggested resolution class so a human or an authoring
agent can decide: move the place, rewrite its identity, swap in a reserve
place, or cut it.

IT DECIDES NOTHING. It writes a report and a JSON sidecar; it never edits the
catalogue. Fixing is a separate, reviewed step.

CHECKS (one function each, all pure over `Ctx`)
----------------------------------------------
  route      a named road / generic "on the road, ford, bridge, toll" claim
             vs the nearest route and whether it is the named one
  landform   an identity built on a landform the plot relaxed away
  water      bank / quay / stilts / island / underwater claims vs real water
  neighbour  "within sight of X", "beside X" and relation edges vs distance,
             line of sight and target status
  region     plotFacts.regionClass and the culture raster vs the record's wish
  danger     dangerTier vs the danger raster, occupants' D-levels vs tier
  discovery  discovery=sightline/road and entrance vs route and depth
  generic    homeless-batch relaxations and near-duplicate identity prose

OUTPUT
------
  world/sources/sites/semantic-audit.md                 (owner/agent review)
  tooling/world-generation/output/semantic-audit.json   (gitignored sidecar)

DETERMINISM (engineering standard 6)
------------------------------------
No randomness anywhere; findings are sorted by (severity, region, id, check)
and every measurement is a pure function of committed data. Re-running
reproduces both files byte for byte.

TESTABILITY
-----------
The heavy `ProvinceSurvey` is reached only through the `Terrain` protocol
(`terrain_at`, `line_of_sight`), so `test_audit_place_semantics` can drive
every check with a few dozen lines of stub instead of a 10 s raster load.
"""

from __future__ import annotations

import argparse
import json
import math
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Protocol

from . import catalogue

REPO_ROOT = catalogue.REPO_ROOT
PROVINCE = REPO_ROOT / "apps" / "world-studio" / "public" / "province"
ANCHORS_PATH = REPO_ROOT / "world" / "sources" / "anchors" / "settlement-anchors.json"
REPORT_MD = REPO_ROOT / "world" / "sources" / "sites" / "semantic-audit.md"
REPORT_JSON = Path(__file__).resolve().parents[1] / "output" / "semantic-audit.json"

SCHEMA_VERSION = 1

# thresholds, all in metres unless named otherwise
NAMED_ROUTE_TOL_M = 250.0      # a record that names a road should be on it
GENERIC_ROAD_TOL_M = 150.0     # "on the road" (any route, incl. minor tracks)
SIGHTLINE_MAX_M = 1500.0       # a "within sight of X" claim beyond this is prose
BESIDE_MAX_M = 250.0           # "beside / beneath / at the foot of X"
HOUR_WALK_M = 4000.0           # an hour on foot in marsh
DAY_WALK_MIN_M = 2500.0        # "a day's walk" that is closer than this is wrong
BANK_MAX_M = 60.0              # "on the bank / quay / landing / stilts"
ISLAND_MAX_M = 25.0
REACHED_VIA_MAX_M = 3000.0
SUPPLIES_MAX_M = 4000.0
SIGHTLINE_DISCOVERY_M = 450.0  # a sightline discovery must be seen from a route
ROAD_DISCOVERY_M = 300.0
UNDERWATER_MIN_DEPTH_M = 1.5
DUPLICATE_MAX_M = 1000.0
DUPLICATE_JACCARD = 0.6
DANGER_TIER = {"D0": 1, "D1": 1, "D2": 2, "D3": 3, "D4": 4, "D5": 5}
LIVE_STATUSES = {"active", "ruined", "abandoned", "seasonal", "drowned",
                 "contested", "under-construction"}

SEVERITY_ORDER = {"high": 0, "med": 1, "low": 2}
RESOLUTIONS = {"move", "rewrite", "swap", "cut", "ok-explain"}

PLACE_ID = re.compile(r"place\.[a-z0-9-]+\.[a-z0-9-]+")


# --------------------------------------------------------------------------- #
# finding
# --------------------------------------------------------------------------- #
@dataclass(frozen=True)
class Finding:
    id: str
    region: str
    check: str
    severity: str          # high | med | low
    claim: str             # what the record says
    fact: str              # what the ground says
    resolution: str        # move | rewrite | swap | cut | ok-explain

    def sort_key(self) -> tuple:
        return (SEVERITY_ORDER[self.severity], self.region, self.id, self.check, self.claim)

    def to_json(self) -> dict:
        return {"id": self.id, "region": self.region, "check": self.check,
                "severity": self.severity, "claim": self.claim, "fact": self.fact,
                "resolution": self.resolution}


def clip(text: str, n: int = 90) -> str:
    t = " ".join(str(text).split())
    return t if len(t) <= n else t[: n - 1] + "…"


# --------------------------------------------------------------------------- #
# terrain access (the only thing that needs the rasters)
# --------------------------------------------------------------------------- #
class Terrain(Protocol):
    def terrain_at(self, x: float, z: float) -> dict: ...
    def line_of_sight(self, ax: float, az: float, bx: float, bz: float) -> bool: ...


class SurveyTerrain:
    """`ProvinceSurvey` behind the narrow protocol the checks use."""

    def __init__(self, survey=None):
        if survey is None:
            from .site_fields import ProvinceSurvey
            survey = ProvinceSurvey()
        self.s = survey

    def terrain_at(self, x: float, z: float) -> dict:
        s = self.s
        smp = s.sample(x, z)
        row, col = s.grid_px(x, z)
        r = max(1, int(150.0 / s.grid_px_m))
        n = s.grid_n
        r0, r1 = max(0, row - r), min(n, row + r + 1)
        c0, c1 = max(0, col - r), min(n, col + r + 1)
        patch = s.height_grid[r0:r1, c0:c1]
        scale = s.water_depth_m.shape[0] / n
        d0, d1 = int(r0 * scale), max(int(r1 * scale), int(r0 * scale) + 1)
        e0, e1 = int(c0 * scale), max(int(c1 * scale), int(c0 * scale) + 1)
        dpatch = s.water_depth_m[d0:d1, e0:e1]
        hyd = smp["hydrology"]
        return {
            "elevationM": smp["elevationM"],
            "slopeDeg": smp["slopeDeg"],
            "regionName": smp["regionName"],
            "dangerBand": smp["dangerBand"],
            "culture": smp["cultureTerritory"],
            "relief150M": round(float(patch.max() - patch.min()), 2) if patch.size else 0.0,
            "heightAboveWaterM": hyd["heightAboveWaterTableM"],
            "waterDepthM": hyd["waterDepthM"],
            "maxDepthNearbyM": round(float(dpatch.max()), 2) if dpatch.size else 0.0,
            "shoreDistanceM": hyd["shoreDistanceM"],
            "coastDistanceM": hyd["coastDistanceM"],
            "wetland": hyd["wetland"],
            "floodBand": hyd["floodBand"],
        }

    def line_of_sight(self, ax: float, az: float, bx: float, bz: float) -> bool:
        return bool(self.s.line_of_sight(ax, az, bx, bz))


# --------------------------------------------------------------------------- #
# routes
# --------------------------------------------------------------------------- #
@dataclass
class RouteLine:
    key: str                 # "stormhold->thorn" or a minor track id
    kind: str                # road | boat | track | footpath | boardwalk | causeway
    major: bool
    names: tuple[str, ...]   # human endpoint names, lowered
    points: list[tuple[float, float]]

    def distance_to(self, x: float, z: float) -> float:
        best = float("inf")
        for px, pz in self.points:
            d = math.hypot(px - x, pz - z)
            if d < best:
                best = d
        return best

    @property
    def label(self) -> str:
        if self.major and len(self.names) == 2:
            a, b = (n.title() for n in self.names)
            return f"{a}–{b} {'boat lane' if self.kind == 'boat' else 'road'}"
        return f"{self.kind} {self.key}"


def _anchor_names() -> dict[str, str]:
    doc = json.loads(ANCHORS_PATH.read_text())
    out = {a["id"]: a["name"] for a in doc["anchors"]}
    # the two road exits that are not settlements but ARE named roads in prose
    out.setdefault("blackwood-road", "Blackwood Road")
    out.setdefault("tear-road", "Tear Road")
    return out


def load_routes(province: Path = PROVINCE) -> list[RouteLine]:
    names = _anchor_names()
    meta = json.loads((province / "hydrology-meta.json").read_text())
    px_m = float(meta["metresPerPixel"])
    out: list[RouteLine] = []

    def endpoint_name(eid: str) -> str:
        return names.get(eid, eid.replace("-", " ")).lower()

    for r in json.loads((province / "routes.json").read_text())["routes"]:
        pts = [(p[0] * px_m, p[1] * px_m) for p in r["px"]]
        out.append(RouteLine(f"{r['from']}->{r['to']}", "road", True,
                             (endpoint_name(r["from"]), endpoint_name(r["to"])), pts))
    wpath = province / "waterways.json"
    if wpath.exists():
        for lane in json.loads(wpath.read_text())["lanes"]:
            pts = [(p[0] * px_m, p[1] * px_m) for p in lane["px"]]
            out.append(RouteLine(f"{lane['from']}~{lane['to']}", "boat", True,
                                 (endpoint_name(lane["from"]), endpoint_name(lane["to"])), pts))
    mpath = province / "routes-minor.json"
    if mpath.exists():
        mdoc = json.loads(mpath.read_text())
        mpx = float(mdoc["grid"]["metresPerPixel"])
        for t in mdoc["tracks"]:
            pts = [(p[0] * mpx, p[1] * mpx) for p in t["px"]]
            out.append(RouteLine(t["id"], t["kind"], False, (), pts))
    return out


# --------------------------------------------------------------------------- #
# context
# --------------------------------------------------------------------------- #
@dataclass
class Ctx:
    terrain: Terrain
    routes: list[RouteLine]
    records: dict[str, dict]                     # id -> record (all statuses)
    region_of: dict[str, str]                    # id -> catalogue region
    names_by_region: dict[str, dict[str, str]] = field(default_factory=dict)

    def __post_init__(self):
        if not self.names_by_region:
            idx: dict[str, dict[str, str]] = {}
            for pid, rec in self.records.items():
                nm = rec.get("name")
                if nm and len(nm) >= 4:
                    idx.setdefault(self.region_of[pid], {})[nm] = pid
            self.names_by_region = idx

    def pos(self, rec: dict) -> tuple[float, float] | None:
        p = rec.get("positionM")
        return (float(p[0]), float(p[1])) if p and len(p) == 2 else None

    def distance(self, a: dict, b: dict) -> float | None:
        pa, pb = self.pos(a), self.pos(b)
        if pa is None or pb is None:
            return None
        return math.hypot(pa[0] - pb[0], pa[1] - pb[1])

    def nearest_route(self, x: float, z: float, major_only: bool) -> tuple[RouteLine | None, float]:
        best, bd = None, float("inf")
        for r in self.routes:
            if major_only and not r.major:
                continue
            d = r.distance_to(x, z)
            if d < bd or (d == bd and best is not None and r.key < best.key):
                best, bd = r, d
        return best, bd


# --------------------------------------------------------------------------- #
# text harvesting
# --------------------------------------------------------------------------- #
IDENTITY_FIELDS = (
    ("name", lambda r: r.get("name") or ""),
    ("why.founding", lambda r: (r.get("why") or {}).get("founding") or ""),
    ("why.siteAdvantages", lambda r: (r.get("why") or {}).get("siteAdvantages") or ""),
    ("why.occupantsMotive", lambda r: (r.get("why") or {}).get("occupantsMotive") or ""),
    ("why.pressures", lambda r: (r.get("why") or {}).get("pressures") or ""),
    ("vibe.silhouette", lambda r: (r.get("vibe") or {}).get("silhouette") or ""),
    ("vibe.approach", lambda r: (r.get("vibe") or {}).get("approach") or ""),
    ("vibe.signatureFeature", lambda r: (r.get("vibe") or {}).get("signatureFeature") or ""),
    ("sitingPrefs.hardConstraints",
     lambda r: " ".join((r.get("sitingPrefs") or {}).get("hardConstraints") or [])),
    ("sitingPrefs.preferences",
     lambda r: " ".join((r.get("sitingPrefs") or {}).get("preferences") or [])),
)


def identity_claims(rec: dict) -> list[tuple[str, str]]:
    """(field, sentence) for every non-empty identity sentence on the record."""
    out: list[tuple[str, str]] = []
    for name, get in IDENTITY_FIELDS:
        text = get(rec)
        if not text:
            continue
        for sentence in re.split(r"(?<=[.;])\s+", text):
            s = sentence.strip()
            if s:
                out.append((name, s))
    return out


def identity_text(rec: dict) -> str:
    return " ".join(get(rec) for _n, get in IDENTITY_FIELDS).lower()


def _first_claim(rec: dict, pattern: re.Pattern) -> tuple[str, str] | None:
    for fname, sentence in identity_claims(rec):
        if pattern.search(sentence):
            return fname, sentence
    return None


# --------------------------------------------------------------------------- #
# 1. ROUTE IDENTITY
# --------------------------------------------------------------------------- #
GENERIC_ROAD = re.compile(
    r"\bon (?:the|a) (?:road|route|highway|lane|way)\b|\broadside\b|\bat a crossing\b|"
    r"\bcrossroad|\bjunction\b|\bthe ford\b|\ba ford\b|\bfords the\b|\bbridge\b|"
    r"\bcauseway\b|\btoll\b|\btrunk (?:road|route|line)\b|\bwayhouse\b|"
    # owner case 2026-09-04 (Ninefold): "the one stretch of road wide enough for
    # a gate" 400 m from any route — road-surface phrasing counts as a road claim
    r"\bstretch of (?:the )?road\b|\bmetalled road\b|\bpaved road\b|\broad'?s? (?:stone )?surface\b|"
    r"\b(?:beside|along|astride|straddl\w+) the road\b|\broad wide enough\b",
    re.I)
TRUNK_WORD = re.compile(r"\btrunk (?:road|route|line)\b", re.I)
ROUTE_EDGE_ID = re.compile(r"^(?:boat|ferry|road|track|caravan)[.:]([a-z0-9-]+)", re.I)


def _routes_named(ctx: Ctx, text: str) -> list[RouteLine]:
    """Major routes whose two endpoint names both appear in the text."""
    low = text.lower()
    hits = []
    for r in ctx.routes:
        if not r.major or len(r.names) != 2:
            continue
        if all(n in low for n in r.names):
            hits.append(r)
    return sorted(hits, key=lambda r: r.key)


def check_route(ctx: Ctx, rec: dict) -> list[Finding]:
    pos = ctx.pos(rec)
    if pos is None:
        return []
    x, z = pos
    rid, region = rec["id"], ctx.region_of[rec["id"]]
    out: list[Finding] = []
    text = identity_text(rec)
    near_major, d_major = ctx.nearest_route(x, z, major_only=True)
    near_any, d_any = ctx.nearest_route(x, z, major_only=False)

    named = _routes_named(ctx, text)
    for r in named:
        d_named = r.distance_to(x, z)
        if d_named <= NAMED_ROUTE_TOL_M:
            continue
        claim = _first_claim(rec, re.compile("|".join(re.escape(n) for n in r.names), re.I))
        claim_txt = claim[1] if claim else f"names the {r.label}"
        sev = "high" if d_named > 2 * NAMED_ROUTE_TOL_M else "med"
        fact = (f"{d_named:.0f} m from the {r.label} it names; nearest route is "
                f"{near_major.label if near_major else 'none'} at {d_major:.0f} m")
        out.append(Finding(rid, region, "route", sev, clip(claim_txt), fact,
                           "move" if sev == "high" else "rewrite"))

    if TRUNK_WORD.search(text) and not named:
        # "the trunk road" with no endpoints named: at least be ON a major road
        if near_major is None or d_major > NAMED_ROUTE_TOL_M or near_major.kind != "road":
            claim = _first_claim(rec, TRUNK_WORD)
            out.append(Finding(
                rid, region, "route", "med",
                clip(claim[1] if claim else "claims a trunk road"),
                f"nearest major road is {near_major.label if near_major else 'none'} "
                f"at {d_major:.0f} m",
                "rewrite"))

    generic = _first_claim(rec, GENERIC_ROAD)
    if generic and d_any > GENERIC_ROAD_TOL_M:
        sev = "high" if d_any > 400 else "med"
        out.append(Finding(rid, region, "route", sev, clip(generic[1]),
                           f"nearest route of any kind "
                           f"({near_any.label if near_any else 'none'}) is {d_any:.0f} m away",
                           "move" if sev == "high" else "rewrite"))

    rel = rec.get("relations") or {}
    known = {r.key for r in ctx.routes} | {n for r in ctx.routes for n in r.names}
    for field_name in ("patrols", "tolls", "travelServiceEdges"):
        for edge in rel.get(field_name) or []:
            if not isinstance(edge, str):
                continue
            m = ROUTE_EDGE_ID.match(edge)
            if not m:
                continue
            tail = m.group(1).lower()
            if any(part in known or any(part in n for n in known) for part in tail.split("-")):
                continue
            out.append(Finding(rid, region, "route", "low",
                               f"relations.{field_name}: {clip(edge, 60)}",
                               "edge names no route in routes.json / waterways.json",
                               "ok-explain"))
    return out


# --------------------------------------------------------------------------- #
# 2. LANDFORM IDENTITY
# --------------------------------------------------------------------------- #
# keyword family per landform class: if the plot relaxed the landform away and
# the identity prose still uses one of these words, the prose is stranded.
LANDFORM_WORDS: dict[str, tuple[str, ...]] = {
    "flood-high": ("flood", "high ground", "dry rise", "rise", "knoll",
                   "above water", "never floods", "creek"),
    "terrace": ("terrace", "flood", "step", "bench", "above the water"),
    "levee": ("levee", "bank", "flood", "embankment"),
    "summit": ("summit", "hill", "height", "peak", "overlook", "crown", "top of"),
    "ridge-end": ("ridge", "spur", "hill", "height", "overlook", "shoulder"),
    "saddle": ("saddle", "pass", "gap", "between the hills"),
    "cliff-bench": ("cliff", "bench", "ledge", "crag", "rock face"),
    "headland": ("headland", "cliff", "point", "promontory", "cape"),
    "island": ("island", "islet", "eyot", "surrounded by water", "offshore"),
    "isthmus": ("isthmus", "neck", "narrow strip", "between two waters"),
    "cave": ("cave", "cavern", "underground", "grotto"),
    "sinkhole": ("sinkhole", "shaft", "collapse", "pit"),
    "hot-spring": ("hot spring", "steam", "warm water", "vent", "sulphur"),
    "waterfall": ("waterfall", "falls", "cataract", "cascade"),
    "gorge": ("gorge", "ravine", "canyon", "chasm", "cleft"),
    "lake-shore": ("lake", "still water"),
    "water-narrows": ("narrows", "narrowest", "span", "bridge", "ferry"),
    "ford": ("ford", "wade", "shallows"),
    "land-bridge": ("land bridge", "causeway", "span"),
    "confluence": ("confluence", "where the rivers", "two channels"),
    "channel-head": ("head of navigation", "channel head", "as far as a hull"),
    "spring": ("spring", "wellhead", "source"),
    "rootmass": ("rootmass", "root mass"),
    "hammock": ("hammock", "dry ground", "rise"),
}
RELAXED_LANDFORM = re.compile(r"no free '([a-z0-9-]+)' site was left", re.I)
RELIEF_FAMILY = {"summit", "ridge-end", "cliff-bench", "headland", "flood-high",
                 "terrace", "gorge", "saddle", "levee"}
HARD_FAMILY = {"island", "cave", "waterfall", "hot-spring", "sinkhole"}


def check_landform(ctx: Ctx, rec: dict) -> list[Finding]:
    pos = ctx.pos(rec)
    facts = rec.get("plotFacts") or {}
    if pos is None or not facts:
        return []
    prefs = (rec.get("sitingPrefs") or {}).get("landformClasses") or []
    got = facts.get("landform")
    why = rec.get("whySiteWon") or ""
    m = RELAXED_LANDFORM.search(why)
    wanted = m.group(1) if m else (prefs[0] if prefs and got not in prefs else None)
    if not wanted:
        return []
    # A recorded terrain request for that landform is the resolution (Part 6
    # carves it): report it as low/ok-explain rather than as a contradiction.
    asked = {t.get("kind") for t in rec.get("terrainRequests") or [] if isinstance(t, dict)}
    if wanted in asked or (wanted == "flood-high" and {"dry-rise", "knoll"} & asked):
        return [Finding(rec["id"], ctx.region_of[rec["id"]], "landform", "low",
                        clip(f"terrainRequests asks for '{wanted}'"),
                        "the plot found none; the meso compiler will make it (Part 6)", "ok-explain")]
    words = LANDFORM_WORDS.get(wanted)
    if not words:
        return []
    hit = None
    for fname, sentence in identity_claims(rec):
        low = sentence.lower()
        for w in words:
            if w in low:
                hit = (fname, sentence, w)
                break
        if hit:
            break
    if hit is None:
        return []
    t = ctx.terrain.terrain_at(*pos)
    fact = (f"landed on '{got}' ({t['regionName']}); relief within 150 m "
            f"{t['relief150M']:.1f} m, slope {t['slopeDeg']:.1f} deg, "
            f"{t['heightAboveWaterM']:.1f} m above local water — no '{wanted}' here")
    flat = t["relief150M"] < 4.0 and t["slopeDeg"] < 4.0
    sev = "high" if (wanted in RELIEF_FAMILY and flat) or wanted in HARD_FAMILY else "med"
    if got == "anchor":
        # the nine settlement anchors are owner-pinned: the ground cannot move,
        # so the only honest resolution is prose (or an explained exception).
        sev, res = "low", "rewrite"
    else:
        res = "move" if sev == "high" else "rewrite"
    return [Finding(rec["id"], ctx.region_of[rec["id"]], "landform", sev,
                    clip(f"{hit[0]}: {hit[1]}"), fact, res)]


# --------------------------------------------------------------------------- #
# 3. WATER IDENTITY
# --------------------------------------------------------------------------- #
BANK_CLAIM = re.compile(
    r"\bon the (?:bank|water|quay|wharf)\b|\bquay\b|\blanding\b|\bstilts?\b|\bjetty\b|"
    r"\bmoor(?:ed|ing)\b|\bover the channel\b|\bwaterfront\b|\btide\b|"
    r"\bat the water'?s edge\b|\bharbour\b|\banchorage\b", re.I)
ISLAND_CLAIM = re.compile(r"\bisland\b|\bislet\b|\bsurrounded by water\b|\boffshore\b", re.I)
SUBMERGED_CLAIM = re.compile(r"\bsubmerged\b|\bunderwater\b|\bdrowned\b|\bbeneath the water\b|"
                             r"\bbelow the water\b|\bsunken\b", re.I)


def check_water(ctx: Ctx, rec: dict) -> list[Finding]:
    pos = ctx.pos(rec)
    facts = rec.get("plotFacts") or {}
    if pos is None:
        return []
    rid, region = rec["id"], ctx.region_of[rec["id"]]
    water_m = float(facts.get("distanceToWaterM", 0.0))
    out: list[Finding] = []

    bank = _first_claim(rec, BANK_CLAIM)
    if bank and water_m > BANK_MAX_M:
        sev = "high" if water_m > 200 else "med"
        out.append(Finding(rid, region, "water", sev, clip(f"{bank[0]}: {bank[1]}"),
                           f"{water_m:.0f} m from the nearest water",
                           "move" if sev == "high" else "rewrite"))

    isl = _first_claim(rec, ISLAND_CLAIM)
    if isl and water_m > ISLAND_MAX_M:
        # "an island" inside a vibe sentence can describe one house or a mid-
        # channel customs post, not the place itself. Only the NAME or the
        # siting wish makes the whole record an island.
        prefs = rec.get("sitingPrefs") or {}
        is_own = ISLAND_CLAIM.search(rec.get("name") or "") is not None or \
            "island" in " ".join(prefs.get("landformClasses") or []).lower() or \
            ISLAND_CLAIM.search(" ".join(prefs.get("hardConstraints") or [])) is not None
        out.append(Finding(rid, region, "water", "high" if is_own else "low",
                           clip(f"{isl[0]}: {isl[1]}"),
                           f"{water_m:.0f} m from water — "
                           + ("not an island" if is_own
                              else "an island detail in the prose with no water near the dot"),
                           "move" if is_own else "rewrite"))

    ua = rec.get("underwaterAccess")
    entrance = rec.get("entrance")
    needs_depth = ua in {"dive-entry", "flooded-interior", "submerged", "dive"} \
        or entrance in {"underwater-entry", "flooded"}
    sub = _first_claim(rec, SUBMERGED_CLAIM)
    if needs_depth or sub:
        t = ctx.terrain.terrain_at(*pos)
        if t["maxDepthNearbyM"] < UNDERWATER_MIN_DEPTH_M:
            claim = (f"underwaterAccess={ua}, entrance={entrance}"
                     if needs_depth else clip(sub[1]))
            out.append(Finding(rid, region, "water", "high", clip(claim),
                               f"deepest water within 150 m is {t['maxDepthNearbyM']:.1f} m",
                               "move"))
    if ua in {None, "none"} and entrance in {"underwater-entry", "flooded"}:
        out.append(Finding(rid, region, "water", "med",
                           f"entrance={entrance} but underwaterAccess={ua}",
                           "the two access fields disagree", "rewrite"))
    return out


# --------------------------------------------------------------------------- #
# 4. NEIGHBOUR IDENTITY
# --------------------------------------------------------------------------- #
SIGHT_CLAIM = re.compile(r"within sight of|visible from|in sight of|overlook(?:s|ing)?|"
                         r"looks down on", re.I)
BESIDE_CLAIM = re.compile(r"\bbeside\b|\bbeneath\b|\bat the foot of\b|\bunder the walls of\b|"
                          r"\bhard by\b", re.I)
ACROSS_CLAIM = re.compile(r"across the water from|across the channel from|opposite", re.I)
HOUR_CLAIM = re.compile(r"an hour(?:'s)?(?: walk| row| pole)?", re.I)
DAY_CLAIM = re.compile(r"a day'?s (?:walk|march|row|travel)", re.I)


def _named_refs(ctx: Ctx, rec: dict, text: str) -> list[str]:
    own = rec["id"]
    refs = [m for m in PLACE_ID.findall(text) if m != own and m in ctx.records]
    low = text.lower()
    zone_names = ctx.names_by_region.get(ctx.region_of[own], {})
    for name, pid in sorted(zone_names.items(), key=lambda kv: -len(kv[0])):
        if pid != own and pid not in refs and name.lower() in low:
            refs.append(pid)
    return refs


def check_neighbour(ctx: Ctx, rec: dict) -> list[Finding]:
    pos = ctx.pos(rec)
    rid, region = rec["id"], ctx.region_of[rec["id"]]
    out: list[Finding] = []

    if pos is not None:
        for fname, sentence in identity_claims(rec):
            for ref in _named_refs(ctx, rec, sentence):
                other = ctx.records[ref]
                opos = ctx.pos(other)
                d = ctx.distance(rec, other)
                if d is None or opos is None:
                    continue
                other_name = other.get("name") or ref
                if SIGHT_CLAIM.search(sentence):
                    if d > SIGHTLINE_MAX_M:
                        out.append(Finding(rid, region, "neighbour", "high",
                                           clip(f"{fname}: {sentence}"),
                                           f"{other_name} is {d:.0f} m away — "
                                           "beyond any sightline", "rewrite"))
                    elif not ctx.terrain.line_of_sight(pos[0], pos[1], opos[0], opos[1]):
                        out.append(Finding(rid, region, "neighbour", "med",
                                           clip(f"{fname}: {sentence}"),
                                           f"{other_name} is {d:.0f} m away but the terrain "
                                           "blocks the view", "move"))
                elif BESIDE_CLAIM.search(sentence) and d > BESIDE_MAX_M:
                    out.append(Finding(rid, region, "neighbour", "med",
                                       clip(f"{fname}: {sentence}"),
                                       f"{other_name} is {d:.0f} m away", "rewrite"))
                elif ACROSS_CLAIM.search(sentence) and d > SIGHTLINE_MAX_M:
                    out.append(Finding(rid, region, "neighbour", "med",
                                       clip(f"{fname}: {sentence}"),
                                       f"{other_name} is {d:.0f} m away", "rewrite"))
                elif DAY_CLAIM.search(sentence) and d < DAY_WALK_MIN_M:
                    out.append(Finding(rid, region, "neighbour", "low",
                                       clip(f"{fname}: {sentence}"),
                                       f"{other_name} is only {d:.0f} m away", "rewrite"))
                elif HOUR_CLAIM.search(sentence) and d > HOUR_WALK_M:
                    out.append(Finding(rid, region, "neighbour", "low",
                                       clip(f"{fname}: {sentence}"),
                                       f"{other_name} is {d:.0f} m away", "rewrite"))

    rel = rec.get("relations") or {}
    for field_name, limit in (("reachedVia", REACHED_VIA_MAX_M),
                              ("supplies", SUPPLIES_MAX_M),
                              ("dependsOn", SUPPLIES_MAX_M)):
        for ref in rel.get(field_name) or []:
            if not isinstance(ref, str) or not ref.startswith("place."):
                continue
            other = ctx.records.get(ref)
            if other is None:
                out.append(Finding(rid, region, "neighbour", "med",
                                   f"relations.{field_name} -> {ref}",
                                   "target id does not exist in the catalogue", "rewrite"))
                continue
            st = other.get("status")
            if st not in LIVE_STATUSES:
                # reachedVia is an access promise; supplies/dependsOn is economy
                # colour, so a dead target there is quieter.
                out.append(Finding(rid, region, "neighbour",
                                   "med" if field_name == "reachedVia" else "low",
                                   f"relations.{field_name} -> {ref}",
                                   f"target is {st} — dangling edge", "swap"))
                continue
            d = ctx.distance(rec, other)
            if d is not None and d > limit:
                out.append(Finding(rid, region, "neighbour", "low",
                                   f"relations.{field_name} -> {other.get('name') or ref}",
                                   f"{d:.0f} m away (over the {limit:.0f} m sanity limit)",
                                   "rewrite"))
    return out


# --------------------------------------------------------------------------- #
# 5. REGION / CULTURE IDENTITY
# --------------------------------------------------------------------------- #
VIBE_TERRAIN_WORDS = {
    "mountain": ("border mountains", "upland hills", "upland plateau"),
    "hillside": ("upland hills", "border mountains", "upland plateau"),
    "cliff": ("border mountains", "upland hills", "tidal delta", "firm lowland"),
    "the sea": ("ocean", "tidal delta", "coastal lagoon & salt marsh", "mangrove forest"),
    "open sea": ("ocean", "tidal delta", "coastal lagoon & salt marsh"),
    "surf": ("ocean", "tidal delta", "coastal lagoon & salt marsh"),
    "jungle": ("tropical jungle", "rootland deep marsh", "interior swamp"),
}


def check_region(ctx: Ctx, rec: dict) -> list[Finding]:
    pos = ctx.pos(rec)
    facts = rec.get("plotFacts") or {}
    if pos is None or not facts:
        return []
    rid, region = rec["id"], ctx.region_of[rec["id"]]
    out: list[Finding] = []
    wants = (rec.get("sitingPrefs") or {}).get("regionClasses") or []
    got = facts.get("regionClass")
    cls = (rec.get("classification") or {}).get("class")
    anchored = facts.get("landform") == "anchor"
    if wants and got not in wants:
        sev = "high" if cls in {"settlement", "works", "transit"} else "med"
        if anchored:
            sev = "low"
        out.append(Finding(rid, region, "region", sev,
                           f"sitingPrefs.regionClasses = {', '.join(wants)}",
                           f"landed in '{got}'"
                           + (" (owner-pinned anchor — prose must yield)" if anchored else ""),
                           "rewrite" if (anchored or sev != "high") else "move"))

    t = ctx.terrain.terrain_at(*pos)
    if t.get("culture") and t["culture"] != region and not anchored:
        out.append(Finding(rid, region, "region", "med",
                           f"catalogued in the {region} zone",
                           f"the culture raster reads '{t['culture']}' at this position",
                           "move"))

    text = identity_text(rec)
    for word, ok_regions in VIBE_TERRAIN_WORDS.items():
        # whole-word match only: substring matching read 'surface-swim' as
        # 'surf' and 'seasonal' as 'the sea', which produced a dozen false
        # 'prose says surf' findings across the coastal region files.
        if re.search(rf"\b{re.escape(word)}\b", text) and got not in ok_regions:
            out.append(Finding(rid, region, "region", "low",
                               f"identity prose says '{word}'",
                               f"landed in '{got}'", "rewrite"))
            break
    return out


# --------------------------------------------------------------------------- #
# 6. DANGER IDENTITY
# --------------------------------------------------------------------------- #
OCCUPANT_D = re.compile(r"\bD([0-5])\b")


def check_danger(ctx: Ctx, rec: dict) -> list[Finding]:
    facts = rec.get("plotFacts") or {}
    if not facts:
        return []
    rid, region = rec["id"], ctx.region_of[rec["id"]]
    out: list[Finding] = []
    tier = DANGER_TIER.get(rec.get("dangerTier") or "")
    band = facts.get("dangerBand")
    if tier is not None and band is not None and abs(tier - int(band)) > 1:
        sev = "high" if abs(tier - int(band)) >= 3 else "med"
        out.append(Finding(rid, region, "danger", sev,
                           f"dangerTier {rec.get('dangerTier')}",
                           f"danger raster reads band {band} here", "rewrite"))
    levels = [int(m) for occ in (rec.get("occupants") or []) if isinstance(occ, str)
              for m in OCCUPANT_D.findall(occ)]
    if tier is not None and levels and max(levels) > tier + 1:
        out.append(Finding(rid, region, "danger", "low",
                           f"occupants up to D{max(levels)}",
                           f"record dangerTier is {rec.get('dangerTier')}", "rewrite"))
    return out


# --------------------------------------------------------------------------- #
# 7. DISCOVERY / ENTRANCE
# --------------------------------------------------------------------------- #
LAIR_CLASSES = {"lair", "ruin", "dungeon", "vault", "tomb"}


def check_discovery(ctx: Ctx, rec: dict) -> list[Finding]:
    pos = ctx.pos(rec)
    if pos is None:
        return []
    x, z = pos
    rid, region = rec["id"], ctx.region_of[rec["id"]]
    out: list[Finding] = []
    disc = rec.get("discovery")

    if disc == "road":
        _r, d = ctx.nearest_route(x, z, major_only=False)
        if d > ROAD_DISCOVERY_M:
            out.append(Finding(rid, region, "discovery", "med", "discovery = road",
                               f"nearest route of any kind is {d:.0f} m away", "rewrite"))
    elif disc == "sightline":
        seen = False
        for r in ctx.routes:
            for px, pz in r.points:
                if math.hypot(px - x, pz - z) <= SIGHTLINE_DISCOVERY_M and \
                        ctx.terrain.line_of_sight(x, z, px, pz):
                    seen = True
                    break
            if seen:
                break
        if not seen:
            out.append(Finding(rid, region, "discovery", "med", "discovery = sightline",
                               f"not visible from any route within "
                               f"{SIGHTLINE_DISCOVERY_M:.0f} m", "rewrite"))

    cls = (rec.get("classification") or {}).get("class")
    if rec.get("entrance") == "none" and cls in LAIR_CLASSES:
        out.append(Finding(rid, region, "discovery", "low",
                           f"entrance = none on a {cls}",
                           "an interior class with no way in", "rewrite"))
    return out


# --------------------------------------------------------------------------- #
# 8. GENERIC / RELAXATION / DUPLICATE PROSE
# --------------------------------------------------------------------------- #
RELAXATION_WORDS = re.compile(
    r"neighbouring zone|lower bar|region relaxed|homeless batch|relaxed", re.I)
DUP_FIELDS = ("silhouette", "signatureFeature", "approach")


def check_generic(ctx: Ctx, rec: dict) -> list[Finding]:
    rid, region = rec["id"], ctx.region_of[rec["id"]]
    why = rec.get("whySiteWon") or ""
    out: list[Finding] = []
    m = RELAXATION_WORDS.search(why)
    if m:
        out.append(Finding(rid, region, "generic", "low",
                           f"plot relaxation: '{m.group(0)}'", clip(why, 120), "ok-explain"))
    return out


def _tokens(rec: dict) -> set[str]:
    vibe = rec.get("vibe") or {}
    text = " ".join(str(vibe.get(f) or "") for f in DUP_FIELDS).lower()
    return {w for w in re.findall(r"[a-z]{4,}", text)}


def check_duplicates(ctx: Ctx, records: list[dict]) -> list[Finding]:
    """Near-duplicate identity prose between two places within 1 km."""
    sited = [r for r in records if ctx.pos(r) is not None]
    toks = {r["id"]: _tokens(r) for r in sited}
    out: list[Finding] = []
    for i, a in enumerate(sited):
        ta = toks[a["id"]]
        if len(ta) < 5:
            continue
        for b in sited[i + 1:]:
            d = ctx.distance(a, b)
            if d is None or d > DUPLICATE_MAX_M:
                continue
            tb = toks[b["id"]]
            if len(tb) < 5:
                continue
            j = len(ta & tb) / len(ta | tb)
            if j >= DUPLICATE_JACCARD:
                out.append(Finding(a["id"], ctx.region_of[a["id"]], "generic", "med",
                                   clip((a.get("vibe") or {}).get("silhouette") or a["id"]),
                                   f"reads {j:.0%} the same as {b.get('name') or b['id']} "
                                   f"{d:.0f} m away", "rewrite"))
    return out


# --------------------------------------------------------------------------- #
# driver
# --------------------------------------------------------------------------- #
CHECKS: tuple[tuple[str, Callable[[Ctx, dict], list[Finding]]], ...] = (
    ("route", check_route),
    ("landform", check_landform),
    ("water", check_water),
    ("neighbour", check_neighbour),
    ("region", check_region),
    ("danger", check_danger),
    ("discovery", check_discovery),
    ("generic", check_generic),
)


def audit(ctx: Ctx) -> list[Finding]:
    live = [rec for _rid, rec in sorted(ctx.records.items())
            if rec.get("status") in LIVE_STATUSES]
    out: list[Finding] = []
    for rec in live:
        for _name, fn in CHECKS:
            out.extend(fn(ctx, rec))
    out.extend(check_duplicates(ctx, live))
    return sorted(out, key=Finding.sort_key)


def load_places() -> list[tuple[str, list[dict]]]:
    """(region, places) for every catalogue file.

    Uses `catalogue.load_region_files()` (the one loader) but falls back to a
    plain read when the catalogue's schemaVersion gate is mid-migration — this
    is a read-only reporter and must not be blocked by a schema bump landing in
    another agent's working tree.
    """
    try:
        return [(rf.region, rf.places) for rf in catalogue.load_region_files()]
    except ValueError:
        out = []
        for path in sorted(catalogue.CATALOGUE_DIR.glob("places-*.json")):
            doc = json.loads(path.read_text())
            out.append((doc["region"], doc["places"]))
        return out


def build_ctx(terrain: Terrain | None = None, province: Path = PROVINCE) -> Ctx:
    records: dict[str, dict] = {}
    region_of: dict[str, str] = {}
    for region, places in load_places():
        for rec in places:
            records[rec["id"]] = rec
            region_of[rec["id"]] = region
    return Ctx(terrain=terrain or SurveyTerrain(), routes=load_routes(province),
               records=records, region_of=region_of)


# --------------------------------------------------------------------------- #
# report
# --------------------------------------------------------------------------- #
def _counts(findings: list[Finding], key: Callable[[Finding], str]) -> dict[str, dict[str, int]]:
    out: dict[str, dict[str, int]] = {}
    for f in findings:
        row = out.setdefault(key(f), {"high": 0, "med": 0, "low": 0, "total": 0})
        row[f.severity] += 1
        row["total"] += 1
    return dict(sorted(out.items()))


def report_json(ctx: Ctx, findings: list[Finding]) -> dict:
    live = sum(1 for r in ctx.records.values() if r.get("status") in LIVE_STATUSES)
    flagged = {f.id for f in findings}
    return {
        "schemaVersion": SCHEMA_VERSION,
        "generatedBy": "worldgen.audit_place_semantics (Phase 11 Part 4)",
        "livePlaces": live,
        "placesWithFindings": len(flagged),
        "findingCount": len(findings),
        "bySeverity": {s: sum(1 for f in findings if f.severity == s)
                       for s in ("high", "med", "low")},
        "byCheck": _counts(findings, lambda f: f.check),
        "byRegion": _counts(findings, lambda f: f.region),
        "byResolution": _counts(findings, lambda f: f.resolution),
        "findings": [f.to_json() for f in findings],
    }


def report_md(doc: dict) -> str:
    L = ["# Place semantic audit", "",
         "Generated by `python3 -m worldgen.audit_place_semantics` "
         "(`tooling/world-generation/worldgen/audit_place_semantics.py`). It compares what "
         "each plotted record **claims** (name, `why.*`, `vibe.*`, `sitingPrefs.*`, "
         "`relations.*`) with what the published rasters and the route graph **measure**. "
         "It edits nothing; every row is a decision for a human or an authoring agent: "
         "**move** the place, **rewrite** its identity, **swap** in a reserve place, "
         "**cut** it, or **ok-explain** (the claim is defensible — record why).",
         "",
         f"* live places: **{doc['livePlaces']}**",
         f"* places with at least one finding: **{doc['placesWithFindings']}**",
         f"* findings: **{doc['findingCount']}** "
         f"(high {doc['bySeverity']['high']}, med {doc['bySeverity']['med']}, "
         f"low {doc['bySeverity']['low']})",
         "", "## By check", "", "| check | high | med | low | total |",
         "|---|---:|---:|---:|---:|"]
    for k, v in doc["byCheck"].items():
        L.append(f"| {k} | {v['high']} | {v['med']} | {v['low']} | {v['total']} |")
    L += ["", "## By region", "", "| region | high | med | low | total |",
          "|---|---:|---:|---:|---:|"]
    for k, v in doc["byRegion"].items():
        L.append(f"| {k} | {v['high']} | {v['med']} | {v['low']} | {v['total']} |")
    L += ["", "## By suggested resolution", "", "| resolution | high | med | low | total |",
          "|---|---:|---:|---:|---:|"]
    for k, v in doc["byResolution"].items():
        L.append(f"| {k} | {v['high']} | {v['med']} | {v['low']} | {v['total']} |")
    L += ["", "## Findings", "", "Sorted by severity, then region, then id.", "",
          "| id | check | sev | claim | fact | resolution |", "|---|---|---|---|---|---|"]
    for f in doc["findings"]:
        claim = clip(f["claim"]).replace("|", "\\|")
        fact = clip(f["fact"], 140).replace("|", "\\|")
        L.append(f"| `{f['id']}` | {f['check']} | {f['severity']} | {claim} | {fact} "
                 f"| {f['resolution']} |")
    return "\n".join(L) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser(description="Semantic audit of the plotted place catalogue.")
    ap.add_argument("--json-only", action="store_true", help="skip the markdown report")
    args = ap.parse_args()

    ctx = build_ctx()
    findings = audit(ctx)
    doc = report_json(ctx, findings)
    REPORT_JSON.parent.mkdir(parents=True, exist_ok=True)
    REPORT_JSON.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n")
    if not args.json_only:
        REPORT_MD.parent.mkdir(parents=True, exist_ok=True)
        REPORT_MD.write_text(report_md(doc))
    print(f"{doc['findingCount']} findings over {doc['placesWithFindings']} places "
          f"(high {doc['bySeverity']['high']}, med {doc['bySeverity']['med']}, "
          f"low {doc['bySeverity']['low']})")
    for k, v in doc["byCheck"].items():
        print(f"  {k:10s} {v['total']:4d}  (high {v['high']})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
