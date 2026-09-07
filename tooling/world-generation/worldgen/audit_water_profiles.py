"""Read-only audit of unresolved reaches against a native repair overlay."""
import argparse
import hashlib
import json
from pathlib import Path
import numpy as np
from .terrain_triangles import sample_terrain, derive_channel_diagonal_flips
from .compile_chunks import DEFAULT_HEIGHTS
from .compile_water import compute
from .scale import RAW_M


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("overlay",nargs='?')
    parser.add_argument("--original",action="store_true",help="Build the immutable-source reference once, without repairs")
    parser.add_argument("--summary", action="store_true")
    parser.add_argument("--details", action="store_true")
    parser.add_argument("--orientation", help="Matching immutable pre-repair orientation cache")
    parser.add_argument("--out", type=Path, help="Write the generated audit instead of printing full details")
    parser.add_argument("--solver-cache", type=Path, help="Save matching geometry and physical pool planes for bounded route audits")
    parser.add_argument("--immutable-potential", type=Path)
    parser.add_argument("--routing-overrides", type=Path)
    parser.add_argument("--reference-pools",type=Path,help="Immutable-source solver cache supplying retained pool planes")
    parser.add_argument("--seasonal-profile", type=Path, help="Matching explicit seasonal proposal; stage verification still requires full compilation")
    args = parser.parse_args()
    if bool(args.overlay)==bool(args.original):
        parser.error('Supply either a repair overlay or --original')
    if args.original and args.seasonal_profile:
        parser.error('--seasonal-profile cannot redefine the immutable original reference')
    from .water_channel_response import load_seasonal_profile
    seasonal_profile = load_seasonal_profile(args.seasonal_profile) if args.seasonal_profile else None
    original = np.load(DEFAULT_HEIGHTS)
    corrected = original.copy()
    overlay = json.load(open(args.overlay)) if args.overlay else {'changes':[]}
    for index, height, _ in overlay["changes"]:
        corrected.flat[index] = height
    npz = np.load(DEFAULT_HEIGHTS.parent.parent / "hydrology-pass1.npz")
    flips, _ = derive_channel_diagonal_flips(original, npz['rivers'], npz['flow_to'])
    reference_pools=np.load(args.reference_pools) if args.reference_pools else None
    if args.original:
        result=compute(npz['conditioned'].astype(np.float32),original,npz,profiles_only=True,
                       bank_ground=original,terrain_flips=flips,close_reference_domains=True)
        intent=result['desired_levels'][:len(result['original_links'])].copy()
    elif args.orientation:
        intent = np.load(args.orientation)
    else:
        reference = compute(npz['conditioned'].astype(np.float32), original, npz,
                            profiles_only=True, bank_ground=original, terrain_flips=flips, close_reference_domains=True)
        intent = reference['desired_levels'][:len(reference['original_links'])].copy()
        del reference
    routing_audit = json.loads(args.routing_overrides.read_text()) if args.routing_overrides else {}
    if not args.original:
        result = compute(npz["conditioned"].astype(np.float32), corrected, npz,
                     profiles_only=True, bank_ground=original, terrain_flips=flips, orientation_levels=intent,
                     seasonal_profile=seasonal_profile,
                     immutable_potential=(np.load(args.immutable_potential) if args.immutable_potential else
                                          reference_pools['filled_levels'] if reference_pools is not None else None),
                     reference_pool_levels=reference_pools['pool_levels'] if reference_pools is not None else None,
                     routing_overrides={int(k):v for k,v in routing_audit.get('overrides', {}).items()},
                     station_overrides={int(k):v for k,v in routing_audit.get('stationOverrides', {}).items()})
    if args.solver_cache:
        provenance={'terrain_source_sha256':hashlib.sha256(DEFAULT_HEIGHTS.read_bytes()).hexdigest()}
        if args.overlay:provenance['terrain_overlay_sha256']=hashlib.sha256(Path(args.overlay).read_bytes()).hexdigest()
        if args.routing_overrides:provenance['routing_audit_sha256']=hashlib.sha256(args.routing_overrides.read_bytes()).hexdigest()
        if args.seasonal_profile:provenance['seasonal_profile_sha256']=hashlib.sha256(args.seasonal_profile.read_bytes()).hexdigest()
        from .water_profile_cache import save_profile_cache
        save_profile_cache(args.solver_cache, result, intent, **provenance)
    rows = []
    for source, conflict in result["conflicts"].items():
        point = result["points"][conflict["obstructionNode"]]
        old_bed = float(sample_terrain(original, point[:, None], flips)[0])
        path = result["points"][conflict["pathNodes"]]
        rows.append({"source": int(source), "x": round(float(point[1] * RAW_M), 3),
                     "z": round(float(point[0] * RAW_M), 3),
                     "lengthM": round(float(np.linalg.norm(np.diff(path, axis=0), axis=1).sum() * RAW_M), 3),
                     "excessHeadM": round(conflict["requiredLevelM"] - conflict["bankCapM"], 4),
                     "requiredBedLoweringM": round(old_bed - conflict["bedTargetM"], 4),
                     "currentObstructionBedM": round(conflict["obstructionBedM"], 6),
                     "requiredLevelM": round(conflict["requiredLevelM"], 6),
                     "receivingBankCapM": round(conflict["bankCapM"], 6),
                     "bedTargetM": round(conflict["bedTargetM"], 6),
                     "poolPinned": bool(conflict.get('obstructionPinned', False)),
                     "path": (path[:, ::-1] * RAW_M).round(3).tolist()})
    if args.summary:
        rows = [{k: v for k, v in row.items() if k != "path"} for row in rows]
    if args.details:
        def original_bank(index):
            from .water_bank_sections import bank_crest_heights
            point = result['points'][index]
            normal = result['diagnostics']['bankNormals'][index]
            radius = result['diagnostics']['bankRadius'][index]
            return float(min(bank_crest_heights(original, [point], [normal*sign], [radius], flips)[0]
                             for sign in (-1, 1)) - .005)
        for row in rows:
            source = row['source']
            conflict = result['conflicts'][source]
            row['rawConflict'] = conflict
            row['sourceCell'] = int(result['cell_indices'][source])
            nodes = sorted(set(conflict['pathNodes'] + conflict.get('drainageNodes', [])))
            row['nodes'] = [{'index': int(i), 'position': result['points'][i].tolist(),
                             'desired': float(result['desired_levels'][i]), 'level': float(result['levels'][i]),
                             'bed': float(sample_terrain(corrected, result['points'][i, :, None], flips)[0]),
                             'originalBed': float(sample_terrain(original, result['points'][i, :, None], flips)[0]),
                             'bankCap': float(result['diagnostics']['bankCap'][i]),
                             'depthTarget': float(result['diagnostics']['depthTargets'][i]),
                             'pinned': bool(result['diagnostics']['pinned'][i]),
                             'falling': bool(result['diagnostics']['falling'][i]),
                             'bankNormal': result['diagnostics']['bankNormals'][i].tolist(),
                             'bankRadius': float(result['diagnostics']['bankRadius'][i])}
                            for i in nodes]
            for node in row['nodes']:
                node['originalBankCap'] = original_bank(node['index'])
    report = {"count": len(rows), "lengthM": sum(row["lengthM"] for row in rows),
              "seasonalRecoveredCount": len(result['seasonal_sources']),
              "seasonalResponseVerified": False,
              "reaches": sorted(rows, key=lambda row: -row["excessHeadM"])}
    if args.out:
        args.out.write_text(json.dumps(report, separators=(',', ':')))
        print(json.dumps({'count': len(rows), 'out': str(args.out)}))
    else:
        print(json.dumps(report, indent=1))


if __name__ == "__main__":
    main()
