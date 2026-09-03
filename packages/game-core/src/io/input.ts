import type { Vec2 } from "../core/types";

export type InputAction =
  | "light"
  | "heavy"
  | "guard"
  | "parry"
  | "dodge"
  | "lockOn"
  | "heal"
  | "equip"
  | "jump"
  | "crouch"
  /**
   * Zoom the aimed bow view in and out.
   *
   * Deliberately the heavy and parry buttons rather than two new ones: neither
   * does anything while a bow is raised (a bow cannot parry, and an attack
   * press is the draw), so the inputs are already free and a player has no
   * fourth binding to learn — the same reasoning that put "lower the bow" on
   * guard.
   */
  | "zoomIn"
  | "zoomOut"
  | "targetLeft"
  | "targetRight";

// Gamepad API indices describe physical positions. These labels match the
// Nintendo-layout face caps on the GameSir X2s Type-C.
export const SWITCH_GAMEPAD = {
  B_BOTTOM_DODGE: 0,
  A_RIGHT_JUMP: 1,
  Y_LEFT_TWO_HAND: 2,
  X_TOP_ITEM: 3,
  L_GUARD: 4,
  R_LIGHT: 5,
  ZL_PARRY: 6,
  ZR_HEAVY: 7,
  // Menu buttons: read by the UI layer (io/uiMenus.ts), not by combat.
  SELECT_MENU: 8,
  START_MENU: 9,
  // L3 was a second jump binding, which the A face button already covers.
  L_STICK_CROUCH: 10,
  R_STICK_LOCK: 11,
  DPAD_RIGHT_EQUIP: 15,
} as const;

const DEAD_ZONE = 0.16;

// Matches the touch camera-drag zone's feel (see Hud.tsx's CameraZone): both
// paths funnel into the same addTouchCamera accumulator.
const MOUSE_LOOK_SENSITIVITY = 0.18;

function deadZone(value: number) {
  const sign = Math.sign(value);
  const magnitude = Math.abs(value);
  return magnitude <= DEAD_ZONE ? 0 : sign * (magnitude - DEAD_ZONE) / (1 - DEAD_ZONE);
}

export class InputController {
  movement: Vec2 = { x: 0, y: 0 };
  camera: Vec2 = { x: 0, y: 0 };
  gamepadName = "";

  private keys = new Set<string>();
  private mouse = new Set<number>();
  private virtual = new Set<InputAction>();
  private previous = new Map<InputAction, boolean>();
  private current = new Map<InputAction, boolean>();
  private touchMove: Vec2 = { x: 0, y: 0 };
  private touchCamera: Vec2 = { x: 0, y: 0 };
  /** Accumulated wheel/trackpad scroll since the last update, in notches. */
  private wheel = 0;
  private attached = false;
  /** Actions swallowed by a modal screen; see suppressHeld(). */
  private suppressed = new Set<InputAction>();

  attach() {
    if (this.attached) return () => undefined;
    this.attached = true;
    const down = (event: KeyboardEvent) => {
      this.keys.add(event.code);
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"].includes(event.code)) event.preventDefault();
    };
    const up = (event: KeyboardEvent) => this.keys.delete(event.code);
    const mouseDown = (event: MouseEvent) => this.mouse.add(event.button);
    const mouseUp = (event: MouseEvent) => this.mouse.delete(event.button);
    // Mouse-look only while the pointer is locked (click the canvas to engage),
    // so moving the mouse to reach UI/menus doesn't spin the camera.
    const mouseMove = (event: MouseEvent) => {
      if (!document.pointerLockElement) return;
      this.addTouchCamera({ x: event.movementX * MOUSE_LOOK_SENSITIVITY, y: event.movementY * MOUSE_LOOK_SENSITIVITY });
    };
    // Scroll is the desktop zoom. Normalised out of the browser's three
    // delta modes so a trackpad's pixel-sized flicks and a wheel's line-sized
    // notches mean roughly the same thing.
    const wheelMove = (event: WheelEvent) => {
      const scale = event.deltaMode === 1 ? 1 / 3 : event.deltaMode === 2 ? 1 : 1 / 100;
      this.wheel += -event.deltaY * scale;
    };
    const blur = () => {
      this.keys.clear();
      this.mouse.clear();
      this.virtual.clear();
      this.wheel = 0;
    };
    window.addEventListener("keydown", down, { passive: false });
    window.addEventListener("keyup", up);
    window.addEventListener("mousedown", mouseDown);
    window.addEventListener("mouseup", mouseUp);
    window.addEventListener("mousemove", mouseMove);
    window.addEventListener("wheel", wheelMove, { passive: true });
    window.addEventListener("blur", blur);
    return () => {
      this.attached = false;
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("mousedown", mouseDown);
      window.removeEventListener("mouseup", mouseUp);
      window.removeEventListener("mousemove", mouseMove);
      window.removeEventListener("wheel", wheelMove);
      window.removeEventListener("blur", blur);
    };
  }

  /**
   * Forget everything currently held.
   *
   * Called when a modal screen takes the input: a click that equipped an item
   * is a mouse-down the combat FSM would otherwise read as a light attack the
   * moment the screen closes.
   */
  clearHeld() {
    this.keys.clear();
    this.mouse.clear();
    this.virtual.clear();
    this.previous.clear();
    this.current.clear();
    this.touchMove = { x: 0, y: 0 };
    this.touchCamera = { x: 0, y: 0 };
    this.wheel = 0;
  }

  /**
   * Swallow everything currently held until it is physically released.
   *
   * Called every frame a modal screen is up. `clearHeld` is not enough for a
   * gamepad: the pad re-reports a held button every poll, so the B press that
   * closed the inventory produced a *release* edge one frame after the game
   * resumed — and dodge fires on release, so closing the menu backstepped.
   * A suppressed action reports neither held, pressed nor released until the
   * device has actually let go of it once.
   */
  suppressHeld() {
    for (const [action, held] of this.current) {
      if (!held) continue;
      this.suppressed.add(action);
      this.current.set(action, false);
    }
  }

  /** Scroll accumulated since the last call; positive is toward the player. */
  takeWheel() {
    const wheel = this.wheel;
    this.wheel = 0;
    return wheel;
  }

  setVirtual(action: InputAction, active: boolean) {
    if (active) this.virtual.add(action);
    else this.virtual.delete(action);
  }

  setTouchMovement(value: Vec2) {
    this.touchMove = value;
  }

  addTouchCamera(value: Vec2) {
    this.touchCamera.x += value.x;
    this.touchCamera.y += value.y;
  }

  update() {
    for (const action of this.current.keys()) this.previous.set(action, this.current.get(action) ?? false);

    const pads = typeof navigator !== "undefined" && navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = Array.from(pads).find((candidate): candidate is Gamepad => Boolean(candidate?.connected));
    this.gamepadName = pad?.id ?? "";

    const keyboardX = Number(this.keys.has("KeyD") || this.keys.has("ArrowRight")) - Number(this.keys.has("KeyA") || this.keys.has("ArrowLeft"));
    const keyboardY = Number(this.keys.has("KeyW") || this.keys.has("ArrowUp")) - Number(this.keys.has("KeyS") || this.keys.has("ArrowDown"));
    this.movement.x = Math.abs(this.touchMove.x) > Math.abs(keyboardX) ? this.touchMove.x : keyboardX;
    this.movement.y = Math.abs(this.touchMove.y) > Math.abs(keyboardY) ? this.touchMove.y : keyboardY;

    if (pad) {
      const x = deadZone(pad.axes[0] ?? 0);
      const y = -deadZone(pad.axes[1] ?? 0);
      if (Math.hypot(x, y) > Math.hypot(this.movement.x, this.movement.y)) {
        this.movement.x = x;
        this.movement.y = y;
      }
      this.camera.x = deadZone(pad.axes[2] ?? 0) + this.touchCamera.x;
      this.camera.y = deadZone(pad.axes[3] ?? 0) + this.touchCamera.y;
    } else {
      this.camera.x = this.touchCamera.x;
      this.camera.y = this.touchCamera.y;
    }
    this.touchCamera = { x: 0, y: 0 };

    const button = (index: number) => Boolean(pad?.buttons[index]?.pressed);
    const active = (action: InputAction) => this.virtual.has(action);

    this.current.set("light", active("light") || this.mouse.has(0) || button(SWITCH_GAMEPAD.R_LIGHT));
    this.current.set("heavy", active("heavy") || this.keys.has("KeyR") || button(SWITCH_GAMEPAD.ZR_HEAVY));
    this.current.set("guard", active("guard") || this.mouse.has(2) || button(SWITCH_GAMEPAD.L_GUARD));
    this.current.set("parry", active("parry") || this.keys.has("KeyF") || this.mouse.has(1) || button(SWITCH_GAMEPAD.ZL_PARRY));
    this.current.set("dodge", active("dodge") || this.keys.has("Space") || button(SWITCH_GAMEPAD.B_BOTTOM_DODGE));
    this.current.set("lockOn", active("lockOn") || this.keys.has("KeyQ") || button(SWITCH_GAMEPAD.R_STICK_LOCK));
    this.current.set("heal", active("heal") || this.keys.has("KeyH") || button(SWITCH_GAMEPAD.X_TOP_ITEM));
    this.current.set("equip", active("equip") || this.keys.has("Tab") || button(SWITCH_GAMEPAD.DPAD_RIGHT_EQUIP));
    this.current.set("jump", active("jump") || this.keys.has("KeyJ") || button(SWITCH_GAMEPAD.A_RIGHT_JUMP));
    this.current.set("zoomIn", active("zoomIn") || button(SWITCH_GAMEPAD.ZR_HEAVY));
    this.current.set("zoomOut", active("zoomOut") || button(SWITCH_GAMEPAD.ZL_PARRY));
    this.current.set("crouch", active("crouch") || this.keys.has("KeyC") || button(SWITCH_GAMEPAD.L_STICK_CROUCH));
    // When locked on, the right stick is free for target switching; the frame
    // ignores camera input in that mode. `pressed` turns a stick push into one edge.
    const rightStickX = pad ? deadZone(pad.axes[2] ?? 0) : 0;
    this.current.set("targetLeft", active("targetLeft") || this.keys.has("Comma") || rightStickX < -0.55);
    this.current.set("targetRight", active("targetRight") || this.keys.has("Period") || rightStickX > 0.55);

    // A suppressed action stays invisible until the device lets go of it once.
    for (const action of this.suppressed) {
      if (this.current.get(action)) this.current.set(action, false);
      else this.suppressed.delete(action);
    }
  }

  held(action: InputAction) {
    return this.current.get(action) ?? false;
  }

  pressed(action: InputAction) {
    return Boolean(this.current.get(action) && !this.previous.get(action));
  }

  released(action: InputAction) {
    return Boolean(!this.current.get(action) && this.previous.get(action));
  }
}

export const input = new InputController();

export function cameraRelativeDirection(movement: Vec2, cameraYaw: number) {
  const sin = Math.sin(cameraYaw);
  const cos = Math.cos(cameraYaw);
  return {
    x: movement.x * cos - movement.y * sin,
    y: 0,
    z: -movement.x * sin - movement.y * cos,
  };
}

export function resolveAttackDirection(
  movement: Vec2,
  cameraYaw: number,
  fallback: { x: number; z: number },
  deadZone = 0.0001,
) {
  const direction = Math.hypot(movement.x, movement.y) > deadZone
    ? cameraRelativeDirection(movement, cameraYaw)
    : { x: fallback.x, y: 0, z: fallback.z };
  const length = Math.hypot(direction.x, direction.z) || 1;
  return { x: direction.x / length, y: 0, z: direction.z / length };
}

// Single source of truth for the player's Ecctrl top speeds — CombatScene's
// <Ecctrl maxWalkVel/maxRunVel> must use these same constants, since Ecctrl's
// own cap runs before analogueMoveSpeed's clamp ever gets a chance to act.
export const PLAYER_WALK_SPEED = 4.5;
export const PLAYER_SPRINT_SPEED = 6.0;
// Locked-on movement is always walk-paced (sprint is disabled while locked on)
// but is tuned independently from free-roam walking, since strafing around a
// target reads better at a different pace than walking in a straight line.
export const PLAYER_LOCK_ON_WALK_SPEED = 3.0;

export function analogueMoveSpeed(
  magnitude: number,
  sprinting: boolean,
  /**
   * Crouched top speed, when crouching. Passed in rather than imported so this
   * stays the one place a *cap* is applied while `locomotion/stance` stays the
   * one place the crouched speed is decided.
   */
  crouchSpeed?: number,
) {
  const amount = Math.min(1, Math.max(0, magnitude));
  if (crouchSpeed !== undefined) return crouchSpeed * amount;
  return (sprinting ? PLAYER_SPRINT_SPEED : PLAYER_WALK_SPEED) * amount;
}
