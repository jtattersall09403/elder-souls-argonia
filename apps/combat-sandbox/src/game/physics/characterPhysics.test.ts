import { describe, expect, it } from "vitest";
import { CHARACTER_TARGET_HEIGHT } from "../anim/animationManifest";
import {
  BASE_JUMP_VELOCITY,
  CHARACTER_BODY_CENTER_HEIGHT,
  CHARACTER_CAPSULE_HALF_HEIGHT,
  CHARACTER_CAPSULE_RADIUS,
  CHARACTER_COMBAT_HURTBOX_RADIUS,
  CHARACTER_DAMPING_C,
  CHARACTER_FLOAT_HEIGHT,
  CHARACTER_MODEL_OFFSET,
  CHARACTER_RAY_HIT_FORGIVENESS,
  CHARACTER_RAY_RADIUS,
  CHARACTER_SPRING_K,
  FALLING_GRAVITY_SCALE,
  JUMP_IMPULSE_DURATION,
  JUMP_LAND_DURATION,
  JUMP_LAUNCH_ANIMATION_DURATION,
  JUMP_GRAVITY_SCALE,
  JUMP_START_DURATION,
  JUMP_VELOCITY,
  combatHurtboxCenterOffset,
  combatHurtboxHalfHeight,
  jumpApexHeight,
  jumpApexTime,
} from "./characterPhysics";

describe("shared character grounding and jump arc", () => {
  it("places the model reference plane on support at suspension equilibrium", () => {
    expect(CHARACTER_BODY_CENTER_HEIGHT + CHARACTER_MODEL_OFFSET).toBeCloseTo(0, 8);
  });

  it("covers the full rendered actor with a combat volume independent of navigation", () => {
    const targetHeight = CHARACTER_TARGET_HEIGHT;
    const halfHeight = combatHurtboxHalfHeight(targetHeight);
    const centerOffset = combatHurtboxCenterOffset(targetHeight);
    expect(halfHeight * 2 + CHARACTER_COMBAT_HURTBOX_RADIUS * 2).toBeCloseTo(targetHeight, 8);
    expect(CHARACTER_BODY_CENTER_HEIGHT + centerOffset).toBeCloseTo(targetHeight / 2, 8);
    expect(CHARACTER_COMBAT_HURTBOX_RADIUS).toBeGreaterThan(CHARACTER_CAPSULE_RADIUS);
  });

  it("keeps jump height while reaching the apex sooner", () => {
    const oldHeight = jumpApexHeight(BASE_JUMP_VELOCITY, 1);
    const newHeight = jumpApexHeight(JUMP_VELOCITY, JUMP_GRAVITY_SCALE);
    expect(newHeight).toBeCloseTo(oldHeight, 8);
    expect(jumpApexTime(JUMP_VELOCITY, JUMP_GRAVITY_SCALE)).toBeLessThan(jumpApexTime(BASE_JUMP_VELOCITY, 1));
    expect(FALLING_GRAVITY_SCALE).toBeGreaterThan(JUMP_GRAVITY_SCALE);
  });

  it("uses a near-critical suspension instead of an underdamped landing bounce", () => {
    const capsuleVolume = Math.PI * CHARACTER_CAPSULE_RADIUS ** 2 * (CHARACTER_CAPSULE_HALF_HEIGHT * 2)
      + 4 / 3 * Math.PI * CHARACTER_CAPSULE_RADIUS ** 3;
    const criticalDamping = 2 * Math.sqrt(CHARACTER_SPRING_K * capsuleVolume);
    expect(CHARACTER_DAMPING_C).toBeGreaterThanOrEqual(criticalDamping);
    expect(CHARACTER_DAMPING_C).toBeLessThan(criticalDamping * 1.05);
  });

  it("limits Ecctrl's shape-cast grounded lead to 1.5 centimetres", () => {
    // On a flat support, shape-cast TOI is bodyY - halfHeight - rayRadius.
    // Ecctrl reports grounded below rayRadius + floatHeight + forgiveness,
    // so the model reference plane is exactly `forgiveness` above support then.
    const groundedThresholdBodyY = CHARACTER_CAPSULE_HALF_HEIGHT
      + CHARACTER_RAY_RADIUS * 2
      + CHARACTER_FLOAT_HEIGHT
      + CHARACTER_RAY_HIT_FORGIVENESS;
    expect(groundedThresholdBodyY + CHARACTER_MODEL_OFFSET).toBeCloseTo(CHARACTER_RAY_HIT_FORGIVENESS, 8);
  });

  it("keeps physics timing separate from the readable launch pose window", () => {
    expect(JUMP_START_DURATION).toBeCloseTo(jumpApexTime(JUMP_VELOCITY, JUMP_GRAVITY_SCALE), 8);
    expect(JUMP_LAUNCH_ANIMATION_DURATION).toBeGreaterThan(JUMP_START_DURATION);
    expect(JUMP_LAUNCH_ANIMATION_DURATION).toBeLessThan(0.6);
    expect(JUMP_LAND_DURATION).toBeGreaterThan(0.28);
    expect(JUMP_LAND_DURATION).toBeLessThan(0.5);
    expect(JUMP_IMPULSE_DURATION).toBeCloseTo(1 / 60, 8);
  });
});
