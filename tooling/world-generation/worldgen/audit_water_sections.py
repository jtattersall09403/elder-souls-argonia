"""Quantified native channel width, flood closure and reversible repair audit."""

import argparse
from collections import Counter
import json
from pathlib import Path
import numpy as np
from .water_cross_sections import load_water_metadata


def connected_width(point, stage=0.):
    section = point['crossSection']
    centre = next(i for i, sample in enumerate(section) if sample['offsetM'] == 0)
    if section[centre]['accessOffsetM'] > stage:
        return 0.
    width = 0.
    for ray in (section[centre::-1], section[centre:]):
        end = abs(ray[-1]['offsetM'])
        for a, b in zip(ray, ray[1:]):
            if b['accessOffsetM'] > stage:
                t = (stage - a['accessOffsetM']) / max(b['accessOffsetM'] - a['accessOffsetM'], 1e-12)
                end = abs(a['offsetM'] + t * (b['offsetM'] - a['offsetM']))
                break
        width += end
    return width


def report(meta):
    groups = {}
    boundary = Counter()
    wet_owner_ends = Counter()
    samples = points = 0
    for ribbon in meta['ribbons']:
        previous = None
        for point in ribbon['points']:
            points += 1
            section = point['crossSection']
            samples += len(section)
            width = connected_width(point)
            maximum = 1.4 * point['seasonResponse'] + .5 * point['tideResponse']
            expanded = connected_width(point, maximum)
            grade = (abs(previous['y'] - point['y']) / max(np.hypot(
                previous['x'] - point['x'], previous['z'] - point['z']), 1e-6)) if previous else 0
            bands = [f"band{ribbon['riverBand']}", 'province']
            if previous:
                bands.append('steep' if grade >= .1 else 'moderate' if grade >= .02 else 'gentle')
            if 1820 <= point['x'] <= 2420 and 140 <= point['z'] <= 790:
                bands.append('owner-repro-southwest')
            for group in bands:
                groups.setdefault(group, []).append((width, expanded, point['y'] - point['groundM']))
            for kind, edge in zip(point['boundaryKinds'], (section[0], section[-1])):
                boundary[kind] += 1
                if edge['accessOffsetM'] < 0:
                    wet_owner_ends[kind] += 1
            previous = point
    return {'ribbons': len(meta['ribbons']), 'points': points, 'crossSectionSamples': samples,
            'boundaryKinds': dict(boundary), 'baseWetBoundaryKinds': dict(wet_owner_ends),
            'groups': {key: {'points': len(values), 'medianBaseWidthM': round(float(np.median(values, axis=0)[0]), 4),
                'medianMaximumStageWidthM': round(float(np.median(values, axis=0)[1]), 4),
                'baseWidthUnderHalfMetre': sum(value[0] < .5 for value in values),
                'minimumCentreDepthM': round(min(value[2] for value in values), 6)}
                for key, values in sorted(groups.items())}}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('water_dir', type=Path)
    parser.add_argument('--previous-overlay', type=Path)
    args = parser.parse_args()
    path = args.water_dir / 'water-meta.json'
    result = report(load_water_metadata(args.water_dir))
    result['metadataBytes'] = path.stat().st_size
    if args.previous_overlay:
        before = json.loads(args.previous_overlay.read_text())
        after = json.loads((args.water_dir / 'water-bed-overlay.json').read_text())
        old = {index: (height, original) for index, height, original in before['changes']}
        new = {index: (height, original) for index, height, original in after['changes']}
        result['repairComparison'] = {'previousCells': len(old), 'newCells': len(new),
            'removedCells': len(old.keys() - new.keys()), 'addedCells': len(new.keys() - old.keys()),
            'lessLoweredCells': sum(index in new and new[index][0] > value[0] + 1e-5 for index, value in old.items()),
            'previousSumLoweringM': sum(original - height for height, original in old.values()),
            'newSumLoweringM': sum(original - height for height, original in new.values())}
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
