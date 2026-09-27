"""Export one tier A interior cell verbatim from its plugin (decision 0103 decision 3).

Every reference in the cell (REFR, and the placed actors ACHR) is read with
its transform through `esp_index`, its base object resolved across the
plugin's masters, and each lands in exactly one of two lists:

* ``placements[]`` — the reference's mesh mapped to a PUBLISHED kit asset
  (`apps/world-studio/public/kits/*.kit.json`), with its category;
* ``drops[]`` — everything not drawn, each with its reason: ``actor``
  (ACHR, NPC_, LVLN, LVLC), ``quest`` (a quest alias forces the reference),
  ``marker`` (editor markers and invisible furniture markers), ``light-source``
  (a mesh-less light, realised in ``lights[]``), ``sound``, ``levelled-item``,
  ``no-model``, ``unresolved-base``, and ``no-kit-asset`` (a gap: the mesh is
  in no published kit; never faked).

Acceptance (the gate ``--check`` and the test run): ``len(placements) +
len(drops) == refCount``.

Alongside: ``lights[]`` from each light reference's LIGH record (radius with
the reference's XRDS override, colour, flicker flags) and the cell's
``lighting`` (ambient, directional, fog colours and distances) from its XCLL,
with the fields it inherits taken from its lighting template (LTMP -> LGTM);
``sockets[]`` per 0103 decision 5 (container / idle / item); the arrival
marker and the exit door (the cell's load door).

Frame (the runtime contract, `packages/game-core/src/interior/bundle.ts`; the
shared fixture ``packages/game-core/src/interior/__fixtures__/interior.fixture.json``
is read by both test suites): metres, game axes (x east, y up, z south);
``rotationDeg`` is ``[pitch, yaw, roll]`` for ``Euler(pitch, -yaw, roll, 'YXZ')``
(yaw a compass bearing, clockwise from north). The plugin's rotation is read
as Bethesda applies it (X, then Y, then Z, each clockwise: the convention the
Blender NIF tools use) and re-expressed in that order. Colours are sRGB bytes.
Each light keeps its base record's fade (FNAM, unitless: the runtime's
intensity is fade times one tuned constant); a reference radius override
(XRDS) counts only when positive, the raw value kept in ``raw``.

Doors: ``doors[]`` pairs each claiming exterior door (the blueprint's door
record) with its interior load door and arrival marker (owner ruling B,
interiors round 2); every other load door of the cell follows as
``{interiorLoadDoorRef, loadDoor, closed: true}`` (planner ruling 3, interiors
round 3: shown with the closed line, never used); ``exitDoor``/
``arrivalMarker`` are the first pair's, the default for ``?interior=``.

Run (from tooling/world-generation/):
  python3 -m worldgen.export_interior_bundle --plugin Skyrim.esm --cell DawnstarBrinasHouse
  python3 -m worldgen.export_interior_bundle --blueprint ../../world/sources/blueprints/<place>.json
"""

from __future__ import annotations

import argparse
import json
import math
import struct
import sys
from collections import Counter
from pathlib import Path

from .asset_taxonomy import classify
from .esp_index import GT_WORLD_CHILDREN, UNITS_PER_METRE, Plugin, _cstr, walk

REPO_ROOT = Path(__file__).resolve().parents[3]
KITS_DIR = REPO_ROOT / "apps" / "world-studio" / "public" / "kits"
OUT_DIR = REPO_ROOT / "apps" / "world-studio" / "public" / "province" / "interiors"
SCHEMA_VERSION = 1
FRAME = ("game: metres, x east, y up, z south; rotationDeg [pitch, yaw, roll] applied as "
         "Euler(pitch, -yaw, roll, 'YXZ'); yaw is a compass bearing, clockwise from north (-z)")
FIXTURE = (REPO_ROOT / "packages" / "game-core" / "src" / "interior" / "__fixtures__"
           / "interior.fixture.json")

REF_TYPES = (b"REFR", b"ACHR")
ACTOR_BASES = {"NPC_", "LVLN", "LVLC"}
ITEM_BASES = {"ALCH", "INGR", "MISC", "WEAP", "ARMO", "BOOK", "KEYM", "AMMO", "SLGM", "SCRL"}

#: Item class per base record type (0103 decision 5 `item.itemClass`). The
#: vocabulary record (world/sources/vocab/socket-vocabulary.json) is written by
#: the socket lane; until it lands these are the provisional class ids.
ITEM_CLASS = {
    "ALCH": "food-or-potion", "INGR": "ingredient", "MISC": "misc",
    "WEAP": "weapon", "ARMO": "apparel", "BOOK": "book", "KEYM": "key",
    "AMMO": "ammo", "SLGM": "soul-gem", "SCRL": "scroll",
}
#: Value band from the base record's gold value.
VALUE_BANDS = ((10, "trivial"), (50, "low"), (250, "mid"), (1000, "high"))

#: Container class from the base's model/editor-id family (0103 decision 5).
CONTAINER_FAMILIES = (
    ("strongbox", ("strongbox", "safe", "lockbox")),
    ("barrel", ("barrel", "keg", "cask")),
    ("sack", ("sack", "bag")),
    ("crate", ("crate", "box")),
    ("urn", ("urn",)),
    ("basket", ("basket",)),
    ("chest", ("chest", "trunk", "cupboard", "dresser", "wardrobe", "endtable", "drawer",
               "shelf", "cabinet", "cabinet")),
)
#: Idle activity from the furniture's model/editor-id family.
FURNITURE_ACTIVITY = (
    ("sleep", ("bed", "bedroll", "hammock")),
    ("sit", ("chair", "bench", "stool", "throne", "pillow")),
    ("lean", ("lean",)),
    ("work-at", ("workbench", "alchemy", "enchant", "anvil", "forge", "smelter", "tanning",
                 "grindstone", "sharpening", "cooking", "spit", "oven", "cookpot",
                 "choppingblock", "woodchopping", "counter", "sweep")),
)


# --------------------------------------------------------------------------- #
# plugin reading
# --------------------------------------------------------------------------- #
class PluginSet:
    """A plugin and its masters, with form ids resolved to `(file, local id)`."""

    def __init__(self, plugin: Path, paths: dict[str, Path]):
        self.main = Plugin(plugin)
        self.plugins = {self.main.path.name: self.main}
        for master in self.main.masters:
            path = paths.get(master)
            if path is not None:
                self.plugins[master] = Plugin(path)

    def key(self, owner: Plugin, form_id: int) -> tuple[str, int]:
        return owner.source_of(form_id), form_id & 0xFFFFFF


def _ref_extras(rec) -> dict:
    out: dict = {}
    for st, payload in rec.subrecords():
        if st == b"NAME" and len(payload) >= 4:
            out["base"] = struct.unpack_from("<I", payload)[0]
        elif st == b"DATA" and len(payload) >= 24:
            v = struct.unpack_from("<6f", payload)
            out["pos"], out["rot"] = v[:3], v[3:]
        elif st == b"XSCL" and len(payload) >= 4:
            out["scale"] = struct.unpack_from("<f", payload)[0]
        elif st == b"XTEL" and len(payload) >= 28:
            out["teleport"] = struct.unpack_from("<I", payload)[0]
        elif st == b"XRDS" and len(payload) >= 4:
            out["radius"] = struct.unpack_from("<f", payload)[0]
        elif st == b"XLIG" and len(payload) >= 16:
            fov, fade, end_cap, bias = struct.unpack_from("<4f", payload)
            out["xlig"] = {"fovOffset": round(fov, 3), "fadeOffset": round(fade, 3),
                           "endDistanceCap": round(end_cap, 3), "shadowDepthBias": round(bias, 3)}
        elif st == b"EDID":
            out["editorId"] = _cstr(payload)
    return out


def read_cell(plugin: Plugin, cell_edid: str):
    """`(CELL record, [ref records])` for one interior cell, or None."""
    cell_rec = None
    refs = []
    inside = False
    for rec, stack in plugin.records():
        if any(f.type == GT_WORLD_CHILDREN for f in stack):
            if inside:
                break
            continue
        if rec.type == b"CELL":
            if inside:
                break
            if any(st == b"XCLC" for st, _ in rec.subrecords()):
                continue
            edid = next((_cstr(p) for st, p in rec.subrecords() if st == b"EDID"), None)
            if edid == cell_edid:
                cell_rec, inside = rec, True
            continue
        if inside and rec.type in REF_TYPES:
            refs.append(rec)
    return (cell_rec, refs) if cell_rec is not None else None


def read_records(pset: PluginSet, wanted: set[tuple[str, int]]) -> tuple[dict, set]:
    """`(records by key, quest-forced ref keys)`: the base objects and
    templates asked for, plus every reference a quest alias forces (ALFR)."""
    found: dict[tuple[str, int], object] = {}
    quest_refs: set[tuple[str, int]] = set()
    for name, plugin in pset.plugins.items():
        for rec, _stack in plugin.records():
            key = (plugin.source_of(rec.form_id), rec.form_id & 0xFFFFFF)
            if key in wanted:
                found[key] = rec
            if rec.type == b"QUST":
                for st, payload in rec.subrecords():
                    if st == b"ALFR" and len(payload) >= 4:
                        fid = struct.unpack_from("<I", payload)[0]
                        quest_refs.add((plugin.source_of(fid), fid & 0xFFFFFF))
    return found, quest_refs


def _base_info(rec) -> dict:
    info = {"type": rec.type.decode("ascii"), "editorId": None, "model": None, "value": None}
    for st, payload in rec.subrecords():
        if st == b"EDID":
            info["editorId"] = _cstr(payload)
        elif st == b"MODL" and info["model"] is None and len(payload) > 1 and info["type"] != "ARMO":
            info["model"] = _cstr(payload).replace("\\", "/").lower()
        elif st in (b"MOD2", b"MOD4") and info["type"] == "ARMO" and info["model"] is None \
                and len(payload) > 1:
            # UESP Skyrim_Mod:Mod_File_Format/ARMO: MODL is an ARMA form id
            # there; MOD2/MOD4 are the male/female world (ground) models
            info["model"] = _cstr(payload).replace("\\", "/").lower()
        elif st == b"DATA" and info["type"] == "LIGH" and len(payload) >= 16:
            _time, radius = struct.unpack_from("<iI", payload)
            r, g, b = payload[8], payload[9], payload[10]
            flags = struct.unpack_from("<I", payload, 12)[0]
            falloff = struct.unpack_from("<f", payload, 16)[0] if len(payload) >= 20 else None
            info["light"] = {"radiusUnits": radius, "colorRGB": [r, g, b], "flags": flags,
                             "falloffExponent": round(falloff, 3) if falloff is not None else None}
        elif st == b"FNAM" and info["type"] == "LIGH" and len(payload) >= 4:
            info["fade"] = round(struct.unpack_from("<f", payload)[0], 3)
        elif st == b"DATA" and info["type"] in ("MISC", "INGR", "ARMO", "SLGM", "KEYM") \
                and len(payload) >= 4:
            info["value"] = struct.unpack_from("<i", payload)[0]
        elif st == b"DATA" and info["type"] == "WEAP" and len(payload) >= 4:
            info["value"] = struct.unpack_from("<i", payload)[0]
        elif st == b"DATA" and info["type"] == "BOOK" and len(payload) >= 12:
            info["value"] = struct.unpack_from("<i", payload, len(payload) - 8)[0]
        elif st == b"ENIT" and info["type"] in ("ALCH", "INGR") and len(payload) >= 4:
            info["value"] = struct.unpack_from("<i", payload)[0]
    return info


_XCLL = struct.Struct("<4B4B4Bff ii fff")  # ambient, directional, fog near colour, near, far, rotXY, rotZ, fade, clip, power


def _rgb(b: tuple) -> list[int]:
    return [int(b[0]), int(b[1]), int(b[2])]


def decode_lighting(payload: bytes) -> dict:
    v = _XCLL.unpack_from(payload)
    out = {
        "ambientRGB": _rgb(v[0:4]), "directionalRGB": _rgb(v[4:8]),
        "fogNearRGB": _rgb(v[8:12]),
        "fogNearM": round(v[12] / UNITS_PER_METRE, 3), "fogFarM": round(v[13] / UNITS_PER_METRE, 3),
        "directionalFade": round(v[16], 3), "fogClipM": round(v[17] / UNITS_PER_METRE, 3),
        "fogPower": round(v[18], 3),
    }
    if len(payload) >= 92:
        far = struct.unpack_from("<4B", payload, 72)
        out["fogFarRGB"] = _rgb(far)
        out["fogMax"] = round(struct.unpack_from("<f", payload, 76)[0], 3)
        out["inherits"] = struct.unpack_from("<I", payload, 88)[0]
    return out


#: XCLL inherit bits -> the fields the template supplies (UESP Skyrim:CELL).
INHERIT_BITS = {0: ("ambientRGB",), 1: ("directionalRGB",), 2: ("fogNearRGB", "fogFarRGB"),
                3: ("fogNearM",), 4: ("fogFarM",), 6: ("directionalFade",), 7: ("fogClipM",),
                8: ("fogPower",), 9: ("fogMax",)}


# --------------------------------------------------------------------------- #
# classification
# --------------------------------------------------------------------------- #
def _family(name: str, table) -> str | None:
    low = name.lower()
    for label, words in table:
        if any(w in low for w in words):
            return label
    return None


def value_band(value: int | None) -> str | None:
    if value is None:
        return None
    for cap, band in VALUE_BANDS:
        if value < cap:
            return band
    return "rare"


def published_kit_assets(kits_dir: Path = KITS_DIR) -> dict[str, tuple[str, str | None]]:
    """asset id -> (kit, manifest category), over every published kit."""
    out: dict[str, tuple[str, str | None]] = {}
    for path in sorted(kits_dir.glob("*.kit.json")):
        data = json.loads(path.read_text())
        for asset in data.get("assets", []) or []:
            out.setdefault(asset["id"], (data.get("kit", path.name[:-9]), asset.get("category")))
    return out


def _deg(v) -> list[float]:
    return [round(math.degrees(float(c)), 3) for c in v]


def _mat_mul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(3)) for j in range(3)] for i in range(3)]


def _rot(axis: str, t: float):
    c, s_ = math.cos(t), math.sin(t)
    if axis == "x":
        return [[1, 0, 0], [0, c, -s_], [0, s_, c]]
    if axis == "y":
        return [[c, 0, s_], [0, 1, 0], [-s_, 0, c]]
    return [[c, -s_, 0], [s_, c, 0], [0, 0, 1]]


#: plugin (x east, y north, z up) -> game (x east, y up, z south)
_AXES = [[1, 0, 0], [0, 0, 1], [0, -1, 0]]
_AXES_T = [[1, 0, 0], [0, 0, -1], [0, 1, 0]]


def game_rotation_deg(rot) -> list[float]:
    """The plugin's Euler rotation (radians, applied X then Y then Z, each
    clockwise) as the runtime's ``[pitch, yaw, roll]`` degrees for
    ``Euler(pitch, -yaw, roll, 'YXZ')`` in the game frame."""
    rx, ry, rz = (float(v) for v in rot)
    r_plugin = _mat_mul(_rot("z", -rz), _mat_mul(_rot("y", -ry), _rot("x", -rx)))
    m = _mat_mul(_AXES, _mat_mul(r_plugin, _AXES_T))
    m23 = max(-1.0, min(1.0, m[1][2]))
    x = math.asin(-m23)
    if abs(m23) < 0.9999999:
        y = math.atan2(m[0][2], m[2][2])
        z = math.atan2(m[1][0], m[1][1])
    else:
        y = math.atan2(-m[2][0], m[0][0])
        z = 0.0
    out = [math.degrees(x), (-math.degrees(y)) % 360.0, math.degrees(z)]
    return [round(v, 3) + 0.0 for v in out]


def _game_pos(pos_units) -> list[float]:
    x, y, z = (float(c) / UNITS_PER_METRE for c in pos_units)
    return [round(x, 4), round(z, 4), round(-y, 4) + 0.0]


def export_cell(plugin_name: str, cell_edid: str, paths: dict[str, Path], registry,
                kit_assets, pool_of, doors: list[dict] | None = None) -> dict:
    """The bundle for one cell (see the module docstring). `doors` is the
    blueprint's pairing, `[{exteriorDoorId, interiorLoadDoorRef,
    arrivalMarker}]` (game frame), in door order."""
    from .mine_door_links import asset_id_for

    pset = PluginSet(paths[plugin_name], paths)
    main = pset.main
    got = read_cell(main, cell_edid)
    if got is None:
        raise SystemExit(f"{cell_edid} is not an interior cell of {plugin_name}")
    cell_rec, ref_recs = got
    refs = []
    wanted: set[tuple[str, int]] = set()
    ltmp = None
    xcll = None
    for st, payload in cell_rec.subrecords():
        if st == b"LTMP" and len(payload) >= 4:
            ltmp = struct.unpack_from("<I", payload)[0]
        elif st == b"XCLL" and len(payload) >= _XCLL.size:
            xcll = payload
    for rec in ref_recs:
        extra = _ref_extras(rec)
        extra["record"] = rec.type.decode("ascii")
        extra["formId"] = rec.form_id
        extra["key"] = pset.key(main, rec.form_id)
        if "base" in extra:
            extra["baseKey"] = pset.key(main, extra["base"])
            wanted.add(extra["baseKey"])
        refs.append(extra)
    if ltmp:
        wanted.add(pset.key(main, ltmp))
    records, quest_refs = read_records(pset, wanted)
    bases = {k: _base_info(r) for k, r in records.items() if r.type != b"LGTM"}

    pool = pool_of(plugin_name)
    placements, drops, lights, sockets = [], [], [], []
    load_doors: dict[str, dict] = {}
    for ref in sorted(refs, key=lambda r: r["formId"]):
        rid = f"{ref['formId']:08X}"
        base = bases.get(ref.get("baseKey"))
        pos = _game_pos(ref.get("pos", (0, 0, 0)))
        rot = game_rotation_deg(ref.get("rot", (0, 0, 0)))
        # compass yaw: Skyrim's z rotation is clockwise from above (the miners' convention)
        yaw = round(math.degrees(float(ref.get("rot", (0, 0, 0))[2])) % 360.0, 3)

        def drop(reason, **more):
            drops.append({"refId": rid, "reason": reason,
                          "base": (base or {}).get("editorId"),
                          "baseType": (base or {}).get("type"), **more})

        if base is None:
            key = ref.get("baseKey")
            drop("unresolved-base", **({"baseForm": f"{key[0]}:{key[1]:08X}"} if key else {}))
            continue
        btype = base["type"]
        name = f"{base.get('editorId') or ''} {base.get('model') or ''}"
        if ref["record"] == "ACHR" or btype in ACTOR_BASES:
            drop("actor")
            continue
        if ref["key"] in quest_refs:
            drop("quest")
            continue
        if btype == "LIGH" and "light" in base:
            lt = base["light"]
            # XRDS (UESP Skyrim_Mod:Mod_File_Format/REFR: "Radius, float") is
            # an override when positive; vanilla interiors also carry negative
            # values, which the radius keeps from the base record (raw kept).
            xrds = ref.get("radius")
            radius = xrds if isinstance(xrds, float) and xrds > 0 else lt["radiusUnits"]
            lights.append({"refId": rid, "positionM": pos,
                           "radiusM": round(float(radius) / UNITS_PER_METRE, 3),
                           "colorRGB": lt["colorRGB"], "fade": base.get("fade"),
                           "flags": lt["flags"], "falloffExponent": lt.get("falloffExponent"),
                           "base": base.get("editorId"),
                           "raw": {"xrdsUnits": round(xrds, 3) if isinstance(xrds, float) else None,
                                   "baseRadiusUnits": lt["radiusUnits"],
                                   **({"xlig": ref["xlig"]} if "xlig" in ref else {})}})
            if not base.get("model"):
                drop("light-source")
                continue
        if btype == "SOUN":
            drop("sound")
            continue
        if btype == "LVLI":
            drop("levelled-item")
            sockets.append({"id": f"socket.{cell_edid}.{rid}", "kind": "item", "positionM": pos,
                            "yawDeg": yaw, "host": None, "itemClass": "levelled",
                            "valueBand": None, "contentPending": False,
                            "why": f"levelled item list {base.get('editorId')} placed by the cell's author"})
            continue
        model = base.get("model")
        if btype == "DOOR" and ref.get("teleport") is not None:
            load_doors[rid] = {"id": f"{cell_edid}.{rid}", "refId": rid,
                               "targetRefId": f"{ref['teleport']:08X}", "positionM": pos,
                               "yawDeg": yaw}
        if btype == "IDLM":
            drop("marker")
            sockets.append({"id": f"socket.{cell_edid}.{rid}", "kind": "idle", "positionM": pos,
                            "yawDeg": yaw, "host": None,
                            "activity": _family(name, FURNITURE_ACTIVITY) or "stand",
                            "why": f"idle marker {base.get('editorId')}"})
            continue
        if btype == "FURN" and model and "marker" in model.rsplit("/", 1)[-1]:
            drop("marker")
            sockets.append({"id": f"socket.{cell_edid}.{rid}", "kind": "idle", "positionM": pos,
                            "yawDeg": yaw, "host": None,
                            "activity": _family(name, FURNITURE_ACTIVITY) or "stand",
                            "why": f"furniture marker {base.get('editorId')}"})
            continue
        if not model:
            drop("no-model")
            continue
        if model.startswith("markers/") or "/markers/" in model or model.startswith("marker"):
            drop("marker")
            continue
        asset_id = asset_id_for(model, registry, pool)
        hit = kit_assets.get(asset_id) if asset_id else None
        if hit is None:
            drop("no-kit-asset", model=model, assetId=asset_id)
            continue
        kit, kit_category = hit
        if btype == "CONT":
            category = "container"
        elif btype == "FURN":
            category = "furniture"
        elif btype == "LIGH":
            category = "light"
        elif btype in ITEM_BASES:
            category = "item"
        else:
            category = kit_category or classify(model).category
        pid = f"{cell_edid}.{rid}"
        placements.append({"id": pid, "assetId": asset_id, "kit": kit, "positionM": pos,
                           "rotationDeg": rot, "scale": round(float(ref.get("scale", 1.0)), 4),
                           "category": category, "base": base.get("editorId"),
                           "baseType": btype})
        if btype == "CONT":
            cls = _family(name, CONTAINER_FAMILIES) or "chest"
            sockets.append({"id": f"socket.{pid}", "kind": "container", "positionM": pos,
                            "yawDeg": yaw, "host": pid, "containerClass": cls,
                            "fillRule": f"blanket.household-{cls}",
                            "why": f"{base.get('editorId')} placed by the cell's author"})
        elif btype == "FURN":
            sockets.append({"id": f"socket.{pid}", "kind": "idle", "positionM": pos,
                            "yawDeg": yaw, "host": pid,
                            "activity": _family(name, FURNITURE_ACTIVITY) or "stand",
                            "why": f"{base.get('editorId')} placed by the cell's author"})
        elif btype in ITEM_BASES:
            sockets.append({"id": f"socket.{pid}", "kind": "item", "positionM": pos,
                            "yawDeg": yaw, "host": pid, "itemClass": ITEM_CLASS[btype],
                            "valueBand": value_band(base.get("value")),
                            "contentPending": btype == "BOOK",
                            "why": f"{base.get('editorId')} placed by the cell's author"})

    lighting = decode_lighting(xcll) if xcll else {}
    template = None
    if ltmp:
        trec = records.get(pset.key(main, ltmp))
        if trec is not None:
            tdata = next((p for st, p in trec.subrecords() if st == b"DATA"), None)
            tedid = next((_cstr(p) for st, p in trec.subrecords() if st == b"EDID"), None)
            if tdata and len(tdata) >= _XCLL.size:
                template = {"editorId": tedid, **decode_lighting(tdata[:_XCLL.size])}
    if template:
        inherits = lighting.get("inherits", 0xFFFFFFFF) if lighting else 0xFFFFFFFF
        for bit, fields in INHERIT_BITS.items():
            if inherits & (1 << bit):
                for f in fields:
                    if f in template:
                        lighting[f] = template[f]
        lighting["template"] = template.get("editorId")

    pairs = []
    for d in doors or []:
        load = load_doors.get(d["interiorLoadDoorRef"])
        if load is None:
            raise SystemExit(f"{cell_edid}: the claim pairs load door {d['interiorLoadDoorRef']}, "
                             f"which is not a load door of the cell")
        pairs.append({"exteriorDoorId": d["exteriorDoorId"],
                      "interiorLoadDoorRef": d["interiorLoadDoorRef"],
                      "arrivalMarker": d["arrivalMarker"],
                      "loadDoor": {"positionM": load["positionM"], "yawDeg": load["yawDeg"]}})
    # Planner ruling 3 (interiors round 3): every load door of the cell no
    # exterior door pairs with ships CLOSED (the runtime shows the closed line
    # and does nothing): the farmhouse's upper door, a cellar, a jail.
    paired_refs = {d["interiorLoadDoorRef"] for d in pairs}
    if pairs:
        for rid in sorted(load_doors):
            if rid not in paired_refs:
                load = load_doors[rid]
                pairs.append({"interiorLoadDoorRef": rid, "closed": True,
                              "loadDoor": {"positionM": load["positionM"], "yawDeg": load["yawDeg"]}})
    first = load_doors.get(pairs[0]["interiorLoadDoorRef"]) if pairs else (
        next(iter(sorted(load_doors.values(), key=lambda d: d["refId"])), None))
    arrival = (pairs[0]["arrivalMarker"] if pairs else
               ({"positionM": first["positionM"], "yawDeg": first["yawDeg"]} if first else None))
    kits = sorted({p["kit"] for p in placements})
    return {
        "schemaVersion": SCHEMA_VERSION,
        "cellId": cell_edid,
        "plugin": plugin_name,
        "frame": FRAME,
        "shellAssetId": None,
        "refCount": len(refs),
        "kits": {k: {"id": k, "glb": f"kits/{k}.glb", "manifest": f"kits/{k}.kit.json"}
                 for k in kits},
        "arrivalMarker": arrival,
        "exitDoor": ({k: first[k] for k in ("id", "refId", "positionM", "yawDeg")}
                     if first else None),
        "doors": pairs,
        "ambient": {"colorRGB": lighting.get("ambientRGB", [0, 0, 0]), "intensity": 1.0},
        "fog": {"colorRGB": lighting.get("fogNearRGB", [0, 0, 0]),
                "nearM": lighting.get("fogNearM", 0.0), "farM": lighting.get("fogFarM", 0.0)},
        "lighting": lighting,
        "placements": placements,
        "lights": lights,
        "sockets": sockets,
        "drops": drops,
        "counts": {
            "placements": len(placements), "drops": len(drops), "lights": len(lights),
            "dropsByReason": dict(sorted(Counter(d["reason"] for d in drops).items())),
            "socketsByKind": dict(sorted(Counter(s["kind"] for s in sockets).items())),
        },
    }


def check(bundle: dict) -> list[str]:
    """The acceptance gate: every reference is placed or listed as a drop."""
    problems = []
    n = len(bundle["placements"]) + len(bundle["drops"])
    if n != bundle["refCount"]:
        problems.append(f"{bundle['cellId']}: {len(bundle['placements'])} placements + "
                        f"{len(bundle['drops'])} drops = {n}, the cell has {bundle['refCount']} references")
    ids = [p["id"] for p in bundle["placements"]]
    if len(ids) != len(set(ids)):
        problems.append(f"{bundle['cellId']}: duplicate placement ids")
    return problems


def _num(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def _vec3(v) -> bool:
    return isinstance(v, list) and len(v) == 3 and all(_num(c) for c in v)


def _is_rgb(v) -> bool:
    return _vec3(v) and all(0 <= c <= 255 for c in v)


def _marker(v) -> bool:
    return isinstance(v, dict) and _vec3(v.get("positionM")) and _num(v.get("yawDeg"))


def validate_bundle(b: dict) -> list[str]:
    """The runtime's contract (`parseInteriorBundle`, bundle.ts), checked on
    the Python side: the same fields, the same refusals."""
    bad: list[str] = []
    if b.get("schemaVersion") != SCHEMA_VERSION:
        bad.append(f"schemaVersion {b.get('schemaVersion')!r}")
    for key in ("cellId", "plugin", "frame"):
        if not isinstance(b.get(key), str) or not b.get(key):
            bad.append(f"no {key}")
    if b.get("shellAssetId") is not None and not isinstance(b.get("shellAssetId"), str):
        bad.append("shellAssetId is neither a string nor null")
    kits = b.get("kits")
    if not isinstance(kits, dict) or not all(
            isinstance(v, dict) and v.get("id") == k and isinstance(v.get("glb"), str)
            and isinstance(v.get("manifest"), str) for k, v in kits.items()):
        bad.append("kits map malformed")
        kits = {}
    if not _marker(b.get("arrivalMarker")):
        bad.append("bad arrivalMarker")
    ex = b.get("exitDoor")
    if not (isinstance(ex, dict) and _vec3(ex.get("positionM")) and isinstance(ex.get("refId"), str)):
        bad.append("bad exitDoor")
    for d in b.get("doors") if isinstance(b.get("doors"), list) else [None]:
        closed = isinstance(d, dict) and d.get("closed") is True
        if not (isinstance(d, dict) and isinstance(d.get("interiorLoadDoorRef"), str)
                and _marker(d.get("loadDoor"))
                and (closed or (isinstance(d.get("exteriorDoorId"), str) and _marker(d.get("arrivalMarker"))))):
            bad.append(f"bad doors entry {d!r:.80}")
    for p in b.get("placements") or []:
        if p.get("kit") not in kits:
            bad.append(f"{p.get('id')}: kit {p.get('kit')!r} is not in the bundle's kits")
        if not (_vec3(p.get("positionM")) and _vec3(p.get("rotationDeg")) and _num(p.get("scale"))):
            bad.append(f"{p.get('id')}: bad transform")
    for i, lt in enumerate(b.get("lights") or []):
        if not (_vec3(lt.get("positionM")) and _num(lt.get("radiusM")) and lt["radiusM"] > 0
                and _is_rgb(lt.get("colorRGB"))):
            bad.append(f"light {i} malformed")
        if lt.get("fade") is not None and not _num(lt.get("fade")):
            bad.append(f"light {i} fade is not a number")
        raw = lt.get("raw")
        if not (isinstance(raw, dict) and "xrdsUnits" in raw and _num(raw.get("baseRadiusUnits"))):
            bad.append(f"light {i} raw malformed")
    amb, fog = b.get("ambient") or {}, b.get("fog") or {}
    if not (_is_rgb(amb.get("colorRGB")) and _num(amb.get("intensity"))):
        bad.append("bad ambient")
    if not (_is_rgb(fog.get("colorRGB")) and _num(fog.get("nearM")) and _num(fog.get("farM"))):
        bad.append("bad fog")
    for key in ("placements", "lights", "sockets", "drops"):
        if not isinstance(b.get(key), list):
            bad.append(f"no {key} list")
    return bad


def _environment():
    from .asset_registry import DEFAULT_VAULT
    from .mine_door_links import discover_plugins, registry_index
    found = discover_plugins(DEFAULT_VAULT)
    paths: dict[str, Path] = {}
    pools: dict[str, str] = {}
    for pool, path in found:
        paths.setdefault(path.name, path)
        pools.setdefault(path.name, pool)
    return paths, pools, registry_index()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--plugin")
    ap.add_argument("--cell")
    ap.add_argument("--blueprint", help="export every tier A claim on this blueprint's doors")
    ap.add_argument("--out-dir", default=str(OUT_DIR))
    args = ap.parse_args()
    jobs: list[tuple[str, str, str | None]] = []
    pairs: dict[tuple[str, str], list[dict]] = {}
    if args.blueprint:
        data = json.loads(Path(args.blueprint).read_text())
        bp = data.get("blueprint", data)
        parcels = {p.get("id"): p for p in bp.get("parcels", []) or []}
        for door in bp.get("doors", []) or []:
            claim = door.get("interiorClaim") or {}
            if claim.get("tier") == "A":
                shell = (parcels.get(door.get("parcelId")) or {}).get("assetRef")
                jobs.append((claim["plugin"], claim["cellId"], shell))
                pairs.setdefault((claim["plugin"], claim["cellId"]), []).append({
                    "exteriorDoorId": door["id"],
                    "interiorLoadDoorRef": claim["interiorLoadDoorRef"],
                    "arrivalMarker": claim["arrivalMarker"]})
    elif args.plugin and args.cell:
        jobs.append((args.plugin, args.cell, None))
    else:
        ap.error("--plugin and --cell, or --blueprint")
    paths, pools, registry = _environment()
    kit_assets = published_kit_assets()
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    failed = 0
    for plugin, cell, shell in dict.fromkeys(jobs):
        bundle = export_cell(plugin, cell, paths, registry, kit_assets, lambda n: pools.get(n),
                             doors=pairs.get((plugin, cell)))
        bundle["shellAssetId"] = shell
        if not bundle["doors"]:
            from .interior_cells import game_marker, profile_cell, world_for
            prof = profile_cell(world_for(plugin, paths.get), cell, shell) or {}
            if prof.get("exteriorDoors"):
                bundle["arrivalMarker"] = game_marker(prof["exteriorDoors"][0]["arrivalMarker"])
        problems = check(bundle) + validate_bundle(bundle)
        gaps = [d for d in bundle["drops"] if d["reason"] == "no-kit-asset"]
        (out_dir / f"{cell}.json").write_text(json.dumps(bundle, indent=1) + "\n")
        print(f"{cell}: refs {bundle['refCount']}, " + json.dumps(bundle["counts"]))
        for g in gaps:
            print(f"  gap {g['refId']} {g['baseType']} {g.get('model')}")
        for p in problems:
            print(f"  FAIL {p}")
        failed += bool(problems)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
