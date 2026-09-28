"""Texture variants of a sourced piece: a recorded recipe, never a painting.

A kit config entry may be a VARIANT of another asset (16k walk 3, lane L5,
owner 2026-09-28: "recolour subtly but clearly (texture/Blender edits
allowed)"): the same source mesh, shipped under its own asset id, with some
of its textures derived from the source's own by a recipe written in the
config. The base asset is never touched; the variant is a second record in
the kit.

    {"asset": "<pool>:<path>/<variant name>",
     "variantOf": "<pool>:<path>/<base name>",
     "textureVariants": {
        "<texture path the NIF names, as textureAliases keys it>": {<recipe>},
        ...}}

The recipe is a fixed list of colour operations applied in this order, each
optional (all colours 0..1 linear-in-sRGB-bytes, i.e. plain 8-bit / 255):

- ``desaturate`` s: mix each pixel toward its own luma by s.
- ``toward`` [r, g, b, amount]: mix toward a flat colour by amount.
- ``multiply`` [r, g, b]: per-channel gain.
- ``tipColour`` {colour, widthPx, amount}: pixels within widthPx of a
  transparent pixel (alpha < 128) mix toward colour, most at the edge. On a
  leaf card the alpha edge IS the leaf's tip and margin, so this browns the
  tips and edges and leaves the blade. Optional ``cover``/``sizePx``/``seed``
  limit it to that share of the texture by the noise field below, so only a
  scattered subset of leaves browns (on a small-leaf atlas nearly every
  pixel is near an edge: 97 % within 14 px on the Hist's cluster card).
- ``patches`` {colour, amount, cover, sizePx, seed}: a deterministic value
  noise field (seeded, no randomness at build time) marks ``cover`` of the
  pixels, which mix toward colour by amount; soft edges.
- ``drop`` {cover, sizePx, seed}: the same noise field clears alpha on
  ``cover`` of the opaque pixels (a thinning crown: a cutout card loses
  leaves where the field is high). Only an alpha-tested texture shows it.
- ``gain`` g: final brightness gain (a glow map's dimmer).

Alpha is carried unchanged except by ``drop``. Output is PNG (lossless, RGBA) under
``textures/_variants/<recipe digest>/`` in the kit's data root (two variants
deriving the same source by the same recipe share one file, so the GLB
carries one image), keeping the
source file's stem so the Blender half's map-suffix and glow-slot reads are
unchanged. `derive` is pure: the same source bytes and recipe give the same
file, so the build stays deterministic (standard 4).
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

RECIPE_KEYS = ("desaturate", "toward", "multiply", "tipColour", "patches", "drop", "gain")
LUMA = np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
VARIANT_DIR = "textures/_variants"


def texture_key(texture: str) -> str:
    """A NIF texture path as the data root and `textureAliases` key it."""
    return texture.replace("\\", "/").strip().casefold()


def recipe_digest(texture: str, recipe: dict) -> str:
    """12 hex of the source path and the canonical recipe: the derived file's
    folder, so equal derivations share one file."""
    canon = json.dumps([texture_key(texture), recipe], sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canon.encode()).hexdigest()[:12]


def variant_path(texture: str, recipe: dict) -> str:
    """Data-root relative path of the derived texture for ``texture``."""
    stem = Path(texture_key(texture)).stem
    return f"{VARIANT_DIR}/{recipe_digest(texture, recipe)}/{stem}.png"


def validate(asset_id: str, variants: dict) -> list[str]:
    """Problems with an entry's ``textureVariants`` (empty = fine)."""
    problems = []
    if not isinstance(variants, dict) or not variants:
        return [f"{asset_id}: textureVariants must be a non-empty object"]
    for texture, recipe in variants.items():
        if not isinstance(recipe, dict) or not recipe:
            problems.append(f"{asset_id}: {texture}: recipe must be a non-empty object")
            continue
        unknown = sorted(set(recipe) - set(RECIPE_KEYS))
        if unknown:
            problems.append(f"{asset_id}: {texture}: unknown recipe keys {unknown} "
                            f"(known: {list(RECIPE_KEYS)})")
    return problems


def _mix(rgb: np.ndarray, target: np.ndarray, weight) -> np.ndarray:
    weight = np.asarray(weight, dtype=np.float32)
    if weight.ndim == 2:
        weight = weight[..., None]
    return rgb * (1.0 - weight) + target * weight


def _edge_distance(alpha: np.ndarray, width: int) -> np.ndarray:
    """Pixels' distance (px, capped at width) to the nearest transparent pixel."""
    from scipy.ndimage import distance_transform_edt
    opaque = alpha >= 128
    if opaque.all():
        return np.full(alpha.shape, float(width), dtype=np.float32)
    return np.minimum(distance_transform_edt(opaque), width).astype(np.float32)


def _value_noise(shape: tuple[int, int], size_px: float, seed: str) -> np.ndarray:
    """Smooth 0..1 noise, two octaves, seeded by a string (deterministic)."""
    h, w = shape
    rng = np.random.default_rng(int(hashlib.sha256(seed.encode()).hexdigest()[:12], 16))
    out = np.zeros(shape, dtype=np.float32)
    for octave, share in ((1.0, 0.7), (0.5, 0.3)):
        cell = max(2.0, size_px * octave)
        gh, gw = int(np.ceil(h / cell)) + 2, int(np.ceil(w / cell)) + 2
        grid = rng.random((gh, gw)).astype(np.float32)
        img = Image.fromarray((grid * 255).astype(np.uint8), "L").resize(
            (int(gw * cell), int(gh * cell)), Image.BICUBIC)
        out += share * np.asarray(img, dtype=np.float32)[:h, :w] / 255.0
    return out


def apply_recipe(rgba: np.ndarray, recipe: dict, seed: str) -> np.ndarray:
    """The recipe over an HxWx4 uint8 array; returns uint8 RGBA."""
    rgb = rgba[..., :3].astype(np.float32) / 255.0
    alpha = rgba[..., 3]
    if "desaturate" in recipe:
        luma = (rgb @ LUMA)[..., None]
        rgb = _mix(rgb, np.repeat(luma, 3, axis=2), float(recipe["desaturate"]))
    if "toward" in recipe:
        r, g, b, amount = recipe["toward"]
        rgb = _mix(rgb, np.array([r, g, b], dtype=np.float32), float(amount))
    if "multiply" in recipe:
        rgb = rgb * np.array(recipe["multiply"], dtype=np.float32)
    if "tipColour" in recipe:
        tip = recipe["tipColour"]
        width = int(tip["widthPx"])
        falloff = 1.0 - _edge_distance(alpha, width) / float(width)
        weight = np.clip(falloff, 0.0, 1.0) * float(tip["amount"])
        if "cover" in tip:
            noise = _value_noise(rgb.shape[:2], float(tip["sizePx"]),
                                 f"{seed}|tip|{tip.get('seed', 0)}")
            cut = float(np.quantile(noise, 1.0 - float(tip["cover"])))
            weight = weight * np.clip((noise - cut) / 0.08, 0.0, 1.0)
        rgb = _mix(rgb, np.array(tip["colour"], dtype=np.float32), weight)
    if "patches" in recipe:
        p = recipe["patches"]
        noise = _value_noise(rgb.shape[:2], float(p["sizePx"]), f"{seed}|{p.get('seed', 0)}")
        cut = float(np.quantile(noise, 1.0 - float(p["cover"])))
        mask = np.clip((noise - cut) / 0.06, 0.0, 1.0) * float(p["amount"])
        rgb = _mix(rgb, np.array(p["colour"], dtype=np.float32), mask)
    if "drop" in recipe:
        d = recipe["drop"]
        noise = _value_noise(rgb.shape[:2], float(d["sizePx"]), f"{seed}|drop|{d.get('seed', 0)}")
        opaque = alpha >= 128
        if opaque.any():
            cut = float(np.quantile(noise[opaque], 1.0 - float(d["cover"])))
            alpha = np.where(noise > cut, 0, alpha).astype(np.uint8)
    if "gain" in recipe:
        rgb = rgb * float(recipe["gain"])
    out = np.empty_like(rgba)
    out[..., :3] = np.clip(rgb * 255.0 + 0.5, 0, 255).astype(np.uint8)
    out[..., 3] = alpha
    return out


def derive(source: Path, destination: Path, recipe: dict, seed: str) -> Path:
    """Read ``source`` (any format Pillow reads, DDS included), write the
    recipe's result as PNG at ``destination``."""
    rgba = np.asarray(Image.open(source).convert("RGBA"))
    destination.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(apply_recipe(rgba, recipe, seed), "RGBA").save(destination, optimize=False)
    return destination


def derive_for_entry(entry: dict, data_root: Path) -> dict[str, str]:
    """Derive every texture of one variant entry inside ``data_root``.

    Returns {source texture path (lower, forward slashes): derived path}, both
    data-root relative. Raises when a named source texture did not land (the
    base asset's texture pass must have extracted it)."""
    asset_id = entry["asset"]
    variants = entry.get("textureVariants") or {}
    problems = validate(asset_id, variants)
    if problems:
        raise ValueError("; ".join(problems))
    swaps = {}
    for texture, recipe in sorted(variants.items()):
        key = texture_key(texture)
        source = data_root / key
        if not source.exists():
            raise FileNotFoundError(
                f"{asset_id}: variant source texture {key} not in the data root "
                f"(is it a texture {entry.get('variantOf')} names?)")
        out = variant_path(key, recipe)
        if not (data_root / out).exists():   # an equal derivation already landed
            derive(source, data_root / out, recipe, seed=key)
        swaps[key] = out
    return swaps
