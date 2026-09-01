import { describe, expect, it } from "vitest";
import { animationMixerDelta, createAnimationCommand, updateAnimationCommand } from "./animationCommand";

describe("mutable animation commands", () => {
  it("creates a command at the requested state and source time", () => {
    expect(createAnimationCommand("SWORD_IDLE", 0.25)).toEqual({
      state: "SWORD_IDLE",
      startAt: 0.25,
      crossFadeDuration: null,
      timeScale: 1,
      serial: 0,
    });
  });

  it("updates state, source time, and serial synchronously without replacing the command", () => {
    const command = createAnimationCommand("SWORD_IDLE");
    const identity = command;

    expect(updateAnimationCommand(command, "LIGHT_1", 0.03)).toBe(true);
    expect(command).toBe(identity);
    expect(command).toEqual({ state: "LIGHT_1", startAt: 0.03, crossFadeDuration: null, timeScale: 1, serial: 1 });
  });

  it("treats the same state as a no-op unless a restart is requested", () => {
    const command = createAnimationCommand("LIGHT_2", 0.1);

    expect(updateAnimationCommand(command, "LIGHT_2", 0.4)).toBe(false);
    expect(command).toEqual({ state: "LIGHT_2", startAt: 0.1, crossFadeDuration: null, timeScale: 1, serial: 0 });

    expect(updateAnimationCommand(command, "LIGHT_2", 0.4, true, 0.24)).toBe(true);
    expect(command).toEqual({ state: "LIGHT_2", startAt: 0.4, crossFadeDuration: 0.24, timeScale: 1, serial: 1 });
  });

  it("clears a transition override on the next ordinary command", () => {
    const command = createAnimationCommand("IDLE", 0, 0.2);
    updateAnimationCommand(command, "LIGHT_1", 0, false, 0.24);
    expect(command.crossFadeDuration).toBe(0.24);
    updateAnimationCommand(command, "SWORD_IDLE");
    expect(command.crossFadeDuration).toBeNull();
  });

  it("increments the serial for every applied transition or restart", () => {
    const command = createAnimationCommand("IDLE");

    updateAnimationCommand(command, "WALK");
    updateAnimationCommand(command, "WALK_BACK");
    updateAnimationCommand(command, "WALK_BACK", 0.2, true);

    expect(command.serial).toBe(3);
  });

  it("advances externally timed blend weights on combat time, including hit-stop", () => {
    expect(animationMixerDelta(0.2)).toBeCloseTo(1 / 30);
    expect(animationMixerDelta(1 / 30, 0.5, 0.502667)).toBeCloseTo(0.002667);
    expect(animationMixerDelta(1 / 30, 0.5, 0.5)).toBe(0);
    // A clock ownership transfer may hold or rewind a semantic action. Fades
    // must never run backwards in Three's mixer.
    expect(animationMixerDelta(1 / 30, 0.51, 0.5)).toBe(0);
  });
});
