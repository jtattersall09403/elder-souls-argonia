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

/** Tide level offset (m) for a surface with tide response 1. */
export function tideOffset(epochMinutes: number, tidalAmplitudeM: number): number {
  const amp = tidalAmplitudeM * (0.5 + 0.5 * springFactor(epochMinutes));
  return amp * Math.sin((epochMinutes / SEMIDIURNAL_MINUTES) * 2 * Math.PI);
}

/**
 * Seasonal level offset (m) for a surface with season response 1. The wet
 * season raises fresh lowland water toward `seasonalAmplitudeM` (the
 * flood-states compile validated inundation at that level); the dry season
 * draws it slightly down, exposing mudflats without stranding the shorelines
 * the land-cover grammar painted at y≈0.
 */
export function seasonOffset(seasonScalar: number, seasonalAmplitudeM: number): number {
  return seasonScalar >= 0
    ? seasonScalar * seasonalAmplitudeM
    : seasonScalar * 0.2 * seasonalAmplitudeM;
}
