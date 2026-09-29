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


def _bent_tube(rings: int = 40, sides: int = 12, radius: float = 0.25):
    """A 4 m tube bending in one plane, one welded island, UVs as a bark wrap."""
    pos, uv, tris = [], [], []
    for r in range(rings):
        t = r / (rings - 1)
        centre = np.array([np.sin(t * 1.2) * 2.0, t * 4.0, 0.0])
        tangent = np.array([np.cos(t * 1.2) * 2.4, 4.0, 0.0])
        tangent /= np.linalg.norm(tangent)
        side = np.cross(tangent, [0, 0, 1.0])
        for s in range(sides):
            a = 2 * np.pi * s / sides
            pos.append(centre + radius * (np.cos(a) * side + np.sin(a) * np.array([0, 0, 1.0])))
            uv.append([s / sides, t * 4])
    for r in range(rings - 1):
        for s in range(sides):
            a, b = r * sides + s, r * sides + (s + 1) % sides
            tris += [[a, b, b + sides], [a, b + sides, a + sides]]
    return np.asarray(pos, np.float32), np.asarray(uv, np.float32), np.asarray(tris, np.int64)


def test_tube_bark_rebuilds_a_tube_lighter_and_in_place():
    pos, uv, tris = _bent_tube()
    attrs = {"POSITION": pos, "TEXCOORD_0": uv}
    built, faces = tt.tube_bark(pos, tris, attrs, sides=4, tol=0.05, keep=1.0)
    assert len(faces) < len(tris) / 4                         # rings merged + fewer sides
    assert tt.tube_fits(pos, tris, built["POSITION"], faces, 0.05)
    # the rebuilt tube spans the source's height and bend
    assert np.allclose(built["POSITION"].min(0)[:2], pos.min(0)[:2], atol=0.3)
    assert np.allclose(built["POSITION"].max(0)[:2], pos.max(0)[:2], atol=0.3)


def test_tube_fits_refuses_a_misplaced_rebuild():
    pos, uv, tris = _bent_tube()
    moved = pos + np.array([0.0, 0.0, 1.0], np.float32)       # a cone or a broken fork
    assert not tt.tube_fits(pos, tris, moved, tris, 0.05)


def test_tube_bark_keeps_small_islands_whole():
    pos, tris = _cards(5, np.random.default_rng(3))
    built, faces = tt.tube_bark(pos, tris, {"POSITION": pos}, sides=4, tol=0.05, keep=1.0)
    assert len(faces) == len(tris)


def test_record_refuses_a_bark_tube_level_without_a_judge_pass(tmp_path, monkeypatch):
    """Round 13c: --record writes a bark-tube level only with an image-judge
    PASS file beside its sheet (the silhouette bar misses cones and breaks)."""
    from . import tree_tiers_check as tc
    monkeypatch.setattr(tt, "CONFIG", tmp_path)
    monkeypatch.setattr(tc, "sheet", lambda *a, **k: None)
    (tmp_path / "k.json").write_text("{}")
    cal = tmp_path / "cal"
    (cal / "t__tree").mkdir(parents=True)
    level = {"tier": "mid", "triangles": 50, "iouMin": 0.95, "pass": True, "px": 100,
             "settings": {"leafKeep": 1.0, "barkTube": 1, "barkSides": 4, "barkTol": 0.1}}
    (cal / "t__tree" / "result.json").write_text(json.dumps({
        "assetId": "t:tree", "source": 100, "handoverM": {"mid": 20, "far": 60},
        "levels": {"mid-s4t10": level}}))
    with pytest.raises(SystemExit, match="no judge file"):
        tc.record("k", cal)
    judge = cal / "t__tree-mid.judge.json"
    judge.write_text(json.dumps({"label": "mid-s4t10",
                                 "judges": [{"verdict": "PASS"}, {"verdict": "FAIL"}]}))
    with pytest.raises(SystemExit, match="verdicts"):
        tc.record("k", cal)
    assert json.loads((tmp_path / "k.json").read_text()) == {}     # nothing written
    judge.write_text(json.dumps({"label": "mid-s4t10",
                                 "judges": [{"verdict": "PASS"}, {"verdict": "PASS"}]}))
    per = tc.record("k", cal)
    assert per["t:tree"]["mid"]["barkTube"] == 1


def test_share_cap_is_per_asset_and_an_over_cap_level_needs_the_judges(tmp_path, monkeypatch):
    """Round 13d: the cap is a kit/asset setting, not a constant; a level over
    the kit cap records only with an image-judge PASS, writes its cap to
    `maxShareByAsset`, and a tier the run did not render keeps its row."""
    from . import tree_tiers_check as tc
    kit = {"treeTiers": {"maxShare": 0.7, "maxShareByAsset": {"t:tree": 0.95}}}
    assert tc.max_share(kit, "t:tree") == 0.95 and tc.max_share(kit, "t:other") == 0.7
    assert tc.max_share({}, "t:tree") == tc.MAX_SHARE
    labels, counts = {"mid-a": "mid"}, {"source": 100, "mid-a": 85}
    scores = {"mid-a": {"pass": True, "iouMin": 0.93}}
    assert tc.choose(labels, counts, scores)["mid"] is None
    assert tc.choose(labels, counts, scores, 0.95)["mid"] == "mid-a"
    monkeypatch.setattr(tt, "CONFIG", tmp_path)
    monkeypatch.setattr(tc, "sheet", lambda *a, **k: None)
    far = {"leafKeep": 0.2, "gain": 0.85}
    (tmp_path / "k.json").write_text(json.dumps(
        {"treeTiers": {"perAsset": {"t:tree": {"mid": None, "far": far}}}}))
    cal = tmp_path / "cal"
    (cal / "t__tree").mkdir(parents=True)
    level = {"tier": "mid", "triangles": 85, "share": 0.85, "iouMin": 0.93, "pass": True,
             "px": 100, "settings": {"leafKeep": 0.1, "gain": 0.4, "barkKeep": 1.0}}
    (cal / "t__tree" / "result.json").write_text(json.dumps({
        "assetId": "t:tree", "source": 100, "maxShare": 0.95, "tiers": ["mid"],
        "handoverM": {"mid": 20, "far": 60}, "levels": {"mid-k10g40": level}}))
    with pytest.raises(SystemExit, match="no judge file"):
        tc.record("k", cal)
    (cal / "t__tree-mid.judge.json").write_text(json.dumps(
        {"label": "mid-k10g40", "judges": [{"verdict": "PASS"}, {"verdict": "PASS"}]}))
    per = tc.record("k", cal)
    assert per["t:tree"] == {"mid": level["settings"], "far": far}
    written = json.loads((tmp_path / "k.json").read_text())["treeTiers"]
    assert written["maxShareByAsset"] == {"t:tree": 0.95}
    assert written["assets"] == ["t:tree"]


def test_tube_runs_rebuilds_only_the_straight_run_and_keeps_the_collars():
    """Round 13c runs mode: the run's inner rings are rebuilt, the ends stay
    source, and the rebuilt tube starts inside the kept collar (no crack)."""
    pos, uv, tris = _bent_tube()
    nrm = np.zeros_like(pos); nrm[:, 2] = 1
    attrs = {"POSITION": pos, "TEXCOORD_0": uv, "NORMAL": nrm}
    built, faces = tt.tube_bark(pos, tris, attrs, sides=5, tol=0.05, keep=1.0, runs=True)
    assert len(faces) < len(tris) * 0.7
    # the lowest and highest source vertices survive untouched (the collars)
    for end in (pos[:12], pos[-12:]):
        d = np.min(np.linalg.norm(built["POSITION"][None] - end[:, None], axis=2), axis=1)
        assert d.max() < 1e-6
    assert tt.tube_fits(pos, tris, built["POSITION"], faces, 0.05)
    assert np.allclose(np.linalg.norm(built["NORMAL"], axis=1), 1, atol=1e-5)


def test_rebuild_tubes_leaves_no_unreferenced_vertex():
    """Review 13c: a root's own ring (superseded by its start ring) and a
    lone ring with no faces are not left in the vertex buffer."""
    pos, uv, tris = _bent_tube()
    built, faces = tt.rebuild_tubes(pos, tris, {"POSITION": pos, "TEXCOORD_0": uv}, 5, 0.05)
    assert len(faces)
    assert set(np.unique(faces)) == set(range(len(built["POSITION"])))
    assert len(built["TEXCOORD_0"]) == len(built["POSITION"])


def test_corner_radius_keeps_the_mean_width():
    # perimeter of the n-gon equals the circle's (mean width = perimeter / pi)
    for n in (4, 5, 6, 8):
        R = tt.corner_radius(1.0, n)
        assert 2 * n * R * np.sin(np.pi / n) == pytest.approx(2 * np.pi)


def test_calibrate_records_only_varied_and_set_keys():
    from . import tree_tiers_check as tc
    assert tc.recorded_keys(tc.LEAF_VARIED, {}) == ["leafKeep", "gain"]
    assert tc.recorded_keys(tc.BARK_VARIED, {"leafKeep": 0.4, "barkTol": 0.1}) == \
        ["barkTube", "barkSides", "barkTol", "leafKeep"]


def test_apply_with_bark_tubes_writes_a_valid_level(tmp_path):
    """Review 13c: the tube branch end to end through build_tiers and the
    writer: the mid bark mesh is the rebuilt trunk (lighter than the
    source's) plus the kept twig, its indices in range and all used."""
    path = _glb(tmp_path)
    kit = {"treeTiers": {"assets": ["t:tree"],
                         "mid": {"barkTube": 1, "barkSides": 4, "barkTol": 0.1, "barkKeep": 1.0,
                                 "barkFit": 2.5}}}
    manifest = {"assets": [{"id": "t:tree"}]}
    tt.apply(path, manifest, kit)
    gltf, blob = tt.load_glb(path)
    source_bark = 11 * 6 * 2 + 2 * 6 * 2           # trunk (11 bands) + twig (2 bands)
    for node in gltf["nodes"]:
        extras = node.get("extras") or {}
        if extras.get("lod") != 1 or "mesh" not in node:
            continue
        prim = gltf["meshes"][node["mesh"]]["primitives"][0]
        if gltf["materials"][prim["material"]]["name"] != "bark":
            continue
        idx = tt.accessor(gltf, blob, prim["indices"]).ravel()
        n = gltf["accessors"][prim["attributes"]["POSITION"]]["count"]
        assert idx.max() < n and len(np.unique(idx)) == n
        assert len(idx) // 3 < source_bark
        break
    else:
        raise AssertionError("no mid bark level written")
