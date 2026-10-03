import { describe, expect, it } from "vitest";
import { cellAmbientLuminance, playerFillIntensity } from "./playerFill";
// DawnstarBrinasHouse's recorded ambient (province/interiors/DawnstarBrinasHouse.json)
const brinas = {
  ambient: { colorRGB: [45, 48, 48], intensity: 1 },
  lighting: { ambientCube: {
    px: [0.02122, 0.02956, 0.02624], nx: [0.03071, 0.02956, 0.0319], py: [0.05781, 0.06663, 0.06848],
    ny: [0.0075, 0.00802, 0.0075], pz: [0.02624, 0.0319, 0.02956], nz: [0.02624, 0.02624, 0.02956],
  } },
};

describe("player fill", () => {
  it("is k x the ambient irradiance at d (I/d^2 = k x PI x L)", () => {
    const i = playerFillIntensity(0.05, 2, 0.9);
    expect(i / 0.81).toBeCloseTo(2 * Math.PI * 0.05, 10);
  });
  it("is off at k 0 and in a black cell", () => {
    expect(playerFillIntensity(0.05, 0, 0.9)).toBe(0);
    expect(playerFillIntensity(0, 2, 0.9)).toBe(0);
  });
  it("reads the cube mean, else the flat colour, times ambient.intensity", () => {
    const grey: [number, number, number] = [0.1, 0.1, 0.1];
    const cube = { px: grey, nx: grey, py: grey, ny: grey, pz: grey, nz: grey };
    expect(cellAmbientLuminance({ ambient: { colorRGB: [0, 0, 0], intensity: 2 }, lighting: { ambientCube: cube } } as never))
      .toBeCloseTo(0.2, 6);
    expect(cellAmbientLuminance({ ambient: { colorRGB: [255, 255, 255], intensity: 0.5 } } as never)).toBeCloseTo(0.5, 6);
  });
  it("Brinas: k 2 adds ~0.19 to the backlit side (was 0.092)", () => {
    const l = cellAmbientLuminance(brinas as never);
    const added = playerFillIntensity(l, 2, 0.9) / 0.81;
    expect(added).toBeGreaterThan(0.15);
    expect(added).toBeLessThan(0.25);
  });
});
