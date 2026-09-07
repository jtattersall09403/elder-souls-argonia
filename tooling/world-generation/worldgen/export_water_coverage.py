"""Export shared low/base/maximum native water coverage for a review bundle.

Standing coverage uses published fields; channels use the supplied actual
mesh archive. This is native-vertex evidence, not continuous final mesh
certification. Ecological wetland classifications remain separate.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image

from .water_coverage import screen_field_tile
from .water_mesh_coverage import audit_mesh_archive
from .water_terrain_lod import decode_native


def export_coverage(province, water_dir, channel_mesh):
    province, water_dir, channel_mesh = map(Path, (province, water_dir, channel_mesh))
    meta_path = water_dir / 'water-meta.json'
    meta = json.loads(meta_path.read_text())
    overlay_path = water_dir / meta['surface']['bedOverlayFile']
    overlay = json.loads(overlay_path.read_text())
    source_path = province / 'chunks/chunks-web-manifest.json'
    source = json.loads(source_path.read_text())
    native_grid = overlay['gridSize']
    grid = meta['surface']['size']
    factor = meta['surface']['metresPerPixel'] / overlay['metresPerPixel']
    if (meta['surface']['gridOriginM'] != 0 or not float(factor).is_integer()
            or factor < 1 or (grid - 1) * factor != native_grid - 1):
        raise ValueError('Coverage export requires matching native water and terrain grids')
    factor = int(factor)
    ground = np.empty((native_grid, native_grid), np.float32)
    for chunk in sorted(source['chunks'], key=lambda c: (c['cy'], c['cx'])):
        values = decode_native(province, chunk, source['chunkSamples'], overlay)
        x, y = chunk['cx'] * source['chunkSamples'], chunk['cy'] * source['chunkSamples']
        ground[y:y + values.shape[0], x:x + values.shape[1]] = values
    ground = ground[::factor, ::factor]
    spec = meta['surface']
    paths = [water_dir / spec[key] for key in ('file', 'supportFile', 'shoreFile', 'accessFile')]
    surface, support, shore, access = [np.asarray(Image.open(p).convert('RGB')) for p in paths]
    if any(a.shape != (grid, grid, 3) for a in (surface, support, shore, access)):
        raise ValueError('Coverage export requires native RGB water rasters')
    rg16 = lambda a: (a[:, :, 0].astype(np.float64) * 256 + a[:, :, 1]) / 65535
    level = spec['minM'] + rg16(surface) * (spec['maxM'] - spec['minM'])
    barrier = spec['accessMinOffsetM'] + rg16(access) * spec['accessSpanM']
    season, tide = shore[:, :, 1] / 255., access[:, :, 2] / 255.
    bits = np.zeros((grid, grid), np.uint8)
    for y in range(0, grid, 256):
        tile = np.s_[y:y + 256, :]
        bits[tile], _ = screen_field_tile(ground[tile], level[tile], barrier[tile],
            season[tile], tide[tile], support[tile][:, :, 0], meta['stageRange'])
    # Fully wet standing columns cannot gain any further stage bits.
    (_, channel_bits), mesh_meta = audit_mesh_archive(channel_mesh, ground, bits != 7, meta['stageRange'],
                                                    sample_metres_per_pixel=spec['metresPerPixel'])
    bits |= channel_bits
    stages = np.stack([np.where(bits & (1 << i), 255, 0).astype(np.uint8) for i in range(3)], axis=2)
    Image.fromarray(stages).save(water_dir / 'coverage-stages.png')
    for filename, selected, colour in (
            ('coverage-maximum.png', (bits & 4) != 0, (35, 121, 185)),
            ('coverage-seasonal.png', ((bits & 4) != 0) & ((bits & 2) == 0), (63, 174, 199))):
        rgba = np.zeros((grid, grid, 4), np.uint8)
        rgba[selected, :3] = colour
        rgba[selected, 3] = 210
        Image.fromarray(rgba).save(water_dir / filename)
    sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
    report = {'schemaVersion': 1, 'status': 'preview-native-vertices-not-final-rendered-coverage',
        'terrainStage': 'graded', 'gridSize': grid, 'gridOriginM': 0,
        'metresPerPixel': spec['metresPerPixel'], 'nativeTerrainGridSize': native_grid,
        'stageRange': meta['stageRange'],
        'stageFile': 'coverage-stages.png', 'encoding': 'RGB = low/base/maximum; 255 wet, 0 dry',
        'wetVertices': {name: int(np.count_nonzero(bits & (1 << i)))
                        for i, name in enumerate(('low', 'base', 'maximum'))},
        'channelGeometryScope': mesh_meta['status'],
        'inputs': {str(p): sha(p) for p in [meta_path, overlay_path, source_path,
                    water_dir / spec['terrainTopologyFile'], channel_mesh / 'manifest.json', *paths]},
        'outputs': {name: sha(water_dir / name) for name in
                    ('coverage-stages.png', 'coverage-maximum.png', 'coverage-seasonal.png')}}
    (water_dir / 'coverage-meta.json').write_text(json.dumps(report, indent=2) + '\n')
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--province', type=Path, required=True)
    parser.add_argument('--water-dir', type=Path, required=True)
    parser.add_argument('--channel-mesh', type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(export_coverage(args.province, args.water_dir, args.channel_mesh)), flush=True)


if __name__ == '__main__':
    main()
