"""LAND normals decode lazily and vectorised, equal to the per-byte decode
(tool-speed review S3a / D1: the mount miner never reads normals)."""
import random

from .esp_index import LAND_DIM, LandData, decode_normals, decode_normals_scalar

CELL_BYTES = LAND_DIM * LAND_DIM * 3


def test_numpy_decode_equals_the_scalar_decode_on_1000_cells():
    rng = random.Random(1102)
    cells = [bytes([0x80, 0x7F, 0x00, 0xFF, 0x01] + [0] * (CELL_BYTES - 5))]
    cells += [bytes(rng.getrandbits(8) for _ in range(CELL_BYTES)) for _ in range(999)]
    for payload in cells:
        assert decode_normals(payload) == decode_normals_scalar(payload)
    got = decode_normals(cells[0])
    assert got[0][0] == (-128 / 127.0, 1.0, 0.0) and isinstance(got[0][0], tuple)


def test_normals_decode_on_first_read_only():
    flat = bytes([0, 0, 127] * LAND_DIM * LAND_DIM)
    land = LandData(vnml=flat)
    assert land._normals is None
    assert land.normals[LAND_DIM - 1][LAND_DIM - 1] == (0.0, 0.0, 1.0)
    assert land._normals is not None and land.normals is land._normals
    assert LandData().normals is None
