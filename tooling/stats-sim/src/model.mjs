/**
 * The stat model, as pure functions over the data tables.
 *
 * This is the design of module 76 §116-129 expressed as arithmetic and nothing
 * else: no game engine, no rendering, no I/O beyond reading `../data`. Phase
 * 10c reimplements these formulas in `packages/game-core` and re-points the
 * harness at the game's own tables, so anything that is a *rule* belongs here
 * and anything that is a *number* belongs in the data files.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
const read = (name) => JSON.parse(readFileSync(join(DATA_DIR, name), "utf8"));

export const data = {
  curves: read("curves.json"),
  attributes: read("attributes.json"),
  skills: read("skills.json"),
  gear: read("gear.json"),
  ladder: read("ladder.json"),
  enemies: read("enemies.json"),
  builds: read("builds.json"),
  magic: read("magic.json"),
  economy: read("economy.json"),
  races: read("races.json"),
  classes: read("classes.json"),
};

const C = data.curves;
export const SKILLS = Object.fromEntries(data.skills.skills.map((s) => [s.id, s]));

// ---------------------------------------------------------------- the curve

/** k(s): 0 at skill 0, 1 at skill 100, front-loaded and self-soft-capping. */
export function k(skill) {
  const s = Math.max(0, Math.min(100, skill));
  return 1 - Math.pow(1 - s / 100, C.skillCurve.exponent);
}

/** Skill plus its governing attribute's assist, clamped. */
export function effectiveSkill(skillId, skillValue, attributes) {
  const gov = SKILLS[skillId]?.gov;
  const attr = gov ? attributes[gov] ?? C.attributeAssist.pivot : C.attributeAssist.pivot;
  const raw = (attr - C.attributeAssist.pivot) / C.attributeAssist.divisor;
  const assist = Math.max(-C.attributeAssist.clamp, Math.min(C.attributeAssist.clamp, raw));
  return skillValue + assist;
}

/** Map a skill's band [lo, hi] through the curve. */
export function band([lo, hi], effSkill) {
  return lo + (hi - lo) * k(effSkill);
}

/** Where in a weapon's damage range this skill strikes. */
export function damagePosition(effSkill) {
  return band([C.damagePosition.lo, C.damagePosition.hi], effSkill);
}

// ------------------------------------------------------- derived quantities

export const maxHealth = (attrs, level) =>
  C.health.attrCoefficient * (attrs.strength + attrs.endurance) +
  level * (C.health.levelBase + attrs.endurance / C.health.levelEnduranceDivisor);

export const maxStamina = (attrs) => C.stamina.base + C.stamina.endCoefficient * attrs.endurance;
export const staminaRegen = (attrs) =>
  C.stamina.regenBase + C.stamina.regenAgiCoefficient * attrs.agility;
export const maxMagicka = (attrs, multiplier = 0) =>
  (C.magicka.base + C.magicka.intCoefficient * attrs.intelligence) * (1 + multiplier);
export const magickaRegen = (attrs) =>
  C.magicka.regenBase + C.magicka.regenWilCoefficient * attrs.willpower;
export const carryCapacity = (attrs) => C.carry.base + C.carry.strCoefficient * attrs.strength;

export function burdenTier(carriedKg, attrs) {
  const r = carriedKg / carryCapacity(attrs);
  if (r < C.burdenTiers.fast) return { tier: "fast", ratio: r };
  if (r < C.burdenTiers.mid) return { tier: "mid", ratio: r };
  if (r < C.burdenTiers.fat) return { tier: "fat", ratio: r };
  return { tier: "overloaded", ratio: r };
}

/** Fraction of an incoming blow that armour stops. Big hits punch through. */
export const mitigation = (armourRating, incomingDamage) =>
  armourRating /
  (armourRating + C.mitigation.constant + C.mitigation.damageCoefficient * incomingDamage);

export const damageAfterArmour = (damage, armourRating) =>
  damage * (1 - mitigation(armourRating, damage));

export const poise = (attrs, armourRating) =>
  C.poise.endCoefficient * attrs.endurance + C.poise.armourCoefficient * armourRating;

export const breathSeconds = (athletics, endurance, waterBreathing = false) =>
  waterBreathing
    ? Infinity
    : C.breath.base + C.breath.athleticsCoefficient * athletics + C.breath.enduranceCoefficient * endurance;

export const unarmouredRating = (skill, bareSlots = C.unarmoured.slots) =>
  C.unarmoured.coefficient * skill * skill * (bareSlots / C.unarmoured.slots);

// ------------------------------------------------------------------- gear

export function armourSetRating(setId, { armourSkill = 30, attributes, temperGrades = 0 } = {}) {
  const set = data.gear.armourSets[setId];
  if (!set) throw new RangeError(`unknown armour set: ${setId}`);
  if (!set.material) return 0;
  const m = data.gear.materials[set.material];
  const raw = set.slots.reduce(
    (total, slot) =>
      total + Math.round(data.gear.armourSlots[slot].baseRating * m.guardScale * m.damageScale),
    0,
  );
  const skillId = { light: "lightArmor", medium: "mediumArmor", heavy: "heavyArmor" }[m.armourClass];
  const eff = attributes ? effectiveSkill(skillId, armourSkill, attributes) : armourSkill;
  const skillBand = band(SKILLS[skillId].bands.rating, eff);
  return raw * skillBand * (1 + temperGrades * data.gear.temperPerGrade);
}

export function armourSetWeight(setId) {
  const set = data.gear.armourSets[setId];
  if (!set?.material) return 0;
  const m = data.gear.materials[set.material];
  return set.slots.reduce(
    (total, slot) => total + data.gear.armourSlots[slot].baseWeightKg * m.weightScale,
    0,
  );
}

/** Listed damage of one attack: the top of the weapon's range. */
export function listedDamage(weaponClassId, materialId, attackId = "light1") {
  const cls = data.gear.weaponClasses[weaponClassId];
  const mat = data.gear.materials[materialId];
  const attack = data.gear.moveset[attackId];
  return data.gear.weaponBaseDamage * mat.damageScale * cls.powerScale * attack.motionValue;
}

const BOW_WEIGHTS = { shortbow: 1.4, longbow: 1.9, warbow: 2.3 };

export function weaponWeight(weaponClassId, materialId) {
  if (!weaponClassId) return 0;
  const base = data.gear.weaponClasses[weaponClassId]?.weightKg ?? BOW_WEIGHTS[weaponClassId];
  if (base == null) throw new RangeError(`unknown weapon class: ${weaponClassId}`);
  return base * data.gear.materials[materialId].weightScale;
}

// ---------------------------------------------------------------- the build

/** Resolve a checkpoint + archetype into a full character. */
export function makeBuild(checkpointId, archetypeId, { race = null, temperGrades = null } = {}) {
  const cp = data.builds.checkpoints.find((c) => c.id === checkpointId);
  if (!cp) throw new RangeError(`unknown checkpoint: ${checkpointId}`);
  const arch = data.builds.archetypes[archetypeId];
  if (!arch) throw new RangeError(`unknown archetype: ${archetypeId}`);
  const materials = data.builds.gearTierMaterials[String(cp.gearTier)];
  // Same investment, spent where this build needs it: deal the checkpoint's
  // values out along the archetype's priority order.
  const values = Object.values(cp.attributes).sort((a, b) => b - a);
  const attributes = arch.attributeOrder
    ? Object.fromEntries(arch.attributeOrder.map((id, i) => [id, values[i]]))
    : { ...cp.attributes };

  const armourSetId = {
    light: { studded: "studded", elven: "elven", glass: "glass" }[materials.light] ?? "studded",
    medium: { imperial: "steelFull", orcish: "orcish", akaviri: "orcish" }[materials.medium] ?? "orcish",
    heavy: { iron: "iron", steel: "steelRef", dwarven: "elven", nordhero: "ebony", daedric: "daedric" }[materials.heavy] ?? "steelRef",
  }[arch.armourClass];

  const grades = temperGrades ?? cp.temperGrades ?? 0;
  const armourRating =
    armourSetRating(armourSetId, { armourSkill: cp.armourSkill, attributes, temperGrades: grades }) +
    (arch.armourClass === "none" ? unarmouredRating(cp.supportSkill) : 0);

  const weaponMaterial = materials.weapon;
  const carriedKg =
    armourSetWeight(armourSetId) +
    (arch.weaponClass ? weaponWeight(arch.weaponClass, weaponMaterial) : 0) +
    (arch.shield ? data.gear.shieldWeightKg * data.gear.materials[weaponMaterial].weightScale : 0) +
    18; // pack: potions, food, tools, ingredients, spare kit

  return {
    id: `${checkpointId}/${archetypeId}`,
    checkpoint: cp,
    archetype: { id: archetypeId, ...arch },
    race,
    level: cp.level,
    attributes,
    weaponSkill: cp.primarySkill,
    armourSkill: cp.armourSkill,
    weaponMaterial,
    armourSetId,
    armourRating,
    temperGrades: grades,
    enchantDamageBonus: cp.enchantDamageBonus ?? 0,
    spellCostReduction: cp.spellCostReduction ?? 0,
    arrowBonus: data.builds.arrowMaterialBonusByTier?.[String(cp.gearTier)] ?? 1,
    health: maxHealth(attributes, cp.level),
    stamina: maxStamina(attributes),
    staminaRegen: staminaRegen(attributes),
    magicka: maxMagicka(attributes),
    magickaRegen: magickaRegen(attributes),
    potionsCarried: cp.potionsCarried ?? 0,
    carriedKg,
    burden: burdenTier(carriedKg, attributes),
    poise: poise(attributes, armourRating),
  };
}

// ------------------------------------------------------------- the enemies

export function compileEnemy(entry) {
  const b = data.ladder.bands.find((x) => x.id === entry.band);
  if (!b) throw new RangeError(`unknown band: ${entry.band}`);
  const at = ([lo, hi]) => lo + (hi - lo) * entry.position;
  const fields = ["health", "damage", "armourRating", "magicResist", "poise", "attackPeriod", "lootValue"];
  const out = { id: entry.id, label: entry.label, band: entry.band, position: entry.position };
  for (const f of fields) out[f] = at(b[f]);

  for (const v of entry.variants ?? []) {
    const mods = data.ladder.variants[v];
    if (!mods) throw new RangeError(`unknown variant: ${v}`);
    for (const [field, mult] of Object.entries(mods)) {
      if (typeof mult === "number" && field in out) out[field] *= mult;
    }
  }
  // A variant may not invent a tier of its own: every field stays within a
  // clamp of its band's edges (module 76 §128).
  const clamp = data.ladder.variantClamp ?? 1.25;
  for (const f of fields) {
    const [lo, hi] = b[f];
    out[f] = Math.max(lo / clamp, Math.min(hi * clamp, out[f]));
  }
  return out;
}

export const compiledEnemies = () => data.enemies.archetypes.map(compileEnemy);

/** A generic actor at a band position, for sweeps that do not want a named archetype. */
export const bandActor = (bandId, position = 0.5) =>
  compileEnemy({ id: `${bandId}@${position}`, label: `${bandId} @ ${position}`, band: bandId, position, variants: [] });

// ------------------------------------------------------------ the exchange

/**
 * What one action costs and delivers, per mode. The fight simulator consumes
 * this; nothing here knows about time passing.
 */
export function attackProfile(build, target) {
  const arch = build.archetype;
  const attrs = build.attributes;
  const potions = data.economy.potions;

  if (arch.weaponSkill === "destruction") {
    const eff = effectiveSkill("destruction", build.weaponSkill, attrs);
    const tier = [...data.magic.tiers].reverse().find((t) => build.weaponSkill >= t.skillGate) ?? data.magic.tiers[0];
    const magnitude = band(SKILLS.destruction.bands.magnitude, eff);
    const seconds = tier.castSeconds * band(SKILLS.destruction.bands.castTime, eff);
    const reduction = Math.min(data.magic.costReductionCap ?? 0.5, build.spellCostReduction ?? 0);
    const cost = tier.magickaCost * band(SKILLS.destruction.bands.cost, eff) * (1 - reduction);
    // Elemental damage bypasses physical armour (§123) and meets magic resistance instead.
    const damage = tier.damage * magnitude * (1 + build.enchantDamageBonus) * (1 - (target.magicResist ?? 0));
    return {
      mode: "spell",
      tier: tier.id,
      resource: "magicka",
      pool: build.magicka,
      regen: build.magickaRegen,
      actions: [{ damage, seconds, cost }],
      restore: potions.magicka.restore,
    };
  }

  if (arch.weaponClass && data.gear.bows[arch.weaponClass]) {
    const bow = data.gear.bows[arch.weaponClass];
    const eff = effectiveSkill("marksman", build.weaponSkill, attrs);
    const mat = data.gear.materials[build.weaponMaterial];
    const raw =
      bow.baseDamage * (0.7 + 0.3 * mat.damageScale) * build.arrowBonus *
      damagePosition(eff) * (1 + build.enchantDamageBonus);
    // Arrowheads pierce: armour is only partly effective against them.
    const effectiveAR = target.armourRating * data.gear.arrowArmourEffectiveness;
    return {
      mode: "bow",
      resource: "stamina",
      pool: build.stamina,
      regen: build.staminaRegen,
      actions: [{
        damage: damageAfterArmour(raw, effectiveAR),
        seconds: bow.cadenceSeconds / band(SKILLS.marksman.bands.drawSpeed, eff),
        cost: bow.drawStamina * band(SKILLS.marksman.bands.drawStamina, eff),
      }],
      restore: null,
    };
  }

  const skillId = arch.weaponSkill;
  const eff = effectiveSkill(skillId, build.weaponSkill, attrs);
  const cls = data.gear.weaponClasses[arch.weaponClass];
  const position = damagePosition(eff);
  const staminaBand = band(SKILLS[skillId].bands.staminaCost, eff);
  const recoveryBand = band(SKILLS[skillId].bands.recovery, eff);
  const burdenCost = C.stamina.burdenCostMultiplier[build.burden.tier];
  const temper = 1 + build.temperGrades * data.gear.temperPerGrade;

  // A real rotation, not a light-attack loop: two lights into a heavy is what
  // the sandbox's stamina economy actually supports and what players do.
  const actions = ["light1", "light2", "heavy"].map((id) => {
    const attack = data.gear.moveset[id];
    const raw =
      listedDamage(arch.weaponClass, build.weaponMaterial, id) * position * temper * (1 + build.enchantDamageBonus);
    return {
      id,
      raw,
      damage: damageAfterArmour(raw, target.armourRating),
      seconds: attack.actionSeconds * cls.speedScale * recoveryBand,
      cost: attack.stamina * cls.staminaScale * staminaBand * burdenCost,
    };
  });

  return { mode: "melee", resource: "stamina", pool: build.stamina, regen: build.staminaRegen, actions, restore: null };
}

/**
 * Fight one actor until someone dies.
 *
 * Deliberately crude but honest: it spends the real resource pools, drinks the
 * real potions, and applies the real armour and resistance curves. `avoidance`
 * is how much of the enemy's output an ordinarily competent player does not
 * eat — the Souls layer is player skill, and the sweeps run several values of
 * it rather than pretending there is one right number.
 */
export function simulateFight(build, enemy, { avoidance = 0.35, maxSeconds = 600 } = {}) {
  const profile = attackProfile(build, enemy);
  const potions = data.economy.potions;
  const healPotion = potions.bought.reduce((best, p) => (p.heal > best.heal ? p : best), potions.bought[0]);
  const drinkSeconds = potions.drinkSeconds + potions.drinkRecoverySeconds;

  let t = 0;
  let enemyHealth = enemy.health;
  let health = build.health;
  let resource = profile.pool;
  let potionsLeft = build.potionsCarried ?? 0;
  let potionsUsed = 0;
  let action = 0;
  let enemyNext = enemy.attackPeriod;
  const enemyPerHit = damageAfterArmour(enemy.damage, build.armourRating) * (1 - avoidance);

  const step = (seconds) => {
    // The enemy keeps swinging while the player acts, drinks or waits.
    let remaining = Math.max(0.05, seconds);
    while (remaining > 0) {
      const dt = Math.min(0.1, remaining);
      t += dt;
      remaining -= dt;
      resource = Math.min(profile.pool, resource + profile.regen * dt);
      while (t >= enemyNext) {
        health -= enemyPerHit;
        enemyNext += enemy.attackPeriod;
      }
    }
  };

  while (enemyHealth > 0 && health > 0 && t < maxSeconds) {
    if (health < build.health * 0.35 && potionsLeft > 0) {
      potionsLeft -= 1;
      potionsUsed += 1;
      health = Math.min(build.health, health + healPotion.heal);
      step(drinkSeconds);
      continue;
    }
    const next = profile.actions[action % profile.actions.length];
    if (resource < next.cost) {
      if (profile.restore && potionsLeft > 0) {
        potionsLeft -= 1;
        potionsUsed += 1;
        resource = Math.min(profile.pool, resource + profile.restore);
        step(drinkSeconds);
        continue;
      }
      step(Math.min(2, (next.cost - resource) / Math.max(0.01, profile.regen)));
      continue;
    }
    resource -= next.cost;
    enemyHealth -= next.damage;
    action += 1;
    step(next.seconds);
  }

  return {
    mode: profile.mode,
    won: enemyHealth <= 0 && health > 0,
    seconds: t,
    healthLeft: Math.max(0, health),
    healthFraction: Math.max(0, health) / build.health,
    potionsUsed,
    enemyHealthLeft: Math.max(0, enemyHealth),
    playerPerHit: profile.actions[0].damage,
    enemyPerHit: damageAfterArmour(enemy.damage, build.armourRating),
    hitsToDie: Math.ceil(build.health / damageAfterArmour(enemy.damage, build.armourRating)),
  };
}

/** One fight, resolved: the sweep-facing wrapper around `simulateFight`. */
export function duel(build, enemy, opts = {}) {
  const fight = simulateFight(build, enemy, opts);
  return {
    build: build.id,
    enemy: enemy.id ?? enemy.label,
    band: enemy.band,
    mode: fight.mode,
    won: fight.won,
    ttkSeconds: fight.seconds,
    healthFraction: fight.healthFraction,
    potionsUsed: fight.potionsUsed,
    playerPerHit: fight.playerPerHit,
    enemyPerHit: fight.enemyPerHit,
    hitsToDie: fight.hitsToDie,
  };
}

/** Raw offence numbers, for reporting rather than for deciding fights. */
export function offenceSummary(build, enemy) {
  const p = attackProfile(build, enemy);
  const damage = p.actions.reduce((a, x) => a + x.damage, 0);
  const seconds = p.actions.reduce((a, x) => a + x.seconds, 0);
  const cost = p.actions.reduce((a, x) => a + x.cost, 0);
  return {
    mode: p.mode,
    burstDps: damage / seconds,
    perHit: p.actions[0].damage,
    resource: p.resource,
    resourceSeconds: p.pool / Math.max(0.01, cost / seconds - p.regen) || Infinity,
    regenSustainedDps: Math.min(damage / seconds, (p.regen / (cost / damage)) || 0),
  };
}


// -------------------------------------------------------- progression model

/** Vastei earned while taking one rank of a skill. Worthiness cancels out by construction. */
export function vasteiPerRank(skillValue, effSkill, classFactor, specFactor) {
  const points = (skillValue + 1) * classFactor * specFactor;
  return C.vastei.perUse * points * (1 + effSkill / C.vastei.skillDivisor);
}

export function attributeCost(level, currentValue, nthInSitting) {
  const base = C.levelUp.costBase * Math.pow(1 + level / C.levelUp.costLevelDivisor, C.levelUp.costLevelExponent);
  const valueTerm = Math.pow(1 + currentValue / C.levelUp.attrValueDivisor, C.levelUp.attrValueExponent);
  const sittingTerm = 1 + C.levelUp.sittingIncrement * (nthInSitting - 1);
  return base * valueTerm * sittingTerm;
}

/**
 * Play a whole character out: raise the class's ten major/minor skills by use,
 * bank levels at rests, and spend vastei at the sitting under a policy.
 *
 * `policy`: "spend" buys at every sitting; "hoard" refuses to buy until
 * `hoardUntilLevel`, then buys at every subsequent sitting (the deferral
 * exploit the design claims is closed).
 */
export function playCharacter({
  classId = "marsh-hand",
  race = "argonian",
  maxLevel = 50,
  policy = "spend",
  hoardUntilLevel = 20,
} = {}) {
  const cls = data.classes.classes.find((c) => c.id === classId);
  const raceEntry = data.races.races.find((r) => r.id === race);
  const attrs = { ...raceEntry.attributes };
  for (const a of cls.favouredAttributes) attrs[a] += data.classes.favouredAttributeBonus;

  const skills = {};
  for (const s of data.skills.skills) {
    let v = data.classes.startingSkill + (raceEntry.skillBonuses[s.id] ?? 0);
    if (cls.majors.includes(s.id)) v += data.classes.majorBonus;
    else if (cls.minors.includes(s.id)) v += data.classes.minorBonus;
    if (s.spec === cls.specialization) v += data.classes.specializationBonus;
    skills[s.id] = v;
  }

  const tracked = [...cls.majors, ...cls.minors];
  let level = 1;
  let vastei = 0;
  let ranksSinceLevel = 0;
  let totalRanks = 0;
  let attributePoints = 0;
  const history = [];
  let healthIntegral = 0;
  let lastLevelRanks = 0;

  while (level < maxLevel) {
    // Take one rank in the tracked skill that is currently cheapest to advance:
    // the natural "you use what you are good at, but the cheap ones move first".
    const candidates = tracked.filter((id) => skills[id] < 100);
    if (candidates.length === 0) break;
    const skillId = candidates.reduce((best, id) => {
      const cost = (v) => (v + 1) * (cls.majors.includes(id) ? 0.75 : 1.0);
      return cost(skills[id]) < cost(skills[best]) ? id : best;
    }, candidates[0]);

    const s = SKILLS[skillId];
    const classFactor = cls.majors.includes(skillId) ? C.skillXp.classFactor.major : C.skillXp.classFactor.minor;
    const specFactor = s.spec === cls.specialization ? C.skillXp.specFactor : 1;
    const eff = effectiveSkill(skillId, skills[skillId], attrs);
    vastei += vasteiPerRank(skills[skillId], eff, classFactor, specFactor);
    skills[skillId] += 1;
    ranksSinceLevel += 1;
    totalRanks += 1;

    if (ranksSinceLevel >= C.levelUp.ranksPerLevel) {
      ranksSinceLevel -= C.levelUp.ranksPerLevel;
      level += 1;
      const earnedThisLevel = vastei;
      const sittingBuys = {};
      const buying = policy === "spend" || level >= hoardUntilLevel;
      if (buying) {
        for (;;) {
          // Buy the cheapest available point; stop when nothing is affordable.
          let bestAttr = null;
          let bestCost = Infinity;
          for (const a of Object.keys(attrs)) {
            const n = (sittingBuys[a] ?? 0) + 1;
            if (n > C.levelUp.sittingCap) continue;
            const cost = attributeCost(level, attrs[a], n);
            if (cost < bestCost) {
              bestCost = cost;
              bestAttr = a;
            }
          }
          if (!bestAttr || bestCost > vastei) break;
          vastei -= bestCost;
          attrs[bestAttr] += 1;
          sittingBuys[bestAttr] = (sittingBuys[bestAttr] ?? 0) + 1;
          attributePoints += 1;
        }
      }
      const hp = maxHealth(attrs, level);
      healthIntegral += hp * (totalRanks - lastLevelRanks);
      lastLevelRanks = totalRanks;
      history.push({
        level,
        ranks: totalRanks,
        vasteiEarnedByNow: Math.round(earnedThisLevel + (history.at(-1)?.spent ?? 0)),
        vasteiBalance: Math.round(vastei),
        pointsBought: Object.values(sittingBuys).reduce((a, b) => a + b, 0),
        attributePoints,
        health: Math.round(hp),
        attrs: { ...attrs },
        skills: { ...skills },
      });
    }
  }

  return {
    classId,
    policy,
    finalLevel: level,
    totalRanks,
    attributePoints,
    vasteiBalance: Math.round(vastei),
    attrs,
    skills,
    history,
    meanHealthPerRank: healthIntegral / Math.max(1, totalRanks),
  };
}
