import { describe, expect, it } from "vitest";
import { fogRegimes, moistureWeight, type FogFieldInput } from "./fogField";

const BASE: FogFieldInput = {
  minuteOfDay: 6 * 60, sunriseMin: 6 * 60, sunsetMin: 18 * 60, prevNightClearCalm: 1,
  hoursSinceRain: Infinity, rain: 0, windSpeedMS: 0.5, windDirXZ: [1, 0], humidity: 0.8, wetSeason: 1,
};

describe("fogRegimes", () => {
  it("radiation mist peaks at sunrise after a clear calm night and is gone by +2.5 h", () => {
    expect(fogRegimes(BASE).radiationMist).toBeGreaterThan(0.8);
    expect(fogRegimes({ ...BASE, minuteOfDay: 6 * 60 + 150 }).radiationMist).toBe(0);
    expect(fogRegimes({ ...BASE, minuteOfDay: 2 * 60 }).radiationMist).toBe(0);
    expect(fogRegimes({ ...BASE, minuteOfDay: 13 * 60 }).radiationMist).toBe(0);
  });
  it("needs a clear calm night and still air", () => {
    expect(fogRegimes({ ...BASE, prevNightClearCalm: 0 }).radiationMist).toBe(0);
    expect(fogRegimes({ ...BASE, windSpeedMS: 8 }).radiationMist).toBe(0);
  });
  it("the weather's own mist strength (w=mist) raises radiation mist at noon", () => {
    const noon = { ...BASE, minuteOfDay: 12 * 60 };
    expect(fogRegimes(noon).radiationMist).toBe(0);
    expect(fogRegimes({ ...noon, weatherRadiation: 0.9 }).radiationMist).toBeCloseTo(0.9, 6);
  });
  it("the weather's own fog strength (w=fog) raises sea fog with onshore undefined", () => {
    expect(fogRegimes(BASE).seaFog).toBe(0);
    expect(fogRegimes({ ...BASE, weatherAdvection: 0.8 }).seaFog).toBeCloseTo(0.8, 6);
  });
  it("clear weather leaves the regimes unchanged", () => {
    const noon = { ...BASE, minuteOfDay: 12 * 60 };
    expect(fogRegimes({ ...noon, weatherRadiation: 0, weatherAdvection: 0 })).toEqual(fogRegimes(noon));
  });
  it("marsh fog shows at dusk, not at noon", () => {
    expect(fogRegimes({ ...BASE, minuteOfDay: 18 * 60 + 45 }).marshFog).toBeGreaterThan(0.5);
    expect(fogRegimes({ ...BASE, minuteOfDay: 12 * 60 }).marshFog).toBe(0);
  });
  it("canopy haze is stronger an hour after rain than on a dry noon", () => {
    const dry = fogRegimes({ ...BASE, minuteOfDay: 12 * 60 }).canopyHaze;
    const wet = fogRegimes({ ...BASE, minuteOfDay: 12 * 60, hoursSinceRain: 1 }).canopyHaze;
    expect(wet).toBeGreaterThan(dry + 0.3);
  });
  it("a valley pooled with mist and steam at sunrise is clear at noon (harness valley-dawn vs valley-noon)", () => {
    const dawn = fogRegimes({ ...BASE, minuteOfDay: BASE.sunriseMin });
    const noon = fogRegimes({ ...BASE, minuteOfDay: 12 * 60 });
    expect(dawn.radiationMist).toBeGreaterThan(0.5);
    expect(dawn.steamFog).toBeGreaterThan(0.5);
    expect(noon.radiationMist + noon.steamFog + noon.marshFog).toBe(0);
  });
  it("is deterministic", () => {
    expect(fogRegimes(BASE)).toEqual(fogRegimes({ ...BASE }));
  });
  it("mist at dawn over a wet basin is at least 3x a dry slope's; marsh fog at noon is at most a quarter of dawn", () => {
    const dawn = fogRegimes(BASE);
    expect((dawn.radiationMist * moistureWeight(1)) / (dawn.radiationMist * moistureWeight(0))).toBeGreaterThanOrEqual(3);
    expect(moistureWeight(0.5)).toBeLessThan(0.5);
    const noon = fogRegimes({ ...BASE, minuteOfDay: 12 * 60 });
    expect(noon.marshFog).toBeLessThanOrEqual(0.25 * dawn.marshFog);
    expect(noon.radiationMist).toBeLessThanOrEqual(0.25 * dawn.radiationMist);
  });
});
