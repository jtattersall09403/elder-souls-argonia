/**
 * The lab's view model: one pure function from the sliders to every number
 * shown. All arithmetic is the game's own (`@elder-souls/game-core/stats`);
 * this file only chooses what to display.
 */
import * as s from "@elder-souls/game-core/stats/index";
import type { AttributeId, Attributes, Sex, SkillId } from "@elder-souls/game-core/stats/index";

export const LAB_SKILLS = [
  "longBlade", "blunt", "axe", "spear", "shortBlade", "handToHand", "marksman", "block",
  "heavyArmor", "athletics", "acrobatics", "sneak",
] as const satisfies readonly SkillId[];
export type LabSkill = (typeof LAB_SKILLS)[number];
export type MeleeSkill = s.MeleeSkillId;

export type LabState = {
  race: string;
  sex: Sex;
  classId: string;
  level: number;
  attributes: Attributes;
  skills: Record<LabSkill, number>;
  weaponSkill: MeleeSkill;
  carriedKg: number;
  armourRating: number;
  curveSkill: LabSkill;
};

/** Sliders set from race + sex + class (§119), at level 1 with a modest kit. */
export function stateFromCreation(race: string, sex: Sex, classId: string): LabState {
  const c = s.startingCharacter({ race, sex, classId });
  return {
    race, sex, classId, level: 1, attributes: c.attributes,
    skills: Object.fromEntries(LAB_SKILLS.map((id) => [id, c.skills[id]])) as Record<LabSkill, number>,
    weaponSkill: "longBlade", carriedKg: 30, armourRating: 20, curveSkill: "longBlade",
  };
}

/** The Marsh Hand (module 76 §116): the character today's combat sandbox runs on. */
export function referenceState(): LabState {
  const base = stateFromCreation("argonian", "female", "warrior");
  return {
    ...base, level: 10, attributes: s.REFERENCE_ATTRIBUTES,
    skills: { ...base.skills, longBlade: 60, block: 50, heavyArmor: 45, athletics: 40 },
    weaponSkill: "longBlade", carriedKg: 50, armourRating: 50,
  };
}

export type Row = { key: string; value: number | string };

/** Water breathing is a racial effect on the one stack (§127), read from the race record. */
const breathesWater = (race: string) =>
  s.raceStats(race).effects.some((e) => e.field === "waterBreathing" && e.magnitude > 0);

export function derivedRows(st: LabState): Row[] {
  const a = st.attributes;
  const burden = s.burdenTier(st.carriedKg, a);
  return [
    { key: "health", value: s.maxHealth(a, st.level) },
    { key: "stamina", value: s.maxStamina(a) },
    { key: "stamina-regen", value: s.staminaRegen(a) },
    { key: "magicka", value: s.maxMagicka(a) },
    { key: "magicka-regen", value: s.magickaRegen(a) },
    { key: "carry-capacity", value: s.carryCapacity(a) },
    { key: "burden", value: `tier-${burden.tier}` },
    { key: "breath", value: s.breathSeconds(st.skills.athletics, a.endurance, breathesWater(st.race)) },
    { key: "walk", value: s.walkSpeed(a, burden.ratio) },
    { key: "sprint", value: s.sprintSpeed(a, st.skills.athletics, burden.ratio) },
    { key: "swim", value: s.swimSpeed(st.skills.athletics) },
    { key: "jump", value: s.jumpApex(st.skills.acrobatics) },
    { key: "safe-fall", value: s.safeFallMetres(st.skills.acrobatics) },
  ];
}

export function combatRows(st: LabState): Row[] {
  const a = st.attributes;
  const melee = s.meleeModifiers(st.weaponSkill, st.skills[st.weaponSkill], a);
  const bow = s.marksmanModifiers(st.skills.marksman, a);
  const block = s.blockModifiers(st.skills.block, a);
  const burden = s.burdenTier(st.carriedKg, a);
  return [
    { key: "damage-position", value: melee.damagePosition },
    { key: "strength-term", value: melee.strength },
    { key: "stamina-cost", value: melee.staminaCost * s.burdenStaminaMultiplier(burden.tier) },
    { key: "nock", value: bow.nockSpeed },
    { key: "draw", value: bow.drawSpeed },
    { key: "sway", value: bow.sway },
    { key: "draw-stamina", value: bow.drawStaminaCost },
    { key: "stability", value: block.stability },
    { key: "guard-stamina", value: block.guardStamina },
  ];
}

/** Every named band of a skill; the panel draws them in charts of at most four (the palette cap). */
export function curveSeries(skill: LabSkill): { band: string; lo: number; hi: number }[] {
  const bands = s.STATS_DATA.skillById[skill].bands;
  return Object.entries(bands).map(([band, [lo, hi]]) => ({ band, lo, hi }));
}

/** Points of each band from skill 0 to 100 at these attributes. */
export function curvePoints(skill: LabSkill, attributes: Attributes): { band: string; points: [number, number][] }[] {
  return curveSeries(skill).map(({ band }) => ({
    band,
    points: Array.from({ length: 21 }, (_, i) => {
      const x = i * 5;
      return [x, s.skillBand(skill, band, x, attributes)] as [number, number];
    }),
  }));
}

export type LadderRow = { band: string; health: number; hit: number; blowsToKillYou: number; mitigation: number };
/** Mid-band actors D1–D5 against this character: how many unavoided light hits kill them (§128). */
export function ladderRows(st: LabState): LadderRow[] {
  const hp = s.maxHealth(st.attributes, st.level);
  return s.STATS_DATA.ladder.bands.map((b) => {
    const actor = s.bandActor(b.id, 0.5);
    const incoming = s.incomingDamage(actor.damage);
    const hit = s.damageAfterArmour(incoming, st.armourRating);
    return { band: b.id, health: actor.health, hit, blowsToKillYou: Math.ceil(hp / hit), mitigation: s.mitigation(st.armourRating, incoming) };
  });
}

export type ClimbRow = { height: number; seconds: number; cost: number; inOneGo: boolean };
export function climbRows(st: LabState): ClimbRow[] {
  const a = st.attributes;
  const tier = s.burdenTier(st.carriedKg, a).tier;
  return [10, 25, 40].map((height) => {
    const c = s.climb(height, { acrobatics: st.skills.acrobatics, attributes: a, burdenTier: tier, stamina: s.maxStamina(a), staminaRegen: s.staminaRegen(a) });
    return { height, seconds: c.seconds, cost: c.staminaCost, inOneGo: c.completesInOneGo };
  });
}

export const ATTRIBUTE_ORDER: readonly AttributeId[] = s.ATTRIBUTE_IDS;
