import { describe, expect, it } from "vitest";
import { AIR_SPECIES, airAmounts, seededRandom, type AirConditions } from "./ambientAir";
import { sunShaftIntensity } from "./sunShafts";

/**
 * The presence rules are the part of this layer worth testing: they are the
 * "derive where and when it makes sense" the owner asked for, and each one is
 * a claim about the animal or the particle rather than a look. Every claim
 * below is one of those statements, asserted.
 */

const MARSH_NIGHT: AirConditions = {
  sunAltDeg: -20,
  humidity: 0.85,
  rain: 0,
  cloud: 0.1,
  windSpeed: 1,
  cameraY: 4,
};

const at = (over: Partial<AirConditions>): AirConditions => ({ ...MARSH_NIGHT, ...over });

describe("ambient air presence rules (owner 2026-09-10)", () => {
  it("puts fireflies over the wet marsh at night, and nowhere by day", () => {
    expect(airAmounts(MARSH_NIGHT).fireflies).toBeGreaterThan(0.6);
    expect(airAmounts(at({ sunAltDeg: 40 })).fireflies).toBe(0);
  });

  it("grounds fireflies in rain and in wind", () => {
    expect(airAmounts(at({ rain: 1 })).fireflies).toBe(0);
    expect(airAmounts(at({ windSpeed: 14 })).fireflies).toBe(0);
    // A stiff breeze thins them well before it clears them.
    expect(airAmounts(at({ windSpeed: 7 })).fireflies).toBeLessThan(
      airAmounts(MARSH_NIGHT).fireflies,
    );
  });

  it("keeps fireflies off the dry uplands even at night", () => {
    expect(airAmounts(at({ humidity: 0.2 })).fireflies).toBe(0);
  });

  it("swarms midges at dawn and dusk only — not midday, not midnight", () => {
    const dusk = airAmounts(at({ sunAltDeg: -1 })).midges;
    expect(dusk).toBeGreaterThan(0.4);
    expect(airAmounts(at({ sunAltDeg: -20 })).midges).toBeLessThan(0.05);
    expect(airAmounts(at({ sunAltDeg: 40 })).midges).toBeLessThan(0.05);
  });

  it("shows pollen only in daylight, and washes it out in rain", () => {
    const sunnyDay = at({ sunAltDeg: 35, cloud: 0.05, humidity: 0.6 });
    expect(airAmounts(sunnyDay).pollen).toBeGreaterThan(0.5);
    // It is lit, not luminous: no sun, nothing to see.
    expect(airAmounts(at({ sunAltDeg: -20 })).pollen).toBe(0);
    expect(airAmounts({ ...sunnyDay, rain: 1 }).pollen).toBe(0);
    // Overcast leaves no beam for it to hang in.
    expect(airAmounts({ ...sunnyDay, cloud: 0.95 }).pollen).toBe(0);
  });

  it("needs wind to bring leaves down", () => {
    const day = at({ sunAltDeg: 35, windSpeed: 0.5 });
    expect(airAmounts(day).leaves).toBe(0);
    expect(airAmounts({ ...day, windSpeed: 8 }).leaves).toBeGreaterThan(0.5);
  });

  it("fades everything out above the canopy", () => {
    for (const [id, amount] of Object.entries(airAmounts(at({ cameraY: 400 })))) {
      expect(amount, `${id} at 400 m`).toBe(0);
    }
    // And in fly-over, where the camera is far higher still.
    expect(airAmounts(at({ cameraY: 2000 })).fireflies).toBe(0);
  });

  it("never returns an amount outside 0..1", () => {
    for (const alt of [-40, -6, 0, 8, 45, 89]) {
      for (const hum of [0, 0.5, 1]) {
        for (const wind of [0, 5, 25]) {
          for (const rain of [0, 0.5, 1]) {
            const a = airAmounts(at({ sunAltDeg: alt, humidity: hum, windSpeed: wind, rain }));
            for (const [id, v] of Object.entries(a)) {
              expect(Number.isFinite(v), `${id} finite`).toBe(true);
              expect(v, `${id} @ alt ${alt} hum ${hum} wind ${wind} rain ${rain}`).toBeGreaterThanOrEqual(0);
              expect(v).toBeLessThanOrEqual(1);
            }
          }
        }
      }
    }
  });

  it("covers every declared species, so a new one cannot be silently unlit", () => {
    const amounts = airAmounts(MARSH_NIGHT);
    for (const id of Object.keys(AIR_SPECIES)) {
      expect(Object.hasOwn(amounts, id), `no presence rule for "${id}"`).toBe(true);
    }
  });
});

describe("sun shafts (owner 2026-09-10)", () => {
  const UNDER_CANOPY = {
    sunAltDeg: 22,
    cloud: 0.1,
    rain: 0,
    canopy: 0.8,
    humidity: 0.8,
    cameraY: 5,
  };

  it("wants raking light under a canopy on a clear day", () => {
    expect(sunShaftIntensity(UNDER_CANOPY)).toBeGreaterThan(0.5);
  });

  it("needs a canopy — a shaft with nothing casting it is a cone of fog", () => {
    expect(sunShaftIntensity({ ...UNDER_CANOPY, canopy: 0 })).toBe(0);
  });

  it("dies under overcast and in rain", () => {
    expect(sunShaftIntensity({ ...UNDER_CANOPY, cloud: 0.9 })).toBe(0);
    expect(sunShaftIntensity({ ...UNDER_CANOPY, rain: 1 })).toBe(0);
  });

  it("switches off at night and at high noon", () => {
    // No beam at all below the horizon.
    expect(sunShaftIntensity({ ...UNDER_CANOPY, sunAltDeg: -5 })).toBe(0);
    // Overhead sun rakes nothing: shafts read as an artefact there.
    expect(sunShaftIntensity({ ...UNDER_CANOPY, sunAltDeg: 85 })).toBe(0);
  });

  it("reads stronger in damp marsh air than on a dry ridge", () => {
    const damp = sunShaftIntensity({ ...UNDER_CANOPY, humidity: 1 });
    const dry = sunShaftIntensity({ ...UNDER_CANOPY, humidity: 0 });
    expect(damp).toBeGreaterThan(dry);
    expect(dry).toBeGreaterThan(0);
  });

  it("stays inside 0..1 across the whole parameter space", () => {
    for (const sunAltDeg of [-10, 0, 5, 20, 50, 80, 90]) {
      for (const cloud of [0, 0.5, 1]) {
        for (const canopy of [0, 0.5, 1]) {
          for (const cameraY of [0, 100, 3000]) {
            const v = sunShaftIntensity({ sunAltDeg, cloud, rain: 0, canopy, humidity: 0.7, cameraY });
            expect(Number.isFinite(v)).toBe(true);
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });
});

describe("the swarm is deterministic (standard 4)", () => {
  it("produces the same field from the same seed, on any machine", () => {
    const a = seededRandom(0x5eeda12);
    const b = seededRandom(0x5eeda12);
    const draw = (r: () => number) => Array.from({ length: 64 }, () => r());
    expect(draw(a)).toEqual(draw(b));
  });

  it("spreads uniformly over 0..1 rather than clustering on a bad hash", () => {
    const r = seededRandom(7);
    const buckets = new Array(10).fill(0);
    for (let i = 0; i < 20000; i++) buckets[Math.min(9, Math.floor(r() * 10))] += 1;
    for (const b of buckets) expect(b).toBeGreaterThan(1500);
  });
});
