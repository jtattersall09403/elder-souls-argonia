import { describe, expect, it } from "vitest";
import {
  HYDRO_GRID_INTERVALS, HYDRO_GRID_SAMPLES, METRES_PER_HYDRO_SAMPLE,
  PROVINCE_EXTENT_M, SOURCE_GRID_INTERVALS, SOURCE_GRID_SAMPLES,
  hydroSampleToMetres, hydroSampleToUv, uvToRasterSample,
} from "./provinceScale";

describe("province vertex-lattice registration", () => {
  it("gives source and hydrology grids the same exact endpoints", () => {
    expect(SOURCE_GRID_SAMPLES).toBe(4033);
    expect(HYDRO_GRID_SAMPLES).toBe(1345);
    expect(PROVINCE_EXTENT_M).toBeCloseTo(SOURCE_GRID_INTERVALS * 1.82784, 10);
    expect(PROVINCE_EXTENT_M).toBeCloseTo(HYDRO_GRID_INTERVALS * METRES_PER_HYDRO_SAMPLE, 10);
    expect(hydroSampleToMetres(HYDRO_GRID_INTERVALS)).toBeCloseTo(PROVINCE_EXTENT_M, 10);
  });

  it("round-trips endpoints without a phantom sample", () => {
    expect(hydroSampleToUv(0)).toBe(0);
    expect(hydroSampleToUv(HYDRO_GRID_INTERVALS)).toBe(1);
    expect(uvToRasterSample(1, SOURCE_GRID_SAMPLES)).toBe(SOURCE_GRID_INTERVALS);
    expect(uvToRasterSample(hydroSampleToUv(672), SOURCE_GRID_SAMPLES)).toBe(2016);
  });
});
