import type { AnimationState, Vec2 } from "../core/types";
import { cameraRelativeDirection } from "../io/input";
import {
  CHARACTER_BODY_CENTER_HEIGHT,
  CHARACTER_CHEST_ABOVE_BODY_CENTRE,
} from "../physics/characterPhysics";
import type { MovementMode } from "../physics/PlayerMovementController";
import { IMMERSION_COLUMN_METRES } from "../physics/waterSampler";
import { swimSpeed } from "../stats/derived";

/**
 * The thin swim's pure rules (decision 0093, Phase 9a movement only): when a
 * body swims, how fast and which way, which stroke it plays, and the spring
 * that floats it. The runtime samples the water and the controller moves the
 * body; neither decides anything these functions answer.
 */

/**
 * Where the runtime asks the water, metres above the body centre: the top of
 * the 1.7 m body column (feet + 1.7), the point `WaterWorld` reads its
 * immersion over. Immersion is then the fraction of the column under water:
 * 0.62 is water 1.05 m deep at the feet (chest height), 0.45 is 0.77 m.
 */
export const SWIM_SAMPLE_ABOVE_BODY_CENTRE = IMMERSION_COLUMN_METRES - CHARACTER_BODY_CENTER_HEIGHT;

/**
 * Immersion (sampled at the column top) at or above which a walker starts to
 * swim: water 1.05 m deep at the feet, up to the chest.
 */
export const SWIM_ENTER_IMMERSION = 0.62;
/**
 * Immersion under which a swimmer with its feet on ground walks out: water
 * shallower than 0.77 m at the feet.
 */
export const SWIM_LEAVE_IMMERSION = 0.45;

/**
 * The Athletics the player swims at until skills feed movement: the stats
 * model's reference level, where `swimSpeed` gives 1.60 m/s.
 */
export const SWIM_REFERENCE_ATHLETICS = 50;
/** Swim speed at the reference Athletics, m/s. */
export const SWIM_REFERENCE_SPEED = swimSpeed(SWIM_REFERENCE_ATHLETICS);

/**
 * Sprint-swim speed over the swim speed. Default, owner-overridable (lane
 * round 6); decision 0093 §4 left the multiplier open.
 */
export const SWIM_SPRINT_MULTIPLIER = 1.4;

/**
 * How far below a swimmer's feet ground still counts as under them, metres:
 * the "feet find ground" half of leaving the water.
 */
export const SWIM_FEET_REACH = 0.1;

/** Stick magnitude under which a swimmer treads water rather than strokes. */
export const SWIM_STILL_BELOW_MAGNITUDE = 0.08;

/**
 * Angular frequency of the critically damped float spring, rad/s. At 8 an
 * 8 m/s plunge (a fall off the pool edge) dips the chest about 2 cm under the
 * surface before it settles, inside the 3 cm bob the swim is allowed.
 */
export const SWIM_BUOYANCY_OMEGA = 8;

export function swimStateFor({ immersion, grounded, current }: {
  /** `WaterSample.immersion` sampled at the body column's top (`SWIM_SAMPLE_ABOVE_BODY_CENTRE`). */
  immersion: number;
  /** Whether the feet reach ground. */
  grounded: boolean;
  current: MovementMode;
}): MovementMode {
  if (current === "swim") {
    return immersion < SWIM_LEAVE_IMMERSION && grounded ? "grounded" : "swim";
  }
  return immersion >= SWIM_ENTER_IMMERSION ? "swim" : "grounded";
}

/** Planar world velocity from the stick, camera-relative as the walk is. */
export function swimVelocity(input: Vec2, cameraYaw: number, speed: number): { x: number; z: number } {
  const magnitude = Math.hypot(input.x, input.y);
  if (magnitude === 0) return { x: 0, z: 0 };
  const scale = magnitude > 1 ? 1 / magnitude : 1;
  const direction = cameraRelativeDirection({ x: input.x * scale, y: input.y * scale }, cameraYaw);
  return { x: direction.x * speed, z: direction.z * speed };
}

/**
 * Whether a swimmer sprints this frame, and its top speed. The sprint input is
 * the ground's (the dodge control held with the stick pushed); it swims at
 * `SWIM_SPRINT_MULTIPLIER` x the swim speed and the runtime drains stamina at
 * the ground sprint's rate (`COMBAT_TUNING.sprintDrainPerSecond`) while it
 * does. At 0 stamina the sprint stops and stays `exhausted` until the input is
 * let go, so regen does not switch it back on for a frame at a time.
 */
export function swimSprint({ sprintInput, stamina, exhausted }: {
  sprintInput: boolean;
  stamina: number;
  /** The previous frame's `exhausted`. */
  exhausted: boolean;
}): { sprinting: boolean; exhausted: boolean; speed: number } {
  const spent = sprintInput && (exhausted || stamina <= 0);
  const sprinting = sprintInput && !spent;
  return {
    sprinting,
    exhausted: spent,
    speed: SWIM_REFERENCE_SPEED * (sprinting ? SWIM_SPRINT_MULTIPLIER : 1),
  };
}

/**
 * Playback multiplier on the forward stroke. The clip ships at vanilla's slow
 * rate (0.5); vanilla's fast stroke is the same clip at 1.0. The rate follows
 * the swim speed, which follows the stick: 1 up to half stick, 2 at full.
 */
export function swimStrokeRate(magnitude: number): number {
  return Math.min(2, Math.max(1, 2 * magnitude));
}

/**
 * The stroke for a planar world move seen from the body: the larger of its
 * forward and lateral components picks forward, back, left or right.
 */
export function swimClipFor(
  move: { x: number; z: number },
  facing: { x: number; z: number },
  magnitude: number,
): AnimationState {
  if (magnitude < SWIM_STILL_BELOW_MAGNITUDE) return "SWIM_IDLE";
  const forward = move.x * facing.x + move.z * facing.z;
  // The body's right, Y up: facing -z has +x on its right.
  const lateral = move.x * -facing.z + move.z * facing.x;
  if (Math.abs(forward) >= Math.abs(lateral)) return forward >= 0 ? "SWIM_FORWARD" : "SWIM_BACK";
  return lateral > 0 ? "SWIM_RIGHT" : "SWIM_LEFT";
}

/**
 * World Y the float spring pulls the body centre to: the chest at the surface,
 * or standing height over ground the feet reach, whichever is higher.
 */
export function swimBodyTarget(surfaceHeight: number, groundHeight: number | null): number {
  const floating = surfaceHeight - CHARACTER_CHEST_ABOVE_BODY_CENTRE;
  return groundHeight === null ? floating : Math.max(floating, groundHeight + CHARACTER_BODY_CENTER_HEIGHT);
}

/**
 * One frame of the critically damped float spring, solved exactly: the body's
 * offset from its target follows e(t) = (e0 + (v0 + ωe0)t)·e^(−ωt).
 * `velocity` is the mean over the frame (set on the body, it lands on the
 * curve); `nextVelocity` is the curve's own velocity at the frame's end, the
 * `offsetVelocity` to pass next frame.
 */
export function buoyancyStep(
  offset: number,
  offsetVelocity: number,
  dt: number,
  omega = SWIM_BUOYANCY_OMEGA,
): { velocity: number; nextVelocity: number } {
  if (dt <= 0) return { velocity: 0, nextVelocity: offsetVelocity };
  const decay = Math.exp(-omega * dt);
  const drive = offsetVelocity + omega * offset;
  const nextOffset = (offset + drive * dt) * decay;
  return {
    velocity: (nextOffset - offset) / dt,
    nextVelocity: (offsetVelocity - omega * drive * dt) * decay,
  };
}

/**
 * The swimmer's vertical velocity for one frame. Over water too deep to stand
 * in, the float spring (`buoyancyStep`) holds the chest at the surface. Where
 * the feet reach ground and standing height is above the float target, the
 * body stands: it moves to standing height in the frame, as a walker's body
 * follows the ground, because a spring trailing a rising ramp would leave the
 * body low (by 2v/ω, about 12 cm at the swim speed up a 26 degree ramp) and
 * the feet in the ramp.
 */
export function swimVerticalStep({ bodyY, surfaceHeight, groundHeight, floatVelocity, dt }: {
  bodyY: number;
  surfaceHeight: number;
  groundHeight: number | null;
  /** The float spring's own velocity from the previous frame. */
  floatVelocity: number;
  dt: number;
}): { velocity: number; nextVelocity: number } {
  const floating = swimBodyTarget(surfaceHeight, null);
  const target = swimBodyTarget(surfaceHeight, groundHeight);
  if (target > floating && dt > 0) {
    const velocity = (target - bodyY) / dt;
    return { velocity, nextVelocity: velocity };
  }
  return buoyancyStep(bodyY - target, floatVelocity, dt);
}
