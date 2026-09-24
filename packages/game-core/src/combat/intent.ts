import type { Vec2 } from "../core/types";
import { DESKTOP_HEAVY_HOLD_SECONDS, type InputController } from "../io/input";

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
   * cannot block. Filled by `offHandPresses`; false from `inputToIntent`.
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
    offLightPressed: false,
    offHeavyPressed: false,
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

/** Where the guard control's tap-or-hold gesture is, between frames. */
export type OffHandGesture = {
  /** Seconds the guard control has been held, or null while it is up. */
  heldFor: number | null;
  /** The hold already became a power attack; its release does nothing. */
  fired: boolean;
  guardWasHeld: boolean;
  parryWasHeld: boolean;
};

export const IDLE_OFF_HAND_GESTURE: OffHandGesture = {
  heldFor: null,
  fired: false,
  guardWasHeld: false,
  parryWasHeld: false,
};

export type OffHandInput = {
  guardHeld: boolean;
  parryHeld: boolean;
  /**
   * True on desktop: the guard control is one mouse button, so it becomes a
   * light attack when released before `DESKTOP_HEAVY_HOLD_SECONDS` and a power
   * attack when held to it, exactly as the primary button does for the main
   * hand. False on a pad or touch: the guard press is the light and the parry
   * press the power attack.
   */
  tapHold: boolean;
};

/**
 * Turn the guard (and, on a pad, parry) controls into off-hand attack presses.
 * Pure: the caller keeps the returned gesture for the next frame.
 */
export function offHandPresses(
  gesture: OffHandGesture,
  input: OffHandInput,
  dt: number,
): { gesture: OffHandGesture; offLightPressed: boolean; offHeavyPressed: boolean } {
  const guardRose = input.guardHeld && !gesture.guardWasHeld;
  const parryRose = input.parryHeld && !gesture.parryWasHeld;
  const edges = { guardWasHeld: input.guardHeld, parryWasHeld: input.parryHeld };
  if (!input.tapHold) {
    return {
      gesture: { heldFor: null, fired: false, ...edges },
      offLightPressed: guardRose,
      offHeavyPressed: parryRose,
    };
  }
  if (input.guardHeld) {
    const heldFor = guardRose || gesture.heldFor === null ? 0 : gesture.heldFor + dt;
    const fired = !guardRose && gesture.fired;
    const becomesHeavy = !fired && heldFor >= DESKTOP_HEAVY_HOLD_SECONDS;
    return {
      gesture: { heldFor, fired: fired || becomesHeavy, ...edges },
      offLightPressed: false,
      offHeavyPressed: becomesHeavy,
    };
  }
  // Released: a tap that never became a hold is the light attack.
  return {
    gesture: { heldFor: null, fired: false, ...edges },
    offLightPressed: gesture.heldFor !== null && !gesture.fired,
    offHeavyPressed: false,
  };
}
