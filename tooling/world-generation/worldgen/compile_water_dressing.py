"""Dress the frozen water record: the insects' habitat and the water's colour
constituents (16f deliverables 14 and 15, decision 0070).

Below the freeze gate, AFTER the scatter. Reads the signed water record
(`water_report.ShippedWater`: kind, season, wet extent by id) and the scatter
output (the published vegetation bundles, for the canopy over each texel) and
writes two small rasters on the surface grid plus a sidecar that names them:

* `water-habitat.png` (RGB): R standing water (open bodies and the deep marsh
  sheets), G wet ground (the marsh kinds, the seasonal band and a short halo
  round every shore), B canopy fraction. The air layer weights its patch
  centres by it (fireflies to wet ground and canopy, midges and dragonflies to
  standing water, pollen and leaf fall to canopy); Phase 13's fauna read it.
* `water-colour.png` (RGB): R algae (green, in still shallow perennial water
  open to the sky), G dark (tannin, in slow swamp water under canopy), B
  unused. The rule is the dossier `world/sources/lore/topics/water-colour.md`;
  the water material reads the raster beside turbidity and tannin.
* `water-dressing.json`: schema, files, channel meanings and the rule tables.

NOTHING HERE TOUCHES THE WATER. The levels, extents, ids and every raster the
water compile wrote are read only; the freeze is not lifted (owner
2026-09-16: a tint only if it patches on without recompiling anything). The
runtime discovers these files through `water-dressing.json`, never through
`water-meta.json`, so the water compile's own outputs keep their hashes.

Soft edges by construction: every constituent is blurred over tens of metres
INSIDE the water (blur the masked field, divide by the blurred mask, re-mask),
so a tint follows the body's own shape and no edge is straight or hard; the
test bounds the per-metre gradient.

    python3 -m worldgen.compile_water_dressing [--bundles DIR] [--out DIR]
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image

from .fastfilter import gaussian
from .scatter import decode
from .water_report import MARSH_KINDS, STANDING_BODY_KINDS, ShippedWater, WATER_DIR

REPO_ROOT = Path(__file__).resolve().parents[3]
PROVINCE = REPO_ROOT / "apps" / "world-studio" / "public" / "province"
BUNDLES = PROVINCE / "vegetation"
FLORA_KIT = PROVINCE.parent / "kits" / "flora-province-v1.kit.json"
PALETTES = REPO_ROOT / "world" / "sources" / "flora" / "palettes.json"

SCHEMA_VERSION = 1
HABITAT_FILE = "water-habitat.png"
COLOUR_FILE = "water-colour.png"
SIDECAR = "water-dressing.json"

#: Palette roles whose instances carry a crown (the canopy the habitat and
#: the dark constituent read). Ground and shrub roles cast no canopy.
CANOPY_ROLES = frozenset({"canopy", "emergent", "gallery", "landmark-giant",
                          "waterline-tree", "drowned-tree", "basin-mangrove",
                          "understory", "bank-wall", "green-wall"})
#: Standing water for the hover species: the open bodies plus the deep
#: marsh sheets (a dragonfly hunts over a marsh pool as over a pond).
STANDING_KINDS = frozenset(STANDING_BODY_KINDS) | {"marsh-deep", "backswamp", "swamp"}
#: Blur radii, in surface texels (3.66 m each).
HABITAT_SIGMA_TEXELS = 2.0        # ~7 m: a soft habitat edge
COLOUR_SIGMA_TEXELS = 8.0         # ~30 m: a tint that follows the body's shape
ELIGIBLE_SIGMA_TEXELS = 3.0       # ~10 m: how far a tint fades past its kind's edge
SHORE_HALO_TEXELS = 4             # ~15 m of wet ground round every shore
CANOPY_SIGMA_TEXELS = 4.0            # ~15 m: the bank canopy reaches over the water edge

#: The rule tables (dossier: world/sources/lore/topics/water-colour.md).
#: Algae: still, shallow, perennial water open to the sky; never moving
#: water, the sea or the brackish lagoons. Dark: tannin in slow swamp water
#: under a closed canopy. Values are the constituent at full canopy = 0
#: (algae) or full canopy = 1 (dark); the canopy fraction scales them.
ALGAE_BY_KIND = {"pond": 0.60, "pool": 0.50, "backswamp": 0.70, "swamp": 0.55,
                 "marsh-deep": 0.50, "horizontal-backwater": 0.40,
                 "marsh-fringe": 0.30, "lake-lowland": 0.15, "lagoon": 0.05}
DARK_BY_KIND = {"backswamp": 0.80, "swamp": 0.70, "marsh-deep": 0.60,
                "horizontal-backwater": 0.50, "pond": 0.30, "pool": 0.30,
                "marsh-fringe": 0.30, "lake-lowland": 0.10}
SEASON_FACTOR = {"perennial": 1.0, "seasonal": 0.5, "ephemeral": 0.0}
ALGAE_CANOPY_SHADE = 0.6          # algae × (1 − 0.6·canopy): shade starves it
#: Per-metre bound on the colour channels' gradient (the soft-edge test).
MAX_GRADIENT_PER_M = 0.035


def _blur_inside(value: np.ndarray, mask: np.ndarray, sigma: float) -> np.ndarray:
    """Blur `value` over the texels in `mask` without bleeding the outside
    in: the masked field over the blurred mask, re-masked."""
    m = mask.astype(np.float32)
    num = gaussian(value.astype(np.float32) * m, sigma)
    den = gaussian(m, sigma)
    out = np.where(den > 1e-3, num / np.maximum(den, 1e-3), 0.0)
    return (out * m).astype(np.float32)


def canopy_fraction(shape: tuple[int, int], mpp: float,
                    bundles: Path = BUNDLES, kit: Path = FLORA_KIT,
                    palettes: Path = PALETTES) -> np.ndarray:
    """Crown cover 0..1 per surface texel from the published bundles: the
    crown AREA of every canopy-role instance is accumulated on its texel,
    blurred a texel and a half, and turned into cover by 1 − exp(−area /
    texel area). Zero everywhere when the bundles are absent."""
    accum = np.zeros(shape, dtype=np.float32)
    index_path = bundles / "vegetation-index.json"
    if not (index_path.exists() and kit.exists() and palettes.exists()):
        return accum
    order = json.loads(index_path.read_text())["speciesOrder"]
    roles: dict[str, str] = {}
    for entry in json.loads(palettes.read_text())["byRegionClass"].values():
        for layer in entry["layers"]:
            roles.setdefault(layer["species"], layer.get("role", ""))
    crown_m: dict[str, float] = {}
    for asset in json.loads(kit.read_text()).get("assets", []):
        size = asset.get("sizeM") or [0, 0, 0]
        crown_m[asset["id"]] = max(float(size[0]), float(size[1])) / 2.0
    canopy_species = {s for s in order if roles.get(s, "") in CANOPY_ROLES}
    texel_area = mpp * mpp
    n = shape[0]
    for path in sorted(bundles.glob("chunk_*_vegetation.bin")):
        for group in decode(path.read_bytes()):
            species = order[group["index"]]
            if species not in canopy_species or group["anchor"] != 0:
                continue
            r0 = crown_m.get(species, 0.0)
            if r0 <= 0.0:
                continue
            for inst in group["instances"]:
                col = int(inst["x"] / mpp)
                row = int(inst["z"] / mpp)
                if 0 <= row < n and 0 <= col < n:
                    r = r0 * inst["scale"]
                    accum[row, col] += np.pi * r * r / texel_area
    accum = gaussian(accum, CANOPY_SIGMA_TEXELS)
    return (1.0 - np.exp(-accum)).astype(np.float32)


def habitat_rasters(w: ShippedWater, canopy: np.ndarray):
    """(standing, wet_ground, canopy) 0..1 float32 on the surface grid."""
    from scipy import ndimage
    wet = w.wet_grid("wet")
    dry_season_wet = w.wet_grid("dry")
    standing = w.kind_grid(STANDING_KINDS).astype(np.float32)
    marsh = w.kind_grid(MARSH_KINDS | {"mudflat"})
    seasonal_band = wet & ~dry_season_wet
    halo = ndimage.binary_dilation(wet, iterations=SHORE_HALO_TEXELS) & ~wet
    wet_ground = (marsh | seasonal_band | halo).astype(np.float32)
    standing = gaussian(standing, HABITAT_SIGMA_TEXELS)
    wet_ground = gaussian(wet_ground, HABITAT_SIGMA_TEXELS)
    return (np.clip(standing, 0, 1), np.clip(wet_ground, 0, 1), np.clip(canopy, 0, 1))


def colour_rasters(w: ShippedWater, canopy: np.ndarray):
    """(algae, dark) 0..1 float32 on the surface grid, smoothed inside the
    water so the tint follows each body's own shape."""
    wet = w.wet_grid("wet")
    kind_idx = w.kind_index_grid()
    names = w.kind_names()
    season_idx = w.season_index_grid()
    season_names = ("none", "perennial", "seasonal", "ephemeral")
    algae_lut = np.array([ALGAE_BY_KIND.get(k, 0.0) for k in names], dtype=np.float32)
    dark_lut = np.array([DARK_BY_KIND.get(k, 0.0) for k in names], dtype=np.float32)
    season_lut = np.array([SEASON_FACTOR.get(s, 0.0) for s in season_names], dtype=np.float32)
    season = season_lut[np.clip(season_idx, 0, 3)]
    algae = algae_lut[kind_idx] * season * (1.0 - ALGAE_CANOPY_SHADE * canopy)
    dark = dark_lut[kind_idx] * canopy
    # Smooth INSIDE the water, then hold each constituent to the kinds the
    # dossier names with a soft eligibility mask (σ 3 texels), so a tint
    # fades out over ~10 m where a swamp meets a channel instead of
    # bleeding down the river or stopping on the polygon edge.
    algae_ok = (algae_lut[kind_idx] > 0.0) & wet
    dark_ok = (dark_lut[kind_idx] > 0.0) & wet
    algae = _blur_inside(algae, wet, COLOUR_SIGMA_TEXELS) * _blur_inside(algae_ok, wet, ELIGIBLE_SIGMA_TEXELS)
    dark = _blur_inside(dark, wet, COLOUR_SIGMA_TEXELS) * _blur_inside(dark_ok, wet, ELIGIBLE_SIGMA_TEXELS)
    return np.clip(algae, 0, 1), np.clip(dark, 0, 1)


def max_gradient_per_m(channel: np.ndarray, wet: np.ndarray, mpp: float) -> float:
    """Largest absolute step between two adjacent WET texels, per metre."""
    dz = np.abs(np.diff(channel, axis=0))[wet[1:] & wet[:-1]]
    dx = np.abs(np.diff(channel, axis=1))[wet[:, 1:] & wet[:, :-1]]
    steps = np.concatenate([dz.ravel(), dx.ravel()]) if dz.size or dx.size else np.zeros(1)
    return float(steps.max() / mpp) if steps.size else 0.0


def _png(channels: list[np.ndarray], path: Path) -> None:
    stack = np.stack([np.clip(np.rint(c * 255.0), 0, 255).astype(np.uint8) for c in channels], -1)
    Image.fromarray(stack, "RGB").save(path, optimize=True)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--bundles", default=str(BUNDLES))
    ap.add_argument("--out", default=str(WATER_DIR))
    args = ap.parse_args(argv)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    w = ShippedWater(heights=None)
    if w.ids is None:
        raise SystemExit("compile_water_dressing: the water bundle ships no entity raster (water-id.png)")
    shape = w.w2.shape
    canopy = canopy_fraction(shape, w.mpp2, Path(args.bundles))
    standing, wet_ground, canopy_c = habitat_rasters(w, canopy)
    algae, dark = colour_rasters(w, canopy)
    _png([standing, wet_ground, canopy_c], out / HABITAT_FILE)
    _png([algae, dark, np.zeros(shape, dtype=np.float32)], out / COLOUR_FILE)
    wet = w.wet_grid("wet")
    stats = {
        "wetTexels": int(wet.sum()),
        "standingShareOfWet": round(float((standing > 0.5)[wet].mean()), 4),
        "wetGroundTexels": int((wet_ground > 0.5).sum()),
        "canopyMeanOverWet": round(float(canopy[wet].mean()), 4),
        "algaeMeanOverWet": round(float(algae[wet].mean()), 4),
        "algaeTexelsOver0.3": int(((algae > 0.3) & wet).sum()),
        "darkTexelsOver0.3": int(((dark > 0.3) & wet).sum()),
        "maxGradientPerM": {"algae": round(max_gradient_per_m(algae, wet, w.mpp2), 4),
                            "dark": round(max_gradient_per_m(dark, wet, w.mpp2), 4)},
    }
    sidecar = {
        "schemaVersion": SCHEMA_VERSION,
        "about": ("Dressing of the frozen water record (16f, decision 0070): the insects' "
                  "habitat and the water's colour constituents, on the surface grid. Read "
                  "only through this file; water-meta.json is untouched."),
        "size": int(shape[0]), "metresPerPixel": w.mpp2,
        "habitat": {"file": HABITAT_FILE, "channels": {
            "r": "standing water: open bodies and the deep marsh sheets (midges, dragonflies)",
            "g": "wet ground: marsh, the seasonal band, a ~15 m halo round every shore (fireflies)",
            "b": "canopy fraction from the scatter (fireflies, pollen, leaf fall)"}},
        "colour": {"file": COLOUR_FILE, "channels": {
            "r": "algae: still shallow perennial water open to the sky",
            "g": "dark: tannin in slow swamp water under canopy", "b": "unused"},
            "rules": {"algaeByKind": ALGAE_BY_KIND, "darkByKind": DARK_BY_KIND,
                      "seasonFactor": SEASON_FACTOR, "algaeCanopyShade": ALGAE_CANOPY_SHADE,
                      "smoothingM": round(COLOUR_SIGMA_TEXELS * w.mpp2, 1),
                      "maxGradientPerM": MAX_GRADIENT_PER_M,
                      "dossier": "world/sources/lore/topics/water-colour.md"}},
        "stats": stats,
    }
    (out / SIDECAR).write_text(json.dumps(sidecar, indent=1) + "\n")
    print(f"water dressing: {stats}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
