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

import hashlib
import json
from dataclasses import dataclass
from typing import Iterable

from . import blueprint_promises

SCHEMA_VERSION = 1
MANIFEST_SCHEMA_VERSION = 1
DELIVERY_OWNERS = {"phase-11-compiled", "phase-12", "phase-13", "quests"}

# Every top-level catalogue field must be consciously classified.  This is a
# schema policy, not a second copy of 800 records.  Tests walk the live
# catalogue and make a newly introduced field fail until its owner classifies
# it here.
PROVENANCE_FIELDS = {
    "aliases", "confidence", "id", "name", "namingRule", "provenance", "sources",
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


def _object_ids(bp: dict) -> set[str]:
    ids: set[str] = set()
    for key in ("districts", "parcels", "routes", "canals", "boardwalks", "fences",
                "landmarks", "docks", "combatSpaces", "questSockets", "variants",
                "travelServices", "approaches", "networkTerminals"):
        ids.update(x.get("id") for x in bp.get(key, []) or [] if isinstance(x, dict))
    ids.update(x.get("slotId") for x in bp.get("occupants", []) or [] if isinstance(x, dict))
    return {x for x in ids if isinstance(x, str)}


def _evidence_index(bp: dict) -> tuple[dict[str, tuple[str, ...]], list[str]]:
    result: dict[str, tuple[str, ...]] = {}
    errors: list[str] = []
    known = _object_ids(bp)
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
    rows: list[Obligation] = []

    # Ownership is not a seat. A typed seat needs both a place that can serve
    # as the institution and somebody of that faction bound into the design.
    for presence in record.get("factionPresence") or []:
        if not isinstance(presence, dict) or presence.get("role") != "seat":
            continue
        refs = set(evidence.get("factionPresence", ()))
        faction = presence.get("factionRef")
        civic = {p.get("id") for p in bp.get("parcels", []) or []
                 if p.get("use") in {"civic", "hall"}
                 or p.get("service") in {"guild-hall", "council", "court"}}
        faction_people = {o.get("slotId") for o in bp.get("occupants", []) or []
                          if o.get("ownerFaction") == faction}
        if not (refs & civic) or not (refs & faction_people):
            errors.append(f"{record.get('id')}: faction seat {faction} needs macroEvidence "
                          "naming a civic/hall parcel and a faction-bound occupant")

    # Existing typed resolvers remain the authority for their detailed kinds.
    for promise in blueprint_promises.build_ledger(bp, record):
        path = promise.source.replace("catalogue ", "").replace("[", ".").replace("]", "")
        realised = tuple(promise.realisedBy)
        if promise.kind in {"npc-role", "named-npc"}:
            # The legacy ledger accepts any occupant/service parcel. B9a is
            # identity-bearing: the catalogue slot must name its own binding.
            slot = promise.id.rsplit(".", 1)[-1]
            realised = evidence.get(f"contents.npcs[{slot}]", ())
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
                refs = (f"causalModel.{leaf}",) if (bp.get("causalModel") or {}).get(leaf) else ()
            elif root in QUALITATIVE_ROOTS:
                refs = _manual_evidence(path, evidence)
            elif root == "ownerFaction":
                faction = str(value)
                refs = tuple(o["slotId"] for o in bp.get("occupants", []) or []
                             if o.get("ownerFaction") == faction)
            elif root == "culture":
                refs = tuple(d["id"] for d in bp.get("districts", []) or [])
            elif root == "classification":
                refs = ("scaleGrounding",) if bp.get("scaleGrounding") else ()
            else:
                refs = (f"blueprint.{bp.get('id')}",)
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


def obligation_document(records: dict[str, dict], blueprints: Iterable[dict]) -> tuple[dict, list[str]]:
    """Deterministic interchange document for downstream compiler inputs."""
    rows: list[Obligation] = []
    errors: list[str] = []
    for bp in sorted(blueprints, key=lambda item: item.get("id", "")):
        record = records.get(bp.get("id"))
        if record is None:
            errors.append(f"{bp.get('id')}: no catalogue record for obligation export")
            continue
        own_errors, own_rows = check_phase11(record, bp)
        errors += own_errors
        rows += own_rows
    rows.sort(key=lambda row: row.id)
    return ({
        "schemaVersion": SCHEMA_VERSION,
        "kind": "place-obligations",
        "rows": [row.as_dict() for row in rows],
    }, errors)


def serialise(document: dict) -> str:
    return json.dumps(document, ensure_ascii=False, indent=2, sort_keys=False) + "\n"


def verify_delivery_manifest(obligations: Iterable[Obligation], manifest: dict,
                             owner: str) -> list[str]:
    """Generic hard gate consumed by Phase 12, 13, quests and final assembly."""
    errors: list[str] = []
    if owner not in DELIVERY_OWNERS:
        errors.append(f"unknown delivery owner {owner!r}")
    if manifest.get("schemaVersion") != MANIFEST_SCHEMA_VERSION:
        errors.append(f"{owner}: delivery manifest schemaVersion must be {MANIFEST_SCHEMA_VERSION}")
    if manifest.get("kind") != "place-obligation-deliveries" or manifest.get("owner") != owner:
        errors.append(f"{owner}: manifest must declare kind place-obligation-deliveries and its owner")
    delivered: dict[str, dict] = {}
    for row in manifest.get("deliveries") or []:
        oid = row.get("obligationId")
        if not oid or oid in delivered:
            errors.append(f"{owner}: missing or duplicate obligationId {oid!r}")
        elif not row.get("objectRefs"):
            errors.append(f"{owner}: {oid} has no delivered objectRefs")
        delivered[oid] = row
    expected = {o.id for o in obligations if o.deliveryOwner == owner}
    missing = sorted(expected - set(delivered))
    stale = sorted(set(delivered) - expected)
    if missing:
        errors.append(f"{owner}: undelivered obligations {missing}")
    if stale:
        errors.append(f"{owner}: stale/orphan deliveries {stale}")
    return errors


def verify_final_delivery(obligations: Iterable[Obligation], manifests: Iterable[dict]) -> list[str]:
    """Phase 14/deploy gate: every owner manifest is present and exact."""
    obligations = list(obligations)
    by_owner: dict[str, dict] = {}
    errors: list[str] = []
    for manifest in manifests:
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
            errors += verify_delivery_manifest(obligations, by_owner[owner], owner)
    extra = sorted(set(by_owner) - expected_owners)
    if extra:
        errors.append(f"final: manifests with no obligations {extra}")
    return errors
