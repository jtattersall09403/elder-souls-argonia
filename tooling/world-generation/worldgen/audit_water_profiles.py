"""Read-only audit of unresolved reaches against a native repair overlay."""
import argparse
import json
import numpy as np
from .terrain_triangles import sample_terrain, derive_channel_diagonal_flips
from .compile_chunks import DEFAULT_HEIGHTS
from .compile_water import compute
from .scale import RAW_M


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("overlay")
    parser.add_argument("--summary", action="store_true")
    parser.add_argument("--details", action="store_true")
    args = parser.parse_args()
    original = np.load(DEFAULT_HEIGHTS)
    corrected = original.copy()
    overlay = json.load(open(args.overlay))
    for index, height, _ in overlay["changes"]:
        corrected.flat[index] = height
    npz = np.load(DEFAULT_HEIGHTS.parent.parent / "hydrology-pass1.npz")
    flips, _ = derive_channel_diagonal_flips(original, npz['rivers'], npz['flow_to'])
    reference = compute(npz['conditioned'].astype(np.float32), original, npz,
                        profiles_only=True, bank_ground=original, terrain_flips=flips)
    intent = reference['desired_levels'][:len(reference['original_links'])].copy()
    del reference
    result = compute(npz["conditioned"].astype(np.float32), corrected, npz,
                     profiles_only=True, bank_ground=original, terrain_flips=flips, orientation_levels=intent)
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
                     "poolPinned": abs(conflict["requiredLevelM"] - conflict["obstructionBedM"] - .03) > .002,
                     "path": (path[:, ::-1] * RAW_M).round(3).tolist()})
    if args.summary:
        rows = [{k: v for k, v in row.items() if k != "path"} for row in rows]
    if args.details:
        for row in rows:
            source = row['source']
            conflict = result['conflicts'][source]
            row['rawConflict'] = conflict
            row['sourceCell'] = int(result['cell_indices'][source])
            nodes = sorted(set(conflict['pathNodes'] + conflict.get('drainageNodes', [])))
            row['nodes'] = [{'index': int(i), 'position': result['points'][i].tolist(),
                             'desired': float(result['desired_levels'][i]), 'level': float(result['levels'][i]),
                             'bed': float(sample_terrain(corrected, result['points'][i, :, None], flips)[0])}
                            for i in nodes]
    print(json.dumps({"count": len(rows), "lengthM": sum(row["lengthM"] for row in rows),
                      "reaches": sorted(rows, key=lambda row: -row["excessHeadM"])}, indent=1))


if __name__ == "__main__":
    main()
