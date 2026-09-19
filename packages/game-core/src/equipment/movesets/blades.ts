import { clipConfig } from "../../anim/animationManifest";
import type { AnimationState } from "../../core/types";
import type { AttackId, AttackSpec, WeaponAnimationProfile } from "../types";
import {
  CONTACT_MARGIN_FRACTION,
  HEAVY_COMBO_BRANCH_PROGRESS,
  LIGHT_COMBO_BRANCH_PROGRESS,
  ONE_HANDED_ANIMATIONS,
  REFERENCE_MOVESET,
} from "./oneHanded";

/**
 * The one-handed variant movesets from the Animated Armoury packs: a thrusting
 * blade (rapier), a worn weapon (claw) and a katana.
 *
 * All three are one-handed sets in the sandbox's sense, so both spread the reference
 * one-handed profile and override only the clips their pack ships. The rapier
 * pack is carriage, five attacks and a draw; guard, parry, riposte and backstab
 * are the one-handed set's, because Animated Armoury authors none of them and
 * a rapier is held and parried with like a sword. The claw pack adds its own
 * guard *hold* — you block with the back of the hand, not an edge — but not the
 * entry into it, so `guard.enter` stays `GUARD_ENTER`; and it has no draw, so
 * the sword draw stands in. The katana pack is the fullest of the three:
 * carriage, sprint, five attacks, its own guard entry, hold and hit reactions,
 * and a draw; only parry, riposte and the criticals are inherited.
 *
 * ## Timing
 *
 * Measured with the same tool, against each class's own reach:
 *
 *     node scripts/measure-contact-windows.mjs --blade 1.1 RAPIER_LIGHT_1 ...
 *     node scripts/measure-contact-windows.mjs --blade 0.45 CLAW_LIGHT_1 ...
 *     node scripts/measure-contact-windows.mjs --blade 1.05 KATANA_LIGHT_1 ...
 */

type BladeSwing =
  | "RAPIER_LIGHT_1" | "RAPIER_LIGHT_2" | "RAPIER_LIGHT_3"
  | "RAPIER_HEAVY" | "RAPIER_HEAVY_2"
  | "CLAW_LIGHT_1" | "CLAW_LIGHT_2" | "CLAW_LIGHT_3"
  | "CLAW_HEAVY" | "CLAW_HEAVY_2"
  | "KATANA_LIGHT_1" | "KATANA_LIGHT_2" | "KATANA_LIGHT_3"
  | "KATANA_HEAVY" | "KATANA_HEAVY_2";

const CONTACT: Record<BladeSwing, { start: number; end: number }> = {
  // Rapier, measured at 1.1 m.
  RAPIER_LIGHT_1: { start: 0.256, end: 0.425 },
  RAPIER_LIGHT_2: { start: 0.331, end: 0.400 },
  RAPIER_LIGHT_3: { start: 0.240, end: 0.353 },
  RAPIER_HEAVY: { start: 0.451, end: 0.569 },
  RAPIER_HEAVY_2: { start: 0.464, end: 0.571 },
  // Claw, measured at 0.45 m.
  CLAW_LIGHT_1: { start: 0.394, end: 0.500 },
  CLAW_LIGHT_2: { start: 0.406, end: 0.500 },
  // UNMEASURED. CLAW_LIGHT_3 is a lunge: the hand travels with the body and
  // the tool finds no tip sweep to select a contact phase from. The reference
  // one-handed LIGHT_3 window stands in as the authored-slot analogue, which is
  // the same construction the chain's other borrowed clips use — replace it the
  // moment the clip can be measured against a moving body.
  CLAW_LIGHT_3: { start: 0.476, end: 0.774 },
  CLAW_HEAVY: { start: 0.458, end: 0.528 },
  CLAW_HEAVY_2: { start: 0.419, end: 0.475 },
  // Katana, measured at 1.05 m.
  KATANA_LIGHT_1: { start: 0.356, end: 0.425 },
  KATANA_LIGHT_2: { start: 0.375, end: 0.500 },
  // UNMEASURED. KATANA_LIGHT_3 is a lunge: the hand travels with the body and
  // the tool finds no tip sweep to select a contact phase from. The reference
  // one-handed LIGHT_3 window stands in as the authored-slot analogue, which is
  // the same construction the chain's other borrowed clips use — replace it the
  // moment the clip can be measured against a moving body.
  KATANA_LIGHT_3: { start: 0.476, end: 0.774 },
  KATANA_HEAVY: { start: 0.745, end: 0.783 },
  KATANA_HEAVY_2: { start: 0.375, end: 0.429 },
};

/** Split each clip's own duration around its measured contact window. */
function contactTiming(animation: AnimationState) {
  const clip = clipConfig(animation).sourceDuration ?? 1.3;
  const { start, end } = CONTACT[animation as BladeSwing];
  const windup = clip * Math.max(0, start - CONTACT_MARGIN_FRACTION);
  const active = clip * (end - start + CONTACT_MARGIN_FRACTION * 2);
  return { windup, active, recovery: Math.max(0, clip - windup - active) };
}

/**
 * The reference one-handed attacks with this set's clips and timing swapped in.
 *
 * Reach, arc, lunge, motion value and stamina stay the reference moveset's —
 * they are the class profile's job. What a moveset owns is which clips play and
 * when they cut.
 */
function oneHandedVariantMoveset(
  lights: readonly [BladeSwing, BladeSwing, BladeSwing],
  heavies: readonly [BladeSwing, BladeSwing],
): Record<AttackId, AttackSpec> {
  const swing = (id: AttackId, animation: BladeSwing, branch?: number) => ({
    ...REFERENCE_MOVESET[id],
    animation: animation as AnimationState,
    ...contactTiming(animation),
    ...(branch === undefined ? {} : { comboBranchProgress: branch }),
  });
  return {
    ...REFERENCE_MOVESET,
    light1: swing("light1", lights[0], LIGHT_COMBO_BRANCH_PROGRESS),
    light2: swing("light2", lights[1], LIGHT_COMBO_BRANCH_PROGRESS),
    light3: swing("light3", lights[2], LIGHT_COMBO_BRANCH_PROGRESS),
    heavy: swing("heavy", heavies[0], HEAVY_COMBO_BRANCH_PROGRESS),
    heavy2: swing("heavy2", heavies[1]),
  };
}

export const RAPIER_ANIMATIONS: WeaponAnimationProfile = {
  ...ONE_HANDED_ANIMATIONS,
  combatIdle: "RAPIER_IDLE",
  lightAttacks: ["RAPIER_LIGHT_1", "RAPIER_LIGHT_2", "RAPIER_LIGHT_3"],
  heavyAttacks: ["RAPIER_HEAVY", "RAPIER_HEAVY_2"],
  equip: "RAPIER_EQUIP",
  unequip: "RAPIER_UNEQUIP",
};

export const CLAW_ANIMATIONS: WeaponAnimationProfile = {
  ...ONE_HANDED_ANIMATIONS,
  combatIdle: "CLAW_IDLE",
  guard: {
    // Entry is the shared one: only the hold and its hit reactions were
    // authored for a weapon worn on the hand.
    enter: ONE_HANDED_ANIMATIONS.guard.enter,
    loop: "CLAW_GUARD",
    hitVariants: ["CLAW_GUARD_HIT_A", "CLAW_GUARD_HIT_B"],
  },
  lightAttacks: ["CLAW_LIGHT_1", "CLAW_LIGHT_2", "CLAW_LIGHT_3"],
  heavyAttacks: ["CLAW_HEAVY", "CLAW_HEAVY_2"],
};

export const KATANA_ANIMATIONS: WeaponAnimationProfile = {
  ...ONE_HANDED_ANIMATIONS,
  combatIdle: "KATANA_IDLE",
  sprintOverride: "KATANA_SPRINT",
  guard: {
    enter: "KATANA_GUARD_ENTER",
    loop: "KATANA_GUARD",
    hitVariants: ["KATANA_GUARD_HIT_A", "KATANA_GUARD_HIT_B"],
  },
  lightAttacks: ["KATANA_LIGHT_1", "KATANA_LIGHT_2", "KATANA_LIGHT_3"],
  heavyAttacks: ["KATANA_HEAVY", "KATANA_HEAVY_2"],
  equip: "KATANA_EQUIP",
};

export const RAPIER_MOVESET = oneHandedVariantMoveset(
  ["RAPIER_LIGHT_1", "RAPIER_LIGHT_2", "RAPIER_LIGHT_3"],
  ["RAPIER_HEAVY", "RAPIER_HEAVY_2"],
);

export const CLAW_MOVESET = oneHandedVariantMoveset(
  ["CLAW_LIGHT_1", "CLAW_LIGHT_2", "CLAW_LIGHT_3"],
  ["CLAW_HEAVY", "CLAW_HEAVY_2"],
);

export const KATANA_MOVESET = oneHandedVariantMoveset(
  ["KATANA_LIGHT_1", "KATANA_LIGHT_2", "KATANA_LIGHT_3"],
  ["KATANA_HEAVY", "KATANA_HEAVY_2"],
);
