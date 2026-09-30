import { describe, expect, it } from "vitest";
import { settleGeneration } from "./Groundcover";
import { fillDue, GC_FILL_INTERVAL_S } from "./groundcoverSchedule";

describe("ground cover drain (review 2026-09-30 PLAUSIBLE item, replayed)", () => {
  it("a walking pass whose only missing tile waits on an LOD 1 chunk fills what it made", () => {
    // Walking (not cold); 3 tiles generated this pass; the only tile still
    // missing waits on a chunk (remaining 0, missing 1); last fill 0.1 s ago.
    const generatedSinceFill = 3;
    const due = fillDue({
      generatedSinceFill, remaining: 1, remainingWithin: [0, 1], phasesFilled: 0, cold: false,
      sinceLastFillS: GC_FILL_INTERVAL_S * 0.4,
    });
    expect(due.fill).toBe(false); // the schedule alone would not fill
    const settled = settleGeneration(0, generatedSinceFill, due.fill);
    expect(settled).toEqual({ fill: true, pending: false }); // not left undrawn
  });

  it("keeps generating while tiles are generatable, and never fills an empty pass", () => {
    expect(settleGeneration(2, 3, false)).toEqual({ fill: false, pending: true });
    expect(settleGeneration(0, 0, false)).toEqual({ fill: false, pending: false });
  });
});
