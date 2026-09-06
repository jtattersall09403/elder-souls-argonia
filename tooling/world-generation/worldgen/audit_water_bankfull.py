"""Read-only native cross-section diagnosis of peak-water shortfalls.

Uses the accepted solver cache, never recomputes flood domains or edits terrain.
The measured-bank and painted-corridor checks are distinct: distance-only
landcover can paint beyond the actual channel onto a high valley side. Neither
station sampling nor bank-cap statistics certify full-area inundation.
"""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
from .water_boundaries import channel_cross_section
from .water_stage import stage_range


def section_peak_requirement(ground, point, normal, level, half_extent, metres_per_pixel, flips=None):
    """Highest connected barrier on BOTH sides, including triangle creases."""
    section, _ = channel_cross_section(ground, point, normal, half_extent, level,
        metres_per_pixel, maximum_offset=max(0., float(np.max(ground) - level + 1)), terrain_flips=flips)
    return max(0., max(sample['accessOffsetM'] for sample in section))


def summarize(required, available):
    deficit = np.maximum(0., np.asarray(required) - available)
    return {'stationCount': len(deficit), 'shortfallCount': int(np.sum(deficit > .001)),
            'requiredRisePercentilesM': dict(zip(('p50', 'p90', 'p99', 'maximum'),
                np.round(np.percentile(required, [50, 90, 99, 100]), 4).tolist())) if len(deficit) else {},
            'maxShortfallM': round(float(np.max(deficit, initial=0)), 4)}


def main():
    from .compile_chunks import DEFAULT_HEIGHTS
    from .landcover import BAND_HALF_W, SILT, RIVER_MUD, BANK_WET
    from .scale import RAW_M, TUNE
    from .terrain_triangles import derive_channel_diagonal_flips
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('cache', type=Path)
    parser.add_argument('overlay', type=Path)
    parser.add_argument('--out', type=Path, required=True)
    parser.add_argument('--stage-range', type=Path)
    args = parser.parse_args()
    stage = stage_range(json.loads(args.stage_range.read_text()) if args.stage_range else None)
    cache = np.load(args.cache)
    overlay_hash = hashlib.sha256(args.overlay.read_bytes()).hexdigest()
    source_hash = hashlib.sha256(DEFAULT_HEIGHTS.read_bytes()).hexdigest()
    if str(cache['terrain_overlay_sha256']) != overlay_hash or str(cache['terrain_source_sha256']) != source_hash:
        raise ValueError('Cache must match both accepted overlay and immutable terrain')
    ground = np.load(DEFAULT_HEIGHTS).copy()
    hydro = np.load(DEFAULT_HEIGHTS.parent.parent / 'hydrology-pass1.npz')
    flips, _ = derive_channel_diagonal_flips(ground, hydro['rivers'], hydro['flow_to'])
    for index, height, _ in json.loads(args.overlay.read_text())['changes']:
        ground.flat[index] = height
    cells = cache['cell_indices']
    bands = hydro['rivers'].ravel()[cells]
    levels = cache['levels'][:len(cells)]
    points = cache['points'][:len(cells)]
    normals = cache['diagnostic_bankNormals'][:len(cells)]
    # This existing bound is the LOWER retaining bank; it is a useful lower
    # bound on fullness, not proof that the opposite bank is submerged.
    bank_rise = np.maximum(0., cache['diagnostic_measuredBankCap'][:len(cells)] + .005 - levels)
    salinity = hydro['salinity'].ravel()[cells]
    tide = np.clip((salinity - .02) / .13, 0, 1)
    tide = tide * tide * (3 - 2 * tide)
    available = stage['seasonalAmplitudeM'] * (salinity < .4) + stage['tidalAmplitudeM'] * tide
    # Only actual river bands use this paint grammar. Rivulets and standing
    # pools must be checked against their separate authored footprints.
    selected = np.flatnonzero((bands > 0) & cache['active'][:len(cells)] & ~cache['diagnostic_falling'][:len(cells)])
    painted_rise = np.zeros(len(cells))
    hydric_rise = np.zeros(len(cells))
    hydric_found = np.zeros(len(cells), bool)
    landcover = np.load(DEFAULT_HEIGHTS.parent / 'landcover-i16.npy', mmap_mode='r')
    if landcover.shape != ground.shape:
        raise ValueError('Authored landcover must match native terrain')
    # Cache the ground maximum: copying/scanning16M samples per section
    # would turn a bounded diagnostic into a province-sized repeated task.
    peak_bound = float(ground.max()) + 1
    for i in selected:
        extent = (BAND_HALF_W[int(bands[i])] + 26 * TUNE) / RAW_M
        section, _ = channel_cross_section(ground, points[i], normals[i], extent,
            float(levels[i]), RAW_M, maximum_offset=peak_bound, terrain_flips=flips)
        painted_rise[i] = max(0., max(s['accessOffsetM'] for s in section))
        # These are actual stored material IDs, after subsequent shoreline
        # and slope rules, not just the earlier distance-stencil proposal.
        offsets = np.array([s['offsetM'] for s in section]) / RAW_M
        xy = np.rint(points[i, :, None] + normals[i, :, None] * offsets).astype(int)
        xy = np.clip(xy, 0, np.array(ground.shape)[:, None] - 1)
        hydric = np.isin(landcover[tuple(xy)], (SILT, RIVER_MUD, BANK_WET))
        hydric_found[i] = hydric.any()
        hydric_rise[i] = max(0., max((s['accessOffsetM'] for s, hit in zip(section, hydric) if hit), default=0.))
    groups = {}
    for name, mask in [('all', np.ones(len(cells), bool)), ('lowland', levels < 14), ('upland', levels >= 14)]:
        ids = selected[mask[selected]]
        groups[name] = {'lowerRetainingBank': summarize(bank_rise[ids], available[ids]),
                        'paintedCorridorCrossSection': summarize(painted_rise[ids], available[ids]),
                        'storedSiltRiverMudWetBank': summarize(hydric_rise[ids[hydric_found[ids]]], available[ids[hydric_found[ids]]])}
    worst = selected[np.argsort(-(painted_rise[selected] - available[selected]), kind='stable')[:20]]
    report = {'schemaVersion': 1, 'terrainOverlaySha256': overlay_hash, 'terrainSourceSha256': source_hash,
        'landcoverSha256': hashlib.sha256((DEFAULT_HEIGHTS.parent / 'landcover-i16.npy').read_bytes()).hexdigest(),
        'stageRange': stage, 'scope': 'Active non-falling river stations; transverse native terrain, not whole-area coverage certification. Painted extent is the distance-only band stencil around the routed station.',
        'groups': groups, 'worstPaintedSections': [dict(source=int(i), xM=round(float(points[i, 1] * RAW_M), 3),
            zM=round(float(points[i, 0] * RAW_M), 3), baseM=round(float(levels[i]), 4),
            requiredRiseM=round(float(painted_rise[i]), 4), availableRiseM=round(float(available[i]), 4)) for i in worst]}
    args.out.write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'groups': groups, 'out': str(args.out)}))


if __name__ == '__main__':
    main()
