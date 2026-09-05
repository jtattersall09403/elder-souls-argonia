import * as THREE from "three";

import type { HurtboxBone } from "./hurtbox";

/**
 * Where a shaft is actually left standing.
 *
 * Rapier reports a sensor overlap a step late and with no contact manifold, so
 * the arrow's own position at the moment combat hears about the hit is
 * wherever the body happened to be that step — up to a metre short of the
 * target at speed, and *outside* the fitted capsule at any speed. Planting the
 * shaft there is what left arrows hanging in the air beside a body (owner,
 * round 8).
 *
 * The fix is geometric and has nothing to do with the sensor: take the flight
 * line, walk it back far enough to be clear of the actor, and find where it
 * first crosses a hurtbox capsule's true surface. That point is on the body by
 * construction, whether the report landed short or past, and the same call
 * serves the player and every enemy.
 */

/**
 * How far back along the flight line the search starts, in metres.
 *
 * One physics step at a full-draw 60 m/s is a metre; two metres of run-up
 * clears the fastest shot in the game with room to spare, and costs nothing
 * because the ray only ever meets the capsules of the actor that reported.
 */
export const PLANT_SEARCH_BACKOFF_METERS = 2;

/**
 * Distance along a ray to the first crossing of a capsule's surface, or null.
 *
 * Capsule as a segment `from`–`to` with a radius: the body of the cylinder
 * first, then whichever cap the solution ran off the end of. `direction` must
 * be a unit vector; the ray is one-sided, so a capsule behind the origin does
 * not count.
 */
export function rayCapsuleEntry(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  from: THREE.Vector3,
  to: THREE.Vector3,
  radius: number,
): number | null {
  const ba = new THREE.Vector3().subVectors(to, from);
  const oa = new THREE.Vector3().subVectors(origin, from);
  const baba = ba.dot(ba);
  const bard = ba.dot(direction);
  const baoa = ba.dot(oa);
  const rdoa = direction.dot(oa);
  const oaoa = oa.dot(oa);

  const a = baba - bard * bard;
  const b = baba * rdoa - baoa * bard;
  const c = baba * oaoa - baoa * baoa - radius * radius * baba;
  const h = b * b - a * c;
  if (Math.abs(a) > 1e-12 && h >= 0) {
    const t = (-b - Math.sqrt(h)) / a;
    const y = baoa + t * bard;
    if (y > 0 && y < baba) return t >= 0 ? t : null;
  }
  // Off the end of the cylinder, or a ray running along the axis: the caps are
  // spheres, and the nearer of the two is the one the flight line meets first.
  let best: number | null = null;
  for (const centre of [from, to]) {
    const oc = new THREE.Vector3().subVectors(origin, centre);
    const bb = direction.dot(oc);
    const cc = oc.dot(oc) - radius * radius;
    const hh = bb * bb - cc;
    if (hh < 0) continue;
    const t = -bb - Math.sqrt(hh);
    if (t >= 0 && (best === null || t < best)) best = t;
  }
  return best;
}

/** Nearest point on a capsule's *surface* to an arbitrary point. */
export function closestPointOnCapsuleSurface(
  point: THREE.Vector3,
  from: THREE.Vector3,
  to: THREE.Vector3,
  radius: number,
  outward: THREE.Vector3,
): THREE.Vector3 {
  const ba = new THREE.Vector3().subVectors(to, from);
  const lengthSq = ba.dot(ba);
  const t = lengthSq > 1e-12
    ? Math.min(1, Math.max(0, new THREE.Vector3().subVectors(point, from).dot(ba) / lengthSq))
    : 0;
  const axisPoint = new THREE.Vector3().copy(from).addScaledVector(ba, t);
  const away = new THREE.Vector3().subVectors(point, axisPoint);
  // A point sitting exactly on the axis has no "outward"; use the caller's
  // direction (the way the arrow came from) rather than an arbitrary axis.
  if (away.lengthSq() < 1e-10) away.copy(outward);
  away.normalize();
  return axisPoint.addScaledVector(away, radius);
}

/** A posed hurtbox capsule in world space. */
export type PosedCapsule = { segment: HurtboxBone; from: THREE.Vector3; to: THREE.Vector3 };

/** Pose every capsule of a rig into world space. */
export function poseHurtbox(segments: readonly HurtboxBone[]): PosedCapsule[] {
  return segments.map((segment) => {
    segment.bone.updateWorldMatrix(true, false);
    return {
      segment,
      from: segment.from.clone().applyMatrix4(segment.bone.matrixWorld),
      to: segment.to.clone().applyMatrix4(segment.bone.matrixWorld),
    };
  });
}

/**
 * The bone an arrow struck and the point on its surface to plant the shaft at.
 *
 * `contact` is where the arrow was when the sensor reported and `direction` is
 * the way it was travelling (unit). Whichever capsule the flight line enters
 * first is the one that was hit — which also answers "head or thigh" better
 * than the nearest capsule centre does, because a shaft passing *by* a
 * shoulder never enters it. When the line misses every capsule (the report can
 * arrive after the body has already moved on), the nearest capsule's surface
 * point is used: still on the body, never in the air beside it.
 */
export function resolveArrowPlant(
  posed: readonly PosedCapsule[],
  contact: THREE.Vector3,
  direction: THREE.Vector3,
  backoffMeters = PLANT_SEARCH_BACKOFF_METERS,
): { segment: HurtboxBone; point: THREE.Vector3 } | null {
  if (posed.length === 0) return null;
  const unit = direction.lengthSq() > 1e-12
    ? direction.clone().normalize()
    : new THREE.Vector3(0, 0, 1);
  const origin = contact.clone().addScaledVector(unit, -backoffMeters);

  let hit: { segment: HurtboxBone; point: THREE.Vector3 } | null = null;
  let bestT = Infinity;
  for (const capsule of posed) {
    const t = rayCapsuleEntry(origin, unit, capsule.from, capsule.to, capsule.segment.radius);
    if (t === null || t >= bestT) continue;
    bestT = t;
    hit = { segment: capsule.segment, point: origin.clone().addScaledVector(unit, t) };
  }
  if (hit) return hit;

  let nearest: PosedCapsule | null = null;
  let bestDistance = Infinity;
  const axisPoint = new THREE.Vector3();
  for (const capsule of posed) {
    axisPoint.addVectors(capsule.from, capsule.to).multiplyScalar(0.5);
    const distance = axisPoint.distanceTo(contact) - capsule.segment.radius;
    if (distance < bestDistance) {
      bestDistance = distance;
      nearest = capsule;
    }
  }
  if (!nearest) return null;
  return {
    segment: nearest.segment,
    point: closestPointOnCapsuleSurface(
      contact,
      nearest.from,
      nearest.to,
      nearest.segment.radius,
      unit.clone().negate(),
    ),
  };
}
