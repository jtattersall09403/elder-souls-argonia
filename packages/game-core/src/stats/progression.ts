/** Skill experience, vastei and the level sitting (module 76 §120). Pure arithmetic. */
import { STATS_DATA } from "./data";
import type { StatsData } from "./types";

export type SkillClass = "major" | "minor" | "misc";

/** Use-points to the next rank: (skill + 1) × classFactor × (0.8 if specialised) (§120.1). */
export function pointsToNextRank(skillValue: number, skillClass: SkillClass, specialised: boolean, data: StatsData = STATS_DATA): number {
  const c = data.curves.skillXp;
  return (skillValue + 1) * c.classFactor[skillClass] * (specialised ? c.specFactor : 1);
}

/** Vastei earned while taking one rank: perUse × points × (1 + effSkill/50) (§120.3); `cfg` as for `attributeCost`. */
export function vasteiPerRank(
  skillValue: number, effSkill: number, classFactor: number, specFactor: number,
  data: StatsData = STATS_DATA, cfg: { perUse: number; skillDivisor: number } = data.curves.vastei,
): number {
  const points = (skillValue + 1) * classFactor * specFactor;
  return cfg.perUse * points * (1 + effSkill / cfg.skillDivisor);
}

type LevelUpCost = Pick<StatsData["curves"]["levelUp"],
  "costBase" | "costLevelDivisor" | "costLevelExponent" | "attrValueDivisor" | "attrValueExponent" | "sittingIncrement">;

/**
 * Vastei price of the nth attribute point bought at one sitting (§120.4).
 * `cfg` defaults to `data`'s level-up block; a rule set (the Morrowind
 * known-answer run) passes its own.
 */
export function attributeCost(
  level: number, currentValue: number, nthInSitting: number,
  data: StatsData = STATS_DATA, cfg: LevelUpCost = data.curves.levelUp,
): number {
  const base = cfg.costBase * Math.pow(1 + level / cfg.costLevelDivisor, cfg.costLevelExponent);
  const valueTerm = Math.pow(1 + currentValue / cfg.attrValueDivisor, cfg.attrValueExponent);
  const sittingTerm = 1 + cfg.sittingIncrement * (nthInSitting - 1);
  return base * valueTerm * sittingTerm;
}
