import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { WaterData, type WaterMeta } from '../waterData';
import { NativeWaterAtlas } from './NativeWaterAtlas';
import { MarineWaterSurface } from './MarineWaterSurface';
import type { WaterUniforms } from './waterMaterial';

function fixture() {
  const grid = { size: 33, metresPerPixel: 1, gridOriginM: 0, file: '' };
  const meta: WaterMeta = { surface: { ...grid, minM: 0, maxM: 1, buryM: 3, nativeChannelCoverage: true },
    flow: { ...grid, flowMax: 3, shoreMaxM: 160 }, klass: { ...grid, classes: ['none', 'coast'] },
    bodies: [{ index: 1, id: 'sea' }] };
  const n = grid.size ** 2, support = new Uint8ClampedArray(n * 4), klass = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) { support.set([255, 0, 1, 255], i * 4); klass.set([1, 0, 255, 255], i * 4); }
  const data = new WaterData(meta, new Float32Array(n), new Float32Array(n).fill(5), new Uint8ClampedArray(n * 4), klass,
    undefined, new Float32Array(n).fill(.2), support);
  // Only these three uniforms belong to the wrapper; no shader/WebGL mock.
  const fields: Pick<WaterUniforms, 'uMarineCoverageInfo' | 'uMarineNearCount' | 'uMarineNearRects'> = {
    uMarineCoverageInfo: { value: new THREE.Vector4() }, uMarineNearCount: { value: 0 },
    uMarineNearRects: { value: Array.from({ length: 4 }, () => new THREE.Vector4()) },
  };
  return { data, fields, uniforms: fields as WaterUniforms, atlas: new NativeWaterAtlas(undefined, 1), material: new THREE.MeshBasicMaterial() };
}
const stage = { tidalAmplitudeM: .5, seasonalAmplitudeM: 1.4 };
const view = { position: { x: 16, y: 2, z: 16 }, pixelsPerRadian: 600, farM: 100 };
function frame(surface: MarineWaterSurface, material: THREE.Material, y = 2) {
  surface.update(16, 16, { x: 16, y, z: 16 }, material, 1, view);
}
function finishNear(surface: MarineWaterSurface, material: THREE.Material) {
  for (let i = 0; i < 600 && surface.controller.displayedNear.length === 0; i++) frame(surface, material);
  expect(surface.controller.diagnostics.buildFailure).toBeNull();
  expect(surface.controller.displayedNear).toHaveLength(1);
}
function mask(atlas: NativeWaterAtlas): number[] {
  return Array.from((atlas.field.image.data as Float32Array).slice(atlas.auxiliaryOffset, atlas.auxiliaryOffset + atlas.auxiliaryScalars));
}
function assertNearTransaction(surface: MarineWaterSurface, uniforms: WaterUniforms) {
  const actual = surface.group.children.filter(child => child instanceof THREE.Mesh) as THREE.Mesh[];
  expect(uniforms.uMarineNearCount.value).toBe(actual.length);
  actual.forEach((mesh, i) => expect(uniforms.uMarineNearRects.value[i].toArray()).toEqual(mesh.userData.marineRect.toArray()));
  expect(actual.map(mesh => mesh.geometry)).toEqual(surface.controller.displayedNear.map(tile => tile.geometry));
}

describe('marine displayed mesh / replacement mask transaction', () => {
  it('publishes only actual coarse draws, then atomically adds and removes the near replacement in fly mode', () => {
    const f = fixture(), surface = new MarineWaterSurface(f.data, false, stage, f.atlas, f.uniforms);
    surface.controller.setRequiredCoarse([{ tx: 0, tz: 0 }]);
    expect(mask(f.atlas)).toEqual([0]); expect(surface.controller.readyForActivation).toBe(false);
    const write = f.atlas.writeAuxiliary.bind(f.atlas);
    const transactions: { mask: number[]; draws: number }[] = [];
    vi.spyOn(f.atlas, 'writeAuxiliary').mockImplementation((offset, values) => {
      write(offset, values);
      // The public draw-list cache updates at the end of update(); scene
      // membership is the authoritative publication transaction here.
      transactions.push({ mask: mask(f.atlas), draws: surface.coarse.group.children.length });
      const displayed = surface.coarse.group.children.some(mesh => mesh.userData.waterTiles?.some((tile: { tx: number; tz: number }) => tile.tx === 0 && tile.tz === 0));
      expect(mask(f.atlas)).toEqual([displayed ? 1 : 0]);
    });
    try {
      finishNear(surface, f.material);
      expect(transactions.some(t => t.draws > 0 && t.mask[0] === 1)).toBe(true);
      expect(surface.controller.readyForActivation).toBe(true); expect(mask(f.atlas)).toEqual([1]);
      assertNearTransaction(surface, f.uniforms);
      const geometry = surface.controller.displayedNear[0].geometry, disposed = vi.fn(); geometry.addEventListener('dispose', disposed);
      frame(surface, f.material, 416);
      assertNearTransaction(surface, f.uniforms); expect(f.fields.uMarineNearCount.value).toBe(0);
      expect(disposed).toHaveBeenCalledTimes(1); expect(mask(f.atlas)).toEqual([1]);
      expect(surface.controller.readyForActivation).toBe(true); expect(surface.controller.diagnostics.activeBuild).toBe(false);
      finishNear(surface, f.material); assertNearTransaction(surface, f.uniforms);
    } finally {
      vi.restoreAllMocks(); surface.dispose(); f.atlas.dispose(); f.material.dispose();
    }
  });

  it('does not let an old tier cleanup erase a replacement tier that already owns displayed coverage', () => {
    const f = fixture(), old = new MarineWaterSurface(f.data, false, stage, f.atlas, f.uniforms);
    let next: MarineWaterSurface | undefined;
    try {
      finishNear(old, f.material);
      next = new MarineWaterSurface(f.data, true, stage, f.atlas, f.uniforms); finishNear(next, f.material);
      expect(mask(f.atlas)).toEqual([1]); assertNearTransaction(next, f.uniforms);
      old.dispose();
      // No intervening new publication is required to restore ownership.
      expect(mask(f.atlas)).toEqual([1]); expect(f.fields.uMarineCoverageInfo.value.w).toBe(1);
      assertNearTransaction(next, f.uniforms);
      frame(next, f.material); expect(mask(f.atlas)).toEqual([1]); assertNearTransaction(next, f.uniforms);
    } finally { old.dispose(); next?.dispose(); f.atlas.dispose(); f.material.dispose(); }
  });

  it('resets all live replacement fields and disposes owned geometry exactly once', () => {
    const f = fixture(), surface = new MarineWaterSurface(f.data, false, stage, f.atlas, f.uniforms);
    try {
      finishNear(surface, f.material);
      const geometry = surface.controller.displayedNear[0].geometry, disposed = vi.fn(); geometry.addEventListener('dispose', disposed);
      surface.dispose(); surface.dispose(); frame(surface, f.material);
      expect(mask(f.atlas)).toEqual([0]); expect(f.fields.uMarineCoverageInfo.value.w).toBe(0);
      expect(f.fields.uMarineNearCount.value).toBe(0); expect(surface.group.children).toHaveLength(0);
      expect(surface.meshes).toHaveLength(0); expect(surface.controller.readyForActivation).toBe(false);
      expect(surface.controller.diagnostics.activeBuild).toBe(false); expect(disposed).toHaveBeenCalledTimes(1);
    } finally { surface.dispose(); f.atlas.dispose(); f.material.dispose(); }
  });
});
