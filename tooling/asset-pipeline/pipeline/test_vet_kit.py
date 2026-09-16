"""The geometric measurements vet_kit records for the placement passes.

Synthetic geometry, so the expected answers are known by construction: a
closed box has a full underside and no open face; a four-wall shell with one
side removed has no underside and a hole in one bearing.
"""

import numpy as np

from pipeline import vet_kit


def _quad(a, b, c, d):
    """Two triangles wound so the face normal points OUT of the cube."""
    return [[a, d, c], [a, c, b]]


def _box(open_side: str | None = None, floor: bool = True):
    """Unit cube (Y-up), outward faces, optionally missing one wall/floor."""
    p = {k: np.array(v, dtype="f8") for k, v in {
        "000": (0, 0, 0), "100": (1, 0, 0), "110": (1, 1, 0), "010": (0, 1, 0),
        "001": (0, 0, 1), "101": (1, 0, 1), "111": (1, 1, 1), "011": (0, 1, 1),
    }.items()}
    tris = []
    tris += _quad(p["010"], p["110"], p["111"], p["011"])         # top (+Y)
    if floor:
        tris += _quad(p["000"], p["001"], p["101"], p["100"])     # bottom (-Y)
    if open_side != "-Z":
        tris += _quad(p["000"], p["100"], p["110"], p["010"])     # -Z
    if open_side != "+Z":
        tris += _quad(p["001"], p["011"], p["111"], p["101"])     # +Z
    if open_side != "-X":
        tris += _quad(p["000"], p["010"], p["011"], p["001"])     # -X
    if open_side != "+X":
        tris += _quad(p["100"], p["101"], p["111"], p["110"])     # +X
    return np.array(tris)


def _measure(tris):
    normals, area = vet_kit._face_normals(tris)
    return (vet_kit._underside_closed(tris, normals),
            vet_kit._open_back_yaw(normals, area))


def test_a_closed_box_is_closed_underneath_and_has_no_open_back():
    coverage, yaw = _measure(_box())
    assert coverage > vet_kit._UNDERSIDE_CLOSED
    assert yaw is None


def test_a_floorless_box_has_no_underside():
    coverage, _ = _measure(_box(floor=False))
    assert coverage == 0.0


def test_a_missing_wall_reads_as_an_open_back_on_that_bearing():
    """Bearing is degrees from +Z toward +X, so a missing -Z wall is 180."""
    _, yaw = _measure(_box(open_side="-Z"))
    assert yaw == 180.0
    _, yaw = _measure(_box(open_side="+X"))
    assert yaw == 90.0


def test_an_upward_facing_shell_has_no_underside():
    """A dome of top faces only: nothing points down, so nothing to rest on."""
    tris = _box(floor=False)
    normals, _ = vet_kit._face_normals(tris)
    assert vet_kit._underside_closed(tris, normals) == 0.0
