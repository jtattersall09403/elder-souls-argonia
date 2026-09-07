import { expect, it } from 'vitest';
import { WaterData } from './waterData';
import { WaterWorld } from './waterWorld';

it('carries seaward wave energy to the waterline without applying local shore exposure twice', () => {
  function world(waveShelter: number) {
    const sample = (x: number) => ({ surfaceBase: 0, depthProxy: 0, supported: true,
      waterBodyId: 'water.coast', tideResponse: 0, seasonResponse: 0,
      className: 'coast', shoreDistM: Math.max(0, x), turbidity: .12, tannin: .55,
      salinity: 1, waveShelter, flowX: 0, flowZ: 0 });
    const data = { meta: { surface: { metresPerPixel: 1 } }, sample } as unknown as WaterData;
    return new WaterWorld(data, { tidalAmplitudeM: 0, seasonalAmplitudeM: 0, seasonScalar: () => 0 });
  }
  const beach = world(31 / 255), exposed = world(1);
  let runup = 0;
  for (let seconds = 0; seconds < 30; seconds += .5) {
    const wet = beach.sample({ x: 0, y: 0, z: 0 }, seconds / 60);
    expect(wet.surfaceHeight).toBeCloseTo(exposed.sample({ x: 0, y: 0, z: 0 }, seconds / 60).surfaceHeight, 12);
    runup = Math.max(runup, wet.surfaceHeight);
  }
  expect(runup).toBeGreaterThan(.01);
});
