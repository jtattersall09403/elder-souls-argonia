"""Typed local terrain patches on the frozen base (Phase 16b, decision 0059).

After the freeze gate the base heightfield (`refined-height-frozen-f32.npy`)
is never written again. Everything a PLACE may still do to the ground is a
patch in `world/sources/terrain/terrain-patches.json` (schema v1), applied
in (order, id) order from the frozen array by `apply_terrain_patches`, so
patches are re-appliable and removable like grading. A patch is checked by
six invariants and FAILS — is refused, never clamped — on any of them:

  1. bounds     -- the ground moves only inside `bboxM` widened by `blendM`
  2. amplitude  -- |delta| <= `maxDeltaM` everywhere
  3. channels   -- nothing is RAISED inside a graph channel or its shoulder;
                   only a channel-class kind may lower ground there
  4. water      -- no frozen body loses a wet cell, gains a cell beyond the
                   patch region, or leaks past the window; no new depression
                   unless the patch declares `makesWater`
  5. overlap    -- two patches whose regions intersect must declare their
                   order (`after`)
  6. structures -- a patch region crossing a route structure's window must
                   name it in `crosses`

Kinds today: `poling-channel` (an authored minor waterway carved to its
receiving water; ruling 6) and `terrain-request` (one place's typed
catalogue requests, `terrain_requests`). Dock and lane DREDGES are retired
(ruling 6: a berth goes where the water floats the hull). Grading (16e) and
settlement pads (16h) add their kinds here with the same contract.

Patch record (metres, province frame; `bboxM` = [x0, z0, x1, z1]):

    {"id": "patch.<kind>.<source>", "kind": ..., "order": 0, "after": [], "crosses": [],
     "makesWater": false, "bboxM": [...], "blendM": 3.0, "maxDeltaM": 2.0,
     "source": {...}, "params": {...}, "why": "..."}
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from scipy import ndimage

from .scale import RAW_M

REPO_ROOT = Path(__file__).resolve().parents[3]
PATCHES_PATH = REPO_ROOT / "world" / "sources" / "terrain" / "terrain-patches.json"
STRUCTURES_PATH = REPO_ROOT / "apps" / "world-studio" / "public" / "province" / "route-structures.json"
SCHEMA_VERSION = 1
KINDS = ("poling-channel", "terrain-request")
CHANNEL_CLASS_KINDS = ("poling-channel",)    # may LOWER ground inside a channel or its shoulder
DEPRESSION_MIN_M = 0.15                       # a hollow deeper than this holds water
STRUCTURE_HALF_W_M = 6.0
WINDOW_PAD_PX = 6
Box = tuple[int, int, int, int]               # half-open sample box (y0, y1, x0, x1)


# ---------------------------------------------------------------- the file

def load(path: Path = PATCHES_PATH) -> list[dict]:
    if not Path(path).exists():
        return []
    doc = json.loads(Path(path).read_text(encoding="utf-8"))
    if doc.get("schemaVersion") != SCHEMA_VERSION:
        raise ValueError(f"{path}: schemaVersion {doc.get('schemaVersion')!r}, expected {SCHEMA_VERSION}")
    return list(doc.get("patches", []))


def save(patches: list[dict], path: Path = PATCHES_PATH, about: str | None = None) -> None:
    doc = {"schemaVersion": SCHEMA_VERSION,
           "about": about or ("Typed local terrain patches applied to the frozen base in (order, id) order; "
                              "see worldgen/terrain_patches.py for the six invariants each must pass."),
           "patches": sorted(patches, key=lambda p: (int(p.get("order", 0)), p["id"]))}
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")


def ordered(patches: list[dict]) -> list[dict]:
    return sorted(patches, key=lambda p: (int(p.get("order", 0)), p["id"]))


def region_box(patch: dict, shape, mpp: float = RAW_M) -> Box:
    """The patch's region (bbox widened by blend) as a half-open sample box."""
    x0, z0, x1, z1 = (float(v) for v in patch["bboxM"])
    b = float(patch.get("blendM", 0.0))
    return (max(int(np.floor((z0 - b) / mpp)), 0), min(int(np.ceil((z1 + b) / mpp)) + 1, shape[0]),
            max(int(np.floor((x0 - b) / mpp)), 0), min(int(np.ceil((x1 + b) / mpp)) + 1, shape[1]))


def _intersects(a: Box, b: Box) -> bool:
    return a[0] < b[1] and b[0] < a[1] and a[2] < b[3] and b[2] < a[3]


def validate(patches: list[dict], shape=(4033, 4033)) -> list[str]:
    """Static checks: schema, ids, kinds, bounds, and invariant 5 (overlap)."""
    errs: list[str] = []
    ids = [p.get("id") for p in patches]
    if len(ids) != len(set(ids)):
        errs.append("duplicate patch ids")
    for p in patches:
        pid = p.get("id", "?")
        if not isinstance(pid, str) or not pid.startswith("patch."):
            errs.append(f"{pid}: id must be a string starting with 'patch.'")
        if p.get("kind") not in KINDS:
            errs.append(f"{pid}: unknown kind {p.get('kind')!r}")
        bb = p.get("bboxM")
        if not (isinstance(bb, list) and len(bb) == 4 and bb[0] < bb[2] and bb[1] < bb[3]):
            errs.append(f"{pid}: bboxM must be [x0, z0, x1, z1] with x0 < x1 and z0 < z1")
        if not isinstance(p.get("maxDeltaM"), (int, float)) or p["maxDeltaM"] <= 0:
            errs.append(f"{pid}: maxDeltaM must be a positive number")
        for key in ("after", "crosses"):
            if not isinstance(p.get(key, []), list):
                errs.append(f"{pid}: {key} must be a list")
        for a in p.get("after", []):
            if a not in ids:
                errs.append(f"{pid}: after names unknown patch {a}")
    boxes = {p["id"]: region_box(p, shape) for p in patches if "bboxM" in p and isinstance(p.get("bboxM"), list) and len(p["bboxM"]) == 4}
    plist = [p for p in patches if p["id"] in boxes]
    for i, a in enumerate(plist):
        for b in plist[i + 1:]:
            if _intersects(boxes[a["id"]], boxes[b["id"]]):
                if a["id"] not in b.get("after", []) and b["id"] not in a.get("after", []):
                    errs.append(f"{a['id']} and {b['id']}: regions overlap without a declared order (after)")
    return errs


# ------------------------------------------------------------ the context

class Context:
    """What the invariants and the kinds read: the frozen water and channels."""

    def __init__(self, level_with_sea: np.ndarray, sea: np.ndarray, stations, npz=None, structures=None):
        self.level = level_with_sea            # float32, -inf where dry, 0 on the sea
        self.sea = sea
        self.stations = stations               # (y, x, L, width, live) arrays in sample coords
        self.npz = npz
        self.structures = structures if structures is not None else load_structures()
        self._flow = None
        self._wet_mask = None

    @property
    def wet(self) -> np.ndarray:
        return np.isfinite(self.level)

    def channel_masks(self, box: Box, mpp: float = RAW_M):
        """(inside width, inside width + shoulder) over the box, from the
        nearest live station."""
        from scipy.spatial import cKDTree
        from .channels import SHOULDER_BLEND_M
        y0, y1, x0, x1 = box
        ys, xs, _L, w, live = self.stations
        reach = float(w.max()) * 0.5 + SHOULDER_BLEND_M if len(w) else 0.0
        pad = reach / mpp + 1
        sel = live & (ys >= y0 - pad) & (ys < y1 + pad) & (xs >= x0 - pad) & (xs < x1 + pad)
        h = (y1 - y0, x1 - x0)
        if not sel.any():
            return np.zeros(h, bool), np.zeros(h, bool)
        tree = cKDTree(np.stack([ys[sel], xs[sel]], 1))
        gy, gx = np.mgrid[y0:y1, x0:x1]
        d, i = tree.query(np.stack([gy.ravel(), gx.ravel()], 1))
        d = d.reshape(h) * mpp
        half = (w[sel][i].reshape(h) * 0.5)
        return d <= half, d <= half + SHOULDER_BLEND_M

    def flow_vectors(self, shape):
        if self._flow is None:
            from .shape_province import STEP
            c = self.npz["rivers"].shape          # flow_to is stored flat (coarse cells)
            target = np.asarray(self.npz["flow_to"]).reshape(c)
            source = np.arange(c[0] * c[1], dtype=np.int64).reshape(c)
            valid = target >= 0
            ts = np.where(valid, target, source)
            tr_, tc = np.divmod(ts, c[1])
            sr, sc = np.indices(c)
            dx, dz = (tc - sc).astype(np.float32), (tr_ - sr).astype(np.float32)
            n = np.hypot(dx, dz)
            nz = n > 0
            dx[nz] /= n[nz]; dz[nz] /= n[nz]
            v = np.dstack((dx, dz)).astype(np.float32)
            self._flow = np.repeat(np.repeat(v, STEP, 0), STEP, 1)[: shape[0], : shape[1]]
        return self._flow

    def wet_mask(self, shape):
        if self._wet_mask is None:
            from .shape_province import STEP
            up = lambda a: np.repeat(np.repeat(a, STEP, 0), STEP, 1)[: shape[0], : shape[1]]
            self._wet_mask = (up(self.npz["wetlands"]) > 0.5) | np.isin(up(self.npz["regions"]), (6, 7, 8, 13))
        return self._wet_mask


def load_structures(path: Path = STRUCTURES_PATH) -> list[dict]:
    if not Path(path).exists():
        return []
    doc = json.loads(Path(path).read_text(encoding="utf-8"))
    return [{"id": s["id"], "pointsM": s["pointsM"]} for s in doc.get("structures", []) if s.get("pointsM")]


def context_from_vault(vault: Path) -> Context:
    """The frozen water and channels as `hydrology_graph derive` left them."""
    from . import hydrology_graph as hg
    from .channels import KIND_LOST
    z = np.load(vault / hg.BODIES_FILE)
    level = np.where(z["sea"], np.float32(0.0), z["level"]).astype(np.float32)
    s = np.load(vault / hg.SOLUTION_FILE)
    live = s["kind"] != KIND_LOST
    stations = (s["y"], s["x"], s["L"], s["width"], live)
    return Context(level, z["sea"], stations, npz=np.load(vault / "hydrology-pass1.npz"))


# --------------------------------------------------------------- the kinds

def apply_kind(h: np.ndarray, patch: dict, ctx: Context, mpp: float = RAW_M) -> tuple[np.ndarray, dict]:
    """Apply one patch to a COPY of `h`; return (heights, kind receipt).
    Raises ValueError when the kind cannot honestly be applied."""
    kind = patch["kind"]
    out = h.astype(np.float32, copy=True)
    if kind == "poling-channel":
        from . import authored_waterways as aw
        ys, xs, L, _w, _live = ctx.stations
        out, stats = aw.carve_authored(out, ctx.level, ctx.wet, mpp, waterways=[patch["params"]["waterway"]],
                                       stations=(ys, xs, L))
        row = stats[0]
        if row.get("status") == "off-grid":
            raise ValueError("the line is off this grid")
        return out, {"bedM": row["bedM"], "receivingLevelM": row["receivingLevelM"], "samplesCut": row["samplesCut"]}
    if kind == "terrain-request":
        from . import terrain_request_raster as trr
        from . import terrain_requests as tr
        plan, errs = tr.build_plan([patch["params"]["record"]])
        if errs:
            raise ValueError("invalid terrain-request plan: " + "; ".join(errs))
        out, manifest, stats = trr.apply_plan(out, plan, mpp, flow_vectors=ctx.flow_vectors(h.shape),
                                              wet_mask=ctx.wet_mask(h.shape))
        return out.astype(np.float32), {"plan": plan, "manifest": manifest, "stats": stats}
    raise ValueError(f"unknown kind {kind}")


# ----------------------------------------------------------- the invariants

def check_invariants(before: np.ndarray, after: np.ndarray, patch: dict, ctx: Context,
                     mpp: float = RAW_M) -> list[str]:
    """Every violation of invariants 1-4 and 6 for one applied patch."""
    errs: list[str] = []
    shape = before.shape
    region = region_box(patch, shape, mpp)
    ry0, ry1, rx0, rx1 = region
    delta = after - before
    changed = delta != 0
    # 1. bounds
    outside = changed.copy()
    outside[ry0:ry1, rx0:rx1] = False
    if outside.any():
        ys, xs = np.nonzero(outside)
        errs.append(f"bounds: {int(outside.sum())} samples moved outside the region (first at row {ys[0]}, col {xs[0]})")
    # 2. amplitude
    amp = float(np.abs(delta).max()) if changed.any() else 0.0
    if amp > float(patch["maxDeltaM"]) + 1e-4:
        errs.append(f"amplitude: |delta| {amp:.3f} m exceeds maxDeltaM {patch['maxDeltaM']}")
    if not changed.any():
        return errs
    # the window the water check reasons in: the region padded, so a leak
    # that escapes the region is still seen leaving it
    wy0, wy1 = max(ry0 - WINDOW_PAD_PX, 0), min(ry1 + WINDOW_PAD_PX, shape[0])
    wx0, wx1 = max(rx0 - WINDOW_PAD_PX, 0), min(rx1 + WINDOW_PAD_PX, shape[1])
    win = (wy0, wy1, wx0, wx1)
    d = delta[wy0:wy1, wx0:wx1]
    b = before[wy0:wy1, wx0:wx1]
    a = after[wy0:wy1, wx0:wx1]
    # 3. channels
    inside, shoulder = ctx.channel_masks(win, mpp)
    raised_in = shoulder & (d > 1e-4)
    if raised_in.any():
        errs.append(f"channels: {int(raised_in.sum())} samples raised inside a channel or its shoulder")
    if patch["kind"] not in CHANNEL_CLASS_KINDS:
        lowered_in = shoulder & (d < -1e-4)
        if lowered_in.any():
            errs.append(f"channels: {int(lowered_in.sum())} samples lowered inside a channel or its shoulder by a non-channel kind")
    # 4. water: the bounded re-flood at the frozen levels
    errs += water_violations(b, a, lvl_window=ctx.level[wy0:wy1, wx0:wx1],
                             region=(ry0 - wy0, ry1 - wy0, rx0 - wx0, rx1 - wx0),
                             makes_water=bool(patch.get("makesWater")))
    # 6. structures
    for s in ctx.structures:
        if s["id"] in patch.get("crosses", []):
            continue
        pts = np.asarray(s["pointsM"], dtype=np.float64) / mpp     # (x, z) -> (col, row)
        if not (pts[:, 0].min() - STRUCTURE_HALF_W_M / mpp <= rx1 and pts[:, 0].max() + STRUCTURE_HALF_W_M / mpp >= rx0
                and pts[:, 1].min() - STRUCTURE_HALF_W_M / mpp <= ry1 and pts[:, 1].max() + STRUCTURE_HALF_W_M / mpp >= ry0):
            continue
        mask = np.zeros(a.shape, bool)
        for (x0_, z0_), (x1_, z1_) in zip(pts, pts[1:]):
            n = int(max(abs(x1_ - x0_), abs(z1_ - z0_))) + 2
            xs = np.round(np.linspace(x0_, x1_, n)).astype(int) - wx0
            zs = np.round(np.linspace(z0_, z1_, n)).astype(int) - wy0
            ok = (xs >= 0) & (xs < a.shape[1]) & (zs >= 0) & (zs < a.shape[0])
            mask[zs[ok], xs[ok]] = True
        if mask.any():
            mask = ndimage.binary_dilation(mask, iterations=int(np.ceil(STRUCTURE_HALF_W_M / mpp)))
            if (mask & (d != 0)).any():
                errs.append(f"structures: crosses {s['id']} without declaring it")
    return errs


def water_violations(b: np.ndarray, a: np.ndarray, lvl_window: np.ndarray, region: Box,
                     makes_water: bool) -> list[str]:
    """Invariant 4 over one window: `b`/`a` the ground before/after, `lvl_window`
    the frozen flood level (-inf dry, 0 sea), `region` the patch region in
    window coordinates. Flood from every frozen wet component at its own
    level: no frozen wet cell may dry, no body may gain a cell beyond the
    region or reach the window edge, and no new closed depression may
    appear unless the patch makes water (and then only inside the region)."""
    errs: list[str] = []
    ry0, ry1, rx0, rx1 = region
    lvl = lvl_window
    old_wet = np.isfinite(lvl)
    dried = old_wet & (a >= lvl - 1e-4) & (b < lvl - 1e-4)
    if dried.any():
        errs.append(f"water: {int(dried.sum())} frozen wet samples dried")
    in_region = np.zeros(a.shape, bool)
    in_region[ry0:ry1, rx0:rx1] = True
    if old_wet.any():
        lbl, n = ndimage.label(old_wet, structure=np.ones((3, 3), bool))
        levels = ndimage.maximum(np.where(old_wet, lvl, -np.inf), lbl, np.arange(1, n + 1))
        edge = np.zeros(a.shape, bool)
        edge[0, :] = edge[-1, :] = edge[:, 0] = edge[:, -1] = True
        for i, L in enumerate(np.atleast_1d(levels), start=1):
            seed = lbl == i
            cand = (a < L - 1e-4) | seed
            comp, _ = ndimage.label(cand, structure=np.ones((3, 3), bool))
            ids = np.unique(comp[seed])
            flood = np.isin(comp, ids[ids > 0])
            new = flood & ~old_wet
            if not new.any():
                continue
            if (new & ~in_region).any():
                errs.append(f"water: body at {float(L):.2f} m gains {int((new & ~in_region).sum())} samples beyond the patch region")
            if (new & edge).any():
                errs.append(f"water: body at {float(L):.2f} m floods past the window edge (unbounded)")
    dep_a = (_fill_window(a) - a) > DEPRESSION_MIN_M
    dep_b = (_fill_window(b) - b) > DEPRESSION_MIN_M
    new_dep = dep_a & ~dep_b & ~old_wet
    if new_dep.any():
        if not makes_water:
            errs.append(f"water: {int(new_dep.sum())} samples of new depression (makesWater not declared)")
        elif (new_dep & ~in_region).any():
            errs.append(f"water: new depression reaches {int((new_dep & ~in_region).sum())} samples beyond the region")
    return errs


def _fill_window(a: np.ndarray) -> np.ndarray:
    """Priority fill with the window edge as the drain."""
    from skimage.morphology import reconstruction
    seed = np.full(a.shape, np.inf, dtype=np.float64)
    seed[0, :] = a[0, :]; seed[-1, :] = a[-1, :]; seed[:, 0] = a[:, 0]; seed[:, -1] = a[:, -1]
    return reconstruction(seed, a.astype(np.float64), method="erosion").astype(np.float32)


# ------------------------------------------------------------- the applier

def apply_all(frozen: np.ndarray, patches: list[dict], ctx: Context, mpp: float = RAW_M, log=print):
    """Apply every patch in (order, id) order from the frozen array. A patch
    that fails an invariant, or whose kind cannot be applied, is REFUSED (left
    out, the array unchanged) and the reason recorded. Returns (heights,
    receipts, footprint boxes of the applied patches)."""
    errs = validate(patches, frozen.shape)
    if errs:
        raise ValueError("terrain-patches.json: " + "; ".join(errs[:10]))
    h = frozen.astype(np.float32, copy=True)
    receipts: list[dict] = []
    boxes: list = []
    for p in ordered(patches):
        rec = {"id": p["id"], "kind": p["kind"], "region": list(region_box(p, frozen.shape, mpp))}
        try:
            h2, kind_receipt = apply_kind(h, p, ctx, mpp)
        except ValueError as e:
            rec.update({"status": "refused", "reason": f"cannot apply: {e}"})
            receipts.append(rec)
            log(f"patch {p['id']}: REFUSED — {e}")
            continue
        violations = check_invariants(h, h2, p, ctx, mpp)
        delta = h2 - h
        rec.update({"samplesChanged": int((delta != 0).sum()),
                    "maxAbsDeltaM": round(float(np.abs(delta).max()), 3) if (delta != 0).any() else 0.0})
        if violations:
            rec.update({"status": "refused", "reason": "; ".join(violations)})
            log(f"patch {p['id']}: REFUSED — {violations[0]}")
        else:
            rec.update({"status": "applied", "receipt": {k: v for k, v in kind_receipt.items() if k in ("bedM", "receivingLevelM", "samplesCut")}})
            rec["_kind_receipt"] = kind_receipt
            h = h2
            boxes.append(tuple(rec["region"]))
            log(f"patch {p['id']}: applied, {rec['samplesChanged']} samples, max {rec['maxAbsDeltaM']} m")
        receipts.append(rec)
    return h, receipts, boxes
