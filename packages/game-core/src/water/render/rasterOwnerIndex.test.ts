import { expect, it } from 'vitest';
import { RasterOwnerIndex } from './rasterOwnerIndex';

it('finds nearest actual rectangles across gaps and gives stable boundary ties', () => {
  const cells = Array.from({ length: 64 }, (_, i) => ({ minX: (i % 8) * 3, minZ: Math.floor(i / 8) * 3,
    maxX: (i % 8) * 3 + 1, maxZ: Math.floor(i / 8) * 3 + 1 }));
  const index = new RasterOwnerIndex(cells);
  for (let z = -1; z <= 25; z += 2) for (let x = -1; x <= 25; x += 2) {
    const distance = (cell: typeof cells[number]) => Math.max(cell.minX - x, 0, x - cell.maxX) ** 2 + Math.max(cell.minZ - z, 0, z - cell.maxZ) ** 2;
    const expected = [...cells].sort((a, b) => distance(a) - distance(b) || a.minZ - b.minZ || a.minX - b.minX)[0];
    expect(index.nearest(x, z)).toBe(expected);
  }
  expect(cells[0].minX).toBe(0); // construction must not reorder caller arrays
});
