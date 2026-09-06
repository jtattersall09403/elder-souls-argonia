"""Apply reviewed minimal indexed exceptions only with no new graph failures."""
import argparse
import json
from pathlib import Path
import numpy as np
from .compile_chunks import DEFAULT_HEIGHTS
from .terrain_triangles import derive_channel_diagonal_flips
from .audit_water_routes import solve
from .water_geometry import repair_channel_beds


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('state',type=Path);parser.add_argument('overlay',type=Path)
    parser.add_argument('audit',type=Path);parser.add_argument('--out',type=Path,required=True)
    args=parser.parse_args()
    original=np.load(DEFAULT_HEIGHTS);ground=original.copy();state=dict(np.load(args.state))
    overlay=json.loads(args.overlay.read_text())
    for i,h,_ in overlay['changes']:ground.flat[i]=h
    n=np.load(DEFAULT_HEIGHTS.parent.parent/'hydrology-pass1.npz')
    flips,_=derive_channel_diagonal_flips(original,n['rivers'],n['flow_to'])
    limits={i:0. for i in overlay.get('protectedRetainingBankIndices',[])}
    candidates={}
    for record in json.loads(args.audit.read_text()):
        if record['minimumMaximumOriginalCutM'] is not None and record['minimumMaximumOriginalCutM']<=5:
            candidates.setdefault(record['source'],[]).append(record)
    failed,_=solve(ground,state,flips);accepted=[];attempts=[]
    for source,records in sorted(candidates.items()):
        if source not in failed:continue
        baseline=set(failed);proposed=limits.copy()
        for record in records:
            for cell in record['support']:
                index=cell['nativeIndex'];limit=cell['originalM']-cell['proposedM']+.0001
                if index in proposed and proposed[index]==0.:
                    raise ValueError('Cannot lower a protected retaining crest')
                if abs(float(original.flat[index])-cell['originalM'])>1e-5 or not 0<=limit<=5:
                    raise ValueError('Exception exceeds reviewed original-source authority')
                proposed[index]=max(proposed.get(index,3.),limit)
        trial=ground.copy();rounds=0
        while True:
            conflicts,diagnostics=solve(trial,state,flips)
            relevant={i:c for i,c in conflicts.items() if i==source or i not in baseline}
            if not relevant:break
            old=trial.copy()
            updates=repair_channel_beds(original,trial,state['points'],relevant,max_lowering=3.,
                terrain_flips=flips,depth_targets=diagnostics['depthTargets'],pinned=diagnostics['pinned'],
                links=state['links'],radius=diagnostics['bankRadius'],bank_normals=diagnostics['bankNormals'],
                indexed_limits=proposed)
            rounds+=1
            if not updates or float(np.max(old-trial))<.0001:break
        remaining,_=solve(trial,state,flips)
        new=set(remaining)-baseline
        success=source not in remaining and not new
        result={'source':source,'accepted':success,'remaining':len(remaining),'newFailures':sorted(new),
                'resolved':sorted(baseline-set(remaining)),'rounds':rounds,
                'changedVertices':int(np.count_nonzero(trial!=ground))}
        attempts.append(result);print(json.dumps(result),flush=True)
        if success:
            ground=trial;limits=proposed;failed=remaining;accepted.extend(records)
    indices=np.flatnonzero(ground.ravel()<original.ravel()-1e-6)
    overlay['changes']=[[int(i),round(float(ground.flat[i]),6),round(float(original.flat[i]),6)] for i in indices]
    deep=np.flatnonzero((original-ground).ravel()>3.+1e-5)
    overlay['maxLoweringM']=5 if len(deep) else 3
    overlay['routineMaxLoweringM']=3;overlay['exceptionIndices']=deep.tolist()
    overlay['indexedRepairAudit']=accepted
    overlay['exceptionCells']=[list(divmod(int(cell),n['rivers'].shape[1])) for cell in sorted({x['cell'] for x in accepted})]
    overlay['indexedRepairAcceptanceAudit']=attempts
    args.out.write_text(json.dumps(overlay,separators=(',',':')))
    args.out.with_suffix('.summary.json').write_text(json.dumps({'remainingSources':list(failed),
        'remainingCount':len(failed),'acceptedCount':len(accepted),'deepVertexCount':len(deep)},separators=(',',':')))


if __name__=='__main__':main()
