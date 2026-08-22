"""Minimal TES5 (Skyrim SE) plugin reader for landscape extraction.

Reads just enough of the .esp/.esm format to pull worldspace terrain out of
LAND/VHGT records: top-level GRUP walking, nested worldspace/cell groups,
zlib-compressed record bodies, CELL grid coordinates (XCLC) and VHGT decoding.
Format reference: https://en.uesp.net/wiki/Skyrim_Mod:Mod_File_Format
"""

from __future__ import annotations

import struct
import zlib
from dataclasses import dataclass
from pathlib import Path

RECORD_HEADER = struct.Struct("<4sIIIIHH")  # type, dataSize, flags, formID, vc, version, unknown
GROUP_HEADER = struct.Struct("<4sI4siIHH")  # 'GRUP', size incl. header, label, groupType, stamp, u1, u2
FLAG_COMPRESSED = 0x00040000

# VHGT: one float offset, then 33*33 signed byte deltas, then 3 unused bytes.
VHGT_DIM = 33
# Height deltas and the base offset are stored in units of 8 game units.
HEIGHT_SCALE = 8.0


@dataclass
class Record:
    type: bytes
    flags: int
    form_id: int
    data: bytes

    def subrecords(self):
        """Yield (type, payload) pairs; handles XXXX extended sizes."""
        data = self.data
        pos = 0
        extended_size = None
        while pos + 6 <= len(data):
            stype = data[pos : pos + 4]
            ssize = struct.unpack_from("<H", data, pos + 4)[0]
            pos += 6
            if stype == b"XXXX":
                extended_size = struct.unpack_from("<I", data, pos)[0]
                pos += ssize
                continue
            if extended_size is not None:
                ssize = extended_size
                extended_size = None
            yield stype, data[pos : pos + ssize]
            pos += ssize


def _record_at(buf: bytes, pos: int) -> tuple[Record, int]:
    rtype, dsize, flags, form_id, _vc, _ver, _u = RECORD_HEADER.unpack_from(buf, pos)
    body = buf[pos + RECORD_HEADER.size : pos + RECORD_HEADER.size + dsize]
    if flags & FLAG_COMPRESSED:
        # First u32 is the decompressed size; the rest is a zlib stream.
        body = zlib.decompress(body[4:])
    return Record(rtype, flags, form_id, body), pos + RECORD_HEADER.size + dsize


def iter_records(buf: bytes, start: int, end: int):
    """Depth-first walk over records in buf[start:end], descending into GRUPs."""
    pos = start
    while pos < end:
        head = buf[pos : pos + 4]
        if head == b"GRUP":
            gsize = struct.unpack_from("<I", buf, pos + 4)[0]
            yield from iter_records(buf, pos + GROUP_HEADER.size, pos + gsize)
            pos += gsize
        else:
            record, pos = _record_at(buf, pos)
            yield record


def decode_vhgt(payload: bytes) -> tuple[float, list[list[float]]]:
    """Decode a VHGT payload to (base_offset, 33x33 heights) in game units.

    Column 0 of each row offsets the running row start from the previous row;
    other columns accumulate along the row.
    """
    offset = struct.unpack_from("<f", payload, 0)[0]
    deltas = struct.unpack_from(f"<{VHGT_DIM * VHGT_DIM}b", payload, 4)
    heights: list[list[float]] = []
    row_start = 0.0
    for r in range(VHGT_DIM):
        row: list[float] = []
        acc = 0.0
        for c in range(VHGT_DIM):
            v = deltas[r * VHGT_DIM + c]
            if c == 0:
                row_start += v
                acc = row_start
            else:
                acc += v
            row.append((offset + acc) * HEIGHT_SCALE)
        heights.append(row)
    return offset * HEIGHT_SCALE, heights


def extract_land_cells(path: Path) -> dict[tuple[int, int], list[list[float]]]:
    """Map (cellX, cellY) -> 33x33 heightfield in game units for every LAND
    record in the plugin. Assumes one worldspace of interest per plugin (true
    for the Tamriel Worldspaces files)."""
    buf = Path(path).read_bytes()
    # Skip the TES4 header record, then walk everything.
    _tes4, pos = _record_at(buf, 0)
    cells: dict[tuple[int, int], list[list[float]]] = {}
    current_cell: tuple[int, int] | None = None
    for record in iter_records(buf, pos, len(buf)):
        if record.type == b"CELL":
            current_cell = None
            for stype, payload in record.subrecords():
                if stype == b"XCLC" and len(payload) >= 8:
                    current_cell = struct.unpack_from("<ii", payload, 0)[:2]
                    break
        elif record.type == b"LAND" and current_cell is not None:
            for stype, payload in record.subrecords():
                if stype == b"VHGT":
                    _, heights = decode_vhgt(payload)
                    cells[current_cell] = heights
                    break
    return cells
