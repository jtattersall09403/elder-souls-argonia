"""Close a retained flat pool over its real, connected impoundment fringe."""
import heapq
import numpy as np
from scipy import ndimage
from .terrain_triangles import TERRAIN_NEIGHBOURS


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
