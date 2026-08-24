import type { CapabilityProfile, CapabilityProfileId } from "@elder-souls/contracts";
import {
  CHARACTER_CAPSULE_HALF_HEIGHT,
  CHARACTER_CAPSULE_RADIUS,
  CHARACTER_FLOAT_HEIGHT,
  JUMP_GRAVITY_SCALE,
  JUMP_VELOCITY,
  jumpApexHeight,
} from "./characterPhysics";
import { PLAYER_SPRINT_SPEED, PLAYER_WALK_SPEED } from "../io/input";

/**
 * Capability profiles generated from the live movement tuning (master plan
 * §52): world validation reads these, never today's raw constants, and the
 * values here are *derived* from the same modules the controller runs on, so
 * they cannot silently drift from gameplay.
 *
 * Only the profiles the current systems can honestly describe exist yet.
 * Swim/climb/burden/boat profiles land with Phases 9+ — fabricating them now
 * would bake numbers no system has proved.
 */

/**
 * Ecctrl's default `slopeMaxAngle` is 1 radian; the sandbox does not override
 * it (see `@elder-souls/character`'s `PlayerBody`). Revisit if that prop is
 * ever tuned.
 */
const ECCTRL_DEFAULT_SLOPE_MAX_DEG = (1 * 180) / Math.PI;

const grounded = {
  walkSpeed: PLAYER_WALK_SPEED,
  sprintSpeed: PLAYER_SPRINT_SPEED,
  jumpApexHeight: jumpApexHeight(JUMP_VELOCITY, JUMP_GRAVITY_SCALE),
  capsuleHalfHeight: CHARACTER_CAPSULE_HALF_HEIGHT,
  capsuleRadius: CHARACTER_CAPSULE_RADIUS,
  floatHeight: CHARACTER_FLOAT_HEIGHT,
  maxWalkableSlopeDeg: ECCTRL_DEFAULT_SLOPE_MAX_DEG,
  swimSpeed: 0,
  breathSeconds: 0,
  climbSpeed: 0,
};

export const CAPABILITY_PROFILES: Readonly<
  Partial<Record<CapabilityProfileId, CapabilityProfile>>
> = {
  /** The floor the world must remain traversable for. */
  minimumPlayable: { id: "minimumPlayable", ...grounded },
  baselineHuman: { id: "baselineHuman", ...grounded },
  /**
   * Grounded movement matches baselineHuman; the Argonian difference is
   * underwater (breath, swim speed) and lands with Phase 9's swim systems.
   */
  baselineArgonian: { id: "baselineArgonian", ...grounded },
};

export const DEFAULT_CAPABILITY_PROFILE: CapabilityProfileId = "baselineHuman";

export function resolveCapabilityProfile(id: string | null | undefined): CapabilityProfile {
  const profile = id && (CAPABILITY_PROFILES as Record<string, CapabilityProfile>)[id];
  return profile || CAPABILITY_PROFILES[DEFAULT_CAPABILITY_PROFILE]!;
}
