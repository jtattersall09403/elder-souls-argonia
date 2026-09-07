import { describe, expect, it } from 'vitest';
import type { ChannelRibbonRecord } from './channelRibbons';
import { validateSeasonalRibbon } from './waterStage';

const stage = { tidalAmplitudeM: .5, seasonalAmplitudeM: 1.4, lowTideAmplitudeM: .5, drySeasonAmplitudeM: .28 };
const ribbon: ChannelRibbonRecord = {
  id: 'water.test.seasonal', bodyIndex: 1, riverBand: 1, baseMayBeDry: true,
  hydrologyRegime: 'shallow-wetland-rivulet',
  points: [0, 1].map(x => ({ x, z: 0, y: 0, groundM: 1, halfWidthM: 1, seasonResponse: 1, tideResponse: 0 })),
};

describe('seasonal ribbon contract', () => {
  it('allows a dry base with actual peak water and requires the authored regime', () => {
    expect(() => validateSeasonalRibbon(ribbon, stage)).not.toThrow();
    expect(() => validateSeasonalRibbon({ ...ribbon, hydrologyRegime: 'banked-river' }, stage)).toThrow();
    expect(() => validateSeasonalRibbon(ribbon, undefined)).toThrow();
  });
  it('rejects a peak that never becomes physically wet', () => {
    expect(() => validateSeasonalRibbon(ribbon, { ...stage, seasonalAmplitudeM: 1.004 })).toThrow();
    expect(() => validateSeasonalRibbon(ribbon, { ...stage, seasonalAmplitudeM: 1.005 })).not.toThrow();
  });
  it('keeps legacy records outside this opt-in contract', () => {
    expect(() => validateSeasonalRibbon({ ...ribbon, baseMayBeDry: undefined }, undefined)).not.toThrow();
  });
});
