"""Shared workbench test fixtures (speed lane 3B, 2026-09-27): a Claywater
layout is applied once per test session (per xdist worker); the module warms
its pads and padded ground with its own catalogue, and each test mutates its
own `Scene.view()` of it instead of a deepcopy that re-resolves every pad."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import wb  # noqa: E402
from workbench import paths  # noqa: E402
from workbench.scene import Scene  # noqa: E402


@pytest.fixture(autouse=True)
def _scratch_reports(tmp_path, monkeypatch):
    """`wb round` writes the place's round folder by default (finding G):
    a test never writes into tooling/.reports/16k."""
    if "WB_REPORTS" not in os.environ:
        monkeypatch.setenv("WB_REPORTS", str(tmp_path / "reports-16k"))


@pytest.fixture(scope="session")
def applied_layout(tmp_path_factory):
    """``applied_layout(layout) -> Scene``: the scene `apply` builds from the
    layout (no compile), once per session, in a scratch output folder (the
    ground cache linked) so the live place's files are never overwritten.
    Hand tests a `view()`; never mutate the shared scene itself."""
    got: dict = {}

    def apply(layout: Path) -> Scene:
        key = str(Path(layout).resolve())
        if key not in got:
            real = paths.OUTPUT
            scratch = tmp_path_factory.mktemp("wb-session")
            (real / "ground").mkdir(parents=True, exist_ok=True)
            (scratch / "ground").symlink_to(real / "ground")
            mp = pytest.MonkeyPatch()
            mp.setattr(paths, "OUTPUT", scratch)
            try:
                out = wb.apply_layout(Path(layout), str(scratch / "claywater.json"),
                                      compile_=False)
                assert out.get("failed") is None, out.get("failed")
                got[key] = Scene.load(scratch / "claywater.json")
            finally:
                mp.undo()
        return got[key]
    return apply
