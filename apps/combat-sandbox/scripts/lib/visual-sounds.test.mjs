import { describe, expect, it } from "vitest";
import { evaluateSounds } from "./visual-sounds.mjs";

describe("evaluateSounds", () => {
  it("passes exact counts and ranges, and ignores types it does not name", () => {
    const telemetry = { soundEvents: { "combat.swing": 3, "movement.footstep": 4, "combat.draw": 1 } };
    const result = evaluateSounds("s", telemetry, { "combat.swing": 3, "movement.footstep": [2, 5] });
    expect(result.failures).toEqual([]);
    expect(result.measured).toEqual(telemetry.soundEvents);
  });

  it("fails a count off by one, a range missed and an event that never fired", () => {
    const telemetry = { soundEvents: { "combat.swing": 2, "movement.footstep": 9 } };
    const result = evaluateSounds("s", telemetry, { "combat.swing": 3, "movement.footstep": [2, 5], "combat.hit": 1 });
    expect(result.failures).toEqual([
      "s: combat.swing fired 2, expected 3",
      "s: movement.footstep fired 9, expected 2-5",
      "s: combat.hit fired 0, expected 1",
    ]);
  });

  it("fails a scene with no sound telemetry at all", () => {
    expect(evaluateSounds("s", {}, { "combat.swing": 1 }).failures).toEqual(["s: no soundEvents telemetry"]);
  });
});
