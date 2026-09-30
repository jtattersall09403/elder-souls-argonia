import { describe, expect, it } from "vitest";
import { BandGovernor, volBandOverride } from "./bandGovernor";

const run = (g: BandGovernor, ms: number, seconds: number) => {
  for (let t = 0; t < seconds * 1000; t += ms) g.frame(ms);
  return g.band;
};

describe("BandGovernor", () => {
  it("URL override wins and holds", () => {
    expect(volBandOverride("?vol=low&x=1")).toBe("low");
    expect(volBandOverride("?vol=ultra")).toBe(null);
    const g = new BandGovernor({ backend: "webgpu", override: "high" });
    expect(run(g, 40, 10)).toBe("high");
  });
  it("WebGL is off", () => {
    expect(run(new BandGovernor({ backend: "webgl" }), 5, 20)).toBe("off");
  });
  it("starts medium, steps down after 2 s over 20 ms, never below low", () => {
    const g = new BandGovernor({ backend: "webgpu" });
    expect(g.band).toBe("medium");
    expect(run(g, 25, 1.9)).toBe("medium");
    expect(run(g, 25, 0.2)).toBe("low");
    expect(run(g, 40, 10)).toBe("low");
  });
  it("steps up after 8 s under 12 ms, with hysteresis between 12 and 20 ms", () => {
    const g = new BandGovernor({ backend: "webgpu" });
    expect(run(g, 15, 20)).toBe("medium");
    expect(run(g, 8, 7.9)).toBe("medium");
    expect(run(g, 8, 1.5)).toBe("high");
    expect(run(g, 8, 20)).toBe("high");
  });
});
