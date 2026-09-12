"""The frozen-base record (Phase 16b): a stage refuses to replace a recorded
array with different content unless the re-freeze is deliberate."""

from __future__ import annotations

import numpy as np
import pytest

from . import freeze


@pytest.fixture
def record(tmp_path, monkeypatch):
    monkeypatch.setattr(freeze, "FREEZE_PATH", tmp_path / "freeze.json")
    monkeypatch.delenv(freeze.ENV_REFREEZE, raising=False)
    return tmp_path


def test_first_write_records_and_a_rewrite_of_the_same_bytes_passes(record):
    a = np.arange(12, dtype=np.float32).reshape(3, 4)
    sha = freeze.save_frozen(record / "a.npy", a, "a.npy", "test", "2026-09-11")
    assert freeze.recorded("a.npy") == sha
    assert freeze.save_frozen(record / "a.npy", a.copy(), "a.npy", "test", "2026-09-11") == sha


def test_different_content_is_refused_without_the_flag(record, monkeypatch):
    a = np.arange(12, dtype=np.float32).reshape(3, 4)
    freeze.save_frozen(record / "a.npy", a, "a.npy", "test", "2026-09-11")
    b = a + 1.0
    with pytest.raises(freeze.FrozenError):
        freeze.save_frozen(record / "a.npy", b, "a.npy", "test", "2026-09-11")
    assert np.array_equal(np.load(record / "a.npy"), a), "the refused write must not touch the file"
    monkeypatch.setenv(freeze.ENV_REFREEZE, "1")
    sha_b = freeze.save_frozen(record / "a.npy", b, "a.npy", "test", "2026-09-12")
    assert freeze.recorded("a.npy") == sha_b
    assert np.array_equal(np.load(record / "a.npy"), b)


def test_the_committed_record_names_the_three_frozen_arrays():
    doc = freeze.load()
    for name in (freeze.SCULPT, freeze.SHAPED, freeze.FROZEN):
        assert name in doc["frozen"], f"{name} is not recorded in {freeze.FREEZE_PATH}"
        assert len(doc["frozen"][name]["sha256"]) == 64
