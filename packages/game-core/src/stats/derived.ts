/**
 * Derived quantities (module 76 §117, §121.2–§121.5, §122). Pure functions over
 * current values: everything is retroactive (§117.2), nothing is cached.
 */
import { STATS_DATA } from "./data";
import { band, effectiveSkill } from "./curve";
import type { Attributes, BurdenTierId, SneakWeaponKind, StatsData } from "./types";

type A<K extends keyof Attributes> = Pick<Attributes, K>;

/** maxHealth = (Str + End)/2 + level × End/10 (§117.2). */
export function maxHealth(attrs: A<"strength" | "endurance">, level: number, data: StatsData = STATS_DATA): number {
  const c = data.curves.health;
  return c.attrCoefficient * (attrs.strength + attrs.endurance) + level * (c.levelBase + attrs.endurance / c.levelEnduranceDivisor);
}
/** maxStamina = 60 + 0.8 × End (§121.2). */
export function maxStamina(attrs: A<"endurance">, data: StatsData = STATS_DATA): number {
  return data.curves.stamina.base + data.curves.stamina.endCoefficient * attrs.endurance;
}
/** Stamina regen per second after the regen delay: 12 + 0.24 × Agi (§121.2). */
export function staminaRegen(attrs: A<"agility">, data: StatsData = STATS_DATA): number {
  return data.curves.stamina.regenBase + data.curves.stamina.regenAgiCoefficient * attrs.agility;
}
/** maxMagicka = (20 + 3 × Int) × (1 + multiplier) — multiplier from racial/birthsign effects (§123). */
export function maxMagicka(attrs: A<"intelligence">, multiplier = 0, data: StatsData = STATS_DATA): number {
  return (data.curves.magicka.base + data.curves.magicka.intCoefficient * attrs.intelligence) * (1 + multiplier);
}
export function magickaRegen(attrs: A<"willpower">, data: StatsData = STATS_DATA): number {
  return data.curves.magicka.regenBase + data.curves.magicka.regenWilCoefficient * attrs.willpower;
}
/** capacityKg = 30 + 3 × Str (§122). */
export function carryCapacity(attrs: A<"strength">, data: StatsData = STATS_DATA): number {
  return data.curves.carry.base + data.curves.carry.strCoefficient * attrs.strength;
}

export type Burden = { tier: BurdenTierId; ratio: number };
/** Burden ratio r = carried / capacity, and its tier (§122). */
export function burdenTier(carriedKg: number, attrs: A<"strength">, data: StatsData = STATS_DATA): Burden {
  const r = carriedKg / carryCapacity(attrs, data);
  const t = data.curves.burdenTiers;
  if (r < t.fast) return { tier: "fast", ratio: r };
  if (r < t.mid) return { tier: "mid", ratio: r };
  if (r < t.fat) return { tier: "fat", ratio: r };
  return { tier: "overloaded", ratio: r };
}
/** Action stamina multiplier for a burden tier (§121.2). */
export function burdenStaminaMultiplier(tier: BurdenTierId, data: StatsData = STATS_DATA): number {
  return data.curves.stamina.burdenCostMultiplier[tier];
}
/** Roll distance / recovery / i-frame scale for a burden tier (§122; DS1 equip-load). */
export function rollModifiers(tier: BurdenTierId, data: StatsData = STATS_DATA) {
  return data.curves.rollTiers[tier];
}

/** mitigation = AR / (AR + 135.6 + 0.6 × incoming): the share armour stops (§121.4). */
export function mitigation(armourRating: number, incomingDamage: number, data: StatsData = STATS_DATA): number {
  const c = data.curves.mitigation;
  return armourRating / (armourRating + c.constant + c.damageCoefficient * incomingDamage);
}
export function damageAfterArmour(damage: number, armourRating: number, data: StatsData = STATS_DATA): number {
  return damage * (1 - mitigation(armourRating, damage, data));
}
/** Enemy damage after the global lethality knob (§121.4); multiplies nothing else. */
export function incomingDamage(rawDamage: number, difficulty?: number, data: StatsData = STATS_DATA): number {
  return rawDamage * (difficulty ?? data.curves.difficulty.enemyDamageMultiplier);
}
/** Unarmoured AR: 0.0065 × skill² over four bare slots, pro-rata (§118). */
export function unarmouredRating(skill: number, bareSlots?: number, data: StatsData = STATS_DATA): number {
  const c = data.curves.unarmoured;
  return c.coefficient * skill * skill * ((bareSlots ?? c.slots) / c.slots);
}

/** Naked poise = Agility / 2 — canon's knockdown threshold re-housed (§121.3). */
export function basePoise(attrs: A<"agility">, data: StatsData = STATS_DATA): number {
  return attrs.agility / data.curves.poise.agilityDivisor;
}
/** One worn piece's poise: its [poiseLo, poiseHi] range through k(armour-class score) (§121.3). */
export function piecePoise(poiseLo: number, poiseHi: number, armourScore: number, data: StatsData = STATS_DATA): number {
  return band([poiseLo, poiseHi], armourScore, data);
}

/** Breath in seconds: 25 + 0.35 × Athletics + 0.25 × End; Infinity for water-breathers (§118, §122). */
export function breathSeconds(athletics: number, endurance: number, waterBreathing = false, data: StatsData = STATS_DATA): number {
  if (waterBreathing) return Infinity;
  const c = data.curves.breath;
  return c.base + c.athleticsCoefficient * athletics + c.enduranceCoefficient * endurance;
}

/** walk = 4.5 × (0.75 + Speed/200) × (1 − 0.3 × min(1, loadRatio)) m/s (§122). */
export function walkSpeed(attrs: A<"speed">, loadRatio = 0, data: StatsData = STATS_DATA): number {
  const m = data.curves.movement;
  return m.walkBase * (m.speedFactorBase + attrs.speed / m.speedFactorDivisor) * (1 - m.loadSpeedPenalty * Math.min(1, loadRatio));
}
/** sprint = walk × (1 + Athletics/250) × 6.0/4.5 (§122). */
export function sprintSpeed(attrs: A<"speed">, athletics: number, loadRatio = 0, data: StatsData = STATS_DATA): number {
  const m = data.curves.movement;
  return walkSpeed(attrs, loadRatio, data) * (1 + athletics / m.sprintAthleticsDivisor) * (m.sprintBase / m.walkBase);
}
/** swim = 1.6 × (0.5 + Athletics/100) m/s (§122); the burden penalty is the caller's. */
export function swimSpeed(athletics: number, data: StatsData = STATS_DATA): number {
  const m = data.curves.movement;
  return m.swimBase * (m.swimAthleticsBase + athletics / m.swimAthleticsDivisor);
}
/** jump apex = 1.378 × (0.80 + Acrobatics/125) m (§122). */
export function jumpApex(acrobatics: number, data: StatsData = STATS_DATA): number {
  const m = data.curves.movement;
  return m.jumpApexBase * (m.jumpAcrobaticsBase + acrobatics / m.jumpAcrobaticsDivisor);
}
/** Safe fall height = 2 + Acrobatics/25 m (§122). */
export function safeFallMetres(acrobatics: number, data: StatsData = STATS_DATA): number {
  const m = data.curves.movement;
  return m.safeFallBaseMetres + acrobatics / m.safeFallAcrobaticsDivisor;
}

/** Sneak-opener multiplier by Sneak band (§121.5). Unknown kinds read as one-handed. */
export function sneakMultiplier(weaponKind: SneakWeaponKind | string, sneakSkill: number, data: StatsData = STATS_DATA): number {
  const cfg = data.curves.sneakAttack;
  const table = cfg.multipliers[weaponKind as SneakWeaponKind] ?? cfg.multipliers.oneHanded;
  let index = 0;
  cfg.bandsBySkill.forEach((gate, i) => {
    if (sneakSkill >= gate) index = i;
  });
  return table[index];
}

export type ClimbInput = {
  acrobatics: number;
  attributes: Partial<Attributes>;
  burdenTier?: BurdenTierId;
  stamina: number;
  staminaRegen: number;
};
export type ClimbResult = {
  seconds: number; staminaCost: number; drainPerSecond: number; speed: number;
  completesInOneGo: boolean; sustainableMeters: number;
};
/** A wall of a given height (§122.1): speed, drain, mantle, and how far resting on the wall carries you. */
export function climb(heightMeters: number, input: ClimbInput, data: StatsData = STATS_DATA): ClimbResult {
  const cfg = data.curves.climbing;
  const bands = data.skillById.acrobatics.bands;
  const eff = effectiveSkill("acrobatics", input.acrobatics, input.attributes, data);
  const speed = cfg.baseSpeedMetresPerSecond * band(bands.climbSpeed, eff, data);
  const drainBand = band(bands.climbStamina, eff, data);
  const drainPerSecond = cfg.baseStaminaPerSecond * drainBand * (cfg.burdenDrainMultiplier[input.burdenTier ?? "mid"] ?? 1);
  const seconds = heightMeters / speed;
  const mantle = cfg.mantleStaminaCost * drainBand;
  const staminaCost = seconds * drainPerSecond + mantle;
  const netDrain = Math.max(0, drainPerSecond - input.staminaRegen * cfg.restOnHoldRegenFraction);
  const sustainableMeters = netDrain <= 0 ? Infinity : ((input.stamina - mantle) / netDrain) * speed;
  return { seconds, staminaCost, drainPerSecond, speed, completesInOneGo: staminaCost <= input.stamina, sustainableMeters };
}
