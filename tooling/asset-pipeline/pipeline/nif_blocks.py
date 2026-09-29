"""A minimal NIF block reader for what PyNifly does not import: a piece's
fire layer (16k walk 4, orient-fire).

Skyrim draws every flame our places use as a particle system: a piece's own
`NiParticleSystem`s (campfire01burning's FlamesSmall03), or a `BSValueNode`
named `AddOnNodeN` that the engine resolves through Skyrim.esm's ADDN record
N to an MPS particle NIF (candles and lanterns: AddOnNode49 ->
MPSCandleFlame01). The Blender kit export never sees either, so this module
reads the blocks directly and returns flame records the settlement runtime
draws as flipbook sprites (game-core settlement/lighting.ts). Particles never
convert to meshes; only their emitter positions, textures, sizes and atlas
timing are read.

Reads NIF 20.2.0.7 with bsVersion 83 (Skyrim LE, every vanilla NIF here) and
100 (SSE, the mod candles); particle-system internals are decoded for
bsVersion 83 only (no mod fire here ships particles; an SSE particle system
is reported, never guessed). Layouts follow niftools nif.xml.
"""
from __future__ import annotations

import re
import struct
import zlib
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

#: NIF blocks that carry a transform and children (NiNode and its subclasses).
NODE_TYPES = frozenset({"NiNode", "BSFadeNode", "BSValueNode", "NiBillboardNode",
                        "BSOrderedNode", "BSMasterParticleSystem", "BSLeafAnimNode",
                        "BSTreeNode", "NiSwitchNode", "NiLODNode", "BSMultiBoundNode"})
#: A particle system (or an MPS system) counts as a flame when its name says
#: flame or fire and nothing marks it as smoke, embers, sparks or a glow.
FLAME_NAME = re.compile(r"flame|fire", re.I)
NOT_FLAME_NAME = re.compile(r"smoke|ember|spark|glow|haze|refract|steam|ash", re.I)
ADDON_NODE = re.compile(r"^AddOnNode(\d+)", re.I)


@dataclass
class Nif:
    bs_version: int
    strings: list[str]
    blocks: list[tuple[str, bytes]]
    parent: dict[int, int] = field(default_factory=dict)

    def name(self, index: int) -> str:
        kind, raw = self.blocks[index]
        if kind.startswith(("Ni", "BS")) and len(raw) >= 4:
            (i,) = struct.unpack_from("<i", raw, 0)
            if 0 <= i < len(self.strings):
                return self.strings[i]
        return ""

    def indices(self, kind: str) -> list[int]:
        return [i for i, (k, _) in enumerate(self.blocks) if k == kind]


def parse(data: bytes) -> Nif:
    """Header, string table and raw blocks of a NIF 20.2.0.7 file."""
    p = data.index(b"\n") + 1
    p += 4 + 1                                   # version, endian
    _user, count = struct.unpack_from("<II", data, p); p += 8
    (bs_version,) = struct.unpack_from("<I", data, p); p += 4
    for _ in range(3):                           # author, process, export strings
        p += 1 + data[p]
    (ntypes,) = struct.unpack_from("<H", data, p); p += 2
    types = []
    for _ in range(ntypes):
        (n,) = struct.unpack_from("<I", data, p); p += 4
        types.append(data[p:p + n].decode("latin1")); p += n
    type_index = struct.unpack_from(f"<{count}H", data, p); p += 2 * count
    sizes = struct.unpack_from(f"<{count}I", data, p); p += 4 * count
    nstrings, _max = struct.unpack_from("<II", data, p); p += 8
    strings = []
    for _ in range(nstrings):
        (n,) = struct.unpack_from("<I", data, p); p += 4
        strings.append(data[p:p + n].decode("latin1")); p += n
    (ngroups,) = struct.unpack_from("<I", data, p); p += 4 + 4 * ngroups
    blocks = []
    for i in range(count):
        blocks.append((types[type_index[i] & 0x7FFF], data[p:p + sizes[i]])); p += sizes[i]
    nif = Nif(bs_version, strings, blocks)
    for i, (kind, raw) in enumerate(blocks):
        if kind in NODE_TYPES:
            for child in node_fields(raw, bs_version)["children"]:
                if 0 <= child < count:
                    nif.parent[child] = i
    return nif


def _object_net(raw: bytes, p: int = 0) -> int:
    """Skip NiObjectNET (name, extra data list, controller); return the offset."""
    p += 4
    (n,) = struct.unpack_from("<I", raw, p)
    return p + 4 + 4 * n + 4


def av_fields(raw: bytes, bs_version: int) -> tuple[dict, int]:
    """NiAVObject: flags, translation, rotation (row-major 3x3), scale."""
    p = _object_net(raw)
    p += 4                                        # flags (uint for bsVersion > 26)
    t = struct.unpack_from("<3f", raw, p); p += 12
    r = struct.unpack_from("<9f", raw, p); p += 36
    (s,) = struct.unpack_from("<f", raw, p); p += 4
    if bs_version <= 34:
        (n,) = struct.unpack_from("<I", raw, p); p += 4 + 4 * n
    p += 4                                        # collision object
    return {"t": t, "r": r, "s": s}, p


def node_fields(raw: bytes, bs_version: int) -> dict:
    av, p = av_fields(raw, bs_version)
    (n,) = struct.unpack_from("<I", raw, p)
    av["children"] = list(struct.unpack_from(f"<{n}i", raw, p + 4))
    return av


def local_matrix(av: dict) -> np.ndarray:
    m = np.eye(4)
    m[:3, :3] = np.array(av["r"]).reshape(3, 3) * av["s"]
    m[:3, 3] = av["t"]
    return m


def world_matrix(nif: Nif, index: int) -> np.ndarray:
    """The block's transform to the NIF root, its own transform included when
    it has one (a node or a geometry)."""
    chain = []
    i: int | None = index
    while i is not None:
        chain.append(i)
        i = nif.parent.get(i)
    m = np.eye(4)
    for j in reversed(chain):
        kind, raw = nif.blocks[j]
        try:
            av, _ = av_fields(raw, nif.bs_version)
        except struct.error:
            continue
        if kind in NODE_TYPES or kind in ("NiParticleSystem", "NiTriShape", "BSTriShape",
                                          "NiTriStrips"):
            m = m @ local_matrix(av)
    return m


def to_gltf_m(point_units, metres_per_unit: float) -> list[float]:
    """NIF Z-up units -> glTF Y-up metres: (x, y, z) -> (x, z, -y)."""
    x, y, z = (float(v) * metres_per_unit for v in point_units)
    return [round(x, 4), round(z, 4), round(-y + 0.0, 4)]


def _sized_string(raw: bytes, p: int) -> tuple[str, int]:
    (n,) = struct.unpack_from("<I", raw, p)
    return raw[p + 4:p + 4 + n].decode("latin1").rstrip("\0"), p + 4 + n


def effect_shader(raw: bytes) -> dict:
    """BSEffectShaderProperty (bsVersion 83/100): source texture, greyscale
    palette, emissive colour and multiple."""
    p = _object_net(raw)
    p += 8 + 8 + 8                                # flags1, flags2, uv offset, uv scale
    source, p = _sized_string(raw, p)
    p += 4                                        # clamp, lighting influence, env LOD, unused
    p += 16                                       # falloff angles and opacities
    emissive = struct.unpack_from("<4f", raw, p); p += 16
    (multiple,) = struct.unpack_from("<f", raw, p); p += 4
    p += 4                                        # soft falloff depth
    greyscale, p = _sized_string(raw, p)
    return {"texture": _tex(source), "palette": _tex(greyscale) or None,
            "emissive": [round(v, 4) for v in emissive], "emissiveMultiple": round(multiple, 4)}


def _tex(path: str) -> str:
    path = path.replace("\\", "/").lower().strip()
    if path and not path.startswith("textures/"):
        path = "textures/" + path
    return path


def _geometry_properties(raw: bytes, bs_version: int, kind: str = "NiTriShape") -> tuple[int, int]:
    """The shader and alpha property refs of a geometry block: NiGeometry
    (bsVersion 83: data, skin, materials) or BSTriShape (Skyrim SE, bsVersion
    100: bounding sphere, skin, then the two refs; mudmother OvenNew's
    `m_Flames:0`)."""
    _, p = av_fields(raw, bs_version)
    if kind == "BSTriShape":
        return struct.unpack_from("<2i", raw, p + 16 + 4)
    p += 8                                        # data, skin instance
    (nmat,) = struct.unpack_from("<I", raw, p); p += 4 + 8 * nmat
    p += 4 + 1                                    # active material, needs update
    return struct.unpack_from("<2i", raw, p)


def _modifier_base(raw: bytes) -> tuple[int, int, int]:
    """NiPSysModifier: (name string index, target block, offset after)."""
    (name,) = struct.unpack_from("<i", raw, 0)
    (target,) = struct.unpack_from("<i", raw, 8)
    return name, target, 13


def _emitter(kind: str, raw: bytes) -> dict:
    _, target, p = _modifier_base(raw)
    vals = struct.unpack_from("<6f4f4f", raw, p); p += 56
    radius, radius_var, life, life_var = vals[10:14]
    out = {"target": target, "radius": radius, "radiusVar": radius_var, "life": life}
    if kind in ("NiPSysCylinderEmitter", "NiPSysSphereEmitter", "NiPSysBoxEmitter"):
        (out["object"],) = struct.unpack_from("<i", raw, p)
    return out


def _subtex(raw: bytes) -> dict:
    _, target, p = _modifier_base(raw)
    (start,) = struct.unpack_from("<I", raw, p); p += 4
    _fudge, end, loop, _lfudge, frames, _ffudge = struct.unpack_from("<6f", raw, p)
    return {"target": target, "start": start, "end": end, "loopStart": loop,
            "frameCount": frames}


def _scale(raw: bytes) -> dict:
    _, target, p = _modifier_base(raw)
    (n,) = struct.unpack_from("<I", raw, p)
    return {"target": target, "scales": list(struct.unpack_from(f"<{n}f", raw, p + 4))}


def particle_systems(nif: Nif) -> list[dict]:
    """Every NiParticleSystem: name, root-frame position (units), texture,
    palette, particle radius and life, and its BSPSysSubTexModifier if any."""
    if nif.bs_version != 83:
        return [{"name": nif.name(i), "unparsed": f"bsVersion {nif.bs_version}"}
                for i in nif.indices("NiParticleSystem")]
    emitters, subtexes, scales = {}, {}, {}
    for i, (kind, raw) in enumerate(nif.blocks):
        try:
            if kind.endswith("Emitter") and kind.startswith("NiPSys"):
                e = _emitter(kind, raw); emitters.setdefault(e["target"], e)
            elif kind == "BSPSysSubTexModifier":
                s = _subtex(raw); subtexes[s["target"]] = s
            elif kind == "BSPSysScaleModifier":
                s = _scale(raw); scales[s["target"]] = s
        except struct.error:
            continue
    out = []
    for i in nif.indices("NiParticleSystem"):
        raw = nif.blocks[i][1]
        shader_ref, _alpha = _geometry_properties(raw, nif.bs_version)
        shader = (effect_shader(nif.blocks[shader_ref][1])
                  if 0 <= shader_ref < len(nif.blocks)
                  and nif.blocks[shader_ref][0] == "BSEffectShaderProperty" else {})
        emitter = emitters.get(i, {})
        anchor = emitter.get("object", -1)
        at = world_matrix(nif, anchor if anchor in nif.parent or anchor == 0 else i)[:3, 3]
        scale = max(scales.get(i, {}).get("scales") or [1.0])
        out.append({"name": nif.name(i), "block": i, "positionUnits": at.tolist(),
                    "texture": shader.get("texture"), "palette": shader.get("palette"),
                    "emissive": shader.get("emissive"),
                    "emissiveMultiple": shader.get("emissiveMultiple"),
                    "radiusUnits": emitter.get("radius"), "lifeS": emitter.get("life"),
                    "scaleMax": scale, "subtex": subtexes.get(i)})
    return out


def addon_nodes(nif: Nif) -> list[dict]:
    """Every BSValueNode named AddOnNodeN: the ADDN index N and its position."""
    out = []
    for i in nif.indices("BSValueNode"):
        m = ADDON_NODE.match(nif.name(i))
        if m:
            out.append({"index": int(m.group(1)), "block": i,
                        "positionUnits": world_matrix(nif, i)[:3, 3].tolist()})
    return out


def billboard_glow_shapes(nif: Nif) -> list[dict]:
    """Shapes under a NiBillboardNode whose effect shader draws a glow texture
    (campfire `Glow02:0`, fxfirewithembers `glow`): engine billboards that
    ship as fixed discs if exported, so the kit drops them and draws sprites."""
    out = []
    for i, (kind, raw) in enumerate(nif.blocks):
        if kind not in ("NiTriShape", "BSTriShape", "NiTriStrips"):
            continue
        parent = nif.parent.get(i)
        if parent is None or nif.blocks[parent][0] != "NiBillboardNode":
            continue
        if kind != "NiTriShape":
            continue
        try:
            shader_ref, _ = _geometry_properties(raw, nif.bs_version)
        except struct.error:
            continue
        if not (0 <= shader_ref < len(nif.blocks)
                and nif.blocks[shader_ref][0] == "BSEffectShaderProperty"):
            continue
        shader = effect_shader(nif.blocks[shader_ref][1])
        if "glow" not in Path(shader["texture"]).stem:
            continue
        out.append({"shape": nif.name(i), "node": nif.name(parent), "block": i,
                    "texture": shader["texture"], "emissive": shader["emissive"],
                    "positionUnits": world_matrix(nif, i)[:3, 3].tolist()})
    return out


#: Geometry blocks whose property refs `_geometry_properties` reads
#: (BSLODTriShape is a NiTriShape with three LOD sizes appended; BSTriShape
#: is the Skyrim SE shape mod NIFs such as mudmother's ship).
EFFECT_GEOMETRY = ("NiTriShape", "BSLODTriShape", "NiTriStrips", "BSTriShape")


def effect_shape_shaders(nif: Nif) -> dict[str, dict]:
    """Every geometry shape drawn with a BSEffectShaderProperty, by shape
    name: its `effect_shader` record (texture, palette, emissive colour and
    multiple). fxfirewithembers01's flame cards `Flames02grant01:0` and
    `L2_Flames02grant:0/1` (BSLODTriShape) carry emissive multiple 1.6."""
    out = {}
    for i, (kind, raw) in enumerate(nif.blocks):
        if kind not in EFFECT_GEOMETRY:
            continue
        try:
            shader_ref, _ = _geometry_properties(raw, nif.bs_version, kind)
        except struct.error:
            continue
        if 0 <= shader_ref < len(nif.blocks) and nif.blocks[shader_ref][0] == "BSEffectShaderProperty":
            out[nif.name(i)] = effect_shader(nif.blocks[shader_ref][1])
    return out


def is_flame_system(name: str) -> bool:
    return bool(FLAME_NAME.search(name)) and not NOT_FLAME_NAME.search(name)


# --- Skyrim.esm ADDN ---------------------------------------------------------

def read_addn(esm: bytes) -> dict[int, dict]:
    """Skyrim.esm ADDN records by their DATA index: editor id and MPS model."""
    p = struct.unpack_from("<I", esm, 4)[0] + 24
    out: dict[int, dict] = {}
    while p < len(esm):
        _typ, size, label = struct.unpack_from("<4sI4s", esm, p)
        if label == b"ADDN":
            q, end = p + 24, p + size
            while q < end:
                _t, ds, flags, form = struct.unpack_from("<4sIII", esm, q)
                body = esm[q + 24:q + 24 + ds]
                if flags & 0x40000:
                    body = zlib.decompress(body[4:])
                fields: dict[bytes, bytes] = {}
                r = 0
                while r < len(body):
                    ft, fs = struct.unpack_from("<4sH", body, r)
                    fields.setdefault(ft, body[r + 6:r + 6 + fs]); r += 6 + fs
                if b"DATA" in fields:
                    (idx,) = struct.unpack("<i", fields[b"DATA"][:4])
                    out[idx] = {"formId": f"{form:08x}",
                                "editorId": fields.get(b"EDID", b"").rstrip(b"\0").decode(),
                                "model": "meshes/" + fields.get(b"MODL", b"").rstrip(b"\0")
                                .decode().replace("\\", "/").lower()}
                q += 24 + ds
            break
        p += size
    return out
