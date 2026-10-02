import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { vec3 } from "three/tsl";
import {
  applyWindSway,
  applyWindSwayWithShadow,
  createWindUniforms,
  groundCoverSway,
  updateWindSway,
  windGustAt,
  windGustEnvelope,
  windRustleGate,
  windStiffness,
  windSwayOffset,
  WIND_FADE_M,
  WIND_REFERENCE_TRUNK_RADIUS_M,
  WIND_STIFFNESS_RANGE,
} from "./windSway";

/** Eight ground-cover tips, each sampled at 60 Hz for 60 s. */
const ROOTS: [number, number][] = Array.from({ length: 8 }, (_, s) => [137.2 + s * 523, -48.9 + s * 311]);

function tipTrace(speedMS: number, gustiness: number, originXZ: [number, number]) {
  const out: { tip: number; rustle: number; env: number }[] = [];
  for (let i = 0; i < 3600; i++) {
    const r = groundCoverSway({ speedMS, gustiness, dirXZ: [1, 0], originXZ, heightM: 1, t: i / 60 });
    out.push({ tip: Math.hypot(r.along, r.across), rustle: Math.abs(r.across), env: r.envelope });
  }
  return out;
}

/** Fronts in an envelope trace (on above 0.25, off below 0.08), as durations in seconds. */
function fronts(env: number[]): number[] {
  const out: number[] = []; let on = -1;
  env.forEach((e, i) => {
    if (e > 0.25 && on < 0) on = i;
    if (e <= 0.08 && on >= 0) { out.push((i - on) / 60); on = -1; }
  });
  return out;
}

describe("the gust field (walk 9 owner correction: calm spells, separate fronts)", () => {
  it("is near still at 2 m/s with no gust", () => {
    for (const root of ROOTS) {
      const trace = tipTrace(2, 0, root);
      expect(trace.filter((s) => s.tip < 0.01).length / trace.length).toBeGreaterThan(0.8);
      expect(Math.max(...trace.map((s) => s.rustle))).toBeLessThan(0.002);
    }
  });
  it("at 8 m/s, gust 0.6: 3 to 12 fronts a minute lasting 2 to 15 s, a strongly varying envelope", () => {
    const counts: number[] = []; const durations: number[] = []; const cvs: number[] = [];
    for (const root of ROOTS) {
      const env = tipTrace(8, 0.6, root).map((s) => s.env);
      const f = fronts(env);
      counts.push(f.length); durations.push(...f);
      const mean = env.reduce((a, b) => a + b, 0) / env.length;
      cvs.push(Math.sqrt(env.reduce((a, b) => a + (b - mean) ** 2, 0) / env.length) / mean);
    }
    const meanCount = counts.reduce((a, b) => a + b, 0) / counts.length;
    expect(meanCount).toBeGreaterThanOrEqual(3);
    expect(meanCount).toBeLessThanOrEqual(12);
    const inRange = durations.filter((d) => d >= 2 && d <= 15).length / durations.length;
    expect(inRange).toBeGreaterThan(0.85);
    for (const cv of cvs) expect(cv).toBeGreaterThan(0.5);
  });
  it("at 14 m/s, gust 1: fronts every few seconds and a rustle over 2 cm as one passes", () => {
    for (const root of ROOTS) {
      const trace = tipTrace(14, 1, root);
      expect(fronts(trace.map((s) => s.env)).length).toBeGreaterThanOrEqual(3);
      expect(Math.max(...trace.filter((s) => s.env > 0.3).map((s) => s.rustle))).toBeGreaterThan(0.02);
    }
  });
  it("rolls fronts downwind: a root 5 m downwind sees the same front within 1 s", () => {
    for (const speed of [8, 14]) {
      const a = (t: number) => windGustEnvelope([100, 40], [1, 0], speed, 1, t);
      const b = (t: number) => windGustEnvelope([105, 40], [1, 0], speed, 1, t);
      let bestLag = 0; let bestErr = Infinity;
      for (let lag = 0; lag <= 3; lag += 0.01) {
        let err = 0;
        for (let t = 0; t < 60; t += 0.1) err += (b(t + lag) - a(t)) ** 2;
        if (err < bestErr) { bestErr = err; bestLag = lag; }
      }
      expect(bestLag).toBeGreaterThan(0);
      expect(bestLag).toBeLessThan(1);
      expect(bestErr).toBeLessThan(1e-3);
    }
  });
  it("tree bend mean stays near the calibrated 1, and the rustle gate is shut at 2 m/s calm", () => {
    let sum = 0; let n = 0;
    for (const root of ROOTS) for (let t = 0; t < 600; t += 0.5) { sum += windGustAt(root, [1, 0], 8, 0.6, t); n++; }
    expect(sum / n).toBeGreaterThan(0.6);
    expect(sum / n).toBeLessThan(1.2);
    expect(windRustleGate(2, 0, 0)).toBe(0);
  });
});

describe("wind sway node patch", () => {
  it("wraps the position slot with shared uniform nodes", () => {
    const material = new MeshStandardNodeMaterial();
    const uniforms = createWindUniforms();
    applyWindSway(material, uniforms);
    expect(material.positionNode).not.toBeNull();
    for (const u of Object.values(uniforms)) expect((u as { isNode?: boolean }).isNode).toBe(true);
  });
  it("never bends twice, however many times it is applied", () => {
    const material = new MeshStandardNodeMaterial();
    const uniforms = createWindUniforms();
    applyWindSway(material, uniforms);
    const once = material.positionNode;
    applyWindSway(material, uniforms);
    applyWindSwayWithShadow(material, undefined, uniforms);
    expect(material.positionNode).toBe(once);
  });
  it("sways a separate shadow position too, when a feature set one", () => {
    const material = new MeshStandardNodeMaterial();
    const shadow = vec3(0, 1, 0);
    material.castShadowPositionNode = shadow;
    applyWindSway(material, createWindUniforms());
    expect(material.castShadowPositionNode).not.toBe(shadow);
    const plain = new MeshStandardNodeMaterial();
    applyWindSway(plain, createWindUniforms());
    expect(plain.castShadowPositionNode).toBeNull(); // the shadow reuses positionNode
  });
  it("takes absolute time and the player's eye, so two callers per frame do not double the clock", () => {
    const uniforms = createWindUniforms();
    const wind = { windDirXZ: [1, 0] as const, windSpeedMS: 10, gustiness: 0.5 };
    updateWindSway(uniforms, 4.2, wind, new THREE.Vector3(3, 4, 5));
    updateWindSway(uniforms, 4.2, wind, new THREE.Vector3(3, 4, 5));
    expect(uniforms.esWindTime.value).toBe(4.2);
    expect(uniforms.esWindVec.value.x).toBeCloseTo(0.9);
    expect(uniforms.esWindEye.value.toArray()).toEqual([3, 4, 5]);
  });
});

describe("the vertex law (windSwayOffset, mirrored by the node graph)", () => {
  const tree = { origin: [5, 0, 7] as const, eye: [0, 2, 0] as const, timeS: 3,
    windVec: [0.9, 0, 0.5] as const, tune: [0, 0, 15] as const };
  it("measures height from the GROUND LINE, not the buried pivot", () => {
    // Terrain species are sunk deliberately; weighting from the pivot left the
    // trunk already displaced where it meets the soil (owner round 6).
    const sunk = [0, 0.5, 15] as const;
    expect(windSwayOffset({ ...tree, local: [0, 0.5, 0], tune: sunk }).map((v) => v + 0)).toEqual([0, 0, 0]);
    expect(Math.abs(windSwayOffset({ ...tree, local: [0, 5, 0], tune: sunk })[0]))
      .toBeLessThan(Math.abs(windSwayOffset({ ...tree, local: [0, 5, 0] })[0]));
  });
  it("pins the base, swings the crown by (h/H)², and never stretches the plant", () => {
    let low = 0; let high = 0;
    for (let t = 0; t < 20; t += 0.25) {
      low += Math.abs(windSwayOffset({ ...tree, timeS: t, local: [0, 2, 0] })[0]);
      const h = windSwayOffset({ ...tree, timeS: t, local: [0, 14, 0] });
      high += Math.abs(h[0]);
      expect(h[1]).toBeLessThanOrEqual(1e-9); // a leaning trunk drops, never rises
    }
    expect(high).toBeGreaterThan(low * 10);
  });
  it("fades with distance from the player's eye and stops in still air", () => {
    const at = { ...tree, local: [0, 10, 0] as const };
    expect(windSwayOffset({ ...at, eye: [5 + WIND_FADE_M + 1, 0, 7] }).map((v) => v + 0)).toEqual([0, 0, 0]);
    expect(windSwayOffset({ ...at, windVec: [0, 0, 1] })).toEqual([0, 0, 0]);
    expect(windSwayOffset(at)[0]).not.toBe(0);
  });
  it("ground cover (no tune) leans downwind in a gale and is near still at 2 m/s", () => {
    const cover = { origin: [137, 0, -48] as const, eye: [137, 1, -45] as const, local: [0, 1, 0] as const };
    const gale = [12 * 0.09, 0, 0.6] as const;
    const calm = [2 * 0.09, 0, 0] as const;
    let along = 0; let still = 0;
    for (let t = 0; t < 30; t += 0.5) {
      along += windSwayOffset({ ...cover, timeS: t, windVec: gale })[0];
      still = Math.max(still, Math.abs(windSwayOffset({ ...cover, timeS: t, windVec: calm })[0]));
    }
    expect(along / 60).toBeGreaterThan(0.2);
    expect(still).toBeLessThan(0.01);
    // the law's ground-cover branch is groundCoverSway's
    const r = groundCoverSway({ speedMS: 12, gustiness: 0.6, dirXZ: [1, 0], originXZ: [137, -48], heightM: 1, t: 4,
      leafPhase: 11.1 });
    const o = windSwayOffset({ ...cover, timeS: 4, windVec: gale });
    expect(o[0]).toBeCloseTo(r.along, 6);
    expect(o[2]).toBeCloseTo(r.across, 6);
  });
});

describe("trunk stiffness", () => {
  it("scales sway by the trunk's width, both ways off the reference", () => {
    expect(windStiffness(WIND_REFERENCE_TRUNK_RADIUS_M)).toBeCloseTo(1, 5);
    const [floor, ceiling] = WIND_STIFFNESS_RANGE;
    // A buttressed giant barely stirs; a slender trunk keeps the calibrated
    // amplitude and is never pushed ABOVE it (owner round 7: palms swayed
    // too much once thin trunks were allowed a multiplier over 1).
    expect(windStiffness(1.6)).toBe(floor);
    expect(windStiffness(0.05)).toBe(ceiling);
    expect(ceiling).toBe(1);
    // A 0.26 m palm trunk — the case the owner called out — must not exceed
    // the baseline it was tuned at.
    expect(windStiffness(0.26)).toBe(1);
    // Monotonic in between, and strictly decreasing with width.
    expect(windStiffness(0.25)).toBeGreaterThan(windStiffness(0.45));
    expect(windStiffness(0.45)).toBeLessThan(1);
  });

  it("reads the trunk width AT INSTANCE SCALE", () => {
    // The same species placed at x2 has a trunk twice as thick, so it must
    // sway less than its unscaled neighbour, not the same amount.
    expect(windStiffness(0.3, 2)).toBeLessThan(windStiffness(0.3, 1));
    expect(windStiffness(0.3, 2)).toBeCloseTo(windStiffness(0.6, 1), 6);
  });

  it("treats a species with no trunk capsule as neutral", () => {
    expect(windStiffness(0)).toBe(1);
    expect(windStiffness(Number.NaN)).toBe(1);
  });
});

