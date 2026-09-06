"""One coupled local-bank proposal, then one whole-graph nonregression check.

Fresh domain/spill checks are mandatory before accepting any emitted proposal.
No component is iterated against changed cached domains.
"""
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
from .compile_chunks import DEFAULT_HEIGHTS
from .terrain_triangles import terrain_weights,derive_channel_diagonal_flips
from .audit_water_routes import solve,path_indices
from .audit_water_solve import proposal_gate
from .water_reach_solver import coupled_reach_correction


def support_components(supports):
    """Components share native support, including common retaining banks."""
    parent=list(range(len(supports)));owner={}
    def root(i):
        while parent[i]!=i:
            parent[i]=parent[parent[i]];i=parent[i]
        return i
    for i,indices in enumerate(supports):
        for index in indices:
            if index in owner:parent[root(i)]=root(owner[index])
            else:owner[index]=i
    groups={}
    for i in range(len(supports)):groups.setdefault(root(i),[]).append(i)
    return list(groups.values())


def station_support(shape,point,normal,radius,flips):
    distances=np.minimum(radius*2,np.arange(.25,radius*2+.25,.25))
    samples=np.concatenate([point[:,None],point[:,None]+normal[:,None]*distances,
                            point[:,None]-normal[:,None]*distances],axis=1)
    rows,cols,weights=terrain_weights(shape,samples,flips)
    return set((rows*shape[1]+cols)[weights>1e-6].tolist())


def local_obstruction_owners(conflicts):
    """Keep every measured obstruction, not only the summary's lowest bank."""
    owners={}
    for source,conflict in conflicts.items():
        if not conflict.get('localBankConstraint') or conflict.get('obstructionPinned'):
            continue
        for node in conflict['nodeBankCaps']:
            owners.setdefault(int(node),set()).add(int(source))
    return owners


def local_reach_owners(state,conflicts,include_longitudinal=False):
    """Include intervening sills instead of freezing a rejected fallback head."""
    obstructions=local_obstruction_owners(conflicts)
    sources=set().union(*obstructions.values()) if obstructions else set()
    if include_longitudinal:
        sources.update(conflicts)
        # A downstream reach can be valid alone yet force too much head
        # into its upstream receiving bank. Include the complete recorded
        # obstruction corridor; actual standing pools remain pinned by LP.
        drainage={int(node) for conflict in conflicts.values()
                  for node in conflict.get('drainageNodes',())}
        sources.update(source for source,target in enumerate(state['original_links'])
                       if target>=0 and drainage.intersection(path_indices(state,source)))
    owners={}
    for source in sorted(sources):
        for node in path_indices(state,source):
            owners.setdefault(int(node),set()).add(source)
    return owners


def connected_reach_owners(state, sources, pinned):
    """Release calculated incident heads, stopping propagation at real pools.

    Entire reaches remain in each proposal. Coincident routed points are real
    junctions even when their solver node IDs differ. A pinned junction keeps
    its physical plane and does not require the other incident reaches to move.
    """
    paths = {source: path_indices(state, source)
             for source, target in enumerate(state['original_links']) if target >= 0}
    positions = [tuple(np.round(point, 6)) for point in state['points']]
    # A duplicate of a pinned point also belongs to that fixed junction.
    fixed = {positions[node] for node in np.flatnonzero(pinned)}
    incident = {}
    for source, path in paths.items():
        for node in path:
            key = positions[node]
            if key not in fixed:
                incident.setdefault(key, set()).add(source)
    selected = set(sources)
    queue = list(sorted(selected))
    while queue:
        source = queue.pop()
        for node in paths[source]:
            for neighbor in incident.get(positions[node], ()):
                if neighbor not in selected:
                    selected.add(neighbor)
                    queue.append(neighbor)
    owners = {}
    for source in sorted(selected):
        for node in paths[source]:
            owners.setdefault(node, set()).add(source)
    return owners


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('state',type=Path);parser.add_argument('overlay',type=Path)
    parser.add_argument('--out',type=Path,required=True)
    parser.add_argument('--include-longitudinal',action='store_true',
                        help='Also solve complete reported downstream obstruction corridors')
    parser.add_argument('--include-connected',action='store_true',
                        help='Solve incident reaches together up to fixed pool junctions')
    parser.add_argument('--restore-supports',action='store_true',
                        help='Permit restoring previous centre/bank cuts up to original terrain')
    parser.add_argument('--source',type=int,action='append',
                        help='Limit proposal generation to reviewed failing source IDs')
    args=parser.parse_args();state=dict(np.load(args.state))
    if str(state.get('terrain_overlay_sha256',''))!=hashlib.sha256(args.overlay.read_bytes()).hexdigest():
        raise ValueError('State/overlay hash mismatch')
    if 'retaining_lower_bounds' not in state:raise ValueError('Missing immutable retaining bounds')
    original=np.load(DEFAULT_HEIGHTS);ground=original.copy();overlay=json.loads(args.overlay.read_text())
    for i,h,_ in overlay['changes']:ground.flat[i]=h
    hydrology=np.load(DEFAULT_HEIGHTS.parent.parent/'hydrology-pass1.npz')
    flips,_=derive_channel_diagonal_flips(original,hydrology['rivers'],hydrology['flow_to'])
    failed,diagnostics=solve(ground,state,flips)
    if args.source and not set(args.source).issubset(failed):
        raise ValueError('Every selected source must be an actual current constraint')
    selected=failed if not args.source else {source:failed[source] for source in sorted(set(args.source))}
    owners=(connected_reach_owners(state,selected,diagnostics['pinned'])
            if args.include_connected else local_reach_owners(state,selected,args.include_longitudinal))
    nodes=sorted(owners)
    supports=[station_support(ground.shape,state['points'][i],diagnostics['bankNormals'][i],
                             diagnostics['bankRadius'][i],flips) for i in nodes]
    # Native supports are nonnegative. Negative source tokens also couple
    # separate obstructions on one reach, so one cannot be accepted alone.
    for node,support in zip(nodes,supports):
        support.update(-1-source for source in owners[node])
    groups=support_components(supports)
    valid=np.zeros(len(state['points']),bool);edges=set()
    for source,target in enumerate(state['original_links']):
        if target<0:continue
        path=path_indices(state,source)
        if source not in failed:valid[path]=True
        if state['orientation_levels'][source]<state['orientation_levels'][target]:path.reverse()
        edges.update(zip(path,path[1:]))
    # Match condition_channel_profiles: duplicated samples at a routed
    # crossing are one physical head, not independently adjustable water.
    junctions={}
    for node,point in enumerate(state['points']):
        anchor=junctions.setdefault(tuple(np.round(point,6)),node)
        if anchor!=node:edges.update(((anchor,node),(node,anchor)))
    trial=ground.copy();records=[]
    restorable=[int(i) for i,_,_ in overlay['changes']] if args.restore_supports else []
    # Every component uses the SAME baseline heads/ground. Combined cuts are
    # checked once below, never serially accepted using stale pool domains.
    for group in groups:
        chosen=[nodes[i] for i in group];lookup={node:i for i,node in enumerate(chosen)}
        links=[];incident=[]
        for upstream,downstream in edges:
            if upstream in lookup and downstream in lookup:links.append((lookup[upstream],lookup[downstream]))
            elif upstream in lookup:incident.append((lookup[upstream],diagnostics['solvedHeads'][downstream],False))
            elif downstream in lookup:incident.append((lookup[downstream],diagnostics['solvedHeads'][upstream],True))
        extent=float(np.max(diagnostics['bankRadius']))*2+1
        low=state['points'][chosen].min(axis=0)-extent;high=state['points'][chosen].max(axis=0)+extent
        near=valid&~diagnostics['pinned']&~diagnostics['falling']&np.all((state['points']>=low)&(state['points']<=high),axis=1)
        near[chosen]=False
        external=[{'node':int(i),'point':state['points'][i],'head':diagnostics['solvedHeads'][i],
                   'normal':diagnostics['bankNormals'][i],'radius':diagnostics['bankRadius'][i],
                   'depth':diagnostics['depthTargets'][i]}
                  for i in np.flatnonzero(near)]
        proposals=[]
        for fraction in (1.,.5,0.):
            proposal=coupled_reach_correction(original,ground,state['points'][chosen],diagnostics['solvedHeads'][chosen],
                diagnostics['depthTargets'][chosen],diagnostics['bankNormals'][chosen],diagnostics['bankRadius'][chosen],
                pinned=diagnostics['pinned'][chosen],falling=diagnostics['falling'][chosen],
                protected=overlay.get('protectedRetainingBankIndices',[]),maximum_lowering=3.,terrain_flips=flips,
                crest_budget_fraction=fraction,external_banks=external,retaining_lower_bounds=state['retaining_lower_bounds'],
                head_links=links,incident_heads=incident,fix_endpoints=False,restoration_indices=restorable)
            if proposal is not None:proposals.append(proposal)
        record={'nodes':chosen,'sources':sorted(set().union(*(owners[node] for node in chosen))),
                'status':'infeasible-under-fixed-incident-banks-and-routine-bounds'}
        if proposals:
            proposal=min(proposals,key=lambda p:p['maximumOriginalLoweringM']);ii=proposal['indices']
            proposed=(ground.ravel()[ii].astype(float)-proposal['reductions']).astype(np.float32)
            changed=ii[proposed!=ground.ravel()[ii]]
            trial.ravel()[ii]=proposed
            record.update(status='proposed',fixedNeighborNodes=proposal['fixedNeighborNodes'],
                support=[{'nativeIndex':int(i),'previousM':float(ground.flat[i]),'originalM':float(original.flat[i]),
                          'proposedM':float(trial.flat[i])} for i in changed])
        records.append(record)
    remaining,_=solve(trial,state,flips);eligible,new,resolved=proposal_gate(failed,remaining)
    summary={'baselineCount':len(failed),'includeLongitudinal':args.include_longitudinal,
        'includeConnected':args.include_connected,
        'restoreSupports':args.restore_supports,
        'selectedSources':sorted(set(args.source)) if args.source else None,
        'componentCount':len(groups),'proposedComponents':sum(r['status']=='proposed' for r in records),
        'proposedRemaining':len(remaining),'newFailures':new,'resolvedSources':resolved,
        'newFailureDetails':{int(source):remaining[source] for source in new},
        'status':'proposal-requires-fresh-domains' if eligible else 'rejected-whole-proposal','components':records}
    args.out.with_suffix('.audit.json').write_text(json.dumps(summary,separators=(',',':')))
    if eligible:
        indices=np.flatnonzero(trial.ravel()<original.ravel()-1e-6)
        overlay['changes']=[[int(i),round(float(trial.flat[i]),6),round(float(original.flat[i]),6)] for i in indices]
        if args.restore_supports:
            overlay['exceptionIndices']=[int(i) for i in overlay.get('exceptionIndices',[])
                                         if original.flat[i]-trial.flat[i]>3.+1e-5]
        overlay.setdefault('coupledLocalProposalAudit',[]).append(summary)
        args.out.write_text(json.dumps(overlay,separators=(',',':')))
    else:args.out.write_bytes(args.overlay.read_bytes())
    print(json.dumps({k:v for k,v in summary.items() if k not in ('components','newFailureDetails')}),flush=True)


if __name__=='__main__':main()
