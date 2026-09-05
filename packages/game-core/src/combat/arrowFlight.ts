import { AIR_DENSITY, frontalAreaM2, type ArrowPhysics } from "./ballistics";

/**
 * An arrow in the air.
 *
 * The physics engine owns the flight as a rigid body under gravity and
 * **drag** — the same `½ ρ Cd A v²` the offline trajectory integrator and the
 * calibration research use (`docs/research/archery-ballistics.md`), so a shot
 * loses speed downrange and arcs the way a real one does, and damage at impact
 * follows from the speed that is left. What is gone is the *attitude* model
 * (weathercocking torque, pitch damping — round 2): the shaft is pointed along
 * its own velocity every physics step instead, head leading, tail tracing the
 * arc. Owner rulings: no tumble (2026-09-04); keep the ballistics (2026-09-05,
 * "too much of the research work was thrown out").
 *
 * Pure vector maths, no engine types.
 */

export type Vec3 = { x: number; y: number; z: number };

/** Length of a shaft in metres. Matches what the pipeline builds arrows to. */
export const ARROW_SHAFT_LENGTH_METERS = 0.75;

/**
 * Drag force on an arrow travelling at `velocity`, in newtons. Opposes motion
 * and grows with the square of speed; identical to the offline integrator's
 * term, so a shot fired in game and the same shot solved in a test agree.
 */
export function aerodynamicDrag(velocity: Vec3, arrow: ArrowPhysics, airDensity = AIR_DENSITY): Vec3 {
  const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
  if (speed < 1e-6) return { x: 0, y: 0, z: 0 };
  const magnitude = 0.5 * airDensity * arrow.dragCoefficient * frontalAreaM2(arrow) * speed * speed;
  const scale = -magnitude / speed;
  return { x: velocity.x * scale, y: velocity.y * scale, z: velocity.z * scale };
}

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
