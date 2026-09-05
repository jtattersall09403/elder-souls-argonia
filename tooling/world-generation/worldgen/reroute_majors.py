"""Re-route the over-cap stretches of the MAJOR roads (owner requirement 2026-09-05).

    cd tooling/world-generation
    python3 -m worldgen.reroute_majors            # rewrites routes.json in place
    python3 -m worldgen.reroute_majors --dry-run  # report only

WHY THIS EXISTS
---------------
Every road and path must be a realistic walkable gradient for its whole
length. `grade_routes` cuts and fills the ground under a way, but where the
LINE is wrong — straight up a 60 deg spur — no cut or fill inside the class
budget can hold the cap, and the report leaves the way steep. The fix is
upstream, in routing.

For the minor network that fix lives in `compile_minor_routes`, whose solver
now carries the gradient of each step (`routes.grade_factor`). The major roads
are different: their solver is `compile_society`, a Phase 4 step that also
derives danger, cultures and territories from the same run, so re-solving them
there would re-derive half the province to fix ten roads. Instead the
published polylines in `routes.json` are repaired in place: each stretch whose
longitudinal gradient exceeds the class cap is re-solved between its own
endpoints with the same gradient-walled Dijkstra, on the published rasters,
inside a local box. The road keeps its identity, its ends and its registry id;
only the steep stretch is replaced — by a switchback or a contour line.

Known seam: `compile_society`'s danger model gives relief along the road mask
it solved. A re-routed stretch moves the tarmac a few hundred metres without
moving that relief. The two agree again the next time Phase 4 is re-run; the
deviation is local and small, and re-deriving cultures and danger to chase it
would be a far larger change than the defect.

WHERE IT SITS IN THE CHAIN
--------------------------
    **reroute_majors** → compile_minor_routes → grade_routes → compile_chunks
    → export_web_chunks → compile_water → rebake_landcover → compile_scatter

It runs BEFORE the minor network (which seeds off the major roads) and before
grading. Deterministic: no randomness; heap ties break by (cost, row, col).
"""

from __future__ import annotations

import argparse
import heapq
import json
from pathlib import Path

import numpy as np

from .compile_minor_routes import cost_surface
from .grade_routes import GRADIENT_CAP_DEG, sample_bilinear
from .routes import NEIGHBOR_OFFSETS, grade_factor
from .site_fields import ProvinceSurvey

REPO_ROOT = Path(__file__).resolve().parents[3]
PROVINCE = REPO_ROOT / "apps" / "world-studio" / "public" / "province"
ROUTES_PATH = PROVINCE / "routes.json"

PAD_PX = 6          # polyline points of good road kept either side of a steep
                    # run, so the re-solve may move the whole approach and not
                    # just the step; widened on each further pass with the box.
BOX_PAD_PX = 45     # room the re-solve is given to switchback, grid px ...
MAX_PASSES = 4      # ... doubled on each further pass, because a stretch that
                    # a 250 m box cannot fix is one that needs to go round a
                    # whole shoulder. Each pass re-measures: fixing one run
                    # can reveal the next.


def segment_gradients(px: list, height: np.ndarray, px_m: float) -> np.ndarray:
    """Longitudinal gradient (degrees) of each px-to-px segment of a polyline.

    `routes.json` polylines are decimated (one point per three grid px), so a
    segment is resampled at one grid cell and the segment takes the worst
    gradient along it: measuring endpoint-to-endpoint would hide exactly the
    step the report catches. Measured on the grid heights, the same field the
    solver costs against — the sub-cell relief below that is what grading is
    for.
    """
    p = np.asarray(px, dtype=np.float64)
    out = np.zeros(len(p) - 1)
    for i in range(len(p) - 1):
        a, b = p[i], p[i + 1]
        n = max(int(round(max(abs(b[0] - a[0]), abs(b[1] - a[1])))), 1)
        t = np.linspace(0.0, 1.0, n + 1)
        xs, ys = a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t
        z = sample_bilinear(height, xs, ys)
        d = np.maximum(np.hypot(np.diff(xs), np.diff(ys)) * px_m, 1e-6)
        out[i] = float(np.degrees(np.arctan(np.abs(np.diff(z)) / d)).max())
    return out


def steep_runs(deg: np.ndarray, cap: float, pad: int = PAD_PX) -> list[tuple[int, int]]:
    """Merged, padded index ranges (i, j) of the polyline whose segments are
    over `cap`. Returned in order, non-overlapping."""
    hot = np.flatnonzero(deg > cap)
    if not len(hot):
        return []
    runs: list[list[int]] = []
    for i in hot:
        i0, i1 = int(i) - pad, int(i) + 1 + pad
        if runs and i0 <= runs[-1][1]:
            runs[-1][1] = max(runs[-1][1], i1)
        else:
            runs.append([i0, i1])
    n = len(deg) + 1
    return [(max(0, a), min(n - 1, b)) for a, b in runs]


def solve_box(cost: np.ndarray, height: np.ndarray, px_m: float, cap_deg: float,
              start: tuple[int, int], goal: tuple[int, int],
              box: tuple[int, int, int, int]) -> list[tuple[int, int]] | None:
    """Gradient-walled Dijkstra from `start` to `goal` (both (col, row)) inside
    `box` = (row0, row1, col0, col1). Returns the px list, ends included."""
    r0, r1, c0, c1 = box
    sub_cost = cost[r0:r1, c0:c1]
    sub_h = height[r0:r1, c0:c1]
    hh, ww = sub_cost.shape
    sy, sx = start[1] - r0, start[0] - c0
    gy, gx = goal[1] - r0, goal[0] - c0
    if not (0 <= sy < hh and 0 <= sx < ww and 0 <= gy < hh and 0 <= gx < ww):
        return None
    dist = np.full((hh, ww), np.inf)
    prev = np.full((hh, ww), -1, dtype=np.int64)
    dist[sy, sx] = 0.0
    heap = [(0.0, sy, sx)]
    while heap:
        d, y, x = heapq.heappop(heap)
        if d > dist[y, x]:
            continue
        if (y, x) == (gy, gx):
            break
        cyx, zyx = sub_cost[y, x], float(sub_h[y, x])
        for dy, dx in NEIGHBOR_OFFSETS:
            ny, nx = y + dy, x + dx
            if 0 <= ny < hh and 0 <= nx < ww:
                run = (1.4142135623730951 if dy and dx else 1.0) * px_m
                nd = d + run * 0.5 * (cyx + sub_cost[ny, nx]) * float(
                    grade_factor(float(sub_h[ny, nx]) - zyx, run, cap_deg))
                if nd < dist[ny, nx]:
                    dist[ny, nx] = nd
                    prev[ny, nx] = y * ww + x
                    heapq.heappush(heap, (nd, ny, nx))
    if not np.isfinite(dist[gy, gx]):
        return None
    out: list[tuple[int, int]] = []
    cur = gy * ww + gx
    while cur >= 0:
        out.append((cur % ww + c0, cur // ww + r0))
        cur = int(prev[cur // ww, cur % ww])
    out.reverse()
    return out


def repair(px: list, kind: str, cost: np.ndarray, height: np.ndarray,
           px_m: float) -> tuple[list, list[dict]]:
    """Re-solve every over-cap stretch of one road. Returns (px, edits)."""
    cap = GRADIENT_CAP_DEG[kind]
    cur = [(int(c), int(r)) for c, r in px]
    edits: list[dict] = []
    for p in range(MAX_PASSES):
        deg = segment_gradients(cur, height, px_m)
        runs = steep_runs(deg, cap, PAD_PX * (p + 1))
        if not runs:
            break
        pad = BOX_PAD_PX * (p + 1)
        for a, b in reversed(runs):            # right to left: indices stay valid
            r0 = max(0, min(p[1] for p in cur[a:b + 1]) - pad)
            r1 = min(cost.shape[0], max(p[1] for p in cur[a:b + 1]) + pad + 1)
            c0 = max(0, min(p[0] for p in cur[a:b + 1]) - pad)
            c1 = min(cost.shape[1], max(p[0] for p in cur[a:b + 1]) + pad + 1)
            new = solve_box(cost, height, px_m, cap, cur[a], cur[b], (r0, r1, c0, c1))
            if new is None or len(new) < 2:
                continue
            before = float(deg[a:b].max())
            after = float(segment_gradients(new, height, px_m).max())
            if after >= before - 0.05:
                continue                       # no honest improvement: keep the line
            cur = cur[:a] + new + cur[b + 1:]
            edits.append({"fromIdx": a, "beforeDeg": before, "afterDeg": after,
                          "addedPx": len(new) - (b - a + 1)})
    return [[int(c), int(r)] for c, r in cur], edits


def snapshot_natural_routes(province: Path) -> None:
    """Freeze the pre-repair road geometry as `routes-natural.json`.

    The macro plot scores a place partly on how near a road it is, so a
    repaired corridor would quietly re-plot committed records — the same
    feedback loop `grade_routes` guards against on the heights. Siting reads
    the snapshot (`site_fields`), the world carries the repair. The snapshot
    is valid only while `routes.json` is still the file THIS tool last wrote:
    anything else (a fresh `compile_society`) means the natural state moved on
    and the snapshot is retaken.
    """
    src = province / "routes.json"
    snap = province / "routes-natural.json"
    marker = province / "routes-repaired-by.json"
    fingerprint = {"size": src.stat().st_size, "mtime_ns": src.stat().st_mtime_ns}
    stamped = json.loads(marker.read_text()) if marker.exists() else {}
    if not snap.exists() or {k: stamped.get(k) for k in fingerprint} != fingerprint:
        snap.write_text(src.read_text())


def _stamp(province: Path, report: list[dict] | None = None) -> None:
    """Mark the snapshot as current and keep the per-road record of what was
    re-routed. `grade_routes` reads the record into its report, so the whole
    gradient story stays in one file."""
    src = province / "routes.json"
    (province / "routes-repaired-by.json").write_text(json.dumps(
        {"size": src.stat().st_size, "mtime_ns": src.stat().st_mtime_ns,
         "roads": report or []}, indent=1))


def run(write: bool = True, province: Path = PROVINCE) -> list[dict]:
    if write:
        snapshot_natural_routes(province)
    doc = json.loads((province / "routes-natural.json").read_text()
                     if (province / "routes-natural.json").exists()
                     else (province / "routes.json").read_text())
    s = ProvinceSurvey(province)
    cost = cost_surface(s)
    height = s.height_grid
    px_m = s.grid_px_m
    report: list[dict] = []
    for route in doc.get("routes", []):
        cls = route.get("class")
        if cls not in ("road", "trunk"):
            continue
        kind = "trunk_road" if cls == "trunk" else "road"
        px = route.get("px", [])
        if len(px) < 3:
            continue
        before = float(segment_gradients(px, height, px_m).max())
        new_px, edits = repair(px, kind, cost, height, px_m)
        deg_after = segment_gradients(new_px, height, px_m)
        after = float(deg_after.max())
        wi = int(np.argmax(deg_after))
        worst_px = new_px[wi]
        route["px"] = new_px
        seg = np.hypot(*np.diff(np.asarray(new_px, dtype=np.float64), axis=0).T)
        route["lengthKm"] = round(float(seg.sum()) * px_m / 1000.0, 2)
        report.append({"id": route.get("id") or f"{route.get('from')}->{route.get('to')}",
                       "kind": kind, "cap": GRADIENT_CAP_DEG[kind],
                       "beforeDeg": before, "afterDeg": after,
                       "stretches": len(edits),
                       "pxBefore": len(px), "pxAfter": len(new_px),
                       "worstKm": [round(worst_px[0] * px_m / 1000.0, 2),
                                   round(worst_px[1] * px_m / 1000.0, 2)],
                       "atEnd": wi < 3 or wi > len(new_px) - 4})
    if write:
        (province / "routes.json").write_text(json.dumps(doc))
        _stamp(province, report)
    return report


def digest(report: list[dict]) -> str:
    L = ["| road | class | cap | natural max before | after | stretches re-routed | px | worst km E/S |",
         "| --- | --- | --- | --- | --- | --- | --- | --- |"]
    for r in sorted(report, key=lambda r: r["id"]):
        L.append("| `{}` | {} | {:.0f} | {:.1f} | {:.1f} | {} | {} → {} | {}, {}{} |".format(
            r["id"], r["kind"], r["cap"], r["beforeDeg"], r["afterDeg"],
            r["stretches"], r["pxBefore"], r["pxAfter"],
            r["worstKm"][0], r["worstKm"][1], " (at a fixed end)" if r["atEnd"] else ""))
    return "\n".join(L)


def main(argv: list[str] | None = None) -> None:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args(argv)
    report = run(write=not a.dry_run)
    print(digest(report))


if __name__ == "__main__":
    main()
