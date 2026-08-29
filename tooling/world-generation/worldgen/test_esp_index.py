"""Synthetic-plugin tests for the structured reader.

The reader is load-bearing for every placement phase's rule mining, and the
real sources are multi-GB vault archives, so the fixtures here are
hand-assembled buffers in the documented TES5 layout.
"""

import struct

import pytest

from .esp_index import (
    GT_CELL_CHILDREN,
    GT_CELL_TEMPORARY,
    GT_CELL_VISIBLE_DISTANT,
    GT_EXT_CELL_BLOCK,
    GT_EXT_CELL_SUBBLOCK,
    GT_TOP,
    GT_WORLD_CHILDREN,
    LAND_DIM,
    QUAD_DIM,
    LandData,
    Plugin,
    decode_rdot,
    dominant_texture_at,
    height_at,
    slope_degrees_at,
)


def sub(tag: bytes, payload: bytes) -> bytes:
    return tag + struct.pack("<H", len(payload)) + payload


def record(rtype: bytes, form_id: int, body: bytes) -> bytes:
    return struct.pack("<4sIIIIHH", rtype, len(body), 0, form_id, 0, 44, 0) + body


def group(label: bytes, gtype: int, body: bytes) -> bytes:
    header = struct.pack("<4sI4siIHH", b"GRUP", len(body) + 24, label, gtype, 0, 0, 0)
    return header + body


def cstr(text: str) -> bytes:
    return text.encode("ascii") + b"\0"


def build_plugin(tmp_path, *, masters=("Skyrim.esm",)):
    """A one-worldspace plugin: two statics, one cell, land, three refs."""
    header = b"".join(
        [sub(b"HEDR", struct.pack("<fiI", 1.7, 10, 0x800))]
        + [sub(b"MAST", cstr(m)) + sub(b"DATA", struct.pack("<Q", 0)) for m in masters]
    )
    stats = group(b"STAT", GT_TOP, b"".join([
        record(b"STAT", 0x01000800, sub(b"EDID", cstr("MarshReed01"))
               + sub(b"OBND", struct.pack("<6h", -20, -20, 0, 20, 20, 140))
               + sub(b"MODL", cstr("Landscape\\Grass\\Reed01.nif"))),
        record(b"STAT", 0x01000801, sub(b"EDID", cstr("SwampHut01"))
               + sub(b"MODL", cstr("Architecture\\Marsh\\Hut01.nif"))),
    ]))

    heights = [0] * (LAND_DIM * LAND_DIM)
    vhgt = struct.pack("<f", 0.0) + struct.pack(f"<{len(heights)}b", *heights) + b"\0\0\0"
    normals = bytes(bytearray([0, 0, 127] * LAND_DIM * LAND_DIM))
    land = record(b"LAND", 0x01000900, sub(b"VNML", normals) + sub(b"VHGT", vhgt)
                  + sub(b"BTXT", struct.pack("<IBBh", 0x00000C16, 0, 0, 0)))

    def ref(form_id, base, pos, scale=None):
        body = sub(b"NAME", struct.pack("<I", base)) + sub(
            b"DATA", struct.pack("<6f", *pos, 0.0, 0.0, 1.0)
        )
        if scale is not None:
            body += sub(b"XSCL", struct.pack("<f", scale))
        return record(b"REFR", form_id, body)

    cell_children = group(
        struct.pack("<I", 0x01000A00), GT_CELL_CHILDREN,
        group(struct.pack("<I", 0x01000A00), GT_CELL_TEMPORARY,
              land
              + ref(0x01000A01, 0x01000800, (100.0, 200.0, 12.0), 2.5)
              + ref(0x01000A02, 0x00034DAE, (300.0, 400.0, 8.0)))
        + group(struct.pack("<I", 0x01000A00), GT_CELL_VISIBLE_DISTANT,
                ref(0x01000A03, 0x01000801, (500.0, 600.0, 0.0))),
    )
    cell = record(b"CELL", 0x01000A00,
                  sub(b"XCLC", struct.pack("<iiI", 0, 0, 0))
                  + sub(b"XCLW", struct.pack("<f", 3.4028234663852886e38)))
    world = record(b"WRLD", 0x01000B00,
                   sub(b"EDID", cstr("Marshland"))
                   + sub(b"DNAM", struct.pack("<2f", -2048.0, 5.0)))
    worlds = group(b"WRLD", GT_TOP, world + group(
        struct.pack("<I", 0x01000B00), GT_WORLD_CHILDREN,
        group(struct.pack("<i", 0), GT_EXT_CELL_BLOCK,
              group(struct.pack("<i", 0), GT_EXT_CELL_SUBBLOCK, cell + cell_children)),
    ))

    path = tmp_path / "fixture.esp"
    path.write_bytes(record(b"TES4", 0, header) + stats + worlds)
    return Plugin(path)


@pytest.fixture()
def plugin(tmp_path):
    return build_plugin(tmp_path)


def test_masters_and_form_id_sources(plugin):
    assert plugin.masters == ["Skyrim.esm"]
    assert plugin.self_index == 1
    assert plugin.source_of(0x01000800) == "fixture.esp"
    assert plugin.source_of(0x00034DAE) == "Skyrim.esm"
    assert plugin.is_own(0x01000800) and not plugin.is_own(0x00034DAE)


def test_base_objects_carry_model_bounds_and_key(plugin):
    bases = plugin.base_objects()
    reed = bases[0x01000800]
    assert reed.editor_id == "MarshReed01"
    assert reed.model_key == "landscape/grass/reed01.nif"
    assert reed.bounds == (-20, -20, 0, 20, 20, 140)


def test_worldspace_defaults_fill_a_cell_without_its_own_water(plugin):
    world = plugin.worldspaces()[0x01000B00]
    assert world.editor_id == "Marshland"
    assert world.default_water == 5.0
    cell = next(iter(plugin.exterior_cells()))
    # XCLW was FLT_MAX ("inherit"), so the worldspace default must win.
    assert cell.water_height == 5.0
    assert cell.grid == (0, 0)


def test_refs_are_scoped_to_their_cell_and_marked_distant(plugin):
    cell = next(iter(plugin.exterior_cells()))
    by_id = {r.form_id: r for r in cell.refs}
    assert set(by_id) == {0x01000A01, 0x01000A02, 0x01000A03}
    assert by_id[0x01000A01].scale == 2.5
    assert by_id[0x01000A01].cell == (0, 0) and by_id[0x01000A01].world == 0x01000B00
    assert by_id[0x01000A02].scale == 1.0
    assert by_id[0x01000A03].distant is True
    assert by_id[0x01000A01].distant is False


def test_land_decoding_gives_flat_ground_and_the_painted_base_texture(plugin):
    cell = next(iter(plugin.exterior_cells()))
    land = cell.land
    assert land is not None and land.heights is not None
    assert slope_degrees_at(land, 100.0, 200.0, (0, 0)) == pytest.approx(0.0, abs=1e-6)
    assert dominant_texture_at(land, 100.0, 200.0, (0, 0)) == 0x00000C16


def test_alpha_layer_beats_the_base_texture_where_it_is_painted():
    land = LandData(base_texture={3: 0x11}, layers=[(3, 0x22, {0: 0.9})])
    # Quadrant 3 is the far corner; its vertex 0 sits at cell-local (2048, 2048).
    assert dominant_texture_at(land, 2048.0, 2048.0, (0, 0)) == 0x22
    assert dominant_texture_at(land, 4000.0, 4000.0, (0, 0)) == 0x11
    assert QUAD_DIM * 2 - 1 == LAND_DIM


def test_height_is_bilinear_between_vertices():
    heights = [[0.0] * LAND_DIM for _ in range(LAND_DIM)]
    heights[0][1] = 128.0
    land = LandData(heights=heights)
    step = 4096.0 / (LAND_DIM - 1)
    assert height_at(land, step, 0.0, (0, 0)) == pytest.approx(128.0)
    assert height_at(land, step / 2, 0.0, (0, 0)) == pytest.approx(64.0)


def test_decode_rdot_reads_bethesdas_scatter_rule():
    payload = struct.pack(
        "<IHHfBBBBHHfffffHHH6s",
        0x000B73BC, 0, 0, 12.5, 3, 0, 30, 1, 0, 256,
        -100.0, 900.0, -8.0, 4.0, 0.25, 0, 0, 3600, b"\0" * 6,
    )
    (rule,) = decode_rdot(payload)
    assert rule.object == 0x000B73BC
    assert rule.density == pytest.approx(12.5)
    assert (rule.min_slope, rule.max_slope) == (0, 30)
    assert rule.sink == -8.0 and rule.sink_variance == 4.0
    assert rule.size_variance == 0.25
    assert rule.angle_variance == (0, 0, 3600)
