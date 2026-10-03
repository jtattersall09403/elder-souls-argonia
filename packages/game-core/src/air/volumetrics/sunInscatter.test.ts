import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SUN_OD_PROBES_M, SUN_OD_SPAN_M, sunInscatterGain } from "./froxelGrid";

// Walk 9: the froxel haze saw the full sun through its own 150 m visibility, the forward lobe made it
// ~3x the horizon sky. The sun reaching the medium is the share the medium above lets through.
describe("sun in-scatter through the medium", () => {
  const hg = (g: number, c: number) => (1 - g * g) / (4 * Math.PI * Math.pow(1 + g * g - 2 * g * c, 1.5));
  it("a clear sun path keeps the phase lobe", () => {
    expect(sunInscatterGain(1, hg(0.85, 0.9))).toBeCloseTo(hg(0.85, 0.9), 9);
  });
  it("a 150 m haze (sigma 0.02/m) over the probed path leaves the sun near-isotropic", () => {
    const od = 0.02 * SUN_OD_SPAN_M.reduce((a, b) => a + b, 0);
    const g = sunInscatterGain(Math.exp(-od), hg(0.85, 0.9));
    expect(g).toBeLessThan(0.1);
    expect(g).toBeGreaterThan(1 / (4 * Math.PI) * 0.99);
  });
  it("conserves the isotropic floor and spans the probes", () => {
    expect(sunInscatterGain(0.3, 1 / (4 * Math.PI))).toBeCloseTo(1 / (4 * Math.PI), 9);
    expect(SUN_OD_PROBES_M.length).toBe(SUN_OD_SPAN_M.length);
  });
  it("the sun probes hold the fog shape at the froxel's own value (one fogShapeAt per froxel)", () => {
    const src = readFileSync(new URL("./froxelGrid.ts", import.meta.url), "utf8");
    const inject = src.slice(src.indexOf("private injectKernel("), src.indexOf("private blurKernel("));
    expect(inject.match(/fogShapeAt\(/g)?.length).toBe(1);
    expect(inject).toMatch(/this\.density\(p\.add\(u\.sunDir\.mul\(d\)\), spec, fp, shape\)/);
  });
});
