import { describe, expect, it } from "vitest";
import { NOISE_LOUDNESS, NOISE_RADIUS_METRES, noiseHeard } from "./noise";

/**
 * Expected answers, written before the code (combat-sandbox lane round 4,
 * decision 0092 §3): loudness × max(0, 1 − distance / radius), radius 15 m.
 */
describe("noise", () => {
  it("carries each player event's loudness", () => {
    expect(NOISE_LOUDNESS).toEqual({
      walk: 0.25, walkSneaking: 0.05, run: 0.45, sprint: 0.6,
      jumpLanding: 0.7, roll: 0.5, attackSwing: 0.8, blockHit: 0.9,
    });
    expect(NOISE_RADIUS_METRES).toBe(15);
  });
  it("falls off linearly to nothing at the radius", () => {
    expect(noiseHeard(0.8, 0)).toBeCloseTo(0.8, 9);
    // 0.8 × (1 − 1.5/15) = 0.72
    expect(noiseHeard(0.8, 1.5)).toBeCloseTo(0.72, 9);
    // 0.25 × (1 − 6/15) = 0.15
    expect(noiseHeard(NOISE_LOUDNESS.walk, 6)).toBeCloseTo(0.15, 9);
    expect(noiseHeard(0.9, 15)).toBe(0);
    expect(noiseHeard(0.9, 40)).toBe(0);
  });
  it("takes another radius", () => {
    // 0.6 × (1 − 5/10) = 0.3
    expect(noiseHeard(0.6, 5, 10)).toBeCloseTo(0.3, 9);
  });
});
