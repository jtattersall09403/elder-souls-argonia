"""Quest-derived interior sockets: the pins the quest plan asks for (16g).

    python3 -m worldgen.quest_promises --report
    python3 -m worldgen.quest_promises --apply

World 70 §48: "a quest-required socket is written from the quest plan, never
invented". This module is that writing step. It reads

  * `world/sources/quests/*.json` — which live records a quest ANCHORS
    (`anchorPlaces`, `settlement`; the row shape is
    world/sources/quests/README.md), and
  * the record's own `questHooks.tags` — the docs/quests/20 §11 world-provision
    vocabulary (LOC, APP, WATER, SCENE, EVIDENCE, BOSS, NPC, LOOT, …), which is
    where a place records what the quests that use it need from it,

and for every DUNGEON-KIND record a quest anchors it adds the anchor sockets
those tags ask for, each carrying the `quest.provision.*` id it answers.

It never invents a provision, never renames a socket, and never adds a second
socket of a kind that already answers the same provision. Rooms are touched in
exactly one way: a BOSS tag puts a `boss` room in the reveal, because a boss
socket with nowhere to stand is not a promise.

Run after `worldgen.migrate_interior_promises` and before
`worldgen.catalogue --check`.
"""

from __future__ import annotations

import argparse
import sys
from collections import Counter

from . import catalogue, quests

# The §11 tag -> the anchor socket it asks the interior for.
TAG_SOCKET = {
    "BOSS": "boss",
    "EVIDENCE": "evidence",
    "SCENE": "scene",
    "LOOT": "cache",
}
# NPC alone asks for nothing structural; NPC over a captive asks for a cell.
CAPTIVE_TAG = "NPC"


def anchored_place_ids(quest_dir=quests.QUEST_DIR) -> set[str]:
    out: set[str] = set()
    for q in quests.load_quests(quest_dir):
        out |= {p for p in (q.get("anchorPlaces") or []) if isinstance(p, str)}
        if isinstance(q.get("settlement"), str):
            out.add(q["settlement"])
    return out


def _has_captive(rec: dict) -> bool:
    if any(sl.get("role") == "captive"
           for sl in (rec.get("contents") or {}).get("npcs", []) or []):
        return True
    text = " ".join([s["role"] for s in (rec.get("notableNpcSlots") or [])]
                    + (rec.get("occupants") or []))
    return "captive" in text.lower() or "prisoner" in text.lower()


def wanted_socket_kinds(rec: dict) -> list[str]:
    tags = set((rec.get("questHooks") or {}).get("tags") or [])
    kinds = [TAG_SOCKET[t] for t in sorted(tags) if t in TAG_SOCKET]
    if CAPTIVE_TAG in tags and _has_captive(rec):
        kinds.append("captive")
    return sorted(set(kinds))


def provision_for(rec: dict) -> str | None:
    provisions = sorted((rec.get("questHooks") or {}).get("provisions") or [])
    for pid in provisions:
        if isinstance(pid, str) and pid.startswith("quest.provision."):
            return pid
    return None


def fill_record(rec: dict) -> list[str]:
    """Add the sockets this record's quest tags ask for. Returns their kinds."""
    it = rec.get("interior") or {}
    if it.get("kind") not in catalogue.DUNGEON_KINDS:
        return []
    provision = provision_for(rec)
    if provision is None:
        return []
    sockets = it.setdefault("anchorSockets", [])
    used = {s.get("id") for s in sockets}
    answered = {(s.get("kind"), s.get("provision")) for s in sockets}
    from .migrate_interior_promises import slug as socket_stem
    place_slug = socket_stem(rec["id"])
    added: list[str] = []
    for kind in wanted_socket_kinds(rec):
        if (kind, provision) in answered:
            continue
        # A socket of this kind with no provision yet is the one the quest
        # means: give it the provision rather than adding a twin.
        existing = next((s for s in sockets
                         if s.get("kind") == kind and s.get("provision") is None), None)
        if existing is not None:
            existing["provision"] = provision
            answered.add((kind, provision))
            added.append(kind)
            continue
        socket_id = f"socket.{place_slug}.{kind}"
        n = 2
        while socket_id in used:
            socket_id = f"socket.{place_slug}.{kind}-{n}"
            n += 1
        used.add(socket_id)
        sockets.append({"id": socket_id, "kind": kind,
                        "whereInInterior": catalogue_where(kind),
                        "provision": provision})
        answered.add((kind, provision))
        added.append(kind)
        if kind == "boss":
            rooms = it.get("roomFunctions") or []
            if "boss" not in rooms:
                rooms.append("boss")
                it["roomFunctions"] = rooms
    sockets.sort(key=lambda s: s["id"])
    return added


def catalogue_where(kind: str) -> str:
    from .migrate_interior_promises import WHERE_BY_SOCKET_KIND
    return WHERE_BY_SOCKET_KIND[kind]


def run(apply: bool) -> int:
    region_files = catalogue.load_region_files()
    anchored = anchored_place_ids()
    counts: Counter = Counter()
    places = 0
    for rf in region_files:
        for rec in rf.places:
            if rec["id"] not in anchored:
                continue
            added = fill_record(rec)
            if added:
                places += 1
                counts.update(added)
    print(f"quest-derived sockets on {places} dungeon-kind records:")
    for kind, n in sorted(counts.items()):
        print(f"  {kind}: {n}")
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
    args = ap.parse_args(argv)
    if not (args.apply or args.report):
        ap.error("pass --apply or --report")
    return run(args.apply)


if __name__ == "__main__":
    sys.exit(main())
