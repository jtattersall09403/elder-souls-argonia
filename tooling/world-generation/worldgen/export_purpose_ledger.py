"""The purpose ledger: every promise a blueprint makes to the player, and the
phase that has to deliver it.

Owner review, 2026-09-08 — a `playerPurpose` entry is a commitment ("a fence
who buys salvage", "a rentable bed", "the quest-giver of the Retired Rota"),
but nothing downstream was obliged to build it. `blueprint_promises` does this
job for the MACRO layer (what the catalogue record promised, what the blueprint
built); this module does it for the layer below: what the blueprint promised,
and what Phase 12 (interiors and dressing), Phase 13 (loot, occupants,
encounters) and the quest data must produce.

    cd tooling/world-generation
    python3 -m worldgen.export_purpose_ledger            # write the ledger
    python3 -m worldgen.export_purpose_ledger --check    # fail if stale

Output: `world/sources/sites/purpose-ledger.json` — province-wide, schema
versioned, one stable id per row, sorted, byte-stable (test_export_purpose_ledger
keeps the committed file current with the blueprints).

Each row carries what a compiler needs to check itself:

    placeId / parcelId    where the promise stands
    kind / tier / note    the promise, in the closed vocabulary
    deliveredBy           "phase-12" | "phase-13" | "quests"
    deliverable           the thing that phase must produce, in words
    interiorKind          the parcel's interior class (or "exterior")
    interiorRef           the built kit the door claims, when there is one
    socketRef / questId   for the quest purposes, the socket and the quest row

Phase 12/13 CONSUME this file (module 95): a row with no delivered object is a
hard failure there, the same shape as an unmet macro promise.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

from . import blueprint as bp_mod
from .player_purpose import PURPOSE_KINDS, PURPOSE_PHASE

REPO_ROOT = Path(__file__).resolve().parents[3]
OUT_PATH = REPO_ROOT / "world" / "sources" / "sites" / "purpose-ledger.json"
SCHEMA_VERSION = 1


def _slug(identifier: str) -> str:
    return identifier.rsplit(".", 1)[-1]


def build(blueprint_dir: Path = bp_mod.BLUEPRINT_DIR) -> dict:
    rows: list[dict] = []
    for path in sorted(blueprint_dir.glob("*.json")):
        bp = json.loads(path.read_text()).get("blueprint") or {}
        place_id = bp.get("id")
        sockets = {s.get("id"): s for s in bp.get("questSockets") or []}
        interior_refs: dict[str, str] = {}
        for door in bp.get("doors") or []:
            ref = (door.get("interiorClaim") or {}).get("interiorRef")
            if ref and door.get("parcelId"):
                interior_refs.setdefault(door["parcelId"], ref)
        for parcel in bp.get("parcels") or []:
            pid = parcel.get("id")
            seen: dict[str, int] = {}
            for entry in parcel.get("playerPurpose") or []:
                kind = entry.get("kind")
                if kind not in PURPOSE_KINDS:
                    continue
                n = seen.get(kind, 0) + 1
                seen[kind] = n
                suffix = "" if n == 1 else f"-{n}"
                socket_ref = entry.get("socketRef")
                socket = sockets.get(socket_ref) or {}
                rows.append({
                    "id": f"purpose.{_slug(place_id)}.{_slug(pid)}.{kind}{suffix}",
                    "placeId": place_id,
                    "parcelId": pid,
                    "kind": kind,
                    "tier": PURPOSE_KINDS[kind][0],
                    "note": entry.get("note"),
                    "deliveredBy": PURPOSE_PHASE[kind],
                    "deliverable": PURPOSE_KINDS[kind][1],
                    "interiorKind": (parcel.get("interior") or {}).get("kind") or "exterior",
                    "interiorRef": interior_refs.get(pid),
                    "socketRef": socket_ref,
                    "socketKind": socket.get("kind"),
                    "questId": socket.get("questId"),
                })
    rows.sort(key=lambda r: r["id"])
    by_phase: dict[str, int] = {}
    by_kind: dict[str, int] = {}
    for r in rows:
        by_phase[r["deliveredBy"]] = by_phase.get(r["deliveredBy"], 0) + 1
        by_kind[r["kind"]] = by_kind.get(r["kind"], 0) + 1
    return {
        "schemaVersion": SCHEMA_VERSION,
        "kind": "purpose-ledger",
        "generatedBy": "worldgen.export_purpose_ledger (owner review 2026-09-08)",
        "consumedBy": ["phase-12 interiors/dressing", "phase-13 loot/occupants/encounters",
                       "quest authoring (docs/quests/)"],
        "summary": {"rows": len(rows), "places": len({r["placeId"] for r in rows}),
                    "byPhase": dict(sorted(by_phase.items())),
                    "byKind": dict(sorted(by_kind.items()))},
        "rows": rows,
    }


def serialise(doc: dict) -> str:
    return json.dumps(doc, ensure_ascii=False, indent=2) + "\n"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--check", action="store_true",
                    help="fail when the committed ledger is not what the blueprints say")
    a = ap.parse_args(argv)
    text = serialise(build())
    if a.check:
        current = OUT_PATH.read_text(encoding="utf-8") if OUT_PATH.exists() else ""
        if current != text:
            print("purpose-ledger: STALE — run 'python3 -m worldgen.export_purpose_ledger'",
                  file=sys.stderr)
            return 1
        print("purpose-ledger: current")
        return 0
    OUT_PATH.write_text(text, encoding="utf-8")
    doc = json.loads(text)
    print(f"purpose-ledger: {doc['summary']['rows']} rows over "
          f"{doc['summary']['places']} places; {doc['summary']['byPhase']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
