"""Report the suite's known-red rows, which are keyed to the FAILURE not the test.

The register and the rules live in `worldgen/known_red.py`; a gate that asserts
a collection is empty calls `known_red.assert_clear(...)` and gets a classified
message. This hook only re-states that classification in the terminal summary so
a red suite explains itself. It never changes an outcome: nothing is xfailed,
quarantined or skipped, and a failure that is not on the register is named as
new and fails the run.

Why it is keyed this way: a register keyed to a test absorbs every OTHER failure
that test can produce. It did — see decision 0048.
"""

from __future__ import annotations

from worldgen import known_red


def pytest_terminal_summary(terminalreporter):
    seen = known_red.drain()
    rows = [(key, k, u, s) for key, k, u, s in seen if k or u or s]
    if not rows:
        return
    terminalreporter.write_sep("=", "KNOWN-RED REGISTER", yellow=True)
    for key, known, unregistered, no_longer_red in rows:
        terminalreporter.write_line(f"  {key}")
        for text in unregistered:
            terminalreporter.write_line(f"    NEW, NOT REGISTERED: {text}")
        for row in no_longer_red:
            terminalreporter.write_line(
                f"    NO LONGER RED — remove from worldgen/known_red.py: {row['match']}")
        for text, row in known:
            terminalreporter.write_line(
                f"    KNOWN RED [{row.get('owner', 'unowned')}]: {text}\n"
                f"        {row['why']}")
    terminalreporter.write_line(
        f"  Registered rows are held deliberately; do not xfail or weaken them."
        f" Ledger: {known_red.KNOWN_RED_DOC}")
