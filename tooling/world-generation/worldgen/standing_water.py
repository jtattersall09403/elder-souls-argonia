"""Standing water by flooding the real terrain (decision 0047).

Every level here is a flood level: the sea is 0 on ocean-connected ground
below 0; a depression's level is the exact spill of a priority flood of the
raw full-resolution terrain (or a lower cap), and its EXTENT is always the
connected set of cells under that level — never a mask laid over a smoothed
grid. So no wet cell can have a lower dry neighbour, and every body is flat.

Acceptance rules are the ones the owner tuned over rounds 8–10 (relief,
floor slope, extent per relief, marsh leniency, deep-basin rescue with the
placement cap), re-expressed per flood component. A way running through a
body neither caps nor deletes it (owner ruling 2026-09-09): a crossing is
authored content, not a hole in the water. A rejected
depression is searched ONE level down: its watershed catchments filled to
their own saddles are offered to the same rules (the lake inside a plateau
the raster mistook for one basin).

Shared by `hydrology_graph` + `carve_province` (islands, channel backwater) and
`compile_water` (the shipped W).
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from .npz_io import savez as _savez
from scipy import ndimage
from skimage.morphology import local_minima, reconstruction
from skimage.segmentation import watershed

from .scale import RAW_M

REPO_ROOT = Path(__file__).resolve().parents[3]
PROVINCE_DIR = REPO_ROOT / "apps" / "world-studio" / "public" / "province"

# Acceptance (full-res cells; the round-8 values were at 3.66 m px, x4 here)
POOL_MIN_RELIEF_M = 0.25
POOL_FLOOR_FRAC = 0.30
POOL_FLOOR_SLOPE = 0.07
POOL_AREA_CAP = 12000
POOL_AREA_PER_M = 48000.0
MIN_POOL_CELLS = 96
MIN_POOL_DEPTH_M = 0.30
MARSH_MIN_CELLS = 24
MARSH_MIN_DEPTH_M = 0.10
SHEET_SLOPE = 0.07
BASIN_MIN_RELIEF_M = 3.0
BASIN_MAX_RISE_M = 2.0
ALLOW_FRAC = 0.25
HEART_REGIONS = (6, 7, 8, 13)
SUBBASIN_MIN_CELLS = MIN_POOL_CELLS
SEASON_AMPLITUDE_M = 1.4
POOL_RESPONSE_MAX = 0.35
# Bodies are 8-connected, like the priority flood that finds their level
# (skimage reconstruction's default footprint): a cell that joins a body only
# diagonally is part of it, not a separate one-cell depression under its rim.
CONN8 = np.ones((3, 3), dtype=bool)


def upsample(a: np.ndarray, step: int, shape) -> np.ndarray:
    return np.repeat(np.repeat(a, step, 0), step, 1)[: shape[0], : shape[1]]


def sea_mask(g: np.ndarray, ocean_coarse: np.ndarray, step: int) -> np.ndarray:
    """Ground below 0 that reaches the ocean (or the map edge)."""
    below = g < 0.0
    lbl, n = ndimage.label(below)
    if not n:
        return below
    seed = upsample(ocean_coarse, step, g.shape) & below
    edge = np.zeros(g.shape, dtype=bool)
    edge[0] = edge[-1] = True
    edge[:, 0] = edge[:, -1] = True
    ids = np.unique(lbl[(seed | edge) & below])
    return np.isin(lbl, ids[ids > 0])


def priority_fill(g: np.ndarray, drain: np.ndarray) -> np.ndarray:
    """Exact priority-flood depression filling: every cell's spill level
    when water can only leave through `drain` cells (and the map edge)."""
    big = np.float32(g.max() + 1000.0)
    seed = np.where(drain, g, big).astype(np.float32)
    seed[0] = g[0]; seed[-1] = g[-1]; seed[:, 0] = g[:, 0]; seed[:, -1] = g[:, -1]
    return reconstruction(seed, g.astype(np.float32), method="erosion").astype(np.float32)


def placement_cells(shape, mpp, kinds=("places", "blueprints", "roads")) -> np.ndarray:
    """Cells the placement phases have built on (place anchors, parcel
    centres, the road/track network), used to cap rescued basins.
    `roads` is the whole walked network (routes.json + the minor
    tracks, boardwalks excluded: a boardwalk is a deck over the water);
    `major_roads` is routes.json alone. Missing exports mean nothing is
    protected there."""
    occ = np.zeros(shape, dtype=bool)
    macro_m = RAW_M * 3

    def mark(x_m, z_m):
        ix = int(round(x_m / mpp)); iy = int(round(z_m / mpp))
        if 0 <= iy < shape[0] and 0 <= ix < shape[1]:
            occ[iy, ix] = True

    path = PROVINCE_DIR / "places.json"
    if "places" in kinds and path.exists():
        for pl in json.loads(path.read_text()).get("places", []):
            pos = pl.get("positionM")
            if pos:
                mark(pos[0], pos[1])
    path = PROVINCE_DIR / "blueprints.json"
    if "blueprints" in kinds and path.exists():
        for bp in json.loads(path.read_text()).get("blueprints", []):
            for par in bp.get("parcels", []):
                c = par.get("centreM")
                if c:
                    mark(c[0], c[1])
    files = []
    if "roads" in kinds or "major_roads" in kinds:
        files.append("routes.json")
    if "roads" in kinds:
        files.append("routes-minor.json")
    for name in files:
        path = PROVINCE_DIR / name
        if not path.exists():
            continue
        doc = json.loads(path.read_text())
        for route in doc.get("routes", []) + doc.get("tracks", []):
            if route.get("kind") == "boardwalk":
                continue
            px = route.get("px", [])
            for (x0, y0), (x1, y1) in zip(px, px[1:]):
                n = int(max(abs(x1 - x0), abs(y1 - y0))) * 6 + 2
                for t in np.linspace(0.0, 1.0, n):
                    mark((x0 + (x1 - x0) * t) * macro_m, (y0 + (y1 - y0) * t) * macro_m)
    return ndimage.binary_dilation(occ, iterations=2)


class BodySolution:
    """`level`: per-cell flood level (-inf where none); `body`: per-cell body
    id (0 none); per-body arrays indexed by id-1: `levels`, `areas`,
    `reliefs`, `sheet`, `rescued`, `nested`, `response`; plus `sea`,
    `filled` and a `census` dict."""

    def __init__(self, **kw):
        self.__dict__.update(kw)

    @property
    def wet(self) -> np.ndarray:
        return self.body > 0

    @property
    def level_with_sea(self) -> np.ndarray:
        """Flood level including the sea plane (0) — the sea is a body too
        for the channel profile (an estuary station is pooled at 0)."""
        return np.where(self.sea, np.float32(0.0), self.level).astype(np.float32)

    def set_level(self, level: np.ndarray) -> None:
        """(Re)label the bodies from a per-cell flood level."""
        g = self.g
        wet = np.isfinite(level)
        body, nb = ndimage.label(wet, structure=CONN8)
        idx = np.arange(1, nb + 1)
        self.level = level.astype(np.float32)
        self.body = body.astype(np.int32)
        self.n = int(nb)
        if not nb:
            self.levels = self.reliefs = np.zeros(0, np.float32)
            self.areas = np.zeros(0, np.int64)
            self.sheet = np.zeros(0, bool)
            return
        self.levels = np.asarray(ndimage.maximum(np.where(wet, level, -np.inf), body, idx),
                                 dtype=np.float32)
        self.areas = np.bincount(body.ravel(), minlength=nb + 1)[1:]
        self.reliefs = (self.levels - np.asarray(ndimage.minimum(g, body, idx),
                                                 dtype=np.float32)).astype(np.float32)
        ms = np.asarray(ndimage.mean(self.slope, body, idx))
        marsh = np.asarray(ndimage.mean(self.marshy.astype(np.float32), body, idx)) > 0.4
        self.sheet = (ms < SHEET_SLOPE) & marsh
        self.census.update({"bodies": int(nb), "sheetBodies": int(self.sheet.sum()),
                            "bodyCells": int(wet.sum())})

    def force_depressions(self, cells_y, cells_x, at_level=None) -> int:
        """Accept every depression containing one of the given cells (a river
        that cannot leave a hollow makes a lake there) — at its spill, or at
        the matching `at_level` (never above the spill) when the caller knows
        the level the carve assumed. Returns the number newly accepted."""
        ids = np.unique(self.depression[cells_y, cells_x])
        ids = ids[ids > 0]
        if not len(ids):
            return 0
        already = np.zeros(len(ids), dtype=bool)
        for i, d in enumerate(ids):
            m = self.depression == d
            if np.isfinite(self.level[m]).all():
                already[i] = True
        ids = ids[~already]
        if not len(ids):
            return 0
        sel = np.isin(self.depression, ids)
        target = self.filled
        if at_level is not None:
            want = np.full(int(self.depression.max()) + 1, np.inf, dtype=np.float32)
            np.minimum.at(want, self.depression[cells_y, cells_x], np.asarray(at_level, dtype=np.float32))
            target = np.minimum(self.filled, want[self.depression])
        lvl = np.where(sel & (self.g < target), target, -np.inf).astype(np.float32)
        level = np.maximum(self.level, lvl)
        for d in ids:
            m = sel & (self.depression == d)
            ys, xs = np.nonzero(m)
            self.forced.append({"eastM": round(float(xs.mean() * RAW_M), 1),
                                "southM": round(float(ys.mean() * RAW_M), 1),
                                "levelM": round(float(target[m].max()), 2),
                                "reliefM": round(float((self.filled - self.g)[m].max()), 2),
                                "cells": int(m.sum())})
        self.set_level(level)
        return int(len(ids))


def _floor_slope(depth, lbl, idx, slope, relief):
    floor_cut = np.concatenate([[0.0], relief * (1.0 - POOL_FLOOR_FRAC)]).astype(np.float32)
    on_floor = (depth >= floor_cut[lbl]) & (lbl > 0)
    fl = np.where(on_floor, lbl, 0)
    return np.nan_to_num(np.asarray(ndimage.median(slope, fl, idx), dtype=np.float32), nan=np.inf)


def _evaluate(g, level_cell, lbl, n, slope, allow, heart, rivery_mask, occ, mpp):
    """Apply the acceptance rules to labelled candidate bodies whose per-cell
    spill level is `level_cell`. Returns (accepted level per body or -inf,
    flags dict)."""
    idx = np.arange(1, n + 1)
    depth = np.where(lbl > 0, level_cell - g, 0.0).astype(np.float32)
    relief = np.asarray(ndimage.maximum(depth, lbl, idx), dtype=np.float32)
    floor = np.asarray(ndimage.minimum(g, lbl, idx), dtype=np.float32)
    spill = floor + relief
    areas = np.bincount(lbl.ravel(), minlength=n + 1)[1:]
    allow_frac = np.asarray(ndimage.mean(allow.astype(np.float32), lbl, idx))
    hearty = np.asarray(ndimage.mean(heart.astype(np.float32), lbl, idx)) > 0.4
    rivery = np.asarray(ndimage.mean(rivery_mask.astype(np.float32), lbl, idx)) > 0.25
    mean_slope = np.asarray(ndimage.mean(slope, lbl, idx))
    floor_slope = _floor_slope(depth, lbl, idx, slope, relief)
    area_cap = POOL_AREA_CAP + POOL_AREA_PER_M * relief
    bowl = (relief >= POOL_MIN_RELIEF_M) & (floor_slope < POOL_FLOOR_SLOPE) & (areas <= area_cap)
    sheet = mean_slope < SHEET_SLOPE
    stands = rivery | sheet | bowl
    size_ok = np.where(hearty, (relief >= MARSH_MIN_DEPTH_M) & (areas >= MARSH_MIN_CELLS),
                       (relief >= MIN_POOL_DEPTH_M) & (areas >= MIN_POOL_CELLS))
    keep = (allow_frac > ALLOW_FRAC) & stands & size_ok
    # deep-basin rescue (owner 2026-09-07): a real basin the gentle-bed rules
    # threw away, capped where anything is built in it
    wide_enough = areas * (mpp * mpp) >= relief * relief
    rescued = (~keep) & (relief >= BASIN_MIN_RELIEF_M) & (areas >= MIN_POOL_CELLS) & wide_enough
    occupied = np.asarray(ndimage.maximum(occ.astype(np.float32), lbl, idx)) > 0.5
    lvl = spill.copy()
    lvl = np.where(rescued & occupied, np.minimum(lvl, floor + BASIN_MAX_RISE_M), lvl)
    keep = keep | rescued
    # A road running through a body does NOT cap or delete it (owner ruling
    # 2026-09-09, retiring the round-10 road cap): water is not flattened to
    # ankle depth because a way touches it. Where a way meets real water the
    # crossing is content — a bridge, a declared ford or a ferry — authored
    # by the route structures against the water that actually ships.
    lvl = np.where(keep, lvl, -np.inf).astype(np.float32)
    flags = {"sheet": sheet & keep, "rescued": rescued & keep, "bowl": bowl & keep,
             "hearty": hearty & keep, "capped": keep & (lvl < spill - 1e-4),
             "rejected": ~keep, "areas": areas,
             "relief": relief, "floor": floor}
    return lvl, flags


def placement_snapshot(shape, mpp) -> dict:
    """The built cells the acceptance rules judge against: everything
    (places, parcels, roads) and the road/track network alone."""
    return {"occupied": placement_cells(shape, mpp),
            "roads": placement_cells(shape, mpp, kinds=("roads",)),
            "major_roads": placement_cells(shape, mpp, kinds=("major_roads",))}


def save_placement(snapshot: dict, path) -> None:
    _savez(path, **{k: np.packbits(v) for k, v in snapshot.items()},
                        shape=np.asarray(next(iter(snapshot.values())).shape))


def load_placement(path) -> dict | None:
    path = Path(path)
    if not path.exists():
        return None
    z = np.load(path)
    shape = tuple(int(v) for v in z["shape"])
    n = shape[0] * shape[1]
    return {k: np.unpackbits(z[k])[:n].reshape(shape).astype(bool)
            for k in z.files if k != "shape"}


def solve_bodies(g: np.ndarray, npz, step: int = 3, mpp: float = RAW_M,
                 sea: np.ndarray | None = None, with_placement: bool = True,
                 placement: dict | None = None) -> BodySolution:
    """Sea + accepted standing bodies on the full-res terrain `g`.

    `placement` is the built-cells snapshot (see `placement_snapshot`); when
    None it is read from the repo exports if `with_placement`."""
    shape = g.shape
    g = g.astype(np.float32)
    if sea is None:
        sea = sea_mask(g, npz["ocean"], step)
    filled = priority_fill(g, sea)
    depth_fill = filled - g
    cand = (depth_fill > 0.0) & ~sea
    lbl, n = ndimage.label(cand, structure=CONN8)
    gy, gx = np.gradient(g, mpp)
    slope = np.hypot(gy, gx).astype(np.float32)
    del gy, gx
    up = lambda a: upsample(np.asarray(a), step, shape)
    heart = up(np.isin(npz["regions"], HEART_REGIONS))
    riv = ndimage.binary_dilation(up(npz["rivers"] > 0), iterations=2)
    allow = up(npz["wetlands"] | (npz["flood"] >= 1) | npz["lakes"]) | riv | heart
    if placement is not None:
        occ = placement["occupied"]
    elif with_placement:
        occ = placement_cells(shape, mpp)
    else:
        occ = np.zeros(shape, dtype=bool)
    level = np.full(shape, -np.inf, dtype=np.float32)
    census = {"depressions": int(n)}
    per_body_flags = []
    if n:
        lvl, fl = _evaluate(g, filled, lbl, n, slope, allow, heart, riv, occ, mpp)
        lvl_cell = np.concatenate([[-np.inf], lvl]).astype(np.float32)[lbl]
        level = np.where(g < lvl_cell, lvl_cell, -np.inf).astype(np.float32)
        census.update({
            "acceptedDepressions": int(np.isfinite(lvl).sum()),
            "rescuedBasins": int(fl["rescued"].sum()),
            "sheets": int(fl["sheet"].sum()),
            "cappedBasins": int(fl["capped"].sum()),
        })
        # --- one level of nesting inside rejected, large depressions --------
        big = fl["rejected"] & (fl["areas"] >= SUBBASIN_MIN_CELLS) & (fl["relief"] >= POOL_MIN_RELIEF_M)
        if big.any():
            region = np.concatenate([[False], big])[lbl]
            mins = local_minima(g, connectivity=1) & region
            mk, nm = ndimage.label(mins)
            if nm:
                ws = watershed(g, mk, mask=region, connectivity=2).astype(np.int32)
                saddle = np.full(nm + 1, np.inf, dtype=np.float32)
                H, Wd = shape
                for dy, dx in ((0, 1), (1, 0), (1, 1), (1, -1)):
                    ay = slice(0, H - dy); by = slice(dy, H)
                    ax = slice(max(-dx, 0), Wd - max(dx, 0)); bx = slice(max(dx, 0), Wd - max(-dx, 0))
                    a = ws[ay, ax]; b = ws[by, bx]
                    diff = a != b
                    val = np.maximum(g[ay, ax], g[by, bx])[diff]
                    np.minimum.at(saddle, a[diff], val)
                    np.minimum.at(saddle, b[diff], val)
                saddle[0] = np.inf
                sub_lvl = saddle[ws]
                sub = (ws > 0) & (g < sub_lvl)
                sub_lbl, ns = ndimage.label(sub, structure=CONN8)
                if ns:
                    # each piece is one catchment's pool; its level is that saddle
                    sl_idx = np.arange(1, ns + 1)
                    piece_lvl = np.asarray(ndimage.maximum(sub_lvl, sub_lbl, sl_idx), dtype=np.float32)
                    piece_cell = np.concatenate([[-np.inf], piece_lvl]).astype(np.float32)[sub_lbl]
                    lvl2, fl2 = _evaluate(g, piece_cell, sub_lbl, ns, slope, allow, heart,
                                          riv, occ, mpp)
                    l2 = np.concatenate([[-np.inf], lvl2]).astype(np.float32)[sub_lbl]
                    nested = g < l2
                    level = np.where(nested, np.maximum(level, l2), level)
                    census["nestedAccepted"] = int(np.isfinite(lvl2).sum())
                    census["nestedCandidates"] = int(ns)
                del ws, sub_lvl, sub
    bodies = BodySolution(g=g, sea=sea, filled=filled, slope=slope, census=census,
                          depression=lbl.astype(np.int32), n_depressions=int(n),
                          marshy=heart | up(npz["wetlands"]), forced=[])
    bodies.set_level(level)
    return bodies


def season_response(g: np.ndarray, bodies: BodySolution) -> np.ndarray:
    """Per-body wet-season response: pools (median rim − level)/amplitude
    clipped to [0, POOL_RESPONSE_MAX]; marsh sheets 1.0."""
    nb = bodies.n
    if not nb:
        return np.zeros(0, dtype=np.float32)
    idx = np.arange(1, nb + 1)
    ring = np.where(bodies.body == 0, ndimage.grey_dilation(bodies.body, size=3), 0)
    rim = np.asarray(ndimage.median(g, ring, idx), dtype=np.float32)
    rim = np.where(np.isfinite(rim), rim, bodies.levels)
    resp = np.clip((rim - bodies.levels) / SEASON_AMPLITUDE_M, 0.0, POOL_RESPONSE_MAX)
    resp = np.where(bodies.sheet, 1.0, resp)
    return resp.astype(np.float32)


def lower_islands(h: np.ndarray, bodies: BodySolution, max_cells: int = 12,
                  drop_m: float = 0.15) -> tuple[np.ndarray, int]:
    """Inside accepted bodies, sink dry islets smaller than `max_cells` to
    level − drop_m so pools do not read as speckle. Bigger islands stay."""
    dry = ~bodies.wet & ~bodies.sea
    lbl, n = ndimage.label(dry)
    if not n:
        return h, 0
    sizes = np.bincount(lbl.ravel(), minlength=n + 1)
    small = np.concatenate([[False], sizes[1:] < max_cells])[lbl] & dry
    if not small.any():
        return h, 0
    # an islet belongs to ONE body: a sliver of dry ground touching two
    # bodies (or a body and the sea) is the dam between them, not an islet
    idx = np.arange(1, n + 1)
    hi = ndimage.grey_dilation(np.where(bodies.wet, bodies.body, 0), size=3)
    lo = -ndimage.grey_dilation(np.where(bodies.wet, -bodies.body, -np.inf), size=3)
    touch_hi = np.asarray(ndimage.maximum(np.where(small, hi, 0), lbl, idx))
    touch_lo = np.asarray(ndimage.minimum(np.where(small & np.isfinite(lo), lo, np.inf), lbl, idx))
    touch_sea = np.asarray(ndimage.maximum(
        ndimage.binary_dilation(bodies.sea).astype(np.uint8) & small, lbl, idx))
    one_body = (touch_hi == touch_lo) & (touch_hi > 0) & (touch_sea == 0)
    small &= np.concatenate([[False], one_body])[lbl]
    if not small.any():
        return h, 0
    near = ndimage.grey_dilation(np.where(bodies.wet, bodies.level, -np.inf), size=3)
    target = near - drop_m
    ok = small & np.isfinite(near)
    out = h.copy()
    out[ok] = np.minimum(out[ok], target[ok])
    return out, int(ok.sum())


def pool_channels(sol, bodies: BodySolution, log=print, max_rounds: int = 4) -> dict:
    """Solve the channel long profile against the accepted bodies, and where
    the profile stops (channels.CANYON_MAX_M: the water would have to cut
    deeper than that), accept the depression the river is trapped in and
    re-solve. Stations that still cannot be reached are LOST (the coarse route
    climbs out of a hollow by the wrong exit, or over a spur the full-res
    terrain never had a way through): no water, no trench, and the profile
    restarts on the far side. The same rule runs at carve and at compile, so
    both see the same lakes and the same lost stretches."""
    from . import channels
    g = bodies.g
    forced_total = 0
    captured = 0
    for _ in range(max_rounds):
        channels.long_profile(sol, channels.pool_at_stations(sol, bodies.level_with_sea, g))
        # channels whose widths touch share the lower level (the higher one
        # would drain into the lower); re-solve until nothing else drains
        for _k in range(3):
            n_cap = channels.capture_neighbours(sol)
            captured += n_cap
            if not n_cap:
                break
            channels.long_profile(sol, sol.pool)
        bad = np.flatnonzero(sol.lost)
        if not len(bad):
            break
        iy = np.clip(np.round(sol.y[bad]).astype(int), 0, g.shape[0] - 1)
        ix = np.clip(np.round(sol.x[bad]).astype(int), 0, g.shape[1] - 1)
        n_new = bodies.force_depressions(iy, ix)
        forced_total += n_new
        log(f"river-trapped depressions accepted: {n_new} (lost stations: {len(bad)})")
        if not n_new:
            break
    from .channels import KIND_FALL
    gap = sol.natural - sol.L
    lost = sol.lost
    cut = ~lost & (sol.kind != KIND_FALL)     # a fall's plunge station is a step, not a cut
    sites = []
    for r in np.unique(sol.reach[lost])[:40]:
        sl = sol.stations_of(r)
        m = lost[sl]
        k = sl.start + int(np.flatnonzero(m)[0])
        sites.append({"reach": int(r), "eastM": round(float(sol.x[k] * sol.mpp), 1),
                      "southM": round(float(sol.y[k] * sol.mpp), 1),
                      "stations": int(m.sum()), "band": int(sol.band[k])})
    return {"forcedBasins": forced_total, "forcedBasinSites": bodies.forced[:40],
            "neighbourCapturedStations": captured,
            "lostStations": int(lost.sum()), "lostReaches": int(np.unique(sol.reach[lost]).size),
            "lostSites": sites,
            "cutBelowFloorP90M": round(float(np.percentile(gap[cut], 90)), 2),
            "cutBelowFloorMaxM": round(float(gap[cut].max()), 2)}
