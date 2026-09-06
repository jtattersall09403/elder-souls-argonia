import { describe, expect, it } from 'vitest';
import { WaterData, type WaterMeta } from '../waterData';
import { marineTileSteps, type MarineTileData } from './marineTile';

function coast(jagged = false, far = false) {
  const size = 9, mpp = far ? 2000.001 : 2, grid = { file: '', size, metresPerPixel: mpp, gridOriginM: 0 };
  const meta: WaterMeta = { surface: { ...grid, minM: 0, maxM: 120, buryM: 3, nativeChannelCoverage: true,
    accessMinOffsetM: -2, accessSpanM: 4 }, flow: { ...grid, flowMax: 3, shoreMaxM: 160 },
    klass: { ...grid, classes: ['none', 'coast', 'estuary', 'river'] },
    bodies: [{ index: 1, id: 'water.test.sea' }, { index: 2, id: 'water.test.river' }, { index: 3, id: 'water.test.estuary' }] };
  const heads = new Float32Array(size * size), depths = new Float32Array(size * size).fill(5);
  const support = new Uint8ClampedArray(size * size * 4), klass = new Uint8ClampedArray(support.length);
  const access = new Uint8ClampedArray(support.length), season = new Float32Array(size * size);
  for (let row = 0; row < size; row++) for (let col = 0; col < size; col++) {
    const i = row * size + col, k = i * 4, inland = col >= (far ? 8 : 5) || (jagged && col >= 4 && row >= 4);
    heads[i] = inland ? 120 : 0;
    support.set([inland ? 128 : 255, 0, inland ? 2 : col >= 3 ? 3 : 1, 255], k);
    klass.set([inland ? 3 : col >= 3 ? 2 : 1, 0, 255, 255], k);
    access.set([0, 0, inland ? 0 : 160 + row * 4 + col * 2 + row * col, 255], k);
    season[i] = (inland ? 255 : row * 8 + col * 4 + row * col * 2) / 255;
  }
  return new WaterData(meta, heads, depths, new Uint8ClampedArray(support.length), klass, undefined, season, support, undefined, undefined, access);
}

function build(data: WaterData, cell: number) {
  const steps = marineTileSteps(data, { x: 0, z: 0, sizeM: 16, maximumCellM: cell });
  let yields = 0;
  for (;;) { const result = steps.next(); if (result.done) return { mesh: result.value, yields }; yields++; }
}

function audit(data: WaterData, mesh: MarineTileData) {
  let area = 0, maximumStageErrorM = 0;
  const stages = [[0, 0], [-.5, -.28], [.5, -.28], [-.5, 1.4], [.5, 1.4]];
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const ids = Array.from(mesh.indices.subarray(i, i + 3));
    const points = ids.map(j => [mesh.positions[j * 3], mesh.positions[j * 3 + 2]]);
    area += Math.abs((points[1][0] - points[0][0]) * (points[2][1] - points[0][1])
      - (points[2][0] - points[0][0]) * (points[1][1] - points[0][1])) * .5;
    expect(new Set(ids.map(j => mesh.bodyIndices[j])).size).toBe(1);
    for (const weights of [[1 / 3, 1 / 3, 1 / 3], [.6, .3, .1]]) {
      const x = points.reduce((sum, p, j) => sum + p[0] * weights[j], 0);
      const z = points.reduce((sum, p, j) => sum + p[1] * weights[j], 0);
      const sample = data.boundaryAt(x, z, undefined, false);
      expect(data.rasterClassAt(x, z)).toBeLessThan(3);
      expect(sample.surfaceBase).toBe(0);
      for (const [tide, season] of stages) {
        const rendered = ids.reduce((sum, id, j) => sum + weights[j] *
          (tide * mesh.levelResponses[id * 2] + season * mesh.levelResponses[id * 2 + 1]), 0);
        const physical = tide * sample.tideResponse + season * sample.seasonResponse;
        maximumStageErrorM = Math.max(maximumStageErrorM, Math.abs(rendered - physical));
      }
    }
  }
  return { area, maximumStageErrorM };
}

describe('bounded conforming marine tile prototype', () => {
  it('retains exact marine ownership coverage at both coarse and near spectral fidelity', () => {
    const data = coast(), near = build(data, .125), coarse = build(data, 2);
    const nearAudit = audit(data, near.mesh), coarseAudit = audit(data, coarse.mesh);
    expect(nearAudit.area).toBe(9 * 16); expect(coarseAudit.area).toBe(nearAudit.area);
    expect(near.mesh.diagnostics.maximumCellM).toBe(.125);
    expect(nearAudit.maximumStageErrorM).toBeLessThan(.0001);
    expect(coarseAudit.maximumStageErrorM).toBeLessThan(.01);
    expect(near.mesh.diagnostics.triangles).toBe(18432);
    expect(near.mesh.diagnostics.bytes).toBeLessThan(600000);
    expect(near.yields).toBeGreaterThan(200);
    console.info('marine tile prototype', { near: near.mesh.diagnostics, coarse: coarse.mesh.diagnostics, nearAudit, coarseAudit });
  });

  it('rejects unbounded geometry requests before work', () => {
    expect(() => marineTileSteps(coast(), { x: 0, z: 0, sizeM: 512, maximumCellM: .125 }).next()).toThrow(RangeError);
  });

  it('measures the rational owner-aware stage stencil around a bank corner', () => {
    const data = coast(true), near = build(data, .125), coarse = build(data, 2);
    const nearAudit = audit(data, near.mesh), coarseAudit = audit(data, coarse.mesh);
    expect(nearAudit.area).toBe(126); expect(coarseAudit.area).toBe(126);
    expect(nearAudit.maximumStageErrorM).toBeLessThan(.001);
    console.info('marine bank corner prototype', { near: near.mesh.diagnostics, coarse: coarse.mesh.diagnostics, nearAudit, coarseAudit });
  });

  it('samples the intended side of a boundary before Float32 positioning near15km', () => {
    const data = coast(false, true), steps = marineTileSteps(data,
      { x: 14992, z: 14992, sizeM: 16, maximumCellM: .125 });
    let mesh: MarineTileData;
    for (;;) { const result = steps.next(); if (result.done) { mesh = result.value; break; } }
    const result = audit(data, mesh);
    const edge = Math.fround(7.5 * 2000.001);
    expect(result.area).toBeCloseTo((edge - 14992) * 16, 8);
    expect(mesh.diagnostics.maximumCoordinateRoundoffM).toBeGreaterThan(.0003);
    expect(mesh.diagnostics.maximumCoordinateRoundoffM).toBeLessThan(.0005);
    expect(result.maximumStageErrorM).toBeLessThan(.000001);
    console.info('marine15km prototype', { ...mesh.diagnostics, ...result });
  });
});
