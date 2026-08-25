/**
 * Validates the authored star catalogue (world/sources/sky/star-catalogue.json)
 * against canon (sky-moons-calendar dossier) and against this package's
 * ephemeris: star counts, months, guardian planets, and the derived right
 * ascensions that keep each month's constellation up through its month.
 */
import { describe, expect, it } from "vitest";

import catalogue from "../../../world/sources/sky/star-catalogue.json";
import { MONTHS, dayOfYear } from "./calendar";
import { sunEclipticLongitude } from "./ephemeris";

const DEG = Math.PI / 180;

/** Canon star counts (UESP Lore:Constellations via the dossier). */
const CANON_COUNTS: Record<string, number> = {
  ritual: 7,
  lover: 12,
  lord: 19,
  mage: 27,
  shadow: 5,
  steed: 8,
  apprentice: 11,
  warrior: 30,
  lady: 4,
  tower: 12,
  atronach: 10,
  thief: 18,
};

const GUARDIAN_PLANETS: Record<string, string> = {
  warrior: "Akatosh",
  mage: "Julianos",
  thief: "Arkay",
};

describe("star catalogue", () => {
  it("has the twelve monthly Patrons with canon star counts", () => {
    expect(catalogue.constellations).toHaveLength(12);
    for (const c of catalogue.constellations) {
      expect(c.stars, c.id).toHaveLength(CANON_COUNTS[c.id]);
    }
  });

  it("covers each month exactly once", () => {
    const months = catalogue.constellations.map((c) => c.month).sort((a, b) => a - b);
    expect(months).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it("gives each Guardian its planet and each charge its Guardian", () => {
    for (const c of catalogue.constellations) {
      if (c.role === "guardian") {
        expect((c as { planet?: { name: string } }).planet?.name).toBe(GUARDIAN_PLANETS[c.id]);
      } else {
        expect(c.role).toBe("charge");
        expect(Object.keys(GUARDIAN_PLANETS)).toContain((c as { guardian?: string }).guardian);
      }
    }
  });

  it("aligns each constellation's right ascension so it culminates at midnight mid-month", () => {
    for (const c of catalogue.constellations) {
      const midMonthDay = dayOfYear(c.month, Math.round(MONTHS[c.month].days / 2));
      const expectedRa =
        ((sunEclipticLongitude(midMonthDay - 0.5) / DEG + 180) % 360 + 360) % 360;
      let diff = Math.abs(c.raDeg - expectedRa);
      diff = Math.min(diff, 360 - diff);
      expect(diff, c.id).toBeLessThan(2);
    }
  });

  it("keeps monthly constellations visible from the province and the pole star deep south", () => {
    for (const c of catalogue.constellations) {
      expect(Math.abs(c.decDeg), c.id).toBeLessThanOrEqual(35);
    }
    expect(catalogue.poleStar.decDeg).toBeLessThanOrEqual(-85);
    expect(catalogue.serpent.unstars).toHaveLength(4);
    expect(catalogue.serpent.month).toBeNull();
  });
});
