import { describe, expect, it } from "vitest";
import { cloudAlphaTowards, cloudFbm, cloudParamsFrom, type CloudParams } from "./cloudField";
import { PROFILES } from "@elder-souls/world-weather";

const P = (over: Partial<CloudParams> = {}): CloudParams => ({
  covLow: 0.3,
  covMid: 0.5,
  covHigh: 0.2,
  density: 1,
  puff: 0.5,
  scroll: 1,
  stormFront: 0,
  windDir: [1, 0],
  timeS: 137.5,
  ...over,
});

describe("cloud field (CPU twin of the dome shader, round 2)", () => {
  it("alpha is 0..1 everywhere and 0 below the horizon", () => {
    for (let i = 0; i < 200; i += 1) {
      const az = (i / 200) * Math.PI * 2;
      const el = -0.2 + 1.2 * ((i * 37) % 200) / 200;
      const d: [number, number, number] = [
        Math.cos(az) * Math.cos(el),
        Math.sin(el),
        Math.sin(az) * Math.cos(el),
      ];
      const a = cloudAlphaTowards(d, P());
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
      if (d[1] <= 0.012) expect(a).toBe(0);
    }
  });

  it("mean alpha rises with coverage: clear sparse, overcast near-solid", () => {
    const mean = (p: CloudParams) => {
      let s = 0;
      let n = 0;
      for (let i = 0; i < 120; i += 1) {
        const az = (i / 120) * Math.PI * 2;
        const el = 0.25 + 0.6 * ((i * 7) % 120) / 120;
        s += cloudAlphaTowards(
          [Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)],
          p,
        );
        n += 1;
      }
      return s / n;
    };
    const clear = mean(cloudParamsFrom(PROFILES.clear, [1, 0], 137.5));
    const overcast = mean(cloudParamsFrom(PROFILES.overcast, [1, 0], 137.5));
    const storm = mean(cloudParamsFrom(PROFILES.thunderstorm, [1, 0], 137.5));
    expect(clear).toBeLessThan(0.35);
    expect(overcast).toBeGreaterThan(clear + 0.2);
    expect(storm).toBeGreaterThan(0.8);
  });

  it("the squall wall stands on the upwind horizon and thins downwind", () => {
    const p = cloudParamsFrom(PROFILES.squall, [1, 0], 137.5);
    const lowEl = 0.28;
    const mean = (dirX: number) => {
      let s = 0;
      for (let k = -2; k <= 2; k += 1) {
        const az = Math.atan2(0, dirX) + k * 0.25;
        s += cloudAlphaTowards(
          [Math.cos(az) * Math.cos(lowEl), Math.sin(lowEl), Math.sin(az) * Math.cos(lowEl)],
          p,
        );
      }
      return s / 5;
    };
    // wind travels +x → the wall approaches from -x (upwind).
    expect(mean(-1)).toBeGreaterThan(mean(1) + 0.15);
  });

  it("fbm is deterministic and mid-ranged", () => {
    expect(cloudFbm(3.7, 11.2)).toBe(cloudFbm(3.7, 11.2));
    let s = 0;
    for (let i = 0; i < 400; i += 1) s += cloudFbm(i * 0.173, i * 0.077);
    const m = s / 400;
    expect(m).toBeGreaterThan(0.3);
    expect(m).toBeLessThan(0.7);
  });
});
