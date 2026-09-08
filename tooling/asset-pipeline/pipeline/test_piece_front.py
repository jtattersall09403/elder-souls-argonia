"""Deriving which way round a doorless piece goes (owner ruling 2026-09-07).

Paired throughout: one case the derivation must answer, one it must refuse.
A wrong front turns a gate to face the market; a refused front costs nothing,
because the validator lets a symmetric piece take any yaw.
"""

from __future__ import annotations

import numpy as np
import pytest

from . import piece_front as pf


# --------------------------------------------------------------------------- #
# (a) co-placement: the bearing away from the neighbours the authors planted
# --------------------------------------------------------------------------- #
def _mine(groups=(), templates=()) -> dict:
    return {"sets": {"vanilla": {"groups": list(groups), "templates": list(templates)}}}


def _group(anchor: str, parts, count: int = 12) -> dict:
    return {"anchor": anchor, "count": count,
            "parts": [{"part": pid, "offsetM": [x, y, 0.0], "yawDeg": yaw}
                      for pid, x, y, yaw in parts]}


def _samples(mine) -> dict:
    """`load_coplacements` reading a mine written to a scratch file — the same
    path production takes, so the frame conversion is under test too."""
    import json
    import tempfile
    from pathlib import Path
    path = Path(tempfile.mkdtemp()) / "mine.json"
    path.write_text(json.dumps(mine))
    return pf.load_coplacements(path)


def test_the_front_is_the_bearing_away_from_where_the_authors_stood_the_neighbours():
    """Neighbours to the piece's north (+y in the mine's z-up frame, bearing 0),
    so the outside face is due south."""
    mine = _mine([_group("kit:wall01", [("kit:hut01", 0.0, 6.0, 0.0),
                                        ("kit:hut02", 1.0, 6.0, 0.0)])])
    got = pf.coplacement_front(_samples(mine)["kit:wall01"])
    assert got is not None
    assert got[0] == pytest.approx(180.0, abs=6.0)


def test_a_part_answers_in_its_own_frame_not_the_anchors():
    """The same wall, but the authors turned it 90° when they planted it: the
    front is still the same FACE of the mesh, so the answer must rotate back."""
    mine = _mine([_group("kit:hut01", [("kit:wall01", 0.0, -6.0, 90.0)])])
    samples = _samples(mine)
    got = pf.coplacement_front(samples["kit:wall01"])
    assert got is not None
    # the hut lies due north of the wall in world terms (bearing 0), so the
    # outside is 180 in the anchor's frame and 90 in the wall's own.
    assert got[0] == pytest.approx(90.0, abs=6.0)


def test_a_piece_the_authors_planted_every_which_way_gets_no_front():
    """No modal side, so no answer: an unopinionated piece takes any yaw."""
    mine = _mine([_group("kit:block01", [("kit:x", 0.0, 5.0, 0.0)], count=4),
                  _group("kit:block01", [("kit:x", 5.0, 0.0, 0.0)], count=4),
                  _group("kit:block01", [("kit:x", 0.0, -5.0, 0.0)], count=4),
                  _group("kit:block01", [("kit:x", -5.0, 0.0, 0.0)], count=4)])
    assert pf.coplacement_front(_samples(mine)["kit:block01"]) is None


def test_a_piece_placed_once_is_not_evidence():
    mine = _mine([_group("kit:rare01", [("kit:x", 0.0, 5.0, 0.0)], count=1)])
    assert pf.coplacement_front(_samples(mine)["kit:rare01"]) is None


def test_a_wall_chained_to_a_copy_of_itself_says_nothing_about_its_front():
    """A self-chain records how a modular piece tiles, not which side faced the
    field, so it is dropped before the mode is taken."""
    mine = _mine(templates=[{"anchor": "kit:wall01", "part": "kit:wall01",
                             "sideDeg": 90.0, "yawDeg": 0.0, "count": 40,
                             "selfChain": True}])
    assert _samples(mine).get("kit:wall01") is None


# --------------------------------------------------------------------------- #
# (b) asymmetry: the face the modeller detailed
# --------------------------------------------------------------------------- #
def _quad(x0, x1, z0, z1, y0=0.0, y1=4.0, rows=1, cols=1):
    """A vertical wall panel between (x0,z0) and (x1,z1), diced into
    rows x cols quads: more dice, more triangles, same area."""
    tris = []
    for i in range(cols):
        for j in range(rows):
            ax = x0 + (x1 - x0) * i / cols
            bx = x0 + (x1 - x0) * (i + 1) / cols
            az = z0 + (z1 - z0) * i / cols
            bz = z0 + (z1 - z0) * (i + 1) / cols
            ly = y0 + (y1 - y0) * j / rows
            hy = y0 + (y1 - y0) * (j + 1) / rows
            tris.append([[ax, ly, az], [bx, ly, bz], [bx, hy, bz]])
            tris.append([[ax, ly, az], [bx, hy, bz], [ax, hy, az]])
    return tris


def _box(front_rows=1, front_cols=1):
    """A square box 8 m on a side. Its NORTH panel (z = -4) is diced
    `front_rows x front_cols`; the other three are plain quads."""
    tris = []
    tris += _quad(-4, 4, -4, -4, rows=front_rows, cols=front_cols)   # north
    tris += _quad(-4, 4, 4, 4, rows=1, cols=1)                       # south
    tris += _quad(-4, -4, -4, 4, rows=1, cols=1)                     # west
    tris += _quad(4, 4, -4, 4, rows=1, cols=1)                       # east
    return np.array(tris, dtype=float)


def test_the_detailed_face_is_the_front():
    got = pf.asymmetry_front(_box(front_rows=6, front_cols=8))
    assert got is not None
    assert min(abs(got[0] - 0.0), abs(got[0] - 360.0)) < 30.0


def test_a_box_with_four_identical_faces_has_no_front():
    assert pf.asymmetry_front(_box(front_rows=1, front_cols=1)) is None


def test_the_broken_end_of_a_wall_is_not_a_face():
    """A slab piece: its west END is diced into rubble, its two broad faces are
    plain. The end must not win, because it is not a face — the derivation
    should refuse rather than turn the wall along its own length."""
    tris = []
    tris += _quad(-10, 10, -1, -1)                       # north broad face
    tris += _quad(-10, 10, 1, 1)                         # south broad face
    tris += _quad(-10, -10, -1, 1, rows=8, cols=8)       # the broken west end
    got = pf.asymmetry_front(np.array(tris, dtype=float))
    assert got is None or abs((got[0] - 270.0 + 180.0) % 360.0 - 180.0) > 45.0


# --------------------------------------------------------------------------- #
# the ranking
# --------------------------------------------------------------------------- #
def test_how_the_authors_planted_it_outranks_how_it_was_modelled():
    mine = _mine([_group("kit:wall01", [("kit:hut01", 0.0, 6.0, 0.0)])])
    front = pf.derive_front("kit:wall01", _box(front_rows=6, front_cols=8),
                            _samples(mine))
    assert front["evidence"] == "co-placement"
    assert front["outside"] is True
    assert front["deg"] == pytest.approx(180.0, abs=6.0)


def test_a_symmetric_piece_nobody_repeated_gets_no_front_at_all():
    assert pf.derive_front("kit:block01", _box(), {}) is None
