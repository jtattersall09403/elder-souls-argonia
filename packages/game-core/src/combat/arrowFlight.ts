import type { ArrowPhysics } from "./ballistics";

/**
 * An arrow in the air.
 *
 * The physics engine owns the flight as a rigid body under gravity and
 * nothing else — no drag, no aerodynamic torque, no damping. The shaft is
 * *pointed* along its own velocity every physics step rather than being turned
 * by simulated air, so it traces its arc head-first with the tail following
 * behind, exactly as a picture of an arrow does.
 *
 * That is a deliberate retreat from the aerodynamic model this file used to
 * hold (drag, weathercocking torque, pitch damping — round 2 of the combat
 * pass). The model was physically defensible and still read as a tumble in
 * play, because the restoring torque is a spring with a period of a fraction of
 * a second and the *visible* result of that on a 0.75 m stick is a wobble no
 * archer would recognise. Owner ruling (2026-09-04): arrows follow smooth arcs
 * from the bow's launch speed and gravity, head leading, tail tracing the arc.
 * Damage still comes from speed at impact (`resolveArrowImpact`), which without
 * drag is simply the launch speed plus whatever gravity added on the way down.
 *
 * Pure vector maths, no engine types.
 */

export type Vec3 = { x: number; y: number; z: number };

/** Length of a shaft in metres. Matches what the pipeline builds arrows to. */
export const ARROW_SHAFT_LENGTH_METERS = 0.75;

/**
 * The direction the shaft should point, given how it is moving.
 *
 * Unit vector along the velocity, or null when there is no meaningful motion
 * to follow (the body is at rest, or so nearly at rest that the direction
 * would be noise) — the caller keeps the last attitude in that case rather than
 * snapping to something arbitrary.
 */
export function flightAttitude(velocity: Vec3, minimumSpeed = 0.05): Vec3 | null {
  const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
  if (!(speed > minimumSpeed)) return null;
  return { x: velocity.x / speed, y: velocity.y / speed, z: velocity.z / speed };
}

/**
 * How squarely an arrow arrived, in radians. Zero is dead-on.
 *
 * Measured as the angle between the arrow's path and the direction from it to
 * the centre of what it hit, rather than against a surface normal. Rapier
 * reports a sensor overlap without a contact manifold and reports it a step
 * late — by which time a shaft doing 45 m/s has its origin *past* the surface,
 * so a normal taken from the reported position points the wrong way and reads
 * every square hit as a 180 degree glance. Approach angle has neither problem:
 * it is exact for a sphere, close enough for the capsules a body is made of,
 * and it still tells a shot through the chest from one that clips a shoulder.
 */
export function impactObliquity(velocity: Vec3, contact: Vec3, targetCentre: Vec3) {
  const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
  const tx = targetCentre.x - contact.x;
  const ty = targetCentre.y - contact.y;
  const tz = targetCentre.z - contact.z;
  const toCentre = Math.hypot(tx, ty, tz);
  if (speed < 1e-6 || toCentre < 1e-6) return 0;
  // Split the offset to the centre into a part along the flight line and a
  // part across it. The angle between them is how far off-axis the shot was,
  // and taking the along-track part's magnitude makes the answer the same
  // whether the report lands just short of the target or just past it.
  const along = (velocity.x * tx + velocity.y * ty + velocity.z * tz) / speed;
  const across = Math.sqrt(Math.max(0, toCentre * toCentre - along * along));
  return Math.atan2(across, Math.abs(along));
}

/**
 * How the arrow's mass is split between shaft and head, so that a rigid body
 * made of two colliders carries the arrow's real mass with a head-heavy
 * centre of mass.
 *
 * With rotation locked and the attitude set from the velocity, the inertia no
 * longer matters to the flight; the split is kept because the head collider is
 * what the point actually strikes with, and the mass is what a hit resolves
 * damage from.
 */
export function arrowMassSplit(arrow: ArrowPhysics, shaftLength = ARROW_SHAFT_LENGTH_METERS) {
  const headOffset = shaftLength * 0.46;
  const wantedCentreOfMass = arrow.forwardOfCentre * shaftLength;
  // m_head × headOffset = wantedCoM × m_total, with the shaft's own mass
  // centred at zero.
  const headShare = Math.min(0.6, Math.max(0, wantedCentreOfMass / headOffset));
  return {
    headOffsetMeters: headOffset,
    headMassKg: arrow.massKg * headShare,
    shaftMassKg: arrow.massKg * (1 - headShare),
    shaftHalfLengthMeters: shaftLength / 2,
    /** How far ahead of the body origin the centre of mass ends up. */
    centreOfMassOffsetMeters: headShare * headOffset,
  };
}

/** Seconds an arrow stays in the world before it is quietly reclaimed. */
export const ARROW_LIFETIME_SECONDS = 8;
