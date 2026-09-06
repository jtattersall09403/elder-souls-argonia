"""Recondition only cuts attributable exclusively to the old wetland regime."""
import argparse
import json
from pathlib import Path
import numpy as np
from .compile_chunks import DEFAULT_HEIGHTS
from .terrain_triangles import terrain_weights,derive_channel_diagonal_flips
from .audit_water_routes import path_indices


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('state',type=Path);parser.add_argument('overlay',type=Path)
    parser.add_argument('--out',type=Path,required=True)
    parser.add_argument('--source',type=int,action='append',
                        help='Restore only the explicitly diagnosed shallow connector support set')
    args=parser.parse_args();state=dict(np.load(args.state));overlay=json.loads(args.overlay.read_text())
    n=dict(np.load(DEFAULT_HEIGHTS.parent.parent/'hydrology-pass1.npz'));original=np.load(DEFAULT_HEIGHTS)
    flips,_=derive_channel_diagonal_flips(original,n['rivers'],n['flow_to'])
    authored,wetland=set(),set()
    for source,target in enumerate(state['original_links']):
        if target<0:continue
        nodes=path_indices(state,source)
        rows,cols,weights=terrain_weights(original.shape,state['points'][nodes].T,flips)
        indices=(rows*original.shape[1]+cols)[weights>1e-6]
        if n['rivers'].ravel()[state['cell_indices'][source]]>0:
            authored.update(indices.tolist())
        elif args.source is None or source in args.source:
            wetland.update(indices.tolist())
    restored=[];retained=[]
    for index,height,old in overlay['changes']:
        if index in wetland and index not in authored:
            if abs(float(original.flat[index])-old)>1e-5:raise ValueError('Overlay/source mismatch')
            restored.append([index,height,old])
        else:retained.append([index,height,old])
    overlay['changes']=retained
    if args.source is None:
        overlay['wetlandRegimeRestorationAudit']=restored
    else:
        overlay['wetlandAnchorRestorationAudit']={
            'sources':args.source,'sourceCells':[int(state['cell_indices'][source]) for source in args.source],
            'restored':restored}
    args.out.write_text(json.dumps(overlay,separators=(',',':')))
    print(json.dumps({'restoredExclusiveRivuletVertices':len(restored),'retainedAuthoredOrSharedVertices':len(retained),
                      'maximumRestoredM':max((old-height for _,height,old in restored),default=0.)}))


if __name__=='__main__':main()
