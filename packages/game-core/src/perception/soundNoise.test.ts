import { describe, expect, it } from "vitest";
import type { SoundEvent } from "@elder-souls/audio";
import { noiseForSound } from "./soundNoise";

// Expected answers written before the code: the sound lane's handoff table
// (docs/phases/lanes/sound-prep-lane.md § Handoffs, 4).
const step = (gait: "walk" | "run" | "sprint" | "sneak"): SoundEvent =>
  ({ type: "movement.footstep", footwear: "light", gait, surface: "stone" });

describe("noiseForSound", () => {
  it("maps each gait's footstep to its noise", () => {
    const still = { rolling: false };
    expect(noiseForSound(step("walk"), still)).toBe("walk");
    expect(noiseForSound(step("sneak"), still)).toBe("walkSneaking");
    expect(noiseForSound(step("run"), still)).toBe("run");
    expect(noiseForSound(step("sprint"), still)).toBe("sprint");
  });

  it("hears a landing as a jump landing, and as a roll while rolling", () => {
    const land: SoundEvent = { type: "movement.land", footwear: "heavy", surface: "dirt" };
    expect(noiseForSound(land, { rolling: false })).toBe("jumpLanding");
    expect(noiseForSound(land, { rolling: true })).toBe("roll");
  });

  it("hears swings, blocks and parries", () => {
    const still = { rolling: false };
    expect(noiseForSound({ type: "combat.swing", weapon: "blade" }, still)).toBe("attackSwing");
    expect(noiseForSound({ type: "combat.block", guard: "shield-heavy" }, still)).toBe("blockHit");
    expect(noiseForSound({ type: "combat.parry", guard: "blade-1h" }, still)).toBe("blockHit");
  });

  it("hears nothing from events with no noise of their own", () => {
    const still = { rolling: false };
    expect(noiseForSound({ type: "combat.hit", weapon: "blade", target: "flesh" }, still)).toBeNull();
    expect(noiseForSound({ type: "combat.draw", weapon: "blade-1h" }, still)).toBeNull();
    expect(noiseForSound({ type: "movement.swim", stroke: "stroke" }, still)).toBeNull();
    expect(noiseForSound({ type: "bow.release" }, still)).toBeNull();
  });
});
