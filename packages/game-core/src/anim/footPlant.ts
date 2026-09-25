/**
 * Foot plants from the live skeleton: a foot plants when it becomes the
 * supporting (lower) foot. Read from the posed foot bones' heights above the
 * ground the actor stands on, so it follows every stride clip, every playback
 * rate and every blend without a per-clip table of contact times (the
 * manifest carries none). The swing foot comes down as the other lifts, so
 * the switch falls at heel strike, twice per stride cycle.
 *
 * Pure: the caller keeps the state per actor, passes the two heights each
 * frame, and resets it (`support: null`) whenever the actor is not striding,
 * so the first plant after starting is the first real one.
 */

export type Foot = "footL" | "footR";

export type FootPlantState = { support: Foot | null };

/** How much lower the other foot must be before support changes, metres: bone jitter stays below it. */
export const FOOT_PLANT_HYSTERESIS_METRES = 0.02;

export function initialFootPlant(): FootPlantState {
  return { support: null };
}

/** Advance by one frame; `planted` is the foot that just took the weight, or null. */
export function stepFootPlant(
  state: FootPlantState,
  heightL: number,
  heightR: number,
  hysteresis = FOOT_PLANT_HYSTERESIS_METRES,
): { state: FootPlantState; planted: Foot | null } {
  // From a standstill both feet carry the weight; support is first decided,
  // silently, when one foot lifts: the foot left down was already planted.
  if (state.support === null) {
    if (Math.abs(heightL - heightR) <= hysteresis) return { state, planted: null };
    return { state: { support: heightL < heightR ? "footL" : "footR" }, planted: null };
  }
  if (state.support === "footL" && heightR < heightL - hysteresis) return { state: { support: "footR" }, planted: "footR" };
  if (state.support === "footR" && heightL < heightR - hysteresis) return { state: { support: "footL" }, planted: "footL" };
  return { state, planted: null };
}
