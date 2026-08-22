import { describe, expect, it } from "vitest";
import { VISUAL_FRAME_PHASE_PRIORITY, visualFrameMarkerIndex } from "./visualFrameMarker";

describe("visual frame synchronization contract", () => {
  it("orders combat, final actor deformation/probe, then marker before R3F auto-render", () => {
    expect(VISUAL_FRAME_PHASE_PRIORITY.combat)
      .toBeLessThan(VISUAL_FRAME_PHASE_PRIORITY.actorPoseAndProbe);
    expect(VISUAL_FRAME_PHASE_PRIORITY.actorPoseAndProbe)
      .toBeLessThan(VISUAL_FRAME_PHASE_PRIORITY.telemetryAndMarker);
    expect(VISUAL_FRAME_PHASE_PRIORITY.telemetryAndMarker).toBeLessThan(0);
  });

  it("uses the same integer 30 Hz index as the capture protocol", () => {
    expect(visualFrameMarkerIndex(0)).toBe(0);
    expect(visualFrameMarkerIndex(1 / 30)).toBe(1);
    expect(visualFrameMarkerIndex(17 / 30)).toBe(17);
  });
});
