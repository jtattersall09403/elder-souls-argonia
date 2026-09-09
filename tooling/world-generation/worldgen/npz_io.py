"""Deterministic `.npz` writing.

An `.npz` is a zip, and a zip carries a per-entry wall-clock stamp. Older
numpy wrote the real clock into it, so `water-pass1.npz`, `hydrology-pass1.npz`
and `channels-pass1.npz` differed on every run even when their arrays were
identical — the chain's stamp book then re-ran everything downstream of an
unchanged pass, and no `.npz` could be diffed at all.

**Measured 2026-09-09: numpy 2.4.6, the version this repo runs, already pins
that stamp to the zip epoch, so the churn the polish backlog attributed to
timestamps is not what is happening here** — an `.npz` that differs between two
runs on this numpy differs in its ARRAYS. This module keeps the guarantee
anyway and makes it independent of the numpy version, which is the point:
determinism in world building is engineering standard 4, and the chain's
acceptance test is a byte-identical diff.

It is a LEAF module: it imports nothing from worldgen, so using it never widens
a stage's fingerprint closure.
"""

from __future__ import annotations

import io
import zipfile
from pathlib import Path

import numpy as np

#: The zip epoch. Any fixed value would do; this is the earliest a zip can hold.
FIXED_DATE_TIME = (1980, 1, 1, 0, 0, 0)


def savez(path, *, compressed: bool = True, **arrays) -> Path:
    """Write `arrays` to `path` as a `.npz` with no wall-clock timestamps."""
    path = Path(path)
    if path.suffix != ".npz":
        path = path.with_name(path.name + ".npz")
    buf = io.BytesIO()
    (np.savez_compressed if compressed else np.savez)(buf, **arrays)
    buf.seek(0)
    tmp = path.with_name(path.name + ".tmp")
    with zipfile.ZipFile(buf) as src, zipfile.ZipFile(tmp, "w") as dst:
        for info in src.infolist():
            pinned = zipfile.ZipInfo(info.filename, date_time=FIXED_DATE_TIME)
            pinned.compress_type = info.compress_type
            pinned.external_attr = info.external_attr
            pinned.create_system = info.create_system
            dst.writestr(pinned, src.read(info.filename))
    tmp.replace(path)
    return path
