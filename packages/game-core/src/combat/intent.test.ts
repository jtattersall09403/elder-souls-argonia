import { describe, expect, it } from "vitest";
import { DESKTOP_HEAVY_HOLD_SECONDS } from "../io/input";
import { IDLE_OFF_HAND_GESTURE, offHandPresses, type OffHandGesture, type OffHandInput } from "./intent";

/**
 * The off hand's attack controls (dual wield, decision 0091). Expected answers
 * written before the mapping: desktop taps and holds the guard button as the
 * primary button is tapped and held; a pad presses guard for the light and
 * parry for the power attack.
 */
function run(frames: readonly Partial<OffHandInput>[], tapHold: boolean, dt = 1 / 60) {
  let gesture: OffHandGesture = IDLE_OFF_HAND_GESTURE;
  const out: string[] = [];
  frames.forEach((frame, index) => {
    const step = offHandPresses(gesture, { guardHeld: false, parryHeld: false, tapHold, ...frame }, dt);
    gesture = step.gesture;
    if (step.offLightPressed) out.push(`light@${index}`);
    if (step.offHeavyPressed) out.push(`heavy@${index}`);
  });
  return out;
}

const held = (n: number) => Array.from({ length: n }, () => ({ guardHeld: true }));
const up = (n: number) => Array.from({ length: n }, () => ({ guardHeld: false }));

describe("off-hand attack presses", () => {
  it("desktop: a guard tap released before the hold threshold is one light attack, on release", () => {
    expect(run([...up(1), ...held(5), ...up(3)], true)).toEqual(["light@6"]);
  });

  it("desktop: a guard held to the threshold is one power attack, and its release adds nothing", () => {
    const frames = Math.ceil(DESKTOP_HEAVY_HOLD_SECONDS * 60) + 1;
    const presses = run([...up(1), ...held(frames + 10), ...up(2)], true);
    expect(presses).toHaveLength(1);
    expect(presses[0]).toMatch(/^heavy@/);
    const at = Number(presses[0].split("@")[1]);
    expect((at - 1) / 60).toBeGreaterThanOrEqual(DESKTOP_HEAVY_HOLD_SECONDS - 1e-9);
    expect((at - 2) / 60).toBeLessThan(DESKTOP_HEAVY_HOLD_SECONDS);
  });

  it("desktop: parry does not attack", () => {
    expect(run([{ parryHeld: true }, { parryHeld: false }], true)).toEqual([]);
  });

  it("pad and touch: guard press is the light attack, parry press the power attack, on the press", () => {
    expect(run([...up(1), ...held(30), ...up(1), { parryHeld: true }, { parryHeld: true }], false))
      .toEqual(["light@1", "heavy@32"]);
  });
});
