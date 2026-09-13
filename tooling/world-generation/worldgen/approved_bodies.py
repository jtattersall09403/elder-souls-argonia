"""The owner-approved standing-water record (the 16a hydrograph, 2026-09-11).

The owner reviewed the 16a map's bodies — every lake, tarn, pond, pool,
marsh sheet and lagoon, with its kind — and approved them. 16b round 1 then
rebuilt the ground and re-derived the graph on it, and the approved record
was overwritten by whatever the new ground happened to hold: a pit rule
filled ~100 approved mountain ponds, the bench pattern breached tarns, the
shaping's noise erased marsh hollows, and the northern sea-level marsh was
re-labelled. Owner 2026-09-12: nothing changes by accident; the approved
version is not substantially altered; tweaks that 16b's own goals need
(the authored lake, plunge pools, ruling 2's data holes, a channel that
captures or joins a body to the sea) are allowed and LISTED.

So the 16a bodies are a register the build must keep:

* `world/sources/hydrology/approved-bodies.json` — the semantic record
  (id, kind, level, depth, area, outline bbox) per approved body, plus the
  bodies ruling 2 fills (data holes: a floor near sea level under a high
  rim) and the sha of the outline raster.
* `<vault>/approved-bodies-16a.npz` — the exact outlines (a label raster)
  and the 16a ground inside them, regenerated from the 16a commit's own
  sculpt (`python3 -m worldgen.approved_bodies build ...`).

`restore` (the shape stage, after every other edit): inside each approved
outline the ground IS the 16a ground again (re-imposed, feathered at the
edge), and the rim ring is raised to the approved level where it was
breached (bounded). `match` (the graph derive): a measured body that
overlaps an approved outline takes the approved id and KIND (its measured
kind is recorded beside it); an approved body no measured body realises is
listed in `stats.approvedBodies.missing` and fails the freeze gate unless
the build can name the tweak that superseded it (inside the authored lake;
captured or joined to the sea by a carved channel).
"""

from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import numpy as np
from scipy import ndimage

from .scale import RAW_M
from .standing_water import CONN8

REPO_ROOT = Path(__file__).resolve().parents[3]
REGISTER_PATH = REPO_ROOT / "world" / "sources" / "hydrology" / "approved-bodies.json"
VAULT_FILE = "approved-bodies-16a.npz"
SCHEMA_VERSION = 1
APPROVED_BY = "16a (owner, 2026-09-11)"

DATA_HOLE_MIN_LEVEL_M = 30.0     # ruling 2: a bowl inside high terrain...
DATA_HOLE_FLOOR_MAX_M = 5.0      # ...whose floor is near sea level is a data hole, filled
RIM_ABOVE_M = 0.10               # a restored rim stands this over the approved level
RIM_RAISE_CAP_M = 6.0            # ...raised by at most this (a breach is usually one channel a few cells wide)
RIM_RING_CELLS = 4               # ~7 m: wide enough that a passing channel's rim test ends outside it
MATCH_MIN_OVERLAP = 0.30         # of the smaller of the two areas


# ---------------------------------------------------------------------------
# build (once, from the 16a commit's regenerated arrays)
# ---------------------------------------------------------------------------

FALL_WINDOW_M = 30.0             # the 16a ground is re-imposed this far around a 16a fall's plunge
FALL_MATCH_M = 45.0              # a derived fall within this of a 16a plunge realises it
SUSPECT_FALL_LIP_M = 15.0        # = hydrology_graph.SUSPECT_FALL_LIP_M


def build(graph16a: Path, bodies_npz: Path, sculpt16a: Path, vault: Path, pass1_16a: Path | None = None,
          register: Path = REGISTER_PATH, log=print) -> dict:
    from .standing_water import upsample
    g = json.loads(graph16a.read_text(encoding="utf-8"))
    z = np.load(bodies_npz)
    label_all = z["body"].copy()
    ground = np.load(sculpt16a)
    # the sea-level sheets (the northern marsh, the lagoons) are not in the
    # body raster: they are components of the sea-connected water the coarse
    # pass does not call ocean — outline them the same way the graph does
    n_body = int(label_all.max())
    if pass1_16a is not None:
        p1 = np.load(pass1_16a)
        lag = z["sea"] & ~upsample(p1["ocean"], 3, z["sea"].shape)
        lag_lbl, _ = ndimage.label(lag, structure=CONN8)
        label_all = np.where(lag_lbl > 0, lag_lbl + n_body, label_all).astype(np.int32)
    keep, holes = [], []
    used: set[int] = set()
    label = np.zeros(label_all.shape, dtype=np.int32)
    n = 0
    for b in g["bodies"]:
        if b["origin"] != "measured" or b["kind"] == "ocean" or b.get("deepestCell") is None:
            continue
        dx, dy = b["deepestCell"]
        lb = int(label_all[dy, dx])
        rec = {k: b[k] for k in ("id", "kind", "levelM", "maxDepthM", "areaM2", "sheet", "season",
                                 "altitudeBand", "deepestCell", "bboxCells", "region")}
        if b["levelM"] >= DATA_HOLE_MIN_LEVEL_M and b["levelM"] - b["maxDepthM"] < DATA_HOLE_FLOOR_MAX_M:
            rec["why"] = "ruling 2: floor near sea level under a high rim (a data hole in the source)"
            holes.append(rec)
            continue
        if lb == 0:
            # the regenerated sculpt is not byte-identical to the 16a run's: a
            # deepest cell can land a sample off its body; take the body that
            # fills most of the committed outline's box, if it is a fair match
            x0, y0, x1, y1 = b["bboxCells"]
            win = label_all[max(y0, 0):y1 + 1, max(x0, 0):x1 + 1]
            cnt = np.bincount(win.ravel())
            cnt[0] = 0
            if cnt.size > 1 and cnt.max() > 0:
                cand = int(cnt.argmax())
                cand_area = float((label_all == cand).sum()) * RAW_M * RAW_M
                if 0.5 <= cand_area / max(b["areaM2"], 1.0) <= 2.0 and cand not in used:
                    lb = cand
        if lb == 0 or lb in used:
            rec["why"] = "no outline in the regenerated 16a body raster"
            holes.append(rec)
            continue
        used.add(lb)
        n += 1
        label[label_all == lb] = n
        rec["label"] = n
        rec["seaLevel"] = bool(lb > n_body)
        keep.append(rec)
    # the 16a waterfalls: the ground around each plunge is re-imposed so the
    # face the owner approved stays a face
    fallwin = np.zeros(label_all.shape, dtype=np.int32)
    falls = []
    r_px = int(round(FALL_WINDOW_M / RAW_M))
    suspect_falls = []
    k = 0
    for r in (r for r in g["reaches"] if r.get("fall")):
        f = r["fall"]
        # a low bank stepping straight into sea-level water is the source's
        # quantised shelf, not relief (owner 2026-09-11: only real relief
        # makes a fall; those banks are ramped) — not carried
        if float(f.get("lipLevelM", 99)) < SUSPECT_FALL_LIP_M and float(f.get("plungeLevelM", 99)) <= 0.05 \
                and float(f["dropM"]) < SUSPECT_FALL_LIP_M:
            suspect_falls.append({"reachId": r["id"], "dropM": f["dropM"], "why": "coastal-terrace-step: a bank under 15 m into sea-level water (owner 2026-09-11)"})
            continue
        line = np.asarray(r["centreline"], dtype=np.float64) / RAW_M     # the fall reach IS the face
        if len(line) == 0:
            continue
        k += 1
        x, y = int(round(line[-1][0])), int(round(line[-1][1]))         # the plunge: the face's foot
        y0 = max(int(line[:, 1].min()) - r_px, 0); y1 = min(int(line[:, 1].max()) + r_px + 1, fallwin.shape[0])
        x0 = max(int(line[:, 0].min()) - r_px, 0); x1 = min(int(line[:, 0].max()) + r_px + 1, fallwin.shape[1])
        fallwin[y0:y1, x0:x1] = k
        falls.append({"reachId": r["id"], "dropM": f["dropM"], "lipLevelM": f.get("lipLevelM"),
                      "plungeLevelM": f.get("plungeLevelM"), "plungeCell": [x, y], "window": [x0, y0, x1, y1], "label": k})
    heights = np.where((label > 0) | (fallwin > 0), ground, np.nan).astype(np.float32)
    out = vault / VAULT_FILE
    np.savez_compressed(out, label=label, heights=heights, fallwin=fallwin)
    sha = hashlib.sha256(np.ascontiguousarray(label).tobytes()).hexdigest()
    prev = json.loads(register.read_text(encoding="utf-8")) if register.exists() else {}
    doc = {"schemaVersion": SCHEMA_VERSION, "approvedBy": APPROVED_BY,
           "source": {"graph": "world/sources/hydrology/hydrology-graph.json at c2494a16 (the 16a acceptance)",
                      "sculptSha256": hashlib.sha256(np.ascontiguousarray(ground).tobytes()).hexdigest(),
                      "outlinesSha256": sha, "outlines": VAULT_FILE},
           "about": __doc__.split("\n\n")[1].strip(),
           "bodies": keep, "notCarried": holes, "falls": falls, "fallsNotCarried": suspect_falls}
    for k in ("routing", "routingSha256", "routingAbout"):
        if k in (prev.get("source") or {}):
            doc["source"][k] = prev["source"][k]
    register.write_text(json.dumps(doc, indent=1) + "\n", encoding="utf-8")
    log(f"approved bodies: {len(keep)} carried ({sum(1 for b in keep if b['seaLevel'])} sea-level sheets), "
        f"{len(holes)} not carried (ruling 2 data holes, or no outline); {len(falls)} falls; outlines -> {out}")
    return doc


# ---------------------------------------------------------------------------
# load
# ---------------------------------------------------------------------------

def load(vault: Path, register: Path = REGISTER_PATH):
    """(register dict, label raster, 16a heights inside the outlines) or
    (None, None, None) when the register does not exist yet."""
    if not register.exists():
        return None, None, None, None
    doc = json.loads(register.read_text(encoding="utf-8"))
    path = vault / doc["source"]["outlines"]
    if not path.exists():
        raise SystemExit(f"approved bodies: {path} missing; run `python3 -m worldgen.approved_bodies build` "
                         f"(the register {register} names it)")
    z = np.load(path)
    label = z["label"]
    sha = hashlib.sha256(np.ascontiguousarray(label).tobytes()).hexdigest()
    if sha != doc["source"]["outlinesSha256"]:
        raise SystemExit(f"approved bodies: {path} does not match the register's outlinesSha256")
    return doc, label, z["heights"], z["fallwin"] if "fallwin" in z.files else np.zeros_like(label)


# ---------------------------------------------------------------------------
# restore (the shape stage)
# ---------------------------------------------------------------------------

def restore(h: np.ndarray, doc: dict, label: np.ndarray, heights: np.ndarray,
            skip: np.ndarray, fallwin: np.ndarray | None = None, log=print) -> tuple[np.ndarray, dict]:
    """Realise every approved body on the CURRENT ground, relative to it.

    Today's sculpt is not the 16a sculpt (benching moved, the source was
    ramped): inside an upland outline the two differ by ~2 m with a spread of
    up to 10 m, so pasting the 16a ground back made plateaus, not hollows
    (252/387 matched, 2026-09-12). Instead each body keeps its 16a DEPTH
    PATTERN under a level its present rim can hold: the ring outside the
    outline is raised to the approved level + RIM_ABOVE_M where it is lower
    (never by more than RIM_RAISE_CAP_M; a rim breached deeper than that
    lowers the level instead, and the change is recorded); inside, the
    ground becomes level - depth16a (feathered at the edge). A sea-level
    sheet is only ever lowered back to the 16a ground (its edge is the
    shore, not a rim). A fall window keeps the 16a face shifted to the
    surrounding ground. `skip` cells (the sea, the authored lake) are never
    touched. Returns (h, stats)."""
    out = h.astype(np.float32, copy=True)
    H, W = out.shape
    lowered = raised = 0
    low_max = raise_max = 0.0
    ring_cells = ring_capped = 0
    ring_max = 0.0
    level_changes = []
    for b in sorted(doc["bodies"], key=lambda b: b["label"]):
        L = b["label"]
        x0, y0, x1, y1 = b["bboxCells"]
        pad = RIM_RING_CELLS + 4
        ys, xs = slice(max(y0 - pad, 0), min(y1 + pad + 1, H)), slice(max(x0 - pad, 0), min(x1 + pad + 1, W))
        lab_w = label[ys, xs]
        mask = (lab_w == L) & ~skip[ys, xs] & np.isfinite(heights[ys, xs])
        if not mask.any():
            continue
        hw = out[ys, xs]
        h16 = heights[ys, xs]
        if b.get("seaLevel"):
            low = mask & (hw > h16)
            if low.any():
                low_max = max(low_max, float((hw - h16)[low].max()))
                lowered += int(low.sum())
                hw[low] = h16[low]
            out[ys, xs] = hw
            continue
        level16 = float(b["levelM"])
        ring = ndimage.binary_dilation(mask, iterations=RIM_RING_CELLS) & ~mask & ~skip[ys, xs] & (lab_w == 0)
        if ring.any():
            ring_min = float(hw[ring].min())
            level = level16 if ring_min >= level16 - RIM_RAISE_CAP_M else ring_min + RIM_RAISE_CAP_M - RIM_ABOVE_M
            want = level + RIM_ABOVE_M
            rb = np.where(ring, np.clip(want - hw, 0.0, RIM_RAISE_CAP_M), 0.0).astype(np.float32)
            ring_cells += int((rb > 0.005).sum())
            ring_capped += int((rb >= RIM_RAISE_CAP_M - 1e-3).sum())
            ring_max = max(ring_max, float(rb.max()))
            hw = hw + rb
        else:
            level = level16
        if abs(level - level16) > 0.05:
            level_changes.append({"id": b["id"], "kind": b["kind"], "approvedLevelM": level16, "levelM": round(level, 2),
                                  "why": "rim breached deeper than the 3 m raise cap on today's ground"})
        depth16 = np.clip(level16 - h16, 0.05, None)
        target = (level - depth16).astype(np.float32)
        d_edge = ndimage.distance_transform_edt(mask)
        w_in = np.clip(d_edge / 3.0, 0.0, 1.0).astype(np.float32)
        newh = np.where(mask, hw + w_in * (target - hw), hw).astype(np.float32)
        dl = mask & (newh < hw - 0.01); dr = mask & (newh > hw + 0.01)
        lowered += int(dl.sum()); raised += int(dr.sum())
        if dl.any():
            low_max = max(low_max, float((hw - newh)[dl].max()))
        if dr.any():
            raise_max = max(raise_max, float((newh - hw)[dr].max()))
        out[ys, xs] = newh
    # the 16a falls: the face, shifted to today's surrounding ground
    fall_cells = 0
    if fallwin is not None and (fallwin > 0).any():
        for k in range(1, int(fallwin.max()) + 1):
            win = (fallwin == k) & ~skip & np.isfinite(heights)
            if not win.any():
                continue
            border = win & ~ndimage.binary_erosion(win, iterations=2)
            shift = float(np.median((out - heights)[border])) if border.any() else 0.0
            d_edge = ndimage.distance_transform_edt(win)
            w = np.clip(d_edge / 3.0, 0.0, 1.0).astype(np.float32)
            out = np.where(win, out + w * (heights + shift - out), out).astype(np.float32)
            fall_cells += int(win.sum())
    stats = {"outlineCells": int((label > 0).sum()), "cellsLowered": lowered, "cellsRaised": raised,
             "loweredMaxM": round(low_max, 2), "raisedMaxM": round(raise_max, 2),
             "rimCellsRaised": ring_cells, "rimRaisedMaxM": round(ring_max, 2), "rimRaisedCapped": ring_capped,
             "levelChanges": level_changes, "fallWindowCells": fall_cells}
    log(f"  approved bodies: {len(doc['bodies'])} realised relative to today's rims ({lowered} cells lowered, max "
        f"{stats['loweredMaxM']} m; {raised} raised, max {stats['raisedMaxM']} m); rim raised on {ring_cells} cells "
        f"(max {stats['rimRaisedMaxM']} m, {ring_capped} at the cap); {len(level_changes)} bodies sit lower than approved "
        f"(rim breached deeper than the cap); {fall_cells} fall-window cells")
    return out, stats


# ---------------------------------------------------------------------------
# match (the graph derive)
# ---------------------------------------------------------------------------

def match(measured_label: np.ndarray, doc: dict, label: np.ndarray) -> tuple[dict[int, dict], list[dict]]:
    """Pair measured bodies (label raster, 1..m) with approved outlines by
    cell overlap. A measured body belongs to the approved outline it
    overlaps most, when that overlap is at least MATCH_MIN_OVERLAP of the
    smaller of the two areas. An approved outline realised by several
    measured bodies (it split) has a PRIMARY (the largest overlap) and
    parts; a measured body that also covers other approved outlines (they
    merged) realises those too. Returns ({measured label: {approved,
    overlapCells, overlapOfApproved, part (1 = primary), mergedApproved:
    [records]}}, [approved records nothing realises])."""
    m = int(measured_label.max()); a = int(label.max())
    both = (measured_label > 0) & (label > 0)
    pair = measured_label[both].astype(np.int64) * (a + 1) + label[both].astype(np.int64)
    counts = np.bincount(pair, minlength=(m + 1) * (a + 1)).reshape(m + 1, a + 1)
    area_m = np.bincount(measured_label.ravel(), minlength=m + 1)
    area_a = np.bincount(label.ravel(), minlength=a + 1)
    by_label = {b["label"]: b for b in doc["bodies"]}
    parent = counts.argmax(axis=1)                 # per measured: the outline it overlaps most
    realised: dict[int, list[tuple[int, int]]] = {}  # approved label -> [(overlap, measured)]
    matches: dict[int, dict] = {}
    for mi in range(1, m + 1):
        ai = int(parent[mi])
        if ai == 0 or ai not in by_label:
            continue
        ov = int(counts[mi, ai])
        if ov < MATCH_MIN_OVERLAP * min(area_m[mi], area_a[ai]):
            continue
        realised.setdefault(ai, []).append((ov, mi))
        # other outlines this measured body covers (they merged into it)
        merged = [by_label[int(aj)] for aj in np.flatnonzero(counts[mi] >= MATCH_MIN_OVERLAP * area_a)
                  if int(aj) != ai and int(aj) in by_label]
        matches[mi] = {"approved": by_label[ai], "overlapCells": ov,
                       "overlapOfApproved": round(ov / max(int(area_a[ai]), 1), 3), "part": 1,
                       "mergedApproved": merged}
    for ai, lst in realised.items():
        lst.sort(reverse=True)
        for k, (_ov, mi) in enumerate(lst, start=1):
            matches[mi]["part"] = k
    got = set(realised)
    for v in matches.values():
        got.update(b["label"] for b in v["mergedApproved"])
    missing = [b for b in doc["bodies"] if b["label"] not in got]
    return matches, missing


def load_routing(vault: Path, register: Path = REGISTER_PATH):
    """The approved 16a coarse river network (rivers, flow_to, accum_km2,
    watersheds, sink) or None when the register does not name one."""
    if not register.exists():
        return None
    doc = json.loads(register.read_text(encoding="utf-8"))
    name = (doc.get("source") or {}).get("routing")
    if not name:
        return None
    path = vault / name
    if not path.exists():
        raise SystemExit(f"approved routing: {path} missing (the register names it); regenerate it from the 16a commit")
    z = np.load(path)
    sha = hashlib.sha256(np.ascontiguousarray(z["flow_to"]).tobytes()).hexdigest()
    if sha != doc["source"]["routingSha256"]:
        raise SystemExit(f"approved routing: {path} does not match the register's routingSha256")
    return {k: z[k] for k in z.files}


CORRECTIONS_PATH = REPO_ROOT / "world" / "sources" / "hydrology" / "approved-routing-corrections.json"


def apply_routing_corrections(routing: dict, z: np.ndarray, metres_per_px: float,
                              corrections: Path = CORRECTIONS_PATH, log=print) -> dict:
    """The owner's corrections to the approved network (CORRECTIONS_PATH):
    each declares a box that is not the sea and re-routes one river's last
    stretch from its recorded mouth to the open-sea cell nearest a point,
    by the lowest path over the current coarse ground. Returns the routing
    with `rivers`, `flow_to`, `accum_km2`, `sink` updated in place."""
    if not corrections.exists():
        return routing
    doc = json.loads(corrections.read_text(encoding="utf-8"))
    rows = doc.get("corrections", [])
    if not rows:
        return routing
    H, W = z.shape
    sink = routing["sink"].astype(bool).copy()
    flow = routing["flow_to"].reshape(-1).astype(np.int64).copy()
    rivers = routing["rivers"].astype(np.uint8).copy()
    accum = routing["accum_km2"].astype(np.float32).copy()
    for c in rows:
        b = c["notSeaBox"]
        x0, x1 = (int(v / metres_per_px) for v in b["eastM"]); y0, y1 = (int(v / metres_per_px) for v in b["southM"])
        sink[y0:y1 + 1, x0:x1 + 1] = False
        mx, my = (int(v / metres_per_px) for v in (c["fromMouth"]["eastM"], c["fromMouth"]["southM"]))
        # the river's last cell: walk its recorded chain from the mouth cell back over river cells that flow into it... simpler: start AT the mouth cell
        start = my * W + mx
        tx, ty = int(c["mouthNear"]["eastM"] / metres_per_px), int(c["mouthNear"]["southM"] / metres_per_px)
        # lowest path from the start to the nearest sink cell to the target: Dijkstra, cost = step x (1 + 20 x height above sea)
        import heapq
        cost = 1.0 + 20.0 * np.clip(z, 0.0, None)
        dist = np.full(H * W, np.inf); prev = np.full(H * W, -1, dtype=np.int64)
        dist[start] = 0.0; heap = [(0.0, start)]
        best = None
        while heap:
            d, i = heapq.heappop(heap)
            if d > dist[i]:
                continue
            y, x = divmod(i, W)
            if sink[y, x] and i != start:
                # first sink reached is the closest by cost; prefer one near the named point
                if best is None or np.hypot(x - tx, y - ty) < np.hypot(best[1] % W - tx, best[1] // W - ty):
                    best = (d, i)
                if d > (best[0] + 40):
                    break
                continue
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    if not (dy or dx):
                        continue
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < H and 0 <= nx < W:
                        j = ny * W + nx
                        nd = d + float(np.hypot(dy, dx)) * float(cost[ny, nx])
                        if nd < dist[j]:
                            dist[j] = nd; prev[j] = i; heapq.heappush(heap, (nd, j))
        if best is None:
            log(f"routing correction {c['id']}: no path to the sea from the mouth cell")
            continue
        path = []
        i = best[1]
        while i != start and i >= 0:
            path.append(i); i = prev[i]
        path = path[::-1]
        band = int(max(rivers.reshape(-1)[start], 1)); a0 = float(accum.reshape(-1)[start])
        cur = start
        for j in path:
            flow[cur] = j
            if not sink.reshape(-1)[j]:
                rivers.reshape(-1)[j] = band
                accum.reshape(-1)[j] = max(float(accum.reshape(-1)[j]), a0)
            cur = j
        ey, ex = divmod(path[-1], W)
        log(f"routing correction {c['id']}: {c['river16a']} re-routed over {len(path)} coarse cells to the sea at "
            f"{ex * metres_per_px / 1000:.2f} E {ey * metres_per_px / 1000:.2f} S")
    routing = dict(routing)
    routing.update({"sink": sink, "flow_to": flow.reshape(H, W), "rivers": rivers, "accum_km2": accum})
    return routing


def main(argv=None) -> int:
    import argparse
    ap = argparse.ArgumentParser(description="the owner-approved (16a) standing-water register")
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build", help="regenerate the register + outlines from the 16a commit's arrays")
    b.add_argument("--graph", type=Path, required=True)
    b.add_argument("--bodies", type=Path, required=True, help="npz with the 16a body label raster")
    b.add_argument("--sculpt", type=Path, required=True, help="the 16a sculpted heights")
    b.add_argument("--vault", type=Path, required=True)
    b.add_argument("--pass1", type=Path, default=None, help="the 16a hydrology-pass1.npz (its ocean mask outlines the sea-level sheets)")
    a = ap.parse_args(argv)
    if a.cmd == "build":
        build(a.graph, a.bodies, a.sculpt, a.vault, a.pass1)
    return 0


if __name__ == "__main__":
    sys.exit(main())
