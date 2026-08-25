import { describe, expect, it } from "vitest";
import { toEpochMinutes } from "@elder-souls/world-time";
import { computeLightRig } from "./lightRig";

const at = (month: number, day: number, hour: number) =>
  toEpochMinutes({ era: 4, year: 201, month, day, minuteOfDay: hour * 60 });

describe("light rig (module 55 §96)", () => {
  it("is a pure function of the instant", () => {
    const m = at(4, 12, 9.25);
    expect(computeLightRig(m, 0.7, 0.3)).toEqual(computeLightRig(m, 0.7, 0.3));
  });

  it("spans the physical illuminance range: ~1e5 lx noon to sub-lux night", () => {
    const noon = computeLightRig(at(7, 17, 12), 0.6, 0.5);
    expect(noon.sunIntensity).toBeGreaterThan(60_000);
    expect(noon.exposureTarget).toBeLessThan(1e-4);
    const night = computeLightRig(at(7, 17, 1), 0.6, 0.5);
    expect(night.sunIntensity).toBe(0);
    expect(night.sceneIlluminance).toBeLessThan(5);
    // Exposure floor keeps night readable instead of physically exact
    // (ceiling 30 after owner round 2: moonless night must not be pitch black).
    expect(night.exposureTarget).toBeGreaterThan(0.5);
    expect(night.exposureTarget).toBeLessThanOrEqual(30);
  });

  it("reddens and dims the sun at the horizon", () => {
    const dusk = computeLightRig(at(7, 17, 17.5), 0.6, 0.5);
    expect(dusk.sunColor[0]).toBeGreaterThan(dusk.sunColor[2] * 1.8);
    expect(dusk.sunIntensity).toBeLessThan(12_000);
    expect(dusk.sunIntensity).toBeGreaterThan(0);
  });

  it("derives air clarity from the humidity field: mountains crisp, swamps hazy", () => {
    const crisp = computeLightRig(at(2, 10, 15), 0.25, -0.6);
    const soup = computeLightRig(at(2, 10, 15), 0.95, -0.6);
    expect(soup.turbidity).toBeGreaterThan(crisp.turbidity + 1.8);
    // Mie is PINNED at the Sky addon default — humidity above it turns the
    // circumsolar sky into a white glare (owner rounds 1 and 2, decision
    // 0021). The humid glow belongs to the aerial haze, not the dome.
    expect(soup.mieCoefficient).toBeCloseTo(crisp.mieCoefficient, 5);
  });

  it("pools ground mist at dawn in the dry season, not at monsoon noon", () => {
    const dryDawn = computeLightRig(at(1, 14, 6), 0.7, -0.9);
    const monsoonNoon = computeLightRig(at(6, 14, 12), 0.7, 0.9);
    expect(dryDawn.mistStrength).toBeGreaterThan(0.5);
    expect(monsoonNoon.mistStrength).toBeLessThan(0.05);
  });

  it("hands the night to the moons and stars", () => {
    // Midyear 4 is a full-moon night (28-night cycle from the 4E 201 epoch).
    const fullMoon = computeLightRig(at(5, 4, 23), 0.7, 0.4);
    expect(fullMoon.moons[0].illuminatedFraction).toBeGreaterThan(0.95);
    expect(fullMoon.skyFade).toBe(0);
    expect(fullMoon.starOpacity).toBe(1);
    expect(fullMoon.nightZenith[2]).toBeGreaterThan(0.002);
  });
});
