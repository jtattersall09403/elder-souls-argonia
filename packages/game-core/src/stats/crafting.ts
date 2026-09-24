/**
 * Services and crafting formulas (module 76 §124): training prices and brewed
 * potion magnitude. Pure; `data` defaults to the canonical tables.
 */
import { STATS_DATA } from "./data";
import { canonScore } from "./curve";
import type { StatsData } from "./types";

type Training = { costPerRank: number; costRankExponent: number };
type Alchemy = {
  apparatus: Readonly<Record<string, number>>;
  effectBaseCost: Readonly<Record<string, number>>;
  magnitudeMultiplier: number;
  effectCostDivisor: number;
};
const training = (data: StatsData) => data.economy.training as Training;
const alchemy = (data: StatsData) => data.magic.alchemy as Alchemy;

/** Gold to train one rank from `rank`: costPerRank × rank^exponent (trainers cap at the governing attribute). */
export function trainingCost(rank: number, data: StatsData = STATS_DATA): number {
  const t = training(data);
  return t.costPerRank * Math.pow(rank, t.costRankExponent);
}

/** Gold to train every rank from `from` up to (not including) `to`. */
export function trainingCostRange(from: number, to: number, data: StatsData = STATS_DATA): number {
  let total = 0;
  for (let r = from; r < to; r += 1) total += trainingCost(r, data);
  return total;
}

/**
 * Brewed potion magnitude: multiplier × (Alchemy + Int/10) × apparatus ÷
 * (3 × the effect's base cost) — canon's alchemy score (Int at half weight).
 * Crafting reads BASE attributes (§127), so pass base values.
 */
export function brewMagnitude(
  alchemySkill: number, baseIntelligence: number, apparatus: string, effect: string, data: StatsData = STATS_DATA,
): number {
  const a = alchemy(data);
  const quality = a.apparatus[apparatus];
  const cost = a.effectBaseCost[effect];
  if (quality === undefined) throw new RangeError(`unknown apparatus: ${apparatus}`);
  if (cost === undefined) throw new RangeError(`unknown alchemy effect: ${effect}`);
  const score = canonScore("alchemy", alchemySkill, { intelligence: baseIntelligence }, data);
  return (a.magnitudeMultiplier * score * quality) / (a.effectCostDivisor * cost);
}
