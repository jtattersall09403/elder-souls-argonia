/**
 * The balance harness's model (port of tooling/stats-sim/src/model.mjs): gear,
 * reference builds, named enemies, the fight simulator and the flat
 * progression player. Every formula is the game's own (`../curve`,
 * `../derived`, `../progression`, `../ladder`, `../checks`); this file only
 * composes them. Pure: every function takes `data` last.
 */
import { band, damagePosition, effectiveSkill, strengthApplies, strengthDamage } from "../curve";
import { maxCastableCost } from "../checks";
import {
  burdenStaminaMultiplier, burdenTier, damageAfterArmour, incomingDamage, magickaRegen, maxHealth, maxMagicka,
  maxStamina, sneakMultiplier, staminaRegen, unarmouredRating, type Burden,
} from "../derived";
import { compileActor, type CompiledActorStats } from "../ladder";
import { attributeCost, vasteiPerRank } from "../progression";
import { startingCharacter } from "../character";
import type { ArmourClass, Attributes, Sex, SkillId } from "../types";
import { SIM_DATA, type SimData, type SimTable } from "./simData";

// ------------------------------------------------------- harness constants

/** The harness plays male characters (races are sex-split; the sim had one table). */
export const SIM_SEX: Sex = "male";
/** Pack weight every build carries besides armour and weapon: potions, food, tools, spare kit. */
export const PACK_KG = 18;
/** Armour skill `armourSetRating` assumes when the caller gives none. */
const DEFAULT_ARMOUR_SKILL = 30;
/** The player drinks a healing potion below this share of max health. */
const DRINK_BELOW_HEALTH = 0.35;
/** Simulator tick (s), the shortest action (s), and the longest wait for stamina (s). */
const TICK_SECONDS = 0.1;
const MIN_STEP_SECONDS = 0.05;
const MAX_WAIT_SECONDS = 2;
/** Floor on regen when computing a wait, so an empty regen never divides by zero. */
const MIN_REGEN = 0.01;
/** The melee rotation the sandbox's stamina economy supports: two lights into a heavy. */
const MELEE_ROTATION = ["light1", "light2", "heavy"] as const;

// ------------------------------------------------------------------- gear

/** The armour skill that governs a material's armour class (read from `skills.armourClass`). */
export function armourSkillFor(armourClass: string, data: SimData = SIM_DATA): SkillId | undefined {
  return data.skills.skills.find((s) => s.armourClass === (armourClass as ArmourClass))?.id;
}

export type ArmourOptions = { armourSkill?: number; attributes?: Partial<Attributes>; temperGrades?: number };

export function armourSetRating(setId: string, opts: ArmourOptions = {}, data: SimData = SIM_DATA): number {
  const { armourSkill = DEFAULT_ARMOUR_SKILL, attributes, temperGrades = 0 } = opts;
  const set = data.gear.armourSets[setId];
  if (!set) throw new RangeError(`unknown armour set: ${setId}`);
  if (!set.material) return 0;
  const m = data.gear.materials[set.material];
  const raw = (set.slots as string[]).reduce(
    (total, slot) => total + Math.round(data.gear.armourSlots[slot].baseRating * m.armourScale),
    0,
  );
  const skillId = armourSkillFor(m.armourClass, data) as SkillId;
  const eff = attributes ? effectiveSkill(skillId, armourSkill, attributes, data) : armourSkill;
  const skillBand = band(data.skillById[skillId].bands.rating, eff, data);
  const classScale = data.curves.armourClassRating[m.armourClass as ArmourClass] ?? 1;
  return raw * classScale * skillBand * (1 + temperGrades * data.gear.temperPerGrade);
}

export function armourSetWeight(setId: string, data: SimData = SIM_DATA): number {
  const set = data.gear.armourSets[setId];
  if (!set?.material) return 0;
  const m = data.gear.materials[set.material];
  return (set.slots as string[]).reduce(
    (total, slot) => total + data.gear.armourSlots[slot].baseWeightKg * m.weightScale,
    0,
  );
}

/** Listed damage of one attack: the top of the weapon's range. */
export function listedDamage(weaponClassId: string, materialId: string, attackId = "light1", data: SimData = SIM_DATA): number {
  const cls = data.gear.weaponClasses[weaponClassId];
  const mat = data.gear.materials[materialId];
  const attack = data.gear.moveset[attackId];
  return data.gear.weaponBaseDamage * mat.damageScale * cls.powerScale * attack.motionValue;
}

/**
 * A shield's weight: the base shield × its material's weight scale, like every
 * other item (the reference kit's "steel kite shield", module 76 §116). One
 * definition; the retired sim's campaign carried an unscaled shield (round 4).
 */
export function shieldWeight(materialId: string, data: SimData = SIM_DATA): number {
  return data.gear.shieldWeightKg * data.gear.materials[materialId].weightScale;
}

export function weaponWeight(weaponClassId: string | null | undefined, materialId: string, data: SimData = SIM_DATA): number {
  if (!weaponClassId) return 0;
  const base = data.gear.weaponClasses[weaponClassId]?.weightKg ?? data.gear.bows[weaponClassId]?.weightKg;
  if (base == null) throw new RangeError(`unknown weapon class: ${weaponClassId}`);
  return base * data.gear.materials[materialId].weightScale;
}

// ---------------------------------------------------------------- the build

export type Archetype = SimTable & { id: string };

/** A resolved character as the fight simulator reads it. */
export type Build = {
  id: string;
  checkpoint?: SimTable;
  archetype: Archetype;
  race?: string | null;
  level: number;
  attributes: Attributes;
  weaponSkill: number;
  armourSkill: number;
  weaponMaterial: string;
  armourSetId?: string;
  armourRating: number;
  temperGrades: number;
  enchantDamageBonus: number;
  spellCostReduction: number;
  arrowBonus: number;
  health: number;
  stamina: number;
  staminaRegen: number;
  magicka: number;
  magickaRegen: number;
  potionsCarried: number;
  carriedKg: number;
  burden: Burden;
};

/** Resolve a checkpoint + archetype into a full character. */
export function makeBuild(
  checkpointId: string, archetypeId: string,
  { race = null, temperGrades = null }: { race?: string | null; temperGrades?: number | null } = {},
  data: SimData = SIM_DATA,
): Build {
  const cp = (data.builds.checkpoints as SimTable[]).find((c) => c.id === checkpointId);
  if (!cp) throw new RangeError(`unknown checkpoint: ${checkpointId}`);
  const arch = data.builds.archetypes[archetypeId];
  if (!arch) throw new RangeError(`unknown archetype: ${archetypeId}`);
  const materials = data.builds.gearTierMaterials[String(cp.gearTier)];
  // Same investment, spent where this build needs it: deal the checkpoint's
  // values out along the archetype's priority order.
  const values = (Object.values(cp.attributes) as number[]).sort((a, b) => b - a);
  const attributes = (arch.attributeOrder
    ? Object.fromEntries((arch.attributeOrder as string[]).map((id, i) => [id, values[i]]))
    : { ...cp.attributes }) as Attributes;

  // The set is "this build's armour class, in this tier's material".
  const armourSetId: string = arch.armourClass === "heavy" && cp.gearTier === 2
    ? "steelRef" // the reference loadout is deliberately helmetless
    : materials[arch.armourClass];

  const grades: number = temperGrades ?? cp.temperGrades ?? 0;
  const armourRating =
    armourSetRating(armourSetId, { armourSkill: cp.armourSkill, attributes, temperGrades: grades }, data) +
    (arch.armourClass === "none" ? unarmouredRating(cp.supportSkill, undefined, data) : 0);

  const weaponMaterial: string = materials.weapon;
  const carriedKg =
    armourSetWeight(armourSetId, data) +
    (arch.weaponClass ? weaponWeight(arch.weaponClass, weaponMaterial, data) : 0) +
    (arch.shield ? shieldWeight(weaponMaterial, data) : 0) +
    PACK_KG;

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
    health: maxHealth(attributes, cp.level, data),
    stamina: maxStamina(attributes, data),
    staminaRegen: staminaRegen(attributes, data),
    magicka: maxMagicka(attributes, 0, data),
    magickaRegen: magickaRegen(attributes, data),
    potionsCarried: cp.potionsCarried ?? 0,
    carriedKg,
    burden: burdenTier(carriedKg, attributes, data),
  };
}

// ------------------------------------------------------------- the enemies

/** A compiled actor plus the harness table's label when it has one (canonical data has none). */
export type Enemy = CompiledActorStats & { readonly label?: string };

export function compiledEnemies(data: SimData = SIM_DATA): Enemy[] {
  return (data.enemies.archetypes as SimTable[]).map((entry) => {
    const actor = compileActor({ id: entry.id, band: entry.band, position: entry.position, variants: entry.variants }, data);
    return entry.label === undefined ? actor : { ...actor, label: entry.label as string };
  });
}

// ------------------------------------------------------------ the exchange

export type Action = { id?: string; raw?: number; damage: number; seconds: number; cost: number };
export type AttackProfile = {
  mode: "spell" | "bow" | "melee";
  tier?: string;
  resource: "magicka" | "stamina";
  pool: number;
  regen: number;
  actions: Action[];
  restore: number | null;
};

type Target = Pick<CompiledActorStats, "armourRating"> & { magicResist?: number };

/** What one action costs and delivers, per mode. */
export function attackProfile(build: Build, target: Target, data: SimData = SIM_DATA): AttackProfile {
  const arch = build.archetype;
  const attrs = build.attributes;
  const economy = data.economy as SimTable;
  const magic = data.magic as SimTable;
  const skills = data.skillById;

  if (arch.weaponSkill === "destruction") {
    // Canon's cast formula as a gate, not a gamble: the biggest spell you can
    // hold is 2 x skill + Willpower/5, and a spell's damage tracks its cost.
    const cast = magic.castability;
    const eff = effectiveSkill("destruction", build.weaponSkill, attrs, data);
    const maxCost = Math.max(cast.minWorkingCost, maxCastableCost(build.weaponSkill, attrs, data) - cast.reliabilityMargin);
    const workingCost = maxCost * cast.workingFraction;
    const magnitude = band(skills.destruction.bands.magnitude, eff, data);
    const seconds = cast.baseCastSeconds * band(skills.destruction.bands.castTime, eff, data);
    const reduction = Math.min(magic.costReductionCap ?? 0.75, build.spellCostReduction ?? 0);
    const cost = workingCost * band(skills.destruction.bands.cost, eff, data) * (1 - reduction);
    const damage =
      workingCost * cast.damagePerMagicka * magnitude *
      (1 + build.enchantDamageBonus) * (1 - (target.magicResist ?? 0));
    return {
      mode: "spell",
      tier: `cost ${Math.round(workingCost)} of ${Math.round(maxCost)} castable`,
      resource: "magicka",
      pool: build.magicka,
      regen: build.magickaRegen,
      actions: [{ damage, seconds, cost }],
      restore: economy.potions.magicka.restore,
    };
  }

  if (arch.weaponClass && data.gear.bows[arch.weaponClass]) {
    const bow = data.gear.bows[arch.weaponClass];
    const eff = effectiveSkill("marksman", build.weaponSkill, attrs, data);
    const mat = data.gear.materials[build.weaponMaterial];
    const blend = data.gear.bowMaterialDamage;
    // No Strength term on bows (curve.strengthApplies): the draw weight and the
    // soft requirement already carry the archer's strength.
    const raw =
      bow.baseDamage * (blend.base + blend.damageScaleShare * mat.damageScale) * build.arrowBonus *
      damagePosition(eff, data) * (1 + build.enchantDamageBonus);
    // Arrowheads pierce: armour is only partly effective against them.
    const effectiveAR = target.armourRating * data.gear.arrowArmourEffectiveness;
    return {
      mode: "bow",
      resource: "stamina",
      pool: build.stamina,
      regen: build.staminaRegen,
      actions: [{
        damage: damageAfterArmour(raw, effectiveAR, data),
        seconds: bow.cadenceSeconds / band(skills.marksman.bands.drawSpeed, eff, data),
        cost: bow.drawStamina * band(skills.marksman.bands.drawStamina, eff, data),
      }],
      restore: null,
    };
  }

  const skillId = arch.weaponSkill as SkillId;
  const eff = effectiveSkill(skillId, build.weaponSkill, attrs, data);
  const cls = data.gear.weaponClasses[arch.weaponClass];
  const position = damagePosition(eff, data);
  const staminaBand = band(skills[skillId].bands.staminaCost, eff, data);
  const burdenCost = burdenStaminaMultiplier(build.burden.tier, data);
  const temper = 1 + build.temperGrades * data.gear.temperPerGrade;
  const strength = strengthApplies(skillId, data) ? strengthDamage(attrs, data) : 1;

  const actions = MELEE_ROTATION.map((id) => {
    const attack = data.gear.moveset[id];
    const raw =
      listedDamage(arch.weaponClass, build.weaponMaterial, id, data) *
      position * strength * temper * (1 + build.enchantDamageBonus);
    return {
      id,
      raw,
      damage: damageAfterArmour(raw, target.armourRating, data),
      seconds: attack.actionSeconds * cls.speedScale,
      cost: attack.stamina * cls.staminaScale * staminaBand * burdenCost,
    };
  });

  return { mode: "melee", resource: "stamina", pool: build.stamina, regen: build.staminaRegen, actions, restore: null };
}

export type FightOptions = {
  avoidance?: number;
  maxSeconds?: number;
  difficulty?: number;
  opener?: { weapon: string; sneakSkill: number } | null;
  blockShare?: number;
};
export type Fight = {
  mode: AttackProfile["mode"]; won: boolean; seconds: number; swings: number; enemySwings: number; blocks: number;
  damageDealt: number; damageTaken: number; meanDamagePerSwing: number; healthLeft: number; healthFraction: number;
  potionsUsed: number; enemyHealthLeft: number; playerPerHit: number; enemyPerHit: number; hitsToDie: number;
};
type FightEnemy = Target & Pick<CompiledActorStats, "health" | "damage" | "attackPeriod">;

/**
 * Fight one actor until someone dies. Spends the real pools, drinks the real
 * potions, applies the real armour and resistance curves; `avoidance` is the
 * share of the enemy's output a competent player does not eat. `blockShare`
 * is accounting only and never changes the fight.
 */
export function simulateFight(build: Build, enemy: FightEnemy, opts: FightOptions = {}, data: SimData = SIM_DATA): Fight {
  const {
    avoidance = 0.35,
    maxSeconds = 600,
    difficulty = data.curves.difficulty.enemyDamageMultiplier,
    opener = null,
    blockShare = 0,
  } = opts;
  const profile = attackProfile(build, enemy, data);
  const potions = (data.economy as SimTable).potions;
  const bought = potions.bought as SimTable[];
  const healPotion = bought.reduce((best, p) => (p.heal > best.heal ? p : best), bought[0]);
  const drinkSeconds = potions.drinkSeconds + potions.drinkRecoverySeconds;

  let t = 0;
  let enemyHealth = enemy.health;
  let health = build.health;
  let resource = profile.pool;
  let potionsLeft = build.potionsCarried ?? 0;
  let potionsUsed = 0;
  let action = 0;
  let openerMultiplier = opener ? sneakMultiplier(opener.weapon, opener.sneakSkill, data) : 1;
  let enemyNext = enemy.attackPeriod;
  let swings = 0;
  let enemySwings = 0;
  let damageDealt = 0;
  const enemyBlow = damageAfterArmour(incomingDamage(enemy.damage, difficulty, data), build.armourRating, data);
  const enemyPerHit = enemyBlow * (1 - avoidance);

  const step = (seconds: number) => {
    // The enemy keeps swinging while the player acts, drinks or waits.
    let remaining = Math.max(MIN_STEP_SECONDS, seconds);
    while (remaining > 0) {
      const dt = Math.min(TICK_SECONDS, remaining);
      t += dt;
      remaining -= dt;
      resource = Math.min(profile.pool, resource + profile.regen * dt);
      while (t >= enemyNext) {
        health -= enemyPerHit;
        enemySwings += 1;
        enemyNext += enemy.attackPeriod;
      }
    }
  };

  while (enemyHealth > 0 && health > 0 && t < maxSeconds) {
    if (health < build.health * DRINK_BELOW_HEALTH && potionsLeft > 0) {
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
      step(Math.min(MAX_WAIT_SECONDS, (next.cost - resource) / Math.max(MIN_REGEN, profile.regen)));
      continue;
    }
    resource -= next.cost;
    const landed = next.damage * openerMultiplier;
    enemyHealth -= landed;
    damageDealt += Math.max(0, Math.min(landed, enemyHealth + landed));
    swings += 1;
    openerMultiplier = 1;
    action += 1;
    step(next.seconds);
  }

  const blocks = Math.round(enemySwings * blockShare);
  return {
    mode: profile.mode,
    won: enemyHealth <= 0 && health > 0,
    seconds: t,
    swings,
    enemySwings,
    blocks,
    damageDealt,
    damageTaken: Math.max(0, build.health - health),
    meanDamagePerSwing: swings ? damageDealt / swings : 0,
    healthLeft: Math.max(0, health),
    healthFraction: Math.max(0, health) / build.health,
    potionsUsed,
    enemyHealthLeft: Math.max(0, enemyHealth),
    playerPerHit: profile.actions[0].damage,
    enemyPerHit: enemyBlow,
    hitsToDie: Math.ceil(build.health / enemyBlow),
  };
}

export type Duel = {
  build: string; enemy: string; band: string; mode: Fight["mode"]; won: boolean; ttkSeconds: number;
  healthFraction: number; potionsUsed: number; playerPerHit: number; enemyPerHit: number; hitsToDie: number;
};

/** One fight, resolved: the sweep-facing wrapper around `simulateFight`. */
export function duel(build: Build, enemy: Enemy, opts: FightOptions = {}, data: SimData = SIM_DATA): Duel {
  const fight = simulateFight(build, enemy, opts, data);
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
export function offenceSummary(build: Build, enemy: Target, data: SimData = SIM_DATA) {
  const p = attackProfile(build, enemy, data);
  const damage = p.actions.reduce((a, x) => a + x.damage, 0);
  const seconds = p.actions.reduce((a, x) => a + x.seconds, 0);
  const cost = p.actions.reduce((a, x) => a + x.cost, 0);
  return {
    mode: p.mode,
    burstDps: damage / seconds,
    perHit: p.actions[0].damage,
    resource: p.resource,
    resourceSeconds: p.pool / Math.max(MIN_REGEN, cost / seconds - p.regen) || Infinity,
    regenSustainedDps: Math.min(damage / seconds, (p.regen / (cost / damage)) || 0),
  };
}

// -------------------------------------------------------- progression model

/** A race id present in `data`: the sim's "orc" is the roster's "orsimer". */
const RACE_ALIASES: Readonly<Record<string, string>> = { orc: "orsimer" };
export function raceIn(raceId: string, data: SimData = SIM_DATA): string {
  const has = (id: string) => data.races.races.some((r) => r.id === id);
  return has(raceId) || !RACE_ALIASES[raceId] || !has(RACE_ALIASES[raceId]) ? raceId : RACE_ALIASES[raceId];
}

export type PlayOptions = {
  classId?: string; race?: string; maxLevel?: number; policy?: "spend" | "hoard"; hoardUntilLevel?: number;
};
export type PlayHistoryRow = {
  level: number; ranks: number; vasteiEarnedByNow: number; vasteiBalance: number; pointsBought: number;
  attributePoints: number; health: number; attrs: Record<string, number>; skills: Record<string, number>;
};

/**
 * Play a whole character out: raise the class's ten major/minor skills by use,
 * bank levels at rests, and spend vastei at the sitting under a policy
 * ("spend" buys at every sitting; "hoard" refuses until `hoardUntilLevel`).
 */
export function playCharacter(
  { classId = "warrior", race = "argonian", maxLevel = 50, policy = "spend", hoardUntilLevel = 20 }: PlayOptions = {},
  data: SimData = SIM_DATA,
) {
  const C = data.curves;
  const start = startingCharacter({ race: raceIn(race, data), sex: SIM_SEX, classId }, data);
  const cls = data.classes.classes.find((c) => c.id === classId)!;
  const attrs: Record<string, number> = { ...start.attributes };
  const skills: Record<string, number> = { ...start.skills };
  const isMajor = (id: string) => (cls.majors as readonly string[]).includes(id);

  const tracked: SkillId[] = [...cls.majors, ...cls.minors];
  let level = 1;
  let vastei = 0;
  let ranksSinceLevel = 0;
  let totalRanks = 0;
  let attributePoints = 0;
  const history: PlayHistoryRow[] = [];
  let healthIntegral = 0;
  let lastLevelRanks = 0;

  while (level < maxLevel) {
    // Take one rank in the tracked skill that is currently cheapest to advance.
    const candidates = tracked.filter((id) => skills[id] < 100);
    if (candidates.length === 0) break;
    const skillId = candidates.reduce((best, id) => {
      const cost = (v: number) => (v + 1) * (isMajor(id) ? C.skillXp.classFactor.major : C.skillXp.classFactor.minor);
      return cost(skills[id]) < cost(skills[best]) ? id : best;
    }, candidates[0]);

    const s = data.skillById[skillId];
    const classFactor = isMajor(skillId) ? C.skillXp.classFactor.major : C.skillXp.classFactor.minor;
    const specFactor = s.spec === cls.specialization ? C.skillXp.specFactor : 1;
    const eff = effectiveSkill(skillId, skills[skillId], attrs as Attributes, data);
    vastei += vasteiPerRank(skills[skillId], eff, classFactor, specFactor, data);
    skills[skillId] += 1;
    ranksSinceLevel += 1;
    totalRanks += 1;

    if (ranksSinceLevel >= C.levelUp.ranksPerLevel) {
      ranksSinceLevel -= C.levelUp.ranksPerLevel;
      level += 1;
      const earnedThisLevel = vastei;
      const sittingBuys: Record<string, number> = {};
      const buying = policy === "spend" || level >= hoardUntilLevel;
      if (buying) {
        for (;;) {
          // Buy the cheapest available point; stop when nothing is affordable.
          let bestAttr: string | null = null;
          let bestCost = Infinity;
          for (const a of Object.keys(attrs)) {
            const n = (sittingBuys[a] ?? 0) + 1;
            if (n > C.levelUp.sittingCap) continue;
            const cost = attributeCost(level, attrs[a], n, data);
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
      const hp = maxHealth(attrs as Attributes, level, data);
      healthIntegral += hp * (totalRanks - lastLevelRanks);
      lastLevelRanks = totalRanks;
      history.push({
        level,
        ranks: totalRanks,
        // The sim adds the previous row's `.spent`, which no row carries (always 0).
        vasteiEarnedByNow: Math.round(earnedThisLevel),
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
