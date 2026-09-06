"""Converge bounded bed corrections against a saved physical pool/graph state.

The final native flood/domain computation must still be repeated before export.
This loop avoids rebuilding unchanged province drainage for each local update.
"""
import argparse
import json
from pathlib import Path
import numpy as np
from .compile_chunks import DEFAULT_HEIGHTS
from .terrain_triangles import derive_channel_diagonal_flips
from .audit_water_routes import solve
from .water_geometry import repair_channel_beds,channel_depth_targets


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('state',type=Path);parser.add_argument('overlay',type=Path)
    parser.add_argument('--out',type=Path,required=True)
    parser.add_argument('--index-audit',type=Path)
    args=parser.parse_args()
    original=np.load(DEFAULT_HEIGHTS);ground=original.copy()
    overlay=json.loads(args.overlay.read_text())
    for i,h,_ in overlay['changes']:ground.flat[i]=h
    state=dict(np.load(args.state));n=np.load(DEFAULT_HEIGHTS.parent.parent/'hydrology-pass1.npz')
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
    passes=[]
    while True:
        conflicts,diagnostics=solve(ground,state,flips)
        old=ground.copy()
        updates=repair_channel_beds(original,ground,state['points'],conflicts,max_lowering=3.,
            terrain_flips=flips,depth_targets=diagnostics['depthTargets'],pinned=diagnostics['pinned'],
            links=state['links'],radius=diagnostics['bankRadius'],bank_normals=diagnostics['bankNormals'],
            indexed_limits=limits)
        delta=(old-ground).ravel();changed=delta[delta>0]
        row={'pass':len(passes)+1,'constraints':len(conflicts),'updates':updates,
             'maximumNewCutM':float(np.max(changed,initial=0)),
             'medianNewCutM':float(np.median(changed)) if len(changed) else 0.}
        passes.append(row);print(json.dumps(row),flush=True)
        if not updates or row['maximumNewCutM']<.0001:break
    conflicts,diagnostics=solve(ground,state,flips)
    indices=np.flatnonzero(ground.ravel()<original.ravel()-1e-6)
    overlay['changes']=[[int(i),round(float(ground.flat[i]),6),round(float(original.flat[i]),6)] for i in indices]
    deep=np.flatnonzero((original-ground).ravel()>3.+1e-5)
    overlay['maxLoweringM']=5 if len(deep) else 3
    overlay['routineMaxLoweringM']=3
    overlay['exceptionIndices']=deep.tolist()
    args.out.write_text(json.dumps(overlay,separators=(',',':')))
    args.out.with_suffix('.convergence.json').write_text(json.dumps({'passes':passes,'remainingSources':list(conflicts),
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
