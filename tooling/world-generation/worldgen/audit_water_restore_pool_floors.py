"""Restore unnecessary floor excavation in recovered original impoundments."""
import argparse
import json
from pathlib import Path
import numpy as np
from .compile_chunks import DEFAULT_HEIGHTS
from .scale import RAW_M
from .terrain_triangles import derive_channel_diagonal_flips
from .water_spill_preservation import unnecessary_pool_floor_cuts


def active_geometry_probes(state):
    """Probe every native triangle crease crossed by an active centreline."""
    points=state['points'];heads=np.asarray(state['levels'],float).copy()
    depths=state['diagnostic_depthTargets'].copy()
    depths[state['diagnostic_pinned']|state['diagnostic_falling']]=.015
    # Seasonal flowing beds may be dry at base. Preserve their verified peak
    # depth, while pinned standing pools retain their existing base support.
    budget=state.get('diagnostic_peakDepthBudget',np.zeros(len(points)))
    heads += np.where(state['diagnostic_pinned'],0.,budget)
    accepted=state.get('accepted_links')
    if accepted is None:
        if 'failed_sources' not in state:
            raise ValueError('Restoration probes require an explicit accepted reach graph')
        accepted=state['original_links'].copy()
        accepted[state['failed_sources']]=-1
    coordinates=[];water=[];minimum=[];owners=[]
    for source in np.flatnonzero(state['active']):
        target=int(state['links'][source])
        if source<len(accepted) and accepted[source]<0:target=source
        if target<0:target=source
        a=points[source];b=points[target];delta=b-a
        fractions=[0.,1.]
        # Both possible diagonal families are harmless extra samples; together
        # with grid lines they include every actual native triangle boundary.
        for start,end in ((a[0],b[0]),(a[1],b[1]),(sum(a),sum(b)),(a[0]-a[1],b[0]-b[1])):
            if abs(end-start)<1e-12:continue
            for crossing in range(int(np.ceil(min(start,end))),int(np.floor(max(start,end)))+1):
                fractions.append(float((crossing-start)/(end-start)))
        for f in sorted(set(fractions)):
            coordinates.append(a+f*delta)
            water.append(float(heads[source]*(1-f)+heads[target]*f))
            minimum.append(float(depths[source]*(1-f)+depths[target]*f))
            owners.append(int(source))
    return np.asarray(coordinates).T,np.asarray(water),np.asarray(minimum),owners


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('reference',type=Path);parser.add_argument('drained',type=Path)
    parser.add_argument('current',type=Path);parser.add_argument('overlay',type=Path)
    parser.add_argument('--out',type=Path,required=True)
    args=parser.parse_args();original=np.load(DEFAULT_HEIGHTS);corrected=original.copy()
    overlay=json.loads(args.overlay.read_text())
    for index,height,_ in overlay['changes']:corrected.flat[index]=height
    reference=np.load(args.reference);drained=np.load(args.drained);current=dict(np.load(args.current))
    hydrology=np.load(DEFAULT_HEIGHTS.parent.parent/'hydrology-pass1.npz')
    flips,_=derive_channel_diagonal_flips(original,hydrology['rivers'],hydrology['flow_to'])
    coordinates,heads,depths,owners=active_geometry_probes(current)
    restored,excluded=unnecessary_pool_floor_cuts(original,corrected,reference['pool_levels'],
        reference['filled_levels'],drained['filled_levels'],current['pool_levels'],current['filled_levels'],
        overlay['changes'],coordinates,heads,depths,flips)
    for row in excluded:
        if 'probeIndices' in row:
            row['activeNodes']=sorted({owners[i] for i in row.pop('probeIndices')})
    indices={row['nativeIndex'] for row in restored}
    overlay['changes']=[row for row in overlay['changes'] if row[0] not in indices]
    overlay['exceptionIndices']=[i for i in overlay.get('exceptionIndices',[]) if i not in indices]
    audit={'restored':restored,'excluded':excluded,
           'activeNativeCreaseProbes':len(owners),'reference':str(args.reference),
           'drainedState':str(args.drained),'recoveredState':str(args.current)}
    overlay['poolFloorRestorationAudit']=overlay.get('poolFloorRestorationAudit',[])+[audit]
    # These are original submerged floors, not retaining banks: no new crest
    # protection is invented. Revoke old permission to excavate restored cells.
    authority=[];revoked=[]
    for record in overlay.get('indexedRepairAudit',[]):
        removed=[cell for cell in record['support'] if cell['nativeIndex'] in indices]
        support=[cell for cell in record['support'] if cell['nativeIndex'] not in indices]
        if removed:revoked.append({**record,'support':removed})
        if support:authority.append({**record,'support':support})
    overlay['indexedRepairAudit']=authority
    overlay['revokedIndexedRepairAuthority']=overlay.get('revokedIndexedRepairAuthority',[])+revoked
    args.out.write_text(json.dumps(overlay,separators=(',',':')))
    summary={'restoredPoolFloorVertices':len(restored),'excludedCandidates':len(excluded),
        'retainedOtherCorrections':len(overlay['changes']),
        'maximumRestoredM':max((r['toM']-r['fromM'] for r in restored),default=0.),
        'projectedGridVolumeRestoredM3':sum(r['toM']-r['fromM'] for r in restored)*RAW_M**2,
        'excludedByReason':{reason:sum(r['reason']==reason for r in excluded)
                            for reason in sorted({r['reason'] for r in excluded})}}
    args.out.with_suffix('.summary.json').write_text(json.dumps(summary,separators=(',',':')))
    print(json.dumps(summary))


if __name__=='__main__':main()
