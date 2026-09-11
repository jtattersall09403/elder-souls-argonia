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

* a registered entry that is still failing is reported as KNOWN RED, with its
  reason and owner — and the test stays red, because it IS red;
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

KNOWN_RED_DOC = "docs/research/archive/water-round-2-2026-09/water-handoff.md"

#: test nodeid suffix -> the specific failing entries it is allowed to contain.
#: Each row: ``match`` (a stable identifying substring of the failure text),
#: ``why`` (the reason), ``owner``, and optionally ``queuedIn``.
#: An EMPTY register is the healthy state: nothing is suppressed anywhere.
KNOWN_RED: dict[str, list[dict]] = {}

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
    """Fail the test with the classified message, or pass when nothing is red."""
    message = check(test_key, items)
    assert not message, "\n" + message


def drain() -> list:
    """Take what was classified this run (for the terminal summary)."""
    seen, _SEEN[:] = list(_SEEN), []
    return seen
