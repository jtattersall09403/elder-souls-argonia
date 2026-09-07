"""Close a retained flat pool over its real, connected impoundment fringe."""
import heapq
import numpy as np
from scipy import ndimage
from .terrain_triangles import TERRAIN_NEIGHBOURS


def connected_standing_pool_labels(levels, standing, terrain_flips=None):
    """Label equal standing planes connected by actual native terrain edges."""
    from scipy.sparse import coo_matrix
    from scipy.sparse.csgraph import connected_components
    indices = np.full(levels.shape, -1, np.int32)
    count = int(standing.sum())
    if not count:
        return np.zeros(levels.shape, np.int32)
    indices[standing] = np.arange(count, dtype=np.int32)
    edges = []
    height, width = levels.shape
    for dy, dx in ((0, 1), (1, 0), (1, 1), (1, -1)):
        a = (slice(0, height-dy), slice(max(0, -dx), min(width, width-dx)))
        b = (slice(dy, height), slice(max(0, dx), min(width, width+dx)))
        joined = standing[a] & standing[b] & (levels[a] == levels[b])
        if dy and dx:
            joined &= (terrain_flips if dx == 1 else ~terrain_flips) if terrain_flips is not None else dx == -1
        edges.append((indices[a][joined], indices[b][joined]))
    left = np.concatenate([a for a, b in edges])
    right = np.concatenate([b for a, b in edges])
    graph = coo_matrix((np.ones(len(left), np.uint8), (left, right)), shape=(count, count))
    _, labels = connected_components(graph, directed=False)
    result = np.zeros(levels.shape, np.int32)
    result[standing] = labels + 1
    return result


def standing_pool_response(response, labels, standing):
    """Give every retained pool its full response, including recovered seeds.

    The initial size-selection list is not the final set of physical pools:
    original-water preservation can recover components excluded by that list.
    """
    ids = np.unique(labels[standing])
    if not len(ids):
        return response.copy()
    if ids[0] <= 0:
        raise ValueError('Standing water requires a positive pool owner')
    values = np.zeros(int(labels.max()) + 1, np.float32)
    values[ids] = ndimage.maximum(response, labels, ids)
    result = response.copy()
    result[standing] = values[labels[standing]]
    return result


def preserve_pool_response_ranges(season, tide, labels, levels, reference):
    """Keep reviewed connected-pool ranges independent of shoreline growth."""
    if reference.get('schemaVersion') != 1 or reference.get('gridSize') != levels.shape[0]:
        raise ValueError('Pool response reference does not match the native grid')
    retained = {}
    low_caps = {}
    low = reference.get('lowAmplitudes', {'seasonM': .28, 'tideM': .5})
    for record in reference['pools']:
        seed = record['nativeSeed']
        if not isinstance(seed, int) or not 0 <= seed < levels.size:
            raise ValueError('Invalid pool response reference seed')
        owner = int(labels.flat[seed])
        if owner <= 0 or abs(float(levels.flat[seed])-record['planeM']) > 1e-4:
            raise ValueError(f'Pool response reference seed {seed} changed plane or lost standing water')
        value = (record['seasonResponse'], record['tideResponse'])
        if not all(np.isfinite(v) and 0 <= v <= 1 for v in value):
            raise ValueError('Pool response coefficients must be between zero and one')
        low_caps[owner] = max(low_caps.get(owner, 0.), value[0]*low['seasonM'] + value[1]*low['tideM'])
        retained[owner] = tuple(np.maximum(retained.get(owner, value), value))
    for owner, value in retained.items():
        # Reconnected pieces share their existing combined range. Taking
        # separate maxima must not invent a deeper combined minimum.
        if value[0]*low['seasonM'] + value[1]*low['tideM'] > low_caps[owner] + 1e-5:
            raise ValueError(f'Connected pool {owner} has incompatible reviewed low-water extrema')
    lookup = np.full((int(labels.max(initial=0))+1, 2), np.nan, np.float32)
    for owner, value in retained.items():
        lookup[owner] = value
    selected = np.isfinite(lookup[:, 0])[labels]
    season, tide = season.copy(), tide.copy()
    season[selected] = lookup[labels[selected], 0]
    tide[selected] = lookup[labels[selected], 1]
    return season, tide


def preserve_reference_pool_heads(levels,labels,potential,reference_levels,reference_potential,ground=None):
    """Repairs cannot retune a retained original pool's optional flow head."""
    if ground is not None:
        # A repaired component's size/shape cannot delete an originally
        # retained wet seed and let a new neighbour claim it. Positive raw
        # labels restrict this to real impoundments, not downstream fringes.
        recovered=((labels>0)&np.isfinite(reference_levels)&(reference_levels>ground+.01)&
                   (abs(potential-reference_potential)<1e-4))
        levels=np.where(recovered,reference_levels,levels)
    mask=(np.isfinite(levels)&np.isfinite(reference_levels)&
          (abs(potential-reference_potential)<1e-4))
    pairs=np.unique(np.column_stack([labels[mask],reference_levels[mask]]),axis=0)
    locked={};changes=[]
    for label,head in pairs:
        label=int(label)
        if label in locked and abs(locked[label]-head)>1e-4:
            sample=np.argwhere(mask&(labels==label)&(reference_levels==head))[0].tolist()
            raise ValueError(f'Corrected pool {label} merged original planes {locked[label]} and {head} at {sample}')
        locked[label]=float(head)
    indices=np.asarray(sorted(locked),int)
    previous_heads=ndimage.maximum(levels,labels,indices) if len(indices) else []
    lookup=np.full(int(labels.max())+1,np.nan,np.float32)
    for label,previous in zip(indices,previous_heads):
        head=locked[int(label)];lookup[label]=head
        if abs(previous-head)>1e-5:
            changes.append({'poolLabel':int(label),'fromM':float(previous),'toM':head})
    reference=lookup[labels]
    result=np.where(np.isfinite(levels)&np.isfinite(reference),reference,levels)
    return result,frozenset(locked),changes


def close_pool_domains(ground, levels, labels, filled, immutable_potential, terrain_flips=None, maximum_head=None):
    """Extend unchanged planes, never downstream into a lower-potential reach.

Native triangle edges establish actual connectivity. Original drainage
potential is a basin boundary, not a replacement terrain height: corrected
ground still decides wetness and crests. Existing distinct planes are barriers.
The result changes occupancy only, not baseline levels or seasonal responses.
"""
    result = levels.copy()
    owners = labels.copy()
    seeds = np.isfinite(levels)
    # A connected flat plane carries its spill through existing wet water.
    # Per-boundary-vertex potentials can be higher than the pool's sill;
    # treating them as independent spill thresholds makes closure depend on
    # which shoreline vertices survived component selection after a repair.
    ids = np.arange(1, int(labels.max(initial=0)) + 1)
    spill_by_owner = np.r_[np.inf, ndimage.minimum(np.where(seeds, filled, np.inf), labels, ids)]
    required_spill = np.where(seeds, spill_by_owner[labels], np.inf)
    boundary = seeds & ~ndimage.binary_erosion(seeds)
    queue = [(-float(levels[y,x]),float(required_spill[y,x]),int(y),int(x),int(labels[y,x]))
             for y,x in zip(*np.nonzero(boundary))]
    heapq.heapify(queue)
    h,w=ground.shape
    added=0
    while queue:
        negative,spill,y,x,owner=heapq.heappop(queue)
        if spill > required_spill[y,x] + 1e-5:
            continue
        level=-negative
        neighbours=TERRAIN_NEIGHBOURS if terrain_flips is None else (
            (-1,-1),(-1,0),(-1,1),(0,-1),(0,1),(1,-1),(1,0),(1,1))
        for dy,dx in neighbours:
            ny,nx=y+dy,x+dx
            if not (0<=ny<h and 0<=nx<w):
                continue
            occupied = np.isfinite(result[ny,nx])
            if occupied and (abs(float(result[ny,nx])-level)>1e-5 or spill >= required_spill[ny,nx]-1e-5):
                continue
            if dy and dx and terrain_flips is not None and bool(terrain_flips[min(y,ny),min(x,nx)])!=(dy==dx):
                continue
            if (ground[ny,nx] >= level-.005 or immutable_potential[ny,nx] < spill-1e-5
                    or filled[ny,nx] < spill-1e-5):
                continue
            # A depth expectation is a flowing-channel constraint, not a
            # ceiling inside an actual impoundment. Applying it to a deep
            # basin interior admitted its shallow shoulders while cutting
            # dry holes into the same connected, unchanged standing plane.
            # Real outlets still obey both drainage-potential barriers above;
            # unimpounded flowing terrain additionally retains its head cap.
            impounded = filled[ny,nx] > ground[ny,nx] + .005
            if maximum_head is not None and not impounded and level > maximum_head[ny,nx] + 1e-5:
                continue
            if not occupied:
                result[ny,nx]=level;owners[ny,nx]=owner;added+=1
            required_spill[ny,nx]=spill
            heapq.heappush(queue,(negative,spill,ny,nx,owner))
    return result,owners,added
