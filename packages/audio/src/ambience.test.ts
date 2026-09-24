import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseAmbienceTable, REGION_CLASS_IDS, selectAmbience, type AmbienceInputs, type AmbienceTable } from "./ambience";
import { shippedManifest } from "./testManifest";

/** A fixture table in the shape Phase 12b authors (world/sources/audio/), using shipped set ids. */
const TABLE: AmbienceTable = {
  schemaVersion: 1,
  regions: {
    "7": {
      beds: [
        { set: "ambient.marsh.crickets-marsh-night01-lpsd", when: { bands: ["night", "dusk"] } },
        { set: "ambient.marsh.crickets-marsh-day01-lpsd", when: { bands: ["day", "dawn"] }, gainDb: -6 },
        { set: "ambient.marsh.frogs-night", when: { bands: ["night"], seasons: ["monsoon", "flood-peak", "rain-onset"] } },
        { set: "ambient.marsh.wind-bed-reach-lp", scaleBy: "wind" },
      ],
      details: [{ set: "ambient.marsh.birds-marsh3-night-a01-sd", perMinute: 2, when: { bands: ["night"] }, radiusM: [10, 40] }],
    },
  },
  weather: {
    beds: [{ set: "weather.rain.heavy", scaleBy: "rain", when: { minRain: 0.05 } }],
    details: [{ set: "weather.thunder.distant", perMinute: 1.5, when: { weathers: ["thunderstorm"] } }],
  },
  underwater: { beds: [{ set: "ambient.underwater.bed" }], details: [] },
};

const NIGHT: AmbienceInputs = {
  regionClass: 7,
  dayPhase: "night",
  season: "monsoon",
  weather: "clear",
  rainIntensity: 0,
  windSpeedMS: 3,
  canopy: 0.2,
  acoustic: "exterior",
};

const sets = (i: AmbienceInputs) => selectAmbience(TABLE, i).beds.map((b) => b.set).sort();

describe("selectAmbience", () => {
  it("night and day differ in the same place (§108 acceptance)", () => {
    expect(sets(NIGHT)).toContain("ambient.marsh.frogs-night");
    expect(sets({ ...NIGHT, dayPhase: "noon" })).toContain("ambient.marsh.crickets-marsh-day01-lpsd");
    expect(sets({ ...NIGHT, dayPhase: "noon" })).not.toContain("ambient.marsh.frogs-night");
  });

  it("is a pure function of its inputs", () => {
    expect(selectAmbience(TABLE, NIGHT)).toEqual(selectAmbience(TABLE, { ...NIGHT }));
  });

  it("rain beds follow local rain intensity, quieter under canopy", () => {
    const open = selectAmbience(TABLE, { ...NIGHT, weather: "rain", rainIntensity: 0.8, canopy: 0 });
    const under = selectAmbience(TABLE, { ...NIGHT, weather: "rain", rainIntensity: 0.8, canopy: 1 });
    const g = (s: typeof open) => s.beds.find((b) => b.set === "weather.rain.heavy")!.gain;
    expect(g(open)).toBeCloseTo(0.8);
    expect(g(under)).toBeCloseTo(0.4);
    expect(sets(NIGHT)).not.toContain("weather.rain.heavy");
  });

  it("thunder rolls only in a thunderstorm; details carry their radius", () => {
    expect(selectAmbience(TABLE, NIGHT).details.map((d) => d.set)).toEqual(["ambient.marsh.birds-marsh3-night-a01-sd"]);
    expect(selectAmbience(TABLE, { ...NIGHT, weather: "thunderstorm" }).details.map((d) => d.set)).toContain("weather.thunder.distant");
  });

  it("a detail listed by two layers rolls once, at the higher rate", () => {
    const t = structuredClone(TABLE);
    t.regions["7"].details.push({ set: "weather.thunder.distant", perMinute: 1, radiusM: [10, 40], when: { weathers: ["thunderstorm"] } });
    const d = selectAmbience(t, { ...NIGHT, weather: "thunderstorm" }).details.filter((x) => x.set === "weather.thunder.distant");
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ perMinute: 1.5, radiusM: undefined }); // the weather row wins whole
  });

  it("underwater replaces the region and the weather", () => {
    expect(sets({ ...NIGHT, acoustic: "underwater", rainIntensity: 1 })).toEqual(["ambient.underwater.bed"]);
  });

  it("an unknown region class plays only the weather layer", () => {
    expect(sets({ ...NIGHT, regionClass: 99, rainIntensity: 0.5 })).toEqual(["weather.rain.heavy"]);
  });
});

describe("parseAmbienceTable", () => {
  it("accepts the fixture against the shipped manifest", () => {
    expect(parseAmbienceTable(structuredClone(TABLE), shippedManifest())).toBeTruthy();
  });

  it("rejects bad rows: a condition typo, an unknown set, a one-shot as a bed, a non-numeric rate", () => {
    const bad = structuredClone(TABLE) as unknown as { regions: Record<string, { beds: object[]; details: object[] }> };
    bad.regions["7"].beds.push({ set: "ambient.marsh.frogs-night", when: { band: ["night"] } });
    bad.regions["7"].beds.push({ set: "ambient.marsh.nope" });
    bad.regions["7"].beds.push({ set: "combat.swing.blade" });
    bad.regions["7"].details.push({ set: "weather.thunder.distant", perMinute: "often" });
    bad.regions["7"].beds.push({ set: "ambient.marsh.frogs-night", when: { bands: ["nite"], minRain: "0.05" } });
    bad.regions["7"].details.push({ set: "weather.thunder.distant", perMinute: 1, radiusM: [40, 10] });
    (bad.regions["7"].beds as unknown[]).push(null);
    bad.regions["7"].details.push({ set: "weather.thunder.distant", perMinute: 1, radiusM: [150, 600] });
    const msg = (() => {
      try {
        parseAmbienceTable(bad, shippedManifest());
        return "";
      } catch (e) {
        return String(e);
      }
    })();
    expect(msg).toMatch(/unknown condition "band"/);
    expect(msg).toMatch(/no set ambient.marsh.nope/);
    expect(msg).toMatch(/combat.swing.blade is a one-shot/);
    expect(msg).toMatch(/perMinute must be a number/);
    expect(msg).toMatch(/"nite" is not a valid bands value/);
    expect(msg).toMatch(/"minRain" must be a number/);
    expect(msg).toMatch(/radiusM must be/);
    expect(msg).toMatch(/beds\[\d+\]: not an object/);
    expect(msg).toMatch(/beyond hearing range/);
  });

  it("rejects another schema version or a malformed layer", () => {
    expect(() => parseAmbienceTable({ ...TABLE, schemaVersion: 2 })).toThrow(/schemaVersion/);
    expect(() => parseAmbienceTable({ ...TABLE, weather: { beds: [] } })).toThrow(/weather/);
    const { regions: _drop, ...noRegions } = TABLE;
    expect(() => parseAmbienceTable(noRegions)).toThrow(/regions/);
    expect(() => selectAmbience({ ...TABLE, schemaVersion: 2 }, NIGHT)).toThrow(/schemaVersion/);
  });
});

describe("region class ids", () => {
  it("match worldgen's REGION_CLASSES", () => {
    const py = readFileSync(new URL("../../../tooling/world-generation/worldgen/regions.py", import.meta.url), "utf8");
    const block = py.slice(py.indexOf("REGION_CLASSES = {"), py.indexOf("}", py.indexOf("REGION_CLASSES = {")));
    const ids = [...block.matchAll(/^\s+(\d+):\s*\(/gm)].map((m) => Number(m[1]));
    expect(ids).toEqual([...REGION_CLASS_IDS]);
  });

  it("a table keyed by anything else is rejected", () => {
    expect(() => parseAmbienceTable({ ...TABLE, regions: { marsh: TABLE.regions["7"] } })).toThrow(/not a region class id/);
    expect(() => parseAmbienceTable({ ...TABLE, regions: { "07": TABLE.regions["7"] } })).toThrow(/not a region class id/);
    expect(() => parseAmbienceTable({ ...TABLE, regions: { "10": TABLE.regions["7"] } })).toThrow(/not a region class id/);
  });
});
