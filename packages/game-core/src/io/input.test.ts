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

  it("leaves the former middle-mouse parry binding free", () => {
    const controller = new InputController();
    controller.setDesktopMeleeInput(true);
    controller.setDesktopMouseButton(1, true, 1000);
    controller.update(1000);
    expect(controller.held("parry")).toBe(false);
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

/**
 * The off hand's attacks (dual wield, decision 0091). Expected before the
 * code: desktop taps and holds the guard button as the primary is tapped and
 * held; a pad (and touch, through virtual guard and parry) presses guard for
 * the light and parry for the power attack; guard stays held throughout.
 */
describe("off-hand attack gestures", () => {
  function padWith(pressed: readonly number[]) {
    const buttons = Array.from({ length: 16 }, (_, index) => ({ pressed: pressed.includes(index) }));
    return { connected: true, id: "test pad", axes: [0, 0, 0, 0], buttons } as unknown as Gamepad;
  }
  function withPad<T>(pad: Gamepad | null, run: () => T): T {
    const original = Object.getOwnPropertyDescriptor(globalThis, "navigator");
    Object.defineProperty(globalThis, "navigator", { value: { getGamepads: () => [pad] }, configurable: true });
    try { return run(); } finally {
      if (original) Object.defineProperty(globalThis, "navigator", original);
      else delete (globalThis as { navigator?: unknown }).navigator;
    }
  }

  it("desktop: a guard tap released before the hold threshold is one offLight, on release", () => {
    const controller = new InputController();
    controller.setDesktopMeleeInput(true);
    controller.setDesktopMouseButton(2, true, 1000);
    controller.update(1100);
    expect(controller.held("guard")).toBe(true);
    expect(controller.held("offLight")).toBe(false);
    expect(controller.held("offHeavy")).toBe(false);
    controller.setDesktopMouseButton(2, false, 1150);
    controller.update(1150);
    expect(controller.pressed("offLight")).toBe(true);
    expect(controller.held("offHeavy")).toBe(false);
    controller.update(1166);
    expect(controller.held("offLight")).toBe(false);
  });

  it("desktop: a guard held to the threshold is offHeavy while held, and its release adds no offLight", () => {
    const controller = new InputController();
    controller.setDesktopMeleeInput(true);
    controller.setDesktopMouseButton(2, true, 1000);
    controller.update(1000 + DESKTOP_HEAVY_HOLD_SECONDS * 1000 - 1);
    expect(controller.held("offHeavy")).toBe(false);
    controller.update(1000 + DESKTOP_HEAVY_HOLD_SECONDS * 1000);
    expect(controller.pressed("offHeavy")).toBe(true);
    expect(controller.held("guard")).toBe(true);
    controller.update(1500);
    expect(controller.pressed("offHeavy")).toBe(false);
    controller.setDesktopMouseButton(2, false, 1600);
    controller.update(1600);
    expect(controller.pressed("offLight")).toBe(false);
    expect(controller.released("offHeavy")).toBe(true);
  });

  it("desktop: the guard-then-primary parry chord fires no off-hand attack", () => {
    const controller = new InputController();
    controller.setDesktopMeleeInput(true);
    controller.setDesktopMouseButton(2, true, 1000);
    controller.update(1000);
    controller.setDesktopMouseButton(0, true, 1050);
    controller.update(1050);
    expect(controller.pressed("parry")).toBe(true);
    controller.setDesktopMouseButton(0, false, 1100);
    controller.setDesktopMouseButton(2, false, 1120);
    controller.update(1500);
    expect(controller.pressed("offLight")).toBe(false);
    expect(controller.held("offHeavy")).toBe(false);
  });

  it("pad: guard press is offLight and parry press offHeavy, on the press, with guard still held", () => {
    const controller = new InputController();
    withPad(padWith([SWITCH_GAMEPAD.L_GUARD]), () => controller.update(1000));
    expect(controller.pressed("offLight")).toBe(true);
    expect(controller.held("guard")).toBe(true);
    expect(controller.held("offHeavy")).toBe(false);
    withPad(padWith([SWITCH_GAMEPAD.L_GUARD]), () => controller.update(1600));
    expect(controller.pressed("offLight")).toBe(false);
    expect(controller.held("offHeavy")).toBe(false);
    withPad(padWith([SWITCH_GAMEPAD.ZL_PARRY]), () => controller.update(1700));
    expect(controller.pressed("offHeavy")).toBe(true);
    expect(controller.pressed("offLight")).toBe(false);
  });

  it("touch: the virtual guard and parry buttons take the pad's rule", () => {
    const controller = new InputController();
    controller.setDesktopMeleeInput(true);
    controller.setVirtual("guard", true);
    controller.update(1000);
    expect(controller.pressed("offLight")).toBe(true);
    controller.update(1600);
    expect(controller.held("offHeavy")).toBe(false);
    controller.setVirtual("guard", false);
    controller.setVirtual("parry", true);
    controller.update(1700);
    expect(controller.pressed("offHeavy")).toBe(true);
  });

  it("the actions themselves can be scripted by name", () => {
    const controller = new InputController();
    controller.setVirtual("offHeavy", true);
    controller.update(1000);
    expect(controller.pressed("offHeavy")).toBe(true);
    expect(controller.held("guard")).toBe(false);
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
