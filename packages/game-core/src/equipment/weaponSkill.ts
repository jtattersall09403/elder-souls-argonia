import type { MeleeSkillId } from "../stats/modifiers";
import type { WeaponClass } from "./types";

/**
 * The skill each weapon class trains and is wielded with (module 76 §118,
 * Morrowind's weapon skills): the stats model's `meleeModifiers` takes it.
 * Staves are Blunt and halberds are Spear, as in Morrowind; the claw is a
 * Short Blade (0077 §2). Bows are Marksman (`marksmanModifiers`).
 */
export const WEAPON_CLASS_SKILL: Readonly<Record<WeaponClass, MeleeSkillId | "marksman">> = {
  dagger: "shortBlade",
  shortSword: "shortBlade",
  claw: "shortBlade",
  straightSword: "longBlade",
  scimitar: "longBlade",
  greatsword: "longBlade",
  rapier: "longBlade",
  katana: "longBlade",
  axe: "axe",
  greataxe: "axe",
  mace: "blunt",
  warhammer: "blunt",
  staff: "blunt",
  spear: "spear",
  pike: "spear",
  halberd: "spear",
  shortbow: "marksman",
  longbow: "marksman",
  warbow: "marksman",
};

/** The melee skill a class is wielded with; a bow's melee bash uses Long Blade's neutral stand-in. */
export function meleeSkillFor(classId: WeaponClass): MeleeSkillId {
  const skill = WEAPON_CLASS_SKILL[classId];
  return skill === "marksman" ? "longBlade" : skill;
}
