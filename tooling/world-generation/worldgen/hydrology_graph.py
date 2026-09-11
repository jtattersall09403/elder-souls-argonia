"""The hydrology graph: the province's water derived ONCE as typed entities
with stable ids (Phase 16a; decision 0058).

    python3 -m worldgen.hydrology_graph derive [--vault DIR] [--out PATH]
    python3 -m worldgen.hydrology_graph check  [PATH]
    python3 -m worldgen.hydrology_graph report [PATH]

Inputs are the two FROZEN artefacts of the terrain stage: the sculpted base
heightfield (`heightfield-sculpted-f32.npy`) and the coarse hydrology pass
(`hydrology-pass1.npz`). Output is `world/sources/hydrology/hydrology-graph.json`
(schema in world/sources/hydrology/README.md) plus the 2D-map layers the
owner reviews it on (`apps/world-studio/public/province/hydrograph-*.png`).

The graph is a PROJECTION of the same two solvers the carve and the water
compile use — `standing_water.solve_bodies` and `channels.solve` +
`standing_water.pool_channels` (decision 0047: one definition) — into
entities: rivers headwater → mouth with tributaries linked at junctions,
reaches typed horizontal / sloped / vertical from the geomorphology rulebook
(docs/research/world-terrain/tropical-fluvial-geomorphology.md §1.2), bodies
typed by relief, area, altitude and region, a stored season per entity, and a
machine-readable terrain precondition per entity that the terrain stage (16b)
builds to and the freeze gate checks. Nothing here moves terrain or water.

Ids are keyed to geography (a cell on the full-res grid, or a coarse cell for
rivers), never to emit order, so two derivations of the same inputs give the
same ids and a small upstream change does not renumber the province.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
from scipy import ndimage

from . import channels
from . import standing_water as sw
from .channels import KIND_FALL, KIND_LOST, KIND_STEEP
from .scale import RAW_M

SCHEMA_VERSION = 1
REPO_ROOT = Path(__file__).resolve().parents[3]
GRAPH_DIR = REPO_ROOT / "world" / "sources" / "hydrology"
GRAPH_PATH = GRAPH_DIR / "hydrology-graph.json"
PROVINCE_DIR = REPO_ROOT / "apps" / "world-studio" / "public" / "province"
DEFAULT_VAULT = (Path.home() / "workspace/elder-souls-dev/elder-scrolls-asset-pipeline/skyrim-source"
                 "/mod-sources/tamriel-worldspaces-118678/extracted/Argonia Worldspace/argonia-heightfield")
STEP = 3

# --- vocabularies --------------------------------------------------------------
REACH_KINDS = (
    "horizontal-river", "horizontal-stream", "horizontal-creek",
    "horizontal-backwater", "horizontal-tidal",
    "sloped-riffle", "sloped-rapid", "sloped-chute",
    "vertical-fall",
)
BODY_KINDS = (
    "ocean", "lagoon", "lake-lowland", "tarn-upland", "pond", "pool", "plunge-pool",
    "marsh-fringe", "marsh-deep", "swamp", "backswamp", "mudflat",
)
SEASONS = ("perennial", "seasonal", "ephemeral")
ALTITUDE_BANDS = ("tidal", "lowland", "upland", "montane")
WATER_CLASSES = ("whitewater", "blackwater", "clearwater")
MOUTH_KINDS = ("sea", "lake", "border", "sink")

# --- classification thresholds (rulebook §1.2, §5; hydrology/channels constants) --
RIFFLE_SLOPE = channels.STEEP_SLOPE      # 0.035: below this a reach is horizontal
RAPID_SLOPE = 0.065                      # MB97 cascade threshold
CHUTE_SLOPE = 0.50                       # ~27 deg: a slide short of a fall (falls: 70 deg face)
LAKE_MIN_M2 = 10_000.0                   # 1 ha: lake / tarn
POND_MIN_M2 = 500.0                      # pond; smaller is a pool
LOWLAND_MAX_M = 30.0                     # altitude bands on the body's level
UPLAND_MAX_M = 110.0                     # sculpt.BENCH_MIN_Z: cliff benching starts here
MARSH_DEEP_MIN_DEPTH_M = 0.5
MIN_RUN_STATIONS = 6                     # ~11 m: shorter horizontal sub-kind flips are merged
DRY_SEASON_FRACTION = 0.2                # tide.ts seasonOffset: the dry season draws 0.2 x amplitude
KNICKPOINT_WINDOW_M = 20.0               # a proposed fall: >= FALL_DROP_M over this window
WHITEWATER_MOUNTAIN_FRAC = 0.20          # rulebook §2
BLACKWATER_PEAT_FRAC = 0.50
GORGE_RISE_M = 2.0                       # valley width measured to this rise above the floor
GORGE_HALF_SPAN_M = 11.0                 # two coarse cells: narrower valleys are under-resolved
LEVEL_PIN_TOL_M = 0.25                   # channels.py pins a tributary end / sea reach within this
PLUNGE_BODY_KINDS = ("plunge-pool", "lake-lowland", "tarn-upland", "pond", "lagoon", "ocean")

MOUNTAIN_REGIONS = (1, 2)                # border mountains, upland hills
PEAT_SOILS = (3, 4)                      # soft marsh, peat
MARSH_REGIONS = (6, 7, 8)                # rootland deep marsh, interior swamp, fringe marsh: tannin sources
HEART_REGIONS = sw.HEART_REGIONS         # marsh / swamp / jungle heartland: groundwater-fed creeks
REGION_BODY_KIND = {3: "mudflat", 4: "marsh-fringe", 6: "marsh-deep", 7: "swamp",
                    8: "marsh-fringe", 9: "backswamp"}


# ---------------------------------------------------------------------------
# inputs and the two solvers
# ---------------------------------------------------------------------------

def load_inputs(vault: Path = DEFAULT_VAULT):
    height = vault / "heightfield-sculpted-f32.npy"
    g = np.load(height)
    npz = np.load(vault / "hydrology-pass1.npz")
    sha = hashlib.sha256(g.tobytes()).hexdigest()
    return g, npz, sha


def solve(g: np.ndarray, npz, log=print):
    """The carve's own solvers, on the frozen base, with NO placement cap:
    places adapt to the water (Phase 16 ladder), never the reverse."""
    bodies = sw.solve_bodies(g, npz, step=STEP, mpp=RAW_M, with_placement=False)
    sol = channels.solve(g, npz, step=STEP, mpp=RAW_M)
    pool_report = sw.pool_channels(sol, bodies, log=log)
    return bodies, sol, pool_report


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _cell(x: float, y: float, shape) -> tuple[int, int]:
    return (int(np.clip(round(float(x)), 0, shape[1] - 1)), int(np.clip(round(float(y)), 0, shape[0] - 1)))


def _coarse(x: float, y: float) -> tuple[int, int]:
    return (int(round(float(x) / STEP)), int(round(float(y) / STEP)))


def _r(v, nd=2):
    return round(float(v), nd)


def _accumulate_upstream(flow_to: np.ndarray, ocean_flat: np.ndarray, values: np.ndarray) -> np.ndarray:
    """Sum `values` (n_cells x k) over each cell's upstream tree, in a
    topological order derived from the flow graph itself (not from a height
    sort), so the answer does not depend on which surface routed the flow."""
    n = flow_to.size
    ds = np.where((flow_to >= 0) & ~ocean_flat, flow_to, -1)
    indeg = np.bincount(ds[ds >= 0], minlength=n)
    acc = values.astype(np.float64).copy()
    frontier = np.flatnonzero(indeg == 0)
    order = []
    while frontier.size:
        order.append(frontier)
        tgt = ds[frontier]
        tgt = tgt[tgt >= 0]
        np.subtract.at(indeg, tgt, 1)
        frontier = np.unique(tgt[indeg[tgt] == 0])
    for cells in order:
        tgt = ds[cells]
        ok = tgt >= 0
        np.add.at(acc, tgt[ok], acc[cells[ok]])
    return acc


def _water_class_raster(npz) -> np.ndarray:
    """Per coarse cell: 0 whitewater / 1 blackwater / 2 clearwater from the
    upstream composition (rulebook §2), as an int8 raster. The soil raster
    calls only 5 % of the province peat or soft marsh, so the tannin rule
    reads the marsh REGION classes as well (measured 2026-09-11: no river
    passed 50 % on soil alone; 12 of 46 lowland rivers do on marsh region)."""
    regions = npz["regions"].reshape(-1)
    soil = npz["soil"].reshape(-1)
    ocean = npz["ocean"].reshape(-1)
    ind = np.stack([np.ones(regions.size), np.isin(regions, MOUNTAIN_REGIONS),
                    np.isin(soil, PEAT_SOILS) | np.isin(regions, MARSH_REGIONS)], 1)
    ind[ocean] = 0.0
    acc = _accumulate_upstream(npz["flow_to"].astype(np.int64), ocean, ind)
    tot = np.maximum(acc[:, 0], 1.0)
    mountain = acc[:, 1] / tot
    peat = acc[:, 2] / tot
    cls = np.full(regions.size, 2, dtype=np.int8)
    cls[peat > BLACKWATER_PEAT_FRAC] = 1
    cls[mountain > WHITEWATER_MOUNTAIN_FRAC] = 0
    return cls.reshape(npz["regions"].shape)


# ---------------------------------------------------------------------------
# the derivation
# ---------------------------------------------------------------------------

def build_graph(g: np.ndarray, npz, bodies, sol, source_sha: str, pool_report: dict) -> dict:
    shape = g.shape
    n_r = len(sol.reach_start)
    mpp = float(sol.mpp)
    down = np.asarray(sol.down_reach)
    inflows = defaultdict(list)
    for r in range(n_r):
        if down[r] >= 0:
            inflows[int(down[r])].append(r)
    end_accum = sol.accum[np.asarray(sol.reach_end) - 1]
    tidal_c = npz["tidal"]
    sal_c = npz["salinity"]
    reg_c = npz["regions"]
    wet_c = npz["wetlands"]
    wcls_c = _water_class_raster(npz)
    ocean_up = sw.upsample(npz["ocean"], STEP, shape)
    resp = sw.season_response(g, bodies)

    def coarse_at(arr, x, y):
        cx, cy = _coarse(x, y)
        return arr[min(cy, arr.shape[0] - 1), min(cx, arr.shape[1] - 1)]

    # ---- rivers: main stems by accumulation, tributaries rooted at junctions
    river_of = np.full(n_r, -1, dtype=np.int64)
    rivers: list[dict] = []
    outlets = [r for r in range(n_r) if down[r] < 0]
    stack = []
    for r in sorted(outlets, key=lambda r: (-float(end_accum[r]), r)):
        stack.append((r, None, None))
    while stack:
        mouth_reach, trib_of_river, trib_junction = stack.pop()
        chain = []
        r = mouth_reach
        while True:
            chain.append(r)
            river_of[r] = len(rivers)
            ins = sorted(inflows.get(r, []), key=lambda q: (-float(end_accum[q]), q))
            if not ins:
                break
            stem, others = ins[0], ins[1:]
            for q in others:
                stack.append((q, len(rivers), r))
            r = stem
        chain.reverse()                                    # headwater -> mouth
        rivers.append({"channelReaches": chain, "tributaryOf": trib_of_river, "junctionReach": trib_junction})

    # ---- per-station class, then runs with a minimum length, then the kind
    # from the run's OWN water-level profile (so "sloped" and "horizontal"
    # are true of the reach as recorded, never of a station average)
    slope_w = np.asarray(sol.slope_w, dtype=np.float64)
    CLS_OTHER, CLS_POOLED, CLS_FALL, CLS_LOST = 0, 1, 2, -1
    cls = np.full(sol.n, CLS_OTHER, dtype=np.int8)
    cls[sol.pooled & ~sol.shore] = CLS_POOLED
    cls[(sol.kind == KIND_FALL) | sol.lip] = CLS_FALL
    cls[sol.kind == KIND_LOST] = CLS_LOST
    sloped_st = (slope_w >= RIFFLE_SLOPE) & (cls == CLS_OTHER)
    tidal_st = np.zeros(sol.n, dtype=bool)
    for k in range(sol.n):
        tidal_st[k] = bool(coarse_at(tidal_c, sol.x[k], sol.y[k]))

    def runs_of(r: int) -> list[tuple[int, int, int]]:
        """[(start, stop, cls)] over the reach's stations. Lost stations are
        dropped. Runs are split by class and, inside OTHER, by the station
        slope class; any non-fall run shorter than MIN_RUN_STATIONS is merged
        into its neighbour (the previous run, else the next), so a reach is
        never a one-station flicker. Falls are never merged."""
        sl = sol.stations_of(r)
        key = cls[sl].astype(np.int16) * 2 + sloped_st[sl].astype(np.int16)
        runs: list[list[int]] = []
        i, m = 0, len(key)
        while i < m:
            j = i
            while j + 1 < m and key[j + 1] == key[i]:
                j += 1
            if cls[sl.start + i] != CLS_LOST:
                runs.append([sl.start + i, sl.start + j + 1, int(cls[sl.start + i])])
            i = j + 1
        changed = True
        while changed and len(runs) > 1:
            changed = False
            for idx, run in enumerate(runs):
                if run[2] == CLS_FALL or run[1] - run[0] >= MIN_RUN_STATIONS:
                    continue
                nb = None
                if idx > 0 and runs[idx - 1][2] != CLS_FALL and runs[idx - 1][1] == run[0]:
                    nb = idx - 1
                elif idx + 1 < len(runs) and runs[idx + 1][2] != CLS_FALL and runs[idx + 1][0] == run[1]:
                    nb = idx + 1
                if nb is None:
                    continue
                other = runs[nb]
                lo, hi = min(run[0], other[0]), max(run[1], other[1])
                keep = other[2] if (other[1] - other[0]) >= (run[1] - run[0]) else run[2]
                runs[min(idx, nb)] = [lo, hi, keep]
                del runs[max(idx, nb)]
                changed = True
                break
        return [tuple(x) for x in runs]

    def kind_of(a: int, b: int, c: int) -> str:
        if c == CLS_FALL:
            return "vertical-fall"
        if c == CLS_POOLED:
            return "horizontal-backwater"
        length = float(sol.arc[b - 1] - sol.arc[a]) + mpp
        s = round((float(sol.L[a]) - float(sol.L[b - 1])) / max(length, 1e-6), 4)   # as recorded
        if s >= CHUTE_SLOPE:
            return "sloped-chute"
        if s >= RAPID_SLOPE:
            return "sloped-rapid"
        if s >= RIFFLE_SLOPE:
            return "sloped-riffle"
        if np.mean(tidal_st[a:b]) > 0.5:
            return "horizontal-tidal"
        band = int(np.max(sol.band[a:b]))
        return {1: "horizontal-creek", 2: "horizontal-stream", 3: "horizontal-river"}[band]

    ocean_c = npz["ocean"]
    flow_c = npz["flow_to"].reshape(-1)

    lakes_c = npz["lakes"]
    ocean_flat = ocean_c.reshape(-1)
    lakes_flat = lakes_c.reshape(-1)

    def downstream_terminal(x: float, y: float, max_cells: int = 40):
        """Walk the coarse flow graph from the cell under a station: the first
        ocean cell is the sea, the first coarse lake cell is a lake (returned
        with the full-res body under it), the map edge is the border. A river
        whose last river cell stops a few cells short of the shore or a lake
        still ends there; the carve's coast extension only runs for a 3 m cliff."""
        cx, cy = _coarse(x, y)
        cy = min(cy, ocean_c.shape[0] - 1); cx = min(cx, ocean_c.shape[1] - 1)
        i = cy * ocean_c.shape[1] + cx
        for _ in range(max_cells):
            if ocean_flat[i]:
                return ("sea", None)
            if lakes_flat[i]:
                ly, lx = divmod(i, ocean_c.shape[1])
                b = body_at(lx * STEP + 1, ly * STEP + 1)
                if b is not None:
                    return ("lake", b)
            j = int(flow_c[i])
            if j < 0:
                ly, lx = divmod(i, ocean_c.shape[1])
                edge = lx == 0 or ly == 0 or lx == ocean_c.shape[1] - 1 or ly == ocean_c.shape[0] - 1
                return ("border" if edge else "sink", None)
            i = j
        return ("sink", None)

    # ---- bodies: ids and per-body facts (measured on the base)
    body_lbl = bodies.body
    nb = int(bodies.n)
    body_ids: list[str] = []
    body_rec: list[dict] = []
    deep_cells = []
    if nb:
        idx = np.arange(1, nb + 1)
        argmin = ndimage.minimum_position(g, body_lbl, idx)
        bbox = ndimage.find_objects(body_lbl)
        for i in range(nb):
            dy, dx = argmin[i]
            deep_cells.append((int(dx), int(dy)))
    for i in range(nb):
        dx, dy = deep_cells[i]
        bid = f"body.{dx}-{dy}"
        body_ids.append(bid)
        level = float(bodies.levels[i])
        area = float(bodies.areas[i]) * mpp * mpp
        depth = float(bodies.reliefs[i])
        sheet = bool(bodies.sheet[i])
        region = int(coarse_at(reg_c, dx, dy))
        tidal = bool(coarse_at(tidal_c, dx, dy)) or (level <= 1.5 and float(coarse_at(sal_c, dx, dy)) > 0.15)
        if tidal:
            band = "tidal"
        elif level < LOWLAND_MAX_M:
            band = "lowland"
        elif level < UPLAND_MAX_M:
            band = "upland"
        else:
            band = "montane"
        if sheet:
            kind = REGION_BODY_KIND.get(region, "marsh-deep" if depth >= MARSH_DEEP_MIN_DEPTH_M else "marsh-fringe")
            if tidal and kind in ("marsh-fringe", "backswamp"):
                kind = "mudflat"
        elif area >= LAKE_MIN_M2:
            kind = "tarn-upland" if band in ("upland", "montane") else "lake-lowland"
        elif area >= POND_MIN_M2:
            kind = "pond"
        else:
            kind = "pool"
        rp = float(resp[i])
        amp = sw.SEASON_AMPLITUDE_M
        dry_drop = DRY_SEASON_FRACTION * amp * rp
        sy, sx = bbox[i]
        body_rec.append({
            "id": bid, "kind": kind, "origin": "measured",
            "levelM": _r(level), "altitudeBand": band,
            "areaM2": _r(area, 0), "maxDepthM": _r(depth), "sheet": sheet,
            "season": "perennial" if depth > dry_drop else "seasonal",
            "seasonResponse": _r(rp, 3),
            "wetSeasonLevelM": _r(level + amp * rp), "drySeasonLevelM": _r(level - dry_drop),
            "deepestCell": [dx, dy],
            "bboxCells": [int(sx.start), int(sy.start), int(sx.stop), int(sy.stop)],
            "region": region,
            "inflow": [], "outflow": None,
            "terrainPrecondition": {"kind": "bowl", "levelM": _r(level), "floorMaxM": _r(level - depth),
                                    "spillM": _r(level)},
        })
    body_index = {b["id"]: b for b in body_rec}

    # the sea and the lagoons: sea-connected water below 0 that the coarse
    # ocean mask does not call ocean (inland arms) is a lagoon body
    sea = bodies.sea
    sea_area = float(sea.sum()) * mpp * mpp
    ocean_rec = {"id": "body.ocean", "kind": "ocean", "origin": "measured", "levelM": 0.0,
                 "altitudeBand": "tidal", "areaM2": _r(sea_area, 0), "maxDepthM": _r(-float(g[sea].min())) if sea.any() else 0.0,
                 "sheet": False, "season": "perennial", "seasonResponse": 0.0,
                 "wetSeasonLevelM": 0.0, "drySeasonLevelM": 0.0, "deepestCell": None, "bboxCells": None,
                 "region": 0, "inflow": [], "outflow": None,
                 "terrainPrecondition": {"kind": "sea", "levelM": 0.0}}
    body_rec.append(ocean_rec)
    body_index[ocean_rec["id"]] = ocean_rec
    lag = sea & ~ocean_up
    lag_lbl, n_lag = ndimage.label(lag, structure=sw.CONN8)
    lagoon_cell: dict[int, str] = {}
    if n_lag:
        li = np.arange(1, n_lag + 1)
        areas = np.bincount(lag_lbl.ravel(), minlength=n_lag + 1)[1:]
        pos = ndimage.minimum_position(g, lag_lbl, li)
        for i in range(n_lag):
            if areas[i] * mpp * mpp < POND_MIN_M2:
                continue
            dy, dx = pos[i]
            bid = f"body.{int(dx)}-{int(dy)}"
            rec = {"id": bid, "kind": "lagoon", "origin": "measured", "levelM": 0.0, "altitudeBand": "tidal",
                   "areaM2": _r(float(areas[i]) * mpp * mpp, 0), "maxDepthM": _r(-float(g[lag_lbl == i + 1].min())),
                   "sheet": False, "season": "perennial", "seasonResponse": 0.0,
                   "wetSeasonLevelM": 0.0, "drySeasonLevelM": 0.0, "deepestCell": [int(dx), int(dy)],
                   "bboxCells": None, "region": int(coarse_at(reg_c, dx, dy)), "inflow": [], "outflow": None,
                   "terrainPrecondition": {"kind": "sea", "levelM": 0.0}}
            body_rec.append(rec)
            body_index[bid] = rec
            lagoon_cell[i + 1] = bid

    def body_at(x: float, y: float) -> str | None:
        cx, cy = _cell(x, y, shape)
        b = int(body_lbl[cy, cx])
        if b > 0:
            return body_ids[b - 1]
        if sea[cy, cx]:
            l = int(lag_lbl[cy, cx])
            return lagoon_cell.get(l, "body.ocean")
        return None

    # ---- reaches, junctions, falls
    reaches: list[dict] = []
    reach_index: dict[str, dict] = {}
    junctions: dict[str, dict] = {}
    first_reach_of_channel: dict[int, str] = {}
    last_reach_of_channel: dict[int, str] = {}
    fall_proposals: list[dict] = []
    gorge_underresolved = 0
    gorge_stations = 0
    # cross-section half-width to GORGE_RISE_M for steep / fall stations
    offs = np.arange(1, int(GORGE_HALF_SPAN_M / mpp) + 2) * mpp / mpp
    nxv, nyv = -np.asarray(sol.ty), np.asarray(sol.tx)

    def junction_id(x: float, y: float) -> str:
        cx, cy = _cell(x, y, shape)
        return f"junction.{cx}-{cy}"

    def ensure_junction(jid: str, k: int) -> dict:
        if jid not in junctions:
            junctions[jid] = {"id": jid, "eastM": _r(sol.x[k] * mpp, 1), "southM": _r(sol.y[k] * mpp, 1),
                              "levelM": _r(sol.L[k]), "kind": "confluence", "inflow": [], "outflow": None}
        return junctions[jid]

    for ri, river in enumerate(rivers):
        prev_id: str | None = None
        for r in river["channelReaches"]:
            sl = sol.stations_of(r)
            for (a, b, kc) in runs_of(r):
                kind = kind_of(a, b, kc)
                k0, k1 = a, b - 1
                cx, cy = _cell(sol.x[k0], sol.y[k0], shape)
                rid = f"reach.{cx}-{cy}"
                if rid in reach_index:                      # two starts in one cell: suffix in station order
                    n_dup = 2
                    while f"{rid}-{n_dup}" in reach_index:
                        n_dup += 1
                    rid = f"{rid}-{n_dup}"
                st = slice(a, b)
                band = int(np.max(sol.band[st]))
                length = float(sol.arc[k1] - sol.arc[k0]) + mpp
                s_mean = (float(sol.L[k0]) - float(sol.L[k1])) / max(length, 1e-6)
                L0, L1 = float(sol.L[k0]), float(sol.L[k1])
                heart = float(np.mean([bool(coarse_at(wet_c, sol.x[i], sol.y[i])) or
                                       int(coarse_at(reg_c, sol.x[i], sol.y[i])) in HEART_REGIONS
                                       for i in range(a, b, max(1, (b - a) // 8))]))
                if band >= 2 or heart >= 0.5:
                    season = "perennial"
                else:
                    season = "seasonal"
                depth = float(np.max(sol.depth[st]))
                width = float(np.mean(sol.width[st]))
                rec = {
                    "id": rid, "river": None, "kind": kind, "band": band,
                    "upstream": [prev_id] if prev_id else [], "downstream": None,
                    "fromJunction": None, "toJunction": None,
                    "accumKm2": _r(np.max(sol.accum[st]), 3), "slope": _r(s_mean, 4),
                    "slopeMax": _r(np.max(slope_w[st]), 4),
                    "widthM": _r(width, 1), "depthM": _r(depth), "lengthM": _r(length, 1),
                    "levelFromM": _r(L0), "levelToM": _r(L1),
                    "speedMS": _r(np.mean(sol.speed[st])), "season": season,
                    "tidal": kind == "horizontal-tidal",
                    "_channel": int(r),
                    "centreline": [[_r(sol.x[i] * mpp, 1), _r(sol.y[i] * mpp, 1)] for i in range(a, b, STEP)]
                                  + ([[_r(sol.x[k1] * mpp, 1), _r(sol.y[k1] * mpp, 1)]] if (b - 1 - a) % STEP else []),
                }
                # valley width where the coarse grid may be too coarse
                if kind.startswith("sloped") or kind == "vertical-fall":
                    ks = np.arange(a, b, 4)
                    gorge_stations += len(ks)
                    for k in ks:
                        for sgn in (1.0, -1.0):
                            xs = sol.x[k] + sgn * nxv[k] * offs
                            ys = sol.y[k] + sgn * nyv[k] * offs
                            prof = ndimage.map_coordinates(g, [ys, xs], order=1, mode="nearest")
                            rise = np.flatnonzero(prof >= sol.floor[k] + GORGE_RISE_M)
                            if len(rise) and rise[0] * mpp < GORGE_HALF_SPAN_M / 2:
                                gorge_underresolved += 1
                                break
                if kind == "vertical-fall":
                    lip_k = int(np.flatnonzero(sol.lip[st])[0]) + a if sol.lip[st].any() else k0
                    plunge_k = k1
                    drop = max(float(sol.L[lip_k] - sol.L[plunge_k]),
                               float(getattr(sol, "fall_drop", np.zeros(sol.n))[plunge_k]))
                    pb = body_at(sol.x[plunge_k], sol.y[plunge_k])
                    dp = max(depth, channels.PLUNGE_MIN_DEPTH_M,
                             min(channels.PLUNGE_MIN_DEPTH_M + channels.PLUNGE_SCOUR_PER_DROP * drop,
                                 channels.PLUNGE_MAX_DEPTH_M))
                    if pb is None:
                        px, py = _cell(sol.x[plunge_k], sol.y[plunge_k], shape)
                        pb = f"body.{px}-{py}"
                        P = float(sol.L[plunge_k])
                        w = float(sol.width[plunge_k])
                        if pb not in body_index:
                            prec = {"id": pb, "kind": "plunge-pool", "origin": "promised",
                                    "levelM": _r(P), "altitudeBand": "lowland" if P < LOWLAND_MAX_M else ("upland" if P < UPLAND_MAX_M else "montane"),
                                    "areaM2": _r(np.pi * w * w, 0), "maxDepthM": _r(dp), "sheet": False,
                                    "season": "perennial", "seasonResponse": 0.0,
                                    "wetSeasonLevelM": _r(P), "drySeasonLevelM": _r(P),
                                    "deepestCell": [px, py], "bboxCells": None,
                                    "region": int(coarse_at(reg_c, px, py)),
                                    "inflow": [], "outflow": None, "causedBy": {"fall": rid},
                                    "terrainPrecondition": {"kind": "plunge-bowl", "levelM": _r(P),
                                                            "depthM": _r(dp), "radiusM": _r(w, 1),
                                                            "law": "channels.PLUNGE_* (depth = min + 0.06 x drop, cap 8 m)"}}
                            body_rec.append(prec)
                            body_index[pb] = prec
                    else:
                        b_ = body_index[pb]
                        if b_["kind"] in ("pool", "pond") and "causedBy" not in b_:
                            b_["kind"] = "plunge-pool"
                            b_["causedBy"] = {"fall": rid}
                        # a fall into a lake, a lagoon or the sea: that body is
                        # the plunge body; nothing new is promised
                    rec["fall"] = {"dropM": _r(drop), "lipLevelM": _r(sol.L[lip_k]),
                                   "plungeLevelM": _r(sol.L[plunge_k]), "plungeBodyId": pb,
                                   "lipSpeedMS": _r(sol.speed[lip_k]), "origin": "terrain"}
                    rec["terrainPrecondition"] = {"kind": "fall-face", "lipLevelM": _r(sol.L[lip_k]),
                                                  "plungeLevelM": _r(sol.L[plunge_k]), "dropM": _r(drop),
                                                  "faceMinSlope": channels.FALL_FACE_SLOPE,
                                                  "widthM": _r(width, 1), "lipNotch": True}
                elif kind == "horizontal-backwater":
                    bid = body_at(sol.x[k0 + (b - a) // 2], sol.y[k0 + (b - a) // 2]) or body_at(sol.x[k0], sol.y[k0])
                    rec["bodyId"] = bid
                    rec["terrainPrecondition"] = {"kind": "in-body", "bodyId": bid, "levelM": _r(L0)}
                else:
                    weir = bool(np.mean(sol.sill[st]) > 0.5)
                    rec["terrainPrecondition"] = {
                        "kind": "weir" if weir else "trench",
                        "bedLevelFromM": _r(L0 - float(sol.depth_cut[k0])),
                        "bedLevelToM": _r(L1 - float(sol.depth_cut[k1])),
                        "widthM": _r(width, 1), "shoulderCrestM": _r(L1 + channels.SHOULDER_RAISE_M),
                    }
                    if kind.startswith("sloped"):
                        # a knickpoint proposal: the steepest window with a fall-sized drop
                        arc = sol.arc[st].astype(np.float64)
                        Lr = sol.L[st].astype(np.float64)
                        best = None
                        for i in range(b - a):
                            j = int(np.searchsorted(arc, arc[i] + KNICKPOINT_WINDOW_M, side="right")) - 1
                            if j <= i:
                                continue
                            d = Lr[i] - Lr[j]
                            if d >= channels.FALL_DROP_M and (best is None or d > best[0]):
                                best = (d, i)
                        if best is not None:
                            d, i = best
                            fall_proposals.append({"reach": rid, "band": band, "accumKm2": rec["accumKm2"],
                                                   "eastM": _r(sol.x[a + i] * mpp, 1), "southM": _r(sol.y[a + i] * mpp, 1),
                                                   "dropM": _r(d), "lipLevelM": _r(Lr[i])})
                reaches.append(rec)
                reach_index[rid] = rec
                if prev_id:
                    reach_index[prev_id]["downstream"] = rid
                prev_id = rid
    # channel-reach -> its sub-reaches in station order
    sub_by_channel: dict[int, list[str]] = defaultdict(list)
    for rec in reaches:
        sub_by_channel[rec.pop("_channel")].append(rec["id"])
    for r, ids in sub_by_channel.items():
        first_reach_of_channel[r] = ids[0]
        last_reach_of_channel[r] = ids[-1]

    # junctions: where a channel reach ends. A tributary's last sub-reach flows
    # into the downstream channel's first sub-reach; the stem's continuation
    # is already linked by `prev_id` above only within one channel reach, so
    # link across channel reaches here too.
    for r in range(n_r):
        if r not in last_reach_of_channel:
            continue
        last_id = last_reach_of_channel[r]
        k_end = int(sol.reach_end[r]) - 1
        if down[r] >= 0 and int(down[r]) in first_reach_of_channel:
            nxt = first_reach_of_channel[int(down[r])]
            jid = junction_id(sol.x[int(sol.reach_start[int(down[r])])], sol.y[int(sol.reach_start[int(down[r])])])
            j = ensure_junction(jid, int(sol.reach_start[int(down[r])]))
            j["inflow"].append(last_id)
            j["outflow"] = nxt
            reach_index[last_id]["downstream"] = nxt
            reach_index[last_id]["toJunction"] = jid
            if last_id not in reach_index[nxt]["upstream"]:
                reach_index[nxt]["upstream"].append(last_id)
            reach_index[nxt]["fromJunction"] = jid
        else:
            jid = junction_id(sol.x[k_end], sol.y[k_end])
            j = ensure_junction(jid, k_end)
            j["kind"] = "mouth"
            j["inflow"].append(last_id)
            reach_index[last_id]["toJunction"] = jid
        first_id = first_reach_of_channel[r]
        if not inflows.get(r):
            k0 = int(sol.reach_start[r])
            jid = junction_id(sol.x[k0], sol.y[k0])
            j = ensure_junction(jid, k0)
            j["kind"] = "source"
            j["outflow"] = first_id
            reach_index[first_id]["fromJunction"] = jid

    # ---- river records
    river_recs = []
    river_ids: list[str] = []
    used: Counter = Counter()
    for ri, river in enumerate(rivers):
        chain = river["channelReaches"]
        mouth_r = chain[-1]
        k_end = int(sol.reach_end[mouth_r]) - 1
        mcx, mcy = _coarse(sol.x[k_end], sol.y[k_end])
        base = f"river.{mcx}-{mcy}"
        used[base] += 1
        rid = base if used[base] == 1 else f"{base}-{chr(ord('a') + used[base] - 1)}"
        river_ids.append(rid)
    for ri, river in enumerate(rivers):
        chain = river["channelReaches"]
        mouth_r = chain[-1]
        k_end = int(sol.reach_end[mouth_r]) - 1
        k_src = int(sol.reach_start[chain[0]])
        reach_ids = []
        for r in chain:
            reach_ids += sub_by_channel.get(r, [])
        last = reach_index[reach_ids[-1]] if reach_ids else None
        mx, my = sol.x[k_end], sol.y[k_end]
        mb = body_at(mx, my)
        if river["tributaryOf"] is not None:
            mouth = {"kind": "confluence", "river": river_ids[river["tributaryOf"]],
                     "junction": last["toJunction"] if last else None}
        elif bool(sol.to_sea[k_end]) or (mb and body_index[mb]["kind"] in ("ocean", "lagoon")):
            mouth = {"kind": "sea", "bodyId": mb if (mb and body_index[mb]["kind"] in ("ocean", "lagoon")) else "body.ocean"}
        elif mb is not None:
            mouth = {"kind": "lake", "bodyId": mb}
        else:
            term, tb = downstream_terminal(mx, my)
            if term == "sea":
                mouth = {"kind": "sea", "bodyId": "body.ocean"}
            elif term == "lake":
                mouth = {"kind": "lake", "bodyId": tb}
            else:
                mouth = {"kind": term}
        # Strahler order over the tributary tree
        wc = int(coarse_at(wcls_c, mx, my))
        acc = float(sol.accum[k_end])
        river_recs.append({
            "id": river_ids[ri], "name": None,
            "reaches": reach_ids,
            "tributaryOf": ({"river": river_ids[river["tributaryOf"]], "junction": mouth.get("junction")}
                            if river["tributaryOf"] is not None else None),
            "strahler": 1, "mouth": mouth,
            "water": WATER_CLASSES[wc], "accumKm2": _r(acc, 3),
            "lengthM": _r(sum(reach_index[x]["lengthM"] for x in reach_ids), 1),
            "sourceEastM": _r(sol.x[k_src] * mpp, 1), "sourceSouthM": _r(sol.y[k_src] * mpp, 1),
            "mouthEastM": _r(mx * mpp, 1), "mouthSouthM": _r(my * mpp, 1),
        })
        for x in reach_ids:
            reach_index[x]["river"] = river_ids[ri]
            reach_index[x]["water"] = WATER_CLASSES[wc]
    # Strahler: leaves 1; a river's order = max child order, +1 if two children share the max
    children: dict[str, list[str]] = defaultdict(list)
    for rr in river_recs:
        if rr["tributaryOf"]:
            children[rr["tributaryOf"]["river"]].append(rr["id"])
    rmap = {rr["id"]: rr for rr in river_recs}

    def strahler(rid: str) -> int:
        ks = [strahler(c) for c in children.get(rid, [])]
        if not ks:
            o = 1
        else:
            m = max(ks)
            o = m + 1 if ks.count(m) >= 2 else m
        rmap[rid]["strahler"] = o
        return o
    for rr in river_recs:
        if not rr["tributaryOf"]:
            strahler(rr["id"])
    # mouth form (rulebook §4.1): a whitewater river of major size on the
    # sheltered bay coast builds a delta; everything else is an estuary funnel
    for rr in river_recs:
        if rr["mouth"]["kind"] == "sea":
            rr["mouth"]["form"] = ("delta" if rr["water"] == "whitewater" and rr["accumKm2"] >= 15.0 * 1.0
                                   else "estuary")

    # ---- body inflow / outflow from the backwater sub-reaches
    for rec in reaches:
        if rec["kind"] == "horizontal-backwater" and rec.get("bodyId") in body_index:
            b = body_index[rec["bodyId"]]
            for u in rec["upstream"]:
                if reach_index[u]["kind"] != "horizontal-backwater" and u not in b["inflow"]:
                    b["inflow"].append(u)
            d = rec["downstream"]
            if d and reach_index[d]["kind"] != "horizontal-backwater":
                b["outflow"] = d
        if rec["kind"] == "vertical-fall":
            pb = rec["fall"]["plungeBodyId"]
            if pb in body_index and rec["id"] not in body_index[pb]["inflow"]:
                body_index[pb]["inflow"].append(rec["id"])
    # a lake with an outflow in the upland band is a tarn by the rulebook's
    # definition (justified by its outlet); a sink without one is flagged
    for b in body_rec:
        b["sink"] = bool(b["inflow"]) and b["outflow"] is None and b["kind"] not in ("ocean", "lagoon")

    # ---- the wet-season line and the coarse-grid measurement
    wetline = (npz["wetlands"] | (npz["rivers"] > 0) | npz["lakes"]) & ~npz["ocean"]
    ft_flat = npz["flow_to"].reshape(-1).astype(np.int64)
    okf = ft_flat >= 0
    loops = np.zeros(ft_flat.size, dtype=bool)
    loops[okf] = ft_flat[ft_flat[okf]] == np.flatnonzero(okf)
    stats = {
        "drainageLoops": int(loops.sum()),
        "rivers": len(river_recs), "reaches": len(reaches), "junctions": len(junctions),
        "bodies": len(body_rec),
        "reachKinds": dict(Counter(r["kind"] for r in reaches)),
        "bodyKinds": dict(Counter(b["kind"] for b in body_rec)),
        "bodyOrigins": dict(Counter(b["origin"] for b in body_rec)),
        "seasons": {"reaches": dict(Counter(r["season"] for r in reaches)),
                    "bodies": dict(Counter(b["season"] for b in body_rec))},
        "waterClasses": dict(Counter(r["water"] for r in river_recs)),
        "mouths": dict(Counter(r["mouth"]["kind"] for r in river_recs)),
        "falls": sum(1 for r in reaches if r["kind"] == "vertical-fall"),
        "fallProposals": len(fall_proposals),
        "fallProposalsByBand": dict(Counter(p["band"] for p in fall_proposals)),
        "riverTrappedDepressions": int(pool_report.get("forcedBasins", 0)),
        "lostStations": int(pool_report.get("lostStations", 0)),
        "lostSites": pool_report.get("lostSites", []),
        "gorgeStationsMeasured": int(gorge_stations),
        "gorgeStationsUnderResolved": int(gorge_underresolved),
        "wetSeasonLineCells": int(wetline.sum()),
        "wetSeasonLineKm2": _r(float(wetline.sum()) * (RAW_M * STEP / 1000.0) ** 2, 2),
        "standingWaterCensus": {k: v for k, v in bodies.census.items()},
    }
    graph = {
        "schemaVersion": SCHEMA_VERSION,
        "sourceHeightSha256": source_sha,
        "grid": {"fullResSamples": int(shape[0]), "metresPerSample": RAW_M, "coarseStep": STEP,
                 "cellFrame": "x = column (east), y = row (south); metres = cell x metresPerSample"},
        "thresholds": {
            "riffleSlope": RIFFLE_SLOPE, "rapidSlope": RAPID_SLOPE, "chuteSlope": CHUTE_SLOPE,
            "fallDropM": channels.FALL_DROP_M, "fallFaceSlope": channels.FALL_FACE_SLOPE,
            "lakeMinM2": LAKE_MIN_M2, "pondMinM2": POND_MIN_M2,
            "lowlandMaxM": LOWLAND_MAX_M, "uplandMaxM": UPLAND_MAX_M,
            "seasonAmplitudeM": sw.SEASON_AMPLITUDE_M, "drySeasonFraction": DRY_SEASON_FRACTION,
            "knickpointWindowM": KNICKPOINT_WINDOW_M,
        },
        "vocabulary": {"reachKinds": list(REACH_KINDS), "bodyKinds": list(BODY_KINDS), "seasons": list(SEASONS),
                       "altitudeBands": list(ALTITUDE_BANDS), "waterClasses": list(WATER_CLASSES),
                       "mouthKinds": list(MOUTH_KINDS) + ["confluence"]},
        "stats": stats,
        "rivers": river_recs,
        "reaches": reaches,
        "junctions": sorted(junctions.values(), key=lambda j: j["id"]),
        "bodies": body_rec,
        "fallProposals": fall_proposals,
    }
    graph["contentSha256"] = content_hash(graph)
    return graph


def content_hash(graph: dict) -> str:
    body = {k: v for k, v in graph.items() if k != "contentSha256"}
    return hashlib.sha256(json.dumps(body, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


# ---------------------------------------------------------------------------
# the gate
# ---------------------------------------------------------------------------

def check(graph: dict) -> list[str]:
    """Invariants over the committed graph. Returns the list of violations
    (empty = green). Pure data, no rasters: this is what `npm test` runs."""
    errs: list[str] = []
    if graph.get("schemaVersion") != SCHEMA_VERSION:
        errs.append(f"schemaVersion {graph.get('schemaVersion')} != {SCHEMA_VERSION}")
    if graph.get("contentSha256") != content_hash(graph):
        errs.append("contentSha256 does not match the content")
    if graph.get("stats", {}).get("drainageLoops", 1) != 0:
        errs.append(f"drainage graph has {graph.get('stats', {}).get('drainageLoops')} two-cell loops")
    rivers = {r["id"]: r for r in graph.get("rivers", [])}
    reaches = {r["id"]: r for r in graph.get("reaches", [])}
    junctions = {j["id"]: j for j in graph.get("junctions", [])}
    bodies = {b["id"]: b for b in graph.get("bodies", [])}
    for name, items in (("rivers", graph.get("rivers", [])), ("reaches", graph.get("reaches", [])),
                        ("junctions", graph.get("junctions", [])), ("bodies", graph.get("bodies", []))):
        ids = [x["id"] for x in items]
        if len(ids) != len(set(ids)):
            dup = [i for i, c in Counter(ids).items() if c > 1][:5]
            errs.append(f"{name}: duplicate ids {dup}")
    for r in rivers.values():
        if not r["reaches"]:
            errs.append(f"{r['id']}: no reaches")
            continue
        for x in r["reaches"]:
            if x not in reaches:
                errs.append(f"{r['id']}: unknown reach {x}")
        last = reaches.get(r["reaches"][-1])
        mk = r["mouth"]["kind"]
        if mk not in MOUTH_KINDS + ("confluence",):
            errs.append(f"{r['id']}: mouth kind {mk}")
        if mk == "sink":
            errs.append(f"{r['id']}: ends in a sink (no sea, lake, border or confluence)")
        if mk in ("sea", "lake") and r["mouth"].get("bodyId") not in bodies:
            errs.append(f"{r['id']}: mouth body {r['mouth'].get('bodyId')} unknown")
        if mk == "confluence":
            t = r.get("tributaryOf") or {}
            if t.get("river") not in rivers:
                errs.append(f"{r['id']}: tributaryOf river {t.get('river')} unknown")
            if last and last.get("downstream") is None:
                errs.append(f"{r['id']}: a tributary whose last reach has no downstream")
        if r["water"] not in WATER_CLASSES:
            errs.append(f"{r['id']}: water class {r['water']}")
        # headwater -> mouth: each reach's downstream is the next reach
        for a, b in zip(r["reaches"], r["reaches"][1:]):
            if reaches.get(a, {}).get("downstream") != b:
                errs.append(f"{r['id']}: reach order broken at {a} -> {b}")
                break
    for x in reaches.values():
        if x["kind"] not in REACH_KINDS:
            errs.append(f"{x['id']}: kind {x['kind']}")
        if x["river"] not in rivers:
            errs.append(f"{x['id']}: river {x['river']} unknown")
        if x["season"] not in SEASONS:
            errs.append(f"{x['id']}: season {x['season']}")
        if x["levelToM"] > x["levelFromM"] + LEVEL_PIN_TOL_M:
            errs.append(f"{x['id']}: level rises downstream {x['levelFromM']} -> {x['levelToM']}")
        if x["kind"].startswith("sloped") and x["slope"] < RIFFLE_SLOPE:
            errs.append(f"{x['id']}: sloped reach with slope {x['slope']} < {RIFFLE_SLOPE}")
        if x["kind"].startswith("horizontal") and x["kind"] != "horizontal-backwater" and x["slope"] >= RIFFLE_SLOPE:
            errs.append(f"{x['id']}: horizontal reach with slope {x['slope']} >= {RIFFLE_SLOPE}")
        if x["kind"] == "horizontal-backwater" and x.get("bodyId") not in bodies:
            errs.append(f"{x['id']}: backwater reach without its body")
        if x["kind"] == "vertical-fall":
            f = x.get("fall") or {}
            if f.get("plungeBodyId") not in bodies:
                errs.append(f"{x['id']}: fall without a plunge body")
            elif bodies[f["plungeBodyId"]]["kind"] not in PLUNGE_BODY_KINDS:
                errs.append(f"{x['id']}: plunge body {f['plungeBodyId']} is a {bodies[f['plungeBodyId']]['kind']}")
            if f.get("dropM", 0) < 3.0 - 1e-6:
                errs.append(f"{x['id']}: fall drop {f.get('dropM')} under 3 m")
        for u in x["upstream"]:
            if u not in reaches:
                errs.append(f"{x['id']}: upstream {u} unknown")
        if x["downstream"] is not None and x["downstream"] not in reaches:
            errs.append(f"{x['id']}: downstream {x['downstream']} unknown")
        if x["downstream"] in reaches and x["id"] not in reaches[x["downstream"]]["upstream"]:
            errs.append(f"{x['id']}: downstream {x['downstream']} does not list it upstream")
        if not x.get("terrainPrecondition"):
            errs.append(f"{x['id']}: no terrainPrecondition")
        if len(x.get("centreline", [])) < 1:
            errs.append(f"{x['id']}: empty centreline")
    for j in junctions.values():
        for u in j["inflow"]:
            if u not in reaches:
                errs.append(f"{j['id']}: inflow {u} unknown")
        if j["outflow"] is not None and j["outflow"] not in reaches:
            errs.append(f"{j['id']}: outflow {j['outflow']} unknown")
        if j["kind"] == "confluence" and (len(j["inflow"]) < 1 or j["outflow"] is None):
            errs.append(f"{j['id']}: confluence without inflow and outflow")
    for b in bodies.values():
        if b["kind"] not in BODY_KINDS:
            errs.append(f"{b['id']}: kind {b['kind']}")
        if b["season"] not in SEASONS:
            errs.append(f"{b['id']}: season {b['season']}")
        if b["altitudeBand"] not in ALTITUDE_BANDS:
            errs.append(f"{b['id']}: altitude band {b['altitudeBand']}")
        if b["drySeasonLevelM"] > b["levelM"] + 1e-6 or b["wetSeasonLevelM"] < b["levelM"] - 1e-6:
            errs.append(f"{b['id']}: season levels out of order")
        for u in b["inflow"]:
            if u not in reaches:
                errs.append(f"{b['id']}: inflow {u} unknown")
        if b["outflow"] is not None and b["outflow"] not in reaches:
            errs.append(f"{b['id']}: outflow {b['outflow']} unknown")
        if b["kind"] == "plunge-pool" and (b.get("causedBy") or {}).get("fall") not in reaches:
            errs.append(f"{b['id']}: plunge pool without its fall")
        if not b.get("terrainPrecondition"):
            errs.append(f"{b['id']}: no terrainPrecondition")
    return errs


# ---------------------------------------------------------------------------
# studio layers (1345-px overlays like the hydro-*.png the map already draws)
# ---------------------------------------------------------------------------

KIND_COLOUR = {
    "horizontal-river": (40, 110, 230), "horizontal-stream": (80, 150, 235), "horizontal-creek": (130, 185, 240),
    "horizontal-backwater": (90, 90, 200), "horizontal-tidal": (60, 170, 170),
    "sloped-riffle": (240, 200, 60), "sloped-rapid": (245, 140, 40), "sloped-chute": (230, 70, 30),
    "vertical-fall": (255, 255, 255),
}
BODY_COLOUR = {
    "ocean": (20, 45, 90), "lagoon": (40, 120, 150), "lake-lowland": (40, 90, 200), "tarn-upland": (120, 160, 255),
    "pond": (70, 130, 220), "pool": (110, 160, 230), "plunge-pool": (255, 255, 255),
    "marsh-fringe": (120, 190, 110), "marsh-deep": (40, 120, 70), "swamp": (60, 150, 90),
    "backswamp": (170, 200, 140), "mudflat": (200, 180, 100),
}
SEASON_COLOUR = {"perennial": (60, 120, 240), "seasonal": (240, 150, 40), "ephemeral": (200, 200, 200)}


def write_layers(graph: dict, coarse_shape, out_dir: Path = PROVINCE_DIR, bodies=None, npz=None) -> dict:
    from PIL import Image, ImageDraw
    h, w = coarse_shape
    mpp_c = RAW_M * STEP

    def px(east_m, south_m):
        return (east_m / mpp_c, south_m / mpp_c)

    def new():
        img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        return img, ImageDraw.Draw(img)

    reaches = graph["reaches"]
    body_kind = {b["id"]: b["kind"] for b in graph["bodies"]}
    body_season = {b["id"]: b["season"] for b in graph["bodies"]}
    # bodies raster: from the solver's label raster when given (measured), by kind
    body_img, body_draw = new()
    season_img, season_draw = new()
    if bodies is not None:
        lbl = bodies.body[::STEP, ::STEP][:h, :w]
        sea = bodies.sea[::STEP, ::STEP][:h, :w]
        ids = [b["id"] for b in graph["bodies"] if b["origin"] == "measured" and b["deepestCell"] is not None and b["kind"] not in ("lagoon",)]
        # label index -> body record via deepest cell
        lut_rgb = np.zeros((int(bodies.n) + 1, 4), dtype=np.uint8)
        lut_season = np.zeros((int(bodies.n) + 1, 4), dtype=np.uint8)
        for b in graph["bodies"]:
            if b["origin"] != "measured" or b["deepestCell"] is None or b["kind"] in ("lagoon", "ocean"):
                continue
            dx, dy = b["deepestCell"]
            i = int(bodies.body[dy, dx])
            if i > 0:
                lut_rgb[i] = (*BODY_COLOUR[b["kind"]], 200)
                lut_season[i] = (*SEASON_COLOUR[b["season"]], 170)
        arr = lut_rgb[lbl]
        arr[sea] = (*BODY_COLOUR["ocean"], 120)
        body_img = Image.fromarray(arr, "RGBA")
        body_draw = ImageDraw.Draw(body_img)
        sarr = lut_season[lbl]
        season_img = Image.fromarray(sarr, "RGBA")
        season_draw = ImageDraw.Draw(season_img)
    rivers_img, rivers_draw = new()
    falls_img, falls_draw = new()
    for r in reaches:
        pts = [px(e, s) for e, s in r["centreline"]]
        if len(pts) == 1:
            pts = pts * 2
        wpx = {1: 1, 2: 2, 3: 3}[r["band"]]
        rivers_draw.line(pts, fill=(*KIND_COLOUR[r["kind"]], 255), width=wpx)
        season_draw.line(pts, fill=(*SEASON_COLOUR[r["season"]], 255), width=wpx)
        if r["kind"] == "vertical-fall":
            e, s = r["centreline"][0]
            x, y = px(e, s)
            falls_draw.ellipse([x - 4, y - 4, x + 4, y + 4], outline=(255, 60, 60, 255), fill=(255, 255, 255, 255), width=2)
    for p in graph["fallProposals"]:
        x, y = px(p["eastM"], p["southM"])
        rr = 4 if p["band"] >= 2 else 2
        falls_draw.ellipse([x - rr, y - rr, x + rr, y + rr], outline=(255, 170, 40, 255), width=1)
    for b in graph["bodies"]:
        if b["kind"] == "plunge-pool" and b["deepestCell"]:
            x, y = b["deepestCell"][0] / STEP, b["deepestCell"][1] / STEP
            falls_draw.ellipse([x - 3, y - 3, x + 3, y + 3], fill=(120, 200, 255, 255))
            body_draw.ellipse([x - 3, y - 3, x + 3, y + 3], fill=(*BODY_COLOUR["plunge-pool"], 255))
    for j in graph["junctions"]:
        x, y = px(j["eastM"], j["southM"])
        if j["kind"] == "confluence":
            rivers_draw.ellipse([x - 1.5, y - 1.5, x + 1.5, y + 1.5], fill=(255, 255, 255, 220))
        elif j["kind"] == "mouth":
            rivers_draw.ellipse([x - 2.5, y - 2.5, x + 2.5, y + 2.5], outline=(255, 255, 255, 255), width=1)
    wet_img, _ = new()
    if npz is not None:
        wl = (npz["wetlands"] | (npz["rivers"] > 0) | npz["lakes"]) & ~npz["ocean"]
        arr = np.zeros((h, w, 4), dtype=np.uint8)
        arr[wl[:h, :w]] = (90, 220, 255, 110)
        wet_img = Image.fromarray(arr, "RGBA")
    out_dir.mkdir(parents=True, exist_ok=True)
    files = {"hydrograph-rivers": rivers_img, "hydrograph-bodies": body_img, "hydrograph-season": season_img,
             "hydrograph-falls": falls_img, "hydrograph-wetline": wet_img}
    for name, img in files.items():
        img.save(out_dir / f"{name}.png", optimize=True)
    meta = {
        "schemaVersion": 1,
        "source": "world/sources/hydrology/hydrology-graph.json",
        "contentSha256": graph["contentSha256"],
        "legends": {
            "hydrograph-rivers": {k: {"name": k, "rgb": list(v)} for k, v in KIND_COLOUR.items()},
            "hydrograph-bodies": {k: {"name": k, "rgb": list(v)} for k, v in BODY_COLOUR.items()},
            "hydrograph-season": {k: {"name": k, "rgb": list(v)} for k, v in SEASON_COLOUR.items()},
            "hydrograph-falls": {"fall": {"name": "waterfall (measured on the base)", "rgb": [255, 60, 60]},
                                 "proposal": {"name": "knickpoint proposal (ring; big = band 2-3)", "rgb": [255, 170, 40]},
                                 "plunge": {"name": "plunge pool", "rgb": [120, 200, 255]}},
            "hydrograph-wetline": {"wet": {"name": "wet-season high-water extent (Phase 3 overlay)", "rgb": [90, 220, 255]}},
        },
        "stats": graph["stats"],
    }
    (out_dir / "hydrograph-meta.json").write_text(json.dumps(meta, indent=1) + "\n", encoding="utf-8")
    return meta


# ---------------------------------------------------------------------------
# report (markdown tables for the ledger and the owner check)
# ---------------------------------------------------------------------------

def report(graph: dict, places_path: Path = PROVINCE_DIR / "places.json") -> str:
    places = []
    if places_path.exists():
        for p in json.loads(places_path.read_text()).get("places", []):
            pos = p.get("positionM")
            if pos:
                places.append((p["name"], float(pos[0]), float(pos[1])))

    def nearest(e, s):
        if not places:
            return "-"
        n, d = min(((n, np.hypot(x - e, z - s)) for n, x, z in places), key=lambda t: t[1])
        return f"{n} ({d / 1000:.1f} km)"

    st = graph["stats"]
    lines = [f"rivers {st['rivers']} · reaches {st['reaches']} · junctions {st['junctions']} · bodies {st['bodies']}", ""]
    lines += ["| Reach kind | count | km |", "|---|---|---|"]
    km = defaultdict(float)
    for r in graph["reaches"]:
        km[r["kind"]] += r["lengthM"] / 1000.0
    for k in REACH_KINDS:
        lines.append(f"| {k} | {st['reachKinds'].get(k, 0)} | {km[k]:.1f} |")
    lines += ["", "| Body kind | count |", "|---|---|"]
    for k in BODY_KINDS:
        lines.append(f"| {k} | {st['bodyKinds'].get(k, 0)} |")
    lines += ["", "## Rivers reaching the sea, largest first", "",
              "| River | catchment km² | Strahler | water | mouth form | tributaries | length km |", "|---|---|---|---|---|---|---|"]
    trib = Counter((r["tributaryOf"] or {}).get("river") for r in graph["rivers"])
    for r in sorted((r for r in graph["rivers"] if r["mouth"]["kind"] == "sea"), key=lambda r: -r["accumKm2"])[:25]:
        lines.append(f"| {r['id']} | {r['accumKm2']:.1f} | {r['strahler']} | {r['water']} | {r['mouth'].get('form')} | {trib[r['id']]} | {r['lengthM'] / 1000:.1f} |")
    lines += ["", "## Waterfalls measured on the base", "", "| Reach | band | drop m | lip level m | plunge pool | nearest place |", "|---|---|---|---|---|---|"]
    for r in graph["reaches"]:
        if r["kind"] == "vertical-fall":
            e, s = r["centreline"][0]
            lines.append(f"| {r['id']} | {r['band']} | {r['fall']['dropM']} | {r['fall']['lipLevelM']} | {r['fall']['plungeBodyId']} | {nearest(e, s)} |")
    lines += ["", f"## Knickpoint proposals ({st['fallProposals']}; by band {st['fallProposalsByBand']})", "",
              "Band 2–3 only (the owner's question: falls on big rivers):", "",
              "| Reach | band | catchment km² | drop m over 20 m | east m | south m | nearest place |", "|---|---|---|---|---|---|---|"]
    for p in sorted((p for p in graph["fallProposals"] if p["band"] >= 2), key=lambda p: -p["dropM"]):
        lines.append(f"| {p['reach']} | {p['band']} | {p['accumKm2']} | {p['dropM']} | {p['eastM']} | {p['southM']} | {nearest(p['eastM'], p['southM'])} |")
    lines += ["", "## Lakes and tarns (≥ 1 ha)", "", "| Body | kind | level m | area ha | max depth m | season | inflow | outflow | nearest place |", "|---|---|---|---|---|---|---|---|---|"]
    for b in sorted((b for b in graph["bodies"] if b["kind"] in ("lake-lowland", "tarn-upland")), key=lambda b: -b["areaM2"]):
        dc = b["deepestCell"]
        lines.append(f"| {b['id']} | {b['kind']} | {b['levelM']} | {b['areaM2'] / 1e4:.1f} | {b['maxDepthM']} | {b['season']} | {len(b['inflow'])} | {b['outflow'] or '-'} | {nearest(dc[0] * RAW_M, dc[1] * RAW_M)} |")
    lines += ["", f"Lost stations (coarse route climbs out by the wrong exit): {st['lostStations']} — sites: {st['lostSites']}",
              f"Steep/fall stations measured for valley width: {st['gorgeStationsMeasured']}, under-resolved (< 2 coarse cells wide): {st['gorgeStationsUnderResolved']}",
              f"River-trapped depressions on the base: {st['riverTrappedDepressions']}",
              f"Wet-season line: {st['wetSeasonLineCells']} coarse cells = {st['wetSeasonLineKm2']} km²"]
    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def derive(vault: Path, out: Path, log=print) -> dict:
    g, npz, sha = load_inputs(vault)
    log(f"base {vault / 'heightfield-sculpted-f32.npy'} sha256 {sha[:16]}…")
    bodies, sol, pool_report = solve(g, npz, log=log)
    graph = build_graph(g, npz, bodies, sol, sha, pool_report)
    errs = check(graph)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(graph, indent=None, separators=(",", ":"), sort_keys=False) + "\n", encoding="utf-8")
    write_layers(graph, npz["rivers"].shape, bodies=bodies, npz=npz)
    log(json.dumps(graph["stats"], indent=1))
    log(f"wrote {out} ({out.stat().st_size / 1e6:.1f} MB); check: {len(errs)} violations")
    for e in errs[:20]:
        log("  " + e)
    return graph


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    d = sub.add_parser("derive")
    d.add_argument("--vault", type=Path, default=DEFAULT_VAULT)
    d.add_argument("--out", type=Path, default=GRAPH_PATH)
    c = sub.add_parser("check")
    c.add_argument("path", nargs="?", type=Path, default=GRAPH_PATH)
    r = sub.add_parser("report")
    r.add_argument("path", nargs="?", type=Path, default=GRAPH_PATH)
    a = ap.parse_args(argv)
    if a.cmd == "derive":
        graph = derive(a.vault, a.out)
        return 1 if check(graph) else 0
    graph = json.loads(a.path.read_text(encoding="utf-8"))
    if a.cmd == "check":
        errs = check(graph)
        for e in errs:
            print(e)
        print(f"{a.path}: {len(errs)} violations" if errs else f"{a.path}: ok ({graph['stats']['rivers']} rivers, {graph['stats']['reaches']} reaches, {graph['stats']['bodies']} bodies)")
        return 1 if errs else 0
    print(report(graph))
    return 0


if __name__ == "__main__":
    sys.exit(main())
