"""Route grading — make every road, track and footpath walkable end to end.

    cd tooling/world-generation
    python3 -m worldgen.grade_routes            # whole province, in place

WHY THIS EXISTS (owner report, 2026-09-05)
------------------------------------------
The route solvers pick *cheap* lines across the province, but nothing ever
touched the terrain under them. Where a line crossed a terrace lip or a
sculpted bench the ground kept its step, so in 3D a road ran off the edge of
a contour and left a sudden drop or a shelf. Grading is the missing civil
engineering: cut and fill the heightfield along each way so the surface a
player walks has a sane longitudinal gradient, is flat across its width, and
blends back into the hillside without leaving a climbable-only rim.

WHERE IT SITS IN THE CHAIN
--------------------------
    sculpt_province → refine_province → **grade_routes** → compile_chunks
    → export_web_chunks → compile_water → rebake_landcover → compile_scatter

It runs AFTER refinement (it needs the final channels, lake and detail noise)
and BEFORE anything derived from heights (chunks, collision, water surface,
land cover, scatter) — all of which must be regenerated after it.

Idempotence: refinement's output is snapshotted once as
`refined-height-ungraded-f32.npy`; every run reads that snapshot and rewrites
`refined-height-f32.npy`, so grading twice gives the same file as grading
once, and re-running `refine_province` refreshes the snapshot.

THE ALGORITHM (deterministic, no randomness)
--------------------------------------------
Per way, in a stable id order:

1. **Sample** the centreline at ~one full-res sample (1.83 m) and read the
   height profile bilinearly.
2. **Smooth + cap.** Alternate a short low-pass (endpoints pinned — a way
   must still meet the network at the junction height) with a
   cap-and-redistribute pass on the along-path increments: increments over
   the class cap are clipped, and the clipped-off climb is pushed back onto
   the increments of the same sign that still have headroom, so the *total*
   climb is preserved and merely spread over more distance. Clipping never
   flips an increment's sign, so a monotone climb stays monotone.
3. **Write back** across a cross-section: flat at the way's own width, then a
   smoothstep shoulder over 2-3x the width. The shoulder is *benched*: it is
   extended locally until the cut/fill face it leaves is under 30 degrees, so
   grading a terrace lip produces a bank you can walk up, not a new wall.

Water and specials:
* A **boardwalk grades nothing** — it is a placed deck over the water.
* On a way that is not crossing water, the graded profile is never pushed
  below the published water surface (`water/water-surface.png`, restricted to
  actually-wet cells by `water-class.png`): we do not dig roads into rivers.
* **Fords and bridges** — the stretches where a way crosses river / estuary /
  lake / coast cells — are derived from the water class raster. Their profile
  is still smoothed (so the approaches line up) but no height is ever written
  on a wet cell: a ford keeps its bed and a bridge deck is an asset above the
  gap.
"""

from __future__ import annotations

import argparse
import json
import math
import shutil
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

from .scale import RAW_M

REPO_ROOT = Path(__file__).resolve().parents[3]
PROVINCE = REPO_ROOT / "apps" / "world-studio" / "public" / "province"
REPORT_PATH = REPO_ROOT / "world" / "sources" / "sites" / "route-grading.md"

STEP = 3                       # macro (1345) px -> full-res samples

# Longitudinal gradient cap by way class, degrees. Stairs/ramps are authored
# geometry, not terrain, and are exempt (they never appear in these networks).
GRADIENT_CAP_DEG = {
    "road": 8.0,
    "trunk_road": 8.0,
    "track": 12.0,
    "causeway": 12.0,
    "footpath": 17.0,
}
# Flat running-surface width, metres: the wider of the class width the owner
# specified and the width `routes_raster` actually paints, so the painted
# surface always sits on flat ground.
FLAT_WIDTH_M = {
    "road": 5.0,
    "trunk_road": 5.0,
    "track": 3.6,
    "causeway": 3.6,
    "footpath": 2.4,
}
# How far the graded way may leave the natural ground, metres (cut, fill).
# Without this a capped profile happily floats a 36 m embankment across a
# hollow: past these depths the honest answer is a steeper way, not a viaduct.
MAX_OFFSET_M = {
    "road": (8.0, 6.0),
    "trunk_road": (8.0, 6.0),
    "track": (5.0, 4.0),
    "causeway": (5.0, 4.0),
    "footpath": (3.0, 2.5),
}
MIN_FLAT_PX = 1.5              # resolution floor for the flat band, samples
SHOULDER_FACTOR = 2.5          # shoulder length = this x the flat width ...
MAX_SHOULDER_M = 70.0          # ... extended to bench a lip, up to this
RIM_MAX_DEG = 30.0             # steepest face the blend may leave
CROSS_SLOPE_MAX_DEG = 3.0      # the running surface itself is flat (0) by build
SMOOTH_ITERS = 24              # low-pass / redistribute alternations
SMOOTH_SIGMA_SAMPLES = 2.5     # low-pass width, in centreline samples
WATER_CLEARANCE_M = 0.15
# water-class.png R indices: 0 none, 1 coast, 2 estuary, 3 river, 4 lake, 5 marsh.
OPEN_WATER_CLASSES = (1, 2, 3, 4)       # keep graded ways this far above the water table

# The ungraded studio raster, written beside `height-rg.png` for siting.
NATURAL_HEIGHT_FILE = "height-natural-rg.png"

BOARDWALK = "boardwalk"


# --------------------------------------------------------------------------
# way collection
# --------------------------------------------------------------------------
def ways(province: Path | None = None) -> list[dict]:
    """Every gradeable way, in a stable order: majors first, then minors, each
    sorted by id. `px` are macro (1345) grid coordinates as [x, y]."""
    province = province or PROVINCE
    out: list[dict] = []
    major = province / "routes.json"
    if major.exists():
        for route in json.loads(major.read_text()).get("routes", []):
            cls = route.get("class")
            if cls not in ("road", "trunk"):
                continue           # boat lanes are not ways
            out.append({"id": route.get("id", ""),
                        "kind": "trunk_road" if cls == "trunk" else "road",
                        "px": route.get("px", [])})
    minor = province / "routes-minor.json"
    if minor.exists():
        for track in json.loads(minor.read_text()).get("tracks", []):
            out.append({"id": track.get("id", ""),
                        "kind": track.get("kind", "footpath"),
                        "px": track.get("px", [])})
    out.sort(key=lambda w: (w["kind"] not in ("road", "trunk_road"), w["id"]))
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


# --------------------------------------------------------------------------
# profile smoothing
# --------------------------------------------------------------------------
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
            room[np.sign(out) == -sign] = 0.0    # never flip a sign
            total = room.sum()
            if total <= 1e-12:
                continue
            out = out + sign * room * min(1.0, excess / total)
    return out


def _slope_feasible_envelope(floor: np.ndarray, ds: np.ndarray, cap_deg: float) -> np.ndarray:
    """Lower envelope of `floor` that a cap-feasible profile can clear: a
    single high constraint would otherwise force a spike no smoothing can
    remove, so spread it out at the cap slope (min-plus dilation, both ways)."""
    slope = np.tan(math.radians(cap_deg))
    e = floor.astype(np.float64).copy()
    for i in range(1, len(e)):
        e[i] = max(e[i], e[i - 1] - slope * ds[i - 1])
    for i in range(len(e) - 2, -1, -1):
        e[i] = max(e[i], e[i + 1] - slope * ds[i])
    return e


def grade_profile(z: np.ndarray, ds: np.ndarray, cap_deg: float,
                  floor: np.ndarray | None = None,
                  offset: tuple[float, float] | None = None) -> np.ndarray:
    """Smoothed, gradient-capped profile with both endpoints pinned."""
    if len(z) < 3:
        return z.copy()
    cap = np.tan(math.radians(cap_deg)) * ds
    g = z.astype(np.float64).copy()
    z0, z1 = float(z[0]), float(z[-1])
    s = np.concatenate([[0.0], np.cumsum(ds)])
    frac = s / max(s[-1], 1e-9)
    for _ in range(SMOOTH_ITERS):
        g = ndimage.gaussian_filter1d(g, SMOOTH_SIGMA_SAMPLES, mode="nearest")
        g[0], g[-1] = z0, z1
        g = np.concatenate([[z0], z0 + np.cumsum(cap_and_redistribute(np.diff(g), cap))])
        if floor is not None:
            g = np.maximum(g, floor)
            g[0] = z0
        if offset is not None:
            g = np.clip(g, z - offset[0], z + offset[1])
        # Tie the far end back to the junction height by spreading the residual
        # evenly along the run. On a run too short to hold the cap at all (a
        # mountain spur) this is the minimum-possible max gradient, and it is a
        # ramp rather than the cliff a hard endpoint pin would leave.
        g = g + (z1 - g[-1]) * frac
    return g


def max_gradient_deg(z: np.ndarray, ds: np.ndarray) -> float:
    if len(z) < 2:
        return 0.0
    return float(np.degrees(np.arctan(np.abs(np.diff(z)) / np.maximum(ds, 1e-6))).max())


# --------------------------------------------------------------------------
# main grading pass
# --------------------------------------------------------------------------
def _water_fields(province: Path, shape) -> tuple[np.ndarray | None, np.ndarray | None]:
    """(water level in metres, wet mask) resampled to the full-res grid, or
    (None, None) if the water bake has not been produced yet."""
    meta_path = province / "water" / "water-meta.json"
    if not meta_path.exists():
        return None, None
    meta = json.loads(meta_path.read_text())
    surf = np.asarray(Image.open(province / "water" / "water-surface.png").convert("RGB"),
                      dtype=np.uint32)
    lo, hi = meta["surface"]["minM"], meta["surface"]["maxM"]
    q = (surf[..., 0] << 8) | surf[..., 1]
    level = (q.astype(np.float32) / 65535.0) * (hi - lo) + lo
    # R channel is the class index (0 = dry); G/B carry turbidity/salinity.
    klass = np.asarray(Image.open(province / "water" / "water-class.png").convert("RGB"))[..., 0]
    # Open water only (coast/estuary/river/lake). MARSH is wet *ground*: paths
    # cross it normally and its water table follows the ground, so excluding it
    # would chop every marsh way into graded and ungraded pieces with a step
    # between them — the very defect this pass exists to remove.
    wet = np.isin(klass, OPEN_WATER_CLASSES)
    zoom_l = (shape[0] / level.shape[0], shape[1] / level.shape[1])
    zoom_w = (shape[0] / wet.shape[0], shape[1] / wet.shape[1])
    level = ndimage.zoom(level, zoom_l, order=1)[: shape[0], : shape[1]]
    wet = ndimage.zoom(wet.astype(np.uint8), zoom_w, order=0)[: shape[0], : shape[1]] > 0
    return level.astype(np.float32), wet


def grade(h: np.ndarray, ways_list: list[dict],
          level: np.ndarray | None = None, wet: np.ndarray | None = None,
          step: int = STEP) -> tuple[np.ndarray, list[dict]]:
    """Return (graded heightfield, per-way stats). Pure: `h` is not modified.

    Ways are graded IN PRIORITY ORDER (roads, then tracks and footpaths by id)
    against the running result, and an earlier way's running surface is locked:
    a footpath meeting a road samples the road's graded height and ties into
    it, instead of the two disagreeing and leaving a step at the junction.
    """
    cur = h.astype(np.float32).copy()
    locked = np.zeros_like(cur)
    stats: list[dict] = []
    ny, nx = h.shape
    submerged = None
    if wet is not None and level is not None:
        submerged = wet & (h <= level + 0.05)

    for way in ways_list:
        kind = way["kind"]
        pts = resample(way["px"], step)
        if len(pts) < 3 or kind == BOARDWALK or kind not in GRADIENT_CAP_DEG:
            if len(pts) >= 2:
                z = sample_bilinear(h, pts[:, 0], pts[:, 1])
                ds = np.maximum(np.hypot(*np.diff(pts, axis=0).T) * RAW_M, 1e-6)
                deg = max_gradient_deg(z, ds)
                stats.append({"id": way["id"], "kind": kind, "graded": False,
                              "before": deg, "after": deg, "metres": 0.0,
                              "crossingM": 0.0, "worst": None})
            continue

        xs, ys = pts[:, 0], pts[:, 1]
        ds = np.maximum(np.hypot(*np.diff(pts, axis=0).T) * RAW_M, 1e-6)
        before = max_gradient_deg(sample_bilinear(h, xs, ys), ds)
        z = sample_bilinear(cur, xs, ys).astype(np.float64)

        ix = np.clip(np.round(xs).astype(int), 0, nx - 1)
        iy = np.clip(np.round(ys).astype(int), 0, ny - 1)
        # Every open-water sample is a crossing: a ford bed, the gap under a
        # bridge, or the last metres of a quay. Nothing is graded there, and
        # the dry runs either side are pinned to the water's-edge height, so a
        # way ties into the shore instead of ending on a cliff above it.
        crossing = (wet[iy, ix] if wet is not None
                    else np.zeros(len(pts), dtype=bool))
        # Never cut a way that starts above the sea down below it.
        floor = np.where((z > 0.0) & ~crossing, WATER_CLEARANCE_M, -1e9)

        g = z.copy()
        i0 = 0
        while i0 < len(pts):
            if crossing[i0]:
                i0 += 1
                continue
            i1 = i0
            while i1 + 1 < len(pts) and not crossing[i1 + 1]:
                i1 += 1
            if i1 - i0 >= 2:
                seg, dseg = slice(i0, i1 + 1), ds[i0:i1]
                cap = GRADIENT_CAP_DEG[kind]
                g[seg] = grade_profile(z[seg], dseg, cap,
                                       _slope_feasible_envelope(floor[seg], dseg, cap),
                                       MAX_OFFSET_M[kind])
            i0 = i1 + 1

        flat_m = FLAT_WIDTH_M[kind]
        # At 1.83 m per sample a 2.4 m footpath is barely one texel wide, so
        # the flat band is floored at MIN_FLAT_PX: below that there is no
        # running surface to protect from the next way's shoulder.
        r_flat = max(0.5 * flat_m / RAW_M, MIN_FLAT_PX)
        r_base = (0.5 * flat_m + SHOULDER_FACTOR * flat_m) / RAW_M
        r_max = (0.5 * flat_m + MAX_SHOULDER_M) / RAW_M
        rim_tan = math.tan(math.radians(RIM_MAX_DEG))

        pad = int(math.ceil(r_max)) + 2
        by0 = max(0, int(ys.min()) - pad); by1 = min(ny, int(ys.max()) + pad + 1)
        bx0 = max(0, int(xs.min()) - pad); bx1 = min(nx, int(xs.max()) + pad + 1)
        wz = np.zeros((by1 - by0, bx1 - bx0), dtype=np.float32)
        ws = np.zeros_like(wz)
        wmax = np.zeros_like(wz)
        graded_m = 0.0

        for i in range(len(pts)):
            if crossing[i]:
                continue
            cx, cy, cz = xs[i], ys[i], g[i]
            # Bench the shoulder: the blend carries the cut/fill depth under
            # the way back to untouched ground, so it must be at least
            # 1.5 x depth / tan(RIM_MAX_DEG) long (1.5 = a smoothstep's peak
            # slope over its average).
            rf = int(math.ceil(r_flat)) + 1
            y0, y1 = max(0, int(cy) - rf), min(ny, int(cy) + rf + 1)
            x0, x1 = max(0, int(cx) - rf), min(nx, int(cx) + rf + 1)
            if y1 <= y0 or x1 <= x0:
                continue
            depth = float(np.abs(cur[y0:y1, x0:x1] - cz).max())
            r_out = min(max(r_base, 1.5 * depth / rim_tan / RAW_M + r_flat), r_max)

            rr = int(math.ceil(r_out)) + 1
            y0, y1 = max(by0, int(cy) - rr), min(by1, int(cy) + rr + 1)
            x0, x1 = max(bx0, int(cx) - rr), min(bx1, int(cx) + rr + 1)
            if y1 <= y0 or x1 <= x0:
                continue
            yy = np.arange(y0, y1)[:, None] - cy
            xx = np.arange(x0, x1)[None, :] - cx
            t = np.clip((r_out - np.hypot(yy, xx)) / max(r_out - r_flat, 1e-6), 0.0, 1.0)
            w = (t * t * (3.0 - 2.0 * t)).astype(np.float32)   # smoothstep
            sy, sx = slice(y0 - by0, y1 - by0), slice(x0 - bx0, x1 - bx0)
            np.maximum(wmax[sy, sx], w, out=wmax[sy, sx])
            ws[sy, sx] += w
            wz[sy, sx] += w * np.float32(cz)
            graded_m += float(ds[min(i, len(ds) - 1)])

        bb = (slice(by0, by1), slice(bx0, bx1))
        eff = wmax * (1.0 - locked[bb])       # an earlier way's surface wins
        if submerged is not None:
            eff = np.where(submerged[bb], 0.0, eff)   # never fill open water
        touched = eff > 0
        tgt = wz[touched] / np.maximum(ws[touched], 1e-6)
        cur[bb][touched] = (cur[bb][touched] * (1.0 - eff[touched])
                            + tgt * eff[touched]).astype(np.float32)
        np.maximum(locked[bb], wmax, out=locked[bb])

        stats.append({"id": way["id"], "kind": kind, "graded": True,
                      "before": before, "after": before, "metres": graded_m,
                      "crossingM": float(ds[crossing[:-1]].sum()) if len(ds) else 0.0,
                      "_pts": pts, "_ds": ds, "_crossing": crossing, "worst": None})

    # Honest 'after' numbers: re-measure on the surface a player will actually
    # walk, skipping ford/bridge gaps (which are crossed, not walked down).
    for s in stats:
        pts = s.pop("_pts", None)
        if pts is None:
            continue
        ds, crossing = s.pop("_ds"), s.pop("_crossing")
        z = sample_bilinear(cur, pts[:, 0], pts[:, 1])
        seg_ok = ~(crossing[:-1] | crossing[1:])
        slopes = np.degrees(np.arctan(np.abs(np.diff(z)) / ds))
        s["after"] = float(slopes[seg_ok].max()) if seg_ok.any() else 0.0
        if seg_ok.any():
            idx = np.flatnonzero(seg_ok)
            wi = int(idx[np.argmax(slopes[idx])])
            cap = GRADIENT_CAP_DEG[s["kind"]]
            over = seg_ok & (slopes > cap)
            s["worst"] = {"deg": float(slopes[wi]),
                          "km": [round(float(pts[wi, 0]) * RAW_M / 1000.0, 3),
                                 round(float(pts[wi, 1]) * RAW_M / 1000.0, 3)],
                          # where along the way the worst step sits, 0 = the
                          # place end (a minor way is traced from its place
                          # back to the network), 1 = the junction.
                          "frac": round(wi / max(len(slopes) - 1, 1), 3),
                          "overM": float(ds[over].sum()),
                          "lengthM": float(ds.sum())}
    return cur, stats


# --------------------------------------------------------------------------
# report + CLI
# --------------------------------------------------------------------------
def over_line(over: list[dict], stats: list[dict]) -> str:
    graded = [r for r in stats if r.get("graded")]
    return f"{len(over)} of {len(graded)}"


def where_label(frac: float) -> str:
    """Where the worst step sits along the way. A minor way is traced from the
    place it serves back to the network, so 0 is the place end."""
    if frac <= 0.15:
        return "the place end"
    if frac >= 0.85:
        return "the junction end"
    return f"mid-way ({frac:.0%})"


def remedy(stat: dict) -> str:
    """The authored piece this survivor needs, from the shape of its defect.

    A step at the very end is the approach to a place sited on steep ground:
    the way is right and the last few metres are a stair or a ramped terrace.
    A step in the middle of a way is a gap in the ground the line must cross:
    a boardwalk or a bridge deck over it. A long over-cap run is neither — it
    is a hill climb, and the piece is a flight of steps up it.
    """
    w = stat["worst"]
    if w["overM"] <= 20.0:
        return "one step or deck piece over the lip"
    if w["overM"] > 120.0:
        return "stepped ascent (authored flight) over the climb"
    if w["frac"] <= 0.15 or w["frac"] >= 0.85:
        return "stair or ramped terrace on the approach"
    return "boardwalk or bridge deck over the step"


def major_repairs(province: Path) -> list[str]:
    """The per-road record `reroute_majors` left, as report lines."""
    marker = province / "routes-repaired-by.json"
    roads = json.loads(marker.read_text()).get("roads", []) if marker.exists() else []
    if not roads:
        return []
    L = ["## Major roads: stretches re-routed before grading", "",
         "`worldgen.reroute_majors` re-solved every stretch of a published road "
         "whose natural longitudinal gradient was over the class cap, between "
         "that stretch's own endpoints, with the gradient wall on. The road "
         "keeps its ends, its length changes, and the natural corridors are "
         "kept as `routes-natural.json` for siting to score against.", "",
         "| road | class | natural max before | after | stretches | points |",
         "| --- | --- | --- | --- | --- | --- |"]
    for r in sorted(roads, key=lambda r: r["id"]):
        L.append("| `{}` | {} | {:.1f} | {:.1f} | {} | {} → {} |".format(
            r["id"], r["kind"], r["beforeDeg"], r["afterDeg"], r["stretches"],
            r["pxBefore"], r["pxAfter"]))
    return L + [""]


def write_report(stats: list[dict], path: Path, cells: int,
                 province: Path | None = None) -> str:
    by_kind: dict[str, list[dict]] = {}
    for s in stats:
        by_kind.setdefault(s["kind"], []).append(s)
    lines = ["# Route grading",
             "",
             "Generated by `python3 -m worldgen.grade_routes` (deterministic).",
             "Longitudinal gradient along every way's centreline, before and after",
             "grading; the shoulder is benched so no blend face exceeds "
             f"{RIM_MAX_DEG:.0f} deg.",
             "",
             "| class | ways | cap deg | max grad before | max grad after | metres graded | ford/bridge m |",
             "| --- | --- | --- | --- | --- | --- | --- |"]
    for kind in sorted(by_kind):
        rows = by_kind[kind]
        cap = GRADIENT_CAP_DEG.get(kind)
        lines.append("| {} | {} | {} | {:.1f} | {:.1f} | {:.0f} | {:.0f} |".format(
            kind, len(rows), f"{cap:.0f}" if cap else "n/a (not graded)",
            max(r["before"] for r in rows), max(r["after"] for r in rows),
            sum(r["metres"] for r in rows),
            sum(r.get("crossingM", 0.0) for r in rows)))
    over = [r for r in stats if r.get("graded")
            and r["after"] > GRADIENT_CAP_DEG[r["kind"]] + 1.0]
    lines += ["", f"Heightfield samples changed: {cells}.", "",
              f"Ways still over their cap: {over_line(over, stats)}. Routing now "
              "holds the gradient itself — both solvers wall off any step over "
              "the class cap (`routes.grade_factor`), so a line climbs a spur "
              "by switchback or contour instead of head-on. What survives is "
              "not a line that could have gone round: it is ground that has to "
              "be climbed to reach the place at the end of it, and the honest "
              "remedy is authored geometry (a stair, a ramped terrace, a "
              "boardwalk or a bridge over the gap), not a deeper cut.", ""]
    if over:
        lines += ["## Survivors and what each one needs", "",
                  "| way | class | worst deg | over-cap m | where | remedy |",
                  "| --- | --- | --- | --- | --- | --- |"]
        for s in sorted(over, key=lambda s: (-s["worst"]["deg"], s["id"])):
            w = s["worst"]
            lines.append("| `{}` | {} | {:.1f} | {:.0f} of {:.0f} | {} | {} |".format(
                s["id"], s["kind"], w["deg"], w["overM"], w["lengthM"],
                where_label(w["frac"]), remedy(s)))
        lines.append("")
    lines += major_repairs(province or PROVINCE)
    lines += ["## Worst ten remaining spots", "",
              "| way | class | deg | km east | km south |", "| --- | --- | --- | --- | --- |"]
    worst = sorted((r for r in stats if r.get("worst")),
                   key=lambda r: (-r["worst"]["deg"], r["id"]))[:10]
    for r in worst:
        w = r["worst"]
        lines.append("| {} | {} | {:.1f} | {:.2f} | {:.2f} |".format(
            r["id"], r["kind"], w["deg"], w["km"][0], w["km"][1]))
    text = "\n".join(lines) + "\n"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)
    return text


def snapshot_natural_state(height_path: Path, province: Path) -> tuple[Path, Path]:
    """Freeze the pre-grading state and return the ungraded heightfield path.

    Grading reshapes the ground *because of* where the plot put places and
    where the route solvers ran, and the water bake then follows the graded
    ground. Re-scoring siting on that surface is a feedback loop that quietly
    moves committed records, so the natural state is snapshotted once and the
    siting layer (`site_fields.ProvinceSurvey`) reads the snapshot. A fresh
    `refine_province` run makes the refined heights newer than the snapshot,
    which refreshes it.
    """
    ungraded = height_path.with_name("refined-height-ungraded-f32.npy")
    marker = height_path.with_name("refined-height-graded-by.json")
    # The snapshot is valid only while the refined heights are still the ones
    # THIS tool last wrote. Anything else (a fresh refine_province) means the
    # natural state moved on. An mtime test alone would be fatal here: our own
    # output is always newer than the snapshot it came from.
    fingerprint = {"size": height_path.stat().st_size,
                   "mtime_ns": height_path.stat().st_mtime_ns}
    stale = not ungraded.exists() or not marker.exists() \
        or json.loads(marker.read_text()) != fingerprint
    if stale:
        shutil.copy2(height_path, ungraded)
    water, natural = province / "water", province / "water" / "natural"
    if water.exists() and (stale or not natural.exists()):
        natural.mkdir(parents=True, exist_ok=True)
        for f in sorted(water.glob("water-*")):
            shutil.copy2(f, natural / f.name)
    return ungraded, marker


def main() -> None:
    from .compile_chunks import DEFAULT_HEIGHTS

    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("heights", nargs="?", default=str(DEFAULT_HEIGHTS))
    ap.add_argument("--province", default=str(PROVINCE))
    ap.add_argument("--dry-run", action="store_true", help="report only, write no rasters")
    args = ap.parse_args()

    height_path = Path(args.heights)
    province = Path(args.province)
    ungraded, marker = snapshot_natural_state(height_path, province)
    h = np.load(ungraded)
    level, wet = _water_fields(province, h.shape)
    graded, stats = grade(h, ways(province), level, wet)
    cells = int((graded != h).sum())
    print(write_report(stats, REPORT_PATH, cells, province))
    if args.dry_run:
        return
    np.save(height_path, graded)
    marker.write_text(json.dumps({"size": height_path.stat().st_size,
                                  "mtime_ns": height_path.stat().st_mtime_ns}))
    # keep the studio's 2D height raster in step with the graded surface
    # Studio rasters. `height-rg.png` is the GRADED surface (what the world
    # is); `height-natural-rg.png` is the ungraded one, which is what SITING
    # scores on — the macro plot and the route networks were solved on natural
    # ground, and re-scoring them on ground that was shaped *because* of them
    # is a feedback loop that quietly moves committed places.
    meta_path = province / "refined" / "meta.json"
    meta = json.loads(meta_path.read_text())
    lo, hi = meta["heightMinMetres"], meta["heightMaxMetres"]
    natural_half = ndimage.gaussian_filter(h, 1.0)[::2, ::2]
    graded_half = ndimage.gaussian_filter(graded, 1.0)[::2, ::2]
    lo = min(lo, float(natural_half.min()), float(graded_half.min()))
    hi = max(hi, float(natural_half.max()), float(graded_half.max()))

    def save(arr, name):
        q = np.round((arr - lo) / (hi - lo) * 65535.0).astype(np.uint16)
        rg = np.zeros((*q.shape, 3), dtype=np.uint8)
        rg[..., 0] = q >> 8
        rg[..., 1] = q & 0xFF
        Image.fromarray(rg).save(province / "refined" / name)

    save(graded_half, "height-rg.png")
    save(natural_half, NATURAL_HEIGHT_FILE)
    meta["heightMinMetres"], meta["heightMaxMetres"] = lo, hi
    meta["naturalHeight"] = NATURAL_HEIGHT_FILE
    meta_path.write_text(json.dumps(meta, indent=2))
    print(f"graded heightfield written: {height_path} ({cells} samples changed)")


if __name__ == "__main__":
    main()
