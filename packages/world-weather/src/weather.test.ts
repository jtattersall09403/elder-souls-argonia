import { describe, expect, it } from "vitest";
import { toEpochMinutes, MINUTES_PER_DAY } from "@elder-souls/world-time";
import {
  clearCalmNightFactor,
  convectionFactor,
  lightningAt,
  rainWetness,
  spellsForYear,
  synopticAt,
  windDirAt,
} from "./synoptic";
import {
  weatherSampleAt,
  weatherSampleForRegime,
  weatherSampleForState,
  whiteoutBell,
  type LocalClimate,
} from "./express";
import { PROFILES, WEATHER_KINDS, type StateProfile } from "./states";

const at = (month: number, day: number, minuteOfDay = 720) =>
  toEpochMinutes({ era: 4, year: 201, month, day, minuteOfDay });

const LOCAL_BASIN: LocalClimate = {
  rainAmp: 0.6, stormExposure: 0.05, seaFog: 0.1, mistProp: 0.9,
  humidity: 0.85, canopy: 0.4, beltMask: 0, elevationM: 12,
};
const LOCAL_COAST: LocalClimate = {
  rainAmp: 0.7, stormExposure: 0.9, seaFog: 0.8, mistProp: 0.2,
  humidity: 0.8, canopy: 0.05, beltMask: 0, elevationM: 2,
};
const LOCAL_MOUNTAIN: LocalClimate = {
  rainAmp: 0.8, stormExposure: 0.3, seaFog: 0, mistProp: 0.15,
  humidity: 0.45, canopy: 0.3, beltMask: 1, elevationM: 470,
};
const LOCAL_RAINSHADOW: LocalClimate = {
  rainAmp: 0.2, stormExposure: 0.05, seaFog: 0, mistProp: 0.3,
  humidity: 0.4, canopy: 0.1, beltMask: 0, elevationM: 60,
};

describe("determinism", () => {
  it("same instant + place → identical sample", () => {
    const e = at(6, 12, 900);
    const a = weatherSampleAt(e, LOCAL_BASIN);
    const b = weatherSampleAt(e, LOCAL_BASIN);
    expect(a).toEqual(b);
  });

  it("spell partition covers the year exactly, reproducibly", () => {
    const spells = spellsForYear(201);
    expect(spells[0].startDay).toBe(1);
    let day = 1;
    for (const sp of spells) {
      expect(sp.startDay).toBe(day);
      day += sp.lengthDays;
    }
    expect(day).toBe(366);
    expect(spellsForYear(201)).toEqual(spells);
  });
});

describe("seasonal frequencies", () => {
  /** Fraction of sampled instants whose profile matches a predicate. */
  function fraction(month: number, pred: (p: StateProfile) => boolean): number {
    let hits = 0;
    let total = 0;
    for (let day = 1; day <= 28; day += 1) {
      for (let m = 0; m < MINUTES_PER_DAY; m += 180) {
        total += 1;
        if (pred(synopticAt(at(month, day, m)).profile)) hits += 1;
      }
    }
    return hits / total;
  }

  it("monsoon months rain far more than dry months", () => {
    const rainy = (p: StateProfile) => p.rain > 0.2;
    const monsoon = fraction(6, rainy); // Sun's Height (s ≈ 0.75)
    const dry = fraction(1, rainy); // Sun's Dawn (s ≈ −1)
    expect(monsoon).toBeGreaterThan(0.35);
    expect(dry).toBeLessThan(0.12);
    expect(monsoon).toBeGreaterThan(dry * 3);
  });

  it("dry season carries haze weather; monsoon barely any", () => {
    const hazy = (p: StateProfile) => p.fogMie > 0.9 && p.rain < 0.05;
    expect(fraction(1, hazy)).toBeGreaterThan(0.1);
    expect(fraction(6, hazy)).toBeLessThan(0.05);
  });
});

describe("tropical rhythms", () => {
  it("convection peaks in the afternoon", () => {
    expect(convectionFactor(15.5)).toBeGreaterThan(0.99);
    expect(convectionFactor(9)).toBeLessThan(0.15);
    expect(convectionFactor(3)).toBeLessThan(0.01);
  });

  it("thunderstorms cluster afternoon/evening across a monsoon month", () => {
    let afternoon = 0;
    let morning = 0;
    for (let day = 1; day <= 30; day += 1) {
      for (let h = 0; h < 24; h += 1.5) {
        const syn = synopticAt(at(5, day, h * 60));
        if (syn.state !== "thunderstorm") continue;
        if (h >= 13 && h < 21) afternoon += 1;
        else if (h >= 5 && h < 13) morning += 1;
      }
    }
    expect(afternoon).toBeGreaterThan(morning * 2);
  });
});

describe("transitions and continuity", () => {
  it("profile fields never step more than a transition allows", () => {
    // Scan two days at 1-minute resolution; the fastest transition (squall,
    // 6 min) bounds the largest per-minute change of any 0..1 field.
    let maxStep = 0;
    let prev = synopticAt(at(6, 3, 0)).profile;
    for (let m = 1; m < 2 * MINUTES_PER_DAY; m += 1) {
      const cur = synopticAt(at(6, 3, 0) + m).profile;
      maxStep = Math.max(maxStep, Math.abs(cur.sunDim - prev.sunDim), Math.abs(cur.cloudMid - prev.cloudMid));
      prev = cur;
    }
    expect(maxStep).toBeLessThan(0.3); // smoothstep peak slope over 6 min ≈ 0.25
  });

  it("blend runs 0→1 through a state change", () => {
    // Find a state boundary in a monsoon week, then check the blend ramps.
    outer: for (let day = 1; day <= 28; day += 1) {
      for (let slotMin = 0; slotMin < MINUTES_PER_DAY; slotMin += 90) {
        const e = at(6, day, slotMin);
        const syn = synopticAt(e + 1);
        if (syn.prev !== syn.state) {
          expect(syn.blend).toBeLessThan(0.5);
          const later = synopticAt(e + 80);
          expect(later.blend).toBe(1);
          break outer;
        }
      }
    }
  });
});

describe("mist regimes", () => {
  it("radiation mist requires a clear calm night — a rainy night kills it", () => {
    // Sweep dry-season dawns; collect the mist behind clear vs rainy nights.
    const behindClear: number[] = [];
    const behindRain: number[] = [];
    for (let day = 1; day <= 28; day += 1) {
      for (const month of [0, 1, 2, 10, 11]) {
        const dawn = at(month, day, 6 * 60);
        const night = synopticAt(dawn - 150); // 03:30
        const mist = weatherSampleAt(dawn, LOCAL_BASIN).mist.radiation;
        if (night.state === "clear") behindClear.push(mist);
        if (night.profile.rain > 0.3) behindRain.push(mist);
      }
    }
    expect(behindClear.length).toBeGreaterThan(5);
    const meanClear = behindClear.reduce((a, b) => a + b, 0) / behindClear.length;
    expect(meanClear).toBeGreaterThan(0.25);
    for (const m of behindRain) expect(m).toBeLessThan(0.15);
  });

  it("advection fog is coastal, whiteout is montane, neither leaks", () => {
    const e = at(7, 10, 7 * 60);
    const coast = weatherSampleAt(e, LOCAL_COAST);
    const basin = weatherSampleAt(e, LOCAL_BASIN);
    expect(coast.mist.advection).toBeGreaterThan(basin.mist.advection + 0.15);
    expect(basin.mist.whiteout).toBeLessThan(0.01);
    expect(coast.mist.whiteout).toBeLessThan(0.01);
    // Whiteout follows the synoptic air (owner rounds 2-3): thick when
    // weather brings cloud, genuinely CLEAR on settled clear days — never a
    // permanent whiteout, and never any belt off the massif (beltMask 0).
    const rainMtn = weatherSampleForState("rain", e, LOCAL_MOUNTAIN);
    expect(rainMtn.mist.whiteout).toBeGreaterThan(0.5);
    const clearMtn = weatherSampleForState("clear", e, LOCAL_MOUNTAIN);
    expect(clearMtn.mist.whiteout).toBeLessThan(0.05);
    const rainOffMassif = weatherSampleForState("rain", e, { ...LOCAL_MOUNTAIN, beltMask: 0 });
    expect(rainOffMassif.mist.whiteout).toBeLessThan(0.01);
  });

  it("belt profile: soft lower skirt, sharp top — summits stand above the cloud", () => {
    expect(whiteoutBell(470)).toBeCloseTo(1, 3);
    expect(whiteoutBell(0)).toBeLessThan(1e-3);
    expect(whiteoutBell(640)).toBeLessThan(0.01); // ~650 m summits are ABOVE it
    expect(whiteoutBell(380)).toBeGreaterThan(0.5); // cloud drapes the flank below
  });

  it("regime BASE values are province-wide conditions; locality is the raster", () => {
    const e = at(7, 10, 7 * 60);
    const coast = weatherSampleAt(e, LOCAL_COAST);
    const basin = weatherSampleAt(e, LOCAL_BASIN);
    // Same synoptic morning: identical advection CONDITION everywhere…
    expect(coast.mist.advectionBase).toBeCloseTo(basin.mist.advectionBase, 6);
    // …expressed locally through the sea-fog raster.
    expect(coast.mist.advection).toBeCloseTo(coast.mist.advectionBase * 0.8, 3);
  });
});

describe("local expression", () => {
  it("the same downpour rains harder where rain amplitude is high", () => {
    // Find a downpour instant, then compare places.
    for (let day = 1; day <= 28; day += 1) {
      for (let m = 0; m < MINUTES_PER_DAY; m += 90) {
        const e = at(6, day, m + 45);
        const syn = synopticAt(e);
        if (syn.state === "downpour" && syn.blend === 1) {
          const wet = weatherSampleAt(e, LOCAL_BASIN);
          const shadow = weatherSampleAt(e, LOCAL_RAINSHADOW);
          expect(wet.rainIntensity).toBeGreaterThan(shadow.rainIntensity * 1.5);
          expect(wet.rainIntensity).toBeGreaterThan(0.8);
          return;
        }
      }
    }
    throw new Error("no downpour found in a monsoon month");
  });

  it("wind is stronger on the exposed coast", () => {
    const e = at(6, 12, 900);
    expect(weatherSampleAt(e, LOCAL_COAST).windSpeedMS).toBeGreaterThan(
      weatherSampleAt(e, LOCAL_RAINSHADOW).windSpeedMS,
    );
  });

  it("wind direction is unit-length and continuous", () => {
    let prev = windDirAt(at(6, 12, 0));
    for (let m = 1; m < 300; m += 1) {
      const d = windDirAt(at(6, 12, 0) + m);
      expect(Math.hypot(d[0], d[1])).toBeCloseTo(1, 6);
      expect(Math.hypot(d[0] - prev[0], d[1] - prev[1])).toBeLessThan(0.02);
      prev = d;
    }
  });
});

describe("wetness and lightning", () => {
  it("wetness rises in rain and decays over tens of minutes after", () => {
    // Find a rain→dry boundary.
    for (let day = 1; day <= 28; day += 1) {
      for (let m = 0; m < MINUTES_PER_DAY; m += 90) {
        const e = at(6, day, m);
        if (synopticAt(e - 30).profile.rain > 0.4 && synopticAt(e + 60).profile.rain < 0.05) {
          const during = rainWetness(e - 30);
          const after30 = rainWetness(e + 90);
          const after90 = rainWetness(e + 150);
          expect(during).toBeGreaterThan(0.3);
          expect(after30).toBeLessThan(during);
          expect(after90).toBeLessThan(after30);
          expect(after30).toBeGreaterThan(0.02); // still damp half an hour on
          return;
        }
      }
    }
    throw new Error("no rain→dry boundary found");
  });

  it("lightning only fires under storm states and is deterministic", () => {
    let flashes = 0;
    for (let day = 1; day <= 10; day += 1) {
      for (let m = 0; m < MINUTES_PER_DAY; m += 0.01) {
        const e = at(5, day, 0) + m;
        const env = lightningAt(e);
        if (env > 0) {
          flashes += 1;
          const state = synopticAt(e).state;
          const prev = synopticAt(e).prev;
          expect(
            PROFILES[state].lightningPerMin > 0 || PROFILES[prev].lightningPerMin > 0,
          ).toBe(true);
          m += 1; // skip past this flash
        }
      }
    }
    expect(flashes).toBeGreaterThan(0);
    expect(lightningAt(at(5, 3, 700.005))).toBe(lightningAt(at(5, 3, 700.005)));
  });
});

describe("round 2 gates (owner feedback 2026-08-29)", () => {
  it("no rain without a deck: the sample never rains under sparse cloud", () => {
    for (let day = 1; day <= 28; day += 2) {
      for (let m = 0; m < MINUTES_PER_DAY; m += 45) {
        const wx = weatherSampleAt(at(6, day, m), LOCAL_BASIN);
        const mass = (wx.profile.cloudMid + 0.6 * wx.profile.cloudLow) * wx.profile.cloudDensity;
        if (wx.rainIntensity > 0.06) expect(mass, `day ${day} m ${m}`).toBeGreaterThan(0.5);
      }
    }
  });

  it("no lightning without a storm deck (transition-in is gated)", () => {
    for (let day = 1; day <= 10; day += 1) {
      for (let m = 0; m < MINUTES_PER_DAY; m += 0.01) {
        const e = at(5, day, 0) + m;
        // lightningAt is cheap; only run the full sample at flash instants.
        if (lightningAt(e) <= 0) continue;
        const wx = weatherSampleAt(e, LOCAL_BASIN);
        if (wx.lightning > 0.05) {
          const mass = (wx.profile.cloudLow + wx.profile.cloudMid) * 0.5 * wx.profile.cloudDensity;
          expect(mass, `day ${day} m ${m}`).toBeGreaterThan(0.5);
        }
        m += 1;
      }
    }
  });

  it("coverage wanders within a clear spell but never fully overcasts it", () => {
    // Force-clear removes slot rolls; the wander alone must vary the deck.
    const e0 = at(1, 5, 8 * 60);
    let lo = 1;
    let hi = 0;
    for (let m = 0; m < 600; m += 10) {
      const p = weatherSampleForState("clear", e0 + m, LOCAL_BASIN).profile;
      lo = Math.min(lo, p.cloudMid);
      hi = Math.max(hi, p.cloudMid);
    }
    expect(hi - lo).toBeGreaterThan(0.1); // visibly different hours
    expect(hi).toBeLessThan(0.5); // clear never becomes a full deck
  });

  it("forced mist/fog regimes: full CONDITION, locality stays with the rasters", () => {
    const e = at(1, 5, 6 * 60);
    const mist = weatherSampleForRegime("mist", e, LOCAL_BASIN);
    expect(mist.mist.radiationBase).toBe(1);
    expect(mist.mist.radiation).toBe(1); // basin mistProp 0.9 × 1.15 → saturated
    expect(mist.visibilityM).toBeLessThanOrEqual(140);
    const fog = weatherSampleForRegime("fog", e, LOCAL_COAST);
    expect(fog.mist.advectionBase).toBe(1);
    expect(fog.mist.advection).toBeCloseTo(0.8, 3);
    expect(fog.visibilityM).toBeLessThanOrEqual(600);
    // Forcing sea fog INLAND leaves the inland air clear — the fog banks on
    // the coast are what you look at (owner round 3: local, not global).
    const inland = weatherSampleForRegime("fog", e, LOCAL_RAINSHADOW);
    expect(inland.mist.advection).toBe(0);
    expect(inland.visibilityM).toBeGreaterThan(5000);
  });

  it("the storm ladder darkens monotonically: rain < downpour ≤ thunderstorm/squall", () => {
    expect(PROFILES.rain.sunDim).toBeLessThan(PROFILES.downpour.sunDim);
    expect(PROFILES.downpour.sunDim).toBeLessThanOrEqual(PROFILES.squall.sunDim);
    expect(PROFILES.rain.cloudDark).toBeLessThan(PROFILES.downpour.cloudDark);
    expect(PROFILES.downpour.cloudDark).toBeLessThan(PROFILES.squall.cloudDark);
    expect(PROFILES.downpour.cloudDark).toBeLessThan(PROFILES.thunderstorm.cloudDark);
    // …and the states differ in character, not just darkness.
    expect(PROFILES.rain.cloudPuff).toBeLessThan(0.15); // featureless sheet
    expect(PROFILES.clear.cloudPuff).toBeGreaterThan(0.8); // crisp cumulus
    expect(PROFILES.squall.stormFront).toBe(1);
    expect(PROFILES.thunderstorm.greenTint).toBeGreaterThan(0.3);
    expect(PROFILES.squall.cloudScroll).toBeGreaterThan(2);
  });
});

describe("sanity", () => {
  it("every profile field is finite and in range", () => {
    for (const k of WEATHER_KINDS) {
      const p = PROFILES[k];
      for (const [key, v] of Object.entries(p)) {
        expect(Number.isFinite(v), `${k}.${key}`).toBe(true);
      }
      for (const f of ["cloudLow", "cloudMid", "cloudHigh", "cloudDensity", "cloudDark", "sunDim", "ambientLift", "skyGrey", "rain", "gust"] as const) {
        expect(p[f]).toBeGreaterThanOrEqual(0);
        expect(p[f]).toBeLessThanOrEqual(1);
      }
    }
  });

  it("clearCalmNightFactor is 0..1 everywhere", () => {
    for (let m = 0; m < MINUTES_PER_DAY * 3; m += 137) {
      const f = clearCalmNightFactor(at(11, 5, 0) + m);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
    }
  });
});
