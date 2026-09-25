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
receiving water; ruling 6), `terrain-request` (one place's typed
catalogue requests, `terrain_requests`), and the two water corrections the
owner approved on 2026-09-14 (16c ledger §4, authored by
`author_terrain_patches water-corrections` from the compiler's own census):

  `bed-cut`  channel-class: LOWERS the ground along a run of stations whose
             bed the carve left above its promise (the coast collar at a
             mouth, a body's rim ring across a creek, a bare weir lip, the
             Blackrose sill) to the promised bed — the parabola
             `bed(t) = level − (level − bedM)·(1 − t²)` across the water
             width, a weir station flooring the cut AT its level — with a
             BED_CUT_BLEND_M taper outside the width. It may never RAISE.
  `levee`    RAISES the shoulder band (the water's edge .. edge +
             SHOULDER_BLEND_M, both sides) of a perched station — one whose
             water stands over PERCHED_DROP_M above dry ground beside it — to
             the crest (station level + LEVEE_FREEBOARD_M, the carve's own
             shoulder promise), tapered LEVEE_BLEND_M outward; never inside
             any channel's water width, never lowering. It declares
             `driesBodyCells`: a lower body's fringe cells inside the band
             dry, only inside the patch region, and the body's level and
             deepest cell are checked unchanged. A levee whose `params` hold
             `cells` instead of `stations` is a BODY RIM levee
             (`apply_rim_levee`, `stats.bodyRimLeaks`): the dry ring cells
             under a realised body's level rise to level + LEVEE_FREEBOARD_M,
             never a wet cell and never a channel width, and it dries nothing
             (`driesBodyCells: false`).

  `settlement-pad` (schema 2, 16k lane F, 0081 addendum): the ground under
             the members of a modular run that seats as one rigid chain and
             floats over falling ground, graded up to each member's designed
             ground line (`settlement_run_pads`; id
             `patch.pad.settlement.<placeId>.<runId>`, order 3 so it comes
             after every other kind). Emitted by the settlement export and
             merged cumulatively, never re-derived.

Dock and lane DREDGES are retired (ruling 6: a berth goes where the water
floats the hull). Grading (16e) adds its kind here with the same contract.

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
SCHEMA_VERSION = 2                            # 2: the `settlement-pad` kind (16k lane F)
READABLE_SCHEMA_VERSIONS = (1, 2)             # a v1 file is a valid v2 file (v2 only adds a kind)
KINDS = ("poling-channel", "terrain-request", "bed-cut", "levee", "route-grade", "settlement-pad")
GRADE_KINDS = ("route-grade",)                # 16e: may never change a cell inside recorded water or its shore band (invariant 7)
SHORE_GUARD_M = 22.0                          # = the water shader's wet-shore band: grading stops at its outer edge
CHANNEL_CLASS_KINDS = ("poling-channel", "bed-cut")    # may LOWER ground inside a channel or its shoulder
SHOULDER_RAISE_KINDS = ("levee",)             # may RAISE ground in a channel's shoulder (never its width)
BED_CUT_BLEND_M = 2.0                         # a bed-cut tapers back to the bank over this past the width
LEVEE_FREEBOARD_M = 0.3                       # = channels.SHOULDER_RAISE_M: crest over the station level
LEVEE_EDGE_GAP_M = 0.0                        # the levee starts AT the water's edge (the nominal half-width, as the
                                              # carve's own crest zone does). Measured 2026-09-14 with a 0.5 m gap:
                                              # the compile counts cells out to half-width + 0.5 sample as the width,
                                              # and the dry low cells its perched rule sees were the gap ring's
                                              # (836 of 1235 residual neighbours), so a gap leaves the run perched
LEVEE_BLEND_M = 2.0                           # ...and tapers to the ground over this past its band
BODY_CAP_CELLS = 2                            # = compile_water.BODY_CAP_CELLS (copied: importing the compile
                                              # drags the whole water build in): a body within this many
                                              # cells of a channel cell caps the lateral level there
DEPRESSION_MIN_M = 0.15                       # a hollow deeper than this holds water
STRUCTURE_HALF_W_M = 6.0
WINDOW_PAD_PX = 6
Box = tuple[int, int, int, int]               # half-open sample box (y0, y1, x0, x1)


# ---------------------------------------------------------------- the file

def load(path: Path = PATCHES_PATH) -> list[dict]:
    if not Path(path).exists():
        return []
    doc = json.loads(Path(path).read_text(encoding="utf-8"))
    if doc.get("schemaVersion") not in READABLE_SCHEMA_VERSIONS:
        raise ValueError(f"{path}: schemaVersion {doc.get('schemaVersion')!r}, expected one of "
                         f"{READABLE_SCHEMA_VERSIONS}")
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
        self.stations = stations               # (y, x, L, width, live[, band]) arrays in sample coords
        self.npz = npz
        self.structures = structures if structures is not None else load_structures()
        self._flow = None
        self._wet_mask = None

    @property
    def wet(self) -> np.ndarray:
        return np.isfinite(self.level)

    def shore_guard(self, mpp: float = RAW_M) -> np.ndarray:
        """Recorded water plus its shore band (SHORE_GUARD_M, the shader's
        wet-shore reach): the cells a route-grade patch never moves, so a
        graded road can neither lower a body's rim nor change the ground the
        shore shader reads (16e). Cached per context."""
        if getattr(self, "_shore_guard", None) is None:
            self._shore_guard = ndimage.binary_dilation(self.wet, iterations=int(np.ceil(SHORE_GUARD_M / mpp)))
        return self._shore_guard

    def channel_masks(self, box: Box, mpp: float = RAW_M):
        """(inside a water width, inside a width + shoulder) over the box.
        Per band, from the nearest live station OF THAT BAND (the union over
        bands, as the compile's `chan_all`: at a junction a cell inside the
        trunk's width is inside even where a tributary's station is nearer)."""
        from scipy.spatial import cKDTree
        from .channels import SHOULDER_BLEND_M
        y0, y1, x0, x1 = box
        ys, xs, _L, w, live = self.stations[:5]
        band = self.stations[5] if len(self.stations) > 5 else np.ones(len(ys), dtype=np.int8)
        reach = float(w.max()) * 0.5 + SHOULDER_BLEND_M if len(w) else 0.0
        pad = reach / mpp + 1
        h = (y1 - y0, x1 - x0)
        inside = np.zeros(h, bool)
        shoulder = np.zeros(h, bool)
        near = live & (ys >= y0 - pad) & (ys < y1 + pad) & (xs >= x0 - pad) & (xs < x1 + pad)
        if not near.any():
            return inside, shoulder
        gy, gx = np.mgrid[y0:y1, x0:x1]
        pts = np.stack([gy.ravel(), gx.ravel()], 1)
        for b in np.unique(band[near]):
            sel = near & (band == b)
            tree = cKDTree(np.stack([ys[sel], xs[sel]], 1))
            d, i = tree.query(pts)
            d = d.reshape(h) * mpp
            half = (w[sel][i].reshape(h) * 0.5)
            inside |= d <= half
            shoulder |= d <= half + SHOULDER_BLEND_M
        return inside, shoulder

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


def feeder_stations(graph: dict, mpp: float = RAW_M):
    """The terrain-stage reaches (the Blackrose feeders, `origin:
    terrain-stage`) as stations: (y, x, L, width, live, band) in sample
    coordinates, one per sample along the centreline — the widths the
    invariants must see even though the vault solution has no station there."""
    ys, xs, Ls, ws, bands = [], [], [], [], []
    for f in graph.get("reaches", []):
        if f.get("origin") != "terrain-stage" or not f.get("centreline"):
            continue
        pts = np.asarray(f["centreline"], dtype=np.float64) / mpp
        if len(pts) < 2:
            continue
        seg = np.hypot(*(pts[1:] - pts[:-1]).T)
        arc = np.concatenate([[0.0], np.cumsum(seg)])
        s = np.linspace(0.0, float(arc[-1]), max(int(np.floor(arc[-1])) + 1, 2))
        xs.append(np.interp(s, arc, pts[:, 0])); ys.append(np.interp(s, arc, pts[:, 1]))
        Ls.append(np.full(len(s), float(f["levelFromM"]))); ws.append(np.full(len(s), float(f["widthM"])))
        bands.append(np.full(len(s), int(f.get("band") or 3)))
    if not xs:
        return None
    n = sum(len(v) for v in xs)
    return (np.concatenate(ys).astype(np.float32), np.concatenate(xs).astype(np.float32),
            np.concatenate(Ls).astype(np.float32), np.concatenate(ws).astype(np.float32),
            np.ones(n, bool), np.concatenate(bands).astype(np.int8))


def context_from_vault(vault: Path, graph_path: Path | None = None) -> Context:
    """The frozen water and channels as `hydrology_graph derive` left them,
    plus the graph's terrain-stage feeders (their widths are channels too)."""
    from . import hydrology_graph as hg
    from .channels import KIND_LOST
    z = np.load(vault / hg.BODIES_FILE)
    level = np.where(z["sea"], np.float32(0.0), z["level"]).astype(np.float32)
    s = np.load(vault / hg.SOLUTION_FILE)
    live = s["kind"] != KIND_LOST
    stations = [s["y"], s["x"], s["L"], s["width"], live, s["band"].astype(np.int8)]
    gp = graph_path or (REPO_ROOT / "world" / "sources" / "hydrology" / "hydrology-graph.json")
    if gp.exists():
        extra = feeder_stations(json.loads(gp.read_text(encoding="utf-8")))
        if extra is not None:
            stations = [np.concatenate([a, b]) for a, b in zip(stations, extra)]
    return Context(level, z["sea"], tuple(stations), npz=np.load(vault / "hydrology-pass1.npz"))


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
    if kind == "bed-cut":
        return apply_bed_cut(out, patch, mpp)
    if kind == "levee":
        if "cells" in patch.get("params", {}):
            return apply_rim_levee(out, patch, ctx, mpp)
        return apply_levee(out, patch, ctx, mpp)
    if kind == "route-grade":
        return apply_route_grade(out, patch, ctx, mpp)
    if kind == "settlement-pad":
        from .settlement_run_pads import apply_settlement_pad
        return apply_settlement_pad(out, patch, mpp)
    raise ValueError(f"unknown kind {kind}")


def apply_route_grade(h: np.ndarray, patch: dict, ctx: "Context", mpp: float = RAW_M) -> tuple[np.ndarray, dict]:
    """A graded stretch of one road (16e, decision 0068): the running surface
    is set to the authored longitudinal profile across `flatWidthM`, and
    blends back to the natural ground over `shoulderM` beyond it. The
    profile is `params.profile`: [[east_m, south_m, target_z], ...] samples
    about one raw sample apart along the centreline. Cells inside recorded
    water (`ctx.wet`, the frozen high-water line) are never touched, so an
    approach ramp stops at the water's edge and a ford's bed stays natural
    (invariant 7). It is neither a channel-class kind (it never lowers a bed)
    nor a shoulder-raise kind: invariant 3 keeps it out of every channel's
    shoulder as well."""
    from scipy.spatial import cKDTree
    prm = patch["params"]
    prof = np.asarray(prm["profile"], dtype=np.float64)
    if prof.ndim != 2 or prof.shape[1] != 3 or len(prof) < 2:
        raise ValueError("route-grade: params.profile must be [[east, south, z], ...] with two or more samples")
    half = float(prm["flatWidthM"]) * 0.5
    shoulder = float(prm["shoulderM"])
    if half <= 0 or shoulder < 0:
        raise ValueError("route-grade: flatWidthM must be positive and shoulderM non-negative")
    y0, y1, x0, x1 = region_box(patch, h.shape, mpp)
    gy, gx = np.mgrid[y0:y1, x0:x1]
    pts = np.stack([gx.ravel() * mpp, gy.ravel() * mpp], 1)      # (east, south) of every cell centre
    # densify the profile so the nearest-sample distance is a distance to the line
    dense = [prof[0]]
    for a, b in zip(prof[:-1], prof[1:]):
        n = max(int(np.ceil(np.hypot(b[0] - a[0], b[1] - a[1]) / (0.5 * mpp))), 1)
        for i in range(1, n + 1):
            dense.append(a + (b - a) * (i / n))
    dense = np.asarray(dense)
    d, idx = cKDTree(dense[:, :2]).query(pts)
    d = d.reshape(gy.shape)
    target = dense[idx, 2].reshape(gy.shape)
    win = h[y0:y1, x0:x1]
    t = np.clip((d - half) / max(shoulder, 1e-6), 0.0, 1.0)         # 0 on the surface, 1 past the shoulder
    w = 1.0 - _smoothstep(t)
    new = win * (1.0 - w) + target * w
    touch = (d <= half + shoulder) & ~ctx.shore_guard(mpp)[y0:y1, x0:x1]
    new = np.where(touch, new, win).astype(np.float32)
    # A cut bench or a filled hollow must not leave a closed pocket: as the
    # levee kinds do, every hollow the grading newly closes is lifted to its
    # spill (a road drains along itself; a puddle deeper than
    # DEPRESSION_MIN_M would be new water, which invariant 4 refuses).
    # Judged over the padded window invariant 4 reasons in, so a hollow the
    # patch closes against ground OUTSIDE its region is seen too.
    py0, py1 = max(y0 - WINDOW_PAD_PX, 0), min(y1 + WINDOW_PAD_PX, h.shape[0])
    px0, px1 = max(x0 - WINDOW_PAD_PX, 0), min(x1 + WINDOW_PAD_PX, h.shape[1])
    big = h[py0:py1, px0:px1].astype(np.float32, copy=True)
    big_new = big.copy()
    big_new[y0 - py0:y1 - py0, x0 - px0:x1 - px0] = new
    big_touch = np.zeros(big.shape, bool)
    big_touch[y0 - py0:y1 - py0, x0 - px0:x1 - px0] = touch
    filled = 0
    dep_old = (_fill_window(big) - big) > DEPRESSION_MIN_M
    for _ in range(3):
        fill = _fill_window(big_new)
        pocket = ((fill - big_new) > DEPRESSION_MIN_M) & ~dep_old & big_touch
        if not pocket.any():
            break
        big_new = np.where(pocket, fill, big_new).astype(np.float32)
        filled += int(pocket.sum())
    new = big_new[y0 - py0:y1 - py0, x0 - px0:x1 - px0]
    out = h.copy()
    out[y0:y1, x0:x1] = new
    delta = new - win
    return out, {"samplesChanged": int((delta != 0).sum()), "pocketsFilled": filled,
                 "maxRaiseM": round(float(delta.max()), 3) if delta.size else 0.0,
                 "maxCutM": round(float(-delta.min()), 3) if delta.size else 0.0}


def _smoothstep(t: np.ndarray) -> np.ndarray:
    t = np.clip(t, 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def _station_fields(stations: list[dict], box: Box, mpp: float):
    """Per cell of `box`: index of the nearest station, its distance (m) and
    the signed side of the cell against that station's tangent (+1 left of
    the downstream direction in sample coordinates, -1 right)."""
    from scipy.spatial import cKDTree
    y0, y1, x0, x1 = box
    pts = np.array([[st["y"], st["x"]] for st in stations], dtype=np.float64)
    tree = cKDTree(pts)
    gy, gx = np.mgrid[y0:y1, x0:x1]
    d, i = tree.query(np.stack([gy.ravel(), gx.ravel()], 1))
    h = (y1 - y0, x1 - x0)
    i = i.reshape(h)
    d = (d.reshape(h) * mpp).astype(np.float32)
    tx = np.array([st.get("tx", 0.0) for st in stations], dtype=np.float32)[i]
    ty = np.array([st.get("ty", 0.0) for st in stations], dtype=np.float32)[i]
    side = np.sign(tx * (gy - pts[i, 0]) - ty * (gx - pts[i, 1])).astype(np.int8)
    return i, d, side


def apply_bed_cut(h: np.ndarray, patch: dict, mpp: float = RAW_M) -> tuple[np.ndarray, dict]:
    """Lower the ground along the patch's stations to the promised bed.
    `params.stations`: [{x, y (sample coords), halfWidthM, levelM, bedM,
    weir}] — inside a station's half-width the target is the parabola from
    `bedM` at the centre to `levelM` at the edge (the carve's section); a
    weir station floors the cut at its level across its width; past the
    width the cut CONTINUES the nearest inside cell's own cut, tapering to
    nothing over BED_CUT_BLEND_M (a bank is never cut down toward the level
    by the blend — that would gouge a hillside). `params.bankM`: ground
    standing above it inside the width is the trench's BANK (the carve's
    trench is narrower than the graph's width there), not a bump in the bed,
    and is left alone. Only ever lowers."""
    stations = patch["params"]["stations"]
    if not stations:
        raise ValueError("bed-cut has no stations")
    blend = float(patch.get("params", {}).get("blendM", BED_CUT_BLEND_M))
    box = region_box(patch, h.shape, mpp)
    y0, y1, x0, x1 = box
    win = h[y0:y1, x0:x1]
    gy, gx = np.mgrid[y0:y1, x0:x1]
    cut = np.full(win.shape, np.inf, dtype=np.float32)
    weir = np.full(win.shape, -np.inf, dtype=np.float32)
    inside_any = np.zeros(win.shape, bool)
    for st in stations:
        r = max(float(st["halfWidthM"]), 1e-3)
        d = np.hypot(gy - float(st["y"]), gx - float(st["x"])) * mpp
        L, bed = float(st["levelM"]), float(st["bedM"])
        inside = d <= r
        t = np.clip(d / r, 0.0, 1.0)
        parab = L - (L - bed) * (1.0 - t * t)
        cut = np.where(inside, np.minimum(cut, parab), cut)
        inside_any |= inside
        if st.get("weir"):
            weir = np.where(inside, np.maximum(weir, L), weir)
    target = np.where(inside_any, np.maximum(cut, weir), np.inf)
    bank = float(patch["params"].get("bankM", np.inf))
    inside_any &= win <= bank
    target = np.where(inside_any, target, np.inf)
    new = np.minimum(win, target).astype(np.float32)
    if blend > 0 and inside_any.any():
        dist, (ky, kx) = ndimage.distance_transform_edt(~inside_any, return_indices=True)
        dist = dist * mpp
        ring = ~inside_any & (dist <= blend)
        edge_delta = (new - win)[ky, kx]                       # the cut at the nearest inside cell (<= 0)
        new = np.where(ring, win + edge_delta * (1.0 - _smoothstep(dist / blend)), new).astype(np.float32)
    out = h.copy()
    out[y0:y1, x0:x1] = new
    delta = new - win
    return out, {"samplesCut": int((delta < 0).sum()), "maxCutM": round(float(-delta.min()), 3) if (delta < 0).any() else 0.0}


def apply_levee(h: np.ndarray, patch: dict, ctx: "Context", mpp: float = RAW_M) -> tuple[np.ndarray, dict]:
    """Raise the shoulder band beside the patch's stations to their crest.
    `params.stations`: [{x, y, tx, ty (sample coords, downstream tangent),
    halfWidthM, crestM}]. The band is edge + edgeGapM .. edge + bandM from
    the nearest station, on both sides (a side already at the crest moves
    nothing); every band cell rises to max(ground, crest) where the crest is
    the highest of the stations whose band reaches the cell; past the band the
    raise CONTINUES the nearest band cell's own raise, tapering to nothing
    over blendM (a cliff below the band is never filled by the blend);
    nothing inside any live channel's water width (`ctx`) or inside the gap
    moves. A pocket the bank newly closes behind it (judged on the window
    invariant 4 reads, the region padded) is lifted to its spill: a levee
    makes no water. Only ever raises."""
    from .channels import SHOULDER_BLEND_M
    stations = patch["params"]["stations"]
    if not stations:
        raise ValueError("levee has no stations")
    p = patch["params"]
    gap = float(p.get("edgeGapM", LEVEE_EDGE_GAP_M))
    band = float(p.get("bandM", SHOULDER_BLEND_M))
    blend = float(p.get("blendM", LEVEE_BLEND_M))
    ry0, ry1, rx0, rx1 = region_box(patch, h.shape, mpp)
    y0, y1 = max(ry0 - WINDOW_PAD_PX, 0), min(ry1 + WINDOW_PAD_PX, h.shape[0])
    x0, x1 = max(rx0 - WINDOW_PAD_PX, 0), min(rx1 + WINDOW_PAD_PX, h.shape[1])
    box = (y0, y1, x0, x1)
    win = h[y0:y1, x0:x1]
    in_region = np.zeros(win.shape, bool)
    in_region[ry0 - y0:ry1 - y0, rx0 - x0:rx1 - x0] = True
    i, d, _side = _station_fields(stations, box, mpp)
    r = np.array([float(st["halfWidthM"]) for st in stations], dtype=np.float32)[i]
    crest = np.array([float(st["crestM"]) for st in stations], dtype=np.float32)[i]
    # the crest follows the HIGHEST station whose band reaches the cell, not
    # the nearest: on a steep reach the cell beside station k is nearest to
    # k+1 a metre lower and k's water would hang (the carve's own rule,
    # channels.CREST_REACH_M caps how far above the nearest it may go)
    from .channels import CREST_REACH_M
    gy, gx = np.mgrid[y0:y1, x0:x1]
    high = crest.copy()
    for st in stations:
        rr = float(st["halfWidthM"]) + band
        dd = np.hypot(gy - float(st["y"]), gx - float(st["x"])) * mpp
        high = np.where(dd <= rr, np.maximum(high, float(st["crestM"])), high)
    crest = np.minimum(high, crest + CREST_REACH_M).astype(np.float32)
    inside_any, _sh = ctx.channel_masks(box, mpp)
    allowed = in_region & ~inside_any & (d >= r + gap)
    core = allowed & (d <= r + band)
    if not core.any():
        raise ValueError("the levee band holds no cells")
    need = np.maximum(crest - win, 0.0).astype(np.float32)
    raise_ = np.where(core, need, 0.0).astype(np.float32)
    if blend > 0:
        dist, (ky, kx) = ndimage.distance_transform_edt(~core, return_indices=True)
        dist = dist * mpp
        ring = allowed & ~core & (dist <= blend)
        carried = raise_[ky, kx] * (1.0 - _smoothstep(dist / blend))
        raise_ = np.where(ring, np.minimum(carried, need), raise_).astype(np.float32)
    new = (win + raise_).astype(np.float32)
    # a bank can trap a pocket behind it (a cell that drained to the channel
    # now sits between the levee and higher ground): a levee makes no water,
    # so every hollow it newly closes is lifted to its spill (a raise, inside
    # the region; one that reaches past the region is refused by invariant 4)
    filled = 0
    dep_old = (_fill_window(win) - win) > DEPRESSION_MIN_M
    fillable = in_region & ~inside_any                # the gap ring too; never the water width
    for _ in range(3):
        fill = _fill_window(new)
        pocket = ((fill - new) > DEPRESSION_MIN_M) & ~dep_old & fillable
        if not pocket.any():
            break
        new = np.where(pocket, fill, new).astype(np.float32)
        filled += int(pocket.sum())
    raise_ = new - win
    out = h.copy()
    out[y0:y1, x0:x1] = new
    return out, {"samplesRaised": int((raise_ > 0).sum()), "maxRaiseM": round(float(raise_.max()), 3),
                 "bandCells": int(core.sum()), "bandMinOverCrestM": round(float((new - crest)[core].min()), 3),
                 "pocketCellsFilled": filled}


# ----------------------------------------------------------- the invariants

def apply_rim_levee(h: np.ndarray, patch: dict, ctx: "Context", mpp: float = RAW_M) -> tuple[np.ndarray, dict]:
    """Raise a realised body's leaking dry rim to its freeboard.
    `params`: `levelM` (the body's level), `cells` [[y, x], ...] (sample
    coords: the compile's `stats.bodyRimLeaks` cells, dry ring cells
    8-adjacent to the body whose ground lies under its level) and `blendM`.
    Every listed cell and its dry 8-neighbours under the level rise to
    `max(ground, levelM + LEVEE_FREEBOARD_M)`, tapering outward over
    `blendM`; never a wet cell (the body itself), never inside a channel's
    water width. Only ever raises; it dries nothing, so the patch declares
    `driesBodyCells: false`."""
    cells = patch["params"]["cells"]
    if not cells:
        raise ValueError("rim levee has no cells")
    level = float(patch["params"]["levelM"])
    crest = level + LEVEE_FREEBOARD_M
    blend = float(patch["params"].get("blendM", LEVEE_BLEND_M))
    ry0, ry1, rx0, rx1 = region_box(patch, h.shape, mpp)
    y0, y1 = max(ry0 - WINDOW_PAD_PX, 0), min(ry1 + WINDOW_PAD_PX, h.shape[0])
    x0, x1 = max(rx0 - WINDOW_PAD_PX, 0), min(rx1 + WINDOW_PAD_PX, h.shape[1])
    box = (y0, y1, x0, x1)
    win = h[y0:y1, x0:x1]
    in_region = np.zeros(win.shape, bool)
    in_region[ry0 - y0:ry1 - y0, rx0 - x0:rx1 - x0] = True
    seed = np.zeros(win.shape, bool)
    for cy, cx in cells:
        iy, ix = int(cy) - y0, int(cx) - x0
        if 0 <= iy < win.shape[0] and 0 <= ix < win.shape[1]:
            seed[iy, ix] = True
    inside_any, _sh = ctx.channel_masks(box, mpp)
    wet = ctx.wet[y0:y1, x0:x1]
    allowed = in_region & ~inside_any & ~wet
    # the listed cells plus their dry 8-neighbours that stand under the level
    core = (seed | (ndimage.binary_dilation(seed, np.ones((3, 3), bool)) & (win < level))) & allowed
    if not core.any():
        raise ValueError("the rim levee band holds no cells")
    need = np.maximum(crest - win, 0.0).astype(np.float32)
    raise_ = np.where(core, need, 0.0).astype(np.float32)
    if blend > 0:
        dist, (ky, kx) = ndimage.distance_transform_edt(~core, return_indices=True)
        dist = dist * mpp
        ring = allowed & ~core & (dist <= blend)
        carried = raise_[ky, kx] * (1.0 - _smoothstep(dist / blend))
        raise_ = np.where(ring, np.minimum(carried, need), raise_).astype(np.float32)
    new = (win + raise_).astype(np.float32)
    # as apply_levee: a rim bank makes no water, so a hollow it newly closes
    # is lifted to its spill inside the region
    filled = 0
    dep_old = (_fill_window(win) - win) > DEPRESSION_MIN_M
    fillable = in_region & ~inside_any & ~wet
    for _ in range(3):
        fill = _fill_window(new)
        pocket = ((fill - new) > DEPRESSION_MIN_M) & ~dep_old & fillable
        if not pocket.any():
            break
        new = np.where(pocket, fill, new).astype(np.float32)
        filled += int(pocket.sum())
    out = h.copy()
    out[y0:y1, x0:x1] = new
    d = new - win
    return out, {"samplesRaised": int((d > 0).sum()), "maxRaiseM": round(float(d.max()), 3) if (d > 0).any() else 0.0,
                 "rimCells": int(core.sum()), "pocketsFilled": filled}


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
    kind = patch["kind"]
    raised_in = (inside if kind in SHOULDER_RAISE_KINDS else shoulder) & (d > 1e-4)
    if raised_in.any():
        where = "a channel's water width" if kind in SHOULDER_RAISE_KINDS else "a channel or its shoulder"
        errs.append(f"channels: {int(raised_in.sum())} samples raised inside {where}")
    if kind == "bed-cut" and (d > 1e-4).any():
        errs.append(f"bed-cut: {int((d > 1e-4).sum())} samples raised (a bed-cut only lowers)")
    if kind == "levee" and (d < -1e-4).any():
        errs.append(f"levee: {int((d < -1e-4).sum())} samples lowered (a levee only raises)")
    if patch["kind"] not in CHANNEL_CLASS_KINDS:
        lowered_in = shoulder & (d < -1e-4)
        if lowered_in.any():
            errs.append(f"channels: {int(lowered_in.sum())} samples lowered inside a channel or its shoulder by a non-channel kind")
    # 4. water: the bounded re-flood at the frozen levels
    errs += water_violations(b, a, lvl_window=ctx.level[wy0:wy1, wx0:wx1],
                             region=(ry0 - wy0, ry1 - wy0, rx0 - wx0, rx1 - wx0),
                             makes_water=bool(patch.get("makesWater")),
                             dries_body_cells=dries_body_cells(patch),
                             channel_width=inside if kind in CHANNEL_CLASS_KINDS + SHOULDER_RAISE_KINDS else None)
    # 7. recorded water (16e): a graded road never touches a wet cell
    if kind in GRADE_KINDS:
        wet_touched = (d != 0) & ctx.shore_guard(mpp)[wy0:wy1, wx0:wx1]
        if wet_touched.any():
            errs.append(f"water: {int(wet_touched.sum())} samples inside recorded water or its {SHORE_GUARD_M:.0f} m "
                        f"shore band moved by a {kind} patch")
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


def dries_body_cells(patch: dict) -> bool:
    """Only a levee may dry a body's fringe, and only by saying so."""
    return patch.get("kind") in SHOULDER_RAISE_KINDS and bool(patch.get("driesBodyCells"))


def water_violations(b: np.ndarray, a: np.ndarray, lvl_window: np.ndarray, region,
                     makes_water: bool, dries_body_cells: bool = False,
                     channel_width: np.ndarray | None = None) -> list[str]:
    """Invariant 4 over one window: `b`/`a` the ground before/after, `lvl_window`
    the frozen flood level (-inf dry, 0 sea), `region` the patch region in
    window coordinates. Flood from every frozen wet component at its own
    level over the ground BEFORE and AFTER: no frozen wet cell may dry, the
    body may gain no cell beyond the region nor newly reach the window edge
    that it did not already reach on the frozen ground (the frozen raster is
    not a closed flat flood everywhere — a body beside a trench, a captured
    body at its old level — so a patch is judged by what it CHANGES, not by
    the raster's own leaks; before 2026-09-14 a no-op was refused there), and
    no new closed depression may appear unless the patch makes water (and
    then only inside the region). A patch that `dries_body_cells` (a levee)
    may dry wet cells inside the region only, and every body it touches keeps
    its level: its deepest cell unmoved and still under the level for a body
    whose extent the window holds whole, and never dried entirely — it seals
    a fringe, never drains. `channel_width` (a channel-class kind or a levee)
    marks the cells inside a channel's water width: a hollow a bed-cut
    deepens there, or a trench a levee's bank newly closes, is the river's
    own bed, not new water."""
    errs: list[str] = []
    lvl = lvl_window
    old_wet = np.isfinite(lvl)
    if isinstance(region, np.ndarray):
        in_region = region.astype(bool)             # a mask (the gate: the union of the applied regions)
    else:
        ry0, ry1, rx0, rx1 = region
        in_region = np.zeros(a.shape, bool)
        in_region[ry0:ry1, rx0:rx1] = True
    dried = old_wet & (a >= lvl - 1e-4) & (b < lvl - 1e-4)
    if dried.any():
        if not dries_body_cells:
            errs.append(f"water: {int(dried.sum())} frozen wet samples dried")
        elif (dried & ~in_region).any():
            errs.append(f"water: {int((dried & ~in_region).sum())} frozen wet samples dried beyond the patch region")
    if old_wet.any():
        lbl, n = ndimage.label(old_wet, structure=np.ones((3, 3), bool))
        levels = ndimage.maximum(np.where(old_wet, lvl, -np.inf), lbl, np.arange(1, n + 1))
        edge = np.zeros(a.shape, bool)
        edge[0, :] = edge[-1, :] = edge[:, 0] = edge[:, -1] = True
        for i, L in enumerate(np.atleast_1d(levels), start=1):
            seed = lbl == i
            if dries_body_cells and (dried & seed).any():
                if not (seed & edge).any():
                    deep = np.flatnonzero(seed.ravel())[np.argmin(b.ravel()[seed.ravel()])]
                    if a.ravel()[deep] != b.ravel()[deep] or a.ravel()[deep] >= L - 1e-4:
                        errs.append(f"water: the body at {float(L):.2f} m had its deepest cell moved by the levee")
                if not ((a < L - 1e-4) & seed).any():
                    errs.append(f"water: the body at {float(L):.2f} m was dried entirely")
            flood_b = _flood(b, L, seed)
            flood_a = _flood(a, L, seed)
            new = flood_a & ~flood_b
            if not new.any():
                continue
            if (new & ~in_region).any():
                errs.append(f"water: body at {float(L):.2f} m gains {int((new & ~in_region).sum())} samples beyond the patch region")
            if (new & edge).any():
                errs.append(f"water: body at {float(L):.2f} m floods past the window edge (unbounded)")
    dep_a = (_fill_window(a) - a) > DEPRESSION_MIN_M
    dep_b = (_fill_window(b) - b) > DEPRESSION_MIN_M
    new_dep = dep_a & ~dep_b & ~old_wet
    if channel_width is not None:
        new_dep &= ~channel_width
    if new_dep.any():
        if not makes_water:
            errs.append(f"water: {int(new_dep.sum())} samples of new depression (makesWater not declared)")
        elif (new_dep & ~in_region).any():
            errs.append(f"water: new depression reaches {int((new_dep & ~in_region).sum())} samples beyond the region")
    return errs


def _flood(g: np.ndarray, L: float, seed: np.ndarray) -> np.ndarray:
    """The flat flood at `L` from `seed` over ground `g` (8-connected)."""
    cand = (g < L - 1e-4) | seed
    comp, _ = ndimage.label(cand, structure=np.ones((3, 3), bool))
    ids = np.unique(comp[seed])
    return np.isin(comp, ids[ids > 0])


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
