import numpy as np

from .compile_chunks import CHUNK, chunk_grid


def _height(n=600, m=520):
    yy, xx = np.mgrid[0:n, 0:m].astype(np.float32)
    return np.sin(yy / 37.0) * 8 + np.cos(xx / 23.0) * 5


def test_lod0_chunks_reassemble_exactly():
    h = _height()
    out = np.full(h.shape, np.nan, dtype=np.float32)
    for cx, cy, lods in chunk_grid(h):
        arr = lods[1]
        y0, x0 = cy * CHUNK, cx * CHUNK
        out[y0:y0 + arr.shape[0], x0:x0 + arr.shape[1]] = arr
    assert not np.isnan(out).any()
    assert np.allclose(out, h)   # overlap rows agree with neighbours


def test_lods_shapes_and_overlap():
    h = _height()
    for cx, cy, lods in chunk_grid(h):
        assert lods[1].shape[0] <= CHUNK + 1 and lods[1].shape[1] <= CHUNK + 1
        for f in (2, 4):
            assert lods[f].shape[0] == (lods[1].shape[0] + f - 1) // f
    # interior chunks carry the +1 overlap row/column
    first = next(iter(chunk_grid(h)))
    assert first[2][1].shape == (CHUNK + 1, CHUNK + 1)


def test_determinism():
    h = _height()
    a = [lods[2] for _, _, lods in chunk_grid(h)]
    b = [lods[2] for _, _, lods in chunk_grid(h)]
    assert all(np.array_equal(x, y) for x, y in zip(a, b))
