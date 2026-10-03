import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { Volumetrics, MAX_GRID, type VolumetricBand } from "./froxelGrid";

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
