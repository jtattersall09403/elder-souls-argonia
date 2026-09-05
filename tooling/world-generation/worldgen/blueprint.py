"""Settlement blueprint schema + validator (Phase 11 Part 0 item 3, decision 0041).

Realises module 40 §30's `SettlementBlueprint` / `GenerationProvenance` and
quests 20 §13's `QuestWorldProvision` as a concrete JSON authoring format the
deterministic compiler consumes. Semantic authoring throughout: actors are
S-ladder refs (module 76 §128), loot is tier+provenance, never numbers.

Data layout (authoring data, next to the catalogue it details):

    world/sources/blueprints/<place-id>.json      # one blueprint per place
        { "schemaVersion": 1, "blueprint": { ... } }

Blueprint fields (module 40 §30 + the 0041 forward-compat contracts):

  id                place.<region>.<slug> — MUST exist in the catalogue
  (every placed object's id is <kind>.<slug>.<name> — district / parcel /
  route / canal / boardwalk / landmark / dock / combat / socket / variant /
  travel / kept / candidate — so quests and code can address it; standard 2.
  A questSocket may instead carry the catalogue socket id it realises, and
  a variant carries `stateRef` for the catalogue state it realises.)
  seed              compile seed (standard 6)
  causalModel       {founding, siteAdvantages, occupantsMotive, pressures,
                    wouldChangeIf} — long form of the catalogue's `why`
  boundary          polygon [[u,v], ...] in province UV
  districts[]       {id, kind, boundary, cultureKit (a KIT SET id — see
                    KIT_SETS below; one set per district, never blended;
                    the set's culture carries the two-culture rule),
                    wealth, notes}
  routes[]/canals[]/boardwalks[]/fences[]   WAYS. Authored as `via` (the
                    waypoints [[u,v],...] the designer chose, with a why) and
                    `routing` ("terrain" — the street router finds the least-
                    cost line between waypoints over slope/water/parcels;
                    "straight" — a surveyed grid or an Imperial road;
                    "arc" — a curve through the waypoints); `points` is
                    DERIVED by `worldgen.street_router --apply`. `endsAt`
                    lists the parcel/dock/landmark ids the way terminates at
                    (a boardwalk that ends at a deck ATTACHES to it; that is
                    the only way a way may touch a building). kinds — route:
                    road|track|footpath|stair|ramp; canal: canal (a cut) |
                    channel (a dredged navigation line into open water);
                    boardwalk: boardwalk|pier; fence: fence|wall|palisade|
                    hedge (assetRef of the kit piece, drawn on the map).
                    Every way carries `why` (owner 2026-09-05).
  why (on districts, parcels, landmarks, docks)   the plain-English record a
                    reviewer reads on click, reference register:
                    {what, whyHere (why it is in this place at all),
                    whySpot (why this exact spot), whyNeighbours (why it sits
                    with the things around it), playerPurpose (what it gives
                    the player), microGeography (how it uses the ground:
                    contour, fall, water edge, shelter, view)}. REQUIRED on
                    parcels and landmarks; districts and docks carry what /
                    whyHere / whyNeighbours / playerPurpose / microGeography.
  approaches[]      REQUIRED (>=1; >=2 for M3+): how a WALKING player arrives
                    — {id approach.<slug>.<name>, mode (walk|boat|swim),
                    fromRouteId or fromDirection, firstSeen (a landmark or
                    parcel id: the first thing that reads on the horizon),
                    sequence (plain sentence: what is seen in what order),
                    wayfinding (how the player finds the gate / centre /
                    the door they want), notes}. The design is judged from
                    the ground, never from the air (owner 2026-09-05; the
                    research is docs/research/…/openworld-approach-and-wayfinding.md).
  networkTerminals[] REQUIRED (>=1) for any blueprint whose catalogue record is
                    reached by the province network (`discovery: "road"`, or a
                    `reachedVia` route list): the points where the PROVINCE
                    network meets this place's boundary — the gate, the
                    landing, the path head. Owner requirement 2026-09-05: the
                    roads and paths into a place must be one continuous network
                    with the streets inside it, so a blueprint may not invent a
                    gate and an approach road at odds with the plotted network.
                      {id terminal.<slug>.<name>,
                       routeId  a REAL province route id — a major road
                                (`route.road.*`), a lane/channel
                                (`route.boat.*`) or a minor path
                                (`track.<region>.<slug>`), as published in
                                routes.json / waterways.json / routes-minor.json,
                       entryUV  [u,v] where the network meets the boundary,
                       wayId    the blueprint way that CONTINUES it inside,
                       kind     road|track|footpath|boardwalk|lane,
                       why      why the network arrives here and not elsewhere}
                    Every `approaches[].fromRouteId` must name a terminal's
                    `routeId`: an approach arrives along a route the province
                    actually has. Geometry is checked by the `network-stitch`
                    pass in `blueprint_integration` (97 C-stitch): the route
                    passes within 3 m of `entryUV`, the named way starts or
                    ends within 1.5 m of it, the way's class is not lower than
                    the route's, a `spans` gate stands on a road/track
                    terminal's way, and no road/track way crosses the boundary
                    anywhere else (an unplanned second entrance).
  scaleGrounding    REQUIRED: {loreSource, population (int or "a–b"),
                    households, buildingsPlanned, npcsPlanned, why} — the
                    place's size derived from the lore/demographics, with the
                    parcel count within ±25 % of buildingsPlanned.
  parcels may carry `abuts: [<parcel id>, ...]` + `abutsWhy` — the declared
                    exception to the 8 m spacing floor (97 C5) for pieces that
                    were designed to touch (a hut on its deck, a shed against a
                    wall); an undeclared close pair fails `parcel-gap` at
                    compile. Districts may carry `routing: "straight"` to
                    declare a surveyed grid culture, the one exception to the
                    yaw-diversity rule (97 C2/C8). Parcels may carry
                    `stacksOn: <parcel id>` (a piece that stands ON another
                    parcel's deck — a scaffold top on its base, a hut on a
                    platform; the integration pass allows that one overlap and
                    the compiler places it at the base piece's deck height), and
  parcels may carry `spans: <way id>` (a gate/arch that must stand ACROSS the
                    way — checked by the integration pass) and
                    `interior: {kind: "dwelling"|"shop"|"hall"|"shell"|"none",
                    assetRef?}` — the DESIGNER's intent for what is inside
                    (a dwelling, a shop, a hall). What the KIT can deliver is
                    derived, not authored: see doors[] and
                    `worldgen.blueprint_interiors`.
  parcels[]         {id, districtId, use, centreUV, yawDeg, orientationWhy,
                    assetRef, footprint (DERIVED), buildingFamily, groundFit}

                    Authoring rule (owner ruling 2026-09-05): a parcel is
                    authored as WHERE (`centreUV` [u,v]), WHICH PIECE
                    (`assetRef` — an exact kit asset id, picked on measured
                    geometry, never on its name), WHICH WAY (`yawDeg`, degrees
                    clockwise from north — REQUIRED) and WHY THAT WAY
                    (`orientationWhy`, one plain sentence: "aligned to the
                    contour behind it", "door to the quay" — REQUIRED).
                    `footprint` is then DERIVED from the asset's measured
                    ground hull by `worldgen.blueprint_footprints --apply`
                    and must never be hand-edited; the validator recomputes it
                    and fails on any drift. Optional `outline` picks
                    "footprintM" (ground contact, default) or "planOutlineM"
                    (the full silhouette — stilt pieces whose ground band is
                    only piles).
                    groundFit is "direct"|"plinth"|"pad"|"stilt"|"dug-in" —
                    the slope ladder; the compiler may only relax DOWN this
                    list, never grade Δ≥2 m. buildingFamily stays as the
                    asset-inventory family the pick belongs to.
  siting            REQUIRED on any blueprint of a catalogue record (97 B1;
                    the Part 0 fixture, compiled --skip-catalogue, is exempt):
                    {dossier, candidates[{id, positionM, why, chosen?,
                    rejectedBecause?}]} — >=2 candidates, one chosen; the
                    deliberation the macro plot could not do
  landmarks[]       {id, kind, position, assetRef, notes}
                    (optional yawDeg + scale; scale is a UNIFORM factor 0.2–5
                    for natural pieces only — the sourced anvilgianttrunk at
                    ~0.45 is the Nine-Trunks case; kit architecture stays 1.
                    Parcels may carry `scale` under the same rule; the derived
                    footprint and the compiler honour it)
  docks[]           {id, position, waterBodyId, piledToBed: true}
  combatSpaces[]    REQUIRED (>=1, each with boundary, clearanceClass and a
                    why — 97 D9): open ground where
                    a fight CAN happen (a quest, a hostility flip, a night
                    attack) and where critical-animation clearance is checked;
                    a safe city still has them, each with its why.
  questSockets[]    {id, kind ("scene"|"evidence"|"container"|"npc"|
                    "encounter"|"boss"|"station"|"mark"), position?,
                    parcelId?, ownerQuestTier?}
  doors[]           {id (door.<region>.<slug>.<n>), parcelId, facingDeg,
                    thresholdUV, interiorClaim {sizeClass, culture, interiorRef,
                    owner?}}
                    — Phase 12's fill points AND the interior streaming
                    boundary; reachability validated every compile.
                    `facingDeg` is checked against geometry: the validator
                    finds the footprint edge nearest the threshold and requires
                    facingDeg within DOOR_FACING_TOLERANCE_DEG (±100°) of that
                    edge's OUTWARD normal, so a door cannot claim a side the
                    building does not have. The tolerance is deliberately loose
                    — a hull edge is a chord of a curved wall and a threshold
                    may sit at a corner — so this catches doors placed on the
                    wrong face, not fine aiming.

                    Owner ruling 2026-09-05 — "very few buildings have doors;
                    everything intended to have an interior must have one".
                    What a piece has inside is DERIVED from the kits by
                    `pipeline/interiors_index.py` into
                    `output/kits/<kit>.interiors.json`, and the validator holds
                    a blueprint to it:
                      * a parcel whose assetRef has interior matched/tileset/
                        shell MUST have >=1 door; interior "none" must have
                        none (a door onto a deck opens onto nothing);
                      * `interiorClaim.interiorRef` must be the index's
                        interiorAssetRef (a matched interior mesh) or its
                        tileset (the interior kit Phase 12 builds it from);
                      * `interiorClaim.sizeClass` must match the measured plan
                        area — small < 40 m², medium < 120 m², large above;
                      * where the index derived `doorways`, facingDeg must be
                        within ±45° of a doorway side rotated by the parcel's
                        yawDeg, so a door cannot be claimed on a blank wall.
                    `worldgen.blueprint_interiors --report <blueprint>` lists
                    all of this per parcel.
  clearance         {hardClear: [polygon...], thinned: [polygon...],
                    kept: [{id, kind ("hist-tree"|"shade"|"reed-bed"|...),
                    position}]} — graded vegetation clearing; masks feed
                    the scatter compiler
  variants[]        LocalStateVariant slots from v1 (quests 20 §14):
                    {id, changedRefs [], serviceOverrides {}, ambience?}
                    — at most 3 per blueprint; exemplars ship ≥1
  travelServices[]  {id, kind ("ferry"|"boat"|"root"|"water-taxi"),
                    toPlaceId, timetable?}
  occupants[]       {slotId, ladderRef (semantic, e.g. "strong-d3"),
                    cultureRole, ownerFaction?}
  assetConstraints[] free-form strings, checked against the asset inventory
  ownership         optional per-interactable {refId: {owner?, ownerFaction?,
                    valueTier?}} (buildout register: never retrofitted)
  provision         QuestWorldProvision (quests 20 §13) — filled as the
                    packet's co-design loop runs
  budget            declared static budget {maxInstances, maxUniqueMaterials,
                    maxTextureMB, maxColliders} — the compiler's report is
                    checked against it (0041 perf contract)

GenerationProvenance is attached by the COMPILER to every emitted object,
not authored here: {sourceBlueprintId, generatorId, generatorVersion, seed,
ruleId, assetId, sourceDataHashes}.

Module 97 (placement principles) checks live here and in
`blueprint_integration`; each message names its principle id. HARD (fail):
`siting` present (97 B1), `combatSpaces` >=1 with a why (97 D9), yaw diversity
per district (97 C8), the 8 m spacing floor and the 1.3 m passage
(97 C5/C3, in blueprint_integration). WARN (reported by
`validate_blueprint_full` and under `warnings` in the compile output, never
failing): density band (97 C6), `use` histogram (97 C7), way width classes
(97 C3), first-seen line of sight (97 B6/D2, in compile_settlement).

Run: python -m worldgen.blueprint --check   (from tooling/world-generation/)
"""

from __future__ import annotations

import json
import math
import re
import sys
from functools import lru_cache
from pathlib import Path

from . import blueprint_footprints as fp
from . import blueprint_interiors as bi
from . import province_network as pn
from .catalogue import CATALOGUE_DIR, load_region_files

SCHEMA_VERSION = 1
REPO_ROOT = Path(__file__).resolve().parents[3]
BLUEPRINT_DIR = REPO_ROOT / "world" / "sources" / "blueprints"

# Kit SETS a district may be built from (Phase 11 Part 6, owner ruling
# 2026-09-04 "kits only combine pieces designed to combine"): a district names
# ONE set; every piece in a set was packaged to fit the others in it. `culture`
# is the two-culture rule's axis — a place may hold argonian and imperial
# districts side by side, never a blended one. The legacy "argonian"/"imperial"
# ids stay valid for the Part 0 skeleton fixture.
KIT_SETS = {
    "argonian":           {"culture": "argonian", "kits": ["settlement-mud-v1", "settlement-stilt-v1"]},
    "argonian-stilt":     {"culture": "argonian", "kits": ["settlement-stilt-v1", "docks-v1", "watercraft-v1"]},
    "argonian-mud":       {"culture": "argonian", "kits": ["settlement-mud-v1"]},
    "argonian-root":      {"culture": "argonian", "kits": ["settlement-root-v1", "dungeon-root-v1"]},
    "argonian-stone":     {"culture": "argonian", "kits": ["ruin-monumental-v1", "xanmeer-interior-v1"]},
    "imperial":           {"culture": "imperial", "kits": ["settlement-imperial-v1", "imperial-keep"]},
    "dunmer-hlaalu":      {"culture": "dunmer",   "kits": ["hlaalu-domestic"]},
    "neutral-works":      {"culture": "neutral",  "kits": ["works-v1"]},
    "neutral-underwater": {"culture": "neutral",  "kits": ["underwater-v1"]},
}
CULTURE_KITS = set(KIT_SETS)
INTERIOR_CULTURES = {"argonian", "imperial", "dunmer"}
GROUND_FIT = {"direct", "plinth", "pad", "stilt", "dug-in"}
SOCKET_KINDS = {"scene", "evidence", "container", "npc", "encounter", "boss", "station", "mark"}
TRAVEL_KINDS = {"ferry", "boat", "root", "water-taxi"}
MAX_VARIANTS = 3
DOOR_FACING_TOLERANCE_DEG = 100.0
# ±45° against a MEASURED doorway side (blueprint_interiors), which is a real
# direction rather than a hull chord, so it can be tight: a door may sit at the
# corner of its opening, it may not be claimed on a blank wall.
DOORWAY_TOLERANCE_DEG = bi.DOORWAY_TOLERANCE_DEG

REQUIRED = [
    "id", "seed", "causalModel", "boundary", "districts", "parcels",
    "doors", "clearance", "variants", "occupants", "budget",
    "approaches", "scaleGrounding", "combatSpaces",
]

# --- module 97 placement principles the validator holds (2026-09-05) -------
# Each constant carries the principle id its message quotes, so a failure sends
# the reader to one rule in docs/world/97-placement-principles.md.
#
# 97 C3 / D8 — width reads as rank; the spine is the measured road piece.
WAY_WIDTH_CLASS_M = {"road": 4.3, "track": 2.5, "footpath": 1.2, "stair": 1.2, "ramp": 1.2}
WAY_WIDTH_RANK = ["footpath", "stair", "ramp", "track", "road"]
# 97 C5 — nearest-neighbour floor between building centres (measured p10 8.0 m).
PARCEL_GAP_MIN_M = 8.0
# 97 C3 / D8 — two character widths where a way passes between two hulls.
PASSAGE_MIN_M = 1.3
# 97 C6 — buildings per hectare of the boundary, by size class.
DENSITY_BAND = {"M2": (15.0, 33.0), "M3": (7.0, 16.0), "M4": (4.0, 11.0), "M5": (4.0, 11.0)}
# 97 C7 — share of classified parcels by use bucket.
USE_BAND = {"dwelling": (0.60, 0.70), "work": (0.15, 0.25),
            "civic": (0.05, 0.10), "storage": (0.05, 0.10)}
USE_BUCKET = {
    "dwelling": "dwelling", "lodging": "dwelling", "shelter": "dwelling",
    "manor": "dwelling", "longhouse": "dwelling", "quarters": "dwelling",
    "work": "work", "shop": "work", "market": "work", "kiln": "work",
    "quarry": "work", "hoist": "work", "haulage": "work", "pen": "work",
    "scaffold": "work", "under-construction": "work", "mill": "work",
    "quay": "work", "dock": "work",
    "civic": "civic", "ritual": "civic", "shrine": "civic", "hist": "civic",
    "gate": "civic", "watch": "civic", "hall": "civic", "entrance": "civic",
    "storage": "storage",
}
MIN_PARCELS_FOR_MIX = 8       # below this the histogram is noise, not a mix
# 97 C8 — yaw diversity: a uniform bearing reads as copy-paste.
YAW_TOLERANCE_DEG = 5.0
YAW_MAX_SHARE = 0.10
MIN_PARCELS_FOR_YAW = 8       # 10 % of a handful of parcels is not a share
# Size classes from the module 92 ladder, used when the record's magnitude is
# not on the blueprint (M3 12–35 structures, M4 40–120, M5 150–400).
SIZE_CLASS_STEPS = ((12, "M2"), (36, "M3"), (121, "M4"))
WAY_KEYS = ("routes", "canals", "boardwalks", "fences")
WAY_KINDS = {
    "routes": {"road", "track", "footpath", "stair", "ramp"},
    "canals": {"canal", "channel"},
    "boardwalks": {"boardwalk", "pier"},
    "fences": {"fence", "wall", "palisade", "hedge"},
}
ROUTING = {"terrain", "straight", "arc"}
WHY_KEYS_FULL = ("what", "whyHere", "whySpot", "whyNeighbours", "playerPurpose", "microGeography")
WHY_KEYS_AREA = ("what", "whyHere", "whyNeighbours", "playerPurpose", "microGeography")
APPROACH_MODES = {"walk", "boat", "swim"}
# 97 C-stitch — the kinds a network terminal may declare. `lane` is the water
# case: a boat lane ends at a landing, not at a gate.
TERMINAL_KINDS = {"road", "track", "footpath", "boardwalk", "lane"}
INTERIOR_KINDS = {"dwelling", "shop", "hall", "shell", "none"}
MIN_WHY_CHARS = 20
BUDGET_KEYS = {"maxInstances", "maxUniqueMaterials", "maxTextureMB", "maxColliders"}
CAUSAL_KEYS = {"founding", "siteAdvantages", "occupantsMotive", "pressures", "wouldChangeIf"}


# Stable IDs (engineering standard 2): every object a blueprint places is
# addressable by quests and code, so its id is <kind>.<place-slug>.<name>.
ID_KINDS = {
    "districts": "district", "parcels": "parcel", "routes": "route", "canals": "canal",
    "boardwalks": "boardwalk", "fences": "fence", "landmarks": "landmark", "docks": "dock",
    "combatSpaces": "combat", "questSockets": "socket", "variants": "variant",
    "travelServices": "travel", "approaches": "approach",
    "networkTerminals": "terminal",
}
CATALOGUE_SOCKET_RE = re.compile(r"^(?:scene|evidence|station|marks)\.[a-z0-9-]+\.[a-z0-9-]+$")
ID_NAME_RE = r"[a-z0-9]+(?:-[a-z0-9]+)*"


def _id_ok(value, kind: str, slug: str) -> bool:
    return isinstance(value, str) and re.fullmatch(rf"{kind}\.{re.escape(slug)}\.{ID_NAME_RE}", value) is not None


def _polygon_ok(poly) -> bool:
    return (
        isinstance(poly, list) and len(poly) >= 3
        and all(isinstance(p, list) and len(p) == 2 for p in poly)
    )


def _angle_delta(a: float, b: float) -> float:
    """Smallest absolute difference between two compass bearings, degrees."""
    return abs((a - b + 180.0) % 360.0 - 180.0)


def _door_edge_bearing(parcel: dict, threshold_uv) -> float | None:
    """Compass bearing of the OUTWARD normal of the footprint edge nearest the
    threshold. UV is used directly: the province square is square, so bearings
    are the same in UV and in metres. Returns None when the geometry is not
    usable (no footprint, no threshold), because this check is pragmatic."""
    poly = parcel.get("footprint")
    if not _polygon_ok(poly) or not (isinstance(threshold_uv, list) and len(threshold_uv) == 2):
        return None
    tx, tz = float(threshold_uv[0]), float(threshold_uv[1])
    cx = sum(p[0] for p in poly) / len(poly)
    cz = sum(p[1] for p in poly) / len(poly)
    best = None
    for i in range(len(poly)):
        ax, az = poly[i]
        bx, bz = poly[(i + 1) % len(poly)]
        ex, ez = bx - ax, bz - az
        length_sq = ex * ex + ez * ez
        if length_sq == 0:
            continue
        t = max(0.0, min(1.0, ((tx - ax) * ex + (tz - az) * ez) / length_sq))
        px, pz = ax + t * ex, az + t * ez
        dist_sq = (tx - px) ** 2 + (tz - pz) ** 2
        # edge normal, flipped to point away from the centroid
        nx, nz = ez, -ex
        mx, mz = (ax + bx) / 2.0, (az + bz) / 2.0
        if nx * (mx - cx) + nz * (mz - cz) < 0:
            nx, nz = -nx, -nz
        if best is None or dist_sq < best[0]:
            best = (dist_sq, nx, nz)
    if best is None:
        return None
    _, nx, nz = best
    # world axes: x east, z south, so north is -z (same convention as yawDeg)
    return math.degrees(math.atan2(nx, -nz)) % 360.0


def size_class(bp: dict) -> str:
    """The blueprint's size class: its declared magnitude if it carries one,
    else the module 92 ladder read off the planned building count."""
    mag = bp.get("magnitude")
    if isinstance(mag, str) and mag in DENSITY_BAND:
        return mag
    sg = bp.get("scaleGrounding") or {}
    n = sg.get("buildingsPlanned")
    if not isinstance(n, int) or n <= 0:
        n = len(bp.get("parcels", []) or [])
    for limit, cls in SIZE_CLASS_STEPS:
        if n < limit:
            return cls
    return "M5"


def boundary_area_ha(bp: dict, extent_m: float = fp.PROVINCE_EXTENT_M) -> float:
    """Shoelace area of the boundary polygon, hectares. UV is a square province,
    so the conversion is one scale factor."""
    poly = bp.get("boundary")
    if not _polygon_ok(poly):
        return 0.0
    a = 0.0
    for i in range(len(poly)):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % len(poly)]
        a += x1 * y2 - x2 * y1
    return abs(a) / 2.0 * extent_m * extent_m / 10_000.0


def _placement_warnings(bp: dict) -> list[str]:
    """Warn-grade placement checks (module 97 §G: reported, never failing).

    C6 density band, C7 use histogram, C3 way width classes. These are bands
    measured off shipped worlds: a blueprint outside one is usually wrong and
    occasionally right with a reason, which is exactly what a warning is for.
    """
    out: list[str] = []
    bid = bp.get("id", "<missing id>")
    parcels = [p for p in bp.get("parcels", []) or [] if (p.get("use") or "") not in ("fence", "wall")]
    cls = size_class(bp)

    # 97 C6 — density falls as the place grows; growth buys radius, not tightness.
    band = DENSITY_BAND.get(cls)
    area_ha = boundary_area_ha(bp)
    if band and area_ha > 0 and parcels:
        density = len(parcels) / area_ha
        if not (band[0] <= density <= band[1]):
            out.append(f"{bid}: 97 C6 — {len(parcels)} buildings over {area_ha:.2f} ha of boundary is "
                       f"{density:.1f}/ha; the {cls} band is {band[0]:.0f}–{band[1]:.0f}/ha "
                       f"(widen or tighten the boundary, or change the building count)")

    # 97 C7 — the building mix follows the ladder and the lore.
    counts = {k: 0 for k in USE_BAND}
    unclassified = 0
    for p in parcels:
        bucket = USE_BUCKET.get((p.get("use") or "").lower())
        if bucket is None:
            unclassified += 1
        else:
            counts[bucket] += 1
    total = sum(counts.values())
    if total >= MIN_PARCELS_FOR_MIX:
        for bucket, (lo, hi) in USE_BAND.items():
            share = counts[bucket] / total
            if not (lo <= share <= hi):
                out.append(f"{bid}: 97 C7 — {bucket} is {share * 100:.0f} % of the {total} classified "
                           f"parcels ({counts[bucket]}); the band is {lo * 100:.0f}–{hi * 100:.0f} %")
        if unclassified > total * 0.25:
            out.append(f"{bid}: 97 C7 — {unclassified} of {total + unclassified} parcels carry a `use` "
                       f"outside the histogram's vocabulary, so the mix cannot be judged")

    # 97 C3 — width reads as rank: spine 4.3 m, track 2.5 m, footpath 1.2 m.
    widest = {}
    for w in bp.get("routes", []) or []:
        kind, width = w.get("kind"), w.get("widthM")
        want = WAY_WIDTH_CLASS_M.get(kind)
        if want is None or not isinstance(width, (int, float)):
            continue
        widest[kind] = max(widest.get(kind, 0.0), float(width))
        if float(width) < want:
            out.append(f"{bid}: 97 C3 — route {w.get('id')} is a {kind} {float(width):.1f} m wide; "
                       f"the class width is {want} m (spine 4.3, track 2.5, path 1.2)")
    for i in range(len(WAY_WIDTH_RANK)):
        for j in range(i + 1, len(WAY_WIDTH_RANK)):
            lo_k, hi_k = WAY_WIDTH_RANK[i], WAY_WIDTH_RANK[j]
            if lo_k in widest and hi_k in widest and widest[lo_k] > widest[hi_k]:
                out.append(f"{bid}: 97 C3 — a {lo_k} ({widest[lo_k]:.1f} m) is wider than a {hi_k} "
                           f"({widest[hi_k]:.1f} m); width is how a player reads rank")
    return out


def catalogue_ids() -> set[str]:
    return {p["id"] for rf in load_region_files(CATALOGUE_DIR) for p in rf.places if "id" in p}


@lru_cache(maxsize=1)
def catalogue_records() -> dict[str, dict]:
    """{place id: record} — the validator reads `discovery` / `reachedVia` off
    the record to know whether the place is reached by the province network,
    and so whether `networkTerminals` is required (97 C-stitch)."""
    return {p["id"]: p for rf in load_region_files(CATALOGUE_DIR) for p in rf.places if "id" in p}


def needs_terminals(record: dict | None) -> bool:
    """True when the place is reached by the province network: the catalogue
    says it is found by road, or it names the routes it is reached via."""
    if not record:
        return False
    return record.get("discovery") == "road" or bool(record.get("reachedVia"))


def validate_blueprint(bp: dict, known_place_ids: set[str] | None = None, survey=None,
                       warnings: list[str] | None = None) -> list[str]:
    """Hard schema + placement validation; returns the failures.

    `warnings`, when a list is passed, collects the WARN-grade module 97 checks
    (C6 density, C7 use mix, C3 width classes) — reported, never failing. Use
    `validate_blueprint_full` when both are wanted.
    """
    errors: list[str] = []
    bid = bp.get("id", "<missing id>")
    if warnings is not None:
        warnings += _placement_warnings(bp)

    def fail(msg: str) -> None:
        errors.append(f"{bid}: {msg}")

    for key in REQUIRED:
        if key not in bp or bp[key] is None:
            fail(f"missing required field '{key}'")
    if known_place_ids is not None and bid not in known_place_ids:
        fail("id not present in the place catalogue — blueprints detail catalogue records")
    if not set(bp.get("causalModel", {})) >= CAUSAL_KEYS:
        fail(f"causalModel must carry {sorted(CAUSAL_KEYS)}")
    if "boundary" in bp and not _polygon_ok(bp["boundary"]):
        fail("boundary must be a polygon of >=3 [u,v] points")

    slug = bid.rsplit(".", 1)[-1]
    for key, kind in ID_KINDS.items():
        for item in bp.get(key, []) or []:
            iid = item.get("id") if isinstance(item, dict) else None
            if key == "questSockets" and isinstance(iid, str) and CATALOGUE_SOCKET_RE.match(iid):
                continue     # a catalogue socket id realised here
            if not _id_ok(iid, kind, slug):
                fail(f"{key} id {iid!r} must be {kind}.{slug}.<kebab-name> (standard 2)")
    for item in (bp.get("clearance") or {}).get("kept", []) or []:
        if isinstance(item, dict) and not _id_ok(item.get("id"), "kept", slug):
            fail(f"clearance.kept id {item.get('id')!r} must be kept.{slug}.<kebab-name>")
    for item in (bp.get("siting") or {}).get("candidates", []) or []:
        if isinstance(item, dict) and not _id_ok(item.get("id"), "candidate", slug):
            fail(f"siting candidate id {item.get('id')!r} must be candidate.{slug}.<kebab-name>")

    district_ids = set()
    for d in bp.get("districts", []):
        district_ids.add(d.get("id"))
        if d.get("cultureKit") not in CULTURE_KITS:
            fail(f"district {d.get('id')}: cultureKit must be one of {sorted(CULTURE_KITS)} (two-culture rule: one kit set per district, never blended)")
        if not _polygon_ok(d.get("boundary")):
            fail(f"district {d.get('id')}: boundary must be a polygon of >=3 [u,v] points")
        # 97 C2/C8 — a district may DECLARE a surveyed grid (Imperial planting,
        # a Dunmer plantation block); that is the only culture whose buildings
        # may share one bearing.
        if "routing" in d and d["routing"] not in ROUTING:
            fail(f"district {d.get('id')}: 97 C2 — routing must be one of {sorted(ROUTING)} "
                 f"('straight' declares a surveyed grid culture, which is the yaw-diversity exception)")

    library = fp.library()
    for p in bp.get("parcels", []):
        pid = p.get("id")
        if p.get("districtId") not in district_ids:
            fail(f"parcel {pid}: unknown districtId {p.get('districtId')}")
        if p.get("groundFit") not in GROUND_FIT:
            fail(f"parcel {pid}: groundFit must be one of {sorted(GROUND_FIT)}")
        if not p.get("buildingFamily"):
            fail(f"parcel {pid}: needs buildingFamily (asset-inventory ref)")
        if not _polygon_ok(p.get("footprint")):
            fail(f"parcel {pid}: footprint must be a UV polygon of >=3 [u,v] points")
        if not (isinstance(p.get("centreUV"), list) and len(p.get("centreUV", [])) == 2):
            fail(f"parcel {pid}: centreUV must be [u,v] (the parcel is authored by centre + yaw, not by polygon)")
        if not isinstance(p.get("yawDeg"), (int, float)) or isinstance(p.get("yawDeg"), bool):
            fail(f"parcel {pid}: yawDeg is required and must be a number (degrees clockwise from north)")
        if "scale" in p and not (isinstance(p["scale"], (int, float)) and 0.2 <= p["scale"] <= 5.0):
            fail(f"parcel {pid}: scale must be a uniform factor in 0.2–5 (natural pieces only; kit pieces stay 1)")
        why = p.get("orientationWhy")
        if not isinstance(why, str) or len(why.strip()) < 12:
            fail(f"parcel {pid}: orientationWhy is required — one plain sentence saying why the building faces this way (owner ruling 2026-09-05)")
        if not (isinstance(p.get("assetRef"), str) and p.get("assetRef")):
            fail(f"parcel {pid}: assetRef is required — an exact kit asset id chosen on measured geometry (0041 Part 6)")
        elif library and library.get(p["assetRef"]) is None:
            fail(f"parcel {pid}: assetRef {p['assetRef']!r} has no measured footprint — run pipeline.measure_footprints, or pick a piece that exists")
        elif library:
            derived = fp.parcel_footprint(p, library)
            if derived is None:
                fail(f"parcel {pid}: footprint cannot be derived from assetRef + centreUV + yawDeg")
            elif not fp.polygons_match(p.get("footprint"), derived):
                fail(f"parcel {pid}: footprint is not the derived polygon — it is DERIVED, never hand-edited; run 'python3 -m worldgen.blueprint_footprints --apply <file>'")

    # 97 C8 / G17 — yaw diversity. Within a district no more than a tenth of
    # parcels may share a bearing within ±5°, because a uniform yaw reads as
    # copy-paste; a district that declares `routing: "straight"` is a surveyed
    # grid culture (Imperial, Dunmer plantation) and is exempt. The share is
    # only meaningful once a district has MIN_PARCELS_FOR_YAW buildings.
    routing_of = {d.get("id"): d.get("routing") for d in bp.get("districts", [])}
    yaws_by_district: dict[str, list[tuple[str, float]]] = {}
    for p in bp.get("parcels", []):
        if isinstance(p.get("yawDeg"), (int, float)) and not isinstance(p.get("yawDeg"), bool):
            yaws_by_district.setdefault(p.get("districtId"), []).append((p.get("id"), float(p["yawDeg"])))
    for did, entries in sorted(yaws_by_district.items(), key=lambda kv: str(kv[0])):
        if routing_of.get(did) == "straight" or len(entries) < MIN_PARCELS_FOR_YAW:
            continue
        allowed = max(2, math.ceil(YAW_MAX_SHARE * len(entries)))
        for _pid, yaw in entries:
            share = [e for e in entries if _angle_delta(e[1], yaw) <= YAW_TOLERANCE_DEG]
            if len(share) > allowed:
                fail(f"district {did}: 97 C8 — {len(share)} of {len(entries)} parcels face within "
                     f"±{YAW_TOLERANCE_DEG:.0f}° of {yaw:.0f}° ({', '.join(sorted(e[0] for e in share))}); "
                     f"at most {allowed} may, unless the district declares routing 'straight' "
                     f"(a surveyed grid culture)")
                break

    # 97 B1 / G7 — no design before a dossier. A blueprint that details a real
    # catalogue record must carry the meso deliberation; the Part 0 fixture
    # (compiled with --skip-catalogue) is exempt because it details nothing.
    siting = bp.get("siting")
    if siting is None and known_place_ids is not None:
        fail("97 B1 — `siting` is required on a blueprint of a catalogue record: name the site "
             "dossier and the 2–3 measured candidates, with the ground each loser lost on")
    if siting is not None:
        if not isinstance(siting.get("dossier"), str):
            fail("siting.dossier must point at the site dossier this siting cites (module 40 §28)")
        cands = siting.get("candidates")
        if not isinstance(cands, list) or len(cands) < 2:
            fail("siting.candidates must list >=2 candidate sitings (Part 6: 2–3 exact candidates)")
        else:
            for c in cands:
                if not (isinstance(c.get("positionM"), list) and len(c["positionM"]) == 2 and c.get("why")):
                    fail(f"siting candidate {c.get('id')}: needs positionM [x,z] and why")
            if sum(1 for c in cands if c.get("chosen")) != 1:
                fail("siting.candidates must mark exactly one candidate chosen")

    def check_why(owner: str, why, keys) -> None:
        if not isinstance(why, dict):
            fail(f"{owner}: why block is required — plain-English {list(keys)} (owner 2026-09-05)")
            return
        for k in keys:
            v = why.get(k)
            if not isinstance(v, str) or len(v.strip()) < MIN_WHY_CHARS:
                fail(f"{owner}: why.{k} must be a plain sentence (>= {MIN_WHY_CHARS} chars)")

    for d in bp.get("districts", []):
        check_why(f"district {d.get('id')}", d.get("why"), WHY_KEYS_AREA)
    for p in bp.get("parcels", []):
        check_why(f"parcel {p.get('id')}", p.get("why"), WHY_KEYS_FULL)
        if "stacksOn" in p and p["stacksOn"] not in {q.get("id") for q in bp.get("parcels", [])}:
            fail(f"parcel {p.get('id')}: stacksOn must name another parcel in this blueprint")
        if "spans" in p and not isinstance(p["spans"], str):
            fail(f"parcel {p.get('id')}: spans must be a way id")
        # 97 C5 — the 8 m floor's declared exception: pieces that abut BY
        # DESIGN (a hut on its deck, a shed against a wall) name each other and
        # say why. An undeclared pair is caught by `parcel-gap` at compile.
        if "abuts" in p:
            ab = p["abuts"]
            if not isinstance(ab, list) or not ab or not all(isinstance(x, str) for x in ab):
                fail(f"parcel {p.get('id')}: 97 C5 — abuts must list the parcel ids this piece touches by design")
            else:
                for other in ab:
                    if other not in {q.get("id") for q in bp.get("parcels", [])}:
                        fail(f"parcel {p.get('id')}: 97 C5 — abuts names {other!r}, which is not a parcel in this blueprint")
            if not isinstance(p.get("abutsWhy"), str) or len(p["abutsWhy"].strip()) < MIN_WHY_CHARS:
                fail(f"parcel {p.get('id')}: 97 C5 — abutsWhy is required — one plain sentence saying why "
                     f"these pieces were designed to touch (a deck and its hut, a shed on a wall)")
        it = p.get("interior")
        if it is not None and (not isinstance(it, dict) or it.get("kind") not in INTERIOR_KINDS):
            fail(f"parcel {p.get('id')}: interior.kind must be one of {sorted(INTERIOR_KINDS)}")
    for lm in bp.get("landmarks", []):
        check_why(f"landmark {lm.get('id')}", lm.get("why"), WHY_KEYS_FULL)
    for dk in bp.get("docks", []):
        check_why(f"dock {dk.get('id')}", dk.get("why"), WHY_KEYS_AREA)
    # 97 D9 / G20 — every place has at least one combat space with its clearance
    # class and a why, even where it is safe: a hostility flip, a night attack
    # or a quest will use it, and critical animations need the room.
    combat_spaces = bp.get("combatSpaces") or []
    if len(combat_spaces) < 1:
        fail("97 D9 — at least one combatSpace is required, even in a safe place: a hostility flip, "
             "a night attack or a quest will use it, and critical animations need the clearance")
    for cs in combat_spaces:
        if not isinstance(cs.get("why"), str) or len(cs["why"].strip()) < MIN_WHY_CHARS:
            fail(f"combatSpace {cs.get('id')}: 97 D9 — why is required (which quest / hostility flip can put a fight here)")
        if not _polygon_ok(cs.get("boundary")):
            fail(f"combatSpace {cs.get('id')}: 97 D9 — boundary must be a polygon of >=3 [u,v] points")
        if not isinstance(cs.get("clearanceClass"), str) or not cs.get("clearanceClass"):
            fail(f"combatSpace {cs.get('id')}: 97 D9 — clearanceClass is required (the room the animations need)")

    for key in WAY_KEYS:
        for w in bp.get(key, []):
            wid = w.get("id")
            if w.get("kind") not in WAY_KINDS[key]:
                fail(f"{key} {wid}: kind must be one of {sorted(WAY_KINDS[key])}")
            if not isinstance(w.get("widthM"), (int, float)) or w["widthM"] <= 0:
                fail(f"{key} {wid}: widthM must be a positive number")
            if not isinstance(w.get("why"), str) or len(w["why"].strip()) < MIN_WHY_CHARS:
                fail(f"{key} {wid}: why is required (what this way connects and why it runs where it runs)")
            via = w.get("via")
            if not isinstance(via, list) or len(via) < 2 or not all(isinstance(p, list) and len(p) == 2 for p in via):
                fail(f"{key} {wid}: via must be >=2 [u,v] waypoints (ways are authored as waypoints; points are derived)")
            if w.get("routing") not in ROUTING:
                fail(f"{key} {wid}: routing must be one of {sorted(ROUTING)}")
            pts = w.get("points")
            if not isinstance(pts, list) or len(pts) < 2 or not all(isinstance(p, list) and len(p) == 2 for p in pts):
                fail(f"{key} {wid}: points missing — run 'python3 -m worldgen.street_router --apply <file>' (points are derived from via + routing)")
            elif isinstance(via, list) and len(via) >= 2 and w.get("routing") in ROUTING:
                # points are DERIVED: they must still be the router's answer for
                # this via + routing over the real ground (owner ruling 2026-09-05).
                # Imported lazily — street_router imports the schema constants.
                from . import street_router as _sr
                _survey = survey if survey is not None else (
                    _sr.default_survey() if w.get("routing") == "terrain" else None)
                try:
                    derived = _sr.route_way(w, bp, _survey)
                except Exception as exc:  # noqa: BLE001 — reported as a schema failure
                    derived = None
                    fail(f"{key} {wid}: points cannot be derived ({exc})")
                if derived is not None and not (w.get("routing") == "terrain" and _survey is None):
                    extent = float(getattr(_survey, "extent_m", _sr.PROVINCE_EXTENT_M))
                    if not _sr.points_match(pts, derived, extent):
                        fail(f"{key} {wid}: points are not the derived route (they differ from "
                             f"via+routing={w.get('routing')!r} by more than "
                             f"{_sr.MATCH_TOLERANCE_M} m) — run "
                             f"'python3 -m worldgen.street_router --apply <file>'")
            for ref in w.get("endsAt", []) or []:
                if not isinstance(ref, str):
                    fail(f"{key} {wid}: endsAt entries must be ids")
            if key == "fences" and not w.get("assetRef"):
                fail(f"fences {wid}: assetRef (the kit's fence/wall piece) is required")

    # 97 C-stitch (owner requirement 2026-09-05) — the network into the place
    # and the streets inside it are ONE network. A blueprint declares where the
    # province network reaches its boundary; the geometry of that join is
    # checked by `blueprint_integration.check_network_stitch`.
    terminals = bp.get("networkTerminals") or []
    way_ids = {w.get("id") for key in ("routes", "boardwalks", "canals") for w in bp.get(key, []) or []}
    known_routes = pn.route_ids()
    terminal_routes = set()
    for t in terminals:
        tid = t.get("id")
        rid = t.get("routeId")
        if not isinstance(rid, str) or not rid:
            fail(f"networkTerminal {tid}: 97 C-stitch — routeId must name a real province route "
                 f"(routes.json / waterways.json / routes-minor.json)")
        else:
            terminal_routes.add(rid)
            if known_routes and rid not in known_routes:
                fail(f"networkTerminal {tid}: 97 C-stitch — routeId {rid!r} is not a published province "
                     f"route; a blueprint may not invent the road it is reached by")
        entry = t.get("entryUV")
        if not (isinstance(entry, list) and len(entry) == 2
                and all(isinstance(c, (int, float)) for c in entry)):
            fail(f"networkTerminal {tid}: 97 C-stitch — entryUV must be [u,v], the point where the "
                 f"network meets the boundary (the gate, the landing, the path head)")
        if t.get("kind") not in TERMINAL_KINDS:
            fail(f"networkTerminal {tid}: 97 C-stitch — kind must be one of {sorted(TERMINAL_KINDS)}")
        if t.get("wayId") not in way_ids:
            fail(f"networkTerminal {tid}: 97 C-stitch — wayId {t.get('wayId')!r} must name a way in this "
                 f"blueprint (the street that continues the route inside the place)")
        if not isinstance(t.get("why"), str) or len(t["why"].strip()) < MIN_WHY_CHARS:
            fail(f"networkTerminal {tid}: 97 C-stitch — why is required (why the network arrives here)")
    if not terminals and known_place_ids is not None and needs_terminals(catalogue_records().get(bid)):
        fail("97 C-stitch — this place is reached by the province network (discovery 'road' or a "
             "reachedVia list), so it needs at least one networkTerminal: the route id, the point "
             "where it meets the boundary and the way that carries it inside")

    approaches = bp.get("approaches") or []
    mag = str(bp.get("magnitude") or "")
    if len(approaches) < 1:
        fail("approaches: at least one walking/boat approach must be designed (the place is judged from the ground)")
    for ap_ in approaches:
        if ap_.get("mode") not in APPROACH_MODES:
            fail(f"approach {ap_.get('id')}: mode must be one of {sorted(APPROACH_MODES)}")
        if not (ap_.get("fromRouteId") or ap_.get("fromDirection")):
            fail(f"approach {ap_.get('id')}: needs fromRouteId or fromDirection")
        if ap_.get("fromRouteId"):
            via = ap_.get("viaUV")
            if not (isinstance(via, list) and via
                    and all(isinstance(q, list) and len(q) == 2 for q in via)):
                fail(f"approach {ap_.get('id')}: 97 C-stitch — viaUV is required with fromRouteId "
                     f"(>=1 [u,v] point, the first ON that route at least 30 m out from the terminal), "
                     f"so the approach sequence is described along the road the player is on")
        if ap_.get("fromRouteId") and ap_["fromRouteId"] not in terminal_routes:
            fail(f"approach {ap_.get('id')}: 97 C-stitch — fromRouteId {ap_['fromRouteId']!r} names no "
                 f"networkTerminal's routeId; an approach arrives along a province route the place "
                 f"declares a terminal for (declared: {sorted(terminal_routes) or 'none'})")
        if not ap_.get("firstSeen"):
            fail(f"approach {ap_.get('id')}: firstSeen (the id of the first thing that reads on the horizon) is required")
        for k in ("sequence", "wayfinding"):
            if not isinstance(ap_.get(k), str) or len(ap_[k].strip()) < MIN_WHY_CHARS:
                fail(f"approach {ap_.get('id')}: {k} must be a plain sentence")

    sg = bp.get("scaleGrounding")
    if isinstance(sg, dict):
        for k in ("loreSource", "population", "households", "buildingsPlanned", "npcsPlanned", "why"):
            if k not in sg:
                fail(f"scaleGrounding.{k} is required (size derived from lore, module 92)")
        bpn = sg.get("buildingsPlanned")
        n_parcels = len([p for p in bp.get("parcels", []) if (p.get("use") or "") not in ("fence", "wall")])
        if isinstance(bpn, int) and bpn > 0 and not (0.75 * bpn <= n_parcels <= 1.25 * bpn):
            fail(f"scaleGrounding.buildingsPlanned={bpn} but {n_parcels} parcels are authored — the plan and the drawing disagree by more than 25 %")

    for key in ("landmarks", "docks"):
        for item in bp.get(key, []):
            pos = item.get("position")
            if not (isinstance(pos, list) and len(pos) == 2):
                fail(f"{key} {item.get('id')}: position must be [u,v]")
            if "scale" in item and not (isinstance(item["scale"], (int, float)) and 0.2 <= item["scale"] <= 5.0):
                fail(f"{key} {item.get('id')}: scale must be a uniform factor in 0.2–5")
            if key == "landmarks" and "yawDeg" in item and not isinstance(item["yawDeg"], (int, float)):
                fail(f"landmark {item.get('id')}: yawDeg must be a number")

    for s in bp.get("questSockets", []):
        if s.get("kind") not in SOCKET_KINDS:
            fail(f"socket {s.get('id')}: kind must be one of {sorted(SOCKET_KINDS)}")

    # Doors and interiors (owner ruling 2026-09-05: "everything intended to have
    # an interior must have one and must have a door/entrance"). What a piece
    # has inside is DERIVED from the kits, never asserted here — see
    # tooling/asset-pipeline/pipeline/interiors_index.py and
    # worldgen/blueprint_interiors.py. Vanilla's model: the exterior shell
    # stands in the world, the interior is a separate cell, and the door is the
    # only link between them, so a missing door is a building with no inside.
    door_prefix = "door." + bid.removeprefix("place.") + "."
    parcels_by_id = {p.get("id"): p for p in bp.get("parcels", [])}
    parcel_ids = set(parcels_by_id)
    interiors = bi.library()
    doors_by_parcel: dict[str, list[dict]] = {}
    for d in bp.get("doors", []):
        if not str(d.get("id", "")).startswith(door_prefix):
            fail(f"door {d.get('id')}: id must start {door_prefix}")
        if d.get("parcelId") not in parcel_ids:
            fail(f"door {d.get('id')}: unknown parcelId")
        doors_by_parcel.setdefault(d.get("parcelId"), []).append(d)
        claim = d.get("interiorClaim", {})
        if not claim.get("sizeClass") or claim.get("culture") not in INTERIOR_CULTURES:
            fail(f"door {d.get('id')}: interiorClaim needs sizeClass + culture")
        parcel = parcels_by_id.get(d.get("parcelId"))
        bearing = _door_edge_bearing(parcel, d.get("thresholdUV")) if parcel else None
        if bearing is not None and isinstance(d.get("facingDeg"), (int, float)):
            off = _angle_delta(float(d["facingDeg"]), bearing)
            if off > DOOR_FACING_TOLERANCE_DEG:
                fail(f"door {d.get('id')}: facingDeg {d['facingDeg']:.0f}° faces away from the wall it sits on "
                     f"(nearest footprint edge points {bearing:.0f}°, {off:.0f}° off) — put the door on the side it claims")

        record = interiors.get(parcel.get("assetRef")) if (interiors and parcel) else None
        if record is None:
            continue
        want = interiors.interior_ref(record)
        if record.get("interior") == "none":
            fail(f"door {d.get('id')}: parcel {parcel.get('id')} uses {parcel.get('assetRef')}, which has no "
                 f"interior ({record.get('why', 'measured as open geometry')}) — a door here opens onto nothing")
            continue
        got = (d.get("interiorClaim") or {}).get("interiorRef")
        if want is None:
            # interior "shell": the kit ships no interior for this piece, so the
            # blueprint has to NAME the interior kit Phase 12 will build it from.
            if not isinstance(got, str) or not got.strip():
                fail(f"door {d.get('id')}: interiorClaim.interiorRef is required — {parcel.get('assetRef')} is "
                     f"a shell with no interior in its kit, so name the interior kit Phase 12 builds it from "
                     f"(e.g. xanmeer-interior-v1, dungeon-root-v1, vanilla-farmhouse-int)")
        elif got != want:
            fail(f"door {d.get('id')}: interiorClaim.interiorRef is {got!r}; the kit says this piece's interior "
                 f"is {want!r} (interior kind {record.get('interior')!r})")
        measured_class = record.get("sizeClass")
        if measured_class and (d.get("interiorClaim") or {}).get("sizeClass") != measured_class:
            area = record.get("planAreaM2", 0.0)
            fail(f"door {d.get('id')}: interiorClaim.sizeClass is "
                 f"{(d.get('interiorClaim') or {}).get('sizeClass')!r}, but the piece measures {area:.0f} m² — "
                 f"small is under {bi.SIZE_CLASS_SMALL_MAX_M2:.0f} m², medium under "
                 f"{bi.SIZE_CLASS_MEDIUM_MAX_M2:.0f} m², large above that, so it is {measured_class!r}")
        sides = bi.doorway_bearings(record, parcel.get("yawDeg") or 0.0)
        if sides and isinstance(d.get("facingDeg"), (int, float)):
            off = min(_angle_delta(float(d["facingDeg"]), s) for s in sides)
            if off > DOORWAY_TOLERANCE_DEG:
                shown = ", ".join(f"{s:.0f}°" for s in sides)
                fail(f"door {d.get('id')}: facingDeg {d['facingDeg']:.0f}° is {off:.0f}° off the nearest doorway "
                     f"the mesh actually has (sides at {shown} after yaw {parcel.get('yawDeg')}°, tolerance "
                     f"±{DOORWAY_TOLERANCE_DEG:.0f}°) — a door cannot be claimed on a blank wall")

    if interiors:
        for p in bp.get("parcels", []):
            record = interiors.get(p.get("assetRef"))
            if record is None:
                continue
            if record.get("interior") in bi.NEEDS_INTERIOR and not doors_by_parcel.get(p.get("id")):
                want = interiors.interior_ref(record) or "a Phase 12 interior claim"
                fail(f"parcel {p.get('id')}: {p.get('assetRef')} has an inside "
                     f"({record.get('interior')} → {want}) but no door in doors[] — every building "
                     f"intended to have an interior must have an entrance (owner ruling 2026-09-05); "
                     f"run `python3 -m worldgen.blueprint_interiors --report <blueprint>`")

    cl = bp.get("clearance", {})
    if cl and not {"hardClear", "thinned", "kept"} <= set(cl):
        fail("clearance must carry hardClear, thinned, kept (graded clearing, 0041)")

    variants = bp.get("variants", [])
    if len(variants) > MAX_VARIANTS:
        fail(f"at most {MAX_VARIANTS} variants (quests 20 §14)")
    for v in variants:
        if "id" not in v or "changedRefs" not in v:
            fail("each variant needs id + changedRefs")

    for t in bp.get("travelServices", []):
        if t.get("kind") not in TRAVEL_KINDS:
            fail(f"travelService {t.get('id')}: kind must be one of {sorted(TRAVEL_KINDS)}")
        if known_place_ids is not None and t.get("toPlaceId") not in known_place_ids:
            fail(f"travelService {t.get('id')}: toPlaceId not in catalogue")

    for o in bp.get("occupants", []):
        ref = o.get("ladderRef")
        if not isinstance(ref, str) or not ref:
            fail(f"occupant {o.get('slotId')}: ladderRef must be a semantic S-ladder string")
        elif ref.strip().replace(".", "").isdigit():
            fail(f"occupant {o.get('slotId')}: ladderRef is a bare number — semantic refs only (76 §128)")

    budget = bp.get("budget", {})
    if budget and set(budget) != BUDGET_KEYS:
        fail(f"budget must carry exactly {sorted(BUDGET_KEYS)}")
    return errors


def validate_blueprint_full(bp: dict, known_place_ids: set[str] | None = None,
                            survey=None) -> tuple[list[str], list[str]]:
    """(errors, warnings) — the HARD failures and the WARN-grade module 97
    reports (§G), which are shown but never fail a compile."""
    warnings: list[str] = []
    errors = validate_blueprint(bp, known_place_ids, survey, warnings)
    return errors, warnings


def validate_all(blueprint_dir: Path = BLUEPRINT_DIR, known_place_ids: set[str] | None = None,
                 warnings: list[str] | None = None) -> list[str]:
    errors: list[str] = []
    if not blueprint_dir.exists():
        return errors
    for path in sorted(blueprint_dir.glob("*.json")):
        data = json.loads(path.read_text())
        if data.get("schemaVersion") != SCHEMA_VERSION:
            errors.append(f"{path.name}: schemaVersion must be {SCHEMA_VERSION}")
            continue
        bp = data.get("blueprint", {})
        if path.stem != bp.get("id"):
            errors.append(f"{path.name}: filename must equal blueprint id ({bp.get('id')})")
        errors += validate_blueprint(bp, known_place_ids, None, warnings)
    return errors


def main() -> int:
    ids = catalogue_ids()
    warnings: list[str] = []
    errors = validate_all(known_place_ids=ids, warnings=warnings)
    for w in warnings:
        print(f"blueprint: WARN: {w}", file=sys.stderr)
    for e in errors:
        print(f"blueprint: {e}", file=sys.stderr)
    print(f"blueprint: {'FAIL' if errors else 'OK'} ({len(warnings)} warnings)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
