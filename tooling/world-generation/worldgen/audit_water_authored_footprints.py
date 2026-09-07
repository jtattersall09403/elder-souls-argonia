"""Recover complete authored channel domains from the verified carving history.

The carver's own profile cutoff supplies each footprint, including naturally
low terrain that min(ground, target) leaves untouched. Actual lowering alone
cannot recover that domain. This is target evidence, not an inundation pass;
initial river carving, lakes, portages, oxbows and swamp basins remain separate.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from . import fluvial
from .compile_chunks import DEFAULT_HEIGHTS
from .refine_province import STEP
from .scale import RAW_M


def recover_channel_footprints(history, rivers, accumulation, wetlands, regions):
    before = history['prefluvialGround']
    riv = rivers > 0
    area = np.where(riv, np.maximum(accumulation, .02), 0).astype(np.float32)
    wet = ((wetlands > .5) | np.isin(regions, (6, 7, 8, 13))).astype(np.float32)
    continuum = np.zeros(before.shape, bool)
    minor = np.zeros(before.shape, bool)
    ground = fluvial._carve_channels(before.copy(), riv, area, history['steep'],
                                    history['ambient'], footprint=continuum)
    if not np.array_equal(np.maximum(0, before-ground), history['continuumChannels']):
        raise ValueError('Continuum replay differs from verified carving history')
    before = ground.copy()
    ground = fluvial._rivulets(ground, riv, accumulation, wet, history['ambient'], footprint=minor)
    if not np.array_equal(np.maximum(0, before-ground), history['rivulets']):
        raise ValueError('Rivulet replay differs from verified carving history')
    return {'continuumChannels': continuum, 'rivulets': minor}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--history', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    history = np.load(args.history)
    evidence = json.loads(args.history.with_suffix('.json').read_text())
    source_hash = hashlib.sha256(DEFAULT_HEIGHTS.read_bytes()).hexdigest()
    if (str(history['terrainSourceSha256']) != source_hash or
            evidence['terrainSourceSha256'] != source_hash or
            not evidence['stages']['reconstruction']['exact']):
        raise ValueError('Footprints require an exact carving replay of this terrain source')
    hydro_path = DEFAULT_HEIGHTS.parent.parent/'hydrology-pass1.npz'
    hydro = np.load(hydro_path)
    shape = history['prefluvialGround'].shape
    def up(field):
        return np.repeat(np.repeat(hydro[field], STEP, 0), STEP, 1)[:shape[0], :shape[1]]
    masks = recover_channel_footprints(history, *(up(key) for key in
        ('rivers', 'accum_km2', 'wetlands', 'regions')))
    report = {'schemaVersion': 1, 'status': 'authored-targets-not-coverage-certification',
        'terrainSourceSha256': source_hash,
        'hydrologySha256': hashlib.sha256(hydro_path.read_bytes()).hexdigest(),
        'carvingHistorySha256': hashlib.sha256(args.history.read_bytes()).hexdigest(),
        'gridSize': shape[0], 'metresPerPixel': RAW_M, 'footprints': {}}
    for name, mask in masks.items():
        report['footprints'][name] = {'nativeVertices': int(mask.sum()),
            'unchangedByThisCarver': int(np.sum(mask & (history[name] == 0))),
            'carvedOutsideFootprint': int(np.sum((history[name] > 0) & ~mask))}
        if report['footprints'][name]['carvedOutsideFootprint']:
            raise ValueError('Recovered footprint omits actual channel carving')
    np.savez_compressed(args.out.with_suffix('.npz'), **masks,
                        terrainSourceSha256=source_hash)
    args.out.with_suffix('.json').write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps(report), flush=True)


if __name__ == '__main__':
    main()
