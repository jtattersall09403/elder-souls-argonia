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
  districts[]       {id, kind, boundary (DERIVED from the convex hull of the
                    district's parcel footprints plus ways ending at them,
                    buffered 4 m and clipped to the place boundary),
                    cultureKit (a KIT SET id — see
                    KIT_SETS below; one set per district, never blended;
                    the set's culture carries the two-culture rule),
                    wealth, notes}. Parcel-less waterfronts type membership
                    with `districtId` on their dock and serving way; this gives
                    the derivation geometry instead of preserving an empty box.
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
                    A FENCE also carries (owner ruling 2026-09-08): `class`
                    (pole-wall | curtain | palisade | fence | ring-panel — the
                    wall's own kind, which picks its routing costs: contour,
                    the outer edge of the built hull, dry ground); `routingWhy`
                    (REQUIRED when `routing` is "straight": a wall is routed
                    unless someone SURVEYED it); `waterOk` {maxDepthM} where
                    the lore drives poles into the shallows (Lilmoth's estuary
                    wall); `gapAt[]`, the way ids the wall is opened for (a
                    gate); and DERIVED `moduleM`, the long axis of the measured
                    piece, which the routed line is quantised into. HARD: a
                    wall crosses no parcel hull, crosses no way outside
                    `gapAt`, and stands in water only with `waterOk`. Designed
                    contact is declared: `abuts[]` + `abutsWhy` (a dais set on
                    a retaining course, a conduit its pillars carry, a panel
                    butted into the piece it plugs against), and `gapAt` also
                    covers a line CARRIED OVER a way.
  why (on districts, parcels, landmarks, docks)   the plain-English record a
                    reviewer reads on click, reference register:
                    {what, whyHere (why it is in this place at all),
                    whySpot (why this exact spot), whyNeighbours (why it sits
                    with the things around it), playerPurpose (what it gives
                    the player), microGeography (how it uses the ground:
                    contour, fall, water edge, shelter, view)}. REQUIRED on
                    parcels and landmarks; districts and docks carry what /
                    whyHere / whyNeighbours / playerPurpose / microGeography.
  playerPurpose[]   REQUIRED on every parcel with an interior (owner ruling
                    2026-09-07): [{kind, tier, note}] from the closed
                    vocabulary in `player_purpose.py`, with at least one entry
                    of tier medium or higher. An enterable building earns its
                    interior; flavour alone is dressing, and dressing is
                    unlimited and out of scope. See
                    docs/research/placement-settlements/player-purpose-spectrum.md.
  macroEvidence[]   the compact macro-to-blueprint review index (B9a):
                    {sourcePaths:[catalogue JSON paths], evidenceRefs:[object
                    ids in this blueprint]}. It repeats no catalogue prose;
                    `worldgen.place_obligations` expands every semantic leaf,
                    validates the refs, and makes an omitted promise HARD.
  proseRefs[]       optional exact name bindings (B9b): {sourcePath, exactly
                    one typed questRef / occupantRef / placeRef / routeRef /
                    serviceRef / itemRef / factionRef / socketRef}. A row says
                    which registered thing one prose field names; it does not
                    assert a relation, local service, presence or delivery.
                    `worldgen.prose_links` rejects stale and misplaced rows.
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
                    households, buildingsPlanned, npcsPlanned, why,
                    densityForm?} — the
                    place's size derived from the lore/demographics, with the
                    count of BUILDINGS AND STRUCTURES (`parcel_kinds`: props
                    and stacked pieces do not count) within ±25 % of
                    buildingsPlanned. `densityForm` is `settlement` by default;
                    use `works-yard` for a compact exterior production yard
                    whose habitation is elsewhere. Each form still has a
                    measured density band; this is not an exemption.
  parcels may carry `abuts: [<parcel id>, ...]` + `abutsWhy` — the declared
                    exception to the 8 m spacing floor (97 C5) for pieces the
                    KIT authored to snap together (a hut on its deck, a shed
                    against a wall) — or `worksWith` + `worksWithWhy` for a
                    trade contact with no snap pair (a hoist against the rock
                    it works), which is exempt from the floor but must keep
                    half a metre clear; an undeclared close pair fails
                    `parcel-gap` at compile. A parcel may pin its derived
                    `kind` ("building" / "structure" / "prop") where the
                    derivation reads the mesh wrongly. Districts may carry `routing: "straight"` to
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
  landmarks[]       {id, kind, position, assetRef, groundFit?, notes}
                    (optional yawDeg + scale; scale is a UNIFORM factor 0.2–5
                    for natural pieces only — the sourced anvilgianttrunk at
                    ~0.45 is the Nine-Trunks case; kit architecture stays 1.
                    Parcels may carry `scale` under the same rule; the derived
                    footprint and the compiler honour it)
  docks[]           {id, position, waterBodyId, piledToBed: true, hullClass,
                    fit?, fixedBerthReason?, assetRef, groundFit: stilt,
                    yawDeg?, scale?} — a
                    dock is a WATER TERMINAL, not a deck the design
                    drew near some water (owner review 2026-09-08). Every dock
                    must be answered by a `networkTerminals[]` entry of kind
                    `lane` or `channel` carrying `dockId`, and the serving
                    water route must END at it.
                      hullClass  canoe | small-draft | keeled — the deepest
                                 hull the berth serves. It sets the depth the
                                 water must carry: 0.6 / 1.2 / 3.0 m, sampled
                                 100 m off the dock ALONG the serving route
                                 (97 B5, closing G9).
                      fit        which way the two were made to meet:
                                 "water-to-dock" — the channel is re-ended at
                                 the authored berth (what lane-terminals.json
                                 does for a city);
                                 "to-water" — the berth is moved to where the
                                 published channel already ends.
                                 Absent, it is `to-water`: the independent
                                 natural solve is evidence and the ordinary
                                 berth follows it. `water-to-dock` additionally
                                 requires a structured `fixedBerthReason`; prose
                                 in `why` cannot grant an exception to the
                                 physical solve it is meant to justify.
  combatSpaces[]    REQUIRED (>=1, each with aroundIds, DERIVED boundary,
                    clearanceClass and a why — 97 D9): open ground where
                    `aroundIds` names the parcel and/or way geometry that makes
                    the combat room. Its boundary is their convex hull,
                    buffered 4 m and clipped to the place boundary; run
                    `worldgen.blueprint_footprints --areas` after changing the
                    referenced layout. Hand-drawn combat boxes are invalid.
                    a fight CAN happen (a quest, a hostility flip, a night
                    attack) and where critical-animation clearance is checked;
                    a safe city still has them, each with its why.
  questSockets[]    {id, kind ("scene"|"evidence"|"container"|"npc"|
                    "encounter"|"boss"|"station"|"mark"), position?,
                    parcelId?, ownerQuestTier?, questId?, socketRef?}
                    A socket bound to a parcel and a quest purpose are the SAME
                    fact seen twice (owner review 2026-09-08), so both
                    directions are HARD:
                      * a `playerPurpose` of kind `quest-giver`/`quest-stage`
                        must carry `socketRef` naming a socket in this
                        blueprint whose `parcelId` is that parcel — a building
                        whose purpose is a quest has the marker that says so;
                      * a socket that names a `parcelId` must find a
                        quest-kind purpose on that parcel — a marker on a
                        building the record never says is a quest building is
                        a marker with nothing behind it.
                    `questId` (optional) names the quest the socket belongs to
                    and must match a row in the quest data
                    (`world/sources/quests/`, validated by `worldgen.quests`).
  doors[]           {id (door.<region>.<slug>.<n>), parcelId, facingDeg,
                    thresholdUV, interiorClaim {sizeClass, culture,
                    interiorRef, owner?}}
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
                      * a door must sit on the piece's ONE canonical
                        `entrance` (owner ruling 2026-09-07: the evidence is
                        ranked in the index — the mod's own load door, then a
                        door part the authors placed, then the family's door
                        mesh, then a leaf, an opening, an open front — and only
                        the winner is exported). A piece with an inside but no
                        entrance may not carry a door at all (that is a
                        sourcing gap, recorded in
                        docs/research/placement-settlements/settlement-kit-sourcing-log.md);
                      * `interiorClaim.interiorRef` must be the index's
                        interiorAssetRef (a matched interior mesh) or its
                        tileset (the interior kit Phase 12 builds it from);
                      * `interiorClaim.sizeClass` must match the measured plan
                        area — small < 40 m², medium < 120 m², large above;
                      * facingDeg must be within ±45° of the entrance side
                        rotated by the parcel's yawDeg, so a door cannot be
                        claimed on a blank wall;
                      * an `interiorRef` that is not a mesh id must NAME AN
                        INTERIOR KIT THAT EXISTS in
                        tooling/asset-pipeline/pipeline/config/kits — the door
                        teleports the player into that kit (owner 2026-09-05);
                      * DOOR ON WAY (hard, owner 2026-09-05: "doors in the right
                        place and facing the right way is really crucial"): the
                        entrance's world bearing must be within 60° of the way
                        the door opens onto, and the threshold within 4 m of it.
                        A door may carry `facesWay: <way id>` to name that way;
                        otherwise the nearest way is taken. Solve the yaw with
                        `python3 -m worldgen.blueprint_footprints --orient
                        --apply <blueprint>`, which turns the parcel until the
                        entrance faces its way and rewrites footprint, facingDeg
                        and thresholdUV. It never rewrites `orientationWhy`:
                        it prints the parcels whose why must be re-read.

                    FRONT (owner ruling + steer 2026-09-07). A piece with no
                    entrance — a gate arch, a wall stub, a tower, a deck, a
                    shrine — still has a way round: the index derives
                    `front: {deg, evidence, outside}` from how the piece's own
                    authors planted it, the side they repeatedly left OPEN
                    (`pipeline/piece_front.py`). This applies to every plotted
                    place, not only settlements:
                      * the front must look at the line the player arrives on —
                        the nearest way, which is what an approaches[] row names
                        in its `fromRouteId` — within
                        FRONT_OUTWARD_TOLERANCE_DEG. WARN, except on a piece
                        that carries an entrance (where it is HARD, alongside
                        DOOR ON WAY): a wall flanks its road rather than aiming
                        at it, so the enclosure rule below is what holds an
                        enclosure edge;
                      * a gate, wall or tower must also face AWAY from what the
                        boundary polygon encloses, and a gate's front must be
                        the side its spanned way comes in from. Always HARD.
                    A piece with `front: null` is symmetric and exempt.
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
                    cultureRole, ownerFaction?, worksAt?, livesAt?}
                    — worksAt/livesAt are parcel ids: where the player finds
                    this person and where they sleep. A catalogue
                    `contents.npcs` slot marked `named` is not delivered until
                    some occupant carries one of them (97 E9).
  parcels[].service optional, one of `catalogue.SERVICES` — the parcel IS that
                    service (the inn, the smith, the council hall), and it is
                    what meets the catalogue record's `services[]` promise.
                    Anything a player walks into also needs a door and a
                    linked interior (97 E5).
                    Both fields are validated by `worldgen.blueprint_promises`
                    (kept out of this module's validator so the promise ledger
                    stays separable); that module's docstring is their
                    reference, and `output/settlements/<id>.ledger.md` is the
                    report.
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
from . import parcel_kinds as pk
from . import province_network as pn
from .player_purpose import QUEST_PURPOSE_KINDS
from .catalogue import CATALOGUE_DIR, load_region_files
# The carve stages read these three from `dock_spec`, a leaf module, so that
# cutting a channel does not depend on the settlement stack (see dock_spec).
from .dock_spec import (BLUEPRINT_DIR, DOCK_DEPTH_SAMPLE_M,  # noqa: F401
                        HULL_CLASS_DEPTH_M)

SCHEMA_VERSION = 1
REPO_ROOT = Path(__file__).resolve().parents[3]

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
    "imperial":           {"culture": "imperial", "kits": ["settlement-imperial-v1", "imperial-keep", "vanilla-farmhouse-int", "vanilla-imperial-int", "enclosure-v1"]},
    "dunmer-hlaalu":      {"culture": "dunmer",   "kits": ["hlaalu-domestic", "vanilla-imperial-int", "enclosure-v1"]},
    "neutral-works":      {"culture": "neutral",  "kits": ["works-v1", "enclosure-v1"]},
    "neutral-underwater": {"culture": "neutral",  "kits": ["underwater-v1"]},
}
# 97 C1, decision 2026-09-07: kit purity is held over what a place is BUILT of.
# The dressing pool — the works kit's props, which are vanilla clutter and
# neutral by construction — is admitted to every set, because a notice board in
# an Argonian quay is dressing, not a second architecture. Only `structure` and
# `building` parcels are held to their district's one set (`parcel_kinds`).
# Without this the works board forced a district of one piece (Lilmoth's
# dues-board, the Licensed Stage board), which is a plan unit that is not one.
#
# `enclosure-v1` (2026-09-07) is the province's road-spanning gate, wall and
# palisade vocabulary. It is a CROSS-CULTURE kit with per-family snap rules
# (module 97 Part F names the family each set may use), so it is admitted to
# the sets whose Part F enclosure row points into it, and the family — never
# the kit — is what a district is held to.
DRESSING_KITS = ("works-v1",)
CULTURE_KITS = set(KIT_SETS)


@lru_cache(maxsize=1)
def kit_membership(kits_dir: Path = fp.KITS_DIR) -> dict[str, frozenset[str]]:
    """`{kit asset id: the kits that carry it}`. A piece may be packaged in
    more than one kit (the scaffold stair is in the works set and the route
    structures set), so C1 asks whether it is in ANY kit its district may use."""
    out: dict[str, set[str]] = {}
    if not kits_dir.exists():
        return {}
    for path in sorted(kits_dir.glob("*.footprints.json")):
        data = json.loads(path.read_text())
        kit = data.get("kit", path.name[: -len(".footprints.json")])
        for asset_id in data.get("assets", {}):
            out.setdefault(asset_id, set()).add(kit)
    return {k: frozenset(v) for k, v in out.items()}


def kits_for_district(kit_set: str, kind: str = "building") -> tuple[str, ...]:
    """The kits a parcel of this `kind` may be drawn from in a district built
    from `kit_set` (97 C1). Props may also come from the dressing pool."""
    kits = tuple((KIT_SETS.get(kit_set) or {}).get("kits") or ())
    return kits + DRESSING_KITS if kind == "prop" else kits
INTERIOR_CULTURES = {"argonian", "imperial", "dunmer"}
GROUND_FIT = {"direct", "plinth", "pad", "stilt", "dug-in"}
SOCKET_KINDS = {"scene", "evidence", "container", "npc", "encounter", "boss", "station", "mark"}
TRAVEL_KINDS = {"ferry", "boat", "root", "water-taxi"}
MAX_VARIANTS = 3
DOOR_FACING_TOLERANCE_DEG = 100.0
# ±45° against the MEASURED canonical entrance (blueprint_interiors), which is a
# real direction rather than a hull chord, so it can be tight: a door may sit at
# the corner of its opening, it may not be claimed on a blank wall.
DOORWAY_TOLERANCE_DEG = bi.DOORWAY_TOLERANCE_DEG

# An `interiorClaim.interiorRef` that is not a mesh asset id names an INTERIOR
# KIT, and that kit has to exist: the door teleports the player into it
# (owner ruling 2026-09-05, the Morrowind/Skyrim model). The kit configs are
# the source of truth for which kits can be built.
KIT_CONFIG_DIR = (Path(__file__).resolve().parents[3] / "tooling" / "asset-pipeline"
                  / "pipeline" / "config" / "kits")


@lru_cache(maxsize=1)
def kit_config_names() -> frozenset[str]:
    """Every kit a config exists for — the set an interiorRef may name."""
    if not KIT_CONFIG_DIR.exists():
        return frozenset()
    return frozenset(path.stem for path in KIT_CONFIG_DIR.glob("*.json"))


@lru_cache(maxsize=1)
def built_kit_names(kits_dir: Path = bi.KITS_DIR) -> frozenset[str]:
    """Every kit that has actually been BUILT — `output/kits/<name>.kit.json`.

    A config is an intention; the door teleports the player into the built kit,
    so an `interiorRef` naming a config nobody has run is a door onto nothing
    (review 2026-09-07)."""
    if not kits_dir.exists():
        return frozenset()
    return frozenset(path.name[: -len(".kit.json")] for path in kits_dir.glob("*.kit.json"))

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
# 97 C6 — buildings and structures per hectare of the BUILT HULL, by size class.
# Not the boundary: a boundary carries the approaches, the water and the
# clearance ring, so measuring over it reported a village as empty ground
# (Round A audit §6.3). The built hull is the convex hull of the counted
# parcels, buffered by the C13 vegetation-clearance radius (15 m) — the ground
# the place has actually taken from the marsh, which is also what puts an M3
# ring of 30 m radius on the module's own ~50 m M3 radius. The bands are
# SETTLEMENT bands: a lair, a camp or a works site is not judged on them
# (`DENSITY_CLASSES`).
DENSITY_BAND = {"M2": (15.0, 33.0), "M3": (7.0, 16.0), "M4": (4.0, 11.0), "M5": (4.0, 11.0)}
DENSITY_CLASSES = {"settlement"}
# A works yard measures the deliberately compact surface plant, not the homes
# and civic fabric represented by a settlement band.  It therefore has its own
# checked band instead of silently skipping C6.  Mazzatun's exterior was the
# motivating case: the occupied city is underground, while the authored shelf
# is a dense loading, smelting and scaffold yard.
DENSITY_FORM_BAND = {"works-yard": (20.0, 60.0)}
DENSITY_FORMS = {"settlement", *DENSITY_FORM_BAND}
# Below this the band is noise: one hut inside its own 15 m clearance can never
# reach a hamlet's 15/ha, and saying so tells nobody anything.
MIN_PARCELS_FOR_DENSITY = 4
BUILT_HULL_BUFFER_M = 15.0
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
TERMINAL_KINDS = {"road", "track", "footpath", "boardwalk", "lane", "channel"}
# 97 B5 / G9 — the depth a berth must carry for the deepest hull it serves,
# sampled DOCK_DEPTH_SAMPLE_M off the dock along the route that serves it.
DOCK_DEPTH_SAMPLE_STEP_M = 5.0
DOCK_TERMINAL_TOLERANCE_M = 10.0    # dock -> published water end
DOCK_FIT_SEARCH_M = 150.0           # how far a channel may be re-ended to a berth
DOCK_FITS = {"to-water", "water-to-dock"}
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


def _parcel_centre_m(parcel: dict, extent_m: float = fp.PROVINCE_EXTENT_M):
    c = parcel.get("centreUV")
    if not (isinstance(c, list) and len(c) == 2):
        poly = parcel.get("footprint")
        if not _polygon_ok(poly):
            return None
        c = [sum(q[0] for q in poly) / len(poly), sum(q[1] for q in poly) / len(poly)]
    return (float(c[0]) * extent_m, float(c[1]) * extent_m)


def _match_parcel_entrance(parcel: dict, door: dict, record: dict | None,
                           extent_m: float = fp.PROVINCE_EXTENT_M):
    """`(ok, reason)` — does this door sit on the piece's canonical entrance?"""
    centre = _parcel_centre_m(parcel, extent_m)
    th = door.get("thresholdUV")
    threshold = (float(th[0]) * extent_m, float(th[1]) * extent_m) \
        if isinstance(th, list) and len(th) == 2 else None
    facing = door.get("facingDeg")
    return bi.match_entrance(record, float(parcel.get("yawDeg") or 0.0),
                             float(facing) if isinstance(facing, (int, float)) else None,
                             threshold, centre)


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


def _convex_hull_m(points):
    """Monotone-chain hull of (x, z) metre points, counter-clockwise."""
    pts = sorted(set(points))
    if len(pts) < 3:
        return pts

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

    lower, upper = [], []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def built_hull_area_ha(bp: dict, parcels=None, buffer_m: float = BUILT_HULL_BUFFER_M,
                       extent_m: float = fp.PROVINCE_EXTENT_M) -> float:
    """Hectares of the BUILT hull: the convex hull of the counted parcels'
    footprints, buffered by `buffer_m` (97 C6, audit §6.3).

    The buffered area of a CONVEX polygon is exact — `A + P·r + πr²` — so this
    needs no geometry library and stays deterministic (standard 6).
    """
    pts: list[tuple[float, float]] = []
    for p in (bp.get("parcels", []) or [] if parcels is None else parcels):
        poly = p.get("footprint")
        if _polygon_ok(poly):
            pts += [(float(q[0]) * extent_m, float(q[1]) * extent_m) for q in poly]
        else:
            c = _parcel_centre_m(p, extent_m)
            if c is not None:
                pts.append(c)
    hull = _convex_hull_m(pts)
    if len(hull) < 3:
        # one or two pieces: the built ground is what the buffer covers
        return (math.pi * buffer_m * buffer_m) / 10_000.0 if hull else 0.0
    area = 0.0
    perim = 0.0
    for i in range(len(hull)):
        x1, z1 = hull[i]
        x2, z2 = hull[(i + 1) % len(hull)]
        area += x1 * z2 - x2 * z1
        perim += math.hypot(x2 - x1, z2 - z1)
    area = abs(area) / 2.0
    return (area + perim * buffer_m + math.pi * buffer_m * buffer_m) / 10_000.0


# --- WARN-grade quality reports (review 2026-09-07) ------------------------ #
# A `why` is the record of a decision. One that is a dozen words long, or that
# was pasted onto a second record, is not a decision — it is a field filled in.
# These are WARN because the prose is being rewritten; they measure, they do not
# block.
WHY_QUALITY_MIN_CHARS = 40


def _why_texts(node, path: str = "") -> list[tuple[str, str]]:
    """Every `why`-ish string in a blueprint, as (where, text). A key named
    `why` or ending in `Why`, and every sentence inside a `why` block."""
    out: list[tuple[str, str]] = []
    if isinstance(node, dict):
        here = node.get("id") or node.get("slotId") or path
        for k, v in node.items():
            if isinstance(v, str) and (k == "why" or k.endswith("Why")):
                out.append((f"{here}.{k}", v))
            elif k == "why" and isinstance(v, dict):
                out += [(f"{here}.why.{wk}", wv) for wk, wv in v.items() if isinstance(wv, str)]
            elif isinstance(v, (dict, list)):
                out += _why_texts(v, f"{here}.{k}" if here != path else f"{path}.{k}")
    elif isinstance(node, list):
        for item in node:
            out += _why_texts(item, path)
    return out


def _normalise_why(text: str) -> str:
    return " ".join(text.split()).casefold()


def _why_quality_warnings(bp: dict) -> list[str]:
    bid = bp.get("id", "<missing id>")
    texts = _why_texts(bp, bid)
    warnings: list[str] = []
    short = [(where, t) for where, t in texts if len(t.strip()) < WHY_QUALITY_MIN_CHARS]
    if short:
        shown = ", ".join(f"{w} ({len(t.strip())} chars)" for w, t in sorted(short)[:5])
        warnings.append(f"{bid}: why-quality — {len(short)} of {len(texts)} why fields are under "
                        f"{WHY_QUALITY_MIN_CHARS} characters, which is too short to carry a reason: {shown}")
    seen: dict[str, list[str]] = {}
    for where, t in texts:
        seen.setdefault(_normalise_why(t), []).append(where)
    dupes = {k: v for k, v in seen.items() if len(v) > 1}
    if dupes:
        shown = "; ".join(f"{len(v)}x {', '.join(sorted(v)[:3])}" for v in list(dupes.values())[:3])
        warnings.append(f"{bid}: why-quality — {len(dupes)} why text(s) appear on more than one record "
                        f"(the same reason cannot be true of two different places): {shown}")
    return warnings


def _occupancy_warnings(bp: dict) -> list[str]:
    """`scaleGrounding.npcsPlanned` is the size the lore justifies; the
    `occupants[]` slots are the people actually authored. A place with a
    fraction of its planned population is a plan nobody has drawn yet."""
    sg = bp.get("scaleGrounding")
    planned = (sg or {}).get("npcsPlanned")
    if not isinstance(planned, int) or planned <= 0:
        return []
    authored = len(bp.get("occupants", []) or [])
    if authored >= 0.5 * planned:
        return []
    return [f"{bp.get('id', '<missing id>')}: scaleGrounding.npcsPlanned is {planned} but only "
            f"{authored} occupant slot(s) are authored ({authored / planned * 100:.0f} % — the floor is "
            f"50 %); either author the people or ground the smaller number in the lore"]


# --------------------------------------------------------------------------- #
# 97 C10 — fences and walls are ROUTED (owner ruling 2026-09-08)
# --------------------------------------------------------------------------- #
FENCE_SAMPLE_M = 0.5          # how finely a wall line is read against the ground
FENCE_PARCEL_TOL_M = 0.4      # a wall may graze a building's edge, never enter it
FENCE_DEPTH_TOL_M = 0.15      # raster resolution, not licence to stand in deep water
FENCE_WET_TOL_M = 2.0         # a wall's foot may touch a puddle; a wall may not stand in one
FENCE_STRAIGHT_MODULES = 3    # a run longer than this with no bend, on falling ground
FENCE_FALL_M = 0.5            # ... crossing this much height, is a drawn line


def _sample_polyline_m(pts, extent_m: float, step_m: float = FENCE_SAMPLE_M):
    """Every `step_m` along a UV polyline, in metres."""
    out = []
    for a, b in zip(pts, pts[1:]):
        ax, az = float(a[0]) * extent_m, float(a[1]) * extent_m
        bx, bz = float(b[0]) * extent_m, float(b[1]) * extent_m
        n = max(1, int(math.hypot(bx - ax, bz - az) / step_m))
        for i in range(n + 1):
            t = i / n
            out.append((ax + (bx - ax) * t, az + (bz - az) * t))
    return out


def _segments_cross(a, b, c, d) -> bool:
    """True only for a PROPER crossing: a wall that ends on a way's edge, or
    runs along it, is not the same thing as a wall laid across it."""
    def side(p, q, r):
        return (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
    d1, d2 = side(a, b, c), side(a, b, d)
    d3, d4 = side(c, d, a), side(c, d, b)
    return ((d1 > 0) != (d2 > 0)) and ((d3 > 0) != (d4 > 0))


def _point_in_polygon_m(pt, poly) -> bool:
    inside = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, zi = poly[i]
        xj, zj = poly[j]
        if (zi > pt[1]) != (zj > pt[1]) and pt[0] < (xj - xi) * (pt[1] - zi) / (zj - zi + 1e-30) + xi:
            inside = not inside
        j = i
    return inside


def _dist_to_polygon_edge_m(pt, poly) -> float:
    best = float("inf")
    for a, b in zip(poly, poly[1:] + poly[:1]):
        dx, dz = b[0] - a[0], b[1] - a[1]
        d2 = dx * dx + dz * dz
        t = 0.0 if d2 <= 1e-12 else max(0.0, min(1.0, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dz) / d2))
        best = min(best, math.hypot(pt[0] - (a[0] + t * dx), pt[1] - (a[1] + t * dz)))
    return best


def _fence_failures(bp: dict, survey=None) -> list[str]:
    """HARD 97 C10 geometry: a wall may not cross a building or a way it has
    not declared a gap at, and may not stand in water it has no licence for."""
    from . import street_router as _sr
    extent_m = float(getattr(survey, "extent_m", _sr.PROVINCE_EXTENT_M))
    out: list[str] = []
    parcels = [(p.get("id"), [(float(q[0]) * extent_m, float(q[1]) * extent_m)
                              for q in (p.get("footprint") or [])])
               for p in bp.get("parcels") or []]
    ways = [(w.get("id"), [(float(q[0]) * extent_m, float(q[1]) * extent_m)
                           for q in (w.get("points") or [])])
            for key in ("routes", "canals", "boardwalks") for w in bp.get(key) or []]
    for f in bp.get("fences") or []:
        fid = f.get("id")
        pts = f.get("points") or []
        if len(pts) < 2:
            continue
        line = [(float(p[0]) * extent_m, float(p[1]) * extent_m) for p in pts]
        samples = _sample_polyline_m(pts, extent_m)

        abuts = set(f.get("abuts") or [])
        for pid, poly in parcels:
            if len(poly) < 3 or pid in abuts:
                continue
            bx = [q[0] for q in poly]; bz = [q[1] for q in poly]
            if not (min(bx) <= max(q[0] for q in line) and max(bx) >= min(q[0] for q in line)
                    and min(bz) <= max(q[1] for q in line) and max(bz) >= min(q[1] for q in line)):
                continue
            inside = [q for q in samples
                      if _point_in_polygon_m(q, poly) and _dist_to_polygon_edge_m(q, poly) > FENCE_PARCEL_TOL_M]
            if inside:
                out.append(f"fence {fid}: 97 C10 — the wall line crosses the hull of {pid} "
                           f"({len(inside)} sample(s) inside it); a wall runs round a building, "
                           f"never through it — re-route it (street_router --apply) or move the piece")
                break

        gaps = set(f.get("gapAt") or [])
        for wid, wpts in ways:
            if wid in gaps or len(wpts) < 2:
                continue
            crossed = any(_segments_cross(a, b, c, d)
                          for a, b in zip(line, line[1:])
                          for c, d in zip(wpts, wpts[1:]))
            if crossed:
                out.append(f"fence {fid}: 97 C10 — the wall line crosses the way {wid} without "
                           f"declaring it in gapAt; a wall crosses a way only at a gate or an "
                           f"opening, and the opening is named")

        if survey is not None:
            water_ok = f.get("waterOk") if isinstance(f.get("waterOk"), dict) else None
            # WET SEASON, not the base season: a wall stands in the water at
            # its worst. Reading the base mask let a wall on ground that floods
            # pass without declaring `waterOk`; reading the class raster (the
            # older defect) did the opposite and failed walls for standing in
            # 1.88 km2 of water that is not there, so the record had to DECLARE
            # water it does not stand in to pass — a standard-12 violation
            # baked into a gate.
            wet = [q for q in samples if _sr.sample_wet_season_water(survey, q[0], q[1])]
            wet_m = len(wet) * FENCE_SAMPLE_M
            if wet_m > FENCE_WET_TOL_M and water_ok is None:
                out.append(f"fence {fid}: 97 C10 — the wall stands in water for {wet_m:.1f} m "
                           f"({len(wet)} of {len(samples)} samples) but declares no waterOk; only a "
                           f"wall the lore drives into the shallows may stand in water, and it says "
                           f"how deep")
            elif wet and water_ok is not None:
                limit = float(water_ok.get("maxDepthM") or 0.0)
                deep = [_sr.sample_wet_season_depth_m(survey, q[0], q[1]) for q in wet]
                worst = max(deep)
                if worst > limit + FENCE_DEPTH_TOL_M:
                    out.append(f"fence {fid}: 97 C10 — the wall stands in {worst:.2f} m of water but "
                               f"waterOk.maxDepthM is {limit:.2f} m; no pole is driven there")
    return out


def _fence_warnings(bp: dict, survey=None) -> list[str]:
    """WARN 97 C10: a long unbent run across falling ground is a drawn line."""
    if survey is None:
        return []
    from . import street_router as _sr
    extent_m = float(getattr(survey, "extent_m", _sr.PROVINCE_EXTENT_M))
    out: list[str] = []
    for f in bp.get("fences") or []:
        module = f.get("moduleM")
        pts = f.get("points") or []
        if not isinstance(module, (int, float)) or module <= 0 or len(pts) < 2:
            continue
        limit = FENCE_STRAIGHT_MODULES * float(module)
        for a, b in zip(pts, pts[1:]):
            ax, az = float(a[0]) * extent_m, float(a[1]) * extent_m
            bx, bz = float(b[0]) * extent_m, float(b[1]) * extent_m
            run = math.hypot(bx - ax, bz - az)
            if run <= limit:
                continue
            hs = [_sr.sample_height_m(survey, q[0], q[1])
                  for q in _sample_polyline_m([a, b], extent_m, 2.0)]
            fall = max(hs) - min(hs)
            if fall > FENCE_FALL_M:
                out.append(f"{bp.get('id', '<missing id>')}: 97 C10 — fence {f.get('id')} runs "
                           f"{run:.1f} m ({run / float(module):.1f} modules) with no bend across "
                           f"{fall:.2f} m of fall; a wall built on the ground steps or turns with the "
                           f"contour (route it: street_router --apply)")
                break
    return out


def _placement_warnings(bp: dict) -> list[str]:
    """Warn-grade placement checks (module 97 §G: reported, never failing).

    C6 density band, C7 use histogram, C3 way width classes. These are bands
    measured off shipped worlds: a blueprint outside one is usually wrong and
    occasionally right with a reason, which is exactly what a warning is for.

    Counted by derived `kind` (`parcel_kinds`, decision 2026-09-07): props are
    dressing and are exempt from C6 and C7; structures count for C6, not C7; a
    `stacksOn` piece is the same building seen from higher up and adds nothing.
    """
    out: list[str] = []
    bid = bp.get("id", "<missing id>")
    kinds = pk.kinds_of(bp)
    built = pk.counted_parcels(bp, kinds)
    parcels = [p for p in built if (p.get("use") or "") not in ("fence", "wall")]
    cls = size_class(bp)
    record = catalogue_records().get(bid) or {}
    record_class = (record.get("classification") or {}).get("class")

    # 97 C6 — density falls as the place grows; growth buys radius, not
    # tightness. Measured over the BUILT hull, and only for settlements: the
    # bands were mined from settlements, so a lair or a works camp judged on
    # them is a number about nothing (audit §6.3).
    density_form = (bp.get("scaleGrounding") or {}).get("densityForm", "settlement")
    band = (DENSITY_BAND.get(cls) if density_form == "settlement"
            else DENSITY_FORM_BAND.get(density_form))
    area_ha = built_hull_area_ha(bp, parcels)
    if (band and area_ha > 0 and len(parcels) >= MIN_PARCELS_FOR_DENSITY
            and (record_class in DENSITY_CLASSES or not record)):
        density = len(parcels) / area_ha
        if not (band[0] <= density <= band[1]):
            out.append(f"{bid}: 97 C6 — {len(parcels)} buildings and structures over {area_ha:.2f} ha of "
                       f"built hull is {density:.1f}/ha; the {density_form} {cls} band is "
                       f"{band[0]:.0f}–{band[1]:.0f}/ha "
                       f"(spread the pieces or close them up; the hull is the parcels, not the boundary)")

    # 97 C7 — the building mix follows the ladder and the lore. Buildings only:
    # a deck, a gate or a scaffold carries no use a household lives by.
    counts = {k: 0 for k in USE_BAND}
    unclassified = 0
    for p in [q for q in parcels if kinds.get(q.get("id")) == "building"]:
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

    # 97 C1 — a district is built from ONE kit set; the dressing pool is
    # admitted everywhere (decision 2026-09-07), so this asks the question of
    # buildings and structures only. A piece packaged in several kits counts as
    # in-set if ANY of its kits is one the district may use.
    membership = kit_membership()
    kit_of_district = {d.get("id"): d.get("cultureKit") for d in bp.get("districts", []) or []}
    for p in bp.get("parcels", []) or []:
        kits = membership.get(p.get("assetRef"))
        if not kits:
            continue
        allowed = kits_for_district(kit_of_district.get(p.get("districtId")) or "",
                                    kinds.get(p.get("id")) or "building")
        if allowed and not (kits & set(allowed)):
            out.append(f"{bid}: 97 C1 — parcel {p.get('id')} is a {kinds.get(p.get('id'))} built from "
                       f"{p.get('assetRef')} ({'/'.join(sorted(kits))}), but its district is "
                       f"{kit_of_district.get(p.get('districtId'))} ({', '.join(allowed)}); one plan unit is "
                       f"one kit set, and only props may come from the dressing pool")

    # 97 C3 — width reads as rank: spine 4.3 m, track 2.5 m, footpath 1.2 m.
    # Except where a piece STANDS ACROSS the way: the gate's opening sets the
    # width through it, and a spine may narrow to that opening for the gate's
    # length (decision 2026-09-07). A 4.3 m road cannot pass a 3 m arch, and
    # the arch is measured geometry while the class width is a convention.
    spanned_ways = {p.get("spans") for p in bp.get("parcels", []) or [] if p.get("spans")}
    widest = {}
    for w in bp.get("routes", []) or []:
        kind, width = w.get("kind"), w.get("widthM")
        want = WAY_WIDTH_CLASS_M.get(kind)
        if want is None or not isinstance(width, (int, float)):
            continue
        if w.get("id") in spanned_ways:
            continue          # the gate piece across it sets the width
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


DOOR_ON_WAY_TOLERANCE_DEG = 60.0
# The door has to open onto the way, so the threshold has to be AT it:
# four metres is a doorstep and a step down, not a walk across a yard.
DOOR_ON_WAY_RANGE_M = 4.0


def _ways(bp: dict):
    for key in ("routes", "canals", "boardwalks"):
        for w in bp.get(key, []) or []:
            pts = w.get("points") or w.get("via") or []
            if len(pts) >= 2:
                yield w, pts


def _nearest_way(bp: dict, point_uv):
    """(way, nearest point on it, distance in UV) for the closest way to a point."""
    best = None
    px, pz = float(point_uv[0]), float(point_uv[1])
    for w, pts in _ways(bp):
        for i in range(len(pts) - 1):
            ax, az = float(pts[i][0]), float(pts[i][1])
            bx, bz = float(pts[i + 1][0]), float(pts[i + 1][1])
            ex, ez = bx - ax, bz - az
            l2 = ex * ex + ez * ez
            if l2 == 0:
                continue
            s = max(0.0, min(1.0, ((px - ax) * ex + (pz - az) * ez) / l2))
            qx, qz = ax + s * ex, az + s * ez
            dist = math.hypot(px - qx, pz - qz)
            if best is None or dist < best[2]:
                best = (w, (qx, qz), dist)
    return best


def _door_way_failures(bp: dict) -> list[str]:
    """The orientation contract, read off the geometry: a door's derived entrance
    must look at the way it opens onto, and its threshold must stand at that way.

    Owner ruling 2026-09-05 — "doors in the right place and facing the right way
    is really crucial": a building is sited so that its entrance faces where the
    player arrives, so a door facing the swamp is a HARD failure, not a note."""
    out: list[str] = []
    bid = bp.get("id", "<missing id>")
    lib = bi.library()
    if not lib:
        return out
    parcels = {p.get("id"): p for p in bp.get("parcels", []) or []}
    for d in bp.get("doors", []) or []:
        parcel = parcels.get(d.get("parcelId"))
        th = d.get("thresholdUV")
        if not parcel or not (isinstance(th, list) and len(th) == 2):
            continue
        record = lib.get(parcel.get("assetRef"))
        ok, _ = _match_parcel_entrance(parcel, d, record)
        bearing = bi.entrance_bearing(record, float(parcel.get("yawDeg") or 0.0))
        if not ok or bearing is None:
            continue
        near = _nearest_way(bp, th)
        if near is None:
            out.append(f"door-on-way — {d.get('id')} opens onto no way at all; a door has to give onto a "
                       f"street, a boardwalk or a canal side within {DOOR_ON_WAY_RANGE_M:.0f} m")
            continue
        way, (qx, qz), dist_uv = near
        dist_m = dist_uv * fp.PROVINCE_EXTENT_M
        if dist_m > DOOR_ON_WAY_RANGE_M:
            out.append(f"door-on-way — {d.get('id')} stands {dist_m:.1f} m from the nearest way "
                       f"({way.get('id')}); a threshold must be within {DOOR_ON_WAY_RANGE_M:.0f} m of the way "
                       f"it opens onto, so move the parcel to the street or run a way to the door")
            continue
        # The bearing to the way is taken from the parcel PIVOT and from the
        # stretch of the way the player walks (`blueprint_footprints`), so the
        # check and `--orient` read the same geometry. Taken from the threshold
        # it would be degenerate wherever a way runs right past the door.
        centre = _parcel_centre_m(parcel)
        target = fp.way_point_facing(parcel, way, way.get("points") or way.get("via"))
        if centre is None or target is None:
            continue
        to_way = math.degrees(math.atan2(target[0] - centre[0], -(target[1] - centre[1]))) % 360.0
        off = _angle_delta(bearing, to_way)
        if off > DOOR_ON_WAY_TOLERANCE_DEG:
            out.append(f"door-on-way — {d.get('id')} sits on an entrance looking {bearing:.0f}°, but the "
                       f"way it opens onto ({way.get('id')}, {dist_m:.1f} m off) lies "
                       f"{to_way:.0f}° — {off:.0f}° away, over the {DOOR_ON_WAY_TOLERANCE_DEG:.0f}° "
                       f"the ruling allows; run `python3 -m worldgen.blueprint_footprints --orient --apply "
                       f"<blueprint>` to turn the parcel so its entrance faces the street")
    return out


FRONT_OUTWARD_TOLERANCE_DEG = 60.0
#: Nearer than this and the way runs through the piece's own pivot, so the
#: bearing to it says nothing.
FRONT_WAY_MIN_RANGE_M = 1.0
#: `use` values whose piece is an enclosure edge: it has an inside and an
#: outside, and the player reads the difference. HARD for these; every other
#: piece with a derived front is a WARN, because a front is evidence about how
#: the piece is usually planted, not a law about this one plot.
FRONT_USES = ("gate", "wall", "tower")


def _enclosure_centroid_m(bp: dict, extent_m: float = fp.PROVINCE_EXTENT_M):
    """The middle of whatever this place's boundary encloses, in world metres.

    ANY plotted place has a boundary — a lair, a shrine, a ruin, a camp, a dock
    — so the gate/wall rule reads the boundary polygon, not a settlement centre
    (owner steer 2026-09-07). Parcel centres are the fallback for a record that
    carries no boundary yet.
    """
    poly = bp.get("boundary")
    if _polygon_ok(poly):
        return (sum(float(q[0]) for q in poly) / len(poly) * extent_m,
                sum(float(q[1]) for q in poly) / len(poly) * extent_m)
    centres = [c for c in (_parcel_centre_m(p, extent_m)
                           for p in bp.get("parcels") or []) if c]
    if not centres:
        return None
    return (sum(c[0] for c in centres) / len(centres),
            sum(c[1] for c in centres) / len(centres))


def _bearing_between(frm, to) -> float:
    return math.degrees(math.atan2(to[0] - frm[0], -(to[1] - frm[1]))) % 360.0


def _front_failures(bp: dict) -> tuple[list[str], list[str]]:
    """`(hard, warn)` — is every piece with a derived front planted facing out?

    Owner ruling 2026-09-07, generalised by the owner's steer the same day. A
    piece with no door has no entrance to orient it, so the interiors index
    derives a `front` from the source authors' own placements: the side they
    repeatedly left OPEN (nothing set against it) is the front, the side they
    put against terrain, water or other statics is the back
    (`pipeline/piece_front.py`; docs/research/placement-settlements/
    piece-front-derivation.md).

    Two contracts follow, and they apply to every plotted place, not only
    settlements:

      * **the approach** — the front looks at the line the player arrives on:
        the nearest way, which is also what an `approaches[]` row names in its
        `fromRouteId`. HARD for an enclosure edge (gate, wall, tower), WARN
        for everything else, because a front is how a piece is usually planted
        and a plot may have a reason of its own.
      * **the enclosure** — a gate, a wall or a tower faces AWAY from what the
        boundary polygon encloses, and a gate's front must be the side its way
        comes in from. Always HARD: an inside-out gate is broken, not a choice.
    """
    hard: list[str] = []
    warn: list[str] = []
    lib = bi.library()
    if not lib:
        return hard, warn
    middle = _enclosure_centroid_m(bp)
    spanned = {w.get("id"): w for w, _pts in _ways(bp)}
    for parcel in bp.get("parcels") or []:
        # A stacked top inherits the base assembly's placement. Its local
        # front may differ from the base mesh's axes, but it cannot be turned
        # independently toward the nearest path without breaking the authored
        # snap chain; the base/stair connector checks own that relationship.
        if parcel.get("stacksOn"):
            continue
        record = lib.get(parcel.get("assetRef"))
        front = bi.front(record)
        if front is None:
            continue                    # symmetric: any yaw goes, by design
        centre = _parcel_centre_m(parcel)
        if centre is None:
            continue
        is_edge = parcel.get("use") in FRONT_USES
        # An enclosure edge is held HARD by the enclosure rule below, which is
        # its own special case of the same contract; the approach rule is a WARN
        # for it, because a curtain wall FLANKS its road rather than aiming at
        # it, and the two cannot both be satisfied within 60° when a wall runs
        # alongside the way through its own gate (Lilmoth's north stub).
        out = hard if bi.entrance(record) else warn
        world = (float(front["deg"]) + float(parcel.get("yawDeg") or 0.0)) % 360.0
        where = (f"parcel {parcel.get('id')} ({parcel.get('use')}) has a derived front "
                 f"({front['evidence']} evidence, {front['deg']:.0f}° in the piece's own frame) "
                 f"looking {world:.0f}° after yaw {parcel.get('yawDeg')}°")

        # (1) the front looks at the line the player arrives on. A piece the
        # way runs THROUGH (a gate arch) is exempt: the nearest point of a way
        # that passes under the piece is the piece itself, so the bearing to it
        # says nothing — the spanned-way rule below is what holds that case.
        near = None if parcel.get("spans") else _nearest_way(
            bp, [centre[0] / fp.PROVINCE_EXTENT_M, centre[1] / fp.PROVINCE_EXTENT_M])
        if near is not None:
            way, (qx, qz), dist_uv = near
            target = (qx * fp.PROVINCE_EXTENT_M, qz * fp.PROVINCE_EXTENT_M)
            to_way = _bearing_between(centre, target)
            off = _angle_delta(world, to_way)
            # A way nearer than a metre runs over the piece's own pivot (a gate
            # the road passes through): the bearing to it is noise, and the
            # enclosure rule below is what says which way round the piece goes.
            if dist_uv * fp.PROVINCE_EXTENT_M >= FRONT_WAY_MIN_RANGE_M \
                    and off > FRONT_OUTWARD_TOLERANCE_DEG:
                out.append(
                    f"front — {where}, but the way the player arrives on ({way.get('id')}) lies "
                    f"{to_way:.0f}° — {off:.0f}° away, over the {FRONT_OUTWARD_TOLERANCE_DEG:.0f}° "
                    f"allowed. The open side of a piece is the side its author left facing the "
                    f"path; turn the parcel to about {(to_way - float(front['deg'])) % 360.0:.0f}°")

        if not is_edge or not front.get("outside") or middle is None:
            continue

        # (2) an enclosure edge faces away from what the boundary encloses.
        #
        # A gate the way runs through is the exception (2026-09-07): its wall
        # run is fixed square across its road by the network stitch, so only
        # two orientations exist — yaw and yaw + 180 — and the spanned-way
        # checks below are what choose between them. Holding it to the boundary
        # centroid as well can demand a third orientation that does not exist,
        # which is a rule asking for a piece nobody made. Reported, not fatal.
        spans_a_way = parcel.get("use") == "gate" and parcel.get("spans") in spanned
        outward = _bearing_between(middle, centre)
        off = _angle_delta(world, outward)
        if off > FRONT_OUTWARD_TOLERANCE_DEG:
            (warn if spans_a_way else hard).append(
                f"front — {where}, but away from what this place's boundary encloses is "
                f"{outward:.0f}° — {off:.0f}° off, over the {FRONT_OUTWARD_TOLERANCE_DEG:.0f}° "
                f"allowed. Turn the parcel to about "
                f"{(outward - float(front['deg'])) % 360.0:.0f}° (owner ruling 2026-09-07: a gate "
                f"or wall faces out)")
            continue
        if parcel.get("use") != "gate":
            continue
        way = spanned.get(parcel.get("spans"))
        if way is None:
            continue
        if parcel.get("id") in (way.get("endsAt") or []):
            # The way stops AT the arch rather than running through it: the road
            # comes up to the gate from the inside, so there is no outer end to
            # check and the enclosure rule above is the whole contract.
            continue
        pts = way.get("points") or way.get("via") or []
        if len(pts) < 2:
            continue
        # The way runs THROUGH the gate, so its outer end must lie on the front:
        # the road comes in through the outside of an arch.
        far = max(((float(q[0]) * fp.PROVINCE_EXTENT_M, float(q[1]) * fp.PROVINCE_EXTENT_M)
                   for q in pts),
                  key=lambda q: (q[0] - middle[0]) ** 2 + (q[1] - middle[1]) ** 2)
        to_road = _bearing_between(centre, far)
        gap = _angle_delta(world, to_road)
        if gap > FRONT_OUTWARD_TOLERANCE_DEG:
            hard.append(
                f"front — gate {parcel.get('id')} spans {parcel.get('spans')}, whose outer end lies "
                f"{to_road:.0f}° from the arch, but the gate's front looks {world:.0f}° — "
                f"{gap:.0f}° off. The road comes in through the outside of a gate, so turn the parcel")
    return hard, warn


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


LANE_TERMINALS_PATH = (Path(__file__).resolve().parents[3] / "world" / "sources"
                       / "routes" / "lane-terminals.json")


@lru_cache(maxsize=1)
def _lane_terminal_docks() -> dict[str, tuple[float, float]]:
    """{dockId: (u, v)} declared in lane-terminals.json — the berths the Phase 4
    boat lanes are re-ended at (compile_society)."""
    try:
        doc = json.loads(LANE_TERMINALS_PATH.read_text())
    except (OSError, json.JSONDecodeError):
        return {}
    out: dict[str, tuple[float, float]] = {}
    for spec in (doc.get("terminals") or {}).values():
        uv, did = spec.get("terminalUV"), spec.get("dockId")
        if isinstance(did, str) and isinstance(uv, list) and len(uv) == 2:
            out[did] = (float(uv[0]), float(uv[1]))
    return out


def _water_routes() -> dict:
    try:
        return {rid: r for rid, r in pn.load_network().items() if r.is_water}
    except Exception:  # noqa: BLE001 — a partial checkout has no bundles
        return {}


def _approach_points(points, from_end: str, distance_m: float) -> list[tuple[float, float]]:
    """Densely sample the first ``distance_m`` of a route from one end.

    Route vertices are an authoring representation, not a depth sampling
    guarantee: a long segment can cross a shallow bar between its endpoints.
    The fixed maximum step makes continuous-clearance checks independent of
    how finely a route happened to be digitised.
    """
    pts = list(points) if from_end == "head" else list(reversed(points))
    out = [pts[0]] if pts else []
    walked = 0.0
    for a, b in zip(pts, pts[1:]):
        seg = math.dist(a, b)
        remaining = min(seg, max(0.0, distance_m - walked))
        steps = max(1, math.ceil(remaining / DOCK_DEPTH_SAMPLE_STEP_M))
        for step in range(1, steps + 1):
            along = min(remaining, step * remaining / steps)
            t = along / seg if seg else 0.0
            out.append((a[0] + (b[0] - a[0]) * t,
                        a[1] + (b[1] - a[1]) * t))
        if walked + seg >= distance_m:
            break
        walked += seg
    return out


def _dock_survey(survey=None):
    if survey is not None:
        return survey
    from . import street_router as _sr
    try:
        return _sr.default_survey()
    except Exception:  # noqa: BLE001 — no published rasters in this checkout
        return None


# A berth's water is the depth the province publishes, and nothing else.
#
# There used to be a MARSH_WATER_CREDIT_M here: a cell inside `open_water` was
# credited with the canoe minimum "because the province publishes a depth only
# for the bodies its hydrology solves". That premise is false under water
# schema v2 — the surface raster publishes a SIGNED depth on every cell, and on
# the marsh cells the credit existed to rescue it reads negative. The credit
# therefore manufactured 0.6 m of water out of class membership, which is how a
# berth 91 m from usable water once satisfied a 10 m wet-join rule.
def _water_depth_at(survey, x: float, z: float) -> float | None:
    try:
        return float(survey.sample(x, z)["hydrology"]["waterDepthM"])
    except Exception:  # noqa: BLE001
        return None



@lru_cache(maxsize=1)
def quest_ids() -> frozenset[str]:
    """Every authored quest id — the set a socket's `questId` may name."""
    try:
        from . import quests as _q
        return frozenset(str(q.get("id")) for q in _q.load_quests())
    except Exception:  # noqa: BLE001 — a partial checkout has no quest data
        return frozenset()


def _validate_socket_purposes(bp: dict, fail) -> None:
    """A quest purpose is a socket and a socket is a quest purpose (owner
    review 2026-09-08). The prose said "the elder gives you work" and nothing
    on the map said where; these two checks are what stop that."""
    sockets = bp.get("questSockets") or []
    by_id = {s.get("id"): s for s in sockets}
    parcels = bp.get("parcels") or []
    quest_parcels: dict[str, list[dict]] = {}
    for parcel in parcels:
        entries = [e for e in (parcel.get("playerPurpose") or [])
                   if isinstance(e, dict) and e.get("kind") in QUEST_PURPOSE_KINDS]
        if entries:
            quest_parcels[parcel.get("id")] = entries
    known_quests = quest_ids()

    for parcel_id, entries in quest_parcels.items():
        for e in entries:
            ref = e.get("socketRef")
            if not isinstance(ref, str) or not ref:
                fail(f"parcel {parcel_id} carries a {e['kind']!r} purpose with no socketRef — "
                     f"a purpose that names a quest must name the questSockets[] entry the player "
                     f"finds it at, or the map shows nothing where the record promises work")
                continue
            socket = by_id.get(ref)
            if socket is None:
                fail(f"parcel {parcel_id} playerPurpose socketRef {ref!r} is not a "
                     f"questSockets[] id in this blueprint")
            elif socket.get("parcelId") != parcel_id:
                fail(f"parcel {parcel_id} points at socket {ref!r}, but that socket is bound "
                     f"to {socket.get('parcelId')!r} — a purpose and its socket are the same place")

    for socket in sockets:
        pid = socket.get("parcelId")
        if pid is not None and pid not in quest_parcels:
            fail(f"socket {socket.get('id')} is bound to parcel {pid!r}, which carries no "
                 f"playerPurpose of kind {sorted(QUEST_PURPOSE_KINDS)} — a quest marker on a "
                 f"building the record does not call a quest building")
        qid = socket.get("questId")
        if qid is not None and known_quests and qid not in known_quests:
            fail(f"socket {socket.get('id')} names questId {qid!r}, which is not a quest in "
                 f"world/sources/quests/ (run `python3 -m worldgen.quests --check`)")


def _validate_docks(bp: dict, fail, warnings: list[str] | None, survey=None, geometry: bool = True) -> None:
    """97 B5 / G9 + the 2026-09-08 review: a dock is a WATER TERMINAL.

    Three things are HARD here. The dock declares the deepest hull it serves;
    a `networkTerminals[]` entry of water kind names it; and the water the
    province publishes actually reaches it — its end within
    DOCK_TERMINAL_TOLERANCE_M, carrying the hull class's depth
    DOCK_DEPTH_SAMPLE_M along the serving route. Which of the two was moved to
    meet the other is `fit`, derived when it is not declared. Passing evidence
    remains in the authored dock and compiled route; warnings are reserved for
    findings that need action."""
    docks = bp.get("docks") or []
    if not docks:
        return
    terminals = bp.get("networkTerminals") or []
    by_dock: dict[str, list[dict]] = {}
    for t in terminals:
        did = t.get("dockId")
        if isinstance(did, str):
            by_dock.setdefault(did, []).append(t)
    routes = _water_routes()
    survey = _dock_survey(survey)
    extent = float(getattr(survey, "extent_m", fp.PROVINCE_EXTENT_M))
    lane_terminal_docks = _lane_terminal_docks()

    for dk in docks:
        did = dk.get("id")
        pos = dk.get("position")
        hull = dk.get("hullClass")
        if hull not in HULL_CLASS_DEPTH_M:
            fail(f"dock {did}: hullClass must be one of {sorted(HULL_CLASS_DEPTH_M)} "
                 f"(97 B5 — the deepest hull this berth serves sets the depth the water must carry)")
        if dk.get("fit") is not None and dk.get("fit") not in DOCK_FITS:
            fail(f"dock {did}: fit must be one of {sorted(DOCK_FITS)} — which of the berth and the "
                 f"channel was moved to meet the other")
        if dk.get("fit") == "water-to-dock" and not str(dk.get("fixedBerthReason") or "").strip():
            fail(f"dock {did}: fit 'water-to-dock' requires fixedBerthReason — an authored berth "
                 f"may override the dock-independent natural waterway only for an explicit physical "
                 f"constraint")
        served = by_dock.get(did) or []
        water_served = [t for t in served if t.get("kind") in ("lane", "channel")]
        if not water_served:
            fail(f"dock {did}: a dock is a water terminal — it needs a networkTerminals[] entry of "
                 f"kind 'lane' or 'channel' carrying dockId {did!r}, so the route that serves the "
                 f"berth is named and its geometry is checked")
        for t in water_served:
            if t.get("kind") == "lane" and did not in lane_terminal_docks:
                fail(f"dock {did}: terminal {t.get('id')} is a lane berth, so "
                     f"world/sources/routes/lane-terminals.json must carry an entry with "
                     f"dockId {did!r} — otherwise compile_society still ends the lane at the anchor")
        if did in lane_terminal_docks and isinstance(pos, list) and len(pos) == 2:
            lu, lv = lane_terminal_docks[did]
            off = math.dist((float(pos[0]) * extent, float(pos[1]) * extent), (lu * extent, lv * extent))
            if off > DOCK_TERMINAL_TOLERANCE_M:
                fail(f"dock {did}: lane-terminals.json puts the berth {off:.1f} m from the dock "
                     f"position — the two files must name the same point")
        if not geometry or not (isinstance(pos, list) and len(pos) == 2) or survey is None:
            continue

        dx, dz = float(pos[0]) * extent, float(pos[1]) * extent
        need = HULL_CLASS_DEPTH_M.get(hull)
        serving_rows: list[tuple[dict, object, float]] = []
        for t in water_served:
            rid = t.get("routeId")
            serving = routes.get(rid)
            if serving is None or not serving.points_m:
                fail(f"dock {did}: terminal {t.get('id')} names serving route {rid!r}, but that "
                     f"route is absent from the published water network")
                continue
            end_m = min(math.dist((dx, dz), serving.points_m[0]),
                        math.dist((dx, dz), serving.points_m[-1]))
            on_route = min(math.dist((dx, dz), point) for point in serving.points_m)
            # A lane may pass through a berth; a compiled minor channel is a
            # true terminal and therefore must end there.
            reach_m = min(end_m, on_route) if t.get("kind") == "lane" else end_m
            if reach_m > DOCK_TERMINAL_TOLERANCE_M:
                fail(f"dock {did}: declared serving route {rid!r} reaches {reach_m:.0f} m away "
                     f"(nearest end {end_m:.0f} m) — an unrelated nearby waterway cannot certify "
                     f"this berth (tolerance {DOCK_TERMINAL_TOLERANCE_M:.0f} m)")
            serving_rows.append((t, serving, end_m))

        for t, serving, _end_m in serving_rows:
            which = "head" if math.dist((dx, dz), serving.points_m[0]) <= \
                math.dist((dx, dz), serving.points_m[-1]) else "tail"
            samples = [_water_depth_at(survey, x, z)
                       for x, z in _approach_points(serving.points_m, which, DOCK_DEPTH_SAMPLE_M)]
            samples = [v for v in samples if v is not None]
            if samples:
                depth = min(samples)
                if need is not None and depth + 1e-6 < need:
                    fail(f"dock {did}: hullClass {hull!r} needs {need:.1f} m continuously, but "
                         f"serving route {t.get('routeId')!r} falls to {depth:.2f} m within "
                         f"{DOCK_DEPTH_SAMPLE_M:.0f} m of the berth (97 B5/G9)")


def _derive_dock_fit(dk: dict, survey, end_m: float, need: float | None) -> str:
    """Default toward physical evidence, never toward a self-authored berth.

    A fixed berth is an explicit exception and still has to pass depth/reach;
    every ordinary dock follows the dock-independent natural channel.
    """
    pos = dk.get("position") or [0, 0]
    extent = float(getattr(survey, "extent_m", fp.PROVINCE_EXTENT_M))
    here = _water_depth_at(survey, float(pos[0]) * extent, float(pos[1]) * extent) if survey else None
    passes = need is None or (here is not None and here + 1e-6 >= need)
    fixed = bool(str(dk.get("fixedBerthReason") or "").strip())
    return "water-to-dock" if (fixed and passes and end_m <= DOCK_FIT_SEARCH_M) else "to-water"


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
        warnings += _fence_warnings(bp, survey)
        warnings += _why_quality_warnings(bp)
        warnings += _occupancy_warnings(bp)

    def fail(msg: str) -> None:
        errors.append(f"{bid}: {msg}")
    from .player_purpose import validate_player_purpose as _vpp; errors += _vpp(bp, warnings)

    for key in REQUIRED:
        if key not in bp or bp[key] is None:
            fail(f"missing required field '{key}'")
    if known_place_ids is not None and bid not in known_place_ids:
        fail("id not present in the place catalogue — blueprints detail catalogue records")
    macro_record = catalogue_records().get(bid)
    if macro_record is not None:
        from .place_obligations import check_phase11
        obligation_errors, _ = check_phase11(macro_record, bp)
        errors += obligation_errors
        from .prose_links import check_blueprint
        errors += check_blueprint(bp)
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
        # 97 C5 `worksWith` (decision 2026-09-07): `abuts` covers KIT SNAP PAIRS
        # only. A hoist against the rock face it works and an oven beside its
        # rack are trade contacts: no snap was ever authored for them, so they
        # stand close and clear rather than touching.
        if "worksWith" in p:
            ww = p["worksWith"]
            if not isinstance(ww, list) or not ww or not all(isinstance(x, str) for x in ww):
                fail(f"parcel {p.get('id')}: 97 C5 — worksWith must list the parcel ids this piece works "
                     f"against by trade")
            else:
                for other in ww:
                    if other not in {q.get("id") for q in bp.get("parcels", [])}:
                        fail(f"parcel {p.get('id')}: 97 C5 — worksWith names {other!r}, which is not a "
                             f"parcel in this blueprint")
                    if other in (p.get("abuts") or []):
                        fail(f"parcel {p.get('id')}: 97 C5 — {other!r} is declared both `abuts` (a kit "
                             f"snap) and `worksWith` (a trade contact); it is one or the other")
            if not isinstance(p.get("worksWithWhy"), str) or len(p["worksWithWhy"].strip()) < MIN_WHY_CHARS:
                fail(f"parcel {p.get('id')}: 97 C5 — worksWithWhy is required — one plain sentence saying "
                     f"what the two pieces do together (the hoist over the cut, the oven by its rack)")
        it = p.get("interior")
        if it is not None and (not isinstance(it, dict) or it.get("kind") not in INTERIOR_KINDS):
            fail(f"parcel {p.get('id')}: interior.kind must be one of {sorted(INTERIOR_KINDS)}")
    for lm in bp.get("landmarks", []):
        check_why(f"landmark {lm.get('id')}", lm.get("why"), WHY_KEYS_FULL)
    for dk in bp.get("docks", []):
        check_why(f"dock {dk.get('id')}", dk.get("why"), WHY_KEYS_AREA)
        if dk.get("districtId") is not None and dk.get("districtId") not in district_ids:
            fail(f"dock {dk.get('id')}: unknown districtId {dk.get('districtId')}")
    # A fixture compiled --skip-catalogue (known_place_ids is None) has no
    # published water network to stitch to: schema checks only.
    _validate_docks(bp, fail, warnings, survey, geometry=known_place_ids is not None)
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

    # B3 (gap plan): districts and combat rooms are derived from the geometry
    # they contain, like parcel footprints. This check deliberately runs after
    # parcel and combat schema checks so a malformed source gets one useful
    # derivation error rather than an exception.
    area_boundaries, area_problems = fp.derived_area_boundaries(bp)
    for problem in area_problems:
        fail(f"B3 derived-area — {problem}")
    for area in [*(bp.get("districts", []) or []), *combat_spaces]:
        aid = area.get("id")
        derived = area_boundaries.get(aid)
        if derived is not None and not fp.area_polygons_match(area.get("boundary"), derived):
            fail(f"{aid}: boundary is not the derived polygon — run "
                 f"'python3 -m worldgen.blueprint_footprints --areas {bid}.json'")

    for key in WAY_KEYS:
        for w in bp.get(key, []):
            wid = w.get("id")
            if w.get("districtId") is not None and w.get("districtId") not in district_ids:
                fail(f"{key} {wid}: unknown districtId {w.get('districtId')}")
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
            if key == "fences":
                from . import street_router as _sr
                if not w.get("assetRef"):
                    fail(f"fences {wid}: assetRef (the kit's fence/wall piece) is required")
                if w.get("class") not in _sr.FENCE_CLASSES:
                    fail(f"fences {wid}: 97 C10 — class must be one of "
                         f"{sorted(_sr.FENCE_CLASSES)} (the wall's own kind decides how it is routed)")
                if w.get("routing") == "straight" and not (
                        isinstance(w.get("routingWhy"), str) and len(w["routingWhy"].strip()) >= MIN_WHY_CHARS):
                    fail(f"fences {wid}: 97 C10 — a straight wall needs routingWhy: a wall is routed "
                         f"over the ground unless it was SURVEYED, and the record says who surveyed it")
                wok = w.get("waterOk")
                if wok is not None and not (isinstance(wok, dict)
                                            and isinstance(wok.get("maxDepthM"), (int, float))
                                            and wok["maxDepthM"] > 0):
                    fail(f"fences {wid}: 97 C10 — waterOk must be {{maxDepthM: <metres>}} (how deep a "
                         f"pole is driven), or be absent")
                gap_ids = {x.get("id") for k in ("routes", "canals", "boardwalks")
                           for x in bp.get(k, []) or []}
                for g in w.get("gapAt", []) or []:
                    if g not in gap_ids:
                        fail(f"fences {wid}: 97 C10 — gapAt {g!r} names no way in this blueprint; a gap "
                             f"is an opening in the wall where a named way passes through it")
                parcel_ids = {x.get("id") for x in bp.get("parcels", []) or []}
                for a in w.get("abuts", []) or []:
                    if a not in parcel_ids:
                        fail(f"fences {wid}: 97 C10 — abuts {a!r} names no parcel in this blueprint; "
                             f"abuts is the DESIGNED contact (a course a dais stands on, a conduit its "
                             f"pillars carry, a panel butted into the piece it plugs against)")
                if (w.get("abuts") and not (isinstance(w.get("abutsWhy"), str)
                                            and len(w["abutsWhy"].strip()) >= MIN_WHY_CHARS)):
                    fail(f"fences {wid}: 97 C10 — abutsWhy is required with abuts: contact between a "
                         f"wall and a building is either a mistake or a design, and the record says which")
                want_module = _sr.module_m(w)
                if want_module is not None and w.get("moduleM") != want_module:
                    fail(f"fences {wid}: 97 C10 — moduleM is derived from the measured piece "
                         f"({want_module} m, the long axis of {w.get('assetRef')}); it reads "
                         f"{w.get('moduleM')!r} — run 'python3 -m worldgen.street_router --apply <file>'")

    # 97 C10 (owner ruling 2026-09-08) — a wall is a line ON the ground: it
    # crosses no building, crosses a way only at a declared gap, and stands in
    # water only where its own waterOk says poles are driven.
    if bp.get("fences"):
        from . import street_router as _sr_f
        errors += [f"{bid}: {m}" for m in _fence_failures(
            bp, survey if survey is not None else _sr_f.default_survey())]

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
    if len(approaches) < 1:
        fail("approaches: at least one walking/boat approach must be designed (the place is judged from the ground)")
    elif len(approaches) < 2 and size_class(bp) in ("M3", "M4", "M5"):
        fail(f"approaches: a {size_class(bp)} place is reached from more than one side; design at least "
             f"two approaches (research/placement-settlements/openworld-approach-and-wayfinding.md §5 item 1)")
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
        density_form = sg.get("densityForm", "settlement")
        if density_form not in DENSITY_FORMS:
            fail(f"scaleGrounding.densityForm must be one of {sorted(DENSITY_FORMS)}, "
                 f"not {density_form!r}")
        # 97 D7: the plan counts BUILDINGS AND STRUCTURES. A rack, an oven or a
        # notice board is dressing, and the top of a scaffold is the same
        # structure seen from higher up — neither is a second building (audit
        # §6.5; decision 2026-09-07). The Morrowind ratio is the rule here
        # (Balmora ~40 structures for a city); the settlement register's
        # 150–400 band counts total placed objects, props included.
        n_parcels = len([p for p in pk.counted_parcels(bp)
                         if (p.get("use") or "") not in ("fence", "wall")])
        if isinstance(bpn, int) and bpn > 0 and not (0.75 * bpn <= n_parcels <= 1.25 * bpn):
            fail(f"scaleGrounding.buildingsPlanned={bpn} but {n_parcels} buildings and structures are "
                 f"authored (props and stacked pieces do not count) — the plan and the drawing disagree "
                 f"by more than 25 %")

    for key in ("landmarks", "docks"):
        for item in bp.get(key, []):
            pos = item.get("position")
            if not (isinstance(pos, list) and len(pos) == 2):
                fail(f"{key} {item.get('id')}: position must be [u,v]")
            if "scale" in item and not (isinstance(item["scale"], (int, float)) and 0.2 <= item["scale"] <= 5.0):
                fail(f"{key} {item.get('id')}: scale must be a uniform factor in 0.2–5")
            if key == "landmarks" and "yawDeg" in item and not isinstance(item["yawDeg"], (int, float)):
                fail(f"landmark {item.get('id')}: yawDeg must be a number")
            if key == "landmarks" and not isinstance(item.get("assetRef"), str):
                fail(f"landmark {item.get('id')}: assetRef is required for physical compilation")
            if key == "landmarks" and item.get("groundFit", "direct") not in GROUND_FIT:
                fail(f"landmark {item.get('id')}: groundFit must be one of {sorted(GROUND_FIT)}")
            if key == "docks" and not (
                    isinstance(item.get("assetRef"), str) and item["assetRef"].strip()):
                fail(f"dock {item.get('id')}: assetRef must be a non-empty built asset id — "
                     f"a physical berth cannot compile from position and water depth alone")
            if key == "docks" and item.get("groundFit") != "stilt":
                fail(f"dock {item.get('id')}: groundFit must be 'stilt' because piled berths "
                     f"stand on the bed rather than floating at terrain height")
            if key == "docks" and "yawDeg" in item and not isinstance(item["yawDeg"], (int, float)):
                fail(f"dock {item.get('id')}: yawDeg must be a number")

    _validate_socket_purposes(bp, fail)
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
        # Which side the door opens on: the KIT's measured entrance is the
        # authority where the pipeline mined one. `blueprint_footprints`
        # derives `facingDeg` as the piece's `sideDeg` turned by the parcel's
        # yaw, so that is what this check compares against. The
        # nearest-footprint-edge proxy stays for pieces the pipeline derived no
        # entrance for — it is a proxy, and on a composite hull it is a bad
        # one: Lilmoth's kiosks carry their threshold ~0.3 m from the hull
        # centre, where the nearest of eight edges (one of them a 0.7 m sliver)
        # swings 68deg on a third of a metre of re-derivation and fails a door
        # the kit itself placed.
        measured = bi.entrance(interiors.get(parcel.get("assetRef"))) if (
            interiors and parcel) else None
        side = measured.get("sideDeg") if isinstance(measured, dict) else None
        if isinstance(side, (int, float)) and isinstance(d.get("facingDeg"), (int, float)):
            want = (float(side) + float(parcel.get("yawDeg") or 0.0)) % 360.0
            off = _angle_delta(float(d["facingDeg"]), want)
            if off > DOOR_FACING_TOLERANCE_DEG:
                fail(f"door {d.get('id')}: facingDeg {d['facingDeg']:.0f}° is not the side its piece was "
                     f"authored to open on ({parcel.get('assetRef')} measures {float(side):.0f}°, which at "
                     f"yaw {float(parcel.get('yawDeg') or 0.0):.0f}° looks {want:.0f}°, {off:.0f}° away) — "
                     f"re-derive with 'blueprint_footprints --doors'")
            bearing = None
        else:
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
        if isinstance(got, str) and got.strip() and ":" not in got:
            known_kits = kit_config_names()
            built = built_kit_names()
            if known_kits and got not in known_kits:
                fail(f"door {d.get('id')}: interiorClaim.interiorRef {got!r} names no interior kit — the door "
                     f"teleports the player into that kit, so it must have a config in "
                     f"{KIT_CONFIG_DIR} (configured kits: {', '.join(sorted(known_kits)[:6])}…)")
            elif built and got not in built:
                fail(f"door {d.get('id')}: interiorClaim.interiorRef {got!r} has a kit config but no BUILT kit "
                     f"({bi.KITS_DIR}/{got}.kit.json is missing) — a config is an intention, and the door "
                     f"teleports the player into the built kit; build it before the door can claim it")
        measured_class = record.get("sizeClass")
        if measured_class and (d.get("interiorClaim") or {}).get("sizeClass") != measured_class:
            area = record.get("planAreaM2", 0.0)
            fail(f"door {d.get('id')}: interiorClaim.sizeClass is "
                 f"{(d.get('interiorClaim') or {}).get('sizeClass')!r}, but the piece measures {area:.0f} m² — "
                 f"small is under {bi.SIZE_CLASS_SMALL_MAX_M2:.0f} m², medium under "
                 f"{bi.SIZE_CLASS_MEDIUM_MAX_M2:.0f} m², large above that, so it is {measured_class!r}")
        # A door may only sit on the piece's ONE canonical entrance (owner
        # rulings 2026-09-05 / 2026-09-07): the mod's own load door, else a door
        # part the authors placed on this shell, else the family's door mesh,
        # else an opening measured off the geometry. Never a bearing a designer
        # liked the look of.
        ok, why = _match_parcel_entrance(parcel, d, record)
        if not bi.entrance(record):
            fail(f"door {d.get('id')}: parcel {parcel.get('id')} uses {parcel.get('assetRef')}, which has an "
                 f"inside but no derived entrance ({why}), so it may not carry a door — use the composite that "
                 f"ships the door, or record a sourcing gap")
        elif not ok:
            fail(f"door {d.get('id')}: facingDeg {d.get('facingDeg')}° does not sit on the canonical entrance of "
                 f"{parcel.get('assetRef')} after yaw {parcel.get('yawDeg')}° ({why}, tolerance "
                 f"±{DOORWAY_TOLERANCE_DEG:.0f}° / ±{bi.RADIAL_TOLERANCE_M:.1f} m) — a door cannot be claimed "
                 f"on a blank wall; use the composite that ships the door, or record a sourcing gap")

    if interiors:
        linked_shells = bi.linked_shells()
        for p in bp.get("parcels", []):
            record = interiors.get(p.get("assetRef"))
            if record is None:
                continue
            # HARD (owner 2026-09-07): the mods' own load doors are the truth
            # about what has an inside. A shell the door manifest links may
            # never be authored as a mass, and may never point at a kit that
            # was never built.
            if p.get("assetRef") in linked_shells:
                link = linked_shells[p["assetRef"]][0]
                if record.get("interior") == "none":
                    fail(f"parcel {p.get('id')}: {p.get('assetRef')} is authored with no interior, but "
                         f"{link.get('plugin')} teleports from this shell into {link.get('interiorCell')} "
                         f"({link.get('placements')} placements) — a shell the mods link to an interior "
                         f"always has one (owner ruling 2026-09-07); rebuild the interiors index")
                kit = record.get("tileset")
                if kit and built_kit_names() and kit not in built_kit_names():
                    fail(f"parcel {p.get('id')}: {p.get('assetRef')} is linked to interior cell "
                         f"{link.get('interiorCell')} but its interior kit {kit!r} is not built — a linked "
                         f"shell may not stand on a placeholder kit (owner ruling 2026-09-07)")
            if record.get("interior") in bi.NEEDS_INTERIOR and not doors_by_parcel.get(p.get("id")):
                want = interiors.interior_ref(record) or "a Phase 12 interior claim"
                if not bi.entrance(record):
                    # Every piece the index still calls enclosed now carries a
                    # derived entrance, so this is a kit that was not rebuilt.
                    fail(f"parcel {p.get('id')}: {p.get('assetRef')} has an inside "
                         f"({record.get('interior')}) but its kit derives no entrance — rebuild the "
                         f"interiors index (`python3 -m pipeline.interiors_index` in tooling/asset-pipeline/), "
                         f"use the composite that ships the door, or make the piece a mass "
                         f"(`interior: {{\"kind\": \"none\"}}`)")
                    continue
                fail(f"parcel {p.get('id')}: {p.get('assetRef')} has an inside "
                     f"({record.get('interior')} → {want}) but no door in doors[] — every building "
                     f"intended to have an interior must have an entrance (owner ruling 2026-09-05); "
                     f"run `python3 -m worldgen.blueprint_interiors --report <blueprint>`")

    for msg in _door_way_failures(bp):
        fail(msg)

    front_hard, front_warn = _front_failures(bp)
    for msg in front_hard:
        fail(msg)
    if warnings is not None:
        warnings += [f"{bid}: {msg}" for msg in front_warn]

    # Building a place clears its vegetation, exactly as it would in the real
    # world (owner ruling, 0041). That is a property of every place, so the
    # declaration is REQUIRED, not optional: an absent block used to slip
    # through here and then fail as a bare KeyError inside compile_settlement,
    # which names neither the place nor the rule. A place that clears nothing
    # says so with three empty lists.
    cl = bp.get("clearance", {})
    if not cl:
        fail("clearance is required — every place declares how building it "
             "clears the wild growth (0041): hardClear, thinned, kept "
             "(all three, empty lists if it clears nothing)")
    elif not {"hardClear", "thinned", "kept"} <= set(cl):
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


def _dir_signature(blueprint_dir: Path) -> tuple:
    """(name, mtime_ns, size) per file — the cache key for a validated dir.
    Any edit to any blueprint moves it, so a stale result can never be served."""
    return tuple((p.name, p.stat().st_mtime_ns, p.stat().st_size)
                 for p in sorted(blueprint_dir.glob("*.json")))


_VALIDATE_ALL_CACHE: dict = {}


def validate_all(blueprint_dir: Path = BLUEPRINT_DIR, known_place_ids: set[str] | None = None,
                 warnings: list[str] | None = None) -> list[str]:
    errors: list[str] = []
    if not blueprint_dir.exists():
        return errors
    # Validating the live dir is the same pure computation every time it is
    # asked for, and the suites ask repeatedly. Memoised on the file
    # signature + the known ids; the caller gets a fresh list either way, and
    # the warnings path is recorded alongside so `--check` prints the same
    # report it always did.
    key = (str(blueprint_dir), _dir_signature(blueprint_dir),
           None if known_place_ids is None else frozenset(known_place_ids))
    hit = _VALIDATE_ALL_CACHE.get(key)
    if hit is not None:
        cached_errors, cached_warnings = hit
        if warnings is not None:
            warnings += cached_warnings
        return list(cached_errors)
    own_warnings: list[str] = []
    for path in sorted(blueprint_dir.glob("*.json")):
        data = json.loads(path.read_text())
        if data.get("schemaVersion") != SCHEMA_VERSION:
            errors.append(f"{path.name}: schemaVersion must be {SCHEMA_VERSION}")
            continue
        bp = data.get("blueprint", {})
        if path.stem != bp.get("id"):
            errors.append(f"{path.name}: filename must equal blueprint id ({bp.get('id')})")
        errors += validate_blueprint(bp, known_place_ids, None, own_warnings)
    _VALIDATE_ALL_CACHE.clear()
    _VALIDATE_ALL_CACHE[key] = (list(errors), list(own_warnings))
    if warnings is not None:
        warnings += own_warnings
    return errors


def main(argv: list[str] | None = None) -> int:
    import argparse
    ap = argparse.ArgumentParser(
        description="Validate the authored blueprints (schema + module 97 placement rules).")
    # `--check` is the name the README and the placement playbook use. The
    # module only ever validates, so it is accepted and is the default.
    ap.add_argument("--check", action="store_true",
                    help="validate the blueprints (the default; accepted for the documented spelling)")
    ap.add_argument("--id", help="validate ONE blueprint, by id (place.x.y) or slug (y)")
    args = ap.parse_args(argv)

    ids = catalogue_ids()
    warnings: list[str] = []
    if args.id:
        paths = [p for p in sorted(BLUEPRINT_DIR.glob("*.json"))
                 if p.stem == args.id or p.stem.rsplit(".", 1)[-1] == args.id]
        if not paths:
            print(f"blueprint: no blueprint matches --id {args.id!r} in {BLUEPRINT_DIR}", file=sys.stderr)
            return 2
        errors = []
        for path in paths:
            data = json.loads(path.read_text())
            if data.get("schemaVersion") != SCHEMA_VERSION:
                errors.append(f"{path.name}: schemaVersion must be {SCHEMA_VERSION}")
                continue
            errors += validate_blueprint(data.get("blueprint", {}), ids, None, warnings)
    else:
        errors = validate_all(known_place_ids=ids, warnings=warnings)
    for w in warnings:
        print(f"blueprint: WARN: {w}", file=sys.stderr)
    for e in errors:
        print(f"blueprint: {e}", file=sys.stderr)
    print(f"blueprint: {'FAIL' if errors else 'OK'} ({len(warnings)} warnings)")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
