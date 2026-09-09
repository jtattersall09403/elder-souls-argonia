"""Make the known water-owned red explain itself in the suite's own output.

The placement gate blocks the Pages deploy, and on `main` it is red on the
Sap-Tapping dry berth. The owner decided on 2026-09-09 to hold the deploy
rather than move the gate, so these two failures are correct behaviour — but a
bare red suite reads like a broken one. This hook names them, and only them, in
the terminal summary. It never changes an outcome: nothing is xfailed,
quarantined or skipped, and a failure outside the register gets no note.
"""

from __future__ import annotations

KNOWN_RED_DOC = "docs/research/rendering/water-handoff.md"

# nodeid suffix -> why it is red and who owns it.
KNOWN_RED = {
    "worldgen/test_blueprint.py::test_live_dir_validates":
        "the Sap-Tapping licensed berth has no wet water cell in the published network",
    "worldgen/test_minor_waterways.py::test_no_berth_is_refused_in_the_published_network":
        "the same Sap-Tapping berth, checked from the waterway side",
}

_failed: list[str] = []


def pytest_runtest_logreport(report):
    if report.when == "call" and report.failed:
        _failed.append(report.nodeid)


def pytest_terminal_summary(terminalreporter):
    known = [nodeid for nodeid in _failed
             if any(nodeid.endswith(key) for key in KNOWN_RED)]
    if not known:
        return
    terminalreporter.write_sep("=", "KNOWN RED — water-owned, expected", yellow=True)
    for nodeid in known:
        why = next(reason for key, reason in KNOWN_RED.items() if nodeid.endswith(key))
        terminalreporter.write_line(f"  {nodeid}\n      {why}")
    terminalreporter.write_line(
        f"  The owner is holding the deploy on this rather than moving the gate"
        f" (2026-09-09).\n"
        f"  Do not xfail, quarantine or weaken it. Ledger and next actions: {KNOWN_RED_DOC}")
    others = [nodeid for nodeid in _failed if nodeid not in known]
    if others:
        terminalreporter.write_line(
            f"  {len(others)} OTHER failure(s) are NOT covered by this note.")
