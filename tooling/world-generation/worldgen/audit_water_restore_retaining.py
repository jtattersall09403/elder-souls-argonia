"""Propose original-bank restoration without breaking valid channel support."""
import argparse,json
from pathlib import Path
import numpy as np
from .compile_chunks import DEFAULT_HEIGHTS
from .scale import RAW_M
from .terrain_triangles import derive_channel_diagonal_flips,terrain_weights
from .audit_water_routes import path_indices
from .audit_water_restore_pool_floors import active_geometry_probes
from .water_spill_preservation import channel_safe_restorations


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('state',type=Path);parser.add_argument('overlay',type=Path)
    parser.add_argument('--out',type=Path,required=True)
    parser.add_argument('--artificial-source',type=int,action='append',default=[])
    args=parser.parse_args();state=dict(np.load(args.state));overlay=json.loads(args.overlay.read_text())
    bounds=state['retaining_lower_bounds'];original=np.load(DEFAULT_HEIGHTS);ground=original.copy()
    for i,h,_ in overlay['changes']:ground.flat[i]=h
    n=np.load(DEFAULT_HEIGHTS.parent.parent/'hydrology-pass1.npz')
    flips,_=derive_channel_diagonal_flips(original,n['rivers'],n['flow_to'])
    artificial=set()
    for source in args.artificial_source:
        if n['rivers'].flat[state['cell_indices'][source]]>0:
            raise ValueError('This diagnosed artificial-anchor restoration is limited to shallow authored rivulets')
        nodes=path_indices(state,source)
        rows,cols,weights=terrain_weights(ground.shape,state['points'][nodes].T,flips)
        artificial.update((rows*ground.shape[1]+cols)[weights>1e-6].tolist())
    candidates=[]
    for index,height,previous in overlay['changes']:
        violates=height<bounds.flat[index]-1e-4
        if not violates and index not in artificial:continue
        if abs(float(original.flat[index])-previous)>1e-5:raise ValueError('Overlay/source mismatch')
        candidates.append({'nativeIndex':int(index),'fromM':height,'toM':previous,
            'retainingBoundViolation':bool(violates),'artificialAnchorSupport':index in artificial,
            'lowerBoundM':float(bounds.flat[index]) if np.isfinite(bounds.flat[index]) else None})
    coords,heads,depths,owners=active_geometry_probes(state)
    restored,excluded=channel_safe_restorations(original,ground,candidates,coords,heads,depths,flips)
    for row in excluded:
        row['activeNodes']=sorted({owners[i] for i in row.pop('probeIndices')})
    indices={row['nativeIndex'] for row in restored}
    overlay['changes']=[row for row in overlay['changes'] if row[0] not in indices]
    overlay['exceptionIndices']=[i for i in overlay.get('exceptionIndices',[]) if i not in indices]
    protected={row['nativeIndex'] for row in restored if row['retainingBoundViolation']}
    overlay['protectedRetainingBankIndices']=sorted(set(overlay.get('protectedRetainingBankIndices',[]))|protected)
    authority=[];revoked=[]
    for record in overlay.get('indexedRepairAudit',[]):
        removed=[cell for cell in record['support'] if cell['nativeIndex'] in indices]
        retained=[cell for cell in record['support'] if cell['nativeIndex'] not in indices]
        if removed:revoked.append({**record,'support':removed})
        if retained:authority.append({**record,'support':retained})
    overlay['indexedRepairAudit']=authority
    overlay['revokedIndexedRepairAuthority']=overlay.get('revokedIndexedRepairAuthority',[])+revoked
    overlay['retainingSupportRestorationAudit']=overlay.get('retainingSupportRestorationAudit',[])+[{
        'artificialSources':args.artificial_source,'restored':restored,'excluded':excluded,
        'acceptance':'proposal-requires-fresh-domain-and-global-constraint-audit'}]
    args.out.write_text(json.dumps(overlay,separators=(',',':')))
    summary={'proposedOriginalRestorations':len(restored),'excludedValidChannelSupports':len(excluded),
        'retainingSupportsRestored':len(protected),'retainedCorrections':len(overlay['changes']),
        'artificialAnchorSupportsRestored':sum(r['artificialAnchorSupport'] for r in restored),
        'maximumRestoredM':max((r['toM']-r['fromM'] for r in restored),default=0.),
        'projectedGridVolumeM3':sum(r['toM']-r['fromM'] for r in restored)*RAW_M**2}
    args.out.with_suffix('.summary.json').write_text(json.dumps(summary,separators=(',',':')))
    print(json.dumps(summary))


if __name__=='__main__':main()
