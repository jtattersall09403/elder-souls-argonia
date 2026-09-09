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
             slope >= FALL_SLOPE with the face contiguous at >= FALL_FACE_SLOPE
             (a gentler ramp is a chute strip, never a sheet); L STEPS
             there (lip level to the lip, plunge level after) — never a ramp
  steep    = |dL/ds| >= STEEP_SLOPE over a SLOPE_WINDOW_M window (fall steps
             removed), in runs >= STEEP_MIN_M — these become strip meshes

All positions are full-res sample coordinates (sample j sits at world
j * mpp, per packages/game-core/src/terrain/heightfield.ts).
"""

from __future__ import annotations

import numpy as np
from .npz_io import savez as _savez
from scipy import ndimage

from .scale import RAW_M

# --- geometry --------------------------------------------------------------
WIDTH_COEF, WIDTH_EXP = 14.0, 0.40      # Leopold–Maddock hydraulic width (m, km²)
MIN_ACCUM_KM2 = 0.02
CENTRE_DEPTH = {1: 0.5, 2: 1.2, 3: 2.0}  # water depth at the centreline by band
# --- wetted width (what the water occupies, not what the trench is) ---------
# `width` above is the HYDRAULIC width: the bank-to-bank width of the trench
# the carve digs, and the width the field raster, flood, road and ford rules
# all use. The water inside that trench does not fill it. `wetted_width()`
# derives the width the flow actually occupies from continuity on the carved
# cross-section (see the function).
SPECIFIC_RUNOFF = 0.0475                 # m³/s per km² of catchment. Mean annual runoff of a
                                         # wet-tropical lowland (~1500 mm/yr) — Black Marsh is
                                         # the wettest province; one physical constant for the
                                         # whole province, never a per-site figure.
# A channel's geometry is set by its DOMINANT (bankfull, channel-forming)
# discharge, not by the mean annual flow: the mean is the trickle in the bed,
# the dominant is the flow the bed was cut to carry, and it is what a river
# looks like when it is running normally. `width` above is already a bankfull
# relation, so the wetted width has to close against a bankfull flow too or the
# two numbers answer different questions and the ratio comes out absurd (it did:
# 0.105–0.178, a 16 m fall drawn 0.74 m wide).
#
# No published Q_bankfull / Q_mean-annual multiple exists — the literature
# normalises bankfull by return period or by the mean annual flood. So the
# multiple is *derived*, from a regional bankfull-discharge curve over its own
# region's water balance, and then transferred as a DIMENSIONLESS ratio onto our
# runoff (transferring a ratio across climates is defensible; transferring an
# absolute discharge is not):
#   USGS regionalized bankfull curve, New York Region 5 (humid temperate):
#     Q_bf = 45.3 · DA^0.856  [ft³/s, mi²]  ->  0.568 · A^0.856  [m³/s, km²]
#     (USGS SIR, "Regionalized equations for bankfull discharge and channel
#      characteristics of streams in New York"; NY Regions 6/7 give 0.53/0.41
#      at 1 km² with exponents 0.84/0.77 — same order.)
#   New York mean annual runoff ~550 mm/yr = 0.0174 m³/s per km².
#   ratio(1 km²) = 0.568 / 0.0174 ≈ 32.6 ; ratio(A) = ratio(1) · A^(0.856-1).
# Exponent 0.856 is inside the b≈0.45–0.60 downstream cluster once expressed
# against discharge (Leopold & Maddock 1953, USGS Prof. Paper 252). Transferring
# the temperate multiple to the tropics is conservative rather than generous:
# tropical bankfull recurs MORE often than temperate (observed median return
# interval 1.0 yr vs 1.4 yr; the uniform 2-yr assumption overestimates tropical
# bankfull by 54±78%) — Nature Communications (2026), "Global estimation of
# bankfull river discharge reveals distinct flood recurrences across climate
# zones", doi:10.1038/s41467-026-76433-3.
DOMINANT_OVER_MEAN_1KM2 = 32.6           # dominant/mean-annual discharge at a 1 km² catchment
DOMINANT_RATIO_EXP = -0.144              # ...falling as A^this (0.856 − 1): small catchments are
                                         # flashier, so their bankfull is a bigger multiple
BASEFLOW_M3S = 0.002                     # a headwater trickle still carries something (2 L/s;
                                         # binds on no station of the shipped network, so the
                                         # wetted width is pure flow, not a floor)
WETTED_MIN_M = 0.6                       # a stream narrower than this is a seep, not a channel
FLOOR_CLEAR_M = 0.15                     # natural level = valley floor + this
FLOOR_BELOW_CENTRE_M = 4.0               # the section min may not chase a cliff
SHOULDER_RAISE_M = 0.3                   # shoulder crest = L + this, from the water's edge...
SHOULDER_CREST_M = 3.5                   # ...out to here (>= one cell centre in every direction)
SHOULDER_BLEND_M = 6.0                   # back to the original terrain by w/2 + this
SHOULDER_CUT_CAP_M = 3.0                 # a hillside bank is never cut deeper than this
SHOULDER_RAISE_CAP_M = 2.5               # hard cap on any shoulder raise (field)...
STEEP_RAISE_CAP_M = 4.5                  # ...beside a torrent (cell levels differ by ~1 m)...
SILL_RAISE_CAP_M = 3.5                   # ...and the flank of a lake-outlet weir
LEVEE_ALLOW_M = 0.45                     # bankfull: L <= the lower bank barrier + this...
DITCH_ALLOW_M = 1.2                      # ...and <= the lowest ring ground + this
DITCH_SCAN_M = 2.0                       # ring ground deeper than this under the floor is ignored
FORD_DEPTH_M = 0.3                       # a road crossing keeps the bed within this of L
SMOOTH_SIGMA_CELLS = 1.2                 # centreline smoothing (coarse cells)
JUNCTION_RAMP_M = 40.0                   # a small junction mismatch eases out over this
JUNCTION_RAMP_SLOPE = 0.05               # a hanging tributary with no cliff ramps down at this
SILL_MIN_M = 3.7                         # lake outlet: a weir AT the lake level for at least this,
SILL_TOL_M = 0.05                        # ...while the centreline ground is within [P − tol,
SILL_RIM_M = 0.35                        # ...P + rim) (still on the rim) and at most
SILL_MAX_M = 40.0                        # ...this far; then the bed deepens to L − D over
SILL_RAMP_M = 12.0                       # ...this length
POOL_TOL_M = 0.3                         # a station whose section touches a body within this of
                                         # its natural level is in the body (its shore or inlet)
STEEP_NOTCH_FRAC = 0.6                   # extra bed depth per metre of level drop per cell: on a
                                         # chute the terrain between two stations must stay under
                                         # the ribbon that joins them
CREST_REACH_M = 4.5                      # the shoulder crest follows a higher neighbouring station's
                                         # level by at most this (never a lip's level at its plunge)
# --- classification ---------------------------------------------------------
STEEP_SLOPE = 0.035
STEEP_MIN_M = 10.0
SLOPE_WINDOW_M = 10.0
FALL_DROP_M = 3.0
SEA_REACH_MAX_CELLS = 30                 # a sea-draining terminus is extended to
                                         # the ocean over at most this many coarse cells
FALL_SLOPE = 1.2                         # mean slope over the steep part (~50 deg; a 45 deg
                                         # borderline is a chute strip, not a sheet)
FALL_FACE_SLOPE = 2.75                   # the face must be steeper than the falling water's
                                         # trajectory (~70 deg) for the sheet to leave the rock;
                                         # gentler and the water runs ON it — a chute, not a
                                         # curtain. Measured 2026-09-08 on the 20 shipped
                                         # cascades: 18 accumulate 5.6-132 m at >= 70 deg,
                                         # fall-7 and fall-17 accumulate 0.0 m (uniform ~51 deg
                                         # ramps) — a clean gap, not a tuned knob.
FALL_MIN_STEP_M = 2.5                    # the L step must keep at least this
CANYON_MAX_M = 8.0                       # never cut deeper than this below the floor
BACKWATER_MAX_M = 1.0                    # a lake may back water up this far over the approach
LOST_EXIT_M = 1.0                        # a lost stretch ends this far below its crest
PLUNGE_MIN_DEPTH_M = 1.5
PLUNGE_SCOUR_PER_DROP = 0.06             # scour grows with head: bowl depth = min + this x the
PLUNGE_MAX_DEPTH_M = 8.0                 # fall's drop, capped. Measured 2026-09-08: the 131 m
                                         # gorge fall (fall-3, plunge 2524/317) had a 1.44 m max
                                         # pool over 63 wet cells (median 0.72) — the channel's
                                         # own centre depth, whatever the fall above it.
PLUNGE_FLOOR_ABOVE_M = 2.5               # the basin only deepens ground this close above its level
# --- flow speed ---------------------------------------------------------------
SPEED_FLOOR = {1: 0.45, 2: 0.60, 3: 0.75}   # m/s, so lowland rivers visibly move
SPEED_BANDS = ((0.45, 0.30), (0.95, 0.70), (1.7, 1.30))  # (raw <, banded) ... else 2.3
SPEED_MAX = 3.0

KIND_FIELD, KIND_STEEP, KIND_FALL, KIND_LOST = 0, 1, 2, 3


# ---------------------------------------------------------------------------
# graph → reaches
# ---------------------------------------------------------------------------

def build_reaches(rivers: np.ndarray, flow_to: np.ndarray,
                  ocean: np.ndarray | None = None,
                  coarse_ground: np.ndarray | None = None) -> list[np.ndarray]:
    """Split the coarse river graph into reaches: maximal downstream paths
    whose interior cells have exactly one river cell upstream. A reach starts
    at a source or a junction and ends at (and includes) the next junction or
    the outlet, so junction cells are shared by every reach meeting there.

    A terminal chain whose last river cell stands well above sea level is
    extended down `flow_to` past that cell to the first ocean cell (included)
    — a river that meets the coast at a cliff falls into the sea, and without
    the extension its last station holds the clifftop level over cells that
    hang above the shore. The extension cells are not river cells: `solve`
    gives them the last river cell's band and accumulation.

    Returns flat coarse indices per reach, deterministically ordered."""
    riv = rivers.reshape(-1) > 0
    ft = flow_to.reshape(-1)
    ds = np.where(riv & (ft >= 0) & riv[np.maximum(ft, 0)], ft, -1)
    indeg = np.bincount(ds[ds >= 0], minlength=riv.size)
    heads = np.flatnonzero(riv & (indeg != 1))
    oc = ocean.reshape(-1) if ocean is not None else None
    cg = coarse_ground.reshape(-1) if coarse_ground is not None else None
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
        last = chain[-1]
        if (oc is not None and cg is not None and int(ds[last]) < 0
                and not bool(oc[last]) and float(cg[last]) >= FALL_DROP_M):
            ext, cur, seen = [], last, set(chain)
            for _ in range(SEA_REACH_MAX_CELLS):
                nxt = int(ft[cur])
                if nxt < 0 or nxt in seen:
                    break
                ext.append(nxt)
                seen.add(nxt)
                cur = nxt
                if bool(oc[nxt]):
                    chain = chain + ext           # reached the sea: keep it
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
        """Centre depth the bed is cut to: the band's depth, deeper on a chute
        (STEEP_NOTCH_FRAC of the level drop per cell, so the terrain between
        two stations stays under the ribbon), and a ford at a road crossing."""
        d = self.depth.astype(np.float32)
        slope = getattr(self, "slope_w", None)
        if slope is not None:
            d = d + STEEP_NOTCH_FRAC * np.clip(slope, 0.0, 1.0) * self.mpp
        ford = getattr(self, "ford", None)
        if ford is not None:
            d = np.where(ford, np.minimum(d, FORD_DEPTH_M), d)
        return d.astype(np.float32)

    def save(self, path) -> None:
        arrays = {k: np.asarray(v) for k, v in self.__dict__.items()
                  if isinstance(v, (np.ndarray, np.generic, float, int))}
        arrays["shape"] = np.asarray(self.shape, dtype=np.int64)
        _savez(path, **arrays)

    @classmethod
    def load(cls, path) -> "ChannelSolution":
        z = np.load(path)
        d = {k: (z[k].item() if z[k].ndim == 0 else z[k]) for k in z.files}
        d["shape"] = tuple(int(v) for v in d["shape"])
        d.setdefault("spacing_m", np.float32(d["mpp"]))     # one sample per station
        d.setdefault("ford", np.zeros(len(d["x"]), dtype=bool))
        d.setdefault("to_sea", np.zeros(len(d["x"]), dtype=bool))
        d.setdefault("captured", np.zeros(len(d["x"]), dtype=bool))
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
    ocean = npz["ocean"] if "ocean" in getattr(npz, "files", npz) else None
    half0 = (step - 1) / 2.0
    gy = np.clip(np.round(np.arange(hc) * step + half0).astype(int), 0, terrain.shape[0] - 1)
    gx = np.clip(np.round(np.arange(wc) * step + half0).astype(int), 0, terrain.shape[1] - 1)
    coarse_ground = terrain[gy[:, None], gx[None, :]]
    reaches = build_reaches(rivers, flow_to, ocean, coarse_ground)
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
        # a coast extension carries no band or accumulation of its own: clamp
        # the attribute index to the last river cell, or the extension reads
        # band 0 (centre depth 0) and the carve breaks
        bch = rivers.reshape(-1)[chain].copy()
        ach = accum.reshape(-1)[chain].copy()
        nz = np.flatnonzero(bch > 0)
        if len(nz):
            j = int(nz[-1])
            bch[j + 1:] = bch[j]
            ach[j + 1:] = ach[j]
        cols["band"].append(bch[vi])
        cols["accum"].append(ach[vi])
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
    centre_cell = terrain[np.clip(np.round(y).astype(int), 0, terrain.shape[0] - 1),
                          np.clip(np.round(x).astype(int), 0, terrain.shape[1] - 1)].astype(np.float32)
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
    # the ditch check needs the whole crest annulus, not three points on a
    # perpendicular (a terrace edge running obliquely beside the channel
    # slips between rays): per station, the lowest ground among the ring
    # cells (w/2 .. w/2 + SHOULDER_CREST_M) nearest to it. Only ground within
    # DITCH_SCAN_M under the floor counts: a deeper drop beside a channel is
    # a gorge or a sculpt sink, and lowering the level to it would drag the
    # running minimum down and strand every station downstream
    sol_tmp = ChannelSolution(x=x.astype(np.float32), y=y.astype(np.float32), mpp=float(mpp))
    nb_all, d_all = nearest_stations(sol_tmp, terrain.shape, np.ones(n_st, dtype=bool))
    k0 = np.maximum(nb_all, 0)
    r_m = width[k0] * 0.5
    ann = (nb_all >= 0) & (d_all > r_m) & (d_all <= r_m + SHOULDER_CREST_M) \
        & (terrain > floor[k0] - DITCH_SCAN_M)
    labels = np.where(ann, nb_all, -1)
    ann_min = np.asarray(ndimage.minimum(np.where(ann, terrain, np.inf), labels, np.arange(n_st)),
                         dtype=np.float32)
    ann_n = np.asarray(ndimage.sum(ann, labels, np.arange(n_st)))
    ann_min = np.where(ann_n > 0, ann_min, np.inf).astype(np.float32)   # an empty label reads 0, not inf
    del nb_all, d_all, k0, r_m, ann, labels, ann_n
    bank_low = np.minimum(bank_low, np.where(np.isfinite(ann_min), ann_min, np.inf)).astype(np.float32)
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
    # reaches that drain to the sea: their profile never drops under 0 (an
    # open channel cannot run below the sea it flows into and climb back)
    to_sea = _reaches_to_sea(reaches, flow_to, ocean)
    ford = np.zeros(n_st, dtype=bool)
    if roads is not None:
        # a station is a ford when the road touches its section anywhere
        # across the width (a road crosses at an angle: the cells it covers
        # at the bank belong to stations up- and downstream of the centre)
        rd = ndimage.binary_dilation(roads, iterations=2)
        offs = np.linspace(-1.0, 1.0, 9)[None, :] * (r_px[:, None] + 1.0)
        ys = np.clip(np.round(y[:, None] + ny[:, None] * offs).astype(int), 0, terrain.shape[0] - 1)
        xs = np.clip(np.round(x[:, None] + nx[:, None] * offs).astype(int), 0, terrain.shape[1] - 1)
        ford = rd[ys, xs].any(1)

    sol = ChannelSolution(
        x=x.astype(np.float32), y=y.astype(np.float32), tx=tx.astype(np.float32),
        ty=ty.astype(np.float32), arc=arc, reach=reach, reach_start=reach_start,
        reach_end=reach_end, band=band, accum=accum, width=width, depth=depth,
        floor=floor, bank_min=bank_min, bank_low=bank_low, centre=centre, centre_cell=centre_cell,
        natural=natural,
        ford=ford, to_sea=to_sea[reach], pool=np.full(n_st, -np.inf, dtype=np.float32),
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


def _reaches_to_sea(reaches, flow_to, ocean) -> np.ndarray:
    """Per reach: does its chain end in the ocean (or leave the map)?"""
    ft = flow_to.reshape(-1)
    oc = ocean.reshape(-1) if ocean is not None else None
    head_of = {}
    for r, chain in enumerate(reaches):
        head_of.setdefault(int(chain[0]), r)
    out = np.zeros(len(reaches), dtype=bool)
    for r, chain in enumerate(reaches):
        cur = r
        for _ in range(len(reaches) + 1):
            last = int(reaches[cur][-1])
            nxt = int(ft[last])
            d = head_of.get(last, -1)
            if d >= 0 and d != cur:
                cur = d
                continue
            out[r] = nxt < 0 or (oc is not None and bool(oc[nxt]))
            break
    return out


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
    falls at >= FALL_FACE_SLOPE per station, totalling >= FALL_DROP_M at a
    mean slope >= FALL_SLOPE."""
    n = len(profile)
    if n < 2:
        return []
    ds = np.diff(arc)
    ds[ds <= 0] = 1e-6
    slope = -np.diff(profile) / ds
    steep = slope >= FALL_FACE_SLOPE
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
    If the route arrives further under the lake, the running minimum stands
    and the run is CAPTURED: the river cuts through and the lake drains to
    it, so its stations are ordinary channel — `pooled` is cleared in place
    (no weir after it, no lake level for it)."""
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
        else:
            pooled[k:j + 1] = False
        k = j + 1
    return v


def capture_neighbours(sol: ChannelSolution, margin_m: float = 1.0) -> int:
    """Two channels whose widths touch cannot hold water at different levels:
    the higher drains into the lower (a tributary running beside its trunk
    before the junction; a lake outlet skirting a lower stream). Lower the
    natural level and the pool level of every station to the lowest L among
    other-reach stations within reach of its width, so the next profile
    solve carries the shared level. Returns the number of stations changed."""
    from scipy.spatial import cKDTree
    pts = np.stack([sol.x, sol.y], 1) * sol.mpp
    tree = cKDTree(pts)
    r = sol.width * 0.5
    reach_r = np.full(sol.n, 2.0 * float(r.max()) + margin_m)
    changed = 0
    nbr = np.full(sol.n, np.inf, dtype=np.float32)
    pairs = tree.query_pairs(float(reach_r.max()), output_type="ndarray")
    if len(pairs):
        i, j = pairs[:, 0], pairs[:, 1]
        d = np.hypot(*(pts[i] - pts[j]).T)
        ok = (sol.reach[i] != sol.reach[j]) & (d <= r[i] + r[j] + margin_m) \
            & ~sol.lost[i] & ~sol.lost[j]
        i, j = i[ok], j[ok]
        np.minimum.at(nbr, i, sol.L[j])
        np.minimum.at(nbr, j, sol.L[i])
    low = nbr < sol.L - 0.05
    if low.any():
        sol.natural = np.where(low, np.minimum(sol.natural, nbr), sol.natural).astype(np.float32)
        sol.pool = np.where(low & np.isfinite(sol.pool), np.minimum(sol.pool, nbr), sol.pool).astype(np.float32)
        changed = int(low.sum())
    return changed


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
    fall_drop = np.zeros(n_st, dtype=np.float32)   # on the plunge station: its fall's drop
    kind = np.zeros(n_st, dtype=np.uint8)
    pooled = np.isfinite(sol.pool) & (sol.pool >= sol.natural - POOL_TOL_M)
    lost = np.zeros(n_st, dtype=bool)
    since_pool = np.full(n_st, np.inf, dtype=np.float32)   # metres since a pooled station
    pool_behind = np.full(n_st, -np.inf, dtype=np.float32)  # that station's level

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
    incoming_P = np.full(n_r, -np.inf, dtype=np.float32)
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
            v = _backwater(v, pw, lost[sl], sol.pool[sl])   # may clear captured runs in pw
        runs = _fall_runs(sol.floor[sl], sol.arc[sl])
        a0 = sl.start
        for a, b in runs:
            # the plunge station alone may be pooled — a body at the foot of a
            # cliff is the plunge pool — but a pooled lip means the water above
            # is already a lake (the sill/weir case, handled separately) and a
            # pooled interior means part of the drop is under standing water,
            # which is not a fall
            if v[a] - v[b] >= FALL_MIN_STEP_M and not pooled[sl][a:b].any():
                # the fall lands at the level the channel continues at (the
                # next station's, a lake's or the sea's): a step right after
                # the plunge would leave the pool hanging over the reach below
                foot = v[b + 1] if b + 1 < len(v) else v[b]
                fall_drop[a0 + b] = float(v[a] - min(v[b], foot))
                v[a + 1:b + 1] = min(v[b], foot)
                lip[a0 + a] = True
                plunge[a0 + b] = True
                kind[a0 + a + 1:a0 + b + 1] = KIND_FALL
        L[sl] = v
        # arc since the last pooled station (lake-outlet sill + ramp)
        pw = pooled[sl]
        arc = sol.arc[sl]
        last = np.where(pw, arc, -np.inf)
        last = np.maximum.accumulate(last)
        idx = np.maximum.accumulate(np.where(pw, np.arange(len(pw)), -1))
        P_here = np.where(idx >= 0, v[np.maximum(idx, 0)], incoming_P[r])
        s = np.where(np.isfinite(last), arc - last, arc + incoming_since[r])
        since_pool[sl] = s
        pool_behind[sl] = P_here
        d = down[r]
        if d >= 0 and not lost[sl.stop - 1]:
            incoming_end[d] = min(incoming_end[d], float(v[-1]))
            if float(s[-1]) < incoming_since[d]:
                incoming_since[d] = float(s[-1])
                incoming_P[d] = float(P_here[-1])
    # pin tributary ends to the trunk start: a small mismatch eases back over
    # JUNCTION_RAMP_M; a hanging valley (>= FALL_MIN_STEP_M) drops as a fall
    # whose plunge is the junction station itself. Downstream reaches first:
    # a reach's own tail ramp can lower its start, and its tributaries must
    # pin to the start as it ends up
    for r in reversed(order):
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
            fall_drop[sl.stop - 1] = float(delta)
            lip[sl.stop - 2] = True
            plunge[sl.stop - 1] = True
            kind[sl.stop - 1] = KIND_FALL
    to_sea = getattr(sol, "to_sea", None)
    if to_sea is not None:
        L = np.where(to_sea & ~lost, np.maximum(L, 0.0), L)
    # a CAPTURED body: the river arrives under its level (more than
    # BACKWATER_MAX_M) and cuts on through — the body drains to the trench,
    # so its stations are ordinary channel, not pooled
    was_pooled = np.isfinite(sol.pool) & (sol.pool >= sol.natural - POOL_TOL_M)
    captured = was_pooled & (~pooled | (L < sol.pool - 0.05))
    pooled = pooled & ~captured
    sol.L = L.astype(np.float32)
    sol.lip, sol.plunge, sol.pooled, sol.lost, sol.captured = lip, plunge, pooled, lost, captured
    sol.fall_drop = fall_drop
    # a SHORE station: its section dips into a body (so it takes the body's
    # level) but its own centre stands above the water — it still needs a
    # trench, or the river runs dry along the lakeshore
    cc = getattr(sol, "centre_cell", sol.centre)
    sol.shore = pooled & (cc >= sol.pool - 1e-3)
    kind[lost] = KIND_LOST
    # the sill: after a pool the bed is a weir AT the lake level (and so is L)
    # until the channel has crossed the rim — the centreline ground has
    # dropped under the lake level or risen clearly over it — never for less
    # than SILL_MIN_M nor more than SILL_MAX_M; then the depth ramps in over
    # SILL_RAMP_M. Cutting the rim any deeper drains the lake to the cut
    # (bankfull is not consulted here: at the spill the water is leaving
    # over the rim, and its level is the lake's).
    sill = np.zeros(n_st, dtype=bool)
    ramp = np.ones(n_st, dtype=np.float32)
    for r in range(n_r):
        sl = sol.stations_of(r)
        sp = since_pool[sl]
        arc = sol.arc[sl]
        nf = sol.centre[sl]
        Pb = pool_behind[sl]
        pw = pooled[sl]
        lo = lost[sl]
        m = sl.stop - sl.start
        k = 0
        while k < m:
            if not np.isfinite(sp[k]) or pw[k] or lo[k]:
                k += 1
                continue
            # a fresh dry run after a pool starts here
            j = k
            end_sill = None
            while j < m and not pw[j] and not lo[j] and np.isfinite(sp[j]):
                if end_sill is None and sp[j] >= SILL_MIN_M and (
                        nf[j] < Pb[j] - SILL_TOL_M or nf[j] >= Pb[j] + SILL_RIM_M
                        or sp[j] >= SILL_MAX_M):
                    end_sill = j
                j += 1
            if end_sill is None:
                end_sill = j
            sill[sl.start + k:sl.start + end_sill] = True
            ramp[sl.start + k:sl.start + end_sill] = 0.0
            seg = slice(sl.start + k, sl.start + end_sill)
            L[seg] = np.maximum(L[seg], Pb[k:end_sill])
            a0 = arc[end_sill] if end_sill < m else arc[-1] + 1e-3
            ramp[sl.start + end_sill:sl.start + j] = np.clip((arc[end_sill:j] - a0) / SILL_RAMP_M, 0.0, 1.0)
            k = j
    sol.L = L.astype(np.float32)
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
        st = (s >= STEEP_SLOPE) & (kind[sl] == KIND_FIELD) & ~sol.pooled[sl] & ~sol.sill[sl] \
            & (sol.ramp[sl] >= 0.5)          # a weir's ramp is too shallow for a strip
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


def dominant_discharge(accum: np.ndarray) -> np.ndarray:
    """Channel-forming (bankfull) discharge, m³/s, from catchment area (km²).

        Q_dom = SPECIFIC_RUNOFF · A · DOMINANT_OVER_MEAN_1KM2 · A^DOMINANT_RATIO_EXP

    i.e. the mean annual flow of OUR water balance times a dimensionless
    dominant/mean multiple carried over from a regional bankfull curve. See the
    constants for the derivation and the citations.
    """
    a = np.maximum(np.asarray(accum, dtype=np.float64), 0.0)
    mean_q = SPECIFIC_RUNOFF * a
    mult = DOMINANT_OVER_MEAN_1KM2 * np.maximum(a, MIN_ACCUM_KM2) ** DOMINANT_RATIO_EXP
    return np.maximum(mean_q * mult, BASEFLOW_M3S)


def wetted_width(sol: ChannelSolution) -> np.ndarray:
    """Width of the WATER at each station (m), <= the hydraulic `width`.

    Relation used: continuity on the carved section. The carve cuts a
    parabolic bed, `bed(t) = L - D(1 - t²)` for `t = 2·offset/width` (see
    `carve_to_profile`), so a flow standing `dc` deep at the centreline
    reaches out to `t = sqrt(dc/D)` and its section area is
        A = (2/3)·(width·t)·dc = (2/3)·width·D^-0.5·dc^1.5.
    Discharge closes it: `Q = A·v` with Q the station's DOMINANT (bankfull,
    channel-forming) discharge and v the station's banded speed, giving
        dc = (1.5·Q·sqrt(D) / (width·v))^(2/3),  wetted = width·sqrt(dc/D).

    Q must be the dominant discharge, not the mean annual one: `width` is a
    bankfull width law, so closing against the mean annual flow would be
    comparing the trickle to the bed. `dominant_discharge()` supplies it (see
    DOMINANT_OVER_MEAN_1KM2 for the derivation and sources).

    Why this relation and not another: Q, v, D and the section are all
    carried per station, and only Q is new (province-wide constants, no
    per-site number). The alternative — inverting the Leopold–Maddock width
    law — is circular, since `width` IS that law, and would return a fixed
    fraction of it. This one varies with catchment, slope-driven speed and
    band independently.

    Bank to bank at a pooled station: standing water fills its body.
    """
    Q = dominant_discharge(sol.accum)
    w = np.maximum(sol.width.astype(np.float64), 1e-3)
    D = np.maximum(sol.depth.astype(np.float64), 0.05)
    v = np.maximum(sol.speed.astype(np.float64), 0.05)
    dc = np.minimum((1.5 * Q * np.sqrt(D) / (w * v)) ** (2.0 / 3.0), D)
    wet = w * np.sqrt(dc / D)
    wet = np.clip(wet, np.minimum(WETTED_MIN_M, w), w)
    pooled = getattr(sol, "pooled", None)
    if pooled is not None:
        wet = np.where(pooled, w, wet)
    return wet.astype(np.float32)


# ---------------------------------------------------------------------------
# rasterisation
# ---------------------------------------------------------------------------

def level_at_cells(sol: ChannelSolution, nb: np.ndarray, shape) -> np.ndarray:
    """L at every cell, interpolated along the reach between the nearest
    station `nb` and the neighbouring station the cell projects toward (same
    reach, same live kind). Nearest-station levels alone quantise a steep
    reach into 1.8 m steps of up to a metre: the bed becomes a staircase and
    the water a stack of plates."""
    n = sol.n
    yy, xx = np.indices(shape, dtype=np.float32)
    k = np.maximum(nb, 0)
    s = (xx - sol.x[k]) * sol.tx[k] + (yy - sol.y[k]) * sol.ty[k]
    del yy, xx
    k2 = np.clip(k + np.where(s >= 0, 1, -1), 0, n - 1)
    same = (sol.reach[k2] == sol.reach[k]) & (sol.kind[k2] == sol.kind[k])
    seg = np.hypot(sol.x[k2] - sol.x[k], sol.y[k2] - sol.y[k])
    frac = np.where(same, np.clip(np.abs(s) / np.maximum(seg, 1e-6), 0.0, 1.0), 0.0)
    # the cell a station stands in carries that station's level exactly (the
    # strip point there is at L; on a 45 deg torrent half a cell is 0.9 m)
    own = np.zeros(shape, dtype=bool)
    own[np.clip(np.round(sol.y).astype(int), 0, shape[0] - 1),
        np.clip(np.round(sol.x).astype(int), 0, shape[1] - 1)] = True
    frac = np.where(own, 0.0, frac)
    del own
    del s, seg, same
    return (sol.L[k] * (1.0 - frac) + sol.L[k2] * frac).astype(np.float32)


def raster_fields(sol: ChannelSolution, shape) -> dict:
    """Nearest-station fields on the full grid.

    Per band b: `near_b` (station index of the nearest band-b station),
    `dist_b` (metres), `inside_b` (within that station's half-width) and
    `level_b` (L interpolated along the reach at the cell). `near` / `dist`:
    nearest station of any band. Falls back to the per-band nearest so a
    tributary's cells inside its trunk's width are seen by the trunk too
    (the cut takes the deepest, the level the lowest)."""
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
        st_id[iy[sel], ix[sel]] = sel      # later stations win ties (downstream)...
        pl = sel[sol.plunge[sel]]          # ...except a plunge: its cell carries the plunge level
        st_id[iy[pl], ix[pl]] = pl
        d, (ky, kx) = ndimage.distance_transform_edt(~mask, return_indices=True)
        d = (d * mpp).astype(np.float32)
        nb = st_id[ky, kx]
        del ky, kx
        inside = d <= sol.width[nb] * 0.5 + 0.5 * mpp
        out["bands"].append((b, nb, d, inside, level_at_cells(sol, nb, shape)))
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
          body_level: np.ndarray | None = None,
          reference: np.ndarray | None = None) -> tuple[np.ndarray, dict]:
    """Cut the trench and build the shoulder (decision 0047).

    Inside the water width: parabolic bed from L − D·ramp at the centreline
    to L at the edge (only ever lowered; D is FORD_DEPTH_M at a road
    crossing). Shoulder ring w/2 .. w/2 + 6 m: crest 0.3 over the highest L
    of the stations around the cell, from the water's edge out to 3.5 m,
    smoothstep back to the original terrain by the ring's edge (raised or cut
    to that profile; a cut into a hillside is capped; `protect` cells — the
    collar of a standing body — are never cut, and the bed of a body standing
    at or above the channel's level (`body_level`, the per-cell flood level
    with the sea at 0) is never raised, so the shoulder can neither breach a
    lake nor dam its outlet — a pool BELOW the channel beside it is a ditch
    the levee may fill). Pooled stations are trenched too (a groove under
    the lake, so the channel stays wet if the lake settles a little lower
    than the carve assumed); fall interiors (the cliff face) are left
    alone; a plunge basin is dug at every fall base. Lake outlets
    keep a sill: bed AT the lake level, then the depth ramps in, so the lake
    keeps its level. The carve may be applied cumulatively (round after round
    on its own output): the shoulder caps are measured against `reference`
    (the pre-carve terrain) so they do not compound."""
    h = terrain.astype(np.float32, copy=True)
    ref = terrain if reference is None else reference
    fld = raster_fields(sol, h.shape)
    live = (sol.kind != KIND_FALL) & (sol.kind != KIND_LOST)
    active = live | sol.plunge
    depth = sol.depth_cut
    cut = np.full(h.shape, np.inf, dtype=np.float32)
    weir = np.full(h.shape, -np.inf, dtype=np.float32)
    any_inside = np.zeros(h.shape, dtype=bool)
    footprint = np.zeros(h.shape, dtype=bool)     # every station's width, falls included
    in_level = np.full(h.shape, -np.inf, dtype=np.float32)   # highest channel level over a cell
    # THE BRINK STOPS THE NOTCH. Since a fall run starts at the true cliff top
    # (FALL_FACE_SLOPE), the stations just above a lip are `steep`, and their
    # chute notch was being cut into the face BELOW the lip — a slot gouged
    # down the rock the sheet then falls past (measured 2026-09-08: 25 of 29
    # hovering edges had a dry neighbour cut by 1.7-11.7 m on a cascade face,
    # median 4.94 m). The face belongs to the fall and the sheet covers it, so
    # a station within the lip's own half-width upstream of it never cuts
    # ground lying below the lip's level: the trench STOPS at the brink.
    # The guard is the lip's own BED, not its level, so the chute's notch runs
    # continuously down to the lip and stops there; and it is cleared wherever
    # a station BELOW the lip digs the same cell, or the plunge bowl and the
    # lip's own notch would be blocked too (a near-vertical fall puts its
    # plunge 1.8-5.5 m from its lip, well inside the lip's own half-width).
    guard_lvl = np.full(sol.n, -np.inf, dtype=np.float32)
    guard_bed = np.full(sol.n, -np.inf, dtype=np.float32)
    for k in np.flatnonzero(sol.lip):
        sl_r = sol.stations_of(int(sol.reach[k]))
        reach_arc = sol.arc[sl_r]
        span = float(sol.width[k]) * 0.5 + sol.mpp
        near = (reach_arc <= float(sol.arc[k])) & (reach_arc >= float(sol.arc[k]) - span)
        idx = np.flatnonzero(near) + sl_r.start
        bed_k = float(sol.L[k]) - float(depth[k]) * float(sol.ramp[k])
        guard_lvl[idx] = np.maximum(guard_lvl[idx], float(sol.L[k]))
        guard_bed[idx] = np.maximum(guard_bed[idx], bed_k)
    brink_floor = np.full(h.shape, -np.inf, dtype=np.float32)
    plunge_zone = np.zeros(h.shape, dtype=bool)
    for b, nb, d, inside, lvl in fld["bands"]:
        ok = inside & active[nb]
        brink_floor = np.where(ok, np.maximum(brink_floor, guard_bed[nb]), brink_floor)
        plunge_zone |= inside & sol.plunge[nb]
        in_level = np.where(ok, np.maximum(in_level, lvl), in_level)
        r = np.maximum(sol.width[nb] * 0.5, 1e-3)
        t = np.clip(d / r, 0.0, 1.0)
        bed = lvl - depth[nb] * sol.ramp[nb] * (1.0 - t * t)
        cut = np.where(ok, np.minimum(cut, bed), cut)
        # a lake-outlet sill is a WEIR: the whole width AT the lake level
        # (ground under it inside the width is raised, or the lake leaks
        # under the sill into the deeper trench beyond and drains to it)
        w_ok = ok & sol.sill[nb] & (sol.ramp[nb] <= 0.0) & (lvl > 0.0)
        weir = np.where(w_ok, np.maximum(weir, lvl), weir)
        any_inside |= ok
        footprint |= inside & (sol.kind[nb] != KIND_LOST)
    before = h.copy()
    h = np.where(any_inside, np.minimum(h, cut), h)
    h = np.where(np.isfinite(weir), np.maximum(h, weir), h)
    del cut, weir
    # the bowl at the foot is the fall's own, not its face: a near-vertical
    # fall lands 1.8-5.5 m from its lip, well inside the lip's half-width, and
    # the bowl dig below only touches ground within PLUNGE_FLOOR_ABOVE_M of
    # the landing — so a guarded cell there is never dug and the ribbon ends
    # up buried (9 strip points, measured 2026-09-08)
    brink_guard = np.isfinite(brink_floor) & ~plunge_zone
    brink_keep = np.minimum(before, brink_floor)          # never below the lip's bed,
    h = np.where(brink_guard, np.maximum(h, brink_keep), h)   # never below what was there
    del plunge_zone
    # the brink: cells beside a lip that still stand at lip height but are
    # nearest to the first station down the face get the lip's notch too
    # (the face itself, already below the lip's bed, is left alone)
    for k in np.flatnonzero(sol.lip):
        L_k = float(sol.L[k]); D_k = float(depth[k]); r_k = float(sol.width[k]) * 0.5
        rr = int(np.ceil(r_k / sol.mpp)) + 1
        cy, cx = int(round(float(sol.y[k]))), int(round(float(sol.x[k])))
        y0, y1 = max(cy - rr, 0), min(cy + rr + 1, h.shape[0])
        x0, x1 = max(cx - rr, 0), min(cx + rr + 1, h.shape[1])
        yy, xx = np.mgrid[y0:y1, x0:x1]
        dd = np.hypot(yy - sol.y[k], xx - sol.x[k]) * sol.mpp
        t = np.clip(dd / max(r_k, 1e-3), 0.0, 1.0)
        blk = h[y0:y1, x0:x1]
        brink = (dd <= r_k + 0.5 * sol.mpp) & (blk >= L_k - D_k)
        h[y0:y1, x0:x1] = np.where(brink, np.minimum(blk, L_k - D_k * (1.0 - t * t)), blk)
    # plunge basins, before the shoulder (their cells join the footprint)
    n_basins = 0
    bowl_cells = np.zeros(h.shape, dtype=bool)
    for k in np.flatnonzero(sol.plunge):
        P = float(sol.L[k]); w = float(sol.width[k])
        # the bowl is sized by the fall that digs it, never shallower than the
        # channel's own centre depth
        fd = float(getattr(sol, "fall_drop", np.zeros(sol.n))[k])
        dp = max(float(depth[k]), PLUNGE_MIN_DEPTH_M,
                 min(PLUNGE_MIN_DEPTH_M + PLUNGE_SCOUR_PER_DROP * fd, PLUNGE_MAX_DEPTH_M))
        rr = int(np.ceil(w / sol.mpp)) + 1
        cy, cx = int(round(float(sol.y[k]))), int(round(float(sol.x[k])))
        y0, y1 = max(cy - rr, 0), min(cy + rr + 1, h.shape[0])
        x0, x1 = max(cx - rr, 0), min(cx + rr + 1, h.shape[1])
        yy, xx = np.mgrid[y0:y1, x0:x1]
        dd = np.hypot(yy - sol.y[k], xx - sol.x[k]) * sol.mpp
        t = np.clip(dd / max(w, 1e-3), 0.0, 1.0)
        bowl = P - dp * (1.0 - t * t)
        # dig the floor around the plunge, never the wall behind it (the
        # face and the lip upstream: the pool's core is dug regardless only
        # on the downstream side)
        along = (xx - sol.x[k]) * sol.tx[k] + (yy - sol.y[k]) * sol.ty[k]
        blk = h[y0:y1, x0:x1]
        dig = (dd <= w) & ((blk <= P + PLUNGE_FLOOR_ABOVE_M) | ((dd <= 0.35 * w) & (along >= -0.5 * sol.mpp)))
        h[y0:y1, x0:x1] = np.where(dig, np.minimum(blk, bowl), blk)
        footprint[y0:y1, x0:x1] |= dig
        bowl_cells[y0:y1, x0:x1] |= dig
        in_level[y0:y1, x0:x1] = np.where(dig, np.maximum(in_level[y0:y1, x0:x1], P), in_level[y0:y1, x0:x1])
        n_basins += 1
    # shoulder ring, around the nearest ACTIVE station (a pooled station has
    # no ring, so beside a lake outlet the sill's ring must still reach). The
    # crest follows the HIGHEST level among the stations around the cell: on
    # a steep reach the cell beside station k is often nearest to k+1, a
    # metre lower, and a crest at k+1's level leaves k's water hanging
    # (a pooled station's width is never touched either: a crest across the
    # channel where it enters a lake or the sea would dam it)
    nb, d = nearest_stations(sol, h.shape, active)
    r = np.maximum(sol.width[np.maximum(nb, 0)] * 0.5, 1e-3)
    bowl_edge = ndimage.binary_dilation(bowl_cells, iterations=2) & ~footprint
    ring = (~footprint) & (nb >= 0) & ((d <= r + SHOULDER_BLEND_M) | bowl_edge)
    del footprint
    L = np.where(nb >= 0, level_at_cells(sol, nb, h.shape), -np.inf).astype(np.float32)
    # ...and where two channels run side by side, the higher one's water
    # inside its width must be sealed by the other's ring too
    L = np.minimum(ndimage.maximum_filter(np.maximum(L, in_level), size=3, mode="nearest"),
                   L + CREST_REACH_M)
    del in_level
    crest = L + SHOULDER_RAISE_M
    t2 = np.clip((d - r - SHOULDER_CREST_M) / (SHOULDER_BLEND_M - SHOULDER_CREST_M), 0.0, 1.0)
    # the rim of a plunge bowl is full crest whatever its distance from the
    # chute's stations (the bowl is two half-widths across)
    t2 = np.where(bowl_edge, 0.0, t2)
    del bowl_cells, bowl_edge
    t2 = t2 * t2 * (3.0 - 2.0 * t2)
    target = crest * (1.0 - t2) + h * t2
    lo = ref - SHOULDER_CUT_CAP_M
    k0 = np.maximum(nb, 0)
    cap = np.where(sol.sill[k0] | sol.lip[k0], SILL_RAISE_CAP_M,
                   np.where(sol.kind[k0] == KIND_STEEP, STEEP_RAISE_CAP_M, SHOULDER_RAISE_CAP_M))
    hi = (ref + cap).astype(np.float32)
    del k0, cap
    if protect is not None:
        lo = np.where(protect, h, lo)          # never cut the rim of a standing body
    if body_level is not None:
        no_raise = np.isfinite(body_level) & (ref < body_level) \
            & ((body_level >= L - 0.05) | (body_level <= 0.0))
        hi = np.where(no_raise, h, hi)         # never dam a body or raise its bed
        del no_raise
    target = np.clip(target, np.minimum(lo, h), np.maximum(hi, h))
    h = np.where(ring, target, h).astype(np.float32)
    h = np.where(brink_guard, np.maximum(h, brink_keep), h).astype(np.float32)
    del target, crest, t2, L, lo, hi, brink_guard, brink_keep, brink_floor
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
        "capturedStations": int(getattr(sol, "captured", np.zeros(0, bool)).sum()),
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
