"""Reconsider reach exclusions after their shared downstream cause is removed."""
import heapq
import numpy as np


def restore_feasible_reaches(edges, edge_owner, keep, lower, cap, minimum):
    """Return a maximal feasible edge set without altering terrain or bounds.

    A simultaneous rejection can remove both an obstructed reach and an
    upstream reach that only failed because of it. Once the obstructed reach
    is excluded, retain the upstream water wherever the full graph permits.
    Adding edges only raises required heads, so one deterministic pass suffices.
    """
    keep, minimum = keep.copy(), minimum.copy()
    predecessors = [[] for _ in lower]
    for upstream, downstream in edges[keep]:
        predecessors[downstream].append(int(upstream))
    restored = []
    for owner in sorted(set(edge_owner[~keep].tolist())):
        indices = np.flatnonzero((edge_owner == owner) & ~keep)
        nodes = np.unique(edges[indices])
        if np.any(minimum[nodes] > cap[nodes]+.0001):
            continue
        for upstream, downstream in edges[indices]:
            predecessors[downstream].append(int(upstream))
        previous, queue = {}, []
        def raise_head(node, value):
            if minimum[node] < value:
                previous.setdefault(int(node), minimum[node])
                minimum[node] = value
                heapq.heappush(queue, (-float(value), int(node)))
        for upstream, downstream in edges[indices]:
            raise_head(upstream, minimum[downstream])
        feasible = True
        while queue:
            negative, node = heapq.heappop(queue)
            value = -negative
            if value < minimum[node]:
                continue
            if value > cap[node]+.0001:
                feasible = False
                break
            for upstream in predecessors[node]:
                raise_head(upstream, value)
        if feasible:
            keep[indices] = True
            restored.append(owner)
        else:
            for node, value in previous.items():
                minimum[node] = value
            for upstream, downstream in edges[indices[::-1]]:
                assert predecessors[downstream].pop() == upstream
    return keep, restored
