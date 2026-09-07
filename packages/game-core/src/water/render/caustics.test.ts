import { describe, expect, it } from "vitest";
import { causticVisibility, type CausticVisibilityInput } from "./caustics";

const CLEAR: CausticVisibilityInput = {
  depthM: 1, turbidity: 0, tannin: 0, sunElevation: 1,
  receiverIncidence: 1, directLightVisibility: 1, waveActivity: 1,
};
const visibility = (overrides: Partial<CausticVisibilityInput> = {}) => causticVisibility({ ...CLEAR, ...overrides });

describe("projected caustics visibility", () => {
  it("requires a submerged, directly lit receiver and an active water surface", () => {
    expect(visibility()).toBeGreaterThan(0.8);
    for (const overrides of [
      { depthM: 0 }, { depthM: -2 }, { sunElevation: -1 },
      { directLightVisibility: 0 }, { receiverIncidence: 0 }, { waveActivity: 0 },
    ]) expect(visibility(overrides)).toBe(0);
  });

  it("obeys Beer–Lambert attenuation with actual light-path length", () => {
    expect(visibility()).toBeCloseTo(Math.exp(-0.1));
    expect(visibility({ depthM: 2 })).toBeCloseTo(Math.exp(-0.2));
    expect(visibility({ sunElevation: 0.3 })).toBeLessThan(visibility());
  });

  it("suppresses caustics in silt, and dims but keeps them in tannin water", () => {
    const clear = visibility({ depthM: 2 });
    expect(visibility({ depthM: 2, turbidity: 0.8 })).toBeLessThan(clear * 0.03);
    const tannic = visibility({ depthM: 2, tannin: 0.8 });
    expect(tannic).toBeLessThan(clear * 0.1);
    expect(tannic).toBeGreaterThan(clear * 0.02);
  });

  it("reads on a shallow sunlit bed and has faded out by seven metres", () => {
    expect(visibility({ depthM: 0.3 })).toBeGreaterThanOrEqual(0.15);
    expect(visibility({ depthM: 1 })).toBeGreaterThanOrEqual(0.15);
    expect(visibility({ depthM: 3 })).toBeGreaterThanOrEqual(0.15);
    // the shallow shelf the probe uses: 0.6 m, lightly silted, no tannin
    expect(visibility({ depthM: 0.6, turbidity: 0.12 })).toBeGreaterThan(0.5);
    expect(visibility({ depthM: 7 })).toBeLessThanOrEqual(0.03);
    expect(visibility({ depthM: 12 })).toBe(0);
  });

  it("tracks shadow and receiver incidence continuously", () => {
    expect(visibility({ directLightVisibility: 0.3 })).toBeCloseTo(visibility() * 0.3);
    expect(visibility({ receiverIncidence: 0.4 })).toBeCloseTo(visibility() * 0.4);
    expect(visibility({ waveActivity: 0.2 })).toBeCloseTo(visibility() * 0.2);
  });

  it("fades gently at the waterline, horizon and deep-water cutoff", () => {
    expect(visibility({ depthM: 0.015 })).toBeLessThan(visibility({ depthM: 0.04 }));
    expect(visibility({ sunElevation: 0.02 })).toBeLessThan(visibility({ sunElevation: 0.15 }));
    expect(visibility({ depthM: 6.9 })).toBeLessThan(visibility({ depthM: 5 }));
    expect(visibility({ depthM: 7 })).toBe(0);
    expect(visibility({ depthM: 1000 })).toBe(0);
  });

  it("remains bounded for valid finite world data and out-of-range controls", () => {
    for (const depthM of [-1, 0, 0.02, 0.5, 3, 6, 7, 24]) {
      for (const sunElevation of [-1, 0, 0.05, 0.3, 1, 2]) {
        const value = visibility({ depthM, sunElevation, receiverIncidence: 2, directLightVisibility: 3, waveActivity: 4 });
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });
});
