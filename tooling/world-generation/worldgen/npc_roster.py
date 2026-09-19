"""Generate the NPC roster from the catalogue's `notableNpcSlots` (92 84).

Every live place record's slot prose is a post somebody holds. This module
turns each post into an `npc.*` record with an identity — id, name, name
form, race, sex, faction, home, role — and the typed empty fields Phase 10c
extends. Nothing here is hand-written: re-running it reproduces the file
byte for byte (standard 6), so a fix is a change to a rule or a pool, never
an edit to `npcs.json`.

    python3 -m worldgen.npc_roster            # report, no write
    python3 -m worldgen.npc_roster --apply    # rewrite the registry
    python3 -m worldgen.npc_roster --check    # every rule in 92 84 holds

The rule, in order (92 84; mining 16g-mining.md 3):

  1. Scope    every record with status not in {cut, deferred}, every entry of
              notableNpcSlots. Id: npc.<region>.<place-slug>.<slot-slug>.
  2. Cast     the 11 slots the cast fills verbatim or near-verbatim take the
              cast member's identity (CAST_JOIN below, from mining 3.1/3.2).
              A cast member already in the registry keeps their id: never a
              second identity for one person.
  3. Race     seeded by the id; drawn from population-priors.json for the
              record's zone, restricted by the record's `culture` and
              overridden by any race word the slot text names.
  4. Sex      even by the same seed, unless the slot text fixes it.
  5. Name     by form (name_forms.py), with the caps of quests 35 54
              enforced mechanically: at most a third of a region's roster
              Verb-the-Noun, one imagery word per place, no name twice in
              the province, no name equal to a place name.
  6. Faction  the matching contents.npcs[] slot's faction, else the record's
              ownerFaction, else [].

Zones. `population-priors.json` has seven zones and a `cultureZoneMap` that
covers five of the eight catalogue regions. The remaining three are mapped
to the zone whose demography the lore gives them: saxhleel-coast -> archon
(the Argonian-settled coast the zone is named for), naga-kur-deeps ->
helstrom (deep interior, near-wholly Saxhleel), pirate-freeholds -> soulrest
(the trade coast its crews work). Recorded here because the priors file
cannot express it.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

from . import name_forms as nf

REPO_ROOT = Path(__file__).resolve().parents[3]
CATALOGUE_DIR = REPO_ROOT / "world" / "sources" / "catalogue"
PRIORS = REPO_ROOT / "world" / "sources" / "demographics" / "population-priors.json"
REGISTRY = REPO_ROOT / "world" / "sources" / "registries" / "npcs.json"

DEAD_STATUSES = {"cut", "deferred"}
SCHEMA_VERSION = 2

REGISTRY_NOTE = (
    "GENERATED. `python3 -m worldgen.npc_roster --apply` writes every entry "
    "from the catalogue's notableNpcSlots (92 84); never hand-write or hand-edit "
    "one — change the rule or the pools in worldgen/name_forms.py and re-run. "
    "status: 'generated' is a slot-derived person; 'cast' is a written cast "
    "member joined to their slot (docs/quests/36-cast-roster.md)."
)

RACES = ("argonian", "dunmer", "imperial", "khajiit", "nord", "bosmer",
         "altmer", "redguard", "breton", "orc")

#: word in the slot text -> the race it forces.
RACE_WORDS = {
    "dunmer": "dunmer", "dark elf": "dunmer", "velothi": "dunmer",
    "imperial": "imperial", "cyrodilic": "imperial", "nibenese": "imperial",
    "khajiit": "khajiit", "nord": "nord", "breton": "breton",
    "bosmer": "bosmer", "wood elf": "bosmer", "altmer": "altmer",
    "high elf": "altmer", "orc": "orc", "orsimer": "orc",
    "redguard": "redguard", "argonian": "argonian", "saxhleel": "argonian",
    "naga": "argonian",
}

CULTURE_RACE = {"argonian": "argonian", "dunmer": "dunmer",
                "imperial": "imperial", "khajiit": "khajiit"}

REGION_ZONE = {
    "dunmer-north": ("stormhold", "thorn"),
    "imperial-fringe": ("gideon",),
    "mercantile-coast": ("soulrest", "blackrose-lilmoth"),
    "hist-heartland": ("helstrom",),
    "imperial-penal-south": ("blackrose-lilmoth",),
    "saxhleel-coast": ("archon",),
    "naga-kur-deeps": ("helstrom",),
    "pirate-freeholds": ("soulrest",),
}

#: which translated idiom a region's Argonian working names take (mining 3.4).
REGION_IDIOM = {
    "hist-heartland": "hist-heartland",
    "naga-kur-deeps": "hist-heartland",
    "saxhleel-coast": "saxhleel-coast",
    "dunmer-north": "saxhleel-coast",
    "pirate-freeholds": "saxhleel-coast",
    "mercantile-coast": "mercantile-coast",
    "imperial-fringe": "mercantile-coast",
    "imperial-penal-south": "mercantile-coast",
}

#: regions whose Argonian default is the untranslated Jel name.
JEL_DEFAULT_REGIONS = {"hist-heartland", "naga-kur-deeps", "saxhleel-coast",
                       "dunmer-north"}

FEMALE_WORDS = (" she ", " she,", " her ", " her,", "herself", " woman",
                " mother", " daughter", " sister", " wife", " widow",
                " matron", " dame", "granddaughter", "grandmother",
                "-woman", "abbess", "priestess")
MALE_WORDS = (" he ", " he,", " his ", " his,", "himself", " man ", " man,",
              " father", " son ", " son,", " brother", " husband",
              " widower", "grandson", "grandfather", "-man ", "-man,")

#: role words in the slot text -> the contents.npcs[] role they answer to.
ROLE_WORDS = {
    "quest-giver": ("who wants", "who will pay", "who needs", "asks you",
                    "hires"),
    "priest": ("priest", "nisswo", "tree-minder", "shrine", "hist-minder",
               "grave", "ordinator", "sap-speaker", "root-herald"),
    "merchant": ("merchant", "trader", "factor", "broker", "seller",
                 "fence", "prices", "underwriter", "chandler", "pedlar"),
    "official": ("magistrate", "vicecanon", "official", "clerk", "reader",
                 "registrar", "overseer", "agent", "delegate", "advocate",
                 "canon", "keeper of the", "assessor", "toll"),
    "captive": ("captive", "prisoner", "bonded", "held", "hostage"),
    "keeper": ("keeper", "caretaker", "warden", "minder", "steward",
               "custodian"),
    "lieutenant": ("lieutenant", "second", "captain", "sergeant", "boss",
                   "head", "chief", "elder", "leader"),
    "hermit": ("hermit", "recluse", "lone", "only person", "last one",
               "who stayed"),
}

#: slot words that license an epithet (criminals, sailors, soldiers).
EPITHET_WORDS = ("pirate", "smuggler", "thief", "fence", "bandit", "raider",
                 "crew", "sailor", "boatman", "captain", "mate", "soldier",
                 "legionary", "guard", "knife", "cutthroat", "killer",
                 "wrecker", "poacher")

#: slot words that license a chosen name (a claim on a new identity).
CHOSEN_WORDS = ("freed", "free of", "escaped", "convert", "returned",
                "lukiul", "ex-", "former", "runaway", "debt-free")

STOPWORDS = {"the", "a", "an", "of", "this", "that", "and", "in", "at",
             "on", "for", "to", "with", "their", "his", "her", "its",
             "one", "who", "which", "whose"}

# --------------------------------------------------------------- cast join

#: (place id, exact slot text) -> cast identity. From 16g-mining.md 3.1/3.2;
#: 11 slots, the only ones the written cast fills. `registryId` is set where
#: the person is already an entry (the two principals); otherwise the slot's
#: own id is used and the status is "cast".
CAST_JOIN: dict[tuple[str, str], dict] = {
    ("place.hist-heartland.helstrom", "the grove's senior tree-minder"): {
        "name": "Kaska-Meen", "form": "jel", "race": "argonian", "sex": "female",
        "source": "docs/quests/36-cast-roster.md:115"},
    ("place.hist-heartland.cult-raid-camp-unbound",
     "the camp's speaker, who does not give a name"): {
        "name": "Opens-the-Last-Door", "form": "translated", "race": "argonian",
        "sex": "male", "source": "docs/quests/36-cast-roster.md:147"},
    ("place.dunmer-north.stormhold", "the Conclave of Baal's reader"): {
        "name": "Brother Iulus Cato", "form": "foreign", "race": "imperial",
        "sex": "male", "source": "docs/quests/36-cast-roster.md:56"},
    ("place.imperial-fringe.gideon", "the Collections chapter-agent"): {
        "name": "Curator Aulus Pell", "form": "foreign", "race": "imperial",
        "sex": "male", "source": "docs/quests/36-cast-roster.md:56"},
    ("place.hist-heartland.nisswo-rest-house-interior", "the nisswo of this house"): {
        "name": "Little-Bell", "form": "translated", "race": "argonian",
        "sex": "female", "source": "docs/quests/36-cast-roster.md:56"},
    ("place.hist-heartland.greenspring", "the root-herald who trades with Helstrom"): {
        "name": "Root-Herald Ixo-Vaal", "form": "jel", "race": "argonian",
        "sex": "male", "source": "docs/quests/36-cast-roster.md:56"},
    ("place.naga-kur-deeps.deepmire-refuge",
     "Old Nusa, who is bored of Umbriel and will say so"): {
        "name": "Old Nusa", "form": "epithet", "race": "argonian",
        "sex": "female", "source": "docs/quests/36-cast-roster.md:56"},
    ("place.hist-heartland.rootworm-station-helstrom", "the Waykeeper who prices the line"): {
        "name": "Handler Ki-Ossa", "form": "jel", "race": "argonian",
        "sex": "female", "source": "docs/quests/36-cast-roster.md:56"},
    ("place.imperial-penal-south.blackrose-prison", "third-generation Rose family head"): {
        "name": "Third-Born Xeekh", "form": "epithet", "race": "argonian",
        "sex": "male", "source": "docs/quests/36-cast-roster.md:56"},
    ("place.imperial-penal-south.blackrose-prison",
     "Chainbreaker envoy camped on the causeway"): {
        "name": "Ussa-Rekh", "form": "jel", "race": "argonian", "sex": "male",
        "source": "docs/quests/36-cast-roster.md:56"},
    ("place.dunmer-north.andalen-plantation",
     "the field-holder who takes the crop and will not go in"): {
        "name": "Field-Holder Uxa-Meen", "form": "jel", "race": "argonian",
        "sex": "female", "source": "docs/quests/36-cast-roster.md:56"},
}

#: Cast members the mining pass found NO slot for. Not invented here: they
#: are reported for Fable, who decides whether a slot is owed.
CAST_WITHOUT_SLOT = (
    "Nesh-Deeka", "Holds-the-Reed", "Never-Writes-Twice", "Spills-The-Ink",
    "Ei-Tuja", "Sings-Over-Stone", "Cuts-the-Old-Knot", "Walks-Against-Current",
    "Ahnjazzi", "The Last Warden", "Ux-Teeba the Last", "Ohl-Katta", "Rasha",
    "Iiran-Vekh", "Deep-In-Her-Cups", "the Eel-Keeper", "Tsuun-Wai", "Silt",
    "Sails-By-Morning", "Ka-Deelith Ushu", "Halvar the Damp", "Yeel-Nakka",
    "Xul-Nasha", "Tarien Loryn", "Zaxeel of the Jade Mask", "Hana-Vei",
    "Sap-Speaker Miril-Tei", "Tuwul of Gloommire", "Route-Keeper Sesha-Ku",
    "Captain Salt Ma'ren", "the toll-holder at the Chain", "Anseia Martius",
    "Hisska", "Advocate Oshu-Kai", "Never-Sold", "Grave-Singer Ossu",
    "Vicecanon Neetra-Sei", "Andas Verano", "Keeps-The-Count", "Still-Wet",
    "Neexa-Tul", "Waykeeper Tuxo", "Dravyna Andalen", "Oleen-Tei",
    "the Wet Consort",
)

CAST_NAMES = {v["name"] for v in CAST_JOIN.values()} | set(CAST_WITHOUT_SLOT)

#: Cast already in the registry who hold no slot. Their entries are carried
#: forward (same ids, their authored fields merged) so the rewrite never
#: drops a written person; slotIndex is null because they have no post.
PRINCIPALS_WITHOUT_SLOT = {
    "npc.holds-the-reed": {
        "name": "Holds-the-Reed", "race": "argonian", "sex": "male",
        "nameForm": "chosen", "placeId": "place.dunmer-north.stormhold",
        "role": "Director of the Veiled Reed; no catalogue slot (16g-mining 3.1)"},
    "npc.nesh-deeka": {
        "name": "Nesh-Deeka", "race": "argonian", "sex": "female",
        "nameForm": "jel", "placeId": "place.pirate-freeholds.alten-corimont",
        "role": "Veiled Reed field handler; no catalogue slot (16g-mining 3.1)"},
}

ASSET_AVAILABILITY = {
    "argonian": ("vanilla Argonian race (meshes/actors/character) with vanilla "
                 "humanoid animation sets"),
}
ASSET_NOTES = ("Playable-race body; equipment and face variation only. "
               "No new rig or clips.")


# ------------------------------------------------------------------- helpers

def _seed(*parts: str) -> int:
    return int(hashlib.sha256("|".join(parts).encode()).hexdigest()[:16], 16)


def _unit(*parts: str) -> float:
    return _seed(*parts) / float(1 << 64)


def slot_slug(text: str) -> str:
    """A deterministic <=4-word kebab slug of the slot's noun phrase."""
    head = re.split(r",| who | which | that | whose ", text.strip(), maxsplit=1)[0]
    words = re.findall(r"[a-z0-9]+", head.lower())
    kept = [w for w in words if w not in STOPWORDS]
    if not kept:
        kept = words or ["npc"]
    return "-".join(kept[:4])


def load_places() -> list[dict]:
    places: list[dict] = []
    for path in sorted(CATALOGUE_DIR.glob("places-*.json")):
        places.extend(json.loads(path.read_text())["places"])
    return places


def live_places(places: list[dict] | None = None) -> list[dict]:
    places = places if places is not None else load_places()
    return [p for p in places if p.get("status") not in DEAD_STATUSES]


def region_of(place_id: str) -> str:
    return place_id.split(".")[1]


def place_slug(place_id: str) -> str:
    return place_id.split(".", 2)[2]


def zone_for(place: dict, priors: dict) -> str:
    region = region_of(place["id"])
    mapped = priors.get("cultureZoneMap", {}).get(region)
    if mapped:
        zones = (mapped,) if isinstance(mapped, str) else tuple(mapped)
    else:
        zones = REGION_ZONE[region]
    if len(zones) == 1:
        return zones[0]
    return zones[int(_unit("zone", place["id"]) * len(zones)) % len(zones)]


def _race_word(text: str) -> str | None:
    low = text.lower()
    for word, race in RACE_WORDS.items():
        if word in low:
            return race
    return None


def pick_race(place: dict, slot_text: str, npc_id: str, priors: dict) -> str:
    forced = _race_word(slot_text)
    if forced:
        return forced
    culture = place.get("culture")
    if culture in CULTURE_RACE:
        return CULTURE_RACE[culture]
    shares = priors["zones"][zone_for(place, priors)]
    keys = [r for r in RACES if r in shares]
    total = sum(shares[k] for k in keys)
    draw = _unit("race", npc_id) * total
    acc = 0.0
    for key in keys:
        acc += shares[key]
        if draw < acc:
            return key
    return keys[-1]


def pick_sex(slot_text: str, npc_id: str) -> str:
    padded = f" {slot_text.lower()} "
    female = any(w in padded for w in FEMALE_WORDS)
    male = any(w in padded for w in MALE_WORDS)
    if female and not male:
        return "female"
    if male and not female:
        return "male"
    return "female" if _unit("sex", npc_id) < 0.5 else "male"


def pick_form(place: dict, slot_text: str, race: str) -> str:
    low = slot_text.lower()
    if race != "argonian":
        return "foreign"
    if any(w in low for w in CHOSEN_WORDS):
        return "chosen"
    if any(w in low for w in EPITHET_WORDS):
        return "epithet"
    region = region_of(place["id"])
    outward = any(w in low for w in ROLE_WORDS["official"] + ROLE_WORDS["merchant"])
    if region not in JEL_DEFAULT_REGIONS or outward:
        return "translated"
    return "jel"


def slot_role_key(slot_text: str) -> str | None:
    low = slot_text.lower()
    for key, words in ROLE_WORDS.items():
        if any(w in low for w in words):
            return key
    return None


def pick_factions(place: dict, slot_text: str) -> list[str]:
    key = slot_role_key(slot_text)
    slots = (place.get("contents") or {}).get("npcs") or []
    if key:
        for entry in slots:
            if entry.get("role") == key and entry.get("faction"):
                return [entry["faction"]]
    if place.get("ownerFaction"):
        return [place["ownerFaction"]]
    return []


def imagery_of(name: str) -> set[str]:
    low = name.lower()
    return {w for w in nf.IMAGERY_WORDS if w in low}


# ------------------------------------------------------------------- naming

class NamePicker:
    """Walks the pools, honouring the caps, deterministically."""

    def __init__(self, place_names: set[str]) -> None:
        self.place_names = {n.lower() for n in place_names}
        self.used: set[str] = set()
        self.place_imagery: dict[str, set[str]] = {}
        self.region_counts: dict[str, dict[str, int]] = {}
        self.region_total: dict[str, int] = {}
        self.repairs = 0
        self._pools = {
            "jel": nf.jel_pool(),
            "epithet": nf.EPITHET_POOL,
            "chosen": nf.chosen_pool(),
        }
        # Latinate, Velothi, Nordic and the rest are sexed given names: a
        # roster that hands "Rufus" to a woman is a naming defect, so those
        # pools are keyed <race>:<sex>.
        for sex in ("female", "male"):
            self._pools[f"imperial:{sex}"] = nf.imperial_pool(sex)
            self._pools[f"dunmer:{sex}"] = nf.dunmer_pool(sex)
            self._pools[f"khajiit:{sex}"] = nf.KHAJIIT_BY_SEX[sex]
            for race, by_sex in nf.OTHER_POOLS.items():
                self._pools[f"{race}:{sex}"] = by_sex[sex]
        for idiom in nf.TRANSLATED_IDIOMS:
            self._pools[f"translated:{idiom}"] = nf.translated_pool(idiom)

    def _pool_key(self, form: str, race: str, region: str, sex: str) -> str:
        if form == "foreign":
            return f"{race}:{sex}"
        if form == "translated":
            return f"translated:{REGION_IDIOM[region]}"
        return form

    def translated_allowed(self, region: str, region_slots: int) -> bool:
        used = self.region_counts.get(region, {}).get("translated", 0)
        return used + 1 <= region_slots // 3

    def take(self, form: str, race: str, region: str, place_id: str,
             npc_id: str, region_slots: int, sex: str = "female") -> tuple[str, str]:
        """Return (name, form), repairing a blocked pick by taking the next item."""
        if form == "translated" and not self.translated_allowed(region, region_slots):
            self.repairs += 1
            form = "jel" if race == "argonian" else "foreign"
        key = self._pool_key(form, race, region, sex)
        pool = self._pools[key]
        start = _seed("name", npc_id) % len(pool)
        taken = self.place_imagery.setdefault(place_id, set())
        for step in range(len(pool)):
            name = pool[(start + step) % len(pool)]
            if name in self.used or name in CAST_NAMES:
                continue
            if name.lower() in self.place_names:
                continue
            if imagery_of(name) & taken:
                continue
            if step:
                self.repairs += 1
            self.used.add(name)
            taken |= imagery_of(name)
            counts = self.region_counts.setdefault(region, {})
            counts[form] = counts.get(form, 0) + 1
            return name, form
        raise RuntimeError(f"name pool '{key}' exhausted for {npc_id}")


# ---------------------------------------------------------------- generation

def _slot_ids(place: dict) -> list[str]:
    """Slot ids for one place, deduped within the place with -2, -3."""
    region, slug = region_of(place["id"]), place_slug(place["id"])
    seen: dict[str, int] = {}
    out: list[str] = []
    for text in place.get("notableNpcSlots") or []:
        base = slot_slug(text)
        seen[base] = seen.get(base, 0) + 1
        suffix = "" if seen[base] == 1 else f"-{seen[base]}"
        out.append(f"npc.{region}.{slug}.{base}{suffix}")
    return out


def _existing_cast_ids() -> dict[str, str]:
    """name -> id for cast already in the registry (the two principals)."""
    if not REGISTRY.exists():
        return {}
    data = json.loads(REGISTRY.read_text())
    return {e["name"]: e["id"] for e in data.get("entries", [])
            if e.get("status") in ("cast", "derived")}


def _existing_entries() -> dict[str, dict]:
    if not REGISTRY.exists():
        return {}
    return {e["id"]: e for e in json.loads(REGISTRY.read_text()).get("entries", [])}


def generate(places: list[dict] | None = None) -> tuple[list[dict], dict]:
    places = live_places(places)
    priors = json.loads(PRIORS.read_text())
    place_names = {p["name"] for p in load_places()}
    picker = NamePicker(place_names)
    existing_ids = _existing_cast_ids()
    existing = _existing_entries()

    region_slots: dict[str, int] = {}
    for place in places:
        region_slots[region_of(place["id"])] = region_slots.get(
            region_of(place["id"]), 0) + len(place.get("notableNpcSlots") or [])

    entries: list[dict] = []
    cast_joins: list[str] = []
    for place in sorted(places, key=lambda p: p["id"]):
        slots = place.get("notableNpcSlots") or []
        ids = _slot_ids(place)
        region = region_of(place["id"])
        for index, (text, npc_id) in enumerate(zip(slots, ids)):
            cast = CAST_JOIN.get((place["id"], text))
            if cast:
                name = cast["name"]
                entry_id = existing_ids.get(name, npc_id)
                race, sex, form = cast["race"], cast["sex"], cast["form"]
                status, sources = "cast", [cast["source"]]
                picker.used.add(name)
                cast_joins.append(f"{name} -> {place['id']} :: {text}")
            else:
                race = pick_race(place, text, npc_id, priors)
                sex = pick_sex(text, npc_id)
                form = pick_form(place, text, race)
                name, form = picker.take(form, race, region, place["id"],
                                         npc_id, region_slots[region], sex)
                entry_id, status = npc_id, "generated"
                sources = [f"{place['id']} notableNpcSlots[{index}]"]
            prior = existing.get(entry_id, {})
            entry = {
                "id": entry_id,
                "name": name,
                "kind": prior.get("kind", "principal" if status == "cast" else "slot"),
                "nameForm": form,
                "race": race,
                "sex": sex,
                "factionIds": pick_factions(place, text),
                "home": {"placeId": place["id"], "slotIndex": index, "socketId": None},
                "role": text,
                "archetype": None,
                "statblock": None,
                "hostility": None,
                "fightFleeAlarm": None,
                "marks": [],
                "schedules": [],
                "patrols": [],
                "dialogueTopics": [],
                "services": [],
                "crime": None,
                "standing": None,
                "status": status,
                "sources": sorted(set(prior.get("sources", []) + sources)),
                "notes": prior.get("notes") or f"Holds the post: {text} ({place['name']}).",
                "assetAvailability": prior.get("assetAvailability") or {
                    "status": "vanilla",
                    "via": ASSET_AVAILABILITY.get(
                        race,
                        f"vanilla {race.capitalize()} race (meshes/actors/character) "
                        "with vanilla humanoid animation sets"),
                    "notes": ASSET_NOTES,
                },
            }
            entries.append(entry)

    for entry_id, spec in PRINCIPALS_WITHOUT_SLOT.items():
        if any(e["id"] == entry_id for e in entries):
            continue
        prior = existing.get(entry_id, {})
        entries.append({
            "id": entry_id,
            "name": spec["name"],
            "kind": prior.get("kind", "principal"),
            "nameForm": spec["nameForm"],
            "race": spec["race"],
            "sex": spec["sex"],
            "factionIds": prior.get("factionIds", []),
            "home": {"placeId": spec["placeId"], "slotIndex": None, "socketId": None},
            "role": spec["role"],
            "archetype": None, "statblock": None, "hostility": None,
            "fightFleeAlarm": None, "marks": [], "schedules": [], "patrols": [],
            "dialogueTopics": [], "services": [], "crime": None, "standing": None,
            "status": "cast",
            "sources": sorted(set(prior.get("sources", []) + ["docs/quests/36-cast-roster.md"])),
            "notes": prior.get("notes") or spec["role"],
            "assetAvailability": prior.get("assetAvailability") or {
                "status": "vanilla",
                "via": ASSET_AVAILABILITY["argonian"],
                "notes": ASSET_NOTES,
            },
        })
        picker.used.add(spec["name"])

    entries.sort(key=lambda e: e["id"])
    stats = {
        "total": len(entries),
        "castJoins": cast_joins,
        "repairs": picker.repairs,
        "byRegion": _count(entries, lambda e: region_of(e["home"]["placeId"])),
        "byRace": _count(entries, lambda e: e["race"]),
        "byForm": _count(entries, lambda e: e["nameForm"]),
        "bySex": _count(entries, lambda e: e["sex"]),
    }
    return entries, stats


def _count(entries, key) -> dict[str, int]:
    out: dict[str, int] = {}
    for e in entries:
        k = key(e)
        out[k] = out.get(k, 0) + 1
    return dict(sorted(out.items()))


def document(entries: list[dict]) -> dict:
    return {"schemaVersion": SCHEMA_VERSION, "domain": "npc",
            "_": REGISTRY_NOTE, "entries": entries}


def write(entries: list[dict]) -> None:
    REGISTRY.write_text(json.dumps(document(entries), indent=2) + "\n")


# -------------------------------------------------------------------- check

def check(places: list[dict] | None = None) -> list[str]:
    places_live = live_places(places)
    entries, stats = generate(places)
    problems: list[str] = []

    by_home = {}
    for e in entries:
        if e["home"]["slotIndex"] is None:
            continue
        by_home.setdefault((e["home"]["placeId"], e["home"]["slotIndex"]), []).append(e["id"])
    expected: set[tuple[str, int]] = set()
    live_ids = {p["id"] for p in places_live}
    for p in places_live:
        for i in range(len(p.get("notableNpcSlots") or [])):
            expected.add((p["id"], i))
    for key in sorted(expected - set(by_home)):
        problems.append(f"slot without a record: {key[0]}[{key[1]}]")
    for key, owners in sorted(by_home.items()):
        if key[0] not in live_ids:
            problems.append(f"record homed on a non-live place: {key[0]}")
        if len(owners) != 1:
            problems.append(f"slot {key[0]}[{key[1]}] has {len(owners)} records")

    names: dict[str, str] = {}
    place_names = {p["name"].lower() for p in load_places()}
    per_place_imagery: dict[str, set[str]] = {}
    per_region: dict[str, dict[str, int]] = {}
    for e in entries:
        if e["name"] in names and names[e["name"]] != e["id"]:
            problems.append(f"name '{e['name']}' used twice ({names[e['name']]}, {e['id']})")
        names[e["name"]] = e["id"]
        if e["name"].lower() in place_names:
            problems.append(f"name '{e['name']}' equals a place name ({e['id']})")
        place = e["home"]["placeId"]
        seen = per_place_imagery.setdefault(place, set())
        clash = imagery_of(e["name"]) & seen
        if clash and e["status"] != "cast":
            problems.append(f"imagery {sorted(clash)} repeats in {place} ({e['id']})")
        seen |= imagery_of(e["name"])
        region = region_of(place)
        counts = per_region.setdefault(region, {})
        counts[e["nameForm"]] = counts.get(e["nameForm"], 0) + 1
    for region, counts in sorted(per_region.items()):
        total = sum(counts.values())
        translated = counts.get("translated", 0)
        if translated * 3 > total:
            problems.append(
                f"{region}: {translated}/{total} translated Verb-the-Noun "
                "exceeds the one-third cap")

    cast_ids: dict[str, list[str]] = {}
    for e in entries:
        if e["status"] == "cast":
            cast_ids.setdefault(e["name"], []).append(e["id"])
    for name, got in sorted(cast_ids.items()):
        if len(got) > 1:
            problems.append(f"cast member '{name}' has {len(got)} identities: {got}")

    second, _ = generate(places)
    if json.dumps(second, sort_keys=False) != json.dumps(entries, sort_keys=False):
        problems.append("non-deterministic: two runs differ")

    if REGISTRY.exists():
        on_disk = json.loads(REGISTRY.read_text())
        if on_disk.get("entries") != entries:
            problems.append("npcs.json is stale — re-run with --apply")
    return problems


# --------------------------------------------------------------------- main

def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true", help="rewrite npcs.json")
    ap.add_argument("--check", action="store_true", help="validate the rule (92 84)")
    args = ap.parse_args(argv)

    if args.check:
        problems = check()
        for p in problems:
            print(f"FAIL {p}")
        print(f"{len(problems)} problem(s)")
        return 1 if problems else 0

    entries, stats = generate()
    if args.apply:
        write(entries)
        print(f"wrote {len(entries)} entries to {REGISTRY.relative_to(REPO_ROOT)}")
    print(json.dumps({k: v for k, v in stats.items() if k != "castJoins"}, indent=2))
    print(f"cast joins: {len(stats['castJoins'])}")
    for line in stats["castJoins"]:
        print(f"  {line}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
