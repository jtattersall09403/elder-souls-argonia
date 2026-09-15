"""Gates on the beyond-border apron (16d B3): the seams are exact by construction.

Reads the shipped `province/apron/` set and, for the pre-encode checks, rebuilds
the ring-0 grids from the same inputs the stage used (a few seconds).
"""

from __future__ import annotations

import json

import numpy as np
import pytest
from PIL import Image

from . import build_border_apron as apron
from .compile_chunks import DEFAULT_HEIGHTS, LODS
from .export_web_chunks import decode_rg16
from .ladder import requires_layer

pytestmark = [requires_layer("apron"),
              pytest.mark.skipif(not apron.MANIFEST_PATH.exists(), reason="no apron built")]

# The province manifest rounds minM/maxM to 3 dp, which moves a decoded value
# by up to 0.5 mm on top of the quantisation step.
MANIFEST_ROUNDING_M = 1e-3


@pytest.fixture(scope="module")
def manifest():
    return json.loads(apron.MANIFEST_PATH.read_text())


@pytest.fixture(scope="module")
def web():
    return apron.load_web_manifest()


@pytest.fixture(scope="module")
def inputs():
    heights = np.load(DEFAULT_HEIGHTS).astype(np.float32)
    near = np.load(apron.NEAR_PATH).astype(np.float32)
    return heights, near


def half_step(meta: dict) -> float:
    return (meta["maxM"] - meta["minM"]) / 65535.0 / 2.0


def decode(path, meta: dict) -> np.ndarray:
    return decode_rg16(Image.open(path), meta["minM"], meta["maxM"])


def inner_edge(cx: int, cy: int, arr: np.ndarray):
    """(ring edge, province chunk, side) for a non-corner ring-0 chunk."""
    if cy == -1:
        return arr[-1, :], (cx, 0), "n"
    if cy == 16:
        return arr[0, :], (cx, 15), "s"
    if cx == -1:
        return arr[:, -1], (0, cy), "w"
    return arr[:, 0], (15, cy), "e"


def is_corner(cx: int, cy: int) -> bool:
    return cx in (-1, 16) and cy in (-1, 16)


# (1) the shared edge is the province's ---------------------------------------

def test_ring0_inner_edge_is_the_province_edge_at_every_lod(manifest, web):
    worst = 0.0
    for entry in manifest["ring0"]["chunks"]:
        cx, cy = entry["cx"], entry["cy"]
        if is_corner(cx, cy):
            continue
        for f in LODS:
            meta = entry["lods"][str(f)]
            ring = decode(apron.RING0_DIR / meta["file"], meta)
            mine, (px, py), side = inner_edge(cx, cy, ring)
            theirs = apron.province_edge(web, px, py, f, side)
            tol = half_step(meta) + half_step(web[(px, py)]["lods"][str(f)]) + MANIFEST_ROUNDING_M
            gap = float(np.abs(mine - theirs).max())
            worst = max(worst, gap)
            assert gap <= tol, (
                f"ring-0 chunk ({cx},{cy}) lod{f}: its inner edge is {gap:.4f} m from "
                f"province chunk ({px},{py})'s {side} edge (tolerance {tol:.4f} m)")
    assert worst <= 0.02, worst


def test_ring0_pre_encode_lod1_inner_edge_equals_default_heights(inputs, web):
    heights, near = inputs
    _rows, _cols, h_full, _delta = apron.near_box(heights, near)
    for cx, cy, lods in apron.ring0_arrays(h_full, heights, web):
        if is_corner(cx, cy):
            continue
        mine, (px, py), side = inner_edge(cx, cy, lods[1])
        x0, x1 = apron.ring0_span(cx)
        y0, y1 = apron.ring0_span(cy)
        c = apron.CHUNK
        theirs = {"n": heights[0, x0 - c:x1 - c], "s": heights[-1, x0 - c:x1 - c],
                  "w": heights[y0 - c:y1 - c, 0], "e": heights[y0 - c:y1 - c, -1]}[side]
        assert np.array_equal(mine, theirs), (
            f"ring-0 chunk ({cx},{cy}) lod1 inner edge != DEFAULT_HEIGHTS {side} edge "
            f"(max |diff| {np.abs(mine - theirs).max():.4f} m)")


# (2) the rings meet at every knot at every LOD --------------------------------

def test_ring0_outer_edge_lies_on_the_line_between_ring1_samples(manifest):
    tile = next(t for t in manifest["tiles"] if t["id"] == "ring1")
    ring1 = decode(apron.OUT_DIR / tile["file"], tile)
    z0, z1 = tile["maskInnerSamples"]
    inner = {"n": ring1[z0, z0:z1], "s": ring1[z1 - 1, z0:z1],
             "w": ring1[z0:z1, z0], "e": ring1[z0:z1, z1 - 1]}
    step = apron.R1_STEP
    for entry in manifest["ring0"]["chunks"]:
        cx, cy = entry["cx"], entry["cy"]
        x0, _ = apron.ring0_span(cx)
        y0, _ = apron.ring0_span(cy)
        for f in LODS:
            meta = entry["lods"][str(f)]
            arr = decode(apron.RING0_DIR / meta["file"], meta)
            tol = half_step(meta) + half_step(tile)
            sides = []
            if cy == -1:
                sides.append((arr[0, :], inner["n"], x0))
            if cy == 16:
                sides.append((arr[-1, :], inner["s"], x0))
            if cx == -1:
                sides.append((arr[:, 0], inner["w"], y0))
            if cx == 16:
                sides.append((arr[:, -1], inner["e"], y0))
            for edge, knots_edge, start in sides:
                # LOD-f sample i sits at extended-box sample start + i*f; ring 1's
                # samples (the knots) every 16. The whole edge must lie ON the
                # line between the knots, not only touch it at the knots.
                pos = start + np.arange(edge.shape[0]) * f
                want = np.interp(pos, np.arange(knots_edge.shape[0]) * step, knots_edge)
                gap = float(np.abs(edge - want).max())
                assert gap <= tol, (
                    f"ring-0 chunk ({cx},{cy}) lod{f}: outer edge is {gap:.4f} m off the line "
                    f"between ring 1's knots (tolerance {tol:.4f} m)")


def test_ring1_outer_edge_lies_on_the_line_between_ring2_samples(manifest):
    r1 = next(t for t in manifest["tiles"] if t["id"] == "ring1")
    r2 = next(t for t in manifest["tiles"] if t["id"] == "ring2")
    ring1 = decode(apron.OUT_DIR / r1["file"], r1)
    ring2 = decode(apron.OUT_DIR / r2["file"], r2)
    z0, z1, x0, x1 = r2["maskInnerSamples"]
    k = apron.R2_STEP // apron.R1_STEP
    tol = half_step(r1) + half_step(r2)
    pairs = {
        "n": (ring1[0, :], ring2[z0, x0:x1]), "s": (ring1[-1, :], ring2[z1 - 1, x0:x1]),
        "w": (ring1[:, 0], ring2[z0:z1, x0]), "e": (ring1[:, -1], ring2[z0:z1, x1 - 1]),
    }
    for side, (edge, knots) in pairs.items():
        assert edge.shape[0] == (knots.shape[0] - 1) * k + 1
        # Every ring-1 outer sample lies on the line between ring 2's samples.
        want = np.interp(np.arange(edge.shape[0]), np.arange(knots.shape[0]) * k, knots)
        gap = float(np.abs(edge - want).max())
        assert gap <= tol, (f"ring 1's {side} outer edge is {gap:.4f} m off the line between "
                            f"ring 2's inner-edge samples (tolerance {tol:.4f} m)")


# (3) h_apron: the edge at d = 0, the crop at d >= 6 km ----------------------------

def test_h_apron_is_the_edge_at_zero_and_the_crop_beyond_six_km(inputs):
    heights, near = inputs
    n, pad, last = apron.N, apron.NEAR_PAD, apron.LAST
    cols = np.arange(n, dtype=np.float64)
    for side, rows, canon, want in (
        ("north", np.zeros(n), near[pad, pad:pad + n], heights[0, :]),
        ("south", np.full(n, float(last)), near[pad + last, pad:pad + n], heights[-1, :]),
    ):
        got = apron.apron_height(canon, rows, cols, heights, near)
        assert np.array_equal(got, want), f"h_apron on the {side} edge is not DEFAULT_HEIGHTS"
    for side, rows, want in (("west", cols, heights[:, 0]), ("east", cols, heights[:, -1])):
        c = np.zeros(n) if side == "west" else np.full(n, float(last))
        canon = near[pad:pad + n, pad] if side == "west" else near[pad:pad + n, pad + last]
        got = apron.apron_height(canon, rows, c, heights, near)
        assert np.array_equal(got, want), f"h_apron on the {side} edge is not DEFAULT_HEIGHTS"
    far_rows = np.full(n, -apron.BLEND_M / apron.RAW_M - 1.0)     # just past 6 km north
    canon = np.linspace(-200.0, 300.0, n, dtype=np.float32)
    got = apron.apron_height(canon, far_rows, cols, heights, near)
    assert np.array_equal(got, canon), "h_apron beyond 6 km is not the crop"
    mid = apron.apron_height(canon, far_rows / 2.0, cols, heights, near)
    assert not np.array_equal(mid, canon), "h_apron at 3 km should still carry some delta"


# (4) the paint at the border is the province's ----------------------------------

def test_near_control_innermost_apron_ring_is_the_province_edge(manifest):
    near = manifest["paint"]["near"]
    control = np.asarray(Image.open(apron.OUT_DIR / near["control"]).convert("RGBA"))
    prov = np.asarray(Image.open(apron.PROVINCE_DIR / "refined" / "ground-control.png").convert("RGBA"))
    step, pad = apron.BAKE_STEP, apron.NEAR_PAD
    i0 = pad // step                    # bake index of province fine sample 0
    i1 = i0 + apron.LAST // step        # bake index of province fine sample 4032
    fine = np.clip(np.arange(control.shape[0]) * step - pad, 0, apron.LAST)
    ring = np.concatenate([control[i0 - 1, :, :2], control[i1 + 1, :, :2],
                           control[:, i0 - 1, :2], control[:, i1 + 1, :2]])
    edge = np.concatenate([prov[0, fine, :2], prov[-1, fine, :2], prov[fine, 0, :2], prov[fine, -1, :2]])
    agree = float(np.all(ring == edge, axis=-1).mean())
    assert agree >= 0.95, f"innermost apron paint ring matches the province edge ids on {agree:.1%} of texels (need >= 95 %)"


# (5) the manifest names files that exist ----------------------------------------

def test_manifest_files_exist_and_are_in_the_publish_set(manifest):
    missing = []
    for entry in manifest["ring0"]["chunks"]:
        for meta in entry["lods"].values():
            if not (apron.RING0_DIR / meta["file"]).exists():
                missing.append("ring0/" + meta["file"])
    for tile in manifest["tiles"]:
        if not (apron.OUT_DIR / tile["file"]).exists():
            missing.append(tile["file"])
    for paint in manifest["paint"].values():
        for key in ("control", "tint", "grad"):
            if not (apron.OUT_DIR / paint[key]).exists():
                missing.append(paint[key])
    assert not missing, f"apron manifest names {len(missing)} missing files: {missing[:5]}"
    assert len(manifest["ring0"]["chunks"]) == 68
    publish = json.loads((apron.REPO_ROOT / "tooling" / "province-artefact" / "set.json").read_text())
    assert "apron/**/*.png" in publish["patterns"], "the apron PNGs are not in the province publish set"
