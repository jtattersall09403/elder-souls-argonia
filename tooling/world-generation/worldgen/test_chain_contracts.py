"""The pre-run contract pass: the validators, the stamp cross-check, the CLI,
and the rule that no below-gate stage may go undeclared.

Everything here is built in tmp_path. The pass's value is that it fails on a
planted defect, so each test plants one.
"""

from __future__ import annotations

import hashlib
import json
import re
from functools import partial
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from worldgen import chain_contracts as cc

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "terrain-chain.sh"


def _json(path: Path, doc) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(doc), encoding="utf-8")
    return path


# ------------------------------------------------------------- validators

def test_json_doc_names_the_missing_field(tmp_path):
    p = _json(tmp_path / "meta.json", {"schemaVersion": 3, "surface": {}})
    assert cc.json_doc(p, ("surface",), 3, stage="s") == []
    out = cc.json_doc(p, ("surface", "klass", "season"), 3, stage="s")
    assert len(out) == 1
    assert out[0].startswith("s: ")
    assert "klass, season" in out[0]


def test_json_doc_catches_the_schema_version(tmp_path):
    p = _json(tmp_path / "meta.json", {"schemaVersion": 2})
    out = cc.json_doc(p, (), 3, stage="s")
    assert "schemaVersion is 2" in out[0]


def test_json_doc_missing_and_malformed(tmp_path):
    assert "missing" in cc.json_doc(tmp_path / "gone.json", stage="s")[0]
    bad = tmp_path / "bad.json"
    bad.write_text("{not json", encoding="utf-8")
    assert "unreadable JSON" in cc.json_doc(bad, stage="s")[0]


def test_json_items_names_the_first_five_offenders(tmp_path):
    stations = [{"id": f"station.{i}", "positionM": [1.0, 2.0]} for i in range(3)]
    stations += [{"id": f"deferred.{i}"} for i in range(7)]
    p = _json(tmp_path / "travel-services.json", {"stations": stations})
    out = cc.json_items(p, "stations", ("id", "positionM"), stage="paint")
    assert len(out) == 1
    assert out[0].startswith("paint: ")
    assert "7 of 10 stations have no 'positionM'" in out[0]
    assert "deferred.0" in out[0] and "deferred.4" in out[0]
    assert "(+2 more)" in out[0]
    assert "deferred.5" not in out[0]


def test_json_items_accepts_a_dict_of_items(tmp_path):
    p = _json(tmp_path / "d.json", {"rows": {"a": {"kind": "x"}, "b": {}}})
    out = cc.json_items(p, "rows", ("kind",), stage="s")
    assert "1 of 2 rows have no 'kind'" in out[0] and "b" in out[0]


def test_json_items_missing_key(tmp_path):
    p = _json(tmp_path / "d.json", {"other": []})
    assert "missing top-level field(s): rows" in cc.json_items(p, "rows", stage="s")[0]


def test_npy_shape_and_dtype(tmp_path):
    p = tmp_path / "h.npy"
    np.save(p, np.zeros((4, 3), dtype=np.float64))
    assert cc.npy(p, 2, stage="s") == []
    assert "dtype is float64" in cc.npy(p, 2, "float32", stage="s")[0]
    assert "is not square" in cc.npy(p, 2, square=True, stage="s")[0]
    assert "ndim is 2" in cc.npy(p, 3, stage="s")[0]
    assert "missing" in cc.npy(tmp_path / "gone.npy", stage="s")[0]


def test_npz_missing_array(tmp_path):
    p = tmp_path / "a.npz"
    np.savez(p, sink=np.zeros(2))
    assert cc.npz(p, ("sink",), stage="s") == []
    assert "missing array(s): flow_to" in cc.npz(p, ("sink", "flow_to"), stage="s")[0]


def test_png_size_and_mode(tmp_path):
    p = tmp_path / "x.png"
    Image.new("RGB", (8, 8)).save(p)
    assert cc.png(p, (8, 8), "RGB", stage="s") == []
    assert "size is (8, 8)" in cc.png(p, (16, 16), stage="s")[0]
    assert "mode is RGB" in cc.png(p, mode="RGBA", stage="s")[0]


def test_exists_on_a_directory_family(tmp_path):
    assert cc.exists(tmp_path, stage="s") == []
    assert "missing (directory does not exist)" in cc.exists(tmp_path / "chunks", stage="s")[0]


# ------------------------------------------------------------ sha_binding

def test_sha_binding_catches_the_wrong_array(tmp_path):
    """The 16e trap: an artefact bound to the ground it was NOT made on."""
    natural = tmp_path / "natural.npy"
    graded = tmp_path / "graded.npy"
    np.save(natural, np.arange(9, dtype=np.float32).reshape(3, 3))
    np.save(graded, np.ones((3, 3), dtype=np.float32))
    digest = hashlib.sha256(
        np.ascontiguousarray(np.load(natural).astype(np.float32)).tobytes()).hexdigest()
    meta = _json(tmp_path / "water-meta.json", {"sourceHeightSha256": digest})

    assert cc.sha_binding(meta, "sourceHeightSha256", natural, stage="post") == []
    out = cc.sha_binding(meta, "sourceHeightSha256", graded, stage="post")
    assert len(out) == 1
    assert out[0].startswith("post: ")
    assert "made from a different array" in out[0]


def test_sha_binding_file_digest_and_dotted_field(tmp_path):
    target = tmp_path / "t.bin"
    target.write_bytes(b"hello")
    digest = hashlib.sha256(b"hello").hexdigest()
    meta = _json(tmp_path / "m.json", {"prov": {"sha": digest}})
    assert cc.sha_binding(meta, "prov.sha", target, "file", stage="s") == []
    assert "missing field 'prov.nope'" in cc.sha_binding(meta, "prov.nope", target, "file",
                                                         stage="s")[0]


# ------------------------------------------------------------------ check

def test_stage_without_a_reads_entry_fails(monkeypatch):
    monkeypatch.setattr(cc, "READS", {}, raising=True)
    monkeypatch.setattr(cc, "_stamps", lambda: {})
    out = cc.check(["compile_water"])
    assert out == ["compile_water: declares no reads "
                   "(add a READS entry in worldgen/chain_contracts.py)"]


def test_above_gate_stages_are_exempt(monkeypatch):
    monkeypatch.setattr(cc, "READS", {}, raising=True)
    monkeypatch.setattr(cc, "_stamps", lambda: {})
    assert cc.check(list(cc.ABOVE_GATE)) == []


def test_declared_but_not_opened_is_reported(tmp_path, monkeypatch):
    opened = _json(tmp_path / "opened.json", {"a": 1})
    unopened = _json(tmp_path / "unopened.json", {"a": 1})
    book = {"09-compile_water": {"stage": "compile_water",
                                 "inputs": {str(opened): "x"}, "outputs": {}}}
    monkeypatch.setattr(cc, "READS",
                        {"compile_water": [partial(cc.json_doc, opened),
                                           partial(cc.json_doc, unopened)]}, raising=True)
    monkeypatch.setattr(cc, "_stamps", lambda: book)
    monkeypatch.setattr(cc, "script_stages",
                        lambda path=None: ["sculpt_province", "compile_hydrology",
                                           "compile_society", "shape_province",
                                           "hydrology_graph", "carve_province",
                                           "apply_terrain_patches", "patch_water",
                                           "compile_water"])
    out = cc.check(["compile_water"])
    assert len(out) == 1
    assert out[0].endswith("was not opened on its last stamped run")
    assert "unopened.json" in out[0]


def test_undeclared_source_read_is_a_warning_only(tmp_path, monkeypatch):
    declared = _json(tmp_path / "declared.json", {"a": 1})
    sneaky = cc.SOURCES / "routes" / "does-not-matter.json"
    book = {"09-compile_water": {"stage": "compile_water",
                                 "inputs": {str(declared): "x", str(sneaky): "y"},
                                 "outputs": {}}}
    monkeypatch.setattr(cc, "READS",
                        {"compile_water": [partial(cc.json_doc, declared)]}, raising=True)
    monkeypatch.setattr(cc, "_stamps", lambda: book)
    monkeypatch.setattr(cc, "script_stages",
                        lambda path=None: [f"pad{i}" for i in range(8)] + ["compile_water"])
    out = cc.check(["compile_water"])
    assert all(line.startswith("warn: ") for line in out)
    assert any("does not declare it" in line for line in out)


def test_a_directory_declaration_covers_the_files_under_it(tmp_path, monkeypatch):
    family = cc.SOURCES / "catalogue"
    book = {"01-derive_crossings": {"stage": "derive_crossings",
                                    "inputs": {str(family / "places-x.json"): "h"},
                                    "outputs": {}}}
    monkeypatch.setattr(cc, "READS",
                        {"derive_crossings": [partial(cc.exists, family)]}, raising=True)
    monkeypatch.setattr(cc, "_stamps", lambda: book)
    monkeypatch.setattr(cc, "script_stages", lambda path=None: ["derive_crossings"])
    assert cc.check(["derive_crossings"]) == []


def test_declared_paths_reads_the_partial(tmp_path):
    entry = partial(cc.sha_binding, tmp_path / "m.json", "f", tmp_path / "t.npy")
    assert cc.declared_paths(entry) == [tmp_path / "m.json", tmp_path / "t.npy"]


def test_a_raising_declaration_is_a_mismatch_not_a_crash(monkeypatch):
    def boom(**_kw):
        raise RuntimeError("kaboom")
    monkeypatch.setattr(cc, "READS", {"compile_water": [boom]}, raising=True)
    monkeypatch.setattr(cc, "_stamps", lambda: {})
    out = cc.check(["compile_water"])
    assert out == ["compile_water: declaration raised RuntimeError: kaboom"]


# -------------------------------------------------------------------- CLI

def test_cli_exit_codes(monkeypatch, capsys):
    monkeypatch.setattr(cc, "READS", {"compile_water": []}, raising=True)
    monkeypatch.setattr(cc, "_stamps", lambda: {})
    monkeypatch.setattr(cc, "script_stages", lambda path=None: ["compile_water", "patch_water"])
    assert cc.main(["--stages", "compile_water"]) == 0
    assert "contracts: OK (1 stages" in capsys.readouterr().out
    assert cc.main(["--stages", "patch_water"]) == 1
    out = capsys.readouterr().out
    assert "patch_water: declares no reads" in out
    assert "1 mismatch(es)" in out


def test_cli_stages_defaults_to_chain_enabled(monkeypatch, capsys):
    monkeypatch.setattr(cc, "READS", {"compile_water": []}, raising=True)
    monkeypatch.setattr(cc, "_stamps", lambda: {})
    monkeypatch.setattr(cc, "script_stages", lambda path=None: ["compile_water"])
    monkeypatch.setenv("CHAIN_ENABLED", "compile_water sculpt_province")
    assert cc.main([]) == 0
    assert "contracts: OK (1 stages" in capsys.readouterr().out


def test_cli_warnings_alone_do_not_fail(monkeypatch, capsys):
    monkeypatch.setattr(cc, "check", lambda stages: ["warn: x: opened y but does not declare it"])
    monkeypatch.setattr(cc, "script_stages", lambda path=None: ["compile_water"])
    assert cc.main(["--stages", "compile_water"]) == 0
    assert "warn:" in capsys.readouterr().out


# ------------------------------------------- the script and the dict agree

def test_every_below_gate_stage_in_the_script_declares_its_reads():
    """The script's STAGES is the one place the order lives; a stage added
    there without a READS entry is what this catches (it would otherwise fail
    only at the next chain run)."""
    stages = cc._stage_names_from_script(SCRIPT.read_text(encoding="utf-8"))
    assert len(stages) > 20, "the STAGES=( ... ) block was not parsed"
    missing = [s for s in stages if s not in cc.ABOVE_GATE and s not in cc.READS]
    assert missing == [], f"no READS entry for: {', '.join(missing)}"


def test_above_gate_matches_the_script():
    text = SCRIPT.read_text(encoding="utf-8")
    block = re.search(r"\nABOVE_GATE=\(([^)]*)\)", text)
    assert block, "ABOVE_GATE not found in the script"
    assert tuple(block.group(1).split()) == cc.ABOVE_GATE


def test_no_reads_entry_names_a_stage_the_script_does_not_run():
    stages = set(cc._stage_names_from_script(SCRIPT.read_text(encoding="utf-8")))
    assert not (set(cc.READS) - stages)


def test_the_script_runs_the_pass_after_verify_freeze():
    text = SCRIPT.read_text(encoding="utf-8")
    assert "--check-contracts" in text
    assert "python3 -m worldgen.chain_contracts --stages" in text
    assert text.index("=== verify_freeze ===") < text.index("=== contracts ===")


@pytest.mark.parametrize("stage", sorted(cc.READS))
def test_every_declaration_is_introspectable(stage):
    for entry in cc.READS[stage]:
        if isinstance(entry, cc.glob_read):
            # A glob names a directory and a pattern, not one path: what it
            # declares is read back off `.directory` / `.pattern`.
            assert entry.directory and entry.pattern, f"{stage}: an empty glob declaration"
            continue
        assert cc.declared_paths(entry), f"{stage}: a declaration names no artefact"


# ------------------------------------------------------------ the order gate
# A stage that reads an artefact a LATER stage in the same run rewrites is
# reading the previous run's world, and no amount of re-running one stage
# fixes it. The gate is mechanical: READS against WRITES, in script order.

def _order(monkeypatch, stages, reads, writes):
    monkeypatch.setattr(cc, "script_stages", lambda path=None: list(stages))
    monkeypatch.setattr(cc, "READS", reads)
    monkeypatch.setattr(cc, "WRITES", writes)
    return cc.order_findings(list(stages))


def test_a_later_writer_is_a_finding(monkeypatch, tmp_path):
    target = tmp_path / "routes.json"
    out = _order(monkeypatch, ["reader", "writer"],
                 {"reader": [partial(cc.exists, target)], "writer": []},
                 {"reader": [], "writer": [target]})
    assert len(out) == 1
    assert out[0].startswith("order: reader reads ")
    assert "which writer writes later" in out[0]


def test_an_earlier_writer_is_not_a_finding(monkeypatch, tmp_path):
    target = tmp_path / "routes.json"
    out = _order(monkeypatch, ["writer", "reader"],
                 {"reader": [partial(cc.exists, target)], "writer": []},
                 {"reader": [], "writer": [target]})
    assert out == []


def test_stale_ok_demotes_the_finding_to_a_warning(monkeypatch, tmp_path):
    target = tmp_path / "routes.json"
    out = _order(monkeypatch, ["reader", "writer"],
                 {"reader": [cc.stale_ok(partial(cc.exists, target), reason="on purpose")],
                  "writer": []},
                 {"reader": [], "writer": [target]})
    assert len(out) == 1
    assert out[0].startswith("warn: order: reader reads ")
    assert out[0].endswith("on purpose")
    assert cc.declared_paths(cc.stale_ok(partial(cc.exists, target), reason="r")) == [target]


def test_every_below_gate_stage_declares_its_writes():
    stages = cc._stage_names_from_script(SCRIPT.read_text(encoding="utf-8"))
    missing = [s for s in stages if s not in cc.ABOVE_GATE and s not in cc.WRITES]
    assert missing == [], f"no WRITES entry for: {', '.join(missing)}"


def test_the_real_script_order_has_no_order_findings():
    stages = [s for s in cc._stage_names_from_script(SCRIPT.read_text(encoding="utf-8"))
              if s not in cc.ABOVE_GATE]
    hard = [f for f in cc.order_findings(stages) if not f.startswith("warn: ")]
    assert hard == [], "\n".join(hard)


def test_the_minor_routes_stage_runs_with_registry():
    """Without `--registry` the solved geometryId / solved:true never reaches
    registry.json, and the stage's own WRITES row would be a lie."""
    text = SCRIPT.read_text(encoding="utf-8")
    assert '[compile_minor_routes]="--registry"' in text, "STAGE_ARGS row missing"
    assert cc.SOURCES / "routes" / "registry.json" in cc.WRITES["compile_minor_routes"]


# ------------------------------------------------------------- the cascade
# Position asks, staleness decides: a stage that reads what another stage just
# rewrote must run, wherever it sits. These fail without `cascade_from`.

def test_cascade_follows_the_artefact_not_the_position(tmp_path):
    x, y = tmp_path / "x.json", tmp_path / "y.json"
    stages = ["A", "B", "C"]
    reads = {"A": [], "B": [cc.P(cc.exists, x)], "C": [cc.P(cc.exists, y)]}
    writes = {"A": [x], "B": [], "C": []}
    rows = {"A": "16b", "B": "16b", "C": "16b"}
    got = cc.cascade_from(["A"], stages=stages, reads=reads, writes=writes,
                          rows=rows, delivered="16g")
    assert got == ["B"]                       # C reads y, which nobody rewrote


def test_cascade_is_transitive_and_skips_the_undelivered(tmp_path):
    x, y = tmp_path / "x.json", tmp_path / "y.json"
    stages = ["A", "B", "C", "D"]
    reads = {"A": [], "B": [cc.P(cc.exists, x)], "C": [cc.P(cc.exists, y)],
             "D": [cc.P(cc.exists, y)]}
    writes = {"A": [x], "B": [y], "C": [], "D": []}
    rows = {"A": "16b", "B": "16b", "C": "16b", "D": "16j"}
    got = cc.cascade_from(["A"], stages=stages, reads=reads, writes=writes,
                          rows=rows, delivered="16g")
    assert got == ["B", "C"]                  # D's chunk has not delivered
    # already run is never re-run
    assert cc.cascade_from(["A", "B"], stages=stages, reads=reads, writes=writes,
                           rows=rows, delivered="16g") == ["C"]


def test_cascade_on_the_real_table():
    """The four stages 16g hand-moved below its row are exactly what the
    cascade finds on its own."""
    got = cc.cascade_from(["compile_minor_routes"])
    assert "apply_vegetation_patches" in got   # reads the clearance patches it writes
    assert "paint_route_overlays" in got       # reads the registry it writes
    assert "compile_minor_routes" not in got


def test_cascade_never_reaches_above_the_gate():
    for stage in cc.cascade_from(["macro_plot"]):
        assert stage not in cc.ABOVE_GATE
        assert stage not in cc.NEVER_RUN


def test_ladder_rows_and_delivered_through_are_read_from_the_script():
    rows, through = cc.ladder_rows(), cc.delivered_through()
    from .ladder import LADDER_ORDER
    assert through in LADDER_ORDER
    assert rows["macro_plot"] == "16g" and rows["compile_scatter"] == "16f"
    assert set(rows) <= set(cc.script_stages())


def test_cascade_does_not_follow_an_admitted_feedback_edge(tmp_path):
    """A `stale_ok` read is declared to be of the PREVIOUS publication. If the
    cascade followed it, every run would cascade the whole chain."""
    x = tmp_path / "x.json"
    stages, rows = ["A", "B"], {"A": "16b", "B": "16b"}
    writes = {"A": [x], "B": []}
    plain = {"A": [], "B": [cc.P(cc.exists, x)]}
    admitted = {"A": [], "B": [cc.stale_ok(cc.P(cc.exists, x), reason="the previous run's copy")]}
    assert cc.cascade_from(["A"], stages=stages, reads=plain, writes=writes,
                           rows=rows, delivered="16g") == ["B"]
    assert cc.cascade_from(["A"], stages=stages, reads=admitted, writes=writes,
                           rows=rows, delivered="16g") == []


def test_the_three_consumers_cannot_sit_on_their_own_ladder_row(monkeypatch):
    """16g hand-moved four stages below its row. Three of them read artefacts a
    16g stage WRITES, so the order gate refuses to have them any higher: the
    cascade is what makes them run, not their position. The fourth,
    `terrain_request_postconditions`, passes the order gate where its 16c row
    sits — it is left below deliberately (it judges the FINISHED world, and its
    inputs are .npy arrays, which no WRITES entry names, so the cascade could
    not bring it back)."""
    order = cc.script_stages()
    after = {"export_routes": "compile_route_structures",
             "paint_route_overlays": "compile_route_structures",
             "apply_vegetation_patches": "compile_water_dressing"}
    for stage, anchor in after.items():
        moved = [s for s in order if s != stage]
        moved.insert(moved.index(anchor) + 1, stage)
        monkeypatch.setattr(cc, "script_stages", lambda path=None, o=moved: o)
        hard = [f for f in cc.order_findings(moved)
                if not f.startswith("warn: ") and f.startswith(f"order: {stage} ")]
        assert hard, f"{stage} could move up: re-check its position"
    monkeypatch.undo()
    moved = [s for s in order if s != "terrain_request_postconditions"]
    moved.insert(moved.index("compile_water") + 1, "terrain_request_postconditions")
    monkeypatch.setattr(cc, "script_stages", lambda path=None, o=moved: o)
    assert not [f for f in cc.order_findings(moved)
                if not f.startswith("warn: ")
                and f.startswith("order: terrain_request_postconditions ")]


def _glob_stages():
    return ["sculpt_province", "compile_hydrology", "compile_society", "shape_province",
            "hydrology_graph", "carve_province", "apply_terrain_patches", "patch_water",
            "compile_water"]


def test_a_declared_glob_is_satisfied_by_any_matching_file_that_was_opened(tmp_path, monkeypatch):
    """A stage that opens `place.*.json` one file at a time declares the
    FAMILY, not a bundle it never touches."""
    _json(tmp_path / "place.one.json", {"a": 1})
    two = _json(tmp_path / "place.two.json", {"a": 1})
    book = {"09-compile_water": {"stage": "compile_water",
                                 "inputs": {str(two): "x"}, "outputs": {}}}
    monkeypatch.setattr(cc, "READS",
                        {"compile_water": [cc.glob_read(tmp_path, "place.*.json")]}, raising=True)
    monkeypatch.setattr(cc, "_stamps", lambda: book)
    monkeypatch.setattr(cc, "script_stages", lambda path=None: _glob_stages())
    assert cc.check(["compile_water"]) == []


def test_a_declared_glob_nobody_opened_fails(tmp_path, monkeypatch):
    _json(tmp_path / "place.one.json", {"a": 1})
    other = _json(tmp_path / "elsewhere.json", {"a": 1})
    book = {"09-compile_water": {"stage": "compile_water",
                                 "inputs": {str(other): "x"}, "outputs": {}}}
    monkeypatch.setattr(cc, "READS",
                        {"compile_water": [cc.glob_read(tmp_path, "place.*.json")]}, raising=True)
    monkeypatch.setattr(cc, "_stamps", lambda: book)
    monkeypatch.setattr(cc, "script_stages", lambda path=None: _glob_stages())
    out = [f for f in cc.check(["compile_water"]) if not f.startswith("warn: ")]
    assert len(out) == 1 and "matched no file that was opened" in out[0], out


def test_a_declared_glob_that_matches_nothing_fails(tmp_path, monkeypatch):
    monkeypatch.setattr(cc, "READS",
                        {"compile_water": [cc.glob_read(tmp_path, "place.*.json")]}, raising=True)
    monkeypatch.setattr(cc, "_stamps", lambda: {})
    monkeypatch.setattr(cc, "script_stages", lambda path=None: _glob_stages())
    out = cc.check(["compile_water"])
    assert len(out) == 1 and out[0].endswith("matches no file"), out


def test_the_two_minor_compiles_declare_the_authored_blueprints_not_the_bundle():
    """The defect this closed: both stages declared `province/blueprints.json`
    and open `world/sources/blueprints/place.*.json`."""
    for stage in ("compile_minor_routes", "compile_minor_waterways"):
        entries = cc.READS[stage]
        assert not [e for e in entries
                    for p in cc.declared_paths(e) if p.name == "blueprints.json"], stage
        globs = [e for e in entries if isinstance(e, cc.glob_read)]
        assert [g for g in globs if g.pattern == "place.*.json"
                and g.directory == cc.SOURCES / "blueprints"], stage
