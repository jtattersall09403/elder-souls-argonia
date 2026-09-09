"""The incremental chain's promise: a fast run equals a full run, byte for byte.

The province comparison is done by hand once (see the report in
docs/research/world-terrain/); these are the tests that keep it true, on a
terrain small enough to run both paths in a second.
"""

from __future__ import annotations

import json

import numpy as np
import pytest

from . import compile_chunks, footprint as fp


# ------------------------------------------------------------ the box maths

def test_union_is_widening_not_merging():
    a = [(0, 4, 0, 4)]
    b = [(2, 6, 2, 6)]
    assert fp.union(a, b) == [(0, 4, 0, 4), (2, 6, 2, 6)]
    assert fp.cells(fp.union(a, b), (8, 8)) == 4 * 4 + 4 * 4 - 2 * 2


def test_empty_and_duplicate_boxes_are_dropped():
    assert fp.normalise([(3, 3, 0, 9), (0, 2, 0, 2), (0, 2, 0, 2)]) == [(0, 2, 0, 2)]


def test_chunks_include_the_neighbour_that_duplicates_the_edge():
    """A chunk's grid runs to cy*C INCLUSIVE, so a cell on the boundary
    belongs to two chunks. Missing that ships one stale seam per edit."""
    assert fp.chunks([(256, 257, 256, 257)], 256) == {(0, 0), (0, 1), (1, 0), (1, 1)}
    assert fp.chunks([(300, 320, 300, 320)], 256) == {(1, 1)}
    assert fp.chunks([(0, 4, 0, 4)], 256) == {(0, 0)}


def test_changed_boxes_measures_what_moved():
    old = np.zeros((40, 40), dtype=np.float32)
    new = old.copy()
    new[5:9, 12:15] = 1.0
    new[30, 31] = 2.0
    assert fp.changed_boxes(new, old) == [(5, 9, 12, 15), (30, 31, 31, 32)]
    assert fp.changed_boxes(new, new) == []


def test_changed_boxes_without_a_snapshot_is_not_a_measurement():
    """`None` means "unknown", and the caller must then redo everything.
    An absent measurement is not evidence of no change."""
    assert fp.changed_boxes(np.zeros((4, 4)), None) is None
    assert fp.changed_boxes(np.zeros((4, 4)), np.zeros((5, 5))) is None


def test_boxes_collapse_to_one_bound_past_the_component_cap():
    old = np.zeros((60, 60), dtype=np.float32)
    new = old.copy()
    new[::4, ::4] = 1.0
    boxes = fp.changed_boxes(new, old, max_components=8)
    assert boxes == [(0, 57, 0, 57)]


def test_round_trip_on_disk(tmp_path):
    path = tmp_path / "chain-footprint.json"
    fp.save(path, [(1, 2, 3, 4), (1, 2, 3, 4)], grid_shape=(9, 9))
    assert fp.load(path) == [(1, 2, 3, 4)]
    assert json.loads(path.read_text())["gridShape"] == [9, 9]
    assert fp.load_or_none(tmp_path / "absent.json") is None


def test_a_footprint_from_another_schema_is_refused(tmp_path):
    path = tmp_path / "f.json"
    path.write_text(json.dumps({"schemaVersion": 99, "sampleBoxes": []}))
    with pytest.raises(ValueError):
        fp.load(path)


# ------------------------------------------- the local carve reports its own

def test_carve_line_reports_the_ground_it_could_have_touched():
    from . import authored_waterways as aw
    h = np.zeros((60, 60), dtype=np.float32)
    samples = np.stack([np.full(10, 30.0), np.arange(20.0, 30.0)], axis=1)
    h, cut, window = aw.carve_line(h, samples, -2.0, mpp=1.0)
    y0, y1, x0, x1 = window
    assert cut > 0
    moved = np.nonzero(h < 0)
    assert y0 <= moved[0].min() and moved[0].max() < y1
    assert x0 <= moved[1].min() and moved[1].max() < x1


def test_dredge_reports_its_window():
    from . import dock_dredge as dd
    h = np.full((80, 80), -0.2, dtype=np.float32)
    level = np.full((80, 80), 0.4, dtype=np.float32)
    row = {"placeId": "p", "dockId": "d", "hullClass": "canoe", "needM": 1.2,
           "routeId": "r", "berthM": (20.0, 40.0),
           "pointsM": [(20.0, 40.0), (60.0, 40.0)]}
    _, stats = dd.dredge_docks(h, level, mpp=1.0, promises=[row])
    assert stats[0]["status"] == "dredged"
    assert len(stats[0]["window"]) == 4


# ------------------------------------ chunks: incremental == whole province

def _compile(tmp_path, heights, monkeypatch, footprint_path=None):
    """Run the chunk compiler over `heights`, incrementally or not."""
    height_path = tmp_path / "refined-height-f32.npy"
    np.save(height_path, heights)
    meta = tmp_path / "meta.json"
    meta.write_text(json.dumps({"originM": [0.0, 0.0]}))
    monkeypatch.setattr(compile_chunks, "META_PATH", meta)
    argv = ["compile_chunks", str(height_path)]
    if footprint_path is not None:
        argv += ["--footprint", str(footprint_path)]
    monkeypatch.setattr(compile_chunks.sys, "argv", argv)
    compile_chunks.main()
    return tmp_path / "chunks"


# The compiler's own bookkeeping — what it last cut, and which tiles it just
# rewrote — is not part of the province it publishes, so it is not part of the
# comparison. Everything else, chunk grids and manifest, must match exactly.
BOOKKEEPING = {"compiled-height-f32.npy", "chunks-changed.json"}


def _snapshot(directory):
    return {path.name: path.read_bytes()
            for path in sorted(directory.iterdir())
            if path.name not in BOOKKEEPING}


def test_incremental_chunks_are_byte_identical_to_a_full_compile(tmp_path, monkeypatch):
    rng = np.random.default_rng(7)
    base = rng.standard_normal((600, 600)).astype(np.float32)

    # a "full run" on the edited ground, kept aside
    edited = base.copy()
    edited[300:312, 290:340] -= 3.0          # one local carve, one corner of one chunk
    full_dir = tmp_path / "full"
    full_dir.mkdir()
    _compile(full_dir, edited, monkeypatch)
    expected = _snapshot(full_dir / "chunks")

    # the same edit through the fast path: compile the unedited ground first,
    # then re-compile with only the footprint of the edit
    fast_dir = tmp_path / "fast"
    fast_dir.mkdir()
    _compile(fast_dir, base, monkeypatch)
    footprint_path = fast_dir / "chain-footprint.json"
    fp.save(footprint_path, [(300, 312, 290, 340)], grid_shape=base.shape)
    _compile(fast_dir, edited, monkeypatch, footprint_path)

    assert _snapshot(fast_dir / "chunks") == expected
    # and it really was incremental: 600 samples is a 3x3 grid of chunks, and
    # the edit sits inside one of them
    changed = json.loads((fast_dir / "chunks" / "chunks-changed.json").read_text())
    assert changed["chunks"] == ["1_1"]


def test_a_footprint_that_under_reports_is_widened_not_believed(tmp_path, monkeypatch):
    """The footprint is a claim; the heights are the evidence. A claim that
    misses half the edit must not ship a stale tile."""
    rng = np.random.default_rng(11)
    base = rng.standard_normal((600, 600)).astype(np.float32)
    edited = base.copy()
    edited[300:312, 290:340] -= 3.0
    edited[80:90, 80:90] += 5.0              # NOT in the footprint below

    full_dir = tmp_path / "full"
    full_dir.mkdir()
    _compile(full_dir, edited, monkeypatch)
    expected = _snapshot(full_dir / "chunks")

    fast_dir = tmp_path / "fast"
    fast_dir.mkdir()
    _compile(fast_dir, base, monkeypatch)
    footprint_path = fast_dir / "chain-footprint.json"
    fp.save(footprint_path, [(300, 312, 290, 340)], grid_shape=base.shape)
    _compile(fast_dir, edited, monkeypatch, footprint_path)

    assert _snapshot(fast_dir / "chunks") == expected
    changed = json.loads((fast_dir / "chunks" / "chunks-changed.json").read_text())
    assert changed["chunks"] == ["0_0", "1_1"]


def test_without_a_snapshot_the_footprint_path_compiles_everything(tmp_path, monkeypatch):
    """First incremental run in a tree that has chunks but no record of the
    heights they came from: nothing can be measured, so nothing is skipped."""
    base = np.zeros((600, 600), dtype=np.float32)
    work = tmp_path / "w"
    work.mkdir()
    _compile(work, base, monkeypatch)
    (work / "chunks" / "compiled-height-f32.npy").unlink()
    footprint_path = work / "chain-footprint.json"
    fp.save(footprint_path, [(0, 4, 0, 4)], grid_shape=base.shape)
    _compile(work, base, monkeypatch, footprint_path)
    changed = json.loads((work / "chunks" / "chunks-changed.json").read_text())
    assert len(changed["chunks"]) == 9


# ------------------------------------------------- the fast path's own guard

def test_recarve_refuses_when_the_ground_upstream_moved():
    from .recarve_local import NotApplicable, check_upstream_unchanged
    prelocal = np.zeros((50, 50), dtype=np.float32)
    ungraded = prelocal.copy()
    ungraded[10:14, 10:20] = -2.0                     # the last run's carve
    check_upstream_unchanged(prelocal, ungraded, [(10, 14, 10, 20)])
    ungraded[40, 40] = 0.5                            # something upstream moved
    with pytest.raises(NotApplicable):
        check_upstream_unchanged(prelocal, ungraded, [(10, 14, 10, 20)])


def test_recarve_refuses_a_snapshot_of_a_different_province():
    from .recarve_local import NotApplicable, check_upstream_unchanged
    with pytest.raises(NotApplicable):
        check_upstream_unchanged(np.zeros((10, 10), dtype=np.float32),
                                 np.zeros((12, 12), dtype=np.float32), [])
