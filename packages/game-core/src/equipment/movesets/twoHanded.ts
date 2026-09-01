import { clipConfig } from "../../anim/animationManifest";
import type { AnimationState } from "../../core/types";
import type {
  AttackId,
  AttackSpec,
  PairedCriticalProfile,
  WeaponAnimationProfile,
} from "../types";
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
 * ## Criticals
 *
 * The **riposte** is per family. Rim Parry authors a separate execution for
 * every weapon type, and a greatsword driving a sword's short lunge was the
 * wrong motion at the wrong distance. Each family's attacker clip lives in its
 * own pack; the *victim* half stays shared in `criticals`, because the reaction
 * to being run through does not depend on what ran you through.
 *
 * The **backstab** is still shared, and that is a sourcing fact rather than a
 * choice: vanilla ships exactly one back-facing paired killmove and every
 * per-weapon killmove it has is a frontal finisher, which performed from behind
 * would read as nonsense. See the round-2 section of decision 0040.
 *
 * ## Timing, and what is measured versus carried over
 *
 * A two-handed swing is authored slower and longer than its one-handed
 * counterpart — 2.0 s against 1.3 s for the opening swing — so the action lock
 * comes from each clip's own duration rather than from a scaled one-handed
 * number. What is *carried over* is where in the clip the blade is cutting.
 *
 * The contact fractions below are **measured**, against each clip's own blade
 * length (1.42 m greatsword, 1.35 m battleaxe). They used to be the one-handed
 * windows copied across on the argument that the two-handed clips are
 * Bethesda's re-authoring of the same swings — a principled guess, and a wrong
 * one: a greatsword's opening swing contacts at 0.61-0.76 of its clip where a
 * sword's contacts at 0.37-0.47, because the two-handed wind-up is a much
 * larger share of a much longer animation.
 *
 * The measuring tool is trustworthy again (it had a non-idempotent world-matrix
 * build that made it measure a sword as nine centimetres long). Its correctness
 * check is that it reproduces the owner-calibrated one-handed LIGHT_1 and
 * LIGHT_2 windows to within a frame; on that basis these are its output, and
 * they are reproducible with:
 *
 *     node scripts/measure-contact-windows.mjs --blade 1.42 GREATSWORD_LIGHT_1 ...
 *     node scripts/measure-contact-windows.mjs --blade 1.35 GREATAXE_LIGHT_1 ...
 */

/**
 * Contact windows as clip fractions, from the measuring tool. Held here rather
 * than imported so re-measuring one set never disturbs the other.
 */
const CONTACT: Record<TwoHandedSwing, { start: number; end: number }> = {
  GREATSWORD_LIGHT_1: { start: 0.611, end: 0.762 },
  GREATSWORD_LIGHT_2: { start: 0.365, end: 0.418 },
  GREATSWORD_LIGHT_3: { start: 0.426, end: 0.507 },
  GREATSWORD_HEAVY: { start: 0.716, end: 0.848 },
  GREATSWORD_HEAVY_2: { start: 0.419, end: 0.486 },
  // The axe set shares LIGHT_1/LIGHT_2 with the greatsword clip-for-clip and
  // measures identically; its own three differ, and the heavy notably so — a
  // battleaxe's overhead lands very late in its swing.
  GREATAXE_LIGHT_1: { start: 0.611, end: 0.762 },
  GREATAXE_LIGHT_2: { start: 0.365, end: 0.418 },
  GREATAXE_LIGHT_3: { start: 0.430, end: 0.489 },
  GREATAXE_HEAVY: { start: 0.807, end: 0.930 },
  GREATAXE_HEAVY_2: { start: 0.419, end: 0.486 },
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

/**
 * Where a two-handed swing starts accepting the next input, as a fraction.
 *
 * Explicit here because the default — the contact wind-up — is measured, and
 * these clips are measured as connecting late: a greatsword's opening swing
 * contacts at 0.61 of its animation, so the default would have refused a press
 * made through the whole first half of a visible swing and then accepted one
 * made after the blade had landed. A quarter of the way in is where the
 * commitment is legible on screen, and it leaves the branch point (0.9)
 * untouched, so the chain's *cadence* is exactly what it was.
 */
const COMBO_QUEUE_OPEN_PROGRESS = 0.25;

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
    // Measured at the same 0.067 s — the raise is the same gesture — but held
    // for less. Parrying with something that takes two hands to swing should be
    // the committal option, and this is the number that says so.
    active: { start: 0.067, duration: 0.16 },
  },
  lightAttacks: ["GREATSWORD_LIGHT_1", "GREATSWORD_LIGHT_2", "GREATSWORD_LIGHT_3"],
  heavyAttacks: ["GREATSWORD_HEAVY", "GREATSWORD_HEAVY_2"],
  guardBreak: ONE_HANDED_ANIMATIONS.guardBreak,
  riposte: twoHandedRiposte("GREATSWORD_RIPOSTE", 0.9),
  backstab: ONE_HANDED_ANIMATIONS.backstab,
  equip: "GREATSWORD_EQUIP",
  unequip: "GREATSWORD_UNEQUIP",
};

/**
 * Carriage, locomotion, guard and draw are the blade set's; the swings and the
 * parry are its own.
 *
 * The parry used to be borrowed too, and it should not have been: Skyrim
 * authors the two-handed haft set (`2hw`) separately from the two-handed blade
 * set (`2hm`) precisely because an axe is not held or swung like a sword, and
 * the parry mod follows suit with its own 2HW block-bash. A battleaxe was
 * parrying with a greatsword's hands.
 */
export const GREATAXE_ANIMATIONS: WeaponAnimationProfile = {
  ...GREATSWORD_ANIMATIONS,
  combatIdle: "GREATAXE_IDLE",
  sprintOverride: "GREATAXE_SPRINT",
  lightAttacks: ["GREATAXE_LIGHT_1", "GREATAXE_LIGHT_2", "GREATAXE_LIGHT_3"],
  heavyAttacks: ["GREATAXE_HEAVY", "GREATAXE_HEAVY_2"],
  parry: {
    intro: "GREATAXE_PARRY",
    followThrough: "GREATAXE_PARRY_FOLLOW_THROUGH",
    active: { ...GREATSWORD_ANIMATIONS.parry.active },
  },
  riposte: twoHandedRiposte("GREATAXE_RIPOSTE", 1.4),
};

/**
 * A two-handed execution, built on the shared victim choreography.
 *
 * Only three things differ from the one-handed profile, and all three are
 * measured rather than chosen (`scripts/measure-contact-windows.mjs --critical`,
 * which is held to reproducing the hand-audited one-handed execution by
 * `critical-known-answer.test.mjs`):
 *
 *   - the attacker's clip;
 *   - `startingSeparation` — the furthest distance at which this weapon still
 *     drives its blade into a victim's chest on its own execution. A battleaxe
 *     stands 1.40 m off, because its execution is a long overhead; a greatsword
 *     stands at the same 0.90 m as a sword, because its execution is a close
 *     thrust.
 *
 *     The tool proposes and the visual scenario disposes. Its measurement is
 *     from a standing start, and how much of the remaining gap closes during
 *     the clip depends on that clip's own lunge — 0.15 m on the one-handed
 *     execution, 0.04 m on the greatsword's. So where its first candidate does
 *     not satisfy `riposteWeaponContact`, step in one notch of its own table
 *     and re-run the scenario. That is what happened here;
 *   - nothing else. The trims were chosen to put contact 0.400 s into every
 *     trimmed execution, exactly where the audited one-handed clip puts it, so
 *     `damageProgress` and the victim's entire timeline carry across unchanged.
 *
 * That last point is the reason this is three lines rather than a second copy
 * of the one-handed profile: the *pipeline* absorbed the per-clip difference by
 * trimming each execution to the same shape, so gameplay does not have to.
 */
function twoHandedRiposte(
  attackerAction: Extract<AnimationState, "GREATSWORD_RIPOSTE" | "GREATAXE_RIPOSTE">,
  startingSeparation: number,
): PairedCriticalProfile {
  return { ...ONE_HANDED_ANIMATIONS.riposte, attackerAction, startingSeparation };
}

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
  riposteAction: Extract<AnimationState, "GREATSWORD_RIPOSTE" | "GREATAXE_RIPOSTE">,
): Record<AttackId, AttackSpec> {
  const swing = (id: AttackId, animation: TwoHandedSwing, branch?: number) => ({
    ...REFERENCE_MOVESET[id],
    animation: animation as AnimationState,
    ...contactTiming(animation),
    comboQueueOpenProgress: COMBO_QUEUE_OPEN_PROGRESS,
    ...(branch === undefined ? {} : { comboBranchProgress: branch }),
  });
  return {
    ...REFERENCE_MOVESET,
    light1: swing("light1", lights[0], LIGHT_COMBO_BRANCH_PROGRESS),
    light2: swing("light2", lights[1], LIGHT_COMBO_BRANCH_PROGRESS),
    light3: swing("light3", lights[2], LIGHT_COMBO_BRANCH_PROGRESS),
    heavy: swing("heavy", heavies[0], LIGHT_COMBO_BRANCH_PROGRESS),
    heavy2: swing("heavy2", heavies[1]),
    // The attack *timing* is shared: every execution is trimmed to put contact
    // at the same point, so only the clip and the separation differ. The clip
    // has to be named in both places — the animation profile drives the paired
    // choreography, and this drives what the attacker actually plays.
    riposte: { ...REFERENCE_MOVESET.riposte, animation: riposteAction },
    backstab: REFERENCE_MOVESET.backstab,
  };
}

export const GREATSWORD_MOVESET = twoHandedMoveset(
  ["GREATSWORD_LIGHT_1", "GREATSWORD_LIGHT_2", "GREATSWORD_LIGHT_3"],
  ["GREATSWORD_HEAVY", "GREATSWORD_HEAVY_2"],
  "GREATSWORD_RIPOSTE",
);

export const GREATAXE_MOVESET = twoHandedMoveset(
  ["GREATAXE_LIGHT_1", "GREATAXE_LIGHT_2", "GREATAXE_LIGHT_3"],
  ["GREATAXE_HEAVY", "GREATAXE_HEAVY_2"],
  "GREATAXE_RIPOSTE",
);
