"""The freeze gate: does the frozen array keep every promise the graph makes?

    python3 -m worldgen.terrain_preconditions          # report on the vault's frozen base

Every reach and body in `hydrology-graph.json` carries a `terrainPrecondition`
(world/sources/hydrology/README.md). `violations()` reads the FROZEN array and
the graph — nothing from the carve's own bookkeeping — and returns one line
per unmet promise. `test_terrain_preconditions.py` runs it on the shipped
data (skipped where the vault is absent) and proves on synthetic worlds that
every kind of promise can fail (Phase 16b: a gate is trusted only after it
has failed on a real defect).

Tolerances are the carve's own quantisation: a bed is sampled on a 1.83 m
lattice and the graph rounds to centimetres.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from scipy import ndimage

from .scale import RAW_M

BED_TOL_M = 0.15          # a bed may sit this much above its promise (lattice + rounding)
SPILL_TOL_M = 0.10        # a body's spill may move this much
FLOOR_TOL_M = 0.05        # a floor is never raised; a hair of tolerance for rounding
FALL_DROP_FRAC = 0.8      # the face must deliver at least this share of the promised drop
SHOULDER_TOL_M = 0.35     # the sealing shoulder may sit this much under its crest
ISLAND_TOL_M = 0.5
CLIFF_FOOT_M = 6.0        # shaped ground this far under the water beside a channel is a cliff foot, not a bank
RING_MARGIN_M = 1.0       # centreline points are lattice-snapped; the ring keeps clear of the blend zone
CHANNEL_SLACK_M = 1.5     # channels.raster_fields calls a cell inside the width up to half + 0.5 x mpp; a station's
                          # width varies +-1 m about the reach's recorded maximum; plus lattice
FALL_SLOPE_TOL = 0.9      # the mean face slope may fall this far short of the rule (lattice sampling)


def _cells(points_m, shape, mpp):
    pts = np.asarray(points_m, dtype=np.float64) / mpp
    xs = np.clip(np.round(pts[:, 0]).astype(int), 0, shape[1] - 1)
    ys = np.clip(np.round(pts[:, 1]).astype(int), 0, shape[0] - 1)
    return ys, xs


def _disc_min(h, y, x, radius_m, mpp):
    r = max(int(np.ceil(radius_m / mpp)), 1)
    y0, y1 = max(y - r, 0), min(y + r + 1, h.shape[0])
    x0, x1 = max(x - r, 0), min(x + r + 1, h.shape[1])
    win = h[y0:y1, x0:x1]
    yy, xx = np.mgrid[y0:y1, x0:x1]
    inside = np.hypot(yy - y, xx - x) * mpp <= radius_m
    return float(win[inside].min()) if inside.any() else float(h[y, x])


def _ring_min(h, y, x, r_in_m, r_out_m, mpp, exclude=None):
    """Lowest ground in the ring; `exclude` (a bool grid) masks out the
    channel cells of every reach, so a neighbouring station's trench is not
    mistaken for a gap in this station's shoulder."""
    r = max(int(np.ceil(r_out_m / mpp)), 1)
    y0, y1 = max(y - r, 0), min(y + r + 1, h.shape[0])
    x0, x1 = max(x - r, 0), min(x + r + 1, h.shape[1])
    win = h[y0:y1, x0:x1]
    yy, xx = np.mgrid[y0:y1, x0:x1]
    d = np.hypot(yy - y, xx - x) * mpp
    ring = (d > r_in_m) & (d <= r_out_m)
    if exclude is not None:
        ring &= ~exclude[y0:y1, x0:x1]
    return float(win[ring].min()) if ring.any() else np.inf


def _ring_index(h, y, x, r_in_m, r_out_m, mpp, exclude):
    """Absolute (rows, cols) of the ring's cells, channel and water excluded."""
    r = max(int(np.ceil(r_out_m / mpp)), 1)
    y0, y1 = max(y - r, 0), min(y + r + 1, h.shape[0])
    x0, x1 = max(x - r, 0), min(x + r + 1, h.shape[1])
    yy, xx = np.mgrid[y0:y1, x0:x1]
    d = np.hypot(yy - y, xx - x) * mpp
    ring = (d > r_in_m) & (d <= r_out_m) & ~exclude[y0:y1, x0:x1]
    return yy[ring], xx[ring]


def _ring_cells(h, y, x, r_in_m, r_out_m, mpp, exclude):
    """The ground values in the ring, channel and water cells excluded."""
    r = max(int(np.ceil(r_out_m / mpp)), 1)
    y0, y1 = max(y - r, 0), min(y + r + 1, h.shape[0])
    x0, x1 = max(x - r, 0), min(x + r + 1, h.shape[1])
    yy, xx = np.mgrid[y0:y1, x0:x1]
    d = np.hypot(yy - y, xx - x) * mpp
    ring = (d > r_in_m) & (d <= r_out_m) & ~exclude[y0:y1, x0:x1]
    return np.asarray(h[y0:y1, x0:x1])[ring]


def _densify(ys, xs):
    """The centreline at one-sample spacing (the graph stores it every ~5.5 m;
    a 70-degree face is narrower than that)."""
    oy, ox = [], []
    for (y0, x0), (y1, x1) in zip(zip(ys, xs), zip(ys[1:], xs[1:])):
        n = int(max(abs(y1 - y0), abs(x1 - x0))) + 1
        oy.append(np.linspace(y0, y1, n, endpoint=False)); ox.append(np.linspace(x0, x1, n, endpoint=False))
    oy.append(np.array([ys[-1]])); ox.append(np.array([xs[-1]]))
    return np.round(np.concatenate(oy)).astype(int), np.round(np.concatenate(ox)).astype(int)


def station_levels(graph: dict, shape, mpp: float):
    """(cKDTree over every reach's densified centreline, level per point):
    the carve's shoulder crest follows the NEAREST station's water level,
    which beside a junction, a lower neighbour or a body's groove is not this
    reach's level."""
    from scipy.spatial import cKDTree
    pts, lv = [], []
    for r in graph["reaches"]:
        line = r.get("centreline") or []
        if not line or r.get("surface") == "fall":
            continue
        ys, xs = _densify(*_cells(line, shape, mpp))
        n = len(ys)
        # the reach's END level: a lower bound of the true L(s) along it (the
        # profile is a running minimum with steps, not a line), so the check
        # never fails a crest the carve built to a level above this
        pts.append(np.stack([ys, xs], 1))
        lv.append(np.full(n, float(r["levelToM"])))
    if not pts:
        return None, None
    return cKDTree(np.concatenate(pts)), np.concatenate(lv)


def channel_mask(graph: dict, shape, mpp: float) -> np.ndarray:
    """Every cell inside some reach's width."""
    out = np.zeros(shape, bool)
    for r in graph["reaches"]:
        pre = r.get("terrainPrecondition") or {}
        if pre.get("kind") not in ("trench", "weir", "in-body") or not r.get("centreline"):
            continue          # (a pooled reach through a body is trenched too: a groove under the lake)
        ys, xs = _densify(*_cells(r["centreline"], shape, mpp))
        wmax = float(pre.get("widthMaxM", r.get("widthM", pre.get("widthM", 2.0)))) * 0.5 + 0.5 * mpp + CHANNEL_SLACK_M
        rr = max(int(np.ceil(wmax / mpp)), 1)
        yy, xx = np.mgrid[-rr:rr + 1, -rr:rr + 1]
        disc = np.hypot(yy, xx) * mpp <= wmax
        for y, x in zip(ys, xs):
            y0, y1 = max(y - rr, 0), min(y + rr + 1, shape[0])
            x0, x1 = max(x - rr, 0), min(x + rr + 1, shape[1])
            out[y0:y1, x0:x1] |= disc[y0 - (y - rr):y1 - (y - rr), x0 - (x - rr):x1 - (x - rr)]
    return out


def violations(h: np.ndarray, graph: dict, sea: np.ndarray, mpp: float = RAW_M,
               filled: np.ndarray | None = None, shaped: np.ndarray | None = None,
               level: np.ndarray | None = None) -> list[str]:
    """Every unmet terrain precondition on `h`. `sea` is the drain for the
    spill check (the standing-water solver's own sea mask); `filled` may be
    passed precomputed; `shaped` (the pre-carve ground) and `level` (the
    frozen flood level, -inf dry) enable the shoulder check, whose promise is
    conditional on both: the shoulder seals to the crest wherever the shaped
    ground lay within `sealCapM` of it, and never inside standing water."""
    from .standing_water import priority_fill
    errs: list[str] = []
    shape = h.shape
    bodies = {b["id"]: b for b in graph["bodies"]}
    reach_by_id = {r["id"]: r for r in graph["reaches"]}
    if filled is None:
        filled = priority_fill(h, sea)
    in_channel = channel_mask(graph, shape, mpp)
    st_tree, st_level = station_levels(graph, shape, mpp) if shaped is not None else (None, None)
    if level is not None:
        in_channel |= np.isfinite(level) | sea
    # plunge bowls are dug in the lip's own ring: not a shoulder gap
    for b in graph["bodies"]:
        pre_b = b.get("terrainPrecondition") or {}
        if pre_b.get("kind") == "plunge-bowl" and b.get("deepestCell"):
            x, y = int(b["deepestCell"][0]), int(b["deepestCell"][1])
            rr = int(np.ceil(float(pre_b["radiusM"]) * 1.5 / mpp)) + 1
            in_channel[max(y - rr, 0):y + rr + 1, max(x - rr, 0):x + rr + 1] = True
    for r in graph["reaches"]:
        pre = r.get("terrainPrecondition") or {}
        kind = pre.get("kind")
        line = r.get("centreline") or []
        if not line:
            continue
        ys, xs = _cells(line, shape, mpp)
        if kind in ("trench", "weir"):
            half = float(pre["widthM"]) * 0.5
            beds = np.array([_disc_min(h, y, x, half, mpp) for y, x in zip(ys, xs)])
            if kind == "trench":
                top = float(pre.get("bedMaxM", pre["bedLevelFromM"])) + BED_TOL_M
                if (beds > top).any():
                    k = int(np.argmax(beds > top))
                    errs.append(f"{r['id']}: trench bed {beds[k]:.2f} m above its promise {pre.get('bedMaxM', pre['bedLevelFromM'])} at point {k}")
                # a reach ending at a weir ends on the weir: its last disc holds
                # the sill (the lake level), which the carve raises on purpose
                dn = reach_by_id.get(r.get("downstream")) if r.get("downstream") else None
                dn_pre = (dn or {}).get("terrainPrecondition") or {}
                # ...and a reach ending at a junction shares its last cells with the
                # trunk's first station, whose bed (a sill after a pooled run, a
                # different depth) is the trunk's promise, not this reach's
                end_allow = float(pre["bedLevelToM"])
                if dn_pre.get("kind") in ("weir", "trench"):
                    end_allow = max(end_allow, float(dn_pre["bedLevelFromM"]))
                if beds[-1] > end_allow + BED_TOL_M:
                    errs.append(f"{r['id']}: trench end bed {beds[-1]:.2f} m above {end_allow:.2f}")
            else:
                # a weir: somewhere along it the bed stands AT the lake level (the
                # sill), and nowhere above it (the reach also carries the groove
                # under the lake before the sill and the ramp after it)
                sill = float(pre["bedLevelFromM"])
                centre = h[ys, xs].astype(np.float64)       # the sill is held on the centreline band
                if abs(float(centre.max()) - sill) > SHOULDER_TOL_M:
                    errs.append(f"{r['id']}: weir bed tops out at {float(centre.max()):.2f} m, not at the lake level {sill}")
            crest = pre.get("shoulderCrestM")
            if crest is not None and r.get("surface") != "body" and shaped is not None:
                from .channels import SHOULDER_CREST_M, SHOULDER_RAISE_CAP_M
                # the carve's guarantee at EVERY station is the plain cap (a
                # steep or sill station may get more, never less); the ring
                # stops short of the crest zone's edge by the centreline's
                # own rounding (points every ~5.5 m, snapped to the lattice)
                cap = float(SHOULDER_RAISE_CAP_M)
                half_max = float(pre.get("widthMaxM", pre["widthM"])) * 0.5 + 0.5 * mpp + CHANNEL_SLACK_M
                r_out = float(pre.get("widthMaxM", pre["widthM"])) * 0.5 + SHOULDER_CREST_M - RING_MARGIN_M
                # the crest follows the NEAREST station's level (any reach); the
                # ring is about one sample wide, so walk every sample of the line
                lvl_low = float(r["levelToM"])
                dys, dxs = _densify(ys, xs)
                for k, (y, x) in enumerate(zip(dys, dxs)):
                    cells = _ring_index(h, y, x, half_max, r_out, mpp, in_channel)
                    if cells[0].size == 0:
                        continue
                    ring_h = h[cells]
                    ring_s = np.asarray(shaped)[cells]
                    _d, idx = st_tree.query(np.stack([cells[0], cells[1]], 1))
                    ln = st_level[idx]
                    want = np.minimum(ln + 0.3 - SHOULDER_TOL_M, ring_s + cap - SHOULDER_TOL_M)
                    # a cliff foot far under the water is the fall's, not a levee gap
                    bad = (ring_h < want) & (ring_s >= ln - CLIFF_FOOT_M)
                    if bad.any():
                        errs.append(f"{r['id']}: shoulder {float(ring_h[bad].min()):.2f} m sits under its seal "
                                    f"(nearest water level {float(ln[bad][np.argmin(ring_h[bad])]):.2f}) at point {k}")
                        break
        elif kind == "in-body":
            b = bodies.get(pre.get("bodyId"))
            if b is None:
                errs.append(f"{r['id']}: in-body {pre.get('bodyId')} unknown")
                continue
            mid = len(ys) // 2
            floor = _disc_min(h, ys[mid], xs[mid], max(float(r.get("widthM", 2.0)) * 0.5, mpp), mpp)
            if floor > float(b["levelM"]) + FLOOR_TOL_M:
                errs.append(f"{r['id']}: in {b['id']} but the ground {floor:.2f} m stands over its level {b['levelM']}")
        elif kind == "fall-face":
            ys, xs = _densify(ys, xs)
            prof = h[ys, xs].astype(np.float64)
            arc = np.concatenate([[0.0], np.cumsum(np.hypot(np.diff(ys), np.diff(xs)) * mpp)])
            drop = float(prof[0] - prof.min())
            if drop < FALL_DROP_FRAC * float(pre["dropM"]):
                errs.append(f"{r['id']}: fall face drops {drop:.2f} m, promised {pre['dropM']}")
            if len(prof) > 1:
                k_lo = int(np.argmin(prof))
                run = max(float(arc[k_lo] - arc[0]), mpp)
                mean_slope = drop / run
                if mean_slope < FALL_SLOPE_TOL * float(pre["faceMinSlope"]):
                    errs.append(f"{r['id']}: fall face mean slope {mean_slope:.2f} under {pre['faceMinSlope']}")
    for b in graph["bodies"]:
        pre = b.get("terrainPrecondition") or {}
        kind = pre.get("kind")
        cell = b.get("deepestCell")
        if kind == "sea" or cell is None:
            continue
        x, y = int(cell[0]), int(cell[1])
        if kind == "bowl":
            if h[y, x] > float(pre["floorMaxM"]) + FLOOR_TOL_M:
                errs.append(f"{b['id']}: floor {h[y, x]:.2f} m raised above {pre['floorMaxM']}")
            # the rim holds the body's level: the fill at its deepest cell is at
            # least the level (the solver may CAP a level under the spill, so
            # equality is not the promise)
            spill = 0.0 if sea[y, x] else float(filled[y, x])
            if spill < float(pre["levelM"]) - SPILL_TOL_M:
                errs.append(f"{b['id']}: rim cut — spills at {spill:.2f} m, under its level {pre['levelM']}")
        elif kind == "captured":
            # drained to the trench through it: its floor was never raised (the
            # trench bed's own promise is the reach's); a body above a sea-level
            # channel is simply dry ground now
            if h[y, x] > max(float(pre["levelM"]), float(pre["channelLevelM"])) + FLOOR_TOL_M:
                errs.append(f"{b['id']}: captured body's floor {h[y, x]:.2f} m raised above its level {pre['levelM']}")
        elif kind == "plunge-bowl":
            floor = _disc_min(h, y, x, float(pre["radiusM"]) * 0.5, mpp)
            want = float(pre["levelM"]) - float(pre["depthM"])
            if floor > want + BED_TOL_M:
                errs.append(f"{b['id']}: plunge bowl floor {floor:.2f} m above {want:.2f} (level {pre['levelM']} - depth {pre['depthM']})")
        elif kind == "authored-bowl":
            rx, ry = (float(v) for v in pre["radiiM"])
            px_ = min(x + int(0.75 * rx / mpp), shape[1] - 1)
            spill = 0.0 if sea[y, px_] else float(filled[y, px_])
            if abs(spill - float(pre["levelM"])) > 0.3:
                errs.append(f"{b['id']}: authored lake stands at {spill:.2f} m, declared {pre['levelM']}")
            floor = _disc_min(h, y, px_, 0.3 * rx, mpp)
            if floor > float(pre["bedM"]) + 0.3:
                errs.append(f"{b['id']}: authored lake bed {floor:.2f} m above {pre['bedM']}")
            isl = pre.get("island") or {}
            if isl.get("topM") is not None:
                rr = int(np.ceil((float(isl["radiusM"]) + 20.0) / mpp))       # offset up to 20 m from centre
                top = float(h[max(y - rr, 0):y + rr + 1, max(x - rr, 0):x + rr + 1].max())
                if top < float(isl["topM"]) - ISLAND_TOL_M:
                    errs.append(f"{b['id']}: island top {top:.2f} m under {isl['topM']}")
    st = graph.get("stats", {})
    if st.get("suspectFalls", 0):
        errs.append(f"graph: {st['suspectFalls']} suspect (coastal-terrace-step) falls remain")
    return errs


KNOWN_PATH = Path(__file__).resolve().parents[3] / "world" / "sources" / "terrain" / "freeze-gate-known.json"


def known_leftovers() -> dict[str, str]:
    """Violations the freeze accepted by name, each with its reason and the
    chunk that owns it (the repo's known-red pattern); the gate prints them
    and fails on anything else."""
    if not KNOWN_PATH.exists():
        return {}
    doc = json.loads(KNOWN_PATH.read_text(encoding="utf-8"))
    return {row["id"]: row for row in doc.get("known", [])}


def unexpected(errs: list[str]) -> list[str]:
    known = known_leftovers()
    return [e for e in errs if e.split(":")[0] not in known]


def province_violations() -> list[str]:
    """The gate on the vault's frozen base, with every input it needs."""
    from . import freeze
    from . import hydrology_graph as hg
    from .carve_province import FROZEN_PATH
    from .standing_water import sea_mask
    from .vault import HEIGHTFIELD_DIR as vault
    h = np.load(FROZEN_PATH)
    graph = json.loads(hg.GRAPH_PATH.read_text(encoding="utf-8"))
    npz = np.load(vault / "hydrology-pass1.npz")
    shaped = np.load(vault / freeze.SHAPED)
    z = np.load(vault / hg.BODIES_FILE)
    return violations(h, graph, sea_mask(h, npz["ocean"], 3), shaped=shaped, level=z["level"])


def main() -> int:
    errs = province_violations()
    known = known_leftovers()
    bad = unexpected(errs)
    for e in errs[:60]:
        tag = "KNOWN" if e.split(":")[0] in known else "FAIL"
        print(f"{tag} {e}")
    print(f"terrain preconditions: {len(errs)} violations, {len(bad)} unexpected, {len(errs) - len(bad)} known (freeze-gate-known.json)")
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
