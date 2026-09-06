import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WaterData, type WaterMeta } from '../waterData';
import { oceanAxisCoords } from './oceanGrid';
import { MARINE_DATUM_GLSL, marineDatumSurface } from './marineDatum';

describe('marine horizon datum isolation', () => {
  it('prevents a high inland vertex lifting a class-clipped marine fragment on the production grid', () => {
    const axis = oceanAxisCoords({ n: 320, uniformCell: 1.25, uniformRadius: 130, halfExtent: 30000 });
    const i = axis.findIndex((x, i) => x >= 130 && axis[i + 1] - x > 5);
    const lo = axis[i], hi = axis[i + 1], span = hi - lo, seam = (lo + hi) / 2;
    const grid = { file: '', size: 2, metresPerPixel: seam * 2, gridOriginM: 0 };
    const meta: WaterMeta = {
      surface: { ...grid, minM: 0, maxM: 120, buryM: 3, nativeChannelCoverage: true },
      flow: { ...grid, flowMax: 3, shoreMaxM: 160 },
      klass: { ...grid, classes: ['none', 'coast', 'estuary', 'river'] },
      bodies: [{ index: 1, id: 'water.test.sea' }, { index: 2, id: 'water.test.high-river' }],
    };
    const support = new Uint8ClampedArray([255, 0, 1, 255, 128, 0, 2, 255, 255, 0, 1, 255, 128, 0, 2, 255]);
    const klass = new Uint8ClampedArray([1, 0, 255, 255, 3, 0, 0, 255, 1, 0, 255, 255, 3, 0, 0, 255]);
    const data = new WaterData(meta, new Float32Array([0, 120, 0, 120]), new Float32Array([5, 1, 5, 1]),
      new Uint8ClampedArray(16), klass, undefined, undefined, support);
    const vertices = [[lo, 0], [lo, span], [hi, 0]], weights = [.5, .25, .25];
    const x = lo + span * .25, z = span * .25;
    expect(data.rasterClassAt(x, z)).toBe(1);
    expect(data.boundaryAt(x, z, undefined, false).supported).toBe(true);
    const heads = vertices.map(([x, z]) => data.surfaceBase(x, z));
    expect(heads).toEqual([0, 0, 120]);
    expect(heads.reduce((sum, head, i) => sum + head * weights[i], 0)).toBe(30);
    const corrected = heads.reduce((sum, head, i) => sum + marineDatumSurface(head, i === 2 ? 1 : 5, -1)[0] * weights[i], 0);
    expect(corrected).toBe(data.surfaceBase(x, z));
    for (const scale of [.5, 1, 3.25]) expect(corrected * scale).toBe(0);
  });

  it('preserves signed proxy beds, leaves freshwater untouched, and does not replace variable estuary stages', () => {
    for (const [base, depth] of [[120, 1], [-3, 5], [0, -2], [0, 25.5]]) {
      const [head, rebasedDepth] = marineDatumSurface(base, depth, -1);
      expect(head - rebasedDepth).toBe(base - depth);
      for (const override of [0, 1, 2]) expect(marineDatumSurface(base, depth, override)).toEqual([base, depth]);
      for (const tideResponse of [0, .3, 1]) for (const seasonResponse of [0, .7, 1]) {
        const stage = .5 * tideResponse + 1.4 * seasonResponse;
        expect(head + stage - (rebasedDepth + stage)).toBeCloseTo(base - depth, 10);
      }
    }
    // Deliberately retain negative depth over high banks, never turn the
    // one-metre-deep river at 120 m into a one-metre-deep sea there.
    expect(marineDatumSurface(120, 1, -1)).toEqual([0, -119]);
  });

  it('routes the production vertex sampler through the rebase before stage displacement', () => {
    const source = readFileSync(new URL('./waterMaterial.ts', import.meta.url), 'utf8');
    expect(MARINE_DATUM_GLSL).toContain('overrideW < -0.5 ? vec2(0.0, surface.y - surface.x) : surface');
    expect(source).toContain('${MARINE_DATUM_GLSL}');
    const route = source.indexOf('esMarineDatumSurface(esSurfaceAt(esDataXZ), waterOverride.w)');
    expect(route).toBeGreaterThan(0);
    expect(route).toBeLessThan(source.indexOf('float esStill = esSurf.x + esLevelOffset;'));
    expect(source).toContain('uLevelTide * esStage.y + uLevelSeason * esStage.z');
  });
});
