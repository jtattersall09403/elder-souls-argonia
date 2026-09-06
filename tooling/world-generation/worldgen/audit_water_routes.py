"""Bounded route candidates, validated against a saved physical solver state."""
import argparse
import json
import time
from pathlib import Path
import numpy as np
from .compile_chunks import DEFAULT_HEIGHTS
from .scale import RAW_M
from .terrain_triangles import derive_channel_diagonal_flips, sample_terrain
from .water_geometry import condition_channel_profiles, repair_channel_beds
from .water_route_alternatives import bank_aware_route, route_peak


def path_indices(state, source):
    target = state['original_links'][source]
    path = [source]
    while path[-1] != target:
        following = int(state['links'][path[-1]])
        if following < 0 or following in path:
            raise ValueError('Broken saved reach')
        path.append(following)
    return path


def replace_paths(state, replacements):
    count = len(state['original_links'])
    points = list(state['points'][:count])
    levels = list(state['desired_levels'][:count])
    radius = list(state['radius'][:count])
    raw_depths=state.get('semantic_depth_targets',state['diagnostic_depthTargets'])
    depths = list(raw_depths[:count])
    links = list(state['original_links'])
    for source, target in enumerate(state['original_links']):
        if target < 0:
            continue
        old = path_indices(state, source)
        if source in replacements:
            path = replacements[source]
            samples = [path[0]]
            for a, b in zip(path, path[1:]):
                steps = max(1, int(np.ceil(np.linalg.norm(b - a))))
                samples.extend(a + (b-a)*j/steps for j in range(1,steps+1))
            samples = np.asarray(samples)
            distance = np.r_[0., np.cumsum(np.linalg.norm(np.diff(samples, axis=0), axis=1))]
            f = distance/max(distance[-1],1e-9)
            ys = state['desired_levels'][source]*(1-f)+state['desired_levels'][target]*f
            rs = state['radius'][source]*(1-f)+state['radius'][target]*f
            ds = raw_depths[source]*(1-f)+raw_depths[target]*f
        else:
            samples, ys, rs = (state[key][old] for key in ('points','desired_levels','radius'))
            ds=raw_depths[old]
        previous = source
        for point,y,r,d in zip(samples[1:-1],ys[1:-1],rs[1:-1],ds[1:-1]):
            index = len(points)
            points.append(point);levels.append(y);radius.append(r);depths.append(d)
            links[previous]=index;links.append(int(target));previous=index
    return {**state, 'points':np.asarray(points), 'links':np.asarray(links),
            'desired_levels':np.asarray(levels,np.float32), 'radius':np.asarray(radius),
            'diagnostic_depthTargets':np.asarray(depths),'semantic_depth_targets':np.asarray(depths)}


def solve(ground, state, flips):
    diagnostics = {}
    result = condition_channel_profiles(ground,state['points'],state['links'],state['desired_levels'],
        state['radius'],len(state['original_links']),state['original_links'],state['pool_levels'],
        terrain_flips=flips,orientation_levels=state['orientation_levels'],diagnostics=diagnostics,
        minimum_depth=state.get('semantic_depth_targets',state['diagnostic_depthTargets']),strict_banks=True,metres_per_pixel=RAW_M,
        allow_freefall=True,marine_ground=state['marine_ground'])
    diagnostics['solvedHeads']=result[0]
    return result[-1], diagnostics


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('state',type=Path);parser.add_argument('overlay',type=Path)
    parser.add_argument('--out',type=Path,required=True)
    parser.add_argument('--source',type=int,action='append')
    args=parser.parse_args()
    original=np.load(DEFAULT_HEIGHTS);ground=original.copy()
    overlay=json.loads(args.overlay.read_text())
    protected={i:0. for i in overlay.get('protectedRetainingBankIndices',[])}
    for i,h,_ in overlay['changes']:ground.flat[i]=h
    state=dict(np.load(args.state))
    hydrology=np.load(DEFAULT_HEIGHTS.parent.parent/'hydrology-pass1.npz')
    flips,_=derive_channel_diagonal_flips(original,hydrology['rivers'],hydrology['flow_to'])
    conflicts,_=solve(ground,state,flips)
    baseline=set(conflicts);accepted={};rows=[]
    for source in args.source or sorted(conflicts):
        start=time.monotonic()
        indices=path_indices(state,source)
        old=state['points'][indices]
        # Midpoints introduced solely for diagonal sampling are not lattice
        # decisions; preserve the original integer route for the search.
        old=old[np.r_[True,np.any(np.abs(old[1:-1]-np.rint(old[1:-1]))>1e-6,axis=1)==False,True]]
        target=int(state['original_links'][source]);radius=min(state['radius'][source],state['radius'][target])
        candidate=bank_aware_route(original,old,radius,float(state['diagnostic_depthTargets'][source]),
                                 min(radius,2.),flips)
        if np.array_equal(old,candidate):
            rows.append({'source':source,'status':'same-path'});continue
        proposed={**accepted,source:candidate}
        geometry=replace_paths(state,proposed)
        trial=ground.copy()
        before,_=solve(trial,geometry,flips)
        # Repair only failing reaches affected by the candidate. Independent
        # baseline failures cannot justify unrelated extra excavation.
        rounds=0
        while True:
            failed,diagnostics=solve(trial,geometry,flips)
            relevant={i:c for i,c in failed.items() if i==source or i not in baseline}
            if not relevant:break
            old_ground=trial.copy()
            changes=repair_channel_beds(original,trial,geometry['points'],relevant,max_lowering=3.,
                terrain_flips=flips,depth_targets=diagnostics['depthTargets'],pinned=diagnostics['pinned'],
                links=geometry['links'],radius=diagnostics['bankRadius'],bank_normals=diagnostics['bankNormals'],
                indexed_limits=protected)
            rounds+=1
            if not changes or float(np.max(old_ground-trial))<1e-4:break
        failed,_=solve(trial,geometry,flips)
        new=set(failed)-baseline
        success=source not in failed and not new and len(failed)<len(conflicts)
        row={'source':source,'cell':int(state['cell_indices'][source]),'status':'accepted' if success else 'rejected',
             'oldPath':old.tolist(),'path':candidate.tolist(),'originalPeakM':route_peak(original,old,flips),
             'candidatePeakM':route_peak(original,candidate,flips),'remaining':len(failed),'newFailures':sorted(new),
             'resolved':sorted(set(conflicts)-set(failed)),
             'changedVertices':int(np.count_nonzero(trial!=ground)),
             'maximumOriginalLoweringM':float(np.max(original-trial)), 'rounds':rounds,
             'seconds':round(time.monotonic()-start,2)}
        rows.append(row)
        if success:
            accepted[source]=candidate;ground=trial;conflicts=failed;baseline=set(failed)
        print(json.dumps({k:v for k,v in row.items() if k not in ('oldPath','path')}),flush=True)
        args.out.write_text(json.dumps({'schemaVersion':1,'candidates':rows,
            'overrides':{str(int(state['cell_indices'][i])):p.tolist() for i,p in accepted.items()}},separators=(',',':')))
    indices=np.flatnonzero(ground.ravel()<original.ravel()-1e-6)
    args.out.write_text(json.dumps({'schemaVersion':1,'candidates':rows,
        'overrides':{str(int(state['cell_indices'][i])):p.tolist() for i,p in accepted.items()}},separators=(',',':')))
    overlay['changes']=[[int(i),round(float(ground.flat[i]),6),round(float(original.flat[i]),6)] for i in indices]
    args.out.with_suffix('.bed-overlay.json').write_text(json.dumps(overlay,separators=(',',':')))


if __name__=='__main__':main()
