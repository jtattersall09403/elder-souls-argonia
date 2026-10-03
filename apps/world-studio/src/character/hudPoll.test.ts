import { describe, expect, it } from "vitest";
import { hudPollActive, pollStep } from "./hudPoll";

describe("HUD poll (perf10 diag10 C4)", () => {
  it("an unchanged sample sets no state; a changed one yields a fresh snapshot", () => {
    const live = { fps: 60, buckets: [1, 2] };
    const first = pollStep(live, undefined)!;
    expect(first.snapshot).toEqual(live);
    expect(first.snapshot).not.toBe(live);
    expect(pollStep(live, first.key)).toBeNull();
    // the published object is rewritten in place: same identity, new numbers
    live.fps = 59;
    const second = pollStep(live, first.key)!;
    expect(second.snapshot.fps).toBe(59);
    expect(pollStep(59, JSON.stringify(59))).toBeNull();
    expect(pollStep(null, undefined)!.snapshot).toBeNull();
  });
  it("reads nothing with the HUD hidden or the tab in the background", () => {
    expect(hudPollActive("?view=character", false)).toBe(true);
    expect(hudPollActive("?view=character&hud=0", false)).toBe(false);
    expect(hudPollActive("", true)).toBe(false);
  });
});
