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
  why             *why {founding, siteAdvantages, occupantsMotive, pressures,
                  wouldChangeIf} — short form at derivation
  siting          *sitingPrefs {regionClasses, hardConstraints, preferences};
                  plotted+: position {u,v}, candidatesConsidered,
                  whySiteWon, scourSiteId?
  relations       relations {dependsOn, supplies, rivals, patrols, tolls,
                  visibleFrom, reachedVia, travelServiceEdges}
  people & power  culture, ownerFaction?, occupants (S-ladder semantic refs),
                  notableNpcSlots
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
      docs/research/place-purpose-hostility-and-dungeon-balance.md) ---
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
  reserve         relationsReserved? — edges pruned because their target is
                  deferred/cut; same shape as relations; restored if the target
                  is promoted (owner ruling 2026-09-03)
  route ids       relations.patrols/tolls and travelServiceEdges reference
                  world/sources/routes/registry.json ids (route.road.*,
                  route.boat.*, route.track.*)

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
        out.append(RegionFile(path, region, data.get("seed", ""), data["places"]))
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


def _validate_v2_blocks(rec: dict, rid: str, errors: list[str]) -> None:
    """schemaVersion 2: playerPurpose, hostility, interior, contents,
    rewardProfile.kinds, travelStation. Each check is one line the region
    reviewers can read as a rule."""
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
    live = {rid for rid, r in recs.items() if r.get("status") not in ("deferred", "cut")}
    for rid, rec in recs.items():
        if rid not in live:
            continue
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


def main() -> int:
    errors = validate_catalogue()
    for e in errors:
        print(f"catalogue: {e}", file=sys.stderr)
    n = sum(len(rf.places) for rf in load_region_files())
    print(f"catalogue: {n} places, {'FAIL' if errors else 'OK'}")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
