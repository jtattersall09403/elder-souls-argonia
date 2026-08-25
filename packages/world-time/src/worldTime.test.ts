import { describe, expect, it } from "vitest";

import { DAYS_PER_YEAR, MONTHS, dayOfYear, monthAndDay, weekdayIndex } from "./calendar";
import {
  DEFAULT_INSTANT,
  WorldClock,
  dayPhaseAt,
  fromEpochMinutes,
  toEpochMinutes,
  type WorldInstant,
} from "./clock";
import {
  LATITUDE_DEG,
  MOONS,
  SOUTH_POLE_ALTITUDE,
  SYNODIC_NIGHTS,
  localSiderealAngle,
  moonAt,
  moonsAt,
  sunAt,
  sunEclipticLongitude,
  sunTimes,
} from "./ephemeris";
import { seasonScalar, seasonState } from "./season";

const DEG = Math.PI / 180;

function minutesOf(instant: Partial<WorldInstant>): number {
  return toEpochMinutes({ era: 4, year: 201, month: 0, day: 1, minuteOfDay: 0, ...instant });
}

describe("calendar", () => {
  it("has a canon 365-day year across 12 months", () => {
    expect(MONTHS.reduce((sum, m) => sum + m.days, 0)).toBe(DAYS_PER_YEAR);
    expect(MONTHS).toHaveLength(12);
    expect(MONTHS[1]).toMatchObject({ name: "Sun's Dawn", jel: "Xeech", days: 28 });
    expect(MONTHS[7]).toMatchObject({ name: "Last Seed", jel: "Thtithil", birthsign: "Warrior" });
  });

  it("round-trips day-of-year", () => {
    for (const m of MONTHS) {
      for (const day of [1, m.days]) {
        expect(monthAndDay(dayOfYear(m.index, day))).toEqual({ month: m.index, day });
      }
    }
    expect(dayOfYear(0, 1)).toBe(1);
    expect(dayOfYear(11, 31)).toBe(365);
  });

  it("anchors 17 Last Seed 4E 201 to Sundas (Skyrim's opening date)", () => {
    const epochDays = dayOfYear(7, 17) - 1;
    expect(weekdayIndex(epochDays)).toBe(6); // Sundas
    expect(weekdayIndex(0)).toBe(2); // New Year 4E 201 is a Middas
  });
});

describe("clock", () => {
  it("round-trips instants through epoch minutes", () => {
    const samples: WorldInstant[] = [
      DEFAULT_INSTANT,
      { era: 4, year: 201, month: 0, day: 1, minuteOfDay: 0 },
      { era: 4, year: 201, month: 11, day: 31, minuteOfDay: 1439.5 },
      { era: 4, year: 205, month: 5, day: 14, minuteOfDay: 61.25 },
    ];
    for (const s of samples) {
      expect(fromEpochMinutes(toEpochMinutes(s))).toEqual(s);
    }
  });

  it("is deterministic and frozen by default", () => {
    const a = new WorldClock();
    const b = new WorldClock();
    a.advance(1000);
    expect(a.epochMinutes()).toBe(b.epochMinutes());
    a.rate = 60; // one world hour per real minute
    a.advance(60);
    expect(a.epochMinutes() - b.epochMinutes()).toBeCloseTo(3600, 10);
  });

  it("rejects non-Fourth-Era arithmetic", () => {
    expect(() => toEpochMinutes({ era: 3, year: 427, month: 0, day: 1, minuteOfDay: 0 })).toThrow();
  });
});

describe("season scalar", () => {
  it("troughs in the deep dry and peaks at the flood turn", () => {
    expect(seasonScalar(45)).toBeCloseTo(-1, 5); // mid-Xeech
    expect(seasonScalar(274)).toBeCloseTo(1, 5); // Hearthfire–Frostfall turn
  });

  it("is continuous across the year boundary", () => {
    expect(Math.abs(seasonScalar(365) - seasonScalar(1))).toBeLessThan(0.06);
  });

  it("names seasons by month", () => {
    expect(seasonState(1, 45).name).toBe("dry");
    expect(seasonState(3, 105).name).toBe("rain-onset");
    expect(seasonState(6, 195).name).toBe("monsoon");
    expect(seasonState(8, 255).name).toBe("flood-peak");
    expect(seasonState(11, 350).name).toBe("recession");
    expect(seasonState(4, 135).jelMonth).toBe("Hist-Dooka");
  });
});

describe("sun ephemeris (near-equatorial sky, dossier-bound)", () => {
  it("culminates high at noon all year", () => {
    for (let day = 0; day < 12; day += 1) {
      const noon = minutesOf({ month: day, day: 15, minuteOfDay: 720 });
      const alt = sunAt(noon).altitude / DEG;
      expect(alt).toBeGreaterThan(55);
      expect(alt).toBeLessThanOrEqual(90);
    }
  });

  it("keeps day length near 12 h year-round (±~35 min)", () => {
    for (let month = 0; month < 12; month += 1) {
      const t = sunTimes(minutesOf({ month, day: 15 }));
      expect(t.sunrise).not.toBeNull();
      const dayLength = (t.sunset ?? 0) - (t.sunrise ?? 0);
      // ~12 h ± 35 min, shifted slightly long by the −0.833° horizon refraction.
      expect(dayLength).toBeGreaterThan(11.4 * 60);
      expect(dayLength).toBeLessThan(12.8 * 60);
    }
  });

  it("has short tropical twilight (sunset to civil dark under 30 min)", () => {
    for (const month of [0, 3, 6, 9]) {
      const t = sunTimes(minutesOf({ month, day: 15 }));
      expect((t.civilDusk ?? 0) - (t.sunset ?? 0)).toBeLessThan(30);
    }
  });

  it("is a pure function of the instant", () => {
    const m = minutesOf({ month: 4, day: 3, minuteOfDay: 431.5 });
    expect(sunAt(m)).toEqual(sunAt(m));
  });

  it("rises east, sets west", () => {
    const t = sunTimes(minutesOf({ month: 2, day: 20 }));
    const rise = sunAt(minutesOf({ month: 2, day: 20, minuteOfDay: (t.sunrise ?? 0) + 10 }));
    const set = sunAt(minutesOf({ month: 2, day: 20, minuteOfDay: (t.sunset ?? 0) - 10 }));
    expect(rise.direction.x).toBeGreaterThan(0.8); // east
    expect(set.direction.x).toBeLessThan(-0.8); // west
  });
});

describe("moons", () => {
  it("follow the canon 28-night cycle: new at epoch, full at night 14", () => {
    const masser = MOONS[0];
    expect(moonAt(0, masser).illuminatedFraction).toBeCloseTo(0, 5);
    expect(moonAt(14 * 1440, masser).phaseAge).toBeCloseTo(14, 5);
    expect(moonAt(14 * 1440, masser).illuminatedFraction).toBeCloseTo(1, 5);
    expect(moonAt(SYNODIC_NIGHTS * 1440, masser).illuminatedFraction).toBeCloseTo(0, 5);
  });

  it("keeps Masser well over twice Secunda's apparent size", () => {
    const [masser, secunda] = moonsAt(0);
    expect(masser.angularDiameter / secunda.angularDiameter).toBeGreaterThan(2);
  });

  it("travels the sky together, Secunda trailing", () => {
    const [masser, secunda] = moonsAt(minutesOf({ month: 5, day: 10, minuteOfDay: 300 }));
    let separation = Math.abs(masser.eclipticLongitude - secunda.eclipticLongitude);
    separation = Math.min(separation, 2 * Math.PI - separation);
    expect(separation).toBeLessThan(15 * DEG);
  });
});

describe("celestial sphere", () => {
  it("puts the Southron pole star low and due south", () => {
    expect(SOUTH_POLE_ALTITUDE / DEG).toBeCloseTo(Math.abs(LATITUDE_DEG), 10);
    expect(LATITUDE_DEG).toBeLessThan(0);
  });

  it("culminates each month's constellation at midnight mid-month", () => {
    for (let month = 0; month < 12; month += 1) {
      const midMonthNoon = minutesOf({ month, day: 15, minuteOfDay: 720 });
      const constellationRA = sunEclipticLongitude(midMonthNoon / 1440) + Math.PI;
      const midnight = minutesOf({ month, day: 15, minuteOfDay: 0 });
      let hourAngle = localSiderealAngle(midnight) - constellationRA;
      hourAngle = ((hourAngle % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
      // Within ~2° of the meridian at midnight → "in the sky throughout its month".
      expect(Math.abs(hourAngle)).toBeLessThan(2 * DEG);
    }
  });
});

describe("day phases", () => {
  it("moves through the expected sequence over one day", () => {
    const day = { month: 5, day: 15 };
    const phases = [0, 4, 5.6, 6.5, 9, 12, 15, 17.6, 18.5, 20, 23].map((h) =>
      dayPhaseAt(minutesOf({ ...day, minuteOfDay: h * 60 })),
    );
    expect(phases[0]).toBe("night");
    expect(phases).toContain("sunrise");
    expect(phases).toContain("morning");
    expect(phases[5]).toBe("noon");
    expect(phases).toContain("afternoon");
    expect(phases).toContain("sunset");
    expect(phases[phases.length - 1]).toBe("night");
    const clock = new WorldClock({ era: 4, year: 201, month: 5, day: 15, minuteOfDay: 720 });
    expect(clock.dayPhase()).toBe("noon");
    expect(clock.weekday()).toMatch(/das$/);
  });
});
