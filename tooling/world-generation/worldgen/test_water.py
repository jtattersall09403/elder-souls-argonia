"""Water compile tests (decision 0047).

Part 1: fast synthetic worlds for `channels` — the carve and the long profile
on a V-valley with a bump, a cliff, a cross-slope and a tributary junction.
Part 2: a synthetic province run through `compile_water.compute` (no vault).
Part 3: province-level probes on the shipped rasters (skipped without the
vault); the per-defect invariants live in test_water_invariants.py.
"""

import json
from pathlib import Path

import numpy as np
import pytest

from . import channels as ch
from . import standing_water as sw
from .compile_chunks import DEFAULT_HEIGHTS
from .compile_water import CLASSES, FLOW_MAX, compute, decode_surface, hovering_edges
from .scale import RAW_M

VAULT = DEFAULT_HEIGHTS.parent.parent
REPO_ROOT = Path(__file__).resolve().parents[3]
WATER_DIR = REPO_ROOT / "apps" / "world-studio" / "public" / "province" / "water"
needs_vault = pytest.mark.skipif(
    not ((VAULT / "water-pass1.npz").exists() and (WATER_DIR / "water-meta.json").exists()),
    reason="vault water-pass1 or shipped water rasters unavailable")

STEP = 3
MPP = RAW_M


# ---------------------------------------------------------------------------
# Part 1 — channels on synthetic terrain
# ---------------------------------------------------------------------------

def _graph(nc, paths, bands, accum=2.0):
    """Coarse river graph from downstream cell paths [(r, c), ...]."""
    rivers = np.zeros((nc, nc), dtype=np.uint8)
    flow_to = np.full(nc * nc, -1, dtype=np.int32)
    acc = np.zeros((nc, nc), dtype=np.float32)
    for path, band in zip(paths, bands):
        for (r0, c0), (r1, c1) in zip(path, path[1:]):
            rivers[r0, c0] = band
            flow_to[r0 * nc + c0] = r1 * nc + c1
            acc[r0, c0] = accum
        rivers[path[-1]] = band
        acc[path[-1]] = accum
    return {"rivers": rivers, "flow_to": flow_to, "accum_km2": acc}


def _valley(nc=40, slope=0.02, cross=0.0, bump=None, cliff=None):
    """Full-res terrain: a V-valley along column nc//2 draining +z (rows),
    falling `slope`; optional cross-slope (rises with x), a bump on the
    thalweg (row, height) or a cliff (row, drop)."""
    n = nc * STEP
    zz, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    cx = (nc // 2) * STEP + 1
    h = 50.0 - slope * zz * MPP + 0.08 * np.abs(xx - cx) * MPP + cross * (xx - cx) * MPP
    if bump is not None:
        r, amp = bump
        h += amp * np.exp(-((zz - (r * STEP + 1)) ** 2) / (2 * 1.5 ** 2))
    if cliff is not None:
        r, drop = cliff
        h -= drop * (zz > r * STEP + 1)
    return h.astype(np.float32)


def _straight(nc, r0=2, r1=None, col=None):
    col = nc // 2 if col is None else col
    r1 = nc - 3 if r1 is None else r1
    return [(r, col) for r in range(r0, r1 + 1)]


def _bed_along(h, sol, sl):
    return ch._sample(h, sol.y[sl], sol.x[sl])


def test_valley_with_a_bump_is_notched_and_the_profile_is_monotone():
    nc = 40
    h = _valley(nc, bump=(20, 1.5))
    npz = _graph(nc, [_straight(nc)], [2])
    sol = ch.solve(h, npz, step=STEP, mpp=MPP)
    sl = sol.stations_of(0)
    assert (np.diff(sol.L[sl]) <= 1e-5).all()
    assert not sol.lost.any() and not sol.lip.any()
    bumped = np.abs(sol.y[sl] - (20 * STEP + 1)) < 2
    assert (sol.natural[sl][bumped] - sol.L[sl][bumped]).max() > 0.5   # the bump is under water
    out, stats = ch.carve(h, sol)
    bed = _bed_along(out, sol, sl)
    assert (np.diff(bed) <= 0.05).all(), "carved bed still climbs over the bump"
    assert (bed <= sol.L[sl] - 0.9).all()                                # ~D under the level
    assert (out <= h + 1.6).all()                                       # shoulder raise capped


def test_a_cliff_is_one_fall_step_with_a_plunge_basin():
    nc = 40
    h = _valley(nc, cliff=(20, 10.0))
    npz = _graph(nc, [_straight(nc)], [2])
    sol = ch.solve(h, npz, step=STEP, mpp=MPP)
    assert sol.lip.sum() == 1 and sol.plunge.sum() == 1
    a, b = ch.falls(sol)[0]
    assert sol.L[a] - sol.L[b] >= 9.0
    sl = sol.stations_of(0)
    L = sol.L[sl]
    # a STEP: constant to the lip, constant (lower) right after it
    assert abs(L[a - sl.start] - L[a - sl.start - 3]) < 0.4
    assert abs(L[b - sl.start] - L[b - sl.start + 3]) < 0.4
    out, stats = ch.carve(h, sol)
    assert stats["plungeBasins"] == 1
    py, px = int(round(sol.y[b])), int(round(sol.x[b]))
    assert out[py, px] <= sol.L[b] - 1.5 + 1e-3
    # steep reaches around a 10 m cliff are still classified from L slope, not the step
    assert (sol.kind[sl] == ch.KIND_STEEP).sum() == 0


def test_cross_slope_channel_is_sealed_by_a_bounded_levee():
    nc = 40
    h = _valley(nc, cross=0.25)          # 14 deg cross-slope, the valley still a V
    npz = _graph(nc, [_straight(nc)], [1])
    sol = ch.solve(h, npz, step=STEP, mpp=MPP)
    sl = sol.stations_of(0)
    out, _ = ch.carve(h, sol)
    assert (out - h).max() <= 1.5 + 1e-4
    # every station is enclosed: on both sides a crest CELL at the water's
    # edge stands >= L + 0.1 (the flood spreads cell to cell)
    ring = np.array([0.7, 1.5, 3.0]) / MPP
    for k in range(sl.start + 5, sl.stop - 5, 7):
        r = sol.width[k] * 0.5 / MPP
        for sgn in (1, -1):
            ys = sol.y[k] + sgn * sol.tx[k] * (r + ring)
            xs = sol.x[k] - sgn * sol.ty[k] * (r + ring)
            cells = out[np.round(ys).astype(int), np.round(xs).astype(int)]
            assert cells.max() >= sol.L[k] + 0.1


def test_tributary_shares_the_trunk_level_at_the_junction():
    nc = 40
    h = _valley(nc)
    trunk = _straight(nc)
    trib = [(15, c) for c in range(5, nc // 2)] + [(15, nc // 2)]
    npz = _graph(nc, [trunk, trib], [2, 1])
    sol = ch.solve(h, npz, step=STEP, mpp=MPP)
    assert len(sol.reach_start) == 3          # trunk above J, tributary, trunk below J
    down = sol.down_reach
    for r in range(3):
        d = down[r]
        if d < 0:
            continue
        end = sol.L[sol.reach_end[r] - 1]
        start = sol.L[sol.reach_start[d]]
        assert abs(float(end) - float(start)) < 1e-3
    for r in range(3):
        assert (np.diff(sol.L[sol.stations_of(r)]) <= 1e-5).all()


def test_hovering_edge_only_exempts_the_cell_that_is_down_the_cliff():
    """A nearby canyon does not excuse a shallow dry ledge below W."""
    W = np.full((5, 5), -np.inf, dtype=np.float32)
    wet = np.zeros((5, 5), dtype=bool)
    assigned = np.zeros((5, 5), dtype=bool)
    fall = np.zeros((5, 5), dtype=bool)
    ground = np.full((5, 5), 11.0, dtype=np.float32)
    W[2, 2] = 10.0
    wet[2, 2] = True
    ground[2, 3] = 9.9       # shallow dry ledge: invalid hovering water
    ground[3, 3] = 0.0       # canyon one diagonal cell away
    cliff = []
    bad = hovering_edges(W, wet, assigned, ground, fall, max_drop=8.0, cliff_out=cliff)
    assert bad[2, 2]
    assert cliff == [0]

    ground[2, 3] = 0.0       # the immediate neighbour is now the cliff face
    cliff = []
    bad = hovering_edges(W, wet, assigned, ground, fall, max_drop=8.0, cliff_out=cliff)
    assert not bad.any()
    assert cliff == [1]


def test_a_river_meeting_a_cliff_coast_is_extended_into_the_sea():
    """A sea-draining reach whose last river cell sits on a clifftop is
    walked on down flow_to to the ocean, so the profile falls to sea level
    instead of hanging the clifftop level over the shore."""
    nc = 40
    cliff_row = nc - 8
    h = _valley(nc, cliff=(cliff_row, 38.0))    # 38 m coastal cliff
    h[(cliff_row + 1) * STEP:, :] = -4.0        # the sea below it
    path = _straight(nc, r1=cliff_row)          # river cells stop at the clifftop
    npz = _graph(nc, [path], [2])
    ocean = np.zeros((nc, nc), dtype=bool)
    ocean[cliff_row + 1:, :] = True
    # the coarse flow keeps going past the last river cell, into the sea
    ft = npz["flow_to"]
    col = nc // 2
    for r in range(cliff_row, nc - 1):
        ft[r * nc + col] = (r + 1) * nc + col
    npz["ocean"] = ocean

    plain = ch.build_reaches(npz["rivers"], ft)
    extended = ch.build_reaches(npz["rivers"], ft, ocean,
                                h[np.arange(nc) * STEP + 1][:, np.arange(nc) * STEP + 1])
    assert len(plain[0]) < len(extended[0])
    assert ocean.reshape(-1)[extended[0][-1]]

    sol = ch.solve(h, npz, step=STEP, mpp=MPP)
    sl = sol.stations_of(0)
    assert (sol.band[sl] > 0).all(), "extension stations inherit the river band"
    assert sol.L[sl][-1] <= 0.05, "the profile reaches sea level"
    assert (sol.kind[sl] == ch.KIND_FALL).any(), "the cliff is a fall"
    assert sol.lip.sum() >= 1 and sol.plunge.sum() >= 1


def _ramped_cliff(nc, r_cliff, drop, ramp):
    """A V-valley with a cliff whose face spans `ramp` full-res samples, so the
    fall run has interior stations between its lip and its plunge."""
    h = _valley(nc)
    n = nc * STEP
    zz = np.mgrid[0:n, 0:n][0].astype(np.float32)
    return (h - drop * np.clip((zz - (r_cliff * STEP + 1)) / ramp, 0, 1)).astype(np.float32)


def test_a_waterfall_may_land_in_a_standing_body_but_not_wade_through_one():
    """A body at the foot of a cliff IS the plunge pool, so a pooled plunge
    station does not refuse the fall; a pooled INTERIOR station means part of
    the drop is under standing water, which is not a fall."""
    nc = 40
    h = _ramped_cliff(nc, 20, 30.0, 4)      # face steeper than FALL_FACE_SLOPE
    npz = _graph(nc, [_straight(nc)], [2])

    dry = ch.solve(h, npz, step=STEP, mpp=MPP)
    a, b = ch.falls(dry)[0]                      # lip and plunge on dry ground
    py, iy = int(round(dry.y[b])), int(round(dry.y[b - 1]))
    assert iy < py, "the interior station sits above the plunge"

    def pooled_from(row0, row1=None):
        lev = np.full(h.shape, np.nan, np.float32)
        sl = slice(row0, row1)
        lev[sl, :] = float(h[sl, :].min()) + 3.0
        return ch.solve(h, npz, pool_level=lev, step=STEP, mpp=MPP)

    landing = pooled_from(py)                    # the lake starts at the plunge
    assert landing.pooled[b] and not landing.pooled[a:b].any()
    assert landing.lip[a] and landing.plunge[b]
    assert (landing.kind[a + 1:b + 1] == ch.KIND_FALL).all()

    wading = pooled_from(iy, iy + 1)             # standing water part-way down
    assert wading.pooled[a:b].any()
    assert not wading.lip.any() and not wading.plunge.any()
    assert (wading.kind == ch.KIND_FALL).sum() == 0


def test_a_river_trapped_in_a_hollow_makes_a_lake():
    nc = 40
    h = _valley(nc)
    n = nc * STEP
    zz = np.arange(n, dtype=np.float32)[:, None]
    h = h - 4.0 * np.exp(-((zz - 60) ** 2) / (2 * 6.0 ** 2)) * np.ones((1, n), np.float32)
    h[75:78, :] += 6.0                         # a dam across the whole valley
    npz = _graph(nc, [_straight(nc)], [2])
    npz.update(ocean=np.zeros((nc, nc), bool), regions=np.zeros((nc, nc), np.uint8),
               wetlands=np.zeros((nc, nc), bool), flood=np.zeros((nc, nc), np.uint8),
               lakes=np.zeros((nc, nc), bool))
    bodies = sw.solve_bodies(h, npz, step=STEP, mpp=MPP, with_placement=False)
    sol = ch.solve(h, npz, step=STEP, mpp=MPP)
    rep = sw.pool_channels(sol, bodies, log=lambda *a: None)
    assert bodies.n >= 1
    assert sol.pooled.sum() > 5
    assert rep["cutBelowFloorMaxM"] <= ch.CANYON_MAX_M + 1e-3
    sl = sol.stations_of(0)
    assert (np.diff(sol.L[sl][~sol.lost[sl]]) <= 1e-5).all()


# ---------------------------------------------------------------------------
# Part 2 — a synthetic province through compute()
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def synth():
    nc = 48
    n = nc * STEP
    zz, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    cx = (nc // 2) * STEP + 1
    h = 30.0 - 0.2 * zz + 0.06 * np.abs(xx - cx) * MPP
    h[-12:, :] = -6.0                                   # sea strip
    h[20:36, 100:130] -= 12.0                           # a perched closed basin
    h = h.astype(np.float32)
    path = _straight(nc, r0=2, r1=nc - 5)
    npz = _graph(nc, [path], [2], accum=3.0)
    ocean = np.zeros((nc, nc), bool)
    ocean[-4:, :] = True
    reg = np.full((nc, nc), 6, np.uint8)
    npz.update(ocean=ocean, regions=reg, wetlands=np.zeros((nc, nc), bool),
               flood=np.zeros((nc, nc), np.uint8), lakes=np.zeros((nc, nc), bool),
               salinity=np.where(ocean, 1.0, 0.0).astype(np.float32))
    bodies = sw.solve_bodies(h, npz, step=STEP, mpp=MPP, with_placement=False)
    sol = ch.solve(h, npz, step=STEP, mpp=MPP)
    sw.pool_channels(sol, bodies, log=lambda *a: None)
    carved, _ = ch.carve(h, sol)
    r = compute(carved, npz, sol, step=STEP, mpp=MPP, with_placement=False, log=lambda *a: None)
    return carved, npz, r


def test_synth_sea_is_zero_and_dry_land_buried(synth):
    h, npz, r = synth
    assert np.allclose(r["W"][r["bodies"].sea], 0.0)
    buried = (r["W"] < h - 2.5) & ~r["wet"]
    assert buried.mean() > 0.3


def test_synth_perched_basin_is_a_flat_lake_above_the_sea(synth):
    h, npz, r = synth
    b = r["bodies"]
    assert b.n >= 1
    big = int(np.argmax(b.areas)) + 1
    vals = r["W"][b.body == big]
    assert vals.max() - vals.min() < 1e-3 and vals.max() > 1.0


def test_synth_river_is_wet_monotone_and_flows_downstream(synth):
    h, npz, r = synth
    assert r["stats"]["hoveringEdges"] == 0
    assert r["stats"]["dryCoarseRiverCells"] == 0
    riv = npz["rivers"] > 0
    assert r["vz"][riv].mean() > 0.3
    assert np.hypot(r["vx"], r["vz"]).max() <= FLOW_MAX + 1e-6


def test_synth_signed_depth_and_classes(synth):
    h, npz, r = synth
    d = r["depth2"]
    assert d.max() > 1.0 and d.min() < -2.5
    assert (r["wet2"] == (r["depth_q"] > 50)).all()
    wet3 = r["cls"] > 0
    assert wet3.any() and (r["cls"][npz["ocean"]] == CLASSES.index("coast")).mean() > 0.9


# ---------------------------------------------------------------------------
# Part 3 — province probes on the shipped rasters
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def province():
    npz = np.load(VAULT / "water-pass1.npz")
    meta = json.loads((WATER_DIR / "water-meta.json").read_text())
    return npz, meta


@needs_vault
def test_province_visible_water_fraction_sane(province):
    npz, meta = province
    frac = meta["stats"]["visibleWaterFrac2017"]
    assert 0.30 < frac < 0.50


@needs_vault
def test_shipped_rasters_decode_to_vault_and_ride_no_alpha(province):
    from PIL import Image
    npz, meta = province
    assert meta["schemaVersion"] == 2
    m = meta["surface"]
    img = Image.open(WATER_DIR / m["file"])
    assert img.mode == "RGB"
    w, depth = decode_surface(np.asarray(img), meta)
    assert np.abs(w - npz["w2"]).max() < (m["maxM"] - m["minM"]) / 65535 * 2 + 1e-3
    expect = np.clip(npz["depth2"], m["depthMinM"], m["depthMinM"] + m["depthSpanM"])
    assert np.abs(depth - expect).max() < m["depthSpanM"] / 255 * 0.51 + 1e-3
    for name in ("water-flow.png", "water-class.png", "water-shore.png"):
        assert Image.open(WATER_DIR / name).mode == "RGB"
    klass = np.asarray(Image.open(WATER_DIR / "water-class.png").convert("RGB"))
    assert set(np.unique(klass[..., 0])).issubset(set(range(len(CLASSES))))
    mpp = meta["klass"]["metresPerPixel"]
    assert klass[int(5070 / mpp), int(6160 / mpp), 2] > 200      # salinity survives at the bay
    shore = np.asarray(Image.open(WATER_DIR / "water-shore.png").convert("RGB"))
    assert shore[..., 2].max() > 120                               # blackwater tannin exists
    flow = np.asarray(Image.open(WATER_DIR / "water-flow.png").convert("RGB"), dtype=np.float32)
    vx = (flow[..., 0] / 255.0 - 0.5) * 2.0 * FLOW_MAX
    assert np.abs(vx - npz["vx"]).max() < FLOW_MAX / 255 * 2 + 1e-3


@needs_vault
def test_compiled_meta_carries_strips_and_cascades(province):
    npz, meta = province
    assert meta["surface"]["ownerFile"] == "water-owner.png"
    assert meta["stats"]["stripCount"] == len(meta["channels"])
    assert meta["stats"]["cascadeCount"] == len(meta["cascades"])
    assert meta["stats"]["compileSeconds"] < 180
    for chn in meta["channels"]:
        kinds = [p["kind"] for p in chn["points"]]
        assert kinds[0] in ("join", "plunge") and kinds[-1] in ("join", "lip")
        assert "steep" in kinds
        arcs = [p["arcM"] for p in chn["points"]]
        assert arcs[0] == 0.0 and all(b >= a for a, b in zip(arcs, arcs[1:]))
        assert all(p["speedMS"] >= 0.45 for p in chn["points"])
    for c in meta["cascades"]:
        assert c["profileStepM"] == 1.0 and c["profileStartM"] == -3.0
        assert abs(np.hypot(c["direction"]["x"], c["direction"]["z"]) - 1.0) < 1e-3


def test_wetted_width_follows_the_flow_not_the_trench():
    """Continuity, not a fraction: doubling the catchment widens the water,
    speeding the same flow up narrows it, and the trench is never exceeded."""
    def sol(accum, speed, band=1, width=None, n=1):
        acc = np.full(n, accum, dtype=np.float32)
        w = (ch.WIDTH_COEF * np.maximum(acc, ch.MIN_ACCUM_KM2) ** ch.WIDTH_EXP
             if width is None else np.full(n, width, dtype=np.float32))
        return ch.ChannelSolution(
            accum=acc, width=w.astype(np.float32),
            depth=np.full(n, ch.CENTRE_DEPTH[band], dtype=np.float32),
            speed=np.full(n, speed, dtype=np.float32),
            pooled=np.zeros(n, dtype=bool))
    small = float(ch.wetted_width(sol(0.2, 1.0))[0])
    big = float(ch.wetted_width(sol(2.0, 1.0))[0])
    fast = float(ch.wetted_width(sol(0.2, 3.0))[0])
    assert 0 < small < big
    assert fast < small
    # never wider than the trench, however much water arrives
    s = sol(1e6, 0.15)
    assert ch.wetted_width(s)[0] <= s.width[0] + 1e-6
    # standing water fills its body bank to bank
    s = sol(0.2, 1.0)
    s.pooled = np.ones(1, dtype=bool)
    assert float(ch.wetted_width(s)[0]) == pytest.approx(float(s.width[0]))


@needs_vault
def test_lowland_rivers_have_a_speed_floor(province):
    npz, hydro_meta = province
    hydro = np.load(VAULT / "hydrology-pass1.npz")
    speed = np.hypot(npz["vx"], npz["vz"])
    for band, floor in ((1, 0.45), (2, 0.6), (3, 0.75)):
        m = hydro["rivers"] == band
        if m.any():
            assert np.percentile(speed[m], 50) >= floor * 0.8, band
