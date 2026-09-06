import { expect, it } from 'vitest';
import { cascadeEmission, WaterCascadeSources, waterSourceDistanceSquared } from './WaterCascadeSources';
import type { WorldWaterQuery } from '@elder-souls/contracts';
import { WaterEffects } from './WaterEffects';

const fall = (id: string, x: number, drop = 5) => ({ id,
  lip: { x, y: drop, z: 0 }, plunge: { x, y: 0, z: 0 },
  direction: { x: 0, y: -1, z: 0 }, dropM: drop, widthM: 2, riverBand: 1, bodyIndex: 1 });

it('selects the nearest bounded sources independently of province file order', () => {
  const records = Array.from({ length: 100 }, (_, i) => fall(String(i), 99 - i));
  const sources = new WaterCascadeSources(records);
  const near = sources.nearby({ x: 0, y: 2, z: 0 }, 100, 8);
  expect(near.map(source => source.lip.x)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  expect(sources.nearby({ x: 5000, y: 2, z: 0 })).toBe(near);
  expect(near).toHaveLength(0);
});

it('keeps the lip of a tall waterfall active when its plunge is far below', () => {
  const tall = fall('tall', 10, 140), sources = new WaterCascadeSources([tall]);
  const camera = { x: 10, y: 140, z: 2 };
  expect(waterSourceDistanceSquared(camera, tall.plunge, tall.lip)).toBe(4);
  expect(sources.nearby(camera, 20)).toEqual([tall]);
  expect(sources.nearby({ ...camera, y: 250 }, 20)).toHaveLength(0);
});

it('derives trajectory and energy from live wet receiving height, and diagnoses dry receivers without emission', () => {
  let wet = true, height = 332.2649363093411;
  const query: WorldWaterQuery = { sample: () => ({ waterBodyId: wet ? 'pool' : null,
    surfaceHeight: height, depth: wet ? 0.075118 : 0, surfaceNormal: { x: 0, y: 1, z: 0 },
    flowVelocity: { x: 0, y: 0, z: 0 }, immersion: 0, turbidity: 0, salinity: 0, temperature: 20, hazardIds: [] }), emitInteraction() {} };
  const record = { ...fall('actual', 1948.4774), lip: { x: 1948.4774, y: 337.0885, z: 210.2016 },
    plunge: { x: 1953.961, y: 331.8425, z: 217.513 }, widthM: 1.4142, dropM: 5.246 };
  const source = cascadeEmission(record, query, 0);
  expect('event' in source).toBe(true);
  if (!('event' in source)) throw new Error('expected live waterfall');
  expect(source.event.position.y).toBe(height);
  const duration = Math.sqrt(2 * (record.lip.y - height) / 9.81);
  expect(source.event.velocity!.y).toBeCloseTo(-9.81 * duration, 10);
  expect(record.lip.x + source.event.velocity!.x * duration).toBeCloseTo(record.plunge.x, 10);
  expect(record.lip.z + source.event.velocity!.z * duration).toBeCloseTo(record.plunge.z, 10);
  const fx = new WaterEffects();
  wet = false; fx.emitCascade(record, query, 0, 1);
  expect(fx.pendingCount).toBe(0); expect(fx.diagnostics.suppressed.cascadeDryReceiver).toBe(1);
  wet = true; height = record.lip.y; fx.emitCascade(record, query, 0, 1);
  expect(fx.pendingCount).toBe(0); expect(fx.diagnostics.suppressed.cascadeSubmergedLip).toBe(1);
  fx.dispose();
});
