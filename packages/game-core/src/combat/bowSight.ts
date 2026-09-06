import type { RangedStats } from "../equipment/types";
import { DEFAULT_ARROW_GRAVITY_SCALE } from "./arrowFlight";
import { aimAngles, directionTo, type Vec3 } from "./aimConvergence";
import { launchSpeed, type ArrowPhysics } from "./ballistics";
import { solveBowAim } from "./solveBowAim";

/** Full-draw sight calibration is independent of the current draw strength.
 * A weaker shot uses the same sight and falls short. Body yaw follows the
 * camera or target from the actor centre, so nearby ground cannot spin the
 * actor as the drawing hand moves across the sighted point.
 */
export function bowSight({ nock, point, actor, cameraYaw, lockedTarget, ranged, arrow,
  surface, gravityScale = DEFAULT_ARROW_GRAVITY_SCALE }: {
  nock: Vec3; point: Vec3; actor: Vec3; cameraYaw: number;
  lockedTarget?: Vec3; ranged: RangedStats; arrow?: ArrowPhysics;
  surface: boolean; gravityScale?: number;
}) {
  const direction = surface && arrow
    ? solveBowAim(nock, point, launchSpeed(ranged, arrow, 1), arrow, gravityScale) ?? directionTo(nock, point)
    : directionTo(nock, point);
  return {
    direction,
    pitch: aimAngles(direction).pitch,
    yaw: lockedTarget
      ? Math.atan2(actor.x - lockedTarget.x, actor.z - lockedTarget.z)
      : cameraYaw,
  };
}
