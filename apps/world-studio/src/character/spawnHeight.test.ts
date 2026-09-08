import { describe, expect, it } from "vitest";
import { CHARACTER_BODY_CENTER_HEIGHT } from "@elder-souls/game-core/physics/characterPhysics";
import { SPAWN_CLEARANCE_M, spawnBodyY } from "./spawnHeight";

describe("spawnBodyY", () => {
  it("stands on ground below sea level rather than at the waterline", () => {
    // Wet sand on the beach the owner reported (?view=character&x=6.10&z=1.64).
    const groundM = -3.2;
    expect(spawnBodyY(groundM)).toBeCloseTo(
      groundM + CHARACTER_BODY_CENTER_HEIGHT + SPAWN_CLEARANCE_M, 6);
    expect(spawnBodyY(groundM)).toBeLessThan(
      CHARACTER_BODY_CENTER_HEIGHT + SPAWN_CLEARANCE_M);
  });

  it("stands on ground above sea level unchanged", () => {
    expect(spawnBodyY(120)).toBeCloseTo(
      120 + CHARACTER_BODY_CENTER_HEIGHT + SPAWN_CLEARANCE_M, 6);
  });
});
