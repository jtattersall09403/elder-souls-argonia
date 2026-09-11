"""Position-seeded Gaussian noise fields — the same value at the same place,
whatever window you ask for.

A field drawn from an `np.random.default_rng(SEED)` stream is a property of
the DRAW ORDER, not of the ground: re-drawing one window of the province
gives different numbers, so a bake using such noise can only ever be run
whole. Here the value at absolute sample (y, x) is a pure function of
(y, x, salt, seed): an integer hash (splitmix64-style, vectorised in uint64)
produces white noise, `scipy.special.ndtri` maps it to a standard normal, and
`fastfilter.gaussian` smooths it to the requested sigma.

Two properties make a windowed bake possible:

* **No draw order.** `normal_field((h, w), sigma, salt, origin=(y0, x0))`
  computes the white noise on the window padded by `ceil(4 * sigma)` (the
  hash is defined at negative coordinates too, so the pad never clips),
  filters, then crops — equal to the crop of the global field to float error,
  because scipy's Gaussian truncates at 4 sigma.
* **Fixed normalisation.** Unit-variance white noise convolved with a 2-D
  Gaussian of width sigma has standard deviation `1 / (2 * sqrt(pi) * sigma)`.
  Scaling by that ANALYTIC constant (never by the field's own measured std)
  means a window and the whole province are scaled identically.

`sigma=0` returns the white noise itself.
"""

from __future__ import annotations

import hashlib
import math

import numpy as np
from scipy.special import ndtri

from .fastfilter import gaussian

# Default seed for province bakes (shape_province.SEED, kept in one place).
SEED_DEFAULT = 20260823

_M1 = np.uint64(0x9E3779B97F4A7C15)
_M2 = np.uint64(0xBF58476D1CE4E5B9)
_M3 = np.uint64(0x94D049BB133111EB)
_S30, _S27, _S31, _S11 = (np.uint64(30), np.uint64(27), np.uint64(31),
                          np.uint64(11))


def salt_key(salt: str) -> np.uint64:
    """Stable 64-bit key for a salt string.

    Deliberately NOT the builtin `hash()`: that is randomised per process
    (PYTHONHASHSEED), which would make the bake non-reproducible.
    """
    return np.uint64(int.from_bytes(
        hashlib.blake2b(salt.encode("utf-8"), digest_size=8).digest(), "big"))


def _splitmix(z: np.ndarray) -> np.ndarray:
    z = (z ^ (z >> _S30)) * _M2
    z = (z ^ (z >> _S27)) * _M3
    return z ^ (z >> _S31)


def white_field(shape, salt: str, origin=(0, 0), seed: int = SEED_DEFAULT):
    """Unit-variance white noise whose value depends only on (y, x, salt, seed)."""
    h, w = int(shape[0]), int(shape[1])
    y = (np.arange(h, dtype=np.int64) + int(origin[0])).astype(np.uint64)[:, None]
    x = (np.arange(w, dtype=np.int64) + int(origin[1])).astype(np.uint64)[None, :]
    with np.errstate(over="ignore"):
        k = salt_key(salt) ^ (np.uint64(seed & 0xFFFFFFFFFFFFFFFF) * _M1)
        z = _splitmix(y * _M1 + k) ^ _splitmix(x * _M2 + k)
        bits = _splitmix(z)
    u = (bits >> _S11).astype(np.float64) * (1.0 / 9007199254740992.0)
    np.clip(u, 1e-12, 1.0 - 1e-12, out=u)
    return ndtri(u).astype(np.float32)


def normal_field(shape, sigma: float, salt: str, origin=(0, 0),
                 seed: int = SEED_DEFAULT) -> np.ndarray:
    """Unit-std Gaussian-smoothed noise field, windowable by `origin`."""
    sigma = float(sigma)
    if sigma <= 0.0:
        return white_field(shape, salt, origin, seed)
    h, w = int(shape[0]), int(shape[1])
    pad = int(math.ceil(4.0 * sigma))
    big = white_field((h + 2 * pad, w + 2 * pad), salt,
                      (int(origin[0]) - pad, int(origin[1]) - pad), seed)
    field = gaussian(big, sigma)[pad:pad + h, pad:pad + w]
    scale = np.float32(2.0 * math.sqrt(math.pi) * sigma)
    return np.ascontiguousarray(field * scale, dtype=np.float32)
