import { describe, expect, it } from "vitest";
import {
  CAPABILITY_PROFILES,
  DEFAULT_CAPABILITY_PROFILE,
  resolveCapabilityProfile,
} from "./capabilityProfiles";
import {
  CHARACTER_CAPSULE_HALF_HEIGHT,
  CHARACTER_CAPSULE_RADIUS,
  JUMP_GRAVITY_SCALE,
  JUMP_VELOCITY,
  jumpApexHeight,
} from "./characterPhysics";
import { PLAYER_SPRINT_SPEED, PLAYER_WALK_SPEED } from "../io/input";

describe("capability profiles", () => {
  it("derives grounded values from the live movement tuning", () => {
    const baseline = CAPABILITY_PROFILES.baselineHuman!;
    expect(baseline.walkSpeed).toBe(PLAYER_WALK_SPEED);
    expect(baseline.sprintSpeed).toBe(PLAYER_SPRINT_SPEED);
    expect(baseline.jumpApexHeight).toBeCloseTo(
      jumpApexHeight(JUMP_VELOCITY, JUMP_GRAVITY_SCALE),
      10,
    );
    expect(baseline.capsuleHalfHeight).toBe(CHARACTER_CAPSULE_HALF_HEIGHT);
    expect(baseline.capsuleRadius).toBe(CHARACTER_CAPSULE_RADIUS);
  });

  it("keeps the profile physically sane", () => {
    for (const profile of Object.values(CAPABILITY_PROFILES)) {
      expect(profile.sprintSpeed).toBeGreaterThan(profile.walkSpeed);
      expect(profile.walkSpeed).toBeGreaterThan(0);
      // A jump the world design can rely on: at least a low ledge, and no
      // superhuman leap that would trivialise designed access barriers.
      expect(profile.jumpApexHeight).toBeGreaterThan(0.8);
      expect(profile.jumpApexHeight).toBeLessThan(2.5);
      expect(profile.maxWalkableSlopeDeg).toBeGreaterThan(30);
      expect(profile.maxWalkableSlopeDeg).toBeLessThan(80);
    }
  });

  it("resolves unknown ids to the default profile", () => {
    expect(resolveCapabilityProfile("nonsense").id).toBe(DEFAULT_CAPABILITY_PROFILE);
    expect(resolveCapabilityProfile(null).id).toBe(DEFAULT_CAPABILITY_PROFILE);
    expect(resolveCapabilityProfile("minimumPlayable").id).toBe("minimumPlayable");
  });
});
