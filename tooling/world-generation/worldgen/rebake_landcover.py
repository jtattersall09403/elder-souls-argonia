"""Re-bake the ground-material control map from the WATER RECORD (0066).

Re-runs `compile_ground_control` over the refined terrain with the shipped
water bundle as the record: where water stands in each season, what KIND each
body and reach is, and how wide the reach is, joined through
`water_report.ShippedWater` (`water-id.png` -> `hydrology-graph.json`). The
bake decides no water of its own — no height threshold, no Phase 3 band
raster, no connected-component lake test. Standalone so the (slow) full shape
+ carve run isn't needed after a water recompile. It paints the portage
drag-path tracks too, from the shape stage's `portage-track.npy` when the
vault carries one.

It also writes the PROVENANCE of that paint beside the control map:
`ground-paint-provenance.png` (mode L, the deciding water kind index per
texel, 0 where no water rule decided it) and `ground-paint-provenance.json`
(the same thing counted per material). That raster, not a guess from the
material id, is the evidence that each shoreline texel came from the record —
it is what makes "BC_MUD at water" distinguishable from the same mud painted
as a region's damp slot inland, and `test_landcover_provenance` gates on it.

ROUTE PAINT IS LADDER-GATED (Phase 16e). Majors, minors and portages are each
painted only when the stage that solves that network is on this run's ladder
(`CHAIN_ENABLED`); with no ladder in the environment a hand run paints none of
them unless `--paint-all` is passed, so it can never repaint stale published
lines onto frozen ground.

POSITION-SEEDED AND WINDOWABLE (Phase 16b item 6). Every noise field now comes
from `position_noise.normal_field`: its value at a sample is a function of the
absolute coordinate, the salt and the seed, never of the draw order, so a
window re-bakes the numbers the province-wide bake would have given it.

What a window still needs is a PAD, because the rest of the bake reads
neighbourhoods: Gaussian blurs (truncated at 4 sigma), shore and channel
distance transforms (clipped to their bands), local prominence. `WINDOW_PAD_M`
covers the widest-reaching term; `--window y0 y1 x0 x1` bakes the padded
window, crops it and writes it back into the existing province files.

One term remains genuinely global and is NOT covered by any pad: the
nearest-wet-cell lookup, which follows water bodies beyond the pad. A window
whose shore sits inside a water body larger than the window can therefore
differ from the global bake at that shore; keep windows away from big-water
margins, or re-bake whole.

Usage: python3 -m worldgen.rebake_landcover [--window y0 y1 x0 x1]
"""

from __future__ import annotations

import argparse

import os

import numpy as np
from PIL import Image
from scipy import ndimage

import json

from .compile_chunks import DEFAULT_HEIGHTS
from .landcover import WATER_PAINT_KINDS, WaterPaint, compile_ground_control
from .regions import REGION_CLASSES
from .shape_province import REPO_ROOT, SEED, STEP
from .routes_raster import (condition_raster, major_spanning_mask,
                            rasterize_minor_paint)
from .scale import RAW_M

STUDIO_DIR = REPO_ROOT / "apps" / "world-studio" / "public" / "province" / "refined"

# Reach of the widest neighbourhood term in landcover.py, in world metres.
# Candidates: the 130 m*TUNE shore band (43 m), the 110 m*TUNE channel band
# (37 m), the 40 px macro noise (73 m sigma -> 293 m), and the winner, the
# mountain belt-wobble noise at sigma 320 m*TUNE = 106.7 m -> 4 sigma = 427 m.
WINDOW_PAD_M = 440.0


def _stage_test(enabled: str | None, paint_all: bool):
    """Predicate: did `stage` run on the ladder that is driving this bake?

    `CHAIN_ENABLED` is exported by scripts/terrain-chain.sh as a space-separated
    list of enabled stage names, or "all". Unset means nobody told us what the
    ladder was: a hand run then paints NOTHING derived (so it can never repaint
    stale route lines by accident) unless `--paint-all` says otherwise.
    """
    if paint_all or (enabled or "").strip() == "all":
        return lambda stage: True
    if enabled is None:
        return lambda stage: False
    names = set(enabled.split())
    return lambda stage: stage in names


def _bake(h, fields, water, roads, minor, origin, seed=SEED):
    """(mat, control, provenance) for one window. `water` is the WaterPaint
    record already cut to this window."""
    gy, gx = np.gradient(h, RAW_M)
    slope_f = np.hypot(gx, gy).astype(np.float32)
    del gy, gx
    return compile_ground_control(
        h, fields["regions"], slope_f, RAW_M, water=water, origin=origin,
        seed=seed, roads=roads, minor_routes=minor, v_frac=fields["v_frac"])


def _regions(shape) -> np.ndarray:
    """The published region raster, decoded by colour (regions.REGION_CLASSES)
    and upsampled nearest to the bake grid. This is a PUBLISHED classification
    of ecology, not of water: it carries no flood band, salinity or wetland."""
    img = np.asarray(Image.open(
        REPO_ROOT / "apps" / "world-studio" / "public" / "province" / "hydro-regions.png"
    ).convert("RGB"))
    out = np.zeros(img.shape[:2], dtype=np.uint8)
    for rid, (_name, rgb) in REGION_CLASSES.items():
        out[(img == np.array(rgb, dtype=np.uint8)).all(-1)] = rid
    z = shape[0] / out.shape[0]
    return ndimage.zoom(out, (z, shape[1] / out.shape[1]), order=0,
                        mode="nearest", grid_mode=True)[: shape[0], : shape[1]]


def _write_provenance(prov, mat) -> None:
    """Publish the provenance raster and its per-material count table."""
    from .water_report import ShippedWater
    Image.fromarray(prov.astype(np.uint8), "L").save(
        STUDIO_DIR / "ground-paint-provenance.png")
    names = ShippedWater().kind_names()
    by_material = {}
    for material in sorted(WATER_PAINT_KINDS):
        sel = prov[(mat == material) & (prov > 0)]
        if not sel.size:
            continue
        counts = np.bincount(sel, minlength=len(names))
        by_material[str(material)] = {names[i]: int(c)
                                      for i, c in enumerate(counts) if c}
    (STUDIO_DIR / "ground-paint-provenance.json").write_text(json.dumps({
        "schemaVersion": 1,
        "about": ("Which water KIND decided each water-derived ground material, "
                  "texel counts, from the last full rebake (decision 0066). Keys "
                  "of byMaterial are landcover material ids; the legal kinds per "
                  "material are landcover.WATER_PAINT_KINDS."),
        "kindNames": names,
        "byMaterial": by_material,
    }, indent=1) + "\n", encoding="utf-8")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--window", nargs=4, type=int, metavar=("Y0", "Y1", "X0", "X1"),
                    help="bake only this sample window (padded by WINDOW_PAD_M)")
    ap.add_argument("--paint-all", action="store_true",
                    help="hand run: paint every route network as if the whole ladder ran")
    args = ap.parse_args()

    vault_dir = DEFAULT_HEIGHTS.parent
    h = np.load(DEFAULT_HEIGHTS).astype(np.float32)
    # The shipped water bundle is the RECORD for the shore grammar when the
    # water stage is on the chain's ladder for this run (CHAIN_ENABLED,
    # exported by terrain-chain.sh); otherwise the bake paints sea level only
    # — a ground-only build (Phase 16b) paints no shoreline from water that
    # was not compiled on this ground.
    enabled = os.environ.get("CHAIN_ENABLED")
    ran = _stage_test(enabled, args.paint_all)
    use_water = (enabled is None or "all" == enabled.strip()
                 or "compile_water" in enabled.split())
    if use_water:
        from .water_report import ShippedWater
        wp = WaterPaint.from_record(ShippedWater(), h.shape, RAW_M)
        print("rebake: painted from the water record (water-id.png -> hydrology-graph.json)")
    else:
        wp = WaterPaint.from_sea_level(h)
        print("rebake: sea level only (no compiled water on this ladder)")

    fields = dict(
        regions=_regions(h.shape),
        v_frac=np.broadcast_to(
            (np.arange(h.shape[0], dtype=np.float32) / h.shape[0])[:, None], h.shape).copy(),
    )
    # ROUTE PAINT IS LADDER-GATED (Phase 16e). Each network is painted only if
    # the stage that produces its geometry ran on THIS ground; otherwise the
    # bake would re-rasterise last generation's published lines onto frozen
    # terrain they were never solved on (measured: 91,890 stale texels after
    # the 16b/16d rebakes, docs/research/phase16/16e-road-paint-census.md).
    # int8 CONDITION raster now (0 off-road, 1 maintained .. 4 broken): the
    # bake paints each road by its authored state of repair (owner 2026-09-16).
    roads = np.zeros(h.shape, dtype=np.int8)
    if ran("solve_major_routes"):
        # Ground carried clear by a bridge/deck gets no road surface painted.
        # Multiplied, never `&`: a bitwise AND with a 0/1 mask would rewrite
        # condition 3 as 1.
        roads = (condition_raster(h.shape, STEP, (0, 0))
                 * ~major_spanning_mask(h.shape, STEP, (0, 0))).astype(np.int8)
        print("roads: painted from routes.json (solve_major_routes on the ladder)")
    else:
        print("roads: not painted (solve_major_routes not on the ladder)")
    portage = vault_dir / "portage-track.npy"
    if ran("compile_minor_waterways"):
        if portage.exists():
            # A portage track is a worn surface where no road already runs.
            roads = np.where(np.load(portage).astype(bool) & (roads == 0),
                             np.int8(2), roads).astype(np.int8)
            print("portage: unioned from portage-track.npy (compile_minor_waterways on the ladder)")
        else:
            print("portage: not painted (no portage-track.npy in the vault)")
    else:
        print("portage: not painted (compile_minor_waterways not on the ladder)")
    if ran("compile_minor_routes"):
        minor = rasterize_minor_paint(h.shape, STEP, (0, 0))
        print("minor: painted from routes-minor.json (compile_minor_routes on the ladder)")
    else:
        minor = np.zeros(h.shape, dtype=np.int8)
        print("minor: not painted (compile_minor_routes not on the ladder)")

    if args.window is None:
        mat, control, prov = _bake(h, fields, wp, roads, minor, (0, 0))
        Image.fromarray(control, "RGBA").save(STUDIO_DIR / "ground-control.png")
        np.save(vault_dir / "landcover-i16.npy", mat)
        _write_provenance(prov, mat)
        print(f"rebaked ground-control from the record: wet frac "
              f"{float((wp.depth > 0).mean()):.3f}, "
              f"{int((prov > 0).sum())} texels water-painted")
        return

    y0, y1, x0, x1 = args.window
    pad = int(np.ceil(WINDOW_PAD_M / RAW_M))
    py0, py1 = max(0, y0 - pad), min(h.shape[0], y1 + pad)
    px0, px1 = max(0, x0 - pad), min(h.shape[1], x1 + pad)
    sl = (slice(py0, py1), slice(px0, px1))
    mat, control, prov = _bake(h[sl], {k: v[sl] for k, v in fields.items()},
                               wp[sl], roads[sl], minor[sl], (py0, px0))
    inner = (slice(y0 - py0, y1 - py0), slice(x0 - px0, x1 - px0))
    img = np.asarray(Image.open(STUDIO_DIR / "ground-control.png").convert("RGBA")).copy()
    img[y0:y1, x0:x1] = control[inner]
    Image.fromarray(img, "RGBA").save(STUDIO_DIR / "ground-control.png")
    full = np.load(vault_dir / "landcover-i16.npy")
    full[y0:y1, x0:x1] = mat[inner]
    np.save(vault_dir / "landcover-i16.npy", full)
    # the provenance raster is patched the same way, so the published evidence
    # never disagrees with the paint it explains
    prov_path = STUDIO_DIR / "ground-paint-provenance.png"
    if prov_path.exists():
        pimg = np.asarray(Image.open(prov_path).convert("L")).copy()
        pimg[y0:y1, x0:x1] = prov[inner]
        Image.fromarray(pimg, "L").save(prov_path)
    print(f"rebaked window y{y0}:{y1} x{x0}:{x1} (pad {pad} px / {WINDOW_PAD_M:.0f} m)")


if __name__ == "__main__":
    main()
