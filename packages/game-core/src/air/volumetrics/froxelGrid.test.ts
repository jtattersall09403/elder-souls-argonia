import { describe, expect, it, vi } from "vitest";
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
});
