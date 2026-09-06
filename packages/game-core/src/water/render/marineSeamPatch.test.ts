import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { WaterData, type WaterMeta } from '../waterData';
import { SpectralOcean } from '../spectralOcean';
import { InlandWaterTiles } from './InlandWaterTiles';
import { marineNearBounds, marineSeamPatchSteps } from './marineSeamPatch';

function coast() {
  const grid = { size: 66, metresPerPixel: 1, gridOriginM: 0, file: '' };
  const meta: WaterMeta = { surface: { ...grid, minM: 0, maxM: 120, buryM: 3, nativeChannelCoverage: true },
    flow: { ...grid, flowMax: 3, shoreMaxM: 160 }, klass: { ...grid, classes: ['none', 'coast', 'estuary', 'river'] },
    bodies: [{ index: 1, id: 'sea' }, { index: 2, id: 'estuary' }, { index: 3, id: 'river' }] };
  const n = grid.size ** 2, support = new Uint8ClampedArray(n * 4), klass = new Uint8ClampedArray(n * 4), height = new Float32Array(n);
  const season = new Float32Array(n);
  for (let z = 0; z < 66; z++) for (let x = 0; x < 66; x++) {
    const i = z * 66 + x, k = i * 4, kind = x < 12 ? 1 : x < 24 ? 2 : 3;
    support.set([kind === 3 ? 128 : 255, 0, kind, 255], k); klass.set([kind, 0, 255, 255], k);
    season[i] = z / 128; height[i] = kind === 3 ? 120 : 0;
  }
  return new WaterData(meta, height, new Float32Array(n).fill(5), new Uint8ClampedArray(n * 4), klass, undefined, season, support);
}

function finish<T>(generator: Generator<void, T>): T { for (;;) { const result = generator.next(); if (result.done) return result.value; } }
function edgeKey(p: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, a: number, b: number) {
  return [`${p.getX(a)},${p.getZ(a)}`, `${p.getX(b)},${p.getZ(b)}`].sort().join('/');
}
function boundary(geometry: THREE.BufferGeometry) {
  const edges = new Map<string, { count: number; a: number; b: number }>(), p = geometry.getAttribute('position'), ids = geometry.index!;
  let signedArea = 0;
  for (let i = 0; i < ids.count; i += 3) {
    const a = ids.getX(i), b = ids.getX(i + 1), c = ids.getX(i + 2);
    const area = ((p.getX(b) - p.getX(a)) * (p.getZ(c) - p.getZ(a)) - (p.getX(c) - p.getX(a)) * (p.getZ(b) - p.getZ(a))) / 2;
    expect(area).toBeLessThanOrEqual(0); signedArea += area;
    for (const [u, v] of [[a, b], [b, c], [c, a]]) {
      const key = edgeKey(p, u, v), edge = edges.get(key);
      if (edge) edge.count++; else edges.set(key, { count: 1, a: u, b: v });
    }
  }
  expect([...edges.values()].every(edge => edge.count <= 2)).toBe(true);
  return { area: -signedArea, edges: new Map([...edges].filter(([, edge]) => edge.count === 1)) };
}

describe('seam-safe near marine geometry', () => {
  it('uses actual production coarse endpoints, closes the transition fans, and matches their animated heights', () => {
    const data = coast(), material = new THREE.MeshBasicMaterial(), tiles = new InlandWaterTiles(data, false, { domain: 'marine' });
    const builder = tiles as unknown as { build(x: number, z: number, step: number, material: THREE.Material): Generator<void, THREE.Mesh> };
    const coarse = finish(builder.build(0, 0, 1, material)).geometry;
    const bounds = { minX: 5, minZ: 5, maxX: 19, maxZ: 19 }, selected = coarse.clone(), p = coarse.getAttribute('position'), ids: number[] = [];
    for (let i = 0; i < coarse.index!.count; i += 3) {
      const tri = [0, 1, 2].map(j => coarse.index!.getX(i + j));
      if (tri.every(j => p.getX(j) >= bounds.minX && p.getX(j) <= bounds.maxX && p.getZ(j) >= bounds.minZ && p.getZ(j) <= bounds.maxZ)) ids.push(...tri);
    }
    selected.setIndex(ids);
    const patch = finish(marineSeamPatchSteps(data, [coarse], bounds));
    try {
      const original = boundary(selected), refined = boundary(patch.geometry);
      expect(refined.area).toBeCloseTo(original.area, 9); expect(refined.area).toBe(196);
      expect([...refined.edges.keys()].sort()).toEqual([...original.edges.keys()].sort());
      expect(patch.boundaryEdges).toHaveLength(original.edges.size);
      const point = patch.geometry.getAttribute('position'), footprint = patch.geometry.getAttribute('waterCellSize');
      for (let i = 0; i < point.count; i++) if (Math.abs(point.getX(i) - 12) <= 6 && Math.abs(point.getZ(i) - 12) <= 6)
        expect(footprint.getX(i)).toBe(.125);
      const ocean = new SpectralOcean();
      const at = (g: THREE.BufferGeometry, i: number, season: number) => {
        const pos = g.getAttribute('position'), over = g.getAttribute('waterOverride'), levels = g.getAttribute('waterLevelResponse');
        const explicit = levels && levels.getZ(i) > .5;
        const sample = data.boundaryAt(explicit ? over.getY(i) : pos.getX(i), explicit ? over.getZ(i) : pos.getZ(i), undefined, false);
        const field = { height: 0, slopeX: 0, slopeZ: 0 };
        for (const cascade of ocean.cascades) cascade.sampleFiltered(pos.getX(i), pos.getZ(i), ocean.alpha,
          Math.max(.125, g.getAttribute('waterCellSize')?.getX(i) ?? 0), field);
        return .5 * (explicit ? levels.getX(i) : sample.tideResponse) + season * (explicit ? levels.getY(i) : sample.seasonResponse) + field.height;
      };
      for (const time of [0, .033, 3.7, 50]) {
        ocean.update(time);
        for (const [key, edge] of original.edges) {
          const next = refined.edges.get(key)!;
          const order = point.getX(next.a) === p.getX(edge.a) && point.getZ(next.a) === p.getZ(edge.a) ? [next.a, next.b] : [next.b, next.a];
          for (const season of [-.28, 1.4]) for (const scale of [.5, 1, 3.25]) for (const t of [0, .1, .5, .9, 1]) {
            const h = at(coarse, edge.a, season) * (1 - t) + at(coarse, edge.b, season) * t;
            const fine = at(patch.geometry, order[0], season) * (1 - t) + at(patch.geometry, order[1], season) * t;
            expect(fine * scale).toBe(h * scale);
          }
        }
      }
    } finally { patch.geometry.dispose(); selected.dispose(); coarse.dispose(); material.dispose(); tiles.dispose(); }
  });

  it('keeps native-aligned perimeter outside the full-detail ring and rejects a cut coarse triangle', () => {
    for (const mpp of [1, 1.82784, 3.65568]) for (const x of [0, 12.3, 2370.5, 15000.1]) {
      const bounds = marineNearBounds(x, x, mpp);
      expect(x - bounds.minX).toBeGreaterThan(6 + mpp - .002);
      expect(bounds.maxX - x).toBeGreaterThan(6 + mpp - .002);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 10, 10, 0, 0], 3));
    geometry.setIndex([0, 1, 2]);
    expect(() => finish(marineSeamPatchSteps(coast(), [geometry], { minX: 0, minZ: 0, maxX: 5, maxZ: 5 }))).toThrow('perimeter cuts');
    geometry.dispose();
  });
});
