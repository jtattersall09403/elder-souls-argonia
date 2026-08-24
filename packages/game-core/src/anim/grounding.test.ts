import { describe, expect, it } from "vitest";
import {
  crossFadeSoleClearance,
  nextSupportCorrection,
  nextUpwardGroundCorrection,
  requiredAirborneImpactCorrection,
  requiredSupportCorrection,
  resolveSupportCorrection,
  sampleSoleMarkerClearance,
  sampleSoleMarkerClearanceById,
  sampleSoleMarkerPointById,
  sampleSupportEnvelope,
  supportModeAt,
  supportModeDuringCrossFade,
  usesCrossFadeSoleProxy,
} from "./grounding";

describe("upward-only actor grounding", () => {
  it("snaps upward when a planted marker penetrates its support", () => {
    expect(nextUpwardGroundCorrection(0, 0, -0.08, 1 / 60)).toBeCloseTo(0.08, 8);
  });

  it("never creates a downward correction when an authored action lifts both feet", () => {
    expect(nextUpwardGroundCorrection(0, 0, 1.4, 1 / 60)).toBe(0);
  });

  it("releases an earlier upward correction toward authored height without crossing below it", () => {
    const next = nextUpwardGroundCorrection(0.04, 0, 0.4, 1 / 60);
    expect(next).toBeGreaterThanOrEqual(0);
    expect(next).toBeLessThan(0.04);
  });
});

describe("baked visible-surface support", () => {
  const phases = [
    { startTime: 0.9, endTime: 1.65, mode: "airborne" as const },
    { startTime: 1.65, endTime: 1.9, mode: "floor-contact" as const },
  ];

  it("uses half-open source-time phase overrides", () => {
    expect(supportModeAt("penetration", phases, 0.89)).toBe("penetration");
    expect(supportModeAt("penetration", phases, 0.9)).toBe("airborne");
    expect(supportModeAt("penetration", phases, 1.65)).toBe("floor-contact");
    expect(supportModeAt("penetration", phases, 1.9)).toBe("penetration");
  });

  it("retains floor contact through an exit fade but releases for incoming airtime", () => {
    expect(supportModeDuringCrossFade("penetration", "floor-contact", 0.8, 0.2))
      .toBe("floor-contact");
    expect(supportModeDuringCrossFade("penetration", "floor-contact", 0.98, 0.02))
      .toBe("penetration");
    expect(supportModeDuringCrossFade("airborne", "floor-contact", 0.2, 0.8))
      .toBe("airborne");
  });

  it("adds sole safety only to material penetration-mode crossfades", () => {
    expect(crossFadeSoleClearance(0.004, 0.025, "penetration", "penetration", 0.8, 0.2))
      .toBeCloseTo(0.029);
    expect(crossFadeSoleClearance(0.004, 0.025, "penetration", "penetration", 1, 0))
      .toBeCloseTo(0.004);
    expect(crossFadeSoleClearance(0.004, 0.025, "floor-contact", "penetration", 0.8, 0.2))
      .toBeCloseTo(0.004);
    expect(crossFadeSoleClearance(0.004, 0.025, "airborne", "penetration", 0.8, 0.2))
      .toBeCloseTo(0.004);
  });

  it("uses marker proxies from the first frame of a ground-bound crossfade", () => {
    expect(usesCrossFadeSoleProxy("penetration", "penetration", 0.8, 0.2)).toBe(true);
    // Engaging partway through a blend discovers a fully-formed penetration and
    // steps the correction in one frame, which is a visible hop. It must be
    // live while the incoming clip is still a rounding error.
    expect(usesCrossFadeSoleProxy("penetration", "penetration", 0.98, 0.02)).toBe(true);
    expect(usesCrossFadeSoleProxy("penetration", "penetration", 1, 0)).toBe(false);
    expect(usesCrossFadeSoleProxy("floor-contact", "airborne", 0.8, 0.2)).toBe(true);
    expect(usesCrossFadeSoleProxy("floor-contact", "penetration", 0.8, 0.2)).toBe(true);
    expect(usesCrossFadeSoleProxy("penetration", "floor-contact", 0.8, 0.2)).toBe(true);
    expect(usesCrossFadeSoleProxy("airborne", "penetration", 0.8, 0.2)).toBe(false);
  });

  it("interpolates and clamps the baked surface curve", () => {
    const envelope = { sampleIntervalSeconds: 0.1, surfaceMinY: [0.02, -0.02, 0.06] };
    expect(sampleSupportEnvelope(envelope, -1)).toBeCloseTo(0.02);
    expect(sampleSupportEnvelope(envelope, 0.05)).toBeCloseTo(0);
    expect(sampleSupportEnvelope(envelope, 99)).toBeCloseTo(0.06);
  });

  it("holds the first pose until the exported action's real sample origin", () => {
    const envelope = {
      sampleStartTimeSeconds: 1 / 30,
      sampleIntervalSeconds: 1 / 30,
      surfaceMinY: [-0.01, -0.04, 0.02],
    };
    expect(sampleSupportEnvelope(envelope, 0)).toBeCloseTo(-0.01);
    expect(sampleSupportEnvelope(envelope, 1 / 30)).toBeCloseTo(-0.01);
    expect(sampleSupportEnvelope(envelope, 2 / 30)).toBeCloseTo(-0.04);
  });

  it("samples a non-negative visible-sole clearance beside the surface curve", () => {
    const envelope = {
      sampleStartTimeSeconds: 0.1,
      sampleIntervalSeconds: 0.1,
      surfaceMinY: [-0.04, -0.02],
      soleMarkerMinY: [0.01, 0.04],
    };
    expect(sampleSoleMarkerClearance(envelope, 0)).toBeCloseTo(0.05);
    expect(sampleSoleMarkerClearance(envelope, 0.15)).toBeCloseTo(0.055);
    expect(sampleSoleMarkerClearance({
      sampleIntervalSeconds: 0.1,
      surfaceMinY: [-0.04, -0.02],
    }, 0.1)).toBeNull();
  });

  it("preserves marker identity when sampling visible-sole clearance", () => {
    const envelope = {
      sampleIntervalSeconds: 0.1,
      surfaceMinY: [-0.04, -0.02],
      soleMarkerYById: {
        footL: [0.01, 0.08],
        footR: [0.06, 0.03],
      },
    };
    expect(sampleSoleMarkerClearanceById(envelope, "footL", 0.05)).toBeCloseTo(0.075);
    expect(sampleSoleMarkerClearanceById(envelope, "footR", 0.05)).toBeCloseTo(0.075);
    expect(sampleSoleMarkerClearanceById(envelope, "toeL", 0.05)).toBeNull();
  });

  it("interpolates a marker's bone-local visible support point", () => {
    const envelope = {
      sampleIntervalSeconds: 0.1,
      surfaceMinY: [-0.04, -0.02],
      soleMarkerPointBoneLocalById: {
        footL: [[-0.1, 0.2, 0.3], [0.1, 0.4, -0.1]] as [number, number, number][],
      },
    };
    const point = sampleSoleMarkerPointById(envelope, "footL", 0.05);
    expect(point?.[0]).toBeCloseTo(0);
    expect(point?.[1]).toBeCloseTo(0.3);
    expect(point?.[2]).toBeCloseTo(0.1);
    expect(sampleSoleMarkerPointById(envelope, "toeL", 0.05)).toBeNull();
  });

  it("prevents only penetration unless a phase explicitly requires floor contact", () => {
    expect(requiredSupportCorrection("penetration", 0, -0.04)).toBeCloseTo(0.04);
    expect(requiredSupportCorrection("penetration", 0, 0.12)).toBe(0);
    expect(requiredSupportCorrection("airborne", 0, -0.04)).toBe(0);
    expect(requiredSupportCorrection("floor-contact", 0, 0.12)).toBeCloseTo(-0.12);
  });

  it("protects a penetrating airborne pose only after the actor reaches physical support", () => {
    expect(requiredAirborneImpactCorrection("airborne", 0, 0.04, -0.03)).toBe(0);
    expect(requiredAirborneImpactCorrection("airborne", 0, 0, -0.03)).toBeCloseTo(0.03);
    expect(requiredAirborneImpactCorrection("airborne", 0, -0.18, -0.23)).toBeCloseTo(0.23);
    expect(requiredAirborneImpactCorrection("airborne", 0, -0.18, 0.02)).toBe(0);
    expect(requiredAirborneImpactCorrection("penetration", 0, -0.18, -0.23)).toBe(0);
  });

  it("uses only the calibrated near-impact band and leaves launch/apex unpinned", () => {
    expect(requiredAirborneImpactCorrection("airborne", 0, 0.3, -0.03, 0.02)).toBe(0);
    expect(requiredAirborneImpactCorrection("airborne", 0, 0.021, -0.03, 0.02)).toBe(0);
    expect(requiredAirborneImpactCorrection("airborne", 0, 0.02, -0.03, 0.02))
      .toBeCloseTo(0.03);
    expect(requiredAirborneImpactCorrection("airborne", 0, 0.015, 0.01, 0.02)).toBe(0);
  });

  it("does not let the zero-valued impact exception erase downward floor contact", () => {
    expect(resolveSupportCorrection("floor-contact", 0, -0.03, 0.14)).toEqual({
      mode: "floor-contact",
      correction: -0.14,
    });
    expect(resolveSupportCorrection("airborne", 0, -0.18, -0.23)).toEqual({
      mode: "penetration",
      correction: 0.23,
    });
  });

  it("tracks floor contact exactly but releases an airborne correction smoothly", () => {
    expect(nextSupportCorrection(0, -0.03, "floor-contact", 1 / 60)).toBeCloseTo(-0.03);
    const released = nextSupportCorrection(0.04, 0, "airborne", 1 / 60);
    expect(released).toBeGreaterThan(0);
    expect(released).toBeLessThan(0.04);
  });
});
