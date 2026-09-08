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

* `street_router.default_survey()` — one `ProvinceSurvey` per process.
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
