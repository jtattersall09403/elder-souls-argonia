import { describe, expect, it } from "vitest";
import { froxelUvw, froxelWorld, shadowedSkyFactor, terrainSunVisibility, type FroxelBasis } from "./terrainSun";

/** A 60 m ridge along z at x = 0 (Gaussian, 40 m wide), flat ground elsewhere. */
const ridge = (x: number) => 60 * Math.exp(-(x * x) / (2 * 40 * 40));
const ground = (x: number) => ridge(x);

function sunAt(altDeg: number, towardX: number): [number, number, number] {
  const a = (altDeg * Math.PI) / 180;
  return [Math.cos(a) * towardX, Math.sin(a), 0];
}

describe("terrain sun visibility (the five probes)", () => {
  it("a low sun behind a ridge leaves the shaded valley over 80 % darker, the sunlit side within 2 %", () => {
    const sun = sunAt(8, -1); // the sun low in the -x, the ridge between it and the +x valley
    const shaded = terrainSunVisibility(ground, [120, 2, 0], sun);
    const lit = terrainSunVisibility(ground, [-120, 2, 0], sun);
    expect(shaded).toBeLessThan(0.2);
    expect(lit).toBeGreaterThan(0.98);
  });
  it("a high sun clears the same ridge", () => {
    expect(terrainSunVisibility(ground, [120, 2, 0], sunAt(60, -1))).toBeGreaterThan(0.98);
  });
  it("fog above the ridge top stays sunlit", () => {
    expect(terrainSunVisibility(ground, [120, 75, 0], sunAt(8, -1))).toBeGreaterThan(0.95);
  });
  it("the sky ambient dims only while the sun is up, never below the shadowed floor", () => {
    expect(shadowedSkyFactor(0, 0.5)).toBeCloseTo(0.6);
    expect(shadowedSkyFactor(1, 0.5)).toBe(1);
    expect(shadowedSkyFactor(0, -0.2)).toBe(1);
  });
});

describe("froxel lookup by world position (camera freshness, item 3)", () => {
  const basis = (yawDeg: number): FroxelBasis => {
    const a = (yawDeg * Math.PI) / 180;
    return { pos: [0, 2, 0], right: [Math.cos(a), 0, Math.sin(a)], up: [0, 1, 0], fwd: [Math.sin(a), 0, -Math.cos(a)],
      tanHalf: [0.577 * 16 / 9, 0.577], near: 0.5, far: 1500 };
  };
  it("a grid one frame behind a camera yawing 90 deg/s is looked up on the geometry, not shifted", () => {
    const grid = basis(0), render = basis(90 / 60); // the render camera has turned 1.5 deg since the inject
    const edge: [number, number, number] = [3, 1, -20]; // a fixed occluder edge
    // by world position in the grid's own basis: the froxel the inject lit at the edge
    const back = froxelWorld(froxelUvw(edge, grid), grid);
    expect(Math.hypot(back[0] - edge[0], back[1] - edge[1], back[2] - edge[2])).toBeLessThan(1e-6);
    // by the render camera's screen position (the old lookup): the edge lands ~0.5 m off at 20 m
    const screen = froxelUvw(edge, render);
    const stale = froxelWorld(screen, grid);
    expect(Math.hypot(stale[0] - edge[0], stale[2] - edge[2])).toBeGreaterThan(0.4);
  });
});
