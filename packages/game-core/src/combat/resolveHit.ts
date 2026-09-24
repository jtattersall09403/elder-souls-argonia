import type { AttackDefinition, GuardProfile, WeaponClassEffect } from "../equipment/types";
import { damageAfterArmour } from "./armourMitigation";
import { BLOCK_HIT_STOP, resolveGuardImpact } from "./blockReaction";
import { bleedFromLandedDamage, effectiveArmourRating, criticalMultiplier } from "./classEffects";
import { NEUTRAL_MELEE_MODIFIERS, type MeleeModifiers } from "./modifiers";
import type { StatusEffectApplication } from "./statusEffects";

/**
 * THE RESOLVE ORDER. One blow, six steps, in this order and no other:
 *
 *   1. i-frames win outright -> `iframe`.
 *   2. a guard resolves the blow (`resolveGuardImpact`); class effects take no
 *      part, because a guard or a miss bleeds nobody.
 *   3. incoming = attack damage x hit-zone multiplier x attacker damagePosition
 *      x attacker strength x the class's critical multiplier (`critChance`,
 *      not on executions) x the sneak multiplier (a blow on a defender who
 *      had not engaged, decision 0092; an unseen backstab arrives as the
 *      weapon's light1 with this multiplier, never its own critical damage).
 *   4. the defender's armour rating is reduced by the class's armourPierce.
 *   5. landed = damageAfterArmour(incoming, that rating).
 *   6. the class's after-effects are scaled by what landed.
 *
 * New effects extend `WeaponClassEffect` and `classEffects.ts`; this order
 * never changes. See `combat/README.md`.
 */

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
  /**
   * The attacking weapon class's effects. Omitted (or `[]`) switches them off,
   * which is what an unarmed or effect-less blow wants.
   */
  effects?: readonly WeaponClassEffect[];
  /** What the attacker's skill is worth. Defaults to neutral. */
  attacker?: MeleeModifiers;
  /**
   * The roll for a class `critChance`, 0-1, drawn by the caller (a validation
   * scene passes 1, which never crits). Omitted means no critical.
   */
  critRoll?: number;
  /**
   * The sneak-attack table's multiplier (module 76 §121.5) for a blow on a
   * defender that had not engaged the attacker; 1 (the default) otherwise.
   * The caller reads it from the stats model. On an execution the caller
   * passes the weapon's light1 as the attack, so the backstab's own critical
   * damage and the sneak table never multiply together (decision 0092 §5).
   */
  sneakMultiplier?: number;
};

export type HitResult =
  | { kind: "iframe" }
  | { kind: "blocked"; health: number; stamina: number; hitStop: number }
  | { kind: "guardBroken"; health: number; stamina: number; killed: boolean; hitStop: number }
  | { kind: "hit"; health: number; killed: boolean; heavy: boolean; hitStop: number; status: StatusEffectApplication[]; critical: boolean }
  | { kind: "execution"; health: number; killed: boolean; hitStop: number; status: StatusEffectApplication[] };

/** Heavies and power attacks: the blows that land with a heavy reaction. */
export function isHeavyAttack(attack: Pick<AttackDefinition, "id">) {
  return attack.id === "heavy" || attack.id === "heavy2" || attack.id === "offPower" || attack.id === "dualPower";
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

  const effects = ctx.effects ?? [];
  const attacker = ctx.attacker ?? NEUTRAL_MELEE_MODIFIERS;
  const critical = ctx.execution ? 1 : criticalMultiplier(ctx.critRoll ?? 1, effects);
  const incoming = ctx.attack.damage * (ctx.hitZoneMultiplier ?? 1) * attacker.damagePosition * attacker.strength * critical * (ctx.sneakMultiplier ?? 1);
  const landed = damageAfterArmour(incoming, effectiveArmourRating(ctx.armourRating ?? 0, effects));
  const status = bleedFromLandedDamage(landed, effects);
  const health = Math.max(0, defenderHealth - landed);
  const hitStop = ctx.execution ? ctx.attack.hitStop ?? 0.13 : ctx.attack.hitStop ?? 0.055;
  if (ctx.execution) {
    return { kind: "execution", health, killed: health <= 0, hitStop, status };
  }
  return { kind: "hit", health, killed: health <= 0, heavy, hitStop, status, critical: critical > 1 };
}
