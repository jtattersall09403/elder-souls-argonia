"""Restore only audited lower outlets our overlay cut through original pool rims."""
import argparse
import json
from pathlib import Path
import numpy as np
from .compile_chunks import DEFAULT_HEIGHTS
from .terrain_triangles import derive_channel_diagonal_flips
from .water_spill_preservation import retaining_spill_cuts


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('reference',type=Path);parser.add_argument('current',type=Path)
    parser.add_argument('overlay',type=Path);parser.add_argument('--out',type=Path,required=True)
    args=parser.parse_args();original=np.load(DEFAULT_HEIGHTS)
    reference=np.load(args.reference);current=np.load(args.current)
    overlay=json.loads(args.overlay.read_text());n=np.load(DEFAULT_HEIGHTS.parent.parent/'hydrology-pass1.npz')
    flips,_=derive_channel_diagonal_flips(original,n['rivers'],n['flow_to'])
    records=retaining_spill_cuts(original,reference['pool_levels'],reference['filled_levels'],
                               current['filled_levels'],overlay['changes'],flips)
    restored={row['nativeIndex'] for row in records}
    overlay['changes']=[row for row in overlay['changes'] if row[0] not in restored]
    overlay['exceptionIndices']=[index for index in overlay.get('exceptionIndices',[]) if index not in restored]
    overlay['protectedRetainingBankIndices']=sorted(set(overlay.get('protectedRetainingBankIndices',[]))|restored)
    overlay['retainingSpillRestorationAudit']=overlay.get('retainingSpillRestorationAudit',[])+records
    retained_authority=[];revoked=[]
    for record in overlay.get('indexedRepairAudit',[]):
        removed=[cell for cell in record['support'] if cell['nativeIndex'] in restored]
        support=[cell for cell in record['support'] if cell['nativeIndex'] not in restored]
        if removed:revoked.append({**record,'support':removed})
        if support:retained_authority.append({**record,'support':support})
    overlay['indexedRepairAudit']=retained_authority
    overlay['revokedIndexedRepairAuthority']=overlay.get('revokedIndexedRepairAuthority',[])+revoked
    args.out.write_text(json.dumps(overlay,separators=(',',':')))
    summary={'restoredRetainingSpillVertices':len(records),'retainedOtherCorrections':len(overlay['changes']),
             'maximumRestoredM':max((row['toM']-row['fromM'] for row in records),default=0.),
             'affectedOriginalSpillPlanes':len({e['originalSpillM'] for row in records for e in row['originalPoolEvidence']})}
    args.out.with_suffix('.summary.json').write_text(json.dumps(summary,separators=(',',':')))
    print(json.dumps(summary))


if __name__=='__main__':main()
