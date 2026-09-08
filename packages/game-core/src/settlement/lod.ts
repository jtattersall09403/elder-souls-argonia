export interface ArchitectureLodContract {
  absoluteTriangleFloor: readonly [number, number];
  distancePerFootprintDiagonal: readonly [number, number];
  farMergeDistanceM: number;
}

/** One and only one full-vs-LOD decision for a placed building. */
export function architectureLod(
  distanceM: number,
  footprintDiagonalM: number,
  availableLevels: number,
  contract: ArchitectureLodContract,
  drawScale = 1,
): { level: number; farMerged: boolean } {
  if (availableLevels < 3) throw new Error("architecture asset is missing a three-tier LOD chain");
  const d0 = Math.max(55, footprintDiagonalM * contract.distancePerFootprintDiagonal[0]) * drawScale;
  const d1 = Math.max(180, footprintDiagonalM * contract.distancePerFootprintDiagonal[1]) * drawScale;
  const level = distanceM < d0 ? 0 : distanceM < d1 ? 1 : 2;
  return { level, farMerged: distanceM >= contract.farMergeDistanceM * drawScale };
}

export function validateLodTriangles(
  triangles: readonly number[],
  contract: ArchitectureLodContract,
): void {
  if (triangles.length < 3) throw new Error("architecture asset is missing a three-tier LOD chain");
  // A six-triangle prop cannot have a 120-triangle decimation floor. The
  // absolute floor is capped by the source mesh, but never expressed only as
  // a percentage (the architecture failure the contract prevents).
  if (triangles[1] < Math.min(triangles[0], contract.absoluteTriangleFloor[0])
      || triangles[2] < Math.min(triangles[0], contract.absoluteTriangleFloor[1])) {
    throw new Error("architecture LOD fell below its absolute triangle floor");
  }
}
