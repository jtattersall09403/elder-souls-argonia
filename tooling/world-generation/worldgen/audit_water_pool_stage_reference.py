"""Capture reviewed connected-pool ranges before changing shoreline geometry.

Input is a native field NPZ with standing-detail/triangle topology and actual
season/tide fields. This does not certify mesh coverage or create new ranges.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from scipy import ndimage

from .water_pool_domains import connected_standing_pool_labels
from .water_stage import stage_range


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('fields', type=Path)
    parser.add_argument('--source-checkpoint', required=True)
    parser.add_argument('--out', type=Path, required=True)
    args = parser.parse_args()
    source = np.load(args.fields)
    planes = source['feature_standing_detail']
    wet = np.isfinite(planes)
    labels = connected_standing_pool_labels(planes, wet, source['feature_terrain_flips'])
    ids = np.arange(1, int(labels.max()) + 1)
    pixels = np.flatnonzero(wet)
    seeds = np.full(len(ids)+1, planes.size, np.int64)
    np.minimum.at(seeds, labels.ravel()[pixels], pixels)
    season = ndimage.maximum(source['season2'], labels, ids)
    tide = ndimage.maximum(source['tidal2'], labels, ids)
    stage = stage_range()
    dry, low_tide = stage['drySeasonAmplitudeM'], stage['lowTideAmplitudeM']
    combined = ndimage.maximum(source['season2']*dry + source['tidal2']*low_tide, labels, ids)
    if np.any(abs(season*dry + tide*low_tide - combined) > 1e-5):
        raise ValueError('Separate pool response maxima would change a combined low-water extremum')
    report = {
        'schemaVersion': 1, 'gridSize': planes.shape[0],
        'sourceCheckpoint': args.source_checkpoint,
        'sourceFieldsSha256': hashlib.sha256(args.fields.read_bytes()).hexdigest(),
        'terrainOverlaySha256': str(source['terrain_overlay_sha256']),
        'routingAuditSha256': str(source['routing_audit_sha256']),
        'method': 'Maximum existing responses over each native-edge-connected equal standing plane; combined low-water extremum verified unchanged',
        'pools': [{'nativeSeed': int(seeds[i]), 'planeM': float(planes.flat[seeds[i]]),
                   'seasonResponse': float(season[i-1]), 'tideResponse': float(tide[i-1])} for i in ids],
        'lowAmplitudes': {'seasonM': dry, 'tideM': low_tide},
    }
    args.out.write_text(json.dumps(report, separators=(',', ':'))+'\n')
    print(json.dumps({'pools': len(ids), 'out': str(args.out)}))


if __name__ == '__main__':
    main()
