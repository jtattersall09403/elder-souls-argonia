import {
  NEUTRAL_RANGED_MODIFIERS,
  launchSpeed,
  type ArrowPhysics,
  type RangedModifiers,
} from "./ballistics";
import { clipPlaybackDuration } from "../anim/animationManifest";
import type { AnimationState } from "../core/types";
import type { BowAnimationProfile, RangedStats } from "../equipment/types";

/**
 * The shooting cycle: raise, nock, draw, hold, loose.
 *
 * A pure reducer over an immutable state, deliberately free of the renderer,
 * the camera and the input device — the same function drives the player, an
 * archer NPC, a replay and a test. What it does *not* own is anything visual:
 * where the camera goes and which clip plays are the caller's business.
 *
 * The physics of the shot itself lives in `ballistics.ts`; this file only
 * decides when a shot happens and how far the string was pulled.
 */

export type BowPhase =
  /** Bow in hand, not aiming. Third person. */
  | "lowered"
  /** Raising into the aim; the camera is moving. */
  | "raising"
  /** Aiming, arrow on the string, string at rest. */
  | "ready"
  /** Pulling. `drawFraction` is rising and stamina is draining. */
  | "drawing"
  /** The follow-through after a loose, before another arrow can be nocked. */
  | "loosed"
  /** Fitting the next arrow to the string. */
  | "nocking";

export type BowCycle = {
  phase: BowPhase;
  /** Seconds spent in the current phase. */
  phaseTime: number;
  /** 0-1 of full draw. Zero in every phase but `drawing`. */
  drawFraction: number;
  /**
   * True once the button that opened the aim has been released.
   *
   * The same button raises the bow and pulls the string, so without this the
   * press that enters the aim runs straight on into a draw the player did not
   * ask for.
   */
  drawArmed: boolean;
};

export const IDLE_BOW_CYCLE: BowCycle = {
  phase: "lowered",
  phaseTime: 0,
  drawFraction: 0,
  drawArmed: false,
};

export type BowInput = {
  /** The aim button went down this frame. */
  aimPressed: boolean;
  /** The aim button is down. */
  aimHeld: boolean;
  /** Lower the bow. */
  exitPressed: boolean;
  /**
   * Something took the actor out of the aim that is not an input: death, a
   * stagger, the bow leaving the hand.
   *
   * It is here rather than in the caller because the cycle is not part of the
   * melee action machine, so a caller that merely stops *asking* for the aim
   * leaves it raised. A killing blow landing mid-draw used to do exactly that:
   * the death action was set and the aim, still running, overwrote it on the
   * next frame — the archer kept moving and shooting and could not die.
   */
  interrupted?: boolean;
};

/** Seconds the camera takes to travel between third and first person. */
export const AIM_RAISE_SECONDS = 0.3;

export type BowStep = {
  cycle: BowCycle;
  /** Stamina to charge the actor this frame. */
  staminaSpent: number;
  /** Set on the frame the string is released with a usable draw. */
  shot: { drawFraction: number } | null;
  /** Set on the frame the aim opens or closes, for the caller to react once. */
  entered: boolean;
  exited: boolean;
};

/**
 * Advance one frame of the cycle.
 *
 * `stamina` is read, never written: this returns what to charge and lets the
 * actor's own pools stay the single place stamina is spent.
 */
export function advanceBowCycle(
  cycle: BowCycle,
  input: BowInput,
  ranged: RangedStats,
  stamina: number,
  deltaSeconds: number,
  modifiers: RangedModifiers = NEUTRAL_RANGED_MODIFIERS,
): BowStep {
  const dt = Math.max(0, deltaSeconds);
  const step: BowStep = { cycle, staminaSpent: 0, shot: null, entered: false, exited: false };
  const phaseTime = cycle.phaseTime + dt;

  const lower = (): BowStep => ({
    ...step,
    cycle: { ...IDLE_BOW_CYCLE },
    exited: cycle.phase !== "lowered",
  });

  if (cycle.phase !== "lowered" && (input.exitPressed || input.interrupted)) return lower();
  // Nothing raises a bow that has just been interrupted, either.
  if (input.interrupted) return { ...step, cycle: { ...IDLE_BOW_CYCLE } };

  switch (cycle.phase) {
    case "lowered": {
      if (!input.aimPressed) return { ...step, cycle: { ...cycle, phaseTime } };
      return {
        ...step,
        entered: true,
        cycle: { phase: "raising", phaseTime: 0, drawFraction: 0, drawArmed: false },
      };
    }

    case "raising": {
      if (phaseTime < AIM_RAISE_SECONDS) {
        return { ...step, cycle: { ...cycle, phaseTime } };
      }
      return { ...step, cycle: { phase: "nocking", phaseTime: 0, drawFraction: 0, drawArmed: false } };
    }

    case "nocking": {
      if (phaseTime < ranged.nockSeconds) {
        return { ...step, cycle: { ...cycle, phaseTime, drawArmed: armed(cycle, input) } };
      }
      return {
        ...step,
        cycle: { phase: "ready", phaseTime: 0, drawFraction: 0, drawArmed: armed(cycle, input) },
      };
    }

    case "ready": {
      const drawArmed = armed(cycle, input);
      if (drawArmed && input.aimHeld) {
        return { ...step, cycle: { phase: "drawing", phaseTime: 0, drawFraction: 0, drawArmed } };
      }
      return { ...step, cycle: { ...cycle, phaseTime, drawArmed } };
    }

    case "drawing": {
      const cost = ranged.drawStaminaPerSecond * modifiers.drawStaminaCost * dt;
      const affordable = stamina > 0;
      const spent = affordable ? Math.min(cost, stamina) : 0;
      // A cap below 1 is an archer who cannot pull the bow all the way: the
      // shot is simply weaker, which is what happens to a real one.
      const ceiling = clamp01(modifiers.drawStrength);
      const rate = 1 / Math.max(ranged.drawSeconds, 1e-3) * modifiers.drawSpeed;
      const drawFraction = affordable
        ? Math.min(ceiling, cycle.drawFraction + rate * dt)
        // Out of stamina, the arm gives out and the string creeps home.
        : Math.max(0, cycle.drawFraction - rate * DRAW_COLLAPSE_RATE * dt);

      if (input.aimHeld && drawFraction > 0) {
        return { ...step, staminaSpent: spent, cycle: { ...cycle, phaseTime, drawFraction } };
      }

      // Released, or the draw collapsed. Either way the string is going home;
      // only a draw past the bow's minimum sends an arrow with it.
      if (drawFraction >= ranged.minimumReleaseFraction) {
        return {
          ...step,
          staminaSpent: spent,
          shot: { drawFraction },
          cycle: { phase: "loosed", phaseTime: 0, drawFraction: 0, drawArmed: false },
        };
      }
      return {
        ...step,
        staminaSpent: spent,
        cycle: { phase: "ready", phaseTime: 0, drawFraction: 0, drawArmed: false },
      };
    }

    case "loosed": {
      if (phaseTime < ranged.releaseRecoverySeconds) {
        return { ...step, cycle: { ...cycle, phaseTime, drawArmed: armed(cycle, input) } };
      }
      return {
        ...step,
        cycle: { phase: "nocking", phaseTime: 0, drawFraction: 0, drawArmed: armed(cycle, input) },
      };
    }
  }
}

/** How fast an exhausted draw slips, as a multiple of the draw rate. */
const DRAW_COLLAPSE_RATE = 1.6;

function armed(cycle: BowCycle, input: BowInput) {
  return cycle.drawArmed || !input.aimHeld;
}

/** True while the aim is open, whatever the string is doing. */
export function isAiming(cycle: BowCycle) {
  return cycle.phase !== "lowered";
}

/** 0-1 of the way into the first-person view, for the camera to blend on. */
export function aimBlend(cycle: BowCycle) {
  if (cycle.phase === "lowered") return 0;
  if (cycle.phase === "raising") return clamp01(cycle.phaseTime / AIM_RAISE_SECONDS);
  return 1;
}

/**
 * Which clip the archer should be showing, and where in it.
 *
 * The draw is the interesting one: its clip time is driven by how far the
 * string actually is, not by a playback rate, so the pose is the state rather
 * than an animation running alongside it. A draw that stalls for stamina stalls
 * on screen, and one that slips home slips home on screen.
 */
export function bowPose(
  cycle: BowCycle,
  bow: BowAnimationProfile,
  /** Which way the archer is walking, if at all. */
  travel: BowTravel = STANDING,
): {
  animation: AnimationState;
  /** Clip seconds to hold, or null to let the clip run on its own clock. */
  clipTime: number | null;
} {
  // Moving with the bow *up* plays the drawn-bow stride (Skyrim's `bowdrawn_*`
  // set): the bow stays raised and the feet are real. It used to fall back to
  // the bow-*carry* stride, which drops the bow to the side, so every step
  // taken while aiming crossfaded the aim away and back — the flicker the
  // owner reported. Vanilla authors no drawn run, so a run at the aim walks.
  //
  // Standing at draw still holds the draw pose, because there its clip time is
  // the draw fraction and the pose *is* the state. Moving at draw, the string
  // is read off the rigged bow itself (which is scrubbed by the same fraction),
  // so nothing about the draw is lost by giving the legs the clip.
  if (travel !== "still") {
    return { animation: bowLocomotionClip(bow, travel, isAiming(cycle)), clipTime: null };
  }
  switch (cycle.phase) {
    case "drawing":
      return cycle.drawFraction >= 1
        ? { animation: bow.drawn, clipTime: null }
        : { animation: bow.draw, clipTime: cycle.drawFraction * drawClipSeconds(bow) };
    case "loosed":
      return { animation: bow.release, clipTime: null };
    default:
      return { animation: bow.idle, clipTime: null };
  }
}

/**
 * The stride an archer walks on, drawn or carrying.
 *
 * One place, so the player's aim, an NPC's reposition and any future actor all
 * pick the same clip for the same situation. Vanilla authors no drawn run, so
 * a raised bow that runs walks instead — which is also the behaviour a drawn
 * bow should have.
 */
export function bowLocomotionClip(
  bow: BowAnimationProfile,
  travel: Exclude<BowTravel, "still">,
  drawn: boolean,
): AnimationState {
  if (!drawn) return bow.locomotion[travel];
  return bow.drawnLocomotion[travel === "run" ? "walk" : travel];
}

/**
 * How far into the draw the shaft has been pulled clear of the quiver.
 *
 * The vanilla `bow_drawlight` clip spends its first third reaching over the
 * shoulder; before that the hand is nowhere near the string, and an arrow
 * shown there hangs in mid-air. Measured against the clip: the hand arrives at
 * the string at ~0.35 of the draw.
 */
export const NOCK_REVEAL_FRACTION = 0.35;

/**
 * Whether a shaft should be visible on the string.
 *
 * Only during the pull, and only once the hand has been to the quiver and
 * back. A bow held ready shows an empty string, as Skyrim's does — the arrow
 * the owner saw in the idle hand was this returning true for `ready`.
 */
export function nockedArrowVisible(cycle: BowCycle) {
  return cycle.phase === "drawing" && cycle.drawFraction >= NOCK_REVEAL_FRACTION;
}

/** How the archer is moving, as the locomotion set names it. */
export type BowTravel = "still" | "walk" | "walkBack" | "strafeLeft" | "strafeRight" | "run";

const STANDING: BowTravel = "still";

/** Resolve a movement stick into the bow-carry clip it should show. */
export function bowTravelFor(move: { x: number; y: number }, magnitude: number): BowTravel {
  if (magnitude <= 0.12) return "still";
  if (Math.abs(move.x) > Math.abs(move.y)) return move.x > 0 ? "strafeRight" : "strafeLeft";
  if (move.y < 0) return "walkBack";
  return magnitude > 0.85 ? "run" : "walk";
}

/** Authored length of the draw clip, which the draw fraction is mapped onto. */
function drawClipSeconds(bow: BowAnimationProfile) {
  return clipPlaybackDuration(bow.draw) ?? 1;
}

/** Whether an arrow can be nocked and drawn at all right now. */
export function canDraw(cycle: BowCycle) {
  return cycle.phase === "ready" || cycle.phase === "drawing";
}

/**
 * Speed the next arrow would leave at, for a HUD readout or an AI's aim solve.
 */
export function projectedLaunchSpeed(
  ranged: RangedStats,
  arrow: ArrowPhysics,
  drawFraction: number,
) {
  return launchSpeed(ranged, arrow, drawFraction);
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}
