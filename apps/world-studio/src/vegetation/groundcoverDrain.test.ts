import { describe, expect, it } from "vitest";
import {
  fillDue, GC_FILL_INTERVAL_S, GC_PHASE_CEILING_S, settleGeneration,
} from "./groundcoverSchedule";

describe("ground cover drain (review 2026-09-30, both passes replayed)", () => {
  it("a walking pass whose only missing tile waits on an LOD 1 chunk fills what it made at the walking cadence", () => {
    // Walking (not cold); 3 tiles generated; the only tile still missing
    // waits on a chunk (remaining 0, missing 1); last fill 0.1 s ago.
    const generatedSinceFill = 3;
    const sinceLastFillS = GC_FILL_INTERVAL_S * 0.4;
    const due = fillDue({
      generatedSinceFill, remaining: 1, remainingWithin: [0, 1], phasesFilled: 0, cold: false,
      sinceLastFillS,
    });
    expect(due.fill).toBe(false); // the schedule alone would not fill
    const settled = settleGeneration({
      remaining: 0, generatedSinceFill, fill: due.fill, cold: false, sinceLastFillS,
    });
    expect(settled.fill).toBe(false);
    expect(settled.pending).toBe(false); // no per-frame retry of blocked tiles
    expect(settled.fillInS).toBeCloseTo(GC_FILL_INTERVAL_S - sinceLastFillS); // not left undrawn
  });

  it("a cold pass drained by a chunk arrival does not fill the whole ring at once (phasing holds)", () => {
    // Spawn: 50 tiles missing, near band still waiting on chunks; a chunk
    // arrival re-armed generation, the pass made 4 tiles and drained.
    const generatedSinceFill = 4;
    const sinceLastFillS = 0.3;
    const due = fillDue({
      generatedSinceFill, remaining: 50, remainingWithin: [6, 20], phasesFilled: 0, cold: true,
      sinceLastFillS,
    });
    expect(due.fill).toBe(false);
    const settled = settleGeneration({
      remaining: 0, generatedSinceFill, fill: due.fill, cold: true, sinceLastFillS,
    });
    expect(settled.fill).toBe(false);
    expect(settled.fillInS).toBeCloseTo(GC_PHASE_CEILING_S - sinceLastFillS);
  });

  it("keeps generating while tiles are generatable, and never schedules a fill for an empty pass", () => {
    const base = { generatedSinceFill: 3, fill: false, cold: false, sinceLastFillS: 0 };
    expect(settleGeneration({ ...base, remaining: 2 })).toEqual({ fill: false, pending: true, fillInS: null });
    expect(settleGeneration({ ...base, remaining: 0, generatedSinceFill: 0 }))
      .toEqual({ fill: false, pending: false, fillInS: null });
    expect(settleGeneration({ ...base, remaining: 0, fill: true }))
      .toEqual({ fill: true, pending: false, fillInS: null });
  });
});
