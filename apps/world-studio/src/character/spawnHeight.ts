import { CHARACTER_BODY_CENTER_HEIGHT } from "@elder-souls/game-core/physics/characterPhysics";

/** Clearance above the support plane so the first physics step settles down onto it. */
export const SPAWN_CLEARANCE_M = 0.4;

/**
 * Body-centre Y for a studio spawn standing on `groundM`.
 *
 * `groundM` is the real terrain height, which is negative on wet sand, river
 * beds and lake floors. It is deliberately NOT clamped to sea level: clamping
 * put the actor at the water surface instead of on the ground under it, and
 * the water systems — not the spawn — decide wading vs swimming vs dry.
 */
export function spawnBodyY(groundM: number): number {
  return groundM + CHARACTER_BODY_CENTER_HEIGHT + SPAWN_CLEARANCE_M;
}
