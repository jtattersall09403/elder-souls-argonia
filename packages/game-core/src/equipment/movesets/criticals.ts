import { clipConfig, clipPlaybackDuration } from "../../anim/animationManifest";
import type { AttackSpec, PairedCriticalProfile, WeaponAnimationProfile, WeaponDefinition } from "../types";
import { ONE_HANDED_ANIMATIONS } from "./oneHanded";

/**
 * How a weapon finishes somebody, when there is no clip of it doing so.
 *
 * Vanilla has exactly two back-facing paired criticals and both are one-handed
 * thrusts. Every other weapon's backstab therefore has to be *assembled*: the
 * attacker plays a clip it owns, and the victim plays an independent reaction
 * to being hit from behind (`BACKSTABBED_FORWARD`, deliberately shared — what
 * being run through from behind does to you does not depend on what did it).
 *
 * The question is which attacker clip, and the answer is not the same for every
 * weapon, because **an axe has no point**. Driving the one-handed thrust with a
 * war axe in hand renders as burying a blade that does not exist into a back;
 * driving a greatsword's execution with a battleaxe does the same at twice the
 * size. Both were reported from playtesting in those terms.
 *
 * So a class declares a `criticalStyle`:
 *
 *   - **thrust** — swords, daggers and spears, which have a point and whose
 *     authored executions are thrusts. These use the paired or trimmed
 *     execution clip, which is the better-looking option where it is honest.
 *   - **swing** — axes, maces, hammers and halberds. These play the weapon's
 *     own opening light attack from behind. It is not a bespoke killmove and it
 *     does not pretend to be; it is the motion that weapon actually makes, and
 *     the critical reads through the victim's reaction and the damage rather
 *     than through a special clip we do not have and will not make.
 *
 * A swing critical's numbers are not new measurements. Its contact is the light
 * attack's *own* measured contact window, which is the point of building it out
 * of a real swing: `damageProgress` lands where the blade is already known to
 * be cutting. Only the separation had to be measured, and it is 1.10 m for both
 * families:
 *
 *     node scripts/measure-contact-windows.mjs --critical --facing 0 \
 *       --weapon steel-waraxe --victim-clip SWORD_IDLE --victim-time 0 \
 *       --window 0.350,0.469 LIGHT_1
 */
export type CriticalStyle = "thrust" | "swing";

/**
 * Where the two actors stand for an assembled swing critical, in metres.
 *
 * Measured identically for the one-handed and two-handed light attacks: the
 * furthest apart at which the swing still passes within the visual gate's
 * limit of the victim's spine *during its measured contact window*. Restricting
 * the search to that window matters — over the whole clip the battleaxe's slow
 * settle comes closer than its strike does, and the tool duly recommended
 * standing far enough back that the blade never touched anything.
 */
const SWING_BACKSTAB_SEPARATION = 1.1;

/**
 * A riposte stands closer than a backstab does, because its victim is doubled
 * over in a held guard-break facing the attacker rather than standing upright
 * facing away — which puts its spine somewhere else entirely. Measured the same
 * way: `--critical --victim-clip GUARD_BREAK --victim-time 0.55 --window` over
 * the swing's own contact window.
 */
const SWING_RIPOSTE_SEPARATION = 0.8;

/** The victim's half of any assembled from-behind critical. */
const BACKSTAB_VICTIM = {
  victimAction: "BACKSTABBED_FORWARD",
  // A victim who is being hit in the back never saw it coming, which is the
  // whole difference between this and a riposte: no held guard-break lead-in.
  victimLeadIn: undefined,
  victimActionStartAt: 0,
  victimRecovery: { action: "BACKSTABBED_FORWARD" as const, startAt: 0 },
} as const;

/**
 * A backstab the attacker performs with its own light attack.
 *
 * `lightAttack` is the moveset's opening swing — both its spec (for the timing)
 * and its animation. Everything derives from that swing's already-measured
 * contact window, so this stays correct through a re-measure or a reskin
 * without a second set of hand-audited numbers.
 */
export function swingBackstab(lightAttack: AttackSpec): PairedCriticalProfile {
  const { damageProgress, releaseProgress } = swingCriticalContact(lightAttack);
  const riposte = ONE_HANDED_ANIMATIONS.riposte;
  return {
    ...riposte,
    ...BACKSTAB_VICTIM,
    attackerAction: lightAttack.animation,
    // The swing is its own anticipation, so the entry blend only has to cover
    // the step onto the paired anchor rather than a pose change as well.
    entryBlendDuration: 0.18,
    victimActionStartProgress: damageProgress,
    startingSeparation: SWING_BACKSTAB_SEPARATION,
    // Both actors face the same way: the attacker is behind.
    relativeFacing: 0,
    damageProgress,
    releaseProgress,
    victimOutcomeProgress: damageProgress,
    victimDeath: { ...riposte.victimDeath, startAt: 0, crossFadeDuration: 0.35 },
  };
}

/**
 * The attack spec a swing critical runs on: the light attack's timing, with the
 * critical's power and commitment. Used by both the riposte and the backstab.
 *
 * Timing has to come from the swing, because `damageProgress` above is a
 * fraction of *this* duration and the two must describe the same performance.
 * Reach, lunge and cost come from the critical, because it is one — the actors
 * are already aligned, so a lunge would push them apart.
 */
export function swingCriticalAttack(lightAttack: AttackSpec, critical: AttackSpec): AttackSpec {
  return {
    ...critical,
    animation: lightAttack.animation,
    windup: lightAttack.windup,
    active: lightAttack.active,
    recovery: lightAttack.recovery,
    timeScale: lightAttack.timeScale,
    lunge: 0,
  };
}

/**
 * A riposte the attacker performs with its own light attack.
 *
 * Same construction as `swingBackstab` and the same reason — an axe has no
 * point — but face to face, so the victim's half stays the riposte's own held
 * guard-break and reaction rather than a blow from behind.
 *
 * A substitute rather than a preference. Rim's 2HW execution contains no chop
 * that lands: its only two phases that bring the head within reach of a torso
 * are forward drives (52% and 47% of their travel along the attacker's facing),
 * and its one genuine overhead never comes closer than 0.72 m to a victim at
 * any separation, because it is the wind-up and not the strike. Established by
 * auditioning all six executions and classifying every contact phase by the
 * direction the weapon tip travels (`pipeline.audition`, `MEASURE_SHAPE=1`).
 * There is no authored battleaxe chop to ship, so the weapon's own swing is the
 * honest stand-in — exactly as it is for the backstab.
 */
export function swingRiposte(lightAttack: AttackSpec): PairedCriticalProfile {
  const riposte = ONE_HANDED_ANIMATIONS.riposte;
  const { damageProgress, releaseProgress } = swingCriticalContact(lightAttack);
  return {
    ...riposte,
    attackerAction: lightAttack.animation,
    entryBlendDuration: 0.18,
    startingSeparation: SWING_RIPOSTE_SEPARATION,
    damageProgress,
    releaseProgress,
    // The victim keeps its held guard-break until the swing actually arrives,
    // which is the rule the authored executions follow too. Only the moment
    // differs, because this swing's contact is its own measured window rather
    // than an authored annotation.
    victimActionStartProgress: damageProgress,
    victimOutcomeProgress: damageProgress,
  };
}

/**
 * When a swing critical lands, as fractions of its action.
 *
 * The **middle** of the contact window, not its start. A critical deals its
 * damage on one frame and the visual gate checks the blade against the victim's
 * spine on exactly that frame, so it has to be the moment the swing is deepest
 * rather than the moment it first becomes dangerous. Taking the start put the
 * battleaxe's damage 0.13 s before its head arrived, with the axe still 1.36 m
 * from the victim — a critical that dealt its damage into the air.
 *
 * The midpoint is a property of the measured window rather than a second
 * measurement to keep in step, and it lands within a frame or two of the
 * measured closest approach on both families: 0.410 against 0.388 one-handed,
 * 0.447 against 0.439 two-handed.
 */
function swingCriticalContact(lightAttack: AttackSpec) {
  const total = lightAttack.windup + lightAttack.active + lightAttack.recovery;
  return {
    damageProgress: (lightAttack.windup + lightAttack.active / 2) / total,
    releaseProgress: (lightAttack.windup + lightAttack.active) / total,
  };
}

/**
 * Apply a class's critical style to a moveset's animation profile.
 *
 * A thrusting class keeps its authored executions. A swinging class performs
 * both criticals with its own opening light attack, because the executions
 * available to it are all thrusts and it has nothing to thrust with.
 */
export function applyCriticalStyle(
  animations: WeaponAnimationProfile,
  attacks: Record<"light1", AttackSpec>,
  style: CriticalStyle,
): WeaponAnimationProfile {
  if (style === "thrust") return animations;
  return {
    ...animations,
    riposte: swingRiposte(attacks.light1),
    backstab: swingBackstab(attacks.light1),
  };
}

/**
 * The stabbing riposte for daggers.
 *
 * The authored one-handed execution (`RIPOSTE`, Rim's CQC02) is a lunge and
 * stays on the sword (owner 2026-09-05); Rim's dagger execution contains one
 * clean forward thrust, isolated by the round-5 audition at source
 * 2.165-3.298 s with the strike at 2.432 s. It ships as `RIPOSTE_STAB` on the
 * dagger class; the victim's half is unchanged, because being run through
 * does not depend on the clip that did it.
 *
 * Every number here is from that measurement: separation 0.8 m, entry blend
 * 0.24 s (the blade sweeps while the pair is still closing), and the exit
 * cross-fade of 0.36 s lives on the clip config.
 */
const RIPOSTE_STAB_SOURCE_STRIKE_TIME = 2.432;
const RIPOSTE_STAB_SEPARATION = 0.8;
const RIPOSTE_STAB_ENTRY_BLEND = 0.24;
/** The point is withdrawn this long after it lands. */
const RIPOSTE_STAB_RELEASE_AFTER_STRIKE = 0.15;

function stabRiposteTiming() {
  const config = clipConfig("RIPOSTE_STAB");
  const start = config.playbackStartTime ?? 0;
  const rate = config.playbackRate || 1;
  const duration = clipPlaybackDuration("RIPOSTE_STAB") ?? 1.133;
  const contact = (RIPOSTE_STAB_SOURCE_STRIKE_TIME - start) / rate;
  return {
    duration,
    contact,
    release: Math.min(duration, contact + RIPOSTE_STAB_RELEASE_AFTER_STRIKE),
  };
}

export function stabRiposte(base: PairedCriticalProfile): PairedCriticalProfile {
  const { duration, contact, release } = stabRiposteTiming();
  return {
    ...base,
    attackerAction: "RIPOSTE_STAB",
    entryBlendDuration: RIPOSTE_STAB_ENTRY_BLEND,
    startingSeparation: RIPOSTE_STAB_SEPARATION,
    victimActionStartProgress: contact / duration,
    victimOutcomeProgress: contact / duration,
    damageProgress: contact / duration,
    releaseProgress: release / duration,
  };
}

export function stabRiposteAttack<A extends AttackSpec>(base: A): A {
  const { duration, contact } = stabRiposteTiming();
  const active = 0.28;
  return {
    ...base,
    animation: "RIPOSTE_STAB",
    windup: contact,
    active,
    recovery: Math.max(0, duration - contact - active),
  };
}

/**
 * A weapon with the stabbing riposte in place of the authored lunge. Only
 * meaningful for a weapon that ripostes with `RIPOSTE`; anything else is
 * returned as is.
 */
export function withStabRiposte<W extends WeaponDefinition>(weapon: W): W {
  if (weapon.animations.riposte.attackerAction !== "RIPOSTE") return weapon;
  return {
    ...weapon,
    attacks: { ...weapon.attacks, riposte: stabRiposteAttack(weapon.attacks.riposte) },
    animations: { ...weapon.animations, riposte: stabRiposte(weapon.animations.riposte) },
  };
}

/** The clip a swing critical plays, for provenance checks and tests. */
export function swingCriticalClipDuration(lightAttack: AttackSpec) {
  return clipConfig(lightAttack.animation).sourceDuration ?? null;
}
