"""Capability-profile validation of the world build (Phase 7, master plan §52).

Every settlement anchor must offer a walkable spawn for the baseline grounded
capability profile: some ground inside the anchor's tolerance radius that is
above sea level and whose slope, on the runtime ×5 geometry, stays within the
profile's max walkable slope. Values cross-reference
`packages/game-core/src/physics/capabilityProfiles.ts` (derived from live
movement tuning; ecctrl default slopeMaxAngle = 1 rad ≈ 57.3°).
"""

import json
from pathlib import Path

import numpy as np
import pytest

from .compile_chunks import DEFAULT_HEIGHTS

REPO_ROOT = Path(__file__).resolve().parents[3]
ANCHORS = REPO_ROOT / "world" / "sources" / "anchors" / "settlement-anchors.json"
REFINED = DEFAULT_HEIGHTS

MPS = 5.48352            # metres/sample, refined grid (×3 baked)
VERTICAL_SCALE = 5       # decision 0006 addendum: applied where data -> geometry
MAX_WALKABLE_SLOPE_DEG = 57.3   # ecctrl slopeMaxAngle default (1 rad)
MIN_WALKABLE_PATCH_SAMPLES = 9  # ~3x3 samples ≈ 16 m × 16 m of standable ground


@pytest.mark.skipif(not REFINED.exists(), reason="vault refined heights unavailable")
def test_every_settlement_anchor_has_a_walkable_spawn():
    heights = np.load(REFINED)
    extent_m = (heights.shape[0] - 1) * MPS
    anchors = json.loads(ANCHORS.read_text())["anchors"]
    # Runtime slope per cell on the ×5 geometry.
    gy, gx = np.gradient(heights * VERTICAL_SCALE, MPS)
    slope_deg = np.degrees(np.arctan(np.hypot(gx, gy)))

    failures = []
    for anchor in anchors:
        cx = anchor["u"] * extent_m / MPS
        cy = anchor["v"] * extent_m / MPS
        radius = max(anchor["toleranceUV"] * extent_m / MPS, 6)
        x0 = int(max(0, cx - radius))
        x1 = int(min(heights.shape[1], cx + radius + 1))
        y0 = int(max(0, cy - radius))
        y1 = int(min(heights.shape[0], cy + radius + 1))
        patch_h = heights[y0:y1, x0:x1]
        patch_s = slope_deg[y0:y1, x0:x1]
        walkable = (patch_h > 0.2) & (patch_s < MAX_WALKABLE_SLOPE_DEG)
        if int(walkable.sum()) < MIN_WALKABLE_PATCH_SAMPLES:
            failures.append(
                f"{anchor['id']}: {int(walkable.sum())} walkable samples "
                f"(max height {patch_h.max():.1f} m, min slope {patch_s.min():.0f}°)")
    assert not failures, "anchors without a walkable spawn:\n" + "\n".join(failures)
