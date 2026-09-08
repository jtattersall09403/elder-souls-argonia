import { aimAngles, directionTo, type Vec3 } from "./aimConvergence";

/** Deliberate elevation above the crosshair ray requested for every player shot. */
export const BOW_SIGHT_ELEVATION_RADIANS = Math.PI / 6;

/** Point the shaft thirty degrees above the line to the crosshair.
 * This is a fixed launch attitude rather than a range-dependent ballistic
 * correction: gravity and drag still act independently after release. Body
 * yaw follows the camera or target from the actor centre, so
 * nearby ground cannot spin the actor as the drawing hand moves across the
 * sighted point.
 */
export function bowSight({ nock, point, actor, cameraYaw, lockedTarget }: {
  nock: Vec3; point: Vec3; actor: Vec3; cameraYaw: number;
  lockedTarget?: Vec3;
}) {
  const direct = directionTo(nock, point);
  const directAngles = aimAngles(direct);
  const pitch = Math.min(Math.PI / 2 - 1e-4, directAngles.pitch + BOW_SIGHT_ELEVATION_RADIANS);
  const horizontal = Math.cos(pitch);
  const direction = {
    x: -Math.sin(directAngles.yaw) * horizontal,
    y: Math.sin(pitch),
    z: -Math.cos(directAngles.yaw) * horizontal,
  };
  return {
    direction,
    pitch,
    yaw: lockedTarget
      ? Math.atan2(actor.x - lockedTarget.x, actor.z - lockedTarget.z)
      : cameraYaw,
  };
}
