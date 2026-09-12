"""Closed depressions the terrain stages must not leave behind (Phase 16b, ruling 2).

A heightfield hollow with no outlet fills with water at compile time. Some
are the province's tarns and marsh pools and are wanted; the rest are
artefacts — the erosion solver's pits, detail noise on rough ground, a
fluvial cut that undershot — that rendered as deep mountain lakes. Two rules,
one helper:

* `fill_erosion_pits` (the sculpt, ruling 2 AS WRITTEN): "near-sea-level
  bowls inside high terrain that render as deep mountain lakes" — a closed
  depression whose spill stands above `min_z` while its floor lies under
  `floor_max_m` (a data hole in the source: 12 of the 16a bodies had floors
  at 0 under 30-120 m rims) is filled to its spill. Nothing else is: round
  1's "every depression under 1 ha above 30 m" filled ~100 mountain ponds
  and pools the owner had approved on the 16a map (2026-09-12).
* `fill_new_pits` (the shape stage): a depression that was NOT on the sculpt,
  above `min_z` and outside the wet ground where pools are meant, is an
  artefact of the shaping and is filled to its spill.

Both fill to the exact spill (a flat floor the standing-water solver sees as
dry ground); nothing is ever lowered.
"""

from __future__ import annotations

import numpy as np
from scipy import ndimage

from .scale import RAW_M
from .standing_water import CONN8, priority_fill

DEPRESSION_MIN_M = 0.15


def depression_depth(z: np.ndarray, sea: np.ndarray) -> np.ndarray:
    return (priority_fill(z, sea) - z).astype(np.float32)


def fill_erosion_pits(z: np.ndarray, sea: np.ndarray, min_z: float, floor_max_m: float,
                      mpp: float = RAW_M, log=print) -> tuple[np.ndarray, dict]:
    filled = priority_fill(z, sea)
    dep = (filled - z) > DEPRESSION_MIN_M
    lbl, n = ndimage.label(dep, structure=CONN8)
    if not n:
        return z, {"pitsFilled": 0, "pitsKept": 0}
    idx = np.arange(1, n + 1)
    spill = np.asarray(ndimage.maximum(filled, lbl, idx))
    floor = np.asarray(ndimage.minimum(z, lbl, idx))
    hole = (spill > min_z) & (floor < floor_max_m)
    fill_mask = np.concatenate([[False], hole])[lbl]
    out = np.where(fill_mask, filled, z).astype(np.float32)
    kept = int(((~hole) & (spill > min_z)).sum())
    log(f"  pits: {int(hole.sum())} erosion pits (spill above {min_z:.0f} m, floor under {floor_max_m:.0f} m) filled "
        f"({int(fill_mask.sum())} cells); {kept} other closed depressions above {min_z:.0f} m kept")
    return out, {"pitsFilled": int(hole.sum()), "pitsKept": kept, "cellsFilled": int(fill_mask.sum()),
                 "rule": f"spill > {min_z} m and floor < {floor_max_m} m (ruling 2)"}


def fill_new_pits(z: np.ndarray, reference: np.ndarray, sea: np.ndarray, min_z: float,
                  wet_mask: np.ndarray | None = None, log=print) -> tuple[np.ndarray, dict]:
    filled = priority_fill(z, sea)
    dep_new = (filled - z) > DEPRESSION_MIN_M
    dep_ref = depression_depth(reference, sea) > DEPRESSION_MIN_M
    lbl, n = ndimage.label(dep_new, structure=CONN8)
    if not n:
        return z, {"newPitsFilled": 0}
    idx = np.arange(1, n + 1)
    # a depression is NEW when none of its cells was in a depression before
    was = np.asarray(ndimage.maximum(dep_ref.astype(np.uint8), lbl, idx)) > 0
    spill = np.asarray(ndimage.maximum(filled, lbl, idx))
    high = spill > min_z
    wet = np.zeros(n, bool) if wet_mask is None else np.asarray(ndimage.mean(wet_mask.astype(np.float32), lbl, idx)) > 0.5
    fill = ~was & high & ~wet
    fill_mask = np.concatenate([[False], fill])[lbl]
    out = np.where(fill_mask, filled, z).astype(np.float32)
    log(f"  pits: {int(fill.sum())} new closed depressions above {min_z:.0f} m filled ({int(fill_mask.sum())} cells); "
        f"{int((~was & high & wet).sum())} new ones on wet ground kept")
    return out, {"newPitsFilled": int(fill.sum()), "cellsFilled": int(fill_mask.sum())}
