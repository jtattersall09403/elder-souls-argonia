import { surfaceWaveAt, waveExposure } from '../waves';
import { expect, it } from 'vitest';
import { MeshBasicMaterial, type Mesh } from 'three';
import { WaterData, type WaterMeta } from '../waterData';
import type { NativeWaterGround } from '../nativeWaterGround';
import { constantRasterOwners } from './constantRasterOwners';
import { InlandWaterTiles } from './InlandWaterTiles';

function fixture() {
  const size = 129, grid = { file: '', size, metresPerPixel: 1, gridOriginM: 0 };
  const meta: WaterMeta = { surface: { ...grid, minM: 0, maxM: 20, buryM: 3, nativeChannelCoverage: true,
    accessFile: 'access.png', accessMinOffsetM: -2, accessSpanM: 4 },
    flow: { ...grid, flowMax: 3, shoreMaxM: 160 }, klass: { ...grid, classes: ['none', 'coast', 'estuary', 'river', 'lake'] },
    bodies: [1, 2, 3].map(index => ({ index, id: `pool.${index}`, basinIndex: 1 })) };
  const height = new Float32Array(size * size), support = new Uint8ClampedArray(height.length * 4);
  const klass = new Uint8ClampedArray(support.length), access = new Uint8ClampedArray(support.length);
  const season = new Float32Array(height.length).fill(.5);
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    const i = z * size + x, owner = x === 3 && z === 5 ? 3 : x < 32 ? 1 : 2;
    height[i] = owner === 1 ? 5 : owner === 2 ? 9 : 12;
    support.set([x === 10 && z === 10 ? 0 : 255, 0, owner, 255], i * 4); klass[i * 4] = 4;
  }
  const data = new WaterData(meta, height, new Float32Array(height.length).fill(2), new Uint8ClampedArray(support.length), klass,
    undefined, season, support, undefined, undefined, access, { sample: () => 0 } as unknown as NativeWaterGround);
  return { data, height, season };
}
function finish<T>(work: Generator<void, T>): T { for (;;) { const result = work.next(); if (result.done) return result.value; } }
const bounds = { minX: 0, minZ: 0, maxX: 64, maxZ: 64 };

it('finds independent flat owners and retains a one-cell island and dry hole', () => {
  const { data } = fixture(), owners = finish(constantRasterOwners(data, bounds)).owners;
  expect([...owners.keys()].sort()).toEqual([1, 2, 3]);
  expect(owners.get(3)).toMatchObject({ minX: 2.5, maxX: 3.5, minZ: 4.5, maxZ: 5.5 });
  expect(owners.get(1)!.supportedCells.some(cell => cell.minX === 9.5 && cell.minZ === 9.5)).toBe(false);
  expect(owners.get(1)!.sample.surfaceBase).toBe(5);
  expect(owners.get(2)!.sample.surfaceBase).toBe(9);
});

it.each(['height', 'season'] as const)('rejects a varying %s in the interpolation halo, even on dry fringe', field => {
  const fixtureData = fixture();
  fixtureData[field][20 * 129 + 65] += .25;
  const owners = finish(constantRasterOwners(fixtureData.data, bounds)).owners;
  expect(owners.has(2)).toBe(false); expect(owners.has(1)).toBe(true); expect(owners.has(3)).toBe(true);
});

it('keeps every owner surface and all stage heads across coarse geometry and masked overlap', () => {
  const { data } = fixture(), material = new MeshBasicMaterial(), tiles = new InlandWaterTiles(data, false);
  const build = tiles as unknown as { build(tx: number, tz: number, step: number, material: MeshBasicMaterial): Generator<void, Mesh> };
  const mesh = finish(build.build(0, 0, 16, material)), geometry = mesh.geometry;
  const position = geometry.getAttribute('position'), owner = geometry.getAttribute('waterBodyIndex');
  const override = geometry.getAttribute('waterOverride'), response = geometry.getAttribute('waterLevelResponse');
  expect(geometry.index!.count / 3).toBeLessThan(1500);
  for (const [x, z] of [[31.49, 20.1], [31.51, 20.1], [3.1, 5.1], [10.1, 10.1], [12.1, 12.1]]) {
    const sample = data.boundaryAt(x, z, undefined, false), expectedOwner = data.rasterBodyIndexAt(x, z);
    const hits: number[] = [];
    for (let i = 0; i < geometry.index!.count; i += 3) {
      const ids = [0, 1, 2].map(j => geometry.index!.getX(i + j));
      expect(ids.every(id => owner.getX(id) === owner.getX(ids[0]))).toBe(true);
      if (!sample.supported || owner.getX(ids[0]) !== expectedOwner) continue; // actual fragment ownership/support gates
      const [a, b, c] = ids, ax = position.getX(a), az = position.getZ(a), bx = position.getX(b), bz = position.getZ(b), cx = position.getX(c), cz = position.getZ(c);
      const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
      if (Math.abs(det) < 1e-10) continue;
      const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det;
      const v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det;
      if (Math.min(u, v, 1 - u - v) < -1e-7) continue;
      hits.push(a);
      for (const [tide, season] of [[-.5, -.28], [0, 0], [.5, 1.4]]) {
        expect(override.getX(a) + tide * response.getX(a) + season * response.getY(a))
          .toBeCloseTo(sample.surfaceBase + tide * sample.tideResponse + season * sample.seasonResponse, 6);
      }
    }
    expect(hits.length > 0).toBe(sample.supported);
  }
  geometry.dispose(); tiles.dispose(); material.dispose();
});

it('uses the same proxy-depth wave inputs along coarse and detailed tile edges', () => {
  const { data } = fixture(), material = new MeshBasicMaterial(), tiles = new InlandWaterTiles(data, false);
  const build = tiles as unknown as { build(tx: number, tz: number, step: number, material: MeshBasicMaterial): Generator<void, Mesh> };
  const coarse = finish(build.build(0, 0, 16, material)).geometry;
  const detailed = finish(build.build(1, 0, 1, material)).geometry;
  const nearPositions = detailed.getAttribute('position'), fineEdge = new Set<number>();
  for (let i = 0; i < nearPositions.count; i++) if (nearPositions.getX(i) === 64) fineEdge.add(nearPositions.getZ(i));
  const positions = coarse.getAttribute('position'), override = coarse.getAttribute('waterOverride'), ground = coarse.getAttribute('waterGround');
  let checked = 0;
  for (let i = 0; i < positions.count; i++) if (positions.getX(i) === 64) {
    const z = positions.getZ(i), source = data.boundaryAt(64, z, undefined, false);
    expect(fineEdge.has(z)).toBe(true);
    expect(override.getY(i)).toBe(64); expect(override.getZ(i)).toBe(z);
    const proxyDepth = override.getX(i) - ground.getX(i);
    expect(proxyDepth).toBe(source.depthProxy);
    expect(proxyDepth).not.toBe(source.surfaceBase - data.nativeGround!.sample(64, z)!);
    for (const time of [0, 2.3, 71.1]) {
      const sample = { dx: 0, height: 0, dz: 0, nx: 0, ny: 0, nz: 0 };
      const amplitude = (depth: number) => Math.min(waveExposure(30, depth, .2), depth * .45);
      const a = { ...surfaceWaveAt(64, z, time, amplitude(proxyDepth), sample) };
      const b = surfaceWaveAt(64, z, time, amplitude(source.depthProxy), sample);
      expect(a).toEqual(b);
    }
    checked++;
  }
  expect(checked).toBeGreaterThan(64);
  coarse.dispose(); detailed.dispose(); tiles.dispose(); material.dispose();
});
