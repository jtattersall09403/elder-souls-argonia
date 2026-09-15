/**
 * The wall that closes the built square (16d).
 *
 * The province is a square of built ground with the border apron beyond it:
 * the apron is scenery with no colliders, so the character is stopped at the
 * edge of the ground it can stand on. Four fixed cuboids do that, placed
 * ENTIRELY outside `[0, extentM]²` with their inner faces on the extent, so
 * nothing inside the square ever starts inside a wall. A smooth vertical face
 * is unclimbable by construction — no flag and no collision group is needed.
 *
 * Pure geometry here; `BoundaryWalls.tsx` creates the Rapier bodies from it.
 */
import { PROVINCE_BOUNDARY } from "@elder-souls/contracts";

export interface BoundaryWallBox {
  /** north | south | west | east — the side of the square it closes. */
  side: "north" | "south" | "west" | "east";
  /** Centre in true metres (y in true metres; the caller applies its scale). */
  centre: [number, number, number];
  halfExtents: [number, number, number];
}

export const BOUNDARY_WALL_THICKNESS_M = 50;

/** The four walls, in true metres. `extentM` is the chunk manifest's
 * `terrainSupportExtentM` (the contract's value is the fallback). */
export function boundaryWallBoxes(
  extentM: number = PROVINCE_BOUNDARY.extentM,
  thicknessM: number = BOUNDARY_WALL_THICKNESS_M,
  bottomY: number = PROVINCE_BOUNDARY.wallBottomY,
  topY: number = PROVINCE_BOUNDARY.wallTopY,
): BoundaryWallBox[] {
  const t = thicknessM / 2;
  const cy = (bottomY + topY) / 2, hy = (topY - bottomY) / 2;
  // The end walls run the full span plus both thicknesses, so the corners are
  // closed and no diagonal gap is left between two walls.
  const spanHalf = extentM / 2 + thicknessM;
  const mid = extentM / 2;
  return [
    { side: "north", centre: [mid, cy, -t], halfExtents: [spanHalf, hy, t] },
    { side: "south", centre: [mid, cy, extentM + t], halfExtents: [spanHalf, hy, t] },
    { side: "west", centre: [-t, cy, mid], halfExtents: [t, hy, spanHalf] },
    { side: "east", centre: [extentM + t, cy, mid], halfExtents: [t, hy, spanHalf] },
  ];
}

/** Does the segment a→b pass through this wall box? Slab test in 3D. */
export function segmentCrossesWall(
  box: BoundaryWallBox,
  a: [number, number, number],
  b: [number, number, number],
): boolean {
  let t0 = 0, t1 = 1;
  for (let axis = 0; axis < 3; axis++) {
    const lo = box.centre[axis] - box.halfExtents[axis], hi = box.centre[axis] + box.halfExtents[axis];
    const d = b[axis] - a[axis];
    if (Math.abs(d) < 1e-12) {
      if (a[axis] < lo || a[axis] > hi) return false;
      continue;
    }
    let near = (lo - a[axis]) / d, far = (hi - a[axis]) / d;
    if (near > far) [near, far] = [far, near];
    t0 = Math.max(t0, near); t1 = Math.min(t1, far);
    if (t0 > t1) return false;
  }
  return true;
}
