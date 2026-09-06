import { describe, expect, it } from "vitest";
import { flowAdvectionAt } from "./flowAdvection";

describe("physical surface-flow coordinates", () => {
  it("moves every feature at the sampled 3D current regardless of texture scale", () => {
    const world = { x: 2370, y: 240, z: 190 }, flow = { x: -2, y: -4, z: 3 };
    const dt = 0.05, t = 0.8;
    for (const frequency of [0.08, 0.22, 0.55, 1.9, 3.7]) {
      const initial = flowAdvectionAt(world, flow, t, frequency);
      const next = flowAdvectionAt(world, flow, t + dt, frequency);
      const tracking = flowAdvectionAt({ x: world.x + flow.x * dt,
        y: world.y + flow.y * dt, z: world.z + flow.z * dt }, flow, t + dt, frequency);
      for (const axis of ["x", "y", "z"] as const) {
        expect(-(next.a[axis] - initial.a[axis]) / dt / frequency).toBeCloseTo(flow[axis], 7);
        expect(tracking.a[axis]).toBeCloseTo(initial.a[axis], 8);
        expect(tracking.b[axis]).toBeCloseTo(initial.b[axis], 8);
      }
    }
  });
  it("has smooth value and temporal derivative when either phase resets", () => {
    const texture = (t: number) => {
      const c = flowAdvectionAt({ x: 5, y: 12, z: -1 }, { x: 2, y: -4, z: 1 }, t, 0.55);
      const pattern = (p: typeof c.a) => Math.sin(p.x * 1.13 + p.y * 0.43 + p.z * 0.21);
      return pattern(c.a) * (1 - c.blend) + pattern(c.b) * c.blend;
    };
    const dt = 1e-5;
    for (const reset of [-4, -2, 0, 2, 4, 4000]) {
      expect(Math.abs(texture(reset - dt) - texture(reset + dt))).toBeLessThan(0.0001);
      const left = (texture(reset) - texture(reset - dt)) / dt;
      const right = (texture(reset + dt) - texture(reset)) / dt;
      expect(Math.abs(left - right)).toBeLessThan(0.0001);
    }
  });
  it("bounds velocity-gradient shear over long sessions and never moves still pools", () => {
    const world = { x: 7000, y: 100, z: 7100 }, zero = { x: 0, y: 0, z: 0 };
    for (const time of [0.2, 20.2, 40000.2, 1000000.2]) {
      const c = flowAdvectionAt(world, { x: 2, y: -1, z: 0 }, time);
      const neighbor = flowAdvectionAt(world, { x: 2.01, y: -1, z: 0 }, time);
      expect(Math.abs(c.a.x - neighbor.a.x)).toBeLessThan(0.04);
      expect(flowAdvectionAt(world, zero, time).a).toEqual(world);
      expect(flowAdvectionAt(world, zero, time).b).toEqual(world);
    }
  });
});
