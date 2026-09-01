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
 * The **backstab** is per family too, assembled rather than paired — see
 * `twoHandedBackstab` for why vanilla cannot supply one and what is used
 * instead.
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
 * one: the two-handed wind-up is a much larger share of a much longer
 * animation, so the windows are genuinely different.
 *
 * They also used to be *later* than they are now — LIGHT_1 at 0.61-0.76 rather
 * than 0.41-0.48 — because the tool selected the longest contact phase in a
 * clip and a two-handed strike-then-settle has a longer settle than strike.
 * Selecting the fastest phase instead fixed the owner-reported "the hitbox
 * only appears once the swing is over" on LIGHT_1 and HEAVY in both sets, and
 * left every window the owner had already approved untouched. See
 * `fastestPhase` in the tool.
 *
 * The measuring tool is trustworthy (it once had a non-idempotent world-matrix
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
  GREATSWORD_LIGHT_1: { start: 0.410, end: 0.480 },
  GREATSWORD_LIGHT_2: { start: 0.365, end: 0.418 },
  GREATSWORD_LIGHT_3: { start: 0.426, end: 0.507 },
  GREATSWORD_HEAVY: { start: 0.420, end: 0.466 },
  GREATSWORD_HEAVY_2: { start: 0.419, end: 0.486 },
  // The axe set shares LIGHT_1/LIGHT_2 with the greatsword clip-for-clip and
  // measures within a frame of it; its own three differ.
  GREATAXE_LIGHT_1: { start: 0.414, end: 0.480 },
  GREATAXE_LIGHT_2: { start: 0.365, end: 0.418 },
  GREATAXE_LIGHT_3: { start: 0.430, end: 0.489 },
  GREATAXE_HEAVY: { start: 0.467, end: 0.520 },
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
    // Measured across the pair (`--parry --socket Weapon --reach 0.9`). The
    // old 0.067 s was taken from inside `GREATSWORD_PARRY`, which is 0.233 s of
    // *raise*: the catch opened and closed before the blade had begun to move
    // across the body. The blade sweeps out from 0.31 m to 0.86 m ahead of the
    // chest between 0.475 s and 0.700 s of the pair, and that is the catch.
    //
    // Held for 0.16 s rather than the one-handed 0.2 s. Parrying with something
    // that takes two hands to swing should be the committal option, and this is
    // the number that says so.
    active: { start: 0.475, duration: 0.16 },
  },
  lightAttacks: ["GREATSWORD_LIGHT_1", "GREATSWORD_LIGHT_2", "GREATSWORD_LIGHT_3"],
  heavyAttacks: ["GREATSWORD_HEAVY", "GREATSWORD_HEAVY_2"],
  guardBreak: ONE_HANDED_ANIMATIONS.guardBreak,
  riposte: twoHandedRiposte("GREATSWORD_RIPOSTE", 0.9),
  backstab: twoHandedBackstab("GREATSWORD_RIPOSTE", 0.9),
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
    // Its own window, not the blade set's: the haft parry is a different
    // gesture with a different clip length. Measured over the pair, the axe is
    // *presented* between 0.075 s and 0.200 s — reaching its most-forward
    // 0.94 m at 0.22 s, still on the way up — and then sweeps across the front
    // from 0.242 s to 0.317 s. The sweep is the catch; the presentation is the
    // wind-up, which is exactly what the old shared 0.067 s window was
    // catching with.
    active: { start: 0.235, duration: 0.16 },
  },
  riposte: twoHandedRiposte("GREATAXE_RIPOSTE", 1.4),
  backstab: twoHandedBackstab("GREATAXE_RIPOSTE", 1.4),
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
  attackerAction: TwoHandedExecution,
  startingSeparation: number,
): PairedCriticalProfile {
  return { ...ONE_HANDED_ANIMATIONS.riposte, attackerAction, startingSeparation };
}

type TwoHandedExecution = Extract<AnimationState, "GREATSWORD_RIPOSTE" | "GREATAXE_RIPOSTE">;

/**
 * A two-handed backstab, built from the same parts as its riposte.
 *
 * The one-handed backstab is a genuine paired clip — both roles authored
 * together — and vanilla has exactly two of those facing backwards, both
 * one-handed (`paired_1hmkillmovebackstab` and the sneak throat-slit
 * `paired_1hmsneakkillbacka`). There is no two-handed equivalent, and the
 * per-weapon killmoves that do exist are frontal finishers that would read as
 * nonsense performed from behind.
 *
 * So this is assembled the way the executions are, which is the construction
 * the parry mod is built around anyway: the attacker plays *its own weapon's*
 * execution — which is the whole point, and what makes the critical
 * weapon-specific — and the victim plays an independent reaction to being hit
 * from behind. The victim half is deliberately shared: what being run through
 * from behind does to you does not depend on what did it.
 *
 * `relativeFacing: 0` is the difference from the riposte. Both actors face the
 * same way, because the attacker is behind.
 */
function twoHandedBackstab(
  attackerAction: TwoHandedExecution,
  startingSeparation: number,
): PairedCriticalProfile {
  const riposte = ONE_HANDED_ANIMATIONS.riposte;
  return {
    ...riposte,
    attackerAction,
    startingSeparation,
    relativeFacing: 0,
    victimAction: "BACKSTABBED_FORWARD",
    // No held guard-break: a victim who is being stabbed in the back never saw
    // it coming, which is the whole difference between this and a riposte.
    victimLeadIn: undefined,
    victimActionStartProgress: riposte.damageProgress,
    victimActionStartAt: 0,
    victimRecovery: { action: "BACKSTABBED_FORWARD", startAt: 0 },
  };
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
    // Same clip, entered from behind — so the same *timing* as the riposte,
    // not the one-handed backstab's.
    //
    // This was `{ ...REFERENCE_MOVESET.backstab, animation: riposteAction }`,
    // which swapped the clip but kept the timing of the clip it replaced: the
    // one-handed backstab is a 3.17 s paired performance and a trimmed
    // execution is 1.13 s. The result was a swing that finished in the first
    // third of its own action with the contact window opening at the halfway
    // point, which is precisely the reported "the sword visibly connects but it
    // doesn't count". Reach, power and cost are still the backstab's.
    backstab: {
      ...REFERENCE_MOVESET.backstab,
      animation: riposteAction,
      windup: REFERENCE_MOVESET.riposte.windup,
      active: REFERENCE_MOVESET.riposte.active,
      recovery: REFERENCE_MOVESET.riposte.recovery,
    },
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
