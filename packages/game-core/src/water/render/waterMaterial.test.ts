import { describe, expect, it } from "vitest";
import { WATER_TIERS } from "./waterMaterial";
import { WAVES } from "../waves";

describe("render quality keeps physical water unchanged", () => {
  it("uses the complete CPU wave spectrum in both tiers", () => {
    expect(WATER_TIERS.high.waveBands).toBe(WAVES.bands);
    expect(WATER_TIERS.low.waveBands).toBe(WAVES.bands);
    expect(WATER_TIERS.low.rtScale).toBeLessThan(WATER_TIERS.high.rtScale);
    expect(WATER_TIERS.low.ssr).toBe(false);
  });
});
