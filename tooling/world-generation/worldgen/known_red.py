"""A suppression register keyed to the FAILURE, never to the check.

The lesson this module exists to enforce (2026-09-09, decision 0048): a
known-red register that names a *test* absorbs every other failure that test
can ever produce. `test_live_dir_validates` sat on such a register for a water
reason while it was actually reporting two unrelated Lilmoth door errors, and
nothing in the suite said so.

So the register here names the individual failing ENTRIES a collection-emptiness
gate is allowed to still contain, by a stable identifying substring. The rules,
which match the terrain (`terrain-request-known-red.json`) and settlement
(`settlement-warning-known-red.json`) registers:

* a registered red is an expected failure so main stays green; it is still
  listed by preflight and in the backlog (row 49); it flips to a hard
  failure the moment it passes, so the register cannot rot;
* an entry that is NOT registered fails the run and is named first, loudly;
* a registered entry that no longer appears is reported as NO LONGER RED and
  fails the run, so a fixed red cannot stay registered as a quiet holding
  position.

Usage from a test that asserts a collection is empty::

    from . import known_red
    errs = blueprint.validate_all(...)
    assert not known_red.check(NODE_KEY, errs), known_red.check(NODE_KEY, errs)

or, more readably, ``known_red.assert_clear(NODE_KEY, errs)``.
"""
from __future__ import annotations

import pytest

KNOWN_RED_DOC = "docs/phases/P-polish/backlog.md"

#: test nodeid suffix -> the specific failing entries it is allowed to contain.
#: Each row: ``match`` (a stable identifying substring of the failure text),
#: ``why`` (the reason), ``owner``, and optionally ``queuedIn``.
#: An EMPTY register is the healthy state: nothing is suppressed anywhere.
#: The 2026-09-19 re-plot moved five live blueprint places; their authored
#: geometry (streets, boardwalks, docks, terminals, fences) still describes
#: the ground each place stood on before the move. 16i re-authors it.
_REPLOT_WHY = (
    "re-plot 2026-09-19 moved the record; 16i re-authors the blueprint "
    "where it landed (16g brief, deliverable 2)")

KNOWN_RED: dict[str, list[dict]] = {
    "worldgen/test_blueprint.py::test_live_dir_validates": [
        {"match": 'route.mazzatun.haul:',
         "why": _REPLOT_WHY, "owner": "16i", "queuedIn": "16i"},
        {"match": 'route.mazzatun.pen-lane:',
         "why": _REPLOT_WHY, "owner": "16i", "queuedIn": "16i"},
        {"match": 'dock.nine-trunks.landing: hullClass',
         "why": _REPLOT_WHY, "owner": "16i", "queuedIn": "16i"},
        {"match": 'route.nine-trunks.spur:',
         "why": _REPLOT_WHY, "owner": "16i", "queuedIn": "16i"},
        {"match": 'route.nine-trunks.landing-path:',
         "why": _REPLOT_WHY, "owner": "16i", "queuedIn": "16i"},
        {"match": 'terminal.nine-trunks.gate-head:',
         "why": _REPLOT_WHY, "owner": "16i", "queuedIn": "16i"},
        {"match": 'route.sap-tapping-licensed.track:',
         "why": _REPLOT_WHY, "owner": "16i", "queuedIn": "16i"},
        {"match": 'route.sap-tapping-licensed.sap-track:',
         "why": _REPLOT_WHY, "owner": "16i", "queuedIn": "16i"},
        {"match": "serving route 'route.boat.soulrest-lilmoth'",
         "why": _REPLOT_WHY, "owner": "16i", "queuedIn": "16i"},
        {"match": "serving route 'route.boat.blackrose-lilmoth'",
         "why": _REPLOT_WHY, "owner": "16i", "queuedIn": "16i"},
        {"match": 'route.lilmoth.spine-track:',
         "why": _REPLOT_WHY, "owner": "16i", "queuedIn": "16i"},
        {"match": 'route.lilmoth.court-path:',
         "why": _REPLOT_WHY, "owner": "16i", "queuedIn": "16i"},
        {"match": 'route.lilmoth.court-approach:',
         "why": _REPLOT_WHY, "owner": "16i", "queuedIn": "16i"},
        {"match": 'route.lilmoth.tender-path:',
         "why": _REPLOT_WHY, "owner": "16i", "queuedIn": "16i"},
        {"match": 'route.lilmoth.fishers-path:',
         "why": _REPLOT_WHY, "owner": "16i", "queuedIn": "16i"},
        {"match": 'boardwalk.lilmoth.pusbottom-loop:',
         "why": _REPLOT_WHY, "owner": "16i", "queuedIn": "16i"},
        {"match": 'boardwalk.lilmoth.quay-lane:',
         "why": _REPLOT_WHY, "owner": "16i", "queuedIn": "16i"},
        {"match": 'boardwalk.lilmoth.shore-lane:',
         "why": _REPLOT_WHY, "owner": "16i", "queuedIn": "16i"},
        {"match": 'fence.lilmoth.imperial-curtain-north:',
         "why": _REPLOT_WHY, "owner": "16i", "queuedIn": "16i"},
        {"match": 'dock.wamasu-pond-adult.lane-landing: hullClass',
         "why": _REPLOT_WHY, "owner": "16i", "queuedIn": "16i"},
        {"match": 'route.wamasu-pond-adult.bank-path:',
         "why": _REPLOT_WHY, "owner": "16i", "queuedIn": "16i"},
        {"match": 'route.wamasu-pond-adult.stand-path:',
         "why": _REPLOT_WHY, "owner": "16i", "queuedIn": "16i"},
        {"match": 'canal.wamasu-pond-adult.pole-lane:',
         "why": _REPLOT_WHY, "owner": "16i", "queuedIn": "16i"},
    ],
}

#: What the last checked gates classified, for the terminal summary.
_SEEN: list[tuple[str, list[tuple[str, dict]], list[str], list[dict]]] = []


def classify(test_key: str, items) -> tuple[list, list, list]:
    """(known, unregistered, no_longer_red) for one collection of failures."""
    rows = KNOWN_RED.get(test_key, [])
    known: list[tuple[str, dict]] = []
    unregistered: list[str] = []
    for item in items:
        text = str(item)
        row = next((r for r in rows if r["match"] in text), None)
        (known.append((text, row)) if row else unregistered.append(text))
    matched = {id(row) for _, row in known}
    no_longer_red = [r for r in rows if id(r) not in matched]
    return known, unregistered, no_longer_red


def check(test_key: str, items) -> str:
    """'' when the collection is clean; otherwise the message to fail with.

    Registered reds still fail (they are real failures the owner is holding),
    but they are named as known red and are listed after the ones that are not.
    """
    known, unregistered, no_longer_red = classify(test_key, items)
    _SEEN.append((test_key, known, unregistered, no_longer_red))
    if not (known or unregistered or no_longer_red):
        return ""
    return _format(test_key, known, unregistered, no_longer_red)


def _format(test_key: str, known: list, unregistered: list, no_longer_red: list) -> str:
    out: list[str] = []
    if unregistered:
        out.append(f"{len(unregistered)} failure(s) NOT on the known-red register "
                   f"for {test_key} — these are new:")
        out += [f"  ! {t}" for t in unregistered]
    if no_longer_red:
        out.append(f"{len(no_longer_red)} registered red(s) NO LONGER RED — remove from "
                   f"worldgen/known_red.py:")
        out += [f"  - {r['match']}" for r in no_longer_red]
    if known:
        out.append(f"{len(known)} KNOWN RED (registered, owned, still failing):")
        out += [f"  = {t}\n      {row['why']} [{row.get('owner', 'unowned')}]"
                for t, row in known]
        out.append(f"  Do not xfail, quarantine or weaken. Ledger: "
                   f"{KNOWN_RED_DOC}")
    return "\n".join(out)


def assert_clear(test_key: str, items) -> None:
    """Pass when nothing is red; xfail (strict) when every failure is a
    registered known red; fail hard on anything unregistered or fixed-but-
    still-registered, so the register cannot rot."""
    known, unregistered, no_longer_red = classify(test_key, items)
    _SEEN.append((test_key, known, unregistered, no_longer_red))
    if unregistered or no_longer_red:
        message = _format(test_key, known, unregistered, no_longer_red)
        assert False, "\n" + message
    if known:
        tag = ", ".join(sorted({row.get("owner", "unowned") for _, row in known}))
        reason = "; ".join(sorted({row["why"] for _, row in known}))
        pytest.xfail(f"KNOWN RED [{tag}] {reason}")


def drain() -> list:
    """Take what was classified this run (for the terminal summary)."""
    seen, _SEEN[:] = list(_SEEN), []
    return seen
