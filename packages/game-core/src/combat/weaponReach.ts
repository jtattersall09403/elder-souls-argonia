import type { Vector3 } from "three";

/** Furthest horizontal extent of a capsule from an actor's starting axis.
 * Capsule axes are straight; the maximum of the convex planar norm lies at
 * one of their endpoints. Radius includes the runtime sensor allowance.
 */
export function capsulePlanarReach(a: Vector3, b: Vector3, radius: number): number {
  return Math.max(Math.hypot(a.x, a.z), Math.hypot(b.x, b.z)) + radius;
}
