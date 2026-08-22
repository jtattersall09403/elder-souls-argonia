import { AIR_DENSITY, frontalAreaM2, type ArrowPhysics } from "./ballistics";

/**
 * An arrow in the air.
 *
 * The physics engine owns the flight: an arrow is an ordinary rigid body under
 * gravity, and everything this file adds is the one force a rigid-body solver
 * has no idea about — air. That is deliberate. A hand-integrated projectile has
 * to reinvent collision, sleeping, CCD and interpolation, and gets each of them
 * slightly wrong.
 *
 * Pure vector maths, no engine types, so the same numbers can be tested without
 * a physics world and reused if the engine is ever swapped.
 */

export type Vec3 = { x: number; y: number; z: number };

/** Length of a shaft in metres. Matches what the pipeline builds arrows to. */
export const ARROW_SHAFT_LENGTH_METERS = 0.75;

/**
 * Drag force on an arrow travelling at `velocity`, in newtons.
 *
 * Opposes motion and grows with the square of speed: the same
 * `½ ρ Cd A v²` the offline trajectory integrator uses, so a shot fired in game
 * and the same shot solved in a test agree.
 */
export function aerodynamicDrag(
  velocity: Vec3,
  arrow: ArrowPhysics,
  airDensity = AIR_DENSITY,
): Vec3 {
  const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
  if (speed < 1e-6) return { x: 0, y: 0, z: 0 };
  const magnitude = 0.5 * airDensity * arrow.dragCoefficient * frontalAreaM2(arrow) * speed * speed;
  const scale = -magnitude / speed;
  return { x: velocity.x * scale, y: velocity.y * scale, z: velocity.z * scale };
}

/**
 * How far behind the centre of mass the air actually pushes, in metres.
 *
 * This is the whole reason an arrow flies point-first. Mass is concentrated
 * forward (archery calls it FOC) and the fletching drags at the back, so any
 * yaw produces a restoring torque and the shaft weathercocks onto its path. It
 * is not a stabilising hack: applying drag at this offset rather than at the
 * centre of mass *is* the stabilisation, and a shaft with its mass in the wrong
 * place will tumble exactly as a real one does.
 */
export function dragLeverMeters(arrow: ArrowPhysics, shaftLength = ARROW_SHAFT_LENGTH_METERS) {
  return (arrow.forwardOfCentre + FLETCHING_LEVER) * shaftLength;
}

/** Extra leverage the vanes add behind the geometric centre, as a fraction. */
const FLETCHING_LEVER = 0.15;

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
 * made of two colliders ends up with the right centre of mass *and* the right
 * inertia.
 *
 * Both halves matter, and the second one is easy to get wrong. Modelling an
 * arrow as one short collider gives a body whose moment of inertia is an order
 * of magnitude too small, and the tiny aerodynamic torque that should gently
 * weathercock a real shaft instead spins the model end over end within a few
 * metres of the bow. The mass has to be spread over the arrow's actual length.
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
  };
}

/** Seconds an arrow stays in the world before it is quietly reclaimed. */
export const ARROW_LIFETIME_SECONDS = 8;
