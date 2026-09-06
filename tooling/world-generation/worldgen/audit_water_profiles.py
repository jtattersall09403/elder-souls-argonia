"""Read-only audit of unresolved reaches against a native repair overlay."""
import argparse
import json
import numpy as np
from scipy import ndimage
from .compile_chunks import DEFAULT_HEIGHTS
from .compile_water import compute
from .scale import RAW_M


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("overlay")
    args = parser.parse_args()
    original = np.load(DEFAULT_HEIGHTS)
    corrected = original.copy()
    overlay = json.load(open(args.overlay))
    for index, height, _ in overlay["changes"]:
        corrected.flat[index] = height
    npz = np.load(DEFAULT_HEIGHTS.parent.parent / "hydrology-pass1.npz")
    result = compute(npz["conditioned"].astype(np.float32), corrected, npz,
                     profiles_only=True, bank_ground=original)
    rows = []
    for source, conflict in result["conflicts"].items():
        point = result["points"][conflict["obstructionNode"]]
        old_bed = float(ndimage.map_coordinates(original, point[:, None], order=1)[0])
        path = result["points"][conflict["pathNodes"]]
        rows.append({"source": int(source), "x": round(float(point[1] * RAW_M), 3),
                     "z": round(float(point[0] * RAW_M), 3),
                     "lengthM": round(float(np.linalg.norm(np.diff(path, axis=0), axis=1).sum() * RAW_M), 3),
                     "excessHeadM": round(conflict["requiredLevelM"] - conflict["bankCapM"], 4),
                     "requiredBedLoweringM": round(old_bed - conflict["bedTargetM"], 4),
                     "poolPinned": abs(conflict["requiredLevelM"] - conflict["obstructionBedM"] - .03) > .002,
                     "path": (path[:, ::-1] * RAW_M).round(3).tolist()})
    print(json.dumps({"count": len(rows), "lengthM": sum(row["lengthM"] for row in rows),
                      "reaches": sorted(rows, key=lambda row: -row["excessHeadM"])}, indent=1))


if __name__ == "__main__":
    main()
