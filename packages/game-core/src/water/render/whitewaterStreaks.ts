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
 * Sun/sky BALANCE for the falls kit, and why it is not one number.
 *
 * The old form weighted the direct sun `0.55 + 0.45 * sunY` — MAXIMUM when
 * the sun is overhead. For the pool foam (a horizontal surface) that is
 * right. For the sheet, a near-vertical body, it is backwards: a vertical
 * face sees the beam through cos(elevation), so at noon it receives least
 * direct sun, not most. The sheet was therefore painted with the midday sun's
 * own colour at full strength while the blue sky term contributed a tenth of
 * the total — measured at noon (lightRig, warmthBias 1): sky illuminance
 * [9.0k, 12.4k, 20.0k] against a direct [93.3k, 58.0k, 26.8k], giving the body
 * a chromaticity of [1.00, 0.69, 0.46]. That is the cream/ivory the owner
 * reported; the kit's own albedo is neutral white throughout.
 *
 * `upness` is the body's geometry, 0 = a vertical sheet, 1 = a horizontal
 * pool. It selects three view factors:
 *   - sky:    a vertical surface sees half the sky hemisphere, a horizontal
 *             one all of it (0.5 → 1.0);
 *   - sun:    a cloud of droplets is a sphere, so it intercepts E_n / 4 —
 *             `sunLight` carries the HORIZONTAL direct illuminance E_n·sinAlt,
 *             hence `0.25 / sunY`; a horizontal surface takes it as given;
 *   - bounce: the half of a vertical body's view that is sunlit GROUND
 *             returns the total horizontal illuminance times a rock/water
 *             albedo; a horizontal body sees none of it.
 *
 * The MAGNITUDE is then renormalised to the level the old form produced,
 * because that level is the calibrated exposure of an optically thick
 * multiple-scattering body (the visible face of a whitewater curtain is
 * brighter than any single-bounce Lambert term predicts, which is why a fall
 * reads as bright as its own pool foam and not the ~0.4x that a flat vertical
 * Lambertian would). Renormalising against the UNSHADOWED balance leaves
 * `sunVisibility` free to darken a shaded fall.
 */
export const FALLS_GROUND_ALBEDO = 0.22;
export const FALLS_SPHERE_INTERCEPT = 0.25;
/** Sun elevation floor for the sphere intercept — a grazing sun is not infinite. */
export const FALLS_MIN_SUN_Y = 0.15;
const LUM = [0.2126, 0.7152, 0.0722] as const;

/**
 * Irradiance for the aerated-white waterfall kit (TS twin of
 * `esFallsIrradiance`). `upness` 0 = vertical sheet, 1 = horizontal pool foam;
 * `sunVisibility` 0..1 is the shadow term (1 = open sun).
 */
export function fallsIrradiance(ambient: readonly number[], sunLight: readonly number[], sunDirY: number,
  upness = 0, sunVisibility = 1): [number, number, number] {
  const up = Math.min(Math.max(upness, 0), 1);
  const vis = Math.min(Math.max(sunVisibility, 0), 1);
  const sunY = Math.min(Math.max(sunDirY, FALLS_MIN_SUN_Y), 1);
  const skyView = 0.5 + 0.5 * up;
  const sunView = FALLS_SPHERE_INTERCEPT / sunY + (1 - FALLS_SPHERE_INTERCEPT / sunY) * up;
  const bounce = (1 - up) * 0.5 * FALLS_GROUND_ALBEDO;
  const sky = [0, 1, 2].map((i) => ambient[i] / AERIAL_SKY_FEED_SCALE);
  const sun = [0, 1, 2].map((i) => sunLight[i] / AERIAL_SUN_FEED_SCALE);
  const balance = (v: number) => [0, 1, 2].map((i) =>
    sky[i] * skyView + sun[i] * sunView * v + (sky[i] + sun[i] * v) * bounce);
  const flat = [0, 1, 2].map((i) => sky[i] + sun[i] * (0.55 + 0.45 * Math.min(Math.max(sunDirY, 0), 1)));
  const full = balance(1);
  const lum = (v: number[]) => LUM[0] * v[0] + LUM[1] * v[1] + LUM[2] * v[2];
  const k = lum(flat) / Math.max(lum(full), 1e-4);
  return balance(vis).map((v) => (v * k) / Math.PI) as [number, number, number];
}

/**
 * CSM sun visibility for the falls kit.
 *
 * The kit is unlit `ShaderMaterial` outside CSM, so before this a fall at the
 * bottom of a shaded gorge was lit as if it stood in open sun (probe: the
 * `fall-gorge` body measured x2.10 of the water around it, which IS shadowed).
 * `CSM.setupMaterial` cannot help — it patches `<lights_fragment_begin>`,
 * a chunk an unlit shader does not have — but the shadow maps themselves are
 * plain directional-light shadows in three's own uniform block, so the kit
 * takes them directly: `lights: true` on the material, three's shadow chunks
 * included, and the cascade chosen as the first one this fragment falls
 * inside (self-contained: it needs none of CSM's private `CSM_cascades`).
 */
export const FALLS_SHADOW_VERTEX_PARS = /* glsl */ `
#include <common>
#include <shadowmap_pars_vertex>
`;
/** Call with the object-space vertex; declares `worldPosition` for the chunk. */
export const FALLS_SHADOW_VERTEX = /* glsl */ `
  vec4 worldPosition = modelMatrix * vec4(esShadowVertex, 1.0);
  #include <shadowmap_vertex>
`;
export const FALLS_SHADOW_FRAGMENT_PARS = /* glsl */ `
#include <packing>
#include <shadowmap_pars_fragment>
float esFallsSunVisibility(){
  float esVis = 1.0;
#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
  // three unrolls this into straight-line code in ONE scope, so nothing may
  // be declared inside the body; esDone keeps the first cascade that
  // contains the fragment (the near cascade is first) instead of the last.
  vec3 esSc;
  float esDone = 0.0;
  #pragma unroll_loop_start
  for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
    esSc = vDirectionalShadowCoord[ i ].xyz / vDirectionalShadowCoord[ i ].w;
    if ( esDone < 0.5 && all( greaterThanEqual( esSc, vec3( 0.0 ) ) ) && all( lessThanEqual( esSc, vec3( 1.0 ) ) ) ) {
      esDone = 1.0;
      esVis = getShadow( directionalShadowMap[ i ], directionalLightShadows[ i ].shadowMapSize,
        directionalLightShadows[ i ].shadowIntensity, directionalLightShadows[ i ].shadowBias,
        directionalLightShadows[ i ].shadowRadius, vDirectionalShadowCoord[ i ] );
    }
  }
  #pragma unroll_loop_end
#endif
  return esVis;
}
`;

/** Compiled into the sheet, base and strip fragment shaders. Twin of the
 * functions above: `esStreakUv(layer, u, arcM, t, gain, wobbleScale)`. */
export const WHITEWATER_GLSL = /* glsl */ `
#ifndef ES_WHITEWATER_GLSL
#define ES_WHITEWATER_GLSL 1
// KEEP IN LOCKSTEP with fallsIrradiance(): upness 0 = vertical sheet, 1 =
// horizontal pool foam; vis = sun visibility (shadow), 1 = open sun.
vec3 esFallsIrradianceG(vec3 ambient, vec3 sunLight, vec3 sunDir, float upness, float vis){
  float up = clamp(upness, 0.0, 1.0);
  float v = clamp(vis, 0.0, 1.0);
  float sunY = clamp(sunDir.y, ${FALLS_MIN_SUN_Y.toFixed(2)}, 1.0);
  float skyView = 0.5 + 0.5 * up;
  float sunSphere = ${FALLS_SPHERE_INTERCEPT.toFixed(2)} / sunY;
  float sunView = mix(sunSphere, 1.0, up);
  float bounce = (1.0 - up) * 0.5 * ${FALLS_GROUND_ALBEDO.toFixed(2)};
  vec3 sky = ambient / ${AERIAL_SKY_FEED_SCALE.toFixed(2)};
  vec3 sun = sunLight / ${AERIAL_SUN_FEED_SCALE.toFixed(2)};
  vec3 full = sky * skyView + sun * sunView + (sky + sun) * bounce;
  vec3 lit  = sky * skyView + sun * sunView * v + (sky + sun * v) * bounce;
  vec3 flat_ = sky + sun * (0.55 + 0.45 * clamp(sunDir.y, 0.0, 1.0));
  const vec3 LUM = vec3(0.2126, 0.7152, 0.0722);
  float k = dot(flat_, LUM) / max(dot(full, LUM), 1e-4);
  return lit * k * RECIPROCAL_PI;
}
vec3 esFallsIrradiance(vec3 ambient, vec3 sunLight, vec3 sunDir){
  return esFallsIrradianceG(ambient, sunLight, sunDir, 0.0, 1.0);
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
