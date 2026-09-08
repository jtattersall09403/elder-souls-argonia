import { describe, expect, it } from "vitest";
import { analogueMoveSpeed, cameraRelativeDirection, DESKTOP_HEAVY_HOLD_SECONDS, InputController, PLAYER_SPRINT_SPEED, PLAYER_WALK_SPEED, resolveAttackDirection, SWITCH_GAMEPAD } from "./input";

describe("movement translation", () => {
  it("maps stick forward away from a camera behind the player", () => {
    expect(cameraRelativeDirection({ x: 0, y: 1 }, 0)).toEqual({ x: 0, y: 0, z: -1 });
    expect(cameraRelativeDirection({ x: 0, y: -1 }, 0)).toEqual({ x: 0, y: 0, z: 1 });
  });

  it("preserves left and right at the default camera yaw", () => {
    expect(cameraRelativeDirection({ x: 1, y: 0 }, 0)).toEqual({ x: 1, y: 0, z: -0 });
  });

  it("scales movement speed with analogue magnitude", () => {
    expect(analogueMoveSpeed(0.25, false)).toBeCloseTo(PLAYER_WALK_SPEED * 0.25);
    expect(analogueMoveSpeed(0.5, false)).toBeCloseTo(PLAYER_WALK_SPEED * 0.5);
    expect(analogueMoveSpeed(1, false)).toBeCloseTo(PLAYER_WALK_SPEED);
    expect(analogueMoveSpeed(1, true)).toBeCloseTo(PLAYER_SPRINT_SPEED);
  });

  it("resolves a queued attack from the current stick instead of the prior roll", () => {
    const rollDirection = { x: 0, z: -1 };
    expect(resolveAttackDirection({ x: 1, y: 0 }, 0, rollDirection)).toEqual({ x: 1, y: 0, z: -0 });
    expect(resolveAttackDirection({ x: 0, y: -1 }, 0, rollDirection)).toEqual({ x: 0, y: 0, z: 1 });
    expect(resolveAttackDirection({ x: 0, y: 0 }, 0, rollDirection)).toEqual({ x: 0, y: 0, z: -1 });
  });

  it("honours small movement that has already passed the controller dead zone", () => {
    const direction = resolveAttackDirection({ x: 0.1, y: 0 }, Math.PI / 2, { x: 1, z: 0 });
    expect(direction.x).toBeCloseTo(0);
    expect(direction.z).toBeCloseTo(-1);
  });
});

describe("modal suppression", () => {
  // The regression: dodge fires on *release*, so the B press that closed the
  // inventory produced a backstep one frame after the game resumed.
  it("swallows the release edge of a button pressed behind a modal", () => {
    const controller = new InputController();
    controller.setVirtual("dodge", true);
    controller.update();
    controller.suppressHeld(); // modal frame: press happened behind the screen
    expect(controller.held("dodge")).toBe(false);
    controller.update(); // game resumed, button still physically down
    expect(controller.held("dodge")).toBe(false);
    expect(controller.pressed("dodge")).toBe(false);
    controller.setVirtual("dodge", false);
    controller.update(); // physical release
    expect(controller.released("dodge")).toBe(false);
    controller.setVirtual("dodge", true);
    controller.update(); // a fresh press works again
    expect(controller.pressed("dodge")).toBe(true);
  });
});

describe("desktop melee mouse gestures", () => {
  it("releases a short primary click as one light attack", () => {
    const controller = new InputController();
    controller.setDesktopMeleeInput(true);
    controller.setDesktopMouseButton(0, true, 1000);
    controller.update(1100);
    expect(controller.held("light")).toBe(false);
    controller.setDesktopMouseButton(0, false, 1150);
    controller.update(1150);
    expect(controller.pressed("light")).toBe(true);
    controller.update(1166);
    expect(controller.held("light")).toBe(false);
  });

  it("triggers heavy at 0.3 seconds while primary is still held", () => {
    const controller = new InputController();
    controller.setDesktopMeleeInput(true);
    controller.setDesktopMouseButton(0, true, 1000);
    controller.update(1000 + DESKTOP_HEAVY_HOLD_SECONDS * 1000);
    expect(controller.pressed("heavy")).toBe(true);
    expect(controller.held("light")).toBe(false);
    controller.setDesktopMouseButton(0, false, 1400);
    controller.update(1400);
    expect(controller.pressed("light")).toBe(false);
  });

  it("turns right-held then primary into parry without a delayed light", () => {
    const controller = new InputController();
    controller.setDesktopMeleeInput(true);
    controller.setDesktopMouseButton(2, true, 1000);
    controller.update(1000);
    expect(controller.held("guard")).toBe(true);
    controller.setDesktopMouseButton(0, true, 1010);
    controller.update(1010);
    expect(controller.pressed("parry")).toBe(true);
    expect(controller.held("light")).toBe(false);
    controller.setDesktopMouseButton(0, false, 1050);
    controller.update(1050);
    expect(controller.pressed("light")).toBe(false);
  });

  it("keeps direct primary press and hold for bows", () => {
    const controller = new InputController();
    controller.setDesktopMeleeInput(false);
    controller.setDesktopMouseButton(0, true, 1000);
    controller.update(1000);
    expect(controller.pressed("light")).toBe(true);
    controller.update(1400);
    expect(controller.held("light")).toBe(true);
    expect(controller.held("heavy")).toBe(false);
  });
});

describe("GameSir controls", () => {
  it("maps jump to the Nintendo-layout A face button", () => {
    expect(SWITCH_GAMEPAD.A_RIGHT_JUMP).toBe(1);
  });

  // L3 used to be a second jump binding, which A already covers. Crouch has no
  // face button left and is a stance rather than an action, so the stick click
  // is the right home for it.
  it("maps crouch to the left stick click", () => {
    expect(SWITCH_GAMEPAD.L_STICK_CROUCH).toBe(10);
  });
});
