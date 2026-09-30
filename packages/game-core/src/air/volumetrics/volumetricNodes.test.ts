import { describe, expect, it } from "vitest";
import { airlightIntegral } from "./volumetricNodes";

describe("airlightIntegral", () => {
  it("with an isotropic phase matches a numeric march of the inverse-square in-scatter", () => {
    const [sigma, I, t0, h, L] = [0.1, 60, 20, 1.5, 40];
    let sum = 0;
    const n = 200000;
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) * L / n, r = Math.hypot(h, t - t0);
      sum += Math.exp(-sigma * (t + r)) / (r * r) * L / n;
    }
    const ref = sigma * I / (4 * Math.PI) * sum;
    expect(Math.abs(airlightIntegral(sigma, I, t0, h, L, 64, 0) / ref - 1)).toBeLessThan(0.02);
  });
  it("the forward lobe makes a round halo: bright near the lamp, falling fast off it", () => {
    const near = airlightIntegral(0.05, 60, 20, 0.3, 40), off = airlightIntegral(0.05, 60, 20, 4, 40);
    const isoNear = airlightIntegral(0.05, 60, 20, 0.3, 40, 10, 0), isoOff = airlightIntegral(0.05, 60, 20, 4, 40, 10, 0);
    expect(near / off).toBeGreaterThan(2 * (isoNear / isoOff));
  });
  it("the reach limit leaves a ray passing far from a lamp with ~0 airlight", () => {
    expect(airlightIntegral(0.05, 60, 30, 40, 200, 10, undefined, 33)).toBe(0);
    const near = airlightIntegral(0.05, 60, 30, 0.5, 200, 10, undefined, 33);
    expect(near / airlightIntegral(0.05, 60, 30, 0.5, 200)).toBeGreaterThan(0.9);
  });
});
