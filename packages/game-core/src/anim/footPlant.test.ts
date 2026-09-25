import { describe, expect, it } from "vitest";
import { initialFootPlant, stepFootPlant, type Foot } from "./footPlant";

/** A 1 Hz stride sampled at 30 fps: each ankle 0.10 m up in stance, lifting 0.15 m in swing, half a cycle apart. */
function stride(seconds: number, frequency = 1) {
  const frames: [number, number][] = [];
  for (let i = 0; i <= seconds * 30; i += 1) {
    const phase = 2 * Math.PI * frequency * (i / 30);
    frames.push([0.1 + Math.max(0, Math.sin(phase)) * 0.15, 0.1 + Math.max(0, Math.sin(phase + Math.PI)) * 0.15]);
  }
  return frames;
}

function plants(frames: readonly [number, number][]) {
  let state = initialFootPlant();
  const out: { frame: number; foot: Foot }[] = [];
  frames.forEach(([l, r], frame) => {
    const step = stepFootPlant(state, l, r);
    state = step.state;
    if (step.planted) out.push({ frame, foot: step.planted });
  });
  return out;
}

describe("stepFootPlant", () => {
  // Expected before the code: two plants per cycle, alternating feet, each
  // just after the half-cycle at which the other foot starts to lift.
  it("plants twice per stride cycle, alternating feet", () => {
    const got = plants(stride(2.1));
    expect(got.length).toBe(4);
    expect(got.map((p) => p.foot)).toEqual(["footL", "footR", "footL", "footR"]);
    for (const [index, p] of got.entries()) {
      const halfCycleFrame = (index + 1) * 15;
      expect(p.frame).toBeGreaterThanOrEqual(halfCycleFrame);
      expect(p.frame).toBeLessThanOrEqual(halfCycleFrame + 2);
    }
  });

  it("scales with cadence: a 2 Hz run plants four times a second", () => {
    expect(plants(stride(2.1, 2)).length).toBe(8);
  });

  it("does not chatter on a standing pose's bone jitter", () => {
    const frames: [number, number][] = [];
    for (let i = 0; i < 90; i += 1) frames.push([0.1 + (i % 2) * 0.008, 0.1 + ((i + 1) % 2) * 0.008]);
    expect(plants(frames)).toEqual([]);
  });

  it("starting from a standstill, the foot left down is not a plant", () => {
    const first = stepFootPlant(initialFootPlant(), 0.1, 0.1);
    expect(first.planted).toBeNull();
    const lifted = stepFootPlant(first.state, 0.3, 0.1);
    expect(lifted.planted).toBeNull();
    expect(lifted.state.support).toBe("footR");
  });
});
