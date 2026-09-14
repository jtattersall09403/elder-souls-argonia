/**
 * Moon-driven tide and seasonal water level — world state on a calendar,
 * never scaled to the player (module 55 §95, module 50 §36).
 *
 * The two moons' phases set spring/neap amplitude (aligned full/new = spring
 * tides, quarters = neap); the level itself runs on the canonical semidiurnal
 * period. Deterministic in world-clock epoch minutes so renderer, gameplay
 * and probes agree.
 */

import { MOONS, moonAt } from "@elder-souls/world-time";

/** Semidiurnal tidal period in world minutes (12.42 h, Earth-canon shape). */
export const SEMIDIURNAL_MINUTES = 745.2;

/** Spring/neap factor 0 (neap) … 1 (spring) from both moons' phases. */
export function springFactor(epochMinutes: number): number {
  let s = 0;
  let wsum = 0;
  const weights = [0.75, 0.25]; // Masser dominates ("well over twice" the size)
  MOONS.forEach((moon, i) => {
    const f = moonAt(epochMinutes, moon).illuminatedFraction;
    s += Math.abs(f - 0.5) * 2 * weights[i];
    wsum += weights[i];
  });
  return s / wsum;
}

/**
 * Tide level offset (m) for a surface with tide response 1: NEVER positive.
 * The compiled sea plane (y = 0) is the HIGH-water line (owner 2026-09-13:
 * the water on the 2D map is the height of the wet season and, where
 * relevant, the tide); the tide only falls from it, by up to twice the
 * amplitude at springs, and returns to it.
 */
export function tideOffset(epochMinutes: number, tidalAmplitudeM: number): number {
  const amp = tidalAmplitudeM * (0.5 + 0.5 * springFactor(epochMinutes));
  return amp * (Math.sin((epochMinutes / SEMIDIURNAL_MINUTES) * 2 * Math.PI) - 1);
}

/**
 * Seasonal level offset (m) for a surface with draw-down response 1: NEVER
 * positive. The compiled level is the wet-season high-water line; the
 * season only lowers it, to `−amplitude` at the dry-season trough (s = −1)
 * and back to the line at the wet-season peak (s = 1). The per-texel
 * response (`water-shore.png` G) scales it: a marsh sheet by 0.2, a lake by
 * a few centimetres, a seasonal creek down to its bed.
 */
export function seasonOffset(seasonScalar: number, seasonalAmplitudeM: number): number {
  const s = Math.min(Math.max(seasonScalar, -1), 1);
  return -seasonalAmplitudeM * (1 - s) / 2;
}
