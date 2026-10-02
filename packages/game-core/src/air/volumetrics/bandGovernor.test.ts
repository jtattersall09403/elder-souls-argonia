import { describe, expect, it } from "vitest";
import { BandGovernor, VOLUMETRIC_BANDS, bandSpec, volBandOverride, volumetricTier } from "./bandGovernor";

const run = (g: BandGovernor, ms: number, seconds: number) => {
  for (let t = 0; t < seconds * 1000; t += ms) g.frame(ms);
  return g.band;
};

describe("BandGovernor", () => {
  it("URL override wins over the tier and holds", () => {
    expect(volBandOverride("?vol=low&x=1")).toBe("low");
    expect(volBandOverride("?vol=ultra")).toBe(null);
    const g = new BandGovernor({ backend: "webgpu", tier: "low", override: "high" });
    expect(run(g, 40, 10)).toBe("high");
    expect(new BandGovernor({ backend: "webgpu", tier: "mobile", override: "medium" }).band).toBe("medium");
  });
  it("WebGL is off whatever the tier", () => {
    expect(run(new BandGovernor({ backend: "webgl", tier: "high" }), 5, 20)).toBe("off");
  });
  it("the renderer tier sets the starting band (0112 §7: low/mobile low, medium medium, high high)", () => {
    expect(volumetricTier("medium", true)).toBe("mobile");
    expect(volumetricTier("high", false)).toBe("high");
    for (const [tier, band] of [["mobile", "low"], ["low", "low"], ["medium", "medium"], ["high", "high"]] as const) {
      expect(new BandGovernor({ backend: "webgpu", tier }).band).toBe(band);
    }
  });
  it("steps down after 8 s (hold) over 20 ms, never below low", () => {
    const g = new BandGovernor({ backend: "webgpu", tier: "medium" });
    expect(run(g, 25, 7.9)).toBe("medium");
    expect(run(g, 25, 0.2)).toBe("low");
    expect(run(g, 40, 10)).toBe("low");
  });
  it("steps up after 8 s under 12 ms, never above the tier's ceiling", () => {
    const g = new BandGovernor({ backend: "webgpu", tier: "high" });
    expect(run(g, 25, 8.2)).toBe("medium");
    expect(run(g, 15, 20)).toBe("medium");
    expect(run(g, 8, 7.9)).toBe("medium");
    expect(run(g, 8, 1.5)).toBe("high");
    expect(run(g, 8, 20)).toBe("high");
    expect(run(new BandGovernor({ backend: "webgpu", tier: "medium" }), 5, 30)).toBe("medium");
    expect(run(new BandGovernor({ backend: "webgpu", tier: "mobile" }), 5, 30)).toBe("low");
  });
  it("a mobile renderer reads the mobile row at any band; the spec follows the band", () => {
    expect(bandSpec("high", "mobile")).toBe(VOLUMETRIC_BANDS.mobile);
    expect(bandSpec("medium", "high")).toBe(VOLUMETRIC_BANDS.medium);
    const g = new BandGovernor({ backend: "webgpu", tier: "high" });
    expect(g.spec).toBe(VOLUMETRIC_BANDS.high);
    expect(new BandGovernor({ backend: "webgl", tier: "high" }).spec).toBe(null);
  });
  it("each row is no dearer than the one above on every axis, and mobile is the cheapest", () => {
    const order = ["mobile", "low", "medium", "high"] as const;
    const cost = (t: (typeof order)[number]) => {
      const s = VOLUMETRIC_BANDS[t];
      return [s.grid[0] * s.grid[1] * s.grid[2], s.farM, s.fog.octaves, s.fog.warps, s.fog.shapeTexels, s.moteSteps, s.shaftSteps, Number(s.temporal)];
    };
    for (let k = 1; k < order.length; k++) {
      const a = cost(order[k - 1]), b = cost(order[k]);
      a.forEach((v, j) => expect(v).toBeLessThanOrEqual(b[j]));
    }
    const m = VOLUMETRIC_BANDS.mobile, l = VOLUMETRIC_BANDS.low;
    expect(m.grid[0] * m.grid[1] * m.grid[2]).toBeLessThan(l.grid[0] * l.grid[1] * l.grid[2]);
    expect(m.fog.shapeTexels).toBeLessThan(l.fog.shapeTexels);
    expect(m.moteSteps).toBeLessThan(l.moteSteps);
    expect(m.shaftSteps).toBeLessThan(l.shaftSteps);
    expect(m.fireTier).toBe("mobile");
  });
});
