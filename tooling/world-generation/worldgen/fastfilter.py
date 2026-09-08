"""Threaded Gaussian blur over the province rasters — same bytes, 8 cores.

The land-cover bake spends most of its time in one place: `gaussian_filter`
over full-province float rasters at sigmas of 30-120 px (the broad patch,
wear and belt-wobble noise fields). At those widths scipy's separable kernel
is hundreds of taps wide and a single blur of one raster is tens of seconds
of one core, while seven cores sit idle.

`gaussian` splits that work into bands and runs them in threads. It is not
an approximation and not an FFT: it calls the SAME `scipy.ndimage` routine on
each band, and `scipy.ndimage` releases the GIL, so the threads run in
parallel for real (3.5-4x on eight cores at the sigmas this repo uses).

Why the bytes cannot move:

* `gaussian_filter` is separable — a pass along axis 0, then along axis 1.
* The axis-0 pass treats each COLUMN independently, so it is split by columns;
  the axis-1 pass treats each ROW independently, so it is split by rows.
  Neither split needs an overlap and neither touches a boundary the whole-
  array call would have handled differently: every band sees exactly the
  neighbourhood the serial pass gave it.

`test_fastfilter.py` asserts equality against `ndimage.gaussian_filter`.
"""

from __future__ import annotations

import os
from concurrent.futures import ThreadPoolExecutor

import numpy as np
from scipy import ndimage

# Below this many samples the thread hand-off costs more than the blur.
MIN_SAMPLES = 1 << 20


def workers() -> int:
    return max(1, min(8, os.cpu_count() or 1))


def _bands(n: int, parts: int):
    edges = np.linspace(0, n, parts + 1).round().astype(int)
    return [(int(a), int(b)) for a, b in zip(edges[:-1], edges[1:]) if b > a]


def gaussian(a: np.ndarray, sigma: float, mode: str = "reflect") -> np.ndarray:
    """`ndimage.gaussian_filter(a, sigma, mode=mode)`, computed in threads."""
    n = workers()
    if a.ndim != 2 or n == 1 or a.size < MIN_SAMPLES or mode != "reflect":
        return ndimage.gaussian_filter(a, sigma, mode=mode)
    rows, cols = _bands(a.shape[0], n), _bands(a.shape[1], n)
    if len(rows) < 2 or len(cols) < 2:
        return ndimage.gaussian_filter(a, sigma, mode=mode)

    down = np.empty_like(a)
    across = np.empty_like(a)

    def down_columns(band):
        c0, c1 = band
        down[:, c0:c1] = ndimage.gaussian_filter1d(a[:, c0:c1], sigma, axis=0, mode=mode)

    def across_rows(band):
        r0, r1 = band
        across[r0:r1] = ndimage.gaussian_filter1d(down[r0:r1], sigma, axis=1, mode=mode)

    with ThreadPoolExecutor(n) as pool:
        list(pool.map(down_columns, cols))
        list(pool.map(across_rows, rows))
    return across
