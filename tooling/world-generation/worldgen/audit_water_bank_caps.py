"""Trace narrow-channel heads back to their actual hydraulic bank constraint."""
import argparse
import json
from pathlib import Path
import numpy as np
from scipy.spatial import cKDTree
from .compile_chunks import DEFAULT_HEIGHTS
from .compile_water import compute
from .terrain_triangles import derive_channel_diagonal_flips
from .water_cross_sections import load_water_metadata
from .audit_water_sections import connected_width
from .scale import RAW_METRES_PER_SAMPLE as MPP


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('water_dir', type=Path)
    parser.add_argument('--orientation', required=True, type=Path)
    parser.add_argument('--out', required=True, type=Path)
    args = parser.parse_args()
    meta = load_water_metadata(args.water_dir)
    selected = [(r['id'], p) for r in meta['ribbons'] for p in r['points']
                if 1820 <= p['x'] <= 2420 and 140 <= p['z'] <= 790
                and p['boundaryKinds'] == ['terrain-bank', 'terrain-bank'] and connected_width(p) < .5]
    del meta
    original = np.load(DEFAULT_HEIGHTS)
    ground = original.copy()
    for index, height, _ in json.loads((args.water_dir / 'water-bed-overlay.json').read_text())['changes']:
        ground.flat[index] = height
    hydrology = np.load(DEFAULT_HEIGHTS.parent.parent / 'hydrology-pass1.npz')
    flips, _ = derive_channel_diagonal_flips(original, hydrology['rivers'], hydrology['flow_to'])
    result = compute(hydrology['conditioned'].astype(np.float32), ground, hydrology, profiles_only=True,
                     bank_ground=original, terrain_flips=flips, orientation_levels=np.load(args.orientation))
    tree = cKDTree(result['points'] * MPP)
    detail = result['diagnostics']
    rows = []
    for identifier, point in selected:
        distance, index = tree.query([point['z'], point['x']])
        if distance > .001:
            raise ValueError('Audit point does not match the solved native station')
        controller = detail['maximumOrigin'][index]
        rows.append({'id': identifier, 'x': point['x'], 'z': point['z'], 'index': int(index),
            'bedM': float(detail['bed'][index]), 'actualHeadM': float(result['levels'][index]),
            'desiredDepthM': float(result['desired_levels'][index] - detail['bed'][index]),
            'localBankClearanceM': float(detail['measuredBankCap'][index] - detail['bed'][index]),
            'effectiveLocalCapM': float(detail['bankCap'][index]),
            'propagatedMaximumM': float(detail['maximum'][index]),
            'controller': {'index': int(controller),
                'x': float(result['points'][controller, 1] * MPP),
                'z': float(result['points'][controller, 0] * MPP),
                'bankCapM': float(detail['bankCap'][controller]),
                'measuredBankCapM': float(detail['measuredBankCap'][controller]),
                'bedM': float(detail['bed'][controller])}})
    args.out.write_text(json.dumps(rows, indent=2))
    print(json.dumps(rows, indent=1))


if __name__ == '__main__':
    main()
