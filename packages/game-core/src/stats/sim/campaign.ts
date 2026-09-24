/**
 * The campaign simulation (port of tooling/stats-sim/src/campaign.mjs): a whole
 * character's game, slice by slice, under a rule set (how a use becomes a rank
 * and a rank a level) and a content model (how much of each verb an hour of
 * play contains). The two are separate inputs so Morrowind's rules on an
 * estimate of Vvardenfell's content can run as a known-answer test.
 * Deterministic: no Math.random, no module state; `data` is passed in.
 */
import { effectiveSkill } from "../curve";
import { burdenTier, climb, magickaRegen, maxMagicka, maxStamina, staminaRegen, unarmouredRating } from "../derived";
import { bandActor } from "../ladder";
import { attributeCost, vasteiPerRank } from "../progression";
import { rankCost } from "../rules";
import { classDef, raceStats, skillClassOf, startingCharacter } from "../character";
import type { Attributes, ClassDef, RaceStats, SkillId } from "../types";
import {
  armourSetRating, armourSetWeight, armourSkillFor, PACK_KG, raceIn, simulateFight, SIM_SEX, weaponWeight,
  type Archetype, type Build,
} from "./model";
import { SIM_DATA, type SimData, type SimTable } from "./simData";

// ------------------------------------------------------- harness constants

/** What a fresh character carries: gold and healing potions. */
const STARTING_GOLD = 60;
const STARTING_POTIONS = 3;
/** One more potion carried per this much gold held, up to the content's cap (default below). */
const GOLD_PER_EXTRA_POTION = 900;
const DEFAULT_POTION_CARRY_CAP = 12;
const DEFAULT_SLICE_HOURS = 0.25;
/** Skill value a build reads for a weapon skill it does not have. */
const MISSING_WEAPON_SKILL = 5;
/** Ceiling on avoidance after the style bonus. */
const MAX_AVOIDANCE = 0.9;
/** Sneak-opener chance for an archetype the content does not list. */
const DEFAULT_SNEAK_OPENER_CHANCE = 0.15;
/** Climb height checked at every act end (m). */
const ACT_CLIMB_CHECK_METRES = 25;
/** Gear quality by gear tier: temper grades, enchant damage bonus, spell cost reduction (tiers 4 and 6). */
const gearTierBonus = (tier: number, at6: number, at4: number) => (tier >= 6 ? at6 : tier >= 4 ? at4 : 0);

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** Which skill each authored verb feeds. Content counts events; this says what learns from them. */
const VERB_SKILL: Readonly<Record<string, SkillId>> = {
  lock: "security", trap: "security", persuasion: "speechcraft", barter: "mercantile",
  brew: "alchemy", repair: "smithing", enchant: "enchant", sneak: "sneak",
  jump: "acrobatics", climb: "acrobatics", swim: "athletics", travel: "athletics",
};

const MAGIC_SCHOOLS = new Set<string>([
  "alteration", "conjuration", "destruction", "illusion", "mysticism", "restoration",
]);

/** What one connect with this skill is worth: Morrowind's per-skill table, spells flat. */
const connectValue = (rules: SimTable, skillId: string): number =>
  rules.use.weaponConnect[skillId] ??
  (MAGIC_SCHOOLS.has(skillId) ? rules.use.spellCast : rules.use.weaponConnect.default);

type Klass = "major" | "minor" | "misc";

/** A character that changes as it plays. `data` is private so the character serialises as the sim's did. */
export class LiveCharacter {
  readonly #data: SimData;
  rules: SimTable;
  cls: ClassDef;
  race: RaceStats;
  archetype: Archetype;
  attributes: Record<string, number>;
  skills: Record<string, number>;
  progress: Record<string, number>;
  level = 1;
  vastei = 0;
  gold = STARTING_GOLD;
  pendingLevels = 0;
  ranksSinceLevel = 0;
  totalRanks = 0;
  attributePoints = 0;
  gearTier = 1;
  temperGrades = 0;
  deaths = 0;
  potionsUsed = 0;
  trainingSpent = 0;
  /** Morrowind's health grant is not retroactive, so it has to be banked. */
  healthGrants = 0;
  // Honesty accounting: every use-point delivered, and how much of it the level trigger threw away.
  pointsDelivered = 0;
  pointsAtCapDiscarded = 0;
  pointsIntoZeroCreditRanks = 0;
  pointsIntoPartialCreditRanks = 0;
  creditEarned = 0;
  creditForgone = 0;
  creditBySource = { majorMinor: 0, misc: 0, maxed: 0, trained: 0 };
  creditBySkill: Record<string, number> = {};

  constructor(
    { classId, race, archetypeId, rules }: { classId: string; race: string; archetypeId: string; rules: SimTable },
    data: SimData = SIM_DATA,
  ) {
    this.#data = data;
    const raceId = raceIn(race, data);
    const start = startingCharacter({ race: raceId, sex: SIM_SEX, classId }, data);
    this.rules = rules;
    this.cls = classDef(classId, data);
    this.race = raceStats(raceId, data);
    this.archetype = { id: archetypeId, ...data.builds.archetypes[archetypeId] };
    this.attributes = { ...start.attributes };
    this.skills = { ...start.skills };
    this.progress = Object.fromEntries(Object.keys(start.skills).map((id) => [id, 0]));
  }

  klassOf(skillId: string): Klass {
    return skillClassOf(this.cls, skillId as SkillId);
  }

  majorsAndMinorsMaxed(): boolean {
    return [...this.cls.majors, ...this.cls.minors].every((id) => this.skills[id] >= 100);
  }

  /**
   * Award use-points; convert to ranks (and vastei) as they fill. A major/minor
   * rank below 100 is worth one level credit; a misc rank, or a rank in a skill
   * at 100, is worth `1/divisor` per skill and ungated (under our rules).
   */
  use(skillId: string, points: number): void {
    const skill = this.#data.skillById[skillId as SkillId];
    if (!skill || !(points > 0)) return;
    const L = this.rules.levelTrigger;
    const klass = this.klassOf(skillId);
    const specialised = skill.spec === this.cls.specialization;
    this.pointsDelivered += points;

    // A maxed skill under Morrowind's rules simply stops accepting use.
    if (this.skills[skillId] >= 100 && !L.maxedSkillsKeepEarning) {
      this.pointsAtCapDiscarded += points;
      return;
    }

    this.progress[skillId] += points;
    for (;;) {
      const value = this.skills[skillId];
      const maxed = value >= 100;
      const cost = rankCost(this.rules as never, Math.min(value, 100), klass, specialised);
      if (this.progress[skillId] < cost) return;
      this.progress[skillId] -= cost;
      if (!maxed) this.skills[skillId] += 1;
      this.totalRanks += 1;

      const classFactor = this.rules.rankCost.classFactor[klass];
      const specFactor = specialised ? this.rules.rankCost.specFactor : 1;
      const eff = effectiveSkill(skillId as SkillId, value, this.attributes as Attributes, this.#data);
      this.vastei += vasteiPerRank(value, eff, classFactor, specFactor, this.#data, this.rules.vastei);

      let credit: number;
      if (maxed) credit = L.maxedSkillCreditDivisor ? 1 / L.maxedSkillCreditDivisor : 0;
      else if (klass === "misc") {
        const gated = L.miscCreditRequiresAllMaxed && !this.majorsAndMinorsMaxed();
        credit = L.miscRankDivisor && !gated ? 1 / L.miscRankDivisor : 0;
      } else credit = 1;

      this.creditEarned += credit;
      this.creditForgone += 1 - credit;
      this.creditBySource[maxed ? "maxed" : klass === "misc" ? "misc" : "majorMinor"] += credit;
      this.creditBySkill[skillId] = (this.creditBySkill[skillId] ?? 0) + credit;
      if (credit === 0) this.pointsIntoZeroCreditRanks += cost;
      else if (credit < 1) this.pointsIntoPartialCreditRanks += cost;

      this.ranksSinceLevel += credit;
      while (this.ranksSinceLevel >= L.ranksPerLevel) {
        this.ranksSinceLevel -= L.ranksPerLevel;
        this.pendingLevels += 1;
      }
    }
  }

  get health(): number {
    const h = this.rules.health;
    const a = this.attributes;
    const base = h.attrCoefficient * (a.strength + a.endurance);
    return h.retroactive
      ? base + this.level * (h.levelBase + a.endurance / h.levelEnduranceDivisor)
      : base + this.healthGrants;
  }

  /** A rest: bank one pending level and spend vastei at the sitting. */
  rest(): boolean {
    if (this.pendingLevels <= 0) return false;
    const cfg = this.rules.attributePurchase;
    this.pendingLevels -= 1;
    this.level += 1;
    const bought: Record<string, number> = {};
    for (;;) {
      let best: string | null = null;
      let bestCost = Infinity;
      // Buy toward what this build actually uses, cheapest first.
      for (const attr of this.priorityAttributes()) {
        const n = (bought[attr] ?? 0) + 1;
        if (n > cfg.sittingCap) continue;
        const cost = attributeCost(this.level, this.attributes[attr], n, this.#data, cfg);
        if (cost < bestCost) {
          bestCost = cost;
          best = attr;
        }
      }
      if (!best || bestCost > this.vastei) break;
      this.vastei -= bestCost;
      this.attributes[best] += 1;
      bought[best] = (bought[best] ?? 0) + 1;
      this.attributePoints += 1;
    }
    const h = this.rules.health;
    if (!h.retroactive) this.healthGrants += h.levelBase + this.attributes.endurance / h.levelEnduranceDivisor;
    return true;
  }

  priorityAttributes(): string[] {
    const order: string[] = this.archetype.attributeOrder ?? Object.keys(this.attributes);
    // Favour the build's own attributes, but not exclusively: a player spreads.
    return [...order.slice(0, 4), ...order.slice(4)];
  }

  get armourMaterial(): string {
    return this.#data.builds.gearTierMaterials[String(this.gearTier)][this.archetype.armourClass];
  }

  get weaponMaterial(): string {
    return this.#data.builds.gearTierMaterials[String(this.gearTier)].weapon;
  }

  get armourSkillId(): SkillId {
    return armourSkillFor(this.archetype.armourClass, this.#data) as SkillId;
  }

  /** The shape `simulateFight` expects. */
  toBuild(potionsCarried: number): Build {
    const data = this.#data;
    const attributes = this.attributes as Attributes;
    const armourRating =
      armourSetRating(this.armourMaterial, {
        armourSkill: this.skills[this.armourSkillId],
        attributes,
        temperGrades: this.temperGrades,
      }, data) + (this.archetype.armourClass === "none" ? unarmouredRating(this.skills.unarmored, undefined, data) : 0);
    const carriedKg =
      armourSetWeight(this.armourMaterial, data) +
      weaponWeight(this.archetype.weaponClass, this.weaponMaterial, data) +
      // The sim's campaign carries an unscaled shield (makeBuild scales it by material): kept for equivalence.
      (this.archetype.shield ? data.gear.shieldWeightKg : 0) +
      PACK_KG;
    return {
      id: `${this.cls.id}/${this.archetype.id}`,
      archetype: this.archetype,
      level: this.level,
      attributes,
      weaponSkill: this.skills[this.archetype.weaponSkill] ?? MISSING_WEAPON_SKILL,
      armourSkill: this.skills[this.armourSkillId],
      weaponMaterial: this.weaponMaterial,
      armourRating,
      temperGrades: this.temperGrades,
      enchantDamageBonus: gearTierBonus(this.gearTier, 0.2, 0.1),
      spellCostReduction: gearTierBonus(this.gearTier, 0.25, 0.1),
      arrowBonus: data.builds.arrowMaterialBonusByTier[String(this.gearTier)] ?? 1,
      health: this.health,
      stamina: maxStamina(attributes, data),
      staminaRegen: staminaRegen(attributes, data),
      magicka: maxMagicka(attributes, 0, data),
      magickaRegen: magickaRegen(attributes, data),
      carriedKg,
      burden: burdenTier(carriedKg, attributes, data),
      potionsCarried,
    };
  }
}

/** Which sneak-attack table a build's weapon uses. */
const openerWeaponKind = (arch: Archetype): string => {
  if (arch.weaponSkill === "destruction") return "spell";
  if (arch.weaponClass === "dagger") return "dagger";
  if (arch.weaponClass === "shortSword") return "shortBlade";
  if (["warbow", "longbow", "shortbow"].includes(arch.weaponClass)) return "bow";
  if (["greatsword", "greataxe", "warhammer", "spear", "halberd"].includes(arch.weaponClass)) return "twoHanded";
  return "oneHanded";
};

const pickBand = (mix: Record<string, number>, roll: number): string => {
  let acc = 0;
  for (const [bandId, share] of Object.entries(mix)) {
    acc += share;
    if (roll <= acc) return bandId;
  }
  return Object.keys(mix).at(-1) as string;
};

/** Deterministic pseudo-noise, so runs are reproducible. */
const wobble = (i: number) => ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;

/** Bend an authored mix toward the skills this character chose, then renormalise. */
function bentMix(mix: Record<string, number>, ch: LiveCharacter, affinity: Record<string, number>, data: SimData) {
  const out: Record<string, number> = {};
  let sum = 0;
  for (const [id, weight] of Object.entries(mix)) {
    if (id.startsWith("_") || !data.skillById[id as SkillId]) continue;
    out[id] = weight * affinity[ch.klassOf(id)];
    sum += out[id];
  }
  if (sum <= 0) return {};
  for (const id of Object.keys(out)) out[id] /= sum;
  return out;
}

/** Verb shares are absolute: bend, then cap at the content's supply. Locomotion is a property of the world, never bent. */
const LOCOMOTION = new Set(["travel", "swim"]);
function bentShares(shares: Record<string, number>, ch: LiveCharacter, affinity: Record<string, number>) {
  const out: Record<string, number> = {};
  for (const [verb, share] of Object.entries(shares)) {
    if (verb.startsWith("_")) continue;
    const skillId = VERB_SKILL[verb];
    const bend = LOCOMOTION.has(verb) || !skillId ? 1 : affinity[ch.klassOf(skillId)];
    out[verb] = Math.min(1, share * bend);
  }
  return out;
}

export type CampaignOptions = {
  classId: string;
  race: string;
  archetypeId: string;
  label?: string;
  rules?: SimTable;
  content?: SimTable;
  tracks?: readonly string[];
  stopHours?: number;
};

export type TimelineRow = Record<string, number | string | undefined> & {
  act: string; hours: number; level: number; deaths: number; weaponSkill: number;
};

export type CampaignRun = {
  label?: string; classId: string; race: string; archetypeId: string; rulesId: string; contentId: string;
  hours: number; timeline: TimelineRow[]; levelByHour: number[]; levelHours: (number | null)[];
  maxedAtHour: Record<string, number>; levelAt: (h: number) => number; hourAtLevel: (n: number) => number | null;
  character: LiveCharacter; skills: Record<string, number>;
  mix: CampaignMix; discard: CampaignDiscard;
};

export type CampaignMix = {
  encountersPerHour: number; combatShareOfWallClock: number; travelKm: number; movingShareOfWallClock: number;
  swimShareOfWallClock: number; meanTravelSpeedMps: number; locks: number; persuasions: number; brews: number;
  repairs: number; blocks: number; playerConnects: number; incomingHits: number; connectsPerFight: number;
};
export type CampaignDiscard = {
  pointsDelivered: number; atCapRate: number; zeroCreditRate: number; partialCreditRate: number;
  useDiscardRate: number; levelCreditForgoneRate: number;
};

/**
 * Play a whole game. `tracks` selects which hour budgets to spend (both by
 * default, or `["quest"]` alone for the main-quest probe); `stopHours` cuts the
 * run short at a wall-clock hour.
 */
export function playCampaign(
  {
    classId, race, archetypeId, label, rules, content,
    tracks = ["quest", "free"], stopHours = Infinity,
  }: CampaignOptions,
  data: SimData = SIM_DATA,
): CampaignRun {
  rules ??= data.rules.argonia;
  content ??= data.content.argonia;
  const ch = new LiveCharacter({ classId, race, archetypeId, rules }, data);
  const ps = content.playerSkill;
  const affinity = content.classAffinity;
  const raw = content.verbProfiles[ch.archetype.id];
  const profile = {
    weaponMix: bentMix(raw.weaponMix, ch, affinity, data),
    armourMix: bentMix(raw.armourMix, ch, affinity, data),
    spellMix: bentMix(raw.spellMix, ch, affinity, data),
    blockShare: raw.blockShare,
    utilityCastShare: raw.utilityCastShare,
    verbShare: bentShares(raw.verbShare, ch, affinity),
  };
  const hit = content.hitRate ?? { player: 1, enemy: 1 };
  const W = rules.worthiness;
  const U = rules.use;
  const sliceHours = content.sliceHours ?? DEFAULT_SLICE_HOURS;
  const economy = data.economy as SimTable;
  const bandOrder = data.ladder.bands.map((b) => b.id);

  const timeline: TimelineRow[] = [];
  const levelByHour: number[] = [];
  // Wall-clock hour at which each level and each skill cap was first reached.
  const levelHours: (number | null)[] = [null, 0];
  const maxedAtHour: Record<string, number> = {};
  let hours = 0;
  let step = 0;
  let potionsCarried = STARTING_POTIONS;
  let stopped = false;

  const totals = {
    encounters: 0, fightSeconds: 0, travelKm: 0, travelSeconds: 0, swimSeconds: 0,
    locks: 0, persuasions: 0, brews: 0, repairs: 0, blocks: 0, playerConnects: 0,
    incomingHits: 0, contentHours: 0,
  };

  const award = (skillId: string, points: number) => ch.use(skillId, points);
  const awardMix = (mix: Record<string, number>, points: number, valueOf: (id: string) => number) => {
    for (const [skillId, share] of Object.entries(mix)) award(skillId, points * share * valueOf(skillId));
  };

  outer: for (const act of content.acts as SimTable[]) {
    ch.gearTier = act.gearTier;
    ch.temperGrades = gearTierBonus(act.gearTier, 2, 1);
    const actStart = { level: ch.level, ranks: ch.totalRanks, hours };
    let actDeaths = 0;

    for (const trackId of tracks) {
      const track = { ...content.trackDefaults[trackId], ...(act[trackId] ?? {}) };
      const trackHours = act.hours * content.trackShare[trackId];
      const overreachChance = content.overreach[trackId] ?? content.overreach.chance ?? 0;
      let pendingFights = 0;
      let pendingRests = 0;
      let trainingBudget = 0;

      for (let done = 0; done < trackHours - 1e-9; ) {
        const dt = Math.min(sliceHours, trackHours - done);
        done += dt;
        hours += dt;
        totals.contentHours += dt;

        const avoidance = Math.min(
          ps.endAvoidance,
          ps.startAvoidance + (ps.endAvoidance - ps.startAvoidance) * Math.min(1, hours / ps.hoursToPeak),
        );
        const style = ps.styleAvoidanceBonus[ch.archetype.id] ?? 0;
        const effAvoidance = Math.min(MAX_AVOIDANCE, avoidance + style);

        // --- fights
        pendingFights += track.encountersPerHour * dt;
        while (pendingFights >= 1) {
          pendingFights -= 1;
          step += 1;
          totals.encounters += 1;
          let bandId = pickBand(act.bandMix, wobble(step));
          // Overreach: a fixed world lets you walk into something you are not ready for.
          if (wobble(step + 17) < overreachChance) {
            bandId = bandOrder[Math.min(bandOrder.length - 1, bandOrder.indexOf(bandId) + 1)];
          }
          const enemy = bandActor(bandId, 0.3 + 0.5 * wobble(step + 7), data);
          const build = ch.toBuild(potionsCarried);
          const opensUnseen = wobble(step + 3) < (ps.sneakOpenerChance[ch.archetype.id] ?? DEFAULT_SNEAK_OPENER_CHANCE);
          const fight = simulateFight(build, enemy, {
            avoidance: effAvoidance,
            blockShare: profile.blockShare,
            opener: opensUnseen ? { weapon: openerWeaponKind(ch.archetype), sneakSkill: ch.skills.sneak } : null,
          }, data);
          // An authored encounter is a scene of several actors: volume and wall-clock
          // scale from the one-actor fight; lethality does not (the ladder owns that).
          const actors = track.actorsPerEncounter ?? 1;
          ch.potionsUsed += fight.potionsUsed;
          totals.fightSeconds +=
            fight.seconds * actors * (track.encounterTempoMultiplier ?? 1) +
            (track.encounterOverheadSeconds ?? 0);
          if (opensUnseen) award("sneak", U.sneakSuccess);

          // --- offence: real connect counts times worthiness.
          const connects = fight.swings * hit.player;
          totals.playerConnects += connects * actors;
          const counted = connects * actors;
          const offenceWorth = W
            ? clamp(fight.meanDamagePerSwing / enemy.health / W.fullUseDamageFraction, W.minUseValue, 1)
            : 1;
          awardMix(profile.weaponMix, counted * offenceWorth, (id) => connectValue(rules, id));

          // --- defence: keyed to what the enemy threw. Blocks pay Block; the rest pays armour.
          const swingsAtYou = fight.enemySwings * hit.enemy * actors;
          const reaching = swingsAtYou * (1 - effAvoidance * (ps.armourDodgeShare?.value ?? 0));
          const blocked = reaching * profile.blockShare;
          const damaging = reaching - blocked;
          totals.blocks += blocked;
          totals.incomingHits += damaging;
          const perHit = fight.damageTaken / Math.max(1, fight.enemySwings);
          const defenceWorth = W
            ? clamp(perHit / build.health / W.fullUseDamageFraction, W.minUseValue, 1)
            : 1;
          // Armour accrual is class-weighted (owner 2026-08-30); rule sets without
          // an armourAccrual block (Morrowind) keep pure hit-taken accrual.
          const AK = rules.armourAccrual;
          const hitWeight = (id: string) => AK?.classWeights?.[id]?.hit ?? 1;
          awardMix(profile.armourMix, damaging * defenceWorth, (id) =>
            (id === "unarmored" ? U.unarmoredHitTaken : U.armourHitTaken) * hitWeight(id));
          award("block", blocked * U.block);
          if (AK && fight.won) {
            // The kill award: keyed to kills, scaled by how big the dead thing was next to you.
            const killWorth = clamp(
              enemy.health / (AK.killHealthDivisor * build.health),
              W?.minUseValue ?? 0.05, 1);
            awardMix(profile.armourMix, actors * killWorth * AK.killAward, (id) =>
              AK.classWeights?.[id]?.win ?? 1);
          }

          if (!fight.won) {
            ch.deaths += 1;
            actDeaths += 1;
            hours += content.deathModel.minutesLostPerDeath / 60;
            if (wobble(step + 31) > content.deathModel.retrievalSuccessRate) ch.vastei *= 0.5;
          } else {
            // What falls off the corpse; placed treasure is counted per hour as lootGoldPerHour.
            ch.gold += (economy.income.perBandClear[bandId] ?? 0) * actors;
          }
        }

        // --- travel, water and vertical ground
        const s = profile.verbShare;
        const runSeconds = ((track.travelKmPerHour * dt * 1000) / track.travelSpeedMetresPerSecond) * s.travel;
        totals.travelKm += track.travelKmPerHour * dt * s.travel;
        totals.travelSeconds += runSeconds;
        award("athletics", runSeconds * U.athleticsPerSecondRunning);
        const swimSeconds = track.swimMinutesPerHour * 60 * dt * s.swim;
        totals.swimSeconds += swimSeconds;
        award("athletics", swimSeconds * U.athleticsPerSecondSwimming);
        award("acrobatics", track.jumpsPerHour * dt * s.jump * U.acrobaticsJump);
        award("acrobatics", track.hardLandingsPerHour * dt * s.jump * U.acrobaticsHardLanding);
        award("acrobatics", (track.climbMetresPerHour / 10) * dt * s.climb * (U.acrobaticsPerTenMetresClimbed ?? 0));

        // --- the rest of the verb list
        const locks = track.locksPerHour * dt * s.lock;
        const traps = track.trapsPerHour * dt * s.trap;
        totals.locks += locks;
        award("security", locks * U.securityLock + traps * U.securityTrap);
        const persuasions = track.persuasionsPerHour * dt * s.persuasion;
        totals.persuasions += persuasions;
        award("speechcraft", persuasions * U.speechcraftPersuasion);
        award(
          "mercantile",
          track.bartersPerHour * dt * s.barter * track.pricePercentMoved * U.mercantilePerPercentMoved,
        );
        const brews = track.potionsBrewedPerHour * dt * s.brew;
        totals.brews += brews;
        award("alchemy", brews * U.alchemyPotion);
        const repairs = track.repairsPerHour * dt * s.repair;
        totals.repairs += repairs;
        award("smithing", repairs * U.smithingRepair);
        award("enchant", track.enchantsPerHour * dt * s.enchant * U.enchantItem);
        award("sneak", track.sneakSuccessesPerHour * dt * s.sneak * U.sneakSuccess);
        awardMix(profile.spellMix, track.utilityCastsPerHour * dt * profile.utilityCastShare, () => U.spellCast);

        // --- money, rests, training
        const income = track.lootGoldPerHour * dt;
        ch.gold += income;
        ch.gold -= income * (content.spending.potionFractionOfIncome + content.spending.repairAndUpkeepFraction);
        trainingBudget += income * content.spending.trainingFraction;
        potionsCarried = Math.min(
          content.potionCarryCap ?? DEFAULT_POTION_CARRY_CAP,
          STARTING_POTIONS + Math.floor(ch.gold / GOLD_PER_EXTRA_POTION),
        );

        pendingRests += track.restsPerHour * dt;
        while (pendingRests >= 1) {
          pendingRests -= 1;
          ch.rest();
          // Training at a town rest: never above the governing attribute, and no vastei.
          for (const skillId of ch.cls.majors) {
            const value = ch.skills[skillId];
            if (value >= ch.attributes[data.skillById[skillId].gov] || value >= 100) continue;
            const cost = economy.training.costPerRank * Math.pow(value, economy.training.costRankExponent);
            if (cost > trainingBudget || cost > ch.gold) continue;
            trainingBudget -= cost;
            ch.gold -= cost;
            ch.trainingSpent += cost;
            ch.skills[skillId] += 1;
            ch.totalRanks += 1;
            ch.creditEarned += 1;
            ch.ranksSinceLevel += 1;
            while (ch.ranksSinceLevel >= rules.levelTrigger.ranksPerLevel) {
              ch.ranksSinceLevel -= rules.levelTrigger.ranksPerLevel;
              ch.pendingLevels += 1;
            }
          }
        }

        while (levelByHour.length < Math.floor(hours) + 1) levelByHour.push(ch.level);
        levelByHour[Math.floor(hours)] = ch.level;
        while (levelHours.length <= ch.level) levelHours.push(+hours.toFixed(2));
        for (const [id, v] of Object.entries(ch.skills)) {
          if (v >= 100 && maxedAtHour[id] === undefined) maxedAtHour[id] = +hours.toFixed(1);
        }
        if (hours >= stopHours) {
          stopped = true;
          break;
        }
      }
      if (stopped) break outer;
    }

    const build = ch.toBuild(potionsCarried);
    const climbCheck = climb(ACT_CLIMB_CHECK_METRES, {
      acrobatics: ch.skills.acrobatics,
      attributes: ch.attributes as Attributes,
      burdenTier: build.burden.tier,
      stamina: build.stamina,
      staminaRegen: build.staminaRegen,
    }, data);

    timeline.push({
      act: act.id,
      label: act.label ?? act.id,
      hours: Math.round(hours),
      level: ch.level,
      levelsGained: ch.level - actStart.level,
      deaths: actDeaths,
      deathsTotal: ch.deaths,
      deathsPerHour: +(actDeaths / Math.max(0.01, hours - actStart.hours)).toFixed(2),
      health: Math.round(build.health),
      armourRating: Math.round(build.armourRating),
      weaponSkill: ch.skills[ch.archetype.weaponSkill],
      armourSkillValue: ch.skills[ch.armourSkillId],
      athletics: ch.skills.athletics,
      acrobatics: ch.skills.acrobatics,
      speechcraft: ch.skills.speechcraft,
      security: ch.skills.security,
      block: ch.skills.block,
      sneak: ch.skills.sneak,
      alchemy: ch.skills.alchemy,
      smithing: ch.skills.smithing,
      attributePoints: ch.attributePoints,
      ranks: ch.totalRanks,
      ranksThisAct: ch.totalRanks - actStart.ranks,
      vasteiBanked: Math.round(ch.vastei),
      gold: Math.round(ch.gold),
      potionsUsed: ch.potionsUsed,
      climb25m: climbCheck.completesInOneGo
        ? "in one go"
        : climbCheck.sustainableMeters >= ACT_CLIMB_CHECK_METRES ? "with rests" : "cannot",
      burden: build.burden.tier,
    });
  }

  const wallSeconds = Math.max(1, hours * 3600);
  const delivered = Math.max(1e-9, ch.pointsDelivered);
  return {
    label,
    classId,
    race: ch.race.id,
    archetypeId,
    rulesId: rules.id,
    contentId: content.id,
    hours: +hours.toFixed(1),
    timeline,
    levelByHour,
    levelHours,
    maxedAtHour,
    levelAt: (h: number) => levelByHour[Math.min(levelByHour.length - 1, Math.max(0, Math.round(h)))] ?? 1,
    hourAtLevel: (n: number) => levelHours[n] ?? null,
    character: ch,
    skills: { ...ch.skills },
    mix: {
      encountersPerHour: +(totals.encounters / hours).toFixed(2),
      combatShareOfWallClock: +(totals.fightSeconds / wallSeconds).toFixed(3),
      travelKm: Math.round(totals.travelKm),
      movingShareOfWallClock: +(totals.travelSeconds / wallSeconds).toFixed(3),
      swimShareOfWallClock: +(totals.swimSeconds / wallSeconds).toFixed(3),
      meanTravelSpeedMps: +(totals.travelKm * 1000 / wallSeconds).toFixed(2),
      locks: Math.round(totals.locks),
      persuasions: Math.round(totals.persuasions),
      brews: Math.round(totals.brews),
      repairs: Math.round(totals.repairs),
      blocks: Math.round(totals.blocks),
      playerConnects: Math.round(totals.playerConnects),
      incomingHits: Math.round(totals.incomingHits),
      connectsPerFight: +(totals.playerConnects / Math.max(1, totals.encounters)).toFixed(1),
    },
    /** The discard rate: use delivered that bought no level credit, as a first-class output. */
    discard: {
      pointsDelivered: Math.round(ch.pointsDelivered),
      atCapRate: +(ch.pointsAtCapDiscarded / delivered).toFixed(3),
      zeroCreditRate: +(ch.pointsIntoZeroCreditRanks / delivered).toFixed(3),
      partialCreditRate: +(ch.pointsIntoPartialCreditRanks / delivered).toFixed(3),
      useDiscardRate: +((ch.pointsAtCapDiscarded + ch.pointsIntoZeroCreditRanks) / delivered).toFixed(3),
      levelCreditForgoneRate: +(
        ch.creditForgone / Math.max(1e-9, ch.creditEarned + ch.creditForgone)
      ).toFixed(3),
    },
  };
}
