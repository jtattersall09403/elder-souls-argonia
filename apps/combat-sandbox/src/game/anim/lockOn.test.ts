import { describe, expect, it } from "vitest";
import {
  MAX_WALK_LOOP_TIME_SCALE,
  WALK_LOOP_PLANTED_SPEED,
  dampLockOnOrientationWarp,
  lockOnLocomotionAnimation,
  lockOnOrientationWarp,
  lockOnSprintAllowed,
  lockOnYaws,
  walkLoopTimeScale,
} from "./lockOn";

describe("lock-on orientation", () => {
  it("faces the player toward the target and places the camera behind", () => {
    const player = { x: 2, z: 3 };
    const target = { x: -1, z: -2 };
    const { playerFacingYaw, cameraYaw } = lockOnYaws(player, target);
    const toTarget = { x: target.x - player.x, z: target.z - player.z };
    const playerForward = { x: Math.sin(playerFacingYaw), z: Math.cos(playerFacingYaw) };
    const cameraOffset = { x: Math.sin(cameraYaw), z: Math.cos(cameraYaw) };
    expect(playerForward.x * toTarget.x + playerForward.z * toTarget.z).toBeGreaterThan(0);
    expect(cameraOffset.x * toTarget.x + cameraOffset.z * toTarget.z).toBeLessThan(0);
  });
});

describe("lock-on locomotion", () => {
  it("selects backward and mirrored lateral gait states from the current stick", () => {
    expect(lockOnLocomotionAnimation({ x: 0, y: -1 }, 1)).toBe("WALK_BACK");
    expect(lockOnLocomotionAnimation({ x: -1, y: 0 }, 1)).toBe("STRAFE_LEFT");
    expect(lockOnLocomotionAnimation({ x: 1, y: 0 }, 1)).toBe("STRAFE_RIGHT");
  });

  it("keeps forward walk/run selection and ignores the dead zone", () => {
    expect(lockOnLocomotionAnimation({ x: 0, y: 0.04 }, 0.04)).toBeNull();
    expect(lockOnLocomotionAnimation({ x: 0, y: 0.5 }, 0.5)).toBe("WALK");
    expect(lockOnLocomotionAnimation({ x: 0, y: 1 }, 1)).toBe("WALK");
  });

  it("warps the gait continuously and reverses it through the rear hemisphere", () => {
    expect(lockOnOrientationWarp({ x: -1, y: 0 })).toEqual({ warp: Math.PI / 2, reversing: false });
    expect(lockOnOrientationWarp({ x: 1, y: 0 })).toEqual({ warp: -Math.PI / 2, reversing: false });
    expect(lockOnOrientationWarp({ x: 0, y: -1 }).warp).toBeCloseTo(0);
    expect(lockOnOrientationWarp({ x: 1, y: -1 })).toEqual({ warp: Math.PI / 4, reversing: true });
    expect(lockOnLocomotionAnimation({ x: 1, y: -1 }, 1)).toBe("WALK_BACK");
  });

  it("uses hysteresis so side-stick noise cannot flip gait direction", () => {
    const before = lockOnOrientationWarp({ x: 1, y: 0.01 }, false);
    const after = lockOnOrientationWarp({ x: 1, y: -0.01 }, before.reversing);
    expect(before.reversing).toBe(false);
    expect(after.reversing).toBe(false);
    expect(Math.abs(after.warp - before.warp)).toBeLessThan(0.03);

    const rear = lockOnOrientationWarp({ x: 1, y: -0.5 }, false);
    const nearSide = lockOnOrientationWarp({ x: 1, y: 0.05 }, rear.reversing);
    const forwardSide = lockOnOrientationWarp({ x: 1, y: 0.3 }, nearSide.reversing);
    expect(rear.reversing).toBe(true);
    expect(nearSide.reversing).toBe(true);
    expect(forwardSide.reversing).toBe(false);
  });

  it("keeps lock-on movement in the directional walk set even when sprint is held", () => {
    expect(lockOnSprintAllowed(true)).toBe(false);
    expect(lockOnLocomotionAnimation({ x: 0, y: -1 }, 1)).toBe("WALK_BACK");
  });

  it("damps residual orientation warp when another action interrupts a strafe", () => {
    const interrupted = dampLockOnOrientationWarp(Math.PI / 2, 0, 1 / 30);
    expect(interrupted).toBeGreaterThan(0);
    expect(interrupted).toBeLessThan(Math.PI / 2);
    expect(dampLockOnOrientationWarp(interrupted, 0, 0.5)).toBeLessThan(0.01);
  });

  it("matches walk-loop playback to Ecctrl's relative planar speed", () => {
    expect(walkLoopTimeScale("WALK", WALK_LOOP_PLANTED_SPEED)).toBeCloseTo(1);
    expect(walkLoopTimeScale("WALK_BACK", WALK_LOOP_PLANTED_SPEED)).toBeCloseTo(-1);
    expect(walkLoopTimeScale("STRAFE_LEFT", WALK_LOOP_PLANTED_SPEED)).toBeCloseTo(1);
    expect(walkLoopTimeScale("STRAFE_RIGHT", WALK_LOOP_PLANTED_SPEED)).toBeCloseTo(1);
    expect(walkLoopTimeScale("WALK_BACK", 3.6)).toBeCloseTo(-(3.6 / WALK_LOOP_PLANTED_SPEED));
  });

  it("stops at zero and clamps implausible gait playback rates", () => {
    expect(walkLoopTimeScale("WALK", 0)).toBe(0);
    expect(walkLoopTimeScale("WALK_BACK", -1)).toBe(-0);
    expect(walkLoopTimeScale("WALK", Number.NaN)).toBe(0);
    expect(walkLoopTimeScale("WALK", 100)).toBe(MAX_WALK_LOOP_TIME_SCALE);
    expect(walkLoopTimeScale("WALK_BACK", 100)).toBe(-MAX_WALK_LOOP_TIME_SCALE);
  });
});
