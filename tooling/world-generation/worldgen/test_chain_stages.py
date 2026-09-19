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


# ------------------------------------------------- receipts and staleness
# The receipt answers a different question from the stamp book: not "is this
# stage's own work still on disk" but "has anything it READ been rewritten
# since". Each test below fails without the mechanism it names.

def _receipt_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(cs, "RECEIPTS", tmp_path / "receipts")
    return tmp_path / "receipts"


def test_receipt_records_declared_inputs_and_outputs(tmp_path, monkeypatch):
    import json
    from . import chain_contracts as cc
    out = _receipt_dir(tmp_path, monkeypatch)
    art = tmp_path / "declared.json"
    art.write_text("{}")
    missing = tmp_path / "gone.json"
    monkeypatch.setitem(cc.READS, "fake_stage", [cc.P(cc.exists, art), cc.P(cc.exists, missing)])
    monkeypatch.setitem(cc.WRITES, "fake_stage", [art])
    path = cs.write_receipt("fake_stage", ran_at="2026-09-19T00:00:00Z")
    doc = json.loads(path.read_text())
    assert path == out / "fake_stage.json"
    assert doc["stage"] == "fake_stage" and doc["ranAt"] == "2026-09-19T00:00:00Z"
    assert doc["inputs"][str(art)] == cs._sha_file(art)
    assert doc["inputs"][str(missing)] is None          # a missing input is null
    assert doc["outputs"][str(art)] == cs._sha_file(art)


def test_check_stale_reports_a_changed_input_and_a_missing_receipt(tmp_path, monkeypatch):
    import json
    from . import chain_contracts as cc
    out = _receipt_dir(tmp_path, monkeypatch)
    out.mkdir(parents=True)
    art = tmp_path / "ground.json"
    art.write_text("the world as it is now")
    monkeypatch.setitem(cc.READS, "fake_stage", [cc.P(cc.exists, art)])
    # a planted receipt whose recorded hash is not the file's
    (out / "fake_stage.json").write_text(json.dumps(
        {"stage": "fake_stage", "ranAt": "2026-09-18T09:00:00Z",
         "inputs": {str(art): "0" * 64}, "outputs": {}}))
    findings = cs.stale_findings(["fake_stage"])
    assert findings == [f"STALE fake_stage: {cc._short(art)} changed since 2026-09-18T09:00:00Z"]
    # correct hashes: nothing to report
    cs.write_receipt("fake_stage")
    assert cs.stale_findings(["fake_stage"]) == []
    # no receipt at all
    assert cs.stale_findings(["never_ran"]) == ["MISSING RECEIPT never_ran"]


def test_check_stale_exits_1_on_a_finding(tmp_path, monkeypatch):
    import json
    import pytest
    out = _receipt_dir(tmp_path, monkeypatch)
    out.mkdir(parents=True)
    art = tmp_path / "ground.json"
    art.write_text("moved")
    monkeypatch.setattr(cs, "stale_findings",
                        lambda stages=None: [f"STALE s: {art} changed since then"])
    with pytest.raises(SystemExit) as exit_info:
        cs.main(["--check-stale"])
    assert exit_info.value.code == 1
    monkeypatch.setattr(cs, "stale_findings", lambda stages=None: [])
    cs.main(["--check-stale"])          # OK, no exit


def test_a_real_run_writes_a_receipt(tmp_path, monkeypatch):
    """The receipt is written by `run`, not by the caller: a stage that ran and
    left no receipt would be invisible to `--check-stale` for ever."""
    import json
    from . import chain_contracts as cc
    out = _receipt_dir(tmp_path, monkeypatch)
    monkeypatch.setattr(cs, "STAMPS", tmp_path / "chain-stamps.json")
    art = tmp_path / "read-by-the-stage.json"
    art.write_text("{}")
    monkeypatch.setitem(cc.READS, "verify_freeze", [cc.P(cc.exists, art)])
    monkeypatch.setattr(cs, "runpy", type("R", (), {"run_module": staticmethod(
        lambda *a, **k: None)})())
    cs.run("99-verify_freeze", "verify_freeze", [], force=True)
    doc = json.loads((out / "verify_freeze.json").read_text())
    assert doc["inputs"][str(art)] == cs._sha_file(art)


def test_check_stale_leaves_the_frozen_stages_to_verify_freeze():
    """The rungs above the gate and the once-compiled water are inputs checked
    by hash (0066), never stages this gate judges."""
    from . import chain_contracts as cc
    judged = set(cc.delivered_stages())
    assert not judged & set(cc.ABOVE_GATE)
    assert "compile_water" not in judged and not judged & set(cc.NEVER_RUN)
    assert "terrain_request_postconditions" in judged      # below the gate, 16c row
    # a frozen stage with no receipt is not a finding, because it is not judged
    frozen = set(cc.ABOVE_GATE) | set(cc.NEVER_RUN)
    assert not [f for f in cs.stale_findings() if f.split()[-1] in frozen]


def test_seed_receipts_fills_only_what_is_missing(tmp_path, monkeypatch):
    import json
    from . import chain_contracts as cc
    out = _receipt_dir(tmp_path, monkeypatch)
    out.mkdir(parents=True)
    art = tmp_path / "a.json"
    art.write_text("{}")
    monkeypatch.setitem(cc.READS, "already_ran", [cc.P(cc.exists, art)])
    monkeypatch.setitem(cc.READS, "never_ran", [cc.P(cc.exists, art)])
    kept = {"stage": "already_ran", "ranAt": "2026-09-18T09:00:00Z",
            "inputs": {str(art): "0" * 64}, "outputs": {}}
    (out / "already_ran.json").write_text(json.dumps(kept))
    assert cs.seed_receipts(["already_ran", "never_ran"]) == ["never_ran"]
    assert json.loads((out / "already_ran.json").read_text()) == kept   # never overwritten
    fresh = json.loads((out / "never_ran.json").read_text())
    assert fresh["seeded"] is True and fresh["ranAt"].startswith("seeded 20")
    assert fresh["inputs"][str(art)] == cs._sha_file(art)
    assert cs.seed_receipts(["already_ran", "never_ran"]) == []
