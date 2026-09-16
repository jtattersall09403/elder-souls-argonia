"""Route grading as a patch author (16e, decision 0068): the choke points the
best line still had to take, patched locally, in one pass.

    cd tooling/world-generation
    python3 -m worldgen.grade_routes              # writes route-grade-patches.json, route-grading-stretches.json, route-grading.md
    python3 -m worldgen.grade_routes --dry-run    # report only

WHAT IT DOES
------------
The major roads are solved on the frozen ground by `solve_major_routes` with
a gradient-walled cost, so a road already contours and zigzags where it can.
What is left is short: a terrace lip, a bench that has to be cut, a hollow
that has to be filled. This module walks every published major road at one
raw sample (1.83 m), finds each run of samples steeper than the class cap,
and decides for each run from its measured shape:

* **patch** — a capped, smoothed longitudinal profile pinned to the ground at
  both ends of the run fits inside the cut and fill limits and inside the
  patch invariants (it is APPLIED to a scratch copy through the same
  `terrain_patches` machinery the chain uses, so a refused patch never
  reaches the file). The run becomes one `route-grade` patch in
  `world/sources/terrain/route-grade-patches.json`: the profile, the flat
  running width and the shoulder it blends over. The run is widened up to
  three times (a longer ramp) before giving up.
* **structure** — anything a patch cannot honestly take (deeper than the
  fill cap, a bench wider than the shoulder budget, a bank inside a channel's
  shoulder, a crossing) is a chainage window in
  `output/route-grading-stretches.json` for `author_route_structures`, which
  authors a stair, a lip-step or a short crossing over it.

Nothing here writes a heightfield. `apply_route_patches` applies the patches
from the NATURAL array (`compile_chunks.NATURAL_HEIGHTS`, the frozen base plus
the place patches) and writes the graded array the rest of the chain builds
on; the router and this module read the natural array only, so grading can
never feed back into routing. Minor routes are never graded (owner
2026-09-15): they are solved with the same gradient cost in 16g and follow
the ground.

The grading report `world/sources/sites/route-grading.md` keeps its
`## Survivors` table (the ways with structure windows) because the span
author reads it.
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np
from scipy import ndimage

from . import terrain_patches as tp
from .compile_chunks import HEIGHTFIELD_DIR, NATURAL_HEIGHTS
from .scale import RAW_M

REPO_ROOT = Path(__file__).resolve().parents[3]
PROVINCE = REPO_ROOT / "apps" / "world-studio" / "public" / "province"
REPORT_PATH = REPO_ROOT / "world" / "sources" / "sites" / "route-grading.md"
STRUCTURES_PATH = REPO_ROOT / "world" / "sources" / "routes" / "route-structures.json"
STRETCHES_PATH = Path(__file__).resolve().parents[1] / "output" / "route-grading-stretches.json"
PATCHES_PATH = REPO_ROOT / "world" / "sources" / "terrain" / "route-grade-patches.json"
STEP = 3                       # macro (1345) px -> full-res samples
SCHEMA_VERSION = 1

GRADIENT_CAP_DEG = {"road": 8.0, "trunk_road": 8.0, "track": 12.0, "causeway": 12.0, "footpath": 17.0}
# Flat running-surface width, metres: the class width the owner specified,
# never narrower than what `routes_raster` paints.
FLAT_WIDTH_M = {"road": 5.0, "trunk_road": 5.0, "track": 3.6, "causeway": 3.6, "footpath": 2.4}
# How far a graded surface may leave the natural ground (cut, fill). Cut is
# generous (a side-hill cut leaves a bank the hill supports); fill is mean
# (an embankment is built out of nothing and buried the terrace lips the
# owner reported). Past these the answer is a structure, not more earth.
MAX_OFFSET_M = {"road": (14.0, 6.0), "trunk_road": (14.0, 6.0), "track": (10.0, 4.0),
                "causeway": (10.0, 4.0), "footpath": (8.0, 2.5)}
MAX_FILL_M = 6.0               # hard ceiling on fill anywhere in a patch (the measured lever, 0068)
MAX_SHOULDER_M = 70.0          # widest bench the blend may need to meet the hillside
MIN_SHOULDER_M = 2.0
RIM_MAX_DEG = 30.0             # steepest face the blend may leave: shoulder = |delta| / tan(30 deg)
CAP_TOLERANCE_DEG = 0.3        # a graded profile is accepted this far over the cap (sampling noise)
SMOOTH_ITERS = 24
SMOOTH_SIGMA_SAMPLES = 2.5
RUN_MERGE_GAP_M = 25.0         # over-cap runs closer than this are one run
RUN_LANDING_M = 8.0            # each run is extended this far into good ground at both ends
WIDEN_STEPS_M = (0.0, 20.0, 45.0, 90.0)   # a run that will not grade is retried as a longer ramp
BANK_MAX_DEG = 30.0            # a channel bank this steep or less stays natural (a ford's approach); steeper is a stair


# ---------------------------------------------------------------------------
# helpers other modules import
# ---------------------------------------------------------------------------
def ways(province: Path | None = None) -> list[dict]:
    """Every published major way, sorted by id: `px` on the macro (1345) grid
    as [x, y]; `kind` is the grading class."""
    province = province or PROVINCE
    out: list[dict] = []
    major = province / "routes.json"
    if major.exists():
        for route in json.loads(major.read_text()).get("routes", []):
            cls = route.get("class")
            if cls not in ("road", "trunk"):
                continue
            out.append({"id": route.get("id", ""), "kind": "trunk_road" if cls == "trunk" else "road",
                        "px": route.get("px", [])})
    out.sort(key=lambda w: w["id"])
    return out


def resample(px: list, step: int = STEP) -> np.ndarray:
    """Macro polyline -> full-res (x, y) sample points about RAW_M apart."""
    pts = np.asarray(px, dtype=np.float64) * step
    if len(pts) < 2:
        return pts.reshape(-1, 2)
    out = [pts[0]]
    for a, b in zip(pts[:-1], pts[1:]):
        n = int(max(abs(b[0] - a[0]), abs(b[1] - a[1])))
        if n <= 0:
            continue
        for i in range(1, n + 1):
            out.append(a + (b - a) * (i / n))
    return np.asarray(out, dtype=np.float64)


def sample_bilinear(field: np.ndarray, xs: np.ndarray, ys: np.ndarray) -> np.ndarray:
    h, w = field.shape
    x = np.clip(xs, 0, w - 1.001)
    y = np.clip(ys, 0, h - 1.001)
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    fx, fy = x - x0, y - y0
    x1, y1 = np.minimum(x0 + 1, w - 1), np.minimum(y0 + 1, h - 1)
    return (field[y0, x0] * (1 - fx) * (1 - fy) + field[y0, x1] * fx * (1 - fy)
            + field[y1, x0] * (1 - fx) * fy + field[y1, x1] * fx * fy)


# ---------------------------------------------------------------------------
# the profile (kept from the first grader: the maths was right)
# ---------------------------------------------------------------------------
def cap_and_redistribute(dz: np.ndarray, cap: np.ndarray) -> np.ndarray:
    """Clip increments to +/-cap and push the clipped climb back onto
    same-sign increments that still have headroom, so the total is kept."""
    out = np.clip(dz, -cap, cap)
    for _ in range(8):
        for sign in (1.0, -1.0):
            excess = sign * (dz.sum() - out.sum())
            if excess <= 1e-9:
                continue
            room = np.maximum(cap - sign * out, 0.0)
            room[np.sign(out) == -sign] = 0.0
            total = room.sum()
            if total <= 1e-12:
                continue
            out = out + sign * room * min(1.0, excess / total)
    return out


def grade_profile(z: np.ndarray, ds: np.ndarray, cap_deg: float,
                  offset: tuple[float, float] | None = None) -> np.ndarray:
    """Smoothed, gradient-capped profile with both endpoints pinned to the
    ground; `offset` = (max cut, max fill) clamps it to the natural ground."""
    if len(z) < 3:
        return z.astype(np.float64).copy()
    cap = np.tan(math.radians(cap_deg)) * ds
    g = z.astype(np.float64).copy()
    z0, z1 = float(z[0]), float(z[-1])
    s = np.concatenate([[0.0], np.cumsum(ds)])
    frac = s / max(s[-1], 1e-9)
    for _ in range(SMOOTH_ITERS):
        g = ndimage.gaussian_filter1d(g, SMOOTH_SIGMA_SAMPLES, mode="nearest")
        g[0], g[-1] = z0, z1
        g = np.concatenate([[z0], z0 + np.cumsum(cap_and_redistribute(np.diff(g), cap))])
        if offset is not None:
            g = np.clip(g, z - offset[0], z + offset[1])
        g = g + (z1 - g[-1]) * frac
    return g


def max_gradient_deg(z: np.ndarray, ds: np.ndarray) -> float:
    if len(z) < 2:
        return 0.0
    return float(np.degrees(np.arctan(np.abs(np.diff(z)) / np.maximum(ds, 1e-6))).max())


# ---------------------------------------------------------------------------
# the choke points
# ---------------------------------------------------------------------------
def over_cap_runs(chain: np.ndarray, flag: np.ndarray) -> list[tuple[int, int]]:
    """Index windows [a, b] (sample indices, inclusive) of flagged samples,
    merged across gaps under RUN_MERGE_GAP_M and extended RUN_LANDING_M into
    the ground either side."""
    runs: list[list[int]] = []
    i = 0
    n = len(flag)
    while i < n:
        if not flag[i]:
            i += 1
            continue
        j = i
        while j + 1 < n and flag[j + 1]:
            j += 1
        if runs and chain[i] - chain[min(runs[-1][1] + 1, n)] <= RUN_MERGE_GAP_M:
            runs[-1][1] = j
        else:
            runs.append([i, j])
        i = j + 1
    out = []
    for a, b in runs:
        a2 = int(np.searchsorted(chain, chain[a] - RUN_LANDING_M, side="left"))
        b2 = int(np.searchsorted(chain, chain[min(b + 1, n)] + RUN_LANDING_M, side="right"))
        out.append((max(a2, 0), min(b2, n)))
    return out


def way_samples(way: dict, natural: np.ndarray, wet: np.ndarray) -> dict:
    """Chainage, ground and wetness along one way at one raw sample."""
    pts = resample(way["px"])
    xs, ys = pts[:, 0], pts[:, 1]
    z = sample_bilinear(natural, xs, ys).astype(np.float64)
    ds = np.hypot(np.diff(xs), np.diff(ys)) * RAW_M
    chain = np.concatenate([[0.0], np.cumsum(ds)])
    deg = np.degrees(np.arctan(np.abs(np.diff(z)) / np.maximum(ds, 1e-6)))
    iy = np.clip(np.round(ys).astype(int), 0, wet.shape[0] - 1)
    ix = np.clip(np.round(xs).astype(int), 0, wet.shape[1] - 1)
    return {"xs": xs, "ys": ys, "z": z, "ds": ds, "chain": chain, "deg": deg, "wet": wet[iy, ix],
            "iy": iy, "ix": ix}


def _slug(way_id: str) -> str:
    return way_id.replace("route.", "").replace(".", "-")


def author_patch(way: dict, smp: dict, a: int, b: int, ordinal: int) -> tuple[dict | None, dict]:
    """Try to grade samples a..b (b exclusive) of one way as a patch.

    Returns (patch or None, window). The window is the structure record the
    span author consumes when the patch is None; it carries `reason`."""
    kind = way["kind"]
    cap = GRADIENT_CAP_DEG[kind]
    cut_max, fill_max = MAX_OFFSET_M[kind]
    z, ds, chain = smp["z"][a:b], smp["ds"][a:b - 1], smp["chain"]
    window = {"fromM": round(float(chain[a]), 2), "toM": round(float(chain[b - 1]), 2),
              "overM": round(float(chain[b - 1] - chain[a]), 2),
              "worstDeg": round(float(smp["deg"][a:b - 1].max()) if b - 1 > a else 0.0, 2),
              "atFrac": round(a / max(len(smp["z"]) - 1, 1), 3)}
    if b - a < 3:
        window["reason"] = "too-short"
        return None, window
    g = grade_profile(z, ds, cap, offset=(cut_max, fill_max))
    delta = g - z
    if max_gradient_deg(g, ds) > cap + CAP_TOLERANCE_DEG:
        window["reason"] = "cap"
        return None, window
    if delta.max() > MAX_FILL_M:
        window["reason"] = "fill"
        return None, window
    if -delta.min() > cut_max:
        window["reason"] = "cut"
        return None, window
    amp = float(np.abs(delta).max())
    shoulder = float(np.clip(amp / math.tan(math.radians(RIM_MAX_DEG)), MIN_SHOULDER_M, MAX_SHOULDER_M))
    half = FLAT_WIDTH_M[kind] * 0.5
    xs, ys = smp["xs"][a:b] * RAW_M, smp["ys"][a:b] * RAW_M
    profile = [[round(float(x), 2), round(float(y), 2), round(float(t), 3)] for x, y, t in zip(xs, ys, g)]
    pad = half + shoulder
    patch = {
        "id": f"patch.route-grade.{_slug(way['id'])}.{ordinal:03d}",
        "kind": "route-grade", "order": 0, "after": [], "crosses": [], "makesWater": False,
        "bboxM": [round(float(xs.min()) - pad, 2), round(float(ys.min()) - pad, 2),
                  round(float(xs.max()) + pad, 2), round(float(ys.max()) + pad, 2)],
        "blendM": 0.0,
        "maxDeltaM": 0.0,                       # set from the scratch application below
        "source": {"way": way["id"], "class": kind, "fromM": window["fromM"], "toM": window["toM"],
                   "worstDegBefore": window["worstDeg"], "capDeg": cap},
        "params": {"flatWidthM": FLAT_WIDTH_M[kind], "shoulderM": round(shoulder, 2), "capDeg": cap,
                   "profile": profile},
        "why": f"{way['id']} at {window['fromM']:.0f}-{window['toM']:.0f} m: the ground runs to "
               f"{window['worstDeg']:.1f} deg against the {cap:.0f} deg cap; graded to a profile "
               f"within {amp:.2f} m of the natural ground.",
    }
    return patch, window


def prove_patch(patch: dict, natural: np.ndarray, ctx: tp.Context, cut_max: float) -> tuple[bool, str, float]:
    """Apply the patch to a scratch window of the natural ground through the
    chain's own machinery and run the invariants; returns (ok, reason, amp)."""
    y0, y1, x0, x1 = tp.region_box(patch, natural.shape)
    # the scratch window must hold the shore guard's full reach, or a cell
    # the chain's apply refuses (inside the guard) is proved here as free
    pad = max(tp.WINDOW_PAD_PX, int(np.ceil(tp.SHORE_GUARD_M / RAW_M))) + 2
    wy0, wy1 = max(y0 - pad, 0), min(y1 + pad, natural.shape[0])
    wx0, wx1 = max(x0 - pad, 0), min(x1 + pad, natural.shape[1])
    local = natural[wy0:wy1, wx0:wx1]
    shifted = dict(patch)
    shifted["bboxM"] = [patch["bboxM"][0] - wx0 * RAW_M, patch["bboxM"][1] - wy0 * RAW_M,
                        patch["bboxM"][2] - wx0 * RAW_M, patch["bboxM"][3] - wy0 * RAW_M]
    shifted["params"] = dict(patch["params"])
    shifted["params"]["profile"] = [[e - wx0 * RAW_M, s - wy0 * RAW_M, z] for e, s, z in patch["params"]["profile"]]
    lctx = tp.Context(ctx.level[wy0:wy1, wx0:wx1], ctx.sea[wy0:wy1, wx0:wx1],
                      _shift_stations(ctx.stations, wy0, wx0), npz=None, structures=[])
    try:
        out, _rec = tp.apply_route_grade(local, shifted, lctx)
    except ValueError as e:
        return False, f"cannot apply: {e}", 0.0
    delta = out - local
    amp = float(np.abs(delta).max()) if delta.size else 0.0
    if not (delta != 0).any():
        # every cell of the run lies inside recorded water's shore band: the
        # patch would change nothing, so it is not a patch (a bank or a window)
        return False, "water: the run lies inside the recorded water's shore band", 0.0
    if delta.max() > MAX_FILL_M + 1e-3:
        return False, "fill", amp
    if -delta.min() > cut_max + 1e-3:
        return False, "cut", amp
    shifted["maxDeltaM"] = round(amp + 0.01, 3)
    errs = tp.check_invariants(local, out, shifted, lctx)
    if errs:
        return False, errs[0], amp
    return True, "", amp


def _shift_stations(stations, dy: int, dx: int):
    ys, xs = stations[0], stations[1]
    return (ys - dy, xs - dx, *stations[2:])


def grade_way(way: dict, natural: np.ndarray, ctx: tp.Context) -> dict:
    """One way: its patches, its structure windows and the numbers."""
    smp = way_samples(way, natural, ctx.wet)
    guard = ctx.shore_guard(RAW_M)[smp["iy"], smp["ix"]]
    cap = GRADIENT_CAP_DEG[way["kind"]]
    cut_max, _fill = MAX_OFFSET_M[way["kind"]]
    seg_wet = smp["wet"][:-1] | smp["wet"][1:]
    flag = (smp["deg"] > cap) & ~seg_wet
    patches, windows, banks = [], [], []
    ordinal = 0
    for a, b in over_cap_runs(smp["chain"], flag):
        chosen, window, reason = None, None, ""
        first_window = None
        if guard[a:b].all():
            # the whole run lies in recorded water's shore band, where no
            # patch may move the ground: a bank (walkable) or a window
            _p, first_window = author_patch(way, smp, a, b, ordinal)
            reason = "water: the run lies inside the recorded water's shore band"
            widen_steps = ()
        else:
            widen_steps = WIDEN_STEPS_M
        for widen in widen_steps:
            a2 = int(np.searchsorted(smp["chain"], smp["chain"][a] - widen, side="left"))
            b2 = int(np.searchsorted(smp["chain"], smp["chain"][min(b, len(smp["chain"]) - 1)] + widen, side="right"))
            a2, b2 = max(a2, 0), min(b2, len(smp["z"]))
            # a longer ramp may not reach into recorded water: clamp the
            # window to the dry run that holds the over-cap samples
            wet_before = np.flatnonzero(smp["wet"][:a])
            if len(wet_before):
                a2 = max(a2, int(wet_before[-1]) + 1)
            wet_after = np.flatnonzero(smp["wet"][b:])
            if len(wet_after):
                b2 = min(b2, b + int(wet_after[0]))
            patch, window = author_patch(way, smp, a2, b2, ordinal)
            if first_window is None:
                first_window = window
            if patch is None:
                reason = window["reason"]
                continue
            ok, reason, amp = prove_patch(patch, natural, ctx, cut_max)
            if ok:
                patch["maxDeltaM"] = round(amp + 0.05, 3)
                chosen = patch
                break
        if chosen is not None:
            patches.append(chosen)
            ordinal += 1
        elif (reason.startswith("channels") or reason.startswith("water")) \
                and (first_window or window or {}).get("worstDeg", 99) <= BANK_MAX_DEG:
            # the run lies on a channel's bank or a body's edge, where no
            # patch may move the ground (16b invariants 3 and 4): a walkable
            # bank down to a ford or along a marsh edge stays natural and is
            # reported, never built over; steeper than BANK_MAX_DEG it is a
            # window for the span author (a stair down to the water)
            bank = dict(first_window or window or {})
            bank["reason"] = "bank"
            bank["detail"] = reason
            banks.append(bank)
        elif reason != "too-short":
            # (a run too short to hold a profile is a single steep step at a
            # water's edge: the crossing's bank, which derive_crossings and
            # the span author already own)
            window = dict(first_window or window or {})
            window["reason"] = (reason or window.get("reason", "cap")).split(":")[0]
            window["detail"] = reason
            windows.append(window)
    over_before = float(smp["ds"][smp["deg"] > cap].sum())
    return {"id": way["id"], "kind": way["kind"], "capDeg": cap,
            "lengthM": round(float(smp["chain"][-1]), 2), "overCapM": round(over_before, 1),
            "worstDeg": round(float(smp["deg"].max()) if len(smp["deg"]) else 0.0, 2),
            "wetSamples": int(smp["wet"].sum()), "patches": patches, "windows": windows, "banks": banks}


def declare_overlaps(patches: list[dict], shape) -> list[dict]:
    """Two roads sharing a corridor (or meeting at a junction) grade the same
    ground: the first patch wins and the later one is DROPPED, because a
    profile authored on the natural ground cannot be re-proved on ground the
    first patch already moved. Returns the kept list; each kept patch names
    the ids it absorbed in `source.absorbed`."""
    kept: list[dict] = []
    boxes: list = []
    for p in patches:
        box = tp.region_box(p, shape)
        hit = next((k for k, b in enumerate(boxes) if tp._intersects(box, b)), None)
        if hit is not None:
            kept[hit]["source"].setdefault("absorbed", []).append(p["id"])
            continue
        kept.append(p)
        boxes.append(box)
    for k, p in enumerate(kept):
        p["order"] = k
    return kept


# ---------------------------------------------------------------------------
# outputs
# ---------------------------------------------------------------------------
def write_stretches(stats: list[dict], path: Path | None = None) -> dict:
    """The structure windows per way, in the shape `author_route_structures`
    consumes (chainage in metres along `resample`'s centreline)."""
    path = path or STRETCHES_PATH
    doc = {"schemaVersion": 2,
           "_": "Structure windows per way (the choke points a route-grade patch could not take), "
                "metres of chainage along worldgen.grade_routes.resample. Derived output; "
                "regenerate with `python3 -m worldgen.grade_routes`.",
           "ways": [{"wayId": s["id"], "kind": s["kind"], "capDeg": s["capDeg"], "lengthM": s["lengthM"],
                     "stretches": s["windows"]} for s in sorted(stats, key=lambda s: s["id"]) if s["windows"]]}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(doc, indent=2, sort_keys=True) + "\n")
    return doc


def write_report(stats: list[dict], path: Path = REPORT_PATH) -> None:
    n_patch = sum(len(s["patches"]) for s in stats)
    n_win = sum(len(s["windows"]) for s in stats)
    patch_m = sum(p["source"]["toM"] - p["source"]["fromM"] for s in stats for p in s["patches"])
    lines = ["# Route grading — the choke points, patched or handed to the span author", "",
             "Generated by `python3 -m worldgen.grade_routes` (16e, decision 0068). The roads were "
             "solved on the frozen ground by `solve_major_routes`; this is what was left over the "
             "class cap, sampled every 1.83 m on the natural array, and what was done about it. "
             "Patches: `world/sources/terrain/route-grade-patches.json` (applied by `apply_route_patches`). "
             "Windows: `output/route-grading-stretches.json` (authored by `author_route_structures`). "
             "Minor routes are never graded.", "",
             f"- Ways: {len(stats)}. Over-cap ground before grading: "
             f"{sum(s['overCapM'] for s in stats):.0f} m. Route-grade patches: {n_patch} over {patch_m:.0f} m. "
             f"Structure windows: {n_win}. Channel banks left natural (a ford's approach, at most "
             f"{BANK_MAX_DEG:.0f} deg): {sum(len(s.get('banks', [])) for s in stats)}.", "", "## Per way", "",
             "| way | class | length m | over-cap m before | worst deg | patches | patched m | windows | banks left natural |",
             "|---|---|---:|---:|---:|---:|---:|---:|---:|"]
    for s in stats:
        pm = sum(p["source"]["toM"] - p["source"]["fromM"] for p in s["patches"])
        lines.append(f"| `{s['id']}` | {s['kind']} | {s['lengthM']:.0f} | {s['overCapM']:.0f} | {s['worstDeg']:.1f} | "
                     f"{len(s['patches'])} | {pm:.0f} | {len(s['windows'])} | {len(s.get('banks', []))} |")
    lines += ["", "## Survivors", "",
              "Ways with a window a patch could not take; `author_route_structures` builds the piece.", "",
              "| way | windows | reasons |", "|---|---:|---|"]
    for s in stats:
        if s["windows"]:
            reasons = ", ".join(sorted({w.get("reason", "?") for w in s["windows"]}))
            lines.append(f"| `{s['id']}` | {len(s['windows'])} | {reasons} |")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("\n".join(lines) + "\n")


def grade_all(natural: np.ndarray, ctx: tp.Context, way_list: list[dict] | None = None) -> tuple[list[dict], list[dict]]:
    stats = [grade_way(w, natural, ctx) for w in (way_list if way_list is not None else ways())]
    patches = declare_overlaps([p for s in stats for p in s["patches"]], natural.shape)
    errs = tp.validate(patches, natural.shape)
    if errs:
        raise SystemExit("grade_routes: the authored patches fail validation: " + "; ".join(errs[:5]))
    return patches, stats


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args(argv)
    natural = np.load(NATURAL_HEIGHTS)
    ctx = tp.context_from_vault(HEIGHTFIELD_DIR)
    ctx.structures = []                        # windows and patches are disjoint by construction
    patches, stats = grade_all(natural, ctx)
    for s in stats:
        print(f"  {s['id']:44s} {s['lengthM']:7.0f} m  over-cap {s['overCapM']:6.0f} m  worst {s['worstDeg']:5.1f}  "
              f"patches {len(s['patches']):3d}  windows {len(s['windows']):2d}")
    if args.dry_run:
        return 0
    tp.save(patches, PATCHES_PATH,
            about="Route-grade patches (16e, decision 0068): the choke points on the solved major roads that a "
                  "local profile could take, authored by `python3 -m worldgen.grade_routes` from the natural "
                  "ground and applied AFTER every patch in terrain-patches.json by `apply_route_patches`. "
                  "Derived from the published roads; regenerate, never hand-edit.")
    write_stretches(stats)
    write_report(stats)
    print(f"grade_routes: {len(patches)} patches -> {PATCHES_PATH.name}; "
          f"{sum(len(s['windows']) for s in stats)} windows -> {STRETCHES_PATH.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
