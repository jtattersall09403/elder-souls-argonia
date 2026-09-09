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

from .channels import (ChannelSolution, FALL_DROP_M, FALL_FACE_SLOPE,
                       KIND_FALL, KIND_LOST, PLUNGE_MAX_DEPTH_M,
                       PLUNGE_MIN_DEPTH_M, PLUNGE_SCOUR_PER_DROP)
from .compile_chunks import DEFAULT_HEIGHTS
from .compile_water import (CHANNELS_FILE, DEPTH_QUANTUM_M, WEB_STEP,
                            decode_surface, export_index, hovering_edges,
                            sheet_corridor, strip_corridor)
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
    is not a hole; the ground the two ribbon meshes are drawn over is
    excluded, because there the ribbon, not the field raster, is the water.

    The sheet corridor: at a brink the water is meant to have lower dry rock
    below it — that is the cliff it falls down. Without it 32 cells failed,
    every one within 10 m of a lip or a plunge (measured 2026-09-08).

    The strip corridor: a chute is a ribbon in a notch, and its raster edge
    sits inside rock that keeps falling away. One cell qualifies province-wide
    (113 E / 1201 S, measured 2026-09-09): 6.74 m from a steep station inside a
    7.05 m half-width, its dry 4-neighbour 8.17 m out and 0.16 m lower, with
    the same river's next stretch 4 m further down that wall — so claiming it
    is the first step of a smear down the chute, not the closing of a hole.

    `stats.brinkEdgeCells` and `stats.stripEdgeCells` count each exemption's
    own yield, so the census shows them doing work rather than hiding a hole.
    """
    return hovering_edges(S.w, S.wet, S.assigned, S.refined,
                          (S.owner == 255)
                          | sheet_corridor(S.sol, S.refined.shape)
                          | strip_corridor(S.sol, S.refined.shape))


def test_no_wet_cell_has_a_lower_dry_neighbour(S):
    bad = hovering_map(S)
    ys, xs = np.nonzero(bad)
    sites = sorted({(round(x * RAW_M), round(y * RAW_M)) for y, x in zip(ys, xs)})
    assert not sites, f"{len(sites)} hovering edges: {sites[:8]}"
    assert S.meta["stats"]["hoveringEdges"] == 0
    # the exemptions stay narrow: a handful of cells, not a licence
    assert S.meta["stats"]["stripEdgeCells"] <= 4
    assert S.meta["stats"]["brinkEdgeCells"] <= 64


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
            # The ground the ribbon stands on, sampled at the CELL, not
            # bilinearly: a plunge sits against the wall it fell down, so the
            # four samples around it are the dug bowl on one side and the
            # cliff on the other (2138/265: 284.34 and 295.84 in the same
            # bilinear window), and the average reads as burial where there is
            # 2 m of water. Measured 2026-09-08 on five plunge points.
            iy, ix = S.full(p["x"], p["z"])
            if float(S.refined[iy, ix]) > p["y"] - 0.05:
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


def _cliff(cascade):
    """(drop, face slope, horizontal run) of a cascade, from its OWN geometry:
    the drop over the horizontal distance lip -> plunge. The old test scanned
    the exported 1 m profile for segments at 0.5 (27 deg) and asked only that
    their mean beat 45 deg, so a uniform 51 deg mountainside passed as a
    waterfall (fall-7, fall-17, measured 2026-09-08). Per-sample slope on that
    profile also UNDER-reads — it is resampled at 1 m from a bilinear 1.83 m
    grid, so a one-cell cliff smears over two or three samples — while
    lip-to-plunge is exactly the line the renderer throws the sheet along."""
    run = float(np.hypot(cascade["plunge"]["x"] - cascade["lip"]["x"],
                         cascade["plunge"]["z"] - cascade["lip"]["z"]))
    drop = float(cascade["dropM"])
    return drop, drop / max(run, 1e-6), run


def test_every_cascade_is_a_cliff_with_a_plunge_pool(S):
    cascades = S.meta["cascades"]
    assert cascades, "no cascades"
    bad = []
    for c in cascades:
        drop, slope, run = _cliff(c)
        if drop < FALL_DROP_M or slope < FALL_FACE_SLOPE:
            bad.append((c["id"], "not a cliff", round(drop, 2), round(run, 2),
                        round(float(np.degrees(np.arctan(slope))), 1)))
            continue
        if c["dropM"] < 2.5:
            bad.append((c["id"], "small step", c["dropM"]))
        iy, ix = S.full(c["plunge"]["x"], c["plunge"]["z"])
        if S.w[iy, ix] - S.refined[iy, ix] < 1.0:
            bad.append((c["id"], "shallow plunge", round(float(S.w[iy, ix] - S.refined[iy, ix]), 2)))
        # the pool is scoured by the fall that digs it: the bowl must reach the
        # depth its own drop asks for somewhere in the wet cells around the
        # plunge (one depth quantum plus the parabolic bowl's shape)
        want = min(max(PLUNGE_MIN_DEPTH_M + PLUNGE_SCOUR_PER_DROP * float(c["dropM"]),
                       PLUNGE_MIN_DEPTH_M), PLUNGE_MAX_DEPTH_M)
        sel, disc = S.disc_full(c["plunge"]["x"], c["plunge"]["z"], 40.0)
        dep = (S.w[sel] - S.refined[sel])[disc & S.wet[sel]]
        got = float(dep.max()) if dep.size else 0.0
        if got < want - 0.3:
            bad.append((c["id"], "pool not scoured", round(float(c["dropM"]), 1),
                        round(got, 2), round(want, 2)))
    assert not bad, f"{len(bad)} bad cascades: {bad[:8]}"


def test_every_coarse_river_cell_is_wet_on_its_centreline(S):
    sol = S.sol
    n = S.refined.shape[0]
    iy = np.clip(np.round(sol.y).astype(int), 0, n - 1)
    ix = np.clip(np.round(sol.x).astype(int), 0, n - 1)
    # A station whose own sample lands on a cascade's face is not a dry bed:
    # the water there is in the air. Two of them (2223/1022 beside fall-4,
    # 682/3045 beside fall-13's lip, measured 2026-09-08) are `steep`
    # stations whose sample sits inside the sheet corridor.
    corridor = sheet_corridor(sol, S.refined.shape)
    live = ((sol.kind != KIND_FALL) & (sol.kind != KIND_LOST)
            & ~corridor[iy, ix])
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
    """The gorge cliff at 2.53 E / 0.32 S: the old defect was the LIP's level
    (144 m over 16 m of ground) carried down to the foot by nearest-station
    assignment. Test that directly — the water at the foot stands at the
    plunge level, not the lip's.

    The depth cap that used to stand in for this cannot: fall-2 drops 131.4 m
    here, so PLUNGE_SCOUR_PER_DROP asks for the full PLUNGE_MAX_DEPTH_M = 8 m
    bowl. The bowl is exempt from the cap; everything else at the site still
    obeys it, so this is not a loosened gate."""
    site = (2530.0, 320.0)
    near = [c for c in S.meta["cascades"]
            if np.hypot(c["plunge"]["x"] - site[0], c["plunge"]["z"] - site[1]) < 100.0]
    assert near, "no cascade at the site: the cliff itself has gone"
    sl, disc = S.disc_full(*site, 100.0)
    wet = S.wet[sl] & disc
    # nothing at the foot stands anywhere near a lip level
    lip_y = max(c["lip"]["y"] for c in near)
    foot_y = max(c["plunge"]["y"] for c in near)
    # "at the foot" = ground within 5 m of the landing; the river ABOVE the
    # cliff is in the same disc and legitimately stands at the lip's level
    foot = wet & (S.refined[sl] < foot_y + 5.0) & (S.body[sl] == 0)
    high = foot & (S.w[sl] > foot_y + 0.5)
    assert not high.any(), (
        f"{int(high.sum())} cells at the foot stand above the plunge level "
        f"{foot_y:.2f} (the lip is at {lip_y:.2f}), max "
        f"{float(S.w[sl][high].max()):.2f}")
    # ...and nothing is unaccountably deep outside a basin or a plunge bowl
    bowl = np.zeros_like(disc)
    for c in near:
        b_sl, b_disc = S.disc_full(c["plunge"]["x"], c["plunge"]["z"], 40.0)
        m = np.zeros(S.wet.shape, dtype=bool)
        m[b_sl] = b_disc
        bowl |= m[sl]
    deep = wet & (S.body[sl] == 0) & ((S.w[sl] - S.refined[sl]) > 5.0) & ~bowl
    assert not deep.any(), (
        f"{int(deep.sum())} cells over 5 m deep outside a basin or plunge bowl")


def test_site_2174_268_depth_matches_w_minus_ground_at_the_texel_centres(S):
    """The browser probe's `fall-20m-under` camera (2173.9 E / 268.4 S), where
    it reported |still − ground − depth| = 0.21 m.

    The shipped depth is exact HERE: at each of the four texel centres around
    the camera the B channel equals W − ground to within a quantum. The probe's
    0.21 m is a resolution artefact of its own arithmetic — it compares a
    bilinear sample of the 3.66 m depth texture with the ground read from the
    1.83 m terrain, and bilinear filtering only commutes with a linear ground.
    In fall-20m's plunge bowl the ground crosses 274.89 → 277.41 m across that
    one texel quad, so the two disagree by ~0.19 m at the camera while every
    texel is correct. This test pins the thing that would be a real defect."""
    x, z = 2173.9, 268.4
    iy, ix = S.tex(x, z)
    blk = np.s_[iy:iy + 2, ix:ix + 2]
    err = np.abs((S.w2[blk] - S.ground2[blk]) - S.depth2[blk])
    tol = DEPTH_QUANTUM_M + (S.meta["surface"]["maxM"] - S.meta["surface"]["minM"]) / 65535 * 1.5
    assert err.max() <= tol, f"depth off by {err.max():.3f} m at the texel centres"
    # ...and the ground really does swing across that quad, which is why the
    # probe's point-sampled comparison cannot be tight here
    rel = float(S.ground2[blk].max() - S.ground2[blk].min())
    assert rel > 1.0, f"ground relief across the quad only {rel:.2f} m"


def test_site_1590_4250_has_no_hovering_edge(S):
    sl, disc = S.disc_full(1590, 4250, 60.0)
    bad = hovering_map(S)[sl] & disc
    assert not bad.any()
