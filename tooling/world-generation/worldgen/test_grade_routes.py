"""Route grading as a patch author (16e, decision 0068).

Pure tests on synthetic ground: no province files, no vault rasters. The
fixtures follow `test_terrain_patches`'s style — a flat plain at RAW_M with
a `terrain_patches.Context` built by hand — but on a 240x240 raw ground so
that macro (1345-grid) polylines, which `resample` multiplies by STEP=3,
land on it: 240 raw samples = 80 macro px.
"""

from __future__ import annotations

import json

import numpy as np

from . import grade_routes as gr
from . import terrain_patches as tp
from .scale import RAW_M

M = RAW_M
N = 240                      # raw samples; macro grid is N / gr.STEP = 80


# --------------------------------------------------------------- fixtures
def _ground(z: float = 10.0) -> np.ndarray:
    return np.full((N, N), z, dtype=np.float32)


def _ctx(level: np.ndarray | None = None, stations=None) -> tp.Context:
    """Dry by default; no live channels unless `stations` says otherwise."""
    if level is None:
        level = np.full((N, N), -np.inf, dtype=np.float32)
    sea = np.zeros((N, N), bool)
    if stations is None:
        ys = np.zeros(1, dtype=np.float32)
        xs = np.zeros(1, dtype=np.float32)
        stations = (ys, xs, np.zeros(1, np.float32), np.zeros(1, np.float32), np.zeros(1, bool))
    return tp.Context(level, sea, stations, npz=None, structures=[])


def _way(row_macro: int = 40, c0: int = 10, c1: int = 60, kind: str = "road") -> dict:
    """A straight macro polyline along one row: raw row 3*row, raw cols 3*c0..3*c1."""
    return {"id": "route.road.test", "kind": kind,
            "px": [[c0, row_macro], [c1, row_macro]]}


# ------------------------------------------------------------ 1. profile
def test_grade_profile_caps_the_gradient_keeps_the_ends_and_the_total_climb():
    n = 30
    ds = np.full(n - 1, M)
    z = np.full(n, 10.0)
    z[n // 2:] += 3.0                     # a 3 m step in the middle (47 deg over one sample)
    g = gr.grade_profile(z, ds, 8.0)
    assert gr.max_gradient_deg(z, ds) > 40.0, "the synthetic step is not steep"
    assert gr.max_gradient_deg(g, ds) <= 8.3
    assert g[0] == z[0] and abs(g[-1] - z[-1]) < 1e-6
    assert abs((g[-1] - g[0]) - (z[-1] - z[0])) < 1e-6      # total climb preserved


# ------------------------------------------------------------- 2. runs
def test_over_cap_runs_merges_near_runs_splits_far_ones_and_adds_the_landing():
    n = 20
    ds = np.full(n, 5.0)
    chain = np.concatenate([[0.0], np.cumsum(ds)])
    deg = np.zeros(n)

    near = np.zeros(n, bool)
    near[2:4] = True
    near[6:8] = True                       # chain[6] - chain[4] = 10 m < RUN_MERGE_GAP_M
    runs = gr.over_cap_runs(chain, near)
    assert len(runs) == 1, runs
    a, b = runs[0]
    assert a < 2 and b > 7                 # RUN_LANDING_M extends each side

    far = np.zeros(n, bool)
    far[2:4] = True
    far[12:14] = True                      # chain[12] - chain[4] = 40 m > RUN_MERGE_GAP_M
    assert len(gr.over_cap_runs(chain, far)) == 2


# --------------------------------------------------------- 3. way_samples
def test_way_samples_measures_chainage_and_reads_the_wet_mask():
    level = np.full((N, N), -np.inf, dtype=np.float32)
    level[110:130, 120:160] = 8.0
    ctx = _ctx(level)
    h = _ground()
    smp = gr.way_samples(_way(), h, ctx.wet)
    length = (60 - 10) * gr.STEP * M
    assert abs(smp["chain"][-1] - length) < M                # chainage is the polyline length
    assert len(smp["z"]) == len(smp["chain"]) == len(smp["ds"]) + 1
    assert smp["wet"].any() and not smp["wet"].all()
    xs = smp["xs"]
    assert smp["wet"][(xs >= 121) & (xs <= 159)].all()       # the pond's span is wet
    assert not smp["wet"][xs < 119].any()                    # the dry approach is dry


# ------------------------------------------------- 4. a terrace lip patch
def test_grade_way_patches_a_terrace_lip_on_dry_plain():
    h = _ground()
    h[:, 120:] = 12.0                      # a 2 m lip across the road's line
    ctx = _ctx()
    way = _way()
    st = gr.grade_way(way, h, ctx)
    assert len(st["patches"]) == 1, st
    assert st["windows"] == [] and st["banks"] == []
    p = st["patches"][0]
    assert p["kind"] == "route-grade" and p["maxDeltaM"] <= 2.1, p["maxDeltaM"]

    prof = np.asarray(p["params"]["profile"], dtype=np.float64)
    ds = np.hypot(np.diff(prof[:, 0]), np.diff(prof[:, 1]))
    assert gr.max_gradient_deg(prof[:, 2], ds) <= p["params"]["capDeg"] + gr.CAP_TOLERANCE_DEG

    pad = p["params"]["flatWidthM"] * 0.5 + p["params"]["shoulderM"]
    x0, y0, x1, y1 = p["bboxM"]
    assert x0 <= prof[:, 0].min() - pad + 1e-6 and x1 >= prof[:, 0].max() + pad - 1e-6
    assert y0 <= prof[:, 1].min() - pad + 1e-6 and y1 >= prof[:, 1].max() + pad - 1e-6
    assert way["id"] in p["why"] and p["source"]["way"] == way["id"]


# ------------------------------------------------------ 5. a pond crossing
def test_grade_way_never_patches_over_recorded_water_and_reports_walkable_banks():
    level = np.full((N, N), -np.inf, dtype=np.float32)
    level[110:130, 120:160] = 8.0          # a pond the road runs through
    ctx = _ctx(level)
    h = _ground()
    h[110:130, 120:160] = 6.0              # its bed
    h[110:130, 116:120] = [[9.0, 8.5, 8.0, 7.0]] * 20        # a walkable bank into it
    h[110:130, 160:164] = [[7.0, 8.0, 8.5, 9.0]] * 20
    st = gr.grade_way(_way(), h, ctx)

    wet = ctx.wet
    out = h.copy()
    for p in st["patches"]:
        out, _rec = tp.apply_route_grade(out, p, ctx)
    assert np.array_equal(out[wet], h[wet]), "a patch moved recorded water"

    assert all(b["reason"] == "bank" and b["worstDeg"] <= gr.BANK_MAX_DEG for b in st["banks"]), st["banks"]
    for w in st["windows"]:
        detail = w.get("detail", "")
        assert not (detail.startswith(("water", "channels")) and w["worstDeg"] <= gr.BANK_MAX_DEG), w


def test_grade_way_leaves_a_walkable_channel_bank_natural_instead_of_a_window():
    """A 6 m-wide river down column 150 with 28.7 deg approaches: the run is
    over the 8 deg cap but no patch may move a channel's shoulder (invariant 3),
    and at most BANK_MAX_DEG it is a bank left natural, not a span author's job."""
    ys = np.arange(5, N - 5, dtype=np.float32)
    xs = np.full_like(ys, 150.0)
    stations = (ys, xs, np.full_like(ys, 6.0), np.full_like(ys, 6.0), np.ones(len(ys), bool))
    level = np.full((N, N), -np.inf, dtype=np.float32)
    level[:, 148:153] = 6.0
    ctx = _ctx(level, stations)
    h = _ground()
    h[:, 148:153] = 6.0                                        # the trench bed at its level
    for i, c in enumerate(range(144, 148)):                    # 1 m per raw sample = 28.7 deg
        h[:, c] = 10.0 - (i + 1)
    for i, c in enumerate(range(153, 157)):
        h[:, c] = 7.0 + i

    st = gr.grade_way(_way(), h, ctx)
    assert st["patches"] == [] and st["windows"] == [], st
    assert len(st["banks"]) >= 1, st["banks"]
    bank = st["banks"][0]
    assert bank["reason"] == "bank" and bank["worstDeg"] <= gr.BANK_MAX_DEG
    assert bank["detail"].startswith(("channels", "water"))   # the shore band or the channel's shoulder: both are ground no patch may move


# ------------------------------------------------------------ 6. a cliff
def test_grade_way_hands_a_cliff_step_to_the_span_author():
    h = _ground()
    h[:, 120:] = 50.0                      # a 40 m step no profile may take
    st = gr.grade_way(_way(), h, _ctx())
    assert st["patches"] == []
    assert len(st["windows"]) == 1, st["windows"]
    w = st["windows"][0]
    assert w["reason"] in {"fill", "cap", "cut"}, w
    assert w["overM"] >= 2 * M             # the window covers the step, not a single sample
    assert w["fromM"] < w["toM"] and w["worstDeg"] > 40.0


# ------------------------------------------------------- 7. overlap order
def _grade_patch(pid: str, x0: float, y: float, x1: float) -> dict:
    prof = [[x, y, 10.0] for x in np.arange(x0, x1, M)]
    pad = 5.0 * 0.5 + 6.0
    xs = [p[0] for p in prof]
    return {"id": pid, "kind": "route-grade", "order": 0, "after": [], "crosses": [],
            "makesWater": False,
            "bboxM": [min(xs) - pad, y - pad, max(xs) + pad, y + pad],
            "blendM": 0.0, "maxDeltaM": 1.0, "source": {},
            "params": {"flatWidthM": 5.0, "shoulderM": 6.0, "capDeg": 8.0, "profile": prof}}


def test_declare_overlaps_keeps_the_first_patch_and_absorbs_the_overlapping_one():
    a = _grade_patch("patch.route-grade.a.000", 40 * M, 40 * M, 80 * M)
    b = _grade_patch("patch.route-grade.b.000", 60 * M, 42 * M, 100 * M)
    c = _grade_patch("patch.route-grade.c.000", 150 * M, 150 * M, 190 * M)
    assert any("overlap without a declared order" in e for e in tp.validate([a, b], (N, N)))
    kept = gr.declare_overlaps([a, b, c], (N, N))
    assert [p["id"] for p in kept] == [a["id"], c["id"]]
    assert a["source"]["absorbed"] == [b["id"]]
    assert [p["order"] for p in kept] == [0, 1]
    assert tp.validate(kept, (N, N)) == []


# ----------------------------------------------------------- 8. the files
def _stats(way_id: str, windows: list[dict]) -> dict:
    return {"id": way_id, "kind": "road", "capDeg": 8.0, "lengthM": 1000.0, "overCapM": 12.0,
            "worstDeg": 41.0, "wetSamples": 0, "patches": [], "windows": windows, "banks": []}


def test_write_stretches_and_report_carry_only_the_ways_with_windows(tmp_path):
    win = {"fromM": 10.0, "toM": 40.0, "overM": 30.0, "worstDeg": 41.0, "atFrac": 0.1, "reason": "cap"}
    stats = [_stats("route.road.with-window", [win]), _stats("route.road.no-window", [])]

    sp = tmp_path / "route-grading-stretches.json"
    doc = gr.write_stretches(stats, sp)
    assert doc["schemaVersion"] == 2
    on_disk = json.loads(sp.read_text())
    assert on_disk == doc
    assert [w["wayId"] for w in on_disk["ways"]] == ["route.road.with-window"]
    assert on_disk["ways"][0]["stretches"] == [win]

    rp = tmp_path / "route-grading.md"
    gr.write_report(stats, rp)
    text = rp.read_text()
    survivors = text.split("## Survivors", 1)[1]
    rows = [ln for ln in survivors.splitlines() if ln.startswith("| `")]
    assert len(rows) == 1 and "route.road.with-window" in rows[0] and "cap" in rows[0]
