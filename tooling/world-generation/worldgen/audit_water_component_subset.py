"""Replay independent retained proposals, excluding whole diagnosed components.

This does not rerun or iterate the cut solver. One global check is mandatory;
even a clean result remains provisional until fresh domain/preservation checks.
"""
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
from .compile_chunks import DEFAULT_HEIGHTS
from .terrain_triangles import derive_channel_diagonal_flips
from .audit_water_routes import solve
from .audit_water_solve import proposal_gate


def partition_components(components,excluded_sources):
    excluded=set(excluded_sources);kept=[];omitted=[]
    for component in components:
        (omitted if excluded.intersection(component['sources']) else kept).append(component)
    if excluded-set(s for c in omitted for s in c['sources']):
        raise ValueError('Every excluded source must identify an actual retained component')
    return kept,omitted


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('state',type=Path);parser.add_argument('overlay',type=Path)
    parser.add_argument('proposal_audit',type=Path);parser.add_argument('--out',type=Path,required=True)
    parser.add_argument('--exclude-source',type=int,action='append',required=True)
    parser.add_argument('--reason',required=True)
    args=parser.parse_args();state=dict(np.load(args.state));raw=args.overlay.read_bytes()
    if str(state.get('terrain_overlay_sha256',''))!=hashlib.sha256(raw).hexdigest():
        raise ValueError('State/overlay hash mismatch')
    audit=json.loads(args.proposal_audit.read_text());overlay=json.loads(raw)
    kept,omitted=partition_components(audit['components'],args.exclude_source)
    original=np.load(DEFAULT_HEIGHTS);ground=original.copy()
    for i,h,_ in overlay['changes']:ground.flat[i]=h
    trial=ground.copy();protected=set(overlay.get('protectedRetainingBankIndices',[]))
    for component in kept:
        for support in component.get('support',[]):
            i=support['nativeIndex'];before=support['previousM'];after=support['proposedM']
            if (abs(before-float(ground.flat[i]))>1e-5 or abs(support['originalM']-float(original.flat[i]))>1e-5
                    or after>original.flat[i]+1e-5
                    or (after<before and (original.flat[i]-after>3.+1e-5 or i in protected))
                    or after<min(before,float(state['retaining_lower_bounds'].flat[i]))-1e-5):
                raise ValueError('Retained proposal violates original/current/bounded support authority')
            if trial.flat[i]!=ground.flat[i] and abs(float(trial.flat[i])-after)>1e-5:
                raise ValueError('Independent proposals disagree on a shared terrain support')
            trial.flat[i]=after
    hydrology=np.load(DEFAULT_HEIGHTS.parent.parent/'hydrology-pass1.npz')
    flips,_=derive_channel_diagonal_flips(original,hydrology['rivers'],hydrology['flow_to'])
    baseline,_=solve(ground,state,flips);remaining,_=solve(trial,state,flips)
    eligible,new,resolved=proposal_gate(baseline,remaining)
    result={'inputOverlaySha256':hashlib.sha256(raw).hexdigest(),'proposalAuditSha256':hashlib.sha256(args.proposal_audit.read_bytes()).hexdigest(),
        'excludedSources':args.exclude_source,'excludedComponents':omitted,'reason':args.reason,
        'baselineCount':len(baseline),'remainingCount':len(remaining),'newFailures':new,'resolvedSources':resolved,
        'restoreSupports':audit.get('restoreSupports',False),
        'newFailureDetails':{int(s):remaining[s] for s in new},'components':kept,
        'status':'proposal-requires-fresh-domains' if eligible else 'rejected-whole-proposal'}
    args.out.with_suffix('.audit.json').write_text(json.dumps(result,separators=(',',':')))
    if eligible:
        indices=np.flatnonzero(trial.ravel()<original.ravel()-1e-6)
        overlay['changes']=[[int(i),round(float(trial.flat[i]),6),round(float(original.flat[i]),6)] for i in indices]
        overlay['exceptionIndices']=[int(i) for i in overlay.get('exceptionIndices',[])
                                     if original.flat[i]-trial.flat[i]>3.+1e-5]
        overlay.setdefault('coupledLocalProposalAudit',[]).append(result)
        args.out.write_text(json.dumps(overlay,separators=(',',':')))
    else:args.out.write_bytes(raw)
    print(json.dumps({k:v for k,v in result.items() if k not in ('components','excludedComponents','newFailureDetails')}),flush=True)


if __name__=='__main__':main()
