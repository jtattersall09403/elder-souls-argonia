/**
 * The coarse playthrough simulation: a whole character's game, act by act.
 *
 * Everything else in this harness answers "is this fight fair?". This answers
 * the questions you can only ask about a *campaign*: when does a character
 * level, how often do they die, how fast does each skill actually climb, and
 * does the curve still make sense ninety hours in.
 *
 * It is a thought experiment with arithmetic attached, not a playtest. The
 * content shape is `data/campaign.json`; the maths is the same `model.mjs`
 * everything else uses, so if the design changes, this changes with it.
 */

import {
  data,
  SKILLS,
  maxHealth,
  maxStamina,
  staminaRegen,
  maxMagicka,
  magickaRegen,
  carryCapacity,
  burdenTier,
  armourSetRating,
  armourSetWeight,
  weaponWeight,
  unarmouredRating,
  effectiveSkill,
  bandActor,
  simulateFight,
  vasteiPerRank,
  attributeCost,
  climb,
} from "./model.mjs";

const C = data.curves;
const CAMP = data.campaign;

/** Use-points needed for the next rank of a skill. */
const rankCost = (value, klass, specialised) =>
  (value + 1) *
  C.skillXp.classFactor[klass] *
  (specialised ? C.skillXp.specFactor : 1);

/**
 * A character that actually changes as it plays, rather than a checkpoint
 * looked up in a table.
 */
class LiveCharacter {
  constructor({ classId, race, archetypeId }) {
    const cls = data.classes.classes.find((c) => c.id === classId);
    const raceEntry = data.races.races.find((r) => r.id === race);
    this.cls = cls;
    this.race = raceEntry;
    this.archetype = { id: archetypeId, ...data.builds.archetypes[archetypeId] };
    this.attributes = { ...raceEntry.attributes };
    for (const a of cls.favouredAttributes) this.attributes[a] += data.classes.favouredAttributeBonus;

    this.skills = {};
    this.progress = {};
    for (const s of data.skills.skills) {
      let v = data.classes.startingSkill + (raceEntry.skillBonuses[s.id] ?? 0);
      if (cls.majors.includes(s.id)) v += data.classes.majorBonus;
      else if (cls.minors.includes(s.id)) v += data.classes.minorBonus;
      if (s.spec === cls.specialization) v += data.classes.specializationBonus;
      this.skills[s.id] = v;
      this.progress[s.id] = 0;
    }

    this.level = 1;
    this.vastei = 0;
    this.gold = 60;
    this.pendingLevels = 0;
    this.ranksSinceLevel = 0;
    this.totalRanks = 0;
    this.attributePoints = 0;
    this.gearTier = 1;
    this.temperGrades = 0;
    this.deaths = 0;
    this.potionsUsed = 0;
    this.trainingSpent = 0;
  }

  klassOf(skillId) {
    if (this.cls.majors.includes(skillId)) return "major";
    if (this.cls.minors.includes(skillId)) return "minor";
    return "misc";
  }

  /** Award use-points; convert to ranks (and vastei) as they fill up. */
  use(skillId, points, { earnsVastei = true } = {}) {
    if (!SKILLS[skillId] || points <= 0) return;
    const klass = this.klassOf(skillId);
    const specialised = SKILLS[skillId].spec === this.cls.specialization;
    this.progress[skillId] += points;
    for (;;) {
      const value = this.skills[skillId];
      if (value >= 100) {
        this.progress[skillId] = 0;
        return;
      }
      const cost = rankCost(value, klass, specialised);
      if (this.progress[skillId] < cost) return;
      this.progress[skillId] -= cost;
      this.skills[skillId] += 1;
      this.totalRanks += 1;
      if (earnsVastei) {
        const eff = effectiveSkill(skillId, value, this.attributes);
        this.vastei += vasteiPerRank(value, eff, C.skillXp.classFactor[klass], specialised ? C.skillXp.specFactor : 1);
      }
      if (klass === "major" || klass === "minor") {
        this.ranksSinceLevel += 1;
      } else if (this.majorsAndMinorsMaxed()) {
        this.ranksSinceLevel += 1 / C.levelUp.miscRankRatio;
      }
      while (this.ranksSinceLevel >= C.levelUp.ranksPerLevel) {
        this.ranksSinceLevel -= C.levelUp.ranksPerLevel;
        this.pendingLevels += 1;
      }
    }
  }

  majorsAndMinorsMaxed() {
    return [...this.cls.majors, ...this.cls.minors].every((id) => this.skills[id] >= 100);
  }

  /** A rest: bank one pending level and spend vastei at the sitting. */
  rest() {
    if (this.pendingLevels <= 0) return false;
    this.pendingLevels -= 1;
    this.level += 1;
    const bought = {};
    for (;;) {
      let best = null;
      let bestCost = Infinity;
      // Buy toward what this build actually uses, cheapest first.
      for (const attr of this.priorityAttributes()) {
        const n = (bought[attr] ?? 0) + 1;
        if (n > C.levelUp.sittingCap) continue;
        const cost = attributeCost(this.level, this.attributes[attr], n);
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
    return true;
  }

  priorityAttributes() {
    const order = this.archetype.attributeOrder ?? Object.keys(this.attributes);
    // Favour the build's own attributes, but not exclusively — a player spreads.
    return [...order.slice(0, 4), ...order.slice(4)];
  }

  get armourMaterial() {
    return data.builds.gearTierMaterials[String(this.gearTier)][this.archetype.armourClass];
  }

  get weaponMaterial() {
    return data.builds.gearTierMaterials[String(this.gearTier)].weapon;
  }

  get armourSkillId() {
    return { light: "lightArmor", medium: "mediumArmor", heavy: "heavyArmor" }[this.archetype.armourClass];
  }

  /** The shape `simulateFight` expects. */
  toBuild(potionsCarried) {
    const armourRating =
      armourSetRating(this.armourMaterial, {
        armourSkill: this.skills[this.armourSkillId],
        attributes: this.attributes,
        temperGrades: this.temperGrades,
      }) + (this.archetype.armourClass === "none" ? unarmouredRating(this.skills.unarmored) : 0);
    const carriedKg =
      armourSetWeight(this.armourMaterial) +
      weaponWeight(this.archetype.weaponClass, this.weaponMaterial) +
      (this.archetype.shield ? data.gear.shieldWeightKg : 0) +
      18;
    return {
      id: `${this.cls.id}/${this.archetype.id}`,
      archetype: this.archetype,
      level: this.level,
      attributes: this.attributes,
      weaponSkill: this.skills[this.archetype.weaponSkill] ?? 5,
      armourSkill: this.skills[this.armourSkillId],
      weaponMaterial: this.weaponMaterial,
      armourRating,
      temperGrades: this.temperGrades,
      enchantDamageBonus: this.gearTier >= 6 ? 0.2 : this.gearTier >= 4 ? 0.1 : 0,
      spellCostReduction: this.gearTier >= 6 ? 0.25 : this.gearTier >= 4 ? 0.1 : 0,
      arrowBonus: data.builds.arrowMaterialBonusByTier[String(this.gearTier)] ?? 1,
      health: maxHealth(this.attributes, this.level),
      stamina: maxStamina(this.attributes),
      staminaRegen: staminaRegen(this.attributes),
      magicka: maxMagicka(this.attributes),
      magickaRegen: magickaRegen(this.attributes),
      carriedKg,
      burden: burdenTier(carriedKg, this.attributes),
      potionsCarried,
    };
  }
}

/** Which sneak-attack table a build's weapon uses. */
const openerWeaponKind = (arch) => {
  if (arch.weaponSkill === "destruction") return "spell";
  if (arch.weaponClass === "dagger") return "dagger";
  if (arch.weaponClass === "shortSword") return "shortBlade";
  if (["warbow", "longbow", "shortbow"].includes(arch.weaponClass)) return "bow";
  if (["greatsword", "greataxe", "warhammer", "spear", "halberd"].includes(arch.weaponClass)) return "twoHanded";
  return "oneHanded";
};

const pickBand = (mix, roll) => {
  let acc = 0;
  for (const [bandId, share] of Object.entries(mix)) {
    acc += share;
    if (roll <= acc) return bandId;
  }
  return Object.keys(mix).at(-1);
};

/** Deterministic pseudo-noise — no Math.random, so runs are reproducible. */
const wobble = (i) => ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1;

export function playCampaign({ classId, race, archetypeId, label }) {
  const ch = new LiveCharacter({ classId, race, archetypeId });
  const ps = CAMP.playerSkill;
  const timeline = [];
  let hours = 0;
  let step = 0;
  let potionsCarried = 3;

  for (const act of CAMP.acts) {
    ch.gearTier = act.gearTier;
    ch.temperGrades = act.gearTier >= 6 ? 2 : act.gearTier >= 4 ? 1 : 0;
    const actStart = {
      level: ch.level,
      deaths: ch.deaths,
      ranks: ch.totalRanks,
      attributePoints: ch.attributePoints,
    };
    let actDeaths = 0;
    let actIncome = 0;

    for (let q = 0; q < act.quests; q += 1) {
      const questHours = act.hours / act.quests;
      hours += questHours;
      const avoidance = Math.min(
        ps.endAvoidance,
        ps.startAvoidance + (ps.endAvoidance - ps.startAvoidance) * Math.min(1, hours / ps.hoursToPeak),
      );

      // --- fights
      for (let e = 0; e < act.encountersPerQuest; e += 1) {
        step += 1;
        let bandId = pickBand(act.bandMix, wobble(step));
        // Overreach: a fixed world lets you walk into something you are not
        // ready for, and players do exactly that.
        if (wobble(step + 17) < (CAMP.overreach?.chance ?? 0)) {
          const order = data.ladder.bands.map((b) => b.id);
          bandId = order[Math.min(order.length - 1, order.indexOf(bandId) + 1)];
        }
        const enemy = bandActor(bandId, 0.3 + 0.5 * wobble(step + 7));
        const build = ch.toBuild(potionsCarried);
        const style = ps.styleAvoidanceBonus[ch.archetype.id] ?? 0;
        const opensUnseen = wobble(step + 3) < (ps.sneakOpenerChance[ch.archetype.id] ?? 0.15);
        const fight = simulateFight(build, enemy, {
          avoidance: Math.min(0.9, avoidance + style),
          opener: opensUnseen
            ? { weapon: openerWeaponKind(ch.archetype), sneakSkill: ch.skills.sneak }
            : null,
        });
        if (opensUnseen) ch.use("sneak", 0.8);
        ch.potionsUsed += fight.potionsUsed;

        // Skill use: worthiness per blow, damped after the sixth connect.
        const w = C.worthiness;
        const blows = Math.max(1, Math.round(enemy.health / Math.max(1, fight.playerPerHit)));
        const perBlow = Math.max(
          w.minUseValue,
          Math.min(1, (fight.playerPerHit / enemy.health) / w.fullUseDamageFraction),
        );
        const counted =
          Math.min(blows, w.connectsBeforeDamping) +
          Math.max(0, blows - w.connectsBeforeDamping) * w.dampedValue;
        ch.use(ch.archetype.weaponSkill, counted * perBlow);
        ch.use(ch.armourSkillId, blows * 0.35);
        if (ch.archetype.shield) ch.use("block", blows * 0.3);
        if (ch.archetype.weaponSkill === "destruction") ch.use("restoration", blows * 0.1);

        if (!fight.won) {
          ch.deaths += 1;
          actDeaths += 1;
          hours += CAMP.deathModel.minutesLostPerDeath / 60;
          if (wobble(step + 31) > CAMP.deathModel.retrievalSuccessRate) ch.vastei *= 0.5;
        } else {
          actIncome += enemy.lootValue;
        }
      }

      // --- everything that is not a fight
      const nc = CAMP.nonCombatUse;
      ch.use("athletics", act.travelKmPerQuest * nc.athleticsPerKm);
      ch.use(
        "acrobatics",
        (act.climbMetresPerQuest / 10) * nc.acrobaticsPerTenMetresClimbed + (nc.acrobaticsPerQuestBaseline ?? 0),
      );
      ch.use("sneak", nc.sneakPerQuest);
      ch.use("security", act.locksPerQuest * nc.securityPerLock);
      ch.use("speechcraft", act.socialChecksPerQuest * nc.speechcraftPerCheck);
      ch.use("mercantile", nc.mercantilePerQuest);
      ch.use("alchemy", nc.alchemyPerQuest);
      ch.use("smithing", nc.smithingPerQuest);
      ch.use("restoration", nc.restorationPerQuest);

      // --- rests, money
      actIncome += act.lootPerQuest;
      ch.gold += act.lootPerQuest;
      for (let r = 0; r < Math.round(act.restsPerQuest); r += 1) ch.rest();

      const spend = CAMP.spending;
      const income = act.lootPerQuest;
      ch.gold -= income * (spend.potionFractionOfIncome + spend.repairAndUpkeepFraction);
      potionsCarried = Math.min(CAMP.potionCarryCap ?? 12, 3 + Math.floor(ch.gold / 900));

      // Training: buy a rank in a major skill when it is affordable and legal
      // (never above the governing attribute, and it yields no vastei).
      let trainingBudget = income * spend.trainingFraction;
      for (const skillId of ch.cls.majors) {
        const value = ch.skills[skillId];
        const gov = SKILLS[skillId].gov;
        if (value >= ch.attributes[gov] || value >= 100) continue;
        const cost = data.economy.training.costPerRank * Math.pow(value, data.economy.training.costRankExponent);
        if (cost > trainingBudget || cost > ch.gold) continue;
        trainingBudget -= cost;
        ch.gold -= cost;
        ch.trainingSpent += cost;
        ch.skills[skillId] += 1;
        ch.totalRanks += 1;
        ch.ranksSinceLevel += 1; // counts toward the level, earns no vastei
        while (ch.ranksSinceLevel >= C.levelUp.ranksPerLevel) {
          ch.ranksSinceLevel -= C.levelUp.ranksPerLevel;
          ch.pendingLevels += 1;
        }
      }
    }

    const build = ch.toBuild(potionsCarried);
    const climbCheck = climb(25, {
      acrobatics: ch.skills.acrobatics,
      attributes: ch.attributes,
      burdenTier: build.burden.tier,
      stamina: build.stamina,
      staminaRegen: build.staminaRegen,
    });

    timeline.push({
      act: act.id,
      label: act.label,
      hours: Math.round(hours),
      level: ch.level,
      levelsGained: ch.level - actStart.level,
      deaths: actDeaths,
      deathsTotal: ch.deaths,
      deathsPerHour: +(actDeaths / act.hours).toFixed(2),
      health: Math.round(build.health),
      armourRating: Math.round(build.armourRating),
      weaponSkill: ch.skills[ch.archetype.weaponSkill],
      armourSkillValue: ch.skills[ch.armourSkillId],
      athletics: ch.skills.athletics,
      acrobatics: ch.skills.acrobatics,
      speechcraft: ch.skills.speechcraft,
      sneak: ch.skills.sneak,
      alchemy: ch.skills.alchemy,
      attributePoints: ch.attributePoints,
      ranks: ch.totalRanks,
      ranksThisAct: ch.totalRanks - actStart.ranks,
      vasteiBanked: Math.round(ch.vastei),
      gold: Math.round(ch.gold),
      potionsUsed: ch.potionsUsed,
      climb25m: climbCheck.completesInOneGo ? "in one go" : climbCheck.sustainableMeters >= 25 ? "with rests" : "cannot",
      burden: build.burden.tier,
    });
  }

  return { label, classId, race, archetypeId, timeline, character: ch };
}
