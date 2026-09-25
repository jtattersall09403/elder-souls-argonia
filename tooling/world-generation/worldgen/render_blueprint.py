"""Blueprint map renderer — the layout-iteration medium (Phase 11 Part 0 item 5).

Takes a settlement blueprint (schema: `worldgen.blueprint`) and renders a
top-down annotated diagram over a hillshaded crop of the REAL province terrain:
districts, routes/canals/boardwalks, parcels (their REAL derived outlines,
coloured by ground fit and labelled with the authored yaw), docks,
doors (with facing), landmarks, combat spaces, quest sockets, water and
contours — plus a legend and a title block carrying the id, seed and declared
budget. Seconds to regenerate; that is the whole point.

Run (from tooling/world-generation/):

    python -m worldgen.render_blueprint --blueprint world/sources/blueprints/<id>.json
    python -m worldgen.render_blueprint --blueprint <path> --out <dir> --no-terrain

    python -m worldgen.render_blueprint --blueprint <path> --plan
    python -m worldgen.render_blueprint --layout world/sources/blueprints/<id>.layout.json

`--plan` adds only what a 3D top view cannot show (decision 0100 decision 3):
each parcel's ground delta under its outline in metres against its fit's
limit, door facing in degrees, the clearance polygons by tier and kept
features, and every socket (quest sockets bound to a parcel, network
terminals). `--layout` renders the blueprint `wb.py apply` derived from that
layout (tooling/placement-workbench/output/apply/<placeId>.blueprint.json),
refusing when the layout changed since that apply; it implies `--plan` and
writes `<id>.plan.png`.

Output: `<out>/<blueprint-id>.png` (default out: tooling/world-generation/output/
blueprint-maps/, gitignored — renders are derived, the blueprint is the source).

Terrain comes from the committed refined rasters through the same loader the
rest of Phase 11's siting tools use (`worldgen.site_fields`, which composes
`compile_scatter.ProvinceFields`); `--no-terrain` skips it for a fast, raster-
independent diagram.

Determinism (standard 6): the only randomness is seeded label-offset jitter
(`--seed`, defaulting to the blueprint's own seed), and the PNG carries no
timestamp — the same blueprint + seed renders byte-identical every time.

Coordinates: blueprints are authored in province UV; this module converts to
world metres (X east, Z south, origin at the province's north-west corner —
module 00-core §8) and plots in metres so scale bars and widths are honest.
"""

from __future__ import annotations

import argparse
import json
import math
import random
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt          # noqa: E402
import numpy as np                        # noqa: E402
from matplotlib.lines import Line2D       # noqa: E402
from matplotlib.patches import Patch, Polygon as MplPolygon  # noqa: E402

from .blueprint import SCHEMA_VERSION, validate_blueprint  # noqa: E402
from .scale import PROVINCE_EXTENT_M                       # noqa: E402
from .site_fields import PROVINCE, REPO_ROOT               # noqa: E402

DEFAULT_OUT = REPO_ROOT / "tooling" / "world-generation" / "output" / "blueprint-maps"

# District fill by culture kit (the two-culture rule reads at a glance).
# One fill per kit SET (blueprint.KIT_SETS): the Argonian sets share a green
# family so the two-culture rule still reads at a glance.
CULTURE_FILL = {
    "argonian": "#3f7a5a", "argonian-stilt": "#2f8a7a", "argonian-mud": "#5a8a3f",
    "argonian-root": "#2e6b45", "argonian-stone": "#4f7f6a",
    "imperial": "#8a6a45", "dunmer-hlaalu": "#8a4f5a",
    "neutral-works": "#7a7a5a", "neutral-underwater": "#4a6a8a",
}
# Parcel fill by ground fit — the slope ladder, cheapest first.
GROUND_FIT_FILL = {
    "direct": "#d9d2c4", "plinth": "#c9b98f", "pad": "#c2a978",
    "stilt": "#9fc6d8", "dug-in": "#a89bb5",
}
WAY_STYLE = {
    # kind -> (colour, linestyle)
    "route": ("#e0c48a", "-"),
    "canal": ("#6fb7e0", "-"),
    "boardwalk": ("#caa06a", "--"),
}
PAD_M = 60.0
MIN_SPAN_M = 150.0


# --------------------------------------------------------------------------- #
# geometry helpers
# --------------------------------------------------------------------------- #
def _points(obj, *keys) -> list[list[float]]:
    """Every [u, v] pair found under any of `keys` (polygon or polyline)."""
    out: list[list[float]] = []
    for k in keys:
        v = obj.get(k)
        if isinstance(v, list) and v and isinstance(v[0], list):
            out += [p for p in v if isinstance(p, list) and len(p) == 2]
        elif isinstance(v, list) and len(v) == 2 and all(isinstance(c, (int, float)) for c in v):
            out.append(list(v))
    return out


def collect_uv(bp: dict) -> list[list[float]]:
    """Every authored coordinate in the blueprint, for the crop bounding box.
    When the blueprint has a boundary, the crop follows the boundary and the
    built things inside it; approach routes are drawn but do not widen the
    crop (a 300 m approach line was turning village maps into landscape)."""
    uv = _points(bp, "boundary")
    if uv:
        for p in bp.get("parcels", []):
            uv += _points(p, "footprint", "centreUV", "position")
        for lm in bp.get("landmarks", []):
            uv += _points(lm, "position")
        for dk in bp.get("docks", []):
            uv += _points(dk, "position")
        for cs in bp.get("combatSpaces", []):
            uv += _points(cs, "boundary")
        return uv
    for d in bp.get("districts", []):
        uv += _points(d, "boundary")
    for group in ("routes", "canals", "boardwalks"):
        for w in bp.get(group, []):
            uv += _points(w, "points")
    for p in bp.get("parcels", []):
        uv += _points(p, "footprint", "centreUV", "position")
    for lm in bp.get("landmarks", []):
        uv += _points(lm, "position")
    for dk in bp.get("docks", []):
        uv += _points(dk, "position")
    for dr in bp.get("doors", []):
        uv += _points(dr, "thresholdUV")
    for cs in bp.get("combatSpaces", []):
        uv += _points(cs, "boundary")
    for s in bp.get("questSockets", []):
        uv += _points(s, "position")
    return uv


def uv_to_m(points: list[list[float]], extent_m: float) -> np.ndarray:
    return np.asarray(points, dtype=np.float64) * extent_m


def crop_box(bp: dict, extent_m: float, pad_m: float) -> tuple[float, float, float, float]:
    uv = collect_uv(bp)
    if not uv:
        raise ValueError("blueprint has no coordinates to render")
    pts = uv_to_m(uv, extent_m)
    x0, z0 = pts.min(axis=0) - pad_m
    x1, z1 = pts.max(axis=0) + pad_m
    # Keep the crop square and never smaller than MIN_SPAN_M, so tiny camps
    # still render at a legible scale.
    cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
    span = max(x1 - x0, z1 - z0, MIN_SPAN_M) / 2
    return cx - span, cz - span, cx + span, cz + span


# --------------------------------------------------------------------------- #
# terrain
# --------------------------------------------------------------------------- #
class TerrainCrop:
    """Height/depth crop + hillshade for one blueprint's footprint."""

    def __init__(self, box: tuple[float, float, float, float], fields):
        px = float(fields.px_m)
        n = fields.height_m.shape[0]
        x0, z0, x1, z1 = box
        c0 = max(0, int(math.floor(x0 / px)))
        r0 = max(0, int(math.floor(z0 / px)))
        c1 = min(n, int(math.ceil(x1 / px)) + 1)
        r1 = min(n, int(math.ceil(z1 / px)) + 1)
        self.px_m = px
        self.r0, self.c0 = r0, c0
        self.height = np.asarray(fields.height_m[r0:r1, c0:c1], dtype=np.float32)
        self.depth = np.asarray(fields.depth_m[r0:r1, c0:c1], dtype=np.float32)
        self.extent = (c0 * px, c1 * px, r1 * px, r0 * px)  # imshow extent, z down

    def height_at(self, x: float, z: float) -> float:
        """The compile's own sampler (`ProvinceSurvey.height_at`: the nearest
        pixel of the refined raster), inside the crop."""
        rows, cols = self.height.shape
        r = min(max(int(z / self.px_m) - self.r0, 0), rows - 1)
        c = min(max(int(x / self.px_m) - self.c0, 0), cols - 1)
        return float(self.height[r, c])

    @property
    def hillshade(self) -> np.ndarray:
        gz, gx = np.gradient(self.height.astype(np.float64), self.px_m)
        slope = np.arctan(np.hypot(gx, gz))
        aspect = np.arctan2(-gz, gx)
        az, alt = math.radians(315.0), math.radians(45.0)
        shade = (np.sin(alt) * np.cos(slope)
                 + np.cos(alt) * np.sin(slope) * np.cos(az - aspect))
        return np.clip(shade, 0.0, 1.0)


# --------------------------------------------------------------------------- #
# rendering
# --------------------------------------------------------------------------- #
def _poly(ax, pts_m: np.ndarray, **kw) -> None:
    ax.add_patch(MplPolygon(pts_m[:, :2], closed=True, **kw))


PLAN_COLOURS = {"hardClear": "#ff5c5c", "thinned": "#f2a65a", "kept": "#7bd88f",
                "terminal": "#61dafb", "over": "#ff4d4d", "within": "#f4f7fb"}


def _plan_overlay(ax, bp: dict, crop, to_m) -> dict:
    """What a 3D top view cannot show (0100 decision 3): the ground delta
    under each parcel's outline against its fit's limit (the compile's own
    rule, `compile_settlement.FIT_MAX`; needs the terrain; red over the
    limit), door facing in
    degrees, the clearance polygons by tier and kept features, and sockets
    with no position of their own (bound to a parcel) and network
    terminals."""
    from .compile_settlement import FIT_MAX, KitShelf, with_record_ground_fits
    # the compile's own resolution (the district's kit set, not the first
    # kit holding the id: 53 asset ids carry different fits in two kits)
    fitted, _errors = with_record_ground_fits(bp, KitShelf())
    fits = {p.get("id"): p.get("groundFit") for p in fitted.get("parcels", [])}
    got = {"padDeltas": 0, "padOver": 0, "doorFacings": 0, "clearance": 0, "kept": 0,
           "parcelSockets": 0, "terminals": 0}
    centres = {}
    for p in bp.get("parcels", []):
        foot = p.get("footprint")
        if not (foot and isinstance(foot[0], list)) or not p.get("centreUV"):
            continue
        m = to_m(foot)
        cx, cz = to_m([p["centreUV"]])[0]
        centres[p.get("id")] = (cx, cz)
        if crop is None:
            continue
        heights = [crop.height_at(x, z) for x, z in m] + [crop.height_at(cx, cz)]
        delta = max(heights) - min(heights)
        fit = fits.get(p.get("id"))
        limit = FIT_MAX.get(fit) if fit else None
        over = limit is not None and delta > limit
        text = f"\u0394{delta:.2f}" + (f"/{limit:.2f}" if limit is not None
                                         and math.isfinite(limit) else "") + " m"
        ax.text(float(m[:, 0].min()), float(m[:, 1].max()) + 1.0, text, fontsize=6.5,
                color=PLAN_COLOURS["over" if over else "within"], zorder=9, va="top",
                bbox=dict(boxstyle="round,pad=0.15", fc="#0d1218cc", ec="none"))
        got["padDeltas"] += 1
        got["padOver"] += int(over)
    for dr in bp.get("doors", []):
        if dr.get("thresholdUV") and dr.get("facingDeg") is not None:
            cx, cz = to_m([dr["thresholdUV"]])[0]
            facing = float(dr["facingDeg"])
            dx, dz = math.sin(math.radians(facing)) * 8.5, -math.cos(math.radians(facing)) * 8.5
            ax.text(cx + dx, cz + dz, f"{facing:.0f}\u00b0", fontsize=6.5, color="#ff8f5e",
                    ha="center", va="center", zorder=9)
            got["doorFacings"] += 1
    clearance = bp.get("clearance") or {}
    for tier, style in (("hardClear", (0, (5, 3))), ("thinned", (0, (1, 2)))):
        for poly in clearance.get(tier) or []:
            if poly and isinstance(poly[0], list):
                _poly(ax, to_m(poly), fill=False, edgecolor=PLAN_COLOURS[tier],
                      linewidth=1.1, linestyle=style, zorder=3)
                got["clearance"] += 1
    for item in clearance.get("kept") or []:
        if isinstance(item, dict) and item.get("position"):
            cx, cz = to_m([item["position"]])[0]
            ax.plot(cx, cz, marker="o", markersize=7, markerfacecolor="none",
                    markeredgecolor=PLAN_COLOURS["kept"], zorder=8)
            ax.text(cx + 2, cz - 2, str(item.get("kind", "kept")), fontsize=6,
                    color=PLAN_COLOURS["kept"], zorder=9)
            got["kept"] += 1
    for sk in bp.get("questSockets", []):
        if not sk.get("position") and sk.get("parcelId") in centres:
            cx, cz = centres[sk["parcelId"]]
            ax.plot(cx, cz, marker="x", markersize=8, color="#c678dd", zorder=8)
            ax.text(cx + 2, cz + 2, f"{sk.get('kind')}", fontsize=6, color="#e0b6ef", zorder=9)
            got["parcelSockets"] += 1
    for t in bp.get("networkTerminals", []):
        if t.get("entryUV"):
            cx, cz = to_m([t["entryUV"]])[0]
            ax.plot(cx, cz, marker="^", markersize=8, color=PLAN_COLOURS["terminal"],
                    markeredgecolor="#0d1218", zorder=8)
            ax.text(cx + 2, cz + 2, str(t.get("id", "")).rsplit(".", 1)[-1], fontsize=6,
                    color=PLAN_COLOURS["terminal"], zorder=9)
            got["terminals"] += 1
    return got


def render(bp: dict, out_path: Path, *, terrain: bool = True, pad_m: float = PAD_M,
           seed: int | None = None, extent_m: float | None = None,
           crop_m: tuple[float, float, float, float] | None = None,
           plan: bool = False) -> dict:
    """Render one blueprint. Returns a summary of what was drawn.

    `crop_m` (x0, z0, x1, z1 in world metres) overrides the automatic box so a
    district of a city can be rendered at a legible scale.
    """
    crop = None
    if terrain:
        # One raster decode (~2 s): it gives both the province extent and the
        # crop's heights/depths.
        from .compile_scatter import ProvinceFields
        fields = ProvinceFields(PROVINCE)
        extent_m = extent_m or PROVINCE_EXTENT_M
        crop = TerrainCrop(crop_m or crop_box(bp, extent_m, pad_m), fields)
    extent_m = extent_m or PROVINCE_EXTENT_M
    box = crop_m or crop_box(bp, extent_m, pad_m)

    rng = random.Random(seed if seed is not None else str(bp.get("seed", "")))
    x0, z0, x1, z1 = box
    to_m = lambda pts: uv_to_m(pts, extent_m)  # noqa: E731

    fig, ax = plt.subplots(figsize=(11, 11), dpi=110)
    ax.set_facecolor("#14181e")
    drawn = {"districts": 0, "parcels": 0, "ways": 0, "docks": 0,
             "doors": 0, "landmarks": 0, "sockets": 0, "combatSpaces": 0}

    # -- terrain: hillshade, water, contours -------------------------------
    if crop is not None:
        ax.imshow(crop.hillshade, extent=crop.extent, cmap="gray",
                  vmin=0.0, vmax=1.0, origin="upper", interpolation="bilinear")
        water = np.ma.masked_where(crop.depth <= 0.05, crop.depth)
        ax.imshow(water, extent=crop.extent, cmap="Blues", origin="upper",
                  alpha=0.55, vmin=0.0, vmax=4.0, interpolation="nearest")
        h = crop.height
        rows, cols = h.shape
        xs = crop.extent[0] + (np.arange(cols) + 0.5) * crop.px_m
        zs = crop.extent[3] + (np.arange(rows) + 0.5) * crop.px_m
        lo, hi = float(h.min()), float(h.max())
        if hi - lo > 0.2:
            step = max(0.5, round((hi - lo) / 12, 1))
            levels = np.arange(math.floor(lo), math.ceil(hi) + step, step)
            cs = ax.contour(xs, zs, h, levels=levels, colors="#7f8c99",
                            linewidths=0.5, alpha=0.7)
            ax.clabel(cs, inline=True, fontsize=6, fmt="%.0f")

    # -- settlement boundary ------------------------------------------------
    if bp.get("boundary"):
        _poly(ax, to_m(bp["boundary"]), fill=False, edgecolor="#f2f2f2",
              linewidth=1.6, linestyle=(0, (6, 4)), zorder=3)

    # -- districts ----------------------------------------------------------
    for d in bp.get("districts", []):
        pts = d.get("boundary")
        colour = CULTURE_FILL.get(d.get("cultureKit"), "#777777")
        if pts:
            m = to_m(pts)
            _poly(ax, m, facecolor=colour, alpha=0.22, edgecolor=colour,
                  linewidth=1.4, zorder=2)
            cx, cz = m.mean(axis=0)
        else:
            cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
        ax.text(cx, cz, f"{d.get('id')}\n{d.get('kind', '')}", color="#f4f7fb",
                fontsize=8, ha="center", va="center", zorder=6,
                bbox=dict(boxstyle="round,pad=0.2", fc="#0d1218cc", ec="none"))
        drawn["districts"] += 1

    # -- routes, canals, boardwalks ----------------------------------------
    for group, key in (("routes", "route"), ("canals", "canal"), ("boardwalks", "boardwalk")):
        colour, style = WAY_STYLE[key]
        for w in bp.get(group, []):
            pts = w.get("points")
            if not pts:
                continue
            m = to_m(pts)
            width = float(w.get("widthM", 2.0))
            ax.plot(m[:, 0], m[:, 1], color=colour, linestyle=style, zorder=4,
                    linewidth=max(1.2, width * 0.9), solid_capstyle="round", alpha=0.9)
            ax.text(m[0, 0], m[0, 1], str(w.get("id", "")), color=colour,
                    fontsize=6.5, zorder=6)
            drawn["ways"] += 1

    # -- parcels ------------------------------------------------------------
    # `footprint` is the DERIVED outline — the asset's measured ground hull,
    # rotated by the authored yawDeg and placed at centreUV — so what is drawn
    # here is the building's real plan, not a box (owner ruling 2026-09-05).
    for p in bp.get("parcels", []):
        fill = GROUND_FIT_FILL.get(p.get("groundFit"), "#cccccc")
        foot = p.get("footprint")
        if foot and isinstance(foot[0], list):
            m = to_m(foot)
            _poly(ax, m, facecolor=fill, alpha=0.85, edgecolor="#20262e",
                  linewidth=0.9, zorder=5)
            cx, cz = to_m([p["centreUV"]])[0] if p.get("centreUV") else m.mean(axis=0)
        elif p.get("position"):
            cx, cz = to_m([p["position"]])[0]
            ax.plot(cx, cz, marker="s", markersize=7, color=fill,
                    markeredgecolor="#20262e", zorder=5)
        else:
            continue
        jitter = rng.uniform(-1.5, 1.5)
        yaw = p.get("yawDeg")
        label = f"{p.get('id')}\n{p.get('buildingFamily', '')}"
        if isinstance(yaw, (int, float)):
            label += f"  {float(yaw):.0f}\u00b0"
        ax.text(cx, cz + jitter, label,
                fontsize=5.8, color="#0d1218", ha="center", va="center", zorder=7)
        drawn["parcels"] += 1

    # -- docks --------------------------------------------------------------
    for dk in bp.get("docks", []):
        if not dk.get("position"):
            continue
        cx, cz = to_m([dk["position"]])[0]
        ax.plot(cx, cz, marker="P", markersize=10, color="#3fa7d6",
                markeredgecolor="#0d1218", zorder=6)
        ax.text(cx + 2, cz, str(dk.get("id", "")), fontsize=6, color="#cfe9f7", zorder=7)
        drawn["docks"] += 1

    # -- doors (threshold + facing arrow) ----------------------------------
    for dr in bp.get("doors", []):
        if not dr.get("thresholdUV"):
            continue
        cx, cz = to_m([dr["thresholdUV"]])[0]
        # the threshold sits ON the parcel outline, so show it as a dot on the
        # edge and let the arrow read as the way out of that wall
        ax.plot(cx, cz, marker="o", markersize=3.2, color="#ff8f5e",
                markeredgecolor="#0d1218", markeredgewidth=0.4, zorder=8)
        facing = math.radians(float(dr.get("facingDeg", 0.0)))
        # facingDeg is a compass bearing: 0 = north (−Z), clockwise.
        dx, dz = math.sin(facing) * 6.0, -math.cos(facing) * 6.0
        ax.annotate("", xy=(cx + dx, cz + dz), xytext=(cx, cz), zorder=7,
                    arrowprops=dict(arrowstyle="-|>", color="#ff8f5e", lw=1.2))
        ax.plot(cx, cz, marker="o", markersize=4, color="#ff8f5e",
                markeredgecolor="#0d1218", zorder=7)
        drawn["doors"] += 1

    # -- landmarks ----------------------------------------------------------
    for lm in bp.get("landmarks", []):
        if not lm.get("position"):
            continue
        cx, cz = to_m([lm["position"]])[0]
        ax.plot(cx, cz, marker="*", markersize=15, color="#ffd166",
                markeredgecolor="#0d1218", zorder=7)
        ax.text(cx + 3, cz - 3, f"{lm.get('id')} ({lm.get('kind', '')})",
                fontsize=7, color="#ffe6ad", zorder=8)
        drawn["landmarks"] += 1

    # -- combat spaces + quest sockets -------------------------------------
    for cs in bp.get("combatSpaces", []):
        if cs.get("boundary"):
            _poly(ax, to_m(cs["boundary"]), fill=False, edgecolor="#e06c75",
                  linewidth=1.0, linestyle=(0, (3, 3)), zorder=4)
            drawn["combatSpaces"] += 1
    for s in bp.get("questSockets", []):
        if not s.get("position"):
            continue
        cx, cz = to_m([s["position"]])[0]
        ax.plot(cx, cz, marker="x", markersize=8, color="#c678dd", zorder=7)
        ax.text(cx + 2, cz + 2, f"{s.get('kind')}", fontsize=6,
                color="#e0b6ef", zorder=8)
        drawn["sockets"] += 1

    if plan:
        drawn["plan"] = _plan_overlay(ax, bp, crop, to_m)

    # -- frame, scale bar, title block, legend ------------------------------
    ax.set_xlim(x0, x1)
    ax.set_ylim(z1, z0)                    # Z grows south — north is up
    ax.set_aspect("equal")
    ax.set_xlabel("world X east (m)", fontsize=8)
    ax.set_ylabel("world Z south (m)", fontsize=8)
    ax.tick_params(labelsize=7)

    span = x1 - x0
    bar = max(10.0, round(span / 5 / 10) * 10)
    bx, bz = x0 + span * 0.05, z1 - span * 0.05
    ax.plot([bx, bx + bar], [bz, bz], color="#f2f2f2", lw=3, zorder=9)
    ax.text(bx + bar / 2, bz - span * 0.015, f"{bar:.0f} m", color="#f2f2f2",
            fontsize=8, ha="center", va="bottom", zorder=9)

    budget = bp.get("budget", {})
    title = (f"{bp.get('id')}  ·  seed {bp.get('seed')}  ·  "
             f"{drawn['districts']} districts, {drawn['parcels']} parcels, "
             f"{drawn['doors']} doors")
    sub = ("budget: " + ", ".join(f"{k} {v}" for k, v in sorted(budget.items()))
           if budget else "no declared budget")
    ax.set_title(f"{title}\n{sub}", fontsize=10, color="#e6ecf5", pad=10)

    used_sets = {d.get("cultureKit") for d in bp.get("districts", [])}
    handles = [Patch(facecolor=c, alpha=0.35, edgecolor=c, label=f"district: {k}")
               for k, c in CULTURE_FILL.items() if k in used_sets]
    handles += [Patch(facecolor=c, edgecolor="#20262e", label=f"parcel: {k}")
                for k, c in GROUND_FIT_FILL.items()]
    handles += [Line2D([], [], color=c, linestyle=s, label=k)
                for k, (c, s) in WAY_STYLE.items()]
    handles += [
        Line2D([], [], color="#3fa7d6", marker="P", linestyle="", label="dock"),
        Line2D([], [], color="#ff8f5e", marker="o", linestyle="", label="door (arrow = facing)"),
        Line2D([], [], color="#ffd166", marker="*", linestyle="", label="landmark"),
        Line2D([], [], color="#c678dd", marker="x", linestyle="", label="quest socket"),
        Line2D([], [], color="#e06c75", linestyle=(0, (3, 3)), label="combat space"),
        Line2D([], [], color="#7f8c99", linewidth=0.5, label="contour (m)"),
        Patch(facecolor="#6fb7e0", alpha=0.55, label="water"),
    ]
    if plan:
        handles += [
            Line2D([], [], color=PLAN_COLOURS["hardClear"], linestyle=(0, (5, 3)),
                   label="clearance: hard clear"),
            Line2D([], [], color=PLAN_COLOURS["thinned"], linestyle=(0, (1, 2)),
                   label="clearance: thinned"),
            Line2D([], [], color=PLAN_COLOURS["kept"], marker="o", linestyle="",
                   label="kept feature"),
            Line2D([], [], color=PLAN_COLOURS["terminal"], marker="^", linestyle="",
                   label="network terminal"),
            Line2D([], [], color="#ffffff", linestyle="", marker="$\\Delta$",
                   label="ground delta under the outline / fit limit (m)"),
        ]
    ax.legend(handles=handles, loc="upper left", bbox_to_anchor=(1.01, 1.0),
              fontsize=7, framealpha=0.9)

    fig.patch.set_facecolor("#0d1218")
    for spine in ax.spines.values():
        spine.set_color("#3a4655")
    ax.xaxis.label.set_color("#c7ced8")
    ax.yaxis.label.set_color("#c7ced8")
    ax.tick_params(colors="#c7ced8")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    # metadata: no Software/Date keys -> byte-identical renders (standard 6).
    fig.savefig(out_path, bbox_inches="tight", facecolor=fig.get_facecolor(),
                metadata={"Software": None})
    plt.close(fig)

    return {"id": bp.get("id"), "out": str(out_path), "cropM": [x0, z0, x1, z1],
            "terrain": crop is not None, **drawn}


def load_blueprint(path: Path) -> dict:
    data = json.loads(Path(path).read_text())
    if data.get("schemaVersion") != SCHEMA_VERSION:
        raise ValueError(f"{path}: schemaVersion must be {SCHEMA_VERSION}")
    return data["blueprint"]


APPLY_OUT = REPO_ROOT / "tooling" / "placement-workbench" / "output" / "apply"


def applied_blueprint(layout: Path, apply_out: Path = APPLY_OUT) -> Path:
    """The derived blueprint `wb.py apply` left for this layout (its compile
    step writes it; `apply` deletes the old one first), refused unless its
    own `authoredOn.layout.sha256` is this layout file's hash: a stale plan
    is worse than none."""
    import hashlib
    doc = json.loads(Path(layout).read_text())
    derived = apply_out / f"{doc.get('placeId')}.blueprint.json"
    if not derived.exists():
        raise ValueError(f"no applied blueprint for {doc.get('placeId')}: run "
                         f"`wb.py apply {layout}` (with its compile) first")
    authored = (json.loads(derived.read_text())["blueprint"].get("authoredOn") or {})
    now = hashlib.sha256(Path(layout).read_bytes()).hexdigest()
    if (authored.get("layout") or {}).get("sha256") != now:
        raise ValueError(f"{layout} changed since the last apply: run `wb.py apply {layout}` "
                         f"again")
    return derived


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--blueprint", type=Path, help="blueprint JSON path")
    src.add_argument("--layout", type=Path,
                     help="a workbench layout: render the blueprint `wb.py apply` derived from "
                          "it (implies --plan)")
    ap.add_argument("--plan", action="store_true",
                    help="add ground deltas, door facings, clearance tiers and sockets")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT, help="output directory")
    ap.add_argument("--pad-m", type=float, default=PAD_M, help="crop padding, metres")
    ap.add_argument("--seed", type=int, default=None, help="label-jitter seed")
    ap.add_argument("--no-terrain", action="store_true",
                    help="skip the hillshade/contour crop (fast, raster-independent)")
    ap.add_argument("--skip-validate", action="store_true",
                    help="render even if the blueprint fails schema validation")
    ap.add_argument("--crop", type=str, default=None,
                    help="world-metre box x0,z0,x1,z1 to render instead of the whole place "
                         "(a district of a city at a legible scale)")
    ap.add_argument("--name", type=str, default=None,
                    help="output file stem (default: the blueprint id)")
    args = ap.parse_args(argv)
    crop_m = None
    if args.crop:
        x0, z0, x1, z1 = (float(v) for v in args.crop.split(","))
        crop_m = (x0, z0, x1, z1)

    plan = args.plan or args.layout is not None
    try:
        bp = load_blueprint(args.blueprint or applied_blueprint(args.layout))
    except ValueError as err:
        print(f"render_blueprint: {err}")
        return 1
    if not args.skip_validate:
        # Catalogue cross-check is deliberately off: this tool renders drafts
        # and fixtures too. `python -m worldgen.blueprint --check` is the gate.
        errors = validate_blueprint(bp, None)
        for e in errors:
            print(f"blueprint: {e}")
        if errors:
            print("render_blueprint: schema errors above — rerun with --skip-validate "
                  "to render anyway")
            return 1

    stem = args.name or (f"{bp['id']}.plan" if args.layout else bp["id"])
    summary = render(bp, args.out / f"{stem}.png", terrain=not args.no_terrain,
                     pad_m=args.pad_m, seed=args.seed, crop_m=crop_m, plan=plan)
    print(json.dumps(summary, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
