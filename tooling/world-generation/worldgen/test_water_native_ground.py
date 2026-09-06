import gzip
import hashlib
import struct

import numpy as np
import pytest

from .test_water_terrain_lod import fixture
from .water_native_ground import export_native_ground
from .water_terrain_lod import decode_native


def test_native_ground_exact_source_png_delta_and_flip_encoding(tmp_path):
    province, mask, chunk, overlay = fixture(tmp_path)
    a = export_native_ground(province, mask, province / "water/v2", tmp_path / "a")
    b = export_native_ground(province, mask, province / "water/v2", tmp_path / "b")
    assert a == b
    descriptor = a["descriptor"]
    zipped = (tmp_path / "a" / descriptor["file"]).read_bytes()
    assert zipped == (tmp_path / "b" / descriptor["file"]).read_bytes()
    blob = gzip.decompress(zipped)
    assert len(blob) == descriptor["bytes"] and len(zipped) == descriptor["downloadBytes"]
    assert hashlib.sha256(blob).hexdigest() == descriptor["sha256"]
    assert blob[:8] == b"ESWGRND1"
    version, grid, tile, count, flips, zero, mpp, chunk_cells, reserved = struct.unpack_from("<6Id2I", blob, 8)
    assert (version, grid, tile, count, flips, zero, mpp, chunk_cells, reserved) == (1, 9, 8, 1, 1, 0, 1.5, 8, 0)
    assert struct.unpack_from("<I", blob, 48)[0] == 28
    heights = np.frombuffer(blob, "<f4", 81, 56).reshape(9, 9)
    assert np.array_equal(heights, decode_native(province, chunk, 8, overlay))


def test_sparse_ground_rejects_wrong_mask_and_does_not_write_source(tmp_path):
    province, mask, _, _ = fixture(tmp_path)
    original = (province / "chunks/native.png").read_bytes()
    np.save(mask, np.zeros((8, 8), bool))
    with pytest.raises(ValueError, match="native vertex"):
        export_native_ground(province, mask, province / "water/v2", tmp_path / "bad")
    assert (province / "chunks/native.png").read_bytes() == original
