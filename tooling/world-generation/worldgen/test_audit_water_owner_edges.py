import hashlib
import json
import numpy as np
from . import audit_water_owner_edges


def test_all_owner_edges_keeps_dry_potential_banks_without_png_decode(tmp_path, monkeypatch):
    profile = np.array([[-1, 1, 1], [0, -1, -1], [1, 1, 1]], dtype='<f4')
    (tmp_path / 'profiles.bin').write_bytes(profile.tobytes())
    points = [dict(x=x, y=0, z=0, crossSectionStart=0, crossSectionCount=3,
                   boundaryKinds=['reach-owner', 'bank']) for x in [0, 2]]
    meta = {'surface': {}, 'crossSections': {'file': 'profiles.bin'},
            'ribbons': [{'id': 'test.river', 'points': points}]}
    encoded = json.dumps(meta).encode()
    (tmp_path / 'water-meta.json').write_bytes(encoded)
    output = tmp_path / 'edges.json'
    monkeypatch.setattr('sys.argv', ['audit_water_owner_edges', str(tmp_path),
                                   '--all-owner-edges', '--out', str(output)])
    audit_water_owner_edges.main()
    result = json.loads(output.read_text())
    assert result['schemaVersion'] == 2
    assert result['selection'] == 'all-owner-edges'
    assert result['waterMetaSha256'] == hashlib.sha256(encoded).hexdigest()
    assert len(result['cases']) == 2  # Both outer samples are dry at base.
    assert all('raster' not in case for case in result['cases'])
    assert all(case['outside'][1] == -1.01 for case in result['cases'])
