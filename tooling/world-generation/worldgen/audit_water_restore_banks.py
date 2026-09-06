"""Restore only audited retaining-crest vertices lowered by our own overlay."""
import argparse
import json
from pathlib import Path
import numpy as np
from .compile_chunks import DEFAULT_HEIGHTS
from .terrain_triangles import terrain_weights,sample_terrain,derive_channel_diagonal_flips


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('overlay',type=Path);parser.add_argument('reports',type=Path,nargs='+')
    parser.add_argument('--out',type=Path,required=True)
    args=parser.parse_args()
    original=np.load(DEFAULT_HEIGHTS);ground=original.copy()
    overlay=json.loads(args.overlay.read_text())
    for i,h,_ in overlay['changes']:ground.flat[i]=h
    n=np.load(DEFAULT_HEIGHTS.parent.parent/'hydrology-pass1.npz')
    flips,_=derive_channel_diagonal_flips(original,n['rivers'],n['flow_to'])
    protection=set(overlay.get('protectedRetainingBankIndices',[]));audit={}
    for path in args.reports:
        for reach in json.loads(path.read_text())['reaches']:
            conflict=reach['rawConflict']
            if not conflict.get('obstructionPinned'):continue
            node=next(x for x in reach['nodes'] if x['index']==conflict['node'])
            point=np.asarray(node['position']);normal=np.asarray(node['bankNormal']);radius=node['bankRadius']
            distance=np.minimum(radius*2,np.arange(.25,radius*2+.25,.25))
            for sign in (-1,1):
                probes=point[:,None]+normal[:,None]*distance*sign
                old=sample_terrain(original,probes,flips);current=sample_terrain(ground,probes,flips)
                if np.max(current)>=conflict['requiredLevelM']+.005:continue
                best=int(np.argmax(old))
                if old[best]<conflict['requiredLevelM']+.005:continue
                rows,cols,weights=terrain_weights(original.shape,probes[:,best,None],flips)
                for y,x,w in zip(rows[:,0],cols[:,0],weights[:,0]):
                    if w<=1e-6:continue
                    index=int(y*ground.shape[1]+x);protection.add(index)
                    if ground.flat[index]>=original.flat[index]-1e-6:continue
                    record=audit.setdefault(index,{'nativeIndex':index,'fromM':float(ground.flat[index]),
                        'toM':float(original.flat[index]),'sources':[]})
                    record['sources'].append(reach['source'])
    for index in audit:ground.flat[index]=original.flat[index]
    indices=np.flatnonzero(ground.ravel()<original.ravel()-1e-6)
    overlay['changes']=[[int(i),round(float(ground.flat[i]),6),round(float(original.flat[i]),6)] for i in indices]
    overlay['protectedRetainingBankIndices']=sorted(protection)
    overlay['retainingBankRestorationAudit']=[audit[i] for i in sorted(audit)]
    args.out.write_text(json.dumps(overlay,separators=(',',':')))
    print(json.dumps({'restored':len(audit),'protected':len(protection),'maximumRestoredM':max(
        (x['toM']-x['fromM'] for x in audit.values()),default=0.),'sources':sorted({s for x in audit.values() for s in x['sources']})}))


if __name__=='__main__':main()
