import { describe, expect, it } from "vitest";
import {
  CHARACTER_BODY_CENTER_HEIGHT,
  CHARACTER_CAPSULE_HALF_HEIGHT,
  CHARACTER_CAPSULE_RADIUS,
} from "@elder-souls/game-core/physics/characterPhysics";
import { SPAWN_CLEARANCE_M, spawnBodyY } from "./spawnHeight";

describe("spawnBodyY", () => {
  it("never puts any part of the capsule under the ground", () => {
    // The clearance, not the old sea-level clamp, is what keeps a spawn out
    // of the terrain: the clamp only ever raised a spawn on ground BELOW sea
    // level, and did nothing on the ground the province is mostly made of.
    const bottomOffset = CHARACTER_CAPSULE_HALF_HEIGHT + CHARACTER_CAPSULE_RADIUS;
    for (const groundM of [-8, -3.2, -0.58, 0, 12, 651]) {
      expect(spawnBodyY(groundM) - bottomOffset).toBeGreaterThan(groundM);
    }
  });

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
