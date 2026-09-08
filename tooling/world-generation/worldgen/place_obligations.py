"""One typed chain from a catalogue place to the finished world.

The catalogue has two different sorts of fields.  Provenance and plotting
mechanics explain how a record was obtained; delivery fields describe the
world the player must eventually receive.  This module makes that distinction
exhaustive and turns the latter into stable obligations.

Most obligations are derived from fields which already exist.  Qualitative
fields cannot be proved by a noun search, so an authored blueprint carries a
small ``macroEvidence`` index from source JSON paths to real blueprint object
ids.  It repeats no prose.  A design reviewer judges whether those links are
good; this module guarantees that none was omitted or linked to nothing.

Later compilers emit manifests of ``{obligationId, objectRefs}``.  The generic
manifest gate below is intentionally usable before Phases 12/13 exist, so
their contract is executable now rather than only promised in prose.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from dataclasses import dataclass
from typing import Iterable, Mapping

from . import blueprint_promises

SCHEMA_VERSION = 2
MANIFEST_SCHEMA_VERSION = 2
DELIVERY_OWNERS = {"phase-11-compiled", "phase-12", "phase-13", "quests"}
PHASE11_EXEMPLAR_PLACE_IDS = frozenset({
    "place.dunmer-north.mazzatun",
    "place.hist-heartland.nine-trunks",
    "place.hist-heartland.sap-tapping-licensed",
    "place.mercantile-coast.lilmoth",
    "place.naga-kur-deeps.wamasu-pond-adult",
})

# Every top-level catalogue field must be consciously classified.  This is a
# schema policy, not a second copy of 800 records.  Tests walk the live
# catalogue and make a newly introduced field fail until its owner classifies
# it here.
PROVENANCE_FIELDS = {
    "aliases", "confidence", "id", "name", "namingRule", "proseRefs", "provenance", "sources",
}
PLOT_FIELDS = {
    "candidatesConsidered", "complexityBudget", "complexityJustification",
    "deferralNote", "deferredFromStatus", "deferredWhy",
    "importanceTier", "plotFacts", "plotOverride", "position", "positionM",
    "promotedWhy", "reconciliation", "reconciliationNote", "scourSiteId",
    "sitingNote", "whySiteWon", "workflow",
}
DELIVERY_FIELDS = {
    "approachDanger", "assetGaps", "assetPlan", "authoredDangerProperty",
    "classification", "contents", "culture",
    "dangerTier", "deedCounterKeys", "densityLayer", "discovery", "effortToReach", "factionPresence",
    "entrance", "eraLayers", "heroHist", "hostility", "interior",
    "localStateVariants", "notableNpcSlots", "occupants", "ownerFaction",
    "playerPurpose", "questHooks", "relations", "relationsReserved",
    "rewardProfile", "rumourPoolKey", "season", "services", "sitingPrefs",
    "singularClaim", "sockets", "status", "strongholdCandidate", "terrainRequests", "travelStation", "traversalFallback",
    "traversalModes", "underwaterAccess", "vibe", "why",
}
FIELD_POLICY = {
    **{k: "provenance" for k in PROVENANCE_FIELDS},
    **{k: "plot" for k in PLOT_FIELDS},
    **{k: "delivery" for k in DELIVERY_FIELDS},
}

# These rich fields require an explicit reviewer-facing link.  The remaining
# delivery fields have structural resolvers below or in blueprint_promises.
QUALITATIVE_ROOTS = {
    "assetPlan", "contents", "discovery", "eraLayers", "hostility",
    "factionPresence", "notableNpcSlots", "playerPurpose", "questHooks", "relations", "rewardProfile", "season",
    "sitingPrefs", "status", "traversalModes", "underwaterAccess", "vibe",
}


@dataclass(frozen=True)
class Obligation:
    id: str
    placeId: str
    sourcePath: str
    kind: str
    requirement: dict
    phase11Evidence: tuple[str, ...]
    deliveryOwner: str

    def as_dict(self) -> dict:
        return {
            "id": self.id, "placeId": self.placeId, "sourcePath": self.sourcePath,
            "kind": self.kind, "requirement": self.requirement,
            "phase11Evidence": list(self.phase11Evidence),
            "deliveryOwner": self.deliveryOwner,
        }


def classify_record_fields(record: dict) -> list[str]:
    """Errors for catalogue fields not classified exactly once."""
    return [f"{record.get('id', '<unknown>')}: unclassified catalogue field {key!r}"
            for key in sorted(set(record) - set(FIELD_POLICY))]


def _stable_id(place_id: str, path: str, semantic_key: str = "") -> str:
    # Paths remain readable while a digest prevents punctuation/slug collisions.
    raw = f"{place_id}\0{path}\0{semantic_key}"
    digest = hashlib.sha256(raw.encode()).hexdigest()[:10]
    slug = place_id.rsplit(".", 1)[-1]
    label = path.replace("[]", "").replace(".", "-").replace("/", "-")
    return f"obligation.{slug}.{label}.{digest}"


def blueprint_object_registry(bp: dict) -> tuple[dict[str, dict[str, str]], list[str]]:
    """Index every addressable blueprint object with its concrete type and place.

    The recursive walk is deliberate: doors and quest evidence can live inside
    larger authored structures, but they are still real addressable objects.
    A string invented from the blueprint id is not an object and cannot enter
    this registry.
    """
    place_id = bp.get("id")
    registry: dict[str, dict[str, str]] = {}
    errors: list[str] = []

    def add(ref: str, kind: str) -> None:
        entry = {"kind": kind, "placeId": place_id}
        existing = registry.get(ref)
        if existing and existing["kind"] == "quest-socket-ref":
            registry[ref] = entry
        elif existing and kind == "quest-socket-ref":
            return
        elif existing and existing != entry:
            errors.append(f"{place_id}: object ref {ref!r} has conflicting types")
        else:
            registry[ref] = entry

    def walk(value, container: str) -> None:
        if isinstance(value, dict):
            if isinstance(value.get("id"), str):
                add(value["id"], value["id"].split(".", 1)[0])
            if isinstance(value.get("slotId"), str):
                add(value["slotId"], "occupant")
            if isinstance(value.get("socketRef"), str):
                add(value["socketRef"], "quest-socket-ref")
            for child in value.values():
                walk(child, container)
        elif isinstance(value, list):
            for child in value:
                walk(child, container)

    for key, value in bp.items():
        walk(value, key)
    for key in ("scaleGrounding",):
        if bp.get(key):
            add(f"field:{place_id}:{key}", "blueprint-field")
    for key, value in (bp.get("causalModel") or {}).items():
        if value:
            add(f"field:{place_id}:causalModel.{key}", "blueprint-field")
    return registry, errors


def _evidence_index(bp: dict) -> tuple[dict[str, tuple[str, ...]], list[str]]:
    result: dict[str, tuple[str, ...]] = {}
    errors: list[str] = []
    registry, registry_errors = blueprint_object_registry(bp)
    errors += registry_errors
    known = set(registry)
    for i, row in enumerate(bp.get("macroEvidence") or []):
        paths = row.get("sourcePaths") or []
        refs = tuple(row.get("evidenceRefs") or [])
        if not paths or not refs:
            errors.append(f"{bp.get('id')}: macroEvidence[{i}] needs sourcePaths and evidenceRefs")
            continue
        missing = sorted(set(refs) - known)
        if missing:
            errors.append(f"{bp.get('id')}: macroEvidence[{i}] has unknown evidenceRefs {missing}")
        for path in paths:
            if path in result:
                errors.append(f"{bp.get('id')}: macroEvidence sourcePath {path!r} is duplicated")
            result[path] = refs
    return result, errors


def _manual_evidence(path: str, index: dict[str, tuple[str, ...]]) -> tuple[str, ...]:
    # A root link deliberately covers its child fields: `vibe` is reviewed as
    # one composed visual promise, while its children remain separate rows.
    root = path.split(".", 1)[0].split("[", 1)[0]
    return index.get(path, index.get(root, ()))


def _owner(path: str) -> str:
    if path.startswith(("interior", "entrance", "underwaterAccess")):
        return "phase-12"
    if path.startswith(("contents", "services", "rewardProfile", "hostility",
                        "ownerFaction", "notableNpcSlots", "occupants", "rumourPoolKey")):
        return "phase-13"
    if path.startswith(("questHooks", "sockets", "deedCounterKeys", "localStateVariants")):
        return "quests"
    return "phase-11-compiled"


def _ids_of_kinds(registry: Mapping[str, dict[str, str]], *kinds: str) -> tuple[str, ...]:
    wanted = set(kinds)
    return tuple(sorted(ref for ref, entry in registry.items() if entry.get("kind") in wanted))


def _structural_evidence(root: str, registry: Mapping[str, dict[str, str]],
                         promise_refs: Mapping[str, set[str]]) -> tuple[str, ...]:
    """Resolve non-qualitative catalogue fields to real typed design objects.

    This is intentionally closed. A new delivery root must acquire either a
    structural resolver here or explicit ``macroEvidence``; it can never fall
    through to a synthetic whole-blueprint token.
    """
    promised = tuple(sorted(ref for ref in promise_refs.get(root, set()) if ref in registry))
    if promised:
        return promised
    kind_sets = {
        "approachDanger": ("approach", "combat"),
        "assetGaps": ("parcel", "landmark"),
        "authoredDangerProperty": ("combat",),
        "dangerTier": ("combat", "approach"),
        "deedCounterKeys": ("variant", "socket", "evidence", "marks", "scene", "station"),
        "densityLayer": ("district", "parcel"),
        "effortToReach": ("approach", "terminal"),
        "entrance": ("door", "parcel", "landmark", "socket"),
        "heroHist": ("landmark",),
        "interior": ("door", "parcel", "landmark"),
        "localStateVariants": ("variant",),
        "occupants": ("occupant",),
        "relationsReserved": ("occupant", "district"),
        "rumourPoolKey": ("occupant", "socket", "evidence", "scene", "station"),
        "services": ("parcel", "dock", "travel"),
        "singularClaim": ("landmark", "parcel"),
        "sockets": ("socket", "evidence", "marks", "scene", "station"),
        "strongholdCandidate": ("district", "parcel", "combat"),
        "terrainRequests": ("district", "parcel", "route", "canal", "boardwalk", "dock"),
        "travelStation": ("travel", "dock"),
        "traversalFallback": ("approach", "route", "canal", "boardwalk", "dock"),
    }
    return _ids_of_kinds(registry, *kind_sets.get(root, ()))


def _walk_semantic(value, path: str) -> Iterable[tuple[str, object, str]]:
    """Yield stable semantic leaves; keyed slots use their id, never ordinal."""
    if isinstance(value, dict):
        for key in sorted(value):
            yield from _walk_semantic(value[key], f"{path}.{key}" if path else key)
    elif isinstance(value, list):
        for item in value:
            if isinstance(item, dict):
                key = next((item.get(k) for k in ("slotId", "id", "kind", "provisionId")
                            if item.get(k)), None)
                if key is None:
                    key = hashlib.sha256(json.dumps(item, sort_keys=True).encode()).hexdigest()[:8]
                yield from _walk_semantic(item, f"{path}[{key}]")
            else:
                yield (path, item, str(item))
    elif value is not None and value != "":
        yield (path, value, str(value))


def build_obligations(record: dict, bp: dict) -> tuple[list[Obligation], list[str]]:
    errors = classify_record_fields(record)
    evidence, evidence_errors = _evidence_index(bp)
    errors += evidence_errors
    registry, _ = blueprint_object_registry(bp)
    rows: list[Obligation] = []
    promise_refs: dict[str, set[str]] = {}

    # Ownership is not an institutional presence. Every typed presence except
    # a territorial claim needs both a physical host and somebody of that
    # faction bound into the design. The host may be an open-air landmark: the
    # Waykeepers' seasonal seat is deliberately a tally post, not a building.
    for presence in record.get("factionPresence") or []:
        if not isinstance(presence, dict) or presence.get("role") == "territory":
            continue
        refs = set(evidence.get("factionPresence", ()))
        faction = presence.get("factionRef")
        institutional = {p.get("id") for p in bp.get("parcels", []) or []
                         if p.get("use") in {"civic", "hall", "watch", "gate", "work"}
                         or p.get("service") in {"guild-hall", "council", "court",
                                                "licence-office"}}
        institutional.update(l.get("id") for l in bp.get("landmarks", []) or [])
        faction_people = {o.get("slotId") for o in bp.get("occupants", []) or []
                          if o.get("ownerFaction") == faction}
        if not (refs & institutional) or not (refs & faction_people):
            errors.append(f"{record.get('id')}: faction {presence.get('role')} {faction} needs "
                          "macroEvidence naming an institutional parcel/landmark and a "
                          "faction-bound occupant")

    # Existing typed resolvers remain the authority for their detailed kinds.
    for promise in blueprint_promises.build_ledger(bp, record):
        path = promise.source.replace("catalogue ", "").replace("[", ".").replace("]", "")
        realised = tuple(promise.realisedBy)
        if promise.kind in {"npc-role", "named-npc"}:
            # The legacy ledger accepts any occupant/service parcel. B9a is
            # identity-bearing: the catalogue slot must name its own binding.
            slot = promise.id.rsplit(".", 1)[-1]
            realised = evidence.get(f"contents.npcs[{slot}]", ())
        unknown = sorted(set(realised) - set(registry))
        realised = tuple(ref for ref in realised if ref in registry)
        if unknown and not realised:
            errors.append(f"{record.get('id')}: {promise.id} resolves only to non-objects {unknown}")
        root = path.split(".", 1)[0].split("[", 1)[0]
        promise_refs.setdefault(root, set()).update(realised)
        rows.append(Obligation(
            _stable_id(record["id"], path, promise.id), record["id"], path,
            promise.kind, {"promiseId": promise.id}, realised,
            "quests" if promise.kind in {"provision", "socket"} else
            ("phase-13" if promise.kind in {"service", "npc-role", "named-npc", "reward", "travel"}
             else "phase-12"),
        ))

    # Qualitative commitments are individually preserved but share compact
    # root evidence. `why` is structurally carried by causalModel.
    for key in sorted(DELIVERY_FIELDS & set(record)):
        for path, value, semantic_key in _walk_semantic(record[key], key):
            root = path.split(".", 1)[0].split("[", 1)[0]
            if root == "why":
                leaf = path.split(".")[-1]
                refs = ((f"field:{bp.get('id')}:causalModel.{leaf}",)
                        if (bp.get("causalModel") or {}).get(leaf) else ())
            elif root in QUALITATIVE_ROOTS:
                refs = _manual_evidence(path, evidence)
            elif root == "ownerFaction":
                faction = str(value)
                refs = tuple(o["slotId"] for o in bp.get("occupants", []) or []
                             if o.get("ownerFaction") == faction)
            elif root == "culture":
                refs = tuple(d["id"] for d in bp.get("districts", []) or [])
            elif root == "classification":
                refs = ((f"field:{bp.get('id')}:scaleGrounding",)
                        if bp.get("scaleGrounding") else ())
            else:
                refs = _structural_evidence(root, registry, promise_refs)
            rows.append(Obligation(
                _stable_id(record["id"], path, semantic_key), record["id"], path,
                root, {"value": value}, refs, _owner(path),
            ))

    rows.sort(key=lambda row: row.id)
    ids = [row.id for row in rows]
    if len(ids) != len(set(ids)):
        errors.append(f"{record.get('id')}: duplicate obligation ids")
    return rows, errors


def check_phase11(record: dict, bp: dict) -> tuple[list[str], list[Obligation]]:
    rows, errors = build_obligations(record, bp)
    for row in rows:
        if not row.phase11Evidence:
            errors.append(f"{record['id']}: unmet macro obligation {row.id} from {row.sourcePath}")
    return errors, rows


def _place_set_sha256(place_ids: Iterable[str]) -> str:
    payload = json.dumps(sorted(place_ids), separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _document_rows_sha256(rows: Iterable[dict]) -> str:
    payload = json.dumps(list(rows), sort_keys=True, separators=(",", ":"),
                         ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def obligation_document(records: dict[str, dict], blueprints: Iterable[dict], *,
                        expected_place_ids: Iterable[str]) -> tuple[dict, list[str]]:
    """Build the deterministic Phase-11 interchange document.

    ``expected_place_ids`` is mandatory because discovering the expected set
    from the supplied blueprints makes whole-place omission unobservable.
    """
    rows: list[Obligation] = []
    errors: list[str] = []
    expected = set(expected_place_ids)
    if not expected or any(not isinstance(place_id, str) for place_id in expected):
        errors.append("phase-11 export: expected_place_ids must be a non-empty set of strings")
    supplied = list(blueprints)
    supplied_ids = [bp.get("id") for bp in supplied]
    duplicates = sorted(place_id for place_id in set(supplied_ids) if isinstance(place_id, str)
                        if supplied_ids.count(place_id) > 1)
    if duplicates:
        errors.append(f"phase-11 export: duplicate blueprint places {duplicates}")
    actual = {place_id for place_id in supplied_ids if isinstance(place_id, str)}
    missing = sorted(expected - actual)
    extra = sorted(actual - expected)
    if missing:
        errors.append(f"phase-11 export: missing expected blueprint places {missing}")
    if extra:
        errors.append(f"phase-11 export: unexpected blueprint places {extra}")
    missing_records = sorted(expected - set(records))
    if missing_records:
        errors.append(f"phase-11 export: expected places absent from catalogue {missing_records}")

    registry_rows: list[dict[str, str]] = []
    seen_objects: set[tuple[str, str]] = set()
    for bp in sorted(supplied, key=lambda item: item.get("id", "")):
        record = records.get(bp.get("id"))
        if record is None:
            errors.append(f"{bp.get('id')}: no catalogue record for obligation export")
            continue
        own_errors, own_rows = check_phase11(record, bp)
        errors += own_errors
        rows += own_rows
        own_registry, own_registry_errors = blueprint_object_registry(bp)
        errors += own_registry_errors
        for ref, entry in own_registry.items():
            key = (entry["placeId"], ref)
            if key in seen_objects:
                errors.append(f"phase-11 export: duplicate object ref {ref!r} in {entry['placeId']}")
            seen_objects.add(key)
            registry_rows.append(dict(id=ref, **entry))
    rows.sort(key=lambda row: row.id)
    registry_rows.sort(key=lambda entry: (entry["placeId"], entry["id"]))
    row_dicts = [row.as_dict() for row in rows]
    document = {
        "schemaVersion": SCHEMA_VERSION,
        "kind": "place-obligations",
        "expectedPlaceIds": sorted(expected),
        "placeIds": sorted(actual),
        "placeSetSha256": _place_set_sha256(expected),
        "obligationsSha256": _document_rows_sha256(row_dicts),
        "objectRegistrySha256": _document_rows_sha256(registry_rows),
        "objectRegistry": registry_rows,
        "rows": row_dicts,
    }
    errors += verify_phase11_document(document, expected_place_ids=expected)
    return document, list(dict.fromkeys(errors))


def verify_phase11_document(document: dict, *, expected_place_ids: Iterable[str]) -> list[str]:
    """Verify an exported Phase-11 manifest without trusting its own place list."""
    expected = set(expected_place_ids)
    errors: list[str] = []
    if document.get("schemaVersion") != SCHEMA_VERSION or document.get("kind") != "place-obligations":
        errors.append("phase-11 manifest: wrong schemaVersion or kind")
    for key in ("expectedPlaceIds", "placeIds"):
        value = document.get(key)
        valid = (isinstance(value, list)
                 and all(isinstance(item, str) for item in value)
                 and set(value) == expected and len(value) == len(expected))
        if not valid:
            errors.append(f"phase-11 manifest: {key} does not match the exact expected place set")
    if document.get("placeSetSha256") != _place_set_sha256(expected):
        errors.append("phase-11 manifest: placeSetSha256 does not match the exact expected place set")

    registry: dict[tuple[str, str], dict] = {}
    places_by_ref: dict[str, set[str]] = {}
    registry_rows = document.get("objectRegistry")
    if not isinstance(registry_rows, list):
        errors.append("phase-11 manifest: objectRegistry must be a list")
        registry_rows = []
    for index, entry in enumerate(registry_rows):
        if not isinstance(entry, dict):
            errors.append(f"phase-11 manifest: objectRegistry[{index}] must be an object")
            continue
        ref, kind, place_id = entry.get("id"), entry.get("kind"), entry.get("placeId")
        if not all(isinstance(value, str) and value for value in (ref, kind, place_id)):
            errors.append(f"phase-11 manifest: objectRegistry[{index}] needs typed id/kind/placeId")
            continue
        if place_id not in expected:
            errors.append(f"phase-11 manifest: object {ref!r} belongs to unexpected place {place_id!r}")
        key = (place_id, ref)
        if key in registry:
            errors.append(f"phase-11 manifest: duplicate object ref {ref!r} in {place_id}")
        registry[key] = entry
        places_by_ref.setdefault(ref, set()).add(place_id)
    if document.get("objectRegistrySha256") != _document_rows_sha256(registry_rows):
        errors.append("phase-11 manifest: objectRegistrySha256 does not match objectRegistry")

    seen_ids: set[str] = set()
    places_with_rows: set[str] = set()
    rows = document.get("rows")
    if not isinstance(rows, list):
        errors.append("phase-11 manifest: rows must be a list")
        rows = []
    if document.get("obligationsSha256") != _document_rows_sha256(rows):
        errors.append("phase-11 manifest: obligationsSha256 does not match rows")
    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            errors.append(f"phase-11 manifest: rows[{index}] must be an object")
            continue
        oid, place_id = row.get("id"), row.get("placeId")
        if not isinstance(oid, str) or not oid or oid in seen_ids:
            errors.append(f"phase-11 manifest: missing or duplicate obligation id {oid!r}")
        else:
            seen_ids.add(oid)
        if place_id not in expected:
            errors.append(f"phase-11 manifest: obligation {oid!r} has unexpected place {place_id!r}")
        else:
            places_with_rows.add(place_id)
        refs = row.get("phase11Evidence")
        if not isinstance(refs, list) or not refs:
            errors.append(f"phase-11 manifest: obligation {oid!r} has no typed evidence")
            continue
        for ref in refs:
            entry = registry.get((place_id, ref))
            if entry is None:
                if ref in places_by_ref:
                    errors.append(f"phase-11 manifest: obligation {oid!r} uses cross-place evidence {ref!r}")
                else:
                    errors.append(f"phase-11 manifest: obligation {oid!r} has unknown evidence ref {ref!r}")
            elif entry["placeId"] != place_id:
                errors.append(f"phase-11 manifest: obligation {oid!r} uses cross-place evidence {ref!r}")
    missing_rows = sorted(expected - places_with_rows)
    if missing_rows:
        errors.append(f"phase-11 manifest: expected places have no obligations {missing_rows}")
    return errors


def serialise(document: dict) -> str:
    return json.dumps(document, ensure_ascii=False, indent=2, sort_keys=False) + "\n"


def owner_obligations_sha256(obligations: Iterable[Obligation], owner: str) -> str:
    """Content address an owner's exact requirements, not merely their ids."""
    rows = sorted((row.as_dict() for row in obligations if row.deliveryOwner == owner),
                  key=lambda row: row["id"])
    payload = json.dumps(rows, sort_keys=True, separators=(",", ":"),
                         ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def compiled_object_registry_sha256(object_registry: Mapping[str, Mapping[str, str]]) -> str:
    payload = json.dumps(object_registry, sort_keys=True, separators=(",", ":"),
                         ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def _check_compiled_object_registry(object_registry) -> list[str]:
    if not isinstance(object_registry, Mapping):
        return ["compiled object registry must map object ids to typed records"]
    errors: list[str] = []
    for ref, entry in object_registry.items():
        if not isinstance(ref, str) or not ref:
            errors.append(f"compiled object registry has invalid id {ref!r}")
            continue
        if not isinstance(entry, Mapping):
            errors.append(f"compiled object registry entry {ref!r} must be an object")
            continue
        if not isinstance(entry.get("kind"), str) or not entry.get("kind"):
            errors.append(f"compiled object registry entry {ref!r} has no concrete kind")
        if not isinstance(entry.get("placeId"), str) or not entry.get("placeId"):
            errors.append(f"compiled object registry entry {ref!r} has no placeId")
    return errors


def _accepted_compiled_kinds(obligation: Obligation) -> frozenset[str] | None:
    """Closed final-object types where the promise itself is unambiguous.

    More visual or spatial promises can legitimately be delivered by several
    future compiler object types, but a named person, door, interior or quest
    socket cannot be evidenced by an unrelated parcel merely because it is in
    the same place.
    """
    path = obligation.sourcePath
    if obligation.kind in {"named-npc", "npc-role"} or path.startswith(
            ("contents.npcs", "occupants", "notableNpcSlots", "ownerFaction")):
        return frozenset({"npc", "occupant"})
    if path.startswith("factionPresence"):
        return frozenset({"parcel", "landmark", "occupant"})
    if obligation.kind in {"socket", "provision"} or path.startswith(
            ("sockets", "questHooks", "deedCounterKeys")):
        return frozenset({"quest", "quest-socket", "socket", "provision"})
    if path.startswith("entrance"):
        return frozenset({"door", "entrance"})
    if path.startswith("interior"):
        return frozenset({"interior", "room"})
    if path.startswith("terrainRequests"):
        return frozenset({"terrain-feature", "terrain-operation"})
    return None


def verify_delivery_manifest(obligations: Iterable[Obligation], manifest: dict,
                             owner: str, *, object_registry: Mapping[str, Mapping[str, str]]) -> list[str]:
    """Generic hard gate consumed by Phase 12, 13, quests and final assembly."""
    obligations = list(obligations)
    errors = _check_compiled_object_registry(object_registry)
    registry_lookup = object_registry if isinstance(object_registry, Mapping) else {}
    if not isinstance(manifest, dict):
        return errors + [f"{owner}: delivery manifest must be an object"]
    if owner not in DELIVERY_OWNERS:
        errors.append(f"unknown delivery owner {owner!r}")
    if manifest.get("schemaVersion") != MANIFEST_SCHEMA_VERSION:
        errors.append(f"{owner}: delivery manifest schemaVersion must be {MANIFEST_SCHEMA_VERSION}")
    if manifest.get("kind") != "place-obligation-deliveries" or manifest.get("owner") != owner:
        errors.append(f"{owner}: manifest must declare kind place-obligation-deliveries and its owner")
    expected_digest = owner_obligations_sha256(obligations, owner)
    if manifest.get("obligationsSha256") != expected_digest:
        errors.append(f"{owner}: obligationsSha256 does not match the exact current requirements")
    if manifest.get("objectRegistrySha256") != compiled_object_registry_sha256(object_registry):
        errors.append(f"{owner}: objectRegistrySha256 does not match the compiled object registry")
    delivered: dict[str, dict] = {}
    expected_rows = {o.id: o for o in obligations if o.deliveryOwner == owner}
    rows = manifest.get("deliveries")
    if not isinstance(rows, list):
        errors.append(f"{owner}: deliveries must be a list")
        rows = []
    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            errors.append(f"{owner}: deliveries[{index}] must be an object")
            continue
        oid = row.get("obligationId")
        if not isinstance(oid, str) or not oid or oid in delivered:
            errors.append(f"{owner}: missing or duplicate obligationId {oid!r}")
        else:
            delivered[oid] = row
        if not row.get("objectRefs"):
            errors.append(f"{owner}: {oid} has no delivered objectRefs")
        refs = row.get("objectRefs")
        if not isinstance(refs, list):
            errors.append(f"{owner}: {oid} objectRefs must be a list")
            continue
        obligation = expected_rows.get(oid)
        for ref in refs:
            if not isinstance(ref, str) or not ref:
                errors.append(f"{owner}: {oid} has invalid object ref {ref!r}")
                continue
            entry = registry_lookup.get(ref)
            if entry is None:
                errors.append(f"{owner}: {oid} has unknown compiled object ref {ref!r}")
            elif (obligation is not None and isinstance(entry, Mapping)
                  and entry.get("placeId") != obligation.placeId):
                errors.append(f"{owner}: {oid} has cross-place object ref {ref!r}")
            elif obligation is not None and isinstance(entry, Mapping):
                claimed = entry.get("deliversObligationIds")
                if not isinstance(claimed, list) or oid not in claimed:
                    errors.append(
                        f"{owner}: {oid} object ref {ref!r} does not explicitly "
                        "declare that it delivers this obligation")
                accepted = _accepted_compiled_kinds(obligation)
                if accepted is not None and entry.get("kind") not in accepted:
                    errors.append(
                        f"{owner}: {oid} object ref {ref!r} has kind "
                        f"{entry.get('kind')!r}; expected one of {sorted(accepted)}")
    expected = set(expected_rows)
    missing = sorted(expected - set(delivered))
    stale = sorted(set(delivered) - expected)
    if missing:
        errors.append(f"{owner}: undelivered obligations {missing}")
    if stale:
        errors.append(f"{owner}: stale/orphan deliveries {stale}")
    return errors


def verify_final_delivery(obligations: Iterable[Obligation], manifests: Iterable[dict], *,
                          object_registry: Mapping[str, Mapping[str, str]]) -> list[str]:
    """Phase 14/deploy gate: every owner manifest is present and exact."""
    obligations = list(obligations)
    by_owner: dict[str, dict] = {}
    errors: list[str] = []
    for manifest in manifests:
        if not isinstance(manifest, dict):
            errors.append("final: every delivery manifest must be an object")
            continue
        owner = manifest.get("owner")
        if owner in by_owner:
            errors.append(f"final: duplicate manifest for {owner!r}")
        elif isinstance(owner, str):
            by_owner[owner] = manifest
    expected_owners = {o.deliveryOwner for o in obligations}
    for owner in sorted(expected_owners):
        if owner not in by_owner:
            errors.append(f"final: missing delivery manifest for {owner}")
        else:
            errors += verify_delivery_manifest(obligations, by_owner[owner], owner,
                                               object_registry=object_registry)
    extra = sorted(set(by_owner) - expected_owners)
    if extra:
        errors.append(f"final: manifests with no obligations {extra}")
    return errors


def live_phase11_document() -> tuple[dict, list[str]]:
    """Build the checked-in exemplar manifest used by the executable gate."""
    from . import blueprint, catalogue

    records = {record["id"]: record
               for region_file in catalogue.load_region_files()
               for record in region_file.places}
    blueprints = [json.loads(path.read_text())["blueprint"]
                  for path in sorted(blueprint.BLUEPRINT_DIR.glob("*.json"))]
    return obligation_document(records, blueprints,
                               expected_place_ids=PHASE11_EXEMPLAR_PLACE_IDS)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Verify or export the exact Phase-11 macro-delivery manifest")
    parser.add_argument("--emit", action="store_true",
                        help="write the verified deterministic manifest to stdout")
    args = parser.parse_args(argv)
    document, errors = live_phase11_document()
    if errors:
        for error in errors:
            print(error, file=sys.stderr)
        return 1
    if args.emit:
        print(serialise(document), end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
