"""The test-reads map (lane 3A E): the conftest's recorder and the
selector's use of it."""
from __future__ import annotations

import importlib.util
import json
import os
import sys

from . import conftest as ct

SELECT = ct._REPO / "tooling/world-generation/scripts/select_tests.py"
ME = "tooling/world-generation/worldgen/test_test_reads_map.py"


def _select():
    spec = importlib.util.spec_from_file_location("select_tests_reads", SELECT)
    module = importlib.util.module_from_spec(spec)
    sys.modules["select_tests_reads"] = module
    spec.loader.exec_module(module)
    return module


def test_only_repo_data_files_are_data():
    repo = ct._REPO
    assert ct._data_rel(repo / "world/sources/x.json") == "world/sources/x.json"
    assert ct._data_rel(str(repo / "apps/world-studio/public/kits/a.kit.json")) == "apps/world-studio/public/kits/a.kit.json"
    assert ct._data_rel(repo / "tooling/asset-pipeline/output/k.glb") == "tooling/asset-pipeline/output/k.glb"
    for not_data in (repo / "world/x.py", repo / "docs/a.md", repo / "tooling/world-generation/worldgen/a.json",
                     "/etc/passwd", 3, ct._READS_FILE):
        assert ct._data_rel(not_data) is None, not_data


def test_recorder_keeps_reads_per_test_file_and_marks_spawns():
    rec = ct._ReadRecorder()
    rec.enter(ct._REPO / ME)
    rec.audit("open", (str(ct._REPO / "world/a.json"), "r", 0))
    rec.audit("open", (str(ct._REPO / "world/w.json"), "w", 0))              # a write is not a read
    rec.audit("open", (str(ct._REPO / "world/o.json"), None, os.O_WRONLY | os.O_CREAT))
    rec.audit("open", (str(ct._REPO / "world/r.json"), None, os.O_RDONLY))
    row = rec.rows()[ME]
    assert (row["reads"], row["isolated"], row["spawns"], row["passed"]) == (["world/a.json", "world/r.json"], True, False, True)
    assert rec.rows(passed=False)[ME]["passed"] is False and row["recordedAt"] == round(rec.recorded_at, 3)
    rec.audit("subprocess.Popen", ("python3", [], None, None))
    assert rec.rows()[ME]["spawns"] is True
    rec.enter(ct._REPO / "tooling/world-generation/worldgen/test_layout_template.py")
    assert not any(r["isolated"] for r in rec.rows().values())
    rec.active = False
    rec.audit("open", (str(ct._REPO / "world/late.json"), "r", 0))
    assert "world/late.json" not in rec.rows()[ME]["reads"]


def test_merge_replaces_rows_and_writes_sorted(tmp_path, monkeypatch):
    monkeypatch.setenv("ES_JOB_LOCK_DIR", str(tmp_path / "locks"))
    target = tmp_path / "test-reads.json"
    ct._merge_reads({"b": {"reads": ["x"], "isolated": True, "spawns": False}}, target)
    ct._merge_reads({"a": {"reads": ["y"], "isolated": True, "spawns": False},
                     "b": {"reads": ["z"], "isolated": True, "spawns": False}}, target)
    doc = json.loads(target.read_text())
    assert doc["schemaVersion"] == 1 and list(doc["tests"]) == ["a", "b"] and doc["tests"]["b"]["reads"] == ["z"]


def _row(reads, **more):
    return {"reads": reads, "isolated": True, "spawns": False, "passed": True, "recordedAt": 4e9, **more}


def test_selector_reads_only_complete_rows(tmp_path):
    st = _select()
    tests = st.suite_tests("placement")
    rows = {t: _row([]) for t in tests}
    rows[tests[0]] = _row(["world/sources/d.json"])
    rows[tests[1]] = _row(["world/sources/d.json"], isolated=False)
    rows[tests[2]] = _row(["world/sources/d.json"], spawns=True)
    rows[tests[3]] = _row(["tooling/world-generation/output/survey-cache/a.npy"])
    rows[tests[4]] = _row(["world/sources/d.json"], passed=False)          # a red recording run
    del rows[tests[5]]["recordedAt"]
    path = tmp_path / "test-reads.json"
    path.write_text(json.dumps({"schemaVersion": 1, "tests": rows}))
    got = st.reads_map("placement", path)
    assert got[tests[0]] == ({"world/sources/d.json"}, 4e9)
    assert not {tests[1], tests[2], tests[3], tests[4], tests[5]} & set(got)


DATA = "world/sources/placement/nobody-names-this.json"
TARGET = "tooling/world-generation/worldgen/test_layout_template.py"


def test_a_fresh_row_adds_the_test_that_opened_the_file(monkeypatch):
    st = _select()
    assert TARGET not in st.select_changed("placement", [DATA], use_reads_map=False)["selected"]
    monkeypatch.setattr(st, "reads_map", lambda suite: {TARGET: ({DATA}, 4e9)})
    got = st.select_changed("placement", [DATA])
    assert TARGET in got["selected"] and "test-reads map" in got["reasons"][TARGET]
    code = st.select_changed("placement", ["tooling/world-generation/worldgen/layout_template.py"])
    assert TARGET in code["selected"]                                  # code: import closure


def test_a_row_older_than_the_test_or_a_module_it_imports_is_not_used(monkeypatch):
    st = _select()
    module = st.REPO / "tooling/world-generation/worldgen/layout_template.py"
    recorded = module.stat().st_mtime - 1                              # the module changed after THIS row
    monkeypatch.setattr(st, "reads_map", lambda suite: {TARGET: ({DATA}, recorded)})
    assert TARGET not in st.select_changed("placement", [DATA])["selected"]


def test_data_selects_by_the_map_only_never_by_the_literal_rule(monkeypatch):
    """Decision 0106: the literal rule selected ~90 % of placement for any
    record; a data file now selects only the tests whose row opened it (the
    full --runner run before merge is the backstop for a file no row lists)."""
    st = _select()
    new_layout = "world/sources/blueprints/new-place.layout.json"       # created after the recording
    monkeypatch.setattr(st, "reads_map", lambda suite: {TARGET: (set(), 4e9)})
    assert st.select_changed("placement", [new_layout])["selected"] == []
    monkeypatch.setattr(st, "reads_map", lambda suite: {TARGET: ({new_layout}, 4e9)})
    assert st.select_changed("placement", [new_layout])["selected"] == [TARGET]


def test_prose_readmes_and_reports_select_nothing_and_never_the_whole_suite():
    st = _select()
    for suite in ("placement", "workbench"):
        got = st.select_changed(suite, ["tooling/world-generation/README.md",
                                        "tooling/placement-workbench/README.md",
                                        "docs/decisions/0106-x.md",
                                        "tooling/.reports/16k/walk3/brief-L21.md"])
        assert got["selected"] == [] and not got["all"], suite
    # an unread non-.py file in the suite's own folder no longer selects the whole suite
    unread = "tooling/world-generation/worldgen/testdata/" + "nobody-" + "reads.json"  # no literal here
    got = st.select_changed("placement", [unread])
    assert not got["all"] and len(got["selected"]) < 5     # only tests that walk that folder


def test_a_red_recording_run_writes_a_row_the_selector_ignores(tmp_path, monkeypatch):
    monkeypatch.setenv("ES_JOB_LOCK_DIR", str(tmp_path / "locks"))
    rec = ct._ReadRecorder()
    rec.enter(ct._REPO / ME)
    target = tmp_path / "test-reads.json"
    ct._merge_reads(rec.rows(passed=False), target)
    assert ME not in _select().reads_map("placement", target)
