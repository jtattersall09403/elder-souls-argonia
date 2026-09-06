import { describe, expect, it } from 'vitest';
import { LocalWaterPatch, type LocalWaterPatchOptions } from './LocalWaterPatch';

function make(extra: Partial<LocalWaterPatchOptions> = {}) {
  const size = extra.size ?? 32;
  return new LocalWaterPatch({ size, cellSizeM: 0.25, originX: 0, originZ: 0, bodyId: 'water.pool',
    baseHeightM: 0, groundHeights: new Float32Array(size ** 2).fill(-2), ...extra });
}
function evolve(patch: LocalWaterPatch, seconds: number, dt = 1 / 60) {
  for (let frame = 0; frame < Math.round(seconds / dt); frame++) patch.advance(dt);
}

describe('bounded physical local pool', () => {
  it('exposes the exact shallow-neck stage boundary before a two-centimetre seasonal retarget', () => {
    const ground = new Float32Array(1024).fill(-1);
    for (let z = 0; z < 32; z++) ground[z * 32 + 16] = z === 16 ? -0.015 : 1;
    const patch = make({ groundHeights: ground });
    expect(patch.minimumSafeBaseHeightM).toBeCloseTo(-0.005, 7);
    expect(-0.006).toBeLessThan(patch.minimumSafeBaseHeightM); // 6 mm fall already invalidates connectivity
    patch.initialize({ originX: 0, originZ: 0, bodyId: 'water.pool', baseHeightM: -0.006, groundHeights: ground });
    patch.impulse({ x: 3.5, z: 4.1, radiusM: 2, energyJ: 0.1 });
    evolve(patch, 2);
    for (let z = 0; z < 32; z++) for (let x = 17; x < 32; x++) expect(patch.fields[(z * 32 + x) * 4]).toBe(0);
    expect(patch.wetMask[16 * 32 + 16]).toBe(0);
  });

  it('meets a real steep shore continuously without truncating a raised last-wet-cell slab', () => {
    const size = 32, cell = 0.25;
    const bedAt = (x: number) => x >= 4 ? 2 : -0.03 - (4 - x) * 0.5;
    const ground = Float32Array.from({ length: size ** 2 }, (_, i) => bedAt((i % size + 0.5) * cell));
    const patch = make({ groundHeights: ground });
    patch.moveImmersedSphere('body', { x: 3.7, y: -0.1, z: 4, radiusM: 0.5 });
    expect(patch.volumeOffsetM3).toBeGreaterThan(0);
    expect(patch.displayedVolumeOffsetM3).toBeLessThan(patch.volumeOffsetM3);
    for (const x of [3.9, 3.99, 3.999999]) expect(patch.sample(x, 4)).toEqual({ height: 0, slopeX: 0, slopeZ: 0, foam: 0 });
    expect(patch.sample(4.000001, 4)).toBeNull();
    for (let frame = 0; frame < 60; frame++) {
      if (frame === 20) patch.moveImmersedSphere('body', null);
      patch.advance(1 / 60);
      for (let x = 0.2; x < 4; x += 0.07) {
        const sample = patch.sample(x, 4)!;
        expect(sample.height).toBeGreaterThan(bedAt(x));
        expect(Number.isFinite(sample.slopeX) && Number.isFinite(sample.slopeZ)).toBe(true);
      }
      expect(patch.sample(3.999999, 4)?.height).toBe(0);
    }
    expect(patch.volumeOffsetM3).toBeCloseTo(0, 11);
  });

  it('limits shallow withdrawal troughs smoothly while reporting raw and displayed volume separately', () => {
    const patch = make({ groundHeights: new Float32Array(1024).fill(-0.02) });
    patch.seedImmersedSphere('occupied', { x: 4, y: 0, z: 4, radiusM: 0.8 });
    const occupied = patch.displacedVolumeM3;
    expect(occupied).toBeGreaterThan(0);
    expect(patch.fields.every(value => value === 0)).toBe(true); // quiet selection stays quiet
    patch.moveImmersedSphere('occupied', null);
    expect(patch.volumeOffsetM3).toBeCloseTo(-occupied, 12);
    expect(patch.displayedVolumeOffsetM3).toBeGreaterThan(patch.volumeOffsetM3);
    expect(patch.fields.some((value, i) => i % 4 === 3 && value > 0)).toBe(true);
    for (let frame = 0; frame < 60; frame++) {
      patch.advance(1 / 60);
      for (let i = 0; i < patch.fields.length; i += 4) expect(Math.abs(patch.fields[i])).toBeLessThanOrEqual(0.009000001);
    }
    expect(patch.volumeOffsetM3).toBeCloseTo(-occupied, 11);
    expect(patch.sample(4.03, 4.09)!.height).toBeGreaterThan(-0.02);
  });

  it('fades against a foreign-owner island including diagonal mask corners without transferring volume', () => {
    const mask = new Uint8Array(1024).fill(1); mask[16 * 32 + 16] = 0;
    const patch = make({ ownerMask: mask });
    patch.moveImmersedSphere('body', { x: 3.8, y: -0.3, z: 4.1, radiusM: 0.6 });
    expect(patch.volumeOffsetM3).toBeCloseTo(patch.displacedVolumeM3, 12);
    for (const [x, z] of [[3.999999, 4.1], [4.250001, 4.1], [4.1, 3.999999], [4.1, 4.250001], [3.999999, 3.999999]]) {
      expect(patch.sample(x, z)).toEqual({ height: 0, slopeX: 0, slopeZ: 0, foam: 0 });
    }
    expect(patch.sample(4.1, 4.1)).toBeNull();
    expect(patch.fields.slice((16 * 32 + 16) * 4, (16 * 32 + 16) * 4 + 4)).toEqual(new Float32Array(4));
    evolve(patch, 1);
    expect(patch.volumeOffsetM3).toBeCloseTo(patch.displacedVolumeM3, 11);
  });

  it('keeps impacts zero-volume, resolves an energetic wave and dissipates it', () => {
    const patch = make(), storage = patch.fields;
    const accepted = patch.impulse({ x: 4, z: 4, radiusM: 1, energyJ: 4 });
    expect(accepted).toBeCloseTo(4, 10);
    expect(patch.energyJ).toBeCloseTo(accepted, 10);
    expect(Math.abs(patch.volumeOffsetM3)).toBeLessThan(1e-12);
    const initial = patch.fields.slice();
    evolve(patch, 0.5);
    expect(patch.fields).not.toEqual(initial);
    expect(patch.energyJ).toBeLessThan(accepted);
    expect(Math.abs(patch.volumeOffsetM3)).toBeLessThan(1e-11);
    evolve(patch, 10);
    expect(patch.energyJ).toBeLessThan(accepted * 0.002);
    expect(patch.fields).toBe(storage);
    expect(patch.fields.every(Number.isFinite)).toBe(true);
  });

  it('does not leak waves or impulse normalization into a disconnected pool of the same body', () => {
    const size = 24, ground = new Float32Array(size ** 2).fill(-1), mask = new Uint8Array(size ** 2).fill(1);
    for (let z = 0; z < size; z++) ground[z * size + 12] = 1;
    mask[0] = 0;
    const patch = make({ size, groundHeights: ground, ownerMask: mask });
    patch.impulse({ x: 2.6, z: 3, radiusM: 3, energyJ: 1 });
    evolve(patch, 3);
    for (let z = 0; z < size; z++) for (let x = 12; x < size; x++) {
      expect(Array.from(patch.fields.slice((z * size + x) * 4, (z * size + x) * 4 + 4))).toEqual([0, 0, 0, 0]);
    }
    expect(patch.sample(3.1, 3)).toBeNull();
    expect(patch.wetMask[0]).toBe(0);
    expect(Math.abs(patch.volumeOffsetM3)).toBeLessThan(1e-11);
    expect(patch.impulse({ x: 3.1, z: 3, radiusM: 1, energyJ: 1 })).toBe(0);
  });

  it('is invariant under world translation and normal frame partitioning', () => {
    const a = make(), b = make({ originX: 4000, originZ: 6000 });
    a.impulse({ x: 4, z: 4, radiusM: 1, energyJ: 2 });
    b.impulse({ x: 4004, z: 6004, radiusM: 1, energyJ: 2 });
    a.moveImmersedSphere('body', { x: 3, y: -0.2, z: 3, radiusM: 0.3 });
    b.moveImmersedSphere('body', { x: 4003, y: -0.2, z: 6003, radiusM: 0.3 });
    evolve(a, 1, 1 / 60); evolve(b, 1, 1 / 120);
    expect(a.fields).toEqual(b.fields);
    expect(a.volumeOffsetM3).toBeCloseTo(b.volumeOffsetM3, 12);
    const local = a.sample(3.7, 4.1)!, translated = b.sample(4003.7, 6004.1)!;
    for (const field of ['height', 'slopeX', 'slopeZ', 'foam'] as const) expect(local[field]).toBeCloseTo(translated[field], 11);
  });

  it('uses actual spherical excluded volume, conserves it under motion and reverses removal', () => {
    const patch = make(), radius = 0.4, volume = 4 / 3 * Math.PI * radius ** 3;
    const sphere = { x: 3, y: -0.8, z: 3, radiusM: radius };
    patch.moveImmersedSphere('crate', sphere);
    expect(patch.volumeOffsetM3).toBeCloseTo(volume, 12);
    expect(patch.displacedVolumeM3).toBeCloseTo(volume, 12);
    const initial = patch.fields.slice();
    patch.moveImmersedSphere('crate', { ...sphere, x: 3.137, z: 3.489 });
    expect(patch.volumeOffsetM3).toBeCloseTo(volume, 12);
    patch.moveImmersedSphere('crate', sphere);
    expect(patch.fields).toEqual(initial);
    evolve(patch, 1);
    expect(patch.volumeOffsetM3).toBeCloseTo(volume, 11);
    patch.moveImmersedSphere('crate', null);
    expect(patch.volumeOffsetM3).toBeCloseTo(0, 11);
    expect(patch.displacedVolumeM3).toBe(0);
    expect(patch.trackedSphereCount).toBe(0);
    // Remaining zero-volume wake is real motion, not erased on removal.
    expect(patch.energyJ).toBeGreaterThan(0);
  });

  it('handles first contact, partial immersion, bed clipping and crossing disconnected components', () => {
    const patch = make(), r = 0.5;
    patch.moveImmersedSphere('sphere', { x: 4, y: r - 0.0001, z: 4, radiusM: r });
    expect(patch.displacedVolumeM3).toBeCloseTo(Math.PI * 0.0001 ** 2 * (r - 0.0001 / 3), 15);
    patch.moveImmersedSphere('sphere', { x: 4, y: 0, z: 4, radiusM: r });
    expect(patch.displacedVolumeM3).toBeCloseTo(2 / 3 * Math.PI * r ** 3, 12);
    const shallow = make({ groundHeights: new Float32Array(32 ** 2).fill(-0.1) });
    shallow.moveImmersedSphere('sphere', { x: 4, y: 0, z: 4, radiusM: r });
    expect(shallow.displacedVolumeM3).toBeGreaterThan(0);
    expect(shallow.displacedVolumeM3).toBeLessThan(patch.displacedVolumeM3);
    const bed = new Float32Array(32 ** 2).fill(-2);
    for (let z = 0; z < 32; z++) bed[z * 32 + 16] = 1;
    const divided = make({ groundHeights: bed });
    divided.moveImmersedSphere('sphere', { x: 2, y: -1, z: 4, radiusM: r });
    divided.moveImmersedSphere('sphere', { x: 6, y: -1, z: 4, radiusM: r });
    expect(divided.volumeOffsetM3).toBeCloseTo(4 / 3 * Math.PI * r ** 3, 12);
    expect(divided.fields[(16 * 32 + 8) * 4]).toBeCloseTo(0, 12);
  });

  it('bounds CFL work, catchup, object admission and suspend/retarget history', () => {
    const patch = make({ cellSizeM: 0.01, groundHeights: new Float32Array(32 ** 2).fill(-10), maxSubsteps: 5, maxSpheres: 2 });
    expect(patch.fixedStepS).toBeLessThanOrEqual(0.01 / Math.sqrt(2 * 9.81 * 10));
    patch.impulse({ x: 0.1, z: 0.1, radiusM: 0.05, energyJ: 0.001 });
    const advance = patch.advance(3600);
    expect(advance.steps).toBe(5);
    expect(advance.droppedS).toBeGreaterThan(3599);
    const sphere = { x: 0.1, y: -1, z: 0.1, radiusM: 0.02 };
    expect(patch.moveImmersedSphere('a', sphere)).toBe(true);
    expect(patch.moveImmersedSphere('b', sphere)).toBe(true);
    expect(patch.moveImmersedSphere('c', sphere)).toBe(false);
    expect(patch.diagnostics.rejectedSphereAdmissions).toBe(1);
    const revision = patch.revision, snapshot = patch.fields.slice();
    patch.setActive(false); expect(patch.advance(100).steps).toBe(0);
    expect(patch.sample(0.1, 0.1)).toBeNull();
    expect(patch.fields).toEqual(snapshot); expect(patch.revision).toBe(revision);
    patch.setActive(true); expect(patch.advance(patch.fixedStepS).steps).toBe(1);
    patch.initialize({ originX: 50, originZ: 50, bodyId: 'water.other', baseHeightM: 0, groundHeights: new Float32Array(32 ** 2).fill(-1) });
    expect(patch.bodyId).toBe('water.other'); expect(patch.volumeOffsetM3).toBe(0);
    expect(patch.trackedSphereCount).toBe(0); expect(patch.fields.every(value => value === 0)).toBe(true);
    expect(() => make({ size: 129 })).toThrow('128');
    expect(() => patch.advance(Infinity)).toThrow('finite');
  });

  it('samples the reusable Float32 GPU field at cell centres and reuses caller output', () => {
    const patch = make(); patch.impulse({ x: 4, z: 4, radiusM: 1, energyJ: 2 });
    const x = 14, z = 15, i = (z * patch.size + x) * 4;
    const out = { height: 0, slopeX: 0, slopeZ: 0, foam: 0 };
    expect(patch.sample((x + 0.5) * 0.25, (z + 0.5) * 0.25, out)).toBe(out);
    expect(out).toEqual({ height: patch.fields[i], slopeX: patch.fields[i + 1], slopeZ: patch.fields[i + 2], foam: patch.fields[i + 3] });
    expect(patch.sample(-0.001, 1)).toBeNull(); expect(patch.sample(8, 1)).toBeNull();
  });

  it('runs the maximum 128-cell patch with bounded fixed steps and finite reusable fields', () => {
    const patch = make({ size: 128 });
    patch.impulse({ x: 16, z: 16, radiusM: 1, energyJ: 4 });
    const fields = patch.fields, mask = patch.wetMask;
    for (let frame = 0; frame < 60; frame++) expect(patch.advance(1 / 60).steps).toBe(2);
    expect(patch.fields).toBe(fields); expect(patch.wetMask).toBe(mask);
    expect(patch.diagnostics.steps).toBe(120);
    expect(patch.diagnostics.droppedTimeS).toBe(0);
    expect(patch.fields.every(Number.isFinite)).toBe(true);
    expect(Math.abs(patch.volumeOffsetM3)).toBeLessThan(1e-11);
  });
});
