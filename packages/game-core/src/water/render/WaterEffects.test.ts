import { describe, expect, it } from "vitest";
import type { Vec3, WaterInteractionEvent, WorldWaterQuery } from "@elder-souls/contracts";
import { WaterEffects, waterEmissionProfile, WATER_PARTICLE_MAX_PATH_STEP_M, WATER_PARTICLE_MAX_PATH_STEPS } from "./WaterEffects";
import { WaterContactEmitter } from "../contactEmitter";
import { Frustum, Matrix4, PerspectiveCamera } from "three";

const camera = { x: 0, y: 3, z: 4 };
const impact: WaterInteractionEvent = {
  kind: "splash", position: { x: 0, y: 0, z: 0 },
  velocity: { x: 1, y: -5, z: 0 }, radius: 0.5, magnitude: 100,
};

function waterQuery(wet: (p: Vec3) => boolean = () => true, flow = { x: 0, y: 0, z: 0 }): WorldWaterQuery {
  return {
    sample: (p) => ({ waterBodyId: wet(p) ? "water.test.pool" : null, surfaceHeight: 0,
      surfaceNormal: { x: 0, y: 1, z: 0 }, flowVelocity: flow,
      depth: wet(p) ? 2 : 0, immersion: p.y < 0 ? 1 : 0,
      turbidity: 0.3, salinity: 0, temperature: 20, hazardIds: [] }),
    emitInteraction() {},
  };
}

describe("water effects", () => {
  it("emits ballistic sheet-contact spray over dry ground without inventing horizontal foam or swimmable volume", () => {
    const fx = new WaterEffects({ seed: 44, maxParticles: 128 });
    const dry = waterQuery(() => false);
    fx.emit({ ...impact, position: { x: 0, y: 5, z: 0 }, velocity: { x: 2, y: 0, z: 0 },
      waterVelocity: { x: 0, y: -10, z: 0 }, sheetContact: { waterBodyId: 'fall', normal: { x: 1, y: 0, z: 0 } } });
    fx.update(0, 0, dry, 0, camera);
    const positions = fx.object3d.geometry.getAttribute('particlePosition');
    expect(fx.activeCount).toBeGreaterThan(0);
    expect(fx.diagnostics.spawned.foam).toBe(0); expect(fx.diagnostics.spawned.crown).toBe(0);
    expect(fx.diagnostics.suppressed.dryQuery ?? 0).toBe(0);
    const before = Array.from({ length: fx.activeCount }, (_, i) => positions.getY(i));
    for (let i = 0; i < fx.activeCount; i++) expect(positions.getX(i)).toBe(0); // vertical contact plane
    fx.update(0.05, 0.05, dry, 0, camera);
    expect(fx.activeCount).toBe(before.length);
    const after = Array.from({ length: fx.activeCount }, (_, i) => positions.getY(i));
    expect(after.reduce((a, b) => a + b, 0)).toBeLessThan(before.reduce((a, b) => a + b, 0));
    fx.dispose();
  });
  it("shows tall-fall spray near the lip without spending distant plunge crowns", () => {
    const fx = new WaterEffects({ seed: 44, maxParticles: 128, maxDistanceM: 100 });
    fx.emitContinuous('tall-fall', { ...impact, velocity: { x: 0, y: -50, z: 0 } }, 30, 0.1,
      { mist: 1, fallFrom: { x: 0, y: 140, z: 0 } });
    fx.update(1 / 60, 0, waterQuery(), 0, { x: 0, y: 140, z: 2 });
    expect(fx.diagnostics.suppressed.distance ?? 0).toBe(0);
    expect(fx.diagnostics.visibleCandidates.spray).toBeGreaterThan(0);
    expect(fx.diagnostics.spawned.crown).toBe(0);
    expect(fx.diagnostics.spawned.foam).toBe(0);
    const styles = fx.object3d.geometry.getAttribute('particleStyle');
    for (let i = 0; i < fx.activeCount; i++) expect(styles.getZ(i)).toBe(3);
    fx.dispose();
  });

  it("makes bounded connected crowns for plunges, with falling spray above cascade air gaps", () => {
    const fx = new WaterEffects({ seed: 44, maxParticles: 512 });
    for (let i = 0; i < 20; i++) fx.emit({ ...impact, velocity: { x: 0, y: -10, z: 0 } },
      { mist: 1, fallFrom: { x: -2, y: 5, z: 0 } });
    fx.update(1 / 60, 0, waterQuery(), 0, camera);
    expect(fx.diagnostics.active.crown).toBe(16);
    expect(fx.diagnostics.visibleCandidates.crown).toBe(16);
    expect(fx.diagnostics.spawned.mist).toBeGreaterThan(0);
    const positions = fx.object3d.geometry.getAttribute("particlePosition");
    const styles = fx.object3d.geometry.getAttribute("particleStyle");
    let falling = 0;
    for (let i = 0; i < fx.activeCount; i++) if (styles.getZ(i) === 3) { falling++; expect(positions.getY(i)).toBeGreaterThan(1); }
    expect(falling).toBeGreaterThan(0);
    for (let i = 1; i < 60; i++) fx.update(1 / 60, i / 60, waterQuery(), 0, camera);
    expect(fx.diagnostics.active.crown).toBe(0);
    fx.dispose();
    const wake = new WaterEffects();
    wake.emit({ ...impact, kind: "wake" }); wake.update(0.016, 0, waterQuery(), 0, camera);
    expect(wake.diagnostics.spawned.crown).toBe(0); wake.dispose();
  });

  it("carries walking, jumping and resurfacing contacts through the real emitter into submitted visible particles", () => {
    const fx = new WaterEffects({ seed: 22 }), query = waterQuery();
    query.emitInteraction = event => fx.emit(event);
    const actor = new WaterContactEmitter("actor.player");
    actor.update(query, 0, { x: 0, y: 1, z: 0 }, -5, 1 / 60);
    actor.update(query, 0, { x: 0, y: -0.2, z: 0 }, -5, 1 / 60);
    fx.update(1 / 60, 0, query, 0, camera);
    expect(fx.diagnostics.eventsByKind.enter).toBe(1);
    expect(fx.diagnostics.visibleCandidates.spray).toBeGreaterThan(0);
    for (let i = 1; i <= 60; i++) {
      actor.update(query, 0, { x: i / 30, y: -0.2, z: 0 }, 0, 1 / 60);
      fx.update(1 / 60, i / 60, query, 0, camera);
    }
    expect(fx.diagnostics.eventsByKind.wake).toBeGreaterThan(0);
    actor.update(query, 0, { x: 2, y: 0.2, z: 0 }, 5, 1 / 60);
    fx.update(1 / 60, 1.1, query, 0, camera);
    expect(fx.diagnostics.eventsByKind.exit).toBe(1);
    expect(fx.diagnostics.submittedInstances).toBe(fx.activeCount);
    expect(fx.object3d.layers.mask).toBe(1 << 5);
    expect(fx.object3d.material.depthWrite).toBe(false);
    expect(fx.object3d.material.fragmentShader).toContain("sceneZ - vViewDepth");
    fx.dispose();
  });

  it("reports actual suppression stages and excludes off-camera particles from visibility estimates", () => {
    const fx = new WaterEffects();
    fx.emit(impact); fx.update(0.016, 0, waterQuery(() => false), 0, camera);
    expect(fx.diagnostics.suppressed.dryQuery).toBe(1);
    fx.emit({ ...impact, position: { x: 0, y: 5, z: 0 } });
    fx.update(0.016, 0.016, waterQuery(), 0, camera);
    expect(fx.diagnostics.suppressed.aboveSurface).toBe(1);
    const perspective = new PerspectiveCamera(50, 1, 0.1, 100);
    perspective.position.set(0, 3, 4); perspective.lookAt(0, 3, 50); perspective.updateMatrixWorld();
    fx.setView(new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(perspective.projectionMatrix, perspective.matrixWorldInverse)));
    fx.emit(impact); fx.update(0.016, 0.032, waterQuery(), 0, camera);
    expect(fx.diagnostics.submittedInstances).toBeGreaterThan(0);
    expect(Object.values(fx.diagnostics.visibleCandidates).reduce((a, b) => a + b, 0)).toBe(0);
    fx.dispose();
  });

  it("never lets a full ambient cascade pool hide a player's impact", () => {
    const fx = new WaterEffects({ maxParticles: 16 });
    fx.emitContinuous("cascade", impact, 30, 0.1, { mist: 1 });
    fx.update(0.016, 0, waterQuery(), 0, camera);
    expect(fx.activeCount).toBe(16);
    const before = fx.diagnostics.spawned.spray;
    fx.emit({ ...impact, kind: "enter", actorId: "actor.player" });
    fx.update(0.016, 0.016, waterQuery(), 0, camera);
    expect(fx.diagnostics.spawned.spray).toBeGreaterThan(before);
    expect(fx.diagnostics.suppressed.ambientReplaced).toBeGreaterThan(0);
    expect(fx.activeCount).toBeLessThanOrEqual(16);
    fx.dispose();
  });

  it("scales small disturbances, entries, exits and wakes separately with a hard burst ceiling", () => {
    const small = waterEmissionProfile({ ...impact, magnitude: 1, radius: 0.05 });
    const large = waterEmissionProfile(impact);
    const wake = waterEmissionProfile({ ...impact, kind: "wake" });
    const exit = waterEmissionProfile({ ...impact, kind: "exit" });
    expect(small.count).toBeLessThan(large.count / 3);
    expect(wake.lift).toBeLessThan(large.lift / 2);
    expect(exit.count).toBeLessThan(large.count);
    expect(exit.lift).toBeLessThan(large.lift);
    expect(waterEmissionProfile({ ...impact, magnitude: 1e12, radius: 1e6 }).count).toBeLessThanOrEqual(72);
    expect(waterEmissionProfile({ ...impact, magnitude: 0 }).count).toBe(0);
    expect(waterEmissionProfile({ ...impact, kind: "submerge" }).count).toBe(0);
  });

  it("bounds queued bursts and active geometry, then expires all transient particles", () => {
    const fx = new WaterEffects({ maxParticles: 32 });
    for (let i = 0; i < 2000; i++) fx.emit(impact);
    expect(fx.pendingCount).toBe(64);
    fx.update(1 / 60, 0, waterQuery(), 0, camera);
    expect(fx.activeCount).toBe(32);
    expect(fx.object3d.geometry.instanceCount).toBe(32);
    for (let i = 1; i < 400; i++) fx.update(1 / 60, i / 60, waterQuery(), 0, camera);
    expect(fx.activeCount).toBe(0);
    expect(fx.object3d.geometry.instanceCount).toBe(0);
    fx.dispose();
  });

  it("rejects dry, distant, deep submerged and airborne impacts", () => {
    const fx = new WaterEffects({ maxDistanceM: 30 });
    fx.emit(impact);
    fx.update(0.016, 0, waterQuery(() => false), 0, camera);
    expect(fx.activeCount).toBe(0);
    for (const position of [{ x: 40, y: 0, z: 0 }, { x: 0, y: -3, z: 0 }, { x: 0, y: 5, z: 0 }]) fx.emit({ ...impact, position });
    fx.update(0.016, 0.016, waterQuery(), 0, camera);
    expect(fx.activeCount).toBe(0);
    fx.emit(impact);
    fx.update(0.016, 0.032, waterQuery(), 0, { x: 0, y: -1, z: 1 });
    expect(fx.activeCount).toBe(0);
    expect(fx.object3d.visible).toBe(false);
    fx.dispose();
  });

  it("returns bounded small reentry ripples without recursive particle spawning", () => {
    const returns: WaterInteractionEvent[] = [];
    const fx = new WaterEffects({ seed: 17, onReentry: (event) => { returns.push(event); fx.emit(event); } });
    fx.emit(impact);
    for (let i = 0; i < 240; i++) {
      const before = returns.length;
      fx.update(1 / 60, i / 60, waterQuery(), 0, camera);
      expect(returns.length - before).toBeLessThanOrEqual(4);
      expect(fx.pendingCount).toBe(0);
    }
    expect(returns.length).toBeGreaterThan(0);
    for (const event of returns) {
      expect(event.position.y).toBe(0);
      expect(event.radius).toBeLessThanOrEqual(0.12);
      expect(event.magnitude).toBeLessThan(1);
    }
    expect(fx.activeCount).toBe(0);
    fx.dispose();
  });

  it("keeps floating foam on the queried surface and advects it downstream", () => {
    const fx = new WaterEffects({ seed: 2 });
    fx.emit({ ...impact, kind: "wake", velocity: { x: 0, y: 0, z: 0 } });
    const query = waterQuery(() => true, { x: 3, y: 0, z: 0 });
    fx.update(0, 0, query, 0, camera);
    const offsets = fx.object3d.geometry.getAttribute("particlePosition");
    const styles = fx.object3d.geometry.getAttribute("particleStyle");
    let initialX = 0;
    for (let i = 0; i < fx.activeCount; i++) initialX = Math.max(initialX, offsets.getX(i));
    for (let i = 1; i <= 20; i++) fx.update(1 / 60, i / 60, query, 0, camera);
    let maxX = 0;
    let foam = 0;
    for (let i = 0; i < fx.activeCount; i++) {
      if (styles.getZ(i) === 2) {
        expect(offsets.getY(i)).toBeCloseTo(0.025);
        maxX = Math.max(maxX, offsets.getX(i));
        foam++;
      }
    }
    expect(foam).toBeGreaterThan(0);
    expect(maxX).toBeGreaterThan(initialX + 0.3);
    fx.dispose();
  });

  it('moves foam over the full slow frame and stops same-owner transport at an intervening dry bank', () => {
    const run = (bank: boolean) => {
      const fx = new WaterEffects({ seed: 2 });
      const query = waterQuery(p => !bank || p.x <= 0.3 || p.x >= 0.55, { x: 2, y: 0, z: 0 });
      fx.emit({ ...impact, kind: 'wake', radius: 0.025, velocity: { x: 2, y: 0, z: 0 } });
      fx.update(0, 0, query, 0, camera);
      const positions = fx.object3d.geometry.getAttribute('particlePosition');
      fx.update(0.4, 0.4, query, 0, camera);
      if (bank) {
        expect(fx.activeCount).toBe(0);
        expect(fx.diagnostics.suppressed.transportBarrier).toBeGreaterThan(0);
      } else {
        expect(fx.activeCount).toBeGreaterThan(0);
        for (let i = 0; i < fx.activeCount; i++) expect(positions.getX(i)).toBeGreaterThan(0.6);
      }
      fx.dispose();
    };
    run(false); run(true);
  });

  it('bounds path queries and terminates excessive travel rather than skipping shore checks', () => {
    expect(WATER_PARTICLE_MAX_PATH_STEP_M).toBe(0.125);
    expect(WATER_PARTICLE_MAX_PATH_STEPS).toBe(32);
    const fx = new WaterEffects({ maxParticles: 256 });
    const query = waterQuery(() => true, { x: 100, y: 0, z: 0 });
    let calls = 0; const sample = query.sample;
    query.sample = (p, epoch) => { calls++; return sample(p, epoch); };
    fx.emit({ ...impact, kind: 'wake', velocity: { x: 100, y: 0, z: 0 } });
    fx.update(0, 0, query, 0, camera);
    const count = fx.activeCount; calls = 0;
    fx.update(0.4, 0.4, query, 0, camera, { x: 100, y: 0, z: 0 });
    expect(fx.activeCount).toBe(0);
    expect(fx.diagnostics.suppressed.transportBudget).toBe(count);
    expect(calls).toBeLessThanOrEqual(1 + count); // only camera + foam's source-current query
    fx.dispose();
  });

  it("copies mutable event vectors and culls particles when the shore becomes dry", () => {
    const fx = new WaterEffects();
    const event = { ...impact, position: { ...impact.position } };
    fx.emit(event);
    event.position.x = 10000;
    fx.update(0.016, 0, waterQuery(), 0, camera);
    expect(fx.activeCount).toBeGreaterThan(0);
    fx.update(0.016, 0.016, waterQuery(() => false), 0, camera);
    expect(fx.activeCount).toBe(0);
    fx.dispose();
  });

  it("accumulates continuous sources consistently at different frame rates", () => {
    const simulate = (fps: number) => {
      const fx = new WaterEffects({ maxParticles: 1000 });
      for (let i = 0; i < fps; i++) fx.emitContinuous("water.test.cascade", impact, 6, 1 / fps, { mist: 1 });
      const queued = fx.pendingCount;
      fx.dispose();
      return queued;
    };
    expect(simulate(30)).toBe(6);
    expect(simulate(60)).toBe(6);
    expect(simulate(120)).toBe(6);
  });

  it('retains the authored cascade rate on slow frames with bounded discontinuity catchup and explicit suspension', () => {
    for (const fps of [2.5, 30, 60]) {
      const fx = new WaterEffects({ maxParticles: 256 });
      for (let i = 0; i < 4 * fps; i++) {
        fx.emitContinuous('fall', impact, 3, 1 / fps, { mist: 1 });
        fx.update(1 / fps, (i + 1) / fps, waterQuery(), 0, camera);
      }
      expect(fx.diagnostics.queued).toBe(12);
      expect(fx.activeCount).toBeGreaterThan(0);
      fx.setSuspended(true); fx.emitContinuous('fall', impact, 3, 100);
      expect(fx.pendingCount).toBe(0);
      fx.setSuspended(false); fx.emitContinuous('fall', impact, 30, 100);
      expect(fx.pendingCount).toBe(3);
      expect(fx.diagnostics.suppressed.continuousCatchupDropped).toBe(27);
      fx.update(100, 104, waterQuery(), 0, camera);
      expect(fx.activeCount).toBeGreaterThan(0); // fresh, not replayed historical particles
      fx.update(1, 105, waterQuery(), 0, { x: 1000, y: 3, z: 1000 });
      expect(fx.activeCount).toBe(0);
      fx.dispose();
    }
  });

  it('lands coherent sheet spray in a narrow pool despite wind and a slow frame', () => {
    const fx = new WaterEffects({ seed: 44, maxParticles: 128 });
    const query = waterQuery(p => Math.abs(p.x) < 0.06 && Math.abs(p.z) < 0.06);
    fx.emitContinuous('fall', { ...impact, radius: 0.025 }, 3, 0.4,
      { fallFrom: { x: -4, y: 5, z: 3 }, mist: 1 });
    fx.update(0, 0, query, 0, camera);
    const styles = fx.object3d.geometry.getAttribute('particleStyle');
    const positions = fx.object3d.geometry.getAttribute('particlePosition');
    const phases = new Set<number>();
    for (let i = 0; i < fx.activeCount; i++) if (styles.getZ(i) === 3) phases.add(styles.getW(i));
    expect(phases.size).toBeGreaterThan(0);
    const landed = new Set<number>();
    for (let step = 1; step <= 4; step++) {
      fx.update(0.4, step * 0.4, query, 0, camera, { x: 25, y: 0, z: -25 });
      for (let i = 0; i < fx.activeCount; i++) if (phases.has(styles.getW(i)) && styles.getZ(i) === 2) {
        landed.add(styles.getW(i));
        expect(Math.abs(positions.getX(i))).toBeLessThan(0.06);
        expect(Math.abs(positions.getZ(i))).toBeLessThan(0.06);
      }
    }
    expect(landed.size).toBe(phases.size);
    fx.dispose();
  });

  it('expires a falling trajectory when its below-sea-level receiver dries during flight', () => {
    const fx = new WaterEffects({ seed: 44 });
    const wet = waterQuery(), dry = waterQuery(() => false);
    const sample = wet.sample;
    wet.sample = (p, epoch) => ({ ...sample(p, epoch), surfaceHeight: -10 });
    fx.emitContinuous('fall', { ...impact, position: { x: 0, y: -10, z: 0 } }, 3, 0.4,
      { fallFrom: { x: -4, y: -5, z: 3 } });
    fx.update(0, 0, wet, 0, camera);
    expect(fx.activeCount).toBeGreaterThan(0);
    for (let step = 1; step <= 10; step++) fx.update(0.4, step * 0.4, dry, 0, camera);
    expect(fx.activeCount).toBe(0);
    fx.dispose();
  });

  it("clears delayed spray on explicit suspension and disposes idempotently", () => {
    const fx = new WaterEffects();
    fx.emit(impact);
    fx.setSuspended(true);
    fx.update(1, 1, waterQuery(), 0, camera);
    expect(fx.activeCount).toBe(0);
    expect(fx.pendingCount).toBe(0);
    fx.emit(impact);
    expect(fx.pendingCount).toBe(0);
    fx.setSuspended(false);
    fx.update(1 / 60, 2, waterQuery(), 0, camera);
    expect(fx.activeCount).toBe(0);
    fx.dispose(); fx.dispose();
    fx.emit(impact);
    expect(fx.pendingCount).toBe(0);
  });

  it('retains newly emitted spray on a slow visible frame rather than treating low FPS as suspension', () => {
    const fx = new WaterEffects();
    fx.emit(impact);
    fx.update(0.8, 0.8, waterQuery(), 0, camera);
    expect(fx.activeCount).toBeGreaterThan(0);
    expect(fx.diagnostics.active.crown).toBeGreaterThan(0);
    expect(fx.diagnostics.visibleCandidates.spray).toBeGreaterThan(0);
    expect(fx.diagnostics.suppressed.pausedFrame).toBeUndefined();
    fx.dispose();
  });

  it('gives a fresh impact its full initial lifetime even after a 400 ms preceding frame', () => {
    const fresh = new WaterEffects({ seed: 42 }), stalled = new WaterEffects({ seed: 42 });
    const query = waterQuery();
    fresh.emit(impact); stalled.emit(impact);
    fresh.update(0, 0, query, 0, camera);
    stalled.update(0.4, 0.4, query, 0, camera);
    expect(stalled.diagnostics.visibleCandidates.spray).toBeGreaterThan(0);
    expect(stalled.diagnostics.visibleCandidates.crown).toBe(1);
    const compare = () => {
      expect(stalled.diagnostics.active).toEqual(fresh.diagnostics.active);
      expect(stalled.object3d.geometry.getAttribute('particlePosition').array)
        .toEqual(fresh.object3d.geometry.getAttribute('particlePosition').array);
      expect(stalled.object3d.geometry.getAttribute('particleStyle').array)
        .toEqual(fresh.object3d.geometry.getAttribute('particleStyle').array);
    };
    compare();
    // Matching all subsequent samples demonstrates that no age, ballistic
    // travel or crown lifetime was silently consumed before the first draw.
    for (let frame = 1; frame <= 40; frame++) {
      fresh.update(0.05, frame * 0.05, query, 0, camera);
      stalled.update(0.05, 0.4 + frame * 0.05, query, 0, camera);
      compare();
    }
    fresh.dispose(); stalled.dispose();
  });
});
