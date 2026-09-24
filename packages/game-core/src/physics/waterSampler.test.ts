import { describe, expect, it } from "vitest";
import { FLAT_POOL_BODY_ID, flatPoolSampler, immersionAt, submergedAt } from "./waterSampler";

// The sandbox pool: 10 m by 8 m, surface 0.2 m below the arena floor, floor 2.4 m below it.
const pool = flatPoolSampler({ minX: -25, maxX: -15, minZ: -4, maxZ: 4, surfaceY: -0.2, floorY: -2.4 });

describe("immersionAt (WaterWorld's column rule)", () => {
  it("is 1 at or under the surface, 0 a full 1.7 m column above it, linear between", () => {
    expect(immersionAt(0, 0)).toBe(1);
    expect(immersionAt(0, -3)).toBe(1);
    expect(immersionAt(0, 1.7)).toBe(0);
    expect(immersionAt(0, 5)).toBe(0);
    expect(immersionAt(0, 0.85)).toBeCloseTo(0.5, 10);
  });
});

describe("flatPoolSampler", () => {
  it("answers inside the rectangle with the pool's surface, depth and still water", () => {
    const s = pool.sample({ x: -20, y: -0.2, z: 0 }, 0);
    expect(s.waterBodyId).toBe(FLAT_POOL_BODY_ID);
    expect(s.surfaceHeight).toBe(-0.2);
    expect(s.depth).toBeCloseTo(2.2, 10);
    expect(s.immersion).toBe(1);
    expect(s.flowVelocity).toEqual({ x: 0, y: 0, z: 0 });
    expect(s.surfaceNormal).toEqual({ x: 0, y: 1, z: 0 });
  });

  it("measures immersion at the asked position", () => {
    // 0.646 m above the surface: (−0.646 / 1.7) + 1 = 0.62, the swim threshold.
    expect(pool.sample({ x: -20, y: -0.2 + 0.646, z: 0 }, 0).immersion).toBeCloseTo(0.62, 10);
    expect(pool.sample({ x: -20, y: 1.5, z: 0 }, 0).immersion).toBe(0);
  });

  it("is dry outside the rectangle, as WaterWorld's dry sample", () => {
    const s = pool.sample({ x: -14.9, y: -1, z: 0 }, 0);
    expect(s.waterBodyId).toBeNull();
    expect(s.depth).toBe(0);
    expect(s.immersion).toBe(0);
    expect(pool.sample({ x: -20, y: -1, z: 4.01 }, 0).waterBodyId).toBeNull();
  });

  it("counts the edges as inside", () => {
    expect(pool.sample({ x: -25, y: -1, z: -4 }, 0).waterBodyId).toBe(FLAT_POOL_BODY_ID);
    expect(pool.sample({ x: -15, y: -1, z: 4 }, 0).waterBodyId).toBe(FLAT_POOL_BODY_ID);
  });
});

describe("submergedAt", () => {
  it("is true only inside the pool and under its surface", () => {
    expect(submergedAt(pool, { x: -20, y: -0.21, z: 0 })).toBe(true);
    expect(submergedAt(pool, { x: -20, y: -0.2, z: 0 })).toBe(false);
    expect(submergedAt(pool, { x: -20, y: 0.5, z: 0 })).toBe(false);
    // Outside the rectangle nothing is under water, however low.
    expect(submergedAt(pool, { x: 0, y: -1, z: 0 })).toBe(false);
  });
});
