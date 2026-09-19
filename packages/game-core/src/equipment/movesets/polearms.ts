import { clipConfig } from "../../anim/animationManifest";
import type { AnimationState } from "../../core/types";
import type { AttackId, AttackSpec, WeaponAnimationProfile } from "../types";
import {
  CONTACT_MARGIN_FRACTION,
  GREATAXE_ANIMATIONS,
  GREATSWORD_ANIMATIONS,
  twoHandedMoveset,
} from "./twoHanded";

/**
 * The polearm movesets: a thrusting set (pike) and two haft sets (halberd,
 * quarterstaff), from the Animated Armoury animation packs.
 *
 * They are built the way the vanilla two-handed sets are built, and for the
 * same reason: a polearm is carried, walked and guarded with like a two-handed
 * weapon, and only the strikes are genuinely its own. So each set spreads the
 * two-handed profile it belongs to and overrides the clips its pack actually
 * ships — which is exactly the inheritance the packs declare (`pike` requires
 * `greatsword`; `halberd` and `quarterstaff` require `greataxe`).
 *
 * The pike owns its locomotion too, because a pike is carried level at the hip
 * rather than over the shoulder, and the pack ships walk, walk-back and both
 * strafes. It does *not* ship a run, so the run stays `GREATSWORD_RUN`: a
 * sprint-paced polearm carry was never authored and a missing clip would leave
 * the previous action playing rather than raise an error.
 *
 * Parries, riposte and backstab are inherited throughout. Animated Armoury
 * authors no parry or execution for these weapons, and the two-handed family's
 * are the closest authored motion for the same carriage.
 *
 * ## Timing
 *
 * Contact windows are measured, not guessed, with the same tool and against
 * each class's own reach:
 *
 *     node scripts/measure-contact-windows.mjs --blade 2.5 PIKE_LIGHT_1 ...
 *     node scripts/measure-contact-windows.mjs --blade 2.2 HALBERD_LIGHT_1 ...
 *     node scripts/measure-contact-windows.mjs --blade 1.6 QUARTERSTAFF_LIGHT_1 ...
 */

type PolearmSwing =
  | "PIKE_LIGHT_1" | "PIKE_LIGHT_2" | "PIKE_LIGHT_3" | "PIKE_HEAVY" | "PIKE_HEAVY_2"
  | "HALBERD_LIGHT_1" | "HALBERD_LIGHT_2" | "HALBERD_LIGHT_3"
  | "HALBERD_HEAVY" | "HALBERD_HEAVY_2"
  | "QUARTERSTAFF_LIGHT_1" | "QUARTERSTAFF_LIGHT_2" | "QUARTERSTAFF_LIGHT_3"
  | "QUARTERSTAFF_HEAVY" | "QUARTERSTAFF_HEAVY_2";

/** Measured clip fractions over which the head is sweeping the reach zone. */
const CONTACT: Record<PolearmSwing, { start: number; end: number }> = {
  // Pike, measured at 2.5 m.
  PIKE_LIGHT_1: { start: 0.310, end: 0.387 },
  PIKE_LIGHT_2: { start: 0.310, end: 0.387 },
  PIKE_LIGHT_3: { start: 0.628, end: 0.722 },
  PIKE_HEAVY: { start: 0.337, end: 0.444 },
  PIKE_HEAVY_2: { start: 0.316, end: 0.444 },
  // Halberd, measured at 2.2 m.
  HALBERD_LIGHT_1: { start: 0.383, end: 0.480 },
  HALBERD_LIGHT_2: { start: 0.310, end: 0.387 },
  HALBERD_LIGHT_3: { start: 0.441, end: 0.553 },
  HALBERD_HEAVY: { start: 0.531, end: 0.628 },
  HALBERD_HEAVY_2: { start: 0.480, end: 0.565 },
  // Quarterstaff, measured at 1.6 m.
  QUARTERSTAFF_LIGHT_1: { start: 0.343, end: 0.419 },
  QUARTERSTAFF_LIGHT_2: { start: 0.339, end: 0.403 },
  QUARTERSTAFF_LIGHT_3: { start: 0.615, end: 0.722 },
  QUARTERSTAFF_HEAVY: { start: 0.397, end: 0.510 },
  QUARTERSTAFF_HEAVY_2: { start: 0.490, end: 0.687 },
};

/** The authored clip is the action, as it is for the two-handed sets. */
function contactTiming(animation: AnimationState) {
  const clip = clipConfig(animation).sourceDuration ?? 2;
  const { start, end } = CONTACT[animation as PolearmSwing];
  const windup = clip * Math.max(0, start - CONTACT_MARGIN_FRACTION);
  const active = clip * (end - start + CONTACT_MARGIN_FRACTION * 2);
  return { windup, active, recovery: Math.max(0, clip - windup - active) };
}

export const PIKE_ANIMATIONS: WeaponAnimationProfile = {
  ...GREATSWORD_ANIMATIONS,
  combatIdle: "PIKE_IDLE",
  sprintOverride: "PIKE_SPRINT",
  locomotion: {
    walk: "PIKE_WALK",
    walkBack: "PIKE_WALK_BACK",
    strafeLeft: "PIKE_STRAFE_LEFT",
    strafeRight: "PIKE_STRAFE_RIGHT",
    // No authored pike run; the two-handed carry run stands in.
    run: "GREATSWORD_RUN",
  },
  guard: {
    enter: "PIKE_GUARD_ENTER",
    loop: "PIKE_GUARD",
    hitVariants: ["PIKE_GUARD_HIT_A", "PIKE_GUARD_HIT_B"],
  },
  lightAttacks: ["PIKE_LIGHT_1", "PIKE_LIGHT_2", "PIKE_LIGHT_3"],
  heavyAttacks: ["PIKE_HEAVY", "PIKE_HEAVY_2"],
  equip: "PIKE_EQUIP",
  unequip: "PIKE_UNEQUIP",
};

export const HALBERD_ANIMATIONS: WeaponAnimationProfile = {
  ...GREATAXE_ANIMATIONS,
  combatIdle: "HALBERD_IDLE",
  sprintOverride: "HALBERD_SPRINT",
  guard: {
    enter: "HALBERD_GUARD_ENTER",
    loop: "HALBERD_GUARD",
    hitVariants: ["HALBERD_GUARD_HIT_A", "HALBERD_GUARD_HIT_B"],
  },
  lightAttacks: ["HALBERD_LIGHT_1", "HALBERD_LIGHT_2", "HALBERD_LIGHT_3"],
  heavyAttacks: ["HALBERD_HEAVY", "HALBERD_HEAVY_2"],
  equip: "HALBERD_EQUIP",
  unequip: "HALBERD_UNEQUIP",
};

export const QUARTERSTAFF_ANIMATIONS: WeaponAnimationProfile = {
  ...GREATAXE_ANIMATIONS,
  combatIdle: "QUARTERSTAFF_IDLE",
  sprintOverride: "QUARTERSTAFF_SPRINT",
  guard: {
    enter: "QUARTERSTAFF_GUARD_ENTER",
    loop: "QUARTERSTAFF_GUARD",
    hitVariants: ["QUARTERSTAFF_GUARD_HIT_A", "QUARTERSTAFF_GUARD_HIT_B"],
  },
  lightAttacks: ["QUARTERSTAFF_LIGHT_1", "QUARTERSTAFF_LIGHT_2", "QUARTERSTAFF_LIGHT_3"],
  heavyAttacks: ["QUARTERSTAFF_HEAVY", "QUARTERSTAFF_HEAVY_2"],
  equip: "QUARTERSTAFF_EQUIP",
  unequip: "QUARTERSTAFF_UNEQUIP",
};

export const PIKE_MOVESET: Record<AttackId, AttackSpec> = twoHandedMoveset(
  ["PIKE_LIGHT_1", "PIKE_LIGHT_2", "PIKE_LIGHT_3"],
  ["PIKE_HEAVY", "PIKE_HEAVY_2"],
  "GREATSWORD_RIPOSTE",
  contactTiming,
);

export const HALBERD_MOVESET: Record<AttackId, AttackSpec> = twoHandedMoveset(
  ["HALBERD_LIGHT_1", "HALBERD_LIGHT_2", "HALBERD_LIGHT_3"],
  ["HALBERD_HEAVY", "HALBERD_HEAVY_2"],
  "GREATAXE_RIPOSTE",
  contactTiming,
);

export const QUARTERSTAFF_MOVESET: Record<AttackId, AttackSpec> = twoHandedMoveset(
  ["QUARTERSTAFF_LIGHT_1", "QUARTERSTAFF_LIGHT_2", "QUARTERSTAFF_LIGHT_3"],
  ["QUARTERSTAFF_HEAVY", "QUARTERSTAFF_HEAVY_2"],
  "GREATAXE_RIPOSTE",
  contactTiming,
);
