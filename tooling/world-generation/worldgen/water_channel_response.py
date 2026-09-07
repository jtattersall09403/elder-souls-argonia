"""Shared longitudinal stage response for exported channels and peak budgets."""
import numpy as np


def load_seasonal_profile(path):
    """Read a versioned, non-pickled proposal; compute validates its graph."""
    with np.load(path, allow_pickle=False) as data:
        if (data['schemaVersion'].shape != () or data['schemaVersion'].dtype.kind not in 'iu'
                or data['schemaVersion'].item() != 1):
            raise ValueError('Unsupported seasonal profile schema')
        return {key: data[key] for key in ('points', 'links', 'original_links',
                                           'candidates', 'peak_depth_budget')}


def channel_path_response(points, path, values, anchors=None):
    """Interpolate only between endpoints and actual standing-pool contacts."""
    path = np.asarray(path, dtype=int)
    distances = np.r_[0., np.cumsum(np.linalg.norm(np.diff(points[path], axis=0), axis=1))]
    fractions = distances / max(float(distances[-1]), 1e-9)
    response = values[path[0]] * (1 - fractions) + values[path[-1]] * fractions
    if anchors is not None:
        pinned_response = np.asarray(anchors)[path]
        pinned = np.isfinite(pinned_response)
        if np.any((pinned_response[pinned] < 0) | (pinned_response[pinned] > 1)):
            raise ValueError('Standing response anchors must be between zero and one')
        response[pinned] = pinned_response[pinned]
        pinned[[0, -1]] = True
        response = np.interp(distances, distances[pinned], response[pinned])
    if not np.isfinite(response).all() or np.any((response < 0) | (response > 1)):
        raise ValueError('Channel response must be finite and between zero and one')
    # Match the emitted coefficients, including their serialization precision.
    return np.array([round(float(value), 6) for value in response])


def exclusive_peak_budgets(points, links, original_links, candidates,
                           season_response, tide_response, stage,
                           season_anchors=None, tide_anchors=None, maximum_budget=None):
    """Use actual peak offsets only on nodes exclusive to selected reaches.

Callers select already rejected authored seasonal rivulets. Every node used by
another reach retains a zero budget; shared candidate nodes use the smaller
of their actual exported offsets. This does not certify fresh field stability.
"""
    from .water_stage import stage_range
    stage = stage_range(stage)
    candidates = frozenset(candidates)
    if any(i < 0 or i >= len(original_links) or original_links[i] < 0 for i in candidates):
        raise ValueError('Seasonal candidate must identify an existing authored reach')
    if maximum_budget is not None and (not np.isfinite(maximum_budget) or maximum_budget < 0):
        raise ValueError('Maximum seasonal budget must be finite and nonnegative')
    budgets = np.full(len(points), np.inf)
    protected = np.zeros(len(points), bool)
    for source, target in enumerate(original_links):
        if target < 0:
            continue
        path, seen = [source], {source}
        while path[-1] != target:
            following = int(links[path[-1]])
            if following < 0 or following >= len(points) or following in seen:
                raise ValueError('Broken native seasonal reach')
            path.append(following)
            seen.add(following)
        if source not in candidates:
            protected[path] = True
            continue
        season = channel_path_response(points, path, season_response, season_anchors)
        tide = channel_path_response(points, path, tide_response, tide_anchors)
        offset = stage['seasonalAmplitudeM'] * season + stage['tidalAmplitudeM'] * tide
        if maximum_budget is not None:
            offset = np.minimum(offset, maximum_budget)
        np.minimum.at(budgets, path, offset)
    budgets[protected | ~np.isfinite(budgets)] = 0.
    return budgets


def validate_seasonal_profile(profile, points, links, original_links, rejected, wetland_rivulets):
    """Bind an explicit proposal to this graph and protect every other reach."""
    for key, value in (('points', points), ('links', links), ('original_links', original_links)):
        if not np.array_equal(profile[key], value):
            raise ValueError(f'Seasonal profile has stale {key}')
    candidates = frozenset(map(int, profile['candidates']))
    if not candidates.issubset(rejected) or any(not wetland_rivulets[i] for i in candidates):
        raise ValueError('Seasonal profiles require rejected authored wetland rivulets')
    budget = np.asarray(profile['peak_depth_budget'], float)
    if budget.shape != (len(points),) or not np.isfinite(budget).all() or np.any(budget < 0):
        raise ValueError('Seasonal profile requires finite nonnegative native node budgets')
    # Unit response isolates node membership from climate values here. The
    # completed native fields subsequently verify the actual stage budgets.
    allowed = exclusive_peak_budgets(points, links, original_links, candidates,
        np.ones(len(original_links)), np.zeros(len(original_links)),
        {'seasonalAmplitudeM': 1., 'tidalAmplitudeM': 0.,
         'drySeasonAmplitudeM': 0., 'lowTideAmplitudeM': 0.}) > 0
    if np.any(budget[~allowed] > 0):
        raise ValueError('Seasonal profile relaxes a permanent or shared channel node')
    return candidates, budget
