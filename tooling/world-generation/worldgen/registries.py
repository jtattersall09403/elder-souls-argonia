"""World registries: one framework for every id-linked vocabulary in the world.

    python3 -m worldgen.registries --check   # validate all registries + cross-check the catalogue
    python3 -m worldgen.registries --sync    # re-derive the catalogue-sourced registries (deeds, rumour pools, factions)

Why one framework (decision 0044). The catalogue already links records to
things that have no file behind them: ``hostility.owner`` and
``contents.npcs[].faction`` name ~110 ``faction.*`` ids, ``deedCounterKeys``
name ~300 ``deed.*`` counters, ``rumourPoolKey`` names ~165 pools, and
``contents.*[].registerRef`` is a hole reserved for the Phase 13 creature, NPC
and item registers. Five ad-hoc files would each grow their own loader,
schema and drift. Instead every domain is one file with the same shape, one
loader, one validator and one set of cross-checks.

File: ``world/sources/registries/<domain-file>.json``::

    {"schemaVersion": 1, "domain": "faction", "entries": [
      {"id": "faction.naga-kur", "name": "The Naga-Kur", "kind": "tribal-power",
       "status": "canon", "sources": ["UESP:Lore:Naga"], "notes": "one line", ...}
    ]}

IDs are ``<domain>.<slug>`` (or ``<domain>.<packet>.<slug>``), lower kebab,
globally unique. These are *vocabulary* ids, not placed-object ids, so the
two-segment form is legal — engineering standard 2's three-segment shape is
relaxed for these files via ``idShape: "flat"`` in the id registry.

Who grows what: see ``world/sources/registries/README.md``.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
REGISTRY_DIR = REPO_ROOT / "world" / "sources" / "registries"
CATALOGUE_DIR = REPO_ROOT / "world" / "sources" / "catalogue"

SCHEMA_VERSION = 1
STATUSES = {"canon", "derived", "placeholder"}
ID_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*)+$")
REQUIRED_FIELDS = ("id", "name", "kind", "status", "sources", "notes")

# contents bucket -> the registry domain its `registerRef` must resolve into.
REGISTER_REF_DOMAIN = {"creatures": "creature", "npcs": "npc", "loot": "item"}


# --------------------------------------------------------------------------- load

def registry_files(directory: Path = REGISTRY_DIR) -> list[Path]:
    return sorted(p for p in directory.glob("*.json"))


def _label(path: Path) -> str:
    """Repo-relative path for messages; falls back to the absolute path (tests)."""
    try:
        return str(path.relative_to(REPO_ROOT))
    except ValueError:
        return str(path)


def load_one(path: Path) -> dict:
    data = json.loads(path.read_text())
    if data.get("schemaVersion") != SCHEMA_VERSION:
        raise ValueError(f"{path.name}: schemaVersion must be {SCHEMA_VERSION}")
    if not isinstance(data.get("entries"), list):
        raise ValueError(f"{path.name}: missing `entries` list")
    if not isinstance(data.get("domain"), str) or not data["domain"]:
        raise ValueError(f"{path.name}: missing `domain`")
    return data


def load_all(directory: Path = REGISTRY_DIR) -> dict[str, dict]:
    """domain -> registry document. Raises on a duplicated domain."""
    out: dict[str, dict] = {}
    for path in registry_files(directory):
        data = load_one(path)
        domain = data["domain"]
        if domain in out:
            raise ValueError(f"{path.name}: domain '{domain}' already defined")
        data["_path"] = str(path)
        data["_label"] = _label(path)
        out[domain] = data
    return out


def ids(domain: str, registries: dict[str, dict] | None = None) -> set[str]:
    registries = registries if registries is not None else load_all()
    doc = registries.get(domain)
    return {e["id"] for e in doc["entries"]} if doc else set()


# ----------------------------------------------------------------------- validate

def validate(registries: dict[str, dict] | None = None) -> list[str]:
    registries = registries if registries is not None else load_all()
    problems: list[str] = []
    seen: dict[str, str] = {}
    for domain, doc in registries.items():
        where = doc.get("_label", domain)
        for entry in doc["entries"]:
            if not isinstance(entry, dict):
                problems.append(f"{where}: entry is not an object")
                continue
            eid = entry.get("id")
            missing = [f for f in REQUIRED_FIELDS if f not in entry]
            if missing:
                problems.append(f"{where}: {eid or '<no id>'} missing {', '.join(missing)}")
                continue
            if not ID_RE.match(eid):
                problems.append(f"{where}: id '{eid}' is not lower-kebab <domain>.<slug>")
            elif eid.split(".")[0] != domain:
                problems.append(f"{where}: id '{eid}' does not start with domain '{domain}.'")
            if entry["status"] not in STATUSES:
                problems.append(f"{where}: {eid} status '{entry['status']}' not in {sorted(STATUSES)}")
            if not isinstance(entry["sources"], list):
                problems.append(f"{where}: {eid} sources must be a list")
            elif entry["status"] == "canon" and not entry["sources"]:
                problems.append(f"{where}: {eid} is status 'canon' with no sources (lore golden rule)")
            if not entry["notes"]:
                problems.append(f"{where}: {eid} has an empty notes line")
            if eid in seen:
                problems.append(f"{where}: id '{eid}' already used in {seen[eid]}")
            else:
                seen[eid] = where
    return problems


# -------------------------------------------------------------------- catalogue

def catalogue_places(directory: Path = CATALOGUE_DIR) -> list[dict]:
    places: list[dict] = []
    for path in sorted(directory.glob("places-*.json")):
        places.extend(json.loads(path.read_text())["places"])
    return places


def catalogue_refs(places: list[dict] | None = None) -> dict[str, set[str]]:
    """Every registry-linked id the catalogue uses, grouped by domain."""
    places = places if places is not None else catalogue_places()
    out: dict[str, set[str]] = {d: set() for d in ("faction", "deed", "rumour", "creature", "npc", "item")}
    for p in places:
        owner = (p.get("hostility") or {}).get("owner")
        if owner:
            out["faction"].add(owner)
        if p.get("ownerFaction"):
            out["faction"].add(p["ownerFaction"])
        contents = p.get("contents") or {}
        for bucket, domain in REGISTER_REF_DOMAIN.items():
            for slot in contents.get(bucket) or []:
                if slot.get("faction"):
                    out["faction"].add(slot["faction"])
                if slot.get("registerRef"):
                    out[domain].add(slot["registerRef"])
        out["deed"].update(p.get("deedCounterKeys") or [])
        if p.get("rumourPoolKey"):
            out["rumour"].add(p["rumourPoolKey"])
    return out


def cross_check(registries: dict[str, dict] | None = None,
                places: list[dict] | None = None) -> list[str]:
    """Every registry-linked id used by the catalogue must exist in its registry."""
    registries = registries if registries is not None else load_all()
    used = catalogue_refs(places)
    problems: list[str] = []
    for domain, refs in used.items():
        known = ids(domain, registries)
        if domain not in registries:
            for ref in sorted(refs):
                problems.append(f"catalogue: unregistered {domain} id '{ref}' "
                                f"(there is no {domain} registry at all)")
            continue
        for ref in sorted(refs - known):
            problems.append(f"catalogue: unregistered {domain} id '{ref}' "
                            f"(add it to {registries[domain]['_label']})")
    return problems


def check(directory: Path = REGISTRY_DIR, places: list[dict] | None = None) -> list[str]:
    registries = load_all(directory)
    return validate(registries) + cross_check(registries, places)


# ------------------------------------------------------------------------- sync

def _entry(eid: str, name: str, kind: str, status: str, notes: str, **extra) -> dict:
    return {"id": eid, "name": name, "kind": kind, "status": status,
            "sources": extra.pop("sources", []), "notes": notes, **extra}


def _titlecase(slug: str) -> str:
    return " ".join(w.capitalize() for w in slug.replace(".", " ").split("-"))


def sync(directory: Path = REGISTRY_DIR) -> list[str]:
    """Append catalogue-used ids that are missing from their registry, as placeholders.

    Never removes or rewrites an authored entry — this only closes the gap a
    catalogue edit opens, so the cross-check stays cheap to satisfy.
    """
    registries = load_all(directory)
    used = catalogue_refs()
    added: list[str] = []
    defaults = {
        "faction": ("group", "Catalogue-sourced; brief not yet written."),
        "deed": ("counter", "Deed counter named by a place record."),
        "rumour": ("pool", "Rumour pool named by a place record."),
        "creature": ("species", "Named by a place record's registerRef."),
        "npc": ("individual", "Named by a place record's registerRef."),
        "item": ("item", "Named by a place record's registerRef."),
    }
    for domain, refs in used.items():
        doc = registries.get(domain)
        if doc is None:
            continue
        known = {e["id"] for e in doc["entries"]}
        new = sorted(refs - known)
        if not new:
            continue
        kind, note = defaults[domain]
        for eid in new:
            doc["entries"].append(_entry(eid, _titlecase(eid.split(".", 1)[1]), kind,
                                         "placeholder", note, sources=["catalogue"]))
            added.append(eid)
        doc["entries"].sort(key=lambda e: e["id"])
        path = Path(doc.pop("_path"))
        doc.pop("_label", None)
        path.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n")
    return added


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--sync", action="store_true")
    args = ap.parse_args(argv)
    if args.sync:
        added = sync()
        print(f"sync: added {len(added)} placeholder entries")
        for a in added:
            print("  +", a)
    problems = check()
    for p in problems:
        print("FAIL", p)
    if not problems:
        registries = load_all()
        total = sum(len(d["entries"]) for d in registries.values())
        print(f"registries OK — {len(registries)} domains, {total} entries")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
