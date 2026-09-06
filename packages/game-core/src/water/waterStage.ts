/** Positive magnitudes relative to the base plane. Upper bounds may grow
 * independently without moving existing low-water limits. */
export interface WaterStageRange {
  tidalAmplitudeM: number;
  seasonalAmplitudeM: number;
  lowTideAmplitudeM: number;
  drySeasonAmplitudeM: number;
}

export function validateWaterStageRange(value: unknown): asserts value is WaterStageRange {
  if (!value || typeof value !== "object" ||
    ["tidalAmplitudeM", "seasonalAmplitudeM", "lowTideAmplitudeM", "drySeasonAmplitudeM"].some(key => {
      const v = (value as Record<string, unknown>)[key];
      return typeof v !== "number" || !Number.isFinite(v) || v < 0;
    })) throw new Error("Water stage range requires four finite nonnegative amplitudes");
}
