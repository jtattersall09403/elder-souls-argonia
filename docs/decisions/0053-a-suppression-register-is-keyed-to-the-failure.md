# 0053 — A suppression register is keyed to the failure, never to the check

Date: 2026-09-09. Status: accepted. Binding on every known-red, allowlist,
baseline or waiver register in this repo.

## Context

`tooling/world-generation/conftest.py` held a known-red register keyed to a
**test nodeid**: `worldgen/test_blueprint.py::test_live_dir_validates` was
registered as red because of a water-owned dry berth. The terminal summary
printed that reason for any failure of that test.

The gate it covered asserts a *collection* is empty
(`blueprint.validate_all(...) == []`). By the time this was audited the list
held **two errors, neither of them the registered one**: Lilmoth doors
`.9` (facing 260°, 107° off the wall that carries it) and `.26` (facing 268°)
reported as facing away from their own walls. The suite said
only "KNOWN RED, water-owned, expected". A door defect in the flagship
exemplar was hidden behind a water waiver, in a build whose owner handoff asks
the owner to judge whether doors face sensibly.

Two other registers in the repo were already keyed correctly and are the model:
`world/sources/terrain/terrain-request-known-red.json` (keyed by `requestId`)
and `world/sources/settlements/settlement-warning-known-red.json` (keyed by
`(placeId, subjectId, ruleId)`). Both fail on an unregistered finding and both
fail on a registered row that has started passing.

## Decision

A register that suppresses, explains or waives anything is keyed to the
**individual finding**, not to the check that reports it. Every register in
this repo obeys the same three rules:

1. a registered finding that is still failing is reported as KNOWN RED with its
   `why` and its `owner`. The gate stays red, because it *is* red;
2. a finding that is **not** on the register fails the run and is named first;
3. a registered finding that no longer appears is reported as
   `NO LONGER RED — remove from <register>` and fails the run, so a fixed
   red cannot sit on the register as a quiet holding position.

The pytest side is `tooling/world-generation/worldgen/known_red.py`: the register
maps a test nodeid to the list of failing entries it may still contain, each with
a stable identifying `match` substring, a `why` and an `owner`. A gate calls
`known_red.assert_clear(NODE_KEY, findings)`. `conftest.py` only re-states the
classification in the terminal summary. `worldgen/test_known_red.py` is the
mutation check, in both directions: a new unregistered finding inside a
registered gate must fail and be named; a registered one must report as known
red.

## Consequence, measured the same day

Re-keyed, the register emptied: both rows on it were stale. The berth gate
passes. The two Lilmoth door errors turned out to be an artefact of the
suite rather than the data. `test_blueprint.py`'s `autouse` `default_index`
fixture installs a **one-asset stub** interiors index. That fixture was also
reaching the gate that validates the five real live blueprints. Every kit piece
looked as if it had no measured entrance, so the validator fell back to its
nearest-footprint-edge proxy and invented door errors that the shipped data
does not have (`blueprint --check` reports none). The gate now carries
`@pytest.mark.real_index` and the fixture stands aside for it.

The second lesson: **an autouse fixture that installs synthetic data must never
reach a test that measures the real committed data.** If a suite
holds both kinds, the real-data tests opt out explicitly.
