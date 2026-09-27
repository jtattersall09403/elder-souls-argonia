"""The promise gate (decision 0104 decision 5): every row of a place's
promise ledger is filled by a placed thing, or excused with one of the four
decision 0102 reasons.

The ledger is ``world/sources/placement/promises/<place-id>.json``, generated
by ``python3 -m worldgen.blueprint_promises --id <place-id> --write`` from
the source records (0104 decision 3). A socket (a layout ``socket`` op, so a
compiled ``sockets[]`` row), a blueprint door or a blueprint parcel fills a
row by naming its id in ``fills: [promise ids]`` (0104 decision 4). A row
no one fills carries ``unfilled: {reason, note}``; any other state fails the
compile of a place and warns for a proving-ground fixture.

    promise_gate_errors(blueprint, ledger, sockets)   # [] when every row is kept

The gate never reads the catalogue: the ledger is the checklist, and the
builder's § Promises table is the ledger with a fulfilment column.
"""
from __future__ import annotations

import json
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
LEDGER_DIR = REPO_ROOT / "world" / "sources" / "placement" / "promises"
LAYOUT_DIR = REPO_ROOT / "world" / "sources" / "blueprints"
LEDGER_SCHEMA_VERSION = 1
PROMISE_KINDS = ("service", "occupant", "operator", "provision", "socketBucket", "safeInterior")
#: decision 0102 decision 3: the only four reasons a promise may stay unfilled
#: (c needs the sourcing register row named in the note)
UNFILLED_REASONS = ("later-phase-system", "gpu-judgement", "asset-exists-nowhere",
                    "owner-world-call")
#: blueprint collections whose rows may carry `fills`
FILLING_COLLECTIONS = ("parcels", "doors", "questSockets")


def ledger_path(place_id: str, root: Path = LEDGER_DIR) -> Path:
    return Path(root) / f"{place_id}.json"


def load_ledger(place_id: str, root: Path = LEDGER_DIR) -> dict | None:
    """The committed ledger of one place, or None when the place has none yet."""
    path = ledger_path(place_id, root)
    if not path.exists():
        return None
    doc = json.loads(path.read_text(encoding="utf-8"))
    if doc.get("schemaVersion") != LEDGER_SCHEMA_VERSION:
        raise ValueError(f"{path}: promise ledger schemaVersion {doc.get('schemaVersion')} "
                         f"!= {LEDGER_SCHEMA_VERSION}")
    return doc


def layouts(root: Path = LAYOUT_DIR) -> dict[str, dict]:
    """place id -> its layout document (every ``*.layout.json``)."""
    out = {}
    for path in sorted(Path(root).glob("*.layout.json")):
        doc = json.loads(path.read_text(encoding="utf-8"))
        if doc.get("placeId"):
            out[doc["placeId"]] = doc
    return out


def layout_sockets(layout: dict | None) -> list[dict]:
    """The authored socket ops of a layout (the home table of placed
    interactables, 0104 decision 4)."""
    if not layout:
        return []
    return list(layout.get("sockets") or []) + [
        op for op in layout.get("ops") or [] if op.get("op") == "socket"]


def fills_index(bp: dict, sockets: list[dict] | None = None) -> dict[str, list[str]]:
    """promise id -> the ids of the sockets, doors and parcels that name it in
    ``fills`` (each filler once, sorted)."""
    out: dict[str, set[str]] = {}
    rows = [r for key in FILLING_COLLECTIONS for r in bp.get(key) or [] if isinstance(r, dict)]
    rows += [s for s in sockets or [] if isinstance(s, dict)]
    for row in rows:
        for pid in row.get("fills") or []:
            out.setdefault(pid, set()).add(str(row.get("id")))
    return {pid: sorted(ids) for pid, ids in sorted(out.items())}


def promise_gate_errors(bp: dict, ledger: dict | None,
                        sockets: list[dict] | None = None) -> list[str]:
    """Every ledger row filled by at least one ``fills`` reference, or
    carrying ``unfilled`` with a valid reason; every ``fills`` id a row of
    this ledger. Each message is led by its rule id, ``promises.*``."""
    if ledger is None:
        return []
    out: list[str] = []
    if ledger.get("placeId") != bp.get("id"):
        out.append(f"promises.ledger: ledger placeId {ledger.get('placeId')!r} is not "
                   f"blueprint {bp.get('id')!r}")
    rows = {r["id"]: r for r in ledger.get("promises") or []}
    filled = fills_index(bp, sockets)
    for pid, fillers in filled.items():
        if pid not in rows:
            out.append(f"promises.unknown: {', '.join(fillers)} fills {pid!r}, which is no row "
                       f"of {ledger.get('placeId')}'s ledger (regenerate it with "
                       f"`blueprint_promises --id {ledger.get('placeId')} --write`)")
    for pid, row in sorted(rows.items()):
        unfilled = row.get("unfilled")
        if unfilled is not None:
            reason = (unfilled or {}).get("reason")
            if reason not in UNFILLED_REASONS:
                out.append(f"promises.reason: {pid} is unfilled with reason {reason!r}; the "
                           f"reason is one of {list(UNFILLED_REASONS)} (decision 0102)")
            elif not str((unfilled or {}).get("note") or "").strip():
                out.append(f"promises.reason: {pid} is unfilled ({reason}) with no note")
            if pid in filled:
                out.append(f"promises.both: {pid} is filled by {', '.join(filled[pid])} and "
                           f"also marked unfilled; drop the `unfilled` block")
            continue
        if pid not in filled:
            out.append(f"promises.unfilled: {pid} ({row.get('kind')}: {row.get('text')}) is "
                       f"filled by no socket, door or parcel; add `fills: [\"{pid}\"]` to the "
                       f"thing that keeps it, or give the row `unfilled` with a decision 0102 "
                       f"reason")
    return out
