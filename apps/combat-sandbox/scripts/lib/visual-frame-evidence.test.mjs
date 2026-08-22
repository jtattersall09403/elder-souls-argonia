import { describe, expect, it } from "vitest";
import {
  buildInPixelFramePlan,
  normalizeRecordingFrameTimes,
  resolveRealFrameWindow,
  resolveRealTransitionFrameWindow,
  validateRenderedFrameIdentity,
} from "./visual-frame-evidence.mjs";

describe("real recording frame evidence", () => {
  it("rebases WebM container PTS to the decoded filter clock", () => {
    expect(normalizeRecordingFrameTimes([0.033, 0.067, 0.1, 0.133]))
      .toEqual([0, 0.034, 0.067, 0.1]);
  });

  it("selects exact real frame ordinals across rounded time boundaries", () => {
    const frameTimes = normalizeRecordingFrameTimes([0.033, 0.067, 0.1, 0.133, 0.167]);
    expect(resolveRealFrameWindow(frameTimes, { start: 0.033, duration: 0.067 }, { minimum: 2 }))
      .toMatchObject({
        count: 2,
        firstFrameIndex: 1,
        lastFrameIndex: 2,
        firstFrameTime: 0.034,
        lastFrameTime: 0.067,
      });
  });

  it("rejects a declared tail that contains no decoded recording frame", () => {
    const frameTimes = normalizeRecordingFrameTimes([0.033, 7, 7.033, 7.067]);
    expect(() => resolveRealFrameWindow(frameTimes, { start: 7.05, duration: 0.1 }))
      .toThrow(/has 0 real recording frame/);
  });

  it("retains a real final frame exactly on the scenario endpoint", () => {
    const frameTimes = [0, 0.033, 0.067, 0.1];
    expect(resolveRealFrameWindow(frameTimes, { start: 0.067, duration: 0.033 }))
      .toMatchObject({ count: 2, firstFrameIndex: 2, lastFrameIndex: 3 });
  });

  it("selects exact pixel-coded simulation frames across a stale earlier reset", () => {
    const markerFrames = [null, 0, 1, 2, 0, 0, 1, 1, 2, 3, 4, 5];
    const plan = buildInPixelFramePlan(
      markerFrames.map((_, frame) => frame / 30),
      markerFrames,
      0.2,
      { framesPerSecond: 30 },
    );
    expect(plan.frames.map(({ sourceFrame }) => sourceFrame)).toEqual([5, 7, 8, 9, 10, 11]);
    expect(plan.frames.map(({ sourceMarkerFrame }) => sourceMarkerFrame)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(plan.strategy).toBe("in-pixel-simulation-frame-marker");
  });

  it("rejects a constant pixel/telemetry offset instead of validating its arithmetic", () => {
    const shiftedMarkers = [3, 3, 4, 5, 6, 7, 8];
    expect(() => buildInPixelFramePlan(
      shiftedMarkers.map((_, frame) => frame / 30),
      shiftedMarkers,
      0.2,
    )).toThrow(/covers 0\.\.5/);
  });

  it("rejects missing or ambiguous marker frames at a rendered state boundary", () => {
    // State A owns frames 0..2 and state B begins at frame 3. Losing marker 3
    // must not silently select state-A or state-B pixels by a wall-clock guess.
    const missingBoundary = [0, 0, 1, 2, null, 4, 5];
    expect(() => buildInPixelFramePlan(
      missingBoundary.map((_, frame) => frame / 30),
      missingBoundary,
      0.2,
    )).toThrow(/complete in-pixel frame-marker run|missing simulation frame code/);
  });

  it("keeps an exact semantic boundary on its encoded rendered frame", () => {
    const markerFrames = [0, 0, 1, 2, 3, 3, 4, 5];
    const plan = buildInPixelFramePlan(
      markerFrames.map((_, frame) => frame / 30),
      markerFrames,
      0.2,
    );
    const stateAtFrame = (frame) => frame < 3 ? "READY" : "ACTION";
    const renderedStates = plan.frames.map(({ sourceMarkerFrame }) => stateAtFrame(sourceMarkerFrame));
    expect(renderedStates).toEqual(["READY", "READY", "READY", "ACTION", "ACTION", "ACTION"]);
    expect(plan.frames[3]).toMatchObject({ outputFrame: 3, sourceMarkerFrame: 3 });
  });

  it("rejects a one-frame-old actor probe at a semantic boundary", () => {
    expect(() => validateRenderedFrameIdentity([
      { time: 0, simulationFrame: 0, player: { animation: "IDLE" }, enemy: null },
      { time: 1 / 30, simulationFrame: 1, player: { animation: "IDLE" }, enemy: null },
    ], [
      { time: 1 / 30, playerAnimation: "ROLL", enemyAnimation: "absent" },
    ])).toThrow(/final rendered probe is IDLE/);
  });

  it("binds semantic transitions to the final deformed pose at the same frame", () => {
    expect(validateRenderedFrameIdentity([
      { time: 0, simulationFrame: 0, player: { animation: "IDLE" }, enemy: null },
      { time: 1 / 30, simulationFrame: 1, player: { animation: "ROLL" }, enemy: null },
    ], [
      { time: 0, playerAnimation: "IDLE", enemyAnimation: "absent" },
      { time: 1 / 30, playerAnimation: "ROLL", enemyAnimation: "absent" },
    ])).toEqual([
      expect.objectContaining({ simulationFrame: 0, playerAnimation: "IDLE" }),
      expect.objectContaining({ simulationFrame: 1, playerAnimation: "ROLL" }),
    ]);
  });

  it("rejects a boundary image whose real frames do not show both sides", () => {
    expect(() => resolveRealTransitionFrameWindow(
      [0, 0.033, 0.067, 0.1],
      { start: 0, duration: 0.1, transitionTime: 0.2 },
    )).toThrow(/does not straddle/);

    expect(resolveRealTransitionFrameWindow(
      [0, 0.033, 0.067, 0.1],
      { start: 0.033, duration: 0.067, transitionTime: 0.067 },
    )).toMatchObject({ beforeTransitionFrames: 1, atOrAfterTransitionFrames: 2 });
  });
});
