import type { AudioManager, Footwear, FootstepSurface, Gait, SoundEventBus } from "@elder-souls/audio";
import { initialFootPlant, stepFootPlant, type FootPlantState } from "@elder-souls/game-core/anim/footPlant";
import * as THREE from "three";
import type { SoleBoneRefs } from "../SkyrimFighter";
import { STRIDE_RUN_ABOVE_MAGNITUDE, STRIDE_WALK_ABOVE_MAGNITUDE } from "./locomotionHelpers";

/**
 * The runtime's side of the sound events (decision 0095, combat-sandbox lane
 * round 7): the ids sounds are attributed by, the gait a stride sounds as, and
 * the per-actor foot-plant and stroke clocks. What each event carries (which
 * weapon family, which body) is `game-core/fx/soundClasses`; what the stealth
 * service hears of it is `game-core/perception/soundNoise`.
 */

/** The player's sound-source id; the stealth feed hears only the player's own sounds. */
export const PLAYER_SOUND_SOURCE = "player";

/**
 * Which stride the player's movement is, from the same thresholds as the
 * stride clip: null when not striding (standing, airborne, swimming).
 */
export function locomotionGait(input: {
  moveMagnitude: number;
  grounded: boolean;
  sprinting: boolean;
  crouching: boolean;
}): Gait | null {
  if (!input.grounded || input.moveMagnitude <= STRIDE_WALK_ABOVE_MAGNITUDE) return null;
  if (input.crouching) return "sneak";
  if (input.sprinting) return "sprint";
  return input.moveMagnitude > STRIDE_RUN_ABOVE_MAGNITUDE ? "run" : "walk";
}

/** One actor's footstep clock (which foot carries the weight) and its scratch. */
export type FootstepState = { plant: FootPlantState; soleL: THREE.Vector3; soleR: THREE.Vector3 };

export function createFootstepState(): FootstepState {
  return { plant: initialFootPlant(), soleL: new THREE.Vector3(), soleR: new THREE.Vector3() };
}

/**
 * One frame of an actor's footsteps: a `movement.footstep` on each foot plant
 * (`anim/footPlant`) while it strides, at the planted sole. Not striding
 * resets the clock, so a stance shift while standing is never a step.
 */
export function stepFootsteps(
  state: FootstepState,
  input: {
    soles: SoleBoneRefs | null;
    gait: Gait | null;
    footwear: Footwear;
    /** The ground under the planted foot, asked only when a foot plants. */
    surface: () => FootstepSurface;
    source: string;
    /** The actor's own sounds play at the listener; anyone else's where the foot lands. */
    positional: boolean;
  },
  sounds: SoundEventBus,
) {
  const { soles, gait } = input;
  if (!gait || !soles?.footL || !soles.footR) {
    state.plant = initialFootPlant();
    return;
  }
  const { soleL, soleR } = state;
  soles.footL.getWorldPosition(soleL);
  soles.footR.getWorldPosition(soleR);
  const step = stepFootPlant(state.plant, soleL.y, soleR.y);
  state.plant = step.state;
  if (!step.planted) return;
  const sole = step.planted === "footL" ? soleL : soleR;
  sounds.emit({
    type: "movement.footstep",
    footwear: input.footwear,
    gait,
    surface: input.surface(),
    source: input.source,
    ...(input.positional ? { at: { x: sole.x, y: sole.y, z: sole.z } } : {}),
  });
}

/** The player's lit torch, as an audio emitter id. */
export const PLAYER_TORCH_EMITTER = "player-torch";

/** The host's emitter surface (an AudioManager). */
export type SoundEmitters = Pick<AudioManager, "addEmitter" | "moveEmitter" | "removeEmitter">;

/**
 * A lit torch burns audibly at its flame (decision 0091): an emitter while
 * lit, removed when it is doused, stowed or burnt out. Returns whether it is
 * emitting now, the caller's state for the next frame.
 */
export function stepTorchEmitter(
  emitting: boolean,
  emitters: SoundEmitters | undefined,
  flame: { x: number; y: number; z: number } | null,
): boolean {
  if (flame && emitters) {
    if (emitting) emitters.moveEmitter(PLAYER_TORCH_EMITTER, flame);
    else emitters.addEmitter(PLAYER_TORCH_EMITTER, "object.torch.burn", flame);
    return true;
  }
  if (emitting) emitters?.removeEmitter(PLAYER_TORCH_EMITTER);
  return false;
}

/** The swim-stroke clock: which kind of stroke is playing and how far into its cycle. */
export type SwimStrokeState = { kind: "stroke" | "tread" | null; clock: number };

export function createSwimStrokeState(): SwimStrokeState {
  return { kind: null, clock: 0 };
}

/**
 * One `movement.swim` per cycle of the stroke clip playing, from its first
 * frame: a change of stroke (moving to treading) starts a new cycle.
 */
export function stepSwimStrokes(
  state: SwimStrokeState,
  input: { moving: boolean; cycleSeconds: number; advanceSeconds: number; source: string },
  sounds: SoundEventBus,
) {
  const kind = input.moving ? "stroke" : "tread";
  const cycle = Math.max(input.cycleSeconds, 1e-3);
  if (kind !== state.kind) {
    state.kind = kind;
    state.clock = cycle;
  }
  state.clock += input.advanceSeconds;
  if (state.clock < cycle) return;
  state.clock %= cycle;
  sounds.emit({ type: "movement.swim", stroke: kind, source: input.source });
}
