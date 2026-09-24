/**
 * The sweeps (port of tooling/stats-sim/src/sweeps.mjs): bulk parameter sets,
 * not hand-picked cases. Each returns plain data; `invariants.ts` judges it.
 */
import { damagePosition, effectiveSkill, softRequirementStaminaMultiplier } from "../curve";
import {
  breathSeconds, burdenTier, carryCapacity, climb, maxHealth, maxStamina, mitigation, sneakMultiplier, staminaRegen,
  unarmouredRating,
} from "../derived";
import { bandActor } from "../ladder";
import { brewMagnitude, trainingCostRange } from "../crafting";
import { attributeCost } from "../progression";
import { playCampaign, type CampaignRun } from "./campaign";
import {
  armourSetRating, armourSetWeight, compiledEnemies, duel, listedDamage, makeBuild, offenceSummary, playCharacter,
  shieldWeight, weaponWeight,
} from "./model";
import { SIM_DATA, type SimData, type SimTable } from "./simData";

const bands = (data: SimData) => data.ladder.bands.map((b) => b.id);
const checkpoints = (data: SimData): string[] => (data.builds.checkpoints as SimTable[]).map((c) => c.id);
const archetypes = (data: SimData) => Object.keys(data.builds.archetypes);

/** The sandbox as playtested (the Marsh Hand's numbers before workstream S). */
const SANDBOX_TODAY = {
  health: 100, stamina: 100, staminaRegen: 24, carryCapacityKg: 180,
  mitigationAt50vs24: 0.25, lightChain: [24, 29.04, 34.08], heavies: [45.12, 58.08],
};
/** Cuirass 30 + gauntlets 10 + boots 10, steel: the reference loadout's raw rating. */
const RAW_STEEL_RATING = 50;
/** The light blow the reference mitigation is quoted against. */
const REFERENCE_LIGHT_HIT = 24;
/** Matrix and fairness positions within a band. */
export const BAND_POSITIONS = [0.15, 0.5, 0.85] as const;
/** Heal of one strong potion, used to price the potions drunk in a fight. */
const STRONG_POTION_HEAL = 140;
/** An underwater segment is cleared with this margin of breath to spare. */
const BREATH_MARGIN = 1.15;
/** A daedric warhammer's requirement a level-1 Str-40 character is short of. */
const EXAMPLE_SHORTFALL = 8;

/** 1. Does the reference character still reproduce the sandbox as playtested? */
export function referenceCheck(data: SimData = SIM_DATA) {
  const build = makeBuild("competent", "melee", {}, data);
  const attrs = build.attributes;
  const refArmour = armourSetRating("steelRef", { armourSkill: 45, attributes: attrs }, data);
  return {
    health: maxHealth(attrs, 10, data),
    stamina: maxStamina(attrs, data),
    staminaRegen: staminaRegen(attrs, data),
    carryCapacityKg: carryCapacity(attrs, data),
    burden: build.burden,
    mitigationAt50vs24: mitigation(RAW_STEEL_RATING, REFERENCE_LIGHT_HIT, data),
    armourRatingWithSkill: refArmour,
    listedLightChain: ["light1", "light2", "light3"].map((a) => listedDamage("straightSword", "steel", a, data)),
    listedHeavies: ["heavy", "heavy2"].map((a) => listedDamage("straightSword", "steel", a, data)),
    damagePositionAtSkill60: damagePosition(effectiveSkill("longBlade", 60, attrs, data), data),
    breathSeconds: breathSeconds(40, attrs.endurance, false, data),
    sandboxToday: SANDBOX_TODAY,
  };
}

/** 2. Every build checkpoint x archetype x danger band, at three positions. */
export function matchupMatrix(data: SimData = SIM_DATA) {
  const rows = [];
  for (const cp of checkpoints(data)) {
    for (const arch of archetypes(data)) {
      const build = makeBuild(cp, arch, {}, data);
      for (const bandId of bands(data)) {
        for (const position of BAND_POSITIONS) {
          rows.push({ checkpoint: cp, archetype: arch, position, ...duel(build, bandActor(bandId, position, data), {}, data) });
        }
      }
    }
  }
  return rows;
}

/** 3. The named worked archetypes against four reference builds. */
export function namedArchetypeTable(data: SimData = SIM_DATA) {
  const builds = ["start", "competent", "veteran", "legend"].map((cp) => makeBuild(cp, "melee", {}, data));
  return compiledEnemies(data).map((enemy) => ({
    enemy: enemy.label ?? enemy.id,
    band: enemy.band,
    health: Math.round(enemy.health),
    damage: Math.round(enemy.damage),
    armourRating: Math.round(enemy.armourRating),
    lootValue: Math.round(enemy.lootValue),
    vs: builds.map((b) => {
      const d = duel(b, enemy, {}, data);
      return {
        build: b.checkpoint!.id as string,
        won: d.won,
        ttk: +d.ttkSeconds.toFixed(1),
        hitsToDie: d.hitsToDie,
        healthLeft: +(d.healthFraction * 100).toFixed(0),
        potions: d.potionsUsed,
      };
    }),
  }));
}

/** The endgame boss every build must be able to finish, and the avoidance a boss fight assumes. */
export const ENDGAME_BOSS = "xal-krona";
const BOSS_AVOIDANCE = 0.78;

/** 4. Build parity: can every archetype finish the endgame fight? */
export function buildParity(data: SimData = SIM_DATA) {
  const boss = compiledEnemies(data).find((e) => e.id === ENDGAME_BOSS)!;
  return archetypes(data).map((arch) => {
    const build = makeBuild("legend", arch, {}, data);
    const d = duel(build, boss, { avoidance: BOSS_AVOIDANCE }, data);
    return {
      archetype: arch,
      mode: d.mode,
      won: d.won,
      ttk: +d.ttkSeconds.toFixed(1),
      dps: +offenceSummary(build, boss, data).burstDps.toFixed(1),
      potionsUsed: d.potionsUsed,
      healthLeft: +(d.healthFraction * 100).toFixed(0),
      hitsToDie: d.hitsToDie,
    };
  });
}

/** 4b. What the god-build does to the world (it is meant to trivialise it). */
export function godCheck(data: SimData = SIM_DATA) {
  const rows = [];
  for (const bandId of bands(data)) {
    const enemy = bandActor(bandId, 0.85, data);
    for (const cp of ["competent", "legend", "god"]) {
      const d = duel(makeBuild(cp, "melee", {}, data), enemy, { avoidance: 0.35 }, data);
      rows.push({ band: bandId, build: cp, won: d.won, ttk: +d.ttkSeconds.toFixed(1), healthLeft: +(d.healthFraction * 100).toFixed(0), potions: d.potionsUsed });
    }
  }
  return rows;
}

/** 5. Encumbrance extremes: which loadouts land in which roll tier. */
export function burdenSweep(data: SimData = SIM_DATA) {
  const loadouts = [
    { id: "unarmoured + dagger", set: "none", weapon: "dagger", material: "iron", shield: false, pack: 8 },
    { id: "studded + sword", set: "studded", weapon: "straightSword", material: "steel", shield: false, pack: 18 },
    { id: "reference steel + shield", set: "steelRef", weapon: "straightSword", material: "steel", shield: true, pack: 18 },
    { id: "full steel + shield", set: "steelFull", weapon: "straightSword", material: "steel", shield: true, pack: 18 },
    { id: "ebony + greatsword", set: "ebony", weapon: "greatsword", material: "ebony", shield: false, pack: 18 },
    { id: "daedric + warhammer + shield", set: "daedric", weapon: "warhammer", material: "daedric", shield: true, pack: 18 },
    { id: "hoarder (daedric + 120 kg loot)", set: "daedric", weapon: "warhammer", material: "daedric", shield: true, pack: 120 },
  ];
  const strengths = [30, 40, 50, 65, 85, 100, 125];
  return loadouts.map((l) => {
    const kg =
      armourSetWeight(l.set, data) +
      weaponWeight(l.weapon, l.material, data) +
      (l.shield ? shieldWeight(l.material, data) : 0) +
      l.pack;
    return {
      loadout: l.id,
      kg: +kg.toFixed(1),
      tiers: Object.fromEntries(strengths.map((str) => [str, burdenTier(kg, { strength: str }, data).tier])),
    };
  });
}

/** 5b. Climbing: how far can each kind of character get up a wall? */
export function climbSweep(data: SimData = SIM_DATA) {
  const walls = [8, 15, 25, 40, 60];
  const cases = [
    { id: "hour one (Acrobatics 15, mid load)", acrobatics: 15, checkpoint: "start", archetype: "melee" },
    { id: "competent (Acrobatics 45, mid load)", acrobatics: 45, checkpoint: "competent", archetype: "melee" },
    { id: "scout (Acrobatics 70, light load)", acrobatics: 70, checkpoint: "veteran", archetype: "marksman" },
    { id: "master climber (Acrobatics 100)", acrobatics: 100, checkpoint: "master", archetype: "stealth" },
    { id: "knight in daedric (Acrobatics 45, fat)", acrobatics: 45, checkpoint: "legend", archetype: "melee" },
  ];
  return cases.map((c) => {
    const build = makeBuild(c.checkpoint, c.archetype, {}, data);
    const opts = {
      acrobatics: c.acrobatics,
      attributes: build.attributes,
      burdenTier: build.burden.tier,
      stamina: build.stamina,
      staminaRegen: build.staminaRegen,
    };
    const eight = climb(8, opts, data);
    return {
      who: c.id,
      burden: build.burden.tier,
      speed: +eight.speed.toFixed(2),
      drainPerSecond: +eight.drainPerSecond.toFixed(1),
      sustainableMeters: eight.sustainableMeters === Infinity ? "unlimited" : Math.round(eight.sustainableMeters),
      walls: Object.fromEntries(walls.map((h) => {
        const r = climb(h, opts, data);
        return [h, r.completesInOneGo ? `${r.seconds.toFixed(0)}s` : (r.sustainableMeters >= h ? "with rests" : "falls short")];
      })),
    };
  });
}

/** 5c. Sneak openers: what an unseen first blow is worth. */
export function sneakSweep(data: SimData = SIM_DATA) {
  const kinds = ["dagger", "shortBlade", "oneHanded", "twoHanded", "bow", "spell"];
  return [0, 25, 50, 75, 100].map((skill) => ({
    sneak: skill,
    multipliers: Object.fromEntries(kinds.map((kind) => [kind, sneakMultiplier(kind, skill, data)])),
  }));
}

/** 6. Breath against authored underwater segment lengths. */
export function breathSweep(data: SimData = SIM_DATA) {
  const segments = [30, 45, 60, 90, 120];
  const grid = [];
  for (const athletics of [5, 20, 40, 60, 80, 100]) {
    for (const endurance of [30, 50, 70, 100]) {
      const seconds = breathSeconds(athletics, endurance, false, data);
      grid.push({
        athletics,
        endurance,
        breathSeconds: +seconds.toFixed(1),
        clears: Object.fromEntries(segments.map((s) => [s, seconds >= s * BREATH_MARGIN])),
      });
    }
  }
  return { segments, grid, argonian: "unlimited (water breathing)" };
}

/** 7. Progression pacing and affordability, per preset class. */
export function progressionSweep(data: SimData = SIM_DATA) {
  return data.classes.classes.map((cls) => {
    const run = playCharacter({ classId: cls.id, race: "argonian", maxLevel: 40 }, data);
    const cps = [5, 10, 20, 30].map((lv) => {
      const h = run.history.find((x) => x.level === lv);
      return h
        ? {
            level: lv,
            ranks: h.ranks,
            pointsBoughtThisSitting: h.pointsBought,
            attributePointsTotal: h.attributePoints,
            health: h.health,
            carriedVastei: h.vasteiBalance,
          }
        : { level: lv, unreached: true as const };
    });
    return { class: cls.id, finalLevel: run.finalLevel, totalRanks: run.totalRanks, attributePoints: run.attributePoints, checkpoints: cps };
  });
}

/** The six plausible characters every campaign question is asked of (race ids mapped by `raceIn`). */
export const CAMPAIGN_BUILDS = [
  { label: "Argonian spear-warden (medium armour)", classId: "kaal", race: "argonian", archetypeId: "spear" },
  { label: "Nord shield-and-sword (heavy)", classId: "warrior", race: "nord", archetypeId: "melee" },
  { label: "Bosmer reed scout (bow, light)", classId: "scout", race: "bosmer", archetypeId: "marksman" },
  { label: "Breton sap-speaker (destruction)", classId: "mage", race: "breton", archetypeId: "magic" },
  { label: "Khajiit ledger hand (short blade, stealth)", classId: "thief", race: "khajiit", archetypeId: "stealth" },
  { label: "Orc greatsword (heavy, no shield)", classId: "warrior", race: "orc", archetypeId: "greatsword" },
] as const;

/** 7b. Whole-playthrough runs under our rules and our content, act by act. */
export function campaignSweep(data: SimData = SIM_DATA): CampaignRun[] {
  return CAMPAIGN_BUILDS.map((r) =>
    playCampaign({ ...r, rules: data.rules.argonia, content: data.content.argonia }, data),
  );
}

/** Pacing as a BAND across builds, never a single integer. */
export function pacingBand(runs: CampaignRun[], hoursOfInterest: number[]) {
  const at = (h: number) => {
    const levels = runs.map((r) => r.levelAt(h));
    return { hours: h, min: Math.min(...levels), max: Math.max(...levels), levels };
  };
  const hourAt = (level: number) => {
    const hs = runs.map((r) => r.hourAtLevel(level)).filter((x): x is number => x != null);
    return hs.length
      ? { level, min: Math.min(...hs), max: Math.max(...hs), reached: hs.length, of: runs.length }
      : { level, reached: 0, of: runs.length };
  };
  return {
    levelAtHour: hoursOfInterest.map(at),
    hourAtLevel: [2, 10, 20, 30, 40, 50].map(hourAt),
    endLevels: runs.map((r) => ({ label: r.label, level: r.timeline.at(-1)?.level ?? r.levelAt(r.hours), hours: r.hours })),
    discard: runs.map((r) => ({ label: r.label, ...r.discard })),
    mix: runs.map((r) => ({ label: r.label, ...r.mix })),
  };
}

/** 7c. Our own pacing, banded, against the targets in module 76. */
export function argoniaPacing(runs: CampaignRun[]) {
  return pacingBand(runs, [2, 5, 10, 20, 40, 80, 120, 150]);
}

/**
 * 7d. THE KNOWN-ANSWER TEST: Morrowind's rules against an estimate of
 * Morrowind's content, checked against TES III's documented pacing. The rules
 * half is never tuned; a miss is an error in the content estimate or the engine.
 */
export function morrowindKnownAnswer(data: SimData = SIM_DATA) {
  const rules = data.rules.morrowind;
  const content = data.content.vvardenfell;
  const runs = CAMPAIGN_BUILDS.map((r) => playCampaign({ ...r, rules, content }, data));
  // An Acrobat-shaped character: Athletics and Acrobatics both majors.
  const acrobat = playCampaign({
    label: "Acrobat-shaped (Athletics + Acrobatics majors)",
    classId: "marsh-guide", race: "bosmer", archetypeId: "spear", rules, content,
  }, data);
  const thief = runs.find((r) => r.classId === "thief")!;
  const mainQuestOnly = CAMPAIGN_BUILDS.map((r) =>
    playCampaign({ ...r, rules, content, tracks: ["quest"], stopHours: content.mainQuestHours }, data),
  );

  const band = pacingBand(runs, [1, 2, 20, 100, 120, 150]);
  const level = (h: number) => band.levelAtHour.find((x) => x.hours === h)!;
  const mqLevels = mainQuestOnly.map((r) => r.levelAt(content.mainQuestHours));
  const levelTwo = band.hourAtLevel.find((x) => x.level === 2)!;

  return {
    rules: rules.id as string,
    content: content.id as string,
    band,
    checks: [
      {
        id: "level-2-in-the-first-hour-or-two",
        expected: "hour 1-2",
        actual: levelTwo as unknown,
        pass: levelTwo.reached === levelTwo.of && (levelTwo.max ?? Infinity) <= 2.5 && (levelTwo.min ?? -Infinity) >= 0.4,
      },
      {
        id: "level-10-14-by-hour-20",
        expected: "10-14",
        actual: level(20),
        pass: level(20).min >= 7.5 && level(20).max <= 17.5,
      },
      {
        id: "level-30-45-by-hour-100-120",
        expected: "30-45",
        actual: { at100: level(100), at120: level(120) },
        pass: level(120).min >= 22.5 && level(100).max <= 56,
      },
      {
        id: "athletics-and-acrobatics-max-by-50-70h",
        expected: "both by hour 50-70",
        actual: { athletics: acrobat.maxedAtHour.athletics ?? null, acrobatics: acrobat.maxedAtHour.acrobatics ?? null },
        pass: [acrobat.maxedAtHour.athletics, acrobat.maxedAtHour.acrobatics].every(
          (h) => h != null && h >= 37 && h <= 88,
        ),
      },
      {
        id: "thief-maxes-security-in-a-normal-playthrough",
        expected: `by hour ${content.totalHours}`,
        actual: { security: thief.maxedAtHour.security ?? null, finalSecurity: thief.skills.security },
        pass: thief.maxedAtHour.security != null,
      },
      {
        id: "main-quest-alone-finishes-at-level-15-25",
        expected: "15-25",
        actual: { hours: content.mainQuestHours, levels: mqLevels, min: Math.min(...mqLevels), max: Math.max(...mqLevels) },
        pass: Math.min(...mqLevels) >= 11 && Math.max(...mqLevels) <= 31,
      },
    ],
    acrobat: { maxedAtHour: acrobat.maxedAtHour, finalLevel: acrobat.timeline.at(-1)?.level },
    runs,
  };
}

/** 7e. What our own main quest, played alone, is worth. */
export function argoniaMainQuestOnly(data: SimData = SIM_DATA) {
  const content = data.content.argonia;
  const runs = CAMPAIGN_BUILDS.map((r) =>
    playCampaign({ ...r, rules: data.rules.argonia, content, tracks: ["quest"], stopHours: content.mainQuestHours }, data),
  );
  const levels = runs.map((r) => r.levelAt(content.mainQuestHours));
  return { hours: content.mainQuestHours as number, min: Math.min(...levels), max: Math.max(...levels), levels };
}

/** 8. The deferral exploit: spending every sitting vs hoarding to level 20. */
export function deferralCheck(data: SimData = SIM_DATA) {
  const spend = playCharacter({ classId: "warrior", policy: "spend", maxLevel: 30 }, data);
  const hoard = playCharacter({ classId: "warrior", policy: "hoard", hoardUntilLevel: 20, maxLevel: 30 }, data);
  const at = (run: ReturnType<typeof playCharacter>, level: number) => run.history.find((h) => h.level === level);
  return {
    spend: { attributePoints: spend.attributePoints, meanHealthPerRank: +spend.meanHealthPerRank.toFixed(1), healthAt15: at(spend, 15)?.health },
    hoard: { attributePoints: hoard.attributePoints, meanHealthPerRank: +hoard.meanHealthPerRank.toFixed(1), healthAt15: at(hoard, 15)?.health },
    advantage: hoard.attributePoints - spend.attributePoints,
  };
}

/** Which checkpoint a band's economy is priced for. */
const ECONOMY_CHECKPOINT: Readonly<Record<string, string>> = {
  D0: "start", D1: "start", D2: "competent", D3: "veteran", D4: "master", D5: "legend",
};

/** 9. The economy: what it costs to potion your way through a fight, and to train. */
export function economySweep(data: SimData = SIM_DATA) {
  const economy = data.economy as SimTable;
  const magic = data.magic as SimTable;
  const potions = economy.potions.bought as SimTable[];
  const rows = bands(data).map((bandId) => {
    const enemy = bandActor(bandId, 0.6, data);
    const build = makeBuild(ECONOMY_CHECKPOINT[bandId], "melee", {}, data);
    // What an ordinary, slightly sloppy player loses in this fight.
    const sloppy = duel(build, enemy, { avoidance: 0.5 }, data);
    const fight = duel(build, enemy, { avoidance: 0.7 }, data);
    const damageTaken = build.health * (1 - fight.healthFraction) + fight.potionsUsed * STRONG_POTION_HEAL;
    const sloppyDamage = build.health * (1 - sloppy.healthFraction) + sloppy.potionsUsed * STRONG_POTION_HEAL;
    const cheapest = potions.reduce<{ potion?: string; count?: number; cost: number }>((best, p) => {
      const count = Math.ceil(damageTaken / p.heal);
      const cost = count * p.price;
      return cost < best.cost ? { potion: p.id, count, cost } : best;
    }, { cost: Infinity });
    const sloppyCost = potions.reduce((best, p) => {
      const count = Math.ceil(sloppyDamage / p.heal);
      const cost = count * p.price;
      return cost < best ? cost : best;
    }, Infinity);
    return {
      band: bandId,
      damageTakenCleanPlay: Math.round(damageTaken),
      damageTakenIfSloppy: Math.round(sloppyDamage),
      sloppyHealingCost: Math.round(sloppyCost),
      cheapestHealing: cheapest,
      lootValue: Math.round(enemy.lootValue),
      profitable: enemy.lootValue > cheapest.cost,
      incomePerClear: economy.income.perBandClear[bandId] as number | undefined,
    };
  });

  const trainingToCap = (from: number, to: number) => Math.round(trainingCostRange(from, to, data));
  const brewed = (alchemy: number, intelligence: number, apparatus: string) =>
    brewMagnitude(alchemy, intelligence, apparatus, "restoreHealth", data);

  return {
    fights: rows,
    trainingCost: { "30to50": trainingToCap(30, 50), "50to75": trainingToCap(50, 75), "75to100": trainingToCap(75, 100) },
    brewedHealing: {
      novice: Math.round(brewed(25, 35, "mortar")),
      competent: Math.round(brewed(60, 40, "journeyman")),
      master: Math.round(brewed(100, 100, "master")),
      ingredientCost: economy.potions.ingredientCost as number,
    },
  };
}

/** 10. Degenerate-loop hunting: each loop simulated as if its bound did not exist. */
export function loopHunt(data: SimData = SIM_DATA) {
  const magic = data.magic as SimTable;
  const brew = (alchemy: number, int: number, apparatus = "master") =>
    brewMagnitude(alchemy, int, apparatus, "fortifyAttribute", data);

  // (a) the Morrowind fortify-intelligence loop, with and without the base-stat rule
  const bounded: number[] = [];
  const unbounded: number[] = [];
  let int = 100;
  for (let i = 0; i < 6; i += 1) {
    bounded.push(Math.round(brew(100, 100)));
    unbounded.push(Math.round(brew(100, int)));
    int += brew(100, int); // the loop: the potion raises the input to the next potion
  }

  // (b) smithing tempering ceiling
  const temperCeiling = 1 + 3 * data.gear.temperPerGrade;

  // (c) enchant point budget at maximum
  const enchant = magic.enchanting;
  const maxBudget = enchant.pointBudgetBase * data.skillById.enchant.bands.pointBudget[1];

  // (d) armour ceiling: can anything reach immunity?
  const maxAR = armourSetRating("daedric", { armourSkill: 100, attributes: { endurance: 125 }, temperGrades: 3 }, data);
  const d5 = bandActor("D5", 0.85, data);

  // (e) misc-skill vastei farming: the throttle is the sitting cap, not the income
  const maxSittingSpend = (() => {
    let total = 0;
    for (const _attr of Object.keys((data.builds.checkpoints as SimTable[])[2].attributes)) {
      for (let n = 1; n <= data.curves.levelUp.sittingCap; n += 1) total += attributeCost(10, 50, n, data);
    }
    return Math.round(total);
  })();

  return {
    alchemyLoop: { boundedByBaseStats: bounded, ifOutputsFedInputs: unbounded },
    smithing: { maxMultiplier: temperCeiling },
    enchanting: { maxPointBudget: maxBudget, bannedEffects: enchant.bannedEffects },
    armourCeiling: {
      maxArmourRating: Math.round(maxAR),
      mitigationVsLightHit: +mitigation(maxAR, REFERENCE_LIGHT_HIT, data).toFixed(3),
      mitigationVsD5Hit: +mitigation(maxAR, d5.damage, data).toFixed(3),
    },
    unarmouredCeiling: Math.round(unarmouredRating(100, undefined, data)),
    vasteiFarming: { maxSpendInOneSittingAtLevel10: maxSittingSpend },
  };
}

/** 11. Soft requirements: an early daedric find is punishing, never blocked. */
export function softRequirementCheck(data: SimData = SIM_DATA) {
  const c = data.curves.softRequirement;
  const build = makeBuild("start", "melee", {}, data);
  const staminaMultiplier = softRequirementStaminaMultiplier(EXAMPLE_SHORTFALL, data);
  const warhammerLight = data.gear.moveset.light1.stamina * data.gear.weaponClasses.warhammer.staminaScale;
  const swing = warhammerLight * staminaMultiplier;
  const worstCase = softRequirementStaminaMultiplier(c.maxShortfall, data);
  return {
    maxShortfall: c.maxShortfall,
    exampleShortfall: EXAMPLE_SHORTFALL,
    staminaMultiplier: +staminaMultiplier.toFixed(2),
    staminaPerSwing: +swing.toFixed(1),
    startingStamina: build.stamina,
    stillUsable: swing < build.stamina,
    worstCaseMultiplier: +worstCase.toFixed(2),
    worstCaseSwing: +(warhammerLight * worstCase).toFixed(1),
    listedDaedricWarhammerLight: Math.round(listedDamage("warhammer", "daedric", "light1", data)),
  };
}
