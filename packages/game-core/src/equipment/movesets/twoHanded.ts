import { clipConfig } from "../../anim/animationManifest";
import type { AnimationState } from "../../core/types";
import type { AttackId, AttackSpec, WeaponAnimationProfile } from "../types";
import { ONE_HANDED_ANIMATIONS, REFERENCE_MOVESET } from "./oneHanded";

/**
 * The two-handed movesets: a blade set (Skyrim's `2hm`) and a haft set
 * (`2hw`) for axes and hammers.
 *
 * They are two movesets and one *shape*. Bethesda authors both against the same
 * footwork, and only the swings genuinely differ — so the haft set overrides
 * the idle, the sprint and the five attacks, and inherits carriage, locomotion,
 * guard, parry and draw from the blade set. That inheritance is mirrored in the
 * animation packs: `greataxe` declares `requires: ["greatsword"]`, so a
 * warhammer downloads seven extra clips rather than twenty more.
 *
 * Both reuse the one-handed paired criticals. A riposte and a backstab are
 * choreography between two bodies, and Skyrim ships one authored pair; giving
 * every weapon family its own would be a sourcing job with no gameplay behind
 * it. They live in their own `criticals` pack for exactly that reason.
 *
 * ## Timing, and what is measured versus carried over
 *
 * A two-handed swing is authored slower and longer than its one-handed
 * counterpart — 2.0 s against 1.3 s for the opening swing — so the action lock
 * comes from each clip's own duration rather than from a scaled one-handed
 * number. What is *carried over* is where in the clip the blade is cutting.
 *
 * The contact fractions below are the audited one-handed windows applied to the
 * matching two-handed clips, which are Bethesda's own re-authoring of the same
 * swings (`1hm_attackright` → `2hm_attackright`, and so on). That is a
 * principled starting point, not a measurement, and it is deliberately
 * **provisional**: `scripts/measure-contact-windows.mjs` is the tool that
 * settles these, and it had been reading a GLB path that stopped existing at
 * the Phase 7 package extraction, so it has not been runnable — and its output
 * no longer agrees with the calibrated one-handed windows it once produced.
 * Re-measuring both sets is a focused job on its own (polish backlog); until
 * then the one-handed windows stay exactly as the owner calibrated them and
 * these inherit their shape.
 */

/**
 * Contact windows as clip fractions. Held here rather than imported so the
 * carry-over above is visible at the point of use, and so re-measuring the
 * two-handed set later does not have to disturb the one-handed one.
 */
const CONTACT: Record<TwoHandedSwing, { start: number; end: number }> = {
  GREATSWORD_LIGHT_1: { start: 0.365, end: 0.475 },
  GREATSWORD_LIGHT_2: { start: 0.346, end: 0.423 },
  GREATSWORD_LIGHT_3: { start: 0.476, end: 0.774 },
  GREATSWORD_HEAVY: { start: 0.543, end: 0.72 },
  GREATSWORD_HEAVY_2: { start: 0.673, end: 0.84 },
  GREATAXE_LIGHT_1: { start: 0.365, end: 0.475 },
  GREATAXE_LIGHT_2: { start: 0.346, end: 0.423 },
  GREATAXE_LIGHT_3: { start: 0.476, end: 0.774 },
  GREATAXE_HEAVY: { start: 0.543, end: 0.72 },
  GREATAXE_HEAVY_2: { start: 0.673, end: 0.84 },
};

type TwoHandedSwing =
  | "GREATSWORD_LIGHT_1" | "GREATSWORD_LIGHT_2" | "GREATSWORD_LIGHT_3"
  | "GREATSWORD_HEAVY" | "GREATSWORD_HEAVY_2"
  | "GREATAXE_LIGHT_1" | "GREATAXE_LIGHT_2" | "GREATAXE_LIGHT_3"
  | "GREATAXE_HEAVY" | "GREATAXE_HEAVY_2";

/** Same margin the one-handed set uses: ~1.5 fixed physics steps either side. */
const CONTACT_MARGIN_FRACTION = 0.04;

/**
 * A two-handed swing commits harder than a one-handed one, which is the whole
 * reason to carry one. The chain branches later in the follow-through than the
 * one-handed 0.85, so a greatsword combo cannot be mashed at sword cadence.
 */
const LIGHT_COMBO_BRANCH_PROGRESS = 0.9;

function contactTiming(animation: TwoHandedSwing) {
  // The authored clip *is* the action: a two-handed swing that finishes before
  // its motion does reads as the weapon weighing nothing.
  const clip = clipConfig(animation).sourceDuration ?? 2;
  const { start, end } = CONTACT[animation];
  const windup = clip * Math.max(0, start - CONTACT_MARGIN_FRACTION);
  const active = clip * (end - start + CONTACT_MARGIN_FRACTION * 2);
  return { windup, active, recovery: Math.max(0, clip - windup - active) };
}

const GREATSWORD_LOCOMOTION = {
  walk: "GREATSWORD_WALK",
  walkBack: "GREATSWORD_WALK_BACK",
  strafeLeft: "GREATSWORD_STRAFE_LEFT",
  strafeRight: "GREATSWORD_STRAFE_RIGHT",
  run: "GREATSWORD_RUN",
} as const satisfies NonNullable<WeaponAnimationProfile["locomotion"]>;

export const GREATSWORD_ANIMATIONS: WeaponAnimationProfile = {
  combatIdle: "GREATSWORD_IDLE",
  sprintOverride: "GREATSWORD_SPRINT",
  locomotion: GREATSWORD_LOCOMOTION,
  // No authored two-handed sneak in the vanilla set, so the weapon-neutral
  // crouch in the core pack stands in rather than a sword pose that would put
  // the wrong weapon in the wrong hand.
  guard: {
    enter: "GREATSWORD_GUARD_ENTER",
    loop: "GREATSWORD_GUARD",
    hitVariants: ["GREATSWORD_GUARD_HIT_A", "GREATSWORD_GUARD_HIT_B"],
  },
  parry: {
    intro: "GREATSWORD_PARRY",
    followThrough: "GREATSWORD_PARRY_FOLLOW_THROUGH",
  },
  lightAttacks: ["GREATSWORD_LIGHT_1", "GREATSWORD_LIGHT_2", "GREATSWORD_LIGHT_3"],
  heavyAttacks: ["GREATSWORD_HEAVY", "GREATSWORD_HEAVY_2"],
  guardBreak: ONE_HANDED_ANIMATIONS.guardBreak,
  riposte: ONE_HANDED_ANIMATIONS.riposte,
  backstab: ONE_HANDED_ANIMATIONS.backstab,
  equip: "GREATSWORD_EQUIP",
  unequip: "GREATSWORD_UNEQUIP",
};

/** Only the carriage and the swings differ; everything else is the blade set. */
export const GREATAXE_ANIMATIONS: WeaponAnimationProfile = {
  ...GREATSWORD_ANIMATIONS,
  combatIdle: "GREATAXE_IDLE",
  sprintOverride: "GREATAXE_SPRINT",
  lightAttacks: ["GREATAXE_LIGHT_1", "GREATAXE_LIGHT_2", "GREATAXE_LIGHT_3"],
  heavyAttacks: ["GREATAXE_HEAVY", "GREATAXE_HEAVY_2"],
};

/**
 * Reach, arc, lunge, motion value and stamina stay the reference moveset's —
 * they are the *class* profile's job (`reachBonus`, `powerScale`,
 * `staminaScale`), and restating them per moveset is exactly the duplication
 * the class table exists to avoid. What a moveset owns is its authored timing
 * and which clips play.
 */
function twoHandedMoveset(
  lights: readonly [TwoHandedSwing, TwoHandedSwing, TwoHandedSwing],
  heavies: readonly [TwoHandedSwing, TwoHandedSwing],
): Record<AttackId, AttackSpec> {
  const swing = (id: AttackId, animation: TwoHandedSwing, branch?: number) => ({
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
    heavy: swing("heavy", heavies[0], LIGHT_COMBO_BRANCH_PROGRESS),
    heavy2: swing("heavy2", heavies[1]),
    // Criticals are the shared paired choreography, unchanged.
    riposte: REFERENCE_MOVESET.riposte,
    backstab: REFERENCE_MOVESET.backstab,
  };
}

export const GREATSWORD_MOVESET = twoHandedMoveset(
  ["GREATSWORD_LIGHT_1", "GREATSWORD_LIGHT_2", "GREATSWORD_LIGHT_3"],
  ["GREATSWORD_HEAVY", "GREATSWORD_HEAVY_2"],
);

export const GREATAXE_MOVESET = twoHandedMoveset(
  ["GREATAXE_LIGHT_1", "GREATAXE_LIGHT_2", "GREATAXE_LIGHT_3"],
  ["GREATAXE_HEAVY", "GREATAXE_HEAVY_2"],
);
