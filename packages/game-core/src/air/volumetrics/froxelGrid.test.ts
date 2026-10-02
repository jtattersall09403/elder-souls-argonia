import { describe, expect, it, vi } from "vitest";
import { Volumetrics, MAX_GRID, BEAM_SPREAD_RAD, beamRadiusM, type VolumetricBand } from "./froxelGrid";

const make = (backend: "webgpu" | "webgl") => new Volumetrics({
  renderer: {} as never, backend, terrain: {} as never, crowns: () => [],
});

describe("Volumetrics grids", () => {
  it("allocates the grids once at the largest band and keeps their identity across band steps", () => {
    const v = make("webgpu");
    const tex = v.textures;
    expect(tex.every((t) => t !== null)).toBe(true);
    for (const t of tex) { const im = t!.image as { width: number; height: number; depth: number }; expect([im.width, im.height, im.depth]).toEqual([...MAX_GRID]); }
    const spies = tex.map((t) => vi.spyOn(t!, "dispose"));
    const steps: VolumetricBand[] = ["medium", "low", "off", "high", "low", "off", "medium"];
    for (const b of steps) {
      v.setBand(b);
      expect(v.textures).toEqual(tex);
      expect(v.on.value).toBe(b === "off" ? 0 : 1);
    }
    for (const s of spies) expect(s).not.toHaveBeenCalled();
    v.dispose();
    for (const s of spies) expect(s).toHaveBeenCalledTimes(1);
  });
  it("WebGL allocates no grid and stays off", () => {
    const v = make("webgl");
    expect(v.textures.every((t) => t === null)).toBe(true);
    v.setBand("high");
    expect(v.band).toBe("off");
  });
});

describe("window beam", () => {
  it("is a cone: the aperture's radius at the window, widening by tan(spread) per metre", () => {
    expect(beamRadiusM(0.4, 0)).toBe(0.4);
    expect(beamRadiusM(0.4, 5)).toBeCloseTo(0.4 + 5 * Math.tan(BEAM_SPREAD_RAD), 9);
    expect(beamRadiusM(0.4, 5)).toBeGreaterThan(0.6);
    expect(BEAM_SPREAD_RAD).toBeGreaterThan(0.017); expect(BEAM_SPREAD_RAD).toBeLessThan(0.1);
  });
  it("inject adds no beam-only extinction and keeps the beam out of the air tint", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync(new URL("./froxelGrid.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/sigmaT\.addAssign/);
    expect(src).toMatch(/radiance\.mul\(tint\)\.mul\(sigmaT\)\.add\(beam\.mul\(max\(sigmaT, float\(BEAM_DUST_PER_M\)\)\)\)/);
  });
});

describe("G3 region height scale (vol10 F4b)", () => {
  it("the TSL radiation mist reads the regimes' heightScale uniform", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync(new URL("./froxelGrid.ts", import.meta.url), "utf8");
    expect(src).toMatch(/depth\.mul\(MIST_SCALE_SHARE\)\.mul\(max\(u\.mistHeightScale/);
    expect(src).toMatch(/u\.mistHeightScale\.value = r\?\.heightScale \?\? 1;/);
  });
});
