"""A pad-owning prop (an assembly member with its own scanned pad) seats on
the padded surface propSeatRule reads, never at the pad datum the overlay
grades PAD_FLOOR_CLEARANCE_M over it (audit10 c3, bog-iron sd-orebucket);
the pad's building still rests on its datum. Fakes only: CI-safe."""
from __future__ import annotations

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from workbench import measure, paths  # noqa: E402
from workbench.scene import Piece  # noqa: E402

paths.bridge()
from worldgen.pad_overlay import PAD_FLOOR_CLEARANCE_M as CLEAR  # noqa: E402

ROW = {"anchorClass": "ground", "placement": {"anchorMode": "pivot"}, "originOffsetM": [0, 0, 0],
       "designedSinkM": {"p50": 0.0}}


class _Cat:
    def row(self, asset):
        return ROW


class _Padded:
    """A padded surface at 15.39 m whose pad floor stands CLEAR over it."""

    def height(self, x, z, source="chunks"):
        return 15.39

    def floor_lift(self, x, z):
        return CLEAR


def _seat(kind):
    p = Piece("sd-orebucket", "kotm:x", 0.0, 0.0, pad={"datumM": 15.42})
    p.role = {"kind": kind}
    return measure.seat(_Cat(), _Padded(), p)["y"]   # the seat prop_seat starts from


def test_a_pad_owning_prop_seats_on_the_padded_surface_not_the_datum():
    building = _seat("parcel")
    prop = _seat("assembly")
    assert building - prop == pytest.approx(CLEAR, abs=1e-9)
