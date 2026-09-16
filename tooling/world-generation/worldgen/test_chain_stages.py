"""The chain's skip decision: what it watches, and what it must ignore."""

from __future__ import annotations

from . import chain_stages as cs


def test_module_closure_follows_relative_imports():
    water = {path.name for path in cs.module_closure("compile_water")}
    assert "compile_water.py" in water
    assert "compile_chunks.py" in water          # `from .compile_chunks import ...`
    # A water-only edit must not make the sculpt look stale.
    assert "compile_water.py" not in {path.name for path in cs.module_closure("sculpt_province")}
    assert "sculpt.py" in {path.name for path in cs.module_closure("sculpt_province")}


def test_code_change_makes_a_stage_stale():
    stamp = {"code": "abc", "inputs": {}, "outputs": {}}
    assert cs.is_fresh(stamp, "abc")
    assert not cs.is_fresh(stamp, "def")
    assert not cs.is_fresh({}, "abc")


def test_a_file_a_later_stage_rewrites_is_not_held_against_the_stage(tmp_path):
    """The chain has feedback edges — `sculpt_province` reads the routes that
    `solve_major_routes` later rewrites. Holding the sculpt to that file would
    rebuild the whole province on every run."""
    fed_back = tmp_path / "routes.json"
    fed_back.write_text("changed since the sculpt read it")
    stamp = {"code": "c", "inputs": {str(fed_back): "the-old-hash"}, "outputs": {}}
    written_by = {str(fed_back): 3}          # solve_major_routes, two stages later
    assert cs.is_fresh(stamp, "c", at=1, written_by=written_by)
    # The same file owned by an EARLIER stage is a real dependency.
    assert not cs.is_fresh(stamp, "c", at=4, written_by=written_by)


def test_last_writers_takes_the_latest_stage(tmp_path):
    book = {
        "02-refine_province": {"outputs": {"/x/height.npy": "a"}},
        "07-grade_routes": {"outputs": {"/x/height.npy": "b"}},
    }
    assert cs.last_writers(book) == {"/x/height.npy": 7}


def test_adopt_stamps_the_current_files_without_running(tmp_path, monkeypatch):
    """`adopt` copies a stage's file list from its latest earlier stamp and
    re-hashes every path at its CURRENT content (owner 2026-09-16: accepted
    outputs are recorded, never rebuilt). A stage never stamped cannot be
    adopted."""
    import json
    import pytest
    art = tmp_path / "roads.json"
    art.write_text("accepted on disk")
    book = {"06-grade_routes": {"stage": "grade_routes", "code": "old",
                                "inputs": {}, "outputs": {str(art): "stale-hash"}}}
    stamps = tmp_path / "chain-stamps.json"
    stamps.write_text(json.dumps(book))
    monkeypatch.setattr(cs, "STAMPS", stamps)
    entry = cs.adopt("12-grade_routes", "grade_routes")
    assert entry["outputs"][str(art)] == cs._sha_file(art)
    assert entry["adopted"]["from"] == "06-grade_routes"
    assert entry["code"] == cs._sha_sources(cs.module_closure("grade_routes"))
    assert cs.is_fresh(json.loads(stamps.read_text())["12-grade_routes"], entry["code"], 12, {})
    with pytest.raises(SystemExit):
        cs.adopt("11-solve_major_routes", "never_ran")
