/**
 * Fire types (16k walk 5): the config every drawn fire reads, renderer-agnostic.
 *
 * This file holds DATA ONLY (plain numbers, tuples, ids): no three.js type,
 * no shader, no WebGL or WebGPU concept. The GLSL material (`flameMaterial.ts`)
 * and a later TSL NodeMaterial both consume the same `FireConfig`, so a
 * WebGPU port is mechanical (owner lane split 2026-09-29).
 *
 * A fire is drawn as layered procedural flame cards (technique A of
 * docs/research/phase16/16k-fire-system-research.md): each emitter is one or
 * more quads, Y-locked billboards, whose teardrop mask is distorted by fbm
 * noise scrolling upward and coloured by a 3-stop temperature ramp (the
 * three.js webgpu_volume_fire look: dark red base, orange body, pale yellow
 * tip). Sizes are metres at piece scale 1. The card is the WHOLE flame from
 * its root at the emitter, and the mined emitter sits at the particle
 * system's origin, which is inside the fuel (a campfire's FlamesSmall03 is
 * 0.11 m up a 0.86 m log bundle; a torch's fireball core is inside its head).
 * The fuel's depth-tested geometry hides the lower part, so a card is sized
 * as (emitter to fuel top) + the flame seen above the fuel (decision 0107
 * "Flame size"): a candle ~6 cm seen (card 10 cm), a lantern candle filling
 * half its glass (15 cm), a torch head 0.3-0.45 m seen (58 cm), a campfire
 * >= 0.8 x its log bundle's diameter above the logs (1.7 m card).
 *
 * Presets are keyed by id (standard 18: fixtures reference a preset by id,
 * never copy its numbers). `torchHandheld` has no world anchor: the carried
 * torch (fx/carriedLight) draws the same config at its hand bone later.
 */

export const FIRE_CONFIG_SCHEMA_VERSION = 2 as const;

/** Linear RGB, 0..1 (display-referred: the flame is drawn untonemapped). */
export type FireRgb = readonly [number, number, number];

export type FirePresetId =
  | "candle"
  | "lanternHanging"
  | "lanternStanding"
  | "torchGround"
  | "torchHandheld"
  | "brazier"
  | "campfire"
  | "hearth";

export interface FireConfig {
  schemaVersion: typeof FIRE_CONFIG_SCHEMA_VERSION;
  id: FirePresetId;
  /** One flame card: width and height in metres at piece scale 1, and the
   * tip's narrowing (0 a rounded blob, 1 a sharp tongue). */
  shape: { widthM: number; heightM: number; taper: number };
  /** Cards per emitter: `core` bright inner cards and `outer` wider, cooler,
   * more turbulent cards, spread over a fire bed of radius `spreadM`. Every
   * preset has at least 3 cards (a candle 2 + 1, a campfire 3 + 3): one card
   * reads as a static sprite however its noise scrolls (judge 2, walk 5). */
  layers: { core: number; outer: number; spreadM: number };
  /** Noise distortion of the mask, 0 (still) .. 1 (wild licking tongues). */
  turbulence: number;
  /** Upward scroll of the noise, flame heights per second. */
  riseSpeed: number;
  /** Per-card motion, each card on its own phase (its seed): horizontal
   * sway of the upper body (`swayW`, in card widths at the tip), width and
   * height pulsing (`pulse`, share), at `rateHz`. A small flame needs MORE
   * relative sway, pulse and rate than a large one to read as moving at its
   * few pixels (judge 3, walk 5: at the large presets' share a candle read
   * as a still blob); a campfire's tongues part and merge at a lower share. */
  motion: { swayW: number; pulse: number; rateHz: number };
  /** The temperature ramp, three bands up the flame: `base` (dark red /
   * orange, the root and the fringe) -> `mid` (bright yellow-white, the
   * body) -> `tip` (pale, fading to transparent at the top). */
  ramp: { base: FireRgb; mid: FireRgb; tip: FireRgb };
  /** Where the ramp's bands start up the flame (0 root .. 1 top): `mid` the
   * body band, `tip` the tip band; the tip's fade to transparent starts just
   * above `tip`. Absent: `DEFAULT_RAMP_BANDS`. A small tapered flame has
   * little area above half height, so its tip band starts lower or it reads
   * as a two-tone blob (judge 3, walk 5). */
  bands?: { mid: number; tip: number };
  /** Brightness flicker: rate (Hz) and share (0..1). The same function and
   * seed drive the point light (lighting.ts), so flame and light agree. */
  flicker: { rateHz: number; amount: number };
  /** Lean of the tip per m/s of wind, in flame heights. */
  windResponse: number;
  /** Rising sparks per emitter (0: none), how high they climb, their edge
   * and life. */
  embers: { count: number; riseM: number; sizeM: number; lifeS: number };
  /** Height above the emitter (m) where a smoke column takes over; 0: the
   * fire makes no smoke of its own (a candle). The smoke system reads it. */
  smokeHandOffM: number;
  /** Display gain: by day (exposure <= 1e-3) and by night (exposure >= 1),
   * log-blended between. A day flame is an opaque orange shape over the
   * scene; a night flame glows brighter without clipping to white. */
  gain: { day: number; night: number };
}

export const DEFAULT_RAMP_BANDS = { mid: 0.2, tip: 0.5 } as const;
// small flames: a deeper red root, a warm yellow body and a deep orange tip
// that starts a third of the way up, so the three bands show at candle size
const CANDLE_RAMP = { base: [0.7, 0.06, 0.0], mid: [1.0, 0.8, 0.32], tip: [0.95, 0.3, 0.02] } as const;
const SMALL_BANDS = { mid: 0.1, tip: 0.3 } as const;
const WOOD_RAMP = { base: [0.6, 0.05, 0.0], mid: [1.0, 0.8, 0.3], tip: [1.0, 0.38, 0.03] } as const;

/** The presets, smallest and calmest first. */
export const FIRE_PRESETS: Readonly<Record<FirePresetId, FireConfig>> = {
  candle: {
    schemaVersion: 2, id: "candle",
    shape: { widthM: 0.04, heightM: 0.1, taper: 0.8 },
    layers: { core: 2, outer: 1, spreadM: 0.01 },
    turbulence: 0.4, riseSpeed: 1.6, motion: { swayW: 1.1, pulse: 0.4, rateHz: 3.4 }, ramp: CANDLE_RAMP, bands: SMALL_BANDS,
    flicker: { rateHz: 5, amount: 0.08 }, windResponse: 0.25,
    embers: { count: 0, riseM: 0, sizeM: 0, lifeS: 1 },
    smokeHandOffM: 0, gain: { day: 1.0, night: 0.95 },
  },
  lanternStanding: {
    schemaVersion: 2, id: "lanternStanding",
    shape: { widthM: 0.06, heightM: 0.15, taper: 0.8 },
    layers: { core: 2, outer: 1, spreadM: 0.012 },
    turbulence: 0.4, riseSpeed: 1.5, motion: { swayW: 1.0, pulse: 0.4, rateHz: 3.2 }, ramp: CANDLE_RAMP, bands: SMALL_BANDS,
    flicker: { rateHz: 4, amount: 0.06 }, windResponse: 0.05,
    embers: { count: 0, riseM: 0, sizeM: 0, lifeS: 1 },
    smokeHandOffM: 0, gain: { day: 1.0, night: 0.95 },
  },
  lanternHanging: {
    // a lantern body with no mined candle (the Argonian cord lanterns): one
    // bigger flame at the body's centre, reading through the cage
    schemaVersion: 2, id: "lanternHanging",
    shape: { widthM: 0.16, heightM: 0.4, taper: 0.7 },
    layers: { core: 2, outer: 1, spreadM: 0.02 },
    turbulence: 0.42, riseSpeed: 1.5, motion: { swayW: 1.0, pulse: 0.4, rateHz: 3.0 }, ramp: CANDLE_RAMP, bands: SMALL_BANDS,
    flicker: { rateHz: 3.5, amount: 0.08 }, windResponse: 0.05,
    embers: { count: 0, riseM: 0, sizeM: 0, lifeS: 1 },
    smokeHandOffM: 0, gain: { day: 1.0, night: 0.95 },
  },
  torchGround: {
    schemaVersion: 2, id: "torchGround",
    shape: { widthM: 0.24, heightM: 0.58, taper: 0.6 },
    layers: { core: 2, outer: 1, spreadM: 0.03 },
    turbulence: 0.45, riseSpeed: 2.0, motion: { swayW: 0.45, pulse: 0.22, rateHz: 2.6 }, ramp: WOOD_RAMP,
    flicker: { rateHz: 7, amount: 0.14 }, windResponse: 0.35,
    embers: { count: 3, riseM: 0.8, sizeM: 0.012, lifeS: 1.4 },
    smokeHandOffM: 0.45, gain: { day: 1.0, night: 0.95 },
  },
  torchHandheld: {
    schemaVersion: 2, id: "torchHandheld",
    shape: { widthM: 0.22, heightM: 0.52, taper: 0.6 },
    layers: { core: 2, outer: 1, spreadM: 0.03 },
    turbulence: 0.45, riseSpeed: 2.0, motion: { swayW: 0.45, pulse: 0.22, rateHz: 2.6 }, ramp: WOOD_RAMP,
    flicker: { rateHz: 7, amount: 0.14 }, windResponse: 0.45,
    embers: { count: 3, riseM: 0.7, sizeM: 0.012, lifeS: 1.2 },
    smokeHandOffM: 0.4, gain: { day: 1.0, night: 0.95 },
  },
  brazier: {
    schemaVersion: 2, id: "brazier",
    shape: { widthM: 0.5, heightM: 1.0, taper: 0.55 },
    layers: { core: 2, outer: 2, spreadM: 0.12 },
    turbulence: 0.55, riseSpeed: 2.2, motion: { swayW: 0.5, pulse: 0.28, rateHz: 2.2 }, ramp: WOOD_RAMP,
    flicker: { rateHz: 6, amount: 0.12 }, windResponse: 0.3,
    embers: { count: 6, riseM: 1.4, sizeM: 0.014, lifeS: 1.8 },
    smokeHandOffM: 0.8, gain: { day: 1.0, night: 0.95 },
  },
  hearth: {
    schemaVersion: 2, id: "hearth",
    shape: { widthM: 0.55, heightM: 1.05, taper: 0.55 },
    layers: { core: 2, outer: 3, spreadM: 0.2 },
    turbulence: 0.6, riseSpeed: 2.2, motion: { swayW: 0.5, pulse: 0.28, rateHz: 2.0 }, ramp: WOOD_RAMP,
    flicker: { rateHz: 5.5, amount: 0.12 }, windResponse: 0.1,
    embers: { count: 6, riseM: 1.2, sizeM: 0.014, lifeS: 1.8 },
    smokeHandOffM: 0.9, gain: { day: 1.0, night: 0.95 },
  },
  campfire: {
    schemaVersion: 2, id: "campfire",
    shape: { widthM: 0.8, heightM: 1.7, taper: 0.5 },
    layers: { core: 3, outer: 3, spreadM: 0.3 },
    turbulence: 0.72, riseSpeed: 2.5, motion: { swayW: 0.55, pulse: 0.3, rateHz: 1.9 }, ramp: WOOD_RAMP,
    flicker: { rateHz: 5, amount: 0.15 }, windResponse: 0.4,
    embers: { count: 10, riseM: 2.2, sizeM: 0.016, lifeS: 2.4 },
    smokeHandOffM: 1.2, gain: { day: 1.0, night: 0.95 },
  },
};

/** Stable palette row of each preset (the shader's ramp table index). */
export const FIRE_PRESET_ORDER: readonly FirePresetId[] = [
  "candle", "lanternStanding", "lanternHanging", "torchGround", "torchHandheld", "brazier", "hearth", "campfire",
];

/** Fire-bed presets: one fire per piece spread over its bed, however many
 * emitters the NIF carries (the campfire's FlamesSmall03 + Firearticles). */
export const FIRE_BED_PRESETS: ReadonlySet<FirePresetId> = new Set(["brazier", "hearth", "campfire"]);

/** What `firePresetFor` reads: a kit manifest row's fields and one mined flame. */
export interface FirePresetInput {
  id?: string;
  category?: string;
  anchorClass?: string;
  fixtureKind?: string;
  /** The mined flame's `source` (e.g. "AddOnNode49 -> MPSCandleFlame01/CandleFlame01"); absent for a fallback flame. */
  flameSource?: string;
  /** The host piece's kind (a mounted fire takes its host's), else undefined. */
  hostKind?: string;
}

/**
 * The preset of one flame, read from the piece's own records (fixture kind,
 * kit category, anchor class, the mined emitter's source), never its label
 * alone. Order: the fire kind (campfire, hearth, brazier/forge/cook-fire),
 * then the emitter (a candle AddOnNode is a candle flame, a torch MPS a torch),
 * then the lantern kind (hanging when the piece hangs), else a candle.
 */
export function firePresetFor(input: FirePresetInput): FirePresetId {
  const kind = input.fixtureKind ?? input.hostKind ?? input.category ?? "";
  const id = (input.id ?? "").toLowerCase();
  const source = (input.flameSource ?? "").toLowerCase();
  if (kind === "campfire" || id.includes("campfire")) return "campfire";
  if (kind === "hearth" || id.includes("fireplace") || id.includes("hearth")) return "hearth";
  // fxfirewithembers01, the fire vanilla stands in a brazier's bowl and on a
  // hut's floor hearth, is a brazier-sized bed wherever it stands
  if (kind === "brazier" || kind === "forge" || kind === "cook-fire" || id.includes("brazier")
    || id.includes("fxfirewithembers")) return "brazier";
  if (source.includes("torch") || kind === "torch" || (kind === "sconce" && id.includes("torch"))) return "torchGround";
  if (kind === "lantern" || id.includes("lantern")) {
    // a mined candle inside the lantern is that candle, hanging or not; a
    // lantern with no mined emitter burns a body-sized flame when it hangs
    if (source.includes("candle")) return "lanternStanding";
    return input.anchorClass === "hanging" ? "lanternHanging" : "lanternStanding";
  }
  return "candle";
}

/** A stable 0..1 hash of a real (Dave Hoskins' hash11, float-safe in GLSL). */
export function flickerHash(p: number): number {
  let x = p * 0.1031;
  x -= Math.floor(x);
  x *= x + 33.33;
  x *= x + x;
  return x - Math.floor(x);
}

/** Smooth 1-D value noise in -1..1 over lattice cells keyed by `key`. */
export function flickerNoise(x: number, key: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  const a = flickerHash(i + key);
  const b = flickerHash(i + 1 + key);
  return 2 * (a + (b - a) * u) - 1;
}

/** Mean gap between gust slots (s): each slot holds at most one dip. */
export const FLICKER_GUST_SLOT_S = 1.9;

/**
 * Flicker of a fire's brightness at time `t` (s): about 1 +- `amount`,
 * seeded by `seed` (0..1, stable per fixture), never repeating. Three
 * octaves of value noise at `rateHz`, 2.1x and 4.4x it (the steady breath of
 * the flame), plus rare gusts: each ~1.9 s slot holds a dip with p = 0.3, at
 * a hashed start, lasting 0.1-0.4 s and 10-25 % deep for a campfire-sized
 * `amount` (0.15), shallower for a calmer flame (a candle at 0.08: ~5-13 %).
 * A pure function of (t, seed): no state, and the lattice is hashed per cell,
 * so no period exists. The shader carries the same function
 * (flameMaterial.ts `fireFlicker`, single-precision); the fixture light and
 * the carried light call this one, so the light breathes with its flame.
 */
export function fireFlicker(t: number, seed: number, rateHz: number, amount: number): number {
  const key = seed * 7919.0;
  const x = t * rateHz;
  const breath = 0.55 * flickerNoise(x, key) + 0.3 * flickerNoise(x * 2.13, key + 311.0)
    + 0.15 * flickerNoise(x * 4.37, key + 613.0);
  const slotT = t / FLICKER_GUST_SLOT_S + seed * 13.0;
  const slot = Math.floor(slotT);
  let dip = 0;
  if (flickerHash(slot * 1.37 + key) < 0.3) {
    const start = 0.6 * flickerHash(slot * 2.11 + key + 17.0);
    const len = (0.1 + 0.3 * flickerHash(slot * 3.07 + key + 29.0)) / FLICKER_GUST_SLOT_S;
    const u = (slotT - slot - start) / len;
    if (u > 0 && u < 1) {
      const depth = (0.1 + 0.15 * flickerHash(slot * 5.03 + key + 43.0)) * Math.min(1, amount / 0.15);
      dip = depth * 4 * u * (1 - u);
    }
  }
  return (1 + amount * breath) * (1 - dip);
}

/** Day/night blend from the renderer's exposure: 0 at <= 1e-3 (day), 1 at >= 1 (night). */
export function nightShareOfExposure(exposure: number): number {
  const x = (Math.log10(Math.max(exposure, 1e-9)) + 3) / 3;
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
}
