from collections import Counter

import numpy as np

from .adaptive_terrain import adaptive_terrain


def test_adaptive_preserves_native_channel_and_has_no_cracks_or_overlaps():
    z, x = np.mgrid[:33, :33]
    ground = 10 - z * .2 + np.abs(x - 15) * .4
    protected = np.zeros((32, 32), bool)
    protected[:, 14:17] = True
    vertices, triangles = adaptive_terrain(ground, protected)
    edges = Counter()
    area = 0
    for triangle in triangles:
        a, b, c = vertices[triangle]
        normal = np.cross(b - a, c - a)
        assert normal[1] > 0
        area += normal[1] / 2
        for i in range(3):
            edges[tuple(sorted((int(triangle[i]), int(triangle[(i + 1) % 3]))))] += 1
    assert area == 32 * 32
    for (ia, ib), count in edges.items():
        a, b = vertices[ia], vertices[ib]
        boundary = any(a[axis] == b[axis] == limit for axis in (0, 2) for limit in (0, 32))
        assert count == (1 if boundary else 2)
    by_xz = {(int(v[0]), int(v[2])): i for i, v in enumerate(vertices)}
    faces = {tuple(sorted(map(int, face))) for face in triangles}
    for row, column in np.argwhere(protected):
        a, b, c, d = [by_xz[p] for p in ((column, row), (column + 1, row),
                                        (column, row + 1), (column + 1, row + 1))]
        assert tuple(sorted((a, c, b))) in faces
        assert tuple(sorted((b, c, d))) in faces
    assert len(triangles) < 32 * 32 * 2 * .65
    assert np.array_equal(vertices[:, 1], ground[vertices[:, 2].astype(int), vertices[:, 0].astype(int)].astype(np.float32))


def test_independent_chunk_lods_share_every_native_boundary_vertex():
    z, x = np.mgrid[:17, :33]
    ground = np.sin(x) + np.cos(z)
    left, _ = adaptive_terrain(ground[:, :17], np.zeros((16, 16), bool), 4)
    right, _ = adaptive_terrain(ground[:, 16:], np.zeros((16, 16), bool), 2)
    a = left[left[:, 0] == 16][:, (2, 1)]
    b = right[right[:, 0] == 0][:, (2, 1)]
    assert np.array_equal(a[np.argsort(a[:, 0])], b[np.argsort(b[:, 0])])
    assert len(a) == 17


def test_fully_protected_grid_is_exact_native_geometry_and_deterministic():
    ground = np.arange(81).reshape(9, 9)
    mask = np.ones((8, 8), bool)
    a, ai = adaptive_terrain(ground, mask)
    b, bi = adaptive_terrain(ground, mask)
    assert len(ai) == 128
    assert len(a) == 81
    assert np.array_equal(a, b) and np.array_equal(ai, bi)


def test_sparse_diagonal_flips_force_native_cells_without_moving_heights():
    ground = np.arange(81).reshape(9, 9)
    flipped = np.zeros((8, 8), bool)
    flipped[3, 4] = True
    vertices, triangles = adaptive_terrain(ground, np.zeros((8, 8), bool), 4, flipped)
    by_xz = {(int(v[0]), int(v[2])): i for i, v in enumerate(vertices)}
    a, b, c, d = [by_xz[p] for p in ((4, 3), (5, 3), (4, 4), (5, 4))]
    faces = {tuple(map(int, face)) for face in triangles}
    assert (a, c, d) in faces and (a, d, b) in faces
    assert (a, c, b) not in faces
    assert np.array_equal(vertices[:, 1], ground[vertices[:, 2].astype(int), vertices[:, 0].astype(int)].astype(np.float32))


def test_unmodified_coarse_quad_uses_two_faces_without_unnecessary_centre_fan():
    vertices, triangles = adaptive_terrain(np.zeros((33, 33)), np.zeros((32, 32), bool), 4)
    coordinates = {(int(v[0]), int(v[2])) for v in vertices}
    assert (14, 14) not in coordinates
    inner = []
    for face in triangles:
        points = vertices[face][:, (0, 2)]
        if np.all(points >= 12) and np.all(points <= 16):
            inner.append(face)
    assert len(inner) == 2
