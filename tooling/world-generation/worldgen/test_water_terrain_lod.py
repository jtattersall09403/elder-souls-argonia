import json
import gzip
import struct

import numpy as np
import pytest
from PIL import Image

from .water_terrain_lod import bank_world_roundoff_bound, decode_native, encode_mesh, export_terrain
from .adaptive_terrain import adaptive_terrain


def fixture(tmp_path):
    province = tmp_path / "province"
    (province / "chunks").mkdir(parents=True)
    (province / "water/v2").mkdir(parents=True)
    z, x = np.mgrid[:9, :9]
    codes = (20000 + z * 500 + x * 200).astype(np.uint16)
    rgb = np.zeros((9, 9, 3), np.uint8)
    rgb[..., 0], rgb[..., 1] = codes >> 8, codes & 255
    Image.fromarray(rgb).save(province / "chunks/native.png")
    chunk = {"cx": 0, "cy": 0, "originM": [0, 0], "lods": {
        str(lod): {"file": "native.png", "minM": -10, "maxM": 90,
                   "shape": [8 // lod + 1] * 2, "metresPerSample": lod * 1.5} for lod in (1, 2, 4)}}
    source = {"chunkSamples": 8, "grid": [1, 1], "chunks": [chunk]}
    overlay = {"schemaVersion": 1, "gridSize": 9, "metresPerPixel": 1.5,
               "changes": [[40, 31.75, 32.0]]}
    topology = {"schemaVersion": 1, "gridSize": 9, "metresPerPixel": 1.5, "flippedCells": [3 * 8 + 4]}
    for path, data in [("chunks/chunks-web-manifest.json", source), ("water/v2/water-bed-overlay.json", overlay),
                       ("water/v2/water-terrain-topology.json", topology)]:
        (province / path).write_text(json.dumps(data))
    mask = np.zeros((9, 9), bool)
    mask[:, 3:5] = True
    protected = tmp_path / "protect.npy"
    np.save(protected, mask)
    return province, protected, chunk, overlay


def test_export_is_deterministic_native_png_plus_delta_and_versioned_topology(tmp_path):
    province, protected, chunk, overlay = fixture(tmp_path)
    first = export_terrain(province, protected, tmp_path / "a")
    second = export_terrain(province, protected, tmp_path / "b")
    assert first == second and first["schemaVersion"] == 1
    heights = decode_native(province, chunk, 8, overlay)
    for lod in ("2", "4"):
        meta = first["chunks"][0]["lods"][lod]
        download = (tmp_path / "a" / meta["file"]).read_bytes()
        assert download == (tmp_path / "b" / meta["file"]).read_bytes()
        assert meta["downloadBytes"] == len(download)
        blob = gzip.decompress(download)
        version, vertices, indices, width, nx, nz = struct.unpack_from("<6I", blob, 8)
        assert version == 1 and nx == nz == 8 and width == 2
        lattice = np.frombuffer(blob, "<u2", vertices * 2, 32).reshape(-1, 2)
        actual = np.frombuffer(blob, "<f4", vertices, 32 + vertices * 4)
        assert np.array_equal(actual, heights[lattice[:, 1], lattice[:, 0]])
        triangles = np.frombuffer(blob, "<u2", indices, 32 + vertices * 8).reshape(-1, 3)
        by_xz = {tuple(map(int, p)): i for i, p in enumerate(lattice)}
        a, b, c, d = [by_xz[p] for p in ((4, 3), (5, 3), (4, 4), (5, 4))]
        faces = set(map(tuple, triangles))
        assert (a, c, d) in faces and (a, d, b) in faces
        assert meta["bytes"] == len(blob)
    assert first["stats"]["flippedCells"] == 1


def test_rejects_mismatched_masks_and_topology_without_touching_native_assets(tmp_path):
    province, protected, _, _ = fixture(tmp_path)
    original = (province / "chunks/native.png").read_bytes()
    np.save(protected, np.zeros((8, 8), bool))
    with pytest.raises(ValueError, match="vertex mask"):
        export_terrain(province, protected, tmp_path / "bad")
    assert (province / "chunks/native.png").read_bytes() == original
    with pytest.raises(ValueError, match="lattice"):
        encode_mesh([[0.1, 1, 0], [1, 1, 0], [0, 1, 1]], [[0, 2, 1]], 1, 1)


def test_optional_error_assets_keep_exact_fallbacks_and_declare_world_error(tmp_path):
    province, protected, _, _ = fixture(tmp_path)
    ordinary = export_terrain(province, protected, tmp_path / "original")
    extended = export_terrain(province, protected, tmp_path / "extended", bank_errors=(.1, .25, .5, 1))
    assets = extended["chunks"][0]["lods"]
    assert set(assets) == {"2", "4", "4-e010", "4-e025", "4-e050", "4-e100"}
    for key in ("2", "4"):
        assert assets[key] == ordinary["chunks"][0]["lods"][key]
    for key in ("4-e010", "4-e025", "4-e050", "4-e100"):
        asset = assets[key]
        assert asset["baseLod"] == "4"
        assert asset["maximumBankErrorM"] == asset["bankLatticeErrorM"] + asset["worldFloat32ErrorAllowanceM"]
        assert asset["maximumBankErrorM"] > asset["bankLatticeErrorM"]


def test_world_coordinate_roundoff_allowance_covers_native_and_coarse_inverse_positions():
    z, x = np.mgrid[:17, :17]
    heights = (2 * x + 3 * z + .06 * np.sin(x) * np.cos(z)).astype(np.float32)
    vertices, triangles = adaptive_terrain(heights, np.ones((16, 16), bool), 4, max_error_m=.1)
    origin, mpp = (6813.81173, 6917.33482), 1.82784
    allowance = bank_world_roundoff_bound(vertices, triangles, origin, mpp, (16, 16))
    assert 0 < allowance < .01
    axes = [(o + np.arange(17) * mpp).astype(np.float32).astype(np.float64) for o in origin]
    world = vertices.astype(np.float64).copy()
    world[:, 0] = (origin[0] + world[:, 0] * mpp).astype(np.float32)
    world[:, 2] = (origin[1] + world[:, 2] * mpp).astype(np.float32)
    for weights in ((1/3, 1/3, 1/3), (.01, .49, .5), (.03, .81, .16)):
        points = np.einsum('ijk,j->ik', world[triangles], weights)
        ix = np.clip(np.searchsorted(axes[0], points[:, 0], side='right') - 1, 0, 15)
        iz = np.clip(np.searchsorted(axes[1], points[:, 2], side='right') - 1, 0, 15)
        fx = (points[:, 0] - axes[0][ix]) / (axes[0][ix + 1] - axes[0][ix])
        fz = (points[:, 2] - axes[1][iz]) / (axes[1][iz + 1] - axes[1][iz])
        a, b, c, d = heights[iz, ix], heights[iz, ix + 1], heights[iz + 1, ix], heights[iz + 1, ix + 1]
        native = np.where(fx + fz <= 1, a * (1 - fx - fz) + b * fx + c * fz,
                          d * (fx + fz - 1) + b * (1 - fz) + c * (1 - fx))
        assert np.max(np.abs(native - points[:, 1])) < .1 + allowance
