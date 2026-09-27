"""Shared, demand-driven fixtures for the worldgen suites.

Some placement suites stand on the same two expensive things: the province
survey (rasters loaded off disk) and the derived geometry of the five live
blueprints (A* street routing over a per-cell cost field, footprint
derivation). Both are pure functions of files on disk, so both are computed
once per process and shared when first requested, rather than once per test.
Small schema and synthetic-geometry selections never request the province and
therefore no longer pay to load it.

Where the caching lives (all of it content- or signature-keyed, so an edit to
a source file invalidates it and nothing stale is ever served):

* `site_fields.shared_survey()` — one `ProvinceSurvey` per process, keyed on
  the signature of the files it reads (`street_router.default_survey()`
  delegates to it); every compiler builds its survey through it, so a test
  that stubs the survey stubs `<module>.shared_survey`.
* `water_report.ArrayCache` — the survey's, `ProvinceFields`' and
  `ShippedWater`'s decoded arrays as `.npy` under `output/survey-cache/`,
  memory-mapped read-only and keyed on `province_signature` (sources + the
  decoders' code), so every pytest worker shares one copy in the page cache.
* `street_router.local_field()` — the 1 m cost field per (way, blueprint,
  survey), keyed on the way and blueprint content the field is built from.
* `blueprint.validate_all()` — keyed on the blueprint dir's file signature
  (name + mtime + size).

Nothing here changes what any test asserts; it only stops the same work being
done eagerly or redone. See ../README.md § Tests for the fast/slow split.
"""
from __future__ import annotations

import pytest


@pytest.fixture(scope="session")
def survey():
    """The process-wide province survey, loaded only when a test requests it."""
    from worldgen.street_router import default_survey
    loaded = default_survey()
    if loaded is None:
        pytest.fail("the committed province survey rasters are unavailable")
    return loaded


# --------------------------------------------------------------------------- #
# Test-reads map (lane 3A E, speed lane 2 Rec 1). With ES_TEST_READS=1 an
# audit hook on "open" records which repo DATA files (under world/,
# apps/world-studio/public/, tooling/*/output/) each test file opens for
# reading; at session end the process merges its rows into
# output/test-reads.json under the file's write lock:
#   {"schemaVersion": 1, "tests": {"<repo-relative test file>":
#       {"reads": [sorted repo-relative paths], "isolated": bool}}}
# `isolated` is true when the process collected exactly that one test file
# (`scripts/select_tests.py <suite> --record-reads` runs them so): only then
# is the row complete, because a file loaded by an earlier test's cache or
# session fixture is never opened again by the later tests that use it.
# `passed` is false when the run was red or errored (it may have stopped
# before its reads), and `recordedAt` (epoch s, the process start) is what
# the selector compares the test's modules against; both make a row unusable.
# `spawns` is true when the test file started a process (subprocess, fork,
# exec): the child's opens are not seen, so that row is not complete either.
# `scripts/select_tests.py` selects a data change from the complete rows and
# falls back to its static closure for the rest.
# --------------------------------------------------------------------------- #
import os as _os
import time as _time
import sys as _sys
from pathlib import Path as _Path

_REPO = _Path(__file__).resolve().parents[3]
_READS_FILE = _REPO / "tooling/world-generation/output/test-reads.json"
_DATA_PREFIXES = ("world/", "apps/world-studio/public/")
# a child process's opens are not seen by this process's hook
_SPAWN_EVENTS = frozenset({"subprocess.Popen", "os.system", "os.fork", "os.forkpty", "os.exec",
                           "os.posix_spawn", "os.spawn"})


def _data_rel(path) -> str | None:
    """The repo-relative data path `path` names, or None when it is not data."""
    if isinstance(path, int):
        return None
    try:
        text = _os.fsdecode(path)
    except TypeError:
        return None
    full = _os.path.normpath(_os.path.join(_os.getcwd(), text))
    root = str(_REPO) + _os.sep
    if not full.startswith(root) or full.endswith((".py", ".pyc")):
        return None
    rel = full[len(root):].replace(_os.sep, "/")
    if rel.startswith(_DATA_PREFIXES):
        return rel
    parts = rel.split("/", 3)
    if len(parts) >= 4 and parts[0] == "tooling" and parts[2] == "output":
        return None if rel == "tooling/world-generation/output/test-reads.json" else rel
    return None


class _ReadRecorder:
    """Per-process: current test file -> data files opened for reading."""

    def __init__(self):
        self.current: str | None = None
        self.files: set[str] = set()
        self.reads: dict[str | None, set[str]] = {}
        self.spawned: set[str | None] = set()
        self.active = True
        self.recorded_at = _time.time()      # a module edited after this makes the row stale

    def audit(self, event, args):
        if event != "open" or not self.active:
            if self.active and event in _SPAWN_EVENTS:
                self.spawned.add(self.current)
            return
        path, mode, flags = args
        if (mode is not None and not ("r" in mode or "+" in mode)) or \
                (mode is None and (flags or 0) & _os.O_ACCMODE == _os.O_WRONLY):
            return                           # opened for writing only
        rel = _data_rel(path)
        if rel is not None:
            self.reads.setdefault(self.current, set()).add(rel)

    def enter(self, path) -> None:
        rel = _Path(path).resolve().relative_to(_REPO).as_posix()
        self.current = rel
        self.files.add(rel)

    def rows(self, passed: bool = True) -> dict:
        isolated = len(self.files) == 1
        out = {}
        for f in sorted(self.files):
            reads = set(self.reads.get(f, ()))
            if isolated:                     # the one file owns every open in the process
                for got in self.reads.values():
                    reads |= got
            spawns = f in self.spawned or (isolated and bool(self.spawned))
            out[f] = {"reads": sorted(reads), "isolated": isolated, "spawns": spawns,
                      "passed": passed, "recordedAt": round(self.recorded_at, 3)}
        return out


def _merge_reads(rows: dict, target: _Path = _READS_FILE) -> None:
    import json
    from worldgen.atomic_write import atomic_write_bytes, write_lock
    with write_lock(target):
        try:
            doc = json.loads(target.read_text())
        except (OSError, ValueError):
            doc = {}
        tests = dict(doc.get("tests", {})) if doc.get("schemaVersion") == 1 else {}
        tests.update(rows)
        doc = {"schemaVersion": 1, "tests": {k: tests[k] for k in sorted(tests)}}
        atomic_write_bytes(target, (json.dumps(doc, indent=1, sort_keys=True) + "\n").encode())


def pytest_configure(config):
    if _os.environ.get("ES_TEST_READS") == "1" and not hasattr(config, "_es_reads"):
        recorder = _ReadRecorder()
        config._es_reads = recorder
        _sys.addaudithook(recorder.audit)         # cannot be removed; it goes quiet at session end


def pytest_collectstart(collector):
    recorder = getattr(collector.config, "_es_reads", None)
    if recorder is not None and isinstance(collector, pytest.Module):
        recorder.enter(collector.path)


def pytest_runtest_setup(item):
    recorder = getattr(item.config, "_es_reads", None)
    if recorder is not None:
        recorder.enter(item.path)


def pytest_sessionfinish(session, exitstatus):
    recorder = getattr(session.config, "_es_reads", None)
    if recorder is not None and recorder.files:
        recorder.active = False                   # the hook stays installed, silent
        # a red or errored run may have stopped before its reads: its row is kept, flagged
        _merge_reads(recorder.rows(passed=int(exitstatus) in (0, 5)))


def pytest_terminal_summary(terminalreporter, config):
    """The shuffle seed, printed even under -q (pytest-randomly's own header
    line is hidden there), so an order-dependent red can be replayed."""
    seed = getattr(config.option, "randomly_seed", None)
    if seed is not None and config.pluginmanager.hasplugin("randomly"):
        terminalreporter.write_line(f"pytest-randomly: test order seed {seed} "
                                    f"(replay: -p randomly --randomly-seed={seed})")
