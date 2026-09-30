import { describe, expect, it } from "vitest";
import { nextSupportCorrection } from "@elder-souls/game-core/anim/grounding";
import { StepSmoother } from "./stepSmoothing";

const DT = 1 / 60;
const RISER = 0.2;

/**
 * A 0.2 m / 0.3 m staircase climbed at 4.5 m/s: the body's soles rise as a
 * smooth ramp up to a riser behind the support plane, which jumps a riser in
 * one frame per tread (the rapier trace of ecctrl's float spring and ground
 * cast, tooling/.reports/16k/walk6/render/stairs-report.md).
 */
function climb(smoother: StepSmoother | null) {
  const drawn: number[] = [];
  let correction = 0;
  for (let i = 0; i < 90; i++) {
    const x = 0.3 + 4.5 * i * DT;
    const support = Math.floor(x / 0.3) * RISER;
    const sole = (x / 0.3) * RISER - RISER;
    const required = Math.max(0, support - sole);
    correction = nextSupportCorrection(correction, required, "penetration", DT);
    drawn.push(sole + (smoother ? smoother.update(correction, DT, true) : correction));
  }
  return drawn;
}

const BODY_RISE_PER_FRAME = (4.5 * DT / 0.3) * RISER;
/** Per-frame drawn rise beyond the body's own smooth climb: the stutter. */
const steps = (ys: number[]) => ys.slice(1).map((y, i) => y - ys[i] - BODY_RISE_PER_FRAME);

describe("StepSmoother", () => {
  it("spreads each step-up: per-frame rise over the body's climb under 25% of the riser, under half the raw pop", () => {
    const raw = Math.max(...steps(climb(null)));
    const d = steps(climb(new StepSmoother()));
    expect(Math.max(...d)).toBeLessThan(raw / 2);
    expect(Math.max(...d)).toBeLessThan(0.25 * RISER);
    expect(Math.min(...d)).toBeGreaterThan(-0.25 * RISER);
  });

  it("is exact at rest and for gait-sized changes on flat ground", () => {
    const s = new StepSmoother();
    for (let i = 0; i < 30; i++) {
      const gait = 0.025 * Math.sin(i);
      expect(s.update(gait, DT, true)).toBe(gait);
    }
  });

  it("snaps for a teleport-sized change and when not grounded", () => {
    const s = new StepSmoother();
    s.update(0, DT, true);
    expect(s.update(0.8, DT, true)).toBe(0.8);
    s.update(0, DT, true);
    expect(s.update(0.2, DT, false)).toBe(0.2);
    expect(s.update(-0.7, DT, true)).toBe(-0.7);
  });

  it("never trails the solve by more than its lag bound", () => {
    const s = new StepSmoother({ maxLagMeters: 0.1 });
    s.update(0, DT, true);
    expect(s.update(0.5, DT, true)).toBeGreaterThanOrEqual(0.4);
  });
});
