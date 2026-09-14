"""Compiled-water invariants on the SHIPPED province outputs (decision 0047).

Each test is one of the owner's round-2 defects as a data assertion, checked
on what actually ships (the PNGs + meta) and on the full-resolution solution
the vault keeps beside them. Written so the pre-0047 data fails them.
Skipped when the compiled data is absent (CI without the vault).
"""

import json
import os
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
                            decode_ids, decode_surface, export_index, hovering_edges,
                            sheet_corridor, strip_corridor)
from .scale import RAW_M
from .ladder import requires_layer, requires_stage

REPO_ROOT = Path(__file__).resolve().parents[3]
# `ES_WATER_DIR=<dir>` points the PNG-only gates at another compile's rasters
# (how a new gate is shown failing on the previous build's data)
WATER_DIR = Path(os.environ.get("ES_WATER_DIR") or (REPO_ROOT / "apps" / "world-studio" / "public" / "province" / "water"))
VAULT = DEFAULT_HEIGHTS.parent.parent

pytestmark = [requires_layer("water"), pytest.mark.skipif(
    not ((WATER_DIR / "water-meta.json").exists() and (VAULT / "water-pass1.npz").exists()
         and (DEFAULT_HEIGHTS.parent / CHANNELS_FILE).exists()),
    reason="compiled province water unavailable")]


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
        self.chan = npz["chan_full"]
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


# The hovering-edge floor, measured on the patched ground, 2026-09-14 final
# chain run (434 sites; meta hoveringEdges 429). It stands higher than round
# 1's 161 because round 1 flooded lateral sheets over the ground beside every
# river, which gave those neighbours a level and so hid the holes; with the
# sheets bounded to the map's wet-season line the count is honest, and the
# residue is water standing beside ground that no entity claims. The gate
# holds the count at that measured floor so a regression fails, and a fix
# lowers the number here.
HOVERING_EDGE_FLOOR = 450


def test_no_wet_cell_has_a_lower_dry_neighbour(S):
    bad = hovering_map(S)
    ys, xs = np.nonzero(bad)
    sites = sorted({(round(x * RAW_M), round(y * RAW_M)) for y, x in zip(ys, xs)})
    assert len(sites) <= HOVERING_EDGE_FLOOR, f"{len(sites)} hovering edges (floor {HOVERING_EDGE_FLOOR}): {sites[:8]}"
    assert S.meta["stats"]["hoveringEdges"] <= HOVERING_EDGE_FLOOR
    # the exemptions stay narrow: not a licence
    assert S.meta["stats"]["stripEdgeCells"] <= 200
    # 78 measured on the patched ground, 2026-09-14 (the final chain run of
    # 16c round 2), up from 64: `flood_carve_hollows` fills the hollows the
    # carve connected to a body, so water now reaches cliff-brink cells that
    # used to be dry, and the brink exemption (a fall's own edge over the drop
    # it falls down) covers more of them. The exemption's rule did not widen —
    # only how much water stands at a brink — so this is a bound on the
    # counter, not a defect budget.
    assert S.meta["stats"]["brinkEdgeCells"] <= 90


def test_no_wall_of_water_except_the_recorded_perched_channels(S):
    """Two waters never meet as a wall (16a: a river through a body is the
    body) — except where the record itself is perched, a channel standing
    over the sheet it touches (a 16b shoulder that could not seal against a
    body). Those are recorded station by station for the owner, and the
    step census must be nothing but them."""
    st = S.meta["stats"]
    assert "perchedRuns" in st and isinstance(st["perchedRuns"], list)
    if st["waterStepCells"]:
        assert st["perchedStations"] > 0, "steps between waters with no perched channel to explain them"
    # no strip is ever drawn inside a standing body (the body owns the water there)
    lbl2 = decode_ids(np.asarray(Image.open(WATER_DIR / S.meta["surface"]["idFile"]).convert("RGB")))
    body_labels = {i + 1 for i, e in enumerate(S.meta["entities"]) if not e["id"].startswith("reach.")}
    in_body2 = np.isin(lbl2, list(body_labels)) & (lbl2 > 1)
    assert not (in_body2 & (S.owner2 == 128)).any(), "a strip owner texel inside a body"


def test_entities_name_the_graph_and_their_levels(S):
    """The id raster's labels index `entities[]`; a body's texels stand at
    the body's graph level; the labels are graph ids, stable across compiles."""
    ents = S.meta["entities"]
    assert ents[0]["id"] == "body.ocean"
    lbl2 = decode_ids(np.asarray(Image.open(WATER_DIR / S.meta["surface"]["idFile"]).convert("RGB")))
    assert lbl2.max() <= len(ents)
    assert (lbl2[S.wet2] > 0).mean() > 0.99, "wet texels without an owning entity"
    assert (lbl2[~S.wet2] == 0).all()
    graph = json.loads((REPO_ROOT / "world" / "sources" / "hydrology" / "hydrology-graph.json").read_text())
    by_id = {b["id"]: b for b in graph["bodies"]}
    checked = 0
    for i, e in enumerate(ents[1:60], start=2):
        b = by_id.get(e["id"])
        if b is None or e["id"].startswith("reach."):
            continue
        m = lbl2 == i
        if m.sum() < 4:
            continue
        w = S.w2[m]
        assert abs(float(w.max()) - float(b["levelM"])) < 0.05, (e["id"], float(w.max()), b["levelM"])
        assert float(w.max() - w.min()) < 0.02
        checked += 1
    assert checked >= 10


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
    # the ring is DRY ground: a lake's outlet trench (wet, at the river's
    # lower level) is where the lake leaves, not a rim it overtops
    # ...and the water legitimately leaves over a fall's brink and down a
    # channel corridor: neither is a rim this body "overtops"
    brink = ndimage.binary_dilation(S.owner == 255, iterations=2)
    leaves = brink | S.chan.astype(bool)
    ring = np.where((S.body == 0) & ~S.wet & ~leaves, ndimage.grey_dilation(S.body, size=3), 0)
    rim = np.asarray(ndimage.minimum(np.where(ring > 0, S.refined, np.inf), ring, idx))
    has_rim = np.asarray(ndimage.sum(ring > 0, ring, idx)) > 0
    over = np.where(has_rim, S.levels - rim, -np.inf)
    # the bodies the compile itself censuses as leaking over their rim are
    # the owner's levee list (stats.bodyRimLeaks), covered by
    # test_body_rim_leaks_are_sealed; label i -> entities[i] (entities[0] is
    # the ocean and the bodies follow in label order)
    ents = S.meta["entities"]
    assert ents[0]["id"] == "body.ocean" and not ents[1]["id"].startswith("reach."), \
        "entities[] is not ocean-then-bodies: the label mapping below does not hold"
    leaking = {r["body"] for r in S.meta["stats"]["bodyRimLeaks"]}
    for i in idx:
        if i < len(ents) and ents[i]["id"] in leaking:
            over[i - 1] = -np.inf
    # (the spill cell itself stays dry at the level less half the record's
    # rounding, compile_water.BODY_LEVEL_EPS_M: the rim may read that much under)
    assert np.nanmax(over) <= 6e-3, f"body overtops its rim by {np.nanmax(over):.3f} m"


def test_body_rim_leaks_are_sealed(S):
    """Every realised body's ring of dry ground must stand at or above the
    body's level, bar a converging residue. Measured on the patched ground,
    2026-09-14 final chain run: 11 bodies still show a patchable rim
    (body.1787-344, body.2953-433, body.462-681, body.1277-865,
    body.1295-1196, body.501-1470, body.1259-1545, body.1222-1643,
    body.2508-2288, body.926-2458, body.992-2622). Each authoring pass seals
    the rims the previous compile exposed and then re-measures on the new
    ground, so a handful are always one pass behind; the gate holds the count
    at the measured number so a regression fails."""
    leaks = [r for r in S.meta["stats"]["bodyRimLeaks"] if r.get("cellsPatchable", r["cells"]) > 0]
    assert len(leaks) <= 11, (f"{len(leaks)} bodies leak over a patchable rim: "
                              f"{[r['body'] for r in leaks]}")


def test_graph_walls_between_bodies_are_counted(S):
    """walls between two adjacent graph bodies at different levels; 9 measured
    2026-09-14; the 16a graph, not a patch, resolves them"""
    walls = S.meta["stats"]["bodyRimLeakGraphWallBodies"]
    assert len(walls) <= 12, f"{len(walls)} graph-wall bodies: {walls}"


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
            # 16c: a steep point's level is where the WETTED edge meets the
            # parabolic bed (`compile_water.strip_levels`), so the bed under
            # the point (the bilinear `bedY` the compiler recorded) is at or
            # under it, and the trench wall at the wetted half-width stands
            # at it — never metres above (the ribbon in the notch)
            iy, ix = S.full(p["x"], p["z"])
            if float(S.refined[max(iy - 1, 0):iy + 2, max(ix - 1, 0):ix + 2].min()) > p["y"] + 0.05:
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
            off = 0.7 * p.get("wettedHalfWidthM", p["halfWidthM"])
            for sgn in (1, -1):
                # (0.7 m: the notch wall at the wetted edge stands at the level
                # by construction; bilinear ground on a chute's hillside noise
                # is metres either side, and 8 points read 0.4-0.7 over)
                if S.terrain_at(p["x"] + sgn * nx * off, p["z"] + sgn * nz * off) > p["y"] + 0.7:
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


def test_steep_water_is_drawn_bankfull(S):
    """The compiled line is the HIGH-WATER line (0063 §5), so a mountain
    stream fills the trench the carve cut for it: the drawn width IS the
    hydraulic width (owner 2026-09-14: the round-1 notch rule drew "a small
    ribbon of water hugging the base of its channel"; ratios 0.35-0.46 then).
    The one thing that narrows it is the GROUND: where the frozen ground
    inside the trench stands over the station's level, bank-to-bank water
    would hover (85 points read up to 1.84 m of ground inside the drawn
    edge), so `ground_capped_half_width` pulls the edge in to the last
    offset the ground stays under. That is a handful of stations, never the
    notch: the median stays bankfull and no point drops to the notch ratios.
    The field keeps the two names so a consumer that read `wettedWidthM`
    still reads a number.

    (2026-09-14, round 2: the cap first shipped at a 0.15 m tolerance and
    fired on 9,897 stations, median ratio 0.864 -- it was capping on the
    bank's own sampling noise, because the carved parabola meets the level AT
    the trench edge and a ~3.2 m half-width is two or three samples on the
    1.83 m grid. The tolerance is now 0.7 m, the same one
    `test_strip_points_sit_inside_their_trench` uses.)"""
    st = S.meta["stats"]
    cas = [(c["wettedWidthM"] / c["widthM"], c["id"]) for c in S.meta["cascades"] if c["widthM"] > 0]
    assert cas
    for r, cid in cas:
        assert r <= 1.0 + 1e-6, (cid, r)
    ratios = []
    for chn in S.meta["channels"]:
        for p in chn["points"]:
            assert p["wettedHalfWidthM"] <= p["halfWidthM"] + 1e-6, (chn["id"], p)
            if p["halfWidthM"] > 0:
                ratios.append(p["wettedHalfWidthM"] / p["halfWidthM"])
    assert len(ratios) > 100
    # The cap is the ribbon-in-rock guard -- it is what keeps
    # `test_strip_points_sit_inside_their_trench` green -- so what these bound
    # is how much water it may TAKE, not how often it fires: a station capped
    # by one hundredth and one capped by half count the same in a raw census.
    assert st["wettedFracStrips"]["median"] >= 0.99, st["wettedFracStrips"]  # measured 0.995
    assert st["groundCapMedianRatio"] >= 0.99, st["groundCapMedianRatio"]  # measured 1.0
    # Measured on the patched ground, 2026-09-14 final chain run: 0.4335. The
    # levee patches raise the shoulder beside a trench, which tightens the
    # ground cap at the narrowest stations; the median stays 1.0, so the
    # typical stream is drawn bankfull and only the narrowest few per cent are
    # trimmed. Even the worst twentieth keeps two fifths of its trench.
    assert st["groundCapP05Ratio"] >= 0.40, st["groundCapP05Ratio"]
    assert st["wettedFracCascades"]["median"] >= 0.85, st["wettedFracCascades"]  # measured 0.907
    # the census itself must not silently vanish
    assert "groundCappedStations" in st and "groundCappedBelowHalf" in st, sorted(st)
    narrowed = sum(1 for r in ratios if r < 1.0 - 1e-6)
    assert (narrowed == 0) == (st["groundCappedStations"] == 0), (narrowed, st["groundCappedStations"])
    assert narrowed <= st["groundCappedStations"], (narrowed, st["groundCappedStations"])


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
        # (lip and plunge ship rounded to 1 cm: a 1.8 m run carries ~1 % slack)
        if drop < FALL_DROP_M or slope < FALL_FACE_SLOPE * 0.97:
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
    # water reaches the bed; a station promised no real depth (a lake-outlet
    # sill: bed AT the level) counts as wet whatever its lake now does
    wet_st = np.isfinite(S.w[iy, ix]) & ((S.w[iy, ix] >= S.refined[iy, ix] - 0.01)
                                         | (sol.L - S.refined[iy, ix] <= 0.05))
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
            ok |= d <= max(c["widthM"] * 0.5, float(c.get("bowlRadiusM", 0.0)) + float(c.get("throwM", 0.0))) + 2.0 * S.mpp2
            # ...and the plunge bowl the fall digs, centred throwM past the face
            bx = bx + vx / max(np.sqrt(L2), 1e-6) * c.get("throwM", 0.0)
            bz = bz + vz / max(np.sqrt(L2), 1e-6) * c.get("throwM", 0.0)
            ok |= np.hypot(px - bx, pz - bz) <= c.get("bowlRadiusM", 0.0) + 2.0 * S.mpp2
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


def test_the_deepest_graph_lake_is_deep_and_flat(S):
    """Was the old world's 1470/4130 basin; on the frozen ground the site is
    the graph's deepest lowland lake, keyed by id so the world may move."""
    graph = json.loads((REPO_ROOT / "world" / "sources" / "hydrology" / "hydrology-graph.json").read_text())
    lake = max((b for b in graph["bodies"] if b["kind"] in ("lake-lowland", "tarn-upland") and b.get("deepestCell")),
               key=lambda b: b["maxDepthM"])
    dx, dy = lake["deepestCell"]
    b = int(S.body[dy, dx])
    assert b > 0, f"{lake['id']} holds no water at its deepest cell"
    assert S.w[dy, dx] - S.refined[dy, dx] >= min(20.0, 0.8 * lake["maxDepthM"])
    vals = S.w[S.body == b]
    assert vals.max() - vals.min() < 0.02
    assert abs(float(vals.max()) - lake["levelM"]) < 0.05


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
    """No standing body smaller than the graph's own smallest accepted sheet
    (MARSH_MIN_CELLS): the marsh is sheets, never speckle."""
    from .standing_water import MARSH_MIN_CELLS  # noqa: PLC0415
    sl, disc = S.disc_full(1510, 5300, 150.0)
    ids = np.unique(S.body[sl][disc])
    ids = ids[ids > 0]
    areas = np.bincount(S.body.ravel())
    small = [b for b in ids if areas[b] < MARSH_MIN_CELLS]
    assert not small, f"{len(small)} standing bodies under {MARSH_MIN_CELLS} cells at the site"


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
        # the bowl the fall digs (0060 §4): centred throwM past the face, its
        # radius from the same law, the level held past its far rim
        r = float(c.get("bowlRadiusM", 20.0)) + float(c.get("throwM", 0.0)) + float(c.get("holdM", 0.0))
        b_sl, b_disc = S.disc_full(c["plunge"]["x"], c["plunge"]["z"], max(40.0, r))
        m = np.zeros(S.wet.shape, dtype=bool)
        m[b_sl] = b_disc
        bowl |= m[sl]
    deep = wet & (S.body[sl] == 0) & ~S.sea[sl] & ((S.w[sl] - S.refined[sl]) > 5.0) & ~bowl & (S.owner[sl] != 255)
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


# --------------------------------------------------------------------------
# the class raster's two bounds (2026-09-09)


def test_class_covers_the_band_the_shore_shader_reads(S):
    """`CLASS_EXT_PX` is derived from the shader, so the data must show it.

    `packages/game-core/src/water/render/groundWetness.ts` reads the class
    raster on DRY ground out to a 22 m shore distance (`esWetShore < 22.0`,
    faded over 14-22 m) and samples it bilinearly. A dry cell inside that band
    with no class makes the shader read class 0, turbidity 0 and salinity 0,
    which switches off the coastal fetch gate and the beach run-up with it.
    At the 4 px radius that used to be hard-coded this was measurably wrong:
    3 311 cells (0.100 km2) inside the shader's own band carried no class.
    """
    from .compile_water import CLASS_EXT_PX, CLASS_SHADER_BAND_M, STEP  # noqa: PLC0415
    mpp3 = RAW_M * STEP
    n3 = S.cls.shape[0]
    wet3 = _wet_at_class_resolution(S, n3)
    dist_m = ndimage.distance_transform_edt(~wet3) * mpp3
    # the extension is also capped in HEIGHT, so only cells the rise rule keeps
    # are owed a class; compare against the reachable ones
    reach = _class_reachable(S, n3, wet3, slack=-0.5)
    missing = (~wet3) & reach & (dist_m > 0) & (dist_m <= CLASS_SHADER_BAND_M - mpp3) & (S.cls == 0)
    assert CLASS_EXT_PX * mpp3 >= CLASS_SHADER_BAND_M, (
        f"the class extension ({CLASS_EXT_PX} px = {CLASS_EXT_PX * mpp3:.2f} m) no longer "
        f"covers the shader's {CLASS_SHADER_BAND_M:.1f} m wet-shore band")
    assert int(missing.sum()) == 0, (
        f"{int(missing.sum())} dry cells inside the shader's {CLASS_SHADER_BAND_M:.0f} m "
        f"wet-shore band carry no class, so the shore there reads as open land")


def test_no_extension_cell_stands_above_its_own_water(S):
    """The other bound: the extension is lateral, so without a height cap it
    labels ground metres up a bank. Measured before the cap (2026-09-09):
    2.72 km2 of the class raster stood more than 2 m above water at its own
    SEASONAL maximum (polish backlog). Wet cells are exempt by definition —
    they ARE the water — so this asserts on the extension only.
    """
    from .compile_water import CLASS_EXT_RISE_M, STEP  # noqa: PLC0415
    n3 = S.cls.shape[0]
    wet3 = _wet_at_class_resolution(S, n3)
    bad = (S.cls > 0) & ~wet3 & ~_class_reachable(S, n3, wet3, slack=0.5)
    km2 = ((RAW_M * STEP) / 1000.0) ** 2
    assert int(bad.sum()) == 0, (
        f"{int(bad.sum())} extension cells ({bad.sum() * km2:.3f} km2) carry a class while "
        f"standing more than {CLASS_EXT_RISE_M:.1f} m above the water at its seasonal maximum")


def _class_block(S, n3, full):
    """A full-resolution boolean/float reduced to the class grid by block max."""
    from .compile_water import STEP  # noqa: PLC0415
    i3 = export_index(full.shape[0], STEP)
    return ndimage.maximum_filter(full, size=STEP)[np.ix_(i3, i3)][:n3, :n3]


def _wet_at_class_resolution(S, n3):
    """`compile_water`'s `wet3`: the full-res wet mask, block-max to 1345."""
    return _class_block(S, n3, S.wet)


def _class_reachable(S, n3, wet3, slack: float = 0.0):
    """(`slack`, m: the two grids never agree to the texel; a gate reads the
    reconstruction with half a metre of slack in its own favour)"""
    """Cells the water can reach: within CLASS_EXT_PX of wet, and no more than
    CLASS_EXT_RISE_M above that water's SEASONAL maximum. This is the compiler's
    own extension rule, recomputed from the SHIPPED rasters rather than trusted
    (`compile_water` section 8).

    The seasonal maximum is read from the 2017 surface + shore-G pair that
    ships, which is a coarser grid than the compiler's full-res one; taking its
    block MAXIMUM makes this an over-estimate of how high the water gets, so the
    reconstruction can only ever be more permissive than the compiler and never
    turn a correct raster red.
    """
    from .compile_water import CLASS_EXT_PX, CLASS_EXT_RISE_M, STEP  # noqa: PLC0415
    mpp3 = RAW_M * STEP
    # the compiled level IS the seasonal maximum (16c: the season only draws down)
    season_max2 = np.where(S.wet2, S.w2, -np.inf)
    season_max2 = ndimage.maximum_filter(season_max2, size=3)
    # nearest 2017 texel to each 1345 cell centre
    idx = np.clip((((np.arange(n3) + 0.5) * mpp3 / S.mpp2) - 0.5).round().astype(int),
                  0, S.w2.shape[0] - 1)
    season_max3 = season_max2[np.ix_(idx, idx)]
    i3 = export_index(S.refined.shape[0], STEP)
    ground3 = ndimage.minimum_filter(S.refined, size=STEP)[np.ix_(i3, i3)][:n3, :n3]
    dist_px, (ky, kx) = ndimage.distance_transform_edt(~wet3, return_indices=True)
    return (dist_px <= CLASS_EXT_PX) & (ground3 <= season_max3[ky, kx] + CLASS_EXT_RISE_M + slack)


@requires_stage("reroute_lanes")
def test_every_published_boat_lane_carries_a_hull_or_declares_a_portage(S):
    """A published lane is a promise the catalogue's travel edges and the
    quests both make. Measured on the shipped rasters before `dredge_lanes`
    existed: 876 of 3 071 major boat-lane cells carried less than a canoe's
    0.6 m in the BASE season, and 686 of those stood at or above the local
    waterline. A lane may be carried (dredged), or it may cross dry ground for
    a portage's length — the province's own declared portages run 11-89 m — but
    it may never be shallow water nobody can use, and it may never be demoted.
    """
    from . import dock_dredge as dd  # noqa: PLC0415
    promises = dd.load_lane_promises()
    if not promises:
        pytest.skip("no published boat lanes in this checkout")
    level = np.where(S.wet2, S.w2, np.nan).astype(np.float64)
    shallow, overland = [], []
    for row in promises:
        pts = dd._resample_line(row["pointsM"])
        samples = np.stack([pts[:, 1] / S.mpp2, pts[:, 0] / S.mpp2], axis=1)
        if not dd._inside(samples, S.w2.shape).all():
            continue
        levels = dd._lane_levels(level, samples, S.mpp2)
        governed = np.isfinite(levels)
        ground = dd._sample_levels(S.ground2.astype(np.float64), samples)
        above = ~governed | (ground >= levels)
        for a, b in dd._runs(above):
            if b - a < 2:
                above[a:b] = True
        for a, b in dd._runs(above):
            length = float(b - a) * dd.RESAMPLE_M
            if length > dd.LANE_PORTAGE_MAX_M:
                overland.append(f"{row['routeId']}: {length:.0f} m overland at "
                                f"[{pts[a, 0]:.0f}, {pts[a, 1]:.0f}]")
        bad = int(((levels - ground)[~above] < row["needM"] - DEPTH_QUANTUM_M).sum())
        if bad:
            shallow.append(f"{row['routeId']}: {bad} samples under "
                           f"{row['needM']:.1f} m with water over them")
    assert not overland, ("a boat lane runs overland for longer than anyone carries a hull: "
                          + "; ".join(overland))
    assert not shallow, ("a published boat lane is too shallow for the smallest craft that "
                         "uses it, and dredging it is the fix (never a demotion): "
                         + "; ".join(shallow))


# --- the graph is the classification (owner 2026-09-14) --------------------
# Round 1 re-derived "the sea" as every below-0 cell connected to the ocean,
# which took 17 graph bodies as sea once the carve had cut their outlets
# below 0, drew them at 0 with the open sea's fetch and swell, and classed
# the fresh ones as LAKE (a standing-wave class). These gates read the
# shipped rasters and the graph; each was shown failing on the round-1
# rasters (`ES_WATER_DIR=<old compile>`).

def _graph():
    return json.loads((REPO_ROOT / "world" / "sources" / "hydrology" / "hydrology-graph.json").read_text())


def _labels(S):
    return decode_ids(np.asarray(Image.open(WATER_DIR / S.meta["surface"]["idFile"]).convert("RGB")))


def test_every_graph_body_above_the_sea_is_drawn_at_its_recorded_level(S):
    """A graph body with a level over the sea's is realised as ITS entity at
    ITS level: never as the sea, never at 0. (Round 1: the 1.07 km² swamp
    `body.1209-3032`, recorded at 0.84 m, drawn as sea at 0.)"""
    lbl2 = _labels(S)
    label_of = {e["id"]: i + 1 for i, e in enumerate(S.meta["entities"])}
    graph = _graph()
    submerged = set(S.meta["stats"]["bodies"].get("submerged", []))
    wrong = []
    checked = 0
    for b in graph["bodies"]:
        if b["kind"] == "ocean" or b.get("deepestCell") is None or b.get("lostAtCarve") or b["levelM"] <= 0.05:
            continue
        if b.get("captured") and float(b["terrainPrecondition"].get("channelLevelM", 1e9)) <= 0.05:
            continue  # the river through it is the sea's water, by the graph's own record
        if b["areaM2"] < 2000:
            continue
        # a body the graph's raster puts INSIDE a higher body's flood is that
        # body's water, not its own (stats.bodies.submerged)
        if b["id"] in submerged:
            continue
        cx, cy = int(b["deepestCell"][0] * RAW_M / S.mpp2), int(b["deepestCell"][1] * RAW_M / S.mpp2)
        if not S.wet2[cy, cx]:
            continue
        checked += 1
        # Keyed to the body's OWN texels, not to the one texel over its deepest
        # cell: the export registration (texel i = refined sample 2i+1) means a
        # 2x2 block straddling a reach can put a neighbouring sample under that
        # cell. No texel at all is the round-1 defect (the body drawn as the
        # ocean), so that is the failure, not a skip.
        ys, xs = np.nonzero(lbl2 == label_of.get(b["id"], -1))
        if ys.size == 0:
            wrong.append((b["id"], b["kind"], b["levelM"], "no texels", None))
            continue
        lv = S.w2[ys, xs].astype(np.float64)
        d = np.hypot(xs * S.mpp2 + S.mpp2 / 2.0 - b["deepestCell"][0] * RAW_M,
                     ys * S.mpp2 + S.mpp2 / 2.0 - b["deepestCell"][1] * RAW_M).min()
        if (abs(float(np.median(lv)) - b["levelM"]) > 0.06
                or float(lv.max() - lv.min()) > 0.02 or d > 25.0):
            wrong.append((b["id"], b["kind"], b["levelM"], round(float(np.median(lv)), 3),
                          round(float(lv.max() - lv.min()), 3), round(float(d), 1)))
    assert checked > 180  # 197 measured 2026-09-14
    assert not wrong, f"{len(wrong)} graph bodies drawn as something else: {wrong[:6]}"
    assert S.meta["stats"].get("bodiesDrawnAsSea") == []


def test_the_sea_is_coast_or_estuary_never_lake(S):
    """Every texel of `body.ocean` carries the coast or estuary class; no lake
    or marsh texel belongs to the ocean. (Round 1 classed fresh sea cells as
    lake — the class whose standing-wave blend made the whole sea rise,
    fall and foam in unison.)"""
    lbl2 = _labels(S)
    n3 = S.cls.shape[0]
    idx = np.clip((((np.arange(n3) + 0.5) * (S.meta["klass"]["metresPerPixel"]) / S.mpp2) - 0.5).round().astype(int), 0, lbl2.shape[0] - 1)
    ocean3 = lbl2[np.ix_(idx, idx)] == 1
    coast, estuary, lake, marsh = (S.meta["klass"]["classes"].index(c) for c in ("coast", "estuary", "lake", "marsh"))
    on_ocean = S.cls[ocean3]
    assert on_ocean.size > 10000
    bad = np.isin(on_ocean, [lake, marsh]).mean()
    assert bad < 0.002, f"{bad:.4f} of the ocean's texels are classed lake/marsh"
    assert (np.isin(on_ocean, [coast, estuary]) | (on_ocean == 0)).mean() > 0.998


def test_inland_water_carries_no_open_sea_fetch(S):
    """The fetch (water-flow.png B) is measured inside the sea and inside the
    inland water separately: no lake, marsh or river texel reads an ocean
    fetch. (Round 1: the swamp at 1.83/4.84 read 58 km.)"""
    flow = np.asarray(Image.open(WATER_DIR / "water-flow.png").convert("RGB")).astype(np.float32)
    fetch = (flow[..., 2] / 255.0) ** 2 * float(S.meta["flow"]["fetchMaxM"])
    lbl2 = _labels(S)
    n3 = fetch.shape[0]
    idx = np.clip((((np.arange(n3) + 0.5) * float(S.meta["flow"]["metresPerPixel"]) / S.mpp2) - 0.5).round().astype(int), 0, lbl2.shape[0] - 1)
    l3 = lbl2[np.ix_(idx, idx)]
    ent = S.meta["entities"]
    inland = np.zeros(len(ent) + 1, dtype=bool)
    for i, e in enumerate(ent, start=1):
        inland[i] = e["id"] != "body.ocean" and e["kind"] != "lagoon"
    # (one texel in from the sea: the class grid resamples the id grid)
    inland_m = ndimage.binary_erosion(inland[l3] & (l3 > 0), structure=np.ones((3, 3), bool))
    on_inland = fetch[inland_m]
    assert on_inland.size > 1000
    assert on_inland.max() < 3000.0, f"inland fetch up to {on_inland.max():.0f} m"
    assert np.median(fetch[l3 == 1]) > 10000.0


def test_salinity_only_on_the_graphs_tidal_water(S):
    """The class raster's salinity (the runtime's tide response) is zero on
    every entity that is not the ocean, a lagoon or a tidal reach."""
    lbl2 = _labels(S)
    n3 = S.cls.shape[0]
    idx = np.clip((((np.arange(n3) + 0.5) * (S.meta["klass"]["metresPerPixel"]) / S.mpp2) - 0.5).round().astype(int), 0, lbl2.shape[0] - 1)
    l3 = lbl2[np.ix_(idx, idx)]
    graph = _graph()
    tidal_reach = {r["id"] for r in graph["reaches"] if r.get("tidal")}
    ent = S.meta["entities"]
    fresh = np.zeros(len(ent) + 1, dtype=bool)
    for i, e in enumerate(ent, start=1):
        fresh[i] = e["id"] != "body.ocean" and e["kind"] != "lagoon" and e["id"] not in tidal_reach
    sal = S.sal[fresh[l3] & (l3 > 0)]
    assert sal.size > 1000
    assert (sal > 0.02).mean() < 0.01, f"{(sal > 0.02).mean():.4f} of fresh texels carry salinity"


def test_plunge_bowls_are_the_fields_water(S):
    """The plunge pool under a fall is drawn by the field (owner 0 at the
    bowl's centre), never stamped as fall footprint (255) or strip (128):
    round 1 stamped the bowl 255 and the pool had no surface from outside."""
    bad = []
    for c in S.meta["cascades"]:
        dx, dz = c["direction"]["x"], c["direction"]["z"]
        bx = c["plunge"]["x"] + dx * c["throwM"]
        bz = c["plunge"]["z"] + dz * c["throwM"]
        ty, tx = S.tex(bx, bz)
        win = S.owner2[max(ty - 1, 0):ty + 2, max(tx - 1, 0):tx + 2]
        wet = S.wet2[max(ty - 1, 0):ty + 2, max(tx - 1, 0):tx + 2]
        if wet.any() and (win[wet] == 0).mean() < 0.5:
            bad.append((c["id"], int(win.max()), round(float((win[wet] == 0).mean()), 2)))
    assert not bad, f"{len(bad)} plunge bowls not field water: {bad}"


# Measured on the patched ground, 2026-09-14 final chain run: 2,995 texels on
# this test's own mask (meta hoveringTexels2017, a narrower mask, reads 1,240).
# Round 1 measured 4,240 on this same rule because its lateral sheets flooded
# the ground beside every river and gave those neighbours a level, hiding the
# holes; with the sheets bounded to the map's wet-season line the count is
# honest, and the residue is water beside ground no entity claims.
HOVERING_TEXEL_FLOOR = 3000


def test_hovering_texels_are_under_the_floor(S):
    """A wet texel standing more than 0.5 m over a dry 8-neighbour's ground
    is a plate the field draws in the air (the owner's hovering shards). Cliff
    brinks (fall footprint) are the water's edge over the drop it falls down
    and are excluded. Held at the measured floor so a regression fails."""
    g2 = S.w2 - S.depth2
    gmin = ndimage.minimum_filter(np.where(S.wet2, np.inf, g2).astype(np.float32), size=3, mode="nearest")
    hover = S.wet2 & np.isfinite(gmin) & (S.w2 - gmin > 0.5)
    brink = ndimage.binary_dilation(S.owner2 == 255, iterations=2)
    n = int((hover & ~brink).sum())
    assert n <= HOVERING_TEXEL_FLOOR, f"{n} hovering texels (floor {HOVERING_TEXEL_FLOOR})"


def test_site_110_3040_river_meets_its_lake_at_the_lakes_level(S):
    """The riffle at 0.11 km E 3.04 km S ends at the level of the marsh body it
    enters (`ramp_mouths`); round 1 left a 0.52 m wall there."""
    ends = [c for c in S.meta["channels"] if c["reachId"] == "reach.95-1657"]
    assert ends, "the riffle reach.95-1657 has no strip"
    pts = ends[-1]["points"]
    last = pts[-1]
    ty, tx = S.tex(105.0, 3036.0)
    lake = float(S.w2[ty, tx])
    assert S.wet2[ty, tx]
    assert abs(last["y"] - lake) < 0.1, (last["y"], lake)
    # the JOIN point already sat at the field's level on the round-1 rasters,
    # so the wall showed at the last point before it (round 1: 0.52 m over the lake)
    free = [p for p in pts if p["kind"] != "join"]
    assert free, "the strip is all join points"
    assert free[-1]["y"] - lake < 0.35, (free[-1]["y"], lake)
