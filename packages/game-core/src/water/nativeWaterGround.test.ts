import { describe, expect, it } from 'vitest';
import { NativeWaterGround } from './nativeWaterGround';

function fixture(height: (x: number, z: number) => number, flips: number[] = [], mpp = 1) {
  const grid = 5, tile = 2, tileCount = 4, record = 1 + (tile + 1) ** 2;
  const buffer = new ArrayBuffer(48 + flips.length * 4 + tileCount * record * 4), view = new DataView(buffer);
  new Uint8Array(buffer).set(new TextEncoder().encode('ESWGRND1'));
  [1, grid, tile, tileCount, flips.length, 0].forEach((value, i) => view.setUint32(8 + i * 4, value, true));
  view.setFloat64(32, mpp, true); view.setUint32(40, 4, true);
  flips.forEach((value, i) => view.setUint32(48 + i * 4, value, true));
  for (let tz = 0; tz < 2; tz++) for (let tx = 0; tx < 2; tx++) {
    const start = 48 + flips.length * 4 + (tz * 2 + tx) * record * 4;
    view.setUint32(start, tz * 2 + tx, true);
    for (let z = 0; z <= tile; z++) for (let x = 0; x <= tile; x++) view.setFloat32(start + 4 + (z * 3 + x) * 4, height(tx * tile + x, tz * tile + z), true);
  }
  return buffer;
}

describe('exact native water bed refinement', () => {
  it('splits water on every actual terrain crease without lifting or rotating its authored plane', () => {
    const ground = new NativeWaterGround(fixture((x, z) => x === 2 ? 100 : z === 2 ? 30 : 0));
    const vertex = (x: number, z: number) => ({ x: Math.fround(x), z: Math.fround(z), y: Math.fround(12 - x - z),
      groundM: 0, accessOffsetM: -12, tideResponse: 0.25, seasonResponse: 0.75 });
    const a = vertex(0.125, 0.125), b = vertex(3.875, 0.125), c = vertex(0.125, 3.875);
    const triangles = ground.refineTriangle(a, b, c);
    expect(triangles.length).toBeGreaterThan(16);
    let area = 0;
    for (const triangle of triangles) {
      const { a, b, c } = triangle;
      area += Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)) / 2;
      const x = (a.x + b.x + c.x) / 3, z = (a.z + b.z + c.z) / 3;
      expect((a.groundM! + b.groundM! + c.groundM!) / 3).toBeCloseTo(ground.sample(x, z)!, 5);
      for (const p of [a, b, c]) {
        expect(p.y).toBeCloseTo(12 - p.x - p.z, 6);
        expect(p.accessOffsetM! + 1e-5).toBeGreaterThanOrEqual(p.groundM! - p.y);
        expect(p.tideResponse).toBe(0.25); expect(p.seasonResponse).toBe(0.75);
      }
    }
    expect(area).toBeCloseTo(3.75 ** 2 / 2, 7);
    expect(ground.sample(2, 1)).toBe(100); // Old endpoint-ground interpolation falsely returned0.
  });

  it('uses audited diagonal flips and Float32 native coordinates for both point and triangle queries', () => {
    const height = (x: number, z: number) => x === 0 && z === 0 || x === 1 && z === 1 ? 0 : 100;
    const ordinary = new NativeWaterGround(fixture(height)), flipped = new NativeWaterGround(fixture(height, [0]));
    expect(ordinary.sample(0.5, 0.5)).toBe(100); expect(flipped.sample(0.5, 0.5)).toBe(0);
    const mpp = 1837.82784, native = new NativeWaterGround(fixture((x, z) => x * 21 + z * 71, [5], mpp));
    const x = Math.fround(mpp), z = Math.fround(2 * mpp);
    expect(native.sample(x, z)).toBe(163);
    const triangles = native.refineTriangle({ x, z: Math.fround(mpp), y: 500 },
      { x: Math.fround(2 * mpp), z: Math.fround(mpp), y: 500 }, { x, z, y: 500 });
    expect(triangles.length).toBeGreaterThan(0);
    for (const { a, b, c } of triangles) expect((a.groundM! + b.groundM! + c.groundM!) / 3)
      .toBeCloseTo(native.sample((a.x + b.x + c.x) / 3, (a.z + b.z + c.z) / 3)!, 4);
  });

  it('rejects corrupt counts, missing coverage, non-finite data and unsupported versions', () => {
    const buffer = fixture(() => 0), version = buffer.slice(0);
    new DataView(version).setUint32(8, 2, true); expect(() => new NativeWaterGround(version)).toThrow(/format/);
    const invalid = buffer.slice(0); new DataView(invalid).setFloat32(52, NaN, true);
    expect(() => new NativeWaterGround(invalid)).toThrow(/Non-finite/);
    expect(() => new NativeWaterGround(buffer.slice(0, -4))).toThrow(/counts/);
    const sparse = new ArrayBuffer(48), header = new Uint8Array(sparse); header.set(new Uint8Array(buffer, 0, 48));
    new DataView(sparse).setUint32(20, 0, true);
    const ground = new NativeWaterGround(sparse);
    expect(ground.sample(0.5, 0.5)).toBeNull();
    expect(() => ground.refineTriangle({ x: 0.1, y: 1, z: 0.1 }, { x: 0.9, y: 1, z: 0.1 }, { x: 0.1, y: 1, z: 0.9 })).toThrow(/cover/);
  });

  it('point-query refinement shares exact children and clamps province-edge clipping roundoff', () => {
    const ground = new NativeWaterGround(fixture((x, z) => x * x + z, [0]));
    const a = { x: -0.711, y: 20, z: -0.139 }, b = { x: 3.811, y: 19, z: 0.317 }, c = { x: 0.193, y: 18, z: 3.777 };
    const all = ground.refineTriangle(a, b, c);
    expect(all.length).toBeGreaterThan(0);
    for (const triangle of all) for (const p of [triangle.a, triangle.b, triangle.c]) {
      expect(p.x).toBeGreaterThanOrEqual(0); expect(p.z).toBeGreaterThanOrEqual(0);
    }
    const cell = ground.cellKeyAt(1.3, 1.4);
    const selected = all.filter(t => ground.cellKeyAt((t.a.x + t.b.x + t.c.x) / 3, (t.a.z + t.b.z + t.c.z) / 3) === cell);
    expect(ground.refineTriangleAt(a, b, c, 1.3, 1.4)).toEqual(selected);
    expect(ground.refineTriangleAt(a, b, c, -1, 1)).toEqual([]);
  });
});
