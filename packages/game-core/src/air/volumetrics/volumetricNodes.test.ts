import { describe, expect, it } from "vitest";
import { airlightIntegral, LAMP_HALO, lampHalo } from "./volumetricNodes";

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

describe("lamp halo floor", () => {
  it("at the damp-air floor a lamp 20 m off reads as a halo several metres wide, not a point", () => {
    const { sigmaFloorPerM, minReachM } = LAMP_HALO.high;
    const core = airlightIntegral(sigmaFloorPerM, 60, 20, 0.2, 40, 10, undefined, minReachM);
    const at1m = airlightIntegral(sigmaFloorPerM, 60, 20, 1, 40, 10, undefined, minReachM);
    // 1 m off the lamp at 20 m is ~3 deg, ~50 px at 1080p: still a tenth of the core
    expect(at1m / core).toBeGreaterThan(0.1);
    expect(at1m).toBeGreaterThan(0.1 * airlightIntegral(0.002, 60, 20, 0.2, 40, 10, undefined, minReachM));
  });
  it("mobile values sit beside the high ones", () => {
    expect(LAMP_HALO.mobile.viewM).toBeLessThanOrEqual(LAMP_HALO.high.viewM);
    expect(LAMP_HALO.mobile.minReachM).toBeGreaterThan(0);
  });
  it("a mobile renderer draws the mobile row, every desktop tier the high row", () => {
    expect(lampHalo("mobile")).toBe(LAMP_HALO.mobile);
    for (const t of ["low", "medium", "high"] as const) expect(lampHalo(t)).toBe(LAMP_HALO.high);
  });
});
