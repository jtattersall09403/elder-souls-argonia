"""Place sockets (decision 0103 decisions 5 and 6): the typed record of
everything a place promises a later phase (people, idle spots, items,
containers and their loot, encounters, ambience), compiled into the
settlement record as ``sockets[]`` (``SOCKET_SCHEMA_VERSION``).

Two sources, one shape:

- the layout's ``socket`` ops (``workbench.layout``), authored where the thing
  is placed: ``{"op": "socket", "id", "kind", "at": [x, z] | "host": <id>,
  "yawDeg", "parcel", "why", <kind data>}``; ``at`` is in the layout's own
  province metres (the scene's x, z), ``host`` a scene uid (a bound yard-set
  or assembly member), a parcel id (its shell) or a compiled placement id;
- yard-set members whose kit category is ``container`` or ``furniture``
  (`yard_set_sockets`): a container yields a ``container`` socket (class from
  the asset's name family, fill rule the class default unless the set row
  names ``fillRule``), a furniture piece whose name family has an activity
  yields an ``idle`` socket.

Every other container placement (the dressing ring's, a loose `place` op's)
gets its class default at compile (`default_fill_ops`, id `fill.<member>`),
so only a yard-set override or an authored socket is ever written (planner
ruling 5, 16k round 5).

`compile_sockets` resolves them against the compiled placements and the
padded ground; `socket_gate_errors` holds the 0103 decision 6 gates.
Reachability is walkRule's (`workbench.rules.walk` targets every npc, idle
and container socket the layout's scene holds, the compiled dressing ring
included, `socket_targets`): a socket
is reachable when its `socket:<id>` route is in the blueprint's
``walkRoutes`` (planner ruling 1, 16k round 5). The
vocabulary is ``world/sources/vocab/socket-vocabulary.json``; nothing here
adds a word to it.
"""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

SOCKET_SCHEMA_VERSION = 1
REPO_ROOT = Path(__file__).resolve().parents[3]
VOCABULARY = REPO_ROOT / "world" / "sources" / "vocab" / "socket-vocabulary.json"
YARD_SETS = REPO_ROOT / "world" / "sources" / "placement" / "yard-sets"
REACH_KINDS = ("npc", "idle", "container")
"""The socket kinds walkRule targets in their own right (planner ruling 1,
16k round 5); the reach gate is "its `socket:<id>` route exists"."""
FILL_PREFIX = "fill."
"""The id of a class-default container socket: ``fill.<member slug>`` for an
assembly member (the scene uid's slug, so walkRule names the same socket),
else ``fill.<placement id past the place id>`` (a ring dressing prop)."""
SOCKET_CATEGORIES = ("container", "furniture")
OP_KEYS = {"op", "id", "kind", "at", "host", "yawDeg", "parcel", "why",
           # npc
           "rosterSlotId", "role", "schedule",
           # idle
           "activity",
           # item
           "itemClass", "valueBand", "contentPending",
           # container
           "containerClass", "fillRule", "lootTable",
           # encounter / fauna / ambience / marker
           "dangerBand", "zone"}
KIND_FIELDS = {
    "npc": ("rosterSlotId", "role", "schedule"),
    "idle": ("activity",),
    "item": ("itemClass", "valueBand", "contentPending"),
    "container": ("containerClass", "fillRule", "lootTable"),
    "encounter": ("dangerBand", "zone"),
    "fauna": ("dangerBand", "zone"),
    "ambience": ("zone",),
    "marker": ("zone",),
}


def load_vocabulary(path: Path = VOCABULARY) -> dict:
    doc = json.loads(Path(path).read_text())
    if doc.get("schemaVersion") != 1:
        raise ValueError(f"{path}: socket vocabulary schemaVersion {doc.get('schemaVersion')} != 1")
    return doc


def slug(uid: str) -> str:
    """A scene uid as its exported assembly member id (workbench.export._slug)."""
    return re.sub(r"[^a-z0-9-]+", "-", uid.lower()).strip("-") or "piece"


def _stem(asset_id: str) -> str:
    return asset_id.rsplit("/", 1)[-1].lower()


def container_class(asset_id: str, vocab: dict) -> str | None:
    """The container class whose name family the asset's file name carries."""
    stem = _stem(asset_id)
    for cls, row in vocab["containerClasses"].items():
        if any(f in stem for f in row["nameFamilies"]):
            return cls
    return None


def furniture_activity(asset_id: str, vocab: dict) -> str | None:
    stem = _stem(asset_id)
    for activity, families in vocab["furnitureActivities"].items():
        if any(f in stem for f in families):
            return activity
    return None


def op_errors(op: dict, vocab: dict) -> list[str]:
    """The shape of one authored socket op (never its placement)."""
    sid = op.get("id") or "?"
    out = []
    extra = set(op) - OP_KEYS
    if extra:
        out.append(f"socket {sid}: unknown field(s) {sorted(extra)}")
    if not op.get("id"):
        out.append("socket op needs an id")
    kind = op.get("kind")
    if kind not in vocab["socketKinds"]:
        out.append(f"socket {sid}: kind {kind!r} is not in the vocabulary {vocab['socketKinds']}")
    if "at" not in op and "host" not in op:
        out.append(f"socket {sid}: needs `at` [x, z] or `host`")
    if "at" in op and not (isinstance(op["at"], list) and len(op["at"]) == 2):
        out.append(f"socket {sid}: `at` is [x, z] metres")
    for key in sorted(set(KIND_FIELDS) - {kind}):
        for f in KIND_FIELDS[key]:
            if f in op and f not in KIND_FIELDS.get(kind, ()):
                out.append(f"socket {sid}: field {f!r} belongs to kind {key!r}, not {kind!r}")
    return sorted(set(out))


def yard_set_sockets(st: dict, prefix: str, category_of, vocab: dict) -> list[dict]:
    """The socket ops a placed yard set yields: one per member whose kit
    category is container (class from the name family, fill rule the member's
    `fillRule` else the class default) or furniture with an activity family."""
    out = []
    for m in st["members"]:
        cat = category_of(m["piece"])
        if cat not in SOCKET_CATEGORIES:
            continue
        uid = prefix + m["uid"]
        base = {"op": "socket", "id": f"yard.{slug(uid)}", "host": uid,
                "why": f"yard set {st['id']} member {m['uid']} ({cat})"}
        if cat == "container":
            cls = container_class(m["piece"], vocab)
            rule = m.get("fillRule") or (vocab["containerClasses"].get(cls) or {}).get(
                "defaultFillRule")
            out.append({**base, "kind": "container", "containerClass": cls, "fillRule": rule})
        else:
            activity = furniture_activity(m["piece"], vocab)
            if activity:
                out.append({**base, "kind": "idle", "activity": activity})
    return out


def load_yard_sets(root: Path = YARD_SETS) -> dict[str, dict]:
    out = {}
    for f in sorted(Path(root).glob("*.json")):
        for st in json.loads(f.read_text())["sets"]:
            out[st["id"]] = st
    return out


def layout_of(bp: dict) -> tuple[dict | None, str | None]:
    """The layout the blueprint was exported from (``authoredOn.layout``,
    0100 decision 6), or an error when its bytes changed since the export."""
    ref = (bp.get("authoredOn") or {}).get("layout") or {}
    if not ref.get("path"):
        return None, None
    path = Path(ref["path"])
    path = path if path.is_absolute() else REPO_ROOT / path
    if not path.exists():
        return None, f"sockets: layout {ref['path']} named by authoredOn is missing"
    blob = path.read_bytes()
    if ref.get("sha256") and hashlib.sha256(blob).hexdigest() != ref["sha256"]:
        return None, (f"sockets: layout {ref['path']} changed since this blueprint was "
                      f"exported (authoredOn.layout.sha256); re-apply the layout")
    return json.loads(blob), None


def authors_yard_sets(bp: dict, yard_sets: dict[str, dict] | None = None) -> bool:
    """Does the layout the blueprint names (``authoredOn.layout``) lay any
    yard set (a `group place` op naming one)? Read whatever the file holds:
    a stale hash is `layout_of`'s error, not a reason to bring the retired
    ring back (lesson L33)."""
    ref = (bp.get("authoredOn") or {}).get("layout") or {}
    if not ref.get("path"):
        return False
    path = Path(ref["path"])
    path = path if path.is_absolute() else REPO_ROOT / path
    if not path.exists():
        return False
    sets = load_yard_sets() if yard_sets is None else yard_sets
    return any(op.get("op") == "group" and op.get("action") == "place" and op.get("name") in sets
               for op in json.loads(path.read_text()).get("ops") or [])


def merge_ops(authored: list[dict], auto: list[dict]) -> list[dict]:
    """The authored ops, then every generated op whose (host, kind) no
    authored op already takes."""
    taken = {(op.get("host"), op.get("kind")) for op in authored if op.get("host")}
    return list(authored) + [op for op in auto if (op["host"], op["kind"]) not in taken]


def fill_socket_id(placement_id: str, bp_id: str) -> str:
    tail = placement_id.removeprefix(f"{bp_id}.")
    m = re.search(r"\.assembly\.([^.]+)$", tail)
    return FILL_PREFIX + (m.group(1) if m else tail)


def default_fill_op(host: str, sid: str, asset_id: str, vocab: dict, what: str) -> dict:
    cls = container_class(asset_id, vocab)
    return {"op": "socket", "id": sid, "kind": "container", "host": host,
            "containerClass": cls,
            "fillRule": (vocab["containerClasses"].get(cls) or {}).get("defaultFillRule"),
            "why": f"{what} container {asset_id}: class default fill"}


def default_fill_ops(bp_id: str, placements: list[dict], hosted: set[str], category_of,
                     vocab: dict) -> list[dict]:
    """A class-default container socket for every container placement no
    container socket is hosted on (`hosted`: their host placement ids)."""
    return [default_fill_op(p["id"], fill_socket_id(p["id"], bp_id), p["assetId"], vocab,
                            p.get("objectKind") or "placed")
            for p in sorted(placements, key=lambda p: p["id"])
            if p["id"] not in hosted and category_of(p.get("assetId") or "") == "container"]


def socket_ops(layout: dict | None, category_of, vocab: dict,
               yard_sets: dict[str, dict] | None = None) -> list[dict]:
    """Every socket op of a layout: its authored `socket` ops (``layout
    ["sockets"]`` once `workbench.layout.load` split them out, else in
    ``ops``), then the yard sets its `group place` ops laid. An authored
    socket on the same host and kind replaces the yard set's."""
    if layout is None:
        return []
    authored = list(layout.get("sockets") or []) + [
        op for op in layout.get("ops") or [] if op.get("op") == "socket"]
    sets = load_yard_sets() if yard_sets is None else yard_sets
    auto = []
    for op in layout.get("ops") or []:
        if op.get("op") == "group" and op.get("action") == "place" and op.get("name") in sets:
            auto += yard_set_sockets(sets[op["name"]], op.get("prefix") or "", category_of, vocab)
    return merge_ops(authored, auto)


def world_yaw_deg(placement: dict, by_id: dict[str, dict]) -> float:
    """A placement's world yaw: a mounted child's `yawDeg` is RELATIVE to its
    parent (anchoring.ts `mountedTransform`: parent matrix x own turn), so it
    composes up its parent chain (r4 review)."""
    yaw, seen = float(placement.get("yawDeg") or 0.0), set()
    parent = by_id.get(placement.get("parentPlacementId") or "")
    while parent is not None and parent["id"] not in seen:
        seen.add(parent["id"])
        yaw += float(parent.get("yawDeg") or 0.0)
        parent = by_id.get(parent.get("parentPlacementId") or "")
    return yaw % 360.0



def host_index(placements: list[dict]) -> tuple[dict, dict]:
    """(placement by id, the first placement by id per assembly member slug),
    built once per compile so resolving a host is a lookup, not a scan."""
    by_id = {p["id"]: p for p in placements}
    by_member: dict[str, dict] = {}
    for p in sorted(placements, key=lambda p: p["id"]):
        _head, sep, member = p["id"].rpartition(".assembly.")
        if sep and member not in by_member:
            by_member[member] = p
    return by_id, by_member


def find_host(host: str, bp_id: str, placements: list[dict],
              index: tuple[dict, dict] | None = None) -> dict | None:
    by_id, by_member = index or host_index(placements)
    for key in (host, f"{bp_id}.{host}.building", f"{bp_id}.{host}"):
        if key in by_id:
            return by_id[key]
    return by_member.get(slug(host))


def compile_sockets(bp: dict, placements: list[dict], height_at, ops: list[dict],
                    vocab: dict, category_of=None) -> tuple[list[dict], list[str]]:
    """The compiled ``sockets[]`` and the errors resolving them: a hosted
    socket stands at its host's pivot, a free one on the padded ground. With
    ``category_of``, every container placement left without a container
    socket then gets its class default (`default_fill_ops`)."""
    out, errors, seen = [], [], set()
    index = host_index(placements)
    _compile_ops(bp, placements, height_at, ops, vocab, out, errors, seen, index)
    if category_of is not None:
        hosted = {s["host"] for s in out if s["kind"] == "container" and s["host"]}
        _compile_ops(bp, placements, height_at,
                     default_fill_ops(bp["id"], placements, hosted, category_of, vocab),
                     vocab, out, errors, seen, index)
    out.sort(key=lambda r: r["id"])
    return out, errors


def _compile_ops(bp, placements, height_at, ops, vocab, out, errors, seen,
                 index=None) -> None:
    for op in ops:
        errs = op_errors(op, vocab)
        if errs:
            errors += errs
            continue
        if op["id"] in seen:
            errors.append(f"socket {op['id']}: id used twice")
            continue
        seen.add(op["id"])
        host = None
        if op.get("host"):
            host = find_host(op["host"], bp["id"], placements, index)
            if host is None:
                errors.append(f"socket {op['id']}: host {op['host']!r} is no compiled placement "
                              f"(a yard-set member must be bound to a parcel to be exported)")
                continue
        if "at" in op:
            x, z = (float(v) for v in op["at"])
            y = float(height_at(x, z)) if host is None else float(host["positionM"][1])
        else:
            x, y, z = (float(v) for v in host["positionM"])
        row = {"id": op["id"], "kind": op["kind"],
               "positionM": [round(x, 3), round(y, 3), round(z, 3)],
               "yawDeg": round(float(op.get("yawDeg", world_yaw_deg(host, (index or host_index(placements))[0])
                                                     if host else 0.0))
                               % 360.0, 3),
               "parcelId": op.get("parcel") or (host or {}).get("parcelId"),
               "interiorCell": None,
               "host": host["id"] if host else None,
               "why": op.get("why") or ""}
        for f in KIND_FIELDS[op["kind"]]:
            if f in op:
                row[f] = op[f]
        if op["kind"] == "item" and "valueBand" not in row:
            row["valueBand"] = (vocab["itemClasses"].get(row.get("itemClass")) or {}).get("valueBand")
        if op["kind"] == "item" and (vocab["itemClasses"].get(row.get("itemClass")) or {}).get(
                "textBearing"):
            row.setdefault("contentPending", True)
        out.append(row)


def _roster_slots(rec: dict | None) -> list[str]:
    if not rec:
        return []
    slots = [s.get("slotId") for s in rec.get("notableNpcSlots") or []]
    slots += [s.get("slotId") for s in (rec.get("contents") or {}).get("npcs") or []]
    return [s for s in dict.fromkeys(slots) if s]


def socket_gate_errors(bp: dict, rec: dict | None, sockets: list[dict], placements: list[dict],
                       category_of, service_parcels: dict[str, list[dict]],
                       vocab: dict) -> list[str]:
    """The 0103 decision 6 gates, each message led by its rule id."""
    out = []
    by_id = {s["id"]: s for s in sockets}
    npcs = [s for s in sockets if s["kind"] == "npc"]
    # roster: every slot has an npc socket whose schedule names a work and a
    # home idle socket
    for slot in _roster_slots(rec):
        mine = [s for s in npcs if s.get("rosterSlotId") == slot]
        if not mine:
            out.append(f"sockets.roster: roster slot {slot!r} has no npc socket")
            continue
        for s in mine:
            for purpose in ("work", "home"):
                hits = [e for e in s.get("schedule") or [] if e.get("purpose") == purpose]
                if not hits:
                    out.append(f"sockets.roster: npc socket {s['id']} (slot {slot}) has no "
                               f"{purpose} schedule entry")
                for e in hits:
                    tgt = by_id.get(e.get("socketId"))
                    if tgt is None or tgt["kind"] != "idle":
                        out.append(f"sockets.roster: npc socket {s['id']} {purpose} entry names "
                                   f"{e.get('socketId')!r}, which is no idle socket")
    for s in npcs:
        for e in s.get("schedule") or []:
            if e.get("dayPhase") not in vocab["dayPhases"]:
                out.append(f"sockets.vocabulary: npc socket {s['id']} dayPhase "
                           f"{e.get('dayPhase')!r} is not a world-time day phase")
            if e.get("purpose") not in vocab["schedulePurposes"]:
                out.append(f"sockets.vocabulary: npc socket {s['id']} purpose "
                           f"{e.get('purpose')!r} is not in {vocab['schedulePurposes']}")
    # containers: every container placement has a container socket with a fill rule
    hosted = {s["host"]: s for s in sockets if s["kind"] == "container" and s.get("host")}
    for p in sorted(placements, key=lambda p: p["id"]):
        if category_of(p.get("assetId") or "") != "container":
            continue
        s = hosted.get(p["id"])
        if s is None:
            out.append(f"sockets.container-fill: container placement {p['id']} "
                       f"({p['assetId']}) has no container socket")
        elif not s.get("fillRule"):
            out.append(f"sockets.container-fill: container socket {s['id']} on {p['id']} has "
                       f"no fill rule (class {s.get('containerClass')!r} has no default)")
    for s in sockets:
        if s["kind"] != "container":
            continue
        if s.get("containerClass") not in vocab["containerClasses"]:
            out.append(f"sockets.vocabulary: container socket {s['id']} class "
                       f"{s.get('containerClass')!r} is not in the vocabulary")
        rule = s.get("fillRule")
        if rule and rule not in vocab["fillRules"]:
            out.append(f"sockets.vocabulary: container socket {s['id']} fill rule {rule!r} is "
                       f"not in the vocabulary")
        if rule == "authored":
            table = s.get("lootTable") or {}
            if not table.get("itemClasses") or not table.get("storyNote"):
                out.append(f"sockets.container-fill: container socket {s['id']} is authored "
                           f"but its lootTable lacks itemClasses or storyNote")
            for c in table.get("itemClasses") or []:
                if c not in vocab["itemClasses"]:
                    out.append(f"sockets.item-class: container socket {s['id']} loot class "
                               f"{c!r} is not in the vocabulary")
    # services: every promised service has an npc socket at one of its parcels
    for service in (rec or {}).get("services") or []:
        parcels = {p["id"] for p in service_parcels.get(service, [])}
        if not parcels:
            out.append(f"sockets.service: service {service!r} has no parcel, so no npc "
                       f"socket can stand at it")
        elif not any(s.get("parcelId") in parcels for s in npcs):
            out.append(f"sockets.service: service {service!r} has no npc socket at "
                       f"{sorted(parcels)}")
    # item classes
    for s in sockets:
        if s["kind"] == "item" and s.get("itemClass") not in vocab["itemClasses"]:
            out.append(f"sockets.item-class: item socket {s['id']} class "
                       f"{s.get('itemClass')!r} is not in the vocabulary")
        if s["kind"] == "idle" and s.get("activity") not in vocab["activities"]:
            out.append(f"sockets.vocabulary: idle socket {s['id']} activity "
                       f"{s.get('activity')!r} is not in the vocabulary")
    # reachability: walkRule targeted the socket and reached it (its
    # `socket:<id>` route); the ring's dressing props included, since
    # `wb.py apply` loads the compiled ring into the scene (16k r8 rule 5)
    routes = (bp.get("walkRoutes") or {}).get("routes") or {}
    for s in sockets:
        if s["kind"] not in REACH_KINDS or f"socket:{s['id']}" in routes:
            continue
        out.append(f"sockets.reach: {s['kind']} socket {s['id']} is no walkRule target that "
                   f"passed (walkRoutes has no route socket:{s['id']}); `wb.py check` names "
                   f"what blocks it, `wb.py export --write` records the route")
    return out
