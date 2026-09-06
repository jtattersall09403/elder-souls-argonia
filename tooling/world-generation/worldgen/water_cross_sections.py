"""Compact deterministic channel-section sidecar; old inline bundles still read."""

import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
from .water_boundaries import canonical_cross_section
from .water_features import base_width


def pack_cross_sections(meta, directory):
    """Replace large sample-object JSON with little-endian Float32 triples."""
    normalize_overlay_limits(directory)
    if meta.get('crossSections'):
        return meta
    chunks, count = [], 0
    ribbons = {ribbon['id']: ribbon for ribbon in meta.get('ribbons', [])}
    for ribbon in ribbons.values():
        for point in ribbon['points']:
            section = canonical_cross_section(point['crossSection'])
            values = np.array([[sample['offsetM'], sample['groundM'], sample['accessOffsetM']]
                               for sample in section], dtype='<f4')
            if not np.isfinite(values).all() or not np.all(np.diff(values[:, 0]) > 0):
                raise ValueError('Invalid packed channel cross section')
            point['crossSection'] = section
            point['crossSectionStart'] = count
            point['crossSectionCount'] = len(section)
            count += len(section)
            chunks.append(values)
    # Width is hydraulic bank-to-bank width, not twice the shorter bank.
    for cascade in meta.get('cascades', []):
        ribbon = ribbons.get(cascade['id'].replace('waterfall.', 'water-ribbon.', 1))
        if ribbon:
            cascade['widthM'] = max(.0001, round(min(base_width(ribbon['points'][0]),
                                                   base_width(ribbon['points'][-1])), 4))
    data = np.concatenate(chunks).tobytes() if chunks else b''
    name = 'water-cross-sections.bin'
    (Path(directory) / name).write_bytes(data)
    meta['crossSections'] = {'schemaVersion': 1, 'file': name,
        'encoding': 'float32-le-offset-ground-access', 'sampleCount': count,
        'sha256': hashlib.sha256(data).hexdigest()}
    for ribbon in ribbons.values():
        for point in ribbon['points']:
            del point['crossSection']
    meta.setdefault('stats', {}).update(crossSectionSampleCount=count, crossSectionBytes=len(data))
    return meta


def normalize_overlay_limits(directory):
    """Unused exceptional repair authority is not a property of the data."""
    path = Path(directory) / 'water-bed-overlay.json'
    if path.exists():
        overlay = json.loads(path.read_text())
        if not overlay.get('exceptionIndices') and overlay.get('maxLoweringM', 1) > 3:
            overlay['maxLoweringM'] = overlay.get('routineMaxLoweringM', 3)
            path.write_text(json.dumps(overlay, separators=(',', ':')))


def load_water_metadata(directory, endpoints_only=False):
    """Offline adapter for audits/terrain masks; runtime uses a bounded LRU."""
    directory = Path(directory)
    meta = json.loads((directory / 'water-meta.json').read_text())
    spec = meta.get('crossSections')
    if spec:
        data = np.fromfile(directory / spec['file'], dtype='<f4').reshape(-1, 3)
        if len(data) != spec['sampleCount']:
            raise ValueError('Truncated cross-section sidecar')
        for ribbon in meta['ribbons']:
            for point in ribbon['points']:
                start, count = point['crossSectionStart'], point['crossSectionCount']
                indices = (start, start + count - 1) if endpoints_only else range(start, start + count)
                point['crossSection'] = [dict(zip(('offsetM', 'groundM', 'accessOffsetM'),
                                                map(float, data[index]))) for index in indices]
    return meta


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('water_dir', type=Path)
    args = parser.parse_args()
    path = args.water_dir / 'water-meta.json'
    meta = pack_cross_sections(json.loads(path.read_text()), args.water_dir)
    path.write_text(json.dumps(meta, separators=(',', ':')))
    print(json.dumps({'metadataBytes': path.stat().st_size, **meta['crossSections']}))


if __name__ == '__main__':
    main()
