import { aimAngles, directionTo, type Vec3 } from "./aimConvergence";

/** Point the shaft through the crosshair without compensating for arrow drop.
 * Gravity acts after release, so the player leads above a distant target when
 * needed. Body yaw follows the camera or target from the actor centre, so
 * nearby ground cannot spin the actor as the drawing hand moves across the
 * sighted point.
 */
export function bowSight({ nock, point, actor, cameraYaw, lockedTarget }: {
  nock: Vec3; point: Vec3; actor: Vec3; cameraYaw: number;
  lockedTarget?: Vec3;
}) {
  const direction = directionTo(nock, point);
  return {
    direction,
    pitch: aimAngles(direction).pitch,
    yaw: lockedTarget
      ? Math.atan2(actor.x - lockedTarget.x, actor.z - lockedTarget.z)
      : cameraYaw,
  };
}
