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
 * yaw produces a restoring torque and the shaft weathercocks onto its path. A
 * shaft with its mass in the wrong place will tumble exactly as a real one does.
 */
export function dragLeverMeters(arrow: ArrowPhysics, shaftLength = ARROW_SHAFT_LENGTH_METERS) {
  return (arrow.forwardOfCentre + FLETCHING_LEVER) * shaftLength;
}

/**
 * Side-on area of the whole shaft plus its vanes, m².
 *
 * The number that was missing. Stabilisation used to be modelled by applying
 * the *axial* drag force at the lever above — cheap, and an order of magnitude
 * too weak, because an arrow's frontal area is a 8 mm circle while the area it
 * presents when yawed is three quarters of a metre of shaft plus the fletching.
 * With the frontal figure the restoring torque gave the shaft a natural period
 * of about two seconds, so it simply could not follow its own velocity vector
 * round an arc; it lagged, drifted off axis and read as a tumble. Built from
 * the side area instead, the period is about a fifth of a second, which is what
 * a real arrow does.
 */
function sideAreaM2(shaftLength: number) {
  return shaftLength * SHAFT_DIAMETER_METERS + FLETCHING_AREA_M2;
}

const SHAFT_DIAMETER_METERS = 0.008;
/** Normal-force coefficient of the yawed shaft. A slender body, side on. */
const YAW_NORMAL_COEFFICIENT = 1.2;

/**
 * The torque that turns a yawed arrow back onto its flight path, N·m.
 *
 * Grows with the sine of the angle between where the shaft points and where it
 * is going, acts about the axis that closes that angle, and is applied at the
 * centre of pressure behind the centre of mass. Returns zero when the shaft is
 * already on its path, and — correctly — when it has stopped, which is why an
 * arrow fired straight up flips over at the top rather than being held rigid.
 */
export function aerodynamicRestoringTorque(
  velocity: Vec3,
  forward: Vec3,
  arrow: ArrowPhysics,
  shaftLength = ARROW_SHAFT_LENGTH_METERS,
  airDensity = AIR_DENSITY,
): Vec3 {
  const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
  if (speed < 1e-6) return { x: 0, y: 0, z: 0 };
  const dx = velocity.x / speed;
  const dy = velocity.y / speed;
  const dz = velocity.z / speed;
  // forward × direction: the axis that rotates the shaft onto its path, with a
  // length that is already sin of the angle between them.
  const ax = forward.y * dz - forward.z * dy;
  const ay = forward.z * dx - forward.x * dz;
  const az = forward.x * dy - forward.y * dx;
  const sine = Math.hypot(ax, ay, az);
  if (sine < 1e-9) return { x: 0, y: 0, z: 0 };
  const magnitude = 0.5 * airDensity * YAW_NORMAL_COEFFICIENT * sideAreaM2(shaftLength)
    * speed * speed * sine * dragLeverMeters(arrow, shaftLength);
  const scale = magnitude / sine;
  return { x: ax * scale, y: ay * scale, z: az * scale };
}

/** Extra leverage the vanes add behind the geometric centre, as a fraction. */
const FLETCHING_LEVER = 0.15;

/**
 * Where the vanes themselves sit behind the centre of mass, in metres.
 *
 * Distinct from `dragLeverMeters`, and the difference matters. That one is the
 * *centre of pressure* — a blend of the whole shaft's side area and the vanes'
 * — and it is the right lever for the restoring torque. This one is the vanes'
 * own position, right at the tail, and it is the right lever for damping,
 * because damping comes from the vanes being dragged sideways through the air
 * as the shaft rotates. The tail is much further back than the centre of
 * pressure, and squaring the difference is most of why a real arrow settles.
 */
export function fletchingLeverMeters(arrow: ArrowPhysics, shaftLength = ARROW_SHAFT_LENGTH_METERS) {
  return (arrow.forwardOfCentre + 0.5) * shaftLength;
}

/**
 * Total side area of the fletching, m². Three vanes of roughly 2.5 in × 0.5 in.
 */
const FLETCHING_AREA_M2 = 0.0024;
/** Flat plate broadside on. The vanes present very nearly that when yawed. */
const FLETCHING_DRAG_COEFFICIENT = 2.0;

/**
 * The torque the air applies against an arrow's *rotation*, N·m.
 *
 * This was missing, and its absence is the whole of the reported tumble. The
 * restoring torque from drag-behind-the-centre-of-mass is a spring: on its own
 * it does not settle a shaft onto its path, it makes the shaft oscillate about
 * that path forever, and the oscillation only becomes obvious once a steep shot
 * slows near the top of its arc and the spring weakens. Air damps that
 * oscillation in reality because the vanes have to be dragged sideways through
 * it, and that is what this adds.
 *
 * Only the tumbling component is damped. Spin about the shaft's own axis is
 * left alone: helical fletching deliberately *induces* roll, and killing it here
 * would be modelling the opposite of what the vanes do.
 */
export function aerodynamicPitchDamping(
  angularVelocity: Vec3,
  velocity: Vec3,
  forward: Vec3,
  arrow: ArrowPhysics,
  shaftLength = ARROW_SHAFT_LENGTH_METERS,
  airDensity = AIR_DENSITY,
): Vec3 {
  const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
  if (speed < 1e-6) return { x: 0, y: 0, z: 0 };
  // Strip the roll component: only rotation across the shaft moves the vanes
  // through the air edge-on.
  const spin = angularVelocity.x * forward.x + angularVelocity.y * forward.y + angularVelocity.z * forward.z;
  const tumble = {
    x: angularVelocity.x - spin * forward.x,
    y: angularVelocity.y - spin * forward.y,
    z: angularVelocity.z - spin * forward.z,
  };
  const lever = fletchingLeverMeters(arrow, shaftLength);
  // Linearised about the flight speed: the sideways speed of a vane is ω × L,
  // its drag is ½ ρ Cd A |v| (ω L), and the torque that makes is that times L.
  const coefficient = 0.5 * airDensity * FLETCHING_DRAG_COEFFICIENT * FLETCHING_AREA_M2
    * lever * lever * speed;
  return { x: -tumble.x * coefficient, y: -tumble.y * coefficient, z: -tumble.z * coefficient };
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
    /**
     * How far ahead of the *body origin* the centre of mass actually ends up.
     *
     * The shaft collider is centred on the origin and the head collider is not,
     * so the two are not the same point — despite a comment that used to say
     * they were. Torques have to be applied about this, or every lever in the
     * flight model is short by this much.
     */
    centreOfMassOffsetMeters: headShare * headOffset,
  };
}

/** Seconds an arrow stays in the world before it is quietly reclaimed. */
export const ARROW_LIFETIME_SECONDS = 8;
