"""Shared longitudinal stage response for exported channels and peak budgets."""
import numpy as np


class SeasonalResponseBudgetError(ValueError):
    """Expose rejected fresh bounds so diagnostics need not rebuild the fields."""
    def __init__(self, nodes, requested, actual):
        self.nodes = np.asarray(nodes)
        self.actual_budget = np.asarray(actual)
        details = ', '.join(f'{i}: {requested[i]:.6f}>{actual[i]:.6f}m' for i in nodes[:8])
        super().__init__(f'Seasonal profile exceeds freshly compiled stage responses at '
                         f'{len(nodes)} native nodes (requested>available): {details}')


def reconcile_peak_budgets(requested, actual, active, expected, solve):
    """Reduce unused allowances only when the complete physical solve is identical.

Changing a standing-water donor may reduce the available upper-stage offset.
An oversized allowance is not necessarily used by the solved head. Re-solving
with the fresh bounds proves that clipping it leaves every head and accepted
reach unchanged; otherwise the caller must review another physical proposal.
"""
    exceeded = np.flatnonzero(active & (requested > actual + 1e-6))
    if not len(exceeded):
        return requested, 0
    reconciled = np.asarray(requested).copy()
    reconciled[exceeded] = actual[exceeded]
    result = solve(reconciled)
    if (any(not np.array_equal(a, b) for a, b in zip(expected[:3], result[:3]))
            or set(expected[3]) != set(result[3])):
        raise SeasonalResponseBudgetError(exceeded, requested, actual)
    return reconciled, len(exceeded)


def load_seasonal_profile(path):
    """Read a versioned, non-pickled proposal; compute validates its graph."""
    with np.load(path, allow_pickle=False) as data:
        if (data['schemaVersion'].shape != () or data['schemaVersion'].dtype.kind not in 'iu'
                or data['schemaVersion'].item() != 1):
            raise ValueError('Unsupported seasonal profile schema')
        result = {key: data[key] for key in ('points', 'links', 'original_links',
                                            'candidates', 'peak_depth_budget')}
        result['supporting_sources'] = (data['supporting_sources'] if 'supporting_sources' in data
                                        else np.array([], dtype=int))
        return result


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

Callers select explicitly reviewed authored seasonal rivulets, including any
accepted minor neighbours needed at shared junctions. Every node used by an
unselected reach retains zero budget; selected shared nodes use the smaller
actual exported offset. This does not certify fresh field stability.
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
    if (not candidates.issubset(rejected) or any(i < 0 or i >= len(original_links)
            or original_links[i] < 0 or not wetland_rivulets[i] for i in candidates)):
        raise ValueError('Seasonal profiles require rejected authored wetland rivulets')
    raw_supporters = np.asarray(profile.get('supporting_sources', []))
    if raw_supporters.ndim != 1 or (raw_supporters.size and raw_supporters.dtype.kind not in 'iu'):
        raise ValueError('Seasonal supporting sources must be integer reach IDs')
    supporters = frozenset(map(int, raw_supporters))
    if supporters & set(rejected) or any(i < 0 or i >= len(original_links)
            or original_links[i] < 0 or not wetland_rivulets[i] for i in supporters):
        raise ValueError('Seasonal supporting sources require accepted authored wetland rivulets')
    # Supporting reaches may only extend a reviewed rejected-reach group.
    # Coincident coordinates are not a junction: use the authored graph IDs.
    connected_nodes = {node for i in candidates for node in (i, int(original_links[i]))}
    pending = set(supporters)
    while pending:
        adjoining = {i for i in pending if i in connected_nodes or original_links[i] in connected_nodes}
        if not adjoining:
            raise ValueError('Seasonal supporting sources are disconnected from rejected candidates')
        connected_nodes.update(node for i in adjoining for node in (i, int(original_links[i])))
        pending -= adjoining
    selected = candidates | supporters
    budget = np.asarray(profile['peak_depth_budget'], float)
    if budget.shape != (len(points),) or not np.isfinite(budget).all() or np.any(budget < 0):
        raise ValueError('Seasonal profile requires finite nonnegative native node budgets')
    # Unit response isolates node membership from climate values here. The
    # completed native fields subsequently verify the actual stage budgets.
    allowed = exclusive_peak_budgets(points, links, original_links, selected,
        np.ones(len(original_links)), np.zeros(len(original_links)),
        {'seasonalAmplitudeM': 1., 'tidalAmplitudeM': 0.,
         'drySeasonAmplitudeM': 0., 'lowTideAmplitudeM': 0.}) > 0
    if np.any(budget[~allowed] > 0):
        raise ValueError('Seasonal profile relaxes a permanent or shared channel node')
    return selected, budget
