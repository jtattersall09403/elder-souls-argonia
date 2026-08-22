import { describe, expect, it } from "vitest";
import { createFixedStep, runFixedSteps } from "./loop";

describe("fixed-step loop", () => {
  it("runs one tick per whole step", () => {
    const state = createFixedStep(1 / 60);
    let ticks = 0;
    runFixedSteps(state, 1 / 60, () => { ticks += 1; });
    expect(ticks).toBe(1);
  });

  it("carries the remainder between frames", () => {
    const state = createFixedStep(1 / 60);
    let ticks = 0;
    const tick = () => { ticks += 1; };
    runFixedSteps(state, 1 / 90, tick); // half a step
    expect(ticks).toBe(0);
    runFixedSteps(state, 1 / 90, tick); // accumulates to a full step
    expect(ticks).toBe(1);
  });

  it("caps catch-up ticks to avoid a spiral of death", () => {
    const state = createFixedStep(1 / 60, 5);
    let ticks = 0;
    runFixedSteps(state, 10, () => { ticks += 1; });
    expect(ticks).toBe(5);
  });

  it("ignores non-positive or invalid deltas", () => {
    const state = createFixedStep();
    let ticks = 0;
    runFixedSteps(state, 0, () => { ticks += 1; });
    runFixedSteps(state, Number.NaN, () => { ticks += 1; });
    expect(ticks).toBe(0);
  });
});
