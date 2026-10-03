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
  in no published kit; never faked);
* ``substitutions[]`` — a MISSING piece (``unresolved-base``: its master is not
  ours; ``no-kit-asset``) drawn by a same-class stand-in we hold (planner ruling
  2026-09-27, lane I): ``{refId, originalPath, baseForm, class, standInAsset,
  kit, standInCategory, why, id, positionM, rotationDeg, scale}``, from the
  tracked record ``world/sources/placement/kit-interiors/substitutions/<cell>.json``.
* additions (decision 0109) — kit pieces the builder ADDS to the cell (a
  candle on the table, a lantern by the door), from the tracked record
  ``world/sources/placement/kit-interiors/additions/<cell>.json``: appended to
  ``placements[]`` with ``source: "addition"``, sorted by their stable id
  ``<cell>:add:<slug>``; they never move or remove a plugin reference and are
  outside the ``refCount`` sum. The lighting rule then lights them like any
  placement.

Every missing piece carries its ``class``: the base record's type and model
(``piece_class``), or, when its master is absent (Creation Club, HearthFires,
Dawnguard, Dragonborn: never sourced), the sourced row in
``kit-interiors/absent-master-classes.json``; ``unclassed`` when neither exists.

Acceptance (the gate ``--check`` and the test run): ``len(placements) +
len(drops) + len(substitutions) == refCount``; a stand-in's published kit
category equals the missing piece's class and that class is clutter or
furniture; a missing ARCHITECTURE piece (``ARCHITECTURE_CLASSES``) fails the
export outright: such a cell is never claimed.

Alongside: ``lights[]`` from each light reference's LIGH record (radius with
the reference's XRDS override, colour, flicker flags) and the cell's
``lighting`` (ambient, the directional ambient cube ``ambientCube``, directional,
fog colours and distances, light fade) from its XCLL,
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
(XRDS) counts only when positive and at least a quarter of the base radius
(``light_radius_units``), the raw value kept in ``raw``.

Doors: the cell file is shared by every place that claims the cell
(Greenspring, Claywater Station and Riverwalk all claim KeebaHouseCrafter), so
it carries nothing about any one place (decision 0104: one home per fact).
``doors[]`` lists every load door of the cell as ``{doorType: "load",
interiorLoadDoorRef, loadDoor}`` in ref order; which exterior door pairs with
which load door, and where entering by it arrives, is the PLACE's door record
(``interiorClaim.{cellId, interiorLoadDoorRef, arrivalMarker}``), and the
runtime reads open or closed from the place entered from (a load door no door
of that place claims shows the closed line, planner ruling 3, interiors round
3). ``exitDoor`` is the first load door; ``arrivalMarker`` is the plugin's own
arrival (its exterior partner's teleport), the default for ``?interior=`` and
for a claim without a marker; ``shellAssetId`` is null (the shell is the
claiming parcel's ``assetRef``). Every
entry carries ``doorType``: those are ``load``; a DOOR reference with NO XTEL
teleport follows as a ``swing`` entry (owner 2026-09-28, schemaVersion 2)
``{doorType, id, refId, assetId, kit, positionM, rotationDeg, scale, hinge:
{pivotM, axis, openAngleDeg, openS, source}, initiallyOpen}`` and is not a
placement (the runtime draws it and animates it, ``interior/swingDoors.ts``):
the hinge is the NIF's animated node and its ``Open`` sequence (``door_hinge``),
``initiallyOpen`` the reference's ONAM ("Open by Default").

Run (from tooling/world-generation/):
  python3 -m worldgen.export_interior_bundle --plugin Skyrim.esm --cell DawnstarBrinasHouse
  python3 -m worldgen.export_interior_bundle --blueprint ../../world/sources/blueprints/<place>.json

Cost (KeebaHouseFisher, 118 placements, 2026-09-30, loaded machine): own peak
1.43 GiB (target 1.6 GiB, the plugin world loaded once per run is most of it); ~55 s an export with a cold plugin cache, ~23 s of it parsing the
plugins (``interior_cells.world_for``), ~4 s the settle pass's contact gaps
(deterministic per-piece points against nearby triangles,
``interior_support.contact_gaps``; was 18 s of random surface sampling) and
~2-8 s the coplanar ``separate`` passes.
"""

from __future__ import annotations

import argparse
import json
import math
import struct
import sys
from collections import Counter
from pathlib import Path

_ASSET_PIPELINE = Path(__file__).resolve().parents[3] / "tooling" / "asset-pipeline"
if str(_ASSET_PIPELINE) not in sys.path:
    sys.path.insert(0, str(_ASSET_PIPELINE))

from .asset_taxonomy import classify  # noqa: E402
from .esp_index import GT_WORLD_CHILDREN, UNITS_PER_METRE, Plugin, _cstr, walk
from .esp import GROUP_HEADER, RECORD_HEADER, _record_at
from .sockets import SOCKET_SCHEMA_VERSION, interact_point, load_vocabulary, needs_interact  # noqa: E402
from .sockets import published_kit_bounds as _socket_kit_bounds  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[3]
KITS_DIR = REPO_ROOT / "apps" / "world-studio" / "public" / "kits"
OUT_DIR = REPO_ROOT / "apps" / "world-studio" / "public" / "province" / "interiors"
#: 2 (16k walk 4, owner 2026-09-28): `doors[]` entries carry `doorType`; a DOOR
#: reference with no XTEL teleport is a `swing` entry, no longer a placement
#: 3 (2026-09-29): the shared cell file carries no per-place field; load doors
#: are `{doorType, interiorLoadDoorRef, loadDoor}` and the pairing is the
#: place's door record (`interiorClaim`)
#: 4 (2026-09-30): `lighting.ambientCube` {px,nx,py,ny,pz,nz: linear rgb, game axes},
#: the XCLL/LGTM DALC directional ambient; the runtime lights the cell with it
#: (a LightProbe) in place of the flat ambient, and the light rule adds no fill
SCHEMA_VERSION = 4
#: fields that belong to one claiming place, never to the shared cell file
PER_PLACE_DOOR_FIELDS = ("exteriorDoorId", "arrivalMarker", "closed")
#: a swing door whose NIF has no Open sequence opens this far (degrees)
SWING_DEFAULT_OPEN_DEG = 90.0
#: and over this long (seconds)
SWING_DEFAULT_OPEN_S = 0.6
FRAME = ("game: metres, x east, y up, z south; rotationDeg [pitch, yaw, roll] applied as "
         "Euler(pitch, -yaw, roll, 'YXZ'); yaw is a compass bearing, clockwise from north (-z)")
FIXTURE = (REPO_ROOT / "packages" / "game-core" / "src" / "interior" / "__fixtures__"
           / "interior.fixture.json")

KIT_INTERIORS = REPO_ROOT / "world" / "sources" / "placement" / "kit-interiors"
SUBSTITUTIONS_DIR = KIT_INTERIORS / "substitutions"
#: decision 0109: kit pieces a builder adds to a tier A cell (never a move or removal)
ADDITIONS_DIR = KIT_INTERIORS / "additions"
ADDITION_ZONES = frozenset({"bed", "table", "hearth", "work", "door", "store", "shrine"})
ABSENT_MASTER_CLASSES = KIT_INTERIORS / "absent-master-classes.json"
#: drop reasons that mean "the author drew something here we cannot draw"
MISSING_REASONS = ("unresolved-base", "no-kit-asset")
#: classes (kit manifest categories) a stand-in may replace (planner ruling
#: 2026-09-27: clutter and furniture only) and the ones that make a cell unfit
SUBSTITUTABLE_CLASSES = frozenset({"clutter", "furniture"})
ARCHITECTURE_CLASSES = frozenset({"architecture", "ruin", "dungeon-kit", "door", "bridge"})
#: classes a missing piece is LISTED as a drop, never stood in for (planner
#: ruling 2026-09-27, lane P): an effect (steam, smoke) and a wearable (an
#: ARMO ground model: boots, sandals) carry no furnishing the room needs
LISTED_DROP_CLASSES = frozenset({"effect", "wearable"})
#: The one effect a room needs (16k walk 6): the plugin's hearth fire, an MSTT
#: effect with no kit mesh, stands in as the kit fire bed that carries the mined
#: hearth flame. Base EDID -> stand-in, in preference order; one fire per hearth
#: (a second fire effect within HEARTH_FIRE_M of a stood-in one stays a drop).
HEARTH_FIRE_STAND_INS = {
    "FXfireWithEmbersLogs01": "vanilla:clutter/woodfires/fireplacewood01burning",
    "FXfireWithEmbersLight": "vanilla:clutter/woodfires/fireplacewood01burning",
    # Skyrim.esm MSTT 0003BD2E, model FXfireWithEmbers03.nif, 42 units tall: a low
    # burning fire (the HTBM huts' brazier fire), not a dead one
    "FXfireWithEmbersOut": "vanilla:clutter/woodfires/fireplacewood01burning",
}
HEARTH_FIRE_WHY = "A log fire burns in the hearth here."
HEARTH_FIRE_M = 1.0
#: an effect model under this prefix is a fire; one left as a drop with no
#: stood-in fire within HEARTH_FIRE_M fails the gate (audit10: the HTBM huts'
#: FXfireWithEmbersOut fell to listed-drop and the brazier burned nothing)
FIRE_EFFECT_MODEL_PREFIX = "effects/fxfire"


def is_hearth_fire(sub: dict) -> bool:
    """A substitution that is the plugin hearth fire's kit fire bed (the one
    effect-class stand-in; its category is the fire bed's, not 'effect')."""
    return (sub.get("class") == "effect" and sub.get("why") == HEARTH_FIRE_WHY
            and sub.get("standInAsset") in HEARTH_FIRE_STAND_INS.values())

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
    """A plugin and its masters, with form ids resolved to `(file, local id)`.

    `self.plugins` is in load order: the masters in the main plugin's MAST
    order, the main plugin last, so the last plugin to define a record owns
    it (an override beats the original it overrides)."""

    def __init__(self, plugin: Path, paths: dict[str, Path], cache=None):
        from .plugin_cache import PluginCache
        cache = cache if cache is not None else PluginCache()
        self.main = cache.plugin(plugin)
        self.plugins = {}
        for master in self.main.masters:
            path = paths.get(master)
            if path is not None:
                self.plugins[master] = cache.plugin(path)
        self.plugins[self.main.path.name] = self.main
        self._record_index = None

    def record_index(self) -> tuple[dict, frozenset]:
        """`({key: (first-seen ordinal, plugin name, byte offset)}, quest-forced
        ref keys)`, built once per PluginSet on first use.

        One header-only pass over every plugin in `self.plugins` (load)
        order, replacing a record-by-record walk that decompressed each:
        ~1.04 M records and 5.4 of 5.8 s per cell (speed lane 2 S5d). The
        entry keeps the LAST record seen for a key, which is the latest
        plugin's in load order, and the ordinal of the FIRST (the old dict's
        insertion order). Only QUST bodies are decompressed, for their ALFR
        aliases."""
        if self._record_index is None:
            entries: dict[tuple[str, int], tuple[int, str, int]] = {}
            quest_refs: set[tuple[str, int]] = set()
            head = RECORD_HEADER
            ordinal = 0
            for name, plugin in self.plugins.items():
                buf, pos, end = plugin.buf, plugin._body_start, len(plugin.buf)
                source_of = plugin.source_of
                while pos + 4 <= end:
                    if buf[pos:pos + 4] == b"GRUP":
                        pos += GROUP_HEADER.size          # descend: records follow in buffer order
                        continue
                    rtype, dsize, _flags, form_id, _vc, _ver, _u = head.unpack_from(buf, pos)
                    key = (source_of(form_id), form_id & 0xFFFFFF)
                    prior = entries.get(key)
                    entries[key] = (prior[0] if prior else ordinal, name, pos)
                    ordinal += 1
                    if rtype == b"QUST":
                        rec, _ = _record_at(buf, pos)
                        for st, payload in rec.subrecords():
                            if st == b"ALFR" and len(payload) >= 4:
                                fid = struct.unpack_from("<I", payload)[0]
                                quest_refs.add((source_of(fid), fid & 0xFFFFFF))
                    pos += head.size + dsize
            self._record_index = (entries, frozenset(quest_refs))
        return self._record_index

    def key(self, owner: Plugin, form_id: int) -> tuple[str, int]:
        return owner.source_of(form_id), form_id & 0xFFFFFF


def plugin_set(plugin: Path, paths: dict[str, Path], cache=None) -> PluginSet:
    """`PluginSet(plugin, paths)` from `cache` (a `plugin_cache.PluginCache`
    the caller owns: one set per unchanged plugin and masters, every file
    parsed once however many sets share it; a fresh cache when None)."""
    from .plugin_cache import PluginCache
    return (cache if cache is not None else PluginCache()).plugin_set(Path(plugin), paths)


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
        elif st == b"ONAM":
            # UESP Skyrim_Mod:Mod_File_Format/REFR: "zero length, appears
            # together with XACT if 'Open by Default' is set"
            out["openByDefault"] = True
    return out


#: An XRDS override under this share of its LIGH's base radius is implausible
#: and ignored (below).
MIN_XRDS_SHARE = 0.25


def light_radius_units(xrds, base_units: float) -> float:
    """A light reference's radius in game units. XRDS (UESP
    Skyrim_Mod:Mod_File_Format/REFR: "Radius, float ... Controls the radii on
    objects like lights"; xEdit wbFloat(XRDS, 'Radius')) overrides the LIGH's
    base radius, 0 meaning "use the base". KotM's cells also carry values no
    author set as a radius: negative ones (KeebaHouseElder 0801AA30: -65.3)
    and slivers (LilmothGlassworksOverseerHouse 08879824: 26.5 units, 0.38 m,
    on a 384-unit hearth light that then lit nothing). The override counts only
    when it is a finite positive float of at least ``MIN_XRDS_SHARE`` of the
    base radius; otherwise the base record's radius stands (the raw value is
    kept in the light's ``raw.xrdsUnits``)."""
    if isinstance(xrds, float) and math.isfinite(xrds) and xrds >= MIN_XRDS_SHARE * float(base_units) and xrds > 0:
        return xrds
    return base_units


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
    templates asked for, plus every reference a quest alias forces (ALFR).

    Answered from `PluginSet.record_index` (built once per PluginSet): for
    a key defined in several plugins the latest in load order wins (masters
    in MAST order, the main plugin last), so the main plugin's override
    beats the master's original."""
    entries, quest_refs = pset.record_index()
    hits = sorted((entries[k] + (k,) for k in wanted if k in entries))
    found = {key: _record_at(pset.plugins[name].buf, pos)[0] for _ordinal, name, pos, key in hits}
    return found, set(quest_refs)


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

#: The full 92-byte XCLL (UESP Skyrim_Mod:Mod_File_Format/CELL, XCLL, read 2026-09-30 through
#: the MediaWiki API): after fog power (offset 40) the "Ambient Colors" block, six rgba
#: directional ambients X+, X-, Y+, Y-, Z+, Z- (40..64), specular rgba (64), fresnel power
#: float (68); then fog far rgba (72), fog max (76), light fade begin/end (80, 84) and the
#: inherit flags uint32 (88). The lighting template (UESP Skyrim_Mod:Mod_File_Format/LGTM)
#: keeps the same DATA layout but leaves 40..72 unknown: its ambient cube, specular and
#: fresnel are the separate DALC subrecord (six rgba, specular rgba, fresnel float).
XCLL_FULL_SIZE = 92
_CUBE_KEYS = ("xp", "xn", "yp", "yn", "zp", "zn")    # Skyrim axes, UESP order


def _rgb(b: tuple) -> list[int]:
    return [int(b[0]), int(b[1]), int(b[2])]


def _srgb_linear(c: int) -> float:
    v = c / 255.0
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def decode_ambient_colors(payload: bytes, offset: int = 0) -> dict:
    """The "Ambient Colors" block at ``offset`` (XCLL 40, LGTM DALC 0): the six
    directional ambients in Skyrim axes (sRGB bytes), specular and fresnel power."""
    cube = {k: _rgb(struct.unpack_from("<4B", payload, offset + 4 * i)) for i, k in enumerate(_CUBE_KEYS)}
    return {"ambientCubeSkyrimRGB": cube,
            "specularRGB": _rgb(struct.unpack_from("<4B", payload, offset + 24)),
            "fresnelPower": round(struct.unpack_from("<f", payload, offset + 28)[0], 4)}


def ambient_cube(skyrim_rgb: dict) -> dict:
    """``lighting.ambientCube``: the Skyrim cube in GAME axes, linear 0-1, one value
    per surface normal (a floor facing up gets ``py``).
    Each Skyrim directional ambient (XCLL / DALC) names the direction the light
    TRAVELS, so a surface receives the colour of the axis opposite its normal:
    Z- (light travelling down, the sky term) lands on up-facing floors (vol4-axis:
    Skyrim.esm's 71 daytime WTHR DALC have Z+/Z- median 0.51, clear-sky Z- is the
    sky colour; its 573 full interior XCLL median 0.30).
    Skyrim is x east, y north, z up; the game frame (FRAME, and every placement's
    positionM) is x east, y up, z south: game (x, y, z) = Skyrim (x, z, -y). So
    normal game +x (east) <- Skyrim X- (light travelling west), -x <- X+;
    +y (up) <- Z-, -y (down) <- Z+; +z (south, Skyrim -Y) <- Y+ (light travelling
    north), -z (north) <- Y-."""
    src = {"px": "xn", "nx": "xp", "py": "zn", "ny": "zp", "pz": "yp", "nz": "yn"}
    return {k: [round(_srgb_linear(c), 5) for c in skyrim_rgb[v]] for k, v in src.items()}


def decode_lighting(payload: bytes) -> dict:
    v = _XCLL.unpack_from(payload)
    out = {
        "ambientRGB": _rgb(v[0:4]), "directionalRGB": _rgb(v[4:8]),
        "fogNearRGB": _rgb(v[8:12]),
        "fogNearM": round(v[12] / UNITS_PER_METRE, 3), "fogFarM": round(v[13] / UNITS_PER_METRE, 3),
        # XCLL rotation XY / Z (UESP Skyrim_Mod:Mod_File_Format/CELL: int32
        # degrees): where the cell's directional light comes from
        "directionalRotXYDeg": int(v[14]), "directionalRotZDeg": int(v[15]),
        "directionalFade": round(v[16], 3), "fogClipM": round(v[17] / UNITS_PER_METRE, 3),
        "fogPower": round(v[18], 3),
    }
    if len(payload) >= XCLL_FULL_SIZE:
        far = struct.unpack_from("<4B", payload, 72)
        out["fogFarRGB"] = _rgb(far)
        out["fogMax"] = round(struct.unpack_from("<f", payload, 76)[0], 3)
        begin, end = struct.unpack_from("<ff", payload, 80)
        out["lightFadeBeginM"] = round(begin / UNITS_PER_METRE, 3)
        out["lightFadeEndM"] = round(end / UNITS_PER_METRE, 3)
        out["inherits"] = struct.unpack_from("<I", payload, 88)[0]
    return out


def decode_cell_lighting(payload: bytes) -> dict:
    """A CELL's XCLL: ``decode_lighting`` plus its Ambient Colors block."""
    out = decode_lighting(payload)
    if len(payload) >= XCLL_FULL_SIZE:
        out.update(decode_ambient_colors(payload, 40))
    return out


#: XCLL inherit bits -> the fields the template supplies (UESP Skyrim_Mod:Mod_File_Format/CELL).
#: Bit 0 "Ambient Color" carries the Ambient Colors block too (the CK inherits the cube,
#: specular and fresnel with the ambient; LGTM keeps them in DALC).
INHERIT_BITS = {0: ("ambientRGB", "ambientCubeSkyrimRGB", "specularRGB", "fresnelPower"),
                1: ("directionalRGB",), 2: ("fogNearRGB", "fogFarRGB"),
                3: ("fogNearM",), 4: ("fogFarM",),
                5: ("directionalRotXYDeg", "directionalRotZDeg"), 6: ("directionalFade",), 7: ("fogClipM",),
                8: ("fogPower",), 9: ("fogMax",), 10: ("lightFadeBeginM", "lightFadeEndM")}


def resolve_lighting(xcll: bytes | None, template_data: bytes | None, template_dalc: bytes | None,
                     template_edid: str | None) -> dict:
    """The cell's lighting: its XCLL with every inherited field taken from the
    template (LGTM DATA + DALC), then ``ambientCube`` in game axes (raw bytes kept
    under ``raw``). A cell with no XCLL inherits everything."""
    lighting = decode_cell_lighting(xcll) if xcll else {}
    if template_data and len(template_data) >= _XCLL.size:
        template = decode_lighting(template_data)
        template.pop("inherits", None)
        if template_dalc and len(template_dalc) >= 32:
            template.update(decode_ambient_colors(template_dalc, 0))
        inherits = lighting.get("inherits", 0xFFFFFFFF) if lighting else 0xFFFFFFFF
        for bit, fields in INHERIT_BITS.items():
            if inherits & (1 << bit):
                for f in fields:
                    if f in template:
                        lighting[f] = template[f]
        lighting["template"] = template_edid
    sky = lighting.pop("ambientCubeSkyrimRGB", None)
    if sky:
        lighting["ambientCube"] = ambient_cube(sky)
        lighting["raw"] = {"ambientCubeSkyrimRGB": sky}
    return lighting


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


def absent_master_classes(path: Path = ABSENT_MASTER_CLASSES) -> dict[str, dict]:
    """``"<master>:<local id>" -> {class, source}``: the class of a base object
    whose master we do not hold, from a written source (UESP, or the planner's
    ruling with the reference's position as evidence)."""
    if not path.exists():
        return {}
    return json.loads(path.read_text()).get("forms", {})


def load_substitutions(cell_edid: str, directory: Path = SUBSTITUTIONS_DIR) -> dict[str, dict]:
    """refId -> ``{standInAsset, why}`` for one cell (empty when it has none)."""
    path = directory / f"{cell_edid}.json"
    if not path.exists():
        return {}
    doc = json.loads(path.read_text())
    if doc.get("cellId") != cell_edid:
        raise ValueError(f"{path.name}: cellId {doc.get('cellId')!r} is not {cell_edid}")
    return {row["refId"]: row for row in doc.get("substitutions", [])}


def cell_extent(placements: list[dict], kit_bounds: dict[str, tuple]) -> tuple[list, list]:
    """The cell's bounds in its own frame: the box around every plugin
    placement's bounding sphere (radius from its kit ``sizeM`` and
    ``originOffsetM`` times its scale; axis-free, so it never refuses a
    point inside the room). Catches an addition authored in the wrong frame.
    A substitution carries ``standInAsset`` in place of ``assetId``."""
    lo, hi = [math.inf] * 3, [-math.inf] * 3
    for p in placements:
        asset = p.get("assetId") or p.get("standInAsset")
        size, origin = kit_bounds.get(asset) or ([0.0] * 3, [0.0] * 3)
        r = float(p.get("scale", 1.0)) * (math.hypot(*size) / 2 + math.hypot(*origin))
        for i in range(3):
            lo[i] = min(lo[i], p["positionM"][i] - r)
            hi[i] = max(hi[i], p["positionM"][i] + r)
    return lo, hi


def load_additions(cell_edid: str, placements: list[dict], kit_assets: dict,
                   kit_bounds: dict[str, tuple], directory: Path = ADDITIONS_DIR) -> list[dict]:
    """The cell's additions (decision 0109) as placements, sorted by id; empty
    when the cell has no file. Refuses (ValueError) an asset in no published
    kit, a duplicate or foreign id, an unknown zone, a missing ``why`` and a
    position outside ``cell_extent`` of the plugin placements."""
    path = directory / f"{cell_edid}.json"
    if not path.exists():
        return []
    doc = json.loads(path.read_text())
    if doc.get("schemaVersion") != 1 or doc.get("cellId") != cell_edid:
        raise ValueError(f"{path.name}: needs schemaVersion 1 and cellId {cell_edid}")
    lo, hi = cell_extent(placements, kit_bounds)
    taken = {p["id"] for p in placements}
    out = []
    for row in sorted(doc.get("additions") or [], key=lambda r: str(r.get("id"))):
        aid = row.get("id")
        if not (isinstance(aid, str) and aid.startswith(f"{cell_edid}:add:") and len(aid) > len(cell_edid) + 5):
            raise ValueError(f"{path.name}: addition id {aid!r} is not {cell_edid}:add:<slug>")
        if aid in taken:
            raise ValueError(f"{path.name}: duplicate id {aid}")
        taken.add(aid)
        hit = kit_assets.get(row.get("assetId"))
        if hit is None:
            raise ValueError(f"{path.name}: {aid}: asset {row.get('assetId')!r} is in no published kit")
        if row.get("zone") not in ADDITION_ZONES:
            raise ValueError(f"{path.name}: {aid}: zone {row.get('zone')!r} not in {sorted(ADDITION_ZONES)}")
        if not (isinstance(row.get("why"), str) and row["why"].strip()):
            raise ValueError(f"{path.name}: {aid}: no why")
        pos = row.get("pos")
        if not (isinstance(pos, list) and len(pos) == 3 and all(isinstance(v, (int, float)) for v in pos)):
            raise ValueError(f"{path.name}: {aid}: pos must be [x, y, z] metres")
        if not all(lo[i] <= pos[i] <= hi[i] for i in range(3)):
            raise ValueError(f"{path.name}: {aid}: pos {pos} is outside the cell "
                             f"({[round(v, 2) for v in lo]}..{[round(v, 2) for v in hi]})")
        out.append({"id": aid, "assetId": row["assetId"], "kit": hit[0],
                    "positionM": [round(float(v), 4) + 0.0 for v in pos],
                    "rotationDeg": game_rotation_deg((0.0, 0.0, math.radians(float(row.get("rotZDeg", 0.0))))),
                    "scale": 1.0, "category": hit[1] or "clutter", "base": None, "baseType": None,
                    "source": "addition", "zone": row["zone"]})
    return out


#: the one reason a missing piece may ship undrawn (planner ruling R51, 16k
#: walk 3; decision 0102's third reason): the piece exists nowhere we may use
#: after a completed search, recorded with the search in the cell's ``gaps[]``
GAP_REASONS = frozenset({"asset-exists-nowhere"})
#: a placed piece whose only support was an asset-exists-nowhere gap (a
#: stalagmite on a resource-pack boulder, 16k walk 9) would hang in the air
#: (`wb.py audit-interior` floating); it goes undrawn with its support,
#: naming that gap in ``restsOn``
DEPENDENT_GAP_REASON = "rests-on-a-gap"


def load_gaps(cell_edid: str, directory: Path = SUBSTITUTIONS_DIR) -> dict[str, dict]:
    """refId -> ``{reason, search, why}`` for one cell's listed gaps (R51);
    a ``rests-on-a-gap`` row names the asset-exists-nowhere gap it stood on
    (``restsOn``) instead of a search."""
    path = directory / f"{cell_edid}.json"
    if not path.exists():
        return {}
    rows = json.loads(path.read_text()).get("gaps", [])
    nowhere = {r.get("refId") for r in rows if r.get("reason") in GAP_REASONS}
    bad = [r.get("refId") for r in rows
           if not ((r.get("reason") in GAP_REASONS and r.get("search"))
                   or (r.get("reason") == DEPENDENT_GAP_REASON and r.get("restsOn") in nowhere))]
    if bad:
        raise ValueError(f"{path.name}: gaps {bad} need reason in {sorted(GAP_REASONS)} and a "
                         f"search, or {DEPENDENT_GAP_REASON!r} naming a listed gap in restsOn")
    return {row["refId"]: row for row in rows}


def piece_class(base: dict | None, base_form: str | None, model: str | None,
                absent: dict[str, dict]) -> tuple[str, str]:
    """``(class, source)`` of a missing piece, in the kit-manifest category
    vocabulary: the base record's type (FURN furniture, CONT container, LIGH
    light, DOOR door, a carried item clutter), else the model path's taxonomy
    category; a base in an absent master takes its sourced row, else
    ``unclassed``. Never guessed from a name."""
    if base is None:
        row = absent.get(base_form or "")
        return (row["class"], row["source"]) if row else ("unclassed", "master absent, no sourced row")
    btype = base["type"]
    if btype == "TREE":
        return "vegetation", "base record TREE (planner ruling R46, 16k walk 3)"
    if btype == "CONT":
        return "container", "base record CONT"
    if model and "crate" in classify(model).tags:
        # R47: a crate is clutter (asset_taxonomy.classify), ahead of its base type
        return "clutter", f"base record {btype}, a crate (planner ruling R47, 16k walk 3)"
    fixed = {"FURN": "furniture", "LIGH": "light", "DOOR": "door"}
    if btype in fixed:
        return fixed[btype], f"base record {btype}"
    if btype == "ARMO":
        return "wearable", "base record ARMO (a worn item's ground model)"
    if btype in ITEM_BASES:
        return "clutter", f"base record {btype} (a carried item)"
    if model:
        category = classify(model).category
        if (category in ARCHITECTURE_CLASSES
                and "clutter" in model.lower().replace("\\", "/").split("/")[:-1]):
            # the author filed the mesh under a clutter folder inside a kit
            # folder (Creation Club's dungeons/root/clutter/rootclusterlarge01):
            # clutter, not the kit's architecture (16k walk 9, type-5 slice)
            return "clutter", f"base record {btype}, model in the kit's clutter folder"
        return category, f"base record {btype}, model taxonomy"
    return "unclassed", f"base record {btype} with no model"


#: meshes Skyrim uses for a load door that draws nothing (AutoLoadDoor01 at a
#: cave mouth); matched on the file name
INVISIBLE_LOAD_DOOR_MODELS = frozenset({"autoloadmarker01.nif", "autoloadmarker01"})


def is_invisible_load_door(model: str) -> bool:
    return model.lower().replace("\\", "/").rsplit("/", 1)[-1] in INVISIBLE_LOAD_DOOR_MODELS


#: R45 (planner ruling, 16k walk 3): the kit categories a reference can rest on
SURFACE_CATEGORIES = frozenset({"clutter", "furniture", "container", "item"})
#: ... and the structural ones whose top or base is a floor (room shells and
#: floor pieces file under misc in the KotM kits); never a light, door or plant
STRUCTURAL_CATEGORIES = ARCHITECTURE_CLASSES - {"door"} | {"misc"}
#: R45 tolerances, metres: how far a reference may sit outside a piece's plan,
#: above its top, and above a floor; the bounds that make a floor piece furniture
SUPPORT_MARGIN_M = 0.05
SHELL_FLOOR_M = 0.4
SUPPORT_TOP_M = 0.15
SUPPORT_BASE_M = 0.08
FLOOR_BAND_M = 0.2
FLOOR_REACH_M = 6.0
FURNITURE_BOUNDS_M = 0.6
#: R49 (planner ruling, 16k walk 3): a reference with nothing under it is hung
#: (a fixture) only when a wall or room-shell face lies within this reach
WALL_REACH_M = 0.3


def _local_point(q, piece) -> tuple[float, float, float]:
    """``q`` (game frame) in the piece's asset frame (plugin axes: x east,
    y north, z up; metres, unscaled). Yaw only: a tilted piece is rare and
    tilts its top by centimetres over its plan."""
    pos = piece["positionM"]
    dx, dy, dz = q[0] - pos[0], -(q[2] - pos[2]), q[1] - pos[1]
    t = math.radians(float(piece["rotationDeg"][1]))
    s_ = float(piece.get("scale") or 1.0)
    return ((dx * math.cos(t) - dy * math.sin(t)) / s_,
            (dx * math.sin(t) + dy * math.cos(t)) / s_, dz / s_)


def support_of(q, placements: list[dict], bounds: dict[str, tuple]) -> tuple[str, list[str]]:
    """Where a reference at ``q`` (game frame) sits in its cell (R45): on a
    ``surface`` piece (inside a clutter, furniture or container piece's plan,
    above its base and at most ``SUPPORT_TOP_M`` above its top: a table, a
    shelf level, a basket), on the ``floor`` (on the top of a floor or
    structural piece, or within ``FLOOR_BAND_M`` of the base of the nearest
    standing furniture; a structural piece is a room shell, wall or floor
    piece, whose floor is its top or lies within ``SHELL_FLOOR_M`` of its
    base), else on a ``wall`` (above the floor with nothing of
    the cell's own under it and a wall or room-shell face within
    ``WALL_REACH_M``: hung), else ``loose`` (R49: nothing under it and no
    wall to hang from). Only the author's placed pieces count;
    a stand-in is never evidence. Returns the verdict and the pieces read."""
    on, floor_tops, bases, walls = [], [], [], []
    for p in placements:
        b = bounds.get(p["assetId"])
        if b is None:
            continue
        size, org = b
        x, y, z = _local_point(q, p)
        s_ = float(p.get("scale") or 1.0)
        lo = [-o for o in org]
        hi = [size[i] - org[i] for i in range(3)]
        m = SUPPORT_MARGIN_M / s_
        inside = lo[0] - m <= x <= hi[0] + m and lo[1] - m <= y <= hi[1] + m
        if p.get("category") in SURFACE_CATEGORIES:
            if inside and lo[2] + SUPPORT_BASE_M / s_ < z <= hi[2] + SUPPORT_TOP_M / s_:
                on.append(p["id"])
            if (p.get("category") in ("furniture", "container") and abs(org[2]) < 0.05
                    and math.hypot(p["positionM"][0] - q[0], p["positionM"][2] - q[2]) < FLOOR_REACH_M
                    and p["positionM"][1] <= q[1] + SUPPORT_TOP_M):
                bases.append((p["positionM"][1], p["id"]))
        elif inside and p.get("category") in STRUCTURAL_CATEGORIES and (
                abs(z - hi[2]) <= SUPPORT_TOP_M / s_
                or lo[2] - SUPPORT_MARGIN_M / s_ <= z <= lo[2] + SHELL_FLOOR_M / s_):
            # the top of a floor piece, or the floor of a room shell or wall
            # piece: near the bottom of its box (its top is the roof)
            floor_tops.append(p["id"])
        if p.get("category") in STRUCTURAL_CATEGORIES and _face_distance((x, y, z), lo, hi, SHELL_FLOOR_M / s_) * s_ <= WALL_REACH_M:
            walls.append(p["id"])
    if on:
        return "surface", sorted(on)
    if floor_tops:
        return "floor", sorted(floor_tops)
    if bases:
        top = max(bases)
        if q[1] - top[0] <= FLOOR_BAND_M:
            return "floor", [top[1]]
    if walls:
        return "wall", sorted(walls)
    return "loose", []


def _face_distance(pt, lo, hi, floor_band: float) -> float:
    """Distance (asset units) from ``pt`` to the nearest face a thing can hang
    from (R49): a side face or, inside the box (a room shell), the ceiling;
    never a top a thing stands on nor a face at floor height. ``pt`` must be
    over ``floor_band`` above the box's base and below its top, else nothing
    in this piece holds it up (``inf``)."""
    if not (lo[2] + floor_band < pt[2] < hi[2]):
        return math.inf
    if lo[0] <= pt[0] <= hi[0] and lo[1] <= pt[1] <= hi[1]:
        return min(pt[0] - lo[0], hi[0] - pt[0], pt[1] - lo[1], hi[1] - pt[1], hi[2] - pt[2])
    return math.hypot(max(lo[0] - pt[0], 0.0, pt[0] - hi[0]), max(lo[1] - pt[1], 0.0, pt[1] - hi[1]))


def class_by_placement(votes: dict[str, int], carried_m: float) -> str:
    """R45: a form's class from where its references sit. Support from below
    wins (decision 0085): any reference resting on a surface piece makes it
    clutter; else a floor reference makes it furniture when something the
    cell's author set on it stands over ``FURNITURE_BOUNDS_M`` above the
    floor (``carried_m``, the only bounds a form in an absent master shows)
    and clutter otherwise; a form every reference of which hangs is a
    ``fixture`` only when every reference hangs within ``WALL_REACH_M`` of a
    wall or shell face (R49), else clutter. A floor form with nothing on it is
    clutter (R50)."""
    if votes.get("surface"):
        return "clutter"
    if votes.get("floor"):
        return "furniture" if carried_m > FURNITURE_BOUNDS_M else "clutter"
    if votes.get("loose"):
        # R49: a form with a reference hung from no wall is loose clutter
        return "clutter"
    return "fixture"


def published_kit_bounds(kits_dir: Path = KITS_DIR) -> dict[str, tuple[list, list]]:
    """asset id -> (sizeM, originOffsetM) over every published kit (sockets.py owns it)."""
    return _socket_kit_bounds(kits_dir)


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
    """The plugin's Euler rotation (radians, each clockwise) as the runtime's
    ``[pitch, yaw, roll]`` degrees for ``Euler(pitch, -yaw, roll, 'YXZ')`` in
    the game frame. Skyrim composes a reference's rotation as Gamebryo's
    ``Rx(-x) Ry(-y) Rz(-z)``: z is applied first, x last, about the world
    axes. (16k walk 6: the old X-then-Y-then-Z order stood KotM's floor
    boards on edge; plankwall01b 088B26E8 at (90, 90, 0) deg is a flat
    board of the Lilmoth upper floor, `test_a_rolled_floor_board_lies_flat`.)"""
    rx, ry, rz = (float(v) for v in rot)
    r_plugin = _mat_mul(_rot("x", -rx), _mat_mul(_rot("y", -ry), _rot("z", -rz)))
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


# --------------------------------------------------------------------------- #
# swing doors (16k walk 4, owner 2026-09-28): a DOOR reference with no XTEL
# teleport opens in place. Its hinge is read from the door NIF itself: Skyrim
# animates the leaf as a child NiNode (`Door`) whose translation is the hinge
# (farmhouseanimdoor01, kotm argonia/mudhuts/door01: the node stands at
# (48, 4, 88) units, the leaf's edge), rotated by the `Open` NiControllerSequence
# (NiTransformData keys; farmhouseanimdoor01 ends at -92 deg after 1.0 s). The
# NIF ROOT is not the hinge: the published kits put farmhousedoor01's origin at
# the middle of its width (originOffsetM x 0.683 of 1.366 m).
# --------------------------------------------------------------------------- #
def _keygroup_floats(raw: bytes, p: int) -> tuple[list[tuple[float, float]], int]:
    (n,) = struct.unpack_from("<I", raw, p)
    p += 4
    keys = []
    if n:
        (kind,) = struct.unpack_from("<I", raw, p)
        p += 4
        for _ in range(n):
            t, v = struct.unpack_from("<2f", raw, p)
            p += 8 + (8 if kind == 2 else 12 if kind == 3 else 0)
            keys.append((t, v))
    return keys, p


def _rotation_keys(raw: bytes) -> tuple[list[float], float, float] | None:
    """NiTransformData (niftools nif.xml, NiKeyframeData): the final rotation
    as `(nif axis, radians, seconds)`, or None when it carries no rotation."""
    (n,) = struct.unpack_from("<I", raw, 0)
    if not n:
        return None
    (kind,) = struct.unpack_from("<I", raw, 4)
    if kind == 4:                                 # XYZ_ROTATION_KEY: three float groups
        p, groups = 8, []
        for _ in range(3):
            keys, p = _keygroup_floats(raw, p)
            groups.append(keys)
        deltas = [(k[-1][1] - k[0][1]) if k else 0.0 for k in groups]
        axis = max(range(3), key=lambda i: abs(deltas[i]))
        if abs(deltas[axis]) < 1e-4:
            return None
        return ([1.0 if i == axis else 0.0 for i in range(3)], deltas[axis], groups[axis][-1][0])
    size = 20 + (12 if kind == 3 else 0)
    t, w, x, y, z = struct.unpack_from("<5f", raw, 8 + size * (n - 1))
    w = max(-1.0, min(1.0, w))
    angle = 2 * math.acos(w)
    s_ = math.sqrt(max(0.0, 1 - w * w))
    if angle < 1e-4 or s_ < 1e-6:
        return None
    if angle > math.pi:
        angle -= 2 * math.pi
    return ([x / s_, y / s_, z / s_], angle, t)


def door_hinge(nif_bytes: bytes) -> dict | None:
    """The hinge of an animated door NIF, in the kit asset's frame (glTF y up,
    metres from the NIF root, the frame the published kit draws the mesh in):
    ``{pivotM, axis, openAngleDeg, openS, source}``; None when the NIF has no
    `Open` sequence that rotates a node."""
    import numpy as np
    from pipeline import nif_blocks as nb
    nif = nb.parse(nif_bytes)
    for i, (kind, raw) in enumerate(nif.blocks):
        if kind != "NiControllerSequence" or nif.name(i) != "Open":
            continue
        (count,) = struct.unpack_from("<I", raw, 4)
        if not count:
            return None
        # ControlledBlock (20.2.0.7): interpolator, controller, priority byte, node name
        interp, _ctrl = struct.unpack_from("<ii", raw, 12)
        (name_idx,) = struct.unpack_from("<i", raw, 21)
        node_name = nif.strings[name_idx] if 0 <= name_idx < len(nif.strings) else None
        node = next((j for j, (k, _) in enumerate(nif.blocks)
                     if k in nb.NODE_TYPES and nif.name(j) == node_name), None)
        if node is None or not (0 <= interp < len(nif.blocks)):
            return None
        _ik, iraw = nif.blocks[interp]
        (data_ref,) = struct.unpack_from("<i", iraw, 32)
        if not (0 <= data_ref < len(nif.blocks)):
            return None
        rot = _rotation_keys(nif.blocks[data_ref][1])
        if rot is None:
            return None
        nif_axis, radians, seconds = rot
        world = nb.world_matrix(nif, node)
        parent = nif.parent.get(node)
        parent_rot = nb.world_matrix(nif, parent)[:3, :3] if parent is not None else np.eye(3)
        a = parent_rot @ np.array(nif_axis)
        a = a / (np.linalg.norm(a) or 1.0)
        # NIF (x, y, z up) -> game (x, y up, z south): a proper rotation, so the
        # signed angle about the mapped axis is the same angle
        axis = [round(float(a[0]), 4) + 0.0, round(float(a[2]), 4) + 0.0, round(float(-a[1]), 4) + 0.0]
        out = {"pivotM": nb.to_gltf_m(world[:3, 3], 1.0 / UNITS_PER_METRE), "axis": axis,
               "openAngleDeg": round(math.degrees(radians), 2), "openS": round(float(seconds), 3),
               "source": f"nif Open sequence on node {node_name}"}
        leaf = _leaf_bounds(nif, node)
        if leaf is not None:
            out["leafBoundsM"] = leaf
        return out
    return None


_SHAPES = ("NiTriShape", "BSTriShape", "NiTriStrips")


def _shape_points(nif, index: int):
    """A shape's points in the NIF root frame (units): NiTriShapeData's
    vertices (bsVersion 83); a BSTriShape's bounding sphere as its box corners."""
    import numpy as np
    from pipeline import nif_blocks as nb
    kind, raw = nif.blocks[index]
    av, p = nb.av_fields(raw, nif.bs_version)
    m = nb.world_matrix(nif, index)
    if kind == "BSTriShape":
        cx, cy, cz, r = struct.unpack_from("<4f", raw, p)
        local = np.array([[cx + sx * r, cy + sy * r, cz + sz * r]
                          for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)])
    else:
        (data_ref,) = struct.unpack_from("<i", raw, p)
        if not (0 <= data_ref < len(nif.blocks)):
            return None
        draw = nif.blocks[data_ref][1]
        (nv,) = struct.unpack_from("<H", draw, 4)
        if not nv or not draw[8]:
            return None
        local = np.array(struct.unpack_from(f"<{3 * nv}f", draw, 9)).reshape(-1, 3)
    return (m[:3, :3] @ local.T).T + m[:3, 3]


def _leaf_bounds(nif, node: int) -> list[list[float]] | None:
    """The leaf's box in the kit asset frame (glTF metres), ``[min, max]``, when
    the NIF also draws shapes that do NOT turn (a frame or wall around the
    leaf: impwooddoorsingle01's FortRuinsDoorWall, farmbtrapdoor02's frame);
    None when every shape is the leaf (the runtime then turns the whole asset)."""
    import numpy as np

    def under(i: int) -> bool:
        while i is not None:
            if i == node:
                return True
            i = nif.parent.get(i)
        return False

    shapes = [i for i, (k, _) in enumerate(nif.blocks) if k in _SHAPES]
    leaf = [i for i in shapes if under(i)]
    if not leaf or len(leaf) == len(shapes):
        return None
    pts = [pt for pt in (_shape_points(nif, i) for i in leaf) if pt is not None]
    if not pts:
        return None
    allp = np.vstack(pts) / UNITS_PER_METRE
    g = np.stack([allp[:, 0], allp[:, 2], -allp[:, 1]], axis=1)   # NIF z up -> glTF y up
    return [[round(float(v), 4) + 0.0 for v in g.min(axis=0)], [round(float(v), 4) + 0.0 for v in g.max(axis=0)]]


def hinge_from_bounds(size_m, origin_m) -> dict:
    """A door NIF with no `Open` sequence (a static leaf): the hinge is the
    vertical edge at the leaf's -x face, mid-thickness, from the published
    kit's measured bounds (sizeM / originOffsetM, NIF axes), and it opens
    `SWING_DEFAULT_OPEN_DEG` over `SWING_DEFAULT_OPEN_S`."""
    mid_y = size_m[1] / 2 - origin_m[1]
    return {"pivotM": [round(-origin_m[0], 4) + 0.0, 0.0, round(-mid_y, 4) + 0.0],
            "axis": [0.0, 1.0, 0.0], "openAngleDeg": SWING_DEFAULT_OPEN_DEG,
            "openS": SWING_DEFAULT_OPEN_S, "source": "kit bounds: -x edge (no Open sequence)"}


_NIF_SOURCES: dict[str, object] = {}


def door_nif_bytes(asset_id: str, registry_path: str) -> bytes | None:
    """The door's NIF from its pool's mesh source (the kit build's own
    `pool_sources`), or None when the pool's source is not on this machine."""
    import tempfile
    from pipeline.build_kit import pool_sources
    from .asset_registry import DEFAULT_VAULT
    pool = asset_id.split(":", 1)[0]
    if pool not in _NIF_SOURCES:
        _NIF_SOURCES[pool] = pool_sources(pool, DEFAULT_VAULT).meshes
    source = _NIF_SOURCES[pool]
    if not source.contains(registry_path):
        return None
    with tempfile.TemporaryDirectory() as tmp:
        source.extract_many([registry_path], Path(tmp))
        target = Path(tmp) / registry_path
        return target.read_bytes() if target.exists() else None


def swing_hinge(asset_id: str, model: str, bounds: dict[str, tuple] | None) -> dict:
    """The swing record's hinge: the NIF's Open sequence, else the kit bounds."""
    nif = door_nif_bytes(asset_id, model if model.startswith("meshes/") else "meshes/" + model)
    hinge = door_hinge(nif) if nif else None
    if hinge:
        return hinge
    size, origin = (bounds or {}).get(asset_id) or ([1.0, 0.1, 2.0], [0.5, 0.05, 0.0])
    return hinge_from_bounds(size, origin)


def export_cell(plugin_name: str, cell_edid: str, paths: dict[str, Path], registry,
                kit_assets, pool_of, doors: list[dict] | None = None,
                absent: dict[str, dict] | None = None,
                kit_bounds: dict[str, tuple] | None = None, cache=None) -> dict:
    """The bundle for one cell (see the module docstring). `doors` is the
    claiming places' door claims, `[{interiorLoadDoorRef, ...}]`: each ref is
    checked to be a load door of the cell and nothing of a claim is written
    (the output is the same whoever claims the cell)."""
    from .mine_door_links import asset_id_for

    pset = plugin_set(paths[plugin_name], paths, cache)
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
    absent = absent_master_classes() if absent is None else absent
    placements, drops, lights, sockets, swings = [], [], [], [], []
    poses: dict[str, tuple] = {}
    load_doors: dict[str, dict] = {}
    for ref in sorted(refs, key=lambda r: r["formId"]):
        rid = f"{ref['formId']:08X}"
        base = bases.get(ref.get("baseKey"))
        pos = _game_pos(ref.get("pos", (0, 0, 0)))
        rot = game_rotation_deg(ref.get("rot", (0, 0, 0)))
        # compass yaw: Skyrim's z rotation is clockwise from above (the miners' convention)
        yaw = round(math.degrees(float(ref.get("rot", (0, 0, 0))[2])) % 360.0, 3)
        poses[rid] = (pos, rot, round(float(ref.get("scale", 1.0)), 4))

        def drop(reason, **more):
            drops.append({"refId": rid, "reason": reason,
                          "base": (base or {}).get("editorId"),
                          "baseType": (base or {}).get("type"), **more})

        if base is None:
            key = ref.get("baseKey")
            form = f"{key[0]}:{key[1]:08X}" if key else None
            cls, why = piece_class(None, form, None, absent)
            drop("unresolved-base", **({"baseForm": form} if form else {}),
                 **{"class": cls, "classSource": why, "positionM": pos})
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
            xrds = ref.get("radius")
            radius = light_radius_units(xrds, lt["radiusUnits"])
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
            if model and is_invisible_load_door(model):
                # AutoLoadDoor01: the cave mouth's load door has no mesh of its
                # own (the walls are the way out); it is the cell's load door
                # above and draws nothing (16k walk 9, type-5 slice)
                drop("marker")
                continue
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
            # the same mesh path shipped by another pool (Tamira's
            # tropicalplant01 in King of the Murkmire and in Darkwater Den,
            # 16k walk 9) draws the same object: take the copy a kit holds
            key = model if model.startswith("meshes/") else "meshes/" + model
            alt = next((a for a in sorted((registry.get(key) or {}).values()) if a in kit_assets), None)
            if alt is not None:
                asset_id, hit = alt, kit_assets[alt]
        if hit is None:
            cls, why = piece_class(base, None, model, absent)
            drop("no-kit-asset", model=model, assetId=asset_id,
                 **{"class": cls, "classSource": why, "positionM": pos})
            continue
        kit, kit_category = hit
        if btype == "DOOR" and ref.get("teleport") is None:
            # a door that loads nothing opens in place (owner 2026-09-28)
            if kit_bounds is None:
                kit_bounds = published_kit_bounds()
            swings.append({"doorType": "swing", "id": f"{cell_edid}.{rid}", "refId": rid,
                           "assetId": asset_id, "kit": kit, "positionM": pos, "rotationDeg": rot,
                           "scale": round(float(ref.get("scale", 1.0)), 4),
                           "hinge": swing_hinge(asset_id, model, kit_bounds),
                           "initiallyOpen": bool(ref.get("openByDefault")),
                           "base": base.get("editorId")})
            continue
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

    # decision 0113: where the player uses each work socket (a work-at idle socket here)
    if any(needs_interact(sk) for sk in sockets):
        if kit_bounds is None:
            kit_bounds = published_kit_bounds()
        vocab = load_vocabulary()
        by_pid = {p["id"]: p for p in placements}
        for sk in sockets:
            if needs_interact(sk):
                host = by_pid.get(sk["host"]) if sk.get("host") else None
                sk["interact"] = interact_point(sk, host, kit_bounds, vocab,
                                                host["rotationDeg"][1] if host else None)

    substitutions = []
    sub_rows = load_substitutions(cell_edid)
    fires: list = []
    order = list(HEARTH_FIRE_STAND_INS)
    for d in sorted((d for d in drops if d["reason"] in MISSING_REASONS
                     and d.get("base") in HEARTH_FIRE_STAND_INS and d["refId"] not in sub_rows),
                    key=lambda d: (order.index(d["base"]), d["refId"])):
        pos = poses[d["refId"]][0]
        if any(math.dist(pos, f) <= HEARTH_FIRE_M for f in fires):
            continue
        fires.append(pos)
        sub_rows[d["refId"]] = {"refId": d["refId"], "standInAsset": HEARTH_FIRE_STAND_INS[d["base"]],
                                "why": HEARTH_FIRE_WHY}
    for rid, row in sorted(sub_rows.items()):
        miss = next((d for d in drops if d["refId"] == rid and d["reason"] in MISSING_REASONS), None)
        if miss is None:
            raise ValueError(f"{cell_edid}: substitution for {rid}, which is not a missing piece of the cell")
        hit = kit_assets.get(row["standInAsset"])
        if hit is None:
            raise ValueError(f"{cell_edid}: stand-in {row['standInAsset']} is in no published kit")
        drops.remove(miss)
        pos, rot, scale = poses[rid]
        substitutions.append({
            "id": f"{cell_edid}.{rid}", "refId": rid, "originalPath": miss.get("model"),
            "baseForm": miss.get("baseForm"), "class": miss["class"],
            "classSource": miss["classSource"], "standInAsset": row["standInAsset"],
            "kit": hit[0], "standInCategory": hit[1], "why": row["why"],
            "positionM": pos, "rotationDeg": rot, "scale": scale})

    for rid, row in sorted(load_gaps(cell_edid).items()):
        if row["reason"] == DEPENDENT_GAP_REASON:
            placed = next((p for p in placements if p["id"] == f"{cell_edid}.{rid}"), None)
            if placed is None:
                raise ValueError(f"{cell_edid}: listed gap {rid} rests on a gap but is no placement of the cell")
            placements.remove(placed)
            drops.append({"refId": rid, "reason": "listed-gap", "gapReason": row["reason"],
                          "restsOn": row["restsOn"], "assetId": placed["assetId"],
                          "class": placed.get("category"), "positionM": placed["positionM"],
                          "why": row.get("why")})
            continue
        miss = next((d for d in drops if d["refId"] == rid and d["reason"] in MISSING_REASONS), None)
        if miss is None:
            raise ValueError(f"{cell_edid}: listed gap {rid} is not a missing piece of the cell")
        miss.update({"reason": "listed-gap", "gapReason": row["reason"],
                     "gapSearch": row["search"], "why": row.get("why")})

    for d in drops:
        if d["reason"] in MISSING_REASONS and d.get("class") in LISTED_DROP_CLASSES:
            d["reason"] = "listed-drop"

    additions = []
    if (ADDITIONS_DIR / f"{cell_edid}.json").exists():
        if kit_bounds is None:
            kit_bounds = published_kit_bounds()
        additions = load_additions(cell_edid, placements + substitutions, kit_assets, kit_bounds)
    placements.extend(additions)

    tdata = tdalc = tedid = None
    if ltmp:
        trec = records.get(pset.key(main, ltmp))
        if trec is not None:
            subs = list(trec.subrecords())
            tdata = next((p for st, p in subs if st == b"DATA"), None)
            tdalc = next((p for st, p in subs if st == b"DALC"), None)
            tedid = next((_cstr(p) for st, p in subs if st == b"EDID"), None)
    lighting = resolve_lighting(xcll, tdata, tdalc, tedid)

    for d in doors or []:
        if d["interiorLoadDoorRef"] not in load_doors:
            raise SystemExit(f"{cell_edid}: the claim pairs load door {d['interiorLoadDoorRef']}, "
                             f"which is not a load door of the cell")
    pairs = [{"doorType": "load", "interiorLoadDoorRef": rid,
              "loadDoor": {"positionM": load_doors[rid]["positionM"],
                           "yawDeg": load_doors[rid]["yawDeg"]}}
             for rid in sorted(load_doors)]
    first = load_doors[pairs[0]["interiorLoadDoorRef"]] if pairs else None
    arrival = {"positionM": first["positionM"], "yawDeg": first["yawDeg"]} if first else None
    kits = sorted({p["kit"] for p in placements} | {s["kit"] for s in substitutions}
                  | {w["kit"] for w in swings})
    return {
        "schemaVersion": SCHEMA_VERSION,
        "cellId": cell_edid,
        "plugin": plugin_name,
        "frame": FRAME,
        "shellAssetId": None,
        "refCount": len(refs),
        "kits": {k: {"id": k, "parts": f"kits/{k}/parts/index.json", "manifest": f"kits/{k}.kit.json"}
                 for k in kits},
        "arrivalMarker": arrival,
        "exitDoor": ({k: first[k] for k in ("id", "refId", "positionM", "yawDeg")}
                     if first else None),
        "doors": pairs + swings,
        "ambient": {"colorRGB": lighting.get("ambientRGB", [0, 0, 0]), "intensity": 1.0},
        "fog": {"colorRGB": lighting.get("fogNearRGB", [0, 0, 0]),
                "nearM": lighting.get("fogNearM", 0.0), "farM": lighting.get("fogFarM", 0.0)},
        "lighting": lighting,
        "placements": placements,
        "lights": lights,
        "socketsSchemaVersion": SOCKET_SCHEMA_VERSION,
        "sockets": sockets,
        "drops": drops,
        "substitutions": substitutions,
        "counts": {
            "placements": len(placements), "drops": len(drops), "lights": len(lights),
            "substitutions": len(substitutions), "swingDoors": len(swings),
            "missingByClass": dict(sorted(Counter(d["class"] for d in drops
                                                  if d["reason"] in MISSING_REASONS).items())),
            "dropsByReason": dict(sorted(Counter(d["reason"] for d in drops).items())),
            "socketsByKind": dict(sorted(Counter(s["kind"] for s in sockets).items())),
            **({"additions": len(additions)} if additions else {}),
        },
    }


def check(bundle: dict) -> list[str]:
    """The acceptance gate: every reference is placed, listed as a drop or
    drawn by a same-class stand-in; no architecture piece is missing."""
    problems = []
    subs = bundle.get("substitutions") or []
    swings = [d for d in bundle.get("doors") or [] if d.get("doorType") == "swing"]
    placed = [p for p in bundle["placements"] if p.get("source") != "addition"]
    n = len(placed) + len(bundle["drops"]) + len(subs) + len(swings)
    if n != bundle["refCount"]:
        problems.append(f"{bundle['cellId']}: {len(placed)} placements + "
                        f"{len(bundle['drops'])} drops + {len(subs)} substitutions + "
                        f"{len(swings)} swing doors = {n}, "
                        f"the cell has {bundle['refCount']} references")
    arch = [d for d in bundle["drops"] if d.get("reason") in (*MISSING_REASONS, "listed-gap")
            and d.get("class") in ARCHITECTURE_CLASSES]
    if arch:
        problems.append(f"{bundle['cellId']}: {len(arch)} missing architecture pieces "
                        f"({', '.join(sorted({d.get('model') or d.get('baseForm') or '?' for d in arch}))}); "
                        f"the cell does not fit and is never claimed")
    for s in subs:
        hearth_fire = is_hearth_fire(s)
        if s.get("class") not in SUBSTITUTABLE_CLASSES and not hearth_fire:
            problems.append(f"{bundle['cellId']}: {s.get('refId')} is class {s.get('class')!r}; "
                            f"only clutter or furniture takes a stand-in")
        elif s.get("standInCategory") != s.get("class") and not hearth_fire:
            problems.append(f"{bundle['cellId']}: stand-in {s.get('standInAsset')} is "
                            f"{s.get('standInCategory')!r}, the missing piece is {s.get('class')!r}")
    lit = [s["positionM"] for s in subs if is_hearth_fire(s) and s.get("positionM")]
    for d in bundle["drops"]:
        model = (d.get("model") or "").lower().replace("\\", "/")
        if (d.get("class") == "effect" and d.get("positionM") and model.startswith(FIRE_EFFECT_MODEL_PREFIX)
                and not any(math.dist(d["positionM"], f) <= HEARTH_FIRE_M for f in lit)):
            problems.append(f"{bundle['cellId']}: fire effect {d.get('base')} ({d['refId']}) is a drop "
                            f"with no fire drawn; add its base to HEARTH_FIRE_STAND_INS")
    ids =[p["id"] for p in bundle["placements"]] + [s["id"] for s in subs]
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


def swing_problems(d: dict, kits: dict) -> list[str]:
    """A swing `doors[]` entry against the runtime contract (`parseSwingDoor`)."""
    h = d.get("hinge") if isinstance(d.get("hinge"), dict) else {}
    axis = h.get("axis")
    ok = (isinstance(d.get("id"), str) and d["id"] and isinstance(d.get("assetId"), str)
          and _vec3(d.get("positionM")) and _vec3(d.get("rotationDeg")) and _num(d.get("scale"))
          and _vec3(h.get("pivotM")) and _vec3(axis) and abs(math.hypot(*axis) - 1) < 1e-3
          and _num(h.get("openAngleDeg")) and _num(h.get("openS")) and h["openS"] > 0
          and isinstance(d.get("initiallyOpen"), bool)
          and ("leafBoundsM" not in h or (isinstance(h["leafBoundsM"], list) and len(h["leafBoundsM"]) == 2
                                          and all(_vec3(c) for c in h["leafBoundsM"]))))
    out = [] if ok else [f"bad swing door {d.get('id')!r}"]
    if d.get("kit") not in kits:
        out.append(f"{d.get('id')}: kit {d.get('kit')!r} is not in the bundle's kits")
    return out


def validate_bundle(b: dict) -> list[str]:
    """The runtime's contract (`parseInteriorBundle`, bundle.ts), checked on
    the Python side: the same fields, the same refusals."""
    bad: list[str] = []
    if b.get("schemaVersion") != SCHEMA_VERSION:
        bad.append(f"schemaVersion {b.get('schemaVersion')!r}")
    for key in ("cellId", "plugin", "frame"):
        if not isinstance(b.get(key), str) or not b.get(key):
            bad.append(f"no {key}")
    if b.get("shellAssetId") is not None:
        bad.append("shellAssetId is per place (the claiming parcel's assetRef); the shared cell file carries null")
    kits = b.get("kits")
    if not isinstance(kits, dict) or not all(
            isinstance(v, dict) and v.get("id") == k and isinstance(v.get("parts"), str)
            and isinstance(v.get("manifest"), str) for k, v in kits.items()):
        bad.append("kits map malformed")
        kits = {}
    if not _marker(b.get("arrivalMarker")):
        bad.append("bad arrivalMarker")
    ex = b.get("exitDoor")
    if not (isinstance(ex, dict) and _vec3(ex.get("positionM")) and isinstance(ex.get("refId"), str)):
        bad.append("bad exitDoor")
    for d in b.get("doors") if isinstance(b.get("doors"), list) else [None]:
        if isinstance(d, dict) and d.get("doorType") == "swing":
            bad.extend(swing_problems(d, kits))
            continue
        if not (isinstance(d, dict) and d.get("doorType") == "load"):
            bad.append(f"bad doors entry {d!r:.80} (doorType must be load or swing)")
            continue
        if not (isinstance(d.get("interiorLoadDoorRef"), str) and _marker(d.get("loadDoor"))):
            bad.append(f"bad doors entry {d!r:.80}")
        per_place = [k for k in PER_PLACE_DOOR_FIELDS if k in d]
        if per_place:
            bad.append(f"load door {d.get('interiorLoadDoorRef')}: per-place field(s) {per_place} "
                       f"in the shared cell file (the place's door record holds them, 0104)")
    for p in b.get("placements") or []:
        if p.get("kit") not in kits:
            bad.append(f"{p.get('id')}: kit {p.get('kit')!r} is not in the bundle's kits")
        if not (_vec3(p.get("positionM")) and _vec3(p.get("rotationDeg")) and _num(p.get("scale"))):
            bad.append(f"{p.get('id')}: bad transform")
    for s in b.get("substitutions") or []:
        if s.get("kit") not in kits:
            bad.append(f"{s.get('id')}: kit {s.get('kit')!r} is not in the bundle's kits")
        if not (_vec3(s.get("positionM")) and _vec3(s.get("rotationDeg")) and _num(s.get("scale"))
                and isinstance(s.get("standInAsset"), str)):
            bad.append(f"{s.get('id')}: bad substitution")
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
    cube = (b.get("lighting") or {}).get("ambientCube")
    if cube is not None and not (isinstance(cube, dict) and all(
            isinstance(cube.get(k), list) and len(cube[k]) == 3
            and all(isinstance(c, (int, float)) and c >= 0 for c in cube[k])
            for k in ("px", "nx", "py", "ny", "pz", "nz"))):
        bad.append("bad lighting.ambientCube")
    if not (_is_rgb(fog.get("colorRGB")) and _num(fog.get("nearM")) and _num(fog.get("farM"))):
        bad.append("bad fog")
    for key in ("placements", "lights", "sockets", "drops"):
        if not isinstance(b.get(key), list):
            bad.append(f"no {key} list")
    return bad


def placement_rows(bundles: list[dict], bounds: dict[str, tuple]) -> dict[str, dict]:
    """R45 rows for every unclassed base in an absent master across
    ``bundles``: ``{form: {class, classedBy, source, votes, carriedM, cells}}``
    (see ``support_of`` and ``class_by_placement``)."""
    votes: dict[str, Counter] = {}
    carried: dict[str, float] = {}
    cells: dict[str, set] = {}
    for b in bundles:
        pl = [p for p in b["placements"] if p.get("source") != "addition"]
        refs = [(d, d.get("positionM")) for d in b["drops"] if d.get("positionM")]
        refs += [(p, p["positionM"]) for p in pl]
        for d in b["drops"]:
            if d["reason"] != "unresolved-base" or d.get("class") != "unclassed" or not d.get("positionM"):
                continue
            form, q = d["baseForm"], d["positionM"]
            verdict, _ = support_of(q, pl, bounds)
            votes.setdefault(form, Counter())[verdict] += 1
            cells.setdefault(form, set()).add(b["cellId"])
            if verdict == "floor":
                # what the author set on it: the LOWEST reference over its plan with
                # no support of its own (anything higher may hang above it)
                on_it = [oq[1] - q[1] for other, oq in refs
                         if other is not d and math.hypot(oq[0] - q[0], oq[2] - q[2]) <= 0.5
                         and 0.1 < oq[1] - q[1] <= 2.5
                         and support_of(oq, pl, bounds)[0] in ("wall", "loose")]
                if on_it:
                    carried[form] = max(carried.get(form, 0.0), round(min(on_it), 3))
    out = {}
    for form in sorted(votes):
        v = dict(sorted(votes[form].items()))
        c = carried.get(form, 0.0)
        cls = class_by_placement(v, c)
        where = ", ".join(f"{n} {k}" for k, n in v.items())
        out[form] = {"class": cls, "classedBy": "placement",
                     "source": (f"planner ruling R45 (16k walk 3): no written source; its references sit "
                                f"{where} (support_of in worldgen/export_interior_bundle.py)"
                                + (f"; the author set a piece {c} m above it" if c else "")),
                     "votes": v, "carriedM": c, "cells": sorted(cells[form])}
    return out


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


from .plugin_cache import PluginCache  # noqa: E402


def _write_placement_rows(path: Path = ABSENT_MASTER_CLASSES) -> int:
    from .blueprint_interiors import linked_shells
    paths, pools, registry = _environment()
    kit_assets, bounds = published_kit_assets(), published_kit_bounds()
    doc = json.loads(path.read_text())
    # a re-run re-derives every placement row: the cells are read with only the
    # rows that have a written source; the file is written once, at the end
    doc["forms"] = {f: r for f, r in doc["forms"].items() if r.get("classedBy") != "placement"}
    bundles = []
    cache = PluginCache()                      # this job's plugins, parsed once
    for plugin, cell in sorted({(r["plugin"], r["interiorCell"])
                                for rows in linked_shells().values() for r in rows}):
        if plugin not in paths:
            continue
        try:
            bundles.append(export_cell(plugin, cell, paths, registry, kit_assets, lambda n: pools.get(n),
                                       absent=doc["forms"], cache=cache))
        except (SystemExit, ValueError) as err:
            print(f"  skip {plugin} {cell}: {err}")
    rows = placement_rows(bundles, bounds)
    doc["forms"].update(rows)
    path.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n")
    print(f"{len(rows)} forms classed by placement: "
          + json.dumps(Counter(r["class"] for r in rows.values())))
    return 0


def blueprint_claims(data: dict) -> dict[tuple[str, str], list[dict]]:
    """``{(plugin, cellId): [interiorClaim, ...]}`` for every tier A door of a
    place blueprint, in door order. The claim stays in the place's door record;
    the exporter only checks its load door ref against the cell."""
    bp = data.get("blueprint", data)
    out: dict[tuple[str, str], list[dict]] = {}
    for door in bp.get("doors", []) or []:
        claim = door.get("interiorClaim") or {}
        if claim.get("tier") == "A":
            out.setdefault((claim["plugin"], claim["cellId"]), []).append(claim)
    return out


def export_bundle(plugin: str, cell: str, env, kit_assets, fixture_lights,
                  claims: list[dict] | None = None, cache=None, geo=None) -> dict:
    """The shared cell file, as written: `export_cell`, the plugin's own
    arrival marker (its exterior partner's teleport, `profile_cell`) and the
    fixture light rule. Place-independent: `claims` only checks load door refs."""
    from .interior_cells import game_marker, profile_cell, world_for
    from .interior_light import apply_light_rule, floor_nodes
    paths, pools, registry = env
    bundle = export_cell(plugin, cell, paths, registry, kit_assets, lambda n: pools.get(n),
                         doors=claims, cache=cache)
    prof = profile_cell(world_for(plugin, paths.get, cache), cell) or {}
    if prof.get("exteriorDoors"):
        # the plugin's first door to the outside: its arrival, and the exit door with it
        first = prof["exteriorDoors"][0]
        bundle["arrivalMarker"] = game_marker(first["arrivalMarker"])
        load = next((d for d in bundle["doors"] if d["doorType"] == "load"
                     and d["interiorLoadDoorRef"] == first["refId"]), None)
        if load is not None:
            bundle["exitDoor"] = {"id": f"{cell}.{first['refId']}", "refId": first["refId"],
                                  **load["loadDoor"]}
    # a plugin piece stored a few cm above its support drops onto it, as havok
    # drops it at load (16k walk 6); the rows are the build evidence
    # `geo` holds the kit triangles: pass one per run so each kit loads once
    from . import coplanar
    from .interior_support import settle
    geo = geo or coplanar.KitGeometry()
    mesh, owner = coplanar.bundle_mesh(coplanar.pieces_from_bundle(bundle["placements"], geo))
    bundle["settled"] = settle(bundle, mesh, owner)
    bundle["counts"]["settled"] = len(bundle["settled"])
    del mesh, owner
    # two surfaces on one plane z-fight (16k walk 6): the later piece moves 5 mm
    # a plugin that stored one piece twice in one pose: the lowest id stays
    dup = coplanar.drop_duplicates(bundle)
    bundle["drops"].extend(dup)
    if dup:
        bundle["counts"]["placements"] = len(bundle["placements"])
        bundle["counts"]["drops"] = len(bundle["drops"])
        bundle["counts"]["dropsByReason"] = dict(sorted(Counter(d["reason"] for d in bundle["drops"]).items()))
    bundle["coplanarFixed"] = coplanar.separate(bundle, geo)
    bundle["counts"]["coplanarFixed"] = len(bundle["coplanarFixed"])
    apply_light_rule(bundle, fixture_lights, floor_nodes(bundle))  # doors-interiors-sockets.md § 7
    return bundle


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--plugin")
    ap.add_argument("--cell")
    ap.add_argument("--blueprint", help="export every tier A claim on this blueprint's doors")
    ap.add_argument("--out-dir", default=str(OUT_DIR))
    ap.add_argument("--class-absent-by-placement", action="store_true",
                    help="R45: write a placement row to absent-master-classes.json for every "
                         "unclassed absent-master base in the door-linked cells")
    args = ap.parse_args()
    if args.class_absent_by_placement:
        return _write_placement_rows()
    if args.blueprint:
        claims = blueprint_claims(json.loads(Path(args.blueprint).read_text()))
    elif args.plugin and args.cell:
        claims = {(args.plugin, args.cell): []}
    else:
        ap.error("--plugin and --cell, or --blueprint")
    env = _environment()
    kit_assets = published_kit_assets()
    from .interior_light import kit_lights
    fixture_lights = kit_lights(KITS_DIR)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    failed = 0
    cache = PluginCache()                      # this run's plugins, parsed once
    from .coplanar import KitGeometry
    geo = KitGeometry()                        # this run's kit triangles, loaded once
    for (plugin, cell), cell_claims in claims.items():
        bundle = export_bundle(plugin, cell, env, kit_assets, fixture_lights, cell_claims, cache, geo)
        problems = check(bundle) + validate_bundle(bundle)
        gaps = [d for d in bundle["drops"] if d["reason"] == "no-kit-asset"]
        (out_dir / f"{cell}.json").write_text(json.dumps(bundle, indent=1) + "\n")
        print(f"{cell}: refs {bundle['refCount']}, " + json.dumps(bundle["counts"]))
        for g in gaps:
            print(f"  gap {g['refId']} {g['baseType']} {g.get('model')}")
        for p in problems:
            print(f"  FAIL {p}")
        failed += bool(problems)
    # a published cell gets its interior light record row in the same step (0112 §6);
    # a scratch --out-dir gets its own record beside the bundles, never the shipped one
    failed += refresh_interior_light_record([cell for _, cell in claims], out_dir)
    return 1 if failed else 0


INTERIOR_LIGHT_RECORD = REPO_ROOT / "tooling" / "volumetrics" / "interior_light.py"


def refresh_interior_light_record(cells: list[str], out_dir: Path = OUT_DIR) -> int:
    """Merge the published cells' rows into the interior light record
    (packages/game-core/src/air/volumetrics/interiorLight.json for the default out dir,
    else out_dir/interiorLight.json read from out_dir); 1 when it fails."""
    import subprocess
    cmd = [sys.executable, str(INTERIOR_LIGHT_RECORD), "--cells", ",".join(sorted(cells)), "--merge"]
    if Path(out_dir).resolve() != OUT_DIR.resolve():
        cmd += ["--interiors", str(out_dir), "--out", str(Path(out_dir) / "interiorLight.json")]
    run = subprocess.run(cmd, cwd=REPO_ROOT, check=False)
    return int(run.returncode != 0)


if __name__ == "__main__":
    sys.exit(main())
