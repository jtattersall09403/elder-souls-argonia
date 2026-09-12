"""Gates on the hydrology graph (Phase 16a).

Two kinds, per the gate policy (docs/standards/engineering.md standard 14):

* the SHIPPED graph passes `hydrology_graph.check` — reads the committed
  JSON, no rasters, so it runs on every `npm test`;
* every invariant in `check` is shown to FAIL on a deliberately corrupted
  copy of that same shipped graph, so none of them is a check that cannot
  fail (memory: three such gates were found in a week);
* ids are stable across two derivations of the same inputs, proved on a
  small synthetic world (a full derivation is ~50 s and is proved by the
  `contentSha256` the derive CLI records, re-checked by `check`).
"""
from __future__ import annotations

import copy
import json

import numpy as np
import pytest

from . import hydrology_graph as hg


@pytest.fixture(scope="module")
def graph() -> dict:
    assert hg.GRAPH_PATH.exists(), "world/sources/hydrology/hydrology-graph.json is not derived"
    return json.loads(hg.GRAPH_PATH.read_text(encoding="utf-8"))


def test_thresholds_match_the_solvers():
    """`check` must run without numpy, so the constants are literals here;
    this pins them to the solver values they mirror."""
    from . import channels, standing_water
    assert hg.RIFFLE_SLOPE == channels.STEEP_SLOPE
    assert hg.HEART_REGIONS == standing_water.HEART_REGIONS


def test_check_runs_without_numpy(graph):
    import subprocess, sys
    code = ("import sys; sys.modules['numpy'] = None; sys.modules['scipy'] = None; "
            "from worldgen import hydrology_graph as hg; import json; "
            "print(len(hg.check(json.load(open(hg.GRAPH_PATH)))))")
    out = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, cwd=hg.REPO_ROOT / "tooling" / "world-generation")
    assert out.returncode == 0, out.stderr[-800:]
    assert out.stdout.strip() == "0"


def test_shipped_graph_is_green(graph):
    errs = hg.check(graph)
    assert not errs, errs[:10]
    st = graph["stats"]
    # floors re-based on the frozen graph, 2026-09-12: 83 rivers, 489 reaches,
    # 2,479 bodies (rivers now end where they meet sea-level water, so fewer
    # and shorter than 16a's 100 / 678 on the raw sculpt; the marsh sheets of
    # the shaped ground are recorded, so many more bodies) — a floor is a
    # thinning alarm, not a target
    assert st["rivers"] > 60 and st["reaches"] > 350 and st["bodies"] > 1500
    assert st["drainageLoops"] == 0


def _corrupt(graph: dict, mutate) -> list[str]:
    g = copy.deepcopy(graph)
    mutate(g)
    g["contentSha256"] = hg.content_hash(g)      # the corruption is content, not a stale hash
    return hg.check(g)


def _first(graph, kind_prefix):
    return next(r for r in graph["reaches"] if r["kind"].startswith(kind_prefix))


def test_every_river_must_reach_the_sea_a_lake_or_the_border(graph):
    def m(g):
        g["rivers"][0]["mouth"] = {"kind": "sink"}
    errs = _corrupt(graph, m)
    assert any("ends in a sink" in e for e in errs), errs[:5]


def test_downstream_level_may_not_rise(graph):
    r = _first(graph, "horizontal-channel")["id"]

    def m(g):
        x = next(x for x in g["reaches"] if x["id"] == r)
        x["levelToM"] = x["levelFromM"] + 1.0
    errs = _corrupt(graph, m)
    assert any("level rises downstream" in e for e in errs), errs[:5]


def test_a_fall_needs_its_plunge_body(graph):
    f = _first(graph, "vertical-fall")["id"]

    def m(g):
        x = next(x for x in g["reaches"] if x["id"] == f)
        x["fall"]["plungeBodyId"] = "body.nowhere"
    errs = _corrupt(graph, m)
    assert any("fall without a plunge body" in e for e in errs), errs[:5]


def test_a_reach_is_not_both_sloped_and_flat(graph):
    s = _first(graph, "sloped")["id"]
    h = _first(graph, "horizontal-channel")["id"]

    def m(g):
        for x in g["reaches"]:
            if x["id"] == s:
                x["slope"] = 0.001
            if x["id"] == h:
                x["slope"] = 0.2
    errs = _corrupt(graph, m)
    assert any("sloped reach with slope" in e for e in errs), errs[:5]
    assert any("horizontal reach with slope" in e for e in errs), errs[:5]


def test_every_body_has_a_season_from_the_vocabulary(graph):
    def m(g):
        g["bodies"][0]["season"] = "sometimes"
    errs = _corrupt(graph, m)
    assert any("season sometimes" in e for e in errs), errs[:5]


def test_ids_must_be_unique_and_links_must_resolve(graph):
    def dup(g):
        g["bodies"].append(dict(g["bodies"][0]))
    assert any("duplicate ids" in e for e in _corrupt(graph, dup))

    def dangling(g):
        g["reaches"][0]["downstream"] = "reach.0-0-missing"
    assert any("unknown" in e for e in _corrupt(graph, dangling))


def test_a_stale_content_hash_is_caught(graph):
    g = copy.deepcopy(graph)
    g["bodies"][0]["levelM"] += 0.5
    assert any("contentSha256" in e for e in hg.check(g))


def test_a_short_channel_or_strip_run_fails_the_seam_budget(graph):
    def m(g):
        g["stats"]["shortChannelOrStripRuns"] = 2
    assert any("seam budget" in e for e in _corrupt(graph, m))


def test_drainage_loops_fail_the_gate(graph):
    def m(g):
        g["stats"]["drainageLoops"] = 3
    assert any("two-cell loops" in e for e in _corrupt(graph, m))


# ---------------------------------------------------------------------------
# determinism on a synthetic world: two derivations, byte-identical ids
# ---------------------------------------------------------------------------

def _synthetic_world(n: int = 660):
    """A plain sloping to a sea along the south edge, a valley down the
    middle that gathers > 1 km2 (the minor-river threshold at 5.48 m coarse
    cells), a mountain block in the north with a 30 m step, and a lake in
    the valley."""
    from . import hydrology as H
    from .regions import compute_regions
    from .scale import RAW_M
    yy, xx = np.mgrid[0:n, 0:n].astype(np.float32)
    z = 60.0 - 0.08 * yy                                          # slopes to the south
    z += 0.0004 * (xx - n / 2) ** 2                               # a valley down the middle
    z[yy < 180] += 30.0                                           # a mountain block: a 30 m step
    lake = ((yy - 400) ** 2 + (xx - n / 2) ** 2) < 1500
    z[lake] -= 3.0                                                # a lake in the valley
    z[yy > n - 25] = -8.0                                         # the sea
    step = 3
    zc = z[::step, ::step]
    mpp = RAW_M * step
    res = H.compute(zc, mpp)
    reg = compute_regions(zc, res, mpp)
    npz = dict(conditioned=zc, ocean=res.ocean, filled=res.filled.astype(np.float32),
               flow_to=res.flow_to.astype(np.int32), accum_km2=res.accum_km2, rivers=res.rivers,
               watersheds=res.watersheds, twi=res.twi, wetlands=res.wetlands, lakes=res.lakes,
               tidal=res.tidal, salinity=res.salinity, hand=reg.hand, flood=reg.flood, soil=reg.soil,
               regions=reg.regions)
    return z, npz


class _Npz(dict):
    files = property(lambda self: list(self.keys()))


def test_two_derivations_of_the_same_inputs_give_the_same_ids():
    z, npz = _synthetic_world()
    npz = _Npz(npz)
    assert (npz["rivers"] > 0).sum() > 20, "the synthetic world must grow a river"
    graphs = []
    for _ in range(2):
        bodies, sol, rep = hg.solve(z, npz, log=lambda *a: None)
        graphs.append(hg.build_graph(z, npz, bodies, sol, "synthetic", rep))
    a, b = graphs
    assert a["contentSha256"] == b["contentSha256"]
    assert [r["id"] for r in a["reaches"]] == [r["id"] for r in b["reaches"]]
    assert [x["id"] for x in a["bodies"]] == [x["id"] for x in b["bodies"]]
    assert not hg.check(a), hg.check(a)[:5]
