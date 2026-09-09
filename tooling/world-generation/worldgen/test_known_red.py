"""The known-red register must be keyed to the FAILURE, not to the check.

These are the mutation checks for the safety net itself (decision 0048): the
register it replaced was keyed to a test nodeid, so any additional unrelated
failure inside a registered test was absorbed and reported under the old
reason. A net that cannot catch a new red is the bug, so it is tested here in
both directions.
"""
from __future__ import annotations

import pytest

from . import known_red

KEY = "worldgen/test_known_red.py::fixture-gate"
ROW = {"match": "the Sap-Tapping licensed berth", "why": "water owns it", "owner": "water"}


@pytest.fixture(autouse=True)
def _register(monkeypatch):
    monkeypatch.setattr(known_red, "KNOWN_RED", {KEY: [dict(ROW)]})
    known_red.drain()


def test_a_registered_red_is_named_as_known_red():
    message = known_red.check(KEY, ["place.x: the Sap-Tapping licensed berth has no wet cell"])
    assert "KNOWN RED (registered, owned, still failing)" in message
    assert "water owns it" in message
    assert "NOT on the known-red register" not in message


def test_a_new_failure_inside_a_registered_gate_is_named_and_fails():
    """The exact bug: a second, unrelated failure in a gate that is on the
    register. It must be reported as new, not absorbed by the water reason."""
    message = known_red.check(KEY, [
        "place.x: the Sap-Tapping licensed berth has no wet cell",
        "place.mercantile-coast.lilmoth: door door.9: facingDeg 260 faces away from the wall",
    ])
    assert "1 failure(s) NOT on the known-red register" in message
    assert "faces away from the wall" in message
    with pytest.raises(AssertionError, match="NOT on the known-red register"):
        known_red.assert_clear(KEY, [
            "the Sap-Tapping licensed berth", "door.9: faces away from the wall"])


def test_a_registered_red_that_is_fixed_must_be_removed():
    message = known_red.check(KEY, [])
    assert "NO LONGER RED" in message
    with pytest.raises(AssertionError, match="NO LONGER RED"):
        known_red.assert_clear(KEY, [])


def test_an_unregistered_gate_suppresses_nothing():
    with pytest.raises(AssertionError, match="NOT on the known-red register"):
        known_red.assert_clear("worldgen/test_known_red.py::no-such-gate", ["anything at all"])


def test_a_clean_gate_is_silent():
    assert known_red.check("worldgen/test_known_red.py::no-such-gate", []) == ""


def test_the_live_register_carries_a_reason_and_an_owner_per_row():
    """A row with no reason is a holding position. Guards the real register."""
    for key, rows in known_red.KNOWN_RED.items():
        for row in rows:
            assert row.get("match") and row.get("why") and row.get("owner"), key
