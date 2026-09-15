"""Author the owner-approved water corrections as typed terrain patches (16c).

    python3 -m worldgen.author_terrain_patches water-corrections           # rewrite the bed-cut / levee patches
    python3 -m worldgen.author_terrain_patches water-corrections --prove DIR/refined-height-f32.npy

Input: `world/sources/terrain/water-corrections.json` (the owner's approved
rows), the compiler's own full-res census (`<vault>/water-pass1.npz`:
`w_full`, `chan_full`, `body_full`, `body_levels`, `sea_full`), the vault's
channel solution (`province-refined/channels-pass1.npz`) plus the graph's
terrain-stage feeders, and the natural ground the census ran on. The two
census rules are copied from `compile_water.compute` § 7 so a patch fixes
exactly what the compile counts:

  bed over level   live station whose ground stands > level + 0.01
  perched          a free (non-pooled) live station nearest to a wet channel
                   cell (outside any body and the sea) whose water stands
                   > PERCHED_DROP_M (0.3) over a dry 8-neighbour's ground

Re-run after every water compile (the perched set follows the compiler);
the output is deterministic for a given census (patches ordered by reach id
then station). Bed-cuts are authored ONLY at the approved sites; any other
bed-over-level run the census reports is printed as unapproved.

Authoring is CUMULATIVE, because the census is measured on the ground the
patches already moved: a defect a patch fixed no longer appears in the
census, so authoring from the census alone would drop that patch and let the
defect come back on the next chain pass. So the approved bed-cut sites are
always authored, and an existing levee (bank or rim) is kept and its stations
or cells unioned with the new census's, never dropped unless `--prune` is
given.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from scipy import ndimage

from . import terrain_patches as tp
from .channels import CREST_REACH_M, KIND_FALL, SHOULDER_BLEND_M, STEEP_RAISE_CAP_M
from .scale import RAW_M

CORRECTIONS_PATH = tp.REPO_ROOT / "world" / "sources" / "terrain" / "water-corrections.json"
WATER_META_PATH = tp.REPO_ROOT / "apps" / "world-studio" / "public" / "province" / "water" / "water-meta.json"
BED_OVER_TOL_M = 0.01           # compile_water: `g > sol.L + 0.01`
PERCHED_OVER_M = 0.3            # compile_water.PERCHED_DROP_M: `low_dry < W - 0.3`
CUT_MIN_DEPTH_M = 0.15          # a cut bed sits this far under its level: enough to hold water (the depth
                                # raster quantises at 0.12 m), shallow enough not to drop a sill below a
                                # neighbouring body and let THAT body drain along it (owner 2026-09-14)
AMPLITUDE_MARGIN_M = 0.25       # maxDeltaM = the measured need on the FROZEN base plus this
ORDER = 2                       # after the poling channels (0) and the places' requests (1)
LEVEE_MAX_RAISE_M = STEEP_RAISE_CAP_M   # 4.5 m, the carve's own largest shoulder cap: a bank taller than this
                                        # is a dam, and a station whose band needs more stands on a cliff
                                        # edge (the compile's perched rule sees the drop below the brink) —
                                        # no bank the ground can grow seals it; listed `unsealable`


class Census:
    """The compiler's census re-read at full resolution, station by station."""

    def __init__(self, vault: Path, graph_path: Path | None = None):
        from . import channels as ch
        from .carve_province import VAULT_DIR
        from .compile_chunks import DEFAULT_HEIGHTS
        from .compile_water import GRAPH_PATH, append_feeders, reconcile_pooled, station_reach_ids   # lazy: the compile is heavy
        sol = ch.ChannelSolution.load(VAULT_DIR / "channels-pass1.npz")
        self.n_vault = sol.n
        self.graph = json.loads((graph_path or GRAPH_PATH).read_text(encoding="utf-8"))
        # Size every patch against the FROZEN base, because that is what
        # `apply_terrain_patches` starts from. Measuring against the natural
        # (already-patched) ground under-declared `maxDeltaM` wherever an
        # earlier pass had already raised a bank: the authoring saw only the
        # residual need, the apply needed the whole raise, and the amplitude
        # invariant refused 8 of 96 levees (2026-09-14).
        from . import freeze as _freeze
        frozen = DEFAULT_HEIGHTS.parent / _freeze.FROZEN
        self.ground = np.load(frozen if frozen.exists() else DEFAULT_HEIGHTS)
        sol, feeder_names = append_feeders(sol, self.graph, self.ground)
        self.sol = sol
        self.reach_ids = station_reach_ids(sol, self.graph, feeder_names)
        self.reach_rec = {r["id"]: r for r in self.graph["reaches"]}
        body_rec = {b["id"]: b for b in self.graph["bodies"]}
        z = np.load(vault / "water-pass1.npz")
        self.frozen_sha = str(z["frozen_sha256"])
        n = self.ground.shape[0]
        self.iy = np.clip(np.round(sol.y).astype(int), 0, n - 1)
        self.ix = np.clip(np.round(sol.x).astype(int), 0, n - 1)
        iy, ix = self.iy, self.ix
        self.live = (~sol.lost) & (sol.kind != KIND_FALL)
        chan = np.asarray(z["chan_full"])
        body = np.asarray(z["body_full"])
        sea = np.asarray(z["sea_full"])
        levels = np.asarray(z["body_levels"]).astype(np.float32)
        w = np.asarray(z["w_full"])
        in_body = body > 0
        # the level the census compares the bed to: the profile after the
        # pooled runs were reconciled to the bodies the compile flooded
        # (compile_water.compute § 2b, the same call on the same arrays)
        from types import SimpleNamespace
        flood = SimpleNamespace(body=body, levels=levels, g=self.ground)
        self.reconciled = reconcile_pooled(sol, flood, sea, self.reach_ids, self.reach_rec, body_rec)
        self.level = sol.L.astype(np.float32)
        # ...unless the compile published the level it censused with, station
        # by station (`st_level` in water-pass1.npz, same station order): then
        # that is the census, mouth ramps and all, and nothing is re-derived
        self.published_census = "st_level" in z.files and len(z["st_level"]) == sol.n
        if self.published_census:
            self.level = np.asarray(z["st_level"]).astype(np.float32)
        self.bed_over = self.live & (self.ground[iy, ix] > self.level + BED_OVER_TOL_M)
        wet = np.asarray(z["wet_full"])
        low_dry = ndimage.minimum_filter(np.where(wet, np.inf, self.ground).astype(np.float32), size=3, mode="nearest")
        perched_cell = chan & ~in_body & ~sea & wet & np.isfinite(low_dry) & (low_dry < w - PERCHED_OVER_M)
        del low_dry
        near = ch.raster_fields(sol, self.ground.shape)["near"]
        self.perched = np.zeros(sol.n, dtype=bool)
        self.perched[np.unique(near[perched_cell & (near >= 0)])] = True
        self.perched &= self.live & ~sol.pooled
        del perched_cell
        # kept for `prove`: the compile's own W / wet / width / nearest station
        self.w, self.wet, self.near, self.free_chan = w, wet, near, chan & ~in_body & ~sea
        if self.published_census and "st_perched" in z.files:
            self.perched = np.asarray(z["st_perched"]).astype(bool)
        if self.published_census and "st_bed_over" in z.files:
            self.bed_over = np.asarray(z["st_bed_over"]).astype(bool)
        self.in_width = chan
        del chan, body, sea
        # the widths the patch machinery reads (invariant 3, apply_levee):
        # the author and the applier must agree on what "inside a width" is
        self.ctx = tp.context_from_vault(vault)

    def masks(self, y0: int, y1: int, x0: int, x1: int):
        return self.ctx.channel_masks((y0, y1, x0, x1))[0]

    def runs(self, flag: np.ndarray) -> dict[str, list[int]]:
        """Flagged stations grouped as the compile groups them: by channel
        reach, named by the graph reach id of the run's first station."""
        out: dict[str, list[int]] = {}
        for r in np.unique(self.sol.reach[flag]):
            sl = self.sol.stations_of(int(r))
            ks = [int(k) for k in np.flatnonzero(flag[sl]) + sl.start]
            rid = self.reach_ids[ks[0]]
            if rid is not None:
                out.setdefault(rid, []).extend(ks)
        return out


# ---------------------------------------------------------------- bed-cuts

def _station_record(c: Census, k: int, mpp: float) -> dict:
    sol = c.sol
    L_census = float(c.level[k])
    if k < c.n_vault:
        L = min(float(sol.L[k]), L_census)
        weir = bool(sol.sill[k]) and float(sol.ramp[k]) <= 0.0 and L > 0.0
        bed = L - float(sol.depth_cut[k]) * float(sol.ramp[k])
    else:
        # a terrain-stage feeder: the graph's promise is its graded bed, at or
        # under bedMaxM everywhere (decision 0060 §2: the outlet spills from the lake)
        rec = c.reach_rec.get(c.reach_ids[k]) or {}
        pre = rec.get("terrainPrecondition") or {}
        L = L_census
        weir = False
        bed = min(L, float(pre.get("bedMaxM", L)))
    # A cut bed must carry water. A sill station's ramp is 0, so its promised
    # bed IS its level, and cutting a dam away to exactly the level leaves a
    # flat shelf with zero depth that draws dry — the owner found 60 m of that
    # at the Blackrose lake's south outlet (2026-09-14), which is the "dry
    # stretch" 0063 §3 says a sill must never become. A cut therefore goes at
    # least CUT_MIN_DEPTH_M under the level. This cannot drain the lake: every
    # level comes from the graph record, never from the ground.
    bed = min(bed, L - CUT_MIN_DEPTH_M)
    return {"k": int(k), "x": round(float(sol.x[k]), 2), "y": round(float(sol.y[k]), 2),
            "halfWidthM": round(float(sol.width[k]) * 0.5, 2), "levelM": round(L, 3),
            "bedM": round(bed, 3), "weir": weir,
            "groundM": round(float(c.ground[c.iy[k], c.ix[k]]), 3)}


def bed_cut_patches(c: Census, spec: dict, mpp: float = RAW_M) -> tuple[list[dict], dict]:
    radius = float(spec.get("siteRadiusM", 150.0))
    over_runs = c.runs(c.bed_over)
    approved = {rid for site in spec["sites"] for rid in site["reaches"]}
    report = {"unapprovedRuns": sorted((rid, len(ks)) for rid, ks in over_runs.items() if rid not in approved),
              "sites": []}
    patches = []
    for site in sorted(spec["sites"], key=lambda s: s["id"]):
        ks_all: list[int] = []
        for rid in site["reaches"]:
            ks = [k for k in over_runs.get(rid, [])
                  if np.hypot(c.sol.x[k] * mpp - site["eastM"], c.sol.y[k] * mpp - site["southM"]) <= radius]
            if not ks:
                continue
            for r in np.unique(c.sol.reach[ks]):
                sl = c.sol.stations_of(int(r))
                mine = [k for k in ks if sl.start <= k < sl.stop]
                lo, hi = min(mine) - 1, max(mine) + 1
                ks_all += [k for k in range(max(lo, sl.start), min(hi, sl.stop - 1) + 1) if c.live[k]]
        ks_all = sorted(set(ks_all))
        report["sites"].append({"id": site["id"], "stations": len(ks_all),
                                "overStations": int(sum(c.bed_over[k] for k in ks_all))})
        if not ks_all:
            continue
        sts = [_station_record(c, k, mpp) for k in ks_all]
        bank = max(s["groundM"] for s in sts) + tp.LEVEE_FREEBOARD_M
        rmax = max(s["halfWidthM"] for s in sts)
        xs = [s["x"] * mpp for s in sts]; ys = [s["y"] * mpp for s in sts]
        patch = {
            "id": f"patch.bed-cut.{site['id']}", "kind": "bed-cut", "order": ORDER, "after": [], "crosses": [],
            "makesWater": False,
            "bboxM": [round(min(xs) - rmax, 1), round(min(ys) - rmax, 1), round(max(xs) + rmax, 1), round(max(ys) + rmax, 1)],
            "blendM": tp.BED_CUT_BLEND_M, "maxDeltaM": 1.0,
            "source": {"file": "world/sources/terrain/water-corrections.json", "site": site["id"],
                       "reaches": list(site["reaches"]), "censusFrozenSha256": c.frozen_sha},
            "params": {"blendM": tp.BED_CUT_BLEND_M, "bankM": round(bank, 3),
                       "stations": [{k: v for k, v in s.items() if k not in ("k", "groundM")} for s in sts]},
            "why": site["why"],
        }
        _size(patch, c.ground, mpp, c)
        patches.append(patch)
    return patches, report


# ------------------------------------------------------------------ levees

def published_perched_runs() -> dict[str, int] | None:
    if not WATER_META_PATH.exists():
        return None
    st = json.loads(WATER_META_PATH.read_text(encoding="utf-8")).get("stats", {})
    return {r["reach"]: int(r["stations"]) for r in st.get("perchedRuns", [])}


def _band_need(c: Census, k: int) -> float:
    """The tallest raise the station's band (both sides) needs to reach its crest."""
    sol = c.sol
    r = float(sol.width[k]) * 0.5
    crest = float(c.level[k]) + tp.LEVEE_FREEBOARD_M
    rr = int(np.ceil((r + SHOULDER_BLEND_M) / RAW_M)) + 1
    cy, cx = int(round(float(sol.y[k]))), int(round(float(sol.x[k])))
    n = c.ground.shape[0]
    y0, y1, x0, x1 = max(cy - rr, 0), min(cy + rr + 1, n), max(cx - rr, 0), min(cx + rr + 1, n)
    gy, gx = np.mgrid[y0:y1, x0:x1]
    d = np.hypot(gy - float(sol.y[k]), gx - float(sol.x[k])) * RAW_M
    band = (d >= r + tp.LEVEE_EDGE_GAP_M) & (d <= r + SHOULDER_BLEND_M) & ~c.masks(y0, y1, x0, x1)
    if not band.any():
        return 0.0
    return float(max(crest - c.ground[y0:y1, x0:x1][band].min(), 0.0))


def _chute_step(c: Census, k: int, ks: list[int], crest: dict, tree, mpp: float) -> float:
    """How far this station's crest stands above the crest of the run station
    nearest to any of its band cells (0 when none stands lower)."""
    sol = c.sol
    r = float(sol.width[k]) * 0.5
    rr = int(np.ceil((r + SHOULDER_BLEND_M) / mpp)) + 1
    cy, cx = int(round(float(sol.y[k]))), int(round(float(sol.x[k])))
    n = c.ground.shape[0]
    y0, y1, x0, x1 = max(cy - rr, 0), min(cy + rr + 1, n), max(cx - rr, 0), min(cx + rr + 1, n)
    gy, gx = np.mgrid[y0:y1, x0:x1]
    d = np.hypot(gy - float(sol.y[k]), gx - float(sol.x[k])) * mpp
    band = (d >= r + tp.LEVEE_EDGE_GAP_M) & (d <= r + SHOULDER_BLEND_M) & ~c.masks(y0, y1, x0, x1)
    if not band.any():
        return 0.0
    _, j = tree.query(np.stack([gy[band], gx[band]], 1))
    nearest = np.array([crest[ks[i]] for i in np.unique(j)])
    return float(max(crest[k] - nearest.min(), 0.0))


def levee_patches(c: Census, spec: dict, mpp: float = RAW_M) -> tuple[list[dict], dict]:
    runs = c.runs(c.perched)
    named = published_perched_runs()
    if named is not None and not c.published_census:
        # the compile's own run list is the record the owner approved; a
        # run this re-derivation finds that the compile did not is left alone
        runs = {rid: ks for rid, ks in runs.items() if rid in named}
    cap = float(spec.get("maxRaiseM", LEVEE_MAX_RAISE_M))
    patches = []
    report = {"perchedRuns": len(runs), "perchedStations": int(sum(len(v) for v in runs.values())),
              "sealable": 0, "unsealable": [], "maxRaiseM": cap}
    for rid in sorted(runs):
        sol = c.sol
        keep, drop = [], []
        ks = sorted(runs[rid])
        crest = {k: float(c.level[k]) + tp.LEVEE_FREEBOARD_M for k in ks}
        from scipy.spatial import cKDTree
        tree = cKDTree(np.array([[sol.y[k], sol.x[k]] for k in ks], dtype=np.float64))
        for k in ks:
            need = _band_need(c, k)
            # a chute step: a band cell of this station is nearest to a station
            # of the run standing more than CREST_REACH_M lower, so it never
            # reaches this crest (the carve's own cap, apply_levee) — a
            # torrent's step is no bank's to seal
            step = _chute_step(c, k, ks, crest, tree, mpp)
            if need > cap:
                drop.append((k, need, "drop"))
            elif step > CREST_REACH_M:
                drop.append((k, step, "chute-step"))
            else:
                keep.append((k, need))
        report["unsealable"] += [{"reach": rid, "eastM": round(float(sol.x[k]) * mpp), "southM": round(float(sol.y[k]) * mpp),
                                  "dropM": round(v, 2), "why": why} for k, v, why in drop]
        report["sealable"] += len(keep)
        if not keep:
            continue
        sts = [{"x": round(float(sol.x[k]), 2), "y": round(float(sol.y[k]), 2),
                "tx": round(float(sol.tx[k]), 4), "ty": round(float(sol.ty[k]), 4),
                "halfWidthM": round(float(sol.width[k]) * 0.5, 2),
                "crestM": round(float(c.level[k]) + tp.LEVEE_FREEBOARD_M, 3)} for k, _ in keep]
        reach = max(s["halfWidthM"] for s in sts) + tp.LEVEE_EDGE_GAP_M + SHOULDER_BLEND_M
        xs = [s["x"] * mpp for s in sts]; ys = [s["y"] * mpp for s in sts]
        patch = {
            "id": f"patch.levee.{rid}", "kind": "levee", "order": ORDER, "after": [], "crosses": [],
            "makesWater": False, "driesBodyCells": True,
            "bboxM": [round(min(xs) - reach, 1), round(min(ys) - reach, 1), round(max(xs) + reach, 1), round(max(ys) + reach, 1)],
            "blendM": tp.LEVEE_BLEND_M, "maxDeltaM": 1.0,
            "source": {"file": "world/sources/terrain/water-corrections.json", "reach": rid,
                       "perchedStations": len(runs[rid]), "sealed": len(keep),
                       "unsealable": [{"eastM": round(float(sol.x[k]) * mpp), "southM": round(float(sol.y[k]) * mpp),
                                       "dropM": round(v, 2), "why": why} for k, v, why in drop],
                       "censusFrozenSha256": c.frozen_sha},
            "params": {"edgeGapM": tp.LEVEE_EDGE_GAP_M, "bandM": SHOULDER_BLEND_M, "blendM": tp.LEVEE_BLEND_M,
                       "stations": sts},
            "why": f"{len(keep)} station(s) of {rid} stand over PERCHED_DROP_M above dry ground beside them (the bank "
                   f"the carve could not raise): the shoulder is raised to the crest so a bank seals the channel "
                   f"(owner 2026-09-14, option b)" + (f"; {len(drop)} station(s) unsealable by a bank (a drop over {cap} m beside "
                                                    f"the channel, or a chute step over {CREST_REACH_M} m within the band)" if drop else ""),
        }
        _size(patch, c.ground, mpp, c)
        patches.append(patch)
    return patches, report


# ------------------------------------------------------- body rim levees

def published_body_rim_leaks() -> list[dict]:
    """`stats.bodyRimLeaks` in water-meta.json: per realised graph body, the
    dry ring cells 8-adjacent to it (outside any channel width, clear of a
    fall footprint) whose ground lies under the body's level - 0.05 m."""
    if not WATER_META_PATH.exists():
        return []
    return list(json.loads(WATER_META_PATH.read_text(encoding="utf-8")).get("stats", {}).get("bodyRimLeaks", []))


def rim_levee_patches(c: Census, mpp: float = RAW_M) -> tuple[list[dict], dict]:
    """One `levee` patch per body the compile lists as leaking at its rim:
    the listed cells (and their dry under-level 8-neighbours) raised to the
    body's level + LEVEE_FREEBOARD_M, 2 m outward blend. It raises only dry
    ground outside every channel width, so it dries nothing:
    `driesBodyCells` is false."""
    leaks = published_body_rim_leaks()
    patches, report = [], {"bodies": len(leaks), "cells": 0, "unsealable": []}
    n = c.ground.shape[0]
    for leak in sorted(leaks, key=lambda r: str(r["body"])):
        level = float(leak["levelM"])
        cells = [(int(round(float(sm) / mpp)), int(round(float(em) / mpp))) for em, sm in leak.get("cellsM", [])]
        cells = [(y, x) for y, x in cells if 0 <= y < n and 0 <= x < n]
        if not cells:
            report["unsealable"].append({"body": leak["body"], "why": "no cellsM listed"})
            continue
        ys = [y for y, _ in cells]; xs = [x for _, x in cells]
        reach = 1.5 * mpp                                    # the 8-neighbour ring
        patch = {
            "id": f"patch.levee.rim.{leak['body']}", "kind": "levee", "order": ORDER, "after": [], "crosses": [],
            "makesWater": False, "driesBodyCells": False,
            "bboxM": [round(min(xs) * mpp - reach, 1), round(min(ys) * mpp - reach, 1),
                      round(max(xs) * mpp + reach, 1), round(max(ys) * mpp + reach, 1)],
            "blendM": tp.LEVEE_BLEND_M, "maxDeltaM": 1.0,
            "source": {"file": "world/sources/terrain/water-corrections.json", "body": leak["body"],
                       "bodyKind": leak.get("kind"), "leakCells": int(leak.get("cells", len(cells))),
                       "minRimM": leak.get("minRimM"), "censusFrozenSha256": c.frozen_sha},
            "params": {"levelM": round(level, 3), "blendM": tp.LEVEE_BLEND_M,
                       "cells": [[y, x] for y, x in sorted(set(cells))]},
            "why": f"{len(cells)} dry rim cell(s) of {leak['body']} ({leak.get('kind')}) stand under its "
                   f"{level:.2f} m level (the body-side hovering edge): the rim is raised to level + "
                   f"{tp.LEVEE_FREEBOARD_M} m so the sheet is held by ground (owner 2026-09-14)",
        }
        wet_listed = int(sum(bool(c.ctx.wet[y, x]) for y, x in cells))
        try:
            _size(patch, c.ground, mpp, c)
        except ValueError as e:
            why = str(e)
            if wet_listed == len(cells):
                why = (f"every listed rim cell is WET in the frozen water raster the invariants read "
                       f"(the compile calls them dry ring cells): raising them would dry frozen water, "
                       f"which a rim levee (driesBodyCells false) may not do")
            report["unsealable"].append({"body": leak["body"], "why": why, "wetListedCells": wet_listed})
            continue
        if patch["source"].get("selfCheck"):
            report["unsealable"].append({"body": leak["body"], "why": "; ".join(patch["source"]["selfCheck"])})
            continue
        report["cells"] += int(patch["source"]["measured"].get("rimCells", 0))
        patches.append(patch)
    return patches, report


# ----------------------------------------------------------------- shared

def _size(patch: dict, ground: np.ndarray, mpp: float, c: Census) -> None:
    """Measure the patch on the natural ground: its amplitude (+ margin), the
    cells it moves, and the route structures its region touches."""
    for attempt in range(4):
        if patch["kind"] == "bed-cut":
            out, rec = tp.apply_bed_cut(ground, patch, mpp)
        elif "cells" in patch["params"]:
            out, rec = tp.apply_rim_levee(ground, patch, c.ctx, mpp)
        else:
            out, rec = tp.apply_levee(ground, patch, c.ctx, mpp)
        patch["maxDeltaM"] = 99.0
        errs = [e for e in tp.check_invariants(ground, out, patch, c.ctx, mpp) if not e.startswith("structures")]
        # a bank can close a pocket just past the region (the pocket drained
        # through the band): widen the region so the levee fills it. A bed-cut
        # that re-waters a dry outlet does the mirror image — the water it
        # restores reaches a little past the box the stations drew — so it
        # widens on the same rule (owner 2026-09-14: the Blackrose south
        # outlet still ran dry because both its cuts were refused for exactly
        # this, after the cut was deepened enough to carry water at last).
        widen = ("new depression" in e for e in errs) if patch["kind"] == "levee" \
            else ("beyond the patch region" in e for e in errs)
        if patch["kind"] in ("levee", "bed-cut") and any(widen) and attempt < 3:
            x0, z0, x1, z1 = patch["bboxM"]
            patch["bboxM"] = [round(x0 - 4.0, 1), round(z0 - 4.0, 1), round(x1 + 4.0, 1), round(z1 + 4.0, 1)]
            continue
        break
    patch["source"]["selfCheck"] = errs
    box = tp.region_box(patch, ground.shape, mpp)
    d = out[box[0]:box[1], box[2]:box[3]] - ground[box[0]:box[1], box[2]:box[3]]
    amp = float(np.abs(d).max()) if d.size else 0.0
    patch["maxDeltaM"] = round(amp + AMPLITUDE_MARGIN_M, 3)
    patch["source"]["measured"] = {"samplesMoved": int((d != 0).sum()), "maxDeltaM": round(amp, 3), **rec}
    x0, z0, x1, z1 = patch["bboxM"]
    b = patch["blendM"] + tp.STRUCTURE_HALF_W_M
    for s in tp.load_structures():
        pts = np.asarray(s["pointsM"], dtype=np.float64)
        if pts[:, 0].min() - b <= x1 and pts[:, 0].max() + b >= x0 and pts[:, 1].min() - b <= z1 and pts[:, 1].max() + b >= z0:
            patch["crosses"].append(s["id"])


def load_spec(path: Path = CORRECTIONS_PATH) -> dict:
    doc = json.loads(Path(path).read_text(encoding="utf-8"))
    if doc.get("schemaVersion") != 1:
        raise ValueError(f"{path}: schemaVersion {doc.get('schemaVersion')!r}, expected 1")
    return doc


def _stations_bbox(sts: list[dict], kind: str, mpp: float) -> list[float]:
    if kind == "bed-cut":
        reach = max(s["halfWidthM"] for s in sts)
    else:
        reach = max(s["halfWidthM"] for s in sts) + tp.LEVEE_EDGE_GAP_M + SHOULDER_BLEND_M
    xs = [s["x"] * mpp for s in sts]; ys = [s["y"] * mpp for s in sts]
    return [round(min(xs) - reach, 1), round(min(ys) - reach, 1), round(max(xs) + reach, 1), round(max(ys) + reach, 1)]


def _merge_patch(new: dict | None, old: dict | None, c: Census, mpp: float) -> dict:
    """The cumulative merge of a re-authored patch with the one already in the
    file: the union of their stations (or rim cells), re-measured."""
    if old is None:
        return new
    if new is None:
        # A patch the census no longer names is KEPT, but it is re-sized all
        # the same: its `maxDeltaM` was measured against whatever ground the
        # pass that wrote it saw, and `apply_terrain_patches` always applies
        # from the frozen base. Returning it untouched left 7 levees declaring
        # a cap smaller than the raise they actually needed, and the amplitude
        # invariant refused every one of them (owner 2026-09-14).
        if getattr(c, "ground", None) is not None:
            _size(old, c.ground, mpp, c)
        return old
    if "cells" in new["params"]:
        cells = sorted({(int(y), int(x)) for y, x in new["params"]["cells"]}
                       | {(int(y), int(x)) for y, x in old["params"].get("cells", [])})
        new["params"]["cells"] = [[y, x] for y, x in cells]
        reach = 1.5 * mpp
        ys = [y for y, _ in cells]; xs = [x for _, x in cells]
        new["bboxM"] = [round(min(xs) * mpp - reach, 1), round(min(ys) * mpp - reach, 1),
                        round(max(xs) * mpp + reach, 1), round(max(ys) * mpp + reach, 1)]
    else:
        have = {(s["x"], s["y"]) for s in new["params"]["stations"]}
        extra = [s for s in old["params"].get("stations", []) if (s["x"], s["y"]) not in have]
        if not extra:
            return new
        sts = sorted(new["params"]["stations"] + extra, key=lambda s: (s["y"], s["x"]))
        new["params"]["stations"] = sts
        new["bboxM"] = _stations_bbox(sts, new["kind"], mpp)
        if new["kind"] == "levee":
            new["source"]["sealed"] = len(sts)
    new["crosses"] = []
    _size(new, c.ground, mpp, c)
    return new


def author(vault: Path, spec: dict | None = None, log=print, prune: bool = False,
           existing: list[dict] | None = None, mpp: float = RAW_M) -> list[dict]:
    spec = spec or load_spec()
    c = Census(vault)
    cuts, cut_report = bed_cut_patches(c, spec["bedCuts"])
    levees, levee_report = levee_patches(c, spec["levees"])
    rims, rim_report = rim_levee_patches(c)
    if existing is None:
        existing = [p for p in tp.load() if p["kind"] in ("bed-cut", "levee")]
    prev = {p["id"]: p for p in existing}
    fresh = {p["id"]: p for p in cuts + levees + rims}
    merged, kept = [], []
    for pid in sorted(set(prev) | set(fresh)):
        if pid not in fresh:
            if prune:
                continue
            kept.append(pid)
        merged.append(_merge_patch(fresh.get(pid), prev.get(pid), c, mpp))
    meta = json.loads(WATER_META_PATH.read_text(encoding="utf-8")) if WATER_META_PATH.exists() else {}
    st = meta.get("stats", {})
    log(f"census ({'published per station' if c.published_census else 're-derived from the pass file'}): "
        f"{int(c.bed_over.sum())} bed-over-level stations in {len(c.runs(c.bed_over))} runs "
        f"(published meta: {st.get('bedOverLevelStations')} in {len(st.get('bedOverLevelRuns', []))}); "
        f"{levee_report['perchedStations']} perched stations in {levee_report['perchedRuns']} runs "
        f"(published meta: {st.get('perchedStations')} in {len(st.get('perchedRuns', []))}); "
        f"{len(levees)} levees authored sealing {levee_report['sealable']} stations; "
        f"{len(levee_report['unsealable'])} stations unsealable by a bank "
        f"({sum(1 for u in levee_report['unsealable'] if u['why'] == 'drop')} on a drop over {levee_report['maxRaiseM']} m, "
        f"{sum(1 for u in levee_report['unsealable'] if u['why'] == 'chute-step')} on a chute step over {CREST_REACH_M} m)")
    if levee_report["unsealable"]:
        by_reach: dict[str, list] = {}
        for u in levee_report["unsealable"]:
            by_reach.setdefault(u["reach"], []).append(u["dropM"])
        log("  unsealable by reach: " + ", ".join(f"{r} x{len(v)} (max {max(v):.1f} m)" for r, v in sorted(by_reach.items())))
    for site in cut_report["sites"]:
        log(f"  bed-cut {site['id']}: {site['overStations']} over-level stations, {site['stations']} cut")
    if cut_report["unapprovedRuns"]:
        log(f"  UNAPPROVED bed-over-level runs left alone: {cut_report['unapprovedRuns']}")
    log(f"  body rim levees: {len(rims)} of {rim_report['bodies']} listed bodies, {rim_report['cells']} rim cells raised"
        + (f"; {len(rim_report['unsealable'])} not sealed: " +
           "; ".join(f"{u['body']} ({u['why']})" for u in rim_report["unsealable"]) if rim_report["unsealable"] else ""))
    log(f"  cumulative: {len(merged)} patches ({len(kept)} kept from the file with no census row this pass"
        + (", pruned" if prune else "") + ")")
    return merged


# ------------------------------------------------------------------ proof

def prove(ground_path: Path, vault: Path, patches: list[dict], log=print) -> dict:
    """The census re-run on a patched ground: bed over level at the approved
    sites (must be 0), and the compile's perched rule re-run with its own W
    over the patched ground (a raised cell above its W dries; a wet width
    cell with a dry 8-neighbour more than PERCHED_DROP_M under W is perched;
    a station nearest to one is perched) — `stillPerched` counts the levee
    stations the compile will still list, `sealed` the rest."""
    c = Census(vault)
    g = np.load(ground_path)
    out = {"bedOverAtSites": {}, "levees": {"stations": 0, "sealed": 0, "stillPerched": 0, "stillPerchedRuns": []}}
    wet = c.wet & (c.w > g)
    low_dry = ndimage.minimum_filter(np.where(wet, np.inf, g).astype(np.float32), size=3, mode="nearest")
    perched_cell = c.free_chan & wet & np.isfinite(low_dry) & (low_dry < c.w - PERCHED_OVER_M)
    st = np.zeros(c.sol.n, dtype=bool)
    st[np.unique(c.near[perched_cell & (c.near >= 0)])] = True
    st &= c.live & ~c.sol.pooled
    del wet, low_dry, perched_cell
    for p in patches:
        if p["kind"] == "bed-cut":
            ks = [int(k) for rid in p["source"]["reaches"] for k in np.flatnonzero((c.reach_ids == rid) & c.live)]
            first, last = p["params"]["stations"][0], p["params"]["stations"][-1]
            near = [k for k in ks if min(np.hypot(c.sol.x[k] - s["x"], c.sol.y[k] - s["y"]) for s in (first, last)) * RAW_M <= 150]
            out["bedOverAtSites"][p["id"]] = int(sum(g[c.iy[k], c.ix[k]] > c.level[k] + BED_OVER_TOL_M for k in near))
        elif p["kind"] == "levee":
            if "cells" in p["params"]:      # a body rim levee: no stations, nothing perched to re-census
                continue
            still = 0
            for s in p["params"]["stations"]:
                k = int(np.argmin(np.hypot(c.sol.x - s["x"], c.sol.y - s["y"])))
                out["levees"]["stations"] += 1
                still += int(st[k])
            out["levees"]["stillPerched"] += still
            out["levees"]["sealed"] += len(p["params"]["stations"]) - still
            if still:
                out["levees"]["stillPerchedRuns"].append([p["source"]["reach"], still])
    out["censusPerchedStationsAfter"] = int(st.sum())
    log(json.dumps(out, indent=1))
    return out
