import { describe, expect, it } from "vitest";
import { airlightIntegral, airlightSegment, FIRE_HALO_FALLOFF_M, FIRE_HALO_SIGMA_PER_M, LAMP_HALO, lampHalo, localScatter } from "./volumetricNodes";

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
  it("clear air does not dim the lamp it lights: the floor scatters, the grid sigma extinguishes (diag8 O-1)", () => {
    const { sigmaFloorPerM, minReachM } = LAMP_HALO.high;
    // the integrand's peak at t = 40 m: scatter x exp(-ext t); r7 extinguished with the floor too (0.0084)
    expect(sigmaFloorPerM * Math.exp(-0.002 * 40)).toBeGreaterThanOrEqual(3 * 0.0084);
    const split = airlightIntegral(sigmaFloorPerM, 60, 40, 0.2, 80, 10, undefined, minReachM, 0, 0.002);
    const r7 = airlightIntegral(sigmaFloorPerM, 60, 40, 0.2, 80, 10, undefined, minReachM);
    expect(split / r7).toBeGreaterThanOrEqual(3);
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

describe("fire halo (vol10 diag4 D7)", () => {
  it("a fire's light scatters ~10x the cell floor within ~2 m and the floor beyond", () => {
    const sigma = 0.012;
    expect(localScatter(sigma, FIRE_HALO_SIGMA_PER_M, 0)).toBeCloseTo(0.12, 6);
    expect(localScatter(sigma, FIRE_HALO_SIGMA_PER_M, FIRE_HALO_FALLOFF_M)).toBe(sigma);
    expect(localScatter(sigma, 0, 0.5)).toBe(sigma);
    // a ray passing 0.5 m from the fire gathers over 3x the plain halo; one passing 6 m off gathers the same
    const near = airlightIntegral(sigma, 1, 3, 0.5, 10, 64, 0.5, 6, FIRE_HALO_SIGMA_PER_M) / airlightIntegral(sigma, 1, 3, 0.5, 10, 64, 0.5, 6);
    const far = airlightIntegral(sigma, 1, 3, 6, 10, 64, 0.5, 20, FIRE_HALO_SIGMA_PER_M) / airlightIntegral(sigma, 1, 3, 6, 10, 64, 0.5, 20);
    expect(near).toBeGreaterThan(3);
    expect(far).toBeCloseTo(1, 6);
  });
});

describe("sky pixels take the lamp airlight (vol10 c9 H)", () => {
  it("a sky ray beside a geometry ray ending 300 m away carries the same halo: no silhouette step", () => {
    const far = 2000, R = Math.max(8 * 3, LAMP_HALO.high.minReachM), sigma = LAMP_HALO.high.sigmaFloorPerM;
    // two rays 0.5 deg apart, both passing 2 m from a radius-8 lamp 20 m away
    const t0 = 20, hGeom = 2, hSky = 2;
    const geom = airlightIntegral(sigma, 60, t0, hGeom, airlightSegment(300, far), 10, undefined, R);
    const sky = airlightIntegral(sigma, 60, t0, hSky, airlightSegment(Infinity, far), 10, undefined, R);
    expect(geom).toBeGreaterThan(0);
    expect(Math.abs(geom - sky) / geom).toBeLessThan(0.02);
  });
});
