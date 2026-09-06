"""Joint bounded native-bed correction for one fixed-incident-head reach."""
import numpy as np
from scipy.optimize import linprog
from .terrain_triangles import terrain_weights,sample_terrain


def coupled_reach_correction(original,ground,points,heads,depths,normals,radii,
                             pinned=None,falling=None,protected=(),maximum_lowering=5.,terrain_flips=None,
                             crest_budget_fraction=1.,external_banks=(),retaining_lower_bounds=None,
                             head_links=None,incident_heads=(),fix_endpoints=True):
    """Return minimal indexed cuts, or None when this actual reach cannot fit.

Only corners supporting existing routed centre stations may change. Water
heads obey longitudinal monotonicity and both real bank-crest equations;
the incident end heads remain fixed. Existing protected retaining crests
cannot change. A caller must subsequently validate the full hydraulic graph.
"""
    points=np.asarray(points,float);heads=np.asarray(heads,float)
    normals=np.asarray(normals,float)
    count=len(points)
    rows,cols,weights=terrain_weights(ground.shape,points.T,terrain_flips)
    flat=rows*ground.shape[1]+cols
    indices=np.unique(flat[weights>1e-6])
    lookup={int(index):i for i,index in enumerate(indices)}
    variables=len(indices);total=variables+count+1;maximum_index=total-1
    protected=set(protected)
    existing=original.ravel()[indices].astype(float)-ground.ravel()[indices]
    upper=np.maximum(0.,maximum_lowering-existing)
    if retaining_lower_bounds is not None:
        upper=np.minimum(upper,np.maximum(0.,ground.ravel()[indices]-retaining_lower_bounds.ravel()[indices]))
    upper[[int(index) in protected for index in indices]]=0.
    # The routine limit governs NEW excavation. An already reviewed deeper
    # correction may remain unchanged; forcing the objective's maximum below
    # that existing depth makes even a zero-cut solution falsely infeasible.
    maximum_existing=float(np.max(existing,initial=0.))
    bounds=[(0.,float(limit)) for limit in upper]+[(None,None)]*count+[(0.,max(maximum_lowering,maximum_existing))]
    if fix_endpoints:
        bounds[variables]=(float(heads[0]),float(heads[0]))
        bounds[variables+count-1]=(float(heads[-1]),float(heads[-1]))
    pinned=np.zeros(count,bool) if pinned is None else np.asarray(pinned,bool)
    falling=np.zeros(count,bool) if falling is None else np.asarray(falling,bool)
    for i in np.flatnonzero(pinned):bounds[variables+i]=(float(heads[i]),float(heads[i]))
    matrix=[];rhs=[]
    for i,old in enumerate(existing):
        row=np.zeros(total);row[i]=1.;row[maximum_index]=-1.
        matrix.append(row);rhs.append(-float(old))
    fixed_neighbors=[]
    def constrain_banks(point,normal,radius,node=None,fixed_head=None):
        distances=np.minimum(radius*2,np.arange(.25,radius*2+.25,.25))
        shared=False
        for sign in (-1,1):
            positions=point[:,None]+normal[:,None]*distances*sign
            banks=sample_terrain(ground,positions,terrain_flips)
            br,bc,bw=terrain_weights(ground.shape,positions,terrain_flips)
            coefficients=np.zeros((len(distances),variables))
            for sample in range(len(distances)):
                for y,x,w in zip(br[:,sample],bc[:,sample],bw[:,sample]):
                    index=int(y*ground.shape[1]+x)
                    if index in lookup:coefficients[sample,lookup[index]]+=w
            # A bed obstruction can initially be higher than the actual
            # retaining bank. Select a real crest that survives the allowed
            # centre-support cuts, not that obstruction's near-centre slope.
            crest=int(np.argmax(banks-crest_budget_fraction*(coefficients@upper)))
            if fixed_head is not None and not np.any(coefficients):continue
            shared=True
            row=np.zeros(total)
            row[:variables]=coefficients[crest]
            if node is not None:row[variables+node]=1.
            matrix.append(row);rhs.append(float(banks[crest]-.005-(fixed_head or 0.)+
                                               (1e-4 if fixed_head is not None else 0.)))
        return shared
    bed=sample_terrain(ground,points.T,terrain_flips)
    for node,point in enumerate(points):
        row=np.zeros(total)
        for index,weight in zip(flat[:,node],weights[:,node]):
            if weight>1e-6:row[lookup[int(index)]]-=weight
        row[variables+node]=-1.
        matrix.append(row);rhs.append(-float(bed[node]+(0. if pinned[node] else depths[node])))
        if falling[node] or pinned[node]:continue
        constrain_banks(point,normals[node],radii[node],node=node)
    for neighbor in external_banks:
        if constrain_banks(np.asarray(neighbor['point']),np.asarray(neighbor['normal']),
                           neighbor['radius'],fixed_head=neighbor['head']):
            fixed_neighbors.append(neighbor['node'])
    for upstream,downstream in ([(i,i+1) for i in range(count-1)] if head_links is None else head_links):
        row=np.zeros(total);row[variables+downstream]=1.;row[variables+upstream]=-1.
        matrix.append(row);rhs.append(0.)
    for node,head,is_upstream in incident_heads:
        row=np.zeros(total);row[variables+node]=1. if is_upstream else -1.
        matrix.append(row);rhs.append(float(head)*(1. if is_upstream else -1.))
    objective=np.r_[np.full(variables,1e-6),np.zeros(count),1.]
    solved=linprog(objective,A_ub=np.asarray(matrix),b_ub=np.asarray(rhs),bounds=bounds,method='highs')
    if not solved.success:return None
    reductions=np.maximum(solved.x[:variables],0.)
    return {'indices':indices,'reductions':reductions,'heads':solved.x[variables:maximum_index],
            'maximumOriginalLoweringM':float(solved.x[maximum_index]),'fixedNeighborNodes':fixed_neighbors}
