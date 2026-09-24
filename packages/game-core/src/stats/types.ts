/**
 * Shapes of the stats data (module 76 §116–§129). The JSON under `data/` is the
 * canonical copy of every number; these types are what the pure functions read.
 */

export const ATTRIBUTE_IDS = [
  "strength", "endurance", "agility", "speed", "willpower", "intelligence", "personality",
] as const;
export type AttributeId = (typeof ATTRIBUTE_IDS)[number];
/** The seven attribute values of one actor (0–100 by purchase; effects may exceed 100). */
export type Attributes = Readonly<Record<AttributeId, number>>;

export const SKILL_IDS = [
  "longBlade", "blunt", "axe", "spear", "shortBlade", "marksman", "handToHand", "block",
  "heavyArmor", "mediumArmor", "lightArmor", "unarmored", "athletics", "acrobatics", "sneak",
  "security", "smithing", "mercantile", "speechcraft", "alchemy", "enchant", "alteration",
  "conjuration", "destruction", "illusion", "mysticism", "restoration",
] as const;
export type SkillId = (typeof SKILL_IDS)[number];

export const SPECIALIZATIONS = ["combat", "stealth", "magic"] as const;
export type Specialization = (typeof SPECIALIZATIONS)[number];
export type SkillFamily =
  | "weapon" | "defence" | "armour" | "movement" | "stealth" | "craft" | "social" | "magic";
/** `[lo, hi]`: the value at k = 0 and at k = 1 (module 76 §116 `band`). */
export type Band = readonly [number, number];

export type SkillDef = {
  readonly id: SkillId;
  /** Governing attribute: sets the trainer cap only (module 76 §117.1). */
  readonly gov: AttributeId;
  readonly spec: Specialization;
  readonly family: SkillFamily;
  /** The attribute Morrowind's own formula for this check names; absent = pure-skill check. */
  readonly score?: AttributeId;
  /** Overrides `curves.score.defaultDivisor` (Alchemy's canon Int/10). */
  readonly scoreDivisor?: number;
  readonly armourClass?: ArmourClass;
  readonly bands: Readonly<Record<string, Band>>;
  readonly temperGrades?: readonly number[];
  readonly temperPerGrade?: number;
  readonly effectVisibilityAt?: readonly number[];
  readonly constantEffectAt?: number;
};

export type ArmourClass = "light" | "medium" | "heavy";
export type BurdenTierId = "fast" | "mid" | "fat" | "overloaded";
export type SneakWeaponKind =
  | "dagger" | "shortBlade" | "oneHanded" | "twoHanded" | "bow" | "unarmed" | "spell";

type TierTable<T> = Readonly<Record<BurdenTierId, T>>;

export type Curves = {
  readonly schemaVersion: number;
  readonly skillCurve: { readonly exponent: number };
  readonly damagePosition: { readonly lo: number; readonly hi: number };
  readonly condition: { readonly lo: number; readonly hi: number; readonly max: number };
  readonly health: { readonly attrCoefficient: number; readonly levelBase: number; readonly levelEnduranceDivisor: number };
  readonly stamina: {
    readonly base: number; readonly endCoefficient: number; readonly regenBase: number;
    readonly regenAgiCoefficient: number; readonly regenDelay: number;
    readonly burdenCostMultiplier: TierTable<number>;
  };
  readonly magicka: { readonly base: number; readonly intCoefficient: number; readonly regenBase: number; readonly regenWilCoefficient: number };
  readonly carry: { readonly base: number; readonly strCoefficient: number };
  readonly burdenTiers: { readonly fast: number; readonly mid: number; readonly fat: number };
  readonly rollTiers: TierTable<{ readonly distance: number; readonly recovery: number; readonly iFrameScale: number }>;
  readonly mitigation: { readonly constant: number; readonly damageCoefficient: number };
  readonly unarmoured: { readonly coefficient: number; readonly slots: number };
  readonly softRequirement: { readonly staminaPerPoint: number; readonly maxShortfall: number };
  readonly breath: {
    readonly base: number; readonly athleticsCoefficient: number; readonly enduranceCoefficient: number;
    readonly drowningDamagePerSecond: number;
  };
  readonly movement: {
    readonly walkBase: number; readonly sprintBase: number; readonly swimBase: number;
    readonly climbBase: number; readonly jumpApexBase: number;
    readonly speedFactorBase: number; readonly speedFactorDivisor: number; readonly loadSpeedPenalty: number;
    readonly sprintAthleticsDivisor: number; readonly swimAthleticsBase: number; readonly swimAthleticsDivisor: number;
    readonly jumpAcrobaticsBase: number; readonly jumpAcrobaticsDivisor: number;
    readonly safeFallBaseMetres: number; readonly safeFallAcrobaticsDivisor: number;
    readonly overloadedWalkFraction: number;
  };
  readonly skillXp: {
    readonly classFactor: { readonly major: number; readonly minor: number; readonly misc: number };
    readonly specFactor: number;
  };
  readonly vastei: { readonly perUse: number; readonly skillDivisor: number };
  readonly levelUp: {
    readonly ranksPerLevel: number; readonly miscRankRatio: number; readonly costBase: number;
    readonly costLevelDivisor: number; readonly costLevelExponent: number; readonly attrValueDivisor: number;
    readonly attrValueExponent: number; readonly sittingIncrement: number; readonly sittingCap: number;
  };
  readonly difficulty: { readonly enemyDamageMultiplier: number; readonly presets: Readonly<Record<string, number>> };
  readonly armourClassRating: Readonly<Record<ArmourClass, number>>;
  readonly sneakAttack: {
    readonly bandsBySkill: readonly number[];
    readonly multipliers: Readonly<Record<SneakWeaponKind, readonly number[]>>;
  };
  readonly climbing: {
    readonly baseSpeedMetresPerSecond: number; readonly baseStaminaPerSecond: number;
    readonly mantleStaminaCost: number; readonly ledgeGrabStaminaCost: number;
    readonly burdenDrainMultiplier: TierTable<number>; readonly restOnHoldRegenFraction: number;
  };
  readonly worthiness: { readonly fullUseDamageFraction: number; readonly minUseValue: number };
  readonly score: { readonly defaultDivisor: number; readonly scale: number; readonly missingAttribute: number };
  readonly strengthDamage: {
    readonly base: number; readonly divisor: number;
    readonly appliesTo: readonly string[]; readonly excludes: readonly SkillId[];
  };
  readonly poise: { readonly agilityDivisor: number };
  readonly block: { readonly stabilityCap: number };
  readonly checks: {
    readonly castSkillMultiplier: number; readonly enchantPointDivisor: number;
    readonly chargedUseBase: number;
    readonly outOfCombatFatigue: { readonly base: number; readonly staminaShare: number };
    readonly craftTierDivisor: number;
  };
};

export type SkillsTable = { readonly schemaVersion: number; readonly skills: readonly SkillDef[] };
export type AttributesTable = {
  readonly schemaVersion: number;
  readonly attributes: readonly { readonly id: AttributeId }[];
  readonly startRange: { readonly min: number; readonly max: number };
  readonly favouredBonus: number;
  readonly purchaseCap: number;
  /** The Marsh Hand (module 76 §116): the continuity anchor's attributes. */
  readonly reference: Attributes;
};

/** Everything the stat functions read. Inject a different one to test or to tune. */
export type StatsData = {
  readonly curves: Curves;
  readonly skills: SkillsTable;
  readonly attributes: AttributesTable;
  readonly races: RacesTable;
  readonly classes: ClassesTable;
  readonly ladder: LadderTable;
  readonly magic: OpaqueTable;
  readonly economy: OpaqueTable;
  /** Our progression rules (§120), `$from` references resolved against `curves`. */
  readonly progression: Readonly<Record<string, unknown>>;
  /** `skills.skills` keyed by id, built once by `statsData()`. */
  readonly skillById: Readonly<Record<SkillId, SkillDef>>;
};

// ---------------------------------------------------------------- round 2

export const SEXES = ["male", "female"] as const;
export type Sex = (typeof SEXES)[number];
export type ResistOp = "fortify" | "drain" | "damage" | "restore" | "resist" | "absorb" | "ability";
/** One entry on the effect stack (module 76 §127). Racials are permanent entries. */
export type StatEffect = {
  readonly field: string;
  readonly op: ResistOp;
  readonly magnitude: number;
  readonly permanent?: boolean;
  readonly durationSeconds?: number;
};
/** A playable race's stat package. `id` is the body roster's race id (`actors/generated/races.json`). */
export type RaceStats = {
  readonly id: string;
  readonly attributes: Readonly<Record<Sex, Attributes>>;
  readonly skillBonuses: Readonly<Partial<Record<SkillId, number>>>;
  readonly effects: readonly StatEffect[];
  /** Once-a-day racial powers: ids of spells authored later (§127); empty until then. */
  readonly powers: readonly string[];
};
export type RacesTable = { readonly schemaVersion: number; readonly sexes: readonly Sex[]; readonly races: readonly RaceStats[] };

export type ClassDef = {
  readonly id: string;
  readonly specialization: Specialization;
  readonly favouredAttributes: readonly AttributeId[];
  readonly majors: readonly SkillId[];
  readonly minors: readonly SkillId[];
};
export type ClassesTable = {
  readonly schemaVersion: number;
  readonly startingSkill: number; readonly majorBonus: number; readonly minorBonus: number;
  readonly specializationBonus: number; readonly favouredAttributeBonus: number;
  readonly classes: readonly ClassDef[];
};

export type LadderField = "health" | "damage" | "armourRating" | "magicResist" | "attackPeriod" | "lootValue";
export const LADDER_FIELDS: readonly LadderField[] = ["health", "damage", "armourRating", "magicResist", "attackPeriod", "lootValue"];
export type LadderBand = { readonly id: string; readonly hitsToDieTarget?: number } & Readonly<Record<LadderField, Band>>;
export type LadderTable = {
  readonly schemaVersion: number;
  /** A heavy attack lands at this multiple of the band's typical light hit. */
  readonly heavyMultiplier: number;
  /** A variant may move a field at most to band edge ×/÷ this (§128). */
  readonly variantClamp: number;
  readonly bands: readonly LadderBand[];
  readonly variants: Readonly<Record<string, Readonly<Partial<Record<LadderField, number>>>>>;
};

/** A progression rule set as authored: numbers may be `{"$from": "curves.<path>"}` references. */
export type RuleSetSource = Readonly<Record<string, unknown>>;

/** Game tables with no dedicated type yet: read by the harness and by later 10c systems. */
export type OpaqueTable = { readonly schemaVersion: number } & Readonly<Record<string, unknown>>;
