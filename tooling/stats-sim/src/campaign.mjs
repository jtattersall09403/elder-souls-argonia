/**
 * The campaign simulation: a whole character's game, hour by hour.
 *
 * Everything else in this harness answers "is this fight fair?". This answers
 * the questions you can only ask about a *campaign*: when does a character
 * level, how often do they die, how fast does each skill actually climb, and
 * does the curve still make sense a hundred hours in.
 *
 * TWO INPUTS, ON PURPOSE. `rules` is how a use becomes a rank and a rank
 * becomes a level; `content` is how much of each verb an hour of play contains.
 * The model used to fuse them into one file and reported a whole game finishing
 * at level 16-27 against Morrowind's 45-55 — and substituting Morrowind's flat
 * use values into it still produced level 4 at hour 19, which is what proved the
 * fault was in the content, not the rules. Because the two are now separable,
 * `sweeps.mjs` can run (Morrowind rules x Vvardenfell content) as a known-answer
 * test: an engine that cannot reproduce a game whose pacing is documented has no
 * business predicting ours.
 *
 * It is still a thought experiment with arithmetic attached, not a playtest.
 */

import {
  data,
  SKILLS,
  maxStamina,
  staminaRegen,
  maxMagicka,
  magickaRegen,
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
import { RULES, CONTENT, rankCost } from "./rules.mjs";

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/** Which skill each authored verb feeds. Content counts events; this says what learns from them. */
const VERB_SKILL = {
  lock: "security", trap: "security", persuasion: "speechcraft", barter: "mercantile",
  brew: "alchemy", repair: "smithing", enchant: "enchant", sneak: "sneak",
  jump: "acrobatics", climb: "acrobatics", swim: "athletics", travel: "athletics",
};

const MAGIC_SCHOOLS = new Set([
  "alteration", "conjuration", "destruction", "illusion", "mysticism", "restoration",
]);

/** What one connect with this skill is worth: Morrowind's per-skill table, spells flat. */
const connectValue = (rules, skillId) =>
  rules.use.weaponConnect[skillId] ??
  (MAGIC_SCHOOLS.has(skillId) ? rules.use.spellCast : rules.use.weaponConnect.default);

/**
 * A character that actually changes as it plays, rather than a checkpoint
 * looked up in a table.
 */
class LiveCharacter {
  constructor({ classId, race, archetypeId, rules }) {
    const cls = data.classes.classes.find((c) => c.id === classId);
    const raceEntry = data.races.races.find((r) => r.id === race);
    this.rules = rules;
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
    // Morrowind's health grant is not retroactive, so it has to be banked.
    this.healthGrants = 0;

    // Honesty accounting. `delivered` is every use-point the content handed to a
    // skill; the rest measures how much of it the level trigger threw on the
    // floor, which is a first-class output of this harness rather than a comment.
    this.pointsDelivered = 0;
    this.pointsAtCapDiscarded = 0;
    this.pointsIntoZeroCreditRanks = 0;
    this.pointsIntoPartialCreditRanks = 0;
    this.creditEarned = 0;
    this.creditForgone = 0;
    // Where the levels actually came from. Without this the model can be right
    // in total and wrong in every part, which is how it got here.
    this.creditBySource = { majorMinor: 0, misc: 0, maxed: 0, trained: 0 };
    this.creditBySkill = {};
  }

  klassOf(skillId) {
    if (this.cls.majors.includes(skillId)) return "major";
    if (this.cls.minors.includes(skillId)) return "minor";
    return "misc";
  }

  majorsAndMinorsMaxed() {
    return [...this.cls.majors, ...this.cls.minors].every((id) => this.skills[id] >= 100);
  }

  /**
   * Award use-points; convert to ranks (and vastei) as they fill up.
   *
   * The level credit a rank is worth is the design's most consequential line.
   * A major/minor rank below 100 is worth a whole one. A miscellaneous rank, or
   * a rank in a skill already sitting at 100, is worth `1/divisor` — PER SKILL
   * and ungated. The previous reading only opened that tail once every major
   * and minor had reached 100, which never happens in a normal game, so roughly
   * two use-points in five bought nothing at all.
   */
  use(skillId, points) {
    if (!SKILLS[skillId] || !(points > 0)) return;
    const L = this.rules.levelTrigger;
    const klass = this.klassOf(skillId);
    const specialised = SKILLS[skillId].spec === this.cls.specialization;
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
      const cost = rankCost(this.rules, Math.min(value, 100), klass, specialised);
      if (this.progress[skillId] < cost) return;
      this.progress[skillId] -= cost;
      if (!maxed) this.skills[skillId] += 1;
      this.totalRanks += 1;

      const classFactor = this.rules.rankCost.classFactor[klass];
      const specFactor = specialised ? this.rules.rankCost.specFactor : 1;
      const eff = effectiveSkill(skillId, value, this.attributes);
      this.vastei += vasteiPerRank(value, eff, classFactor, specFactor, this.rules.vastei);

      let credit;
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

  get health() {
    const h = this.rules.health;
    const a = this.attributes;
    const base = h.attrCoefficient * (a.strength + a.endurance);
    return h.retroactive
      ? base + this.level * (h.levelBase + a.endurance / h.levelEnduranceDivisor)
      : base + this.healthGrants;
  }

  /** A rest: bank one pending level and spend vastei at the sitting. */
  rest() {
    if (this.pendingLevels <= 0) return false;
    const cfg = this.rules.attributePurchase;
    this.pendingLevels -= 1;
    this.level += 1;
    const bought = {};
    for (;;) {
      let best = null;
      let bestCost = Infinity;
      // Buy toward what this build actually uses, cheapest first.
      for (const attr of this.priorityAttributes()) {
        const n = (bought[attr] ?? 0) + 1;
        if (n > cfg.sittingCap) continue;
        const cost = attributeCost(this.level, this.attributes[attr], n, cfg);
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
      health: this.health,
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

/**
 * Bend an authored mix toward the skills this character actually chose, then
 * renormalise so the total volume of the verb is unchanged. This is what lets
 * one verb profile per archetype cover eighteen classes: a warrior who took Axe
 * as a major swings the axe more than one who did not, without anybody having
 * to author eighteen tables.
 */
function bentMix(mix, ch, affinity) {
  const out = {};
  let sum = 0;
  for (const [id, weight] of Object.entries(mix)) {
    if (id.startsWith("_") || !SKILLS[id]) continue;
    out[id] = weight * affinity[ch.klassOf(id)];
    sum += out[id];
  }
  if (sum <= 0) return {};
  for (const id of Object.keys(out)) out[id] /= sum;
  return out;
}

/**
 * Verb shares are absolute, not a mix: bend, then cap at the content's supply.
 *
 * Locomotion is exempt. How far you walk and swim is a property of the world and
 * of where the quest sent you, not of the class you picked at character
 * creation — a mage crossing the marsh covers the same kilometres as a warrior,
 * and the fact that Athletics is miscellaneous for them is already priced into
 * the rank cost. Bending it twice made the reported travel distance a function
 * of the build, which is nonsense.
 */
const LOCOMOTION = new Set(["travel", "swim"]);
function bentShares(shares, ch, affinity) {
  const out = {};
  for (const [verb, share] of Object.entries(shares)) {
    if (verb.startsWith("_")) continue;
    const skillId = VERB_SKILL[verb];
    const bend = LOCOMOTION.has(verb) || !skillId ? 1 : affinity[ch.klassOf(skillId)];
    out[verb] = Math.min(1, share * bend);
  }
  return out;
}

/**
 * Play a whole game.
 *
 * `tracks` selects which hour budgets to spend: both by default, or
 * `["quest"]` alone for the "what does the main quest on its own get you?"
 * probe. `stopHours` cuts the run short at a wall-clock hour.
 */
export function playCampaign({
  classId,
  race,
  archetypeId,
  label,
  rules = RULES.argonia,
  content = CONTENT.argonia,
  tracks = ["quest", "free"],
  stopHours = Infinity,
} = {}) {
  const ch = new LiveCharacter({ classId, race, archetypeId, rules });
  const ps = content.playerSkill;
  const affinity = content.classAffinity;
  const raw = content.verbProfiles[ch.archetype.id];
  const profile = {
    weaponMix: bentMix(raw.weaponMix, ch, affinity),
    armourMix: bentMix(raw.armourMix, ch, affinity),
    spellMix: bentMix(raw.spellMix, ch, affinity),
    blockShare: raw.blockShare,
    utilityCastShare: raw.utilityCastShare,
    verbShare: bentShares(raw.verbShare, ch, affinity),
  };
  const hit = content.hitRate ?? { player: 1, enemy: 1 };
  const W = rules.worthiness;
  const U = rules.use;
  const sliceHours = content.sliceHours ?? 0.25;

  const timeline = [];
  const levelByHour = [];
  // Wall-clock hour at which each level and each skill-cap was first reached —
  // the whole point of the exercise is *when*, so it is recorded rather than
  // inferred from an act boundary.
  const levelHours = [null, 0];
  const maxedAtHour = {};
  let hours = 0;
  let step = 0;
  let potionsCarried = 3;
  let stopped = false;

  // Wall-clock and volume accounting, so the report can say what fraction of a
  // playthrough is actually spent fighting and moving rather than asserting it.
  const totals = {
    encounters: 0, fightSeconds: 0, travelKm: 0, travelSeconds: 0, swimSeconds: 0,
    locks: 0, persuasions: 0, brews: 0, repairs: 0, blocks: 0, playerConnects: 0,
    incomingHits: 0, contentHours: 0,
  };

  const award = (skillId, points) => ch.use(skillId, points);
  const awardMix = (mix, points, valueOf) => {
    for (const [skillId, share] of Object.entries(mix)) award(skillId, points * share * valueOf(skillId));
  };

  outer: for (const act of content.acts) {
    ch.gearTier = act.gearTier;
    ch.temperGrades = act.gearTier >= 6 ? 2 : act.gearTier >= 4 ? 1 : 0;
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
        const effAvoidance = Math.min(0.9, avoidance + style);

        // --- fights
        pendingFights += track.encountersPerHour * dt;
        while (pendingFights >= 1) {
          pendingFights -= 1;
          step += 1;
          totals.encounters += 1;
          let bandId = pickBand(act.bandMix, wobble(step));
          // Overreach: a fixed world lets you walk into something you are not
          // ready for, and players do exactly that — more so off the quest path.
          if (wobble(step + 17) < overreachChance) {
            const order = data.ladder.bands.map((b) => b.id);
            bandId = order[Math.min(order.length - 1, order.indexOf(bandId) + 1)];
          }
          const enemy = bandActor(bandId, 0.3 + 0.5 * wobble(step + 7));
          const build = ch.toBuild(potionsCarried);
          const opensUnseen = wobble(step + 3) < (ps.sneakOpenerChance[ch.archetype.id] ?? 0.15);
          const fight = simulateFight(build, enemy, {
            avoidance: effAvoidance,
            blockShare: profile.blockShare,
            opener: opensUnseen
              ? { weapon: openerWeaponKind(ch.archetype), sneakSkill: ch.skills.sneak }
              : null,
          });
          // An authored encounter is a SCENE, not a duel: a couple of actors,
          // plus the approach, the repositioning and the looting. The fight
          // simulator resolves one actor, so the scene's volume and wall-clock
          // scale from it. Lethality deliberately does NOT scale with the actor
          // count — who wins is the danger ladder's business, and the ladder is
          // calibrated elsewhere (module 76 §128).
          //
          // `encounterTempoMultiplier` is the other half of the same honesty:
          // `simulateFight` is a damage race that spends no time circling,
          // backing off, waiting for an opening or drinking, because `avoidance`
          // abstracts all of that into a damage multiplier. Real Souls-shaped
          // encounters take several times as long as the damage race implies —
          // and crucially that extra time contains NO extra connects, so it
          // lengthens the fight without teaching you anything. Seconds scale;
          // use-points do not.
          const actors = track.actorsPerEncounter ?? 1;
          ch.potionsUsed += fight.potionsUsed;
          totals.fightSeconds +=
            fight.seconds * actors * (track.encounterTempoMultiplier ?? 1) +
            (track.encounterOverheadSeconds ?? 0);
          if (opensUnseen) award("sneak", U.sneakSuccess);

          // --- offence: REAL connect counts, not enemyHealth/perHit (that
          // estimate measured 1.36-1.52x too high), times worthiness. The
          // per-actor connect damping was removed by owner ruling (2026-08-30):
          // no reference game diminishes repeat use, and grinding respawning
          // enemies is legitimate play. Chip-damage worthiness still applies.
          const connects = fight.swings * hit.player;
          totals.playerConnects += connects * actors;
          const counted = connects * actors;
          const offenceWorth = W
            ? clamp(fight.meanDamagePerSwing / enemy.health / W.fullUseDamageFraction, W.minUseValue, 1)
            : 1;
          awardMix(profile.weaponMix, counted * offenceWorth, (id) => connectValue(rules, id));

          // --- defence: keyed to what the ENEMY threw. Part of avoidance is a
          // clean whiff (teaches nothing); the rest is armour and shield doing
          // their job. Blocks pay Block; the remainder pays the armour skills.
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
          // Armour accrual is class-weighted (owner ruling, 2026-08-30): light
          // armour learns mostly from fights *won* while worn, heavy mostly
          // from hits *tanked*, medium in between. Rule sets without an
          // armourAccrual block (Morrowind) keep pure hit-taken accrual.
          const AK = rules.armourAccrual;
          const hitWeight = (id) => AK?.classWeights?.[id]?.hit ?? 1;
          awardMix(profile.armourMix, damaging * defenceWorth, (id) =>
            (id === "unarmored" ? U.unarmoredHitTaken : U.armourHitTaken) * hitWeight(id));
          award("block", blocked * U.block);
          if (AK && fight.won) {
            // The kill award: keyed to KILLS, never to "the encounter ended",
            // so surviving-by-fleeing teaches nothing. Worth scales with how
            // big the dead thing was next to you, mirroring offence worthiness.
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
            // What falls off the corpse, not what the whole encounter is worth:
            // placed treasure is counted once, per hour, as lootGoldPerHour.
            // Adding the ladder's lootValue here double-counted it and ended a
            // playthrough on 860,000 gold.
            ch.gold += (data.economy.income.perBandClear[bandId] ?? 0) * actors;
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
        awardMix(
          profile.spellMix,
          track.utilityCastsPerHour * dt * profile.utilityCastShare,
          () => U.spellCast,
        );

        // --- money, rests, training
        const income = track.lootGoldPerHour * dt;
        ch.gold += income;
        ch.gold -= income * (content.spending.potionFractionOfIncome + content.spending.repairAndUpkeepFraction);
        trainingBudget += income * content.spending.trainingFraction;
        potionsCarried = Math.min(content.potionCarryCap ?? 12, 3 + Math.floor(ch.gold / 900));

        pendingRests += track.restsPerHour * dt;
        while (pendingRests >= 1) {
          pendingRests -= 1;
          ch.rest();
          // Training at a town rest: never above the governing attribute, and it
          // yields no vastei — you were taught, you did not learn.
          for (const skillId of ch.cls.majors) {
            const value = ch.skills[skillId];
            if (value >= ch.attributes[SKILLS[skillId].gov] || value >= 100) continue;
            const cost =
              data.economy.training.costPerRank * Math.pow(value, data.economy.training.costRankExponent);
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
      climb25m: climbCheck.completesInOneGo ? "in one go" : climbCheck.sustainableMeters >= 25 ? "with rests" : "cannot",
      burden: build.burden.tier,
    });
  }

  const wallSeconds = Math.max(1, hours * 3600);
  const delivered = Math.max(1e-9, ch.pointsDelivered);
  return {
    label,
    classId,
    race,
    archetypeId,
    rulesId: rules.id,
    contentId: content.id,
    hours: +hours.toFixed(1),
    timeline,
    levelByHour,
    levelHours,
    maxedAtHour,
    levelAt: (h) => levelByHour[Math.min(levelByHour.length - 1, Math.max(0, Math.round(h)))] ?? 1,
    hourAtLevel: (n) => levelHours[n] ?? null,
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
    /**
     * THE DISCARD RATE, as a first-class output. `atCap` is use delivered to a
     * skill that could not accept it at all; `zeroCredit` is use that bought a
     * rank worth nothing toward a level; `partialCredit` bought a 1/3 rank.
     */
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
