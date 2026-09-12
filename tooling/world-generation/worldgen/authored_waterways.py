"""Carve the authored minor waterways into the refined terrain.

The natural channels are SOLVED from the hydrology graph; an authored minor
waterway is not in that graph at all, so nothing ever cuts it and the compiler
has no trench to fill.  These lines are therefore CARVED, from the absolute
centrelines in ``world/sources/routes/authored-minor-waterways.json`` (loaded
through :func:`worldgen.hydrology_intent.load_authored_minor_waterways`, the
pre-water intent layer — never from a published water raster or route, so the
dock promise this feeds is not validated circularly).

The level is taken from the natural water solution the carve already holds
(``bodies.level_with_sea``): the trench is cut to that receiving surface minus
the promised navigable depth for its hull class, and it is extended from its
endpoints to the nearest wet cell so it JOINS the receiving body — a trench
that stops short of the water is a dam and never fills.  Ground beyond the
channel width plus a short shoulder is left exactly as it was: the bank the
landing stands on is not re-graded.

Applied as a `poling-channel` terrain PATCH on the frozen base (:mod:`worldgen.terrain_patches`, Phase 16b); formerly run inside the refine, after
``channels.carve`` and on the same full-res sample grid.
"""

from __future__ import annotations

import numpy as np
from scipy import ndimage

from .dock_spec import HULL_CLASS_DEPTH_M
from .scale import RAW_M

SCHEMA_NOTE = "authored-minor-waterway-carve"
# Authored minor waterways are poling channels: canoe class (module 60 §45).
# The file carries no hull class, so the class the network serves is named
# here, and its depth comes from the one dock/hull table (blueprint.py).
AUTHORED_HULL_CLASS = "canoe"
CHANNEL_HALF_WIDTH_M = 6.0      # navigable half-width of a poling channel
SHOULDER_M = 3.0                # blend band outside the channel; nothing beyond
DEPTH_MARGIN_M = 0.25           # cut below the promise so rounding cannot eat it
CONNECT_SEARCH_M = 60.0         # how far an endpoint may reach for its water
# The compiler floods the trench laterally from the receiving water, capping
# each cell at the level of its NEAREST channel station. A trench beside a
# reach that falls away therefore stands lower than the terminal's surface, so
# the bed is cut under the LOWEST level governing any part of the line.
LEVEL_SCAN_M = 80.0
RESAMPLE_M = 2.0


def resample_polyline(points_m: list[list[float]], spacing_m: float = RESAMPLE_M) -> np.ndarray:
    """Resample a metre-space polyline at ~`spacing_m`, keeping both ends."""
    pts = np.asarray(points_m, dtype=np.float64)
    out = [pts[0]]
    for a, b in zip(pts, pts[1:]):
        span = float(np.hypot(*(b - a)))
        n = max(int(np.ceil(span / spacing_m)), 1)
        for i in range(1, n + 1):
            out.append(a + (b - a) * (i / n))
    return np.asarray(out)


def _inside(samples_yx: np.ndarray, shape) -> np.ndarray:
    """Which sample points fall inside a grid of `shape`."""
    return ((samples_yx[:, 0] >= 0) & (samples_yx[:, 0] <= shape[0] - 1)
            & (samples_yx[:, 1] >= 0) & (samples_yx[:, 1] <= shape[1] - 1))


def _nearest_wet(level: np.ndarray, wet: np.ndarray, sy: float, sx: float,
                 mpp: float, search_m: float):
    """Nearest wet sample to (sy, sx) within `search_m`: (y, x, level, dist) or None."""
    r = int(np.ceil(search_m / mpp))
    y0, y1 = max(int(sy) - r, 0), min(int(sy) + r + 1, wet.shape[0])
    x0, x1 = max(int(sx) - r, 0), min(int(sx) + r + 1, wet.shape[1])
    sub = wet[y0:y1, x0:x1] & np.isfinite(level[y0:y1, x0:x1])
    if not sub.any():
        return None
    ys, xs = np.nonzero(sub)
    d = np.hypot(ys + y0 - sy, xs + x0 - sx)
    i = int(np.argmin(d))
    if d[i] * mpp > search_m:
        return None
    return int(ys[i] + y0), int(xs[i] + x0), float(level[ys[i] + y0, xs[i] + x0]), float(d[i] * mpp)


def _nearest_station(stations, sy: float, sx: float, mpp: float, search_m: float):
    """Nearest channel station to (sy, sx): (y, x, level, dist) or None.

    The receiving water for these lines is usually a RIVER, which is a solved
    channel and not a standing body, so the body raster alone cannot find it.
    """
    if stations is None:
        return None
    ys, xs, ls = stations
    d = np.hypot(ys - sy, xs - sx) * mpp
    i = int(np.argmin(d))
    if not np.isfinite(ls[i]) or d[i] > search_m:
        return None
    return float(ys[i]), float(xs[i]), float(ls[i]), float(d[i])


def _governing_level(stations, samples_yx, mpp, recv, scan_m=LEVEL_SCAN_M) -> float:
    """The lowest solved level that can govern any cell of the line."""
    if stations is None:
        return recv
    ys, xs, ls = stations
    y0, y1 = samples_yx[:, 0].min(), samples_yx[:, 0].max()
    x0, x1 = samples_yx[:, 1].min(), samples_yx[:, 1].max()
    pad = scan_m / mpp
    near = ((ys >= y0 - pad) & (ys <= y1 + pad) & (xs >= x0 - pad) & (xs <= x1 + pad)
            & np.isfinite(ls))
    if not near.any():
        return recv
    sy, sx, sl = ys[near], xs[near], ls[near]
    d = np.min(np.hypot(sy[:, None] - samples_yx[None, :, 0],
                        sx[:, None] - samples_yx[None, :, 1]), axis=1) * mpp
    in_scan = d <= scan_m
    return float(min(recv, sl[in_scan].min())) if in_scan.any() else recv


def _receiver(level, wet, stations, sy, sx, mpp, search_m):
    """The nearest receiving water — standing body or solved channel."""
    hits = [hit for hit in (_nearest_wet(level, wet, sy, sx, mpp, search_m),
                            _nearest_station(stations, sy, sx, mpp, search_m))
            if hit is not None]
    return min(hits, key=lambda hit: hit[3]) if hits else None


def connected_depth(h: np.ndarray, level: float, seed: np.ndarray) -> np.ndarray:
    """Depth of the water that stands at `level` over `h`, flooded from `seed`.

    Cells below the level that are not 4-connected to a seed cell are dry: this
    is what makes "the trench connects" a measurable statement rather than a
    hope.
    """
    below = h < level
    labels, _ = ndimage.label(below, structure=np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]]))
    keep = np.unique(labels[seed & below])
    keep = keep[keep > 0]
    filled = np.isin(labels, keep)
    return np.where(filled, level - h, 0.0).astype(np.float32)


def carve_line(h: np.ndarray, samples_yx: np.ndarray, bed_m: float, mpp: float = RAW_M,
               half_width_m: float = CHANNEL_HALF_WIDTH_M,
               shoulder_m: float = SHOULDER_M) -> tuple[np.ndarray, int, tuple]:
    """Cut a flat-bedded trench to `bed_m` along sample-space points.

    Cells within `half_width_m` of the centreline go to the bed; between there
    and +`shoulder_m` the cut fades to nothing; beyond that the terrain is
    untouched (bit-identical), so no bank is re-graded.

    Returns (heights, cells cut, window) where the window is the half-open
    sample box ``(y0, y1, x0, x1)`` this carve could possibly have touched —
    the FOOTPRINT the incremental chain reasons about (`worldgen.footprint`).
    It is the whole search window, not the cut cells' bounding box: a box that
    under-reports where an edit landed is worse than one that over-reports by
    a shoulder's width.
    """
    reach = half_width_m + shoulder_m
    pad = int(np.ceil(reach / mpp)) + 2
    ys, xs = samples_yx[:, 0], samples_yx[:, 1]
    y0 = max(int(np.floor(ys.min())) - pad, 0)
    y1 = min(int(np.ceil(ys.max())) + pad + 1, h.shape[0])
    x0 = max(int(np.floor(xs.min())) - pad, 0)
    x1 = min(int(np.ceil(xs.max())) + pad + 1, h.shape[1])
    win = h[y0:y1, x0:x1]
    line = np.zeros(win.shape, dtype=bool)
    iy = np.clip(np.round(ys).astype(int) - y0, 0, win.shape[0] - 1)
    ix = np.clip(np.round(xs).astype(int) - x0, 0, win.shape[1] - 1)
    line[iy, ix] = True
    d = ndimage.distance_transform_edt(~line) * mpp
    t = np.clip((d - half_width_m) / max(shoulder_m, 1e-6), 0.0, 1.0)
    w = (1.0 - t * t * (3 - 2 * t)).astype(np.float32)   # 1 in the bed, 0 past the shoulder
    target = (bed_m * w + win * (1.0 - w)).astype(np.float32)
    cut = target < win
    win[cut] = target[cut]
    h[y0:y1, x0:x1] = win
    return h, int(cut.sum()), (y0, y1, x0, x1)


def carve_authored(h: np.ndarray, level_with_sea: np.ndarray, wet: np.ndarray,
                   mpp: float = RAW_M, waterways=None, stations=None,
                   log=None) -> tuple[np.ndarray, list[dict]]:
    """Carve every authored minor waterway. Returns (heights, per-way stats).

    `stations` is the optional solved-channel receiver: (y, x, L) in sample
    coordinates (``sol.y, sol.x, sol.L``).
    """
    if waterways is None:
        from .hydrology_intent import load_authored_minor_waterways
        waterways, errors = load_authored_minor_waterways()
        if errors:
            raise ValueError("invalid authored minor waterways: " + "; ".join(errors))
    need = HULL_CLASS_DEPTH_M[AUTHORED_HULL_CLASS]
    level = np.where(np.isfinite(level_with_sea), level_with_sea, np.nan)
    stats: list[dict] = []
    for way in waterways:
        pts = resample_polyline(way["pointsM"])
        samples = np.stack([pts[:, 1] / mpp, pts[:, 0] / mpp], axis=1)   # (row=z, col=x)
        # A line whose geometry is not on THIS grid is not this grid's line:
        # carving it would clamp it onto the edge, and demanding receiving
        # water for it turns every synthetic or partial terrain into a crash
        # (it did: test_refine's tile). Skip it and say so.
        if not (_inside(samples, h.shape)).any():
            stats.append({"id": way["id"], "status": "off-grid", "samplesCut": 0})
            if log is not None:
                log(f"authored waterway {way['id']}: off this grid, not carved")
            continue
        # the level is the receiving surface AT THE TERMINAL (the authored end
        # the promise is made at), not a constant and not the far end's water
        term_m = way.get("terminalM") or way["pointsM"][-1]
        terminal = np.asarray([term_m[1] / mpp, term_m[0] / mpp])
        recv_hit = _receiver(level, wet, stations, terminal[0], terminal[1], mpp, CONNECT_SEARCH_M)
        if recv_hit is None:
            raise ValueError(f"{way['id']}: no receiving water within "
                             f"{CONNECT_SEARCH_M:.0f} m of its terminal")
        recv = recv_hit[2]
        joins = [recv_hit]
        # the other end joins only when its water stands at the SAME level:
        # a trench between two levels would be a river capture, not a channel
        far = samples[0] if np.hypot(*(samples[0] - terminal)) > np.hypot(*(samples[-1] - terminal)) else samples[-1]
        far_hit = _receiver(level, wet, stations, far[0], far[1], mpp, CONNECT_SEARCH_M)
        if far_hit is not None and abs(far_hit[2] - recv) <= 0.2:
            joins.append(far_hit)
        # extend the trench into the receiving water so it is not a dam
        extra = []
        for jy, jx, _, _ in joins:
            end = samples[0] if np.hypot(*(samples[0] - (jy, jx))) <= np.hypot(*(samples[-1] - (jy, jx))) else samples[-1]
            n = max(int(np.hypot(jy - end[0], jx - end[1])), 1) + 1
            extra.append(np.stack([np.linspace(end[0], jy, n), np.linspace(end[1], jx, n)], axis=1))
        all_samples = np.concatenate([samples] + extra)
        govern = _governing_level(stations, all_samples, mpp, recv)
        bed = govern - need - DEPTH_MARGIN_M
        h, cut, window = carve_line(h, all_samples, bed, mpp)
        row = {"id": way["id"], "receivingLevelM": round(float(recv), 3),
               "governingLevelM": round(float(govern), 3),
               "bedM": round(float(bed), 3), "promisedDepthM": need,
               "hullClass": AUTHORED_HULL_CLASS, "samplesCut": cut,
               "joins": len(joins), "window": list(window)}
        if log is not None:
            log(f"authored waterway {way['id']}: level {recv:.2f} m, bed {bed:.2f} m, "
                f"{cut} samples cut, {len(joins)} join(s)")
        stats.append(row)
    return h, stats
