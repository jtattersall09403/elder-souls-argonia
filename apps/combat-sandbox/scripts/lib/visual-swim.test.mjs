import { describe, expect, it } from "vitest";
import { evaluateSwim } from "./visual-swim.mjs";

const EXPECTED = {
  startsGrounded: true,
  endsGroundedOutOfWater: true,
  sheathedWhileSwimming: true,
  maxChestSurfaceErrorMeters: 0.1,
  settleSeconds: 0.5,
  minSwimSeconds: 1,
};

function sample(time, overrides = {}) {
  return {
    time,
    swimming: false,
    floating: false,
    chestY: 1.25,
    surfaceY: -0.2,
    inWater: false,
    equipped: true,
    grounded: true,
    ...overrides,
  };
}

/** Walk in, swim 2 s over deep water, walk out onto dry ground. */
function crossing(chestAt = () => -0.2) {
  const samples = [sample(0), sample(0.5)];
  for (let t = 1; t <= 3.001; t += 0.1) {
    const time = Number(t.toFixed(2));
    samples.push(sample(time, {
      swimming: true, floating: true, inWater: true, equipped: false, grounded: false,
      chestY: time < 1.2 ? 0.3 : chestAt(time),
    }));
  }
  samples.push(sample(3.2, { inWater: true, equipped: false }));
  samples.push(sample(4, { equipped: false }));
  return { swimSamples: samples };
}

describe("evaluateSwim", () => {
  it("passes a clean crossing and reports the worst settled chest error", () => {
    const result = evaluateSwim("swim-cross", crossing((t) => -0.2 + (t > 2 ? 0.04 : 0.01)), EXPECTED);
    expect(result.failures).toEqual([]);
    expect(result.measured.maxChestSurfaceErrorMeters).toBeCloseTo(0.04, 6);
    expect(result.measured.swimSeconds).toBeCloseTo(2, 6);
  });

  it("ignores the entry plunge inside the settle window", () => {
    // The 0.5 m entry sample at t = 1.0-1.1 is inside the 0.5 s settle window.
    expect(evaluateSwim("swim-cross", crossing(), EXPECTED).failures).toEqual([]);
  });

  it("fails a chest that drifts off the surface once settled", () => {
    const failures = evaluateSwim("swim-cross", crossing((t) => (t > 2.5 ? 0.0 : -0.2)), EXPECTED).failures;
    expect(failures.join("\n")).toMatch(/chest 0\.2\d*m off the surface/);
  });

  it("fails a drawn weapon in the water", () => {
    const telemetry = crossing();
    telemetry.swimSamples[5].equipped = true;
    expect(evaluateSwim("swim-cross", telemetry, EXPECTED).failures.join("\n")).toMatch(/weapon drawn while swimming/);
  });

  it("fails a scene that never swims, or ends still in the water", () => {
    expect(evaluateSwim("swim-cross", { swimSamples: [sample(0), sample(1)] }, EXPECTED).failures.join("\n"))
      .toMatch(/never swam/);
    const stuck = crossing();
    stuck.swimSamples.pop();
    stuck.swimSamples.pop();
    expect(evaluateSwim("swim-cross", stuck, EXPECTED).failures.join("\n")).toMatch(/did not end grounded out of the water/);
  });

  it("fails without telemetry", () => {
    expect(evaluateSwim("swim-cross", {}, EXPECTED).failures).toEqual(["swim-cross: no swim telemetry"]);
  });
});
