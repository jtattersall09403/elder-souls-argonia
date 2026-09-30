import { describe, expect, it } from "vitest";
import { fogRegimes, type FogFieldInput } from "./fogField";

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
  it("ground-mist weather forces mist at any hour", () => {
    expect(fogRegimes({ ...BASE, minuteOfDay: 13 * 60, weatherState: "ground-mist" }).radiationMist).toBe(1);
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
  it("is deterministic", () => {
    expect(fogRegimes(BASE)).toEqual(fogRegimes({ ...BASE }));
  });
});
