"""Bounded physical-water screening shared by coverage diagnostics.

Standing fields can establish candidate inundation, never final mesh coverage.
A flowing raster is only a proxy: keep it unverified until explicit channel
geometry has been checked. These results must not be published as map truth.
"""

import numpy as np
from .water_stage import stage_range


COVERAGE_CLASSES = ('unsupported', 'standing-field-wet', 'standing-depth-shortfall',
                    'standing-access-blocked', 'flowing-geometry-unverified')


def stage_samples(stage=None):
    bounds = stage_range(stage)
    return {'low': (-bounds['lowTideAmplitudeM'], -bounds['drySeasonAmplitudeM']),
            'base': (0., 0.),
            'maximum': (bounds['tidalAmplitudeM'], bounds['seasonalAmplitudeM'])}


def require_compiled_stage(requested, compiled):
    """Never reinterpret a flood's unvisited sentinel as a higher-stage sill."""
    requested, compiled = stage_range(requested), stage_range(compiled)
    if any(requested[key] > compiled[key] for key in requested):
        raise ValueError('Requested stage exceeds captured field bounds; compile fresh fields first')
    return requested


def screen_field_tile(ground, level, access, season_response, tide_response, support_kind, stage=None):
    """Classify a tile with the runtime's still-water depth/access thresholds.

    Bit0/1/2 of standing_stage_bits are low/base/maximum candidate wetness.
    Classification describes maximum stage. Unsupported and flowing samples
    deliberately receive no standing bits, regardless of their raster depth.
    """
    arrays = [np.asarray(v) for v in (ground, level, access, season_response, tide_response, support_kind)]
    if any(v.shape != arrays[0].shape for v in arrays):
        raise ValueError('Water coverage fields must share one grid')
    ground, level, access, season, tide, kind = arrays
    if not np.isin(kind, [0, 128, 255]).all():
        raise ValueError('Unknown water support kind')
    supported = kind != 0
    if any(not np.isfinite(v[supported]).all() for v in arrays[:5]):
        raise ValueError('Supported coverage fields must be finite')
    if np.any(supported & ((season < 0) | (season > 1) | (tide < 0) | (tide > 1))):
        raise ValueError('Water responses must lie between zero and one')
    standing = kind == 255
    bits = np.zeros(kind.shape, np.uint8)
    classes = np.zeros(kind.shape, np.uint8)
    classes[kind == 128] = 4
    for bit, (name, (tide_stage, season_stage)) in enumerate(stage_samples(stage).items()):
        offset = tide_stage * tide + season_stage * season
        deep = level + offset - ground > .004
        accessible = access <= offset + .001
        wet = standing & deep & accessible
        bits[wet] |= 1 << bit
        if name == 'maximum':
            classes[standing & ~deep] = 2
            classes[standing & deep & ~accessible] = 3
            classes[wet] = 1
    return bits, classes
