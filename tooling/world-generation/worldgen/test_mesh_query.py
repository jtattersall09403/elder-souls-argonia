"""cast_rays (chunked) returns exactly what one unchunked
`intersects_location` call returns, per ray, with ray indices into the full
input (memory fix 2026-09-30: the unchunked call grew as rays x triangles)."""
from __future__ import annotations

import numpy as np
import pytest

trimesh = pytest.importorskip("trimesh")

from . import mesh_query as raycast  # the module under test  # noqa: E402


def _fixture():
    a = trimesh.creation.icosphere(subdivisions=3, radius=1.0)
    b = trimesh.creation.box(extents=(0.6, 0.6, 3.0))
    b.apply_translation((0.4, 0.2, 0.0))
    mesh = trimesh.util.concatenate([a, b])
    rng = np.random.default_rng(7)
    n = 3 * raycast.RAY_CHUNK + 37                 # several chunks and a ragged tail
    xy = rng.uniform(-1.3, 1.3, (n, 2))             # some rays miss
    origins = np.column_stack([xy, np.full(n, 3.0)])
    dirs = np.tile([0.0, 0.0, -1.0], (n, 1))
    return mesh, origins, dirs


def _canon(locs, rays, tris):
    order = np.lexsort((np.round(locs[:, 2], 9), tris, rays))
    return np.asarray(rays)[order], np.asarray(tris)[order], np.asarray(locs)[order]


@pytest.mark.parametrize("multiple_hits", [False, True])
def test_chunked_equals_unchunked(multiple_hits):
    mesh, origins, dirs = _fixture()
    ref = mesh.ray.intersects_location(origins, dirs, multiple_hits=multiple_hits)
    got = raycast.cast_rays(mesh, origins, dirs, multiple_hits=multiple_hits)
    r0, t0, l0 = _canon(np.asarray(ref[0]).reshape(-1, 3), np.asarray(ref[1]), np.asarray(ref[2]))
    r1, t1, l1 = _canon(*got)
    assert len(origins) // 3 < len(r0)               # the fixture hits and misses
    assert np.array_equal(r0, r1) and np.array_equal(t0, t1)
    assert np.allclose(l0, l1, atol=1e-9)


def test_single_direction_and_empty():
    mesh, origins, _ = _fixture()
    full = raycast.cast_rays(mesh, origins, np.tile([0.0, 0.0, -1.0], (len(origins), 1)))
    one = raycast.cast_rays(mesh, origins, [0.0, 0.0, -1.0])
    assert all(np.array_equal(a, b) for a, b in zip(full, one))
    locs, rays, tris = raycast.cast_rays(mesh, np.zeros((0, 3)), [0.0, 0.0, -1.0])
    assert locs.shape == (0, 3) and len(rays) == 0 and len(tris) == 0


def test_on_surface_chunked_equals_unchunked():
    from trimesh.proximity import ProximityQuery
    mesh, _, _ = _fixture()
    rng = np.random.default_rng(11)
    pts = rng.uniform(-1.5, 1.5, (2 * raycast.POINT_CHUNK + 101, 3))
    c0, d0, t0 = ProximityQuery(mesh).on_surface(pts)
    c1, d1, t1 = raycast.on_surface(mesh, pts)
    assert np.array_equal(t0, t1) and np.allclose(d0, d1, atol=1e-12) and np.allclose(c0, c1, atol=1e-12)
    small = raycast.on_surface(ProximityQuery(mesh), pts[:5])
    assert np.array_equal(small[2], t0[:5])
