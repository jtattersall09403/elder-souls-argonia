import type { WeaponClassEffect } from "../equipment/types";
import type { StatusEffectApplication } from "./statusEffects";

/**
 * What a *shape* of weapon does to a target beyond its damage.
 *
 * The class table carries the data (`equipment/weaponClasses`); these are the
 * only functions that read it. `resolveHit` calls them at two fixed points in
 * its order, so adding a kind — a stagger, a poison, a shield-splitter — means
 * extending `WeaponClassEffect` and this file, and never rewriting the resolve
 * step. That is the whole reason the slot exists.
 */

/**
 * The defender's armour rating as this weapon meets it.
 *
 * Piercing shares add up and are taken off the *rating*, not off the damage,
 * so a mace gains most against heavy armour and nearly nothing against a
 * bare-skinned target — which is what a crushing weapon is for.
 */
export function effectiveArmourRating(
  rating: number,
  effects: readonly WeaponClassEffect[],
): number {
  let share = 0;
  for (const effect of effects) {
    if (effect.kind === "armourPierce") share += effect.share;
  }
  return Math.max(0, Math.max(0, rating) * (1 - share));
}

/**
 * The after-effects a blow of this class leaves, given the damage that got
 * through armour. Scaled by what *landed* rather than by what was swung, so a
 * bleed cannot be farmed through a target the weapon can barely hurt.
 */
export function bleedFromLandedDamage(
  landed: number,
  effects: readonly WeaponClassEffect[],
): StatusEffectApplication[] {
  if (!(landed > 0)) return [];
  const applied: StatusEffectApplication[] = [];
  for (const effect of effects) {
    if (effect.kind !== "bleed") continue;
    applied.push({ kind: "bleed", totalDamage: landed * effect.fraction, seconds: effect.seconds });
  }
  return applied;
}
