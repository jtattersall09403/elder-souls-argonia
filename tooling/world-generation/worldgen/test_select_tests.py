"""The placement gate collects test modules by DIRECTORY, not by a hand list.

This module is itself the proof: it was added to `worldgen/` without editing
package.json, and `select_tests.py placement` names it (16h item 6, the old
hand list in `test:placement` collected 50 of the 129 modules present).
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

WORLDGEN = Path(__file__).resolve().parent
SELECT = WORLDGEN.parent / "scripts" / "select_tests.py"


def _module():
    spec = importlib.util.spec_from_file_location("select_tests", SELECT)
    module = importlib.util.module_from_spec(spec)
    sys.modules["select_tests"] = module
    spec.loader.exec_module(module)
    return module


def test_a_new_test_module_is_collected_without_editing_package_json():
    assert "test_select_tests.py" in _module().select("placement")


def test_placement_and_water_partition_every_test_module():
    select = _module().select
    placement, water = set(select("placement")), set(select("water"))
    present = {p.name for p in WORLDGEN.glob("test_*.py")}
    assert placement | water == present
    assert not placement & water


def test_the_water_list_cannot_name_a_module_that_has_gone():
    module = _module()
    module.WATER_SUITE = module.WATER_SUITE + ("test_no_such_module.py",)
    try:
        module.select("water")
    except SystemExit as exc:
        assert "test_no_such_module.py" in str(exc)
    else:
        raise AssertionError("a stale WATER_SUITE row passed silently")


# the perf lane's diff (416af0f0..ea36acd1): TS files under apps/world-studio and
# packages/game-core, a doc and gpu-lane files
PERF_DIFF = """apps/world-studio/src/sky/WorldSky.tsx apps/world-studio/src/sky/aerial.ts
apps/world-studio/src/vegetation/Vegetation.tsx packages/game-core/src/render/terrainOcclusion.ts
packages/game-core/src/water/index.ts packages/game-core/src/water/waves.ts
packages/game-core/src/water/render/waterMaterial.ts docs/standards/engineering.md
tooling/gpu-lane/checks.mjs tooling/gpu-lane/probes/uniforms.js tooling/gpu-lane/spots/perf10-c6.txt""".split()


def test_a_directory_chain_in_a_module_does_not_select_every_test_for_its_tree():
    """`REPO_ROOT / "packages" / "game-core" / "src"` (worldgen/coplanar.py) and the
    prefixes of a longer chain are source-tree roots, not data paths: a TS change
    under them selected 112 placement and 47 workbench test files."""
    sel = _module()
    for suite in ("placement", "workbench", "pipeline", "water"):
        assert sel.select_changed(suite, PERF_DIFF)["selected"] == [], suite


def test_a_changed_water_test_still_selects_the_water_suite():
    changed = ["tooling/world-generation/worldgen/test_water_invariants.py"]
    assert _module().select_changed("water", changed)["selected"] == changed


def test_es_test_changed_accepts_newline_and_space_lists(monkeypatch, capsys):
    sel = _module()
    paths = ["tooling/world-generation/worldgen/test_water_invariants.py",
             "tooling/world-generation/worldgen/test_known_red.py"]
    out = []
    for sep in ("\n", " "):
        monkeypatch.setenv("ES_TEST_CHANGED", sep.join(paths))
        monkeypatch.setattr(sys, "argv", ["select_tests.py", "placement"])
        sel.main()
        out.append(capsys.readouterr().out)
    assert out[0] == out[1] and "test_known_red.py" in out[0]


def test_an_empty_selection_prints_nothing_and_never_falls_back_to_the_suite(monkeypatch, capsys):
    sel = _module()
    assert sel.command_args("placement", ["README.md"]) == []
    monkeypatch.setenv("ES_TEST_CHANGED", "README.md")
    monkeypatch.setattr(sys, "argv", ["select_tests.py", "placement"])
    sel.main()
    assert capsys.readouterr().out == ""


def test_a_workbench_hub_module_selects_its_own_tests_not_the_suite():
    """perf10 c13: wb.py, walkway.py and rules.py reach (nearly) every
    workbench test by import; each selects its own named set instead."""
    sel = _module()
    for hub, own in sel.OWN_TESTS.items():
        if not hub.startswith("tooling/placement-workbench/"):
            continue
        got = sel.select_changed("workbench", [hub], use_reads_map=False)
        assert got["selected"] == sorted(own) and not got["all"], hub


def test_an_edit_to_the_selector_selects_only_the_two_tests_that_load_it():
    sel = _module()
    got = sel.select_changed("placement", ["tooling/world-generation/scripts/select_tests.py"],
                             use_reads_map=False)
    assert got["selected"] == ["tooling/world-generation/worldgen/test_select_tests.py",
                               "tooling/world-generation/worldgen/test_test_reads_map.py"]
    assert not got["all"]


def test_an_autouse_conftest_fixture_brings_only_the_imports_it_uses():
    """The workbench conftest imports wb for `applied_layout`; its autouse
    `_scratch_reports` uses only os, so it must not hand every test wb."""
    sel = _module()
    fx = sel._fixtures("tooling/placement-workbench/tests/conftest.py")
    assert fx["_scratch_reports"] == (True, frozenset())
    assert "tooling/placement-workbench/wb.py" in fx["applied_layout"][1]
