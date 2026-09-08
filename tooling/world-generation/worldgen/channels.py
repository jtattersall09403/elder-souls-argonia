"""River channels: ONE definition shared by the terrain carve and the water
compile (decision 0047).

The coarse hydrology flow graph (`rivers`, `flow_to`, `accum_km2` on the
1345 grid) becomes a set of *reaches*: smooth centrelines through the coarse
cell centres (junction points and outlets pinned, so tributaries still meet
their trunk), resampled at ~one full-res sample (1.83 m). Every station along
a reach carries the river band, the hydraulic width, the centre depth, the
valley floor and bank minimum measured on the PRE-carve terrain, and the
monotone-downstream long profile L(s). `refine_province` cuts the bed to
L − D along these stations (`carve`) and `compile_water` puts water at L in
the same cells (`raster_fields`), so the trench and the water that fills it
are the same curve by construction, not by two copies of the arithmetic.

Long profile L(s), per station:
  natural  = floor + FLOOR_CLEAR_M, capped BANKFULL: never more than
             LEVEE_ALLOW_M over the lower bank barrier (the highest ground
             along the ray through the shoulder crest zone) nor more than
             DITCH_ALLOW_M over the lowest ground in that zone, so the
             shoulder levee that seals the water's edge is always small and
             never impounds the land beside the channel
  L        = downstream running minimum of max(natural, pool level at any
             accepted standing body the station sits in), computed over the
             whole network upstream-first; a tributary's end is pinned to its
             trunk's start (with a short ramp back) so junctions share a level
  falls    = the terrain along the centreline drops >= FALL_DROP_M at a mean
             slope >= FALL_SLOPE with the steep part contiguous; L STEPS
             there (lip level to the lip, plunge level after) — never a ramp
  steep    = |dL/ds| >= STEEP_SLOPE over a SLOPE_WINDOW_M window (fall steps
             removed), in runs >= STEEP_MIN_M — these become strip meshes

All positions are full-res sample coordinates (sample j sits at world
j * mpp, per packages/game-core/src/terrain/heightfield.ts).
"""

from __future__ import annotations

import numpy as np
from scipy import ndimage

from .scale import RAW_M

# --- geometry --------------------------------------------------------------
WIDTH_COEF, WIDTH_EXP = 14.0, 0.40      # Leopold–Maddock hydraulic width (m, km²)
MIN_ACCUM_KM2 = 0.02
CENTRE_DEPTH = {1: 0.5, 2: 1.2, 3: 2.0}  # water depth at the centreline by band
FLOOR_CLEAR_M = 0.15                     # natural level = valley floor + this
FLOOR_BELOW_CENTRE_M = 4.0               # the section min may not chase a cliff
SHOULDER_RAISE_M = 0.3                   # shoulder crest = L + this, from the water's edge...
SHOULDER_CREST_M = 3.5                   # ...out to here (>= one cell centre in every direction)
SHOULDER_BLEND_M = 6.0                   # back to the original terrain by w/2 + this
SHOULDER_CUT_CAP_M = 3.0                 # a hillside bank is never cut deeper than this
SHOULDER_RAISE_CAP_M = 1.5               # hard cap on any shoulder raise
LEVEE_ALLOW_M = 0.45                     # bankfull: L <= the lower bank barrier + this...
DITCH_ALLOW_M = SHOULDER_RAISE_CAP_M - SHOULDER_RAISE_M   # ...and <= the lowest ring ground + this
FORD_DEPTH_M = 0.3                       # a road crossing keeps the bed within this of L
SMOOTH_SIGMA_CELLS = 1.2                 # centreline smoothing (coarse cells)
JUNCTION_RAMP_M = 40.0                   # a small junction mismatch eases out over this
JUNCTION_RAMP_SLOPE = 0.05               # a hanging tributary with no cliff ramps down at this
SILL_MIN_M = 3.7                         # lake outlet: bed AT the lake level until the
SILL_RIM_M = 0.35                        # ...floor has risen this far over it (the rim)...
SILL_MAX_M = 40.0                        # ...or this far, whichever first,
SILL_RAMP_M = 12.0                       # ...then deepens to L − D over this length
# --- classification ---------------------------------------------------------
STEEP_SLOPE = 0.035
STEEP_MIN_M = 10.0
SLOPE_WINDOW_M = 10.0
FALL_DROP_M = 3.0
FALL_SLOPE = 1.0                         # mean slope over the steep part
FALL_RUN_SLOPE = 0.5                     # a station is part of the steep part above this
FALL_MIN_STEP_M = 2.5                    # the L step must keep at least this
CANYON_MAX_M = 8.0                       # never cut deeper than this below the floor
BACKWATER_MAX_M = 1.0                    # a lake may back water up this far over the approach
LOST_EXIT_M = 1.0                        # a lost stretch ends this far below its crest
PLUNGE_MIN_DEPTH_M = 1.5
PLUNGE_FLOOR_ABOVE_M = 2.5               # the basin only deepens ground this close above its level
# --- flow speed ---------------------------------------------------------------
SPEED_FLOOR = {1: 0.45, 2: 0.60, 3: 0.75}   # m/s, so lowland rivers visibly move
SPEED_BANDS = ((0.45, 0.30), (0.95, 0.70), (1.7, 1.30))  # (raw <, banded) ... else 2.3
SPEED_MAX = 3.0

KIND_FIELD, KIND_STEEP, KIND_FALL, KIND_LOST = 0, 1, 2, 3


# ---------------------------------------------------------------------------
# graph → reaches
# ---------------------------------------------------------------------------

def build_reaches(rivers: np.ndarray, flow_to: np.ndarray) -> list[np.ndarray]:
    """Split the coarse river graph into reaches: maximal downstream paths
    whose interior cells have exactly one river cell upstream. A reach starts
    at a source or a junction and ends at (and includes) the next junction or
    the outlet, so junction cells are shared by every reach meeting there.
    Returns flat coarse indices per reach, deterministically ordered."""
    riv = rivers.reshape(-1) > 0
    ft = flow_to.reshape(-1)
    ds = np.where(riv & (ft >= 0) & riv[np.maximum(ft, 0)], ft, -1)
    indeg = np.bincount(ds[ds >= 0], minlength=riv.size)
    heads = np.flatnonzero(riv & (indeg != 1))
    reaches = []
    for h in heads:
        chain = [int(h)]
        cur = int(h)
        for _ in range(riv.size):
            nxt = int(ds[cur])
            if nxt < 0:
                break
            chain.append(nxt)
            cur = nxt
            if indeg[nxt] != 1:
                break
        if len(chain) >= 2:
            reaches.append(np.asarray(chain, dtype=np.int64))
    return reaches


def _smooth_pinned(p: np.ndarray, sigma: float) -> np.ndarray:
    """Gaussian-smooth an (n, 2) polyline with both ends pinned, then one
    Chaikin pass to round the knots. Ends stay exactly where they were."""
    n = len(p)
    if n < 3:
        return p
    s = ndimage.gaussian_filter1d(p, sigma, axis=0, mode="nearest")
    t = np.linspace(0.0, 1.0, n)[:, None]
    s = s + (p[0] - s[0]) * (1.0 - t) + (p[-1] - s[-1]) * t
    q = np.empty((2 * (n - 1) + 2, 2), dtype=np.float64)
    q[0] = s[0]
    q[1:-1:2] = 0.75 * s[:-1] + 0.25 * s[1:]
    q[2:-1:2] = 0.25 * s[:-1] + 0.75 * s[1:]
    q[-1] = s[-1]
    return q


def _resample(p: np.ndarray, spacing: float):
    """Resample a polyline (sample units) at `spacing`; returns (points,
    fractional source-vertex index per point, cumulative arc)."""
    seg = np.hypot(*(p[1:] - p[:-1]).T)
    arc = np.concatenate([[0.0], np.cumsum(seg)])
    total = arc[-1]
    n = max(int(np.floor(total / spacing)) + 1, 2)
    s = np.linspace(0.0, total, n)
    x = np.interp(s, arc, p[:, 0])
    y = np.interp(s, arc, p[:, 1])
    v = np.interp(s, arc, np.arange(len(p), dtype=np.float64))
    return np.stack([x, y], 1), v, s


def _sample(terrain, ys, xs):
    return ndimage.map_coordinates(terrain, [ys, xs], order=1, mode="nearest")


# ---------------------------------------------------------------------------
# the solution
# ---------------------------------------------------------------------------

class ChannelSolution:
    """Per-station arrays (all length n_st) plus per-reach bookkeeping.

    x, y            station position, full-res sample coords (x = column)
    tx, ty          unit tangent (downstream)
    arc             metres from the reach's first station
    reach           reach id per station; reach_start/reach_end index ranges
    band, accum, width, depth, floor, bank_min, natural, pool, L
    kind            0 field / 1 steep / 2 fall interior
    lip, plunge     bool flags on the lip / plunge station of each fall
    sill            bool: bed held at L (lake outlet)
    ramp            0..1 factor on the centre depth (lake-outlet ramp)
    pooled          bool: inside an accepted standing body
    speed           m/s
    """

    def __init__(self, **arrays):
        self.__dict__.update(arrays)

    @property
    def n(self) -> int:
        return int(len(self.x))

    def stations_of(self, r: int) -> slice:
        return slice(int(self.reach_start[r]), int(self.reach_end[r]))

    def copy(self) -> "ChannelSolution":
        return ChannelSolution(**{k: (v.copy() if isinstance(v, np.ndarray) else v)
                                  for k, v in self.__dict__.items()})

    @property
    def depth_cut(self) -> np.ndarray:
        """Centre depth the bed is cut to: a road crossing is a ford."""
        ford = getattr(self, "ford", None)
        if ford is None:
            return self.depth
        return np.where(ford, np.minimum(self.depth, FORD_DEPTH_M), self.depth).astype(np.float32)

    def save(self, path) -> None:
        arrays = {k: np.asarray(v) for k, v in self.__dict__.items()
                  if isinstance(v, (np.ndarray, np.generic, float, int))}
        arrays["shape"] = np.asarray(self.shape, dtype=np.int64)
        np.savez_compressed(path, **arrays)

    @classmethod
    def load(cls, path) -> "ChannelSolution":
        z = np.load(path)
        d = {k: (z[k].item() if z[k].ndim == 0 else z[k]) for k in z.files}
        d["shape"] = tuple(int(v) for v in d["shape"])
        d.setdefault("spacing_m", np.float32(d["mpp"]))     # one sample per station
        d.setdefault("ford", np.zeros(len(d["x"]), dtype=bool))
        return cls(**d)


def solve(terrain: np.ndarray, npz, pool_level: np.ndarray | None = None,
          step: int = 3, mpp: float = RAW_M, roads: np.ndarray | None = None) -> ChannelSolution:
    """Build the channel network on the PRE-carve `terrain` (full res).

    `pool_level`: per-cell level of accepted standing bodies on the same grid
    (-inf / nan where none) — stations inside one are pooled to it.
    `roads`: bool mask of the road network; a station on it is a FORD (the
    bed stays within FORD_DEPTH_M of the water, so a road never stands in
    open water at a crossing)."""
    rivers, flow_to, accum = npz["rivers"], npz["flow_to"], npz["accum_km2"]
    hc, wc = rivers.shape
    n_full = terrain.shape[0]
    reaches = build_reaches(rivers, flow_to)
    spacing = 1.0                                  # samples (~mpp metres)
    cols = {k: [] for k in ("x", "y", "arc", "reach", "band", "accum")}
    starts, ends = [], []
    count = 0
    half = (step - 1) / 2.0
    for r, chain in enumerate(reaches):
        cy = (chain // wc) * step + half
        cx = (chain % wc) * step + half
        p = _smooth_pinned(np.stack([cx, cy], 1).astype(np.float64), SMOOTH_SIGMA_CELLS)
        pts, v, s = _resample(p, spacing)
        # vertex attributes: the Chaikin pass doubled the vertex count, so map
        # the fractional index back onto the coarse chain
        vi = np.clip(np.round(v * (len(chain) - 1) / max(len(p) - 1, 1)).astype(int),
                     0, len(chain) - 1)
        starts.append(count)
        count += len(s)
        cols["x"].append(pts[:, 0]); cols["y"].append(pts[:, 1])
        cols["arc"].append(s * mpp); cols["reach"].append(np.full(len(s), r))
        cols["band"].append(rivers.reshape(-1)[chain][vi])
        cols["accum"].append(accum.reshape(-1)[chain][vi])
        ends.append(count)
    if not reaches:
        raise ValueError("no river cells in the hydrology solve")
    x = np.concatenate(cols["x"]); y = np.concatenate(cols["y"])
    arc = np.concatenate(cols["arc"]).astype(np.float32)
    reach = np.concatenate(cols["reach"]).astype(np.int32)
    band = np.concatenate(cols["band"]).astype(np.uint8)
    accum = np.concatenate(cols["accum"]).astype(np.float32)
    reach_start = np.asarray(starts, dtype=np.int64)
    reach_end = np.asarray(ends, dtype=np.int64)
    n_st = len(x)

    # tangents per reach (central differences, ends one-sided)
    tx = np.zeros(n_st); ty = np.zeros(n_st)
    for r in range(len(reaches)):
        sl = slice(reach_start[r], reach_end[r])
        gx = np.gradient(x[sl]); gy = np.gradient(y[sl])
        nrm = np.hypot(gx, gy); nrm[nrm == 0] = 1.0
        tx[sl] = gx / nrm; ty[sl] = gy / nrm
    nx, ny = -ty, tx

    width = (WIDTH_COEF * np.maximum(accum, MIN_ACCUM_KM2) ** WIDTH_EXP).astype(np.float32)
    depth = np.select([band == b for b in (1, 2, 3)],
                      [CENTRE_DEPTH[b] for b in (1, 2, 3)]).astype(np.float32)
    r_px = width * 0.5 / mpp

    # valley floor: min across the water width (but a cliff edge inside the
    # section is not the thalweg: never more than FLOOR_BELOW_CENTRE_M under
    # the centreline). Bank: the BARRIER the water must overtop to leave
    # sideways — the highest ground along each side's ray through the
    # shoulder crest zone, then the lower of the two sides; bank_low is the
    # lowest ground in that zone (a ditch beside the channel the levee could
    # not fill within its cap).
    centre = _sample(terrain, y, x).astype(np.float32)
    offs = np.linspace(-1.0, 1.0, 7)[None, :] * r_px[:, None]
    floor = _sample(terrain, y[:, None] + ny[:, None] * offs,
                    x[:, None] + nx[:, None] * offs).min(1).astype(np.float32)
    floor = np.maximum(floor, centre - FLOOR_BELOW_CENTRE_M)
    ring = np.array([0.0, 1.5, 3.0]) / mpp
    offs = r_px[:, None] + ring[None, :]
    left = _sample(terrain, y[:, None] + ny[:, None] * offs,
                   x[:, None] + nx[:, None] * offs)
    right = _sample(terrain, y[:, None] - ny[:, None] * offs,
                    x[:, None] - nx[:, None] * offs)
    bank_min = np.minimum(left.max(1), right.max(1)).astype(np.float32)
    bank_low = np.minimum(left.min(1), right.min(1)).astype(np.float32)
    natural = (floor + FLOOR_CLEAR_M).astype(np.float32)
    # a one-station DIP (a pit under one section) is noise, not a level:
    # lift it to the 5-station median. Only ever lift — lowering a station
    # to the median would drag a lake's rim down toward the basin floor.
    for r in range(len(reach_start)):
        sl = slice(reach_start[r], reach_end[r])
        if sl.stop - sl.start >= 5:
            med = ndimage.median_filter(natural[sl], size=5, mode="nearest")
            natural[sl] = np.maximum(natural[sl], med)
    # BANKFULL (decision 0047): the level never stands more than a small
    # levee above the ground beside the channel — a perched profile would
    # need a wall, and the wall would impound the floodplain behind it
    natural = np.minimum(natural, np.minimum(bank_min + LEVEE_ALLOW_M,
                                             bank_low + DITCH_ALLOW_M)).astype(np.float32)
    ford = np.zeros(n_st, dtype=bool)
    if roads is not None:
        iy = np.clip(np.round(y).astype(int), 0, terrain.shape[0] - 1)
        ix = np.clip(np.round(x).astype(int), 0, terrain.shape[1] - 1)
        ford = ndimage.binary_dilation(roads, iterations=2)[iy, ix]

    sol = ChannelSolution(
        x=x.astype(np.float32), y=y.astype(np.float32), tx=tx.astype(np.float32),
        ty=ty.astype(np.float32), arc=arc, reach=reach, reach_start=reach_start,
        reach_end=reach_end, band=band, accum=accum, width=width, depth=depth,
        floor=floor, bank_min=bank_min, bank_low=bank_low, centre=centre, natural=natural,
        ford=ford, pool=np.full(n_st, -np.inf, dtype=np.float32),
        mpp=float(mpp), step=int(step), shape=tuple(terrain.shape),
        spacing_m=np.float32(spacing * mpp),
        down_reach=_downstream_reaches(reaches, rivers, flow_to),
    )
    if pool_level is not None:
        sol.pool = pool_at_stations(sol, pool_level, terrain)
    long_profile(sol)
    return sol


def pool_at_stations(sol: ChannelSolution, level: np.ndarray, terrain: np.ndarray) -> np.ndarray:
    """Per-station level of the accepted body the station stands in (-inf
    where none). A station is in a body when ANY sample of its cross-section
    (across the water width) is under that body's level — a station whose
    centre sits on the shore but whose section dips into the lake is in the
    lake, so the profile never carries a shore-station's lower natural level
    into the water."""
    n0, n1 = terrain.shape
    r_px = sol.width * 0.5 / sol.mpp
    offs = np.linspace(-1.0, 1.0, 7)[None, :] * r_px[:, None]
    ys = np.clip(np.round(sol.y[:, None] - sol.tx[:, None] * offs).astype(int), 0, n0 - 1)
    xs = np.clip(np.round(sol.x[:, None] + sol.ty[:, None] * offs).astype(int), 0, n1 - 1)
    pl = np.nan_to_num(level[ys, xs], nan=-np.inf)
    pl = np.where(pl > terrain[ys, xs], pl, -np.inf)
    return pl.max(1).astype(np.float32)


def _downstream_reaches(reaches, rivers, flow_to) -> np.ndarray:
    """Reach id that each reach flows into (-1 at an outlet)."""
    head_of = {}
    for r, chain in enumerate(reaches):
        head_of.setdefault(int(chain[0]), r)
    down = np.full(len(reaches), -1, dtype=np.int64)
    for r, chain in enumerate(reaches):
        d = head_of.get(int(chain[-1]), -1)
        down[r] = d if d != r else -1
    return down


def _fall_runs(profile: np.ndarray, arc: np.ndarray) -> list[tuple[int, int]]:
    """(lip index, plunge index) pairs: contiguous runs where the profile
    falls at >= FALL_RUN_SLOPE per station, totalling >= FALL_DROP_M at a
    mean slope >= FALL_SLOPE."""
    n = len(profile)
    if n < 2:
        return []
    ds = np.diff(arc)
    ds[ds <= 0] = 1e-6
    slope = -np.diff(profile) / ds
    steep = slope >= FALL_RUN_SLOPE
    runs = []
    k = 0
    while k < n - 1:
        if not steep[k]:
            k += 1
            continue
        j = k
        while j + 1 < n - 1 and steep[j + 1]:
            j += 1
        drop = profile[k] - profile[j + 1]
        length = arc[j + 1] - arc[k]
        if drop >= FALL_DROP_M and drop / max(length, 1e-6) >= FALL_SLOPE:
            runs.append((k, j + 1))
        k = j + 1
    return runs


def _running_min(v: np.ndarray, lost: np.ndarray, cap: float):
    """Downstream running minimum with the LOST rule: where the ground would
    have to be cut more than `cap` below its natural level for water to
    continue, the water stops. The stations up to the crest are lost, the
    profile restarts once the ground has come down LOST_EXIT_M from the
    crest. Returns (profile, lost) — `lost` is updated in place."""
    out = np.minimum.accumulate(v)
    if not (v - out > cap).any():
        lost[:] = False
        return out
    n = len(v)
    cur = np.inf
    in_lost = False
    peak = -np.inf
    for k in range(n):
        if in_lost:
            peak = max(peak, v[k])
            if v[k] <= peak - LOST_EXIT_M:
                in_lost = False
                cur = v[k]
                lost[k] = False
                out[k] = cur
            else:
                lost[k] = True
                out[k] = v[k]
            continue
        if v[k] > cur + cap:
            in_lost = True
            peak = v[k]
            lost[k] = True
            out[k] = v[k]
            continue
        lost[k] = False
        cur = min(cur, v[k])
        out[k] = cur
    return out


def _backwater(v: np.ndarray, pooled: np.ndarray, lost: np.ndarray, pool: np.ndarray) -> np.ndarray:
    """Per pooled run: if the profile arrives at or above the lake (or less
    than BACKWATER_MAX_M under it — a shore dip), the run takes the lake
    level and the lake reaches upstream until the profile stands above it.
    If the route climbs further INTO a higher lake, the running minimum
    stands (the river captures that lake; its body still floods at compile)."""
    v = v.copy()
    m = len(v)
    k = 0
    while k < m:
        if not pooled[k]:
            k += 1
            continue
        j = k
        while j + 1 < m and pooled[j + 1]:
            j += 1
        P = float(pool[k:j + 1].max())
        arriving = float(v[k - 1]) if k > 0 else np.inf
        if arriving >= P - BACKWATER_MAX_M:
            v[k:j + 1] = P
            i = k - 1
            while i >= 0 and not pooled[i] and not lost[i] and v[i] < P:
                v[i] = P
                i -= 1
        k = j + 1
    return v


def long_profile(sol: ChannelSolution, pool: np.ndarray | None = None) -> ChannelSolution:
    """Compute L, kinds and flags on `sol` in place (network-wide).

    `pool` overrides the stored per-station pool level (the compile passes
    the levels of the bodies it found on the shipped terrain)."""
    if pool is not None:
        sol.pool = pool.astype(np.float32)
    n_r = len(sol.reach_start)
    n_st = sol.n
    base = np.maximum(sol.natural, sol.pool).astype(np.float32)
    L = base.copy()
    lip = np.zeros(n_st, dtype=bool)
    plunge = np.zeros(n_st, dtype=bool)
    kind = np.zeros(n_st, dtype=np.uint8)
    pooled = np.isfinite(sol.pool) & (sol.pool >= sol.natural)
    lost = np.zeros(n_st, dtype=bool)
    since_pool = np.full(n_st, np.inf, dtype=np.float32)   # metres since a pooled station

    # topological order: a reach after everything that flows into it
    down = sol.down_reach
    indeg = np.bincount(down[down >= 0], minlength=n_r)
    order = []
    queue = [r for r in range(n_r) if indeg[r] == 0]
    while queue:
        r = queue.pop(0)
        order.append(r)
        d = down[r]
        if d >= 0:
            indeg[d] -= 1
            if indeg[d] == 0:
                queue.append(d)
    incoming_end = np.full(n_r, np.inf, dtype=np.float32)
    incoming_since = np.full(n_r, np.inf, dtype=np.float32)
    for r in order:
        sl = sol.stations_of(r)
        v = L[sl]
        v[0] = min(v[0], incoming_end[r])
        v = _running_min(v, lost[sl], CANYON_MAX_M)
        # backwater: a pooled station IS at its lake's level, and the lake
        # reaches upstream until the profile stands above it (a station at
        # the lake's edge may have a natural level under the lake — its
        # section dips in — and must not carry that into the lake)
        pw = pooled[sl]
        if pw.any():
            v = _backwater(v, pw, lost[sl], sol.pool[sl])
        runs = _fall_runs(sol.floor[sl], sol.arc[sl])
        a0 = sl.start
        for a, b in runs:
            if v[a] - v[b] >= FALL_MIN_STEP_M and not pooled[sl][a:b + 1].any():
                v[a + 1:b + 1] = v[b]
                lip[a0 + a] = True
                plunge[a0 + b] = True
                kind[a0 + a + 1:a0 + b + 1] = KIND_FALL
        L[sl] = v
        # arc since the last pooled station (lake-outlet sill + ramp)
        pw = pooled[sl]
        arc = sol.arc[sl]
        last = np.where(pw, arc, -np.inf)
        last = np.maximum.accumulate(last)
        s = np.where(np.isfinite(last), arc - last, arc + incoming_since[r])
        since_pool[sl] = s
        d = down[r]
        if d >= 0 and not lost[sl.stop - 1]:
            incoming_end[d] = min(incoming_end[d], float(v[-1]))
            incoming_since[d] = min(incoming_since[d], float(s[-1]))
    # pin tributary ends to the trunk start: a small mismatch eases back over
    # JUNCTION_RAMP_M; a hanging valley (>= FALL_MIN_STEP_M) drops as a fall
    # whose plunge is the junction station itself
    for r in range(n_r):
        d = down[r]
        if d < 0:
            continue
        sl = sol.stations_of(r)
        if lost[sl.stop - 1]:
            continue
        target = float(L[sol.reach_start[d]])
        delta = float(L[sl.stop - 1]) - target
        if delta < -1e-4:
            # the trunk stands higher (a lake at the junction): backwater the
            # tributary's tail up to it — L is non-increasing, so this lifts
            # exactly the suffix that was under the trunk level
            L[sl] = np.where(lost[sl] | pooled[sl], L[sl], np.maximum(L[sl], target))
            continue
        if delta <= 1e-4:
            continue
        # a hanging valley is a fall only where the TERRAIN is a cliff at the
        # junction (a fall run of the floor ending within the last stations);
        # otherwise the tributary is cut down to its trunk over a ramp
        m = sl.stop - sl.start
        cliff = delta >= FALL_MIN_STEP_M and m >= 2 and any(
            b >= m - 3 for _a, b in _fall_runs(sol.floor[sl], sol.arc[sl]))
        if not cliff:
            # lower the tail by an amount fading from delta at the end to 0
            # upstream (monotone stays monotone: L is non-increasing, the
            # lowering non-decreasing downstream); a big mismatch ramps at
            # JUNCTION_RAMP_SLOPE so the cut is spread, not a step
            arc = sol.arc[sl]
            ramp = max(JUNCTION_RAMP_M, delta / JUNCTION_RAMP_SLOPE)
            lower = delta * np.clip(1.0 - (arc[-1] - arc) / ramp, 0.0, 1.0)
            L[sl] = np.maximum(L[sl] - lower, np.where(pooled[sl], sol.pool[sl], -np.inf))
        else:
            L[sl.stop - 1] = target
            lip[sl.stop - 2] = True
            plunge[sl.stop - 1] = True
            kind[sl.stop - 1] = KIND_FALL
    sol.L = L.astype(np.float32)
    sol.lip, sol.plunge, sol.pooled, sol.lost = lip, plunge, pooled, lost
    # a SHORE station: its section dips into a body (so it takes the body's
    # level) but its own centre stands above the water — it still needs a
    # trench, or the river runs dry along the lakeshore
    sol.shore = pooled & (sol.centre >= sol.pool - 1e-3)
    kind[lost] = KIND_LOST
    # the sill: after a pool the bed stays AT the level until the channel has
    # crossed the rim (the floor has risen SILL_RIM_M over L, or SILL_MAX_M),
    # never less than SILL_MIN_M; then the depth ramps in over SILL_RAMP_M
    sill = np.zeros(n_st, dtype=bool)
    ramp = np.ones(n_st, dtype=np.float32)
    for r in range(n_r):
        sl = sol.stations_of(r)
        sp = since_pool[sl]
        arc = sol.arc[sl]
        nat = sol.natural[sl]
        Lr = L[sl]
        pw = pooled[sl]
        m = sl.stop - sl.start
        k = 0
        while k < m:
            if not np.isfinite(sp[k]) or pw[k]:
                k += 1
                continue
            # a fresh dry run after a pool starts here
            j = k
            end_sill = None
            while j < m and not pw[j] and np.isfinite(sp[j]):
                if end_sill is None and sp[j] >= SILL_MIN_M and (
                        nat[j] - Lr[j] >= SILL_RIM_M or sp[j] >= SILL_MAX_M):
                    end_sill = j
                j += 1
            if end_sill is None:
                end_sill = j
            sill[sl.start + k:sl.start + end_sill] = True
            ramp[sl.start + k:sl.start + end_sill] = 0.0
            a0 = arc[end_sill] if end_sill < m else arc[-1] + 1e-3
            ramp[sl.start + end_sill:sl.start + j] = np.clip((arc[end_sill:j] - a0) / SILL_RAMP_M, 0.0, 1.0)
            k = j
    sol.sill = sill
    sol.ramp = ramp
    sol.ramp[pooled] = 1.0
    _classify(sol, kind)
    return sol


def _classify(sol: ChannelSolution, kind: np.ndarray) -> None:
    """Steep stations from the L slope over SLOPE_WINDOW_M (fall steps
    removed), merged into runs >= STEEP_MIN_M; speeds banded with floors."""
    n_st = sol.n
    steep = np.zeros(n_st, dtype=bool)
    slope_w = np.zeros(n_st, dtype=np.float32)
    for r in range(len(sol.reach_start)):
        sl = sol.stations_of(r)
        L = sol.L[sl].astype(np.float64)
        arc = sol.arc[sl].astype(np.float64)
        drops = np.where(kind[sl][1:] == KIND_FALL, -np.diff(L), 0.0)
        # the whole step lands on the first fall-interior station; add it back
        Lnf = L + np.concatenate([[0.0], np.cumsum(drops)])
        m = len(L)
        if m < 2:
            continue
        half = SLOPE_WINDOW_M / 2.0
        lo = np.searchsorted(arc, arc - half, side="left")
        hi = np.searchsorted(arc, arc + half, side="right") - 1
        lo = np.clip(lo, 0, m - 1); hi = np.clip(hi, 0, m - 1)
        span = np.maximum(arc[hi] - arc[lo], 1e-6)
        s = (Lnf[lo] - Lnf[hi]) / span
        slope_w[sl] = s
        st = (s >= STEEP_SLOPE) & (kind[sl] == KIND_FIELD) & ~sol.pooled[sl] & ~sol.sill[sl]
        # runs >= STEEP_MIN_M, broken by falls
        k = 0
        while k < m:
            if not st[k]:
                k += 1
                continue
            j = k
            while j + 1 < m and st[j + 1]:
                j += 1
            if arc[j] - arc[k] >= STEEP_MIN_M:
                steep[sl.start + k:sl.start + j + 1] = True
            k = j + 1
    kind = kind.copy()
    kind[steep] = KIND_STEEP
    sol.kind = kind
    sol.slope_w = slope_w
    size = np.maximum(sol.accum, 0.05) ** 0.1
    raw = np.clip((0.35 + 9.0 * np.sqrt(np.maximum(slope_w, 0.0))) * size, 0.15, SPEED_MAX)
    v = np.full(n_st, 2.30, dtype=np.float32)
    for thr, val in reversed(SPEED_BANDS):
        v[raw < thr] = val
    floor = np.select([sol.band == b for b in (1, 2, 3)],
                      [SPEED_FLOOR[b] for b in (1, 2, 3)]).astype(np.float32)
    v = np.maximum(v, floor)
    v[sol.pooled] = np.minimum(v[sol.pooled], floor[sol.pooled])
    sol.speed = v.astype(np.float32)


# ---------------------------------------------------------------------------
# rasterisation
# ---------------------------------------------------------------------------

def raster_fields(sol: ChannelSolution, shape) -> dict:
    """Nearest-station fields on the full grid.

    Per band b: `near_b` (station index of the nearest band-b station),
    `dist_b` (metres). `near` / `dist`: nearest station of any band.
    `inside_b`: within that station's half-width. Falls back to the
    per-band nearest so a tributary's cells inside its trunk's width are
    seen by the trunk too (the cut takes the deepest, the level the lowest)."""
    mpp = sol.mpp
    iy = np.clip(np.round(sol.y).astype(int), 0, shape[0] - 1)
    ix = np.clip(np.round(sol.x).astype(int), 0, shape[1] - 1)
    out = {"bands": []}
    near = np.full(shape, -1, dtype=np.int32)
    dist = np.full(shape, np.inf, dtype=np.float32)
    for b in (1, 2, 3):
        sel = np.flatnonzero(sol.band == b)
        if not len(sel):
            continue
        mask = np.zeros(shape, dtype=bool)
        st_id = np.full(shape, -1, dtype=np.int32)
        mask[iy[sel], ix[sel]] = True
        st_id[iy[sel], ix[sel]] = sel      # later stations win ties (downstream)
        d, (ky, kx) = ndimage.distance_transform_edt(~mask, return_indices=True)
        d = (d * mpp).astype(np.float32)
        nb = st_id[ky, kx]
        del ky, kx
        inside = d <= sol.width[nb] * 0.5 + 0.5 * mpp
        out["bands"].append((b, nb, d, inside))
        closer = d < dist
        near[closer] = nb[closer]
        dist[closer] = d[closer]
    out["near"] = near
    out["dist"] = dist
    return out


def nearest_stations(sol: ChannelSolution, shape, select: np.ndarray):
    """(station index, distance m) of the nearest station among `select`."""
    mpp = sol.mpp
    sel = np.flatnonzero(select)
    near = np.full(shape, -1, dtype=np.int32)
    dist = np.full(shape, np.inf, dtype=np.float32)
    if not len(sel):
        return near, dist
    iy = np.clip(np.round(sol.y[sel]).astype(int), 0, shape[0] - 1)
    ix = np.clip(np.round(sol.x[sel]).astype(int), 0, shape[1] - 1)
    mask = np.zeros(shape, dtype=bool)
    st_id = np.full(shape, -1, dtype=np.int32)
    mask[iy, ix] = True
    st_id[iy, ix] = sel
    d, (ky, kx) = ndimage.distance_transform_edt(~mask, return_indices=True)
    return st_id[ky, kx], (d * mpp).astype(np.float32)


def carve(terrain: np.ndarray, sol: ChannelSolution,
          protect: np.ndarray | None = None,
          no_raise: np.ndarray | None = None) -> tuple[np.ndarray, dict]:
    """Cut the trench and build the shoulder (decision 0047).

    Inside the water width: parabolic bed from L − D·ramp at the centreline
    to L at the edge (only ever lowered; D is FORD_DEPTH_M at a road
    crossing). Shoulder ring w/2 .. w/2 + 6 m: crest 0.3 over the highest L
    of the stations around the cell, from the water's edge out to 3.5 m,
    smoothstep back to the original terrain by the ring's edge (raised or cut
    to that profile; a cut into a hillside is capped; `protect` cells — the
    collar of a standing body — are never cut and `no_raise` cells — a body's
    bed and rim — are never raised, so the shoulder can neither breach a lake
    nor dam its outlet). Pooled stations whose centre is under the water are
    left alone (shore stations are trenched); fall interiors (the cliff face)
    are left alone; a plunge basin is dug at every fall base. Lake outlets
    keep a sill: bed AT the lake level, then the depth ramps in, so the lake
    keeps its level."""
    h = terrain.astype(np.float32, copy=True)
    fld = raster_fields(sol, h.shape)
    active = (~sol.pooled | sol.shore) & (sol.kind != KIND_FALL) & (sol.kind != KIND_LOST)
    depth = sol.depth_cut
    cut = np.full(h.shape, np.inf, dtype=np.float32)
    any_inside = np.zeros(h.shape, dtype=bool)
    for b, nb, d, inside in fld["bands"]:
        ok = inside & active[nb]
        r = np.maximum(sol.width[nb] * 0.5, 1e-3)
        t = np.clip(d / r, 0.0, 1.0)
        bed = sol.L[nb] - depth[nb] * sol.ramp[nb] * (1.0 - t * t)
        cut = np.where(ok, np.minimum(cut, bed), cut)
        any_inside |= ok
    before = h.copy()
    h = np.where(any_inside, np.minimum(h, cut), h)
    del cut
    # shoulder ring, around the nearest ACTIVE station (a pooled station has
    # no ring, so beside a lake outlet the sill's ring must still reach). The
    # crest follows the HIGHEST level among the stations around the cell: on
    # a steep reach the cell beside station k is often nearest to k+1, a
    # metre lower, and a crest at k+1's level leaves k's water hanging
    nb, d = nearest_stations(sol, h.shape, active)
    r = np.maximum(sol.width[np.maximum(nb, 0)] * 0.5, 1e-3)
    ring = (~any_inside) & (nb >= 0) & (d <= r + SHOULDER_BLEND_M)
    L = np.where(nb >= 0, sol.L[np.maximum(nb, 0)], -np.inf).astype(np.float32)
    L = ndimage.maximum_filter(L, size=3, mode="nearest")
    crest = L + SHOULDER_RAISE_M
    t2 = np.clip((d - r - SHOULDER_CREST_M) / (SHOULDER_BLEND_M - SHOULDER_CREST_M), 0.0, 1.0)
    t2 = t2 * t2 * (3.0 - 2.0 * t2)
    target = crest * (1.0 - t2) + h * t2
    lo = h - SHOULDER_CUT_CAP_M
    hi = h + SHOULDER_RAISE_CAP_M
    if protect is not None:
        lo = np.where(protect, h, lo)          # never cut the rim of a standing body
    if no_raise is not None:
        hi = np.where(no_raise, h, hi)         # never dam a body or raise its bed
    target = np.clip(target, lo, hi)
    h = np.where(ring, target, h).astype(np.float32)
    del target, crest, t2, L, lo, hi
    # plunge basins
    n_basins = 0
    for k in np.flatnonzero(sol.plunge):
        P = float(sol.L[k]); w = float(sol.width[k]); dp = max(float(depth[k]), PLUNGE_MIN_DEPTH_M)
        rr = int(np.ceil(w / sol.mpp)) + 1
        cy, cx = int(round(float(sol.y[k]))), int(round(float(sol.x[k])))
        y0, y1 = max(cy - rr, 0), min(cy + rr + 1, h.shape[0])
        x0, x1 = max(cx - rr, 0), min(cx + rr + 1, h.shape[1])
        yy, xx = np.mgrid[y0:y1, x0:x1]
        dd = np.hypot(yy - sol.y[k], xx - sol.x[k]) * sol.mpp
        t = np.clip(dd / max(w, 1e-3), 0.0, 1.0)
        bowl = P - dp * (1.0 - t * t)
        # dig the floor around the plunge, never the wall behind it
        blk = h[y0:y1, x0:x1]
        h[y0:y1, x0:x1] = np.where((dd <= w) & (blk <= P + PLUNGE_FLOOR_ABOVE_M),
                                   np.minimum(blk, bowl), blk)
        n_basins += 1
    delta = h - before
    low = delta[delta < -0.01]
    stats = {
        "stations": int(sol.n),
        "reaches": int(len(sol.reach_start)),
        "cellsLowered": int(low.size),
        "cellsRaised": int((delta > 0.01).sum()),
        "medianM": round(float(np.median(-low)), 3) if low.size else 0.0,
        "p90M": round(float(np.percentile(-low, 90)), 3) if low.size else 0.0,
        "maxM": round(float(-low.min()), 3) if low.size else 0.0,
        "maxRaiseM": round(float(delta.max()), 3),
        "trenchCells": int(any_inside.sum()),
        "pooledStations": int(sol.pooled.sum()),
        "shoreStations": int(sol.shore.sum()),
        "fordStations": int(sol.ford.sum()),
        "fallStations": int((sol.kind == KIND_FALL).sum()),
        "lostStations": int((sol.kind == KIND_LOST).sum()),
        "steepStations": int((sol.kind == KIND_STEEP).sum()),
        "falls": int(sol.lip.sum()),
        "plungeBasins": n_basins,
    }
    return h, stats


# ---------------------------------------------------------------------------
# reach records (strips / cascades) — geometry only; compile_water adds
# the field-surface joins and writes the JSON
# ---------------------------------------------------------------------------

def steep_runs(sol: ChannelSolution) -> list[tuple[int, int]]:
    """[start, end] inclusive station ranges of consecutive KIND_STEEP
    stations within one reach."""
    runs = []
    for r in range(len(sol.reach_start)):
        sl = sol.stations_of(r)
        st = sol.kind[sl] == KIND_STEEP
        k = 0
        m = sl.stop - sl.start
        while k < m:
            if not st[k]:
                k += 1
                continue
            j = k
            while j + 1 < m and st[j + 1]:
                j += 1
            runs.append((sl.start + k, sl.start + j))
            k = j + 1
    return runs


def falls(sol: ChannelSolution) -> list[tuple[int, int]]:
    """(lip station, plunge station) per fall, in station order."""
    out = []
    lips = np.flatnonzero(sol.lip)
    for a in lips:
        b = a + 1
        while b < sol.n and sol.kind[b] == KIND_FALL and sol.reach[b] == sol.reach[a]:
            b += 1
        out.append((int(a), int(b - 1)))
    return out
