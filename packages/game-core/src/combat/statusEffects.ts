/**
 * Damage a blow leaves behind it.
 *
 * A weapon class says what it inflicts (`equipment/types.WeaponClassEffect`);
 * this file is the only place that holds *live* after-effects on an actor and
 * ticks them down. Kept separate from `resolveHit` on purpose: resolving a hit
 * is instantaneous and pure, while a bleed is a small clock that belongs to the
 * defender and outlives the swing.
 *
 * Pure throughout — every function returns a new array — so the same rules can
 * serve the sandbox's mutable fighters and, later, a server-authoritative or
 * replayable combat step without a second implementation.
 */

/** One after-effect being applied by a blow that just landed. */
export type StatusEffectApplication = {
  kind: "bleed";
  /** Total extra health damage, dealt evenly over `seconds`. */
  totalDamage: number;
  seconds: number;
};

/** An application that is running on an actor. */
export type ActiveStatusEffect = StatusEffectApplication & { remainingSeconds: number };

/**
 * Add applications to an actor's stack. Entries *stack*: two axe hits run two
 * bleeds side by side, each on its own clock, rather than one refreshing the
 * other. Stacking is the honest reading of "more wounds bleed more", and it is
 * also the shape a later cap or resistance can be applied to.
 */
export function applyStatusEffects(
  active: ActiveStatusEffect[],
  applied: readonly StatusEffectApplication[],
): ActiveStatusEffect[] {
  if (applied.length === 0) return active.slice();
  return [
    ...active,
    ...applied.map((effect) => ({ ...effect, remainingSeconds: effect.seconds })),
  ];
}

/**
 * Advance every running effect by `delta` seconds.
 *
 * Damage is paid out in proportion to the time actually consumed, so a frame
 * that runs past the end of an effect pays only the remainder and never more
 * than the application's `totalDamage`. Effects that finish drop out.
 */
/**
 * Below this many seconds an effect is finished. Accumulated float error over
 * hundreds of frames leaves a duration a fraction of a nanosecond short of
 * zero; without this an expired bleed would sit on the actor for ever, paying
 * out nothing.
 */
const EFFECT_END_EPSILON = 1e-9;

export function tickStatusEffects(
  active: ActiveStatusEffect[],
  delta: number,
): { active: ActiveStatusEffect[]; damage: number } {
  const dt = Math.max(0, delta);
  let damage = 0;
  const next: ActiveStatusEffect[] = [];
  for (const effect of active) {
    if (effect.seconds <= 0 || effect.remainingSeconds <= EFFECT_END_EPSILON) continue;
    const consumed = Math.min(dt, effect.remainingSeconds);
    damage += effect.totalDamage * (consumed / effect.seconds);
    const remainingSeconds = effect.remainingSeconds - consumed;
    if (remainingSeconds > EFFECT_END_EPSILON) next.push({ ...effect, remainingSeconds });
  }
  return { active: next, damage };
}
