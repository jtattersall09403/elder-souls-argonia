/**
 * Whitewater streak field shared by the waterfall sheets, the plunge base
 * quads and the ES_STRIP chute ribbons (research
 * `docs/research/rendering/waterfalls-realtime.md` §2.3/§4, measured from the
 * vanilla Skyrim NIF controllers on 2026-09-08).
 *
 * Bethesda's cure for the "conveyor belt" is not a flow map; it is
 *   (a) three layers scrolled at genuinely different rates (0.075 / 0.15 /
 *       0.5 UV/s on `fxrapids` — a 6.7x spread),
 *   (b) a slow lateral U drift (1 tile / 33.3 s = 0.030 UV/s) and
 *   (c) a U-scale breathing 1.00 → 1.05 → 1.00 over 8.33 s,
 * so no vertical streak ever stays put. Everything here scrolls along the
 * piece's OWN arc length in metres — never world-time x world position and
 * never a fixed world-space drift (decision 0047 root cause 6).
 *
 * The TS functions are the twins the unit tests measure; `WHITEWATER_GLSL`
 * is the literal source the fragment shaders compile. Edit both or neither.
 * A sourced streak texture (`FXWhiteWater01`-class) can be slotted in with
 * `#define ES_STREAK_TEX` + `uStreakTex`; the procedural field is the
 * fallback and is what ships until the FX kit lands.
 */

/** One texture tile is this many metres of arc on the body layer (bodytall:
 * 3 V tiles over 16 m ≈ 5.3 m; the recipe rounds to 4 m). */
export const STREAK_TILE_M = 4;

export interface StreakLayer {
  /** Tile length along the arc (m). */
  tileM: number;
  /** Scroll speed along the arc (m/s) at unit speed gain. */
  rateMS: number;
  /** Tiles across a unit-width piece (the y-stretch that makes streaks). */
  acrossTiles: number;
  /** Phase offset (s) so the drift/breathe of each layer never lines up. */
  phaseS: number;
}

/** Measured V-offset rates, UV tiles per second (vault audit §4): the body
 * shell pair −0.313 / −0.333, the thin sheets −0.857, the crest strip's slow
 * plane −0.075 (0.5 : 0.075 = the 6.7x spread on `fxrapidsfallsline01`). */
export const STREAK_RATE_TILES_S = { body: 0.313, sheet: 0.857, slow: 0.075 } as const;
/**
 * Three layers at the measured tile rates on three tile sizes: body streaks
 * (0.313 t/s on a 4 m tile = 1.25 m/s), the fast thin-sheet foam (0.857 t/s
 * on 2.6 m = 2.23 m/s) and the slow crest accent (0.075 t/s on 8 m = 0.6 m/s).
 * 0.857 : 0.075 = 11x in tiles/s, 3.7x in metres/s — never the 1.1x of "two
 * layers slightly offset" that reads as one belt.
 */
export const STREAK_LAYERS: readonly StreakLayer[] = [
  { tileM: 4.0, rateMS: STREAK_RATE_TILES_S.body * 4.0, acrossTiles: 3.0, phaseS: 0.0 },
  { tileM: 2.6, rateMS: STREAK_RATE_TILES_S.sheet * 2.6, acrossTiles: 5.0, phaseS: 2.9 },
  { tileM: 8.0, rateMS: STREAK_RATE_TILES_S.slow * 8.0, acrossTiles: 1.5, phaseS: 5.3 },
];
/** Fast : slow rate ratio in tiles/s — at least the measured 6.7x. */
export const STREAK_RATE_SPREAD = STREAK_RATE_TILES_S.sheet / STREAK_RATE_TILES_S.slow;
/** Lateral U drift, tiles per second (1 tile / 33.3 s). */
export const STREAK_U_DRIFT_UVS = 0.030;
/** U-scale breathing: 1.00 → 1.05 → 1.00 over this period. */
export const STREAK_BREATHE_PERIOD_S = 8.33;
export const STREAK_BREATHE_AMPLITUDE = 0.05;
/** Side-to-side UV wobble (Cyanilux): 12 cycles per piece width, 0.05 UV. */
export const STREAK_WOBBLE_FREQ = 12;
export const STREAK_WOBBLE_AMPLITUDE = 0.05;
/** Scroll gain saturates at this water speed: a small fall is slower than a
 * gorge fall (research §2.3 finding 2). Floor keeps a slow lip alive. */
export const STREAK_SPEED_REF_MS = 6;
export const STREAK_SPEED_GAIN_MIN = 0.25;

/** Scroll gain for a local water speed, 0.25..1. */
export function streakSpeedGain(speedMS: number): number {
  return Math.min(Math.max(speedMS / STREAK_SPEED_REF_MS, STREAK_SPEED_GAIN_MIN), 1);
}

/** U-scale breathing factor at time t: 1.00 → 1.05 → 1.00, period 8.33 s. */
export function streakBreathe(timeS: number, phaseS = 0): number {
  return 1 + STREAK_BREATHE_AMPLITUDE * 0.5 * (1 - Math.cos((2 * Math.PI * (timeS + phaseS)) / STREAK_BREATHE_PERIOD_S));
}

export interface StreakSample {
  /** Texture-space u (tiles across) after drift, breathing and wobble. */
  u: number;
  /** Texture-space v (tiles along the arc) after the scroll. */
  v: number;
}

/**
 * Texture coordinate of layer `layer` at across-coordinate `u` (0..1), arc
 * `arcM` metres down the piece, time `timeS`. The scroll is strictly along
 * the arc: v decreases with time, so a feature at arc a at time t is at
 * a + rate·dt at t + dt — downstream.
 */
export function streakUv(layer: number, u: number, arcM: number, timeS: number, speedGain: number,
  wobbleScale = 1): StreakSample {
  const L = STREAK_LAYERS[Math.min(Math.max(layer, 0), STREAK_LAYERS.length - 1)];
  const t = timeS + L.phaseS;
  const breathe = streakBreathe(timeS, L.phaseS);
  const wobble = Math.sin(u * STREAK_WOBBLE_FREQ + t * 1.0) * STREAK_WOBBLE_AMPLITUDE * wobbleScale;
  const uu = (u - 0.5) * breathe * L.acrossTiles + 0.5 * L.acrossTiles + STREAK_U_DRIFT_UVS * t + wobble;
  const vv = arcM / L.tileM - (L.rateMS * speedGain * timeS) / L.tileM;
  return { u: uu, v: vv };
}

/**
 * Recovering surface irradiance from the runtime's AERIAL light feeds.
 *
 * `WaterRuntime.ambient` / `.sunLight` are documented (types.ts) as the HDR
 * aerial feeds, and the light rig builds them that way:
 *   ambient  = sky irradiance x 0.1        (lightRig `hazeAmbient`)
 *   sunLight = direct irradiance x kHaze   (lightRig `hazeSunLight`, kHaze
 *              0.06 at midday, rising to ~0.19 through the golden hour)
 * They are the SCATTERING radiances the fog term wants, not the irradiance
 * that lights a surface. The whole waterfall kit — sheet, plunge base, mist —
 * multiplied its albedo by them raw, so it was exposed at a tenth of the sky
 * while everything around it, including the physically-lit whitewater the
 * field shader draws in the strips a metre upstream at the same 0.85–0.90
 * white albedo, was lit by the real light rig. That is why the fall rendered
 * as the DARK thing between the bright river above it and the bright pool
 * foam below it (probe 2026-09-08: fall body 103 vs strip/pool foam 172 on
 * screen, and no albedo change could move it).
 *
 * Undoing both documented scales and dividing by pi for the Lambert BRDF is
 * the physical conversion. kHaze is not carried on the uniform, so the sun
 * feed uses its midday value: through the golden hour we then UNDER-recover
 * the sun, which is exactly when a vertical white body sees least of it.
 */
export const AERIAL_SKY_FEED_SCALE = 0.1;
export const AERIAL_SUN_FEED_SCALE = 0.06;

/**
 * Irradiance for the aerated-white waterfall kit (TS twin of
 * `esFallsIrradiance`). The sun keeps the kit's existing elevation weight —
 * the body has no normal, so `0.55 + 0.45 * sunY` stands in for N·L on a
 * near-vertical sheet: full when the sun is overhead, never zero, because a
 * white body is lit by multiple scattering from every direction.
 */
export function fallsIrradiance(ambient: readonly number[], sunLight: readonly number[], sunDirY: number): [number, number, number] {
  const sun = 0.55 + 0.45 * Math.min(Math.max(sunDirY, 0), 1);
  return [0, 1, 2].map((i) =>
    (ambient[i] / AERIAL_SKY_FEED_SCALE + (sunLight[i] / AERIAL_SUN_FEED_SCALE) * sun) / Math.PI,
  ) as [number, number, number];
}

/** Compiled into the sheet, base and strip fragment shaders. Twin of the
 * functions above: `esStreakUv(layer, u, arcM, t, gain, wobbleScale)`. */
export const WHITEWATER_GLSL = /* glsl */ `
#ifndef ES_WHITEWATER_GLSL
#define ES_WHITEWATER_GLSL 1
vec3 esFallsIrradiance(vec3 ambient, vec3 sunLight, vec3 sunDir){
  float sun = 0.55 + 0.45 * clamp(sunDir.y, 0.0, 1.0);
  return (ambient / ${AERIAL_SKY_FEED_SCALE.toFixed(2)}
    + (sunLight / ${AERIAL_SUN_FEED_SCALE.toFixed(2)}) * sun) * RECIPROCAL_PI;
}
const vec3 ES_STREAK_TILE = vec3(${STREAK_LAYERS.map((l) => l.tileM.toFixed(2)).join(", ")});
const vec3 ES_STREAK_RATE = vec3(${STREAK_LAYERS.map((l) => l.rateMS.toFixed(2)).join(", ")});
const vec3 ES_STREAK_ACROSS = vec3(${STREAK_LAYERS.map((l) => l.acrossTiles.toFixed(2)).join(", ")});
const vec3 ES_STREAK_PHASE = vec3(${STREAK_LAYERS.map((l) => l.phaseS.toFixed(2)).join(", ")});
float esStreakHash(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float esStreakValueNoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(esStreakHash(i), esStreakHash(i + vec2(1.0, 0.0)), u.x),
             mix(esStreakHash(i + vec2(0.0, 1.0)), esStreakHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
#ifdef ES_STREAK_TEX
// the vanilla FX textures are greyscale with the coverage in ALPHA (measured
// 2026-09-08: fxwhitewater R is a flat 0.83, its alpha carries the ring)
uniform sampler2D uStreakTex;
float esStreakField(vec2 uv){ return texture2D(uStreakTex, uv).a; }
#else
// procedural fallback: value noise y-stretched so blobs become streaks
float esStreakField(vec2 uv){ return esStreakValueNoise(vec2(uv.x, uv.y * 0.5)); }
#endif
float esStreakGain(float speedMS){
  return clamp(speedMS / ${STREAK_SPEED_REF_MS.toFixed(1)}, ${STREAK_SPEED_GAIN_MIN.toFixed(2)}, 1.0);
}
float esStreakBreathe(float t){
  return 1.0 + ${(STREAK_BREATHE_AMPLITUDE * 0.5).toFixed(3)} * (1.0 - cos(6.2831853 * t / ${STREAK_BREATHE_PERIOD_S.toFixed(2)}));
}
// KEEP IN LOCKSTEP with streakUv(): u across 0..1, arcM metres down the piece
vec2 esStreakUv(int layer, float u, float arcM, float t, float gain, float wobbleScale){
  float tile = layer == 0 ? ES_STREAK_TILE.x : (layer == 1 ? ES_STREAK_TILE.y : ES_STREAK_TILE.z);
  float rate = layer == 0 ? ES_STREAK_RATE.x : (layer == 1 ? ES_STREAK_RATE.y : ES_STREAK_RATE.z);
  float across = layer == 0 ? ES_STREAK_ACROSS.x : (layer == 1 ? ES_STREAK_ACROSS.y : ES_STREAK_ACROSS.z);
  float phase = layer == 0 ? ES_STREAK_PHASE.x : (layer == 1 ? ES_STREAK_PHASE.y : ES_STREAK_PHASE.z);
  float tp = t + phase;
  float breathe = esStreakBreathe(tp);
  float wobble = sin(u * ${STREAK_WOBBLE_FREQ.toFixed(1)} + tp) * ${STREAK_WOBBLE_AMPLITUDE.toFixed(2)} * wobbleScale;
  float uu = (u - 0.5) * breathe * across + 0.5 * across + ${STREAK_U_DRIFT_UVS.toFixed(3)} * tp + wobble;
  float vv = arcM / tile - (rate * gain * t) / tile;
  return vec2(uu, vv);
}
// The three-layer whitewater value, 0..1: body streaks modulated by the fast
// foam and lifted by the slow accent. returns the combined value; foam is
// the fast layer alone (the crest/plunge boost rides it).
float esWhitewater(float u, float arcM, float t, float gain, float wobbleScale, out float foam){
  float body = esStreakField(esStreakUv(0, u, arcM, t, gain, wobbleScale));
  foam = esStreakField(esStreakUv(1, u, arcM, t, gain, wobbleScale) + vec2(11.0, 3.0));
  float accent = esStreakField(esStreakUv(2, u, arcM, t, gain, wobbleScale) + vec2(5.0, 17.0));
  return clamp(body * (0.55 + 0.75 * foam) * (0.7 + 0.6 * accent), 0.0, 1.0);
}
#endif
`;
