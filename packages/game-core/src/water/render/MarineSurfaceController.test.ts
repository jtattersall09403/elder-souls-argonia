import { describe, expect, it, vi } from 'vitest';
import type { WaterData } from '../waterData';
import { MarineSurfaceController } from './MarineSurfaceController';
import * as THREE from 'three';

vi.mock('./marineSeamPatch', () => ({ marineNearBounds: (x: number, z: number) => ({ minX: x - 8, minZ: z - 8, maxX: x + 8, maxZ: z + 8 }),
 marineSeamPatchSteps: function* (_data: unknown, _sources: unknown, bounds: unknown) {
  for (let i = 0; i < 4; i++) yield;
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(9), 3));
  geometry.setAttribute('waterCellSize', new THREE.Float32BufferAttribute([.125, .125, .125], 1)); geometry.setIndex([0, 1, 2]);
  return { geometry, bounds, boundaryEdges: [], diagnostics: { sourceTriangles: 1, triangles: 1, vertices: 3, bytes: 90, subdivision: 8, scannedTriangles: 1 } };
} }));

const data = (native = true) => ({ meta: { surface: { size: 129, metresPerPixel: 1, nativeChannelCoverage: native } } }) as WaterData;
const coarse = [{ tx: 0, tz: 0 }, { tx: 0, tz: 1 }, { tx: 1, tz: 0 }, { tx: 1, tz: 1 }];

describe('marine displayed-geometry readiness controller', () => {
  it('requires actual publication of every requested coarse tile and replaces batch snapshots atomically', () => {
    const controller = new MarineSurfaceController(data());
    controller.setRequiredCoarse(coarse);
    expect(controller.readyForActivation).toBe(false);
    controller.publishCoarseBatch('a', coarse.slice(0, 3));
    expect(controller.readyForActivation).toBe(false);
    controller.publishCoarseBatch('b', coarse.slice(3));
    expect(controller.readyForActivation).toBe(true);
    expect(controller.coarseGridSize).toBe(3);
    const mask = new Float32Array(9); controller.fillCoarseMask(mask);
    expect(Array.from(mask)).toEqual([1, 1, 0, 1, 1, 0, 0, 0, 0]);
    expect(() => controller.fillCoarseMask(new Float32Array(4))).toThrow(RangeError);
    controller.publishCoarseBatch('overlap', coarse.slice(3));
    controller.publishCoarseBatch('b', []);
    expect(controller.readyForActivation).toBe(true);
    controller.publishCoarseBatch('overlap', []);
    expect(controller.readyForActivation).toBe(false);
    expect(() => controller.publishCoarseBatch('a', [{ tx: 999, tz: 0 }])).toThrow(RangeError);
    expect(controller.diagnostics.coarseTiles).toBe(3);
    controller.dispose(); expect(controller.readyForActivation).toBe(false);
  });

  it('waits for actual source coverage and preserves coarse while a seam-safe patch is prepared', () => {
    let ready = false;
    const controller = new MarineSurfaceController(data(), { buildStepsPerUpdate: 1,
      coarseSnapshot: () => ready ? { revision: 'a', sources: [] } : null });
    controller.update(8, 8); expect(controller.diagnostics.activeBuild).toBe(false);
    controller.publishCoarseBatch('a', [coarse[0]]);
    ready = true;
    controller.update(8, 8); expect(controller.diagnostics.preparedNearTiles).toBe(0);
    for (let i = 0; i < 4; i++) controller.update(8, 8);
    expect(controller.diagnostics.preparedNearTiles).toBe(1);
    expect(controller.displayedNear).toHaveLength(0); // No renderer transaction yet.
    expect(controller.preparedNear[0].geometry.getAttribute('waterCellSize').getX(0)).toBe(.125);
    controller.dispose(); expect(controller.preparedNear).toHaveLength(0);
  });

  it('publishes only after the renderer accepts the handoff and withdraws old ownership on move/disposal', () => {
    let stitched = false;
    const publishNear = vi.fn(() => stitched), withdrawNear = vi.fn();
    const controller = new MarineSurfaceController(data(), { publishNear, withdrawNear, buildStepsPerUpdate: 32,
      coarseSnapshot: () => ({ revision: 'a', sources: [] }) });
    controller.publishCoarseBatch('a', coarse);
    controller.update(8, 8); expect(controller.displayedNear).toHaveLength(0);
    stitched = true; controller.update(8, 8);
    expect(controller.displayedNear).toHaveLength(1);
    controller.update(64, 64);
    expect(withdrawNear).toHaveBeenCalledTimes(1);
    expect(controller.preparedNear).toHaveLength(1);
    expect(controller.displayedNear).toHaveLength(1);
    expect(controller.diagnostics.preparedBytes).toBe(90);
    controller.update(64, 64, false); expect(withdrawNear).toHaveBeenCalledTimes(2);
    expect(controller.displayedNear).toHaveLength(0); expect(controller.diagnostics.coarseTiles).toBe(4);
    controller.dispose(); expect(withdrawNear).toHaveBeenCalledTimes(2);
    controller.dispose(); expect(withdrawNear).toHaveBeenCalledTimes(2);
  });

  it('cancels obsolete incremental work and leaves the legacy data path inactive', () => {
    const controller = new MarineSurfaceController(data(), { buildStepsPerUpdate: 1, coarseSnapshot: () => ({ revision: 'a', sources: [] }) });
    controller.publishCoarseBatch('a', coarse); controller.update(8, 8); controller.update(64, 64);
    expect(controller.diagnostics.cancelledBuilds).toBe(1);
    expect(controller.diagnostics.preparedNearTiles).toBeLessThanOrEqual(4);
    const legacy = new MarineSurfaceController(data(false));
    legacy.publishCoarseBatch('a', coarse); legacy.update(8, 8);
    expect(legacy.diagnostics.enabled).toBe(false); expect(legacy.readyForActivation).toBe(false);
    expect(legacy.diagnostics.activeBuild).toBe(false);
    controller.dispose(); legacy.dispose();
  });

  it('retains an unchanged old seam during movement preparation, but not after its own source changes', () => {
    let oldRevision = 'a';
    const order: string[] = [];
    const controller = new MarineSurfaceController(data(), { buildStepsPerUpdate: 1,
      coarseSnapshot: bounds => ({ revision: bounds.minX === 0 ? oldRevision : 'new', sources: [] }),
      publishNear: tile => { order.push(`publish:${tile.x}`); return true; },
      withdrawNear: tile => { order.push(`withdraw:${tile.x}`); } });
    for (let i = 0; i < 5; i++) controller.update(8, 8);
    expect(controller.displayedNear[0].x).toBe(0);
    controller.update(64, 64);
    expect(controller.diagnostics.activeBuild).toBe(true);
    expect(controller.displayedNear[0].x).toBe(0);
    expect(order).toEqual(['publish:0']);
    for (let i = 0; i < 4; i++) controller.update(64, 64);
    expect(order).toEqual(['publish:0', 'publish:56', 'withdraw:0']);
    expect(controller.displayedNear.map(tile => tile.x)).toEqual([56]);
    expect(controller.preparedNear).toHaveLength(1);
    // Move back, finish, then invalidate that displayed parent while another
    // candidate is preparing: stale near geometry must disappear immediately.
    for (let i = 0; i < 5; i++) controller.update(8, 8);
    controller.update(64, 64); oldRevision = 'replaced'; controller.update(64, 64);
    expect(controller.displayedNear).toHaveLength(0);
    expect(order.at(-1)).toBe('withdraw:0');
    controller.dispose();
  });
});
