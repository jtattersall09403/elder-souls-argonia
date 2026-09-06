import { aimElevation } from "../ai/enemyBow";
import { ARROW_SHAFT_LENGTH_METERS } from "./arrowFlight";
import { directionTo, type Vec3 } from "./aimConvergence";
import type { ArrowPhysics } from "./ballistics";

/** Solve the low arc to a sighted surface. The collision tip starts one shaft
 * length ahead of the nock; include that offset in both height and range.
 * Null means unreachable at this draw, so callers retain the sight direction.
 */
export function solveBowAim(nock: Vec3, target: Vec3, speed: number, arrow: ArrowPhysics, gravityScale = 1): Vec3 | null {
  const direct = directionTo(nock, target);
  const range = Math.hypot(target.x - nock.x, target.z - nock.z);
  if (range < 1e-5) return null;
  let pitch = Math.atan2(direct.y, Math.hypot(direct.x, direct.z));
  for (let iteration = 0; iteration < 3; iteration++) {
    const elevation = aimElevation(speed, arrow,
      range - ARROW_SHAFT_LENGTH_METERS * Math.cos(pitch),
      target.y - nock.y - ARROW_SHAFT_LENGTH_METERS * Math.sin(pitch), gravityScale);
    if (elevation === null) return null;
    pitch = elevation;
  }
  return { x: (target.x - nock.x) / range * Math.cos(pitch), y: Math.sin(pitch),
    z: (target.z - nock.z) / range * Math.cos(pitch) };
}
