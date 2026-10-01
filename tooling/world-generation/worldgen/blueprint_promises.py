"""The promise ledger: what the macro layer promised, what the blueprint built.

Owner finding, 2026-09-05 — *"do we have something that ensures all the things
the macro plotting layer promises a place will give the player (services,
quests etc.) actually ARE present? In Lilmoth I couldn't find the shops and
services we planned."* We did not. The catalogue record said `service-hub`,
`rewardProfile.kinds: [services]`, four NPC roles, a travel station and five
quest provisions; the blueprint had one `shop` parcel. Nothing typed WHICH
services, so nothing could check them.

This module builds the ledger for one blueprint: every promise its catalogue
record makes to the player, and the blueprint objects that realise it.

  promise kind  where it comes from            realised by
  ------------  ----------------------------   ------------------------------
  service       record `services[]`            a parcel carrying `service`
                                               (+ a door and a linked interior
                                               for anything you walk into)
  npc-role      `contents.npcs[].role`         the place kind that role needs
  named-npc     `contents.npcs[].named`        an occupant slot with `worksAt`
                                               or `livesAt`
  travel        `travelStation`                a `travelServices` entry per
                                               destination, a kind per mode,
                                               and a dock or landing
  provision     `questHooks.provisions[]`      per the tag in docs/quests/25
                                               §20b: LOC → a named socket,
                                               parcel or landmark; STATE → a
                                               variant; FAST → a travel
                                               service; BOSS → a boss socket
  socket        `sockets.*`                    a `questSockets[]` entry
  reward        `rewardProfile.kinds[]`        the service a kind implies
  entrance      `entrance`                     a gate parcel, a door, or the
                                               landmark the kind names

An unmet promise is a HARD compile error for magnitude ≥ M3 and a warning
below (a hamlet's promises are small and its blueprint is a sketch). Module
97 E9; enforcement row G22.

Blueprint schema this module owns and validates (documented in
`blueprint.py`'s docstring, kept out of its validator so the two modules stay
separable):
  * `parcels[].service` — one of `catalogue.SERVICES`; the parcel IS that
    service, and the promise is met by it.
  * `occupants[].worksAt` / `.livesAt` — parcel ids; where a named person is
    found and where they sleep.

Run (from tooling/world-generation/):
  python3 -m worldgen.blueprint_promises              # every blueprint
  python3 -m worldgen.blueprint_promises --id <place-id>
"""

from __future__ import annotations

import argparse
import functools
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

from . import catalogue
from .blueprint_files import blueprint_paths, parcel_services  # noqa: F401 — parcel_services is re-exported
from .catalogue import SERVICES
from .promise_gate import CONFIRMED_KINDS

REPO_ROOT = Path(__file__).resolve().parents[3]
BLUEPRINT_DIR = REPO_ROOT / "world" / "sources" / "blueprints"
OUT_DIR = Path(__file__).resolve().parents[1] / "output" / "settlements"
PLACE_MAP_PATH = REPO_ROOT / "docs" / "quests" / "25-quest-place-map.md"

# A service the player walks into needs a door and a linked interior; the rest
# are open-air counters, decks and water services.
OPEN_AIR_SERVICES = {"market", "shrine", "ferry", "stable"}
# A ferry is not a shop: it is realised by the landing and the service that
# runs from it, so it is met by a dock or a travelServices entry.
WATER_SERVICES = {"ferry"}
# Where a parcel has no explicit `service`, only these `use` values are
# unambiguous enough to stand in for one. (A `shop` parcel does not say which
# shop, which is exactly the hole this ledger closes.)
USE_STANDS_FOR = {"market": {"market"}, "shrine": {"shrine"}}
# contents.npcs[].role -> the place kinds that role needs to exist (97 E9).
ROLE_NEEDS = {
    "official": {"council", "court", "licence-office"},
    "priest": {"temple", "shrine"},
    "merchant": {"trader", "market"},
    "trainer": {"guild-hall"},
}
# rewardProfile kinds that imply a PLACE, and the services that deliver them.
REWARD_NEEDS = {
    "services": set(SERVICES),
    "trade-access": {"trader", "market"},
    "rest-shelter": {"lodging", "tavern"},
    "training": {"guild-hall"},
    "enchanting-access": {"guild-hall"},
    "faction-access": {"guild-hall", "council", "court"},
}
# travelStation mode -> the travelServices `kind` that runs it.
MODE_KIND = {"boat": "boat", "canoe": "canoe", "ferry": "ferry", "lighter": "ferry", "pilot": "ferry",
             "rootworm": "root", "cart": None, "guide": None, "porter": None}
HARD_FROM_MAGNITUDE = ("M3", "M4", "M5")


@dataclass
class Promise:
    id: str
    kind: str
    promise: str
    source: str
    remedy: str
    realisedBy: list[str] = field(default_factory=list)
    # the socket kinds (0103 decision 5) that satisfy this promise, so a
    # design brief's § Sockets table can be checked against the ledger
    socketKinds: list[str] = field(default_factory=list)
    # the parcels its realisers stand in (`_row_parcels`): a socket meets the
    # row only from one of them, or by carrying the row's id (planner
    # ruling 3, 16k round 6)
    parcels: list[str] = field(default_factory=list)

    @property
    def met(self) -> bool:
        return bool(self.realisedBy)


#: promise kind -> the socket kinds that satisfy it (0103 decision 5); a
#: quest provision's kinds follow its 20b tag (PROVISION_SOCKET_KINDS)
SOCKET_KINDS = {
    "service": ["npc"],
    "npc-role": ["npc", "idle"],
    "named-npc": ["npc", "idle"],
    "travel": ["npc", "marker"],
    "socket": ["marker"],
    "reward": ["npc"],
    "entrance": ["marker"],
}
PROVISION_SOCKET_KINDS = {"LOC": ["marker"], "STATE": ["marker"], "FAST": ["npc", "marker"],
                          "BOSS": ["encounter"], "POI": ["marker", "item"]}


def socket_kinds(promise: Promise) -> list[str]:
    if promise.kind == "provision":
        return PROVISION_SOCKET_KINDS.get(promise.promise.split(" ", 1)[0], ["marker"])
    return SOCKET_KINDS.get(promise.kind, [])


# ------------------------------------------------------------------ helpers

def load_record(place_id: str) -> dict | None:
    for rf in catalogue.load_region_files():
        for rec in rf.places:
            if rec.get("id") == place_id:
                return rec
    return None


def provision_tags(path: Path = PLACE_MAP_PATH) -> dict[str, str]:
    """provision id -> its tag in docs/quests/25 §20b (LOC/STATE/FAST/BOSS/POI).

    The tag is the typed part of the quest's need: a LOC is a place you can
    stand in, a STATE is a variant, a FAST is a travel service.
    """
    from .quests import provision_id
    out: dict[str, str] = {}
    text = path.read_text(encoding="utf-8")
    section = text.split("## 20b.")[1].split("## 20c.")[0]
    for line in section.splitlines():
        if not line.startswith("|"):
            continue
        cell = line.split("|")[1]
        for tag, name in re.findall(r"`(?:(LOC|STATE|BOSS|FAST|POI)\s+)?([A-Za-z0-9_.]+)`", cell):
            if tag or name.startswith("poi."):
                out.setdefault(provision_id(name), tag or "POI")
    return out


def _object_ids(bp: dict) -> list[str]:
    ids: list[str] = []
    for key in ("districts", "parcels", "landmarks", "docks", "questSockets",
                "routes", "canals", "boardwalks", "combatSpaces", "travelServices"):
        ids += [o["id"] for o in bp.get(key, []) or [] if isinstance(o, dict) and "id" in o]
    return ids


def _an(word: str) -> str:
    return f"{'an' if word[:1] in 'aeiou' else 'a'} {word}"


def _needle_words(provision: str, place_id: str) -> list[str]:
    """The words a provision id needs an object id to carry.

    `quest.provision.lilmoth-pusbottom` at `place.mercantile-coast.lilmoth`
    needs an object whose id says `pusbottom`; the place's own slug is not a
    distinguishing word.
    """
    slug = place_id.rsplit(".", 1)[-1]
    words = re.split(r"[.\-]", provision.removeprefix("quest.provision."))
    # `canon` is a provenance marker in a provision id, never a place word.
    keep = [w for w in words if w and w != "canon" and w not in slug.split("-")]
    return keep or words


def _service_parcels(bp: dict) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {}
    for p in bp.get("parcels", []) or []:
        for svc in parcel_services(p):
            out.setdefault(svc, []).append(p)
        use = (p.get("use") or "").lower()
        for service, uses in USE_STANDS_FOR.items():
            if use in uses:
                out.setdefault(service, []).append(p)
    return out


def _doors_by_parcel(bp: dict) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {}
    for d in bp.get("doors", []) or []:
        out.setdefault(d.get("parcelId"), []).append(d)
    return out


# ------------------------------------------------------------------ schema

def validate_promise_fields(bp: dict) -> list[str]:
    """The fields this module adds to the blueprint schema: parcel
    `services`, occupant `worksAt`/`livesAt`, and the `parcel` of a quest
    socket with a `socketRef` and of a travel service (16k r7 rule 7)."""
    errs: list[str] = []
    parcel_ids = {p["id"] for p in bp.get("parcels", []) or []}
    for p in bp.get("parcels", []) or []:
        if "services" in p and "service" in p:
            errs.append(f"{p['id']}: give `services` (a list, schema 2) or the schema-1 "
                        f"`service`, never both")
        if "services" in p and not (isinstance(p["services"], list) and p["services"]):
            errs.append(f"{p['id']}: `services` must be a non-empty list of service ids")
        for svc in parcel_services(p):
            if svc not in SERVICES:
                errs.append(f"{p['id']}: service {svc!r} must be one of {sorted(SERVICES)} (97 E9)")
    for o in bp.get("occupants", []) or []:
        for key in ("worksAt", "livesAt"):
            ref = o.get(key)
            if ref is not None and ref not in parcel_ids:
                errs.append(f"occupant {o.get('slotId')}: `{key}` -> {ref} is not a parcel in this "
                            f"blueprint (97 E9)")
    # 16k r7 rule 7: a quest socket that realises a catalogue socket, and a
    # travel service, name the parcel they stand in (a ferry's is its
    # landing), so the ledger row they realise has a parcel to be met in
    for key, what in (("questSockets", "a quest socket realising a catalogue socket"),
                      ("travelServices", "a travel service (its landing)")):
        for o in bp.get(key, []) or []:
            if key == "questSockets" and not o.get("socketRef"):
                continue
            ref = o.get("parcel")
            if ref is None:
                errs.append(f"{o.get('id')}: {what} names the parcel it stands in "
                            f"(`parcel`: a parcel id of this blueprint)")
            elif ref not in parcel_ids:
                errs.append(f"{o.get('id')}: `parcel` -> {ref} is not a parcel in this blueprint")
    return errs


# ------------------------------------------------------------------ ledger

def build_ledger(bp: dict, rec: dict) -> list[Promise]:
    """Every promise the record makes, with what realises it in the blueprint."""
    out: list[Promise] = []
    place_id = rec["id"]
    svc_parcels = _service_parcels(bp)
    doors = _doors_by_parcel(bp)
    obj_ids = _object_ids(bp)
    landmark_kinds = {l.get("kind") for l in bp.get("landmarks", []) or []}

    # --- services -----------------------------------------------------------
    for service in rec.get("services") or []:
        parcels = svc_parcels.get(service, [])
        realised: list[str] = []
        if service in WATER_SERVICES:
            realised = ([d["id"] for d in bp.get("docks", []) or []]
                        + [s["id"] for s in bp.get("travelServices", []) or []])
        remedy = (f"add a parcel with `service: \"{service}\"` (an exact kit piece, a why and a "
                  f"yaw), or drop `{service}` from the record if the culture does not have one")
        for p in parcels:
            if service in OPEN_AIR_SERVICES:
                realised.append(p["id"])
                continue
            ds = doors.get(p["id"], [])
            if ds and any((d.get("interiorClaim") or {}).get("interiorRef") for d in ds):
                realised.append(p["id"])
        if parcels and not realised:
            remedy = (f"the `{service}` parcel {parcels[0]['id']} has no door onto a linked interior; "
                      f"give it a derived doorway and an `interiorClaim.interiorRef` (97 E5)")
        out.append(Promise(f"promise.service.{service}", "service",
                           f"{_an(service)} that the player can use", "catalogue services[]",
                           remedy, realised))

    # --- npc roles and named people ----------------------------------------
    for slot in (rec.get("contents") or {}).get("npcs") or []:
        role, sid = slot.get("role"), slot.get("slotId")
        needs = ROLE_NEEDS.get(role)
        if needs:
            realised = [p["id"] for s in sorted(needs) for p in svc_parcels.get(s, [])]
            out.append(Promise(f"promise.npc-role.{sid}", "npc-role",
                               f"{_an(role)} works here", f"contents.npcs[{sid}]",
                               f"add a parcel with `service` in {sorted(needs)} in which the {role} "
                               f"works", realised))
        elif role == "quest-giver":
            realised = [o["slotId"] for o in bp.get("occupants", []) or []]
            out.append(Promise(f"promise.npc-role.{sid}", "npc-role",
                               "a quest-giver stands somewhere nameable", f"contents.npcs[{sid}]",
                               "add an occupant slot for the quest-giver", realised))
        if slot.get("named"):
            realised = [o["slotId"] for o in bp.get("occupants", []) or []
                        if o.get("worksAt") or o.get("livesAt")]
            out.append(Promise(f"promise.named-npc.{sid}", "named-npc",
                               f"a named {role} lives and works here", f"contents.npcs[{sid}]",
                               "give an occupant slot `worksAt` and/or `livesAt` naming the parcel "
                               "at which the player finds them", realised))

    # --- travel -------------------------------------------------------------
    ts = rec.get("travelStation") or {}
    services_ = bp.get("travelServices", []) or []
    if ts:
        landings = ([d["id"] for d in bp.get("docks", []) or []]
                    + [p["id"] for p in bp.get("parcels", []) or []
                       if (p.get("use") or "") in ("quay", "dock")]
                    + [b["id"] for b in bp.get("boardwalks", []) or [] if b.get("kind") == "pier"])
        for dest in ts.get("destinations") or []:
            realised = [s["id"] for s in services_ if s.get("toPlaceId") == dest]
            out.append(Promise(f"promise.travel.dest.{dest}", "travel",
                               f"paid passage to {dest}", "catalogue travelStation",
                               f"add a `travelServices` entry with toPlaceId {dest}",
                               realised if landings else []))
        for mode in ts.get("modes") or []:
            kind = MODE_KIND.get(mode)
            if kind is None:
                continue
            realised = [s["id"] for s in services_ if s.get("kind") in (kind, "water-taxi")]
            out.append(Promise(f"promise.travel.mode.{mode}", "travel",
                               f"the station runs by {mode}", "catalogue travelStation",
                               f"add a `travelServices` entry of kind '{kind}' and a dock or landing "
                               f"for it", realised if landings else []))

    # --- quest provisions ---------------------------------------------------
    tags = provision_tags()
    variants = bp.get("variants", []) or []
    sockets = bp.get("questSockets", []) or []
    for prov in (rec.get("questHooks") or {}).get("provisions") or []:
        tag = tags.get(prov, "LOC")
        words = _needle_words(prov, place_id)
        if tag == "STATE":
            realised = [v["id"] for v in variants
                        if all(w in (v.get("id", "") + " " + str(v.get("stateRef", ""))) for w in words)]
            remedy = f"add a `variants[]` entry whose id names {'-'.join(words)}"
        elif tag == "FAST":
            realised = [s["id"] for s in services_]
            remedy = "add the travel service the quest travels by"
        elif tag == "BOSS":
            realised = [s["id"] for s in sockets if s.get("kind") == "boss"]
            remedy = "add a questSocket of kind 'boss'"
        else:
            realised = [oid for oid in obj_ids if all(w in oid for w in words)]
            remedy = (f"add a parcel, landmark or questSocket whose id names "
                      f"{'-'.join(words)}, so the quest has somewhere to happen")
        out.append(Promise(f"promise.provision.{prov.removeprefix('quest.provision.')}", "provision",
                           f"{tag} {prov}", "catalogue questHooks.provisions", remedy, realised))

    # --- catalogue sockets --------------------------------------------------
    socket_ids = {s["id"] for s in sockets} | {s.get("socketRef") for s in sockets}
    for kind, ids in sorted((rec.get("sockets") or {}).items()):
        for sid in ids:
            out.append(Promise(f"promise.socket.{sid}", "socket", f"{kind} socket {sid}",
                               "catalogue sockets", f"add a questSockets[] entry carrying the catalogue id {sid}, "
                               f"or a `socketRef: \"{sid}\"` on the blueprint socket that "
                               f"realises it",
                               [sid] if sid in socket_ids else []))

    # --- reward kinds that imply a place ------------------------------------
    for kind in (rec.get("rewardProfile") or {}).get("kinds") or []:
        needs = REWARD_NEEDS.get(kind)
        if not needs:
            continue
        realised = [p["id"] for s in sorted(needs) for p in svc_parcels.get(s, [])]
        want = sorted(needs & set(rec.get("services") or [])) or sorted(needs)
        out.append(Promise(f"promise.reward.{kind}", "reward", f"the place gives the {kind} reward",
                           "catalogue rewardProfile.kinds",
                           f"build one of {want} as a parcel with a `service`", realised))

    # --- the entrance the record claims -------------------------------------
    ent = rec.get("entrance")
    if ent == "gate":
        realised = [p["id"] for p in bp.get("parcels", []) or [] if (p.get("use") or "") == "gate"]
        out.append(Promise("promise.entrance.gate", "entrance", "you enter by a gate",
                           "catalogue entrance", "add a parcel with use 'gate' spanning its way",
                           realised))
    elif ent == "door":
        realised = [d["id"] for d in bp.get("doors", []) or []]
        out.append(Promise("promise.entrance.door", "entrance", "you enter by a door",
                           "catalogue entrance", "add the door the record promises", realised))
    elif ent not in (None, "none"):
        word = ent.split("-")[0]
        realised = ([oid for oid in obj_ids if word in oid]
                    + [f"landmark kind {k}" for k in landmark_kinds if k and word in k])
        out.append(Promise(f"promise.entrance.{ent}", "entrance", f"you enter by a {ent}",
                           "catalogue entrance",
                           f"add the {ent} as a landmark, parcel or socket whose id names it",
                           realised))

    # one row per promise id (a record may list a catalogue socket twice, or
    # under two kinds), each realiser named once
    rows: dict[str, Promise] = {}
    for promise in out:
        row = rows.setdefault(promise.id, promise)
        if row is not promise:
            row.realisedBy += promise.realisedBy
    parcels_of = _row_parcels(bp)
    for promise in rows.values():
        promise.realisedBy = list(dict.fromkeys(promise.realisedBy))
        promise.socketKinds = socket_kinds(promise)
        promise.parcels = sorted({pid for r in promise.realisedBy for pid in parcels_of.get(r, ())})
    return sorted(rows.values(), key=lambda p: p.id)


def _row_parcels(bp: dict) -> dict[str, list[str]]:
    """Realiser id -> the parcel(s) it stands in: a parcel itself, a door's
    parcel, an occupant's worksAt and livesAt, and the parcel a dock, quest
    socket or travel service names (`parcelId` or `parcel`)."""
    out: dict[str, list[str]] = {p["id"]: [p["id"]] for p in bp.get("parcels", []) or []}
    for key in ("doors", "docks", "questSockets", "travelServices"):
        for o in bp.get(key, []) or []:
            pid = o.get("parcelId") or o.get("parcel")
            if isinstance(o, dict) and o.get("id") and isinstance(pid, str):
                out.setdefault(o["id"], []).append(pid)
                # a quest socket realises its catalogue socket under the
                # catalogue id (`socketRef`, build_ledger), so that id
                # stands in the same parcel
                if key == "questSockets" and isinstance(o.get("socketRef"), str):
                    out.setdefault(o["socketRef"], []).append(pid)
    for o in bp.get("occupants", []) or []:
        out[o.get("slotId")] = [v for v in (o.get("worksAt"), o.get("livesAt")) if v]
    return out


def check_promises(bp: dict, rec: dict | None = None) -> tuple[list[str], list[str], list[Promise]]:
    """(errors, warnings, ledger) for one blueprint. One call from the compiler."""
    rec = rec if rec is not None else load_record(bp["id"])
    if rec is None:
        return ([], [f"{bp['id']}: no catalogue record, promise ledger skipped"], [])
    ledger = build_ledger(bp, rec)
    hard = (rec.get("classification") or {}).get("magnitude") in HARD_FROM_MAGNITUDE
    msgs = [f"{bp['id']}: 97 E9 — unmet promise {p.id} ({p.promise}, from {p.source}); "
            f"remedy: {p.remedy}" for p in ledger if not p.met]
    errors = validate_promise_fields(bp)
    if hard:
        return (errors + msgs, [], ledger)
    return (errors, msgs, ledger)


def fill_subjects(record: dict | None) -> dict[str, str]:
    """{0104 ledger row id: its subject}: the last bracketed key of the row's
    source path (the catalogue socket id, the service id), which is the
    subject `socket_promise_errors` names a build-ledger row by."""
    out = {}
    for row in (record or {}).get("promises", []) or []:
        path = str((row.get("source") or {}).get("path", ""))
        if path.endswith("]") and "[" in path:
            out[row["id"]] = path[path.rindex("[") + 1:-1]
    return out


def socket_promise_errors(ledger: list[Promise], sockets: list[dict],
                          subjects: dict[str, str] | None = None) -> list[str]:
    """Planner ruling 4 (16k round 5) and ruling 3 (16k round 6): every
    ledger row's Socket kinds column (what the design brief's § Sockets
    table is checked against) is met by a compiled socket of one of those
    kinds that stands in one of the row's parcels, or whose id is the row's
    id or its subject (the id past ``promise.<kind>.``: the catalogue socket
    id, the service)."""
    out = []
    for p in ledger:
        if not p.socketKinds:
            continue
        ids = {p.id, p.id.removeprefix(f"promise.{p.kind}.")}
        subject = p.id.removeprefix(f"promise.{p.kind}.")
        # planner ruling 2026-09-27 (walk 2 round 3): a socket whose `fills`
        # names the 0104 row of this promise realises it wherever it stands;
        # the parcel match is the fallback for a socket that names no fills
        filled = [s for s in sockets if s["kind"] in p.socketKinds
                  and any((subjects or {}).get(f) == subject for f in s.get("fills") or [])]
        if filled or any(s["kind"] in p.socketKinds
                         and (s["id"] in ids or (p.parcels and s.get("parcelId") in p.parcels))
                         for s in sockets):
            continue
        where = (f"standing in {' or '.join(p.parcels)}, or with id {p.id}" if p.parcels
                 else f"with id {p.id} or {p.id.removeprefix(f'promise.{p.kind}.')}")
        out.append(f"sockets.promise: {p.id} ({p.promise}) needs a socket of kind "
                   f"{' or '.join(p.socketKinds)} {where}; the place compiled none")
    return out


# ------------------------------------------------------------------ report

def ledger_markdown(bp_id: str, rec: dict, ledger: list[Promise]) -> str:
    met = [p for p in ledger if p.met]
    unmet = [p for p in ledger if not p.met]
    mag = (rec.get("classification") or {}).get("magnitude") or "—"
    lines = [f"# Promise ledger — {rec.get('name', bp_id)} (`{bp_id}`)", "",
             f"Magnitude {mag} · {len(met)} of {len(ledger)} promises met · "
             f"unmet are {'compile errors' if mag in HARD_FROM_MAGNITUDE else 'warnings'} "
             f"(97 E9, G22).", "",
             "| Promise | Kind | Socket kinds | From | Met by | Remedy if not |",
             "|---|---|---|---|---|---|"]
    for p in ledger:
        realised = ", ".join(f"`{r}`" for r in p.realisedBy[:3]) if p.met else "**—**"
        lines.append(f"| {p.promise} | {p.kind} | {', '.join(p.socketKinds) or '—'} | "
                     f"{p.source} | {realised} | "
                     f"{'' if p.met else p.remedy} |")
    lines.append("")
    return "\n".join(lines)


def write_ledger(bp_id: str, rec: dict, ledger: list[Promise], out_dir: Path = OUT_DIR) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{bp_id}.ledger.md"
    path.write_text(ledger_markdown(bp_id, rec, ledger), encoding="utf-8")
    return path


# ------------------------------------------------------------------ ledger record (0104)
#
# The promise ledger RECORD (decision 0104 decision 3): one row per promise
# the source records make a place, each with a stable id
# `promise.<place-slug>.<slug>` built from its source path, its kind, its
# source (file and path) and its text. Generated here, never hand-written,
# committed at `world/sources/placement/promises/<place-id>.json`, and
# checked by `promise_gate.promise_gate_errors` at every compile. A row's
# `unfilled` block (one of the four 0102 reasons) is the builder's, so a
# regeneration keeps it for every row whose id survives.

CATALOGUE_REL = "world/sources/catalogue"
TRAVEL_SERVICES_REL = "world/sources/routes/travel-services.json"
#: the catalogue socket bucket -> the slug word its promise rows carry
SOCKET_BUCKETS = ("scene", "evidence", "post", "marks")


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", str(text).lower()).strip("-")


def _cap(text: str) -> str:
    return text[:1].upper() + text[1:]


def _record_file(place_id: str) -> str:
    for rf in catalogue.load_region_files():
        if any(r.get("id") == place_id for r in rf.places):
            return str(rf.path.relative_to(REPO_ROOT))
    return f"{CATALOGUE_REL}/?"


def _bucket_tail(sid: str, place_slug: str) -> str:
    """`post.claywater-station.poler` -> `poler` (the id past its bucket
    prefix and the place segment)."""
    parts = sid.split(".")[1:]
    if parts and parts[0] == place_slug:
        parts = parts[1:]
    return _slug("-".join(parts) or sid)


def _row(place_slug: str, slug: str, kind: str, file: str, path: str, text: str) -> dict:
    return {"id": f"promise.{place_slug}.{slug}", "kind": kind,
            "source": {"file": file, "path": path}, "text": text, "unfilled": None}


def ledger_rows(rec: dict, services_doc: dict | None = None) -> list[dict]:
    """Every promise row of one catalogue record, sorted by id."""
    place_id = rec["id"]
    place_slug = place_id.rsplit(".", 1)[-1]
    name = rec.get("name") or place_slug
    cat = _record_file(place_id)
    at = f"places[{place_id}]"
    rows: list[dict] = []
    for service in rec.get("services") or []:
        rows.append(_row(place_slug, f"service-{_slug(service)}", "service", cat,
                         f"{at}.services[{service}]", f"{name} offers the {service} service."))
    for key in ("notableNpcSlots",):
        for slot in rec.get(key) or []:
            sid = slot.get("slotId")
            rows.append(_row(place_slug, f"occupant-{_slug(sid)}", "occupant", cat,
                             f"{at}.{key}[{sid}]", f"{_cap(slot.get('role') or sid)} lives and "
                             f"works at {name}."))
    for slot in (rec.get("contents") or {}).get("npcs") or []:
        sid = slot.get("slotId")
        rows.append(_row(place_slug, f"occupant-{_slug(sid)}", "occupant", cat,
                         f"{at}.contents.npcs[{sid}]", f"{name} has {slot.get('count') or 'some'} "
                         f"{slot.get('role') or sid} occupants."))
    for svc in (services_doc or {}).get("services") or []:
        op = svc.get("operator") or {}
        if svc.get("status") != "active" or op.get("nearestPlaceId") != place_id:
            continue
        rows.append(_row(place_slug, f"operator-{_slug(svc['id'])}", "operator",
                         TRAVEL_SERVICES_REL, f"services[{svc['id']}].operator",
                         f"The {op.get('role') or 'operator'} runs the "
                         f"{svc.get('kind') or svc['id'].split('.')[0]} service from {name}."))
    for prov in (rec.get("questHooks") or {}).get("provisions") or []:
        rows.append(_row(place_slug, f"provision-{_slug(prov.removeprefix('quest.provision.'))}",
                         "provision", cat, f"{at}.questHooks.provisions[{prov}]",
                         f"{name} holds what quest provision {prov} needs."))
    sockets = rec.get("sockets") or {}
    for bucket in SOCKET_BUCKETS:
        for sid in dict.fromkeys(sockets.get(bucket) or []):
            rows.append(_row(place_slug, f"{bucket}-{_bucket_tail(sid, place_slug)}", "socketBucket",
                             cat, f"{at}.sockets.{bucket}[{sid}]",
                             f"{name} has the {bucket} socket {sid}."))
    # quests 20 §12: a settlement owes one safe (D0) interior
    if (rec.get("classification") or {}).get("class") == "settlement":
        rows.append(_row(place_slug, "safe-interior", "safeInterior", cat,
                         f"{at}.classification.class",
                         f"{name} has one safe interior (danger D0, quests 20 section 12)."))
    rows += claim_rows(rec, place_slug, name, cat, at)
    by_id: dict[str, dict] = {}
    for row in rows:
        by_id.setdefault(row["id"], row)
    return sorted(by_id.values(), key=lambda r: r["id"])


#: the record's prose fields the builder re-reads against the built place
#: (walk 7: Riverwalk's record spoke of a "northern trunk" on a coast site and
#: never named the shrine island that was built): each is a `prose` row the
#: builder confirms true of the built place, pinned to the text's hash
PROSE_FIELDS = (("why", ("founding", "siteAdvantages", "occupantsMotive", "pressures",
                         "wouldChangeIf")),
                ("vibe", ("silhouette", "palette", "materials", "signatureFeature", "condition",
                          "mood", "approach", "senses")),
                ("playerPurpose", ("hook",)),
                ("questHooks", ("opportunity",)))
QUESTS_DIR = REPO_ROOT / "world" / "sources" / "quests"


def text_sha(text: str) -> str:
    """The pin a `confirmed` block carries: the first 12 hex of the text's sha256."""
    import hashlib
    return hashlib.sha256(str(text).encode("utf-8")).hexdigest()[:12]


@functools.lru_cache(maxsize=4)
def _quest_docs(files: tuple[tuple[str, int], ...]) -> tuple[tuple[Path, object], ...]:
    """Every quest file parsed once per run (keyed by path and mtime, so an edit is re-read)."""
    return tuple((Path(f), json.loads(Path(f).read_text(encoding="utf-8"))) for f, _ in files)


def quest_rows_for(place_id: str, quests_dir: Path = QUESTS_DIR) -> dict[str, tuple[str, str]]:
    """quest code -> (its home file, "<code> <title>: <premise>") for every
    quest record (`world/sources/quests/*.json`, the home table the quest
    index renders) whose `settlement` or `anchorPlaces` names this place."""
    out: dict[str, tuple[str, str]] = {}
    files = tuple((str(p), p.stat().st_mtime_ns) for p in sorted(Path(quests_dir).glob("*.json")))
    for path, doc in _quest_docs(files):
        rows = doc.get("quests") if isinstance(doc, dict) else None
        for q in rows or []:
            if not isinstance(q, dict) or not q.get("code"):
                continue
            if q.get("settlement") != place_id and place_id not in (q.get("anchorPlaces") or []):
                continue
            rel = path.relative_to(REPO_ROOT) if path.is_relative_to(REPO_ROOT) else path
            out.setdefault(q["code"], (str(rel), f"{q['code']} {q.get('title')}: {q.get('premise')}"))
    return out


def claim_rows(rec: dict, place_slug: str, name: str, cat: str, at: str) -> list[dict]:
    """Every other claim of the record the build can keep or contradict
    (walk 7, owner: record, popup and built place 100% consistent):

    * `interior` - the principal interior (`interior` block + `entrance`),
      filled by the door that opens onto it;
    * `underwaterAccess` - a promised dive way in (`shallow-dive`, `deep-dive`,
      `argonian-only-depth`; `surface-swim` is the open water itself),
      filled by the door or socket that gives it;
    * `travelStation` - the modes and destinations, filled by the landing,
      dock or station socket they leave from;
    * `prose` - each `why`, `vibe`, purpose hook and quest-opportunity line,
      CONFIRMED (not filled): the builder re-reads it against the built
      place and records `confirmed: {sha, note}`; an edited text voids it;
    * `quest` - each quest record that anchors on the place, confirmed the
      same way (the place serves the quest as built).
    The structure count is measured, not a row (`place_gates` gate
    `record.consistency`)."""
    rows: list[dict] = []
    it = rec.get("interior") or {}
    if it.get("kind") not in (None, "none"):
        rows.append(_row(place_slug, "interior-principal", "interior", cat, f"{at}.interior",
                         f"{name}'s principal interior is a {it.get('family') or it.get('kind')} "
                         f"({it.get('sizeBand')}), entered by {it.get('entranceCount') or 1} "
                         f"{rec.get('entrance') or 'door'}."))
    uw = rec.get("underwaterAccess")
    # surface-swim is the water itself (swim in at the surface); a dive is a
    # built way in under the water, which a door or socket must give
    if uw not in (None, "none", "surface-swim"):
        rows.append(_row(place_slug, "underwater-access", "underwaterAccess", cat,
                         f"{at}.underwaterAccess", f"{name} can be entered from under the water "
                         f"({uw})."))
    ts = rec.get("travelStation") or {}
    if ts.get("modes") or ts.get("destinations"):
        rows.append(_row(place_slug, "travel-station", "travelStation", cat, f"{at}.travelStation",
                         f"{name} is a travel station ({', '.join(ts.get('modes') or [])}) to "
                         f"{len(ts.get('destinations') or [])} destinations."))
    for block, fields in PROSE_FIELDS:
        got = rec.get(block) or {}
        for field_ in fields:
            text = got.get(field_) if isinstance(got, dict) else None
            if isinstance(text, str) and text.strip():
                rows.append(_row(place_slug, f"prose-{_slug(block)}-{_slug(field_)}", "prose", cat,
                                 f"{at}.{block}.{field_}", text.strip()))
    for code, (file, premise) in sorted(quest_rows_for(rec["id"]).items()):
        rows.append(_row(place_slug, f"quest-{code.lower()}", "quest", file, f"quest[{code}]", premise))
    return rows


def _sha(path: Path) -> str:
    import hashlib
    return hashlib.sha256(path.read_bytes()).hexdigest()


def ledger_record(rec: dict, services_doc: dict | None = None,
                  previous: dict | None = None) -> dict:
    """The ledger document of one place; `previous` (the committed ledger)
    lends its `unfilled` blocks to the rows whose ids survive."""
    from .promise_gate import LEDGER_SCHEMA_VERSION
    prev = {r["id"]: r for r in (previous or {}).get("promises") or []}
    rows = ledger_rows(rec, services_doc)
    for row in rows:
        row["unfilled"] = (prev.get(row["id"]) or {}).get("unfilled")
        if row["kind"] in CONFIRMED_KINDS:
            # a confirmation holds only while its text is unchanged
            conf = (prev.get(row["id"]) or {}).get("confirmed")
            row.pop("unfilled")
            row["confirmed"] = conf if (conf or {}).get("sha") == text_sha(row["text"]) else None
    files = sorted({r["source"]["file"] for r in rows})
    return {"schemaVersion": LEDGER_SCHEMA_VERSION,
            "placeId": rec["id"],
            "generator": "python3 -m worldgen.blueprint_promises --id <place-id> --write "
                         "(decision 0104); never hand-edit a row but its `unfilled` or "
                         "`confirmed` block",
            "derivedFrom": [{"file": f, "sha256": _sha(REPO_ROOT / f)} for f in files
                            if (REPO_ROOT / f).exists()],
            "promises": rows}


def write_ledger_record(place_id: str, root: Path | None = None) -> Path:
    from .atomic_write import locked_write_text
    from .promise_gate import LEDGER_DIR, ledger_path, load_ledger
    root = root or LEDGER_DIR
    rec = load_record(place_id)
    if rec is None:
        raise SystemExit(f"{place_id}: no catalogue record")
    services_doc = json.loads((REPO_ROOT / TRAVEL_SERVICES_REL).read_text(encoding="utf-8"))
    doc = ledger_record(rec, services_doc, load_ledger(place_id, root))
    path = ledger_path(place_id, root)
    path.parent.mkdir(parents=True, exist_ok=True)
    locked_write_text(path, json.dumps(doc, indent=1, ensure_ascii=False) + "\n")
    return path


def main() -> int:
    ap = argparse.ArgumentParser(description="Build the promise ledger for the blueprints.")
    ap.add_argument("--id", help="one place id (default: every blueprint)")
    ap.add_argument("--write", action="store_true",
                    help="write the promise ledger record world/sources/placement/promises/"
                         "<place-id>.json (0104 decision 3; needs --id)")
    args = ap.parse_args()
    if args.write:
        if not args.id:
            ap.error("--write needs --id <place-id>")
        path = write_ledger_record(args.id)
        rows = json.loads(path.read_text())["promises"]
        print(f"{args.id}: {len(rows)} promise rows -> {path.relative_to(REPO_ROOT)}")
        return 0
    paths = blueprint_paths(BLUEPRINT_DIR)
    if args.id:
        paths = [p for p in paths if p.stem == args.id]
    rc = 0
    for path in paths:
        bp = json.loads(path.read_text())["blueprint"]
        rec = load_record(bp["id"])
        if rec is None:
            print(f"{bp['id']}: no catalogue record", file=sys.stderr)
            continue
        errors, warns, ledger = check_promises(bp, rec)
        out = write_ledger(bp["id"], rec, ledger)
        unmet = len([p for p in ledger if not p.met])
        print(f"{bp['id']}: {len(ledger) - unmet}/{len(ledger)} met, {unmet} unmet -> {out}")
        for m in errors:
            print(f"  ERROR {m}", file=sys.stderr)
            rc = 1
        for m in warns:
            print(f"  warn  {m}")
    return rc


if __name__ == "__main__":
    sys.exit(main())
