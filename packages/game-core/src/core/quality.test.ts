import { describe, expect, it } from "vitest";
import { parseQuality, QUALITY_PRESETS } from "./quality";

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
});
