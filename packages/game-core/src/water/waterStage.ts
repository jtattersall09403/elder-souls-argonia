import type { ChannelRibbonRecord } from './channelRibbons';

/** Positive magnitudes relative to the base plane. Upper bounds may grow
 * independently without moving existing low-water limits. */
export interface WaterStageRange {
  tidalAmplitudeM: number;
  seasonalAmplitudeM: number;
  lowTideAmplitudeM: number;
  drySeasonAmplitudeM: number;
}

/** Base-dry records must still provide genuinely wet peak surfaces. */
export function validateSeasonalRibbon(ribbon: ChannelRibbonRecord, stage: unknown): void {
  if (ribbon.baseMayBeDry === undefined) return;
  if (typeof ribbon.baseMayBeDry !== 'boolean') throw new Error('Seasonal ribbon flag must be boolean');
  if (!ribbon.baseMayBeDry) return;
  if (ribbon.hydrologyRegime !== 'shallow-wetland-rivulet') throw new Error('Base-dry water requires an authored wetland rivulet');
  validateWaterStageRange(stage);
  for (const point of ribbon.points) {
    if (![point.y, point.groundM, point.tideResponse, point.seasonResponse].every(Number.isFinite)
      || point.tideResponse! < 0 || point.tideResponse! > 1 || point.seasonResponse! < 0 || point.seasonResponse! > 1
      || point.y + stage.tidalAmplitudeM * point.tideResponse! + stage.seasonalAmplitudeM * point.seasonResponse!
        <= point.groundM! + .004) throw new Error('Seasonal ribbon does not reach a wet peak surface');
  }
}

export function validateWaterStageRange(value: unknown): asserts value is WaterStageRange {
  if (!value || typeof value !== "object" ||
    ["tidalAmplitudeM", "seasonalAmplitudeM", "lowTideAmplitudeM", "drySeasonAmplitudeM"].some(key => {
      const v = (value as Record<string, unknown>)[key];
      return typeof v !== "number" || !Number.isFinite(v) || v < 0;
    })) throw new Error("Water stage range requires four finite nonnegative amplitudes");
}
