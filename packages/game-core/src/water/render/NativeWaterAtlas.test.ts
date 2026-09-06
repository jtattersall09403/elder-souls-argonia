import { describe, expect, it } from 'vitest';
import { NativeWaterGround } from '../nativeWaterGround';
import { HERO_FIELD_SCALARS, NativeWaterAtlas, NATIVE_WATER_GROUND_GLSL } from './NativeWaterAtlas';

function groundFixture() {
  const grid = 33, tile = 16, flips = [0, 15, 16, 511, 512, 1023];
  const records = [0, 1, 3]; // Deliberately missing the lower-left native tile.
  const recordBytes = 4 + (tile + 1) ** 2 * 4;
  const buffer = new ArrayBuffer(48 + flips.length * 4 + records.length * recordBytes);
  const view = new DataView(buffer);
  new Uint8Array(buffer).set(new TextEncoder().encode('ESWGRND1'));
  [1, grid, tile, records.length, flips.length, 0].forEach((v, i) => view.setUint32(8 + 4 * i, v, true));
  view.setFloat64(32, 231.82784, true); view.setUint32(40, 32, true);
  flips.forEach((v, i) => view.setUint32(48 + 4 * i, v, true));
  records.forEach((id, i) => {
    const offset = 48 + flips.length * 4 + i * recordBytes;
    view.setUint32(offset, id, true);
    for (let z = 0; z <= tile; z++) for (let x = 0; x <= tile; x++) {
      const gx = id % 2 * tile + x, gz = Math.floor(id / 2) * tile + z;
      view.setFloat32(offset + 4 + (z * 17 + x) * 4, (gx % 2 === gz % 2 ? 0 : 80) + gx * 0.013 + gz * 0.021, true);
    }
  });
  return new NativeWaterGround(buffer);
}

/** Independent atlas address decoder follows the shader's scalar/bit access,
 * not the provider's private source-buffer offsets. */
function atlasGround(atlas: NativeWaterAtlas, x: number, z: number): number | null {
  const p = atlas.field.image.data as Float32Array, l = atlas.layout!;
  const cell = (v: number) => {
    let i = Math.max(0, Math.min(l.gridSize - 2, Math.floor(v / Math.fround(l.metresPerPixel))));
    if (v < p[l.axisOffset + i] && i > 0) i--;
    else if (v >= p[l.axisOffset + i + 1] && i < l.gridSize - 2) i++;
    return i;
  };
  const cx = cell(x), cz = cell(z);
  const x0 = p[l.axisOffset + cx], x1 = p[l.axisOffset + cx + 1];
  const z0 = p[l.axisOffset + cz], z1 = p[l.axisOffset + cz + 1];
  if (x < x0 || x > x1 || z < z0 || z > z1) return null;
  const n = l.tileCells, base = p[l.tileIndexOffset + Math.floor(cz / n) * l.tileStride + Math.floor(cx / n)];
  if (!base) return null;
  const ix = cx % n, iz = cz % n, h = base + iz * (n + 1) + ix;
  const a = p[h], b = p[h + 1], c = p[h + n + 1], d = p[h + n + 2];
  const u = (x - x0) / (x1 - x0), v = (z - z0) / (z1 - z0), local = iz * n + ix;
  const flipped = (p[base + (n + 1) ** 2 + Math.floor(local / 16)] >> (local % 16)) & 1;
  if (flipped) return u >= v ? a * (1 - u) + b * (u - v) + d * v : a * (1 - v) + c * (v - u) + d * u;
  return u + v <= 1 ? a * (1 - u - v) + b * u + c * v : d * (u + v - 1) + b * (1 - v) + c * (1 - u);
}

describe('unified native ground / local water atlas', () => {
  it.each([false, true])('unions hero and marine prefix uploads without touching ground (hero first=%s)', heroFirst => {
    const ground = groundFixture(), atlas = new NativeWaterAtlas(ground, 1024);
    const pixels = atlas.field.image.data as Float32Array, immutable = pixels.slice(HERO_FIELD_SCALARS + 1024);
    atlas.field.onUpdate!(atlas.field);
    const ready = new Float32Array(1024); ready[17] = 1;
    if (heroFirst) atlas.markHeroDirty();
    atlas.writeAuxiliary(0, ready);
    if (!heroFirst) atlas.markHeroDirty();
    expect(atlas.field.updateRanges).toEqual(Array.from({ length: 9 }, (_, i) => ({ start: i * 8192, count: 8192 })));
    expect(atlas.diagnostics.pendingUploadBytes).toBe(9 * 8192 * 4);
    expect(pixels[HERO_FIELD_SCALARS + 17]).toBe(1);
    expect(pixels.subarray(HERO_FIELD_SCALARS + 1024)).toEqual(immutable);
    expect(atlasGround(atlas, 20, 20)).toBe(ground.sample(20, 20));
    expect(() => atlas.writeAuxiliary(1024, new Float32Array(1))).toThrow('outside reserved');
    atlas.field.onUpdate!(atlas.field); atlas.markHeroDirty();
    expect(atlas.field.updateRanges).toHaveLength(8);
    atlas.invalidate(); expect(atlas.field.updateRanges).toEqual([]);
    atlas.dispose();
  });

  it('preserves steep native triangles, bit-15 flips, sparse coverage and exact Float32 axes at kilometre coordinates', () => {
    const ground = groundFixture(), atlas = new NativeWaterAtlas(ground);
    for (let z = 0; z < 32; z++) for (let x = 0; x < 32; x++) for (const [u, v] of [[0, 0], [0.2, 0.7], [0.8, 0.3], [0.5, 0.5]]) {
      const px = Math.fround(Math.fround(x * ground.metresPerPixel) * (1 - u) + Math.fround((x + 1) * ground.metresPerPixel) * u);
      const pz = Math.fround(Math.fround(z * ground.metresPerPixel) * (1 - v) + Math.fround((z + 1) * ground.metresPerPixel) * v);
      expect(atlasGround(atlas, px, pz)).toBe(ground.sample(px, pz));
    }
    expect(atlasGround(atlas, -0.01, 0)).toBeNull();
    expect(atlasGround(atlas, 0, 8000)).toBeNull();
    expect(NATIVE_WATER_GROUND_GLSL).toContain('word >> (localCell % 16)');
    expect(NATIVE_WATER_GROUND_GLSL).toContain('esNativeScalar(base + cell)');
    atlas.dispose();
  });

  it('uploads immutable ground once and only eight hero rows thereafter, including first-frame and context-restore safety', () => {
    const atlas = new NativeWaterAtlas(groundFixture()), pixels = atlas.field.image.data as Float32Array;
    const immutable = pixels.slice(HERO_FIELD_SCALARS);
    atlas.markHeroDirty();
    expect(atlas.field.updateRanges).toEqual([]); // Must not leave uninitialized native ground on the GPU.
    atlas.field.onUpdate!(atlas.field);
    for (let frame = 0; frame < 3; frame++) {
      pixels.fill(frame + 1, 0, HERO_FIELD_SCALARS);
      atlas.markHeroDirty();
      expect(atlas.field.updateRanges).toHaveLength(8);
      expect(atlas.field.updateRanges).toEqual(Array.from({ length: 8 }, (_, i) => ({ start: i * 8192, count: 8192 })));
      expect(atlas.diagnostics.pendingUploadBytes).toBe(256 * 1024);
      expect(pixels.subarray(HERO_FIELD_SCALARS)).toEqual(immutable);
      atlas.field.clearUpdateRanges(); atlas.field.onUpdate!(atlas.field);
    }
    expect(atlas.diagnostics).toMatchObject({ fullUploads: 1, partialUploads: 3, gpuUpdates: 4 });
    atlas.invalidate();
    expect(atlas.field.updateRanges).toEqual([]);
    expect(atlas.diagnostics.pendingUploadBytes).toBe(pixels.byteLength);
    atlas.field.onUpdate!(atlas.field);
    expect(atlas.diagnostics.fullUploads).toBe(2);
    atlas.dispose();
  });
});
