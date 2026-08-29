/**
 * The sweeps: bulk parameter sets, not hand-picked cases.
 *
 * Each export returns plain data. `invariants.mjs` asserts against it and
 * `run.mjs` prints it. Nothing here decides whether a number is acceptable —
 * that is the invariants' job, so a sweep can always be read on its own.
 */

import {
  data,
  SKILLS,
  makeBuild,
  compiledEnemies,
  bandActor,
  duel,
  offenceSummary,
  maxHealth,
  maxStamina,
  staminaRegen,
  carryCapacity,
  burdenTier,
  mitigation,
  poise,
  breathSeconds,
  armourSetRating,
  armourSetWeight,
  weaponWeight,
  listedDamage,
  damagePosition,
  effectiveSkill,
  attributeCost,
  playCharacter,
  unarmouredRating,
} from "./model.mjs";

const BANDS = data.ladder.bands.map((b) => b.id);
const CHECKPOINTS = data.builds.checkpoints.map((c) => c.id);
const ARCHETYPES = Object.keys(data.builds.archetypes);

/** 1. Does the reference character still reproduce the sandbox as playtested? */
export function referenceCheck() {
  const build = makeBuild("competent", "melee");
  const attrs = build.attributes;
  const refArmour = armourSetRating("steelRef", { armourSkill: 45, attributes: attrs });
  const rawSteelRating = 50; // cuirass 30 + gauntlets 10 + boots 10, steel
  return {
    health: maxHealth(attrs, 10),
    stamina: maxStamina(attrs),
    staminaRegen: staminaRegen(attrs),
    carryCapacityKg: carryCapacity(attrs),
    burden: build.burden,
    poise: poise(attrs, rawSteelRating),
    mitigationAt50vs24: mitigation(rawSteelRating, 24),
    armourRatingWithSkill: refArmour,
    listedLightChain: ["light1", "light2", "light3"].map((a) => listedDamage("straightSword", "steel", a)),
    listedHeavies: ["heavy", "heavy2"].map((a) => listedDamage("straightSword", "steel", a)),
    damagePositionAtSkill60: damagePosition(effectiveSkill("longBlade", 60, attrs)),
    breathSeconds: breathSeconds(40, attrs.endurance),
    sandboxToday: {
      health: 100, stamina: 100, staminaRegen: 24, carryCapacityKg: 180,
      mitigationAt50vs24: 0.25, lightChain: [24, 29.04, 34.08], heavies: [45.12, 58.08],
    },
  };
}

/** 2. Every build checkpoint x archetype x danger band, mid-band. */
export function matchupMatrix() {
  const rows = [];
  for (const cp of CHECKPOINTS) {
    for (const arch of ARCHETYPES) {
      const build = makeBuild(cp, arch);
      for (const bandId of BANDS) {
        for (const position of [0.15, 0.5, 0.85]) {
          rows.push({ checkpoint: cp, archetype: arch, position, ...duel(build, bandActor(bandId, position)) });
        }
      }
    }
  }
  return rows;
}

/** 3. The named worked archetypes against three reference builds. */
export function namedArchetypeTable() {
  const builds = [
    makeBuild("start", "melee"),
    makeBuild("competent", "melee"),
    makeBuild("veteran", "melee"),
    makeBuild("legend", "melee"),
  ];
  return compiledEnemies().map((enemy) => ({
    enemy: enemy.label,
    band: enemy.band,
    health: Math.round(enemy.health),
    damage: Math.round(enemy.damage),
    armourRating: Math.round(enemy.armourRating),
    poise: Math.round(enemy.poise),
    lootValue: Math.round(enemy.lootValue),
    vs: builds.map((b) => {
      const d = duel(b, enemy);
      return {
        build: b.checkpoint.id,
        won: d.won,
        ttk: +d.ttkSeconds.toFixed(1),
        hitsToDie: d.hitsToDie,
        healthLeft: +(d.healthFraction * 100).toFixed(0),
        potions: d.potionsUsed,
      };
    }),
  }));
}

/** 4. Build parity: can every archetype finish the endgame fight? */
export function buildParity() {
  const boss = compiledEnemies().find((e) => e.id === "xal-krona");
  return ARCHETYPES.map((arch) => {
    const build = makeBuild("legend", arch);
    const d = duel(build, boss, { avoidance: 0.55 });
    return {
      archetype: arch,
      mode: d.mode,
      won: d.won,
      ttk: +d.ttkSeconds.toFixed(1),
      dps: +offenceSummary(build, boss).burstDps.toFixed(1),
      potionsUsed: d.potionsUsed,
      healthLeft: +(d.healthFraction * 100).toFixed(0),
      hitsToDie: d.hitsToDie,
    };
  });
}

/** 4b. What the god-build actually does to the world (it is meant to trivialise it). */
export function godCheck() {
  const rows = [];
  for (const bandId of BANDS) {
    const enemy = bandActor(bandId, 0.85);
    for (const cp of ["competent", "legend", "god"]) {
      const d = duel(makeBuild(cp, "melee"), enemy, { avoidance: 0.35 });
      rows.push({ band: bandId, build: cp, won: d.won, ttk: +d.ttkSeconds.toFixed(1), healthLeft: +(d.healthFraction * 100).toFixed(0), potions: d.potionsUsed });
    }
  }
  return rows;
}

/** 5. Encumbrance extremes: which loadouts land in which roll tier. */
export function burdenSweep() {
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
      armourSetWeight(l.set) +
      weaponWeight(l.weapon, l.material) +
      (l.shield ? data.gear.shieldWeightKg * data.gear.materials[l.material].weightScale : 0) +
      l.pack;
    return {
      loadout: l.id,
      kg: +kg.toFixed(1),
      tiers: Object.fromEntries(
        strengths.map((str) => [str, burdenTier(kg, { strength: str }).tier]),
      ),
    };
  });
}

/** 6. Breath and swim margins against authored underwater segment lengths. */
export function breathSweep() {
  const segments = [30, 45, 60, 90, 120];
  const grid = [];
  for (const athletics of [5, 20, 40, 60, 80, 100]) {
    for (const endurance of [30, 50, 70, 100]) {
      const seconds = breathSeconds(athletics, endurance);
      grid.push({
        athletics,
        endurance,
        breathSeconds: +seconds.toFixed(1),
        clears: Object.fromEntries(segments.map((s) => [s, seconds >= s * 1.15])),
      });
    }
  }
  return { segments, grid, argonian: "unlimited (water breathing)" };
}

/** 7. Progression pacing and affordability, per preset class. */
export function progressionSweep() {
  return data.classes.classes.map((cls) => {
    const run = playCharacter({ classId: cls.id, race: "argonian", maxLevel: 40 });
    const checkpoints = [5, 10, 20, 30].map((lv) => {
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
        : { level: lv, unreached: true };
    });
    return { class: cls.id, finalLevel: run.finalLevel, totalRanks: run.totalRanks, attributePoints: run.attributePoints, checkpoints };
  });
}

/** 8. The deferral exploit: spending every sitting vs hoarding to level 20. */
export function deferralCheck() {
  const spend = playCharacter({ classId: "marsh-hand", policy: "spend", maxLevel: 30 });
  const hoard = playCharacter({ classId: "marsh-hand", policy: "hoard", hoardUntilLevel: 20, maxLevel: 30 });
  const at = (run, level) => run.history.find((h) => h.level === level);
  return {
    spend: { attributePoints: spend.attributePoints, meanHealthPerRank: +spend.meanHealthPerRank.toFixed(1), healthAt15: at(spend, 15)?.health },
    hoard: { attributePoints: hoard.attributePoints, meanHealthPerRank: +hoard.meanHealthPerRank.toFixed(1), healthAt15: at(hoard, 15)?.health },
    advantage: hoard.attributePoints - spend.attributePoints,
  };
}

/** 9. The economy: what it costs to potion your way through a fight, and to train. */
export function economySweep() {
  const potions = data.economy.potions.bought;
  const rows = BANDS.map((bandId) => {
    const enemy = bandActor(bandId, 0.6);
    const build = makeBuild("competent", "melee");
    const def = { perHit: duel(build, enemy).enemyPerHit };
    const damageTaken = def.perHit * 4; // a scrappy fight: four blows eaten
    const cheapest = potions.reduce((best, p) => {
      const count = Math.ceil(damageTaken / p.heal);
      const cost = count * p.price;
      return cost < best.cost ? { potion: p.id, count, cost } : best;
    }, { cost: Infinity });
    return {
      band: bandId,
      damageTakenIfSloppy: Math.round(damageTaken),
      cheapestHealing: cheapest,
      lootValue: Math.round(enemy.lootValue),
      profitable: enemy.lootValue > cheapest.cost,
      incomePerClear: data.economy.income.perBandClear[bandId],
    };
  });

  const trainingToCap = (from, to) => {
    let total = 0;
    for (let r = from; r < to; r += 1) {
      total += data.economy.training.costPerRank * Math.pow(r, data.economy.training.costRankExponent);
    }
    return Math.round(total);
  };

  const brewed = (alchemy, intelligence, apparatus) =>
    (data.magic.alchemy.magnitudeMultiplier * (alchemy + intelligence / 10) * data.magic.alchemy.apparatus[apparatus]) /
    (3 * data.magic.alchemy.effectBaseCost.restoreHealth);

  return {
    fights: rows,
    trainingCost: { "30to50": trainingToCap(30, 50), "50to75": trainingToCap(50, 75), "75to100": trainingToCap(75, 100) },
    brewedHealing: {
      novice: Math.round(brewed(25, 35, "mortar")),
      competent: Math.round(brewed(60, 40, "journeyman")),
      master: Math.round(brewed(100, 100, "master")),
      ingredientCost: data.economy.potions.ingredientCost,
    },
  };
}

/**
 * 10. Degenerate-loop hunting. Each loop is simulated *as if* the bound did not
 * exist, so the report shows what the bound is actually preventing.
 */
export function loopHunt() {
  const A = data.magic.alchemy;
  const brew = (alchemy, int, apparatus = "master") =>
    (A.magnitudeMultiplier * (alchemy + int / 10) * A.apparatus[apparatus]) / (3 * A.effectBaseCost.fortifyAttribute);

  // (a) the Morrowind fortify-intelligence loop, with and without the base-stat rule
  const bounded = [];
  const unbounded = [];
  let int = 100;
  for (let i = 0; i < 6; i += 1) {
    bounded.push(Math.round(brew(100, 100)));
    unbounded.push(Math.round(brew(100, int)));
    int += brew(100, int); // the loop: the potion raises the input to the next potion
  }

  // (b) smithing tempering ceiling
  const temperCeiling = 1 + 3 * data.gear.temperPerGrade;

  // (c) enchant point budget at maximum
  const enchant = data.magic.enchanting;
  const maxBudget = enchant.pointBudgetBase * SKILLS.enchant.bands.pointBudget[1];

  // (d) armour ceiling: can anything reach immunity?
  const maxAR = armourSetRating("daedric", { armourSkill: 100, attributes: { endurance: 125 }, temperGrades: 3 });
  const d5 = bandActor("D5", 0.85);

  // (e) misc-skill vastei farming: the throttle is the sitting cap, not the income
  const maxSittingSpend = (() => {
    let total = 0;
    for (const attr of Object.keys(data.builds.checkpoints[2].attributes)) {
      for (let n = 1; n <= data.curves.levelUp.sittingCap; n += 1) total += attributeCost(10, 50, n);
    }
    return Math.round(total);
  })();

  return {
    alchemyLoop: { boundedByBaseStats: bounded, ifOutputsFedInputs: unbounded },
    smithing: { maxMultiplier: temperCeiling },
    enchanting: { maxPointBudget: maxBudget, bannedEffects: enchant.bannedEffects },
    armourCeiling: {
      maxArmourRating: Math.round(maxAR),
      mitigationVsLightHit: +mitigation(maxAR, 24).toFixed(3),
      mitigationVsD5Hit: +mitigation(maxAR, d5.damage).toFixed(3),
    },
    unarmouredCeiling: Math.round(unarmouredRating(100)),
    vasteiFarming: { maxSpendInOneSittingAtLevel10: maxSittingSpend },
  };
}

/** 11. Soft requirements: an early daedric find is punishing, never blocked. */
export function softRequirementCheck() {
  const c = data.curves.softRequirement;
  const build = makeBuild("start", "melee");
  const shortfall = Math.min(c.maxShortfall, 18 - 0 + 0); // daedric str+8 over a base 10 requirement vs Str 40 start
  const d = 8; // daedric requirement bonus a level-1 Str 40 character is short of on a warhammer
  const staminaMultiplier = 1 + c.staminaPerPoint * d;
  const swing = data.gear.moveset.light1.stamina * data.gear.weaponClasses.warhammer.staminaScale * staminaMultiplier;
  return {
    maxShortfall: c.maxShortfall,
    exampleShortfall: d,
    staminaMultiplier: +staminaMultiplier.toFixed(2),
    staminaPerSwing: +swing.toFixed(1),
    startingStamina: build.stamina,
    stillUsable: swing < build.stamina,
    worstCaseMultiplier: +(1 + c.staminaPerPoint * c.maxShortfall).toFixed(2),
    worstCaseSwing: +(data.gear.moveset.light1.stamina * data.gear.weaponClasses.warhammer.staminaScale * (1 + c.staminaPerPoint * c.maxShortfall)).toFixed(1),
    listedDaedricWarhammerLight: Math.round(listedDamage("warhammer", "daedric", "light1")),
  };
}
