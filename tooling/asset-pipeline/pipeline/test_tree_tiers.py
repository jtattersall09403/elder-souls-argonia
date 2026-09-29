"""tree_tiers: part-aware mid/far tiers (vegetation round 13)."""
from __future__ import annotations

import io
import json

import numpy as np
import pytest

from . import tree_tiers as tt


def _png(alpha: int) -> bytes:
    from PIL import Image
    buf = io.BytesIO()
    im = Image.new("RGBA", (8, 8), (40, 90, 30, 255))
    if alpha < 255:
        im.putalpha(Image.new("L", (8, 8), 0).point(lambda _: alpha))
        for x in range(4):            # half the texels opaque: a leaf atlas
            for y in range(8):
                im.putpixel((x, y), (40, 90, 30, 255))
    im.save(buf, "PNG")
    return buf.getvalue()


def _cards(n: int, rng) -> tuple[np.ndarray, np.ndarray]:
    """`n` separate unit-ish quads (two triangles each) in a 10 m cube."""
    pos, tris = [], []
    for i in range(n):
        c = rng.uniform(0, 10, 3)
        quad = c + np.array([[0, 0, 0], [0.4, 0, 0], [0.4, 0, 0.8], [0, 0, 0.8]])
        pos.extend(quad)
        tris.extend([[4 * i, 4 * i + 1, 4 * i + 2], [4 * i, 4 * i + 2, 4 * i + 3]])
    return np.asarray(pos, np.float32), np.asarray(tris, np.int64)


def _tube(rings: int, sides: int = 6, radius: float = 0.3, x: float = 0.0):
    pos, tris = [], []
    for r in range(rings):
        for s in range(sides):
            a = 2 * np.pi * s / sides
            pos.append([x + radius * np.cos(a), radius * np.sin(a), r * 1.0])
    for r in range(rings - 1):
        for s in range(sides):
            a, b = r * sides + s, r * sides + (s + 1) % sides
            tris += [[a, b, b + sides], [a, b + sides, a + sides]]
    return np.asarray(pos, np.float32), np.asarray(tris, np.int64)


def _glb(tmp_path):
    """A one-asset kit GLB: a leaf part (cards) and a bark part (a trunk tube
    and a twig tube), plus a baked card at lod 3."""
    rng = np.random.default_rng(1)
    gltf = {"asset": {"version": "2.0"}, "scene": 0, "nodes": [], "meshes": [],
            "materials": [], "textures": [], "images": [], "samplers": [{}],
            "accessors": [], "bufferViews": [], "buffers": []}
    w = tt.BlobWriter(gltf, b"")
    for alpha in (0, 255):
        data = _png(alpha)
        start = w.length + (-w.length % 4)
        w.add(np.frombuffer(data, np.uint8).copy())
        gltf["accessors"].pop()
        gltf["images"].append({"bufferView": len(gltf["bufferViews"]) - 1,
                               "mimeType": "image/png"})
        gltf["textures"].append({"source": len(gltf["images"]) - 1, "sampler": 0})
        gltf["materials"].append({"name": "leaf" if alpha == 0 else "bark",
                                  "alphaMode": "MASK", "alphaCutoff": 0.5,
                                  "pbrMetallicRoughness": {"baseColorTexture": {
                                      "index": len(gltf["textures"]) - 1}}})
        assert start >= 0
    leaf_pos, leaf_tris = _cards(200, rng)
    trunk_pos, trunk_tris = _tube(12, radius=0.5)
    twig_pos, twig_tris = _tube(3, radius=0.05, x=3.0)
    bark_pos = np.vstack([trunk_pos, twig_pos])
    bark_tris = np.vstack([trunk_tris, twig_tris + len(trunk_pos)])
    for name, (pos, tris), mat in (("leaves", (leaf_pos, leaf_tris), 0),
                                   ("bark", (bark_pos, bark_tris), 1)):
        attrs = {"POSITION": w.add(pos, None, 34962, True),
                 "TEXCOORD_0": w.add(np.zeros((len(pos), 2), np.float32), None, 34962)}
        idx = w.add(tris.ravel().astype(np.uint16), None, 34963)
        gltf["meshes"].append({"primitives": [{"attributes": attrs, "indices": idx,
                                               "material": mat}]})
        gltf["nodes"].append({"name": name, "mesh": len(gltf["meshes"]) - 1})
    card_pos = np.array([[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], np.float32)
    attrs = {"POSITION": w.add(card_pos, None, 34962, True)}
    gltf["meshes"].append({"primitives": [{"attributes": attrs, "indices": w.add(
        np.array([0, 1, 2, 0, 2, 3], np.uint16), None, 34963), "material": 0}]})
    gltf["nodes"].append({"name": "card", "mesh": 2,
                          "extras": {"lod": 3, "billboard": True, "assetId": "t:tree"}})
    gltf["nodes"].append({"name": "root", "children": [0, 1, 2],
                          "extras": {"assetId": "t:tree"}})
    gltf["scenes"] = [{"nodes": [3]}]
    path = tmp_path / "kit.glb"
    tt.save_glb(path, gltf, w.blob())
    return path


KIT = {"treeTiers": {"assets": ["t:tree"]}}


def test_thin_leaves_keeps_whole_islands_and_area(tmp_path):
    rng = np.random.default_rng(3)
    pos, tris = _cards(300, rng)
    kept, new_pos = tt.thin_leaves(pos, tris, 0.25, 1.0, 10.0, seed=7)
    island = tt.welded_islands(pos, tris)
    kept_islands = set(island[kept])
    # whole cards only: every triangle of a kept island is kept
    assert set(np.nonzero(np.isin(island, list(kept_islands)))[0]) == set(kept)
    assert len(kept_islands) == pytest.approx(75, abs=1)
    area = lambda p, t: 0.5 * np.linalg.norm(  # noqa: E731
        np.cross(p[t[:, 1]] - p[t[:, 0]], p[t[:, 2]] - p[t[:, 0]]), axis=1).sum()
    # gain 1: the leaf area survives on a quarter of the cards
    assert area(new_pos, tris[kept]) == pytest.approx(area(pos.astype(float), tris), rel=0.02)
    again = tt.thin_leaves(pos, tris, 0.25, 1.0, 10.0, seed=7)
    assert np.array_equal(again[0], kept) and np.allclose(again[1], new_pos)


def test_thin_bark_keeps_the_trunk_drops_the_twig():
    trunk_pos, trunk_tris = _tube(12, radius=0.5)
    twig_pos, twig_tris = _tube(3, radius=0.05, x=3.0)
    pos = np.vstack([trunk_pos, twig_pos])
    tris = np.vstack([trunk_tris, twig_tris + len(trunk_pos)])
    kept = tt.thin_bark(pos, tris, 0.5)
    assert set(kept) == set(range(len(trunk_tris)))


def test_apply_writes_levels_materials_and_manifest(tmp_path):
    path = _glb(tmp_path)
    manifest = {"assets": [{"id": "t:tree"}, {"id": "t:other", "lodTiers": {}}]}
    report = tt.apply(path, manifest, KIT)
    row = report["t:tree"]
    assert row["mid"] < row["source"] and row["far"] < row["mid"]
    gltf, _ = tt.load_glb(path)
    root = gltf["nodes"][gltf["scenes"][0]["nodes"][0]]
    levels = {}
    for c in root["children"]:
        extras = gltf["nodes"][c].get("extras") or {}
        if extras.get("esTier"):
            levels.setdefault(extras["lod"], []).append(c)
            mat = gltf["meshes"][gltf["nodes"][c]["mesh"]]["primitives"][0]["material"]
            # its own material (the runtime swaps shared alpha-tested ones back)
            assert mat >= 2 and gltf["materials"][mat]["extras"]["esTier"] == extras["esTier"]
            assert gltf["materials"][mat]["pbrMetallicRoughness"] == \
                gltf["materials"][0 if gltf["materials"][mat]["name"] == "leaf" else 1][
                    "pbrMetallicRoughness"]
    assert sorted(levels) == [1, 2]
    assert manifest["assets"][0]["lodTiers"]["mid"]["level"] == 1
    assert manifest["assets"][0]["lodTiers"]["far"]["triangles"] == row["far"]
    assert "lodTiers" not in manifest["assets"][1]
    with pytest.raises(RuntimeError):      # never tiers a tiered GLB twice
        tt.apply(path, manifest, KIT)


def test_per_asset_null_tier_is_not_built(tmp_path):
    path = _glb(tmp_path)
    kit = {"treeTiers": {"assets": ["t:tree"], "perAsset": {"t:tree": {"far": None}}}}
    manifest = {"assets": [{"id": "t:tree"}]}
    tt.apply(path, manifest, kit)
    gltf, _ = tt.load_glb(path)
    lods = {(n.get("extras") or {}).get("lod") for n in gltf["nodes"]
            if (n.get("extras") or {}).get("esTier")}
    assert lods == {1}
    assert "far" not in manifest["assets"][0]["lodTiers"]
    assert json.dumps(manifest)            # serialisable as the manifest is
