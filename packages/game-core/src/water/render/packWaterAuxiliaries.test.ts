import { expect, it } from "vitest";
import { packWaterAuxiliaries } from "./packWaterAuxiliaries";

it("keeps CPU RGB exact while packing three fine auxiliaries without another GPU sampler", () => {
  const rgba = () => new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 255]);
  const surface = rgba(), shore = rgba(), support = rgba(), klass = rgba();
  const character = new Uint8ClampedArray([0, 0, 12, 255, 0, 0, 87, 255]);
  const access = new Uint8ClampedArray([127, 255, 43, 255, 128, 0, 190, 255]);
  const before = access.slice();
  packWaterAuxiliaries(surface, shore, support, klass, character, access);
  expect(surface).toEqual(new Uint8ClampedArray([1, 2, 3, 43, 4, 5, 6, 190]));
  expect(shore).toEqual(new Uint8ClampedArray([1, 2, 3, 255, 4, 5, 6, 0]));
  expect(support).toEqual(new Uint8ClampedArray([1, 2, 3, 127, 4, 5, 6, 128]));
  expect(klass).toEqual(new Uint8ClampedArray([1, 2, 3, 12, 4, 5, 6, 87]));
  expect(access).toEqual(before);
  // Byte carry is affine; decoding a bilinear packed sample equals
  // interpolating the decoded16-bit thresholds, including127:255→128:0.
  const packedMid = ((support[3] + support[7]) * 256 + shore[3] + shore[7]) / 2;
  expect(packedMid).toBe(32767.5);
});

it("supports original bundles without an access raster", () => {
  const arrays = Array.from({ length: 5 }, () => new Uint8ClampedArray([1, 2, 3, 255]));
  packWaterAuxiliaries(arrays[0], arrays[1], arrays[2], arrays[3], arrays[4]);
  expect(arrays[0][3]).toBe(255);
  expect(arrays[3][3]).toBe(3);
});
