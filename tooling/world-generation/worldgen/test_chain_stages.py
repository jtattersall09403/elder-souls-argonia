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
    `reroute_majors` later rewrites. Holding the sculpt to that file would
    rebuild the whole province on every run."""
    fed_back = tmp_path / "routes.json"
    fed_back.write_text("changed since the sculpt read it")
    stamp = {"code": "c", "inputs": {str(fed_back): "the-old-hash"}, "outputs": {}}
    written_by = {str(fed_back): 3}          # reroute_majors, two stages later
    assert cs.is_fresh(stamp, "c", at=1, written_by=written_by)
    # The same file owned by an EARLIER stage is a real dependency.
    assert not cs.is_fresh(stamp, "c", at=4, written_by=written_by)


def test_last_writers_takes_the_latest_stage(tmp_path):
    book = {
        "02-refine_province": {"outputs": {"/x/height.npy": "a"}},
        "07-grade_routes": {"outputs": {"/x/height.npy": "b"}},
    }
    assert cs.last_writers(book) == {"/x/height.npy": 7}
