"""Structured TES5 plugin reader: base objects, worldspace cells, object
references, region object tables and grass definitions.

`esp.py` reads terrain only (LAND/VHGT). This module adds everything the
placement phases need to **mine the shipped worlds for rules** (module 95
§86.0b): what a professional team placed, where, on what ground, at what
slope and how densely — never their authored places, only the statistics.

Group-aware: the walker keeps the GRUP nesting so a REFR is attributed to the
exterior cell that owns it, and a cell to its worldspace. Form ids are
resolved against the plugin's master list so references into Skyrim.esm are
reported as such rather than silently mis-attributed.

Format reference: https://en.uesp.net/wiki/Skyrim_Mod:Mod_File_Format
"""

from __future__ import annotations

import math
import struct
from dataclasses import dataclass, field
from pathlib import Path

from .esp import GROUP_HEADER, Record, _record_at, decode_vhgt

# --- format constants -------------------------------------------------------

CELL_SIZE_UNITS = 4096.0
"""Exterior cell edge in Bethesda game units."""

UNITS_PER_METRE = 1.0 / 0.0142240
"""Skyrim's unit: 64 units = 1 yard (0.9144 m) => 1 unit = 1.4224 cm.

Used to convert mined densities/spacings into our metric world (0003).
"""

CELL_SIZE_M = CELL_SIZE_UNITS / UNITS_PER_METRE   # ~58.26 m
CELL_AREA_M2 = CELL_SIZE_M * CELL_SIZE_M          # ~3394 m²

LAND_DIM = 33
"""LAND vertex grid per cell (33x33, 128 units apart)."""

QUAD_DIM = 17
"""Vertex grid per LAND quadrant."""

# Group types we care about (UESP "Group Type" table).
GT_TOP = 0
GT_WORLD_CHILDREN = 1
GT_EXT_CELL_BLOCK = 4
GT_EXT_CELL_SUBBLOCK = 5
GT_CELL_CHILDREN = 6
GT_CELL_PERSISTENT = 8
GT_CELL_TEMPORARY = 9
GT_CELL_VISIBLE_DISTANT = 10

# Record types that define a placeable base object, with the subrecord that
# carries its model path.
BASE_OBJECT_TYPES = (
    b"STAT", b"TREE", b"FLOR", b"ACTI", b"MSTT", b"CONT", b"DOOR", b"FURN",
    b"LIGH", b"MISC", b"SCOL", b"ALCH", b"INGR", b"NPC_", b"LVLN", b"LVLI",
    b"AMMO", b"ARMO", b"WEAP", b"KEYM", b"BOOK", b"SOUN", b"TACT", b"IDLM",
)


def _cstr(payload: bytes) -> str:
    return payload.split(b"\0", 1)[0].decode("cp1252", "replace")


#: Bethesda writes FLT_MAX (and similar sentinels) for "no value here" — a
#: cell's XCLW is FLT_MAX when it simply inherits the worldspace default.
NO_VALUE_ABOVE = 1e30


def _sane_height(value: float) -> float | None:
    return None if abs(value) >= NO_VALUE_ABOVE else value


# --- group-aware walking ----------------------------------------------------


@dataclass(frozen=True)
class GroupFrame:
    """One level of GRUP nesting."""

    type: int
    label: bytes

    @property
    def label_form_id(self) -> int:
        return struct.unpack("<I", self.label)[0]


def walk(buf: bytes, start: int, end: int, stack: tuple[GroupFrame, ...] = ()):
    """Yield `(record, group_stack)` over buf[start:end], descending GRUPs."""
    pos = start
    while pos + 4 <= end:
        if buf[pos : pos + 4] == b"GRUP":
            gsize, label, gtype = struct.unpack_from("<I4si", buf, pos + 4)
            frame = GroupFrame(gtype, label)
            yield from walk(buf, pos + GROUP_HEADER.size, pos + gsize, stack + (frame,))
            pos += gsize
        else:
            record, pos = _record_at(buf, pos)
            yield record, stack


# --- plugin ------------------------------------------------------------------


@dataclass
class BaseObject:
    form_id: int
    type: str
    editor_id: str | None
    model: str | None
    bounds: tuple[int, int, int, int, int, int] | None = None

    @property
    def model_key(self) -> str | None:
        """Lower-cased, forward-slashed model path — the join key to the asset
        registry and to archive manifests."""
        return self.model.replace("\\", "/").lower() if self.model else None


@dataclass
class ObjectRef:
    form_id: int
    base: int
    pos: tuple[float, float, float]
    rot: tuple[float, float, float]
    scale: float = 1.0
    cell: tuple[int, int] | None = None
    world: int | None = None
    distant: bool = False
    """True when the ref lives in the visible-distant-children group."""


@dataclass
class LandData:
    heights: list[list[float]] | None = None
    normals: list[list[tuple[float, float, float]]] | None = None
    base_texture: dict[int, int] = field(default_factory=dict)
    """quadrant -> LTEX form id painted as the quadrant's base layer."""
    layers: list[tuple[int, int, dict[int, float]]] = field(default_factory=list)
    """(quadrant, LTEX form id, {vertex index within quadrant: opacity})."""


@dataclass
class WorldSpace:
    form_id: int
    editor_id: str | None
    parent: int | None
    default_land: float | None
    default_water: float | None


@dataclass
class ExteriorCell:
    form_id: int
    world: int
    grid: tuple[int, int]
    water_height: float | None = None
    land: LandData | None = None
    refs: list[ObjectRef] = field(default_factory=list)


@dataclass
class LandTexture:
    form_id: int
    editor_id: str | None
    texture: str | None
    friction_restitution: tuple[int, int] | None
    grasses: list[int] = field(default_factory=list)


@dataclass
class RegionObject:
    """One RDOT entry — Bethesda's own procedural scatter rule."""

    object: int
    density: float
    clustering: int
    min_slope: int
    max_slope: int
    radius: int
    min_height: float
    max_height: float
    sink: float
    sink_variance: float
    size_variance: float
    angle_variance: tuple[int, int, int]
    flags: int


@dataclass
class Region:
    form_id: int
    editor_id: str | None
    world: int | None
    objects: list[RegionObject] = field(default_factory=list)
    grasses: list[int] = field(default_factory=list)


@dataclass
class Grass:
    form_id: int
    editor_id: str | None
    model: str | None
    density: int
    min_slope: int
    max_slope: int
    unit_from_water: int
    water_mode: int
    position_range: float
    height_range: float
    colour_range: float
    wave_period: float
    flags: int


RDOT_STRUCT = struct.Struct("<IHHfBBBBHHfffffHHH6s")
assert RDOT_STRUCT.size == 52
GRAS_DATA = struct.Struct("<BBBBHHIffffB3s")
assert GRAS_DATA.size == 32


class Plugin:
    """A loaded .esm/.esp, indexed lazily by what the caller asks for."""

    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.buf = self.path.read_bytes()
        header, self._body_start = _record_at(self.buf, 0)
        self.masters: list[str] = [
            _cstr(p) for t, p in header.subrecords() if t == b"MAST"
        ]

    # -- form id resolution --

    @property
    def self_index(self) -> int:
        return len(self.masters)

    def source_of(self, form_id: int) -> str:
        """Which plugin defines `form_id` — a master's filename, or this file."""
        index = form_id >> 24
        if index < len(self.masters):
            return self.masters[index]
        return self.path.name

    def is_own(self, form_id: int) -> bool:
        return (form_id >> 24) == self.self_index

    def records(self):
        yield from walk(self.buf, self._body_start, len(self.buf))

    # -- base objects --

    def base_objects(self, types=BASE_OBJECT_TYPES) -> dict[int, BaseObject]:
        wanted = set(types)
        out: dict[int, BaseObject] = {}
        for rec, stack in self.records():
            if rec.type not in wanted:
                continue
            edid = model = None
            bounds = None
            for st, payload in rec.subrecords():
                if st == b"EDID":
                    edid = _cstr(payload)
                elif st == b"MODL" and model is None and len(payload) > 1:
                    model = _cstr(payload)
                elif st == b"OBND" and len(payload) >= 12:
                    bounds = struct.unpack_from("<6h", payload)
            out[rec.form_id] = BaseObject(
                rec.form_id, rec.type.decode("ascii"), edid, model, bounds
            )
        return out

    def landscape_textures(self) -> dict[int, "LandTexture"]:
        """LTEX form id -> editor id, diffuse path, physics and grass bindings.

        The GNAM list is Bethesda's groundcover rule: *which grasses grow on
        this painted ground*, capped at a handful per texture.
        """
        ltex: dict[int, tuple[LandTexture, int | None]] = {}
        txst: dict[int, str | None] = {}
        for rec, _ in self.records():
            if rec.type == b"LTEX":
                entry = LandTexture(rec.form_id, None, None, None, [])
                tnam = None
                for st, payload in rec.subrecords():
                    if st == b"EDID":
                        entry.editor_id = _cstr(payload)
                    elif st == b"TNAM" and len(payload) >= 4:
                        tnam = struct.unpack_from("<I", payload)[0]
                    elif st == b"HNAM" and len(payload) >= 2:
                        entry.friction_restitution = (payload[0], payload[1])
                    elif st == b"GNAM" and len(payload) >= 4:
                        entry.grasses.append(struct.unpack_from("<I", payload)[0])
                ltex[rec.form_id] = (entry, tnam)
            elif rec.type == b"TXST":
                tex = None
                for st, payload in rec.subrecords():
                    if st == b"TX00":
                        tex = _cstr(payload)
                txst[rec.form_id] = tex
        for fid, (entry, tnam) in ltex.items():
            entry.texture = txst.get(tnam) if tnam else None
        return {fid: entry for fid, (entry, _) in ltex.items()}

    # -- worldspaces --

    def worldspaces(self) -> dict[int, "WorldSpace"]:
        out: dict[int, WorldSpace] = {}
        for rec, stack in self.records():
            if rec.type != b"WRLD":
                continue
            world = WorldSpace(rec.form_id, None, None, None, None)
            for st, payload in rec.subrecords():
                if st == b"EDID":
                    world.editor_id = _cstr(payload)
                elif st == b"WNAM" and len(payload) >= 4:
                    world.parent = struct.unpack_from("<I", payload)[0]
                elif st == b"DNAM" and len(payload) >= 8:
                    land, water = struct.unpack_from("<2f", payload)
                    world.default_land = _sane_height(land)
                    world.default_water = _sane_height(water)
            out[rec.form_id] = world
        return out

    def exterior_cells(self, *, with_land=True, with_refs=True):
        """Yield `ExteriorCell` for every exterior cell in every worldspace.

        Cells arrive fully populated: the walker buffers the current cell and
        emits it when the next cell (or the end of the worldspace) arrives.
        """
        current: ExteriorCell | None = None
        world: int | None = None
        world_water: dict[int, float | None] = {
            fid: w.default_water for fid, w in self.worldspaces().items()
        }
        for rec, stack in self.records():
            types = [f.type for f in stack]
            if GT_WORLD_CHILDREN in types:
                world = stack[types.index(GT_WORLD_CHILDREN)].label_form_id
            if rec.type == b"CELL":
                if current is not None:
                    yield current
                    current = None
                grid = water = None
                for st, payload in rec.subrecords():
                    if st == b"XCLC" and len(payload) >= 8:
                        grid = struct.unpack_from("<ii", payload)
                    elif st == b"XCLW" and len(payload) >= 4:
                        water = _sane_height(struct.unpack_from("<f", payload)[0])
                if grid is None or world is None:
                    continue  # interior, or the worldspace's persistent cell
                if water is None:
                    water = world_water.get(world)
                current = ExteriorCell(rec.form_id, world, grid, water)
            elif current is None:
                continue
            elif rec.type == b"LAND" and with_land:
                current.land = decode_land(rec)
            elif rec.type == b"REFR" and with_refs:
                ref = decode_ref(rec)
                if ref is not None:
                    ref.cell = current.grid
                    ref.world = current.world
                    ref.distant = GT_CELL_VISIBLE_DISTANT in types
                    current.refs.append(ref)
        if current is not None:
            yield current

    # -- procedural placement rules --

    def regions(self) -> list[Region]:
        out: list[Region] = []
        for rec, _ in self.records():
            if rec.type != b"REGN":
                continue
            region = Region(rec.form_id, None, None)
            data_type = None
            for st, payload in rec.subrecords():
                if st == b"EDID":
                    region.editor_id = _cstr(payload)
                elif st == b"WNAM" and len(payload) >= 4:
                    region.world = struct.unpack_from("<I", payload)[0]
                elif st == b"RDAT" and len(payload) >= 4:
                    data_type = struct.unpack_from("<I", payload)[0]
                elif st == b"RDOT":
                    region.objects.extend(decode_rdot(payload))
                elif st == b"RDGS":
                    region.grasses.extend(
                        struct.unpack_from("<I", payload, i)[0]
                        for i in range(0, len(payload) - 3, 8)
                    )
            out.append(region)
        return out

    def grasses(self) -> list[Grass]:
        out: list[Grass] = []
        for rec, _ in self.records():
            if rec.type != b"GRAS":
                continue
            edid = model = None
            data = None
            for st, payload in rec.subrecords():
                if st == b"EDID":
                    edid = _cstr(payload)
                elif st == b"MODL" and len(payload) > 1:
                    model = _cstr(payload)
                elif st == b"DATA" and len(payload) >= GRAS_DATA.size:
                    data = GRAS_DATA.unpack_from(payload)
            if data is None:
                continue
            (density, min_slope, max_slope, _u0, water_amount, _u1, water_type,
             pos_range, height_range, colour_range, wave_period, flags, _u2) = data
            out.append(Grass(
                rec.form_id, edid, model, density, min_slope, max_slope,
                water_amount, water_type, pos_range, height_range,
                colour_range, wave_period, flags,
            ))
        return out


# --- record decoders ---------------------------------------------------------


def decode_ref(rec: Record) -> ObjectRef | None:
    base = None
    pos = rot = None
    scale = 1.0
    for st, payload in rec.subrecords():
        if st == b"NAME" and len(payload) >= 4:
            base = struct.unpack_from("<I", payload)[0]
        elif st == b"DATA" and len(payload) >= 24:
            values = struct.unpack_from("<6f", payload)
            pos, rot = values[:3], values[3:]
        elif st == b"XSCL" and len(payload) >= 4:
            scale = struct.unpack_from("<f", payload)[0]
    if base is None or pos is None:
        return None
    return ObjectRef(rec.form_id, base, pos, rot or (0.0, 0.0, 0.0), scale)


def decode_land(rec: Record) -> LandData:
    land = LandData()
    pending: tuple[int, int] | None = None
    for st, payload in rec.subrecords():
        if st == b"VHGT":
            _, land.heights = decode_vhgt(payload)
        elif st == b"VNML" and len(payload) >= LAND_DIM * LAND_DIM * 3:
            land.normals = decode_normals(payload)
        elif st == b"BTXT" and len(payload) >= 8:
            fid, quadrant = struct.unpack_from("<IB", payload)
            land.base_texture[quadrant] = fid
        elif st == b"ATXT" and len(payload) >= 8:
            fid, quadrant = struct.unpack_from("<IB", payload)
            pending = (quadrant, fid)
        elif st == b"VTXT" and pending is not None:
            alphas = {}
            for i in range(0, len(payload) - 7, 8):
                index, _unk, opacity = struct.unpack_from("<HHf", payload, i)
                alphas[index] = opacity
            land.layers.append((pending[0], pending[1], alphas))
            pending = None
    return land


def decode_normals(payload: bytes) -> list[list[tuple[float, float, float]]]:
    """VNML holds signed bytes scaled by 127 — flat ground is (0, 0, 127)."""
    signed = struct.unpack_from(f"<{LAND_DIM * LAND_DIM * 3}b", payload)
    rows = []
    for r in range(LAND_DIM):
        row = []
        for c in range(LAND_DIM):
            i = (r * LAND_DIM + c) * 3
            row.append(tuple(signed[i + k] / 127.0 for k in range(3)))
        rows.append(row)
    return rows


def decode_rdot(payload: bytes) -> list[RegionObject]:
    out: list[RegionObject] = []
    for i in range(0, len(payload) - RDOT_STRUCT.size + 1, RDOT_STRUCT.size):
        (obj, _parent, _u0, density, clustering, min_slope, max_slope, flags,
         _radius_parent, radius, min_h, max_h, sink, sink_var, size_var,
         ax, ay, az, _u1) = RDOT_STRUCT.unpack_from(payload, i)
        out.append(RegionObject(
            obj, density, clustering, min_slope, max_slope, radius,
            min_h, max_h, sink, sink_var, size_var, (ax, ay, az), flags,
        ))
    return out


# --- sampling helpers --------------------------------------------------------


def cell_of(x: float, y: float) -> tuple[int, int]:
    return (math.floor(x / CELL_SIZE_UNITS), math.floor(y / CELL_SIZE_UNITS))


def _land_index(pos: float, cell: int) -> int:
    local = pos - cell * CELL_SIZE_UNITS
    step = CELL_SIZE_UNITS / (LAND_DIM - 1)
    return min(LAND_DIM - 1, max(0, int(round(local / step))))


def _land_frac(pos: float, cell: int) -> tuple[int, float]:
    """Lower vertex index and the fraction to the next one."""
    step = CELL_SIZE_UNITS / (LAND_DIM - 1)
    t = (pos - cell * CELL_SIZE_UNITS) / step
    i = min(LAND_DIM - 2, max(0, int(t)))
    return i, min(1.0, max(0.0, t - i))


def slope_degrees_at(land: LandData, x: float, y: float, cell: tuple[int, int]) -> float | None:
    """Terrain slope under a world position, from the LAND vertex normals."""
    if land.normals is None:
        return None
    col = _land_index(x, cell[0])
    row = _land_index(y, cell[1])
    nz = land.normals[row][col][2]
    return math.degrees(math.acos(max(-1.0, min(1.0, nz))))


def height_at(land: LandData, x: float, y: float, cell: tuple[int, int]) -> float | None:
    """Bilinear terrain height — the 128-unit vertex spacing is 1.8 m, coarse
    enough that nearest-vertex sampling would blur a sink measurement."""
    if land.heights is None:
        return None
    c0, fx = _land_frac(x, cell[0])
    r0, fy = _land_frac(y, cell[1])
    h = land.heights
    top = h[r0][c0] * (1 - fx) + h[r0][c0 + 1] * fx
    bottom = h[r0 + 1][c0] * (1 - fx) + h[r0 + 1][c0 + 1] * fx
    return top * (1 - fy) + bottom * fy


def dominant_texture_at(land: LandData, x: float, y: float, cell: tuple[int, int]) -> int | None:
    """The LTEX form id with the greatest painted opacity under a position.

    Quadrants are 17x17 vertex grids: 0 = bottom-left, 1 = bottom-right,
    2 = top-left, 3 = top-right (x fastest).
    """
    col = _land_index(x, cell[0])
    row = _land_index(y, cell[1])
    quadrant = (1 if col >= QUAD_DIM - 1 else 0) + (2 if row >= QUAD_DIM - 1 else 0)
    qcol = col - (QUAD_DIM - 1 if quadrant & 1 else 0)
    qrow = row - (QUAD_DIM - 1 if quadrant & 2 else 0)
    index = qrow * QUAD_DIM + qcol
    best = land.base_texture.get(quadrant)
    best_opacity = 0.0
    for q, fid, alphas in land.layers:
        if q != quadrant:
            continue
        opacity = alphas.get(index, 0.0)
        if opacity > best_opacity:
            best, best_opacity = fid, opacity
    return best
