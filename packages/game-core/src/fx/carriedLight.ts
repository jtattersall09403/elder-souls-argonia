/**
 * Carried light: a light source an actor holds or wears, and how it burns.
 *
 * One shape for every carried light the game will have: a torch (finite burn,
 * put out by water), a lantern (no burn time, or oil later), a light spell
 * (the spell's duration as its burn time, held on the hand). The rules are
 * pure; the renderer (`@elder-souls/character` `CarriedLight`) draws the light
 * from `carriedLightIntensity`, and whoever owns the actor ticks the state.
 *
 * The world's water is not this module's business: the caller says whether
 * the light is submerged (Phase 9's water sampler, injected into the combat
 * runtime), and stealth reads the same light as the target's `lightLevel`.
 */

export const CARRIED_LIGHT_SCHEMA_VERSION = 1;

/** What puts a light out without using it up. */
export type Extinguisher = "submerged";

export type LightSourceSpec = {
  /** The item or spell id this light belongs to. */
  id: string;
  /** Linear RGB, 0-1. */
  colour: readonly [number, number, number];
  radiusMetres: number;
  /** Seconds of light in a fresh source; null never burns out. */
  burnSeconds: number | null;
  flicker: { frequency: number; intensityAmplitude: number; movementMetres: number } | null;
  extinguishedBy: readonly Extinguisher[];
};

/** Versioned, serialisable (standard 17): one lit or spent source. */
export type CarriedLightState = {
  schemaVersion: typeof CARRIED_LIGHT_SCHEMA_VERSION;
  specId: string;
  lit: boolean;
  /** Seconds left; null for a source with no burn time. */
  remainingSeconds: number | null;
  /** Used up: the caller removes the item. Distinct from being put out. */
  burntOut: boolean;
};

/** A Skyrim LIGH record as the pipeline mines it (`equipment/generated/lights.items.json`). */
export type LightRecord = {
  formId: string;
  burnSeconds: number;
  radiusUnits: number;
  colourRgb: readonly [number, number, number];
  flicker?: { frequency: number; intensityAmplitude: number; movementAmplitude: number };
  flags: readonly string[];
};

/** Skyrim units to metres (1 unit = 1.428 cm). */
const UNIT_METRES = 0.01428;

/** The runtime light for a mined LIGH record. Burning lights go out under water. */
export function lightSourceFromRecord(id: string, record: LightRecord): LightSourceSpec {
  return {
    id,
    colour: [record.colourRgb[0] / 255, record.colourRgb[1] / 255, record.colourRgb[2] / 255],
    radiusMetres: record.radiusUnits * UNIT_METRES,
    burnSeconds: record.burnSeconds > 0 ? record.burnSeconds : null,
    flicker: record.flicker && record.flags.includes("flicker")
      ? {
        frequency: record.flicker.frequency,
        intensityAmplitude: record.flicker.intensityAmplitude,
        movementMetres: record.flicker.movementAmplitude * UNIT_METRES,
      }
      : null,
    extinguishedBy: ["submerged"],
  };
}

export function igniteCarriedLight(spec: LightSourceSpec): CarriedLightState {
  return {
    schemaVersion: CARRIED_LIGHT_SCHEMA_VERSION,
    specId: spec.id,
    lit: true,
    remainingSeconds: spec.burnSeconds,
    burntOut: false,
  };
}

export type LightEnvironment = { submerged: boolean };

/** Advance a source by `dt` seconds. A light that is out does not burn. */
export function tickCarriedLight(
  state: CarriedLightState,
  spec: LightSourceSpec,
  dt: number,
  environment: LightEnvironment,
): CarriedLightState {
  if (state.burntOut) return state;
  if (environment.submerged && spec.extinguishedBy.includes("submerged")) {
    return state.lit ? { ...state, lit: false } : state;
  }
  if (!state.lit || state.remainingSeconds === null) return state;
  const remainingSeconds = Math.max(0, state.remainingSeconds - dt);
  if (remainingSeconds > 0) return { ...state, remainingSeconds };
  return { ...state, lit: false, remainingSeconds: 0, burntOut: true };
}

/**
 * Relative intensity at time `t` seconds: 1 steady, dipping by up to half the
 * record's flicker amplitude, 0 when out. Two incommensurate waves at the
 * record's frequency, so the flicker never visibly repeats.
 */
export function carriedLightIntensity(state: CarriedLightState, spec: LightSourceSpec, t: number): number {
  if (!state.lit) return 0;
  if (!spec.flicker) return 1;
  const phase = 2 * Math.PI * spec.flicker.frequency * t;
  const wave = 0.5 + 0.25 * Math.sin(phase) + 0.25 * Math.sin(phase * 2.71 + 1.3);
  return 1 - (spec.flicker.intensityAmplitude / 2) * wave;
}
