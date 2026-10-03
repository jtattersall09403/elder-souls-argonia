import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { Volumetrics, MAX_GRID, BEAM_SPREAD_RAD, beamRadiusM, beamMembership, beamEdgeNorm, BEAM_DUST_PER_M, beamInscatterPerM, type VolumetricBand } from "./froxelGrid";

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
  it("never writes a non-finite origin while the terrain grids bake, and dispatches only once both are baked", () => {
    const computes: number[] = [];
    let frame = 0;
    const slow = (h: number) => { const t = performance.now() + 0.05; while (performance.now() < t) { /* a slow sampler: the bake spans frames */ } return h; };
    const v = new Volumetrics({
      renderer: { compute: () => computes.push(frame) } as never, backend: "webgpu", crowns: () => [],
      terrain: { groundHeight: () => slow(2), water: () => ({ height: 0, mask: 0 }), seaMask: () => 0, wetness: () => 0 } as never,
    });
    v.setBand("low");
    const u = (v as unknown as { u: Record<string, { value: THREE.Vector2 }> }).u;
    const camera = new THREE.PerspectiveCamera(60, Number.NaN, 0.1, 1000);
    const f = { camera, timeS: 0, deltaS: Number.NaN, sunDir: new THREE.Vector3(0, 1, 0), sunIrradiance: new THREE.Color(), skyIrradiance: new THREE.Color() };
    for (; frame < 400 && computes.length === 0; frame++) {
      v.update(f);
      for (const k of ["nearOrigin", "farOrigin", "canopyOrigin"]) expect(Number.isFinite(u[k].value.x) && Number.isFinite(u[k].value.y)).toBe(true);
      if (computes.length === 0) expect(v.on.value).toBe(0);
    }
    expect(computes.length).toBeGreaterThan(0);
    expect(computes[0]).toBeGreaterThan(0); // the first frames waited for the bake
    expect(v.on.value).toBe(1);
    const tan = (v as unknown as { u: { tanHalf: { value: THREE.Vector2 } } }).u.tanHalf.value;
    expect(Number.isFinite(tan.x)).toBe(true);
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

describe("window beam soft edge (vol10 diag3 Q5)", () => {
  it("is ~0.5 at the cone's side and falls smoothly to 0 one cell outside", () => {
    const along = 3, cell = 0.12, r = beamRadiusM(0.4, along);
    const scale = Math.exp(-BEAM_DUST_PER_M * along);
    expect(beamMembership(r, along, 0.4, 10, cell) / scale).toBeCloseTo(0.5, 6);
    expect(beamMembership(r + cell, along, 0.4, 10, cell)).toBe(0);
    let prev = 1;
    for (let k = 0; k <= 10; k++) { const m = beamMembership(r - cell + (k / 5) * cell, along, 0.4, 10, cell); expect(m).toBeLessThanOrEqual(prev); prev = m; }
    expect(beamMembership(r + 0.5 * cell, along, 0.4, 10, cell) / scale).toBeGreaterThan(0.1);
  });
  it("fades along its length with no hard cut, and keeps its flux within 5 %", () => {
    const m = (a: number) => beamMembership(0, a, 0.4, 10, 0.12);
    expect(m(9.9)).toBeLessThan(0.01); expect(m(9.9)).toBeGreaterThan(0);
    expect(m(6) - m(7)).toBeLessThan(0.3);
    expect(beamEdgeNorm(0.4, 0.12)).toBeGreaterThan(0.95);
  });
  it("Keeba beam (unit 25.8, dust 0.04) does not blow out over the 0.27 cell ambient", () => {
    // side view over a 0.8 m wide beam, and looking down the beam (forward lobe)
    expect(beamInscatterPerM(25.8, 0, 0) * 0.8).toBeLessThan(0.27);
    expect(beamInscatterPerM(25.8, 0, 1) * 0.8).toBeLessThan(3 * 0.27);
  });
});


describe("shaft march gate (vol10 c10 M3)", () => {
  it("the canopy map flags whether any crown is near", async () => {
    const { CanopyMap } = await import("./canopyMap");
    const empty = new CanopyMap(() => []);
    empty.update(0, 0, true);
    expect(empty.hasCrowns).toBe(false);
    const forest = new CanopyMap(() => [{ x: 10, z: 0, radiusM: 4, bottomM: 3, topM: 12 }]);
    forest.update(0, 0, true);
    expect(forest.hasCrowns).toBe(true);
  });
  it("skips the march with no crown (uniform branch) and the canopyT taps where a step has no weight", async () => {
    const fs = await import("node:fs");
    const src = fs.readFileSync(new URL("./froxelGrid.ts", import.meta.url), "utf8");
    expect(src).toMatch(/If\(u\.outdoor\.mul\(u\.canopyNear\)\.mul\(step\(float\(0\), u\.sunDir\.y\)\)\.greaterThan\(0\)/);
    expect(src).toMatch(/If\(w\.greaterThan\(0\), \(\) => \{\s+acc\.addAssign\([^;]*this\.canopyT\(p\)/);
    expect(src).toMatch(/u\.canopyNear\.value = this\.canopy\.hasCrowns \? 1 : 0;/);
    expect(src).toMatch(/\.mul\(this\.u\.outdoor\)\.mul\(this\.u\.canopyNear\);/);
  });
});
