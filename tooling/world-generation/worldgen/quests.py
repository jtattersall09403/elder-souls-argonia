"""The quest skeleton as DATA: loader, validator and the registry/catalogue sync.

    python3 -m worldgen.quests --check   # validate the quest data against the catalogue
    python3 -m worldgen.quests --sync    # rewrite registries/quests.json + questHooks.tierOwnership

Why this exists. ``docs/quests/55-quest-index.md`` was a hand-maintained
markdown table, and the province needs 450-550 quests at maturity (Morrowind
density, docs/research/morrowind-content-density.md §4). One markdown table
cannot be written by eight region agents at once without clobbering, and it
cannot be checked. So the index is now generated from data:

    world/sources/quests/lines.json          every questline
    world/sources/quests/quests-main.json    the main-quest spine
    world/sources/quests/quests-factions.json
    world/sources/quests/quests-standalone.json
    world/sources/quests/quests-proposed.json
    world/sources/quests/local-<region>.json ONE PER REGION - a region agent
                                             owns exactly this file

``python3 -m worldgen.export_quest_index`` regenerates ``docs/quests/index/``
from the same data; ``--check`` runs inside ``npm test`` via
``worldgen/test_quests.py``.

Authoring rules and the shape taxonomy: ``world/sources/quests/README.md`` and
``docs/quests/index/README.md`` (§47a-c, moved out of 55).
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path

from . import catalogue

REPO_ROOT = Path(__file__).resolve().parents[3]
QUEST_DIR = REPO_ROOT / "world" / "sources" / "quests"
REGISTRY_PATH = REPO_ROOT / "world" / "sources" / "registries" / "quests.json"
PLACE_MAP_PATH = REPO_ROOT / "docs" / "quests" / "25-quest-place-map.md"

# docs/quests/25 §20b writes provisions in the quest docs' own notation
# (`LOC dungeon.eye_observatory`). The mechanical id is the tag dropped and
# dots/underscores turned to dashes — EXCEPT where a region agent had already
# coined an id for that place before the co-design pass ran; 25 §20b says those
# keep their existing ids. Those four are aliased here rather than renamed,
# because renaming an id is forbidden (registries README rule 3).
PROVISION_ALIASES = {
    "quest.provision.dungeon-eye-observatory": "quest.provision.underwater-xanmeer",
    "quest.provision.observatory": "quest.provision.underwater-xanmeer",
    "quest.provision.shadowscales-safehouse-ruin": "quest.provision.archon-shadowscale-facility",
}

SCHEMA_VERSION = 1

# 55 §47b, verbatim vocabulary. One primary shape (first), up to two secondary.
SHAPES = (
    "THEFT", "MURDER", "MISSING", "DISPUTE", "FRAUD", "PREDATOR", "CONTAMINATION",
    "SMUGGLING", "HAUNTING", "RITE", "SUCCESSION", "BONDAGE", "RECKONING",
    "EXPEDITION", "NEGOTIATION", "WONDER",
)
GROUPS = ("main", "faction", "line", "local", "daedric", "proposed")
STATUSES = ("live", "concept", "skeleton", "proposed")
COST_TIERS = (None, "S", "M", "L")
SHAPE_BUDGET = 0.20          # 55 §47c: no primary shape above ~20% of a packet
QUEST_ID_RE = re.compile(r"^quest\.[a-z0-9]+(-[a-z0-9]+)*\.[a-z0-9]+(-[a-z0-9]+)*$")
CODE_RE = re.compile(r"^[A-Z]{2}\d{2}$")

# The magnitude ladder from docs/research/morrowind-content-density.md §4:
# quests a settlement of each size should originate at maturity.
DEMAND_BAND = {"M5": (35, 60), "M4": (10, 20), "M3": (3, 8), "M2": (1, 3), "M1": (0, 2)}
PROVINCE_TARGET = (450, 550)          # mature finite quests
MILESTONE_1_TARGET = (170, 210)

# group -> the registry's `tier` string and `kind`, so registries/quests.json
# keeps the vocabulary it already used.
REG_TIER = {"main": "main", "faction": "faction", "line": "line",
            "local": "local", "daedric": "daedric", "proposed": "proposed"}
REG_KIND = {"main": "main-quest", "faction": "faction-quest", "line": "line-quest",
            "local": "local-quest", "daedric": "daedric-quest", "proposed": "proposed-quest"}


# --------------------------------------------------------------------------- load

@dataclass
class Packet:
    path: Path
    packet: str
    seed: str
    quests: list[dict] = field(default_factory=list)
    budget_exceptions: dict = field(default_factory=dict)


def _read(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("schemaVersion") != SCHEMA_VERSION:
        raise ValueError(f"{path.name}: schemaVersion must be {SCHEMA_VERSION}")
    return data


def load_lines(quest_dir: Path = QUEST_DIR) -> list[dict]:
    return _read(quest_dir / "lines.json")["lines"]


def load_packets(quest_dir: Path = QUEST_DIR) -> list[Packet]:
    """Every quest packet file, in a deterministic order."""
    out = []
    for path in sorted(quest_dir.glob("*.json")):
        if path.name == "lines.json":
            continue
        data = _read(path)
        packet = path.stem
        if data.get("packet") != packet:
            raise ValueError(f"{path.name}: packet field must be '{packet}'")
        out.append(Packet(path, packet, data.get("seed", ""), data["quests"],
                          data.get("budgetExceptions") or {}))
    return out


def load_quests(quest_dir: Path = QUEST_DIR) -> list[dict]:
    qs = [q for p in load_packets(quest_dir) for q in p.quests]
    qs.sort(key=lambda q: q["id"])
    return qs


def dump_json(path: Path, data: dict) -> None:
    """The one way to write quest data (standard 4: byte-stable output)."""
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def live_places(catalogue_dir: Path = catalogue.CATALOGUE_DIR) -> dict[str, dict]:
    """id -> record, for records that actually exist in the world."""
    out = {}
    for rf in catalogue.load_region_files(catalogue_dir):
        for rec in rf.places:
            if rec.get("status") not in ("deferred", "cut"):
                out[rec["id"]] = rec
    return out


def provision_id(token: str) -> str:
    """`LOC dungeon.lost_city` -> `quest.provision.dungeon-lost-city` (25 §20a)."""
    token = token.removeprefix("poi.")
    return "quest.provision." + token.replace("_", "-").replace(".", "-")


def place_map_provisions(path: Path = PLACE_MAP_PATH) -> list[str]:
    """Every provision token named in the §20b tables of docs/quests/25."""
    text = path.read_text(encoding="utf-8")
    section = text.split("## 20b.")[1].split("## 20c.")[0]
    tokens: set[str] = set()
    for line in section.splitlines():
        if not line.startswith("|"):
            continue
        cell = line.split("|")[1]          # the provision column only
        for tag, name in re.findall(r"`(?:(LOC|STATE|BOSS|FAST|POI)\s+)?([A-Za-z0-9_.]+)`", cell):
            if tag or name.startswith("poi."):
                tokens.add(name)
    return sorted(tokens)


def region_names(catalogue_dir: Path = catalogue.CATALOGUE_DIR) -> list[str]:
    return [rf.region for rf in catalogue.load_region_files(catalogue_dir)]


# --------------------------------------------------------------------------- check

def budget_groups(quests: list[dict]) -> dict[str, list[dict]]:
    """A quest's shape budget is judged against its LINE where it has one, and
    against its packet otherwise. A ten-quest faction line hidden inside a
    102-row file would otherwise never trip the 20% rule."""
    groups: dict[str, list[dict]] = defaultdict(list)
    for q in quests:
        groups[q["line"] or f"packet:{q['_packet']}"].append(q)
    return dict(groups)


def check(quest_dir: Path = QUEST_DIR,
          catalogue_dir: Path = catalogue.CATALOGUE_DIR,
          registry_path: Path = REGISTRY_PATH) -> list[str]:
    errors: list[str] = []
    lines = load_lines(quest_dir)
    by_line = {l["id"]: l for l in lines}
    if len(by_line) != len(lines):
        errors.append("lines.json: duplicate line id")
    for l in lines:
        if l["group"] not in GROUPS:
            errors.append(f"{l['id']}: group must be one of {GROUPS}")
        if not isinstance(l.get("tier"), int) or not 0 <= l["tier"] <= 3:
            errors.append(f"{l['id']}: tier must be an int 0-3")

    places = live_places(catalogue_dir)
    regions = set(region_names(catalogue_dir))
    packets = load_packets(quest_dir)

    # every region owns exactly one local packet, so region agents never collide
    for region in sorted(regions):
        if not (quest_dir / f"local-{region}.json").exists():
            errors.append(f"missing quest packet local-{region}.json for catalogue region {region}")

    seen: dict[str, str] = {}
    all_quests: list[dict] = []
    for pk in packets:
        ids = [q["id"] for q in pk.quests]
        if ids != sorted(ids):
            errors.append(f"{pk.path.name}: quests must be sorted by id")
        for q in pk.quests:
            q = dict(q, _packet=pk.packet)
            all_quests.append(q)
            qid, code = q.get("id", "<no id>"), q.get("code", "")
            def bad(msg: str) -> None:
                errors.append(f"{qid} ({pk.path.name}): {msg}")
            if qid in seen:
                bad(f"id already used in {seen[qid]}")
            seen[qid] = pk.path.name
            if not QUEST_ID_RE.match(qid):
                bad("id must be quest.<slug>.<slug> in lower kebab")
            if not CODE_RE.match(code):
                bad("code must be two capitals and two digits (MQ01)")
            elif not qid.endswith("." + code.lower()):
                bad(f"id must end with the code ({code.lower()})")
            line = by_line.get(q.get("line"))
            if line is None:
                bad(f"line {q.get('line')!r} is not in lines.json")
            elif q.get("group") != line["group"]:
                bad(f"group {q.get('group')!r} must match its line's group {line['group']!r}")
            if q.get("group") not in GROUPS:
                bad(f"group must be one of {GROUPS}")
            if q.get("status") not in STATUSES:
                bad(f"status must be one of {STATUSES}")
            if not isinstance(q.get("tier"), int) or not 0 <= q["tier"] <= 3:
                bad("tier must be an int 0-3")
            if q.get("milestone") not in (1, 2):
                bad("milestone must be 1 or 2")
            if q.get("costTier") not in COST_TIERS:
                bad(f"costTier must be one of {COST_TIERS}")
            shapes = q.get("shapes") or []
            if not 1 <= len(shapes) <= 3:
                bad("shapes must hold one primary and up to two secondary shapes")
            if len(set(shapes)) != len(shapes):
                bad("shapes must not repeat")
            for s in shapes:
                if s not in SHAPES:
                    bad(f"unknown shape {s!r} (55 §47b taxonomy)")
            if q.get("region") is not None and q["region"] not in regions:
                bad(f"region {q['region']!r} is not a catalogue region")
            anchors = q.get("anchorPlaces") or []
            if anchors != sorted(set(anchors)):
                bad("anchorPlaces must be sorted and unique")
            for pid in anchors:
                if pid not in places:
                    bad(f"anchorPlace {pid} is not a LIVE catalogue record")
            sett = q.get("settlement")
            if sett is not None:
                if sett not in places:
                    bad(f"settlement {sett} is not a LIVE catalogue record")
                elif places[sett]["classification"]["class"] != "settlement":
                    bad(f"settlement {sett} is not classified as a settlement")
                elif sett not in anchors:
                    bad(f"settlement {sett} must also appear in anchorPlaces")
            for key in ("title", "premise"):
                if not isinstance(q.get(key), str) or not q[key].strip():
                    bad(f"{key} must be a non-empty string")
            for key in ("touches", "sources"):
                if not isinstance(q.get(key), list):
                    bad(f"{key} must be a list")

    # 55 §47c shape budget, per line (or per packet for line-less quests)
    excused: dict[str, dict[str, str]] = {}
    for pk in packets:
        for group, shapes in pk.budget_exceptions.items():
            excused.setdefault(group, {}).update(shapes)
    for group, qs in sorted(budget_groups(all_quests).items()):
        if len(qs) < 5:
            continue          # too small for a percentage to mean anything
        counts = Counter(q["shapes"][0] for q in qs if q.get("shapes"))
        limit = SHAPE_BUDGET * len(qs)
        for shape, n in sorted(counts.items()):
            if n <= limit:
                continue
            msg = (f"shape budget: {shape} is the primary shape of {n}/{len(qs)} "
                   f"quests in {group} (55 §47c allows ~{SHAPE_BUDGET:.0%})")
            reason = excused.get(group, {}).get(shape)
            if reason:
                print(f"note: {msg} — recorded reason: {reason}")
            else:
                errors.append(msg)

    # provisions: an id nobody live carries is a promise the world cannot keep
    all_prov: set[str] = set()
    live_prov: set[str] = set()
    for rf in catalogue.load_region_files(catalogue_dir):
        for rec in rf.places:
            got = set((rec.get("questHooks") or {}).get("provisions") or [])
            all_prov |= got
            if rec.get("status") not in ("deferred", "cut"):
                live_prov |= got
    for pid in sorted(all_prov - live_prov):
        errors.append(f"provision {pid} is carried only by deferred/cut records — "
                      f"promote one or move the provision")
    for token in place_map_provisions():
        pid = provision_id(token)
        pid = PROVISION_ALIASES.get(pid, pid)
        if pid not in live_prov:
            errors.append(f"docs/quests/25 §20b names provision `{token}` ({pid}) "
                          f"but no LIVE catalogue record carries it")

    # registry parity, both directions
    reg = json.loads(registry_path.read_text(encoding="utf-8"))
    reg_quests = {e["id"] for e in reg["entries"] if e.get("kind") != "questline"}
    reg_lines = {e["id"] for e in reg["entries"] if e.get("kind") == "questline"}
    data_quests = {q["id"] for q in all_quests}
    data_lines = set(by_line)
    for missing in sorted(data_quests - reg_quests):
        errors.append(f"{missing} has no entry in world/sources/registries/quests.json "
                      f"(run `python3 -m worldgen.quests --sync`)")
    for orphan in sorted(reg_quests - data_quests):
        errors.append(f"registries/quests.json entry {orphan} has no quest data row")
    for missing in sorted(data_lines - reg_lines):
        errors.append(f"{missing} has no questline entry in registries/quests.json (--sync)")
    for orphan in sorted(reg_lines - data_lines):
        errors.append(f"registries/quests.json questline {orphan} has no row in lines.json")
    return errors


# --------------------------------------------------------------------------- sync

def build_registry(quest_dir: Path = QUEST_DIR,
                   registry_path: Path = REGISTRY_PATH) -> dict:
    """Re-derive registries/quests.json from the data, preserving authored prose."""
    old = json.loads(registry_path.read_text(encoding="utf-8"))
    prior = {e["id"]: e for e in old["entries"]}
    entries: list[dict] = []

    for l in load_lines(quest_dir):
        p = prior.get(l["id"], {})
        e = {"id": l["id"], "name": p.get("name") or f"{l['name']} line",
             "kind": "questline", "status": p.get("status", "derived"),
             "sources": p.get("sources") or l.get("sources") or [],
             "notes": p.get("notes") or l.get("notes", ""),
             "faction": l.get("faction"), "milestone": p.get("milestone", 1)}
        if p.get("depth"):
            e["depth"] = p["depth"]
        entries.append(e)

    for q in load_quests(quest_dir):
        p = prior.get(q["id"], {})
        line = q["line"]
        faction = p.get("faction")
        if faction is None:
            faction = next((l.get("faction") for l in load_lines(quest_dir)
                            if l["id"] == line and l["group"] == "faction"), None)
        entries.append({
            "id": q["id"], "name": q["title"],
            "kind": p.get("kind") or REG_KIND[q["group"]],
            "status": p.get("status", "placeholder"),
            "sources": p.get("sources") or q.get("sources") or [],
            "notes": p.get("notes") or q["premise"],
            "code": q["code"], "tier": REG_TIER[q["group"]], "milestone": q["milestone"],
            "line": line, "faction": faction, "questStatus": q["status"],
        })

    entries.sort(key=lambda e: e["id"])
    return {"schemaVersion": old.get("schemaVersion", 1), "domain": "quest",
            "_": old.get("_", ""), "entries": entries}


_OWN_RE = re.compile(r"^([A-Z]{2}\d{2}(?:,\s*[A-Z]{2}\d{2})*)\s*·\s*tier-(\d)$")


def ownership_lines(quest_dir: Path = QUEST_DIR) -> dict[str, list[tuple[int, str]]]:
    """place id -> [(tier, CODE)] claimed by the quest data."""
    out: dict[str, set[tuple[int, str]]] = defaultdict(set)
    for q in load_quests(quest_dir):
        for pid in q.get("anchorPlaces") or []:
            out[pid].add((q["tier"], q["code"]))
    return {k: sorted(v) for k, v in out.items()}


def sync_catalogue(quest_dir: Path = QUEST_DIR,
                   catalogue_dir: Path = catalogue.CATALOGUE_DIR,
                   write: bool = True) -> tuple[list[str], list[str]]:
    """Write questHooks.tierOwnership back onto live catalogue records.

    Existing ownership the quest data cannot explain (``tier-2 shared``,
    ``province system · tier-1``) is KEPT and reported, never silently dropped.
    """
    owners = ownership_lines(quest_dir)
    changed: list[str] = []
    kept: list[str] = []
    for rf in catalogue.load_region_files(catalogue_dir):
        dirty = False
        for rec in rf.places:
            if rec.get("status") in ("deferred", "cut"):
                # never write ownership onto a record that is not in the world;
                # report it instead, because it is usually a re-deferred anchor
                if (rec.get("questHooks") or {}).get("tierOwnership"):
                    kept.append(f"{rec['id']}: DEFERRED but still carries "
                                f"tierOwnership {rec['questHooks']['tierOwnership']!r} "
                                f"— promote it or clear the claim")
                continue
            hooks = rec.get("questHooks")
            if hooks is None:
                continue
            existing = [p.strip() for p in (hooks.get("tierOwnership") or "").split(";") if p.strip()]
            unknown = [p for p in existing if not _OWN_RE.match(p)]
            known = [f"{code} · tier-{tier}" for tier, code in owners.get(rec["id"], [])]
            merged = known + unknown
            for u in unknown:
                kept.append(f"{rec['id']}: kept unrecognised ownership {u!r}")
            new = "; ".join(merged) or None
            if new != hooks.get("tierOwnership"):
                changed.append(f"{rec['id']}: {hooks.get('tierOwnership')!r} -> {new!r}")
                hooks["tierOwnership"] = new
                dirty = True
        if dirty and write:
            catalogue.dump_json(rf.path, {"schemaVersion": catalogue.PLACES_SCHEMA_VERSION,
                                          "region": rf.region, "seed": rf.seed,
                                          "places": rf.places})
    return changed, kept


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--sync", action="store_true")
    args = ap.parse_args(argv)
    if not (args.check or args.sync):
        ap.error("pass --check or --sync")

    if args.sync:
        dump_json(REGISTRY_PATH, build_registry())
        print(f"wrote {REGISTRY_PATH.relative_to(REPO_ROOT)}")
        changed, kept = sync_catalogue()
        for line in changed:
            print(f"  tierOwnership {line}")
        for line in kept:
            print(f"  {line}")
        print(f"{len(changed)} catalogue records changed, {len(kept)} unrecognised ownerships kept")

    if args.check:
        errors = check()
        for e in errors:
            print(f"ERROR {e}", file=sys.stderr)
        print(f"quests: {len(load_quests())} rows, {len(load_lines())} lines, {len(errors)} errors")
        return 1 if errors else 0
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
