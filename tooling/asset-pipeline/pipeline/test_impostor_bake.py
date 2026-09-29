"""impostor_bake: the frame geometry the runtime shares, the numpy impostor
the judge renders, the packed GLB and the sidecar. No Blender here."""
import json

import numpy as np

from pipeline import impostor_bake as b, tree_tiers


def test_select_frames_matches_the_runtime_fixture():
    # The same rows are pinned in game-core vegetation/impostor.test.ts.
    v = np.array([0.309426, 0.206284, 0.928279])
    frames, w = b.select_frames(v, 12)
    assert [tuple(map(int, f)) for f in frames] == [(10, 3), (11, 3), (10, 4)]
    assert np.allclose(w, [0.642873, 0.214253, 0.142873], atol=1e-4)
    assert abs(w.sum() - 1) < 1e-9

    # Toward grid corners (0,0)/(n-1,n-1) the cell splits on its main diagonal.
    frames, w = b.select_frames(np.array([-0.952579, 0.136083, -0.272166]), 12)
    assert [tuple(map(int, f)) for f in frames] == [(0, 2), (1, 3), (0, 3)]
    assert np.allclose(w, [0.249976, 0.550037, 0.199987], atol=1e-4)


def test_low_axis_views_lean_on_the_on_axis_horizon_frame():
    # gkb9 lost views 3 and 7 (azimuths +-X) to its card: with one split
    # everywhere the on-axis frame there weighed 0.12 (decision 0108 sec 5).
    el = np.radians(5)
    for x, z, corner in ((1, 0, (11, 11)), (-1, 0, (0, 0)), (0, 1, (11, 0)), (0, -1, (0, 11))):
        frames, w = b.select_frames(np.array([x * np.cos(el), np.sin(el), z * np.cos(el)]), 12)
        k = [tuple(map(int, f)) for f in frames].index(corner)
        assert w[k] > 0.5


def test_grid_border_is_the_horizon_and_bases_are_orthonormal():
    for i in range(12):
        assert abs(b.grid_dir(i, 0)[1]) < 1e-9 and abs(b.grid_dir(0, i)[1]) < 1e-9
        for j in range(12):
            d = b.grid_dir(i, j)
            r, u = b.frame_basis(d)
            assert d[1] >= 0
            assert abs(r @ d) < 1e-9 and abs(u @ d) < 1e-9 and abs(r @ u) < 1e-9
            assert np.allclose(np.cross(r, u), d)


def test_reconstruct_on_a_frame_returns_that_frame():
    n, px = 4, 16
    rng = np.random.default_rng(1)
    albedo = rng.random((n * px, n * px, 4))
    albedo[..., 3] = (albedo[..., 3] > 0.5).astype(float)
    normal = np.zeros((n * px, n * px, 3))
    normal[..., 2] = 1
    depth = np.full((n * px, n * px), 0.5)
    i, j = 2, 1
    _, _, a = b.reconstruct(albedo, normal, depth, b.grid_dir(i, j, n), 1.0, px, n)
    tile = albedo[j * px:(j + 1) * px, i * px:(i + 1) * px, 3]
    assert np.array_equal(a > 0.5, tile > 0.5)


def test_parallax_moves_a_raised_point_to_its_true_place():
    """One small blob off the centre plane, baked consistently into every
    frame (its projection and its depth), seen between frames: the depth walk
    keeps it one solid blob where its 3D point projects."""
    n, px = 12, 128
    q = np.array([0.05, 0.02, 0.4])
    albedo = np.zeros((n * px, n * px, 4))
    albedo[..., :3] = 1
    depth = np.zeros((n * px, n * px))
    normal = np.zeros((n * px, n * px, 3))
    normal[..., 2] = 1
    for i in range(n):
        for j in range(n):
            d = b.grid_dir(i, j, n)
            r, u = b.frame_basis(d)
            col, row = int((q @ r + 0.5) * px), int((0.5 - q @ u) * px)
            albedo[j * px + row - 2:j * px + row + 2, i * px + col - 2:i * px + col + 2, 3] = 1
            depth[j * px:(j + 1) * px, i * px:(i + 1) * px] = q @ d + 0.5
    # The middle of a frame triangle: three taps at a third each.
    view = b.grid_dir(3, 3, n) + b.grid_dir(4, 3, n) + b.grid_dir(3, 4, n)
    view = view / np.linalg.norm(view)
    rv, uv = b.frame_basis(view)
    want = np.array([(0.5 - q @ uv) * px, (q @ rv + 0.5) * px])

    def centre(a):
        ys, xs = np.nonzero(a > 0.2)
        return np.array([ys.mean(), xs.mean()]) + 0.5
    _, _, a0 = b.reconstruct(albedo, normal, depth, view, 1.0, px, n, steps=0)
    _, _, a2 = b.reconstruct(albedo, normal, depth, view, 1.0, px, n, steps=2)
    # With the walk the three taps land on one spot: a solid blob where the
    # point projects.
    assert np.linalg.norm(centre(a2) - want) < 1.0
    assert (a2 > 0.5).sum() >= 12 and (a0 > 0.2).sum() >= (a2 > 0.2).sum()


def test_quad_glb_carries_three_atlases(tmp_path):
    from PIL import Image
    import io
    pngs = []
    for mode in ("RGBA", "RGB", "L"):
        buf = io.BytesIO()
        Image.new(mode, (8, 8)).save(buf, "PNG")
        pngs.append(buf.getvalue())
    path = tmp_path / "q.glb"
    b.quad_glb(*pngs, "x", path)
    gltf, blob = tree_tiers.load_glb(path)
    mat = gltf["materials"][0]
    assert len(gltf["images"]) == 3
    assert mat["alphaMode"] == "MASK" and "normalTexture" in mat and "occlusionTexture" in mat
    assert tree_tiers.accessor(gltf, blob, 0).shape == (4, 3)


def test_publish_writes_a_versioned_sidecar(tmp_path, monkeypatch):
    monkeypatch.setattr(b, "PUBLIC", tmp_path / "kits")
    out = tmp_path / "out"
    row = {"id": "bmv:a/b", "file": "bmv__a_b.glb", "grid": 12, "cellM": 1.0,
           "centreM": [0, 0, 0], "contentPx": 100, "judge": {"pass": True}}
    (out / b.safe_id(row["id"])).mkdir(parents=True)
    (out / b.safe_id(row["id"]) / row["file"]).write_bytes(b"glb")
    side = b.publish("k", [row], out)
    data = json.loads(side.read_text())
    assert data["schemaVersion"] == 1
    assert data["impostors"][0]["path"] == "k-impostors/bmv__a_b.glb"
    assert (tmp_path / "kits" / "k-impostors" / "bmv__a_b.glb").exists()


def test_far_bar_is_beating_the_card_in_every_view():
    assert b.beats_card([0.70, 0.80], [0.52, 0.40])
    assert not b.beats_card([0.70, 0.39], [0.52, 0.40])      # one view loses
    assert not b.beats_card([0.70, 0.80], [])                # no card measured
    assert not b.beats_card([0.70, 0.80], [0.5])             # views disagree


def test_publish_needs_two_passing_judges(tmp_path):
    assert "no judges.json" in b.judges_passed(tmp_path)
    (tmp_path / "judges.json").write_text(json.dumps({"judges": [{"verdict": "PASS"}]}))
    assert "need 2+" in b.judges_passed(tmp_path)
    (tmp_path / "judges.json").write_text(json.dumps(
        {"judges": [{"verdict": "PASS"}, {"verdict": "FAIL"}]}))
    assert b.judges_passed(tmp_path) is not None
    (tmp_path / "judges.json").write_text(json.dumps(
        {"judges": [{"verdict": "PASS"}, {"verdict": "PASS"}]}))
    assert b.judges_passed(tmp_path) is None
