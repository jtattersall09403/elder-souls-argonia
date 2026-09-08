import { describe, expect, it } from "vitest";
import {
  HYDRO_GRID_SAMPLES, METRES_PER_HYDRO_SAMPLE, PROVINCE_EXTENT_M,
  PROVINCE_EXTENT_RAW_SPACINGS, RAW_METRES_PER_SAMPLE, SOURCE_GRID_SAMPLES,
  hydroPixelCenterToMetres, hydroPixelCenterToUv, metresToHydroPixel,
} from "./provinceScale";

describe("province cell-centre registration", () => {
  it("makes the authored extent and macro overshoot explicit", () => {
    expect(SOURCE_GRID_SAMPLES).toBe(4033);
    expect(HYDRO_GRID_SAMPLES).toBe(1345);
    expect(PROVINCE_EXTENT_M).toBeCloseTo(PROVINCE_EXTENT_RAW_SPACINGS * RAW_METRES_PER_SAMPLE, 10);
    expect(HYDRO_GRID_SAMPLES * METRES_PER_HYDRO_SAMPLE - PROVINCE_EXTENT_M)
      .toBeCloseTo(RAW_METRES_PER_SAMPLE, 10);
  });

  it("round-trips pixel centres and locks the Nine-Trunks authored join", () => {
    for (const pixel of [0, 672, 910, 1344]) {
      expect(metresToHydroPixel(hydroPixelCenterToMetres(pixel))).toBeCloseTo(pixel, 12);
    }
    expect(hydroPixelCenterToMetres(910)).toBeCloseTo(4992.74496, 10);
    expect(hydroPixelCenterToUv(910)).toBeCloseTo(0.6771194843827467, 12);
  });
});
