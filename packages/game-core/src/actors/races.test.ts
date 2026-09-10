import { afterEach, describe, expect, it, vi } from "vitest";

import roster from "./generated/races.json";
import {
  CHARACTER_BUILDS,
  CHARACTER_BUILD_IDS,
  DEFAULT_BUILD,
  DEFAULT_RACE,
  RACES,
  RACE_IDS,
  REFERENCE_BUILDS,
  SEXES,
  buildId,
  characterBuild,
  resolveBuild,
} from "./races";

/** The male builds, keyed by race, for the appearance assertions below. */
const MALE = Object.fromEntries(
  RACE_IDS.map((race) => [race, characterBuild(buildId(race, "male"))]),
) as Record<string, ReturnType<typeof characterBuild>>;

describe("the roster's two axes", () => {
  it("carries ten lore races and no assets on them", () => {
    expect(RACE_IDS).toHaveLength(10);
    for (const race of Object.values(RACES)) {
      expect(Object.keys(race).sort()).toEqual(["description", "id", "label"]);
    }
  });

  it("names every build `<race>-<sex>`", () => {
    expect(buildId("nord", "female")).toBe("nord-female");
    for (const id of CHARACTER_BUILD_IDS) {
      const build = CHARACTER_BUILDS[id];
      expect(id).toBe(buildId(build.race, build.sex));
      expect(RACE_IDS).toContain(build.race);
      expect(SEXES).toContain(build.sex);
    }
  });

  it("throws a RangeError on an unknown build", () => {
    expect(() => characterBuild("nord-neither")).toThrow(RangeError);
    expect(() => characterBuild("wookiee-male")).toThrow(/unknown character build/);
  });

  it("has a reference build per sex, and a default that exists", () => {
    for (const sex of SEXES) expect(CHARACTER_BUILDS[REFERENCE_BUILDS[sex]]).toBeDefined();
    expect(CHARACTER_BUILDS[DEFAULT_BUILD]).toBeDefined();
    expect(characterBuild(DEFAULT_BUILD).race).toBe(DEFAULT_RACE);
  });

  it("falls back to a built sex when a race has only one", () => {
    // The interim roster ships the male builds only; a picker asking for a
    // female Nord must get the Nord that exists, not a crash.
    const resolved = resolveBuild("nord", "female");
    expect(resolved.race).toBe("nord");
    expect(CHARACTER_BUILDS[resolved.id]).toBeDefined();
    expect(resolveBuild("nord", "male").id).toBe("nord-male");
  });
});

describe("the generated roster contract", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("./generated/races.json");
  });

  it("is version 2", () => {
    expect(roster.schemaVersion).toBe(2);
  });

  it("refuses to load a stale version-1 roster rather than shipping one sex", async () => {
    vi.resetModules();
    vi.doMock("./generated/races.json", () => ({
      default: { ...roster, schemaVersion: 1 },
    }));
    await expect(import("./races")).rejects.toThrow(/schemaVersion 1, expected 2/);
  });
});

describe("playable build appearance", () => {
  it("keeps the previously duplicated humanoid pairs visually distinct", () => {
    for (const [left, right] of [["imperial", "breton"], ["altmer", "bosmer"]] as const) {
      expect(MALE[left].asset).not.toBe(MALE[right].asset);
      expect(MALE[left].appearance.skinTint).not.toEqual(MALE[right].appearance.skinTint);
      expect(MALE[left].appearance.hairTint).not.toEqual(MALE[right].appearance.hairTint);
    }
  });

  it("uses the canonical Skyrim race stature multipliers", () => {
    expect(MALE.altmer.heightScale).toBe(1.08);
    expect(MALE.orsimer.heightScale).toBe(1.045);
    expect(MALE.nord.heightScale).toBe(1.03);
    expect(MALE.bosmer.heightScale).toBe(0.98);
  });

  it("uses Skyrim's body tint shader for every playable build", () => {
    for (const build of Object.values(CHARACTER_BUILDS)) {
      expect(build.appearance.skinTintMode, build.id).toBe("skyrim-rgb-tint");
    }
  });

  it("ships a distinct authored default skin tone for every race", () => {
    const tones = Object.values(MALE).map((build) => build.appearance.skinTint.join(","));
    expect(new Set(tones).size).toBe(tones.length);
  });

  it("keeps the human defaults on a visibly broad Skyrim-authored tone range", () => {
    const luminance = (id: "nord" | "breton" | "imperial" | "redguard") => {
      const [red, green, blue] = MALE[id].appearance.skinTint;
      return red * 0.2126 + green * 0.7152 + blue * 0.0722;
    };

    expect(luminance("nord")).toBeGreaterThan(luminance("breton"));
    expect(luminance("breton")).toBeGreaterThan(luminance("imperial"));
    expect(luminance("imperial")).toBeGreaterThan(luminance("redguard"));
    expect(luminance("nord") - luminance("redguard")).toBeGreaterThan(0.45);
  });
});
