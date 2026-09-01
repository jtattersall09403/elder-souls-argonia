import { clipConfig, clipPlaybackDuration } from "../../anim/animationManifest";
import type { AnimationState } from "../../core/types";
import type { AttackId, AttackSpec, WeaponAnimationProfile } from "../types";

/**
 * The one-handed moveset: the sandbox's reference set of authored combat clips
 * and the gameplay timing measured from them.
 *
 * This is the *class* contract, not a weapon. Every one-handed weapon shares
 * it and its class profile scales the timings, reach and power, so a second
 * sword is data rather than another block of hand-audited numbers. Timings
 * that must agree with a clip are derived from the generated animation
 * manifest rather than retyped, so a pipeline reskin cannot silently
 * desynchronise gameplay from the motion.
 */

/**
 * Contact windows, measured rather than guessed.
 *
 * Each pair is the source-time fraction over which the blade is actually
 * sweeping through the reach zone in front of the actor, taken from the
 * production GLB with the corrected weapon grip and cross-checked two ways:
 * the contiguous above-threshold blade-tip sweep, and the interval in which
 * the blade capsule can reach a standing hurtbox 1.0-2.3 m ahead. The two
 * agree to within a frame on every swing.
 *
 * The previous split gave every light attack a flat 70% active window - 0.91s
 * of a 1.3s clip - so a swing connected during its wind-up and again through
 * its follow-through. The old heavy numbers were audited against the
 * mis-rotated grip this pass fixed, which is why they sat ~0.25s late.
 */
const CONTACT = {
  LIGHT_1: { start: 0.365, end: 0.475 },
  LIGHT_2: { start: 0.346, end: 0.423 },
  LIGHT_3: { start: 0.476, end: 0.774 },
  // HEAVY's window was closed roughly two thirds of the way through the visible
  // sweep, so the back half of a swing passed through a body without touching
  // it; it is still travelling from 0.54 to 0.75 of its clip, and that is the
  // interval a defender standing in front of the swing is inside it.
  HEAVY: { start: 0.543, end: 0.72 },
  // HEAVY_2's was hand-extended the same way and went too far: the owner
  // reported it as only becoming active right at the end of the swing. The
  // clip has three contact phases and the strike is the middle one, at 55 m/s
  // of tip speed against 23 and 16 for the wind-up flick and the settle. This
  // is that phase, from the measuring tool once it was taught to select the
  // *fastest* phase rather than the longest.
  HEAVY_2: { start: 0.470, end: 0.543 },
} as const;

/**
 * Tolerance added either side of the measured contact, as a clip fraction.
 * About one and a half fixed physics steps: enough that a rendered overlap is
 * still observable by combat on the following simulation callback.
 */
const CONTACT_MARGIN_FRACTION = 0.04;

/**
 * Where the chain may branch into its successor, as a fraction of the total
 * action. Deliberately separate from the contact window: the blade stops
 * cutting long before the body has finished the follow-through that the next
 * swing grows out of, and these preserve the chain timing the moveset and its
 * transition blends were tuned against.
 */
const LIGHT_COMBO_BRANCH_PROGRESS = 0.85;
const HEAVY_COMBO_BRANCH_PROGRESS = 0.98 / 1.35;

/** Split a total action lock around a measured contact window. */
function contactTiming(
  animation: Extract<AnimationState, "LIGHT_1" | "LIGHT_2" | "LIGHT_3" | "HEAVY" | "HEAVY_2">,
  total: number = clipConfig(animation).sourceDuration ?? 1.3,
) {
  const clip = clipConfig(animation).sourceDuration ?? total;
  const { start, end } = CONTACT[animation];
  const windup = clip * Math.max(0, start - CONTACT_MARGIN_FRACTION);
  const active = clip * (end - start + CONTACT_MARGIN_FRACTION * 2);
  return { windup, active, recovery: Math.max(0, total - windup - active) };
}

const RIPOSTE_CONFIG = clipConfig("RIPOSTE");
const RIPOSTE_SOURCE_START_TIME = RIPOSTE_CONFIG.playbackStartTime ?? 0;
const RIPOSTE_DURATION = clipPlaybackDuration("RIPOSTE") ?? 1.3;
// The packaged 4.1s execution is a three-hit sequence, but the game has one
// victim reaction. Production-rendered weapon geometry therefore selects its
// opening CQC02 lunge: contact/camera-shake occurs at source 0.5667s and the
// sword has visibly withdrawn by 0.70s. The later generic HitFrame belongs to
// a phase that begins with the blade already embedded in the victim.
const RIPOSTE_CONTACT_TIME = (0.5667 - RIPOSTE_SOURCE_START_TIME) / RIPOSTE_CONFIG.playbackRate;
const RIPOSTE_RELEASE_TIME = (0.7 - RIPOSTE_SOURCE_START_TIME) / RIPOSTE_CONFIG.playbackRate;
const BACKSTAB_DURATION = clipConfig("BACKSTAB").sourceDuration ?? 3.1667;
// Closest approach of the rendered blade to a victim torso at this critical's
// own authored pair separation, measured on the corrected-grip production rig.
const BACKSTAB_CONTACT_TIME = 1.5667;
const BACKSTAB_RELEASE_TIME = 2.2;
// Rim's sword-hit1 victim clip is trimmed to source frame 4 by the manifest,
// where its abdomen clutch begins immediately without HIT2's upright back
// arch. Preserve that exact source-time continuity through withdrawal.
const RIPOSTE_REACTION_ENTRY_TIME = 0;
// The early Knockdown frames stand up and telegraph before falling. Source
// frame 17 is the last grounded, back-driven entry into its rapid fall.
const RIPOSTE_DEATH_ENTRY_TIME = 0.5667;
// The paired victim source has a complete wounded recovery. Keep it until the
// late authored recoil; lethal executions alone hand off to the prone-ending
// death clip at this source time.
const BACKSTAB_OUTCOME_TIME = 2.9;

function criticalAttackTiming(duration: number, contactTime: number) {
  // Keep damage tightly around the visually audited blade contact, while the
  // complete authored critical continues through withdrawal and recovery.
  const active = 0.28;
  return { windup: contactTime, active, recovery: duration - contactTime - active };
}

export const ONE_HANDED_ANIMATIONS: WeaponAnimationProfile = {
  combatIdle: "SWORD_IDLE",
  sprintOverride: "SPRINT",
  // Sneaking with a blade drawn keeps it on guard. Separate from the shared
  // CROUCH_IDLE for the same reason SWORD_IDLE is separate from IDLE.
  crouchIdle: "SWORD_CROUCH_IDLE",
  guard: {
    enter: "GUARD_ENTER",
    loop: "GUARD",
    hitVariants: ["GUARD_HIT_A", "GUARD_HIT_B"],
  },
  parry: {
    intro: "PARRY",
    followThrough: "PARRY_FOLLOW_THROUGH",
    // Measured: the blade begins sweeping 0.067 s into the 0.2 s raise. The old
    // shared window opened at 0.10 and closed at 0.29, which spent most of its
    // length in the dead beat between the raise and the bash. Same 0.2 s of
    // generosity, now starting where the blade actually moves.
    active: { start: 0.067, duration: 0.2 },
  },
  lightAttacks: ["LIGHT_1", "LIGHT_2", "LIGHT_3"],
  heavyAttacks: ["HEAVY", "HEAVY_2"],
  guardBreak: "GUARD_BREAK",
  riposte: {
    attackerAction: "RIPOSTE",
    victimAction: "RIPOSTED_HIT1",
    entryBlendDuration: 0.18,
    // The selected single-hit phase dispatches its victim response from the
    // attacker's rendered CQC02 blade contact at source 0.5667s. Until then,
    // preserve a readable standing guard-break pose.
    victimActionStartProgress: RIPOSTE_CONTACT_TIME / RIPOSTE_DURATION,
    victimActionStartAt: RIPOSTE_REACTION_ENTRY_TIME,
    victimLeadIn: { action: "GUARD_BREAK", holdTime: 0.55 },
    victimRecovery: {
      action: "RIPOSTED_HIT1",
      // Outcome ownership transfers on contact. The action is already
      // playing and therefore is not restarted; zero is also the correct
      // fallback if a future command mismatch ever requires an explicit
      // recovery entry at that same contact boundary.
      startAt: RIPOSTE_REACTION_ENTRY_TIME,
    },
    victimDeath: {
      action: "CRITICAL_DEATH",
      startAt: RIPOSTE_DEATH_ENTRY_TIME,
      crossFadeDuration: 0.1,
    },
    // Resolve lethal/nonlethal ownership on the actual blade contact. A
    // lethal victim goes directly from the held vulnerable pose into the
    // trimmed fall; delaying this until withdrawal recreated the visible
    // pause and upright reversal reported in playtesting.
    victimOutcomeProgress: RIPOSTE_CONTACT_TIME / RIPOSTE_DURATION,
    // Where the authored lunge actually reaches. Swept on the production rig
    // with the corrected grip: at 0.90 m the blade closes to 0.16 m of a
    // victim torso exactly on the source's own 0.5667 s contact annotation,
    // never comes within 0.32 m before it, and is 0.79 m clear again by the
    // authored 0.70 s withdrawal. Closer than this the blade is already
    // beside the victim during the entry blend, which reads as a hit that
    // never lands. The previous 1.45 m was tuned while the weapon was
    // mounted 90 degrees out of true and left the execution swinging air.
    startingSeparation: 0.9,
    relativeFacing: Math.PI,
    alignmentAnchor: "victim",
    damageProgress: RIPOSTE_CONTACT_TIME / RIPOSTE_DURATION,
    releaseProgress: RIPOSTE_RELEASE_TIME / RIPOSTE_DURATION,
    rootMotionPolicy: "controller-aligned-strip-horizontal",
  },
  backstab: {
    attackerAction: "BACKSTAB",
    victimAction: "BACKSTABBED",
    entryBlendDuration: 0.24,
    victimActionStartProgress: 0,
    victimActionStartAt: 0,
    victimRecovery: {
      action: "BACKSTABBED",
      startAt: BACKSTAB_OUTCOME_TIME,
    },
    victimDeath: {
      action: "CRITICAL_DEATH",
      startAt: 0,
      // The paired backstab leaves its victim bent and wounded while the
      // death clip opens standing, so this is a large authored pose distance
      // and the blend is the only thing spreading it. At 0.35 s it stepped
      // the free arm 0.22 m and 26 degrees in a single frame; the longer
      // blend keeps every bone inside the scenario's transition bounds.
      // Entering the fall later instead is not an option here: the backstab
      // contract requires the death to start from source zero.
      crossFadeDuration: 0.55,
    },
    // Physical alignment releases at blade withdrawal, but both outcomes
    // preserve the paired victim performance until its late wounded recoil.
    // Nonlethal playback keeps that same action through its authored end;
    // lethal playback then blends into the prone-ending death source.
    victimOutcomeProgress: BACKSTAB_OUTCOME_TIME / BACKSTAB_DURATION,
    // paired HKX group offset: 56.062 Skyrim units * 0.1 import scale
    // * 0.15356 runtime character scale = 0.8609 metres.
    startingSeparation: 0.861,
    relativeFacing: 0,
    alignmentAnchor: "victim",
    damageProgress: BACKSTAB_CONTACT_TIME / BACKSTAB_DURATION,
    releaseProgress: BACKSTAB_RELEASE_TIME / BACKSTAB_DURATION,
    rootMotionPolicy: "controller-aligned-strip-horizontal",
  },
  equip: "EQUIP",
  unequip: "UNEQUIP",
};

export const REFERENCE_MOVESET: Record<AttackId, AttackSpec> = {
  light1: {
    id: "light1",
    animation: "LIGHT_1",
    motionValue: 1,
    stamina: 22,
    ...contactTiming("LIGHT_1"),
    comboBranchProgress: LIGHT_COMBO_BRANCH_PROGRESS,
    range: 2.05,
    arc: 1.4,
    lunge: 1.45,
    hitStop: 0.055,
  },
  light2: {
    id: "light2",
    animation: "LIGHT_2",
    motionValue: 1.21,
    stamina: 24,
    ...contactTiming("LIGHT_2"),
    comboBranchProgress: LIGHT_COMBO_BRANCH_PROGRESS,
    range: 2.15,
    arc: 1.28,
    lunge: 1.6,
    hitStop: 0.065,
  },
  light3: {
    id: "light3",
    animation: "LIGHT_3",
    motionValue: 1.42,
    stamina: 26,
    ...contactTiming("LIGHT_3"),
    comboBranchProgress: LIGHT_COMBO_BRANCH_PROGRESS,
    range: 2.2,
    arc: 0.82,
    lunge: 1.85,
    hitStop: 0.075,
  },
  heavy: {
    id: "heavy",
    animation: "HEAVY",
    motionValue: 1.88,
    stamina: 45,
    // Total action lock stays 1.35s; only the split around contact moved.
    ...contactTiming("HEAVY", 1.35),
    comboBranchProgress: HEAVY_COMBO_BRANCH_PROGRESS,
    range: 2.3,
    arc: 1.05,
    lunge: 1.85,
    hitStop: 0.085,
  },
  heavy2: {
    id: "heavy2",
    animation: "HEAVY_2",
    motionValue: 2.42,
    stamina: 48,
    // Total action lock stays 1.51s; only the split around contact moved.
    ...contactTiming("HEAVY_2", 1.51),
    range: 2.4,
    arc: 0.92,
    lunge: 1.7,
    hitStop: 0.1,
  },
  riposte: {
    id: "riposte",
    animation: "RIPOSTE",
    motionValue: 2,
    stamina: 0,
    ...criticalAttackTiming(RIPOSTE_DURATION, RIPOSTE_CONTACT_TIME),
    range: 1.65,
    arc: 0.55,
    lunge: 1.1,
    hitStop: 0.13,
  },
  backstab: {
    id: "backstab",
    animation: "BACKSTAB",
    motionValue: 2,
    stamina: 0,
    ...criticalAttackTiming(BACKSTAB_DURATION, BACKSTAB_CONTACT_TIME),
    range: 1.75,
    arc: 0.45,
    lunge: 0,
    hitStop: 0.14,
  },
};
