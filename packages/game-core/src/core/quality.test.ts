import { describe, expect, it } from "vitest";
import { INTERIOR_PLAYER_FILL_K_MOBILE, interiorPlayerFillK, parseQuality, QUALITY_PRESETS } from "./quality";

describe("quality presets", () => {
  it("keeps the default presets at native density and a 2048 cascade", () => {
    for (const name of ["low", "medium"] as const) {
      expect(QUALITY_PRESETS[name].dprMax).toBe(1);
      expect(QUALITY_PRESETS[name].shadowMapSize).toBe(2048);
    }
  });
  it("high buys density and a finer cascade, picked by name", () => {
    const high = parseQuality("high");
    expect(high.dprMax).toBe(1.25);
    expect(high.shadowMapSize).toBe(4096);
    expect(parseQuality("bogus").name).toBe("medium");
  });
  it("player fill k: 2/2/1 by preset, 1 on mobile", () => {
    expect([QUALITY_PRESETS.high, QUALITY_PRESETS.medium, QUALITY_PRESETS.low].map((q) => q.interiorPlayerFillK)).toEqual([2, 2, 1]);
    expect(interiorPlayerFillK(QUALITY_PRESETS.high, true)).toBe(INTERIOR_PLAYER_FILL_K_MOBILE);
    expect(interiorPlayerFillK(QUALITY_PRESETS.high, false)).toBe(2);
  });
});
