import type { Vec2 } from "../core/types";
import type { InputController } from "../io/input";

// A per-frame snapshot of player intent. The combat FSM reads this instead of
// polling the input device, so an AI, replay, or network source can drive the
// same actor.
export type PlayerIntent = {
  move: Vec2;
  camera: Vec2;
  lightPressed: boolean;
  lightHeld: boolean;
  heavyPressed: boolean;
  guardHeld: boolean;
  /**
   * Lower a raised bow.
   *
   * The guard button, deliberately: a bow cannot block, so the input is free
   * while aiming, and "the button that puts something between you and the world"
   * already means the right thing on a keyboard, a pad and a touch screen alike
   * without teaching the player a fourth binding.
   */
  aimExitPressed: boolean;
  parryPressed: boolean;
  /**
   * Dual wield (decision 0091): the off hand's light and power attacks. The
   * guard control attacks with a weapon in the off hand, since two blades
   * cannot block. The input controller makes the gesture (`offLight`,
   * `offHeavy` in io/input.ts); the intent only reads it.
   */
  offLightPressed: boolean;
  offHeavyPressed: boolean;
  dodgePressed: boolean;
  dodgeHeld: boolean;
  dodgeReleased: boolean;
  lockOnPressed: boolean;
  healPressed: boolean;
  equipPressed: boolean;
  jumpPressed: boolean;
  jumpHeld: boolean;
  /**
   * Rising edge of the crouch toggle. A toggle, not a hold: stealth is a mode
   * you stay in, and holding a button for minutes is unusable on touch.
   */
  crouchPressed: boolean;
  /** Held zoom, for the aimed bow view. Ignored when no bow is raised. */
  zoomInHeld: boolean;
  zoomOutHeld: boolean;
  /** Desktop scroll since the last frame; positive zooms in. */
  zoomWheel: number;
  targetLeftPressed: boolean;
  targetRightPressed: boolean;
};

export function inputToIntent(source: InputController): PlayerIntent {
  return {
    move: { x: source.movement.x, y: source.movement.y },
    camera: { x: source.camera.x, y: source.camera.y },
    lightPressed: source.pressed("light"),
    lightHeld: source.held("light"),
    heavyPressed: source.pressed("heavy"),
    guardHeld: source.held("guard"),
    aimExitPressed: source.pressed("guard"),
    parryPressed: source.pressed("parry"),
    offLightPressed: source.pressed("offLight"),
    offHeavyPressed: source.pressed("offHeavy"),
    dodgePressed: source.pressed("dodge"),
    dodgeHeld: source.held("dodge"),
    dodgeReleased: source.released("dodge"),
    lockOnPressed: source.pressed("lockOn"),
    healPressed: source.pressed("heal"),
    equipPressed: source.pressed("equip"),
    jumpPressed: source.pressed("jump"),
    jumpHeld: source.held("jump"),
    crouchPressed: source.pressed("crouch"),
    zoomInHeld: source.held("zoomIn"),
    zoomOutHeld: source.held("zoomOut"),
    zoomWheel: source.takeWheel(),
    targetLeftPressed: source.pressed("targetLeft"),
    targetRightPressed: source.pressed("targetRight"),
  };
}

/**
 * What a swimmer may still do (decision 0093): move, look, sprint and heal.
 * Attacks, guard, parry, the dodge itself, jump, crouch, lock-on and drawing a
 * weapon are refused, as vanilla's swim state forces the weapon away and
 * blocks combat. Sprint rides the dodge control's hold, so the press and hold
 * stay and only the release (which rolls or backsteps) goes.
 * Healing (a draught) in the water is allowed: the default, owner-overridable
 * (lane round 6).
 */
export function swimmingIntent(intent: PlayerIntent): PlayerIntent {
  return {
    ...intent,
    lightPressed: false,
    lightHeld: false,
    heavyPressed: false,
    guardHeld: false,
    parryPressed: false,
    offLightPressed: false,
    offHeavyPressed: false,
    dodgeReleased: false,
    lockOnPressed: false,
    equipPressed: false,
    jumpPressed: false,
    jumpHeld: false,
    crouchPressed: false,
    targetLeftPressed: false,
    targetRightPressed: false,
  };
}
