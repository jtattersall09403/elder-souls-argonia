"""Referential integrity over the world's record families (decision 0104
decision 7): every family validates against its schema, every id reference
resolves to a record of the family it names, no id is defined by two
families, and every promise is filled or excused.

    python3 packages/world-schema/integrity.py            # prints every error, exit 1 on any
    integrity_errors(root) -> {"schema": [...], "references": [...], "duplicates": [...],
                               "promises": {place id: [...]}}

It reads the authored records only (catalogue, npc registry, travel
services, layouts, blueprints, promise ledgers); the compiled bundles are
build outputs and are never a home table (0104 decision 1).
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parents[1] / "tooling" / "world-generation"))
import world_schema as ws  # noqa: E402
from worldgen.promise_gate import layout_sockets as _layout_sockets  # noqa: E402
from worldgen.promise_gate import promise_gate_errors  # noqa: E402
from worldgen.travel_services import operator_socket_ids  # noqa: E402
from worldgen.architecture_regions import errors as architecture_region_errors  # noqa: E402

#: catalogue socket buckets (0104 decision 2: `post` is an NPC's work post)
SOCKET_BUCKETS = ("scene", "evidence", "post", "marks")


def _read(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _catalogue(root: Path) -> dict[str, dict]:
    out = {}
    for path in sorted((root / "world/sources/catalogue").glob("places-*.json")):
        for rec in _read(path).get("places") or []:
            out[rec["id"]] = rec
    # route places (16k type 10) have no catalogue record: their home table is
    # the route-structure exemplars file (worldgen.blueprint.catalogue_ids)
    routes = root / "world/sources/routes/route-structure-exemplars.json"
    if routes.exists():
        for rec in _read(routes).get("places") or []:
            out[rec["id"]] = rec
    return out


def integrity_errors(root: Path = ws.REPO_ROOT) -> dict:
    root = Path(root)
    fams = ws.families()
    schema_errs: list[str] = []
    docs: dict[str, list[tuple[Path, dict]]] = {}
    for fam, row in fams.items():
        if not row.get("files"):
            continue
        docs[fam] = ws.load_family(fam, root)
        for path, doc in docs[fam]:
            schema_errs += [f"{path.relative_to(root)}: {e}" for e in ws.validate(fam, doc)]

    places = _catalogue(root)
    layouts = {doc["placeId"]: (path, doc) for path, doc in docs.get("layout", [])}
    ledgers = {doc["placeId"]: (path, doc) for path, doc in docs.get("promises", [])}
    blueprints = {doc["blueprint"]["id"]: (path, doc["blueprint"])
                  for path, doc in docs.get("blueprint", [])}
    services = [s for _, doc in docs.get("travel-services", []) for s in doc.get("services") or []]
    npcs_path = root / "world/sources/registries/npcs.json"
    npcs = _read(npcs_path).get("entries") or [] if npcs_path.exists() else []

    # --- homes: which family defines each id -----------------------------
    homes: dict[str, list[str]] = {}

    def define(i: str, family: str) -> None:
        homes.setdefault(i, []).append(family)

    for pid, rec in places.items():
        define(pid, "catalogue place")
        for bucket in SOCKET_BUCKETS:
            for sid in dict.fromkeys((rec.get("sockets") or {}).get(bucket) or []):
                define(sid, f"catalogue sockets.{bucket}")
    for place_id, (_, lay) in layouts.items():
        for op in _layout_sockets(lay):
            define(op.get("id"), f"layout socket ({place_id})")
    for place_id, (_, led) in ledgers.items():
        for row in led.get("promises") or []:
            define(row["id"], f"promise ledger ({place_id})")
    for s in services:
        define(s["id"], "travel service")
    for e in npcs:
        define(e["id"], "npc registry")
    duplicates = [f"id {i!r} is defined by {len(fs)} records: {', '.join(fs)}"
                  for i, fs in sorted(homes.items()) if i and len(fs) > 1]

    # --- references resolve to the family they name ----------------------
    refs: list[str] = []
    placed = {pid: {op.get("id") for op in _layout_sockets(lay)} for pid, (_, lay) in layouts.items()}
    for s in services:
        op = s.get("operator") or {}
        npid, ref = op.get("nearestPlaceId"), op.get("socketRef")
        if npid and npid not in places:
            refs.append(f"travel service {s['id']}: operator.nearestPlaceId {npid!r} is no place")
        if ref is None:
            continue
        lays = {pid: lay for pid, (_, lay) in layouts.items()}
        if ref not in operator_socket_ids(npid, places, lays):
            refs.append(f"travel service {s['id']}: operator.socketRef {ref!r} is not a "
                        + (f"placed npc socket of {npid} (its layout is the home of its "
                           f"interactables; the catalogue `sockets.post` id is the promise only, "
                           f"0104 decision 2)" if npid in lays else f"sockets.post id of {npid}"))
    for e in npcs:
        home = e.get("home") or {}
        pid, sid = home.get("placeId"), home.get("socketId")
        if pid and pid not in places:
            refs.append(f"npc {e['id']}: home.placeId {pid!r} is no place")
        # a laid-out place is the home of its interactables (0104 decision
        # 2): its npcs stand on placed sockets only; a catalogue post id is
        # the promise, allowed only until the place is laid out
        if sid and pid in placed:
            if sid not in placed[pid]:
                refs.append(f"npc {e['id']}: home.socketId {sid!r} is not a placed socket of "
                            f"{pid}, which is laid out (npc_roster.slot_socket reads the layout)")
        elif sid and sid not in ((places.get(pid) or {}).get("sockets") or {}).get("post", []):
            refs.append(f"npc {e['id']}: home.socketId {sid!r} is not a sockets.post id of {pid}")
    route_ids = set()
    registry = root / "world/sources/routes/registry.json"
    if registry.exists():
        route_ids = {r["id"] for r in _read(registry).get("routes") or []}
    for place_id, (path, lay) in layouts.items():
        if place_id not in places:
            refs.append(f"{path.relative_to(root)}: placeId {place_id!r} is no place")
        route_ids |= {op.get("id") for op in lay.get("ops") or [] if op.get("op") == "path"}
        ids = placed[place_id]
        for op in _layout_sockets(lay):
            for entry in op.get("schedule") or []:
                if entry.get("socketId") not in ids:
                    refs.append(f"layout socket {op['id']}: schedule socketId "
                                f"{entry.get('socketId')!r} is no socket of this layout")
    for place_id, (path, lay) in layouts.items():
        for op in _layout_sockets(lay):
            for arm in op.get("pointsTo") or []:
                if arm not in route_ids and arm not in places:
                    refs.append(f"sign socket {op['id']}: pointsTo {arm!r} is no route or place")
    for place_id, (path, led) in ledgers.items():
        if place_id not in places:
            refs.append(f"{path.relative_to(root)}: placeId {place_id!r} is no place")
        for row in led.get("promises") or []:
            if not (root / row["source"]["file"]).exists():
                refs.append(f"{row['id']}: source file {row['source']['file']} does not exist")
    for place_id in layouts:
        if place_id not in ledgers:
            refs.append(f"{place_id} has a layout and no promise ledger (run "
                        f"`blueprint_promises --id {place_id} --write`)")
    # every architecture row names its region classes, or the register row excusing it
    if (root / "world/sources/assets/architecture-regions.json").exists():
        refs += architecture_region_errors(root / "world/sources/assets")

    # --- every promise filled or excused ----------------------------------
    promises: dict[str, list[str]] = {}
    for place_id, (_, led) in ledgers.items():
        bp = (blueprints.get(place_id) or (None, {"id": place_id}))[1]
        lay = (layouts.get(place_id) or (None, {}))[1]
        # the root's own layout, never the committed one fills_index reads by default
        promises[place_id] = promise_gate_errors(bp, led, _layout_sockets(lay), layout=lay)
    return {"schema": schema_errs, "references": refs, "duplicates": duplicates,
            "promises": promises}


def main() -> int:
    out = integrity_errors()
    n = 0
    for key in ("schema", "references", "duplicates"):
        for line in out[key]:
            print(f"{key}: {line}")
            n += 1
    for place_id, errs in out["promises"].items():
        for line in errs:
            print(f"promises ({place_id}): {line}")
            n += 1
    print(f"world integrity: {n} error(s)")
    return 1 if n else 0


if __name__ == "__main__":
    sys.exit(main())
