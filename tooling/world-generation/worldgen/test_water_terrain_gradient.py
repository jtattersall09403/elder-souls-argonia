import hashlib
import json
import struct

import numpy as np
import pytest
from PIL import Image

from .water_terrain_gradient import gradient_replacements, export_gradient_patch
from .water_terrain_lod import export_terrain
from .test_water_terrain_lod import fixture


def test_sparse_delta_preserves_unrelated_bytes_and_observes_diagonal_topology():
    z, x = np.mgrid[:9, :9]
    old = (x * .2 + z * .3).astype(np.float32)
    new = old.copy()
    new[4, 4] -= 2
    rgb = np.full((9, 9, 3), 128, np.uint8)
    rgb[..., 2] = x + z * 9
    records = gradient_replacements(rgb, lambda x, z: old[z, x], lambda x, z: new[z, x], [40], [], 1)
    assert records and [r[0] for r in records] == sorted(set(r[0] for r in records))
    patched = rgb.copy()
    for index, r, g in records:
        row, col = divmod(index, 9)
        assert 3 <= row <= 5 and 3 <= col <= 5
        patched[row, col, :2] = r, g
    assert np.array_equal(patched[..., 2], rgb[..., 2])
    assert gradient_replacements(rgb, lambda x, z: old[z, x], lambda x, z: old[z, x], [], [], 1) == []
    # Height unchanged; a nonplanar quad changes incident face weighting.
    old[4, 4] += 3
    topology_only = gradient_replacements(rgb, lambda x, z: old[z, x], lambda x, z: old[z, x], [], [3 * 8 + 3], 1)
    assert topology_only
    assert set(r[0] for r in topology_only) <= {30, 31, 39, 40}


def test_export_binds_dependencies_is_deterministic_and_never_rewrites_original(tmp_path):
    province, mask, _, _ = fixture(tmp_path)
    original = np.full((9, 9, 3), 128, np.uint8)
    gradient = province / 'chunks/normal-grad.png'
    Image.fromarray(original).save(gradient)
    source = province / 'chunks/chunks-web-manifest.json'
    meta = json.loads(source.read_text())
    meta['gradients'] = {'file': 'normal-grad.png', 'clamp': 8, 'encoding': 'signed-sqrt', 'size': [9, 9]}
    source.write_text(json.dumps(meta))
    original_bytes = gradient.read_bytes()
    terrain = tmp_path / 'terrain'
    export_terrain(province, mask, terrain)
    descriptor = export_gradient_patch(province, province / 'water/v2', terrain)
    first = (terrain / descriptor['file']).read_bytes()
    assert descriptor == export_gradient_patch(province, province / 'water/v2', terrain)
    assert first == (terrain / descriptor['file']).read_bytes()
    assert first[:8] == b'ESGRAD01'
    assert struct.unpack_from('<4I', first, 8) == (1, 9, 9, descriptor['count'])
    assert len(first) == 24 + 6 * descriptor['count']
    assert hashlib.sha256(first).hexdigest() == descriptor['sha256']
    assert gradient.read_bytes() == original_bytes
    overlay = province / 'water/v2/water-bed-overlay.json'
    overlay.write_text(overlay.read_text() + '\n')
    with pytest.raises(ValueError, match='dependency mismatch'):
        export_gradient_patch(province, province / 'water/v2', terrain)
