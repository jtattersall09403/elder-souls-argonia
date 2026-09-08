"""Compiled-water invariants on the SHIPPED province outputs (decision 0047).

Each test is one of the owner's round-2 defects as a data assertion, checked
on what actually ships (the PNGs + meta) and on the full-resolution solution
the vault keeps beside them. Written so the pre-0047 data fails them.
Skipped when the compiled data is absent (CI without the vault).
"""

import json
from pathlib import Path

import numpy as np
import pytest
from PIL import Image
from scipy import ndimage

from .channels import ChannelSolution, KIND_FALL, KIND_LOST
from .compile_chunks import DEFAULT_HEIGHTS
from .compile_water import (CHANNELS_FILE, DEPTH_QUANTUM_M, WEB_STEP,
                            decode_surface, export_index, hovering_edges)
from .scale import RAW_M

REPO_ROOT = Path(__file__).resolve().parents[3]
WATER_DIR = REPO_ROOT / "apps" / "world-studio" / "public" / "province" / "water"
VAULT = DEFAULT_HEIGHTS.parent.parent

pytestmark = pytest.mark.skipif(
    not ((WATER_DIR / "water-meta.json").exists() and (VAULT / "water-pass1.npz").exists()
         and (DEFAULT_HEIGHTS.parent / CHANNELS_FILE).exists()),
    reason="compiled province water unavailable")


class Shipped:
    def __init__(self):
        self.meta = json.loads((WATER_DIR / "water-meta.json").read_text())
        rgb = np.asarray(Image.open(WATER_DIR / self.meta["surface"]["file"]).convert("RGB"))
        self.w2, self.depth2 = decode_surface(rgb, self.meta)
        shore = np.asarray(Image.open(WATER_DIR / "water-shore.png").convert("RGB"))
        self.season2 = shore[..., 1].astype(np.float32) / 255.0
        self.owner2 = np.asarray(Image.open(WATER_DIR / "water-owner.png").convert("L"))
        klass = np.asarray(Image.open(WATER_DIR / "water-class.png").convert("RGB"))
        self.cls, self.sal = klass[..., 0], klass[..., 2].astype(np.float32) / 255.0
        self.mpp2 = float(self.meta["surface"]["metresPerPixel"])
        self.refined = np.load(DEFAULT_HEIGHTS).astype(np.float32)
        i2 = export_index(self.refined.shape[0], WEB_STEP)
        self.ground2 = self.refined[np.ix_(i2, i2)]
        npz = np.load(VAULT / "water-pass1.npz")
        self.w = npz["w_full"]
        self.wet = npz["wet_full"]
        self.owner = npz["owner_full"]
        self.assigned = npz["assigned_full"]
        self.body = npz["body_full"]
        self.levels = npz["body_levels"]
        self.sea = npz["sea_full"]
        self.sol = ChannelSolution.load(DEFAULT_HEIGHTS.parent / CHANNELS_FILE)
        self.wet2 = self.depth2 > 0.0

    # world metres -> indices
    def full(self, x, z):
        n = self.refined.shape[0]
        return (int(np.clip(round(z / RAW_M), 0, n - 1)), int(np.clip(round(x / RAW_M), 0, n - 1)))

    def tex(self, x, z):
        n = self.w2.shape[0]
        return (int(np.clip(z / self.mpp2, 0, n - 1)), int(np.clip(x / self.mpp2, 0, n - 1)))

    def disc_full(self, x, z, r_m):
        cy, cx = self.full(x, z)
        r = int(np.ceil(r_m / RAW_M))
        n = self.refined.shape[0]
        y0, y1, x0, x1 = max(cy - r, 0), min(cy + r + 1, n), max(cx - r, 0), min(cx + r + 1, n)
        yy, xx = np.mgrid[y0:y1, x0:x1]
        return (slice(y0, y1), slice(x0, x1)), np.hypot(yy - cy, xx - cx) * RAW_M <= r_m

    def terrain_at(self, x, z):
        return float(ndimage.map_coordinates(self.refined, [[z / RAW_M], [x / RAW_M]],
                                             order=1, mode="nearest")[0])


@pytest.fixture(scope="session")
def S():
    return Shipped()


def hovering_map(S):
    """Wet cells with a dry 4-neighbour that has no level of its own (buried)
    and whose ground is >= 0.05 m below their W. The bank of the next
    station down a sloping river carries that station's level (table) and
    is not a hole; fall footprints (the sheet bridges them) are excluded."""
    return hovering_edges(S.w, S.wet, S.assigned, S.refined, S.owner == 255)


def test_no_wet_cell_has_a_lower_dry_neighbour(S):
    bad = hovering_map(S)
    if bad.any():
        ys, xs = np.nonzero(bad)
        sites = [(round(x * RAW_M), round(y * RAW_M)) for y, x in zip(ys[:8], xs[:8])]
        pytest.fail(f"{int(bad.sum())} hovering edges, e.g. {sites}")
    assert S.meta["stats"]["hoveringEdges"] == 0


def test_every_standing_body_is_flat(S):
    nb = int(S.body.max())
    assert nb > 100
    idx = np.arange(1, nb + 1)
    hi = ndimage.maximum(S.w, S.body, idx)
    lo = ndimage.minimum(S.w, S.body, idx)
    spread = np.asarray(hi) - np.asarray(lo)
    assert spread.max() < 0.02, f"body spread up to {spread.max():.3f} m"


def test_no_body_stands_above_its_rim(S):
    """A flood level cannot exceed the lowest ground on the ring just outside
    the body (otherwise the extent was cut short)."""
    nb = int(S.body.max())
    idx = np.arange(1, nb + 1)
    ring = np.where(S.body == 0, ndimage.grey_dilation(S.body, size=3), 0)
    rim = np.asarray(ndimage.minimum(S.refined, ring, idx))
    over = S.levels - rim
    assert np.nanmax(over) <= 1e-3, f"body overtops its rim by {np.nanmax(over):.3f} m"


def test_registration_texel_i_is_sample_2i_plus_1(S):
    """decoded W − refined[2j+1, 2i+1] == decoded signed depth within one
    quantum (plus the 16-bit W rounding) on >= 99.9 % of texels."""
    dmin = S.meta["surface"]["depthMinM"]
    dspan = S.meta["surface"]["depthSpanM"]
    expect = np.clip(S.w2 - S.ground2, dmin, dmin + dspan)
    tol = DEPTH_QUANTUM_M + (S.meta["surface"]["maxM"] - S.meta["surface"]["minM"]) / 65535 * 1.5
    ok = np.abs(expect - S.depth2) <= tol
    assert ok.mean() >= 0.999, f"only {ok.mean():.5f} of texels registered"


def test_strip_points_sit_inside_their_trench(S):
    channels = S.meta["channels"]
    assert channels, "no strips"
    bad = []
    for chn in channels:
        pts = chn["points"]
        ys = [p["y"] for p in pts if p["kind"] != "join"]
        assert all(b <= a + 1e-6 for a, b in zip(ys, ys[1:])), f"{chn['id']} rises"
        for i, p in enumerate(pts):
            if p["kind"] == "join":
                continue
            if S.terrain_at(p["x"], p["z"]) > p["y"] - 0.05:
                bad.append((chn["id"], p["kind"], p["x"], p["z"]))
                continue
            if p["kind"] == "plunge":
                # a plunge pool is as wide as its bowl, not the river: at a
                # cliff foot in a gorge the walls 3 m from the pool centre
                # stand metres above it, and cutting them away would remove
                # the gorge the fall needs (fall-3 at 2508 E / 308 S: 5.3 m)
                continue
            q = pts[min(i + 1, len(pts) - 1)] if i + 1 < len(pts) else pts[i - 1]
            dx, dz = q["x"] - p["x"], q["z"] - p["z"]
            nrm = float(np.hypot(dx, dz)) or 1.0
            o = pts[i - 1] if i > 0 else q
            slope_o = abs(o["y"] - p["y"]) / (float(np.hypot(o["x"] - p["x"], o["z"] - p["z"])) or 1.0)
            if max(abs(q["y"] - p["y"]) / nrm, slope_o) > 1.0:
                # steeper than 45 deg: a point 0.7 half-widths to the side
                # lies on the same slope and stands higher by construction;
                # the ribbon is drawn in the notch at the centreline
                continue
            nx, nz = -dz / nrm, dx / nrm
            off = 0.7 * p["halfWidthM"]
            for sgn in (1, -1):
                if S.terrain_at(p["x"] + sgn * nx * off, p["z"] + sgn * nz * off) > p["y"] + 0.4:
                    bad.append((chn["id"], "lateral", p["x"], p["z"]))
                    break
    assert not bad, f"{len(bad)} strip points outside their trench: {bad[:8]}"


def test_join_points_lie_on_the_field_surface(S):
    bad = []
    for chn in S.meta["channels"]:
        for p in chn["points"]:
            if p["kind"] != "join":
                continue
            iy, ix = S.full(p["x"], p["z"])
            if abs(float(S.w[iy, ix]) - p["y"]) > 0.05:
                bad.append((chn["id"], p["x"], p["z"], round(float(S.w[iy, ix]), 2), p["y"]))
    assert not bad, f"{len(bad)} joins off the field: {bad[:8]}"


def _cliff(profile, step=1.0):
    """(drop, mean slope) of the best contiguous steep run in a 1 m profile."""
    d = -np.diff(np.asarray(profile, dtype=float)) / step
    best = (0.0, 0.0)
    k = 0
    while k < len(d):
        if d[k] < 0.5:
            k += 1
            continue
        j = k
        while j + 1 < len(d) and d[j + 1] >= 0.5:
            j += 1
        drop = float(d[k:j + 1].sum() * step)
        slope = drop / ((j - k + 1) * step)
        if drop > best[0]:
            best = (drop, slope)
        k = j + 1
    return best


def test_every_cascade_is_a_cliff_with_a_plunge_pool(S):
    cascades = S.meta["cascades"]
    assert cascades, "no cascades"
    bad = []
    for c in cascades:
        drop, slope = _cliff(c["profile"], c["profileStepM"])
        if drop < 3.0 or slope < 1.0:
            bad.append((c["id"], "not a cliff", round(drop, 2), round(slope, 2)))
            continue
        if c["dropM"] < 2.5:
            bad.append((c["id"], "small step", c["dropM"]))
        iy, ix = S.full(c["plunge"]["x"], c["plunge"]["z"])
        if S.w[iy, ix] - S.refined[iy, ix] < 1.0:
            bad.append((c["id"], "shallow plunge", round(float(S.w[iy, ix] - S.refined[iy, ix]), 2)))
    assert not bad, f"{len(bad)} bad cascades: {bad[:8]}"


def test_every_coarse_river_cell_is_wet_on_its_centreline(S):
    sol = S.sol
    n = S.refined.shape[0]
    iy = np.clip(np.round(sol.y).astype(int), 0, n - 1)
    ix = np.clip(np.round(sol.x).astype(int), 0, n - 1)
    live = (sol.kind != KIND_FALL) & (sol.kind != KIND_LOST)
    cell = (iy // 3) * 1345 + (ix // 3)
    # water reaches the bed: a lake-outlet sill sits at depth 0 by design
    wet_st = np.isfinite(S.w[iy, ix]) & (S.w[iy, ix] >= S.refined[iy, ix] - 0.01)
    live_cells = np.unique(cell[live])
    wet_cells = np.unique(cell[live & wet_st])
    dry = np.setdiff1d(live_cells, wet_cells)
    assert len(dry) == 0, f"{len(dry)} coarse river cells with a dry bed, e.g. {dry[:6]}"
    assert S.meta["stats"]["stationKinds"]["lost"] <= 0.01 * sol.n


def test_owner_cells_are_wet_or_under_a_fall(S):
    strip = S.owner2 == 128
    assert strip.any()
    dry = strip & ~S.wet2
    assert not dry.any(), f"{int(dry.sum())} strip-owned texels are dry"
    fall = S.owner2 == 255
    if fall.any():
        ys, xs = np.nonzero(fall)
        px = (xs + 0.5) * S.mpp2
        pz = (ys + 0.5) * S.mpp2
        ok = np.zeros(len(ys), dtype=bool)
        for c in S.meta["cascades"]:
            ax, az = c["lip"]["x"], c["lip"]["z"]
            bx, bz = c["plunge"]["x"], c["plunge"]["z"]
            vx, vz = bx - ax, bz - az
            L2 = vx * vx + vz * vz or 1.0
            t = np.clip(((px - ax) * vx + (pz - az) * vz) / L2, 0.0, 1.0)
            d = np.hypot(px - (ax + t * vx), pz - (az + t * vz))
            ok |= d <= c["widthM"] * 0.5 + 2.0 * S.mpp2
        assert ok.mean() >= 0.98, f"{(~ok).sum()} fall-owned texels far from any cascade"


def test_season_table_band_around_fresh_water_not_the_sea(S):
    table = ~S.wet2 & (S.depth2 > -2.0) & (S.depth2 <= 0.0)
    assert table.mean() > 0.01
    _d, (jy, jx) = ndimage.distance_transform_edt(~S.wet2, return_indices=True)
    near_w = S.w2[jy, jx]
    coast = np.asarray(Image.fromarray(S.cls).resize(S.w2.shape[::-1], Image.NEAREST)) == 1
    sea_near = (np.abs(near_w) < 0.01) & coast
    assert (S.season2[table & sea_near] == 0).all()
    fresh = table & ~sea_near & (near_w > 0.5)
    assert fresh.any()
    assert (S.season2[fresh] > 0).mean() > 0.5
    assert (S.season2[S.wet2 & sea_near] == 0).all()


# --- the owner's sites, as numbers -----------------------------------------

def test_site_4570_3870_is_dry(S):
    iy, ix = S.tex(4570, 3870)
    assert S.depth2[iy, ix] <= 0.0


def test_site_1470_4130_is_a_deep_flat_lake(S):
    iy, ix = S.tex(1470, 4130)
    assert S.depth2[iy, ix] >= 20.0
    fy, fx = S.full(1470, 4130)
    b = int(S.body[fy, fx])
    assert b > 0
    vals = S.w[S.body == b]
    assert vals.max() - vals.min() < 0.02


def test_site_2660_900_is_wet(S):
    iy, ix = S.tex(2660, 900)
    assert S.depth2[iy, ix] >= 0.8


def test_site_380_1440_holds_one_flat_body(S):
    sl, disc = S.disc_full(380, 1440, 80.0)
    ids = np.unique(S.body[sl][disc])
    ids = ids[ids > 0]
    assert len(ids) >= 1
    big = [b for b in ids if (S.body == b).sum() * RAW_M * RAW_M >= 500.0]
    assert big, "no body >= 500 m2 at the site"
    for b in big:
        vals = S.w[S.body == b]
        assert vals.max() - vals.min() < 0.02


def test_site_1510_5300_has_no_puddles(S):
    sl, disc = S.disc_full(1510, 5300, 150.0)
    ids = np.unique(S.body[sl][disc])
    ids = ids[ids > 0]
    areas = np.bincount(S.body.ravel())
    small = [b for b in ids if areas[b] * RAW_M * RAW_M < 40.0]
    assert not small, f"{len(small)} standing bodies under 40 m2 at the site"


def test_site_2530_320_carries_no_lip_level_at_the_foot(S):
    sl, disc = S.disc_full(2530, 320, 100.0)
    deep = S.wet[sl] & (S.body[sl] == 0) & ((S.w[sl] - S.refined[sl]) > 5.0) & disc
    assert not deep.any(), f"{int(deep.sum())} cells over 5 m deep outside a basin"


def test_site_1590_4250_has_no_hovering_edge(S):
    sl, disc = S.disc_full(1590, 4250, 60.0)
    bad = hovering_map(S)[sl] & disc
    assert not bad.any()
