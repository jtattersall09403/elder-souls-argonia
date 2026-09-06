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
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path

from . import catalogue
from .catalogue import SERVICES

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
MODE_KIND = {"boat": "boat", "ferry": "ferry", "lighter": "ferry", "pilot": "ferry",
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

    @property
    def met(self) -> bool:
        return bool(self.realisedBy)


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
        svc = p.get("service")
        if svc:
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
    """The two fields this module adds to the blueprint schema."""
    errs: list[str] = []
    parcel_ids = {p["id"] for p in bp.get("parcels", []) or []}
    for p in bp.get("parcels", []) or []:
        svc = p.get("service")
        if svc is not None and svc not in SERVICES:
            errs.append(f"{p['id']}: `service` must be one of {sorted(SERVICES)} (97 E9)")
    for o in bp.get("occupants", []) or []:
        for key in ("worksAt", "livesAt"):
            ref = o.get(key)
            if ref is not None and ref not in parcel_ids:
                errs.append(f"occupant {o.get('slotId')}: `{key}` -> {ref} is not a parcel in this "
                            f"blueprint (97 E9)")
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

    out.sort(key=lambda p: p.id)
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


# ------------------------------------------------------------------ report

def ledger_markdown(bp_id: str, rec: dict, ledger: list[Promise]) -> str:
    met = [p for p in ledger if p.met]
    unmet = [p for p in ledger if not p.met]
    mag = (rec.get("classification") or {}).get("magnitude") or "—"
    lines = [f"# Promise ledger — {rec.get('name', bp_id)} (`{bp_id}`)", "",
             f"Magnitude {mag} · {len(met)} of {len(ledger)} promises met · "
             f"unmet are {'compile errors' if mag in HARD_FROM_MAGNITUDE else 'warnings'} "
             f"(97 E9, G22).", "",
             "| Promise | Kind | From | Met by | Remedy if not |", "|---|---|---|---|---|"]
    for p in ledger:
        realised = ", ".join(f"`{r}`" for r in p.realisedBy[:3]) if p.met else "**—**"
        lines.append(f"| {p.promise} | {p.kind} | {p.source} | {realised} | "
                     f"{'' if p.met else p.remedy} |")
    lines.append("")
    return "\n".join(lines)


def write_ledger(bp_id: str, rec: dict, ledger: list[Promise], out_dir: Path = OUT_DIR) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{bp_id}.ledger.md"
    path.write_text(ledger_markdown(bp_id, rec, ledger), encoding="utf-8")
    return path


def main() -> int:
    ap = argparse.ArgumentParser(description="Build the promise ledger for the blueprints.")
    ap.add_argument("--id", help="one place id (default: every blueprint)")
    args = ap.parse_args()
    paths = sorted(BLUEPRINT_DIR.glob("*.json"))
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
