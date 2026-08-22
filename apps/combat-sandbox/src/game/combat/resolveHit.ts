import type { AttackDefinition, GuardProfile } from "../equipment/types";
import { damageAfterArmour } from "./armourMitigation";
import { BLOCK_HIT_STOP, resolveGuardImpact } from "./blockReaction";

export type HitContext = {
  attack: AttackDefinition;
  /**
   * The defender's active guard, or null when they are not guarding. Carrying
   * the profile rather than a boolean is what lets a shield block differently
   * from a weapon without a second code path.
   */
  guard: GuardProfile | null;
  /** Defender is inside dodge/roll invulnerability frames. */
  iframe: boolean;
  execution: "riposte" | "backstab" | null;
  /** Health lost when a guard is broken through. Enemy guard-break deals none. */
  guardBreakDamage?: number;
  /**
   * The defender's total worn armour rating. Reduces damage that actually
   * lands; a blocked hit is already resolved by the guard, and armour does not
   * get a second say over the same blow.
   */
  armourRating?: number;
  /**
   * Multiplier for where the blow landed. 1 is an ordinary body hit. Passed in
   * rather than derived, so the same rule serves an arrow that knows which bone
   * it struck and a sword swing that does not.
   */
  hitZoneMultiplier?: number;
};

export type HitResult =
  | { kind: "iframe" }
  | { kind: "blocked"; health: number; stamina: number; hitStop: number }
  | { kind: "guardBroken"; health: number; stamina: number; killed: boolean; hitStop: number }
  | { kind: "hit"; health: number; killed: boolean; heavy: boolean; hitStop: number }
  | { kind: "execution"; health: number; killed: boolean; hitStop: number };

export function isHeavyAttack(attack: AttackDefinition) {
  return attack.id === "heavy" || attack.id === "heavy2";
}

/**
 * Single source of truth for one weapon contact. Both the player→enemy and
 * enemy→player paths run through here; the caller applies the resulting numbers
 * to its fighter and drives the follow-up state and effects.
 */
export function resolveHit(
  defenderHealth: number,
  defenderStamina: number,
  ctx: HitContext,
): HitResult {
  if (ctx.iframe && !ctx.execution) return { kind: "iframe" };

  const heavy = isHeavyAttack(ctx.attack);

  if (ctx.guard && !ctx.execution) {
    const impact = resolveGuardImpact({
      health: defenderHealth,
      stamina: defenderStamina,
      incomingDamage: ctx.attack.damage,
      guard: ctx.guard,
      guardBreakDamage: ctx.guardBreakDamage ?? 0,
    });
    if (impact.blocked) {
      return { kind: "blocked", health: impact.health, stamina: impact.stamina, hitStop: BLOCK_HIT_STOP };
    }
    return {
      kind: "guardBroken",
      health: impact.health,
      stamina: impact.stamina,
      killed: impact.health <= 0,
      hitStop: BLOCK_HIT_STOP,
    };
  }

  const landed = damageAfterArmour(
    ctx.attack.damage * (ctx.hitZoneMultiplier ?? 1),
    ctx.armourRating ?? 0,
  );
  const health = Math.max(0, defenderHealth - landed);
  const hitStop = ctx.execution ? ctx.attack.hitStop ?? 0.13 : ctx.attack.hitStop ?? 0.055;
  if (ctx.execution) {
    return { kind: "execution", health, killed: health <= 0, hitStop };
  }
  return { kind: "hit", health, killed: health <= 0, heavy, hitStop };
}
