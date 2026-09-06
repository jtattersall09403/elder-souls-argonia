"""Read-only minimum support-corner authority for unresolved bank constraints."""
import argparse
import json
from pathlib import Path
import numpy as np
from .compile_chunks import DEFAULT_HEIGHTS
from .terrain_triangles import terrain_weights, sample_terrain, derive_channel_diagonal_flips
from .water_geometry import bounded_bank_correction


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('report',type=Path);parser.add_argument('overlay',type=Path)
    parser.add_argument('--out',type=Path,required=True)
    args=parser.parse_args()
    original=np.load(DEFAULT_HEIGHTS);ground=original.copy()
    overlay=json.loads(args.overlay.read_text())
    for i,h,_ in overlay['changes']:ground.flat[i]=h
    protected=set(overlay.get('protectedRetainingBankIndices',[]))
    n=np.load(DEFAULT_HEIGHTS.parent.parent/'hydrology-pass1.npz')
    flips,_=derive_channel_diagonal_flips(original,n['rivers'],n['flow_to'])
    results=[]
    for reach in json.loads(args.report.read_text())['reaches']:
        if not reach['rawConflict'].get('localBankConstraint'):continue
        for node in reach['nodes']:
            point=np.asarray(node['position']);normal=np.asarray(node['bankNormal']);radius=node['bankRadius']
            rows,cols,raw=terrain_weights(ground.shape,point[:,None],flips)
            cells=[(int(y),int(x)) for y,x,w in zip(rows[:,0],cols[:,0],raw[:,0]) if w>1e-6]
            weights=raw[:,0][raw[:,0]>1e-6]
            distances=np.minimum(radius*2,np.arange(.25,radius*2+.25,.25))
            probes=np.concatenate([point[:,None]+normal[:,None]*distances*sign for sign in (-1,1)],axis=1)
            br,bc,bw=terrain_weights(ground.shape,probes,flips)
            bank=sample_terrain(ground,probes,flips)
            coefficients=np.array([np.sum(bw*((br==y)&(bc==x)),axis=0) for y,x in cells]).T
            bed=float(sample_terrain(ground,point[:,None],flips)[0])
            existing=np.array([float(original[c]-ground[c]) for c in cells])
            def test(limit):
                remaining=np.array([0. if y*ground.shape[1]+x in protected else max(0,limit-old)
                    for (y,x),old in zip(cells,existing)])
                return bounded_bank_correction(bed,weights,remaining,bank,coefficients,node['depthTarget'])
            low,high=3.,12.
            reductions=test(high)
            if reductions is not None:
                for _ in range(24):
                    middle=(low+high)*.5
                    if test(middle) is None:low=middle
                    else:high=middle
                reductions=test(high+1e-5)
            results.append({'source':reach['source'],'cell':reach['sourceCell'],'position':node['position'],
                'minimumMaximumOriginalCutM':high if reductions is not None else None,
                'support':[{ 'nativeIndex':y*ground.shape[1]+x,'originalM':float(original[y,x]),
                            'currentM':float(ground[y,x]),'proposedM':float(ground[y,x]-d)}
                           for (y,x),d in zip(cells,reductions if reductions is not None else [])]})
    args.out.write_text(json.dumps(results,separators=(',',':')))
    print(json.dumps({'nodes':len(results),'feasibleBy12m':sum(x['minimumMaximumOriginalCutM'] is not None for x in results)}))


if __name__=='__main__':main()
