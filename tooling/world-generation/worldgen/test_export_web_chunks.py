"""Round-trip and coverage checks for the browser chunk encoding."""

import json
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from .export_web_chunks import OUT_DIR, decode_rg16, encode_rg16
from .compile_chunks import DEFAULT_HEIGHTS

VAULT_CHUNKS = DEFAULT_HEIGHTS.parent / "chunks"


def test_rg16_roundtrip_is_within_quantisation_error():
    rng = np.random.default_rng(7)
    heights = (rng.random((65, 65), dtype=np.float32) * 210.0) - 85.0
    min_m, max_m = float(heights.min()), float(heights.max())
    decoded = decode_rg16(encode_rg16(heights, min_m, max_m), min_m, max_m)
    tolerance = (max_m - min_m) / 65535.0
    assert np.abs(decoded - heights).max() <= tolerance


@pytest.mark.skipif(not (OUT_DIR / "chunks-web-manifest.json").exists(),
                    reason="web chunks not exported")
def test_exported_manifest_covers_full_grid():
    manifest = json.loads((OUT_DIR / "chunks-web-manifest.json").read_text())
    grid = manifest["grid"]
    seen = {(c["cx"], c["cy"]) for c in manifest["chunks"]}
    assert len(seen) == grid[0] * grid[1]
    for chunk in manifest["chunks"]:
        for meta in chunk["lods"].values():
            path = OUT_DIR / meta["file"]
            assert path.exists(), meta["file"]
            assert meta["maxM"] >= meta["minM"]


@pytest.mark.skipif(not DEFAULT_HEIGHTS.exists(), reason="vault heights unavailable")
@pytest.mark.skipif(not (OUT_DIR / "normal-grad.png").exists(),
                    reason="gradient map not exported")
def test_gradient_map_matches_vault_slopes():
    manifest = json.loads((OUT_DIR / "chunks-web-manifest.json").read_text())
    grad_meta = manifest["gradients"]
    heights = np.load(DEFAULT_HEIGHTS)
    mps = manifest["chunks"][0]["lods"]["1"]["metresPerSample"]
    gz, gx = np.gradient(heights, mps)
    rgb = np.asarray(Image.open(OUT_DIR / grad_meta["file"]).convert("RGB"), dtype=np.float32)
    clamp = grad_meta["clamp"]
    # signed-sqrt encoding (6b): s in [-1,1]; g = sign(s) * s^2 * clamp.
    s_x = rgb[..., 0] / 127.5 - 1.0
    s_z = rgb[..., 1] / 127.5 - 1.0
    decoded_gx = np.sign(s_x) * s_x * s_x * clamp
    decoded_gz = np.sign(s_z) * s_z * s_z * clamp
    for decoded, source in ((decoded_gx, gx), (decoded_gz, gz)):
        clipped = np.clip(source, -clamp, clamp)
        # step size grows with |g| under sqrt encoding: bound relative to it
        tol = 2.0 * np.sqrt(np.abs(clipped) * clamp + 1e-6) / 127.5 + 5e-3
        assert (np.abs(decoded - clipped) <= tol).all()


@pytest.mark.skipif(not VAULT_CHUNKS.exists(), reason="vault chunks unavailable")
@pytest.mark.skipif(not (OUT_DIR / "chunks-web-manifest.json").exists(),
                    reason="web chunks not exported")
def test_exported_pngs_match_vault_heights():
    manifest = json.loads((OUT_DIR / "chunks-web-manifest.json").read_text())
    # A deterministic spread of chunks, all LODs each.
    sample = manifest["chunks"][:: max(1, len(manifest["chunks"]) // 12)]
    for chunk in sample:
        for lod, meta in chunk["lods"].items():
            source = np.load(VAULT_CHUNKS / f"chunk_{chunk['cx']}_{chunk['cy']}_lod{lod}.npy")
            decoded = decode_rg16(
                Image.open(OUT_DIR / meta["file"]), meta["minM"], meta["maxM"],
            )
            assert decoded.shape == source.shape
            tolerance = (meta["maxM"] - meta["minM"]) / 65535.0 + 1e-3
            assert np.abs(decoded - source).max() <= tolerance
