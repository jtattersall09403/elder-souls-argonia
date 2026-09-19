"""Fill the world 70 §48 interior promises on every dungeon-kind record (16g).

    python3 -m worldgen.migrate_interior_promises --apply
    python3 -m worldgen.migrate_interior_promises --report

MECHANICAL, and deliberately so. Every value is derived from a field the
record ALREADY carries — its entrance, its family, its size band, its wet
fraction, its danger tier, its hostility, its contents, its quest hooks — so
records differ in their promises exactly where they already differ in their
facts. Nothing here invents a place's character; it reads the character the
region agents already wrote and says it in the §48 words. A field that is
already present is never overwritten: a later hand pass beats the migration.

The one place the migration chooses rather than derives is the sameness pass
(`vary_for_sameness`). §48 rule 1 forbids two dungeon-kind records of one
family within 2 km agreeing on more than three of the seven promise axes.
Where the derivation lands two neighbours on the same profile, the DEFAULTS
(light, an optional core room, clearance, and the S2 loop) are varied from a
hash of the record id among family-legal alternatives — only on the records
in an offending pair, so what agreement remains is what those records
genuinely share.

Run order: this module, then `worldgen.quest_promises` (which adds the
sockets the quest plan asks for), then `worldgen.catalogue --check`.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from collections import Counter

from . import catalogue

# --- the derivation tables ------------------------------------------------

# §48 rule 4: the entrance type is siting data and it picks the FIRST room.
ENTRANCE_FIRST_ROOM = {
    "stair-throat": "stair-shaft",
    "underwater-entry": "flooded-gallery",
    "root-mouth": "root-throat",
    "hollow-trunk": "root-throat",
    "well-shaft": "cistern",
    "sinkhole-lip": "collapse",
    "cellar-door": "antechamber",
    "trapdoor": "antechamber",
    "grave-cut": "ossuary",
    "burrow": "gauntlet",
}
# Entrances that drop you below the ground you stood on.
BELOW_ENTRANCES = {
    "underwater-entry", "sinkhole-lip", "well-shaft", "stair-throat", "trapdoor",
    "cellar-door", "burrow", "root-mouth", "hollow-trunk", "cave-mouth", "grave-cut",
}
VERTICAL_ENTRANCES = {"well-shaft", "sinkhole-lip"}

# What the family needs after its first room (world 70 §47's spatial grammar).
FAMILY_CORE_ROOMS = {
    "root-cavern": ["gallery", "cache"],
    "flooded-cave": ["flooded-gallery", "sump"],
    "xanmeer-complex": ["antechamber", "gallery", "shrine"],
    "imperial-fort": ["barracks", "cell-block", "archive"],
    "smuggler-den": ["dock-cavern", "cache", "lookout"],
    "abandoned-plantation": ["hearth", "counting-room", "cistern"],
    "hist-sanctum": ["shrine", "dream-chamber"],
    "sinkhole-ruin": ["collapse", "gallery"],
    "burrow-warren": ["gauntlet", "nursery"],
    "shipwreck": ["gallery", "cache"],
    "kothringi-lilmothiit-site": ["gallery", "ossuary"],
    "ayleid-nedic-ruin": ["antechamber", "gallery", "drain"],
    "dwelling": ["hearth", "cache"],
    "civic-hall": ["hearth", "archive"],
}
# How many rooms a size band can carry. S4 keeps everything it earned.
SIZE_ROOM_CAP = {"S0": 2, "S1": 4, "S2": 6, "S3": 8, "S4": None}
# Floor run in metres by size band, for the swim/dive arithmetic.
SIZE_METRES = {"S0": 10, "S1": 25, "S2": 50, "S3": 90, "S4": 140}
DIVE_M = {"none": 0, "surface-swim": 0, "shallow-dive": 4, "deep-dive": 10,
          "argonian-only-depth": 16}
DARK_FRACTION = {
    "root-cavern": 0.8, "flooded-cave": 0.8, "burrow-warren": 0.8, "sinkhole-ruin": 0.8,
    "xanmeer-complex": 0.5, "ayleid-nedic-ruin": 0.5, "imperial-fort": 0.5,
    "abandoned-plantation": 0.5, "smuggler-den": 0.3, "kothringi-lilmothiit-site": 0.3,
    "shipwreck": 0.6, "hist-sanctum": 0.2, "dwelling": 0.5, "civic-hall": 0.5,
}
FAMILY_LIGHT = {
    "root-cavern": "bioluminescent", "burrow-warren": "bioluminescent",
    "sinkhole-ruin": "bioluminescent", "hist-sanctum": "bioluminescent",
    "flooded-cave": "dark", "shipwreck": "dark",
    "xanmeer-complex": "torchlit", "ayleid-nedic-ruin": "torchlit",
    "imperial-fort": "torchlit", "abandoned-plantation": "torchlit",
    "smuggler-den": "torchlit", "kothringi-lilmothiit-site": "torchlit",
    "dwelling": "torchlit", "civic-hall": "torchlit",
}
COMBAT_SCALE_BY_DANGER = {"D0": "duel", "D1": "duel", "D2": "duel",
                          "D3": "smallGroup", "D4": "largeGroup", "D5": "boss"}
TIGHT_FAMILIES = {"burrow-warren", "root-cavern"}
GENEROUS_FAMILIES = {"xanmeer-complex", "imperial-fort", "ayleid-nedic-ruin"}
LOCK_BY_STANCE = {"sanctuary": "none", "friendly": "none", "guarded": "simple",
                  "wary": "simple", "neutral": "simple", "hostile": "hard"}
WHERE_BY_CREATURE_ROLE = {
    "guardian-boss": "boss", "apex-ambusher": "deep", "pack-hunter": "main",
    "scavenger": "threshold", "something-old": "hidden", "territorial-grazer": "entrance",
    "hazard-fauna": "flooded", "domestic": "main",
}
WHERE_BY_NPC_ROLE = {
    "captive": "deep", "named-keeper": "main", "lieutenant": "deep",
    "rank-and-file": "main", "merchant": "entrance", "quest-giver": "entrance",
    "hermit": "entrance", "priest": "main", "official": "main", "crew": "main",
    "family": "main", "patrol": "threshold", "trainer": "main", "boss": "boss",
}
WHERE_BY_LOOT_ROLE = {
    "hidden-cache": "hidden", "strongroom": "deep", "ledger-or-document": "main",
}
SOCKET_LIST_KIND = {"evidence": "evidence", "scene": "scene", "station": "station"}
WHERE_BY_SOCKET_KIND = {
    "boss": "deep", "boss-chest": "deep", "captive": "deep", "cache": "hidden",
    "shrine": "main", "scene": "main", "station": "main", "evidence": "threshold",
    "escape": "entrance",
}
SAMENESS_RADIUS_M = 2000.0


def _hash_pick(rec_id: str, salt: str, options: list):
    """Deterministic choice among family-legal alternatives."""
    digest = hashlib.sha256(f"{rec_id}\0{salt}".encode()).hexdigest()
    return options[int(digest[:8], 16) % len(options)]


def slug(rec_id: str) -> str:
    """The socket-id stem for a record: `<region>-<slug>`.

    §48 writes the form as `socket.<place-slug>.<kind>`, and a place slug is
    NOT unique across regions — `xanmeer-dive-shaft` exists in two — so the
    stem carries the region. Standard 2 (ids unique province-wide) is the
    binding constraint and `tooling/repo-standards/check.mjs` enforces it."""
    parts = rec_id.split(".")
    return f"{parts[1]}-{parts[2]}" if len(parts) >= 3 else parts[-1]


# --- the fields ------------------------------------------------------------

def vertical_relationship(rec: dict) -> str:
    ent = rec.get("entrance")
    if ent in BELOW_ENTRANCES:
        return "below"
    if ent in ("door", "gate"):
        return "behind" if (rec.get("interior") or {}).get("exteriorShell") else "within"
    return "below"


def _boss_tier(rec: dict) -> bool:
    tier = ((rec.get("rewardProfile") or {}).get("valueTier") or "")
    if tier in ("tier-4", "tier-5"):
        for sl in (rec.get("contents") or {}).get("loot", []) or []:
            if sl.get("payoff") == "unique-item":
                return True
    return False


def room_functions(rec: dict) -> list[str]:
    it = rec.get("interior") or {}
    fam = it.get("family")
    first = ENTRANCE_FIRST_ROOM.get(rec.get("entrance"), "entrance")
    rooms = [first]
    for room in FAMILY_CORE_ROOMS.get(fam, ["gallery"]):
        if room not in rooms:
            rooms.append(room)
    ct = rec.get("contents") or {}
    extra: list[str] = []
    if any(any(w in (sl.get("role") or "") for w in ("cache", "strongroom", "hidden"))
           for sl in ct.get("loot", []) or []):
        extra.append("cache")
    if any(sl.get("role") == "captive" for sl in ct.get("npcs", []) or []):
        extra.append("captive")
    if any(sl.get("role") == "guardian-boss" for sl in ct.get("creatures", []) or []) \
            or _boss_tier(rec):
        extra.append("boss")
    # A quest-anchor's staged scene is a SOCKET, not a room (§48): the reveal
    # list stays the family's, and quest_promises pins the scene onto it.
    for room in extra:
        if room not in rooms:
            rooms.append(room)

    cap = SIZE_ROOM_CAP.get(it.get("sizeBand"))
    if cap is None or len(rooms) <= cap:
        return rooms
    keep = {rooms[0]}
    for room in ("boss", "captive", "cache"):
        if len(keep) < cap and room in rooms:
            keep.add(room)
    for room in rooms:
        if len(keep) >= cap:
            break
        keep.add(room)
    return [r for r in rooms if r in keep]


def loop(rec: dict) -> str:
    """Precedence (owner ruling, 2026-09-19): the shape of the return is
    decided by the strongest physical fact first. A shaft you came down is a
    vertical return whatever else is true; standing water is a water loop; only
    then does a second door make it a second-entrance loop; a big dry delve
    without either gets a shortcut back."""
    it = rec.get("interior") or {}
    if rec.get("entrance") in VERTICAL_ENTRANCES:
        return "vertical-return"
    if (it.get("wetFraction") or 0) >= 0.5:
        return "water-loop"
    if (it.get("entranceCount") or 1) >= 2:
        return "second-entrance"
    if it.get("sizeBand") in ("S3", "S4"):
        return "shortcut-back"
    return "none"


def current(rec: dict) -> str:
    water = (rec.get("plotFacts") or {}).get("water") or {}
    kind = (water.get("kind") or "") if isinstance(water, dict) else ""
    if any(word in kind for word in ("rapid", "riffle", "fall")):
        return "strong"
    if "tidal" in kind:
        return "mild"
    return "none"


def traversal(rec: dict) -> dict:
    it = rec.get("interior") or {}
    wf = it.get("wetFraction") or 0
    ua = rec.get("underwaterAccess") or "none"
    dive = DIVE_M.get(ua, 0)
    return {
        "swimM": round(wf * SIZE_METRES.get(it.get("sizeBand"), 25)),
        "diveM": dive,
        "climbM": 8 if "climb" in (rec.get("traversalModes") or []) else 0,
        "breathGated": dive > 0 and ua != "surface-swim",
        "current": current(rec),
        "darkFraction": DARK_FRACTION.get(it.get("family"), 0.5),
    }


def combat_spaces(rec: dict, rooms: list[str], clearance: str | None = None) -> list[dict]:
    it = rec.get("interior") or {}
    wf = it.get("wetFraction") or 0
    has_boss = "boss" in rooms
    if wf >= 0.5:
        footing = "swim"
    elif wf >= 0.2:
        footing = "wade"
    elif has_boss and wf > 0:
        footing = "mixed"
    else:
        footing = "dry"
    if clearance is None:
        fam = it.get("family")
        if it.get("sizeBand") in ("S0", "S1") and fam in TIGHT_FAMILIES:
            clearance = "tight"
        elif fam in GENEROUS_FAMILIES:
            clearance = "generous"
        else:
            clearance = "standard"
    spaces = [{"scale": COMBAT_SCALE_BY_DANGER.get(rec.get("dangerTier"), "duel"),
               "footing": footing, "clearance": clearance}]
    if has_boss and spaces[0]["scale"] != "boss":
        spaces.append({"scale": "boss", "footing": footing, "clearance": clearance})
    return spaces


def anchor_sockets(rec: dict, rooms: list[str], loop_value: str) -> list[dict]:
    """Pins from the rooms the record promises, plus the build-out socket ids
    the record ALREADY carries — reused verbatim, never re-coined."""
    out: list[dict] = []
    used: set[str] = set()
    place_slug = slug(rec["id"])

    def add(kind: str, socket_id: str | None = None) -> None:
        if socket_id is None:
            socket_id = f"socket.{place_slug}.{kind}"
            n = 2
            while socket_id in used:
                socket_id = f"socket.{place_slug}.{kind}-{n}"
                n += 1
        if socket_id in used:
            return
        used.add(socket_id)
        out.append({"id": socket_id, "kind": kind,
                    "whereInInterior": WHERE_BY_SOCKET_KIND[kind]})

    if "boss" in rooms:
        add("boss")
        if any(sl.get("valueTier") in ("tier-4", "tier-5")
               or (rec.get("rewardProfile") or {}).get("valueTier") in ("tier-4", "tier-5")
               for sl in (rec.get("contents") or {}).get("loot", []) or []):
            add("boss-chest")
    if "captive" in rooms:
        add("captive")
    if "cache" in rooms:
        add("cache")
    if "shrine" in rooms:
        add("shrine")
    # The escape pin belongs to the second ENTRANCE, not to the loop label:
    # since the 2026-09-19 precedence a two-door interior can be a
    # vertical-return or a water-loop and still owe the player its other way out.
    if ((rec.get("interior") or {}).get("entranceCount") or 1) >= 2:
        add("escape")
    sockets = rec.get("sockets") or {}
    for list_name, kind in sorted(SOCKET_LIST_KIND.items()):
        for sid in sockets.get(list_name, []) or []:
            if isinstance(sid, str) and sid:
                add(kind, sid)
    return out


def light(rec: dict) -> str:
    it = rec.get("interior") or {}
    if it.get("exteriorShell"):
        return "mixed"
    return FAMILY_LIGHT.get(it.get("family"), "dark")


def lock(rec: dict) -> str:
    owner = (rec.get("questHooks") or {}).get("tierOwnership") or ""
    if "tier-0" in owner:
        return "quest-sealed"
    pp = rec.get("playerPurpose") or {}
    if "lock-target" in json.dumps(pp):
        return "hard"
    return LOCK_BY_STANCE.get((rec.get("hostility") or {}).get("baseline"), "simple")


def where_in_interior(kind: str, slot: dict, rooms: list[str]) -> str:
    role = slot.get("role")
    if kind == "creatures":
        if role == "swarm":
            return "flooded" if "flooded-gallery" in rooms or "sump" in rooms else "main"
        return WHERE_BY_CREATURE_ROLE.get(role, "main")
    if kind == "npcs":
        return WHERE_BY_NPC_ROLE.get(role, "main")
    if role == "unique-item":
        return "boss" if "boss" in rooms else "deep"
    return WHERE_BY_LOOT_ROLE.get(role, "main")


# --- the pass --------------------------------------------------------------

PROMISE_KEYS = ("verticalRelationship", "roomFunctions", "loop", "traversal",
                "combatSpaces", "anchorSockets", "light", "lock")


def fill_record(rec: dict) -> list[str]:
    """Fill the §48 fields this record is missing. Returns the keys filled.
    A field already present is kept: a hand pass beats the migration."""
    it = rec.get("interior") or {}
    kind = it.get("kind")
    filled: list[str] = []
    if kind in (None, "none"):
        if rec.get("schemaVersion") != catalogue.INTERIOR_PROMISE_VERSION:
            rec["schemaVersion"] = catalogue.INTERIOR_PROMISE_VERSION
            filled.append("schemaVersion")
        return filled

    if "verticalRelationship" not in it:
        it["verticalRelationship"] = vertical_relationship(rec)
        filled.append("verticalRelationship")

    if kind in catalogue.DUNGEON_KINDS:
        rooms = it.get("roomFunctions")
        if rooms is None:
            rooms = room_functions(rec)
            it["roomFunctions"] = rooms
            filled.append("roomFunctions")
        if "loop" not in it:
            it["loop"] = loop(rec)
            filled.append("loop")
        if "traversal" not in it:
            it["traversal"] = traversal(rec)
            filled.append("traversal")
        if "combatSpaces" not in it:
            it["combatSpaces"] = combat_spaces(rec, rooms)
            filled.append("combatSpaces")
        if "anchorSockets" not in it:
            it["anchorSockets"] = anchor_sockets(rec, rooms, it["loop"])
            filled.append("anchorSockets")
        if "light" not in it:
            it["light"] = light(rec)
            filled.append("light")
        if "lock" not in it:
            it["lock"] = lock(rec)
            filled.append("lock")
        ct = rec.get("contents") or {}
        for key in ("creatures", "npcs", "loot"):
            for sl in ct.get(key, []) or []:
                if "whereInInterior" not in sl:
                    sl["whereInInterior"] = where_in_interior(key, sl, rooms)
                    filled.append(f"contents.{key}.whereInInterior")

    if rec.get("schemaVersion") != catalogue.INTERIOR_PROMISE_VERSION:
        rec["schemaVersion"] = catalogue.INTERIOR_PROMISE_VERSION
        filled.append("schemaVersion")
    return filled


DERIVED_KEYS = PROMISE_KEYS


def refresh_record(rec: dict) -> list[str]:
    """Re-derive every promise on this record FROM ITS FACTS, overwriting.

    `fill_record` never overwrites, which is right for a hand pass and wrong
    when the facts themselves change: a record whose sizeBand or entranceCount
    moves owes a recomputed swim distance, room cap, clearance, loop and
    socket set. `provision` stamps on anchor sockets are the one thing carried
    across — they come from the quest plan, not from the facts — and
    `worldgen.quest_promises` re-adds any it still owes."""
    it = rec.get("interior") or {}
    if it.get("kind") in (None, "none"):
        return []
    provisions = {(so.get("kind"), so.get("id")): so.get("provision")
                  for so in it.get("anchorSockets") or [] if so.get("provision")}
    by_kind = {kind: prov for (kind, _sid), prov in provisions.items()}
    for key in DERIVED_KEYS:
        it.pop(key, None)
    for slots in (rec.get("contents") or {}).values():
        for slot in slots or []:
            slot.pop("whereInInterior", None)
    filled = fill_record(rec)
    for so in it.get("anchorSockets") or []:
        if so["id"] in {sid for _k, sid in provisions}:
            so["provision"] = provisions[(so["kind"], so["id"])]
        elif so["kind"] in by_kind:
            so["provision"] = by_kind[so["kind"]]
    return filled


# --- §48 rule 1: the sameness gate ----------------------------------------

AXES = ("rooms", "loop", "light", "lock", "combat", "traversal", "sockets")


def _swim_band(swim: float) -> str:
    if swim <= 0:
        return "0"
    if swim <= 20:
        return "1-20"
    if swim <= 60:
        return "21-60"
    return "61+"


def profile(rec: dict) -> dict:
    it = rec.get("interior") or {}
    tv = it.get("traversal") or {}
    return {
        "rooms": frozenset(it.get("roomFunctions") or ()),
        "loop": it.get("loop"),
        "light": it.get("light"),
        "lock": it.get("lock"),
        "combat": frozenset(c.get("scale") for c in it.get("combatSpaces") or ()),
        "traversal": (tv.get("breathGated"), tv.get("current"),
                      _swim_band(tv.get("swimM") or 0)),
        "sockets": frozenset(s.get("kind") for s in it.get("anchorSockets") or ()),
    }


def sameness_pairs(records: list[dict]) -> list[tuple[str, str, int]]:
    """Two live dungeon-kind records of one family within 2 km agreeing on
    more than three of the seven axes (world 70 §48 rule 1)."""
    live = [r for r in records
            if r.get("status") not in ("cut", "deferred")
            and (r.get("interior") or {}).get("kind") in catalogue.DUNGEON_KINDS
            and isinstance(r.get("positionM"), list) and len(r["positionM"]) == 2]
    by_family: dict[str, list[dict]] = {}
    for r in live:
        by_family.setdefault(r["interior"]["family"], []).append(r)
    pairs: list[tuple[str, str, int]] = []
    for fam in sorted(by_family):
        group = sorted(by_family[fam], key=lambda r: r["id"])
        profiles = {r["id"]: profile(r) for r in group}
        for i, a in enumerate(group):
            for b in group[i + 1:]:
                if math.dist(a["positionM"], b["positionM"]) > SAMENESS_RADIUS_M:
                    continue
                pa, pb = profiles[a["id"]], profiles[b["id"]]
                agree = sum(1 for axis in AXES if pa[axis] == pb[axis])
                if agree > 3:
                    pairs.append((a["id"], b["id"], agree))
    return pairs


# Family-legal alternatives for the DEFAULTS only. Never a fact: the light a
# root cavern can be, the clearance a room can have, the optional core room a
# family may drop. The derived fields (traversal, rooms that answer contents,
# loop where the record has two entrances) are left alone.
LIGHT_ALTERNATIVES = {
    "bioluminescent": ["bioluminescent", "dark", "mixed", "torchlit"],
    "dark": ["dark", "bioluminescent", "torchlit", "mixed"],
    "torchlit": ["torchlit", "dark", "mixed", "bioluminescent"],
    "mixed": ["mixed", "torchlit", "dark", "bioluminescent"],
    "daylit": ["daylit", "mixed"],
}
CLEARANCE_ALTERNATIVES = {
    "tight": ["tight", "standard"],
    "standard": ["standard", "tight", "generous"],
    "generous": ["generous", "standard"],
}
# Rooms a record must keep: they answer a fact on the record (a boss creature,
# a captive slot, a cache-role loot slot). Everything else in the reveal is a
# default the sameness pass may move.
FACT_ROOMS = {"boss", "captive", "cache"}
# One more room each family's grammar (world 70 §47) legitimately allows. The
# sameness pass may ADD one of these as well as drop one: it is architecture,
# not a claim about contents, so it promises nothing the record does not have.
FAMILY_OPTIONAL_ROOMS = {
    "root-cavern": ["root-throat", "sump", "midden", "gauntlet", "collapse"],
    "flooded-cave": ["sump", "drain", "cistern", "collapse", "midden"],
    "burrow-warren": ["midden", "root-throat", "collapse", "gallery"],
    "smuggler-den": ["midden", "workshop", "drain", "gallery"],
    "xanmeer-complex": ["drain", "cistern", "stair-shaft", "flooded-gallery", "collapse"],
    "hist-sanctum": ["root-throat", "flooded-gallery", "gallery", "midden"],
    "imperial-fort": ["workshop", "midden", "drain", "cistern", "gallery"],
    "abandoned-plantation": ["workshop", "midden", "gallery", "collapse"],
    "sinkhole-ruin": ["drain", "sump", "midden", "stair-shaft"],
    "shipwreck": ["midden", "workshop", "flooded-gallery", "sump"],
    "kothringi-lilmothiit-site": ["midden", "cistern", "collapse", "shrine"],
    "ayleid-nedic-ruin": ["cistern", "collapse", "shrine", "stair-shaft"],
    "dwelling": ["midden", "workshop", "cistern"],
    "civic-hall": ["workshop", "midden", "gallery", "cistern"],
}


def derived_base(rec: dict) -> dict:
    """The promises this record's FACTS say, ignoring whatever variation a
    previous run wrote. The sameness pass must start from here every time, or
    it varies its own output and never reaches a fixed point."""
    rooms = room_functions(rec)
    loop_value = loop(rec)
    return {"roomFunctions": rooms, "light": light(rec), "loop": loop_value,
            "clearance": combat_spaces(rec, rooms)[0]["clearance"]}


def _candidates(rec: dict, base: dict) -> list[dict]:
    """Every family-legal variation of this record's DEFAULTS, in a
    deterministic hash-rotated order. Never a fact: the light the family can
    be, an optional room it may drop or take on, and the S2 loop. The rooms
    that answer a fact (boss, captive, cache), the derived traversal, the lock
    and the combat scale are untouchable."""
    it = rec["interior"]
    rid = rec["id"]
    lights = LIGHT_ALTERNATIVES.get(base["light"], ["dark", "torchlit"])
    rooms = list(base["roomFunctions"])
    optional = [r for r in rooms[1:] if r not in FACT_ROOMS]
    drops: list[tuple[str, ...]] = [()]
    if len(rooms) > 2:
        drops += [(r,) for r in optional]
    if len(rooms) > 3:
        drops += [(optional[i], optional[j])
                  for i in range(len(optional)) for j in range(i + 1, len(optional))]
    cap = SIZE_ROOM_CAP.get(it.get("sizeBand"))
    pool = [r for r in FAMILY_OPTIONAL_ROOMS.get(it.get("family"), []) if r not in rooms]
    headroom = 99 if cap is None else max(0, cap - len(rooms))
    adds: list[tuple[str, ...]] = [()]
    if headroom >= 1:
        adds += [(r,) for r in pool]
    # One added room only: a second is an invention, not a default.
    loops = [base["loop"]]
    if it.get("sizeBand") == "S2" and base["loop"] in ("none", "shortcut-back") \
            and (it.get("entranceCount") or 1) < 2:
        loops = ["none", "shortcut-back"]
    clearance = _hash_pick(rid, "clearance", CLEARANCE_ALTERNATIVES.get(
        base["clearance"], ["standard", "tight"]))
    out = [{"light": li, "drop": dr, "add": ad, "clearance": clearance, "loop": lo}
           for li in lights for dr in drops for ad in adds for lo in loops]
    rotate = int(hashlib.sha256(rid.encode()).hexdigest()[:8], 16) % len(out)
    return out[rotate:] + out[:rotate]


def _apply_candidate(rec: dict, base: dict, cand: dict) -> None:
    it = rec["interior"]
    it["light"] = cand["light"]
    it["loop"] = cand["loop"]
    rooms = list(base["roomFunctions"])
    for room in cand["drop"]:
        if room in rooms and len(rooms) > 2:
            rooms.remove(room)
    for room in cand.get("add") or ():
        if room not in rooms:
            rooms.append(room)
    it["roomFunctions"] = rooms
    for cs in it.get("combatSpaces") or []:
        cs["clearance"] = cand["clearance"]
    it["anchorSockets"] = anchor_sockets(rec, rooms, it["loop"])


def _neighbour_graph(records: list[dict]) -> dict[str, list[str]]:
    """Who each dungeon-kind record could be confused with: same family, both
    live and plotted, within 2 km."""
    live = [r for r in records
            if r.get("status") not in ("cut", "deferred")
            and (r.get("interior") or {}).get("kind") in catalogue.DUNGEON_KINDS
            and isinstance(r.get("positionM"), list) and len(r["positionM"]) == 2]
    graph: dict[str, list[str]] = {r["id"]: [] for r in live}
    by_family: dict[str, list[dict]] = {}
    for r in live:
        by_family.setdefault(r["interior"]["family"], []).append(r)
    for fam in sorted(by_family):
        group = sorted(by_family[fam], key=lambda r: r["id"])
        for i, a in enumerate(group):
            for b in group[i + 1:]:
                if math.dist(a["positionM"], b["positionM"]) <= SAMENESS_RADIUS_M:
                    graph[a["id"]].append(b["id"])
                    graph[b["id"]].append(a["id"])
    return graph


def _agreement(a: dict, b: dict) -> int:
    pa, pb = profile(a), profile(b)
    return sum(1 for axis in AXES if pa[axis] == pb[axis])


def vary_for_sameness(records: list[dict],
                      passes: int = 12) -> tuple[int, int, list[tuple[str, str, int]]]:
    """Clear §48 rule 1 on the records in offending pairs.

    A greedy constraint pass over the neighbour graph, not a per-pair patch:
    fixing one pair at a time re-breaks the pair fixed before it, so each
    record is considered ONCE against all of its neighbours at a time, in id
    order, and takes the first candidate (in its own hash-rotated order) that
    leaves it under four agreed axes with every one of them. If no candidate
    clears every neighbour, the one clearing the most is taken and the
    remainder is reported rather than forced: forcing it would mean changing a
    field derived from a real record fact, which is Fable's call, not the
    migration's."""
    before = sameness_pairs(records)
    by_id = {r["id"]: r for r in records}
    graph = _neighbour_graph(records)
    bases = {rid: derived_base(by_id[rid]) for rid in graph}
    # Start every record from what its facts say, so the pass is a pure
    # function of the facts and the neighbour graph and re-running it is a
    # no-op rather than a slow drift.
    for rid in sorted(graph):
        _apply_candidate(by_id[rid], bases[rid],
                         {"light": bases[rid]["light"], "drop": (), "add": (),
                          "clearance": bases[rid]["clearance"], "loop": bases[rid]["loop"]})
    for _ in range(passes):
        changed = False
        conflicted = sorted(
            ((sum(1 for n in graph[rid] if _agreement(by_id[rid], by_id[n]) > 3), rid)
             for rid in graph if graph[rid]), key=lambda t: (-t[0], t[1]))
        for bad_now, rid in conflicted:
            if bad_now == 0:
                continue
            rec = by_id[rid]
            neighbours = [by_id[n] for n in graph[rid]]
            best_cand, best_bad = None, None
            for cand in _candidates(rec, bases[rid]):
                _apply_candidate(rec, bases[rid], cand)
                bad = sum(1 for n in neighbours if _agreement(rec, n) > 3)
                if best_bad is None or bad < best_bad:
                    best_cand, best_bad = cand, bad
                if bad == 0:
                    break
            if best_cand is not None:
                _apply_candidate(rec, bases[rid], best_cand)
                changed = True
        if not changed:
            break
    return len(before), len(sameness_pairs(records)), sameness_pairs(records)


# --- §48 rule 1, second resort: vary a FACT ---------------------------------

SIZE_LADDER = ["S0", "S1", "S2", "S3", "S4"]


def vary_fact(rec: dict, step: int) -> str | None:
    """Change ONE fact about the interior so its promises can differ.

    Owner ruling 2026-09-19. The defaults ran out of distinct profiles in the
    dense same-family clusters, so the higher-sorting record of a stubborn pair
    is made a genuinely different place rather than a differently-lit copy of
    the same one. Step 0 is the size or the second way in; step 1 is the
    above-ground shell. There is no step 2: a record gets at most these two,
    because a delve with nine entrances is not variety, it is a runaway loop.
    """
    it = rec.get("interior") or {}
    if step == 0:
        band = it.get("sizeBand")
        if band in ("S0", "S1"):
            it["sizeBand"] = SIZE_LADDER[SIZE_LADDER.index(band) + 1]
            return f"sizeBand {band} -> {it['sizeBand']}"
        it["entranceCount"] = (it.get("entranceCount") or 1) + 1
        return f"entranceCount {it['entranceCount'] - 1} -> {it['entranceCount']}"
    if step == 1:
        it["exteriorShell"] = not it.get("exteriorShell")
        return f"exteriorShell -> {it['exteriorShell']}"
    return None


FACT_STEPS = 2
# Where the varied facts are written back, so the pass is idempotent and the
# review can see which places were made different on purpose.
FACTS_VARIED_KEY = "factsVariedForVariety"


def vary_facts_for_sameness(records: list[dict],
                            rounds: int = 24) -> tuple[dict[str, list[str]], list[tuple[str, str, int]]]:
    """Clear §48 rule 1 for good: defaults first, then one fact at a time.

    Each round re-runs the defaults pass; whatever still ties has a fact varied
    on the higher-sorting id of the pair (the one that already moved), and the
    record is re-derived from its new facts. A record that has spent both of
    its fact steps is left alone and the OTHER end of the pair moves instead,
    so a record in a dense cluster cannot be bumped over and over. Returns
    {place id: [facts changed]} and whatever pairs survive."""
    by_id = {r["id"]: r for r in records}
    # The variation is RECORDED ON THE RECORD, not just counted here: without
    # it a second run would bump the same delve a second time and the pass
    # would not be idempotent. It is also the review's list.
    varied: dict[str, list[str]] = {
        r["id"]: list((r.get("interior") or {}).get(FACTS_VARIED_KEY) or [])
        for r in records if (r.get("interior") or {}).get(FACTS_VARIED_KEY)}
    spent: Counter = Counter({rid: len(v) for rid, v in varied.items()})
    vary_for_sameness(records)
    pairs = sameness_pairs(records)
    for _ in range(rounds):
        if not pairs:
            break
        moved = False
        touched: set[str] = set()
        for a, b, _n in pairs:
            # Only the HIGHER-sorting id moves (owner ruling): moving both ends
            # of a pair of identical records by the same deterministic ladder
            # leaves them identical, which is how the first attempt stalled.
            for rid in (max(a, b), min(a, b)):
                if rid in touched or spent[rid] >= FACT_STEPS:
                    continue
                change = vary_fact(by_id[rid], spent[rid])
                if change is None:
                    continue
                spent[rid] += 1
                touched.add(rid)
                varied.setdefault(rid, []).append(change)
                by_id[rid]["interior"][FACTS_VARIED_KEY] = list(varied[rid])
                refresh_record(by_id[rid])
                moved = True
                break
        if not moved:
            break
        vary_for_sameness(records)
        pairs = sameness_pairs(records)
    return varied, pairs


# --- CLI -------------------------------------------------------------------

def run(apply: bool, refresh: str | None = None) -> int:
    region_files = catalogue.load_region_files()
    records = [r for rf in region_files for r in rf.places]
    counts: Counter = Counter()
    if refresh:
        wanted = None if refresh.strip().lower() == "all" else {
            rid.strip() for rid in refresh.replace(",", " ").split() if rid.strip()}
        touched = 0
        for rec in records:
            if wanted is not None and rec["id"] not in wanted:
                continue
            if refresh_record(rec):
                touched += 1
        print(f"refreshed {touched} records from their facts")
    for rec in records:
        for key in fill_record(rec):
            counts[key] += 1
    before = len(sameness_pairs(records))
    varied, remaining = vary_facts_for_sameness(records)
    after = len(remaining)
    if varied:
        print(f"facts varied on {len(varied)} records:")
        for rid in sorted(varied):
            print(f"  {rid}: {'; '.join(varied[rid])}")

    rooms_by_family: dict[str, Counter] = {}
    for rec in records:
        it = rec.get("interior") or {}
        if it.get("kind") in catalogue.DUNGEON_KINDS:
            rooms_by_family.setdefault(it["family"], Counter()).update(it.get("roomFunctions") or ())

    print("filled:")
    for key, n in sorted(counts.items()):
        print(f"  {key}: {n}")
    print(f"sameness pairs: before {before}, after {after}")
    for a, b, agree in remaining[:20]:
        print(f"  UNCLEARED {a} / {b} agree on {agree} axes")
    print("rooms by family:")
    for fam in sorted(rooms_by_family):
        top = ", ".join(f"{r}×{n}" for r, n in rooms_by_family[fam].most_common())
        print(f"  {fam}: {top}")

    if apply:
        for rf in region_files:
            versions = [r["schemaVersion"] for r in rf.places if isinstance(r.get("schemaVersion"), int)]
            catalogue.dump_json(rf.path, {
                "schemaVersion": max(versions) if versions else catalogue.PLACES_SCHEMA_VERSION,
                "region": rf.region, "seed": rf.seed, "places": rf.places,
            })
        print(f"applied to {len(region_files)} region files")
    return 0


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--report", action="store_true")
    ap.add_argument("--refresh", metavar="IDS",
                    help="re-derive the promises of these place ids (or 'all') from their "
                         "facts, overwriting: use after a fact changes")
    args = ap.parse_args(argv)
    if not (args.apply or args.report):
        ap.error("pass --apply or --report")
    return run(args.apply, args.refresh)


if __name__ == "__main__":
    sys.exit(main())
