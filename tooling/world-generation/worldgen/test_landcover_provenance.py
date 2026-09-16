"""The shipped ground paint agrees with the water record (decision 0066).

The bake stamps a PROVENANCE raster: for every texel a water rule decided,
the kind index of the water that decided it (`ground-paint-provenance.png`,
0 where no water rule ran). That tracked raster is what makes "BC_MUD at
water" expressible: the same mud painted inland as a region's damp slot
carries provenance 0 and is not a water decision at all. Texels with
provenance 0 are therefore not judged here.

This gate asks two things of every stamped texel:

* the CONTRACT — its material is in `landcover.WATER_DERIVED` and the
  stamped kind is one `landcover.WATER_PAINT_KINDS` allows for that material.
  The control map carries the top TWO materials per texel (id0/id1) because
  the bake blurs the material masks, so a texel passes if EITHER is a legal
  pair — measured: on a 1200^2 sample of real ground, judging id0 alone
  reported 269 mismatches where 64 survive reading both, the rest blend-edge
  texels whose painted material is id1;
* the RECORD JOIN — the nearest wet-season wet texel within 60 m carries a
  graph entity whose kind IS the stamped kind.

A material-only proxy was tried first and measured 105,836 mismatches on the
2026-09-16 shipped map out of 1,018,081 sampled texels — but most of those
were region-palette ground (eleven of the thirteen water materials double as
a palette's damp/wet/litter slot), not re-derived water, which is why the
gate reads the tracked raster instead of guessing from the material id.

It measures published rasters (generated, not committed), so it skips on a
clean checkout without them.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest
from PIL import Image
from scipy import ndimage

from .landcover import WATER_DERIVED, WATER_PAINT_KINDS
from .scale import RAW_M

REPO_ROOT = Path(__file__).resolve().parents[3]
PROVINCE = REPO_ROOT / "apps" / "world-studio" / "public" / "province"
CONTROL = PROVINCE / "refined" / "ground-control.png"
PROV = PROVINCE / "refined" / "ground-paint-provenance.png"
SUBSAMPLE = 4          # every 4th texel in each axis (~7.3 m apart)
SEARCH_M = 60.0        # how far a shore band can reach from its water
TOLERANCE = 0.005      # 0.5 % of sampled water-painted texels, for edge blur


def _load():
    if not CONTROL.exists() or not PROV.exists() \
            or not (PROVINCE / "water" / "water-id.png").exists():
        pytest.skip("no published ground paint / provenance / water bundle here")
    from .water_report import ShippedWater
    return (np.asarray(Image.open(CONTROL).convert("RGBA")),
            np.asarray(Image.open(PROV).convert("L")),
            ShippedWater(heights=None))


def test_water_painted_ground_agrees_with_the_record():
    control, prov, water = _load()
    assert prov.shape == control.shape[:2], "the provenance raster is not the paint's grid"
    kind = water.kind_index_grid()
    assert kind is not None, "the shipped bundle carries no water-id.png"
    names = water.kind_names()

    # Nearest wet-season wet texel on the water's own grid, read on the paint grid.
    wet = water.wet_grid("wet")
    dist, (iy, ix) = ndimage.distance_transform_edt(~wet, return_indices=True)
    near_kind = kind[iy, ix]
    near_d = (dist * water.mpp2).astype(np.float32)

    rows = np.arange(0, control.shape[0], SUBSAMPLE)
    gy = np.clip((rows * RAW_M / water.mpp2).astype(np.int64), 0, wet.shape[0] - 1)
    mat = control[..., 0][np.ix_(rows, rows)]
    mat1 = control[..., 1][np.ix_(rows, rows)]
    p = prov[np.ix_(rows, rows)]
    k = near_kind[np.ix_(gy, gy)]
    d = near_d[np.ix_(gy, gy)]

    painted = p > 0
    total = int(painted.sum())
    assert total, "the shipped provenance raster stamps nothing: the paint is not from the record"

    # (a) the contract: material and stamped kind must be a legal pair.
    legal = np.zeros((256, 256), dtype=bool)
    for material, kinds in WATER_PAINT_KINDS.items():
        for i, nm in enumerate(names):
            if nm in kinds:
                legal[material, i] = True
    ok = (legal[mat.astype(np.int64), p.astype(np.int64)]
          | legal[mat1.astype(np.int64), p.astype(np.int64)])
    off_contract = painted & ~ok
    # (b) the record join: the water nearest this texel IS the water that
    # decided it, and it has an entity id.
    no_id = painted & ((d > SEARCH_M) | (k == 0))
    mismatched = painted & ~no_id & (k != p)

    report = []
    for material in sorted(WATER_DERIVED):
        sel = painted & ((mat == material) | (mat1 == material))
        if not sel.any():
            continue
        report.append(f"  material {material:2d}: {int(sel.sum()):8d} painted  "
                      f"off contract {int((off_contract & sel).sum()):7d}  "
                      f"no id {int((no_id & sel).sum()):7d}  "
                      f"disagreeing kind {int((mismatched & sel).sum()):7d}")
    derived = np.array(sorted(WATER_DERIVED), dtype=mat.dtype)
    stray = painted & ~(np.isin(mat, derived) | np.isin(mat1, derived))
    print(f"\nwater-painted ground vs the record ({total} stamped texels of "
          f"{mat.size} sampled, every {SUBSAMPLE}th):")
    print("\n".join(report))
    print(f"  stamped but NOT a water-derived material {int(stray.sum())}")
    print(f"  TOTAL off contract {int(off_contract.sum())}, paint class with no id "
          f"{int(no_id.sum())}, disagreeing kind {int(mismatched.sum())} "
          f"(tolerance {TOLERANCE:.1%} = {int(total * TOLERANCE)})")

    bad = int((off_contract | no_id | mismatched).sum())
    assert bad <= total * TOLERANCE, (
        f"{bad} of {total} water-painted texels disagree with the record: "
        f"{int(off_contract.sum())} material/kind pairs WATER_PAINT_KINDS does not "
        f"allow, {int(no_id.sum())} with no entity id within {SEARCH_M:.0f} m, "
        f"{int(mismatched.sum())} whose nearest water is a different kind")
