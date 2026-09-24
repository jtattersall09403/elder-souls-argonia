/**
 * Skill → the multiplier records combat consumes (module 76 §118, §121).
 *
 * These replace the linear ramps in `combat/skillScalars.ts`: the value is
 * `band(lo, hi)` over k(score), where score folds in the skill's canon
 * attribute (Agility for weapons and Block). Field names match combat's
 * `MeleeModifiers` / `RangedModifiers` so the records drop in; `strength` is
 * extra and is applied once, at resolve time, beside `damagePosition`.
 */
import { STATS_DATA } from "./data";
import { band, damagePosition, effectiveSkill, strengthApplies, strengthDamage } from "./curve";
import type { Attributes, Band, SkillId, StatsData } from "./types";

/** The Marsh Hand's attributes (§116): what a caller with no character reads. */
export const REFERENCE_ATTRIBUTES: Attributes = STATS_DATA.attributes.reference;

function bandOr(bands: Readonly<Record<string, Band>>, name: string, score: number, data: StatsData, neutral = 1) {
  const b = bands[name];
  return b ? band(b, score, data) : neutral;
}

export type MeleeSkillId = "longBlade" | "blunt" | "axe" | "spear" | "shortBlade" | "handToHand";

export type MeleeSkillModifiers = {
  /** P(score): 0.40 → 1.00, multiplies resolved damage before armour. */
  damagePosition: number;
  /** Multiplies every attack's stamina cost (×1.25 → ×0.80). 1 for Hand-to-Hand. */
  staminaCost: number;
  /** (Str + 50)/100; 1 for Hand-to-Hand. Multiplies damage beside damagePosition. */
  strength: number;
  /** Condition loss per use (×1.4 → ×0.6). */
  wear: number;
  /** Hand-to-Hand only: stamina damage dealt to the target (×1.0 → ×2.0); 1 otherwise. */
  targetStaminaDamage: number;
};

export function meleeModifiers(
  skillId: MeleeSkillId, skill: number, attributes: Attributes = REFERENCE_ATTRIBUTES, data: StatsData = STATS_DATA,
): MeleeSkillModifiers {
  const bands = data.skillById[skillId].bands;
  const eff = effectiveSkill(skillId, skill, attributes, data);
  return {
    damagePosition: bands.damagePosition ? band(bands.damagePosition, eff, data) : damagePosition(eff, data),
    staminaCost: bandOr(bands, "staminaCost", eff, data),
    strength: strengthApplies(skillId, data) ? strengthDamage(attributes, data) : 1,
    wear: bandOr(bands, "wear", eff, data),
    targetStaminaDamage: bandOr(bands, "staminaDamage", eff, data),
  };
}

export type MarksmanModifiers = {
  nockSpeed: number;
  drawSpeed: number;
  /** A Strength/requirement question, not Marksman: always 1 here (§117 divergence 1). */
  drawStrength: number;
  sway: number;
  drawStaminaCost: number;
  /** P(score) on delivered damage; no Strength term on bows. */
  damage: number;
};

export function marksmanModifiers(
  skill: number, attributes: Attributes = REFERENCE_ATTRIBUTES, data: StatsData = STATS_DATA,
): MarksmanModifiers {
  const bands = data.skillById.marksman.bands;
  const eff = effectiveSkill("marksman", skill, attributes, data);
  return {
    nockSpeed: bandOr(bands, "nockSpeed", eff, data),
    drawSpeed: bandOr(bands, "drawSpeed", eff, data),
    drawStrength: 1,
    sway: bandOr(bands, "sway", eff, data),
    drawStaminaCost: bandOr(bands, "drawStamina", eff, data),
    damage: bands.damagePosition ? band(bands.damagePosition, eff, data) : damagePosition(eff, data),
  };
}

export type BlockModifiers = { stability: number; guardStamina: number };
/** Block: stability ×0.85 → ×1.15 (absolute cap 0.95 applies to the final stability), guard stamina ×1.30 → ×0.78. */
export function blockModifiers(skill: number, attributes: Attributes = REFERENCE_ATTRIBUTES, data: StatsData = STATS_DATA): BlockModifiers {
  const bands = data.skillById.block.bands;
  const eff = effectiveSkill("block", skill, attributes, data);
  return { stability: bandOr(bands, "stability", eff, data), guardStamina: bandOr(bands, "guardStamina", eff, data) };
}
/** Clamp a shield's final stability (base × Block band × effects) to the absolute cap. */
export function capBlockStability(stability: number, data: StatsData = STATS_DATA): number {
  return Math.min(data.curves.block.stabilityCap, stability);
}

/** Any skill's named band at this character's score, e.g. `skillBand("athletics", "sprintDrain", 40, attrs)`. */
export function skillBand(
  skillId: SkillId, bandName: string, skill: number, attributes?: Partial<Attributes>, data: StatsData = STATS_DATA,
): number {
  const b = data.skillById[skillId].bands[bandName];
  if (!b) throw new RangeError(`skill ${skillId} has no band ${bandName}`);
  return band(b, effectiveSkill(skillId, skill, attributes, data), data);
}
