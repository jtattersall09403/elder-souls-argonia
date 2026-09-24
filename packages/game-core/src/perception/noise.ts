/**
 * Noise: how loud a player event is, and how much of it an observer hears.
 *
 * Decision 0092 §3. The runtime reports the loudest event of the frame; each
 * observer hears loudness × a linear falloff to nothing at the radius, and
 * `detection.stepAwareness` turns what it heard into suspicion. Loudness is
 * 0-1; the numbers are the lane's proving values for Phase 10c to tune.
 */

export type NoiseEvent =
  | "walk"
  | "walkSneaking"
  | "run"
  | "sprint"
  | "jumpLanding"
  | "roll"
  | "attackSwing"
  | "blockHit";

export const NOISE_LOUDNESS: Readonly<Record<NoiseEvent, number>> = {
  walk: 0.25,
  walkSneaking: 0.05,
  run: 0.45,
  sprint: 0.6,
  jumpLanding: 0.7,
  roll: 0.5,
  attackSwing: 0.8,
  blockHit: 0.9,
};

/** Metres at which any noise has fallen to nothing. */
export const NOISE_RADIUS_METRES = 15;

/** What an observer `distanceMetres` away hears of a noise. Pure. */
export function noiseHeard(loudness: number, distanceMetres: number, radiusMetres = NOISE_RADIUS_METRES): number {
  return loudness * Math.max(0, 1 - distanceMetres / radiusMetres);
}
