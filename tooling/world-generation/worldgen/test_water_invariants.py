"""Compiled-water invariants on the REAL province outputs (decision 0046 §5).

These are the owner-facing defects expressed as data assertions: strips that
descend and join the field cleanly, cascades that really fall, owner-masked
cells that are actually wet, no "hollow you can walk into" inside a body, and
no water surface hiding under its own ground. Skipped when the compiled data
is absent (CI without the vault).
"""

import json
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from .compile_chunks import DEFAULT_HEIGHTS
from .compile_water import (FALL_DROP_M, SEASON_AMPLITUDE_M, WEB_STEP,
                            station_long_profile)
from .export_web_chunks import decode_rg16

REPO_ROOT = Path(__file__).resolve().parents[3]
WATER_DIR = REPO_ROOT / "apps" / "world-studio" / "public" / "province" / "water"

needs_compiled = pytest.mark.skipif(
    not (WATER_DIR / "water-meta.json").exists(),
    reason="compiled province water unavailable")

pytestmark = needs_compiled


@pytest.fixture(scope="module")
def compiled():
    meta = json.loads((WATER_DIR / "water-meta.json").read_text())
    m = meta["surface"]
    img = Image.open(WATER_DIR / m["file"]).convert("RGB")
    rgb = np.asarray(img)
    w = np.asarray(decode_rg16(Image.fromarray(rgb), m["minM"], m["maxM"]),
                   dtype=np.float32)
    depth = rgb[..., 2].astype(np.float32) * 0.1
    owner = np.asarray(Image.open(WATER_DIR / m["ownerFile"]).convert("L"))
    ground = np.load(DEFAULT_HEIGHTS)[::WEB_STEP, ::WEB_STEP].astype(np.float32)
    ground = ground[: w.shape[0], : w.shape[1]]
    return meta, w, depth, owner, ground, float(m["metresPerPixel"])


def _px(x, z, mpp, n):
    """World metres -> raster indices (texel centre at (i+0.5)*mpp)."""
    return (int(np.clip(z / mpp - 0.5 + 0.5, 0, n - 1)),
            int(np.clip(x / mpp - 0.5 + 0.5, 0, n - 1)))


def test_strips_descend_and_float_above_their_bed(compiled):
    meta, w, depth, owner, ground, mpp = compiled
    channels = meta.get("channels") or []
    assert channels, "no compiled strips"
    for ch in channels:
        # the flowing (non-join) profile never rises; the join points carry
        # the field surface they merge into, which may stand slightly higher
        ys = [p["y"] for p in ch["points"] if p["kind"] != "join"]
        assert all(b <= a + 1e-6 for a, b in zip(ys, ys[1:])), \
            f"{ch['id']}: y rises downstream"
        for p in ch["points"]:
            if p["kind"] == "join":
                continue
            assert p["y"] >= p["bedY"] + 0.05, \
                f"{ch['id']} at ({p['x']}, {p['z']}): y {p['y']} vs bed {p['bedY']}"


def test_join_points_match_the_field_surface(compiled):
    meta, w, depth, owner, ground, mpp = compiled
    n = w.shape[0]
    bad = []
    for ch in meta["channels"]:
        for p in ch["points"]:
            if p["kind"] != "join":
                continue
            iy, ix = _px(p["x"], p["z"], mpp, n)
            if abs(float(w[iy, ix]) - p["y"]) > 0.2:
                bad.append((ch["id"], p["x"], p["z"], round(float(w[iy, ix]), 2), p["y"]))
    assert not bad, f"{len(bad)} join points off the field: {bad[:10]}"


def test_owner_cells_are_wet(compiled):
    meta, w, depth, owner, ground, mpp = compiled
    owned = owner > 0
    assert owned.any()
    dry = owned & (depth <= 0.0)
    if dry.any():
        ys, xs = np.nonzero(dry)
        sites = [(round((x + 0.5) * mpp, 1), round((y + 0.5) * mpp, 1))
                 for y, x in zip(ys[:10], xs[:10])]
        pytest.fail(f"{int(dry.sum())} owner cells are dry, e.g. {sites}")


def test_cascade_lips_fall_far_enough_and_sit_on_owned_water(compiled):
    meta, w, depth, owner, ground, mpp = compiled
    n = w.shape[0]
    cascades = meta.get("cascades") or []
    assert cascades
    bad = []
    for c in cascades:
        if c["lip"]["y"] - c["plunge"]["y"] < FALL_DROP_M - 1e-6:
            bad.append((c["id"], "drop", c["dropM"]))
            continue
        iy, ix = _px(c["lip"]["x"], c["lip"]["z"], mpp, n)
        if owner[iy, ix] == 0:
            bad.append((c["id"], "lip not owned", c["lip"]["x"], c["lip"]["z"]))
    assert not bad, f"{len(bad)} bad cascades: {bad[:10]}"


def test_no_enclosed_dry_holes_inside_a_body(compiled):
    """The owner's 'hollow you can walk into': a dry cell ringed by water
    whose ground is below the surrounding water level."""
    from scipy import ndimage
    meta, w, depth, owner, ground, mpp = compiled
    wet = w > ground   # true wetness: the shipped depth proxy quantises to 0.1 m
    neigh = ndimage.uniform_filter(wet.astype(np.float32), size=3) * 9.0
    ring = (~wet) & (np.round(neigh) >= 8.0)
    wsum = ndimage.uniform_filter(np.where(wet, w, 0.0), size=3) * 9.0
    mean_w = wsum / np.maximum(np.round(neigh), 1.0)
    holes = ring & (ground < mean_w)
    if holes.any():
        ys, xs = np.nonzero(holes)
        depthness = (mean_w - ground)[holes]
        worst = np.argsort(-depthness)[:10]
        sites = [(round((xs[i] + 0.5) * mpp, 1), round((ys[i] + 0.5) * mpp, 1),
                  round(float(depthness[i]), 2)) for i in worst]
        pytest.fail(f"{int(holes.sum())} enclosed dry holes; worst (x, z, m): {sites}")


def test_depth_proxy_dry_holes_are_only_quantisation(compiled):
    """The shipped depth channel steps in 0.1 m, so cells under ~5 cm of water
    read dry. Any 'hole' it reports must be shallower than that quantum —
    anything deeper would be a real hollow."""
    from scipy import ndimage
    meta, w, depth, owner, ground, mpp = compiled
    wet = depth > 0.0
    neigh = ndimage.uniform_filter(wet.astype(np.float32), size=3) * 9.0
    ring = (~wet) & (np.round(neigh) >= 8.0)
    mean_w = (ndimage.uniform_filter(np.where(wet, w, 0.0), size=3) * 9.0
              / np.maximum(np.round(neigh), 1.0))
    holes = ring & (ground < mean_w)
    if holes.any():
        worst = float((mean_w - ground)[holes].max())
        ys, xs = np.nonzero(holes & ((mean_w - ground) > 0.06))
        assert worst <= 0.06, (
            f"{len(ys)} real hollows, worst {worst:.2f} m at "
            f"{[(round((x + 0.5) * mpp, 1), round((y + 0.5) * mpp, 1)) for y, x in list(zip(ys, xs))[:10]]}")


def test_no_wet_cell_below_its_ground(compiled):
    meta, w, depth, owner, ground, mpp = compiled
    wet = depth > 0.0
    below = wet & (w < ground - 0.02)
    if below.any():
        ys, xs = np.nonzero(below)
        gap = (ground - w)[below]
        worst = np.argsort(-gap)[:10]
        sites = [(round((xs[i] + 0.5) * mpp, 1), round((ys[i] + 0.5) * mpp, 1),
                  round(float(gap[i]), 2)) for i in worst]
        pytest.fail(f"{int(below.sum())} wet cells below ground; worst: {sites}")


def test_season_never_lifts_a_pool_above_its_own_rim(compiled):
    """Per-pool season headroom (round 8): the compiler scales each pool's
    season RESPONSE so the runtime's `level + 1.4 * response` can never pass
    the pool's rim. The compiler measures the worst case over every capped
    component and ships it; anything above zero is a pool that would flood
    out of its own basin in the wet season."""
    meta = compiled[0]
    stats = meta["stats"]
    assert "poolSeasonOvertopMaxM" in stats, "compiled water predates the pool census"
    assert stats["poolSeasonOvertopMaxM"] <= 0.01, stats["poolSeasonOvertopMaxM"]
    assert stats["cappedPools"] > 0


VAULT = DEFAULT_HEIGHTS.parent.parent
HYDRO = VAULT / "hydrology-pass1.npz"


@pytest.mark.skipif(not HYDRO.exists(), reason="hydrology npz unavailable")
def test_the_carved_bed_is_wet_at_peak(compiled):
    """The bed the water profile was solved from must hold water (2026-09-07).

    `refine_province.carve_to_profile` cuts the channel bed to the conditioned
    station level minus the band film, flat across CHANNEL_FLAT_FRAC of the
    hydraulic half-width, and `compile_water` spreads that same level over the
    same width. So every cell of the flat cut has to read wet at the seasonal
    peak. Before the change the carve was 2-8x wider than the profile and its
    bed carried 2.4 m of noise: 297 of 327 reaches were under 95 % wet.

    A handful of reaches in the border ranges still fall short — they are
    steep enough that the field surface is not what draws them (the strip and
    cascade meshes are), so the gate is province-wide coverage plus a floor
    and a quota per reach, not a flat per-reach absolute.
    """
    import collections

    from scipy import ndimage

    from .refine_province import CHANNEL_FLAT_FRAC, CHANNEL_MIN_HALF_PX

    meta, w, depth, owner, ground, mpp = compiled
    npz = np.load(HYDRO)
    prof = station_long_profile(ground, npz["rivers"], npz["accum_km2"],
                                npz["flow_to"], npz["filled"])
    sy, sx = prof["sy"], prof["sx"]
    n_st = len(sy)
    # flat-cut half-width, full-res px -> surface px
    r = (np.maximum(prof["w_geom"] * 0.5 / (mpp / WEB_STEP), CHANNEL_MIN_HALF_PX)
         * CHANNEL_FLAT_FRAC / WEB_STEP).astype(np.float32)
    st_mask = np.zeros(ground.shape, dtype=bool)
    st_mask[sy, sx] = True
    r_r = np.zeros(ground.shape, dtype=np.float32)
    np.maximum.at(r_r, (sy, sx), r)
    st_id = np.full(ground.shape, -1, dtype=np.int64)
    st_id[sy, sx] = np.arange(n_st)
    d, (ky, kx) = ndimage.distance_transform_edt(~st_mask, return_indices=True)
    bed = d <= np.maximum(r_r[ky, kx], 0.5)
    near = st_id[ky, kx]

    n2 = ground.shape[0]
    scale = n2 / npz["rivers"].shape[0]
    season = ndimage.zoom(np.load(VAULT / "water-pass1.npz")["season"],
                          scale, order=1)[:n2, :n2]
    tide = ndimage.zoom((npz["salinity"] >= 0.3).astype(np.float32),
                        scale, order=0)[:n2, :n2]
    wet = (w + SEASON_AMPLITUDE_M * season + 0.5 * tide - ground) >= 0.05

    assert wet[bed].mean() >= 0.95, \
        f"carved bed only {wet[bed].mean():.3f} wet at peak province-wide"

    tot = np.bincount(near[bed], minlength=n_st).astype(float)
    hit = np.bincount(near[bed & wet], minlength=n_st).astype(float)
    parent = np.arange(n_st)

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a

    for k in range(n_st):
        if prof["dsk"][k] >= 0:
            a, b = find(k), find(int(prof["dsk"][k]))
            if a != b:
                parent[a] = b
    groups = collections.defaultdict(list)
    for k in range(n_st):
        groups[find(k)].append(k)
    reaches = [(hit[ks].sum() / tot[ks].sum(), int(tot[ks].sum()), ks[0])
               for ks in groups.values()
               if len(ks) >= 3 and tot[ks].sum() >= 20]
    assert reaches, "no reaches measured"
    worst = min(reaches)
    ok = sum(1 for f, _, _ in reaches if f >= 0.95)
    assert worst[0] >= 0.70, (
        f"reach at station {worst[2]} only {worst[0]:.3f} wet at peak "
        f"over {worst[1]} bed cells")
    assert ok / len(reaches) >= 0.90, \
        f"only {ok}/{len(reaches)} reaches >= 95 % wet at peak"


def test_plunge_pools_are_real_depressions_and_cascade_bases_are_wet(compiled):
    """Round 10. A plunge pool is a claim about the terrain: it exists only
    where the priority flood found relief. Every cascade base is wet all the
    same — through the channel bed, not through a plane on a slope."""
    from .compile_water import PLUNGE_MIN_RELIEF_M
    meta, w, depth, owner, ground, mpp = compiled
    n = w.shape[0]
    shallow = [p for p in meta["stats"].get("plungePoolSites", [])
               if p["reliefM"] < PLUNGE_MIN_RELIEF_M - 1e-6]
    assert not shallow, f"plunge pools without a depression: {shallow[:5]}"
    dry = []
    for c in meta.get("cascades") or []:
        iy, ix = _px(c["plunge"]["x"], c["plunge"]["z"], mpp, n)
        if w[iy, ix] <= ground[iy, ix]:
            dry.append((c["id"], c["plunge"]["x"], c["plunge"]["z"]))
    assert not dry, f"{len(dry)} dry cascade plunges: {dry[:10]}"


def test_no_road_stands_deep_in_a_rescued_pool(compiled):
    """A pool the rescue rules inferred may not drown a road (round 10)."""
    from .compile_water import ROAD_MAX_DEPTH_M
    meta, *_ = compiled
    worst = meta["stats"].get("roadDeepestInRescuedPoolM")
    assert worst is not None
    assert worst <= ROAD_MAX_DEPTH_M + 1e-6, worst
