/**
 * Fire types (16k walk 5): the config every drawn fire reads, renderer-agnostic.
 *
 * This file holds DATA ONLY (plain numbers, tuples, ids): no three.js type,
 * no shader, no backend concept. The card NodeMaterial (`flameMaterial.ts`,
 * both backends) and the raymarched volume (`volumeFire.ts`, WebGPU only,
 * decision 0110) consume the same `FireConfig`.
 *
 * A fire is drawn as layered procedural flame cards (technique A of
 * docs/research/phase16/16k-fire-system-research.md): each emitter is one or
 * more quads, Y-locked billboards, whose teardrop mask is distorted by fbm
 * noise scrolling upward and coloured by a 3-stop temperature ramp (the
 * three.js webgpu_volume_fire look: dark red base, orange body, pale yellow
 * tip). Sizes are metres at piece scale 1, relative to real fires: a candle
 * flame is ~3.5 x 8 cm, a torch head ~16 x 38 cm, a campfire ~0.5 x 0.9 m.
 *
 * Presets are keyed by id (standard 18: fixtures reference a preset by id,
 * never copy its numbers). `torchHandheld` has no world anchor: the carried
 * torch (fx/carriedLight) draws the same config at its hand bone later.
 */

export const FIRE_CONFIG_SCHEMA_VERSION = 3 as const;

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
  /** The raymarched volume (WebGPU backend only; volumeFire.ts). Absent: the
   * preset is drawn as cards on every backend (candle and lanterns: cheaper,
   * and their card look passed review). */
  volume?: FireVolumeConfig;
}

/**
 * One volume preset: a small temperature grid advected upward through a
 * curl-noise velocity field by ONE compute pass per frame per preset (every
 * fire of the preset samples the same field, mirrored by its seed), and a
 * box raymarched through it. Cost: `fireVolumeCost`.
 */
export interface FireVolumeConfig {
  /** Grid cells across, up, deep. */
  grid: readonly [number, number, number];
  /** The box around the emitter: width in flame widths, height in flame heights. */
  box: { widthW: number; heightH: number };
  /** Curl-noise octaves of the velocity field (1..3). */
  octaves: number;
  /** Buoyant rise of hot cells, box heights per second at temperature 1. */
  riseSpeed: number;
  /** Curl-noise velocity, box widths per second (licking, parting tongues). */
  turbulence: number;
  /** Curl-noise features across the box. */
  noiseScale: number;
  /** Temperature lost per second (the flame's height: faster cooling, shorter tongues). */
  dissipation: number;
  /** Temperature fed per second into the source disc at the box floor. */
  emit: number;
  /** Source disc radius, box half-widths. */
  sourceRadius: number;
  /** Raymarch steps through the box. */
  steps: number;
  /** Optical density at temperature 1, per box height. */
  density: number;
}

export const DEFAULT_RAMP_BANDS = { mid: 0.2, tip: 0.5 } as const;
// small flames: a deeper red root, a warm yellow body and a deep orange tip
// that starts a third of the way up, so the three bands show at candle size
const CANDLE_RAMP = { base: [0.7, 0.06, 0.0], mid: [1.0, 0.8, 0.32], tip: [0.95, 0.3, 0.02] } as const;
const SMALL_BANDS = { mid: 0.1, tip: 0.3 } as const;
const WOOD_RAMP = { base: [0.6, 0.05, 0.0], mid: [1.0, 0.8, 0.3], tip: [1.0, 0.38, 0.03] } as const;
/** The volume every wood fire starts from; presets override a few numbers. */
const WOOD_VOLUME: FireVolumeConfig = {
  grid: [16, 32, 16], box: { widthW: 1.7, heightH: 1.25 }, octaves: 2,
  riseSpeed: 1.6, turbulence: 0.9, noiseScale: 2.2, dissipation: 1.5, emit: 9, sourceRadius: 0.55,
  // judge (a), 2026-09-29: 24 steps banded and density 7 let the sky through (pale, pink-grey by day)
  steps: 32, density: 12,
};

/** The presets, smallest and calmest first. */
export const FIRE_PRESETS: Readonly<Record<FirePresetId, FireConfig>> = {
  candle: {
    schemaVersion: 3, id: "candle",
    shape: { widthM: 0.035, heightM: 0.085, taper: 0.8 },
    layers: { core: 2, outer: 1, spreadM: 0.01 },
    turbulence: 0.4, riseSpeed: 1.6, motion: { swayW: 1.1, pulse: 0.4, rateHz: 3.4 }, ramp: CANDLE_RAMP, bands: SMALL_BANDS,
    flicker: { rateHz: 5, amount: 0.08 }, windResponse: 0.25,
    embers: { count: 0, riseM: 0, sizeM: 0, lifeS: 1 },
    smokeHandOffM: 0, gain: { day: 1.0, night: 0.95 },
  },
  lanternStanding: {
    schemaVersion: 3, id: "lanternStanding",
    shape: { widthM: 0.04, heightM: 0.095, taper: 0.8 },
    layers: { core: 2, outer: 1, spreadM: 0.012 },
    turbulence: 0.4, riseSpeed: 1.5, motion: { swayW: 1.0, pulse: 0.4, rateHz: 3.2 }, ramp: CANDLE_RAMP, bands: SMALL_BANDS,
    flicker: { rateHz: 4, amount: 0.06 }, windResponse: 0.05,
    embers: { count: 0, riseM: 0, sizeM: 0, lifeS: 1 },
    smokeHandOffM: 0, gain: { day: 1.0, night: 0.95 },
  },
  lanternHanging: {
    // a lantern body with no mined candle (the Argonian cord lanterns): one
    // bigger flame at the body's centre, reading through the cage
    schemaVersion: 3, id: "lanternHanging",
    shape: { widthM: 0.07, heightM: 0.15, taper: 0.7 },
    layers: { core: 2, outer: 1, spreadM: 0.02 },
    turbulence: 0.42, riseSpeed: 1.5, motion: { swayW: 1.0, pulse: 0.4, rateHz: 3.0 }, ramp: CANDLE_RAMP, bands: SMALL_BANDS,
    flicker: { rateHz: 3.5, amount: 0.08 }, windResponse: 0.05,
    embers: { count: 0, riseM: 0, sizeM: 0, lifeS: 1 },
    smokeHandOffM: 0, gain: { day: 1.0, night: 0.95 },
  },
  torchGround: {
    schemaVersion: 3, id: "torchGround",
    shape: { widthM: 0.16, heightM: 0.38, taper: 0.6 },
    layers: { core: 2, outer: 1, spreadM: 0.03 },
    turbulence: 0.45, riseSpeed: 2.0, motion: { swayW: 0.45, pulse: 0.22, rateHz: 2.6 }, ramp: WOOD_RAMP,
    flicker: { rateHz: 7, amount: 0.14 }, windResponse: 0.35,
    embers: { count: 3, riseM: 0.8, sizeM: 0.012, lifeS: 1.4 },
    smokeHandOffM: 0.45, gain: { day: 1.0, night: 0.95 },
    volume: { ...WOOD_VOLUME, box: { widthW: 1.9, heightH: 1.3 }, sourceRadius: 0.4, dissipation: 1.7 },
  },
  torchHandheld: {
    schemaVersion: 3, id: "torchHandheld",
    shape: { widthM: 0.14, heightM: 0.34, taper: 0.6 },
    layers: { core: 2, outer: 1, spreadM: 0.03 },
    turbulence: 0.45, riseSpeed: 2.0, motion: { swayW: 0.45, pulse: 0.22, rateHz: 2.6 }, ramp: WOOD_RAMP,
    flicker: { rateHz: 7, amount: 0.14 }, windResponse: 0.45,
    embers: { count: 3, riseM: 0.7, sizeM: 0.012, lifeS: 1.2 },
    smokeHandOffM: 0.4, gain: { day: 1.0, night: 0.95 },
    volume: { ...WOOD_VOLUME, box: { widthW: 1.9, heightH: 1.3 }, sourceRadius: 0.4, dissipation: 1.7 },
  },
  brazier: {
    schemaVersion: 3, id: "brazier",
    shape: { widthM: 0.3, heightM: 0.55, taper: 0.55 },
    layers: { core: 2, outer: 2, spreadM: 0.12 },
    turbulence: 0.55, riseSpeed: 2.2, motion: { swayW: 0.5, pulse: 0.28, rateHz: 2.2 }, ramp: WOOD_RAMP,
    flicker: { rateHz: 6, amount: 0.12 }, windResponse: 0.3,
    embers: { count: 6, riseM: 1.4, sizeM: 0.014, lifeS: 1.8 },
    smokeHandOffM: 0.8, gain: { day: 1.0, night: 0.95 },
    volume: { ...WOOD_VOLUME },
  },
  hearth: {
    schemaVersion: 3, id: "hearth",
    shape: { widthM: 0.34, heightM: 0.62, taper: 0.55 },
    layers: { core: 2, outer: 3, spreadM: 0.2 },
    turbulence: 0.6, riseSpeed: 2.2, motion: { swayW: 0.5, pulse: 0.28, rateHz: 2.0 }, ramp: WOOD_RAMP,
    flicker: { rateHz: 5.5, amount: 0.12 }, windResponse: 0.1,
    embers: { count: 6, riseM: 1.2, sizeM: 0.014, lifeS: 1.8 },
    smokeHandOffM: 0.9, gain: { day: 1.0, night: 0.95 },
    volume: { ...WOOD_VOLUME, turbulence: 1.0 },
  },
  campfire: {
    schemaVersion: 3, id: "campfire",
    shape: { widthM: 0.42, heightM: 0.85, taper: 0.5 },
    layers: { core: 3, outer: 3, spreadM: 0.22 },
    turbulence: 0.72, riseSpeed: 2.5, motion: { swayW: 0.55, pulse: 0.3, rateHz: 1.9 }, ramp: WOOD_RAMP,
    flicker: { rateHz: 5, amount: 0.15 }, windResponse: 0.4,
    embers: { count: 10, riseM: 2.2, sizeM: 0.016, lifeS: 2.4 },
    smokeHandOffM: 1.2, gain: { day: 1.0, night: 0.95 },
    volume: { ...WOOD_VOLUME, turbulence: 1.1, octaves: 3, dissipation: 1.3 },
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

/**
 * Flicker of a fire's brightness at time `t` (s): 1 +- `amount`, phased by
 * `seed` (0..1). Two incommensurate sines, so it never visibly loops. The
 * shader carries the same function (flameMaterial.ts `fireFlicker`); the
 * point light calls this one, so the light breathes with its flame.
 */
export function fireFlicker(t: number, seed: number, rateHz: number, amount: number): number {
  const phase = seed * Math.PI * 2;
  const w = rateHz * Math.PI * 2;
  const s = 0.6 * Math.sin(t * w + phase) + 0.4 * Math.sin(t * w * 1.73 + phase * 2.3);
  return 1 + amount * s;
}

/** Day/night blend from the renderer's exposure: 0 at <= 1e-3 (day), 1 at >= 1 (night). */
export function nightShareOfExposure(exposure: number): number {
  const x = (Math.log10(Math.max(exposure, 1e-9)) + 3) / 3;
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
}

/** The presets that draw as a volume on the WebGPU backend. */
export const FIRE_VOLUME_PRESETS: readonly FirePresetId[] = FIRE_PRESET_ORDER.filter((id) => FIRE_PRESETS[id].volume);

/** The stated cost of the volume path (decision 0110). */
export interface FireVolumeCost {
  /** Grid cells of one preset's field. */
  cells: number;
  /** GPU memory of one preset's field: two rgba16float grids (ping-pong), MB. */
  fieldMB: number;
  /** Compute passes per frame per preset in view (fires of a preset share its field). */
  computePassesPerFrame: number;
  /** Per-fire memory: one instance row, bytes. */
  perFireBytes: number;
  /** 3-D texture samples per covered pixel (one per raymarch step). */
  samplesPerPixel: number;
}

export function fireVolumeCost(v: FireVolumeConfig): FireVolumeCost {
  const cells = v.grid[0] * v.grid[1] * v.grid[2];
  return {
    cells,
    fieldMB: (cells * 8 * 2) / (1024 * 1024),
    computePassesPerFrame: 1,
    perFireBytes: 12 * 4,
    samplesPerPixel: v.steps,
  };
}
