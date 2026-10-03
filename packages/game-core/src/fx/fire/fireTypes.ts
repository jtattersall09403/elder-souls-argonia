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

export const FIRE_CONFIG_SCHEMA_VERSION = 4 as const;

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

/** The quality tiers the volume path reads (the caller maps its band to one). */
export type FireVolumeTier = "high" | "medium" | "low" | "mobile";
export const FIRE_VOLUME_TIERS: readonly FireVolumeTier[] = ["high", "medium", "low", "mobile"];

/**
 * One volume preset: a stable-fluids grid (velocity, pressure, and a dye of
 * smoke, temperature and age) stepped at a fixed rate by 8 compute passes per
 * step (advect velocity with forces, divergence, Jacobi pressure, project,
 * advect dye with emission), and a box raymarched through it
 * (vol-fix-design.md part B). Every fire of a preset samples one shared field
 * (8 mirror variants); the nearest few own a private field
 * (`FIRE_VOLUME_PRIVATE`). Values per tier live here, never in code.
 * Cost: `fireVolumeCost`.
 */
export interface FireVolumeConfig {
  /** Grid cells across, up, deep. */
  grid: readonly [number, number, number];
  /** The box around the emitter: width in flame widths, height in flame heights. */
  box: { widthW: number; heightH: number };
  /** Curl octaves summed in the age-keyed turbulence (1..3). */
  octaves: number;
  /** Buoyant acceleration at temperature 1, box heights per s^2 (the flame's height with `dissipation`). */
  buoyancy: number;
  /** Age-keyed curl push, box widths per s^2 at temperature 1. */
  turbulence: number;
  /** Curl features across the box. */
  noiseScale: number;
  /** Temperature lost per second (faster cooling, shorter tongues). */
  dissipation: number;
  /** Temperature fed per second into the source disc at the box floor. */
  emit: number;
  /** Source disc radius, box half-widths. */
  sourceRadius: number;
  /** Share of the box height the flame envelope spans (default 1); the rest is the smoke plume. */
  flameShare?: number;
  /** Optical density at temperature 1, per box height. */
  density: number;
  /** Raymarch steps through the box per tier; 0: this tier draws the preset as cards. */
  steps: Readonly<Record<FireVolumeTier, number>>;
}

/** Per-tier solver settings shared by every preset. */
export interface FireVolumeTierConfig {
  /** Solver steps per second (fixed step 1/simHz). */
  simHz: number;
  /** Jacobi pressure iterations per step (even: A/B ping-pong ends in A). */
  jacobi: number;
  /** Private fields for the nearest fires within `FIRE_VOLUME_PRIVATE_M`. */
  privateFields: number;
  /** Curl texture edge (texels). */
  curlN: number;
  /** Volume reach (m): beyond it the fire is its cards; null keeps the default reach. */
  reachM: number | null;
}

export const FIRE_VOLUME_TIER_CONFIG: Readonly<Record<FireVolumeTier, FireVolumeTierConfig>> = {
  high: { simHz: 60, jacobi: 4, privateFields: 2, curlN: 64, reachM: null },
  medium: { simHz: 60, jacobi: 4, privateFields: 1, curlN: 64, reachM: null },
  low: { simHz: 60, jacobi: 4, privateFields: 0, curlN: 64, reachM: 6 },
  mobile: { simHz: 30, jacobi: 2, privateFields: 0, curlN: 32, reachM: null },
};
/** A fire nearer than this to the camera may own a private field (m). */
export const FIRE_VOLUME_PRIVATE_M = 8;
/** Steps a fixed-step solver may catch up in one frame. */
export const FIRE_VOLUME_MAX_CATCHUP = 3;

export const DEFAULT_RAMP_BANDS = { mid: 0.2, tip: 0.5 } as const;
// small flames: a deeper red root, a warm yellow body and a deep orange tip
// that starts a third of the way up, so the three bands show at candle size
const CANDLE_RAMP = { base: [0.7, 0.06, 0.0], mid: [1.0, 0.8, 0.32], tip: [0.95, 0.3, 0.02] } as const;
const SMALL_BANDS = { mid: 0.1, tip: 0.3 } as const;
const WOOD_RAMP = { base: [0.6, 0.05, 0.0], mid: [1.0, 0.8, 0.3], tip: [1.0, 0.38, 0.03] } as const;
/** The volume every wood fire starts from (the brazier); presets override a few numbers. */
const WOOD_VOLUME: FireVolumeConfig = {
  grid: [20, 40, 20], box: { widthW: 1.7, heightH: 1.25 }, octaves: 2,
  buoyancy: 2.6, turbulence: 0.9, noiseScale: 2.2, dissipation: 1.5, emit: 9, sourceRadius: 0.55,
  // judge (a), 2026-09-29: density 7 let the sky through (pale, pink-grey by day)
  density: 12, steps: { high: 24, medium: 16, low: 16, mobile: 12 },
};
const TORCH_VOLUME: FireVolumeConfig = {
  ...WOOD_VOLUME, grid: [16, 32, 16], box: { widthW: 1.9, heightH: 1.3 }, buoyancy: 3.0, sourceRadius: 0.4,
  dissipation: 1.7, steps: { high: 24, medium: 16, low: 16, mobile: 0 },
};
const BIG_STEPS = { high: 28, medium: 20, low: 20, mobile: 12 } as const;

/** The presets, smallest and calmest first. */
export const FIRE_PRESETS: Readonly<Record<FirePresetId, FireConfig>> = {
  candle: {
    schemaVersion: 4, id: "candle",
    shape: { widthM: 0.04, heightM: 0.1, taper: 0.8 },
    layers: { core: 2, outer: 1, spreadM: 0.01 },
    turbulence: 0.4, riseSpeed: 1.6, motion: { swayW: 1.1, pulse: 0.4, rateHz: 3.4 }, ramp: CANDLE_RAMP, bands: SMALL_BANDS,
    flicker: { rateHz: 5, amount: 0.08 }, windResponse: 0.25,
    embers: { count: 0, riseM: 0, sizeM: 0, lifeS: 1 },
    smokeHandOffM: 0, gain: { day: 1.0, night: 0.95 },
  },
  lanternStanding: {
    schemaVersion: 4, id: "lanternStanding",
    shape: { widthM: 0.06, heightM: 0.15, taper: 0.8 },
    layers: { core: 2, outer: 1, spreadM: 0.012 },
    turbulence: 0.4, riseSpeed: 1.5, motion: { swayW: 1.0, pulse: 0.4, rateHz: 3.2 }, ramp: CANDLE_RAMP, bands: SMALL_BANDS,
    flicker: { rateHz: 4, amount: 0.06 }, windResponse: 0.05,
    embers: { count: 0, riseM: 0, sizeM: 0, lifeS: 1 },
    smokeHandOffM: 0, gain: { day: 1.0, night: 0.95 },
  },
  lanternHanging: {
    // a lantern body with no mined candle (the Argonian cord lanterns: their
    // NIFs hold a hist-wood cage and a rope, no candle shape and no emitter):
    // one candle-lantern flame at the body's centre. Sized as the candle
    // lantern's candle (lanternStanding), never the body: a 0.4 m card filled
    // the cage and the cage read as glowing (walk 9, owner)
    schemaVersion: 4, id: "lanternHanging",
    shape: { widthM: 0.06, heightM: 0.15, taper: 0.8 },
    layers: { core: 2, outer: 1, spreadM: 0.012 },
    turbulence: 0.42, riseSpeed: 1.5, motion: { swayW: 1.0, pulse: 0.4, rateHz: 3.0 }, ramp: CANDLE_RAMP, bands: SMALL_BANDS,
    flicker: { rateHz: 3.5, amount: 0.08 }, windResponse: 0.05,
    embers: { count: 0, riseM: 0, sizeM: 0, lifeS: 1 },
    smokeHandOffM: 0, gain: { day: 1.0, night: 0.95 },
  },
  torchGround: {
    schemaVersion: 4, id: "torchGround",
    shape: { widthM: 0.24, heightM: 0.58, taper: 0.6 },
    layers: { core: 2, outer: 1, spreadM: 0.03 },
    turbulence: 0.45, riseSpeed: 2.0, motion: { swayW: 0.45, pulse: 0.22, rateHz: 2.6 }, ramp: WOOD_RAMP,
    flicker: { rateHz: 7, amount: 0.14 }, windResponse: 0.35,
    embers: { count: 3, riseM: 0.8, sizeM: 0.012, lifeS: 1.4 },
    smokeHandOffM: 0.45, gain: { day: 1.0, night: 0.95 },
    volume: TORCH_VOLUME,
  },
  torchHandheld: {
    schemaVersion: 4, id: "torchHandheld",
    shape: { widthM: 0.22, heightM: 0.52, taper: 0.6 },
    layers: { core: 2, outer: 1, spreadM: 0.03 },
    turbulence: 0.45, riseSpeed: 2.0, motion: { swayW: 0.45, pulse: 0.22, rateHz: 2.6 }, ramp: WOOD_RAMP,
    flicker: { rateHz: 7, amount: 0.14 }, windResponse: 0.45,
    embers: { count: 3, riseM: 0.7, sizeM: 0.012, lifeS: 1.2 },
    smokeHandOffM: 0.4, gain: { day: 1.0, night: 0.95 },
    volume: TORCH_VOLUME,
  },
  brazier: {
    schemaVersion: 4, id: "brazier",
    shape: { widthM: 0.5, heightM: 1.0, taper: 0.55 },
    layers: { core: 2, outer: 2, spreadM: 0.12 },
    turbulence: 0.55, riseSpeed: 2.2, motion: { swayW: 0.5, pulse: 0.28, rateHz: 2.2 }, ramp: WOOD_RAMP,
    flicker: { rateHz: 6, amount: 0.12 }, windResponse: 0.3,
    embers: { count: 6, riseM: 1.4, sizeM: 0.014, lifeS: 1.8 },
    smokeHandOffM: 0.8, gain: { day: 1.0, night: 0.95 },
    volume: { ...WOOD_VOLUME },
  },
  hearth: {
    schemaVersion: 4, id: "hearth",
    shape: { widthM: 0.55, heightM: 1.05, taper: 0.55 },
    layers: { core: 2, outer: 3, spreadM: 0.2 },
    turbulence: 0.6, riseSpeed: 2.2, motion: { swayW: 0.5, pulse: 0.28, rateHz: 2.0 }, ramp: WOOD_RAMP,
    flicker: { rateHz: 5.5, amount: 0.12 }, windResponse: 0.1,
    embers: { count: 6, riseM: 1.2, sizeM: 0.014, lifeS: 1.8 },
    smokeHandOffM: 0.9, gain: { day: 1.0, night: 0.95 },
    // vol10 F8b (D11, Brinas hearth read short and small): the reference flame stands ~3:1, so the
    // box is 2.4 flame heights (2.5 m at piece scale 1) with the flame in its lower 62 % (1.56 m,
    // ~2.8x the 0.55 m bed) and the smoke plume above. Density keeps its per-metre value
    // (12 x 2.4 / 1.25 = 23: `density` is per box height); buoyancy 1.8 sits between the
    // box-relative 2.4 and the metre-preserving 1.25 (tune on fire-diag-vol at the pod measure).
    volume: { ...WOOD_VOLUME, grid: [24, 48, 24], box: { widthW: 1.7, heightH: 2.4 }, flameShare: 0.62,
      density: 23, buoyancy: 1.8, turbulence: 1.0, steps: BIG_STEPS },
  },
  campfire: {
    schemaVersion: 4, id: "campfire",
    shape: { widthM: 0.8, heightM: 1.7, taper: 0.5 },
    layers: { core: 3, outer: 3, spreadM: 0.3 },
    turbulence: 0.72, riseSpeed: 2.5, motion: { swayW: 0.55, pulse: 0.3, rateHz: 1.9 }, ramp: WOOD_RAMP,
    flicker: { rateHz: 5, amount: 0.15 }, windResponse: 0.4,
    embers: { count: 10, riseM: 2.2, sizeM: 0.016, lifeS: 2.4 },
    smokeHandOffM: 1.2, gain: { day: 1.0, night: 0.95 },
    volume: { ...WOOD_VOLUME, grid: [24, 48, 24], buoyancy: 2.8, turbulence: 1.1, octaves: 3, dissipation: 1.3,
      steps: BIG_STEPS },
  },
};

/** The light a fixture of one fire class casts (the fixture light field). */
export interface FireLight {
  /** Peak intensity, candela (three PointLight units, decay 2). */
  candela: number;
  /** Cap on the LIGH record's radius (m); null: the record's radius stands. */
  maxRadiusM: number | null;
}

/**
 * Each fire class's light, keyed by preset id (standard 18). Every class is
 * the carried torch's 6 cd at its LIGH radius (owner-approved: candles and the
 * campfire, walks 4 to 9) except the hanging lantern: the Argonian cord
 * lantern's mod LIGH is 512 units (7.3 m) at the torch's 6 cd, and hung by a
 * door 0.3 m off the wall it blew the wall and ground out (walk 9, owner).
 * Vanilla's candle lantern (CandleLanternWithCandle01, DefaultCandleLight01NSDesat)
 * is 256 units (3.65 m), half the radius; the class keeps a third of the
 * intensity (2 cd) inside that radius, so it lights the doorway, not the wall.
 */
export const FIRE_LIGHTS: Readonly<Record<FirePresetId, FireLight>> = {
  candle: { candela: 6, maxRadiusM: null },
  lanternStanding: { candela: 6, maxRadiusM: null },
  lanternHanging: { candela: 2, maxRadiusM: 3.65 },
  torchGround: { candela: 6, maxRadiusM: null },
  torchHandheld: { candela: 6, maxRadiusM: null },
  brazier: { candela: 6, maxRadiusM: null },
  hearth: { candela: 6, maxRadiusM: null },
  campfire: { candela: 6, maxRadiusM: null },
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
 * The cast-light flicker amount of a fire's light (a field slot or a cell's record light), separate from
 * the flame shader's preset `flicker.amount` (0.06-0.14, the cards' own breath): the light swings about
 * 1 +- 0.3 so the walls and floor visibly move with the fire, as three.js webgpu_volume_fire's light does
 * (vol10 diag4 D6: at the preset amounts the device read +-4 %). Same seed and rate as the flame.
 */
export const FIRE_LIGHT_FLICKER_AMOUNT = 0.3;

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

/** The presets that draw as a volume on the WebGPU backend. */
export const FIRE_VOLUME_PRESETS: readonly FirePresetId[] = FIRE_PRESET_ORDER.filter((id) => FIRE_PRESETS[id].volume);

/** Bytes per cell of one field: velocity A/B, dye A/B, pressure A/B, divergence, all rgba16float. */
export const FIRE_FIELD_BYTES_PER_CELL = 7 * 8;
/** GPU memory of the shared curl texture (rgba16float, `curlN`^3), MiB. */
export function fireCurlMiB(curlN: number): number { return (curlN ** 3 * 8) / (1024 * 1024); }

/** The stated cost of the volume path (decision 0110, vol-fix-design.md B6). */
export interface FireVolumeCost {
  /** Grid cells of one field. */
  cells: number;
  /** GPU memory of one field (shared or private), MiB. */
  fieldMB: number;
  /** Compute passes per solver step: advect, divergence, `jacobi`, project, dye. */
  computePassesPerStep: number;
  /** Per-fire memory: one instance row, bytes. */
  perFireBytes: number;
  /** 3-D texture samples per covered pixel (march steps x 2: dye + detail). */
  samplesPerPixel: number;
}

export function fireVolumeCost(v: FireVolumeConfig, tier: FireVolumeTier = "high"): FireVolumeCost {
  const cells = v.grid[0] * v.grid[1] * v.grid[2];
  return {
    cells,
    fieldMB: (cells * FIRE_FIELD_BYTES_PER_CELL) / (1024 * 1024),
    computePassesPerStep: 4 + FIRE_VOLUME_TIER_CONFIG[tier].jacobi,
    perFireBytes: 12 * 4,
    samplesPerPixel: v.steps[tier] * 2,
  };
}
