/**
 * What an actor's *skill* contributes to a blow, as plain multipliers.
 *
 * The weapon says what it is (class, material, motion values); the archer or
 * swordsman says how well it is used. Keeping the second half as a small
 * record of multipliers is what lets the stats phase (10c, module 76 §118)
 * feed real skills later without touching a single rule file: every rule
 * takes the record, defaults to neutral, and never looks at a skill number.
 *
 * Ranged has its own record (`RangedModifiers` in `ballistics.ts`) because a
 * bow has more knobs than a blade; the melee record lives here. The curves
 * that turn a skill into either record are in `skillScalars.ts`.
 */
export type MeleeModifiers = {
  /**
   * Where in the class's damage range this actor's blows land, 0-1+. Module 76
   * §118: a skill moves its position from 0.40 at nothing to 1.00 at mastery.
   * Multiplies the attack's resolved damage before armour.
   */
  damagePosition: number;
  /** Multiplies every attack's stamina cost (×1.25 at nothing, ×0.80 at mastery). */
  staminaCost: number;
};

export const NEUTRAL_MELEE_MODIFIERS: MeleeModifiers = {
  damagePosition: 1,
  staminaCost: 1,
};

/**
 * A moveset re-costed for one actor's skill.
 *
 * Only the stamina cost is baked in here. `damagePosition` deliberately is
 * *not*: damage is applied once, at resolve time (`resolveHit`), so that one
 * blow can never be scaled twice by the same skill — which is exactly what
 * happens the moment two places both "apply the modifiers".
 */
export function applyMeleeModifiers<T extends { stamina: number }>(
  attacks: Record<string, T>,
  mods: MeleeModifiers,
): Record<string, T> {
  const scaled: Record<string, T> = {};
  for (const [id, attack] of Object.entries(attacks)) {
    scaled[id] = { ...attack, stamina: Math.round(attack.stamina * mods.staminaCost) };
  }
  return scaled;
}
