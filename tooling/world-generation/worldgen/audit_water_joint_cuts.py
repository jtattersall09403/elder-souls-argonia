"""Joint reach proposals with an explicit no-new-global-failures acceptance gate."""
import argparse
import json
from pathlib import Path
import numpy as np
from .compile_chunks import DEFAULT_HEIGHTS
from .terrain_triangles import derive_channel_diagonal_flips
from .audit_water_routes import solve,path_indices
from .water_reach_solver import coupled_reach_correction


def connected_reach_path(state,source,diagnostics):
    """An export record boundary is not a physical fixed-head boundary."""
    downstream={};degree={}
    for edge,target in enumerate(state['original_links']):
        if target<0:continue
        a,b=(edge,int(target)) if state['orientation_levels'][edge]>=state['orientation_levels'][target] else (int(target),edge)
        downstream.setdefault(a,[]).append((edge,b))
        degree[a]=degree.get(a,0)+1;degree[b]=degree.get(b,0)+1
    path=path_indices(state,source);target=int(state['original_links'][source])
    if state['orientation_levels'][source]<state['orientation_levels'][target]:path.reverse()
    members=[source]
    while True:
        end=path[-1]
        caps=[diagnostics['bankCap'][node] for node in path if not diagnostics['falling'][node]]
        if (not caps or diagnostics['solvedHeads'][end]<=min(caps)+1e-4 or diagnostics['pinned'][end]
                or degree.get(end)!=2 or len(downstream.get(end,[]))!=1):break
        edge,next_end=downstream[end][0]
        if edge in members:break
        following=path_indices(state,edge)
        if following[0]!=end:following.reverse()
        if following[0]!=end or any(node in path for node in following[1:]):break
        path.extend(following[1:]);members.append(edge)
    return path,members


def best_reach_proposal(original,ground,state,path,diagnostics,protected):
    proposals=[]
    extent=float(np.max(diagnostics['bankRadius']))*2+1
    low=state['points'][path].min(axis=0)-extent;high=state['points'][path].max(axis=0)+extent
    near=np.all((state['points']>=low)&(state['points']<=high),axis=1)
    near[path]=False
    near &= state['_valid_nodes'] & ~diagnostics['pinned'] & ~diagnostics['falling']
    external=[{'node':int(i),'point':state['points'][i],'head':diagnostics['solvedHeads'][i],
               'normal':diagnostics['bankNormals'][i],'radius':diagnostics['bankRadius'][i]}
              for i in np.flatnonzero(near)]
    for fraction in (1.,.75,.5,.25,0.):
        proposal=coupled_reach_correction(original,ground,state['points'][path],diagnostics['solvedHeads'][path],
            diagnostics['depthTargets'][path],diagnostics['bankNormals'][path],diagnostics['bankRadius'][path],
            pinned=diagnostics['pinned'][path],falling=diagnostics['falling'][path],
            protected=protected,terrain_flips=state['_terrain_flips'],crest_budget_fraction=fraction,
            external_banks=external)
        if proposal is not None:proposals.append(proposal)
    return min(proposals,key=lambda item:item['maximumOriginalLoweringM']) if proposals else None


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('state',type=Path);parser.add_argument('overlay',type=Path)
    parser.add_argument('--out',type=Path,required=True)
    parser.add_argument('--source',type=int,action='append')
    args=parser.parse_args();state=dict(np.load(args.state));overlay=json.loads(args.overlay.read_text())
    original=np.load(DEFAULT_HEIGHTS);ground=original.copy()
    for i,h,_ in overlay['changes']:ground.flat[i]=h
    n=np.load(DEFAULT_HEIGHTS.parent.parent/'hydrology-pass1.npz')
    flips,_=derive_channel_diagonal_flips(original,n['rivers'],n['flow_to'])
    state['_terrain_flips']=flips
    failed,diagnostics=solve(ground,state,flips);rows=[];accepted=overlay.get('indexedRepairAudit',[]).copy()
    def refresh_valid_nodes():
        valid=np.zeros(len(state['points']),bool)
        for source,target in enumerate(state['original_links']):
            if target>=0 and source not in failed:valid[path_indices(state,source)]=True
        state['_valid_nodes']=valid
    refresh_valid_nodes()
    for source in args.source or sorted(failed):
        if source not in failed or failed[source].get('obstructionPinned'):continue
        cell=int(state['cell_indices'][source])
        if n['rivers'].ravel()[cell]==0:continue
        path,members=connected_reach_path(state,source,diagnostics)
        proposal=best_reach_proposal(original,ground,state,path,diagnostics,
                                    overlay.get('protectedRetainingBankIndices',[]))
        row={'source':source,'cell':cell,'accepted':False,'method':'joint-reach-linear','members':members}
        if proposal is None:
            row['reason']='no-feasible-proposal-with-audited-crest-choices-under-5m'
        else:
            trial=ground.copy();indices=proposal['indices']
            trial.ravel()[indices]=(trial.ravel()[indices].astype(float)-proposal['reductions']).astype(np.float32)
            remaining,new_diagnostics=solve(trial,state,flips)
            new=set(remaining)-set(failed)
            classification_updates=[]
            previous_diagnostics=diagnostics
            proposal_count=1
            fixed_neighbors=set(proposal['fixedNeighborNodes'])
            # Five explicit active-classification proposals is a finite
            # diagnostic budget, not permission to accept remaining errors.
            while source in remaining and not new and proposal_count<5:
                changed_roles=[int(node) for node in (*path,*fixed_neighbors)
                    if new_diagnostics['falling'][node]!=previous_diagnostics['falling'][node]]
                if not changed_roles:break
                classification_updates.append(changed_roles)
                # Cuts can turn a falling interval into a banked one. Its
                # newly measured banks must join the SAME bounded system;
                # an obsolete freefall exemption is not an accepted repair.
                path,members=connected_reach_path(state,source,new_diagnostics)
                further=best_reach_proposal(original,trial,state,path,new_diagnostics,
                                           overlay.get('protectedRetainingBankIndices',[]))
                if further is None:break
                advanced=trial.copy();ii=further['indices']
                advanced.ravel()[ii]=(advanced.ravel()[ii].astype(float)-further['reductions']).astype(np.float32)
                if np.max(trial-advanced)<1e-5:break
                trial=advanced;proposal=further;previous_diagnostics=new_diagnostics
                proposal_count+=1;fixed_neighbors.update(further['fixedNeighborNodes'])
                remaining,new_diagnostics=solve(trial,state,flips)
                new=set(remaining)-set(failed)
            indices=np.flatnonzero(ground.ravel()!=trial.ravel())
            row['members']=members
            row['classificationUpdates']=classification_updates
            row['proposalCount']=proposal_count
            row['fixedNeighborNodes']=sorted(fixed_neighbors)
            row.update(remaining=len(remaining),newFailures=sorted(new),resolved=sorted(set(failed)-set(remaining)),
                       maximumOriginalLoweringM=proposal['maximumOriginalLoweringM'])
            if source not in remaining and not new:
                changed=indices[ground.ravel()[indices]!=trial.ravel()[indices]]
                record={'source':source,'cell':cell,'method':'joint-reach-linear',
                    'memberCells':[int(state['cell_indices'][member]) for member in members],
                    'incidentHeadsM':[float(diagnostics['solvedHeads'][path[0]]),float(diagnostics['solvedHeads'][path[-1]])],
                    'minimumMaximumOriginalCutM':proposal['maximumOriginalLoweringM'],
                    'classificationUpdates':classification_updates,
                    'fixedNeighborNodes':sorted(fixed_neighbors),
                    'support':[{'nativeIndex':int(i),'originalM':float(original.flat[i]),
                        'currentM':float(ground.flat[i]),'proposedM':float(trial.flat[i])} for i in changed]}
                accepted.append(record);ground=trial;failed=remaining;diagnostics=new_diagnostics;row['accepted']=True
                refresh_valid_nodes()
        rows.append(row);print(json.dumps(row),flush=True)
    indices=np.flatnonzero(ground.ravel()<original.ravel()-1e-6)
    overlay['changes']=[[int(i),round(float(ground.flat[i]),6),round(float(original.flat[i]),6)] for i in indices]
    deep=np.flatnonzero((original-ground).ravel()>3.+1e-5)
    overlay['maxLoweringM']=5 if len(deep) else 3;overlay['routineMaxLoweringM']=3
    overlay['exceptionIndices']=deep.tolist();overlay['indexedRepairAudit']=accepted
    overlay['exceptionCells']=[list(divmod(int(cell),n['rivers'].shape[1])) for cell in sorted({x['cell'] for x in accepted})]
    overlay['jointReachAcceptanceAudit']=rows
    args.out.write_text(json.dumps(overlay,separators=(',',':')))
    args.out.with_suffix('.summary.json').write_text(json.dumps({'remainingSources':list(failed),
        'remainingCount':len(failed),'acceptedCount':sum(x['accepted'] for x in rows)},separators=(',',':')))


if __name__=='__main__':main()
