import { describe, expect, it } from "vitest";
import { FIRE_UPSAMPLE_DEPTH_TOLERANCE, FIRE_VOLUME_LAYER, FIRE_VOLUME_SCALE, fireUpsampleDepthWeight, fireVolumeTargetSize } from "./FireVolumePass";
import { BLOOM_SOURCE_LAYER } from "./BloomPass";

describe("FireVolumePass (vol10 F8a)", () => {
  it("marches at half the drawing buffer on desktop, a quarter on mobile, never below 2", () => {
    expect(fireVolumeTargetSize(1920, 1080, FIRE_VOLUME_SCALE.desktop)).toEqual([960, 540]);
    expect(fireVolumeTargetSize(1920, 1080, FIRE_VOLUME_SCALE.mobile)).toEqual([480, 270]);
    expect(fireVolumeTargetSize(3, 1, 0.5)).toEqual([2, 2]);
  });
  it("its layer is its own", () => {
    expect([3, 4, 5, 6, BLOOM_SOURCE_LAYER]).not.toContain(FIRE_VOLUME_LAYER);
  });
  it("the upsample keeps texels at the pixel's depth and drops texels across an edge", () => {
    expect(fireUpsampleDepthWeight(-3, -3)).toBe(1);
    expect(fireUpsampleDepthWeight(-3, -3 * (1 + FIRE_UPSAMPLE_DEPTH_TOLERANCE))).toBeCloseTo(0.5, 6);
    // a cauldron rim 0.5 m nearer than the flame behind it
    expect(fireUpsampleDepthWeight(-3, -2.5)).toBeLessThan(0.2);
  });
});
