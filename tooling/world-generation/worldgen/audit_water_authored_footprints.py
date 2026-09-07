"""Recover authored channel domains and pond hollows from verified carving history.

The carver's own profile cutoff supplies each footprint, including naturally
low terrain that min(ground, target) leaves untouched. Actual lowering alone
cannot recover that domain. This is target evidence, not an inundation pass;
initial river carving, lakes, portages, oxbows and full swamp/pond basins remain
separate. Pond hollows use the deepener's exact predicate and are additive.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from . import fluvial
from .compile_chunks import DEFAULT_HEIGHTS
from .refine_province import STEP, SEED
from .scale import RAW_M


def recover_channel_footprints(history, rivers, accumulation, wetlands, regions, pool_continuation=None):
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
    masks = {'continuumChannels': continuum, 'rivulets': minor}
    if pool_continuation is None:
        return masks
    # Levees include additions, which the historical positive-cut snapshots
    # cannot prove alone. Replay through the final natural terrain below.
    rng = np.random.default_rng(SEED ^ 139)
    ground = fluvial._levees_and_floodplain(ground, riv, area, history['steep'])

    def verify(name, before, after):
        if not np.array_equal(np.maximum(0, before - after), history[name]):
            raise ValueError(f'{name} replay differs from verified carving history')

    before = ground.copy()
    ground, _ = fluvial._oxbows(ground, riv, area, history['steep'], rng)
    verify('oxbows', before, ground)
    before = ground.copy()
    ground = fluvial._wetland_compaction(ground, wet, riv)
    verify('wetlandCompaction', before, ground)
    before = ground.copy()
    hollows = np.zeros(ground.shape, bool)
    ground = fluvial._deepen_wetland_pools(ground, riv, wet, footprint=hollows)
    verify('wetlandPools', before, ground)
    masks['wetlandPoolHollows'] = hollows
    before = ground.copy()
    ground, _ = fluvial._delta(ground, riv, area, pool_continuation['salinity'], rng)
    verify('deltas', before, ground)
    before = ground.copy()
    ground, _ = fluvial._condition_bed(ground, pool_continuation['rivers'],
        pool_continuation['flow_to'], pool_continuation['filled'], STEP)
    verify('bedConditioning', before, ground)
    if not np.array_equal(ground, pool_continuation['ungraded_ground']):
        raise ValueError('Pool footprint continuation differs from original ungraded terrain')
    return masks


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--history', type=Path, required=True)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--channels-only', action='store_true', help='Skip the complete natural-terrain continuation')
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
    continuation = None
    if not args.channels_only:
        continuation = {key: hydro[key] for key in ('rivers', 'flow_to', 'filled')}
        continuation.update(salinity=up('salinity'),
                            ungraded_ground=np.load(DEFAULT_HEIGHTS.parent/'refined-height-ungraded-f32.npy'))
    masks = recover_channel_footprints(history, *(up(key) for key in
        ('rivers', 'accum_km2', 'wetlands', 'regions')), pool_continuation=continuation)
    report = {'schemaVersion': 1, 'status': 'authored-targets-not-coverage-certification',
        'terrainSourceSha256': source_hash,
        'hydrologySha256': hashlib.sha256(hydro_path.read_bytes()).hexdigest(),
        'carvingHistorySha256': hashlib.sha256(args.history.read_bytes()).hexdigest(),
        'gridSize': shape[0], 'metresPerPixel': RAW_M,
        'naturalTerrainContinuationExact': continuation is not None,
        'limitations': 'Pool hollows are additive targets, not full basin slopes, nearby river pools or connecting swamp sheets.',
        'footprints': {}}
    for name, mask in masks.items():
        delta = history['wetlandPools' if name == 'wetlandPoolHollows' else name]
        report['footprints'][name] = {'nativeVertices': int(mask.sum()),
            'unchangedByThisCarver': int(np.sum(mask & (delta == 0))),
            'carvedOutsideFootprint': int(np.sum((delta > 0) & ~mask))}
        if report['footprints'][name]['carvedOutsideFootprint']:
            raise ValueError('Recovered footprint omits actual channel carving')
    np.savez_compressed(args.out.with_suffix('.npz'), **masks,
                        terrainSourceSha256=source_hash)
    args.out.with_suffix('.json').write_text(json.dumps(report, indent=2)+'\n')
    print(json.dumps(report), flush=True)


if __name__ == '__main__':
    main()
