import { describe, expect, it } from "vitest";
import { footAnchoredVelocity, groundTrackTotal, hasGroundTrack } from "./footAnchoredMotion";

/**
 * The rule these hold the measurement to is the owner's own statement of it:
 * if the feet are not moving, the body should not be either. Every assertion
 * here is against a real clip in the shipped manifest, so a rebuild that broke
 * the foot tracking would fail them rather than quietly change how combat
 * moves.
 */
describe("motion taken from the feet", () => {
  it("gives a standing idle no ground at all", () => {
    // Nine seconds of breathing. The old constant-velocity model had nothing to
    // say about this because it only ran during an attack; the point is that
    // the measurement agrees with the obvious case.
    for (const state of ["IDLE", "SWORD_IDLE"] as const) {
      const total = groundTrackTotal(state);
      expect(Math.hypot(total.forward, total.lateral), state).toBeLessThan(0.01);
    }
  });

  it("reads a walk and a run as travelling forwards", () => {
    // Which way is forward is established here rather than assumed: these two
    // cycles unambiguously travel that way.
    for (const state of ["WALK", "RUN"] as const) {
      const total = groundTrackTotal(state);
      expect(total.forward, state).toBeGreaterThan(0.5);
      expect(Math.abs(total.lateral), state).toBeLessThan(total.forward * 0.2);
    }
  });

  it("reads a planted overhead as barely moving the body", () => {
    // The reported defect, as a number. A battleaxe's heavy plants its feet and
    // swings; over the whole two-second clip the body travels centimetres,
    // against a lunge that had been pushing it for the entire wind-up.
    const total = groundTrackTotal("GREATAXE_HEAVY");
    expect(Math.hypot(total.forward, total.lateral)).toBeLessThan(0.1);
  });

  it("reads a stepping swing as a step", () => {
    const total = groundTrackTotal("LIGHT_1");
    expect(total.forward).toBeGreaterThan(0.05);
    expect(total.forward).toBeLessThan(0.5);
  });

  it("differentiates to a velocity, and integrates back to the same distance", () => {
    // Run past the end of the clip: sampling clamps there, so this proves the
    // velocity is the exact derivative of the distance the feet measured, with
    // no drift accumulated across a hundred and sixty steps.
    const step = 1 / 120;
    let travelled = 0;
    for (let elapsed = step; elapsed <= 1.45; elapsed += step) {
      travelled += footAnchoredVelocity("LIGHT_1", elapsed, step).forward * step;
    }
    expect(travelled).toBeCloseTo(groundTrackTotal("LIGHT_1").forward, 3);
  });

  it("is exactly nothing when no time has passed", () => {
    expect(footAnchoredVelocity("LIGHT_1", 0.4, 0)).toEqual({ forward: 0, lateral: 0 });
  });

  it("has a track for every clip an attack can play", () => {
    for (const state of ["LIGHT_1", "LIGHT_2", "LIGHT_3", "HEAVY", "HEAVY_2",
      "GREATSWORD_LIGHT_1", "GREATAXE_HEAVY", "ROLL", "BACKSTEP"] as const) {
      expect(hasGroundTrack(state), state).toBe(true);
    }
  });
});
