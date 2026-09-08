import { describe, expect, it } from "vitest";
import {
  AUTHORED_UV_EXTENT_M, HYDRO_GRID_SAMPLES, HYDRO_RASTER_EDGE_EXTENT_M,
  PROVINCE_EXTENT_M, TERRAIN_SUPPORT_EXTENT_M,
  PROVINCE_EXTENT_RAW_SPACINGS, RAW_METRES_PER_SAMPLE, SOURCE_GRID_SAMPLES,
  hydroPixelCenterToMetres, hydroPixelCenterToUv, metresToHydroPixel,
} from "./provinceScale";

describe("province cell-centre registration", () => {
  it("keeps authored, terrain-support and raster-edge spans distinct", () => {
    expect(SOURCE_GRID_SAMPLES).toBe(4033);
    expect(HYDRO_GRID_SAMPLES).toBe(1345);
    expect(AUTHORED_UV_EXTENT_M).toBeCloseTo(PROVINCE_EXTENT_RAW_SPACINGS * RAW_METRES_PER_SAMPLE, 10);
    expect(TERRAIN_SUPPORT_EXTENT_M).toBeCloseTo((SOURCE_GRID_SAMPLES - 1) * RAW_METRES_PER_SAMPLE, 10);
    expect(HYDRO_RASTER_EDGE_EXTENT_M - AUTHORED_UV_EXTENT_M)
      .toBeCloseTo(RAW_METRES_PER_SAMPLE, 10);
    expect(AUTHORED_UV_EXTENT_M - TERRAIN_SUPPORT_EXTENT_M)
      .toBeCloseTo(2 * RAW_METRES_PER_SAMPLE, 10);
    expect(PROVINCE_EXTENT_M).toBe(AUTHORED_UV_EXTENT_M);
  });

  it("round-trips pixel centres and locks the Nine-Trunks authored join", () => {
    for (const pixel of [0, 672, 910, 1344]) {
      expect(metresToHydroPixel(hydroPixelCenterToMetres(pixel))).toBeCloseTo(pixel, 12);
    }
    expect(hydroPixelCenterToMetres(910)).toBeCloseTo(4992.74496, 10);
    expect(hydroPixelCenterToUv(910)).toBeCloseTo(0.6771194843827467, 12);
  });
});
