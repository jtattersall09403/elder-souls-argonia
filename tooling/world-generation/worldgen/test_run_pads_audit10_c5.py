"""Run pads, audit10 c5: a partly-wet run END gets a cut-only grade of its
dry bank (Riverwalk lw13), and a CLIMB run (members rising more than the
controller step) gets no pad (the Border-road timber stair, round 25).
Each failed on the code before the fix. CI-safe: synthetic ground carrying
the measured numbers."""

from __future__ import annotations

from . import pad_overlay
from .settlement_run_pads import CLIMB_STEP_M, climb_runs, run_pad_patches

DECK_LINE = 0.18          # lw00's graded line: deck 0.35 - 0.17


def _member(i: int, x0: float, rise: float = 0.0, sink: float = -0.17, n: int = 14) -> dict:
    return {"id": f"place.rw.long-walk.piece.{i + 1}",
            "run": {"id": "place.rw.long-walk", "index": i, "riseM": rise},
            "anchor": {"designedSinkM": {"p50": sink}}, "scale": 1.0, "yFinal": True,
            "positionM": [x0 + 2.0, 0.35 + rise, 0.5],
            "footprintM": ([[x0 + k, 0.0] for k in range(5)]
                           + [[x0 + 4.0 - k, 1.0] for k in range(5)])}


def _riverwalk():
    """lw00..lw13 at deck 0.35 (line 0.18); the north end lw13 at x 52-56:
    wet past x < 53 (its 3 wet corner samples, ground 0.0 under the water),
    dry bank 0.45-0.56 m beyond."""
    rows = [_member(i, 4.0 * i) for i in range(14)]

    def ground(x, z):
        if x < 2.0:
            return 0.18          # the south bank, graded
        if x < 53.0:
            return 0.0           # under the water
        return 0.45 + 0.11 * min(1.0, (x - 53.0) / 3.0)

    def wet(x, z):
        return 2.0 <= x < 53.0
    return rows, ground, wet


def test_a_partly_wet_run_end_has_its_dry_bank_cut_to_the_line():
    rows, ground, wet = _riverwalk()
    patches = run_pad_patches(rows, "place.rw", ground, wet)
    pieces = [r for p in patches for r in p["params"]["pieces"]]
    end = [r for r in pieces if r["placementId"].endswith(".piece.14")]
    assert end, "lw13's dry bank is never graded"          # the pre-fix code skipped it
    (lw13,) = end
    assert lw13["cutOnly"] is True and lw13["targetM"] == DECK_LINE
    assert all(x >= 53.0 for x, _ in lw13["footprintM"])   # its dry points only
    # a middle member over the water is never graded
    assert {r["placementId"] for r in pieces} == {lw13["placementId"]}
    (overlay,) = [pad_overlay.overlay_from_patch(p, 2.745) for p in patches]
    assert overlay["pieces"][0]["cutOnly"] is True
    padded = pad_overlay.ground(ground, [overlay])
    assert abs(padded(54.0, 0.5) - DECK_LINE) < 1e-9        # the bank cut to the line
    assert padded(52.5, 0.5) == 0.0                         # a wet sample is never filled
    assert padded(49.0, 0.5) == 0.0
    # the array twin agrees
    import numpy as np
    X, Z = np.array([54.0, 52.5, 49.0]), np.array([0.5, 0.5, 0.5])
    got = pad_overlay.ground_many(np.array([ground(x, 0) for x in X]), X, Z, [overlay])
    assert list(got) == [padded(x, 0.5) for x in X]


def test_a_climb_run_takes_no_pad():
    """Round 25: stairs02 x3 at pivots 2.52 / 5.44 / 8.36 (2.92 m a member)
    over an 8 m bank; the pad raised 2.9 m of ground over the bridge deck."""
    rows = [_member(i, 4.0 * i, rise=2.92 * i, sink=-3.26) for i in range(3)]
    for r in rows:
        r["yFinal"] = False          # seated as a chain from its highest ground

    def bank(x, z):
        return -0.05 if x < 4.0 else 8.07
    assert climb_runs(rows) == {"place.rw.long-walk"}
    assert run_pad_patches(rows, "place.rw", bank) == []
    level = [_member(i, 4.0 * i, rise=CLIMB_STEP_M * 0.9 * i) for i in range(3)]
    assert climb_runs(level) == set()


def test_a_cut_never_goes_below_the_water():
    """Riverwalk fs00: the ferry landing's end cut to -0.284 m, 0.41 m into its
    bank and below the water; the piece is skipped, never clamped to a pit."""
    rows, ground, wet = _riverwalk()
    got = run_pad_patches(rows, "place.rw", ground, wet, water_at=lambda x, z: 0.3)
    assert got == []                         # line 0.18 is under the 0.3 m surface
    low = run_pad_patches(rows, "place.rw", ground, wet, water_at=lambda x, z: 0.1)
    assert len(low) == 1                     # a surface under the line still cuts


def test_a_cut_feathers_over_at_least_four_metres():
    """Riverwalk lw13: a 0.138 m cut with the default 3.0 m blend left a
    13.6 deg slope at the run end."""
    import math
    rows, ground, wet = _riverwalk()
    (patch,) = run_pad_patches(rows, "place.rw", ground, wet)
    assert patch["blendM"] >= 4.0
    overlay = pad_overlay.overlay_from_patch(patch, 2.745)
    padded = pad_overlay.ground(lambda x, z: 0.318 if x >= 53.0 else 0.0, [overlay])
    xs = [53.0 + 0.25 * k for k in range(50)]
    worst = max(math.degrees(math.atan2(abs(padded(b, 0.5) - padded(a, 0.5)), 0.25))
                for a, b in zip(xs, xs[1:]))
    assert worst < 12.0                      # walkwayRule's FLAT_DEG
