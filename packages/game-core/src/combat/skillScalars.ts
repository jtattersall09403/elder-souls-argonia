/**
 * Skill → modifiers.
 *
 * One place turns a skill number into the records the rules already take:
 * `RangedModifiers` (ballistics.ts) for a bow, `MeleeModifiers` (modifiers.ts)
 * for a blade. Every rule file stays skill-blind — it takes a record and
 * defaults to neutral — so the stats phase feeds real character skills in here
 * and nothing downstream changes.
 *
 * Numbers: nock and draw are the owner's, 2026-09-18 (decision 0074 §3); sway,
 * stamina and the damage-range position are module 76 §118 (Marksman and Long
 * Blade rows). Pure functions, no state, cheap enough to call per frame.
 */

import type { RangedModifiers } from "./ballistics";
import type { MeleeModifiers } from "./modifiers";

/**
 * The skill a starting character has. Below this a curve holds its floor
 * value: an untrained hand is bad, not infinitely bad.
 */
export const SKILL_FLOOR = 10;
/** Mastery. Skills do not read above this for scaling purposes. */
export const SKILL_CAP = 100;

/** Linear from `atFloor` at SKILL_FLOOR to `atCap` at SKILL_CAP, clamped both ends. */
function ramp(skill: number, atFloor: number, atCap: number) {
  const clamped = Math.min(SKILL_CAP, Math.max(SKILL_FLOOR, skill));
  const t = (clamped - SKILL_FLOOR) / (SKILL_CAP - SKILL_FLOOR);
  return atFloor + (atCap - atFloor) * t;
}

/**
 * Where in a weapon class's damage range this skill's blows land (module 76
 * §118): 0.40 at no skill at all, 1.00 at mastery. Unlike the ramps this runs
 * from zero, because the range position is defined across the whole skill.
 */
export function damageRangePosition(skill: number) {
  return 0.4 + 0.6 * (Math.min(SKILL_CAP, Math.max(0, skill)) / 100);
}

/** Marksman: what a bow does in this archer's hands. */
export function marksmanScalars(skill: number): RangedModifiers {
  return {
    nockSpeed: ramp(skill, 1.0, 1.6),
    drawSpeed: ramp(skill, 1.0, 2.0),
    // Draw strength is a Strength question, not a Marksman one; neutral here.
    drawStrength: 1,
    sway: ramp(skill, 1.4, 0.6),
    drawStaminaCost: ramp(skill, 1.25, 0.8),
    damage: damageRangePosition(skill),
  };
}

/** A melee skill (Long Blade and its siblings): damage position and effort. */
export function meleeScalars(skill: number): MeleeModifiers {
  return {
    damagePosition: damageRangePosition(skill),
    staminaCost: ramp(skill, 1.25, 0.8),
  };
}
