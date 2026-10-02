import { describe, expect, it } from "vitest";
import { sunTimes } from "@elder-souls/world-time";
import {
  FogClockHistory, crownOf, hoursSinceRain, nearestVolumeLights, previousNight0300, prevNightClearCalm,
  studioTerrainSamplers, sunriseSunsetMin, type WaterRecordQuery, type WeatherProbe,
} from "./studioSamplers";
import type { VolumeLight } from "./froxelGrid";

const dry: WeatherProbe = { rain: 0, cloud: 0, windSpeedMS: 0 };

describe("studioTerrainSamplers", () => {
  const water: WaterRecordQuery = {
    levelOffsets: () => ({ tide: 0, season: 0 }),
    sampleBoundary: (x, _z, _levels, out) => Object.assign(out, x < 0 ? { depth: 2, surfaceHeight: 3 } : { depth: 0, surfaceHeight: -1 }),
    data: { sample: (x) => ({ className: x < -100 ? "coast" : x < 0 ? "river" : x < 50 ? "marsh" : "none" }) },
  };
  const s = studioTerrainSamplers({ groundHeight: () => 5, water: () => water, epochMinutes: () => 0 });
  it("reads the record: inland water is not sea, marsh is wet", () => {
    expect(s.water(-10, 0)).toEqual({ height: 3, mask: 1 });
    expect(s.water(10, 0).mask).toBe(0);
    expect(s.seaMask(-10, 0)).toBe(0);
    expect(s.seaMask(-200, 0)).toBe(1);
    expect(s.wetness(10, 0)).toBe(1);
    expect(s.wetness(80, 0)).toBe(0);
  });
  it("is dry until the record loads", () => {
    const n = studioTerrainSamplers({ groundHeight: () => null, water: () => null, epochMinutes: () => 0 });
    expect(n.water(0, 0).mask).toBe(0);
    expect(n.seaMask(0, 0)).toBe(0);
    expect(n.groundHeight(0, 0)).toBe(0);
  });
});

describe("fog clock", () => {
  it("sunrise/sunset come from the ephemeris", () => {
    const t = sunTimes(1440 * 100 + 600);
    expect(sunriseSunsetMin(1440 * 100 + 600)).toEqual({ sunriseMin: t.sunrise, sunsetMin: t.sunset });
  });
  it("previous night is today's 03:00 once past it, else yesterday's", () => {
    expect(previousNight0300(1440 * 5 + 600)).toBe(1440 * 5 + 180);
    expect(previousNight0300(1440 * 5 + 60)).toBe(1440 * 4 + 180);
  });
  it("clear+calm reads cloud and wind at that 03:00", () => {
    const seen: number[] = [];
    const v = prevNightClearCalm(1440 * 5 + 600, (t) => { seen.push(t); return { rain: 0, cloud: 0.5, windSpeedMS: 3 }; });
    expect(seen).toEqual([1440 * 5 + 180]);
    expect(v).toBeCloseTo(0.5 * 0.5);
    expect(prevNightClearCalm(0, () => dry)).toBe(1);
  });
  it("hours since rain steps back in 15 min to 6 h", () => {
    const now = 10_000;
    expect(hoursSinceRain(now, () => ({ ...dry, rain: 0.5 }))).toBe(0);
    expect(hoursSinceRain(now, (t) => ({ ...dry, rain: t <= now - 90 ? 0.5 : 0 }))).toBeCloseTo(100 / 60);
    expect(hoursSinceRain(now, (t) => ({ ...dry, rain: t < now - 400 ? 0.5 : 0 }))).toBe(Infinity);
  });
  it("history recomputes once per 15-minute bucket and is deterministic", () => {
    let calls = 0;
    const w = (t: number) => { calls++; return { ...dry, rain: t < 9_950 ? 1 : 0 }; };
    const a = new FogClockHistory();
    expect(a.update(10_000, w)).toBe(true);
    const n = calls;
    expect(a.update(10_004, w)).toBe(false);
    expect(calls).toBe(n);
    const b = new FogClockHistory();
    b.update(10_000, w);
    expect(a.hoursSinceRain(10_005, false)).toBe(b.hoursSinceRain(10_005, false));
    expect(a.hoursSinceRain(10_005, true)).toBe(0);
  });
});

describe("crowns and lights", () => {
  it("crown from template height and footprint at instance scale", () => {
    expect(crownOf(1, 10, 2, 2, 10, 3)).toEqual({ x: 1, z: 2, radiusM: 6, bottomM: 19, topM: 30 });
  });
  it("nearest lights, dark ones skipped, stable order", () => {
    const lights = [[10, 0, 0, 1], [1, 0, 0, 1], [5, 0, 0, 0], [3, 0, 0, 1]];
    const out: VolumeLight[] = [];
    const n = nearestVolumeLights((v) => lights.forEach(([x, y, z, c]) => v(x, y, z, 4, c, c, c)), 0, 0, 0, 2, out);
    expect(n).toBe(2);
    expect(out.map((l) => l.position.x)).toEqual([1, 3]);
    expect(out.length).toBe(2);
  });
});
