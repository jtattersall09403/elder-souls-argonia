import { describe, expect, it } from 'vitest';
import { WaterData, type WaterMeta } from './waterData';
import { WaterWorld } from './waterWorld';
import { WaterContactEmitter } from './contactEmitter';
import { WaterRigidBodyDriver, type WaterRigidBody } from './rigidBody';
import { closestSheetPoint } from './sheetContact';

function fixture(withPool: boolean | 'raster' = false) {
  const n = 21, grid = { file: '', size: n, metresPerPixel: 1, gridOriginM: 0 };
  const meta: WaterMeta = { schemaVersion: 2, bodies: [{ index: 1, id: 'water.fall' }, { index: 2, id: 'water.plunge' }],
    surface: { ...grid, minM: -5, maxM: 30, buryM: 3, nativeChannelCoverage: true },
    flow: { ...grid, flowMax: 3, shoreMaxM: 100 }, klass: { ...grid, classes: ['none', 'coast', 'estuary', 'river'] },
    ribbons: [{ id: 'fall', bodyIndex: 1, riverBand: 2, points: [
      { x: 10, y: 20, z: 4, halfWidthM: 0.5, groundM: -2, fallingToNext: true, tideResponse: 0.5, seasonResponse: 1 },
      { x: 10, y: 0, z: 5, halfWidthM: 0.5, groundM: -2, tideResponse: 0.5, seasonResponse: 1 },
    ] }] };
  if (withPool === true) meta.ribbons!.push({ id: 'plunge', bodyIndex: 2, riverBand: 2, points: [3, 7].map(z => ({ x: 10, y: 0, z, halfWidthM: 2, groundM: -2 })) });
  const support = new Uint8ClampedArray(n * n * 4), flow = support.slice(), klass = support.slice();
  for (let i = 0; i < n * n; i++) { support[i * 4] = withPool === 'raster' ? 255 : 128; support[i * 4 + 2] = withPool === 'raster' ? 2 : 1; flow[i * 4] = flow[i * 4 + 1] = 128; klass[i * 4] = 3; }
  const data = new WaterData(meta, new Float32Array(n * n), new Float32Array(n * n).fill(2), flow, klass,
    undefined, undefined, support);
  const world = new WaterWorld(data, { tidalAmplitudeM: 0, seasonalAmplitudeM: 0, seasonScalar: () => 0,
    groundHeight: () => -2, waveTimeS: () => 0 });
  return { data, world };
}

describe('non-buoyant finite falling sheets', () => {
  it('keeps air beneath a lip dry while retaining the real plunge volume', () => {
    const dry = fixture();
    expect(dry.data.sample(10, 4.5).fallingSheet).toBe(true);
    expect(dry.data.sample(10, 4.5).surfaceBase).toBeCloseTo(10);
    for (const y of [15, 10, 5, 0]) {
      const sample = dry.world.sample({ x: 10, y, z: 4.5 }, 0);
      expect(sample.waterBodyId).toBeNull(); expect(sample.immersion).toBe(0); expect(sample.depth).toBe(0);
    }
    expect(dry.world.sampleBoundary(10, 4.5, 0).waterBodyId).toBeNull();
    for (const kind of [true, 'raster'] as const) {
      const pool = fixture(kind);
      expect(pool.world.sample({ x: 10, y: 5, z: 4.5 }, 0).immersion).toBe(0);
      const submerged = pool.world.sample({ x: 10, y: -1, z: 4.5 }, 0);
      expect(submerged.waterBodyId).toBe('water.plunge'); expect(submerged.depth).toBeCloseTo(2, 2); expect(submerged.immersion).toBeGreaterThan(0);
    }
  });

  it('contacts only the finite sloping sheet within actor radius and follows stage shifts', () => {
    const { data, world } = fixture();
    const hit = world.sampleSheetContact({ x: 10, y: 10, z: 4.5 }, 0.1, 0)!;
    expect(hit.waterBodyId).toBe('water.fall'); expect(hit.distanceM).toBeCloseTo(0, 8);
    expect(hit.position.y).toBeCloseTo(10); expect(hit.flowVelocity.y).toBeLessThan(-2);
    expect(world.sampleSheetContact({ x: 10, y: 5, z: 4.5 }, 0.1, 0)).toBeNull();
    expect(world.sampleSheetContact({ x: 12, y: 10, z: 4.5 }, 0.1, 0)).toBeNull();
    expect(world.sampleSheetContact({ x: 10, y: 30, z: 4.5 }, 0.1, 0)).toBeNull();
    expect(world.sampleSheetContact({ x: 10, y: 10, z: 4.5 }, 5, 0)).toBeNull();
    expect(data.ribbons.sheetContact({ x: 10, y: 11, z: 4.5 }, 0.01, 1, 0.5)?.distanceM).toBeCloseTo(0, 8);
    expect(closestSheetPoint({ x: 2, y: 1, z: 0 }, { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 })).toEqual({ x: 1, y: 0, z: 0 });
  });

  it('emits bounded proportional sheet spray without underwater entry events or volume registration', () => {
    const { world } = fixture(), actor = new WaterContactEmitter('player', 0.3, 1.7);
    for (let i = 0; i < 120; i++) actor.update(world, 0, { x: 10, y: 9.1, z: 4.5 }, 0, 1 / 120, { x: 0, y: 0, z: 0 });
    const events = world.drainInteractions();
    expect(events.length).toBeGreaterThan(1); expect(events.length).toBeLessThanOrEqual(9);
    for (const event of events) {
      expect(event.kind).toBe('splash'); expect(event.sheetContact?.waterBodyId).toBe('water.fall');
      expect(event.waterVelocity!.y).toBeLessThan(0); expect(event.velocity!.y).toBe(0);
      expect(event.magnitude).toBeGreaterThan(0); expect(event.magnitude).toBeLessThanOrEqual(160);
      expect(event.position.y).toBeGreaterThan(9);
    }
    actor.reset();
    actor.update(world, 0, { x: 10, y: 9.1, z: 4.5 }, 0, 1 / 120);
    expect(world.drainInteractions()).toHaveLength(0);
  });

  it('integrates object sheet spray through the existing driver without buoyant air forces', () => {
    const { world } = fixture(), impulses: unknown[] = [], position = { x: 10, y: 10, z: 4.5 };
    const body: WaterRigidBody = { translation: () => position, rotation: () => ({ x: 0, y: 0, z: 0, w: 1 }),
      linvel: () => ({ x: 0, y: 0, z: 0 }), angvel: () => ({ x: 0, y: 0, z: 0 }), worldCom: () => position,
      applyImpulseAtPoint: impulse => impulses.push(impulse) };
    const driver = new WaterRigidBodyDriver({ actorId: 'crate', halfExtentsM: { x: 0.25, y: 0.25, z: 0.25 },
      buoyancy: { volumeM3: 0.125, points: [{ x: 0, y: 0, z: 0 }], pointHeightM: 0.5, linearDrag: 1 } });
    driver.step(world, 0, body, 1 / 120); driver.step(world, 0, body, 1 / 120);
    expect(impulses).toHaveLength(0);
    expect(world.drainInteractions().some(event => event.sheetContact?.waterBodyId === 'water.fall')).toBe(true);
    driver.dispose();
  });
});
