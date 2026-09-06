import { describe, expect, it } from 'vitest';
import { LocalWaterPatch } from './LocalWaterPatch';
import { WaterDisplacementRegistry } from './displacementRegistry';
import { WaterContactEmitter } from './contactEmitter';
import { WaterRigidBodyDriver, type WaterRigidBody } from './rigidBody';
import { WaterWorld } from './waterWorld';
import { WaterData, type WaterMeta } from './waterData';
import type { WaterDisplacementSphere } from '@elder-souls/contracts';

function patch(originX = 0) {
  return new LocalWaterPatch({ size: 32, cellSizeM: 0.25, originX, originZ: 0, bodyId: 'water.pool',
    baseHeightM: 0, groundHeights: new Float32Array(32 ** 2).fill(-10) });
}
function world() {
  const meta: WaterMeta = { surface: { file: '', size: 2, metresPerPixel: 64, gridOriginM: 0, minM: 0, maxM: 1, buryM: 0 },
    flow: { file: '', size: 2, metresPerPixel: 64, gridOriginM: 0, flowMax: 0, shoreMaxM: 1 },
    klass: { file: '', size: 2, metresPerPixel: 64, gridOriginM: 0, classes: ['none', 'lake'] },
    bodies: [{ index: 1, id: 'water.pool' }] };
  const data = new WaterData(meta, new Float32Array(4), new Float32Array(4).fill(10), new Uint8ClampedArray(16),
    new Uint8ClampedArray([1, 0, 0, 255, 1, 0, 0, 255, 1, 0, 0, 255, 1, 0, 0, 255]), undefined, undefined,
    new Uint8ClampedArray([255, 0, 1, 255, 255, 0, 1, 255, 255, 0, 1, 255, 255, 0, 1, 255]));
  return new WaterWorld(data, { tidalAmplitudeM: 0, seasonalAmplitudeM: 0, seasonScalar: () => 0 });
}
const sphere = (x = 4): WaterDisplacementSphere => ({ center: { x, y: -1, z: 4 }, radiusM: 0.3 });
const sphereVolume = 4 / 3 * Math.PI * 0.3 ** 3;

describe('persistent bounded object water displacement', () => {
  it('holds stationary volume without repeated impulses and replays/removes patch occupancy', () => {
    const water = world(), p = patch();
    water.setDisplacementSpheres('prop', [sphere()]);
    water.setLocalPatch(p);
    expect(p.displacedVolumeM3).toBeCloseTo(sphereVolume, 12);
    expect(p.baselineDisplacedVolumeM3).toBeCloseTo(sphereVolume, 12);
    expect(p.energyJ).toBe(0);
    const revision = p.revision;
    for (let frame = 0; frame < 20; frame++) water.setDisplacementSpheres('prop', [sphere()]);
    expect(p.revision).toBe(revision);
    expect(p.volumeOffsetM3).toBe(0);
    const next = patch(100);
    water.setLocalPatch(next);
    expect(p.displacedVolumeM3).toBe(0); expect(p.volumeOffsetM3).toBeCloseTo(0, 12);
    expect(next.displacedVolumeM3).toBe(0);
    water.setDisplacementSpheres('prop', [sphere(104)]);
    expect(next.displacedVolumeM3).toBeCloseTo(sphereVolume, 12);
    next.advance(1 / 60); water.setDisplacementSpheres('prop', [sphere(104.5)]);
    water.setDisplacementSpheres('prop', null);
    expect(next.displacedVolumeM3).toBe(0); expect(next.volumeOffsetM3).toBeCloseTo(0, 12);
    expect(next.energyJ).toBeGreaterThan(0);
    expect(water.drainInteractions()).toEqual([]);
  });

  it('copies caller-owned arrays and bounds registry and complete actor patch admissions', () => {
    const registry = new WaterDisplacementRegistry(), p = patch(); registry.setPatch(p);
    const mutable = [sphere()]; registry.set('actor', mutable);
    mutable[0].center.x += 0.5;
    expect(registry.set('actor', mutable)).toBe(true);
    expect(p.volumeOffsetM3).toBeCloseTo(sphereVolume, 12);
    registry.clear();
    const revision = p.revision;
    registry.set('batch', [sphere(2), sphere(3), sphere(4), sphere(5)]);
    expect(p.revision).toBe(revision + 1);
    expect(registry.set('batch', Array.from({ length: 9 }, () => sphere()))).toBe(false);
    expect(p.displacedVolumeM3).toBe(0);
    expect(registry.actorCount).toBe(0);
    for (let actor = 0; actor < 3; actor++) registry.set(`hull.${actor}`, Array.from({ length: 8 }, () => sphere(2 + actor)));
    expect(p.trackedSphereCount).toBe(16);
    expect(registry.diagnostics.deferredPatchActors).toBe(1);
    expect(p.displacedVolumeM3).toBeCloseTo(16 * sphereVolume, 11);
    const stableRevision = p.revision;
    registry.set('hull.2', Array.from({ length: 8 }, () => sphere(4.01)));
    expect(p.revision).toBe(stableRevision); // a nearer deferred hull cannot churn admitted actors
    registry.clear(); expect(p.trackedSphereCount).toBe(0);
    for (let actor = 0; actor < 16; actor++) expect(registry.set(`hull.${actor}`, Array.from({ length: 8 }, () => sphere()))).toBe(true);
    expect(registry.proxyCount).toBe(128);
    expect(registry.set('over-budget', [sphere()])).toBe(false);
    expect(registry.diagnostics.rejectedProxySets).toBe(2);
    registry.clear();
    for (let actor = 0; actor < 64; actor++) expect(registry.set(`actor.${actor}`, [sphere()])).toBe(true);
    expect(registry.set('actor.65', [sphere()])).toBe(false);
    expect(registry.actorCount).toBe(64);
    expect(registry.diagnostics.rejectedActors).toBe(1);
    p.setActive(false); registry.clear(); expect(p.displacedVolumeM3).toBe(0);
  });

  it('quietly seeds stationary existing bodies and only physical removal changes their baseline water volume', () => {
    const registry = new WaterDisplacementRegistry(), p = patch();
    registry.set('stationary', [sphere()]); registry.setPatch(p);
    expect(p.energyJ).toBe(0); expect(p.volumeOffsetM3).toBe(0);
    const revision = p.revision;
    expect(p.advance(1 / 60).steps).toBe(0); expect(p.energyJ).toBe(0); expect(p.revision).toBe(revision);
    registry.set('stationary', null);
    expect(p.displacedVolumeM3).toBe(0);
    expect(p.volumeOffsetM3).toBeCloseTo(-p.baselineDisplacedVolumeM3, 12);
    expect(p.energyJ).toBeGreaterThan(0);
  });

  it('registers a capsule-volume approximation through full immersion and removes it on exit/dispose', () => {
    const water = world(), p = patch(), radius = 0.3, height = 1.4;
    water.setLocalPatch(p);
    const emitter = new WaterContactEmitter('player', radius, height);
    const feet = { x: 4, y: -3, z: 4 };
    emitter.update(water, 0, feet, 0, 1 / 60);
    const volume = Math.PI * radius ** 2 * (height - 2 * radius) + 4 / 3 * Math.PI * radius ** 3;
    expect(p.displacedVolumeM3).toBeCloseTo(volume, 12);
    expect(water.displacementRegistry.proxyCount).toBe(4);
    emitter.update(water, 0, { ...feet, y: 3 }, 0, 1 / 60);
    expect(p.displacedVolumeM3).toBe(0);
    emitter.update(water, 0, feet, 0, 1 / 60); emitter.dispose();
    expect(p.displacedVolumeM3).toBe(0); expect(water.displacementRegistry.actorCount).toBe(0);
  });

  it('uses driver authored volume once, rotates proxies, and disposes without duplicate contact registration', () => {
    const water = world(), p = patch(); water.setLocalPatch(p);
    let position = { x: 4, y: -2, z: 4 };
    const body: WaterRigidBody = { translation: () => position, worldCom: () => position,
      rotation: () => ({ x: 0, y: 0, z: 0, w: 1 }), linvel: () => ({ x: 0, y: 0, z: 0 }),
      angvel: () => ({ x: 0, y: 0, z: 0 }), applyImpulseAtPoint: () => {} };
    const driver = new WaterRigidBodyDriver({ actorId: 'crate', halfExtentsM: { x: 0.4, y: 0.4, z: 0.4 },
      buoyancy: { volumeM3: 0.512, linearDrag: 0, points: [{ x: -0.2, y: 0, z: 0 }, { x: 0.2, y: 0, z: 0 }] } });
    driver.step(water, 0, body, 1 / 60);
    expect(water.displacementRegistry.actorCount).toBe(1);
    expect(water.displacementRegistry.proxyCount).toBe(2);
    expect(p.displacedVolumeM3).toBeCloseTo(0.512, 12);
    const revision = p.revision;
    driver.step(water, 0, body, 1 / 60); expect(p.revision).toBe(revision);
    position = { ...position, x: 4.4 }; driver.step(water, 0, body, 1 / 60);
    expect(p.displacedVolumeM3).toBeCloseTo(0.512, 12);
    driver.reset(); expect(p.displacedVolumeM3).toBe(0);
    driver.step(water, 0, body, 1 / 60); driver.dispose();
    expect(water.displacementRegistry.actorCount).toBe(0);
  });
});
