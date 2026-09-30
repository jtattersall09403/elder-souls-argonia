import { describe, expect, it } from "vitest";
import { airlightIntegral } from "./volumetricNodes";

describe("airlightIntegral", () => {
  it("matches a numeric march of the inverse-square in-scatter", () => {
    const [sigma, I, t0, h, L] = [0.1, 60, 20, 1.5, 40];
    const d = Math.hypot(t0, h);
    let sum = 0;
    const n = 200000;
    for (let k = 0; k < n; k++) { const t = (k + 0.5) * L / n; sum += 1 / (h * h + (t - t0) ** 2) * L / n; }
    expect(airlightIntegral(sigma, I, t0, h, L, d)).toBeCloseTo(sigma * I / (4 * Math.PI) * Math.exp(-sigma * d) * sum, 4);
  });
  it("falls off with distance from the ray (a round halo, not a band)", () => {
    const a = airlightIntegral(0.1, 60, 20, 0.5, 40, 20), b = airlightIntegral(0.1, 60, 20, 3, 40, 20);
    expect(a / b).toBeGreaterThan(5);
  });
});
