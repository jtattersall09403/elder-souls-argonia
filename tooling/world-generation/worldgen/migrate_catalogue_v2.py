"""One-shot migration of the place catalogue to schemaVersion 2 (2026-09-03).

    cd tooling/world-generation
    python3 -m worldgen.migrate_catalogue_v2          # rewrites places-*.json
    python3 -m worldgen.migrate_catalogue_v2 --dry    # report only

What it adds to every record (owner feedback round, decision 0041 Part 4
step 2; vocabularies in worldgen.catalogue and the research doc
docs/research/place-purpose-hostility-and-dungeon-balance.md):

* `playerPurpose`  — a first guess from class/family/type/reward, marked
  `"reviewed": false` so the per-region review agents know it is a guess.
* `hostility`      — baseline stance from class/family and dangerTier.
* `interior`       — from `entrance`, class and underwaterAccess.
* `contents`       — creature/NPC/loot slots parsed out of `occupants` and
  `rewardProfile.kinds`.
* `rewardProfile.kinds` normalised to the 20 typed REWARD_KINDS.
* `relationsReserved` — every relation edge whose target is deferred, cut or
  unknown is moved here (owner ruling: prune the links, keep them in reserve).
* route references (`patrols`, `tolls`, `travelServiceEdges`) re-pointed at
  world/sources/routes/registry.json ids where an alias resolves.
* `travelStation` on records that already offer boat/ferry/rootworm/guide
  service edges (destinations left for the review pass unless both ends are
  anchor cities).

Idempotent: a record that already carries a block keeps it. Deterministic:
no randomness, written through catalogue.dump_json.
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter

from . import catalogue
from .route_registry import alias_map, resolve

# ----------------------------------------------------------------------------
# reward kinds: the 129 free-text labels → 20 typed values (research §5.2)
# ----------------------------------------------------------------------------
REWARD_MAP = {
    "trade-access": ["trade", "goods", "rare goods", "unique goods", "market", "coin", "tolls", "toll-service", "contraband", "trade-node"],
    "services": ["services", "repairs", "mounts", "mount", "mounts/transport", "transport", "boats", "ferry", "storage", "lodging", "guides", "unique service", "social", "route"],
    "rest-shelter": ["rest", "shelter", "safety", "food", "supplies", "healing", "magicka restoration", "fish", "eggs"],
    "training": ["training", "trainers", "skill-teaching"],
    "unique-item": ["unique item", "named-item", "artefact", "unique artefact", "relic with provenance", "relics", "trophy", "unique item (contested)", "unique"],
    "gear": ["gear", "equipment", "weapons", "armour"],
    "loot-cache": ["loot", "loot-cache", "cache", "treasure", "salvage", "dungeon", "grave goods", "grave goods (at a cost)", "loot from the lost"],
    "materials": ["crafting material", "materials", "reagents", "harvest", "hides", "hide", "bone", "feathers", "sap", "sap draught", "blight-craft", "crafting"],
    "resource-node": ["extraction", "ore", "pearl beds", "vakka"],
    "enchanting-access": ["enchanting", "magic services"],
    "lore-fragment": ["lore", "knowledge", "unique-knowledge", "documents", "document", "books", "curiosity"],
    "map-knowledge": ["vista", "navigation", "navigation-knowledge", "travel-knowledge", "beauty", "spectacle", "exploration"],
    "route-unlock": ["passage", "access", "travel", "transit", "shortcut", "traversal shortcut", "fast transit", "fast-transit", "climb", "climb-route", "climbing", "climbing access", "diving access", "seasonal-access", "traversal", "traversal challenge", "dungeon entrance", "hidden site"],
    "quest-hook": ["quests", "quest-hooks", "quest hook", "quest access", "quest-critical", "main quest", "obligation hooks", "grievance hook", "faction hook"],
    "evidence": ["evidence", "quest evidence"],
    "rumour": ["rumour", "information"],
    "faction-access": ["faction access", "faction", "faction standing", "contracts", "bounty", "reputation", "deed", "faction consequence"],
    "power-boon": ["buff", "blessing", "power-slot", "ability"],
    "named-foe": ["boss", "boss-encounter", "unique encounter", "combat", "encounter", "conflict", "rivalry", "hazard"],
    "claim": ["base", "stronghold", "claimable-ground", "homestead"],
}
REWARD_LOOKUP = {old: new for new, olds in REWARD_MAP.items() for old in olds}

# ----------------------------------------------------------------------------
# purpose + hostility by family (class, family) → (primary, baseline)
# ----------------------------------------------------------------------------
FAMILY_RULES: dict[tuple[str, str], tuple[str, str]] = {
    ("settlement", "major-city"): ("service-hub", "friendly"),
    ("settlement", "free-port"): ("service-hub", "wary"),
    ("settlement", "tribal-village"): ("safe-rest", "wary"),
    ("settlement", "water-village"): ("safe-rest", "wary"),
    ("settlement", "dry-village"): ("safe-rest", "friendly"),
    ("settlement", "mixed-settlement"): ("service-hub", "friendly"),
    ("settlement", "imperial-settlement"): ("service-hub", "guarded"),
    ("settlement", "outcast-settlement"): ("social-drama", "wary"),
    ("lair", "beast-lair"): ("combat-challenge", "hostile"),
    ("lair", "open-water"): ("combat-challenge", "hostile"),
    ("lair", "root-system"): ("dungeon-delve", "hostile"),
    ("lair", "hazard-ground"): ("traversal-puzzle", "neutral"),
    ("ruin", "xanmeer"): ("dungeon-delve", "neutral"),
    ("ruin", "ayleid"): ("dungeon-delve", "neutral"),
    ("ruin", "depopulated"): ("lore-reveal", "neutral"),
    ("ruin", "daedric-works"): ("dungeon-delve", "hostile"),
    ("sacred", "hist"): ("lore-reveal", "sanctuary"),
    ("sacred", "the-dead"): ("dungeon-delve", "neutral"),
    ("sacred", "sithis"): ("faction-gateway", "guarded"),
    ("sacred", "rite"): ("lore-reveal", "sanctuary"),
    ("sacred", "wonder"): ("wonder-oddity", "sanctuary"),
    ("civic", "festivity"): ("social-drama", "friendly"),
    ("civic", "refuge"): ("safe-rest", "sanctuary"),
    ("civic", "healing"): ("service-hub", "sanctuary"),
    ("civic", "governance"): ("faction-gateway", "guarded"),
    ("civic", "magic"): ("service-hub", "neutral"),
    ("civic", "learning"): ("lore-reveal", "neutral"),
    ("camp", "hostile-camp"): ("combat-challenge", "hostile"),
    ("camp", "civil-camp"): ("social-drama", "wary"),
    ("camp", "expedition-camp"): ("social-drama", "wary"),
    ("camp", "displaced-camp"): ("social-drama", "wary"),
    ("martial", "watch"): ("vista-landmark", "guarded"),
    ("martial", "carceral"): ("stealth-challenge", "guarded"),
    ("martial", "imperial-military"): ("faction-gateway", "guarded"),
    ("martial", "strength"): ("combat-challenge", "guarded"),
    ("works", "extraction"): ("resource-source", "guarded"),
    ("works", "craft"): ("service-hub", "friendly"),
    ("works", "illicit"): ("stealth-challenge", "hostile"),
    ("works", "cultivation"): ("resource-source", "neutral"),
    ("works", "storage-and-freight"): ("resource-source", "guarded"),
    ("works", "aquaculture"): ("resource-source", "neutral"),
    ("works", "labour"): ("social-drama", "guarded"),
    ("works", "market"): ("service-hub", "friendly"),
    ("transit", "crossing"): ("navigation-aid", "neutral"),
    ("transit", "road"): ("navigation-aid", "neutral"),
    ("transit", "landing"): ("navigation-aid", "neutral"),
    ("transit", "elevated"): ("traversal-puzzle", "neutral"),
    ("transit", "submerged-way"): ("traversal-puzzle", "neutral"),
    ("transit", "root-transit"): ("faction-gateway", "guarded"),
    ("lone", "curiosity"): ("wonder-oddity", "neutral"),
    ("lone", "monument"): ("lore-reveal", "neutral"),
    ("lone", "lone-dwelling"): ("social-drama", "wary"),
}
IMPACT_BY_TIER = {"tier-1": "mild", "tier-2": "real", "tier-3": "real", "tier-4": "major", "tier-5": "province-changing"}

DELVE_ENTRANCES = {"cave-mouth", "burrow", "sinkhole-lip", "root-mouth", "hollow-trunk", "underwater-entry",
                   "trapdoor", "cellar-door", "stair-throat", "grave-cut", "well-shaft"}
WET_BY_ACCESS = {"none": 0.0, "surface-swim": 0.2, "shallow-dive": 0.4, "deep-dive": 0.6, "argonian-only-depth": 0.8}
SIZE_BY_TIER = {0: "S3", 1: "S3", 2: "S2", 3: "S1", 4: "S1"}

CREATURE_WORDS = re.compile(r"\b(beast|crocodile|wamasu|hackwing|swarm|leviathan|serpent|snake|fish|frog|leech|slaughterfish|"
                            r"mudcrab|spider|insect|kwama|guar|troll|argonian behemoth|behemoth|voriplasm|nix|dreugh|"
                            r"hist-touched|packs?|hunters?|grazers?|herd|eels?|bats?|birds?|something old|the old thing|"
                            r"sload|undead|drowned dead|revenants?|ghosts?|skeletons?|hollows?)\b", re.I)
ENVIRONMENT_WORDS = re.compile(r"\b(the (channel|bog|water|canopy|torrent|flood|marsh|tide|current|mud|dark|cold|air|climb|"
                               r"ravine floor|fall|ground|weather|sun|sea|reef|wind))\b", re.I)
NPC_ROLE_WORDS = [
    (re.compile(r"\b(keeper|warden|abbot|mother|father|elder|chief|matriarch|patriarch|master|captain|reeve|governor|magistrate|boss|lord)\b", re.I), "named-keeper"),
    (re.compile(r"\b(priest|nisswo|tree-minder|shaman|celebrant|cleric|hierophant)\b", re.I), "priest"),
    (re.compile(r"\b(guards?|watch(ers|men)?|sentr(y|ies)|soldiers?|legion|militia|warband|raiders?|bandits?|pirates?|cutthroats?|smugglers?)\b", re.I), "rank-and-file"),
    (re.compile(r"\b(patrols?)\b", re.I), "patrol"),
    (re.compile(r"\b(merchants?|traders?|factors?|brokers?|dealers?|vendors?|fence)\b", re.I), "merchant"),
    (re.compile(r"\b(crews?|sailors?|boatmen|pilots?|rowers?|divers?)\b", re.I), "crew"),
    (re.compile(r"\b(hermit|recluse|widow|widower|lone|alone|one old)\b", re.I), "hermit"),
    (re.compile(r"\b(captives?|prisoners?|bonded|slaves?|hostages?|owing)\b", re.I), "captive"),
    (re.compile(r"\b(clerks?|officials?|assessors?|collectors?|customs|scribes?|registrars?)\b", re.I), "official"),
    (re.compile(r"\b(famil(y|ies)|households?|villagers?|townsfolk|neighbourhood|settlers?|farmers?|fishers?|cutters?|graders?|workers?|labourers?)\b", re.I), "family"),
]
D_LEVEL = re.compile(r"\bD([0-5])\b")


def normalise_rewards(kinds: list[str], unmapped: Counter) -> list[str]:
    out: list[str] = []
    for k in kinds:
        key = k.strip().lower()
        new = REWARD_LOOKUP.get(key)
        if new is None:
            # keyword fallbacks for the long tail
            if any(w in key for w in ("quest",)):
                new = "quest-hook"
            elif any(w in key for w in ("unique", "relic", "artefact")):
                new = "unique-item"
            elif any(w in key for w in ("loot", "cache", "treasure", "salvage")):
                new = "loot-cache"
            elif any(w in key for w in ("lore", "knowledge", "document", "book", "record")):
                new = "lore-fragment"
            elif any(w in key for w in ("trade", "goods", "market", "coin")):
                new = "trade-access"
            elif any(w in key for w in ("rest", "shelter", "food", "safe", "heal")):
                new = "rest-shelter"
            elif any(w in key for w in ("faction", "contract", "bounty", "deed", "reputation")):
                new = "faction-access"
            elif any(w in key for w in ("passage", "access", "route", "travel", "transit", "climb", "dive", "shortcut", "traversal")):
                new = "route-unlock"
            elif any(w in key for w in ("material", "reagent", "hide", "sap", "harvest", "craft")):
                new = "materials"
            elif any(w in key for w in ("combat", "boss", "encounter", "fight", "conflict", "hunt")):
                new = "named-foe"
            elif any(w in key for w in ("service", "repair", "boat", "ferry", "guide", "lodging", "storage")):
                new = "services"
            elif any(w in key for w in ("vista", "view", "navigation", "spectacle", "beauty")):
                new = "map-knowledge"
            elif any(w in key for w in ("rumour", "information", "news")):
                new = "rumour"
            elif any(w in key for w in ("power", "blessing", "buff", "boon")):
                new = "power-boon"
            else:
                unmapped[key] += 1
                continue
        if new not in out:
            out.append(new)
    return out


def guess_purpose(rec: dict) -> dict:
    c = rec["classification"]
    primary, _ = FAMILY_RULES.get((c["class"], c["family"]), ("wonder-oddity", "neutral"))
    kinds = rec.get("rewardProfile", {}).get("kinds", [])
    tier = rec.get("rewardProfile", {}).get("valueTier", "tier-2")
    secondary: list[str] = []
    if "unique-item" in kinds and tier in ("tier-3", "tier-4", "tier-5"):
        secondary.append("unique-item")
    if rec.get("questHooks", {}).get("provisions"):
        secondary.append("quest-anchor")
    if "lore-fragment" in kinds and primary != "lore-reveal":
        secondary.append("lore-reveal")
    if rec.get("discovery") == "sightline" and primary != "vista-landmark":
        secondary.append("vista-landmark")
    if rec.get("discovery") in ("rumour", "document", "none") and c["class"] in ("lair", "ruin", "lone") and primary != "hidden-secret":
        secondary.append("hidden-secret")
    if any(k in kinds for k in ("trade-access", "services")) and primary not in ("service-hub",):
        secondary.append("service-hub")
    if rec.get("status") in ("ruined", "abandoned", "drowned") and primary != "lore-reveal":
        secondary.append("lore-reveal")
    secondary = [s for i, s in enumerate(secondary) if s != primary and s not in secondary[:i]][:3]
    impact = IMPACT_BY_TIER.get(tier, "real")
    if rec.get("importanceTier") == 0 and impact in ("mild", "real"):
        impact = "major"
    if impact == "mild" and secondary and "quest-anchor" in secondary:
        impact = "real"
    why = rec.get("why", {})
    hook = (why.get("siteAdvantages") or why.get("founding") or "").split(". ")[0].strip().rstrip(".")
    return {"primary": primary, "secondary": secondary, "impact": impact,
            "hook": hook or rec.get("name", rec["id"]), "reviewed": False}


def guess_hostility(rec: dict) -> dict:
    c = rec["classification"]
    _, base = FAMILY_RULES.get((c["class"], c["family"]), ("wonder-oddity", "neutral"))
    dt = rec.get("dangerTier", "D2")
    if base == "hostile" and dt in ("D0", "D1"):
        base = "wary"
    if base == "sanctuary" and dt in ("D4", "D5"):
        base = "neutral"
    if rec.get("status") in ("ruined", "abandoned", "drowned") and base in ("friendly", "guarded", "wary"):
        base = "neutral"
    owner = rec.get("ownerFaction")
    return {"baseline": base, "owner": owner, "flips": [],
            "clearable": base == "hostile", "respawn": "slow" if base == "hostile" else "none"}


def guess_interior(rec: dict) -> dict:
    ent = rec.get("entrance", "none")
    c = rec["classification"]
    cls, fam = c["class"], c["family"]
    text = json.dumps(rec.get("why", {})) + json.dumps(rec.get("vibe", {}))
    if ent in ("none", "gate"):
        return {"kind": "none"}
    tier = rec.get("importanceTier", 3)
    wet = WET_BY_ACCESS.get(rec.get("underwaterAccess", "none"), 0.0)
    if ent == "door" and cls in ("settlement", "civic", "works", "transit", "lone", "camp", "martial", "sacred"):
        family = "imperial-fort" if fam in ("carceral", "imperial-military") else "civic-hall" if cls in ("civic", "martial", "sacred") else "dwelling"
        return {"kind": "building", "family": family, "sizeBand": "S1" if tier >= 2 else "S2",
                "wetFraction": min(wet, 0.3), "entranceCount": 1, "exteriorShell": True, "programRef": None}
    # delves
    if fam == "xanmeer":
        family = "xanmeer-complex"
    elif fam == "ayleid" or fam == "daedric-works":
        family = "ayleid-nedic-ruin"
    elif fam == "depopulated":
        family = "abandoned-plantation"
    elif fam == "root-system":
        family = "root-cavern"
    elif fam == "illicit":
        family = "smuggler-den"
    elif fam == "hist":
        family = "hist-sanctum"
    elif fam in ("carceral", "imperial-military"):
        family = "imperial-fort"
    elif fam == "the-dead":
        family = "kothringi-lilmothiit-site" if re.search(r"lilmothiit|kothringi", text, re.I) else "sinkhole-ruin"
    elif ent == "burrow":
        family = "burrow-warren"
    elif ent in ("underwater-entry",) or wet >= 0.4:
        family = "flooded-cave"
    elif ent == "sinkhole-lip":
        family = "sinkhole-ruin"
    elif re.search(r"wreck|hull|ship", text, re.I) and rec.get("underwaterAccess", "none") != "none":
        family = "shipwreck"
    else:
        family = "root-cavern"
    kind = "warren" if family == "burrow-warren" else "complex" if tier <= 1 and family in ("xanmeer-complex", "imperial-fort", "ayleid-nedic-ruin") else "dungeon" if tier <= 2 else "delve"
    return {"kind": kind, "family": family, "sizeBand": SIZE_BY_TIER.get(tier, "S1"), "wetFraction": wet,
            "entranceCount": 1, "exteriorShell": cls in ("settlement", "civic", "martial", "works", "ruin"),
            "programRef": None}


def guess_contents(rec: dict, hostility: dict) -> dict:
    creatures: list[dict] = []
    npcs: list[dict] = []
    loot: list[dict] = []
    dt = rec.get("dangerTier", "D2")
    order = catalogue.DANGER_TIERS
    for s in rec.get("occupants", []) or []:
        if not isinstance(s, str) or s.strip().lower() in ("nothing", "none", "nobody", "no one"):
            continue
        m = D_LEVEL.search(s)
        d = f"D{m.group(1)}" if m else None
        if d and order.index(d) > order.index(dt):
            d = dt
        if ENVIRONMENT_WORDS.search(s) and not CREATURE_WORDS.search(s):
            continue  # "D3 the torrent in season" is the ground, not an occupant
        if CREATURE_WORDS.search(s):
            role = "something-old" if re.search(r"something old|the old thing", s, re.I) else \
                   "swarm" if re.search(r"swarm|leech|insect|bats?", s, re.I) else \
                   "pack-hunter" if re.search(r"packs?|hunters?", s, re.I) else \
                   "apex-ambusher" if re.search(r"crocodile|wamasu|leviathan|behemoth|troll|dreugh", s, re.I) else \
                   "guardian-boss" if re.search(r"guardian|boss", s, re.I) else "territorial-grazer"
            count = "swarm" if role == "swarm" else "band" if role == "pack-hunter" else "single" if role in ("apex-ambusher", "something-old", "guardian-boss") else "few"
            if len(creatures) < catalogue.CONTENT_SLOT_LIMIT:
                creatures.append({"slotId": f"c{len(creatures) + 1}", "role": role, "registerRef": None,
                                  "danger": d or dt, "count": count, "note": s})
            continue
        role = "rank-and-file"
        for rx, r in NPC_ROLE_WORDS:
            if rx.search(s):
                role = r
                break
        count = "single" if role in ("named-keeper", "hermit") or re.search(r"\b(one|a single|the) [a-z-]+$", s) else "few"
        if len(npcs) < catalogue.CONTENT_SLOT_LIMIT:
            npcs.append({"slotId": f"n{len(npcs) + 1}", "role": role, "registerRef": None,
                         "danger": d, "count": count, "named": role == "named-keeper", "note": s})
    kinds = rec.get("rewardProfile", {}).get("kinds", [])
    tier = rec.get("rewardProfile", {}).get("valueTier", "tier-2")
    loot_roles = []
    if "unique-item" in kinds:
        loot_roles.append(("unique-item", "unique-item"))
    if "loot-cache" in kinds:
        loot_roles.append(("hidden-cache" if hostility["baseline"] in ("hostile", "neutral") else "strongroom", "loot-cache"))
    if "lore-fragment" in kinds or "evidence" in kinds:
        loot_roles.append(("ledger-or-document", "lore-fragment" if "lore-fragment" in kinds else "evidence"))
    if "materials" in kinds or "resource-node" in kinds:
        loot_roles.append(("workshop-stock", "materials"))
    if rec["classification"]["family"] == "the-dead":
        loot_roles.append(("grave-goods", "loot-cache"))
    for role, payoff in loot_roles[: catalogue.CONTENT_SLOT_LIMIT]:
        loot.append({"slotId": f"l{len(loot) + 1}", "role": role, "registerRef": None, "payoff": payoff,
                     "valueTier": tier, "provenance": None})
    return {"creatures": creatures, "npcs": npcs, "loot": loot}


def prune_relations(rec: dict, live_ids: set[str]) -> int:
    rel = rec.get("relations") or {}
    reserved = rec.get("relationsReserved") or {}
    moved = 0
    for key in ("dependsOn", "supplies", "rivals", "patrols", "visibleFrom", "reachedVia", "tolls"):
        vals = rel.get(key)
        if not isinstance(vals, list):
            continue
        keep, park = [], []
        for v in vals:
            if isinstance(v, str) and v.startswith("place.") and v not in live_ids:
                park.append(v)
            else:
                keep.append(v)
        if park:
            rel[key] = keep
            reserved.setdefault(key, [])
            reserved[key] = sorted(set(reserved[key]) | set(park))
            moved += len(park)
    if reserved:
        rec["relationsReserved"] = reserved
    return moved


def repoint_routes(rec: dict, aliases: dict[str, str]) -> int:
    rel = rec.get("relations") or {}
    n = 0
    for key in ("patrols", "tolls"):
        vals = rel.get(key)
        if isinstance(vals, list):
            new = []
            for v in vals:
                if isinstance(v, str) and v.startswith("route."):
                    r = resolve(v, aliases)
                    if r and r != v:
                        n += 1
                    new.append(r or v)
                else:
                    new.append(v)
            rel[key] = new
    edges = rel.get("travelServiceEdges")
    if isinstance(edges, list):
        new = []
        for e in edges:
            if not isinstance(e, str):
                new.append(e)
                continue
            mode, sep, pair = e.partition(":")
            if not sep:
                mode, sep, pair = e.partition(".")
            r = resolve(e, aliases)
            if r:
                out = f"{mode}:{r}"
                if out != e:
                    n += 1
                new.append(out)
            else:
                new.append(e)
        rel["travelServiceEdges"] = sorted(set(new))
    return n


def guess_travel_station(rec: dict, anchor_ids: dict[str, str]) -> dict | None:
    edges = (rec.get("relations") or {}).get("travelServiceEdges") or []
    modes = sorted({e.split(":")[0] for e in edges if isinstance(e, str) and e.split(":")[0] in catalogue.TRAVEL_MODES})
    if not modes:
        return None
    slug = rec["id"].rsplit(".", 1)[-1]
    dests: set[str] = set()
    for e in edges:
        ref = e.split(":", 1)[-1]
        if ref.startswith("route."):
            pair = ref.rsplit(".", 1)[-1]
            for a, pid in anchor_ids.items():
                if a in pair and a != slug and pid != rec["id"]:
                    dests.add(pid)
    return {"modes": modes, "destinations": sorted(dests)}


def migrate(dry: bool = False) -> dict:
    files = catalogue.load_region_files.__wrapped__() if hasattr(catalogue.load_region_files, "__wrapped__") else _load_any_version()
    all_recs = [r for rf in files for r in rf.places]
    live_ids = {r["id"] for r in all_recs if r.get("status") not in ("deferred", "cut")}
    anchor_ids = {}
    for r in all_recs:
        if r.get("importanceTier") == 0 and r["classification"]["family"] in ("major-city", "free-port"):
            anchor_ids[r["id"].rsplit(".", 1)[-1]] = r["id"]
    aliases = alias_map()
    stats = Counter()
    unmapped: Counter = Counter()
    for rf in files:
        for rec in rf.places:
            rp = rec.get("rewardProfile")
            if rp and isinstance(rp.get("kinds"), list):
                before = list(rp["kinds"])
                rp["kinds"] = normalise_rewards(before, unmapped)
                stats["rewards-normalised"] += int(before != rp["kinds"])
            if "hostility" not in rec:
                rec["hostility"] = guess_hostility(rec)
                stats["hostility"] += 1
            if "playerPurpose" not in rec:
                rec["playerPurpose"] = guess_purpose(rec)
                stats["playerPurpose"] += 1
            if "interior" not in rec:
                rec["interior"] = guess_interior(rec)
                stats["interior"] += 1
            if "contents" not in rec:
                rec["contents"] = guess_contents(rec, rec["hostility"])
                stats["contents"] += 1
            stats["relations-parked"] += prune_relations(rec, live_ids)
            stats["routes-repointed"] += repoint_routes(rec, aliases)
            if "travelStation" not in rec:
                ts = guess_travel_station(rec, anchor_ids)
                if ts:
                    rec["travelStation"] = ts
                    stats["travelStation"] += 1
        if not dry:
            data = json.loads(rf.path.read_text())
            data["schemaVersion"] = catalogue.PLACES_SCHEMA_VERSION
            data["places"] = rf.places
            catalogue.dump_json(rf.path, data)
    stats["unmapped-reward-kinds"] = sum(unmapped.values())
    return {"stats": dict(stats), "unmapped": dict(unmapped)}


def _load_any_version() -> list[catalogue.RegionFile]:
    out = []
    for path in sorted(catalogue.CATALOGUE_DIR.glob("places-*.json")):
        data = json.loads(path.read_text())
        out.append(catalogue.RegionFile(path, path.stem.removeprefix("places-"), data.get("seed", ""), data["places"]))
    return out


def main(argv: list[str] | None = None) -> int:
    argv = sys.argv[1:] if argv is None else argv
    res = migrate(dry="--dry" in argv)
    print(json.dumps(res, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
