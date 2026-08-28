"""Phase 8b water-compile tests (decision 0025).

Part 1: pure unit tests on a synthetic valley world (run in CI, no vault).
Part 2: standing probes over the real vault outputs — every water body's
surface sits above its bed, river surfaces descend monotonically to their
receiving basin, the burial rule really buries dry ground, and the shipped
browser rasters decode back to the vault arrays.
"""

import json
from pathlib import Path

import numpy as np
import pytest

from .compile_chunks import DEFAULT_HEIGHTS
from .compile_water import BURY_M, CLASSES, FLOW_MAX, SHORE_MAX_M, compute
from .export_web_chunks import decode_rg16
from .hydrology import compute as hydro_compute
from .regions import compute_regions

VAULT = DEFAULT_HEIGHTS.parent.parent
REPO_ROOT = Path(__file__).resolve().parents[3]
WATER_DIR = REPO_ROOT / "apps" / "world-studio" / "public" / "province" / "water"

needs_vault = pytest.mark.skipif(
    not ((VAULT / "water-pass1.npz").exists() and (WATER_DIR / "water-meta.json").exists()),
    reason="vault water-pass1 or shipped water rasters unavailable")


# ---------------------------------------------------------------------------
# Part 1 — synthetic world
# ---------------------------------------------------------------------------

def _world(n=90):
    """Tilted plane draining south into an ocean, with a valley river and a
    perched lake basin high in the north-east."""
    z = np.zeros((n, n), dtype=np.float32)
    for y in range(n):
        z[y, :] = 40.0 - 36.0 * (y / (n - 1))
    z[:, n // 2] -= 4.0                # river valley
    z[-6:, :] = -6.0                   # ocean strip
    z[8:16, n - 20 : n - 8] -= 9.0     # perched closed basin -> lake
    return z


@pytest.fixture(scope="module")
def synth():
    z = _world()
    res = hydro_compute(z, metres_per_px=60.0)
    reg = compute_regions(z, res, 60.0)
    npz = {
        "ocean": res.ocean, "filled": res.filled.astype(np.float32),
        "rivers": res.rivers, "lakes": res.lakes, "wetlands": res.wetlands,
        "tidal": res.tidal, "salinity": res.salinity.astype(np.float32),
        "hand": reg.hand, "flood": reg.flood, "regions": reg.regions,
        "flow_to": res.flow_to.astype(np.int32),
        "accum_km2": res.accum_km2.astype(np.float32),
    }
    refined = np.repeat(np.repeat(z, 2, axis=0), 2, axis=1)  # fake 2x grid
    return z, npz, compute(z, refined, npz)


def test_sea_surface_is_zero_and_dry_land_buried(synth):
    z, npz, r = synth
    assert np.allclose(r["w1"][npz["ocean"]], 0.0)
    interior_dry = (~r["wet"]) & (~r["ext"])
    assert np.allclose(r["w1"][interior_dry], z[interior_dry] - BURY_M)


def test_perched_lake_gets_a_level_surface_above_sea(synth):
    z, npz, r = synth
    lake = npz["lakes"] & (z > 1.0)
    if not lake.any():
        pytest.skip("synthetic solve produced no perched lake")
    w = r["w1"][lake]
    assert w.max() > 1.0                       # genuinely above sea level
    assert w.std() < 0.35                      # one near-level surface
    assert (w >= z[lake] - 0.6).all()          # covers its bed


def test_river_surface_monotone_downstream(synth):
    z, npz, r = synth
    flow = npz["flow_to"].reshape(-1)
    w = r["w1"].reshape(-1)
    riv = (npz["rivers"] > 0).reshape(-1)
    idx = np.flatnonzero(riv)
    j = flow[idx]
    ok = (j >= 0) & riv[j.clip(0)]
    assert ok.any()
    assert (w[j[ok]] <= w[idx[ok]] + 1e-4).all()


def test_flow_points_downstream_and_within_bounds(synth):
    z, npz, r = synth
    riv = npz["rivers"] > 0
    speed = np.hypot(r["vx"], r["vz"])
    assert speed[riv].max() <= FLOW_MAX
    # the synthetic river drains south (+z): net flow must be southward
    assert r["vz"][riv].mean() > 0.05


def test_depth_proxy_positive_over_water_zero_on_dry(synth):
    z, npz, r = synth
    assert r["depth2"].min() >= 0.0
    assert r["depth2"].max() > 1.0
    # buried zone contributes no visible water
    assert np.allclose(r["depth2"][r["nodata2"]], 0.0)


def test_classes_assigned_over_water(synth):
    z, npz, r = synth
    assert (r["cls"][r["wetr"]] > 0).all()
    assert (r["cls"][(~r["wetr"]) & (~r["ext"])] == 0).all()


# ---------------------------------------------------------------------------
# Part 2 — standing probes on the real province
# ---------------------------------------------------------------------------

@pytest.fixture(scope="module")
def province():
    npz = np.load(VAULT / "water-pass1.npz")
    hydro = np.load(VAULT / "hydrology-pass1.npz")
    meta = json.loads((WATER_DIR / "water-meta.json").read_text())
    return npz, hydro, meta


@needs_vault
def test_province_river_surfaces_cover_their_carved_beds(province):
    from .compile_water import CARVE_DEPTH
    npz, hydro, meta = province
    z = hydro["conditioned"]
    for band, depth in CARVE_DEPTH.items():
        m = hydro["rivers"] == band
        if not m.any():
            continue
        above = (npz["w1"] > z - depth + 0.05)[m].mean()
        assert above > 0.97, f"band {band}: only {above:.3f} above bed"


@needs_vault
def test_province_monotone_river_descent(province):
    npz, hydro, meta = province
    flow = hydro["flow_to"].reshape(-1)
    w = npz["w1"].reshape(-1)
    riv = (hydro["rivers"] > 0).reshape(-1)
    idx = np.flatnonzero(riv)
    j = flow[idx]
    ok = (j >= 0) & riv[j.clip(0)]
    bad = (w[j[ok]] > w[idx[ok]] + 1e-3).mean()
    assert bad < 0.001


@needs_vault
def test_province_visible_water_fraction_sane(province):
    npz, hydro, meta = province
    frac = meta["stats"]["visibleWaterFrac2017"]
    # sea alone is ~32-36% of the grid; with lakes/rivers a bit more —
    # a collapse (buried everything) or an explosion (flooded the land)
    # both fail here.
    assert 0.30 < frac < 0.50


@needs_vault
def test_shipped_surface_raster_decodes_to_vault(province):
    from PIL import Image
    npz, hydro, meta = province
    m = meta["surface"]
    rgb = np.asarray(Image.open(WATER_DIR / m["file"]).convert("RGB"))
    w = decode_rg16(Image.fromarray(rgb), m["minM"], m["maxM"])
    err = np.abs(w - npz["w2"])
    assert err.max() < (m["maxM"] - m["minM"]) / 65535 * 2 + 1e-3
    depth = rgb[..., 2].astype(np.float32) * 0.1
    assert np.abs(depth - np.clip(npz["depth2"], 0, 25.5)).max() < 0.11
    shore_rgb = np.asarray(Image.open(WATER_DIR / m["shoreFile"]).convert("RGB"))
    shore = shore_rgb[..., 0].astype(np.float32) / 255.0 * m["shoreMaxM"]
    assert np.abs(shore - np.clip(npz["shore2"], 0, m["shoreMaxM"])).max() < m["shoreMaxM"] / 255 + 1e-2


@needs_vault
def test_no_buried_surface_above_local_water(province):
    """Owner round 2, defect 'vertical water sheets': near any water, the
    buried surface must sit clearly BELOW the local water level so distant
    triangles can never bridge a gully above the waterline."""
    from scipy import ndimage as ndi
    npz, hydro, meta = province
    w2 = npz["w2"]
    depth2 = npz["depth2"]
    wet2 = depth2 > 0.01
    fringe = npz["fringe"]
    dist, (jy, jx) = ndi.distance_transform_edt(~wet2, return_indices=True)
    # the low-bank fringe deliberately sits AT the local level (flood headroom)
    near_buried = (~wet2) & (~fringe) & (dist > 0) & (dist <= 8)
    wn = w2[jy, jx]
    viol = (w2[near_buried] > wn[near_buried] + 0.10).mean()
    assert viol < 0.005, f"{viol:.3f} of near-shore dry cells sit ABOVE local water"


@needs_vault
def test_pools_fill_level(province):
    """Standing pools are LEVEL surfaces (water finds its level): within a
    connected wet component off the sea/rivers, W varies by centimetres."""
    from scipy import ndimage as ndi
    npz, hydro, meta = province
    w2 = npz["w2"]
    depth2 = npz["depth2"]
    wet2 = depth2 > 0.05
    riv2 = npz["riv2"]
    lbl, n = ndi.label(wet2 & (np.abs(w2) > 0.3) & ~riv2)  # off-sea, off-river
    if not n:
        pytest.skip("no off-sea bodies")
    sizes = np.bincount(lbl.ravel())
    checked = 0
    for i in np.argsort(sizes[1:])[::-1][:12] + 1:
        vals = w2[lbl == i]
        if len(vals) < 80:
            continue
        checked += 1
        spread = np.percentile(vals, 95) - np.percentile(vals, 5)
        assert spread < 0.6, f"body {i}: spread {spread:.2f} m"
    assert checked >= 1


@needs_vault
def test_shipped_flow_and_class_rasters_decode(province):
    """RGB only — data must NEVER ride a PNG alpha channel (browser canvas
    premultiply destroyed salinity/flow in rounds 0-2: the tide bug)."""
    from PIL import Image
    npz, hydro, meta = province
    flow_img = Image.open(WATER_DIR / meta["flow"]["file"])
    klass_img = Image.open(WATER_DIR / meta["klass"]["file"])
    shore_img = Image.open(WATER_DIR / meta["surface"]["shoreFile"])
    assert flow_img.mode == "RGB" and klass_img.mode == "RGB" and shore_img.mode == "RGB"
    flow = np.asarray(flow_img.convert("RGB"), dtype=np.float32)
    vx = (flow[..., 0] / 255.0 - 0.5) * 2.0 * FLOW_MAX
    assert np.abs(vx - npz["vx"]).max() < FLOW_MAX / 255 * 2 + 1e-3
    klass = np.asarray(klass_img.convert("RGB"))
    assert set(np.unique(klass[..., 0])).issubset(set(range(len(CLASSES))))
    # salinity must survive at the open bay (the exact tide-bug symptom)
    mpp = meta["klass"]["metresPerPixel"]
    assert klass[int(5070 / mpp), int(6160 / mpp), 2] > 200
    # tannin distinguishes blackwater marsh from silt rivers
    shore_rgb = np.asarray(shore_img.convert("RGB"))
    assert shore_rgb[..., 2].max() > 120
