import { describe, expect, it } from "vitest";
import { GUARD_BREAK_STUN_DURATION, RIPOSTE_WINDOW } from "../combat/tuning";
import {
  clipConfig,
  clipPlaybackDuration,
  clipPlaybackSourceSpan,
  transitionCrossFadeDuration,
} from "./animationManifest";

describe("generated animation playback contract", () => {
  it("uses JUMP_START's audited source-time out-point", () => {
    const config = clipConfig("JUMP_START");
    expect(config.sourceDuration).not.toBeNull();
    expect(config.playbackStartTime).toBeNull();
    expect(config.playbackEndTime).toBeCloseTo(0.5667, 4);
    expect(clipPlaybackSourceSpan("JUMP_START")).toBeCloseTo(
      (config.playbackEndTime ?? 0) - (config.playbackStartTime ?? 0),
      4,
    );
    expect(config.playbackEndTime ?? Infinity).toBeLessThan(config.sourceDuration ?? 0);
  });

  it("defaults complete clips to their full source duration", () => {
    const config = clipConfig("JUMP_LAND");
    expect(config.playbackEndTime).toBeNull();
    expect(clipPlaybackSourceSpan("JUMP_LAND")).toBe(config.sourceDuration);
  });

  it("continues the launch through the audited sword-bearing airborne cut", () => {
    const launch = clipConfig("JUMP_START");
    const airborne = clipConfig("JUMP_IDLE");
    expect(launch.crossFadeOutDuration).toBeCloseTo(0.03, 4);
    expect(airborne.looping).toBe(false);
    expect(airborne.playbackStartTime).toBeCloseTo(launch.playbackEndTime ?? 0, 4);
    expect(airborne.playbackEndTime).toBeCloseTo(0.8333, 4);
    expect(airborne.playbackRate).toBeCloseTo(1.3333, 4);
    expect(clipPlaybackDuration("JUMP_IDLE")).toBeCloseTo(0.2, 3);
    expect(transitionCrossFadeDuration("JUMP_IDLE", "JUMP_START", null)).toBeCloseTo(0.03, 4);
  });

  it("plays the standing guard break at its authored speed", () => {
    const config = clipConfig("GUARD_BREAK");
    expect(config.provenance).toContain("standing recoil");
    // A broken guard is the punish window, so the stagger runs at native speed
    // rather than being compressed into a shorter one.
    expect(config.playbackRate).toBe(1);
    expect((config.sourceDuration ?? 0) / config.playbackRate).toBeCloseTo(2.4667, 3);
    expect(GUARD_BREAK_STUN_DURATION).toBeCloseTo(2.4667, 3);
    expect(RIPOSTE_WINDOW).toBeLessThan(GUARD_BREAK_STUN_DURATION);
    expect(RIPOSTE_WINDOW).toBeGreaterThan(1.75);
  });

  it("fits the complete grounded retreat cycle exactly to the backstep lock", () => {
    const config = clipConfig("BACKSTEP");
    expect(config.provenance).toContain("1hm_walkbackward.hkx");
    expect(config.looping).toBe(false);
    expect(config.playbackStartTime).toBeNull();
    expect(config.playbackEndTime).toBeNull();
    expect(config.crossFadeDuration).toBeCloseTo(0.08, 4);
    expect(config.crossFadeOutDuration).toBeCloseTo(0.08, 4);
    expect(clipPlaybackDuration("BACKSTEP")).toBeCloseTo(0.52, 3);
  });

  it("fits the complete roll before an upright settle inside the unchanged gameplay lock", () => {
    const config = clipConfig("ROLL");
    const authoredMotionDuration = clipPlaybackDuration("ROLL") ?? 0;
    expect(config.provenance).toContain("MCO_DodgeForward2.hkx");
    expect(config.playbackStartTime).toBeNull();
    expect(config.playbackEndTime).toBeNull();
    expect(config.playbackRate).toBeCloseTo(1.35422, 5);
    expect(authoredMotionDuration).toBeCloseTo(0.64, 4);
    expect(config.crossFadeOutDuration).toBeCloseTo(0.08, 4);
    expect(authoredMotionDuration + (config.crossFadeOutDuration ?? 0)).toBeCloseTo(0.72, 4);
    expect(config.supportEnvelope?.sampleIntervalSeconds).toBeCloseTo(1 / 120, 6);
    expect(config.supportEnvelope?.surfaceMinY).toHaveLength(105);
  });

  it("ships calibrated visible-sole samples with origins matching clip timestamps", () => {
    const expectedSampleStarts = [
      // Exported loops are rebased to zero so every mixer wrap advances pose
      // immediately instead of repeating the same endpoint for one frame.
      ["SWORD_IDLE", 0],
      ["RUN", 0],
      // PyNifly one-shots retain their authentic frame-1 timestamp. ROLL uses
      // denser support sampling, without changing that authored time origin.
      ["ROLL", 1 / 30],
      ["RIPOSTE", 1 / 30],
      ["DEATH", 1 / 30],
    ] as const;

    for (const [state, expectedSampleStart] of expectedSampleStarts) {
      const envelope = clipConfig(state).supportEnvelope;
      expect(envelope?.sampleStartTimeSeconds).toBeCloseTo(expectedSampleStart, 6);
      expect(envelope?.soleMarkerMinY).toHaveLength(envelope?.surfaceMinY.length ?? 0);
      for (const markerId of ["footL", "footR", "toeL", "toeR"]) {
        expect(envelope?.soleMarkerYById?.[markerId])
          .toHaveLength(envelope?.surfaceMinY.length ?? 0);
        const points = envelope?.soleMarkerPointBoneLocalById?.[markerId];
        expect(points).toHaveLength(envelope?.surfaceMinY.length ?? 0);
        expect(points?.every((point) => (
          point.length === 3 && point.every(Number.isFinite)
        ))).toBe(true);
      }
    }
  });

  it("uses a complete fall-to-prone source for ordinary death", () => {
    const config = clipConfig("DEATH");
    expect(config.playbackEndTime).toBeCloseTo(1.9, 4);
    expect(config.provenance).toContain("Knockdown");
    expect(config.supportPhases).toEqual(expect.arrayContaining([
      expect.objectContaining({ startTime: 1.1, endTime: 1.9, mode: "floor-contact" }),
    ]));
  });

  it("keeps an explicit command blend above manifest transition defaults", () => {
    expect(transitionCrossFadeDuration("SWORD_IDLE", "RIPOSTE", 0.24)).toBe(0.24);
  });

  it("uses an authored outgoing handoff before the incoming entry default", () => {
    expect(clipConfig("RIPOSTE").crossFadeOutDuration).toBeCloseTo(0.24, 4);
    expect(transitionCrossFadeDuration("SWORD_IDLE", "RIPOSTE", null)).toBeCloseTo(0.24, 4);
    expect(transitionCrossFadeDuration("RIPOSTE", "SWORD_IDLE", null))
      .toBeCloseTo(clipConfig("RIPOSTE").crossFadeDuration ?? 0, 4);
  });

  it("trims only the stray attacker lead-in while preserving authored contact timing", () => {
    const riposte = clipConfig("RIPOSTE");
    expect(riposte.playbackStartTime).toBeCloseTo(0.1667, 4);
    expect(riposte.playbackEndTime).toBeCloseTo(1.3, 4);
    expect(riposte.playbackRate).toBe(1);
    expect(clipPlaybackDuration("RIPOSTE")).toBeCloseTo(1.1333, 4);
    expect((0.5667 - (riposte.playbackStartTime ?? 0)) / riposte.playbackRate)
      .toBeCloseTo(0.4, 4);
    expect((0.7 - (riposte.playbackStartTime ?? 0)) / riposte.playbackRate)
      .toBeCloseTo(0.5333, 4);
  });

  it("keeps the selected hit1 victim source through its complete authored recovery", () => {
    const riposted = clipConfig("RIPOSTED_HIT1");
    expect(riposted.provenance).toContain("(6141037) sword hit1");
    expect(riposted.sourceDuration).toBeCloseTo(2, 4);
    expect(riposted.playbackStartTime).toBeCloseTo(0.1333, 4);
    expect(riposted.playbackEndTime).toBeNull();
    expect(riposted.playbackRate).toBe(1);
    expect(clipPlaybackSourceSpan("RIPOSTED_HIT1")).toBeCloseTo(1.8667, 4);
    expect(clipPlaybackDuration("RIPOSTED_HIT1")).toBeCloseTo(1.8667, 4);
    expect(riposted.crossFadeDuration).toBeCloseTo(0.08, 4);
    expect(riposted.crossFadeOutDuration).toBeCloseTo(0.2, 4);
    expect(clipConfig("BACKSTABBED").crossFadeOutDuration).toBeCloseTo(0.2, 4);
  });
});
