"""Identify our cuts that open lower outlets from retained source impoundments."""
import numpy as np
from collections import deque
from scipy import ndimage
from .terrain_triangles import TERRAIN_NEIGHBOURS,TERRAIN_CONNECTIVITY
from .terrain_triangles import terrain_weights

# A millimetre-scale breach can connect two pools with centimetres of
# differing flow head. This is numerical tolerance, not a permitted breach.
SPILL_EPSILON_M=1e-4


def retained_impoundment_domains(original,levels,potential,flips=None):
    """Include original shallow/dry sill fringe of each retained impoundment."""
    domain=np.isfinite(levels)&(levels>original+.01)&(potential>original+.02)
    boundary=domain&~ndimage.binary_erosion(domain,structure=TERRAIN_CONNECTIVITY)
    queue=deque(zip(*np.nonzero(boundary)))
    height,width=original.shape
    while queue:
        y,x=queue.popleft();spill=float(potential[y,x])
        neighbors=TERRAIN_NEIGHBOURS if flips is None else (
            (-1,-1),(-1,0),(-1,1),(0,-1),(0,1),(1,-1),(1,0),(1,1))
        for dy,dx in neighbors:
            ny,nx=y+dy,x+dx
            if not(0<=ny<height and 0<=nx<width) or domain[ny,nx]:continue
            if dy and dx and flips is not None and bool(flips[min(y,ny),min(x,nx)])!=(dy==dx):continue
            # Equal original potential is the impoundment/sill plateau.
            # Never cross into a lower draining valley or a higher basin.
            if abs(float(potential[ny,nx])-spill)>1e-5 or original[ny,nx]>spill+1e-5:continue
            domain[ny,nx]=True;queue.append((ny,nx))
    return domain


def immutable_retaining_lower_bounds(original,levels,potential,flips=None):
    """Native support floors preventing new damage to any retained pool.

    Existing sill vertices cannot move below their original height. Higher
    retaining vertices may never move below the original plane plus the
    existing5mm containment tolerance. Interior pool floors are unconstrained
    here; their channel requirements are evaluated separately.
    """
    domain=retained_impoundment_domains(original,levels,potential,flips)
    rows,cols=np.nonzero(domain);height,width=original.shape
    source_spill=potential[rows,cols].astype(float)
    source_head=np.where(np.isfinite(levels[rows,cols]),levels[rows,cols],source_spill)
    lower=np.full(original.shape,-np.inf,np.float32)
    neighbours=TERRAIN_NEIGHBOURS if flips is None else (
        (-1,-1),(-1,0),(-1,1),(0,-1),(0,1),(1,-1),(1,0),(1,1))
    for dy,dx in neighbours:
        ny,nx=rows+dy,cols+dx
        valid=(ny>=0)&(nx>=0)&(ny<height)&(nx<width)
        selected=np.flatnonzero(valid)
        if dy and dx and flips is not None:
            selected=selected[flips[np.minimum(rows[selected],ny[selected]),
                                     np.minimum(cols[selected],nx[selected])]==(dy==dx)]
        y,x=ny[selected],nx[selected]
        crest=original[y,x]>=source_spill[selected]-1e-5
        selected=selected[crest];y,x=ny[selected],nx[selected]
        bound=np.minimum(original[y,x],np.maximum(source_spill[selected],source_head[selected]+.005))
        np.maximum.at(lower,(y,x),bound)
    return lower


def retaining_spill_cuts(original,reference_levels,reference_potential,current_potential,changes,flips=None):
    """Audit all retained pools, including currently constraint-clean ones.

    A candidate must cross a real original retaining rim AND have an actual
    current lower-potential route out. Interior bed corrections and cuts
    remaining above the original spill are not retaining-rim restorations.
    """
    height,width=original.shape
    retained=retained_impoundment_domains(original,reference_levels,reference_potential,flips)
    records=[]
    for index,corrected,previous in changes:
        y,x=divmod(int(index),width)
        if abs(float(original[y,x])-previous)>1e-5:raise ValueError('Repair does not match original terrain')
        evidence=[]
        neighbors=TERRAIN_NEIGHBOURS if flips is None else (
            (-1,-1),(-1,0),(-1,1),(0,-1),(0,1),(1,-1),(1,0),(1,1))
        for dy,dx in neighbors:
            ny,nx=y+dy,x+dx
            if not(0<=ny<height and 0<=nx<width) or not retained[ny,nx]:continue
            if dy and dx and flips is not None and bool(flips[min(y,ny),min(x,nx)])!=(dy==dx):continue
            spill=float(reference_potential[ny,nx])
            if (previous>=spill-1e-5 and corrected<spill-SPILL_EPSILON_M and
                    current_potential[y,x]<spill-SPILL_EPSILON_M and
                    current_potential[ny,nx]<spill-SPILL_EPSILON_M):
                evidence.append({'retainedNativeIndex':int(ny*width+nx),'originalSpillM':spill,
                    'originalPoolHeadM':float(reference_levels[ny,nx]) if np.isfinite(reference_levels[ny,nx]) else None,
                    'currentSpillM':float(current_potential[ny,nx])})
        if evidence:
            records.append({'nativeIndex':int(index),'fromM':float(corrected),'toM':float(previous),
                            'originalPoolEvidence':evidence})
    return records


def unnecessary_pool_floor_cuts(original, corrected, reference_levels, reference_potential,
                                drained_potential, current_levels, current_potential, changes,
                                coordinates, water_heads, minimum_depths, flips=None):
    """Undo our excavation of accidentally drained, now recovered pool floors.

    This is deliberately narrower than restoring every submerged correction:
    an original retained pool must have been drained by our earlier overlay,
    and its original potential and plane must now be recovered. Original floor
    must remain below the recovered spill, so restoration cannot change that
    drainage potential. Valid channel/receiving geometry keeps every exact
    native corner necessary for its existing physical depth.
    """
    candidates=[];excluded=[]
    for index,height,previous in changes:
        index=int(index)
        if abs(float(original.flat[index])-previous)>1e-5:
            raise ValueError('Repair does not match original terrain')
        spill=float(reference_potential.flat[index]);head=float(reference_levels.flat[index])
        if not (np.isfinite(head) and spill>previous+.02 and head>previous+.02 and
                drained_potential.flat[index]<spill-SPILL_EPSILON_M):
            continue
        row={'nativeIndex':index,'fromM':float(height),'toM':float(previous),
             'originalPoolHeadM':head,'originalSpillM':spill}
        if (abs(float(current_potential.flat[index])-spill)>1e-4 or
                not np.isfinite(current_levels.flat[index]) or
                abs(float(current_levels.flat[index])-head)>.005):
            excluded.append({**row,'reason':'original-pool-not-recovered'})
        else:candidates.append(row)
    restored,needed=channel_safe_restorations(original,corrected,candidates,coordinates,
                                             water_heads,minimum_depths,flips)
    return restored,excluded+needed


def channel_safe_restorations(original,corrected,candidates,coordinates,water_heads,minimum_depths,flips=None):
    """Partition exact original-height restorations by valid flow support."""
    trial=corrected.copy()
    for row in candidates:trial.flat[row['nativeIndex']]=row['toM']
    rows,cols,weights=terrain_weights(original.shape,coordinates,flips)
    old_bed=np.sum(corrected[rows,cols]*weights,axis=0)
    new_bed=np.sum(trial[rows,cols]*weights,axis=0)
    # Do not ask restoration to fix an existing failed depth constraint, but
    # never worsen one. Valid geometry retains its actual semantic depth.
    maximum_bed=np.maximum(old_bed,np.asarray(water_heads)-np.asarray(minimum_depths))
    violations=new_bed>maximum_bed+1e-5
    protected={}
    for probe in np.flatnonzero(violations):
        for y,x,weight in zip(rows[:,probe],cols[:,probe],weights[:,probe]):
            if weight>1e-9:
                protected.setdefault(int(y*original.shape[1]+x),[]).append(int(probe))
    restored=[];excluded=[]
    for row in candidates:
        probes=protected.get(row['nativeIndex'])
        if probes:excluded.append({**row,'reason':'active-channel-depth-support','probeIndices':probes})
        else:restored.append(row)
    return restored,excluded
