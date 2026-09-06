"""Explicit upper/lower stage bounds shared by compiled geometry and runtime."""
import math

DEFAULT_STAGE_RANGE = dict(tidalAmplitudeM=.5, seasonalAmplitudeM=1.4,
                           lowTideAmplitudeM=.5, drySeasonAmplitudeM=.28)


def stage_range(value=None):
    result = dict(DEFAULT_STAGE_RANGE if value is None else value)
    if set(result) != set(DEFAULT_STAGE_RANGE) or any(
            isinstance(v, bool) or not isinstance(v, (int, float)) or
            not math.isfinite(v) or v < 0 for v in result.values()):
        raise ValueError('Stage range requires four finite nonnegative amplitudes')
    return result


def access_bounds(stage):
    return (min(-2., -stage['lowTideAmplitudeM'] - stage['drySeasonAmplitudeM'] - .1),
            max(2., stage['tidalAmplitudeM'] + stage['seasonalAmplitudeM'] + .1))
