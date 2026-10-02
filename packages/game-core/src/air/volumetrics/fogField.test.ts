import { describe, expect, it } from "vitest";
import { fogRegimes, mistHeightProfile, moistureWeight, type FogFieldInput } from "./fogField";

describe("mistHeightProfile", () => {
  it("is dense at the basin floor, thin by mid-depth and gone at and above the top (no full-depth slab)", () => {
    expect(mistHeightProfile(0, 30)).toBe(1);
    expect(mistHeightProfile(2, 30)).toBeGreaterThan(0.7);
    expect(mistHeightProfile(15, 30)).toBeLessThan(0.1);
    expect(mistHeightProfile(30, 30)).toBe(0);
    expect(mistHeightProfile(60, 30)).toBe(0);
    for (let h = 0; h < 30; h += 1) expect(mistHeightProfile(h + 1, 30)).toBeLessThanOrEqual(mistHeightProfile(h, 30));
  });
  it("w=mist leaves the sea fog and the air baseline at their w=clear values", () => {
    const clear = fogRegimes({ ...BASE_NOON });
    const mist = fogRegimes({ ...BASE_NOON, weatherRadiation: 1 });
    expect(mist.seaFog).toBe(clear.seaFog);
    expect(mist.air).toBe(clear.air);
    expect(mist.radiationMist).toBe(1);
  });
});

const BASE_NOON: FogFieldInput = {
  minuteOfDay: 12 * 60, sunriseMin: 6 * 60, sunsetMin: 18 * 60, prevNightClearCalm: 1,
  hoursSinceRain: Infinity, rain: 0, windSpeedMS: 0.5, windDirXZ: [1, 0], humidity: 0.8, wetSeason: 1,
};

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
