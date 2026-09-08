"""Referential prose contract for catalogue records and settlement blueprints.

Names in prose are promises.  This lint resolves closed world vocabularies and
requires the record that says the name to carry the corresponding typed link.
It never requires a linked thing to be repeated in prose; reverse checking only
rejects a link that contradicts the registry (unknown id or wrong link class).

Run from ``tooling/world-generation``::

    python3 -m worldgen.prose_links
"""

from __future__ import annotations

import json
import re
import sys
from bisect import bisect_right
from collections import Counter
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from . import catalogue, lint_prose

REGISTRIES = catalogue.REPO_ROOT / "world" / "sources" / "registries"
ROUTES = catalogue.REPO_ROOT / "world" / "sources" / "routes" / "registry.json"
BLUEPRINTS = catalogue.REPO_ROOT / "world" / "sources" / "blueprints"
DEBT_MANIFEST = catalogue.REPO_ROOT / "world" / "sources" / "sites" / "prose-link-debt.json"

# The user-facing link names. questRef is explicit even though the B9b summary
# accidentally omitted it from its enumerated list: quest titles are one of its
# named closed vocabularies and cannot be protected without a quest link class.
REF_FIELD = {
    "quest": "questRef", "npc": "occupantRef", "place": "placeRef",
    "route": "routeRef", "service": "serviceRef", "item": "itemRef",
    "faction": "factionRef", "socket": "socketRef",
}
SEVERITY = {kind: ("warn" if kind == "item" else "hard") for kind in REF_FIELD}


@dataclass(frozen=True)
class Entity:
    kind: str
    id: str
    name: str


@dataclass(frozen=True)
class Finding:
    severity: str
    record_id: str
    field: str
    entity_class: str
    entity_id: str
    name: str
    message: str

    @property
    def key(self) -> str:
        return "|".join((self.record_id, self.field, self.entity_class, self.entity_id))


@dataclass
class Result:
    findings: list[Finding]
    mentions: Counter
    records: int = 0

    @property
    def hard(self) -> list[Finding]:
        return [finding for finding in self.findings if finding.severity == "hard"]

    @property
    def warnings(self) -> list[Finding]:
        return [finding for finding in self.findings if finding.severity == "warn"]

    def counts(self) -> dict[str, dict[str, int]]:
        return {
            kind: {
                "mentions": self.mentions[kind],
                "hard": sum(f.severity == "hard" and f.entity_class == kind for f in self.findings),
                "warn": sum(f.severity == "warn" and f.entity_class == kind for f in self.findings),
            }
            for kind in REF_FIELD
        }


@dataclass(frozen=True)
class EntityIndex:
    """The immutable lookup tables shared by every record in one lint pass.

    Building these inside ``check_record`` made the province-wide gate scan
    every entity and re-read both registry files once per catalogue record.
    The index contains exactly the same derived values, but computes them once
    for the batch (and remains an implementation detail of the checker).
    """

    entities: tuple[Entity, ...]
    known_by_kind: dict[str, frozenset[str]]
    known_kind_by_id: dict[str, str]
    route_aliases: dict[str, str]
    quest_codes: dict[str, str]


def _load_entries(path: Path, key: str = "entries") -> list[dict]:
    if not path.exists():
        return []
    return json.loads(path.read_text(encoding="utf-8")).get(key) or []


def load_entities(records: list[dict] | None = None,
                  blueprints: list[dict] | None = None) -> list[Entity]:
    records = records if records is not None else [
        place for region in catalogue.load_region_files() for place in region.places
        if place.get("status") not in {"cut", "deferred"}
    ]
    entities: list[Entity] = []
    for kind, filename in (("quest", "quests.json"), ("npc", "npcs.json"),
                           ("faction", "factions.json"), ("item", "items.json")):
        for entry in _load_entries(REGISTRIES / filename):
            if entry.get("id") and entry.get("name"):
                entities.append(Entity(kind, entry["id"], entry["name"]))
                entities.append(Entity(kind, entry["id"], entry["id"]))
    for place in records:
        if place.get("id") and place.get("name"):
            entities.append(Entity("place", place["id"], place["name"]))
            entities.append(Entity("place", place["id"], place["id"]))
    for route in _load_entries(ROUTES, "routes"):
        if route.get("id") and route.get("name"):
            entities.append(Entity("route", route["id"], route["name"]))
            entities.append(Entity("route", route["id"], route["id"]))
    entities += [Entity("service", service, service.replace("-", " "))
                 for service in sorted(catalogue.SERVICES)]

    if blueprints is None:
        blueprints = [json.loads(path.read_text(encoding="utf-8")).get("blueprint", {})
                      for path in sorted(BLUEPRINTS.glob("place.*.json"))]
    socket_ids: set[str] = set()
    for place in records:
        for values in (place.get("sockets") or {}).values():
            socket_ids.update(value for value in values or [] if isinstance(value, str))
    for bp in blueprints:
        for socket in bp.get("questSockets") or []:
            if isinstance(socket, dict):
                socket_ids.update(value for value in (socket.get("id"), socket.get("socketRef"))
                                  if isinstance(value, str))
    entities += [Entity("socket", socket_id, socket_id) for socket_id in sorted(socket_ids)]
    return entities


def _values(node, key: str):
    if isinstance(node, dict):
        for name, value in node.items():
            if name == key:
                if isinstance(value, list):
                    yield from (item for item in value if isinstance(item, str))
                elif isinstance(value, str):
                    yield value
            yield from _values(value, key)
    elif isinstance(node, list):
        for value in node:
            yield from _values(value, key)


def _entity_index(entities: list[Entity] | tuple[Entity, ...]) -> EntityIndex:
    entity_tuple = tuple(entities)
    known_by_kind = {
        kind: frozenset(entity.id for entity in entity_tuple if entity.kind == kind)
        for kind in REF_FIELD
    }
    route_aliases = {
        alias: route["id"]
        for route in _load_entries(ROUTES, "routes")
        for alias in route.get("aliases") or []
    }
    quest_codes = {
        str(entry.get("code") or "").casefold(): entry.get("id")
        for entry in _load_entries(REGISTRIES / "quests.json")
    }
    return EntityIndex(
        entity_tuple,
        known_by_kind,
        {entity.id: entity.kind for entity in entity_tuple},
        route_aliases,
        quest_codes,
    )


def typed_refs(record: dict, entities: list[Entity] | tuple[Entity, ...],
               index: EntityIndex | None = None) -> dict[str, set[str]]:
    index = index or _entity_index(entities)
    refs = {kind: set(_values(record, field)) for kind, field in REF_FIELD.items()}

    def add(value) -> None:
        """Add a value only after its structural field established typing."""
        if not isinstance(value, str):
            return
        kind = index.known_kind_by_id.get(value)
        if kind:
            refs[kind].add(value)
        elif value in index.route_aliases:
            refs["route"].add(index.route_aliases[value])
        elif value.startswith("place."):
            refs["place"].add(value)
        elif value.startswith("route."):
            refs["route"].add(value)
        elif value.startswith("quest."):
            refs["quest"].add(value)
        elif value.startswith("npc."):
            refs["npc"].add(value)
        elif value.startswith("faction."):
            refs["faction"].add(value)
        elif value.startswith("item."):
            refs["item"].add(value)
        elif value.startswith(("socket.", "scene.", "evidence.", "station.", "marks.")):
            refs["socket"].add(value)

    def add_tree(node) -> None:
        if isinstance(node, str):
            add(node)
        elif isinstance(node, dict):
            for value in node.values():
                add_tree(value)
        elif isinstance(node, list):
            for value in node:
                add_tree(value)

    # Existing domain-native schema fields are typed references too. Keep this
    # list explicit: scanning every string would let a prose id satisfy itself.
    add(record.get("id"))
    for key in ("relations", "relationsReserved", "sitingPrefs", "travelStation"):
        add_tree(record.get(key))
    add(record.get("ownerFaction"))
    add((record.get("hostility") or {}).get("owner"))
    for presence in record.get("factionPresence") or []:
        if isinstance(presence, dict):
            add(presence.get("factionRef"))
    contents = record.get("contents") or {}
    for slot in (contents.get("npcs") or []) + (contents.get("loot") or []):
        if isinstance(slot, dict):
            for key in ("registerRef", "faction", "factionRef"):
                add(slot.get(key))
    for socket in record.get("questSockets") or []:
        if isinstance(socket, dict):
            for key in ("id", "socketRef", "questId", "occupantRef", "npcRef"):
                add(socket.get(key))
    for key in ("travelServices", "networkTerminals", "approaches", "routes", "docks"):
        for item in record.get(key) or []:
            if isinstance(item, dict):
                for field in ("toPlaceId", "placeRef", "routeId", "routeRef", "socketRef"):
                    add(item.get(field))
    refs["service"].update(record.get("services") or [])
    # Catalogue quest ownership uses the authoring code (MQ01/LH19) by design;
    # it is a typed join once resolved through the quest registry.
    ownership = str((record.get("questHooks") or {}).get("tierOwnership") or "")
    refs["quest"].update(index.quest_codes[token.casefold()]
                         for token in re.findall(r"\b[A-Z]{2}\d{2}\b", ownership)
                         if token.casefold() in index.quest_codes)
    return refs


@lru_cache(maxsize=8)
def _mention_index(entities: tuple[Entity, ...]):
    counts = Counter((entity.kind, entity.name.casefold()) for entity in entities)
    by_name: dict[str, list[Entity]] = {}
    for entity in entities:
        if counts[entity.kind, entity.name.casefold()] == 1:
            by_name.setdefault(entity.name.casefold(), []).append(entity)
    trie: dict = {}
    for name in by_name:
        node = trie
        for char in name:
            node = node.setdefault(char, {})
        node[None] = name
    return trie, by_name


def _high_precision(entity: Entity) -> bool:
    """Exclude registry labels too ambiguous to assert from bare prose."""
    if entity.name == entity.id:
        return True
    words = entity.name.split()
    if entity.kind == "quest":
        return False  # titles are stock phrases; use the id or a [[quest:…]] marker
    if entity.kind == "place" and len(words) == 2 and words[0].casefold() == "the":
        return False  # The Break/The Roll/etc. collide heavily with ordinary phrases
    if entity.kind == "place" and len(words) == 1 and len(entity.name) <= 5:
        return False  # Spine/Thorn and similar short nouns are unsafe bare tokens
    if entity.kind == "faction" and len(words) == 1 and "-" not in entity.name:
        return False
    return True


def _mentioned_entities(text: str, entities: tuple[Entity, ...]):
    """Yield ``(entity, offset)`` for complete phrases in one linear pass."""
    trie, by_name = _mention_index(entities)
    folded = text.casefold()

    def wordish(char: str) -> bool:
        return char == "-" or char == "_" or char.isalnum()

    i = 0
    while i < len(folded):
        if i and wordish(folded[i - 1]):
            i += 1
            continue
        node = trie
        j = i
        match_name = None
        match_end = i
        while j < len(folded) and folded[j] in node:
            node = node[folded[j]]
            j += 1
            if None in node and (j == len(folded) or not wordish(folded[j])):
                match_name = node[None]
                match_end = j
        if match_name is None:
            i += 1
            continue
        matched = text[i:match_end]
        for entity in by_name[match_name]:
            if not _high_precision(entity):
                continue
            if (entity.kind in {"place", "faction", "npc"} and entity.name != entity.id
                    and matched != entity.name):
                continue  # proper-name vocabularies keep their authored case
            # Service vocabulary is intentionally terse and therefore
            # polysemous (court, stable, market). Count it only when the prose
            # describes availability, not when the noun is scenery or mood.
            if entity.kind == "service":
                context = text[max(0, i - 32):min(len(text), match_end + 32)]
                if not re.search(r"\b(?:service|services|offers?|provides?|available|hire|pay|buy|sell|"
                                 r"lodging|training|transport|use of|access to)\b", context, re.I):
                    continue
            yield entity, i
        i = match_end


def check_record(record: dict, prose: list[tuple[str, str]], entities: list[Entity],
                 index: EntityIndex | None = None) -> Result:
    index = index or _entity_index(entities)
    record_id = str(record.get("id") or "<record>")
    refs = typed_refs(record, entities, index)
    findings: list[Finding] = []
    mentions = Counter()
    entity_tuple = tuple(entities)
    seen_missing: set[tuple[str, str, str]] = set()
    # One catalogue record commonly has 10–20 prose leaves. Running the large
    # entity regex separately for every leaf dominated this gate. Scan one
    # joined string per record, with a separator wider than the service-context
    # window so neighbouring fields cannot influence one another, then map the
    # match offset back to its original field.
    separator = "\n" + ("\0" * 64) + "\n"
    starts: list[int] = []
    ends: list[int] = []
    fields: list[str] = []
    chunks: list[str] = []
    cursor = 0
    for field, text in prose:
        if chunks:
            chunks.append(separator)
            cursor += len(separator)
        starts.append(cursor)
        ends.append(cursor + len(text))
        fields.append(field)
        chunks.append(text)
        cursor += len(text)
    seen_mentions: set[tuple[str, str, str]] = set()
    for entity, offset in _mentioned_entities("".join(chunks), entity_tuple):
        field_i = bisect_right(starts, offset) - 1
        if field_i < 0 or offset >= ends[field_i]:
            continue
        field = fields[field_i]
        mention_key = (field, entity.kind, entity.id)
        if mention_key in seen_mentions:
            continue
        seen_mentions.add(mention_key)
        mentions[entity.kind] += 1
        if entity.id not in refs[entity.kind]:
            missing_key = (field, entity.kind, entity.id)
            if missing_key in seen_missing:
                continue
            seen_missing.add(missing_key)
            severity = SEVERITY[entity.kind]
            findings.append(Finding(
                severity, record_id, field, entity.kind, entity.id, entity.name,
                f"names {entity.name!r} but carries no {REF_FIELD[entity.kind]} {entity.id!r}",
            ))
    # Reverse direction: absence from prose is fine. A declared generic ref is
    # nevertheless contradictory when it cannot resolve in its closed domain.
    for kind, field in REF_FIELD.items():
        if kind == "item":  # Phase 13's item register is deliberately open.
            continue
        for ref in sorted(set(_values(record, field))):
            if ref not in index.known_by_kind[kind]:
                findings.append(Finding(
                    "hard", record_id, field, kind, ref, ref,
                    f"{field} {ref!r} does not resolve in the {kind} vocabulary",
                ))
    return Result(findings, mentions, 1)


def _blueprint_prose(bp: dict) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    for key, value in (bp.get("causalModel") or {}).items():
        if isinstance(value, str):
            out.append((f"causalModel.{key}", value))
    grounding = bp.get("scaleGrounding") or {}
    if isinstance(grounding.get("why"), str):
        out.append(("scaleGrounding.why", grounding["why"]))
    for key in ("districts", "parcels", "landmarks", "docks", "combatSpaces",
                "questSockets", "variants", "travelServices", "routes", "canals",
                "boardwalks", "fences", "approaches", "networkTerminals"):
        for i, item in enumerate(bp.get(key) or []):
            if not isinstance(item, dict):
                continue
            for field in ("notes", "orientationWhy", "why", "rejectedBecause", "ambience",
                          "abutsWhy", "worksWithWhy", "sequence", "wayfinding"):
                value = item.get(field)
                if isinstance(value, str):
                    out.append((f"{key}[{i}].{field}", value))
                elif field == "why" and isinstance(value, dict):
                    out.extend((f"{key}[{i}].why.{subkey}", text) for subkey, text in value.items()
                               if isinstance(text, str))
            for j, purpose in enumerate(item.get("playerPurpose") or []):
                if isinstance(purpose, dict) and isinstance(purpose.get("note"), str):
                    out.append((f"{key}[{i}].playerPurpose[{j}].note", purpose["note"]))
    return out


def check_all(records: list[dict] | None = None, blueprints: list[dict] | None = None) -> Result:
    records = records if records is not None else [
        place for region in catalogue.load_region_files() for place in region.places
        if place.get("status") not in {"cut", "deferred"}
    ]
    if blueprints is None:
        blueprints = [json.loads(path.read_text(encoding="utf-8")).get("blueprint", {})
                      for path in sorted(BLUEPRINTS.glob("place.*.json"))]
    entities = load_entities(records, blueprints)
    index = _entity_index(entities)
    result = Result([], Counter(), 0)
    for record in records:
        current = check_record(record, list(lint_prose.iter_catalogue_prose(record)), entities, index)
        result.findings.extend(current.findings)
        result.mentions.update(current.mentions)
        result.records += 1
    for bp in blueprints:
        current = check_record(bp, _blueprint_prose(bp), entities, index)
        result.findings.extend(current.findings)
        result.mentions.update(current.mentions)
        result.records += 1
    return result


@lru_cache(maxsize=1)
def _live_entities() -> tuple[Entity, ...]:
    return tuple(load_entities())


@lru_cache(maxsize=1)
def _live_entity_index() -> EntityIndex:
    return _entity_index(_live_entities())


def check_blueprint(bp: dict) -> list[str]:
    """Blueprint validator hook: only new HARD debt blocks existing records."""
    entities = _live_entities()
    result = check_record(bp, _blueprint_prose(bp), list(entities), _live_entity_index())
    return [f"{finding.record_id}: referential prose: {finding.message}"
            for finding in new_hard_debt(result)]


def load_debt(path: Path = DEBT_MANIFEST) -> set[str]:
    if not path.exists():
        return set()
    return {row["key"] for row in json.loads(path.read_text(encoding="utf-8")).get("rows", [])}


def new_hard_debt(result: Result, path: Path = DEBT_MANIFEST) -> list[Finding]:
    """Return only HARD misses not recorded by the reviewed debt manifest."""
    baseline = load_debt(path)
    return [finding for finding in result.hard if finding.key not in baseline]


def debt_document(result: Result) -> dict:
    hard = sorted(result.hard, key=lambda finding: finding.key)
    return {
        "schemaVersion": 1,
        "_": ("Reviewed Phase 11 B9b referential-prose debt. The gate permits these exact "
              "record/field/entity joins while repairs land; resolved rows may disappear, and "
              "every new row fails. Items remain WARN until the Phase 13 register closes."),
        "counts": dict(sorted(Counter(f.entity_class for f in hard).items())),
        # key is deliberately human-readable: record | prose field | class | id.
        # Keeping one canonical string also makes review diffs pleasantly small.
        "rows": [{"key": finding.key} for finding in hard],
    }


def main() -> int:
    result = check_all()
    print(f"{result.records} records; " + ", ".join(
        f"{kind} {counts['mentions']} mentions/{counts['hard']} hard/{counts['warn']} warn"
        for kind, counts in result.counts().items()))
    fresh = new_hard_debt(result)
    print(f"reviewed hard debt {len(result.hard) - len(fresh)}; NEW hard debt {len(fresh)}")
    for finding in result.findings[:200]:
        print(f"{finding.severity.upper()} {finding.record_id} {finding.field}: {finding.message}")
    return 1 if fresh else 0


if __name__ == "__main__":
    sys.exit(main())
