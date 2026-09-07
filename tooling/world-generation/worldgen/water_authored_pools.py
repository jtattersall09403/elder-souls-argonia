"""Add whole authored pond basins without weakening incidental-puddle filters."""

import numpy as np


def retain_authored_pool_basins(existing, labels, authored_hollows, maximum_depth, areas,
                               web_step=1):
    """Explicitly carved ponds use the existing marsh size/depth thresholds.

    Steep basin sides and coarse surrounding land labels do not invalidate a
    flat pond. The footprint identifies intent; complete terrain depression
    components identify the water domain. Smaller hollows remain audit targets.
    Callers must supply a verified footprint on this terrain's sampling grid.
    """
    if (labels.shape != authored_hollows.shape or authored_hollows.dtype != np.bool_
            or labels.dtype.kind not in 'iu' or existing.dtype != np.bool_
            or maximum_depth.shape != areas.shape or len(existing) != len(areas) + 1
            or labels.min(initial=0) < 0 or labels.max(initial=0) >= len(existing)
            or not np.isfinite(web_step) or web_step <= 0):
        raise ValueError('Authored pool selection requires matching component and footprint grids')
    touched = np.bincount(labels[authored_hollows], minlength=len(existing)) > 0
    added = np.zeros_like(existing)
    added[1:] = touched[1:] & (maximum_depth >= .10) & (areas >= 6 * (2 / web_step) ** 2)
    return existing | added
