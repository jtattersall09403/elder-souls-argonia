"""Phase 6b standing probes (plan §86 Phase 6b) — run on every recompile.

Validate the sculpted base terrain and its downstream artefacts against the
6b guarantees: mountains dramatic but explorable, lowlands preserved,
authored/simulated water features intact. All tests skip when the vault data
is absent (CI has no vault); they are part of the worldgen gate locally.
"""

import json
from pathlib import Path

import numpy as np
import pytest
from scipy import ndimage

from .compile_chunks import DEFAULT_HEIGHTS
from .condition import condition
from .scale import RAW_M
from .sculpt import SUMMIT_TARGET_M, uplift_envelope

VAULT = DEFAULT_HEIGHTS.parent.parent   # .../argonia-heightfield
RAW = VAULT / "heightfield-f32.npy"
SCULPTED = VAULT / "heightfield-sculpted-f32.npy"
REPO_ROOT = Path(__file__).resolve().parents[3]
PROVINCE = REPO_ROOT / "apps" / "world-studio" / "public" / "province"

STEP = 3
M_C = RAW_M * STEP

needs_vault = pytest.mark.skipif(not (RAW.exists() and SCULPTED.exists()),
                                 reason="vault sculpted terrain unavailable")


@pytest.fixture(scope="module")
def terrain():
    base = condition(np.flipud(np.load(RAW)))[::STEP, ::STEP]
    z = np.load(SCULPTED)[::STEP, ::STEP]
    env, _ = uplift_envelope(base, M_C)
    gy, gx = np.gradient(z, M_C)
    slope = np.hypot(gy, gx)
    return base, z, env, slope


@needs_vault
def test_summit_hits_target(terrain):
    _, z, _, _ = terrain
    assert SUMMIT_TARGET_M * 0.85 < z.max() < SUMMIT_TARGET_M * 1.15


@needs_vault
def test_lowlands_contained(terrain):
    """Outside the uplift envelope only the bounded naturalness pass acts.
    The max bound allows the plateau de-terracer to ramp the source's
    metre-plus quantisation walls (moves cells by up to ~half the tallest
    lowland riser); anything beyond that means an orogeny leak."""
    base, z, env, _ = terrain
    outside = env < 0.02
    delta = np.abs(z - base)[outside]
    assert delta.mean() < 0.6, f"mean lowland delta {delta.mean():.2f} m"
    assert delta.max() < 9.0, f"max lowland delta {delta.max():.2f} m"


@needs_vault
def test_coastline_stable(terrain):
    base, z, _, _ = terrain
    flipped = ((base > 0) != (z > 0)) & (np.abs(base) > 0.05)
    assert flipped.mean() < 0.002, f"coastline flips {flipped.mean() * 100:.2f}%"


@needs_vault
def test_deterracing_removes_plateau_walls():
    """The source's signature artefact — flat shelves broken by single-sample
    metre-plus walls — is gone from gentle lowland at full resolution."""
    base = condition(np.flipud(np.load(RAW)))
    z = np.load(SCULPTED)
    env_c = uplift_envelope(base[::STEP, ::STEP], M_C)[0]
    env_full = np.repeat(np.repeat(env_c, STEP, 0), STEP, 1)[: base.shape[0], : base.shape[1]]
    smooth = ndimage.gaussian_filter(base, 8.0)
    gy, gx = np.gradient(smooth, RAW_M)
    gentle = (base > 1.5) & (base < 20.0) & (np.hypot(gy, gx) < 0.08) & (env_full < 0.02)
    def walls(a):
        n = 0
        for axis in (0, 1):
            d = np.abs(np.diff(a, axis=axis)) > 1.0
            g = gentle[:-1, :] & gentle[1:, :] if axis == 0 else gentle[:, :-1] & gentle[:, 1:]
            n += int((d & g).sum())
        return n
    before, after = walls(base), walls(z)
    assert before > 1000, "expected the source staircase to be present"
    assert after < 0.3 * before, f"plateau walls {before} -> {after}"


@needs_vault
def test_peaks_reachable(terrain):
    """Most major summits are walkable to >=60% of their height."""
    _, z, env, slope = terrain
    walkable = slope < 0.9        # ~42 deg, well inside the climb-less profile
    labels, _ = ndimage.label(walkable)
    lowland_labels = np.unique(labels[(z < 40) & (z > 0) & walkable])
    lowland_labels = lowland_labels[lowland_labels > 0]
    connected = np.isin(labels, lowland_labels)
    peaks_z = ndimage.maximum_filter(z, size=41)
    peak_cells = (z == peaks_z) & (z > 260) & (env > 0.3)
    ys, xs = np.where(peak_cells)
    assert len(ys) >= 5, "expected several major summits"
    ok = 0
    for y, x in zip(ys, xs):
        y0, y1 = max(0, y - 30), min(z.shape[0], y + 31)
        x0, x1 = max(0, x - 30), min(z.shape[1], x + 31)
        local = np.where(connected[y0:y1, x0:x1], z[y0:y1, x0:x1], -1e9)
        ok += float(local.max()) >= 0.6 * float(z[y, x])
    assert ok / len(ys) >= 0.7, f"only {ok}/{len(ys)} peaks walkably reachable"


@needs_vault
def test_poi_shelves_exist(terrain):
    """High, flat-enough bench patches (candidate POI shelves) are plentiful."""
    _, z, env, slope = terrain
    shelf = (z > 110) & (slope < 0.21) & (env > 0.3)
    labels, n = ndimage.label(shelf)
    sizes = np.bincount(labels.ravel())[1:]
    patches = int((sizes >= 12).sum())      # >= ~3600 m^2 each at sim res
    assert patches >= 25, f"only {patches} shelf patches"


@needs_vault
def test_road_grades_stay_traversable(terrain):
    """The re-solved city roads never climb unwalkable sustained grades."""
    routes_path = PROVINCE / "routes.json"
    assert routes_path.exists()
    _, z, _, _ = terrain
    grades = []
    routes = json.loads(routes_path.read_text())["routes"]
    assert len(routes) >= 8
    for route in routes:
        px = route.get("px", [])
        for (x0, y0), (x1, y1) in zip(px, px[1:]):
            d = np.hypot(x1 - x0, y1 - y0) * M_C
            za = z[min(y0, z.shape[0] - 1), min(x0, z.shape[1] - 1)]
            zb = z[min(y1, z.shape[0] - 1), min(x1, z.shape[1] - 1)]
            # water/channel crossings are bridged or ferried (acceptance
            # rules) — the walked grade excludes the wet cells themselves
            if d > 0 and za > 1.0 and zb > 1.0:
                grades.append(abs(zb - za) / d)
    grades = np.array(grades)
    assert np.percentile(grades, 95) < 0.35, f"p95 road grade {np.percentile(grades, 95):.2f}"
    assert grades.max() < 0.9, f"max road grade {grades.max():.2f}"


REFINED = DEFAULT_HEIGHTS


@pytest.mark.skipif(not REFINED.exists(), reason="vault refined heights unavailable")
def test_channels_survive_sculpting():
    """Solved rivers stay carved below their banks after the full chain."""
    npz_path = VAULT / "hydrology-pass1.npz"
    if not npz_path.exists():
        pytest.skip("hydrology npz unavailable")
    h = np.load(REFINED)
    rivers = np.load(npz_path)["rivers"]
    up = np.repeat(np.repeat(rivers, STEP, 0), STEP, 1)[: h.shape[0], : h.shape[1]]
    river_cells = up >= 2
    ambient = ndimage.median_filter(h[::4, ::4], size=15)
    ambient = np.repeat(np.repeat(ambient, 4, 0), 4, 1)[: h.shape[0], : h.shape[1]]
    depression = (ambient - h)[river_cells]
    assert float(np.median(depression)) > 0.8, \
        f"median channel depression {np.median(depression):.2f} m"


@pytest.mark.skipif(not (PROVINCE / "refined" / "portages.json").exists(),
                    reason="portages.json unavailable")
def test_portage_features_present():
    """The boat network's land hops stay resolved: every hop is either a
    carved canoe channel or a short recorded portage. (The sculpted terrain
    legitimately REDUCED hop count — erosion carved better water routes.)"""
    features = json.loads((PROVINCE / "refined" / "portages.json").read_text())["features"]
    canoe = sum(1 for f in features if f["mode"] == "canoe-channel")
    assert canoe >= 2, f"only {canoe} canoe channels"
    for f in features:
        if f["mode"] == "portage":
            assert f["lengthM"] <= 400, f"portage {f['lane']} too long: {f['lengthM']} m"
