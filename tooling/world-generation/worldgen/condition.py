"""Interior terrain conditioning — owner-chosen 'mild' (decision 0005,
re-revised 2026-08-23 at the Phase 6 gate; was strong, before that mild).

Land above THRESHOLD keeps KEEP of its excess height, weighted by an
interiorness mask so border mountains and coasts keep their source shape.
Must stay numerically in step with the preview in apps/world-studio/src/App.tsx.
"""

from __future__ import annotations

import numpy as np

THRESHOLD = 20.0
KEEP = 0.5
EDGE_PROTECT = 0.10   # no change within this fraction of any map edge
EDGE_RAMP_END = 0.22  # full effect beyond this fraction


def interiorness(height: int, width: int) -> np.ndarray:
    """Smoothstep 0 (map edge) -> 1 (deep interior), matching the studio."""
    xs = np.arange(width, dtype=np.float32)
    ys = np.arange(height, dtype=np.float32)
    ex = np.minimum(xs / width, (width - 1 - xs) / width)[None, :]
    ey = np.minimum(ys / height, (height - 1 - ys) / height)[:, None]
    edge = np.minimum(ex, ey)
    t = np.clip((edge - EDGE_PROTECT) / (EDGE_RAMP_END - EDGE_PROTECT), 0.0, 1.0)
    return (t * t * (3 - 2 * t)).astype(np.float32)


def condition(grid: np.ndarray) -> np.ndarray:
    """Apply mild interior compression to a heightfield in metres."""
    w = interiorness(*grid.shape)
    excess = np.maximum(grid - THRESHOLD, 0.0)
    return np.where(
        grid > THRESHOLD,
        THRESHOLD + excess * (1.0 - w * (1.0 - KEEP)),
        grid,
    ).astype(np.float32)


def base_terrain(height_path) -> np.ndarray:
    """The authoritative base heightfield (image orientation, true metres).

    Phase 6b: if worldgen.sculpt_province has produced a sculpted base next to
    the raw heightfield, every compiler consumes that one surface (orogeny +
    naturalness already applied); otherwise fall back to conditioning the raw
    source. Keeps hydrology and refinement solving on the same terrain.
    """
    from pathlib import Path
    height_path = Path(height_path)
    sculpted = height_path.parent / "heightfield-sculpted-f32.npy"
    if sculpted.exists():
        return np.load(sculpted)
    return condition(np.flipud(np.load(height_path)))
