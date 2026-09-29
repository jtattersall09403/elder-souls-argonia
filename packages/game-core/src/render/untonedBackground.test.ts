import { ACESFilmicToneMapping, Color, NoToneMapping } from "three";
import { describe, expect, it } from "vitest";
import { acesFilmic, untonedBackground } from "./untonedBackground";

describe("untonedBackground", () => {
  it.each(["#dceff4", "#203040", "#808080", "#ff8844"])("ACES of the result lands on %s", (hex) => {
    for (const exposure of [1, 0.5, 2.55e-5]) {
      const target = new Color(hex);
      const c = untonedBackground(hex, ACESFilmicToneMapping, exposure);
      const out = acesFilmic([c.r, c.g, c.b], exposure);
      expect(out[0]).toBeCloseTo(target.r, 3);
      expect(out[1]).toBeCloseTo(target.g, 3);
      expect(out[2]).toBeCloseTo(target.b, 3);
    }
  });

  it("returns the colour unchanged without tone mapping", () => {
    expect(untonedBackground("#dceff4", NoToneMapping, 1).getHex()).toBe(0xdceff4);
  });
});
