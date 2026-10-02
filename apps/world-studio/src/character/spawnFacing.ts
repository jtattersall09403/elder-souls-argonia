import * as THREE from "three";

/**
 * The spawn facing (`?yaw=`, compass degrees: 0 north, 90 east; the fly
 * view's `yaw` meaning). The body's heading is the turn of its +z axis
 * about world up (FollowCamera `reset`), x east and z south, so facing
 * compass bearing b is heading π − b. No `yaw`: north, as before.
 */
export function parseSpawnYaw(raw: string | null): number | null {
  if (raw === null || raw.trim() === "") return null;
  const v = Number(raw);
  return Number.isFinite(v) ? v : null;
}

/** Body heading (radians, +z turned about up) facing compass `yawDeg`; null faces north. */
export function spawnHeadingRad(yawDeg: number | null): number {
  return Math.PI - ((yawDeg ?? 0) * Math.PI) / 180;
}

const _z = new THREE.Vector3();
/** Heading of a body's +z axis about world up, radians (the FollowCamera `reset` convention). Allocation-free. */
export function bodyHeadingOf(q: THREE.Quaternion): number {
  _z.set(0, 0, 1).applyQuaternion(q);
  return Math.atan2(_z.x, _z.z);
}
