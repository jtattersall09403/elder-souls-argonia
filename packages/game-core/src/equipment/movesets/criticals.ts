import { clipConfig } from "../../anim/animationManifest";
import type { AttackSpec, PairedCriticalProfile, WeaponAnimationProfile } from "../types";
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
const SWING_CRITICAL_SEPARATION = 1.1;

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
  const total = lightAttack.windup + lightAttack.active + lightAttack.recovery;
  const damageProgress = lightAttack.windup / total;
  const releaseProgress = (lightAttack.windup + lightAttack.active) / total;
  const riposte = ONE_HANDED_ANIMATIONS.riposte;
  return {
    ...riposte,
    ...BACKSTAB_VICTIM,
    attackerAction: lightAttack.animation,
    // The swing is its own anticipation, so the entry blend only has to cover
    // the step onto the paired anchor rather than a pose change as well.
    entryBlendDuration: 0.18,
    victimActionStartProgress: damageProgress,
    startingSeparation: SWING_CRITICAL_SEPARATION,
    // Both actors face the same way: the attacker is behind.
    relativeFacing: 0,
    damageProgress,
    releaseProgress,
    victimOutcomeProgress: damageProgress,
    victimDeath: { ...riposte.victimDeath, startAt: 0, crossFadeDuration: 0.35 },
  };
}

/**
 * The attack spec a swing backstab runs on: the light attack's timing, with the
 * critical's power and commitment.
 *
 * Timing has to come from the swing, because `damageProgress` above is a
 * fraction of *this* duration and the two must describe the same performance.
 * Reach, lunge and cost come from the critical, because it is one — the actors
 * are already aligned, so a lunge would push them apart.
 */
export function swingBackstabAttack(lightAttack: AttackSpec, backstab: AttackSpec): AttackSpec {
  return {
    ...backstab,
    animation: lightAttack.animation,
    windup: lightAttack.windup,
    active: lightAttack.active,
    recovery: lightAttack.recovery,
    timeScale: lightAttack.timeScale,
    lunge: 0,
  };
}

/**
 * Apply a class's critical style to a moveset's animation profile.
 *
 * Only the backstab varies today. The riposte does not, because every family
 * has an authored execution of its own that is honest for that weapon.
 */
export function applyCriticalStyle(
  animations: WeaponAnimationProfile,
  attacks: Record<"light1", AttackSpec>,
  style: CriticalStyle,
): WeaponAnimationProfile {
  if (style === "thrust") return animations;
  return { ...animations, backstab: swingBackstab(attacks.light1) };
}

/** The clip a swing critical plays, for provenance checks and tests. */
export function swingCriticalClipDuration(lightAttack: AttackSpec) {
  return clipConfig(lightAttack.animation).sourceDuration ?? null;
}
