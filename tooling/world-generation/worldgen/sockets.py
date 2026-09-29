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
- an INTERIOR socket (``"interiorCell": <cellId>``, ``host`` a placement
  id of that cell's published bundle, ``<cellId>.<formId>``): the cell must
  be a tier A claim on one of the blueprint's doors; the socket stands at the
  host's position in the cell's own frame with ``interiorCell`` set and the
  claiming door's parcel. Anything that happens indoors (a home bed, a
  counter, a ledger, a keeper's work spot) is authored this way, never on the
  parcel's shell, whose pivot stands inside the walls of the overworld
  (gate ``sockets.interior``; the cell's own furniture sockets are the
  bundle's, ``export_interior_bundle``);
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
INTERIORS = REPO_ROOT / "apps" / "world-studio" / "public" / "province" / "interiors"
"""The published tier A bundles (`export_interior_bundle.OUT_DIR`)."""
REACH_KINDS = ("npc", "idle", "container")
"""The socket kinds walkRule targets in their own right (planner ruling 1,
16k round 5); the reach gate is "its `socket:<id>` route exists"."""
FILL_PREFIX = "fill."
"""The id of a class-default container socket: ``fill.<member slug>`` for an
assembly member (the scene uid's slug, so walkRule names the same socket),
else ``fill.<placement id past the place id>`` (a ring dressing prop)."""
SOCKET_CATEGORIES = ("container", "furniture")
OP_KEYS = {"op", "id", "kind", "at", "host", "yawDeg", "parcel", "why", "interiorCell",
           # npc
           "rosterSlotId", "role", "schedule",
           # idle
           "activity",
           # item
           "itemClass", "valueBand", "contentPending",
           # container
           "containerClass", "fillRule", "lootTable",
           # encounter / fauna / ambience / marker
           "dangerBand", "zone",
           # station / sign, and the promises any socket fills (0104 decision 4)
           "stationClass", "pointsTo", "fills",
           # build-out slots on every socket (0104 decision 4, decision 0041)
           "owner", "valueTier"}
KIND_FIELDS = {
    "npc": ("rosterSlotId", "role", "schedule"),
    "idle": ("activity",),
    "item": ("itemClass", "valueBand", "contentPending"),
    "container": ("containerClass", "fillRule", "lootTable"),
    "encounter": ("dangerBand", "zone"),
    "fauna": ("dangerBand", "zone"),
    "ambience": ("zone",),
    "marker": ("zone",),
    "station": ("stationClass",),
    "sign": ("pointsTo",),
}
NEW_KINDS_0104 = ("station", "sign")
"""0104 decision 4's kinds: accepted by shape here until the vocabulary
(`socketKinds`, lane T2's file) names them; then the vocabulary decides."""


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
    if kind not in vocab["socketKinds"] and kind not in NEW_KINDS_0104:
        out.append(f"socket {sid}: kind {kind!r} is not in the vocabulary {vocab['socketKinds']}")
    if kind == "station" and not (isinstance(op.get("stationClass"), str) and op["stationClass"]):
        out.append(f"socket {sid}: a station names its stationClass")
    if kind == "sign" and not (isinstance(op.get("pointsTo"), list) and op["pointsTo"]
                               and all(isinstance(t, str) and t for t in op["pointsTo"])):
        out.append(f"socket {sid}: a sign's pointsTo lists a route or place id per arm")
    if "fills" in op:
        from .blueprint import fills_failures
        out += [f"socket {sid}: {why}" for why in fills_failures(op)]
    if "at" not in op and "host" not in op:
        out.append(f"socket {sid}: needs `at` [x, z] or `host`")
    if op.get("interiorCell") and ("at" in op or not op.get("host")):
        out.append(f"socket {sid}: an interior socket names a `host` placement of its cell, "
                   f"never `at`")
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


def authors_dressing(bp: dict, yard_sets: dict[str, dict] | None = None) -> bool:
    """Does the layout the blueprint names (``authoredOn.layout``) author its
    own dressing, in either form: a `group place` op naming a tracked yard
    set, or any `bind` op of `kind: "assembly"` (dressing placed piece by
    piece, 16k slice 2 Greenspring)? Read whatever the file holds: a stale
    hash is `layout_of`'s error, not a reason to bring the retired ring back
    (lesson L33)."""
    ref = (bp.get("authoredOn") or {}).get("layout") or {}
    if not ref.get("path"):
        return False
    path = Path(ref["path"])
    path = path if path.is_absolute() else REPO_ROOT / path
    if not path.exists():
        return False
    ops = json.loads(path.read_text()).get("ops") or []
    if any(op.get("op") == "bind" and op.get("kind") == "assembly" for op in ops):
        return True
    sets = load_yard_sets() if yard_sets is None else yard_sets
    return any(op.get("op") == "group" and op.get("action") == "place" and op.get("name") in sets
               for op in ops)


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


def interior_claims(bp: dict) -> dict[str, dict]:
    """cellId -> the blueprint door claiming it at tier A ({doorId, parcelId})."""
    out = {}
    for d in bp.get("doors") or []:
        c = d.get("interiorClaim") or {}
        if c.get("tier") == "A" and c.get("cellId"):
            out.setdefault(c["cellId"], {"doorId": d.get("id"), "parcelId": d.get("parcelId")})
    return out


def load_bundle(cell_id: str, root: Path | None = None) -> dict | None:
    path = Path(root or INTERIORS) / f"{cell_id}.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else None


def _inside(poly, x: float, z: float) -> bool:
    """Even-odd point-in-polygon on the plan (x east, z south)."""
    hit = False
    for i in range(len(poly)):
        (x0, z0), (x1, z1) = poly[i - 1], poly[i]
        if (z0 > z) != (z1 > z) and x < x0 + (z - z0) * (x1 - x0) / (z1 - z0):
            hit = not hit
    return hit


def walkable_surface_at(surfaces):
    """``surfaces``: ``(plan polygon, top y, placement id)`` of every walkable
    placed surface (a deck, a hull; `compile_settlement.walkable_surfaces`).
    Returns ``(x, z) -> the highest top whose polygon holds the point, or
    None`` (16k walk 4 defect 5: the Claywater poler's socket stood on the
    channel bed under the landing deck)."""
    rows = [(poly, float(y)) for poly, y, _ in surfaces if len(poly) >= 3]

    def at(x: float, z: float) -> float | None:
        tops = [y for poly, y in rows if _inside(poly, x, z)]
        return max(tops) if tops else None
    return at


def compile_sockets(bp: dict, placements: list[dict], height_at, ops: list[dict],
                    vocab: dict, category_of=None,
                    surface_at=None, bundle_of=load_bundle) -> tuple[list[dict], list[str]]:
    """The compiled ``sockets[]`` and the errors resolving them: a hosted
    socket stands at its host's pivot, a free one on the padded ground; either
    is lifted onto the highest walkable placed surface under it when
    ``surface_at`` (`walkable_surface_at`) finds one above that (a socket on
    a deck stands on the deck top, never the terrain under it). With
    ``category_of``, every container placement left without a container
    socket then gets its class default (`default_fill_ops`). An interior op
    resolves on its cell's bundle (``bundle_of(cellId)``)."""
    out, errors, seen = [], [], set()
    index = host_index(placements)
    interiors = {"claims": interior_claims(bp), "bundle_of": bundle_of, "cache": {}}
    _compile_ops(bp, placements, height_at, ops, vocab, out, errors, seen, index, surface_at,
                 interiors)
    if category_of is not None:
        hosted = {s["host"] for s in out if s["kind"] == "container" and s["host"]}
        _compile_ops(bp, placements, height_at,
                     default_fill_ops(bp["id"], placements, hosted, category_of, vocab),
                     vocab, out, errors, seen, index, surface_at)
    out.sort(key=lambda r: r["id"])
    return out, errors


def _interior_row(op: dict, interiors: dict | None) -> tuple[dict | None, str | None]:
    """The compiled row of an interior op, or the error resolving it."""
    cell = op["interiorCell"]
    claim = ((interiors or {}).get("claims") or {}).get(cell)
    if claim is None:
        return None, (f"sockets.interior: socket {op['id']} names cell {cell!r}, which no "
                      f"door of this place claims at tier A")
    cache = interiors["cache"]
    if cell not in cache:
        cache[cell] = interiors["bundle_of"](cell)
    bundle = cache[cell]
    if bundle is None:
        return None, f"sockets.interior: socket {op['id']}: cell {cell!r} has no published bundle"
    host = next((p for p in bundle.get("placements") or [] if p.get("id") == op["host"]), None)
    if host is None:
        return None, (f"sockets.interior: socket {op['id']}: host {op['host']!r} is no "
                      f"placement of bundle {cell}")
    reached = any(s.get("host") == host["id"] and s.get("kind") in REACH_KINDS
                  for s in bundle.get("sockets") or [])
    x, y, z = (float(v) for v in host["positionM"])
    return {"id": op["id"], "kind": op["kind"],
            "fills": list(op.get("fills") or []),
            "owner": op.get("owner"), "valueTier": op.get("valueTier"),
            "positionM": [round(x, 3), round(y, 3), round(z, 3)],
            "yawDeg": round(float(op.get("yawDeg", (host.get("rotationDeg") or [0, 0, 0])[1]))
                            % 360.0, 3),
            "parcelId": op.get("parcel") or claim["parcelId"],
            "interiorCell": cell, "interiorDoor": claim["doorId"],
            # interior_walk reached the host from the cell's doors when the
            # bundle's own furniture socket sits on it (the bundle's gate)
            "interiorReached": reached,
            "host": host["id"], "why": op.get("why") or ""}, None


def _compile_ops(bp, placements, height_at, ops, vocab, out, errors, seen,
                 index=None, surface_at=None, interiors=None) -> None:
    for op in ops:
        errs = op_errors(op, vocab)
        if errs:
            errors += errs
            continue
        if op["id"] in seen:
            errors.append(f"socket {op['id']}: id used twice")
            continue
        seen.add(op["id"])
        if op.get("interiorCell"):
            row, err = _interior_row(op, interiors)
            if err:
                errors.append(err)
                continue
            for f in KIND_FIELDS[op["kind"]]:
                if f in op:
                    row[f] = op[f]
            if op["kind"] == "item" and "valueBand" not in row:
                row["valueBand"] = (vocab["itemClasses"].get(row.get("itemClass")) or {}).get(
                    "valueBand")
            out.append(row)
            continue
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
        top = surface_at(x, z) if surface_at is not None else None
        if top is not None and top > y:
            y = top
        row = {"id": op["id"], "kind": op["kind"],
               # 0104 decision 4: the promises it keeps, and the build-out
               # slots Phase 13 fills (null until then)
               "fills": list(op.get("fills") or []),
               "owner": op.get("owner"), "valueTier": op.get("valueTier"),
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
    # indoor things stand indoors: a socket hosted on the shell of a parcel
    # whose door has a tier A cell stands at the shell pivot, inside the walls
    # of the overworld (F2, 16k walk 5); it is authored in the cell instead
    shells = {f"{bp['id']}.{c['parcelId']}.building": cell
              for cell, c in interior_claims(bp).items()}
    for s in sockets:
        if not s.get("interiorCell") and s.get("host") in shells:
            out.append(f"sockets.interior: {s['kind']} socket {s['id']} is hosted on the shell "
                       f"of a building with tier A cell {shells[s['host']]}; author it in the "
                       f"cell (`interiorCell`, `host`: a placement id of its bundle) or give it "
                       f"`at` outside the door")
    # stations and signs (0104 decision 4): a station class the vocabulary
    # names, a sign arm per route or place
    for s in sockets:
        if s["kind"] == "station" and s.get("stationClass") not in (vocab.get("stationClasses") or {}):
            out.append(f"sockets.vocabulary: station socket {s['id']} class "
                       f"{s.get('stationClass')!r} is not in the vocabulary")
        if s["kind"] == "sign":
            for ref in s.get("pointsTo") or []:
                if not str(ref).startswith(("route.", "place.")):
                    out.append(f"sockets.sign: sign socket {s['id']} points to {ref!r}, which "
                               f"is no route. or place. id")
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
        if s.get("interiorCell"):
            if not s.get("interiorReached"):
                out.append(f"sockets.reach: interior {s['kind']} socket {s['id']} is on "
                           f"{s['host']}, which carries no reached furniture socket in bundle "
                           f"{s['interiorCell']} (interior_walk); host it on one that does")
            continue
        out.append(f"sockets.reach: {s['kind']} socket {s['id']} is no walkRule target that "
                   f"passed (walkRoutes has no route socket:{s['id']}); `wb.py check` names "
                   f"what blocks it, `wb.py export --write` records the route")
    return out
