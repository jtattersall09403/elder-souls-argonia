"""The place catalogue: schema, validator and loader (Phase 11, decision 0041 Part 2).

The catalogue is the province's PERMANENT place registry. This module is the
schema's source of truth; world/sources/catalogue/README.md carries the rules
prose. Data layout:

    world/sources/catalogue/taxonomy.json
        { "schemaVersion": 1,
          "classes": { "<class>": { "<family>": { "<type>": ["<variant>", ...] } } } }
        Variants list may be empty (type has no variants yet).

    world/sources/catalogue/places-<region>.json
        { "schemaVersion": 1, "region": "<region>", "seed": "<seed>",
          "places": [ <record>, ... ] }   # sorted by id

Record fields (0041 Part 2, field-for-field; * = required from birth, the
rest become required as `workflow` advances):

  identity        *id (place.<region>.<slug>), *name or namingRule, aliases
  classification  *taxonomy {class, family, type, variant?, magnitude} —
                  magnitude (M1–M5 or null for non-settlements) lives
                  INSIDE classification, not at the record top level; *status
                  (active|ruined|abandoned|seasonal|drowned|contested|cut)
  provenance      *provenance (canon-named|lore-implied|quest-required|
                  geography-derived|density-fill), *sources [..], *confidence
  prose links     proseRefs? [{sourcePath, exactly one typed questRef /
                  occupantRef / placeRef / routeRef / serviceRef / itemRef /
                  factionRef / socketRef}]. This identifies a name in one
                  exact prose field; it makes no relationship or delivery
                  claim. `worldgen.prose_links` validates both ends.
  why             *why {founding, siteAdvantages, occupantsMotive, pressures,
                  wouldChangeIf} — short form at derivation
  siting          *sitingPrefs {regionClasses, hardConstraints, preferences,
                  landformClasses?, boundTo? {place, maxM}, sightlineTo? [ids]}
                  — boundTo/sightlineTo are TYPED siting (2026-09-04): the plot
                  honours them directly; prose in hardConstraints is a fallback;
                  plotted+: position {u,v}, candidatesConsidered,
                  whySiteWon, scourSiteId?
  relations       relations {dependsOn, supplies, rivals, patrols, tolls,
                  visibleFrom, reachedVia, travelServiceEdges}
  people & power  culture, ownerFaction?, occupants (S-ladder semantic refs),
                  notableNpcSlots
                  factionPresence? [{factionRef, role}] distinguishes a seat,
                  chapter, outpost or office from mere territorial ownership;
                  ownerFaction alone never implies a faction seat (B9a)
  danger/access   *dangerTier, traversalModes, traversalFallback,
                  effortToReach (1–5)
  reward          rewardProfile {kinds, valueTier} (module 20 §12.3b)
  visual/vibe     vibe {silhouette, palette, materials, signatureFeature,
                  condition, mood, approach, senses}
  asset plan      assetPlan [inventory family refs] — feasible by construction
  discovery       *discovery (sightline|road|rumour|document|none)
  quest hooks     questHooks {provisions, tags, opportunity, tierOwnership} —
                  the join with docs/quests (see docs/quests/25-quest-place-map.md).
                  provisions: `quest.provision.<slug>` ids answering the
                  World-generation provision column of quests 30/40/50 (the
                  §11 tag is dropped, dots/underscores become dashes);
                  tags: the quests-20 §11 vocabulary (LOC/APP/WATER/…);
                  opportunity: the region agent's one-line "what a quest could
                  do here", the places→quests direction;
                  tierOwnership: "<quest or line id> · tier-N", semicolon-joined
                  when several claim one place, lowest tier first.
  build-out keys  rumourPoolKey?, deedCounterKeys [], sockets
                  {scene:[], evidence:[], station:[], marks:[]}  — present
                  from v1 even when empty (buildout register)
  budget          *complexityBudget (trivial|simple|standard|complex —
                  "complex" needs justification; nothing beyond
                  Morrowind-level placement/scripting)
  importance      *importanceTier (0 = canon major … 4 = density fill)
  workflow        *workflow (derived|plotted|authored|frozen)

  --- schemaVersion 2 (Part 4 step 2, owner feedback 2026-09-03; research:
      docs/research/placement-settlements/place-purpose-hostility-and-dungeon-balance.md) ---
  player purpose  *playerPurpose {primary, secondary[], impact, hook} — WHY the
                  player's experience is changed by going here (PURPOSES),
                  impact ∈ mild|real|major|province-changing; hook = one
                  plain sentence a player could say ("the only smith south of
                  the lake, if you can pay in favours")
  hostility       *hostility {baseline, owner?, flips[], clearable, respawn} —
                  who starts the fight (STANCES); flips are ordered
                  {to, when, scope?} with `when` in the quests-85 condition
                  vocabulary; orthogonal to dangerTier (how lethal)
  interior        *interior {kind, family?, sizeBand?, wetFraction?,
                  entranceCount?, exteriorShell?, programRef?} — the Phase 12
                  placeholder; kind none ⇒ the rest absent
  contents        *contents {creatures[], npcs[], loot[]} — ≤ 4 slots each,
                  {slotId, role, registerRef (null until Phase 13), danger?,
                  count?, ...}; a consistency record, not an encounter table
  reward          rewardProfile.kinds now draws only from REWARD_KINDS (20)
  travel          travelStation? {modes[], destinations[]} — a Morrowind-style
                  pay-and-go node (boat/ferry/rootworm/guide); destinations are
                  place ids that also carry a travelStation
  siting note     sitingNote? — why WE placed a canon subject where we did, when
                  the sources put it elsewhere or say nothing. Design rationale
                  belongs here or in `sources`, never in `why.*` prose
                  (quests 60 §45e.1 bans provenance voice in world text)
  services       *services[] — WHICH services the place promises the player,
                  from the closed SERVICES vocabulary. Required on every live
                  settlement/civic record and on any service-hub; DERIVED by
                  `worldgen.derive_services` (that module's docstring is the
                  rule table), never hand-authored, and checked against the
                  blueprint by `worldgen.blueprint_promises` (97 E9 / G22).
  terrain asks    terrainRequests? [{kind, radiusM?, note}] — ground the record's
                  identity needs and the plot could not find (a sinkhole for a
                  "round hole of black water", a dry rise, a narrows). Part 6's
                  meso compiler carves/raises it; until then the semantic audit
                  treats the request as satisfied. Owner ruling 2026-09-04: the
                  fix for "claims a sinkhole, sits on plain ground" may be to
                  MAKE the sinkhole, not always to rewrite the prose. kind ∈
                  TERRAIN_REQUEST_KINDS
  reserve         relationsReserved? — edges pruned because their target is
                  deferred/cut; same shape as relations; restored if the target
                  is promoted (owner ruling 2026-09-03)
  route ids       relations.patrols/tolls and travelServiceEdges reference
                  world/sources/routes/registry.json ids (route.road.*,
                  route.boat.*, route.track.*)

  --- schemaVersion 2 record fields added by 16g (plan 16 §10) -------------
  version         *schemaVersion — an int on EVERY record. The file-level
                  number is the MAXIMUM over its records, so no file claims a
                  shape none of its records has and no record outruns its file.
  design group    designGroup? (`group.<slug>`) — a row in
                  world/sources/catalogue/design-groups.json {id, anchor,
                  members[], loreReason, maxSpreadM}: places that are ONE
                  design, blueprinted and built together. Every member carries
                  the stamp, the anchor is a member, and no two members sit
                  further apart than maxSpreadM.
  co-siting       coSitedWith? [{place, relation, measurement}] — what a pair
                  designed together PROMISES. relation ∈ CO_SITING_RELATIONS;
                  measurement is sightline {clearM, checked}, same-water
                  {entityId}, approach-through {via}, satellite {distanceM,
                  maxM} or ferry-pair {serviceId}. sightline/same-water/
                  ferry-pair are true of the pair and are carried by both
                  records. `worldgen.co_siting --check` MEASURES every row.
  owner ground    ownerGuided? (bool) — the owner is hands-on here;
                  vasteiTutorialScene? (bool, only on an ownerGuided record)
  reservation     reservedFor? ∈ RESERVATIONS — ground held for one purpose;
                  at most one live record per value.
  hero Hist       heroHist? {id (hist.<region>.<slug>, region = the record's),
                  kind?, powerSlot (power.<heroHist.id> | null), *status
                  (hero|reserve — 'reserve' exactly when powerSlot is null),
                  note?}. At most HERO_HIST_SLOTS live records are 'hero'.
  footprint       *footprintRadiusM (on every record with positionM) and
                  *footprintSource ∈ {band, blueprint, polygon} — the ground
                  the place occupies. Optional footprintPolygon [[x,z],…] (≥ 3
                  points, metres, must contain positionM, M4/M5 only) draws
                  the shape instead; with it, footprintSource is 'polygon'.
  city layout     cityLayout? {gate [x,z], centre [x,z], way [[x,z],…] (≥ 2
                  points, starting within 5 m of the gate and ending within
                  5 m of the centre), source: street_router} — M5 only.
  underwater      underwaterAccessDetail? {gating ∈ UNDERWATER_GATINGS,
                  surfaceAccessNodes (int ≥ 0), airPockets, submergedPortal,
                  entityId, depthM} — how the player gets in. Required on
                  every `underwater-entry` record once 16g has run.

Determinism: files sorted by id; the loader rejects unsorted or duplicate
IDs. Permanence: `--check` compares against git HEAD and fails if any
previously committed id is missing (cut places must remain with
status "cut").

Run: python -m worldgen.catalogue --check   (from tooling/world-generation/)

There is no longer a strict mode: the five fields that were strict-only
(season, eraLayers, densityLayer, entrance, underwaterAccess) are required at
`derived` as of 2026-09-02, so plain --check enforces the whole schema.
"""

from __future__ import annotations

import json
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

SCHEMA_VERSION = 1            # taxonomy.json / asset-aliases.json
PLACES_SCHEMA_VERSION = 2     # places-<region>.json (v2: playerPurpose, hostility, interior, contents)

REPO_ROOT = Path(__file__).resolve().parents[3]
CATALOGUE_DIR = REPO_ROOT / "world" / "sources" / "catalogue"

STATUSES = {"active", "ruined", "abandoned", "seasonal", "drowned", "contested", "cut", "under-construction", "deferred"}
# canon-named = the NAME appears verbatim in a cited source; canon-derived =
# the subject is canon but the name is ours (lore critique 2026-09-02 —
# the two are different guarantees and downstream agents must tell them apart)
PROVENANCES = {"canon-named", "canon-derived", "lore-implied", "quest-required", "geography-derived", "density-fill"}
SEASONS = {"all-year", "wet", "dry", "wet-peak", "dry-peak", "varies"}
DENSITY_LAYERS = {"fine-tempo", "destination", "landmark"}
ENTRANCES = {"none", "door", "trapdoor", "cellar-door", "hollow-trunk", "root-mouth",
             "underwater-entry", "sinkhole-lip", "burrow", "stair-throat", "well-shaft",
             "grave-cut", "cave-mouth", "gate"}
UNDERWATER_ACCESS = {"none", "surface-swim", "shallow-dive", "deep-dive", "argonian-only-depth"}
# Subsets of the two vocabularies above, defined HERE so no consumer can invent
# its own spelling. `audit_place_semantics.check_water` once tested membership
# in {"dive-entry", "flooded-interior", "submerged", "dive"} and
# {"underwater-entry", "flooded"} — six names, four of which exist nowhere in
# the catalogue, so that branch never fired on any of 180 typed-dive records
# (docs/research/world-terrain/place-water-facts-vs-shipped-water.md §5.4).
# `test_audit_place_semantics.py` asserts these are subsets of the vocabularies
# AND that every name in them actually occurs in the shipped catalogue, so the
# same class of dead membership test cannot come back.
#
# Any water contact at all: the record claims the player gets wet.
WET_ACCESS = {"surface-swim", "shallow-dive", "deep-dive", "argonian-only-depth"}
# A record whose access is a DEEP dive is claiming the depth at its own way in,
# not somewhere in its neighbourhood — as is anything with an underwater
# entrance. `shallow-dive` is deliberately out: a marsh village typed
# `shallow-dive` behind a door means "there is diving here", not "the door is
# under water", and holding its threshold to a dive depth would flag 26
# villages, capitals and beaches that are exactly what they say they are.
DEEP_ACCESS = {"deep-dive", "argonian-only-depth"}
# Entrances that are themselves under water.
UNDERWATER_ENTRANCES = {"underwater-entry"}
DISCOVERY = {"sightline", "road", "rumour", "document", "none"}
COMPLEXITY = {"trivial", "simple", "standard", "complex"}
WORKFLOW = ("derived", "plotted", "authored", "frozen")
MAGNITUDES = {None, "M1", "M2", "M3", "M4", "M5"}
SOCKET_KINDS = ("scene", "evidence", "station", "marks")

# --- schemaVersion 2 vocabularies (typed, per engineering standard 9) ---
PURPOSES = {"service-hub", "safe-rest", "combat-challenge", "stealth-challenge", "dungeon-delve",
            "traversal-puzzle", "vista-landmark", "navigation-aid", "lore-reveal", "faction-gateway",
            "quest-anchor", "unique-item", "resource-source", "social-drama", "wonder-oddity",
            "hidden-secret"}
IMPACTS = ("mild", "real", "major", "province-changing")
STANCES = {"hostile", "guarded", "wary", "neutral", "friendly", "sanctuary"}
RESPAWN = {"none", "slow", "seasonal", "faction-refills"}
FLIP_SCOPES = {"place", "occupantGroup", "namedRole"}
INTERIOR_KINDS = {"none", "building", "delve", "dungeon", "complex", "warren"}
INTERIOR_FAMILIES = {"xanmeer-complex", "root-cavern", "flooded-cave", "smuggler-den",
                     "kothringi-lilmothiit-site", "ayleid-nedic-ruin", "imperial-fort",
                     "abandoned-plantation", "hist-sanctum", "sinkhole-ruin", "dwelling",
                     "civic-hall", "shipwreck", "burrow-warren"}
SIZE_BANDS = {"S0", "S1", "S2", "S3", "S4"}
DUNGEON_KINDS = {"delve", "dungeon", "complex", "warren"}
REWARD_KINDS = {"trade-access", "services", "rest-shelter", "training", "unique-item", "gear",
                "loot-cache", "materials", "resource-node", "enchanting-access", "lore-fragment",
                "map-knowledge", "route-unlock", "quest-hook", "evidence", "rumour", "faction-access",
                "power-boon", "named-foe", "claim"}
COUNT_BANDS = {"single", "pair", "few", "band", "swarm"}
CREATURE_ROLES = {"apex-ambusher", "pack-hunter", "territorial-grazer", "scavenger", "swarm",
                  "guardian-boss", "something-old", "hazard-fauna", "domestic"}
NPC_ROLES = {"named-keeper", "lieutenant", "rank-and-file", "captive", "merchant", "hermit",
             "quest-giver", "priest", "official", "crew", "family", "patrol", "trainer", "boss"}
LOOT_ROLES = {"hidden-cache", "grave-goods", "strongroom", "workshop-stock", "shrine-offerings",
              "wreck-cargo", "personal-effects", "ledger-or-document", "unique-item", "provisions"}
TRAVEL_MODES = {"boat", "ferry", "rootworm", "guide", "lighter", "pilot", "cart", "porter"}
FACTION_PRESENCE_ROLES = {"seat", "chapter", "outpost", "office", "territory"}
# --- services[] (promise ledger, 2026-09-05) -------------------------------
# WHAT THE PLACE PROMISES A PLAYER IT WILL DO FOR THEM. Typed because
# `rewardProfile.kinds: [services]` said "there are services here" and nothing
# said WHICH, so nothing could check that the blueprint built any of them
# (owner finding 2026-09-05: Lilmoth's shops were planned and never placed).
# Closed vocabulary; derived, not hand-authored — `worldgen.derive_services`
# owns the rules and docs/research/archive/phase11-rounds/promise-ledger-round-1.md the table.
SERVICES = {"lodging", "trader", "smith", "apothecary", "temple", "shrine", "guild-hall",
            "council", "court", "market", "moneylender", "licence-office", "boatwright",
            "ferry", "stable", "tavern", "bathhouse", "healer", "scribe"}
# A service-hub of this size owes the player at least this many services.
SERVICE_MIN = {"M3": 1, "M4": 4, "M5": 6}
# A hamlet or a station has no service quarter: at most a shrine and the
# ferry it exists to run (settlement-register §1 — M1/M2 is "one family, one
# trade" / "transient or seasonal").
HAMLET_SERVICE_CEILING = {"shrine", "ferry"}
CONTENT_SLOT_LIMIT = 4
DANGER_TIERS = ("D0", "D1", "D2", "D3", "D4", "D5")

# Fields required at each workflow rung (cumulative).
REQUIRED_AT = {
    "derived": [
        "id", "classification", "provenance", "sources", "confidence", "why",
        "sitingPrefs", "dangerTier", "discovery", "complexityBudget",
        "importanceTier", "workflow", "status", "sockets", "deedCounterKeys",
        # Added 2026-09-02 once the critique back-fill landed on all eight
        # region files. These carried the schema's honesty about time, depth
        # and how you get in; they were strict-mode-only while the back-fill
        # was in flight and are now simply required.
        "season", "eraLayers", "densityLayer", "entrance", "underwaterAccess",
        # schemaVersion 2 (2026-09-03): the four blocks the owner asked for —
        # what the place is FOR, who starts the fight, what is inside, and
        # what you find there. Migrated with heuristics, then reviewed per region.
        "playerPurpose", "hostility", "interior", "contents",
    ],
    "plotted": ["position", "whySiteWon", "candidatesConsidered"],
    "authored": ["vibe", "assetPlan", "occupants", "rewardProfile", "relations"],
    "frozen": [],  # freeze is gated by 10b/10c checklists, not extra fields
}
WHY_KEYS = {"founding", "siteAdvantages", "occupantsMotive", "pressures", "wouldChangeIf"}
TERRAIN_REQUEST_KINDS = {
    "sinkhole", "dry-rise", "knoll", "terrace", "levee", "narrows", "islet", "cut",
    "pool", "cave-mouth", "cliff-bench", "elevated-cliff-bench", "ford", "gorge",
    "spring", "hollow",
}

# --- 16g record fields (decision 0041 Part 3c successor; plan 16 §10) ------
# Every record carries its OWN schemaVersion; the file-level number is the
# maximum over its records, so a file can never claim a shape none of its
# records has.
RECORD_SCHEMA_VERSION = 2
# `coSitedWith` — the typed answer to "these two were designed together".
# `sitingPrefs.boundTo`/`sightlineTo` say what the PLOT must honour; this says
# what a co-sited pair PROMISES, and `worldgen.co_siting --check` measures it.
CO_SITING_RELATIONS = {"sightline", "same-water", "approach-through", "satellite", "ferry-pair"}
# Relations that are true of the pair, not of one end: both records carry the row.
SYMMETRIC_CO_SITING = {"sightline", "same-water", "ferry-pair"}
CO_SITING_MEASUREMENT_KEYS = {
    "sightline": {"clearM", "checked"},
    "same-water": {"entityId"},
    "approach-through": {"via"},
    "satellite": {"distanceM", "maxM"},
    "ferry-pair": {"serviceId"},
}
SIGHTLINE_CHECKED = {"scour", "unchecked"}
# Reservations: ground held back for one player-facing purpose, one per value.
RESERVATIONS = {"player-stronghold"}
# Where a record's footprint radius came from: the type recipe's band, a
# measured blueprint, or a drawn polygon.
FOOTPRINT_SOURCES = {"band", "blueprint", "polygon"}
# A polygon footprint is only meaningful where the place is big enough to have
# a shape rather than a radius.
POLYGON_MAGNITUDES = {"M4", "M5"}
CITY_LAYOUT_MAGNITUDES = {"M5"}
CITY_LAYOUT_SOURCES = {"street_router"}
CITY_LAYOUT_ENDPOINT_TOLERANCE_M = 5.0
# heroHist: the ten power slots and their reserves.
HERO_HIST_STATUS = {"hero", "reserve"}
HERO_HIST_SLOTS = 10
# How the player gets into a place whose way in is under water.
UNDERWATER_GATINGS = {"argonian-immediate", "breath-gated", "equipment-gated",
                      "expert-current", "quest-gated"}
DESIGN_GROUPS_SCHEMA_VERSION = 1
DESIGN_GROUPS_FILE = "design-groups.json"


def dump_json(path: Path, data: dict) -> None:
    """The ONE way to write a catalogue file.

    The eight region files were written by four agents and had drifted into two
    different JSON encodings (`ensure_ascii` on and off), so an unrelated edit
    re-encoded every em-dash in the file and buried the real change. Standard 4
    (determinism) wants byte-stable output: indent 2, UTF-8 as itself, keys in
    authored order, one trailing newline. Always write through this.
    """
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


@dataclass
class RegionFile:
    path: Path
    region: str
    seed: str
    places: list[dict] = field(default_factory=list)
    schema_version: int = PLACES_SCHEMA_VERSION


def _fail(errors: list[str], rec_id: str, msg: str) -> None:
    errors.append(f"{rec_id}: {msg}")


def load_taxonomy(catalogue_dir: Path = CATALOGUE_DIR) -> dict:
    path = catalogue_dir / "taxonomy.json"
    data = json.loads(path.read_text())
    if data.get("schemaVersion") != SCHEMA_VERSION:
        raise ValueError(f"{path}: schemaVersion must be {SCHEMA_VERSION}")
    return data["classes"]


def taxonomy_resolves(classes: dict, c: dict) -> bool:
    fam = classes.get(c.get("class"), {})
    typ = fam.get(c.get("family"), {}) if isinstance(fam, dict) else {}
    if c.get("type") not in typ:
        return False
    variant = c.get("variant")
    return variant is None or variant in typ[c["type"]]


def load_region_files(catalogue_dir: Path = CATALOGUE_DIR) -> list[RegionFile]:
    out = []
    for path in sorted(catalogue_dir.glob("places-*.json")):
        data = json.loads(path.read_text())
        if data.get("schemaVersion") != PLACES_SCHEMA_VERSION:
            raise ValueError(f"{path}: schemaVersion must be {PLACES_SCHEMA_VERSION}")
        region = path.stem.removeprefix("places-")
        if data.get("region") != region:
            raise ValueError(f"{path}: region field must be '{region}'")
        out.append(RegionFile(path, region, data.get("seed", ""), data["places"],
                              int(data["schemaVersion"])))
    return out


def validate_record(rec: dict, region: str, classes: dict, errors: list[str]) -> None:
    rid = rec.get("id", "<missing id>")
    wf = rec.get("workflow")
    if wf not in WORKFLOW:
        _fail(errors, rid, f"workflow must be one of {WORKFLOW}")
        return
    required: list[str] = []
    for rung in WORKFLOW[: WORKFLOW.index(wf) + 1]:
        required += REQUIRED_AT[rung]
    for key in required:
        if key not in rec or rec[key] is None:
            _fail(errors, rid, f"missing required field '{key}' at workflow '{wf}'")
    if not isinstance(rid, str) or not rid.startswith(f"place.{region}."):
        _fail(errors, rid, f"id must match place.{region}.<slug>")
    if "name" not in rec and "namingRule" not in rec:
        _fail(errors, rid, "needs name or namingRule")
    c = rec.get("classification", {})
    if c and not taxonomy_resolves(classes, c):
        _fail(errors, rid, f"classification {c} not in taxonomy.json")
    if c.get("magnitude", None) not in MAGNITUDES:
        _fail(errors, rid, "magnitude must be M1–M5 or null")
    if rec.get("status") not in STATUSES:
        _fail(errors, rid, f"status must be one of {sorted(STATUSES)}")
    if rec.get("provenance") not in PROVENANCES:
        _fail(errors, rid, f"provenance must be one of {sorted(PROVENANCES)}")
    if rec.get("discovery") not in DISCOVERY:
        _fail(errors, rid, f"discovery must be one of {sorted(DISCOVERY)}")
    if rec.get("complexityBudget") not in COMPLEXITY:
        _fail(errors, rid, f"complexityBudget must be one of {sorted(COMPLEXITY)}")
    if rec.get("complexityBudget") == "complex" and not rec.get("complexityJustification"):
        _fail(errors, rid, "complexityBudget 'complex' needs complexityJustification")
    if not isinstance(rec.get("importanceTier"), int) or not 0 <= rec["importanceTier"] <= 4:
        _fail(errors, rid, "importanceTier must be int 0–4")
    why = rec.get("why", {})
    if why and not WHY_KEYS <= set(why):
        _fail(errors, rid, f"why must carry {sorted(WHY_KEYS)}")
    sockets = rec.get("sockets")
    if sockets is not None and (
        set(sockets) != set(SOCKET_KINDS) or not all(isinstance(sockets[k], list) for k in SOCKET_KINDS)
    ):
        _fail(errors, rid, f"sockets must carry exactly the {SOCKET_KINDS} lists (empty is fine)")
    if not isinstance(rec.get("deedCounterKeys", []), list):
        _fail(errors, rid, "deedCounterKeys must be a list")
    if not (rec.get("name") or "").strip() and not rec.get("namingRule"):
        _fail(errors, rid, "name must be non-empty (or provide namingRule) — standard 3 text extraction")
    if "season" in rec and rec["season"] not in SEASONS:
        _fail(errors, rid, f"season must be one of {sorted(SEASONS)}")
    if "densityLayer" in rec and rec["densityLayer"] not in DENSITY_LAYERS:
        _fail(errors, rid, f"densityLayer must be one of {sorted(DENSITY_LAYERS)}")
    if "entrance" in rec and rec["entrance"] not in ENTRANCES:
        _fail(errors, rid, f"entrance must be one of {sorted(ENTRANCES)} (module 70 §47)")
    if "underwaterAccess" in rec and rec["underwaterAccess"] not in UNDERWATER_ACCESS:
        _fail(errors, rid, f"underwaterAccess must be one of {sorted(UNDERWATER_ACCESS)}")
    if "eraLayers" in rec and not (isinstance(rec["eraLayers"], list) and rec["eraLayers"]):
        _fail(errors, rid, "eraLayers must be a non-empty list (use ['current'] when nothing older shows)")
    for src in rec.get("sources", []):
        if isinstance(src, str) and src.startswith(("docs/", "world/")):
            path = src.split()[0].split("#")[0].rstrip(":,;")
            if not (REPO_ROOT / path).exists():
                _fail(errors, rid, f"broken citation path: {path}")
    _validate_v2_blocks(rec, rid, errors)
    _validate_16g_fields(rec, region, rid, errors)


def _point_in_polygon(pt: list | tuple, poly: list) -> bool:
    """Ray casting, no new dependency. A point on the boundary counts as in."""
    x, z = float(pt[0]), float(pt[1])
    inside = False
    n = len(poly)
    for i in range(n):
        ax, az = float(poly[i][0]), float(poly[i][1])
        bx, bz = float(poly[(i + 1) % n][0]), float(poly[(i + 1) % n][1])
        if (az > z) != (bz > z):
            t = (z - az) / (bz - az)
            if x < ax + t * (bx - ax):
                inside = not inside
    return inside


def _is_num(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _is_xz(v) -> bool:
    return isinstance(v, (list, tuple)) and len(v) == 2 and all(_is_num(c) for c in v)


def _validate_16g_fields(rec: dict, region: str, rid: str, errors: list[str]) -> None:
    """The 16g record fields: record schemaVersion, design groups, co-siting,
    owner-guided ground, reservations, the hero-Hist block, footprints,
    city layout and underwater access detail. Shape only — liveness,
    reciprocity, uniqueness and the group registers are cross-record."""
    sv = rec.get("schemaVersion")
    if not isinstance(sv, int) or isinstance(sv, bool):
        _fail(errors, rid, "schemaVersion must be an int on every record (16g)")

    dg = rec.get("designGroup")
    if dg is not None and not (isinstance(dg, str) and dg.startswith("group.") and len(dg.split(".")) == 2 and dg.split(".")[1]):
        _fail(errors, rid, "designGroup must be 'group.<slug>'")

    cs = rec.get("coSitedWith")
    if cs is not None:
        if not isinstance(cs, list):
            _fail(errors, rid, "coSitedWith must be a list")
        else:
            for i, row in enumerate(cs):
                if not isinstance(row, dict):
                    _fail(errors, rid, f"coSitedWith[{i}] must be an object")
                    continue
                rel = row.get("relation")
                if rel not in CO_SITING_RELATIONS:
                    _fail(errors, rid, f"coSitedWith[{i}].relation must be one of {sorted(CO_SITING_RELATIONS)}")
                    continue
                if not isinstance(row.get("place"), str) or not row["place"].startswith("place."):
                    _fail(errors, rid, f"coSitedWith[{i}].place must be a place id")
                m = row.get("measurement")
                want = CO_SITING_MEASUREMENT_KEYS[rel]
                if not isinstance(m, dict) or set(m) != want:
                    _fail(errors, rid, f"coSitedWith[{i}] relation '{rel}' needs measurement keys {sorted(want)}")
                    continue
                if rel == "sightline":
                    if not _is_num(m["clearM"]) or m["checked"] not in SIGHTLINE_CHECKED:
                        _fail(errors, rid, f"coSitedWith[{i}].measurement needs numeric clearM and checked ∈ {sorted(SIGHTLINE_CHECKED)}")
                elif rel == "satellite":
                    if not _is_num(m["distanceM"]) or not _is_num(m["maxM"]):
                        _fail(errors, rid, f"coSitedWith[{i}].measurement distanceM/maxM must be numbers")
                elif rel == "approach-through":
                    if not isinstance(m["via"], str) or not m["via"].startswith("place."):
                        _fail(errors, rid, f"coSitedWith[{i}].measurement.via must be a place id")
                elif not isinstance(m[sorted(want)[0]], str) or not m[sorted(want)[0]]:
                    _fail(errors, rid, f"coSitedWith[{i}].measurement.{sorted(want)[0]} must be a non-empty string")

    og = rec.get("ownerGuided")
    if og is not None and not isinstance(og, bool):
        _fail(errors, rid, "ownerGuided must be a bool")
    vt = rec.get("vasteiTutorialScene")
    if vt is not None:
        if not isinstance(vt, bool):
            _fail(errors, rid, "vasteiTutorialScene must be a bool")
        elif vt and rec.get("ownerGuided") is not True:
            _fail(errors, rid, "vasteiTutorialScene is only valid on an ownerGuided record")
    rf = rec.get("reservedFor")
    if rf is not None and rf not in RESERVATIONS:
        _fail(errors, rid, f"reservedFor must be one of {sorted(RESERVATIONS)}")

    hh = rec.get("heroHist")
    if hh is not None:
        if not isinstance(hh, dict):
            _fail(errors, rid, "heroHist must be an object")
        else:
            hid = hh.get("id")
            if not isinstance(hid, str) or hid.split(".")[:2] != ["hist", region] or len(hid.split(".")) != 3:
                _fail(errors, rid, f"heroHist.id must be 'hist.{region}.<slug>'")
            slot = hh.get("powerSlot")
            if slot is not None and (not isinstance(slot, str) or not isinstance(hid, str) or slot != f"power.{hid}"):
                _fail(errors, rid, "heroHist.powerSlot must be 'power.<heroHist.id>' or null")
            st = hh.get("status")
            if st not in HERO_HIST_STATUS:
                _fail(errors, rid, f"heroHist.status must be one of {sorted(HERO_HIST_STATUS)}")
            elif (st == "reserve") != (slot is None):
                _fail(errors, rid, "heroHist.status is 'reserve' exactly when powerSlot is null")
            if "kind" in hh and not isinstance(hh["kind"], str):
                _fail(errors, rid, "heroHist.kind must be a string")
            if "note" in hh and not isinstance(hh["note"], str):
                _fail(errors, rid, "heroHist.note must be a string")

    pos = rec.get("positionM")
    fr = rec.get("footprintRadiusM")
    fs = rec.get("footprintSource")
    if pos is not None:
        if not _is_num(fr) or fr <= 0:
            _fail(errors, rid, "a positioned record needs a positive footprintRadiusM (16g)")
        if fs not in FOOTPRINT_SOURCES:
            _fail(errors, rid, f"footprintSource must be one of {sorted(FOOTPRINT_SOURCES)}")
    elif fr is not None or fs is not None:
        _fail(errors, rid, "footprintRadiusM/footprintSource belong to a positioned record")
    poly = rec.get("footprintPolygon")
    if poly is not None:
        mag = (rec.get("classification") or {}).get("magnitude")
        if not isinstance(poly, list) or len(poly) < 3 or not all(_is_xz(p) for p in poly):
            _fail(errors, rid, "footprintPolygon must be ≥ 3 [x, z] points in metres")
        elif not _is_xz(pos):
            _fail(errors, rid, "footprintPolygon needs the record's positionM to check containment")
        elif not _point_in_polygon(pos, poly):
            _fail(errors, rid, "footprintPolygon does not contain the record's positionM")
        if mag not in POLYGON_MAGNITUDES:
            _fail(errors, rid, f"footprintPolygon is only for {sorted(POLYGON_MAGNITUDES)} records")
        if fs != "polygon":
            _fail(errors, rid, "a record with a footprintPolygon has footprintSource 'polygon'")

    cl = rec.get("cityLayout")
    if cl is not None:
        mag = (rec.get("classification") or {}).get("magnitude")
        if mag not in CITY_LAYOUT_MAGNITUDES:
            _fail(errors, rid, f"cityLayout is only for {sorted(CITY_LAYOUT_MAGNITUDES)} records")
        if not isinstance(cl, dict):
            _fail(errors, rid, "cityLayout must be an object")
        elif not (_is_xz(cl.get("gate")) and _is_xz(cl.get("centre"))):
            _fail(errors, rid, "cityLayout.gate and .centre must be [x, z] in metres")
        elif not isinstance(cl.get("way"), list) or len(cl["way"]) < 2 or not all(_is_xz(p) for p in cl["way"]):
            _fail(errors, rid, "cityLayout.way must be ≥ 2 [x, z] points")
        else:
            import math as _math
            if _math.dist(cl["way"][0], cl["gate"]) > CITY_LAYOUT_ENDPOINT_TOLERANCE_M:
                _fail(errors, rid, f"cityLayout.way must start within {CITY_LAYOUT_ENDPOINT_TOLERANCE_M} m of the gate")
            if _math.dist(cl["way"][-1], cl["centre"]) > CITY_LAYOUT_ENDPOINT_TOLERANCE_M:
                _fail(errors, rid, f"cityLayout.way must end within {CITY_LAYOUT_ENDPOINT_TOLERANCE_M} m of the centre")
        if isinstance(cl, dict) and cl.get("source") not in CITY_LAYOUT_SOURCES:
            _fail(errors, rid, f"cityLayout.source must be one of {sorted(CITY_LAYOUT_SOURCES)}")

    ua = rec.get("underwaterAccessDetail")
    if ua is not None:
        if not isinstance(ua, dict):
            _fail(errors, rid, "underwaterAccessDetail must be an object")
        else:
            if ua.get("gating") not in UNDERWATER_GATINGS:
                _fail(errors, rid, f"underwaterAccessDetail.gating must be one of {sorted(UNDERWATER_GATINGS)}")
            n = ua.get("surfaceAccessNodes")
            if not isinstance(n, int) or isinstance(n, bool) or n < 0:
                _fail(errors, rid, "underwaterAccessDetail.surfaceAccessNodes must be an int ≥ 0")
            for key in ("airPockets", "submergedPortal"):
                if not isinstance(ua.get(key), bool):
                    _fail(errors, rid, f"underwaterAccessDetail.{key} must be a bool")
            if not isinstance(ua.get("entityId"), str) or not ua["entityId"]:
                _fail(errors, rid, "underwaterAccessDetail.entityId must name the water it is in")
            if not _is_num(ua.get("depthM")):
                _fail(errors, rid, "underwaterAccessDetail.depthM must be a number")


def load_design_groups(catalogue_dir: Path = CATALOGUE_DIR) -> dict[str, dict] | None:
    """design-groups.json: places one agent must blueprint and build together.

    Returns None until the file exists; once it does, every `designGroup`
    stamp must resolve to a row here."""
    path = catalogue_dir / DESIGN_GROUPS_FILE
    if not path.exists():
        return None
    data = json.loads(path.read_text())
    if data.get("schemaVersion") != DESIGN_GROUPS_SCHEMA_VERSION:
        raise ValueError(f"{path}: schemaVersion must be {DESIGN_GROUPS_SCHEMA_VERSION}")
    return {row["id"]: row for row in data["groups"]}


def _validate_v2_blocks(rec: dict, rid: str, errors: list[str]) -> None:
    """schemaVersion 2: playerPurpose, hostility, interior, contents,
    rewardProfile.kinds, travelStation. Each check is one line the region
    reviewers can read as a rule."""
    for i, presence in enumerate(rec.get("factionPresence") or []):
        if not isinstance(presence, dict) or not str(presence.get("factionRef", "")).startswith("faction."):
            _fail(errors, rid, f"factionPresence[{i}].factionRef must be a faction id")
        if not isinstance(presence, dict) or presence.get("role") not in FACTION_PRESENCE_ROLES:
            _fail(errors, rid, f"factionPresence[{i}].role must be one of {sorted(FACTION_PRESENCE_ROLES)}")
    for i, tr in enumerate(rec.get("terrainRequests") or []):
        if not isinstance(tr, dict) or tr.get("kind") not in TERRAIN_REQUEST_KINDS:
            _fail(errors, rid, f"terrainRequests[{i}].kind must be one of {sorted(TERRAIN_REQUEST_KINDS)}")
        elif not isinstance(tr.get("delivery"), dict) or not tr["delivery"]:
            _fail(errors, rid, f"terrainRequests[{i}].delivery must be a non-empty typed terrain contract")
        elif not isinstance(tr.get("note"), str) or not tr["note"].strip():
            _fail(errors, rid, f"terrainRequests[{i}].note must say what the ground must do for the place")
    pp = rec.get("playerPurpose")
    if pp is not None:
        if pp.get("primary") not in PURPOSES:
            _fail(errors, rid, f"playerPurpose.primary must be one of {sorted(PURPOSES)}")
        sec = pp.get("secondary", [])
        if not isinstance(sec, list) or any(x not in PURPOSES for x in sec) or pp.get("primary") in sec:
            _fail(errors, rid, "playerPurpose.secondary must be a list of PURPOSES not containing primary")
        if pp.get("impact") not in IMPACTS:
            _fail(errors, rid, f"playerPurpose.impact must be one of {IMPACTS}")
        if not (pp.get("hook") or "").strip():
            _fail(errors, rid, "playerPurpose.hook must be one plain sentence")
        vt = (rec.get("rewardProfile") or {}).get("valueTier")
        if vt and pp.get("impact") in IMPACTS:
            # roughly monotone: tier-1 never 'major'+, tier-4/5 never 'mild'
            rank = IMPACTS.index(pp["impact"])
            tier = int(vt.split("-")[1]) if vt.startswith("tier-") else None
            if tier == 1 and rank >= 2:
                _fail(errors, rid, "playerPurpose.impact major+ contradicts rewardProfile.valueTier tier-1")
            if tier in (4, 5) and rank == 0:
                _fail(errors, rid, "playerPurpose.impact mild contradicts rewardProfile.valueTier tier-4/5")
    h = rec.get("hostility")
    if h is not None:
        if h.get("baseline") not in STANCES:
            _fail(errors, rid, f"hostility.baseline must be one of {sorted(STANCES)}")
        if h.get("respawn") not in RESPAWN:
            _fail(errors, rid, f"hostility.respawn must be one of {sorted(RESPAWN)}")
        if not isinstance(h.get("clearable"), bool):
            _fail(errors, rid, "hostility.clearable must be a bool")
        for i, fl in enumerate(h.get("flips", []) or []):
            if fl.get("to") not in STANCES or not isinstance(fl.get("when"), dict) or not fl["when"]:
                _fail(errors, rid, f"hostility.flips[{i}] needs to∈STANCES and a non-empty quests-85 `when` object")
            if fl.get("scope", "place") not in FLIP_SCOPES:
                _fail(errors, rid, f"hostility.flips[{i}].scope must be one of {sorted(FLIP_SCOPES)}")
        dt = rec.get("dangerTier")
        if h.get("baseline") == "hostile" and dt in ("D0", "D1"):
            _fail(errors, rid, "hostility hostile at D0/D1 — raise dangerTier or soften the stance")
        if h.get("baseline") == "sanctuary" and dt in ("D4", "D5") and not h.get("environmentalDanger"):
            _fail(errors, rid, "sanctuary at D4/D5 needs hostility.environmentalDanger: true (the danger is not people)")
    it = rec.get("interior")
    if it is not None:
        kind = it.get("kind")
        if kind not in INTERIOR_KINDS:
            _fail(errors, rid, f"interior.kind must be one of {sorted(INTERIOR_KINDS)}")
        elif kind != "none":
            if it.get("family") not in INTERIOR_FAMILIES:
                _fail(errors, rid, f"interior.family must be one of {sorted(INTERIOR_FAMILIES)}")
            if it.get("sizeBand") not in SIZE_BANDS:
                _fail(errors, rid, "interior.sizeBand must be S0–S4")
            wf = it.get("wetFraction")
            if not isinstance(wf, (int, float)) or not 0 <= wf <= 1:
                _fail(errors, rid, "interior.wetFraction must be 0–1")
            if not isinstance(it.get("entranceCount"), int) or it["entranceCount"] < 1:
                _fail(errors, rid, "interior.entranceCount must be ≥ 1")
            if rec.get("entrance") == "none":
                _fail(errors, rid, "interior present but entrance is 'none' — how do you get in?")
        elif rec.get("entrance") not in ("none", "gate", None) and rec.get("classification", {}).get("class") in ("lair", "ruin"):
            _fail(errors, rid, "a lair/ruin with an entrance must describe its interior (kind ≠ none)")
    ct = rec.get("contents")
    if ct is not None:
        for key, roles in (("creatures", CREATURE_ROLES), ("npcs", NPC_ROLES), ("loot", LOOT_ROLES)):
            slots = ct.get(key)
            if not isinstance(slots, list):
                _fail(errors, rid, f"contents.{key} must be a list")
                continue
            if len(slots) > CONTENT_SLOT_LIMIT:
                _fail(errors, rid, f"contents.{key} has more than {CONTENT_SLOT_LIMIT} slots — a consistency record, not an encounter table")
            seen_slots: set[str] = set()
            for sl in slots:
                sid = sl.get("slotId", "")
                if not sid or sid in seen_slots:
                    _fail(errors, rid, f"contents.{key} slotId missing or duplicate: {sid!r}")
                seen_slots.add(sid)
                if sl.get("role") not in roles:
                    _fail(errors, rid, f"contents.{key} role {sl.get('role')!r} not in the seeded role list")
                if "registerRef" not in sl:
                    _fail(errors, rid, f"contents.{key}[{sid}] needs registerRef (null until Phase 13)")
                if sl.get("count", "single") not in COUNT_BANDS:
                    _fail(errors, rid, f"contents.{key}[{sid}].count must be one of {sorted(COUNT_BANDS)}")
                d = sl.get("danger")
                if d is not None and (d not in DANGER_TIERS or DANGER_TIERS.index(d) > DANGER_TIERS.index(rec.get("dangerTier", "D5"))):
                    _fail(errors, rid, f"contents.{key}[{sid}].danger exceeds the place's dangerTier")
                if key == "loot" and sl.get("payoff") is not None and sl["payoff"] not in REWARD_KINDS:
                    _fail(errors, rid, f"contents.loot[{sid}].payoff must be one of REWARD_KINDS")
    _validate_services(rec, rid, errors)
    rp = rec.get("rewardProfile")
    if rp is not None:
        bad = [k for k in rp.get("kinds", []) if k not in REWARD_KINDS]
        if bad:
            _fail(errors, rid, f"rewardProfile.kinds {bad} not in REWARD_KINDS (20 typed values)")
    ts = rec.get("travelStation")
    if ts is not None:
        if not isinstance(ts.get("modes"), list) or not ts["modes"] or any(m not in TRAVEL_MODES for m in ts["modes"]):
            _fail(errors, rid, f"travelStation.modes must be a non-empty list from {sorted(TRAVEL_MODES)}")
        if not isinstance(ts.get("destinations"), list):
            _fail(errors, rid, "travelStation.destinations must be a list of place ids")
    rr = rec.get("relationsReserved")
    if rr is not None and not isinstance(rr, dict):
        _fail(errors, rid, "relationsReserved must be an object shaped like relations")


def _validate_services(rec: dict, rid: str, errors: list[str]) -> None:
    """`services[]` — the typed promise the blueprint ledger checks against.

    Required on every LIVE settlement/civic record and on anything whose
    playerPurpose is service-hub; derived by `worldgen.derive_services`.
    """
    svc = rec.get("services")
    scoped = services_scoped(rec)
    if svc is None:
        if scoped:
            _fail(errors, rid, "missing services[] — run `python3 -m worldgen.derive_services --apply` "
                               "(a settlement/civic/service-hub record must type what it offers)")
        return
    if not isinstance(svc, list) or any(s not in SERVICES for s in svc):
        _fail(errors, rid, f"services must be a list from {sorted(SERVICES)}")
        return
    if svc != sorted(set(svc)):
        _fail(errors, rid, "services must be sorted and free of duplicates (determinism)")
    mag = (rec.get("classification") or {}).get("magnitude")
    if mag in ("M1", "M2") and set(svc) - HAMLET_SERVICE_CEILING:
        _fail(errors, rid, f"a {mag} settlement offers nothing beyond {sorted(HAMLET_SERVICE_CEILING)}; "
                           f"drop {sorted(set(svc) - HAMLET_SERVICE_CEILING)} or raise the magnitude")
    if (rec.get("playerPurpose") or {}).get("primary") == "service-hub" and mag in SERVICE_MIN:
        need = SERVICE_MIN[mag]
        if len(svc) < need:
            _fail(errors, rid, f"a {mag} service-hub promises 'services' but lists {len(svc)} "
                               f"of the {need} its band owes the player")


def services_scoped(rec: dict) -> bool:
    """Does this record owe the player a typed services[] list?"""
    if rec.get("status") in ("cut", "deferred"):
        return False
    cls = (rec.get("classification") or {}).get("class")
    return cls in ("settlement", "civic") or (rec.get("playerPurpose") or {}).get("primary") == "service-hub"


def committed_ids(catalogue_dir: Path = CATALOGUE_DIR) -> set[str]:
    """IDs already committed at git HEAD — these may never disappear."""
    ids: set[str] = set()
    rel = catalogue_dir.relative_to(REPO_ROOT)
    ls = subprocess.run(
        ["git", "ls-tree", "-r", "--name-only", "HEAD", str(rel)],
        cwd=REPO_ROOT, capture_output=True, text=True,
    )
    for name in ls.stdout.split():
        if not Path(name).name.startswith("places-"):
            continue
        show = subprocess.run(
            ["git", "show", f"HEAD:{name}"], cwd=REPO_ROOT, capture_output=True, text=True
        )
        if show.returncode == 0:
            ids |= {p["id"] for p in json.loads(show.stdout).get("places", []) if "id" in p}
    return ids


def load_asset_aliases(catalogue_dir: Path = CATALOGUE_DIR) -> dict | None:
    """asset-aliases.json maps every assetPlan slug to an inventory family id
    (feasibility critique F4/F5 — free-text assetPlan let a typo survive).
    Returns None until the file exists; once it does, every slug must resolve."""
    path = catalogue_dir / "asset-aliases.json"
    if not path.exists():
        return None
    data = json.loads(path.read_text())
    if data.get("schemaVersion") != SCHEMA_VERSION:
        raise ValueError(f"{path}: schemaVersion must be {SCHEMA_VERSION}")
    return data["aliases"]


def validate_catalogue(catalogue_dir: Path = CATALOGUE_DIR, check_permanence: bool = True) -> list[str]:
    errors: list[str] = []
    classes = load_taxonomy(catalogue_dir)
    aliases = load_asset_aliases(catalogue_dir)
    # Every alias TARGET must be a real inventory family. Slug presence alone
    # was checked before, so a dangling target (an invented family id) survived
    # silently until a kit agent tripped over it — Phase 11 Part 4 found three.
    if aliases is not None:
        inventory = (catalogue_dir.parents[1] / "sources" / "placement"
                     / "settlement-asset-inventory.json")
        if inventory.exists():
            known = {f["id"] for f in json.loads(inventory.read_text())["families"]}
            for slug, family in sorted(aliases.items()):
                if family not in known:
                    errors.append(f"asset-aliases.json: slug '{slug}' targets unknown inventory "
                                  f"family '{family}'")
    seen: set[str] = set()
    for rf in load_region_files(catalogue_dir):
        ids = [p.get("id", "") for p in rf.places]
        if ids != sorted(ids):
            errors.append(f"{rf.path.name}: places must be sorted by id (determinism)")
        if not rf.seed:
            errors.append(f"{rf.path.name}: missing seed")
        # The file's schemaVersion is the MAXIMUM over its records (16g): no
        # record may claim a shape the file does not, and the file may not
        # claim a shape no record has.
        versions = [r.get("schemaVersion") for r in rf.places
                    if isinstance(r.get("schemaVersion"), int) and not isinstance(r.get("schemaVersion"), bool)]
        for rec in rf.places:
            v = rec.get("schemaVersion")
            if isinstance(v, int) and not isinstance(v, bool) and v > rf.schema_version:
                errors.append(f"{rec.get('id', '')}: record schemaVersion {v} is above the file's "
                              f"{rf.schema_version}")
        if versions and max(versions) != rf.schema_version:
            errors.append(f"{rf.path.name}: file schemaVersion {rf.schema_version} is not the maximum "
                          f"over its records ({max(versions)})")
        for rec in rf.places:
            rid = rec.get("id", "")
            if rid in seen:
                errors.append(f"{rid}: duplicate id (province-wide uniqueness)")
            seen.add(rid)
            validate_record(rec, rf.region, classes, errors)
            if aliases is not None:
                for slug in rec.get("assetPlan", []) or []:
                    if isinstance(slug, str) and slug not in aliases:
                        errors.append(f"{rid}: assetPlan slug '{slug}' not in asset-aliases.json")
    _validate_cross_record(catalogue_dir, errors)
    if check_permanence:
        missing = committed_ids(catalogue_dir) - seen
        for rid in sorted(missing):
            errors.append(f"{rid}: committed id has DISAPPEARED — cut places keep their record with status 'cut'")
    return errors


def _validate_cross_record(catalogue_dir: Path, errors: list[str]) -> None:
    """Edges must point at LIVE records (deferred/cut targets go to
    relationsReserved — owner ruling 2026-09-03); travel stations must point at
    other travel stations; route refs must resolve in the route registry."""
    try:
        from .route_registry import alias_map, resolve
        aliases = alias_map()
    except Exception:  # registry missing on a partial checkout
        aliases = None
    recs = {r["id"]: r for rf in load_region_files(catalogue_dir) for r in rf.places}
    factions_path = catalogue_dir.parent / "registries" / "factions.json"
    known_factions = None
    if factions_path.exists():
        faction_data = json.loads(factions_path.read_text())
        known_factions = {row.get("id") for row in faction_data.get("entries", [])}
    live = {rid for rid, r in recs.items() if r.get("status") not in ("deferred", "cut")}
    for rid, rec in recs.items():
        if rid not in live:
            continue
        if known_factions is not None:
            for i, presence in enumerate(rec.get("factionPresence") or []):
                faction = presence.get("factionRef") if isinstance(presence, dict) else None
                if faction not in known_factions:
                    errors.append(f"{rid}: factionPresence[{i}] names unknown faction {faction!r}")
        rel = rec.get("relations") or {}
        for key in ("dependsOn", "supplies", "rivals", "patrols", "visibleFrom", "reachedVia", "tolls"):
            for v in rel.get(key, []) or []:
                if isinstance(v, str) and v.startswith("place.") and v not in live:
                    errors.append(f"{rid}: relations.{key} → {v} is not a live record (park it in relationsReserved)")
                if isinstance(v, str) and v.startswith("route.") and aliases is not None and resolve(v, aliases) is None:
                    errors.append(f"{rid}: relations.{key} → {v} not in world/sources/routes/registry.json")
        for e in rel.get("travelServiceEdges", []) or []:
            if isinstance(e, str) and ":route." in e and aliases is not None and resolve(e.split(":", 1)[1], aliases) is None:
                errors.append(f"{rid}: travelServiceEdges {e!r} names an unregistered route")
        ts = rec.get("travelStation")
        if ts:
            for d in ts.get("destinations", []):
                if d not in live:
                    errors.append(f"{rid}: travelStation destination {d} is not a live record")
                elif not recs[d].get("travelStation"):
                    errors.append(f"{rid}: travelStation destination {d} has no travelStation of its own")
    _validate_16g_cross(catalogue_dir, recs, live, errors)


def _validate_16g_cross(catalogue_dir: Path, recs: dict[str, dict], live: set[str],
                        errors: list[str]) -> None:
    """The 16g gates that need the whole catalogue: the design-group register,
    co-siting reciprocity, the single stronghold reservation and the ten
    hero-Hist slots."""
    import math as _math

    groups = load_design_groups(catalogue_dir)
    stamped: dict[str, list[str]] = {}
    for rid in sorted(live):
        gid = recs[rid].get("designGroup")
        if gid:
            stamped.setdefault(gid, []).append(rid)
    if groups is None:
        for gid in sorted(stamped):
            errors.append(f"{stamped[gid][0]}: designGroup {gid} but there is no "
                          f"{DESIGN_GROUPS_FILE}")
    else:
        for gid in sorted(stamped):
            if gid not in groups:
                for rid in stamped[gid]:
                    errors.append(f"{rid}: designGroup {gid} is not a row in {DESIGN_GROUPS_FILE}")
        for gid, row in sorted(groups.items()):
            members = list(row.get("members") or [])
            anchor = row.get("anchor")
            if anchor not in members:
                errors.append(f"{DESIGN_GROUPS_FILE}: {gid} anchor {anchor} is not one of its members")
            if not str(row.get("loreReason") or "").strip():
                errors.append(f"{DESIGN_GROUPS_FILE}: {gid} needs a loreReason")
            spread = row.get("maxSpreadM")
            if not _is_num(spread) or spread <= 0:
                errors.append(f"{DESIGN_GROUPS_FILE}: {gid} needs a positive maxSpreadM")
                spread = None
            for m in members:
                if m not in live:
                    errors.append(f"{DESIGN_GROUPS_FILE}: {gid} member {m} is not a live record")
                elif recs[m].get("designGroup") != gid:
                    errors.append(f"{m}: is a member of {gid} but carries "
                                  f"designGroup {recs[m].get('designGroup')!r}")
            if spread is None:
                continue
            placed = [(m, recs[m]["positionM"]) for m in members
                      if m in recs and _is_xz(recs[m].get("positionM"))]
            for i, (ma, pa) in enumerate(placed):
                for mb, pb in placed[i + 1:]:
                    d = _math.dist(pa, pb)
                    if d > spread:
                        errors.append(f"{DESIGN_GROUPS_FILE}: {gid} members {ma} and {mb} are "
                                      f"{d:.1f} m apart, past maxSpreadM {spread}")

    reserved: dict[str, list[str]] = {}
    hero = 0
    for rid in sorted(live):
        rec = recs[rid]
        rf = rec.get("reservedFor")
        if rf:
            reserved.setdefault(rf, []).append(rid)
        hh = rec.get("heroHist")
        if isinstance(hh, dict) and hh.get("status") == "hero":
            hero += 1
        for i, row in enumerate(rec.get("coSitedWith") or []):
            if not isinstance(row, dict):
                continue
            other = row.get("place")
            rel = row.get("relation")
            if rel not in CO_SITING_RELATIONS or not isinstance(other, str):
                continue
            if other == rid:
                errors.append(f"{rid}: coSitedWith[{i}] names itself")
                continue
            if other not in live:
                errors.append(f"{rid}: coSitedWith[{i}] → {other} is not a live record")
                continue
            if rel in SYMMETRIC_CO_SITING:
                back = [r for r in (recs[other].get("coSitedWith") or [])
                        if isinstance(r, dict) and r.get("place") == rid and r.get("relation") == rel]
                if not back:
                    errors.append(f"{rid}: coSitedWith[{i}] '{rel}' with {other} is not "
                                  f"reciprocated on that record")
    for value in sorted(reserved):
        if len(reserved[value]) > 1:
            errors.append(f"catalogue: reservedFor '{value}' is claimed by "
                          f"{len(reserved[value])} live records ({', '.join(sorted(reserved[value]))}) — "
                          f"it is one place")
    if hero > HERO_HIST_SLOTS:
        errors.append(f"heroHist: {hero} live records carry status 'hero'; the province has exactly "
                      f"{HERO_HIST_SLOTS} power slots")


def main() -> int:
    errors = validate_catalogue()
    for e in errors:
        print(f"catalogue: {e}", file=sys.stderr)
    n = sum(len(rf.places) for rf in load_region_files())
    print(f"catalogue: {n} places, {'FAIL' if errors else 'OK'}")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
