/**
 * The one skill curve over Morrowind's own score (module 76 §116, §117.1, §121.1).
 * Every function is pure; `data` defaults to the canonical tables.
 */
import { STATS_DATA } from "./data";
import type { Attributes, Band, SkillId, StatsData } from "./types";

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** k(s) = 1 − (1 − s/100)^1.6: 0 at 0, 1 at 100, front-loaded, clamped outside 0–100. */
export function k(score: number, data: StatsData = STATS_DATA): number {
  const scale = data.curves.score.scale;
  const s = clamp(score, 0, scale);
  return 1 - Math.pow(1 - s / scale, data.curves.skillCurve.exponent);
}

/**
 * Canon's un-normalised check value, `skill + attribute/5` (Alchemy: /10).
 * Threshold checks that canon rolled (locks, persuasion, enchanting) compare this.
 * A skill with no score attribute returns the skill.
 */
export function canonScore(
  skillId: SkillId, skillValue: number, attributes: Partial<Attributes> | undefined, data: StatsData = STATS_DATA,
): number {
  const skill = data.skillById[skillId];
  if (!skill?.score || !attributes) return skillValue;
  const divisor = skill.scoreDivisor ?? data.curves.score.defaultDivisor;
  return skillValue + (attributes[skill.score] ?? data.curves.score.missingAttribute) / divisor;
}

/**
 * score(skill, attr) = (skill + attr/5) / 1.2 — canon's score normalised so
 * 100/100 reads 100. The input to `k` for every skill band. Missing attributes
 * (or a pure-skill check) return the raw skill; a missing score attribute reads `score.missingAttribute`.
 */
export function effectiveSkill(
  skillId: SkillId, skillValue: number, attributes?: Partial<Attributes> | null, data: StatsData = STATS_DATA,
): number {
  const skill = data.skillById[skillId];
  if (!skill?.score || !attributes) return skillValue;
  const divisor = skill.scoreDivisor ?? data.curves.score.defaultDivisor;
  return canonScore(skillId, skillValue, attributes, data) / (1 + 1 / divisor);
}

/** band(lo, hi) = lo + (hi − lo) × k(score). */
export function band([lo, hi]: Band, score: number, data: StatsData = STATS_DATA): number {
  return lo + (hi - lo) * k(score, data);
}

/** P(score) = 0.40 + 0.60 × k(score): where in a weapon's damage range the blow lands (§121.1). */
export function damagePosition(score: number, data: StatsData = STATS_DATA): number {
  const { lo, hi } = data.curves.damagePosition;
  return band([lo, hi], score, data);
}

/** (Strength + 50) / 100 — canon's damage term; neutral at Strength 50 (§121.1). */
export function strengthDamage(attributes: Pick<Attributes, "strength">, data: StatsData = STATS_DATA): number {
  const c = data.curves.strengthDamage;
  return (attributes.strength + c.base) / c.divisor;
}

/** Whether the Strength term applies to blows of this skill (not Hand-to-Hand, not Marksman). */
export function strengthApplies(skillId: SkillId, data: StatsData = STATS_DATA): boolean {
  return !data.curves.strengthDamage.excludes.includes(skillId);
}

/** conditionFactor = 0.5 + 0.5 × condition/max (§121.1, §121.6): scales damage and AR. */
export function conditionFactor(condition: number, data: StatsData = STATS_DATA): number {
  const c = data.curves.condition;
  return c.lo + (c.hi - c.lo) * clamp(condition / c.max, 0, 1);
}

/** Soft requirement (§121.1): stamina ×(1 + 0.07 d) for a shortfall of d points, d capped at 20. Never blocks. */
export function softRequirementStaminaMultiplier(shortfall: number, data: StatsData = STATS_DATA): number {
  const c = data.curves.softRequirement;
  return 1 + c.staminaPerPoint * clamp(shortfall, 0, c.maxShortfall);
}
