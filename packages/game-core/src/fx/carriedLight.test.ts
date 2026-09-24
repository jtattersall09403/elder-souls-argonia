import { describe, expect, it } from "vitest";
import {
  carriedLightIntensity,
  igniteCarriedLight,
  lightSourceFromRecord,
  tickCarriedLight,
  type LightSourceSpec,
} from "./carriedLight";

/**
 * Expected answers written first (combat-sandbox lane round 3). The torch is
 * Skyrim's Torch01 (LIGH 0001d4ec): 240 s burn, radius 512 units, colour
 * 250/190/131, flicker.
 */
const TORCH01 = {
  formId: "0001d4ec",
  burnSeconds: 240,
  radiusUnits: 512,
  colourRgb: [250, 190, 131] as const,
  flicker: { frequency: 0.667, intensityAmplitude: 0.5, movementAmplitude: 10 },
  flags: ["dynamic", "canBeCarried", "flicker"],
};

describe("a light source from a Skyrim LIGH record", () => {
  it("converts units to metres and colour to 0-1, and keeps the burn time", () => {
    const spec = lightSourceFromRecord("torch", TORCH01);
    expect(spec.radiusMetres).toBeCloseTo(512 * 0.01428, 6);
    expect(spec.colour).toEqual([250 / 255, 190 / 255, 131 / 255]);
    expect(spec.burnSeconds).toBe(240);
    expect(spec.extinguishedBy).toEqual(["submerged"]);
  });
});

describe("burning", () => {
  const spec: LightSourceSpec = lightSourceFromRecord("torch", TORCH01);
  it("burns down and goes out at the end of its time, once", () => {
    let state = igniteCarriedLight(spec);
    state = tickCarriedLight(state, spec, 239, { submerged: false });
    expect(state.lit).toBe(true);
    expect(state.remainingSeconds).toBeCloseTo(1, 6);
    state = tickCarriedLight(state, spec, 2, { submerged: false });
    expect(state.lit).toBe(false);
    expect(state.burntOut).toBe(true);
    expect(state.remainingSeconds).toBe(0);
  });
  it("goes out under water but is not used up", () => {
    const state = tickCarriedLight(igniteCarriedLight(spec), spec, 1, { submerged: true });
    expect(state.lit).toBe(false);
    expect(state.burntOut).toBe(false);
    // Put out at once: a light that is out does not burn.
    expect(state.remainingSeconds).toBe(240);
  });
  it("never burns out when it has no burn time (a lantern, a light spell held open)", () => {
    const lantern: LightSourceSpec = { ...spec, id: "lantern", burnSeconds: null, extinguishedBy: [] };
    const state = tickCarriedLight(igniteCarriedLight(lantern), lantern, 10_000, { submerged: true });
    expect(state.lit).toBe(true);
    expect(state.remainingSeconds).toBeNull();
  });
});

describe("flicker", () => {
  const spec = lightSourceFromRecord("torch", TORCH01);
  it("stays within ±amplitude/2 of full intensity and is zero when out", () => {
    const lit = igniteCarriedLight(spec);
    for (let t = 0; t < 5; t += 0.05) {
      const value = carriedLightIntensity(lit, spec, t);
      expect(value).toBeGreaterThanOrEqual(1 - spec.flicker!.intensityAmplitude / 2 - 1e-9);
      expect(value).toBeLessThanOrEqual(1 + 1e-9);
    }
    expect(carriedLightIntensity({ ...lit, lit: false }, spec, 1)).toBe(0);
  });
});
