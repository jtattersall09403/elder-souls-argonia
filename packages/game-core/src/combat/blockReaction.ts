import { absorbedFraction, guardStaminaCost } from "../equipment/guard";
import type { DamageType, GuardProfile } from "../equipment/types";

export const BLOCK_RECOIL_DURATION = 0.42;
export const BLOCK_RECOIL_SPEED = 1.25;
/**
 * Push applied to an actor whose attack was parried.
 *
 * A parry that leaves both actors at capsule contact has nowhere for the
 * riposte to happen: the execution's authored lunge needs roughly 0.9 m and
 * the attacker's blade is already beside the victim before the animation
 * starts. Knocking the parried actor back also matches the authored
 * backward stagger it plays.
 */
export const PARRY_RECOIL_SPEED = 2.6;
export const BLOCK_HIT_STOP = 0.04;

export type PlanarPoint = Readonly<{ x: number; z: number }>;

export type GuardImpactInput = Readonly<{
  health: number;
  stamina: number;
  incomingDamage: number;
  /** The item actually between the defender and the blow: shield, else weapon. */
  guard: GuardProfile;
  damageType?: DamageType;
  guardBreakDamage?: number;
}>;

/**
 * One guarded contact. Stamina cost comes from the guard's stability and
 * chip damage from its absorption, so equipping a steadier shield changes
 * blocking without touching this rule.
 */
export function resolveGuardImpact({
  health,
  stamina,
  incomingDamage,
  guard,
  damageType = "physical",
  guardBreakDamage = 0,
}: GuardImpactInput) {
  const staminaDamage = guardStaminaCost(incomingDamage, guard);
  const blocked = stamina >= staminaDamage;
  const absorbed = absorbedFraction(guard.absorption, damageType);
  const damage = blocked ? Math.ceil(incomingDamage * (1 - absorbed)) : guardBreakDamage;
  return {
    blocked,
    health: Math.max(0, health - damage),
    stamina: blocked ? stamina - staminaDamage : 0,
    staminaDamage,
    damage,
    recoilAttacker: blocked,
    triggerDamageVignette: !blocked,
  } as const;
}

/** Authored recoil for sensor-only weapon clashes, directed away from the defender. */
export function blockRecoilVelocity(
  attacker: PlanarPoint,
  defender: PlanarPoint,
  verticalVelocity: number,
  speed = BLOCK_RECOIL_SPEED,
) {
  let x = attacker.x - defender.x;
  let z = attacker.z - defender.z;
  const length = Math.hypot(x, z);
  if (length <= Number.EPSILON) {
    x = 0;
    z = 1;
  } else {
    x /= length;
    z /= length;
  }
  return { x: x * speed, y: verticalVelocity, z: z * speed };
}
