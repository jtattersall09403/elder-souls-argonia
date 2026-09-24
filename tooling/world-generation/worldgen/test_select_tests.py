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
