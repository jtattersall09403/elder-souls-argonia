import { describe, expect, it } from "vitest";
import { toEpochMinutes } from "@elder-souls/world-time";
import { computeLightRig } from "./lightRig";
import { domeScreen, ENVELOPE_DIRS, envelopeDir } from "./skyScreenModel";

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

describe("screen-luminance envelope (owner round 5 — no whiteouts, no black gaps)", () => {
  // The dome's on-screen brightness is pinned by construction in the rig
  // (skyLuminance normalised against the CPU Preetham port). This test walks
  // the whole day at two humidities and asserts the ACTUAL screen luminance
  // of the patched dome stays inside a displayable envelope everywhere
  // except the circumsolar glare. Rounds 2–5 each found one of these bands
  // out of range by eye; this catches the next one in `npm test`.
  function rigAtAlt(targetAlt: number, humidity: number) {
    let lo = 0;
    let hi = 720; // morning half of day 100: altitude rises monotonically
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      const r = computeLightRig(100 * 1440 + mid, humidity, 0);
      if ((r.sun.altitude * 180) / Math.PI < targetAlt) lo = mid;
      else hi = mid;
    }
    return computeLightRig(100 * 1440 + (lo + hi) / 2, humidity, 0);
  }

  it("keeps the sky displayable at every hour and humidity", () => {
    const alts = [-16, -14, -12, -10, -8, -6, -4, -2, 0, 2, 4, 6, 8, 10, 14, 20, 30, 45, 60, 75];
    for (const hum of [0.25, 0.86]) {
      for (const alt of alts) {
        const rig = rigAtAlt(alt, hum);
        for (const [label, elev, dAz] of ENVELOPE_DIRS) {
          const screen = Math.max(...domeScreen(rig, envelopeDir(rig, elev, dAz)));
          const where = `${label} @ alt ${alt}° hum ${hum}`;
          // Never pitch black: dusk/night sky stays readable (round-4/5 gap).
          expect(screen, `black: ${where}`).toBeGreaterThan(0.02);
          // Never blown out — except graded glare near the sun itself (the
          // mid-solar sample stares straight into the sun at some altitudes;
          // 16 allows the white glare point, the off-sun caps are the real
          // whiteout guards).
          const cap = label.includes("solar") ? 16 : label.startsWith("low") ? 2.8 : 1.7;
          expect(screen, `blown: ${where}`).toBeLessThan(cap);
        }
      }
    }
  });
});
