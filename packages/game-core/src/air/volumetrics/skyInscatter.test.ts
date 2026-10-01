import { describe, expect, it } from "vitest";
import { SKY_INSCATTER } from "./froxelGrid";

// three.js lights a Lambert surface by irradiance x albedo / pi, with a hemisphere light's colour x
// intensity as that irradiance. The fog's sky term must use the same irradiance: thick fog under a
// sky that lights a white floor to radiance E/pi settles below that floor, never pi times above it
// (walk 9: the irradiance was passed x pi and the fog read ~2x the horizon sky).
describe("sky in-scatter scale", () => {
  it("thick sky-lit fog settles below a white Lambert floor under the same hemisphere light", () => {
    const E = 2000; // hemisphere colour x intensity, lux
    const floor = E / Math.PI;
    const fog = E * SKY_INSCATTER * 0.95; // albedo
    expect(fog / floor).toBeGreaterThan(0.5);
    expect(fog / floor).toBeLessThan(1);
  });
});
