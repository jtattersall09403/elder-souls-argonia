/**
 * Canon's dice checks with the die removed (module 76 §117.1, §117.3, §118):
 * the same score, compared against a fixed threshold.
 */
import { STATS_DATA } from "./data";
import { canonScore, effectiveSkill } from "./curve";
import type { Attributes, StatsData } from "./types";

/** A lock opens iff (Security + Agi/5) × toolQuality ≥ lockLevel. Keys and Open magnitude bypass this. */
export function lockOpens(
  security: number, attributes: Partial<Attributes>, toolQuality: number, lockLevel: number, data: StatsData = STATS_DATA,
): boolean {
  return canonScore("security", security, attributes, data) * toolQuality >= lockLevel;
}

/** The dearest spell castable at all: 2 × schoolSkill + Wil/5 (canon's boundary as a gate, §123). */
export function maxCastableCost(schoolSkill: number, attributes: Pick<Attributes, "willpower">, data: StatsData = STATS_DATA): number {
  return data.curves.checks.castSkillMultiplier * schoolSkill + attributes.willpower / data.curves.score.defaultDivisor;
}

/** Enchanting point budget = (Enchant + Int/5) / 3 — canon's success formula solved for points (§118). */
export function enchantPointBudget(enchant: number, attributes: Pick<Attributes, "intelligence">, data: StatsData = STATS_DATA): number {
  return canonScore("enchant", enchant, attributes, data) / data.curves.checks.enchantPointDivisor;
}

/** Charged-item use cost multiplier: 1.1 − Enchant/100 (canon exactly, §118). */
export function chargedUseCostMultiplier(enchant: number, data: StatsData = STATS_DATA): number {
  return data.curves.checks.chargedUseBase - enchant / data.curves.score.scale;
}

/** Persuasion score = Speechcraft + Per/5 + standing, compared with an authored threshold (§125). */
export function persuasionScore(
  speechcraft: number, attributes: Pick<Attributes, "personality">, standing = 0, data: StatsData = STATS_DATA,
): number {
  return canonScore("speechcraft", speechcraft, attributes, data) + standing;
}

/** Highest craftable material tier: 1 + floor(Smithing score / 14) (§118). */
export function craftableMaterialTier(smithing: number, attributes: Partial<Attributes>, data: StatsData = STATS_DATA): number {
  return 1 + Math.floor(effectiveSkill("smithing", smithing, attributes, data) / data.curves.checks.craftTierDivisor);
}

/** Temper grade reachable: 0–3 at Smithing score 25/55/80 (§118). */
export function temperGrade(smithing: number, attributes: Partial<Attributes>, data: StatsData = STATS_DATA): number {
  const score = effectiveSkill("smithing", smithing, attributes, data);
  return (data.skillById.smithing.temperGrades ?? []).filter((gate) => score >= gate).length;
}

/** Out of combat only: non-combat scores × (0.85 + 0.15 × stamina/max) (§117.3). Never applied in combat. */
export function outOfCombatFatigueFactor(stamina: number, maxStaminaValue: number, data: StatsData = STATS_DATA): number {
  const c = data.curves.checks.outOfCombatFatigue;
  return c.base + c.staminaShare * Math.max(0, Math.min(1, stamina / maxStaminaValue));
}
