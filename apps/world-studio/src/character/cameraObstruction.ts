import type * as THREE from "three";
import type { useRapier } from "@react-three/rapier";
import type { CameraObstructionQuery } from "@elder-souls/game-core/camera/followCamera";
import { CAMERA_QUERY_GROUPS } from "@elder-souls/game-core/camera/cameraCollision";

type RapierContext = ReturnType<typeof useRapier>;

/**
 * The studio's camera obstruction query (16h check-in 2 item 3): a ball of
 * the camera's radius swept from the pivot to the orbit position through the
 * shared Rapier world, against the camera-blocking group only (settlement
 * and terrain colliders; vegetation opts out, cameraCollision.ts). Sensors
 * (hurtboxes, triggers) and moving bodies (the player's capsule, crates) are
 * left out by the flags. Returns the distance to the first hit, or null.
 */
export function rapierCameraObstruction({ world, rapier }: RapierContext): CameraObstructionQuery {
  const identity = { x: 0, y: 0, z: 0, w: 1 };
  const flags = rapier.QueryFilterFlags.EXCLUDE_SENSORS
    | rapier.QueryFilterFlags.EXCLUDE_DYNAMIC
    | rapier.QueryFilterFlags.EXCLUDE_KINEMATIC;
  const balls = new Map<number, InstanceType<RapierContext["rapier"]["Ball"]>>();
  return (from: THREE.Vector3, to: THREE.Vector3, radius: number) => {
    const dx = to.x - from.x; const dy = to.y - from.y; const dz = to.z - from.z;
    const length = Math.hypot(dx, dy, dz);
    if (length < 1e-4) return null;
    let ball = balls.get(radius);
    if (!ball) { ball = new rapier.Ball(radius); balls.set(radius, ball); }
    // Unit direction as the velocity, so time of impact is a distance.
    const hit = world.castShape(
      { x: from.x, y: from.y, z: from.z }, identity,
      { x: dx / length, y: dy / length, z: dz / length },
      ball, 0, length, false, flags, CAMERA_QUERY_GROUPS,
    );
    return hit ? hit.time_of_impact : null;
  };
}
