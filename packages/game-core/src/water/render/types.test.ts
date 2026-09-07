import { describe, expect, it } from "vitest";
import { ALL_WATER_LAYERS, WATER_LAYER_NAMES, parseWaterLayers } from "./types";

describe("water layer toggle", () => {
  it("draws everything when the spec is absent or empty", () => {
    expect(parseWaterLayers(null)).toEqual(ALL_WATER_LAYERS);
    expect(parseWaterLayers(undefined)).toEqual(ALL_WATER_LAYERS);
    expect(parseWaterLayers("  ")).toEqual(ALL_WATER_LAYERS);
  });

  it("draws only the named layers", () => {
    expect(parseWaterLayers("strips")).toEqual(
      { field: false, strips: true, falls: false, effects: false });
    expect(parseWaterLayers("field, falls")).toEqual(
      { field: true, strips: false, falls: true, effects: false });
  });

  it("ignores unknown names, so `none` hides the whole water pass", () => {
    expect(parseWaterLayers("none")).toEqual(
      { field: false, strips: false, falls: false, effects: false });
    expect(parseWaterLayers("FIELD,bogus")).toEqual(
      { field: true, strips: false, falls: false, effects: false });
  });

  it("names every layer exactly once", () => {
    expect(new Set(WATER_LAYER_NAMES).size).toBe(WATER_LAYER_NAMES.length);
    expect(Object.keys(ALL_WATER_LAYERS).sort()).toEqual([...WATER_LAYER_NAMES].sort());
  });
});
