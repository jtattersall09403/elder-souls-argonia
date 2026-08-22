import struct

from .esp import VHGT_DIM, Record, decode_vhgt


def _vhgt_payload(offset: float, deltas: list[int]) -> bytes:
    assert len(deltas) == VHGT_DIM * VHGT_DIM
    return struct.pack("<f", offset) + struct.pack(f"<{len(deltas)}b", *deltas) + b"\x00\x00\x00"


def test_decode_vhgt_flat():
    _, heights = decode_vhgt(_vhgt_payload(10.0, [0] * VHGT_DIM * VHGT_DIM))
    assert all(h == 80.0 for row in heights for h in row)  # 10 * scale 8


def test_decode_vhgt_row_and_column_accumulation():
    deltas = [0] * (VHGT_DIM * VHGT_DIM)
    deltas[1] = 2          # row 0, col 1: +2 along the row
    deltas[VHGT_DIM] = 3   # row 1, col 0: row start shifts +3
    _, heights = decode_vhgt(_vhgt_payload(0.0, deltas))
    assert heights[0][0] == 0.0
    assert heights[0][1] == 16.0          # 2 * 8
    assert heights[0][2] == 16.0          # carries along the row
    assert heights[1][0] == 24.0          # 3 * 8
    assert heights[2][0] == 24.0          # row starts carry down rows


def test_subrecords_with_extended_size():
    big = b"\xab" * 70000
    data = (
        b"XCLC" + struct.pack("<H", 8) + struct.pack("<ii", -3, 7)
        + b"XXXX" + struct.pack("<H", 4) + struct.pack("<I", len(big))
        + b"VHGT" + struct.pack("<H", 0) + big
    )
    record = Record(b"LAND", 0, 0, data)
    subs = list(record.subrecords())
    assert subs[0] == (b"XCLC", struct.pack("<ii", -3, 7))
    assert subs[1][0] == b"VHGT" and len(subs[1][1]) == len(big)
