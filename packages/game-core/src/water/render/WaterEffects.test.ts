import { describe, expect, it } from "vitest";
import type { Vec3, WaterInteractionEvent, WorldWaterQuery } from "@elder-souls/contracts";
import { WaterEffects, waterEmissionProfile } from "./WaterEffects";

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

  it("clears delayed spray after a paused frame and disposes idempotently", () => {
    const fx = new WaterEffects();
    fx.emit(impact);
    fx.update(1, 1, waterQuery(), 0, camera);
    expect(fx.activeCount).toBe(0);
    fx.dispose(); fx.dispose();
    fx.emit(impact);
    expect(fx.pendingCount).toBe(0);
  });
});
