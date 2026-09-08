import { describe, expect, it } from "vitest";

import { RACES } from "./races";

describe("playable race appearance", () => {
  it("keeps the previously duplicated humanoid pairs visually distinct", () => {
    for (const [left, right] of [["imperial", "breton"], ["altmer", "bosmer"]] as const) {
      expect(RACES[left].asset).not.toBe(RACES[right].asset);
      expect(RACES[left].appearance.skinTint).not.toEqual(RACES[right].appearance.skinTint);
      expect(RACES[left].appearance.hairTint).not.toEqual(RACES[right].appearance.hairTint);
    }
  });

  it("uses the canonical Skyrim race stature multipliers", () => {
    expect(RACES.altmer.heightScale).toBe(1.08);
    expect(RACES.orsimer.heightScale).toBe(1.045);
    expect(RACES.nord.heightScale).toBe(1.03);
    expect(RACES.bosmer.heightScale).toBe(0.98);
  });

  it("uses Skyrim's body tint shader for every playable race", () => {
    expect(RACES.imperial.appearance.skinTintMode).toBe("skyrim-rgb-tint");
    expect(RACES.dunmer.appearance.skinTintMode).toBe("skyrim-rgb-tint");
    expect(RACES.argonian.appearance.skinTintMode).toBe("skyrim-rgb-tint");
    expect(RACES.khajiit.appearance.skinTintMode).toBe("skyrim-rgb-tint");
  });
});
