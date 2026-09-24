import { describe, expect, it } from "vitest";
import { actionSecondsAt, attackClipTiming, clipSecondsAt, UNIT_CLIP_TIMING, uniformClipTiming } from "./clipTiming";

describe("clip timing", () => {
  it("is the identity when unscaled", () => {
    expect(clipSecondsAt(0.8, UNIT_CLIP_TIMING)).toBe(0.8);
    expect(actionSecondsAt(0.8, UNIT_CLIP_TIMING)).toBe(0.8);
  });

  it("divides by one scale when uniform (the old single timeScale)", () => {
    expect(clipSecondsAt(1.4, uniformClipTiming(1.4))).toBeCloseTo(1, 12);
  });

  it("splits at the end of the wind-up", () => {
    // Authored: wind-up 0.5 s, then 1.0 s of swing. Class ×1.4, swing ×0.85.
    const attack = { windup: 0.5 * 1.4, timeScale: { windup: 1.4, swing: 1.4 * 0.85 } };
    const timing = attackClipTiming(attack);
    expect(clipSecondsAt(attack.windup, timing)).toBeCloseTo(0.5, 12);
    const end = attack.windup + 1.0 * 1.4 * 0.85;
    expect(clipSecondsAt(end, timing)).toBeCloseTo(1.5, 12);
    for (const t of [0, 0.3, 0.7, 1.1, end]) expect(actionSecondsAt(clipSecondsAt(t, timing), timing)).toBeCloseTo(t, 12);
  });
});
