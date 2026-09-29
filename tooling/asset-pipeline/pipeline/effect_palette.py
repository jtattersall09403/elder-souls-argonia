"""The greyscale-to-palette bake, one implementation for the kit build's
flame sprites (build_kit.py) and the flame cards Blender bakes into the GLB
(blender/effect_materials.py). Pure numpy, no package imports, so Blender's
Python can import it from this directory.
"""
from __future__ import annotations

#: The palette row a greyscale flame texture is baked through. Skyrim's
#: GREYSCALE_TO_PALETTE indexes u by the texel's grey and v by the particle's
#: colour/alpha over its life, which a single baked image cannot follow; row
#: 48 of 64 is the full-alpha fire row of both vanilla fire gradients
#: (gradflame01, gradfireexplosion: dark red -> orange -> white, alpha
#: rising with grey), where the bottom rows turn blue (measured 2026-09-28).
PALETTE_ROW = 48


def bake_palette(grey_rgba, palette_rgba, row: int = PALETTE_ROW, palette_alpha: bool = True):
    """A greyscale effect texture through its palette, as RGBA: rgb is the
    palette at u = the texel's grey on `row`, alpha the texel's alpha times
    the palette's (GREYSCALE_ALPHA; `palette_alpha=False` keeps the texel's).
    A deterministic transform of two sourced textures, so the runtime needs
    no palette shader."""
    import numpy as np
    grey = np.asarray(grey_rgba, dtype=np.uint8)
    pal = np.asarray(palette_rgba, dtype=np.uint8)
    line = pal[min(row, pal.shape[0] - 1)]
    lum = grey[..., :3].astype(np.float64).mean(-1)
    u = np.clip(np.rint(lum / 255.0 * (line.shape[0] - 1)), 0, line.shape[0] - 1).astype(int)
    out = np.empty_like(grey)
    out[..., :3] = line[u, :3]
    alpha = grey[..., 3].astype(np.float64)
    if palette_alpha:
        alpha = alpha * line[u, 3] / 255.0
    out[..., 3] = np.rint(alpha).astype(np.uint8)
    return out
