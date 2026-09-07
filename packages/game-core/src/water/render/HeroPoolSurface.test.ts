import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { WaterData, type WaterMeta } from '../waterData';
import { WaterWorld } from '../waterWorld';
import { LocalWaterPatch } from '../LocalWaterPatch';
import { sampleLocalPatchSurface, localWaterVertexCoordinate, LOCAL_WATER_SURFACE_GLSL } from '../localPatchPresentation';
import { HeroPoolSurface, HERO_POOL_SIZE } from './HeroPoolSurface';
import type { WaterAssets } from './types';
import { createWaterMaterial, createWaterUniforms, WATER_TIERS } from './waterMaterial';
import { waterGeometryBytes } from './waterStreaming';

function fixture(speed = 0): WaterAssets {
  const size = 65, grid = { size, metresPerPixel: 1, gridOriginM: 0, file: '' };
  const meta: WaterMeta = { schemaVersion: 2, bodies: [{ index: 1, id: 'pool' }, { index: 2, id: 'foreign' }],
    surface: { ...grid, minM: 0, maxM: 10, buryM: 3 }, flow: { ...grid, flowMax: 3, shoreMaxM: 160 },
    klass: { ...grid, classes: ['none', 'coast', 'estuary', 'river', 'lake'] } };
  const support = new Uint8ClampedArray(size ** 2 * 4), klass = support.slice(), flow = support.slice();
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    const i = (z * size + x) * 4;
    support[i] = x === 25 ? 0 : 255; support[i + 2] = x < 38 ? 1 : 2;
    klass[i] = 4; flow[i] = Math.round(127.5 + speed / 6 * 255); flow[i + 1] = 128;
  }
  const data = new WaterData(meta, new Float32Array(size ** 2).fill(5), new Float32Array(size ** 2).fill(2), flow, klass,
    new Float32Array(size ** 2).fill(10), undefined, support);
  const world = new WaterWorld(data, { tidalAmplitudeM: 0, seasonalAmplitudeM: 0, seasonScalar: () => 0, waveTimeS: () => 0 });
  const texture = new THREE.DataTexture();
  return { data, world, meta, surfaceTex: texture, flowTex: texture, klassTex: texture, shoreTex: texture,
    supportTex: texture, characterTex: texture, tidalAmplitudeM: 0, seasonalAmplitudeM: 0 };
}

function admit(hero: HeroPoolSurface, material: THREE.Material, scale = 1) {
  for (let frame = 1; frame < 160 && !hero.patch; frame++) {
    hero.update(30, 6, 32, frame / 120, 0, 0, material, scale);
    expect(hero.diagnostics.admissionBatchesLastUpdate).toBeLessThanOrEqual(2);
  }
  expect(hero.patch).not.toBeNull();
}

describe('local pool surface presentation', () => {
  it('excludes deep but nearly disconnected access saddles from the local simulation domain', () => {
    const assets = fixture(), original = assets.world.sampleBoundary.bind(assets.world);
    const boundary = vi.spyOn(assets.world, 'sampleBoundary').mockImplementation((x, z, epoch) => ({ ...original(x, z, epoch),
      wetMarginM: x >= 31 && x < 31.25 ? 0.005 : 1 }));
    const hero = new HeroPoolSurface(assets), material = new THREE.MeshBasicMaterial();
    try {
      hero.update(30, 6, 32, 0, 0, 0, material); admit(hero, material);
      expect(assets.world.sampleBoundary(31.125, 32, 0).depth).toBeGreaterThan(1);
      expect(hero.patch!.sample(31.125, 32)).toBeNull();
      expect(hero.patch!.sample(30.125, 32)).not.toBeNull();
      expect(hero.patch!.sample(32.125, 32)).not.toBeNull();
    } finally { hero.dispose(); material.dispose(); boundary.mockRestore(); }
  });
  it('samples the exact submitted triangles including the C1 boundary envelope without changing conservative storage', () => {
    const patch = new LocalWaterPatch({ size: 32, cellSizeM: 0.25, originX: 1000, originZ: 3000, bodyId: 'pool', baseHeightM: 5,
      groundHeights: new Float32Array(32 ** 2).fill(3) });
    for (let i = 0; i < patch.fields.length; i += 4) { patch.fields[i] = 0.1; patch.fields[i + 3] = 0.2; }
    expect(sampleLocalPatchSurface(patch, 1000, 3004)).toMatchObject({ height: 0, slopeX: 0, slopeZ: 0, foam: 0 });
    for (const x of [1000.1, 1001, 1002, 1004, 1007.8]) {
      const s = sampleLocalPatchSurface(patch, x, 3004)!;
      const i = Math.floor((x - 1000) / 0.25 + 0.5);
      const lo = localWaterVertexCoordinate(i, 32, 0.25), hi = localWaterVertexCoordinate(i + 1, 32, 0.25);
      const f = (x - 1000 - lo) / (hi - lo);
      const a = sampleLocalPatchSurface(patch, 1000 + lo, 3004)!;
      const b = hi === 8 ? { height: 0, slopeX: 0 } : sampleLocalPatchSurface(patch, 1000 + hi, 3004)!;
      expect(s.height).toBeCloseTo(a.height * (1 - f) + b.height * f, 10);
      expect(s.slopeX).toBeCloseTo(a.slopeX * (1 - f) + b.slopeX * f, 10);
    }
    expect(patch.fields[0]).toBeCloseTo(0.1);
    expect(sampleLocalPatchSurface(patch, 1008, 3004)).toBeNull();
  });

  it('keeps one anchored domain, clips foreign/dry cells and submits at most 33282 triangles / one draw', () => {
    const assets = fixture(), hero = new HeroPoolSurface(assets), material = new THREE.MeshBasicMaterial();
    try {
      hero.update(30, 6, 32, 0, 0, 0, material, 2);
      expect(hero.patch).toBeNull(); expect(hero.state.active).toBe(false);
      hero.emit({ kind: 'enter', position: { x: 30, y: 5, z: 32 }, velocity: { x: 0, y: -3, z: 0 }, magnitude: 150 });
      expect(hero.diagnostics.pendingEvents).toBe(1);
      admit(hero, material, 2);
      const patch = hero.patch!;
      expect(patch.energyJ).toBeGreaterThan(0); expect(hero.diagnostics.pendingEvents).toBe(0);
      expect(assets.world.localPatch).toBe(patch);
      expect(patch.sample(25, 32)).toBeNull();
      expect(patch.sample(40, 32)).toBeNull();
      expect(hero.mesh.geometry.index!.count / 3).toBeLessThanOrEqual(33282);
      expect(hero.mesh.geometry.groups).toHaveLength(0);
      expect(waterGeometryBytes(hero.mesh.geometry)).toBeLessThan(1.5 * 1024 ** 2);
      const indices = hero.mesh.geometry.index!, positions = hero.mesh.geometry.getAttribute('position');
      // Centre-aligned quads retain their half-cell shore strip; fragment
      // masking, not whole-triangle removal, rejects the dry/foreign portion.
      expect(positions.getX(0)).toBe(patch.originX);
      expect(positions.getX(1)).toBe(patch.originX + 0.125);
      expect(positions.getX(HERO_POOL_SIZE + 1)).toBe(patch.originX + 32);
      patch.moveImmersedSphere('regression', { x: 30, y: 4.4, z: 32, radiusM: 0.4 });
      let largestDisplacement = 0;
      for (let i = 0; i < indices.count; i += 3) {
        let x = 0, z = 0, renderedHeight = 0;
        for (let j = 0; j < 3; j++) {
          const index = indices.getX(i + j), vx = positions.getX(index), vz = positions.getZ(index);
          x += vx / 3; z += vz / 3;
          renderedHeight += (sampleLocalPatchSurface(patch, vx, vz)?.height ?? 0) / 3;
        }
        const sample = sampleLocalPatchSurface(patch, x, z);
        if (sample) {
          expect(sample.height).toBeCloseTo(renderedHeight, 9);
          largestDisplacement = Math.max(largestDisplacement, sample.height);
        }
      }
      expect(largestDisplacement).toBeGreaterThan(0.1);
      patch.moveImmersedSphere('regression', null);
      hero.update(32, 6, 33, 1, 1 / 60, 0, material, 2);
      expect(hero.patch).toBe(patch); expect(hero.diagnostics.domainBuilds).toBe(1);
      expect(hero.mesh.geometry.boundingBox!.max.y).toBe(26);
      hero.emit({ kind: 'enter', position: { x: 30, y: 5, z: 32 }, velocity: { x: 0, y: -3, z: 0 }, magnitude: 150 });
      hero.sync();
      expect(patch.energyJ).toBeGreaterThan(0);
      expect(patch.volumeOffsetM3).toBeCloseTo(0, 10);
      const pixels = hero.field.image.data as Float32Array;
      expect(pixels.byteLength).toBe(128 * 128 * 16);
      for (let i = 0; i < HERO_POOL_SIZE ** 2; i++) {
        expect(pixels[i * 4]).toBe(patch.fields[i * 4]);
        expect(pixels[i * 4 + 3] >= 1.5).toBe(!!patch.wetMask[i]);
        expect(pixels[i * 4 + 3] - 2 * patch.wetMask[i]).toBeCloseTo(patch.fields[i * 4 + 3], 6);
      }
      hero.update(200, 6, 200, 2, 0, 0, material);
      expect(hero.patch).toBeNull(); expect(assets.world.localPatch).toBeNull();
    } finally { hero.dispose(); material.dispose(); }
  });

  it('bounds steady-state solver work and reuses the upload without camera-driven domain churn', () => {
    const hero = new HeroPoolSurface(fixture()), material = new THREE.MeshBasicMaterial();
    const start = performance.now();
    hero.update(30, 6, 32, 0, 0, 0, material);
    admit(hero, material);
    const admissionMs = performance.now() - start, pixels = hero.field.image.data;
    for (let i = 1; i <= 20; i++) hero.update(30, 6, 32, i / 60, 1 / 60, 0, material);
    const stepStart = performance.now();
    for (let i = 21; i <= 140; i++) hero.update(30, 6, 32, i / 60, 1 / 60, 0, material);
    const frameMs = (performance.now() - stepStart) / 120;
    expect(hero.field.image.data).toBe(pixels);
    expect(hero.diagnostics.domainBuilds).toBe(1);
    expect(hero.patch!.diagnostics.droppedTimeS).toBe(0);
    expect(hero.patch!.diagnostics.steps).toBeLessThanOrEqual(140 * 24);
    if (process.env.WATER_BENCH) process.stdout.write(JSON.stringify({ heroAdmissionMs: admissionMs, heroUpdateMs: frameMs,
      geometryBytes: waterGeometryBytes(hero.mesh.geometry), textureBytes: (pixels as Float32Array).byteLength }) + '\n');
    hero.dispose(); material.dispose();
  });

  it('cancels obsolete admission and retains only a bounded recent same-owner event queue', () => {
    const hero = new HeroPoolSurface(fixture()), material = new THREE.MeshBasicMaterial();
    hero.update(30, 6, 32, 0, 0, 0, material);
    for (let i = 0; i < 50; i++) hero.emit({ kind: 'wake', position: { x: 30, y: 5, z: 32 }, magnitude: 10 });
    expect(hero.diagnostics.pendingEvents).toBe(24);
    hero.emit({ kind: 'enter', position: { x: 40, y: 5, z: 32 }, magnitude: 100 });
    expect(hero.diagnostics.pendingEvents).toBe(24);
    hero.update(200, 6, 200, 0.5, 0, 0, material);
    expect(hero.diagnostics.admissionCancelled).toBe(1);
    expect(hero.diagnostics.pendingEvents).toBe(0);
    expect(hero.patch).toBeNull(); expect(hero.mesh.visible).toBe(false);
    hero.dispose(); material.dispose();
  });

  it('does not admit flowing channels and wires shared sampler in both shader stages without reclassifying hero water as river', () => {
    const assets = fixture(1), hero = new HeroPoolSurface(assets), dummy = new THREE.MeshBasicMaterial();
    hero.update(30, 6, 32, 0, 0, 0, dummy);
    expect(hero.patch).toBeNull(); hero.dispose(); dummy.dispose();
    const uniforms = createWaterUniforms(assets);
    const material = createWaterMaterial('above', { csm: null, applyAerial: () => {}, assets, uniforms, tier: WATER_TIERS.low });
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
    material.onBeforeCompile(shader as Parameters<typeof material.onBeforeCompile>[0], {} as THREE.WebGLRenderer);
    expect(shader.vertexShader).toContain(LOCAL_WATER_SURFACE_GLSL);
    expect(shader.fragmentShader).toContain(LOCAL_WATER_SURFACE_GLSL);
    expect(shader.vertexShader).toContain('waterOverride.w > 0.5 && waterOverride.w < 1.5) esKl.r = 3.0');
    expect(shader.fragmentShader).toContain('abs(owner - uLocalWaterBody) < 0.5');
    expect(shader.vertexShader).toContain('esW.disp.y += local.x');
    expect(shader.fragmentShader).toContain('float esFall = smoothstep(1.2, 3.0, esRenderedFlow.z);');
    expect(shader.fragmentShader).not.toContain('dFdx(vEsData.x)');
    material.dispose();
  });
});
