"""Shared, session-lifetime fixtures for the worldgen suites.

The placement suites all stand on the same two expensive things: the province
survey (rasters loaded off disk) and the derived geometry of the five live
blueprints (A* street routing over a per-cell cost field, footprint
derivation). Both are pure functions of files on disk, so both are computed
once per process and shared, rather than once per test.

Where the caching lives (all of it content- or signature-keyed, so an edit to
a source file invalidates it and nothing stale is ever served):

* `street_router.default_survey()` — one `ProvinceSurvey` per process.
* `street_router.local_field()` — the 1 m cost field per (way, blueprint,
  survey), keyed on the way and blueprint content the field is built from.
* `blueprint.validate_all()` — keyed on the blueprint dir's file signature
  (name + mtime + size).

Nothing here changes what any test asserts; it only stops the same work being
redone. See ../README.md § Tests for the fast/slow split.
"""
from __future__ import annotations

import pytest


@pytest.fixture(scope="session")
def survey():
    """The province survey, or None when the rasters are not in this checkout."""
    from worldgen.street_router import default_survey
    return default_survey()


@pytest.fixture(scope="session", autouse=True)
def _warm_survey():
    """Load the rasters once, before the first test that needs them, so the
    cost never lands on (and is never attributed to) an arbitrary test."""
    from worldgen.street_router import default_survey
    default_survey()
