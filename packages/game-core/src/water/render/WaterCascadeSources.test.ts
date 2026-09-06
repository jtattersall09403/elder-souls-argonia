import { expect, it } from 'vitest';
import { WaterCascadeSources, waterSourceDistanceSquared } from './WaterCascadeSources';

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
