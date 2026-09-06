import { describe, expect, it } from "vitest";
import type { Vec3, WaterSample, WorldWaterQuery } from "@elder-souls/contracts";
import { computeBuoyancy, type BuoyancyParams, type BuoyancyMotion } from "./buoyancy";

const ZERO = { x: 0, y: 0, z: 0 };
const IDENTITY = (v: Vec3) => v;
function water(overrides: Partial<WaterSample> = {}): WorldWaterQuery {
  return {
    sample: () => ({
      waterBodyId: "lake", surfaceHeight: 0, depth: 100,
      surfaceNormal: { x: 0, y: 1, z: 0 }, flowVelocity: ZERO,
      immersion: 1, turbidity: 0, salinity: 0, temperature: 20, hazardIds: [],
      ...overrides,
    }),
    emitInteraction: () => {},
  };
}
const UNIT: BuoyancyParams = {
  volumeM3: 1, linearDrag: 0, pointHeightM: 1, points: [ZERO],
};
function sample(params: BuoyancyParams = UNIT, position = { x: 0, y: -2, z: 0 },
  velocity = ZERO, query = water(), motion?: BuoyancyMotion) {
  return computeBuoyancy(query, 0, position, IDENTITY, velocity, params, motion);
}

describe("displaced-volume buoyancy", () => {
  it("obeys Archimedes and the density-dependent equilibrium draft", () => {
    expect(sample().force.y).toBeCloseTo(9810);
    expect(sample(UNIT, ZERO).force.y).toBeCloseTo(4905);
    // A 250 kg, 1 m³ box needs 0.25 m³ below the surface.
    expect(sample(UNIT, { x: 0, y: 0.25, z: 0 }).force.y).toBeCloseTo(250 * 9.81);
    expect(sample(UNIT, { x: 0, y: 1, z: 0 }).force.y).toBe(0);
  });

  it("displaces only water that exists above a shallow bed", () => {
    const shallow = water({ depth: 0.1 });
    expect(sample(UNIT, ZERO, ZERO, shallow).force.y).toBeCloseTo(981);
    expect(sample(UNIT, { x: 0, y: -2, z: 0 }, ZERO, shallow).force.y).toBe(0);
    expect(sample(UNIT, ZERO, ZERO, water({ depth: 0 })).immersion).toBe(0);
  });

  it("floats more strongly in salt water without changing volume", () => {
    expect(sample(UNIT, undefined, ZERO, water({ salinity: 1 })).force.y).toBeCloseTo(1025 * 9.81);
    expect(sample(UNIT, undefined, ZERO, water({ salinity: 0.5 })).force.y).toBeCloseTo(1012.5 * 9.81);
  });

  it("preserves total displacement when the hull is subdivided", () => {
    const divided = { ...UNIT, points: [{ x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }] };
    expect(sample(divided).force).toEqual(sample().force);
    expect(sample({ ...UNIT, points: [] }).force).toEqual(ZERO);
  });

  it("converts force units without changing volume, immersion or motion", () => {
    const params = { ...UNIT, linearDrag: 25, quadraticDrag: 10 };
    const v = { x: 2, y: -3, z: 1 };
    const si = sample(params, ZERO, v);
    const scaled = sample({ ...params, forceScale: 0.01 }, ZERO, v);
    for (const axis of ["x", "y", "z"] as const) {
      expect(scaled.force[axis]).toBeCloseTo(si.force[axis] * 0.01);
    }
    expect(scaled.immersion).toBe(si.immersion);
    expect(scaled.relativeSpeed).toBe(si.relativeSpeed);
  });

  it("rejects invalid dimensions rather than producing a NaN impulse", () => {
    expect(() => sample({ ...UNIT, pointHeightM: 0 })).toThrow(RangeError);
    expect(() => sample({ ...UNIT, volumeM3: -1 })).toThrow(RangeError);
    expect(() => sample({ ...UNIT, quadraticDrag: Infinity })).toThrow(RangeError);
  });
});

describe("water-relative drag", () => {
  it("includes rising/falling currents and exerts no drag on a co-moving body", () => {
    const flow = { x: 2, y: -3, z: 1 };
    const q = water({ flowVelocity: flow });
    const params = { ...UNIT, linearDrag: 20, quadraticDrag: 10 };
    expect(sample(params, undefined, flow, q).force).toEqual(sample().force);
    expect(sample(params, undefined, ZERO, q).force.y).toBeLessThan(9810);
  });

  it("quadratic drag gives four times the resistance at twice the speed", () => {
    const params = { ...UNIT, quadraticDrag: 10 };
    const slow = sample(params, undefined, { x: 2, y: 0, z: 0 });
    const fast = sample(params, undefined, { x: 4, y: 0, z: 0 });
    expect(slow.force.x).toBe(-40);
    expect(fast.force.x).toBe(4 * slow.force.x);
  });

  it("damps rotation at the probes without inventing net horizontal force", () => {
    const result = sample({
      ...UNIT, linearDrag: 20,
      points: [{ x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }],
    }, undefined, ZERO, water(), { angularVelocity: { x: 0, y: 2, z: 0 } });
    expect(result.force.x).toBe(0);
    expect(result.force.z).toBe(0);
    const torqueY = result.pointForces.reduce((total, pf) => total - pf.point.x * pf.force.z, 0);
    expect(torqueY).toBe(-40);
  });

  it("uses the actual centre of mass and transformed probe positions", () => {
    const result = computeBuoyancy(water(), 0, { x: 3, y: -2, z: 4 },
      (p) => ({ x: -p.z, y: p.y, z: p.x }), ZERO,
      { ...UNIT, linearDrag: 10, points: [{ x: 1, y: 0, z: 0 }] },
      { angularVelocity: { x: 0, y: 1, z: 0 }, centerOfMass: { x: 3, y: -2, z: 5 } });
    expect(result.pointForces[0].point).toEqual({ x: 3, y: -2, z: 5 });
    expect(result.force.x).toBe(0);
    expect(result.force.z).toBe(0);
  });

  it("settles floating cargo at its draft and lets dense cargo sink at terminal speed", () => {
    function advance(mass: number, dt: number) {
      let y = 1;
      let vy = 0;
      for (let t = 0; t < 30; t += dt) {
        const f = sample({ ...UNIT, linearDrag: 600, quadraticDrag: 300 },
          { x: 0, y, z: 0 }, { x: 0, y: vy, z: 0 }).force.y;
        vy += (f / mass - 9.81) * dt;
        y += vy * dt;
      }
      return { y, vy };
    }
    for (const dt of [1 / 60, 1 / 120]) {
      const floating = advance(250, dt);
      expect(floating.y).toBeCloseTo(0.25, 3);
      expect(Math.abs(floating.vy)).toBeLessThan(0.001);
      const sinking = advance(1200, dt);
      // 300v² + 600v = (1200 - 1000)g.
      const terminalSpeed = (-600 + Math.sqrt(600 ** 2 + 4 * 300 * 200 * 9.81)) / 600;
      expect(sinking.y).toBeLessThan(-10);
      expect(sinking.vy).toBeCloseTo(-terminalSpeed, 3);
    }
  });
});
