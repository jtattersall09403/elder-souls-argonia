/**
 * How an action's clock maps onto its clip.
 *
 * A weapon class plays its moveset's authored clips faster or slower than
 * authored (`WeaponClassProfile.speedScale`), and a class may speed the swing
 * without touching the wind-up the player reads (`swingSpeedScale`). So the
 * map from action seconds to authored clip seconds is two straight segments,
 * split where the wind-up ends: the wind-up plays at one scale, everything
 * from the first frame of the swing at another. One scale for both is the
 * ordinary case (every locomotion clip, every unscaled action).
 *
 * "Authored clip seconds" are the seconds the attack's timing was measured in
 * (the clip at its manifest `playbackRate`); a caller multiplies by
 * `playbackRate` to reach source time. The renderer (`SkyrimFighter`), the
 * clip-fraction events (`combat/weapon` `attackProgressTime`) and the reach
 * bake read the pose through these two functions. Foot-driven attack motion
 * (`locomotion/footAnchoredMotion`) does not yet: it reads the ground track at
 * action seconds × playbackRate, so the feet slide by the class's speed error
 * (polish backlog, "Combat: foot-driven attack motion").
 */

export type ClipTiming = {
  /** Action seconds per authored second through the wind-up. */
  windupScale: number;
  /** Action seconds per authored second from the first frame of the swing. */
  swingScale: number;
  /** Action seconds at which the swing begins: the (scaled) wind-up. */
  swingFrom: number;
};

/** An attack's per-phase scales, as `scaleAttack` sets them (1/1 when unscaled). */
export type AttackTimeScale = { windup: number; swing: number };

export const UNIT_CLIP_TIMING: ClipTiming = Object.freeze({ windupScale: 1, swingScale: 1, swingFrom: Infinity });

/** One scale for the whole clip. */
export function uniformClipTiming(scale: number): ClipTiming {
  return scale === 1 ? UNIT_CLIP_TIMING : { windupScale: scale, swingScale: scale, swingFrom: Infinity };
}

/** The clip timing an attack plays with. */
export function attackClipTiming(attack: { windup: number; timeScale?: AttackTimeScale }): ClipTiming {
  const scale = attack.timeScale;
  if (!scale) return UNIT_CLIP_TIMING;
  if (scale.windup === scale.swing) return uniformClipTiming(scale.windup);
  return { windupScale: scale.windup || 1, swingScale: scale.swing || 1, swingFrom: attack.windup };
}

/** Authored clip seconds reached at `actionSeconds` into the action. */
export function clipSecondsAt(actionSeconds: number, timing: ClipTiming): number {
  if (actionSeconds <= timing.swingFrom) return actionSeconds / timing.windupScale;
  return timing.swingFrom / timing.windupScale + (actionSeconds - timing.swingFrom) / timing.swingScale;
}

/** The inverse: action seconds at which the clip reaches `clipSeconds`. */
export function actionSecondsAt(clipSeconds: number, timing: ClipTiming): number {
  const swingClipFrom = timing.swingFrom / timing.windupScale;
  if (clipSeconds <= swingClipFrom) return clipSeconds * timing.windupScale;
  return timing.swingFrom + (clipSeconds - swingClipFrom) * timing.swingScale;
}
