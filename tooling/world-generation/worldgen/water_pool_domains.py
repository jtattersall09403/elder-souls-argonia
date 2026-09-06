"""Close a retained flat pool over its real, connected impoundment fringe."""
import heapq
import numpy as np
from scipy import ndimage
from .terrain_triangles import TERRAIN_NEIGHBOURS


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
    boundary = seeds & ~ndimage.binary_erosion(seeds)
    queue = [(-float(levels[y,x]),int(y),int(x),int(labels[y,x]),float(filled[y,x]))
             for y,x in zip(*np.nonzero(boundary))]
    heapq.heapify(queue)
    h,w=ground.shape
    added=0
    while queue:
        negative,y,x,owner,spill=heapq.heappop(queue)
        level=-negative
        neighbours=TERRAIN_NEIGHBOURS if terrain_flips is None else (
            (-1,-1),(-1,0),(-1,1),(0,-1),(0,1),(1,-1),(1,0),(1,1))
        for dy,dx in neighbours:
            ny,nx=y+dy,x+dx
            if not (0<=ny<h and 0<=nx<w) or np.isfinite(result[ny,nx]):
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
            result[ny,nx]=level;owners[ny,nx]=owner;added+=1
            heapq.heappush(queue,(negative,ny,nx,owner,spill))
    return result,owners,added
