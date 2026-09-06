"""Propose one bounded bed-correction pass against a matching physical state.

Reject the entire pass if it creates any new global failure. Fresh native
flood/domain and original-pool checks are still required before acceptance.
"""
import argparse
import json
import hashlib
from pathlib import Path
import numpy as np
from .compile_chunks import DEFAULT_HEIGHTS
from .terrain_triangles import derive_channel_diagonal_flips
from .audit_water_routes import solve
from .water_geometry import repair_channel_beds,channel_depth_targets


def proposal_gate(before, after):
    """Fewer failures alone cannot conceal a newly damaged neighbouring reach."""
    new=sorted(set(after)-set(before))
    resolved=sorted(set(before)-set(after))
    return not new and bool(resolved),new,resolved


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('state',type=Path);parser.add_argument('overlay',type=Path)
    parser.add_argument('--out',type=Path,required=True)
    parser.add_argument('--index-audit',type=Path)
    parser.add_argument('--local-only',action='store_true',help='Only propose existing local bank constraints')
    args=parser.parse_args()
    original=np.load(DEFAULT_HEIGHTS);ground=original.copy()
    overlay=json.loads(args.overlay.read_text())
    for i,h,_ in overlay['changes']:ground.flat[i]=h
    state=dict(np.load(args.state));n=np.load(DEFAULT_HEIGHTS.parent.parent/'hydrology-pass1.npz')
    if str(state.get('terrain_overlay_sha256',''))!=hashlib.sha256(args.overlay.read_bytes()).hexdigest():
        raise ValueError('Solver state must match this exact overlay hash')
    if 'retaining_lower_bounds' not in state:raise ValueError('Rebuild the solver cache with immutable retaining bounds before proposing cuts')
    if 'semantic_depth_targets' not in state:
        bands=n['rivers'].ravel()[state['cell_indices']]
        depths=np.select([bands==2,bands==3],[.55,.85],default=.3)
        state['semantic_depth_targets']=channel_depth_targets(state['points'],state['links'],state['original_links'],depths)
    flips,_=derive_channel_diagonal_flips(original,n['rivers'],n['flow_to'])
    limits={int(index):0. for index in overlay.get('protectedRetainingBankIndices',[])}
    if args.index_audit:
        overlay['indexedRepairAudit']=json.loads(args.index_audit.read_text())
        for record in overlay['indexedRepairAudit']:
            for cell in record['support']:
                index=cell['nativeIndex'];limit=cell['originalM']-cell['proposedM']+.0001
                if abs(float(original.flat[index])-cell['originalM'])>1e-5 or not 0<=limit<=5:
                    raise ValueError('Indexed exception does not match immutable terrain/5m authority')
                if index in limits and limits[index]==0.:
                    raise ValueError('Indexed exception cannot lower a protected retaining bank')
                limits[index]=max(limits.get(index,3.),limit)
    baseline,baseline_diagnostics=solve(ground,state,flips)
    selected={i:c for i,c in baseline.items() if not args.local_only or c.get('localBankConstraint',False)}
    old=ground.copy();diagnostics=baseline_diagnostics
    updates=repair_channel_beds(original,ground,state['points'],selected,max_lowering=3.,
        terrain_flips=flips,depth_targets=diagnostics['depthTargets'],pinned=diagnostics['pinned'],
        links=state['links'],radius=diagnostics['bankRadius'],bank_normals=diagnostics['bankNormals'],
        indexed_limits=limits,retaining_lower_bounds=state['retaining_lower_bounds'])
    changed=(old-ground).ravel();changed=changed[changed>0]
    conflicts,diagnostics=solve(ground,state,flips)
    eligible,new,resolved=proposal_gate(baseline,conflicts)
    row={'pass':1,'constraints':len(baseline),'selectedConstraints':len(selected),'updates':updates,
         'proposedRemaining':len(conflicts),'newFailures':new,'resolvedSources':resolved,
         'maximumNewCutM':float(np.max(changed,initial=0)),
         'medianNewCutM':float(np.median(changed)) if len(changed) else 0.,
         'status':'proposal-requires-fresh-domains' if eligible else 'rejected-whole-proposal'}
    print(json.dumps(row),flush=True)
    # Preserve exact rejected support proposals for a bounded dependency audit;
    # never require rerunning a rejected province pass just to recover indices.
    row['proposedSupports']=[{'nativeIndex':int(i),'previousM':float(old.flat[i]),
        'proposedM':float(ground.flat[i]),'originalM':float(original.flat[i])}
        for i in np.flatnonzero((old-ground).ravel()>0)]
    if not eligible:
        ground=old;conflicts=baseline;diagnostics=baseline_diagnostics
    indices=np.flatnonzero(ground.ravel()<original.ravel()-1e-6)
    overlay['changes']=[[int(i),round(float(ground.flat[i]),6),round(float(original.flat[i]),6)] for i in indices]
    deep=np.flatnonzero((original-ground).ravel()>3.+1e-5)
    overlay['maxLoweringM']=5 if len(deep) else 3
    overlay['routineMaxLoweringM']=3
    overlay['exceptionIndices']=deep.tolist()
    if eligible:overlay.setdefault('singlePassProposalAudit',[]).append(row)
    args.out.write_text(json.dumps(overlay,separators=(',',':')) if eligible else args.overlay.read_text())
    args.out.with_suffix('.convergence.json').write_text(json.dumps({'passes':[row],'remainingSources':list(conflicts),
        'remainingCount':len(conflicts),'maximumOriginalCutM':float(np.max(original-ground))},separators=(',',':')))
    rows=[]
    for source,conflict in conflicts.items():
        nodes=sorted(set(conflict['pathNodes']+conflict.get('drainageNodes',[])))
        rows.append({'source':int(source),'sourceCell':int(state['cell_indices'][source]),'rawConflict':conflict,
            'nodes':[{'index':int(i),'position':state['points'][i].tolist(),
                      'bankNormal':diagnostics['bankNormals'][i].tolist(),
                      'bankRadius':float(diagnostics['bankRadius'][i]),
                      'depthTarget':float(diagnostics['depthTargets'][i])} for i in nodes]})
    args.out.with_suffix('.constraints.json').write_text(json.dumps({'reaches':rows},separators=(',',':')))


if __name__=='__main__':main()
