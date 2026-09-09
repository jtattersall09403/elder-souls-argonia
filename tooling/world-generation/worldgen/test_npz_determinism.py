"""A rewritten-but-unchanged `.npz` must be byte-identical.

A zip entry carries a wall-clock stamp, and numpy used to write the real clock
into it: every pass file then differed on every run, the chain re-ran stages
whose inputs had not moved, and the "byte-identical to a full run" acceptance
test could never be met. numpy 2.4.6 pins it, but that is numpy's choice and
not a contract; `worldgen.npz_io.savez` pins it here. This is the guard.
"""

from __future__ import annotations

import hashlib
import time

import numpy as np

from .npz_io import FIXED_DATE_TIME, savez


def _sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def test_rewriting_the_same_arrays_is_byte_identical(tmp_path):
    arrays = {"a": np.arange(64, dtype=np.float32).reshape(8, 8),
              "b": np.zeros(16, dtype=bool)}
    first = savez(tmp_path / "pass.npz", **arrays)
    before = _sha(first)
    time.sleep(2.2)          # zip timestamps have 2 s resolution
    second = savez(tmp_path / "pass.npz", **arrays)
    assert _sha(second) == before


def test_the_stamp_is_pinned_whatever_numpy_does(tmp_path):
    """The property under the byte-identity: no entry carries a real clock.

    This is what stops the test above passing for the wrong reason if a future
    numpy goes back to writing wall-clock stamps.
    """
    import zipfile
    path = savez(tmp_path / "pass.npz", a=np.arange(4))
    with zipfile.ZipFile(path) as z:
        assert {i.date_time for i in z.infolist()} == {FIXED_DATE_TIME}


def test_the_arrays_survive_the_rewrite(tmp_path):
    arrays = {"a": np.arange(9, dtype=np.int32), "b": np.array([True, False])}
    path = savez(tmp_path / "pass.npz", **arrays)
    with np.load(path) as z:
        assert set(z.files) == {"a", "b"}
        for key, value in arrays.items():
            assert np.array_equal(z[key], value)


def test_uncompressed_mode_round_trips(tmp_path):
    a = np.arange(4, dtype=np.float64)
    path = savez(tmp_path / "u.npz", compressed=False, a=a)
    with np.load(path) as z:
        assert np.array_equal(z["a"], a)
