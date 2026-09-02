"""Blueprint map renderer — the layout-iteration medium (Phase 11 Part 0 item 5).

Takes a settlement blueprint (schema: `worldgen.blueprint`) and renders a
top-down annotated diagram over a hillshaded crop of the REAL province terrain:
districts, routes/canals/boardwalks, parcels (coloured by ground fit), docks,
doors (with facing), landmarks, combat spaces, quest sockets, water and
contours — plus a legend and a title block carrying the id, seed and declared
budget. Seconds to regenerate; that is the whole point.

Run (from tooling/world-generation/):

    python -m worldgen.render_blueprint --blueprint world/sources/blueprints/<id>.json
    python -m worldgen.render_blueprint --blueprint <path> --out <dir> --no-terrain

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
from .site_fields import PROVINCE, REPO_ROOT               # noqa: E402

DEFAULT_OUT = REPO_ROOT / "tooling" / "world-generation" / "output" / "blueprint-maps"

# District fill by culture kit (the two-culture rule reads at a glance).
CULTURE_FILL = {"argonian": "#3f7a5a", "imperial": "#8a6a45"}
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
PROVINCE_EXTENT_M = 7373.51   # module 00-core §8 (×3 world scale, decision 0006)


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
    """Every authored coordinate in the blueprint, for the crop bounding box."""
    uv = _points(bp, "boundary")
    for d in bp.get("districts", []):
        uv += _points(d, "boundary")
    for group in ("routes", "canals", "boardwalks"):
        for w in bp.get(group, []):
            uv += _points(w, "points")
    for p in bp.get("parcels", []):
        uv += _points(p, "footprint", "position")
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
        self.height = np.asarray(fields.height_m[r0:r1, c0:c1], dtype=np.float32)
        self.depth = np.asarray(fields.depth_m[r0:r1, c0:c1], dtype=np.float32)
        self.extent = (c0 * px, c1 * px, r1 * px, r0 * px)  # imshow extent, z down

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


def render(bp: dict, out_path: Path, *, terrain: bool = True, pad_m: float = PAD_M,
           seed: int | None = None, extent_m: float | None = None) -> dict:
    """Render one blueprint. Returns a summary of what was drawn."""
    crop = None
    if terrain:
        # One raster decode (~2 s): it gives both the province extent and the
        # crop's heights/depths.
        from .compile_scatter import ProvinceFields
        fields = ProvinceFields(PROVINCE)
        extent_m = extent_m or float(fields.height_m.shape[0] * fields.px_m)
        crop = TerrainCrop(crop_box(bp, extent_m, pad_m), fields)
    extent_m = extent_m or PROVINCE_EXTENT_M
    box = crop_box(bp, extent_m, pad_m)

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
    for p in bp.get("parcels", []):
        fill = GROUND_FIT_FILL.get(p.get("groundFit"), "#cccccc")
        foot = p.get("footprint")
        if foot and isinstance(foot[0], list):
            m = to_m(foot)
            _poly(ax, m, facecolor=fill, alpha=0.85, edgecolor="#20262e",
                  linewidth=0.9, zorder=5)
            cx, cz = m.mean(axis=0)
        elif p.get("position"):
            cx, cz = to_m([p["position"]])[0]
            ax.plot(cx, cz, marker="s", markersize=7, color=fill,
                    markeredgecolor="#20262e", zorder=5)
        else:
            continue
        jitter = rng.uniform(-1.5, 1.5)
        ax.text(cx, cz + jitter, f"{p.get('id')}\n{p.get('buildingFamily', '')}",
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

    handles = [Patch(facecolor=c, alpha=0.35, edgecolor=c, label=f"district: {k}")
               for k, c in CULTURE_FILL.items()]
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


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--blueprint", type=Path, required=True, help="blueprint JSON path")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT, help="output directory")
    ap.add_argument("--pad-m", type=float, default=PAD_M, help="crop padding, metres")
    ap.add_argument("--seed", type=int, default=None, help="label-jitter seed")
    ap.add_argument("--no-terrain", action="store_true",
                    help="skip the hillshade/contour crop (fast, raster-independent)")
    ap.add_argument("--skip-validate", action="store_true",
                    help="render even if the blueprint fails schema validation")
    args = ap.parse_args(argv)

    bp = load_blueprint(args.blueprint)
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

    summary = render(bp, args.out / f"{bp['id']}.png", terrain=not args.no_terrain,
                     pad_m=args.pad_m, seed=args.seed)
    print(json.dumps(summary, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
