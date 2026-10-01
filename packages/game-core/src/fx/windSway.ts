/**
 * Wind sway for instanced vegetation — a vertex-shader injection shared by
 * every plant material in the world (decision 0082; walk-8 lane E rewrite).
 *
 * The recipe (research/rendering/vegetation-scatter-instancing-threejs.md §4,
 * GPU Gems 3 ch. 16, the fable5 demo's gust fronts): trunk bend by height
 * squared at a frequency set by plant size, branch sway, leaf flutter, a gust
 * field that travels downwind across the stand, a per-instance phase so a
 * forest never sways in unison, and a distance fade. Vertex shader only, no
 * texture fetch, four uniforms' worth of state.
 *
 * **The one thing that must not be got wrong**: alpha-tested foliage casts its
 * shadow through a *separate* `customDepthMaterial`. If the displacement is
 * injected into the colour material only, every tree's shadow stays still
 * while the tree moves and the whole effect reads as broken. `applyWindSway`
 * therefore takes both materials and shares one uniform block between them —
 * same uniforms object, same clock, same code. The branch and leaf weights
 * are read from the geometry (distance from the trunk axis, height), because
 * the sourced meshes carry no authored wind vertex colours.
 *
 * Lives in a package rather than in the studio app because it is game
 * rendering, not scene composition (owner ruling 2026-08-30, decision 0038
 * addendum).
 */

import * as THREE from "three";
import { BATCH_DATA_HEAD } from "./batchData";

/** The uniform block a group of vegetation materials shares. */
export interface WindUniforms {
  /** Seconds, monotonic — the caller's elapsed clock, set by `updateWindSway`. */
  esWindTime: { value: number };
  /** Travel direction (XZ unit) × strength, plus gustiness in `z`. */
  esWindVec: { value: THREE.Vector3 };
  /** Beyond this distance from the camera, sway fades to nothing. */
  esWindFadeM: { value: number };
  /** The player's view point (the MAIN camera), set by `updateWindSway`. The
   * fade reads this, never `cameraPosition`: in the shadow pass that is the
   * CSM shadow camera, 400 m past the cascades, and shadows would stop
   * swaying with their plants. */
  esWindEye: { value: THREE.Vector3 };
}

/**
 * Metres. Sway is a near-field effect: past this the per-vertex motion is
 * sub-pixel, and switching it off keeps it away from the billboard tier
 * entirely (research §4: "wind never runs on the impostor tier").
 */
export const WIND_FADE_M = 220;

/**
 * Metres of crown displacement per m/s of wind, at the top of the plant.
 * Calibrated to read as movement without the rubbery over-bend that makes
 * vegetation look like seaweed: a 15 m tree in a 10 m/s blow leans ~0.9 m.
 */
export const WIND_METRES_PER_MS = 0.09;

/**
 * Per-instance wind tuning, as a `vec3` instanced attribute:
 *
 *   `.x` = stiffness − 1   `.y` = sink metres   `.z` = plant height metres
 *
 * Each reads its neutral value at 0 ON PURPOSE (height 0 = ground cover, 1 m). An instanced draw whose
 * geometry lacks the attribute reads WebGL's generic default of `(0, 0)`,
 * which decodes to stiffness 1, sink 0 and a 1 m plant: a missing attribute
 * degrades to ground-cover motion rather than switching wind off.
 */
export const WIND_TUNE_ATTRIBUTE = "esWindTune";

/**
 * Trunk radius, in metres, that gets the calibrated (×1) amount of sway.
 * The median canopy trunk in the flora kit; species fatter than this stiffen,
 * thinner ones loosen.
 */
export const WIND_REFERENCE_TRUNK_RADIUS_M = 0.36;

/**
 * Clamp on the stiffness multiplier. The ceiling is **1.0 on purpose**: this
 * term only ever STIFFENS a plant relative to the calibrated baseline, never
 * loosens it. Round 7 let thin trunks scale up to 2.2 and the owner
 * immediately read palms as swaying too much, worst in light winds — which
 * makes sense, because the round-6 amplitude they had already accepted was
 * tuned for exactly those slender trees. Fat trunks were the defect; thin ones
 * were never the problem, so they keep the amplitude that passed.
 */
export const WIND_STIFFNESS_RANGE: readonly [number, number] = [0.18, 1.0];

/**
 * How much a plant sways relative to the calibrated median, from the width of
 * its trunk at the ground.
 *
 * Owner round-6 defect: "trees with big wide trunks sway just as much as ones
 * with thin trunks, which looks odd". They were right and the physics agrees.
 * For a cantilever the tip deflection goes as `q·H⁴/(E·I)` with the second
 * moment `I ∝ r⁴`; the wind load `q` scales with crown area, which in tree
 * allometry grows roughly as `r²`. The two together leave deflection `∝ r⁻²`,
 * which is the exponent used here — a 1.2 m-radius buttressed giant lands on
 * the floor of the clamp and barely stirs. The result is capped at 1 (see
 * WIND_STIFFNESS_RANGE): slender trunks keep the amplitude that was already
 * signed off, they are not amplified.
 *
 * `scale` is the instance's uniform scale, because a species placed at ×2 has
 * a trunk twice as thick.
 */
export function windStiffness(trunkRadiusM: number, scale = 1): number {
  const radius = trunkRadiusM * scale;
  if (!(radius > 0)) return 1;
  const ratio = WIND_REFERENCE_TRUNK_RADIUS_M / radius;
  const [lo, hi] = WIND_STIFFNESS_RANGE;
  return Math.min(hi, Math.max(lo, ratio * ratio));
}

export function createWindUniforms(): WindUniforms {
  return {
    esWindTime: { value: 0 },
    esWindVec: { value: new THREE.Vector3(1, 0, 0) },
    esWindFadeM: { value: WIND_FADE_M },
    esWindEye: { value: new THREE.Vector3() },
  };
}

/**
 * Fold this frame's weather wind into the shared uniforms.
 *
 * `windDirXZ` and `windSpeedMS` come straight off the weather sample, so the
 * plants, the waves and the rain all gust from the same source.
 */
export function updateWindSway(
  uniforms: WindUniforms,
  elapsedSeconds: number,
  wind: { windDirXZ: readonly [number, number]; windSpeedMS: number; gustiness: number },
  eye: THREE.Vector3,
): void {
  uniforms.esWindEye.value.copy(eye);
  // Absolute, not accumulated: two systems sharing one uniform block (the
  // instanced flora and the groundcover ring both do) may each call this per
  // frame, and accumulation would run the clock at double speed.
  uniforms.esWindTime.value = elapsedSeconds;
  const strength = wind.windSpeedMS * WIND_METRES_PER_MS;
  uniforms.esWindVec.value.set(
    wind.windDirXZ[0] * strength,
    wind.windDirXZ[1] * strength,
    wind.gustiness,
  );
}

/**
 * Every gust-field and rustle constant, in one place (walk 9 owner correction:
 * the fault was a gust field so constant that everything moved alike under
 * every weather). The shader is generated from these values and
 * `windSway.test.ts` measures the TypeScript law below, which mirrors it.
 *
 * The envelope is Taylor's frozen turbulence: a pattern carried downwind at
 * `driftBase + driftPerMS × wind`, so a front keeps its shape across tens of
 * metres and reaches a plant 5 m downwind a fraction of a second later. The
 * pattern is a row of discrete gust fronts along the wind: every `slotM`
 * metres one slot may hold a front (chance rising with gustiness), with its
 * own position, length and strength drawn from a hash, so fronts come at
 * irregular spacing with calm between them. A coarse lull field modulates
 * the chance (active minutes and quiet minutes: the red end of the
 * spectrum), and the draw is blended across the wind over `crossCellM`, so
 * a front is a broad band that fades out sideways rather than a wall.
 * Lengths are in metres, so a front lasts longer in light wind and passes
 * faster in a gale, as real gusts do.
 */
export const WIND_GUST = {
  /** Gust fronts travel at this many m/s plus `driftPerMS` × wind speed. */
  driftBase: 1,
  driftPerMS: 0.9,
  /** One possible front per this many metres along the wind. */
  slotM: 60,
  /** Where in its slot a front's centre falls (fraction of the slot). */
  centreSpan: [0.15, 0.85] as readonly number[],
  /** Front half-length, metres along the wind. */
  halfLengthM: [16, 55] as readonly number[],
  /** Chance a slot holds a front: `occupancyBase + occupancyPerGust × gustiness`, times the lull field. */
  occupancyBase: 0.1,
  occupancyPerGust: 0.75,
  /** The lull field: value noise of this cell (m), scaling the chance by `lullRange`. */
  lullCellM: 520,
  lullRange: [0.35, 1.45] as readonly number[],
  /** Across the wind, the draw is blended over this many metres. */
  crossCellM: 150,
  /** Per-front strength draw. */
  strengthRange: [0.35, 1] as readonly number[],
  /** Ground cover is still at or below this wind, m/s (the clear-weather states blow 2.2). */
  coverCalmMS: 2.5,
  /** At or above this wind, m/s, ground cover is laid over. */
  coverFullMS: 12,
  /** Ground-cover slow-bend rate, Hz, from calm to full wind. */
  coverHz: [0.4, 1.2] as readonly number[],
  /** Tip lean at full wind in a full front, as a fraction of plant height. */
  coverLean: 0.9,
  /** Share of the lean that is steady (the rest arrives with the front). */
  coverSteady: 0.35,
  /** Rustle (high-frequency flutter), rad/s, and its tip amplitude as a fraction of plant height. */
  rustleRadS: 44,
  rustleCover: 0.05,
  /** Rustle grows with (wind / rustleFullMS)²; above `rustleStrongMS` a floor of it stays between fronts. */
  rustleFullMS: 14,
  rustleStrongMS: [10, 14] as readonly number[],
  rustleStrongFloor: 0.35,
} as const;

function windHash(x: number, z: number): number {
  const v = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

function windNoise(x: number, z: number): number {
  const ix = Math.floor(x); const iz = Math.floor(z);
  let fx = x - ix; let fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
  const a = windHash(ix, iz) + (windHash(ix + 1, iz) - windHash(ix, iz)) * fx;
  const b = windHash(ix, iz + 1) + (windHash(ix + 1, iz + 1) - windHash(ix, iz + 1)) * fx;
  return a + (b - a) * fz;
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/**
 * The gust envelope at a plant root, 0 (calm spell) .. 1 (the heart of a
 * strong front): the shader's `esEnv`. Zero whenever gustiness is zero.
 */
export function windGustEnvelope(originXZ: readonly [number, number], dirXZ: readonly [number, number],
  speedMS: number, gustiness: number, t: number): number {
  const G = WIND_GUST;
  const g = Math.min(1, Math.max(0, gustiness));
  if (g <= 0) return 0;
  const u = originXZ[0] * dirXZ[0] + originXZ[1] * dirXZ[1] - t * (G.driftBase + G.driftPerMS * speedMS);
  const v = -originXZ[0] * dirXZ[1] + originXZ[1] * dirXZ[0];
  const lull = G.lullRange[0] + (G.lullRange[1] - G.lullRange[0]) * windNoise(u / G.lullCellM + 3.1, v / G.lullCellM);
  const p = Math.min(0.95, (G.occupancyBase + G.occupancyPerGust * g) * lull);
  const cv = v / G.crossCellM; const iv = Math.floor(cv); const fv = smoothstep(0, 1, cv - iv);
  const slot = Math.floor(u / G.slotM);
  let env = 0;
  for (let k = slot - 1; k <= slot + 1; k++) {
    const occ = windHash(k, iv) + (windHash(k, iv + 1) - windHash(k, iv)) * fv;
    const present = smoothstep(1 - p - 0.06, 1 - p + 0.06, occ);
    if (present <= 0) continue;
    const centre = (k + G.centreSpan[0] + (G.centreSpan[1] - G.centreSpan[0]) * windHash(k, 3.7)) * G.slotM;
    const half = G.halfLengthM[0] + (G.halfLengthM[1] - G.halfLengthM[0]) * windHash(k, 5.3);
    const s0 = windHash(k + 0.5, iv); const s1 = windHash(k + 0.5, iv + 1);
    const strength = G.strengthRange[0] + (G.strengthRange[1] - G.strengthRange[0]) * (s0 + (s1 - s0) * fv);
    const d = Math.max(0, 1 - ((u - centre) / half) ** 2);
    env = Math.max(env, present * strength * d * d);
  }
  return env;
}

/** The gust multiplier on a tree's bend (the shader's `esGust`): 0.4 in a lull, 2 in a full front. */
export function windGustAt(originXZ: readonly [number, number], dirXZ: readonly [number, number],
  speedMS: number, gustiness: number, t: number): number {
  const g = Math.min(1, Math.max(0, gustiness));
  return 1 + (0.4 + 1.6 * windGustEnvelope(originXZ, dirXZ, speedMS, gustiness, t) - 1) * g;
}

/**
 * How much high-frequency rustle a plant carries, 0..1: it rides the gust
 * envelope and the wind speed, with a floor between fronts only in strong
 * wind (never at 2 m/s).
 */
export function windRustleGate(speedMS: number, gustiness: number, envelope: number): number {
  const G = WIND_GUST;
  const g = Math.min(1, Math.max(0, gustiness));
  const speed = Math.min(1, (speedMS / G.rustleFullMS) ** 2);
  const strong = G.rustleStrongFloor * smoothstep(G.rustleStrongMS[0], G.rustleStrongMS[1], speedMS);
  return speed * Math.max(envelope * g, strong);
}

/**
 * The ground-cover branch of the vertex shader in TypeScript: the downwind
 * lean (`along`) and the cross-wind rustle (`across`), metres, of a vertex
 * `heightM` above the ground of a plant of `plantH` (1 when untuned).
 */
export function groundCoverSway(p: {
  speedMS: number; gustiness: number; dirXZ: readonly [number, number];
  originXZ: readonly [number, number]; heightM: number; plantH?: number; t: number; leafPhase?: number;
}): { along: number; across: number; envelope: number } {
  const G = WIND_GUST;
  const plantH = p.plantH ?? 1;
  const env = windGustEnvelope(p.originXZ, p.dirXZ, p.speedMS, p.gustiness, p.t);
  const g = Math.min(1, Math.max(0, p.gustiness));
  const w = smoothstep(G.coverCalmMS, G.coverFullMS, p.speedMS);
  const freq = (G.coverHz[0] + (G.coverHz[1] - G.coverHz[0]) * w) * 2 * Math.PI;
  const phase = windHash(p.originXZ[0], p.originXZ[1]) * 2 * Math.PI;
  const profile = Math.min(p.heightM / plantH, 1.2) ** 2;
  const push = G.coverSteady + (1 - G.coverSteady) * env * g;
  const along = G.coverLean * plantH * w * profile * push
    * (0.75 + 0.25 * (0.3 + 0.7 * env) * Math.sin(p.t * freq + phase));
  const across = G.rustleCover * plantH * profile * windRustleGate(p.speedMS, p.gustiness, env)
    * Math.sin(p.t * G.rustleRadS + (p.leafPhase ?? 0));
  return { along, across, envelope: env };
}

const G = WIND_GUST;
/** A GLSL float literal. */
const f = (x: number): string => (Number.isInteger(x) ? x.toFixed(1) : String(x));

const VERTEX_HEAD = /* glsl */ `
uniform float esWindTime;
uniform vec3 esWindVec;
uniform float esWindFadeM;
uniform vec3 esWindEye;

#if defined(USE_INSTANCING) && !defined(ES_BATCH_SLOTS)
  // vec3(stiffness - 1, sink metres, plant height metres). Unbound =>
  // (0, 0, 0) => neutral stiffness, no sink, ground-cover height.
  // The foliage batches read the tune from their data texture instead.
  attribute vec3 esWindTune;
#endif
${BATCH_DATA_HEAD}

float esWindHash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

// Value noise, 0..1: the gust field. Four hashes, no texture fetch.
float esWindNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(esWindHash(i), esWindHash(i + vec2(1.0, 0.0)), f.x),
             mix(esWindHash(i + vec2(0.0, 1.0)), esWindHash(i + vec2(1.0, 1.0)), f.x), f.y);
}

// The gust envelope (windGustEnvelope in TS): discrete fronts on a row of
// slots carried downwind, a lull field on their chance, a per-front strength
// draw blended across the wind. 0 in a calm spell, up to 1 in a strong front.
float esGustEnvelope(vec2 origin, vec2 dir, float speedMS, float gust, float t) {
  if (gust <= 0.0) return 0.0;
  float u = dot(origin, dir) - t * (${f(G.driftBase)} + ${f(G.driftPerMS)} * speedMS);
  float v = dot(origin, vec2(-dir.y, dir.x));
  float lull = ${f(G.lullRange[0])} + ${f(G.lullRange[1] - G.lullRange[0])} * esWindNoise(vec2(u / ${f(G.lullCellM)} + 3.1, v / ${f(G.lullCellM)}));
  float p = min(0.95, (${f(G.occupancyBase)} + ${f(G.occupancyPerGust)} * gust) * lull);
  float cv = v / ${f(G.crossCellM)};
  float iv = floor(cv);
  float fv = smoothstep(0.0, 1.0, cv - iv);
  float slot = floor(u / ${f(G.slotM)});
  float env = 0.0;
  for (int j = -1; j <= 1; j++) {
    float k = slot + float(j);
    float occ = mix(esWindHash(vec2(k, iv)), esWindHash(vec2(k, iv + 1.0)), fv);
    float present = smoothstep(1.0 - p - 0.06, 1.0 - p + 0.06, occ);
    float centre = (k + ${f(G.centreSpan[0])} + ${f(G.centreSpan[1] - G.centreSpan[0])} * esWindHash(vec2(k, 3.7))) * ${f(G.slotM)};
    float half_ = ${f(G.halfLengthM[0])} + ${f(G.halfLengthM[1] - G.halfLengthM[0])} * esWindHash(vec2(k, 5.3));
    float strength = ${f(G.strengthRange[0])} + ${f(G.strengthRange[1] - G.strengthRange[0])}
      * mix(esWindHash(vec2(k + 0.5, iv)), esWindHash(vec2(k + 0.5, iv + 1.0)), fv);
    float dd = (u - centre) / half_;
    float d = max(0.0, 1.0 - dd * dd);
    env = max(env, present * strength * d * d);
  }
  return env;
}

// The rustle gate (windRustleGate in TS).
float esRustleGate(float speedMS, float gust, float env) {
  float sp = min(1.0, (speedMS / ${f(G.rustleFullMS)}) * (speedMS / ${f(G.rustleFullMS)}));
  float strong = ${f(G.rustleStrongFloor)} * smoothstep(${f(G.rustleStrongMS[0])}, ${f(G.rustleStrongMS[1])}, speedMS);
  return sp * max(env * gust, strong);
}
`;

/**
 * Injected after `begin_vertex`: three.js builds `transformed` there, and both
 * the colour and the depth material go through that same chunk, which is why
 * the same injection works for both.
 *
 * Three motions, all in world space (GPU Gems 3 ch. 16 hierarchy; the fable5
 * demo's gust fronts, docs/research/rendering/fable5-world-demo-audit.md row 25):
 *  - trunk bend: the whole plant leans and sways downwind, weighted by
 *    (height / plant height)², at a natural frequency that falls with plant
 *    size (a 40 m tree ~0.35 Hz, a 1 m fern ~2 Hz);
 *  - branch sway: vertices away from the trunk axis bob at ~2× that rate with
 *    a phase that drifts smoothly across the crown;
 *  - leaf flutter: the outer, upper vertices jitter at ~7 Hz with a per-vertex
 *    phase; near-field only.
 * The gust is the `WIND_GUST` envelope sampled at the plant's root: separate
 * fronts roll across a stand with calm between them. Leaf flutter and the
 * ground-cover rustle ride that envelope and the wind speed (walk 9: every
 * sedge tip vibrated at 7 Hz in calm air because the old field never let
 * up). Ground cover (no tune) takes its own branch, `groundCoverSway`,
 * because a 1 m blade bends whole where a tree bends at the crown.
 *
 * The weights come from geometry, not vertex colour: 472 of the flora kit's
 * 732 primitives carry no colour attribute, and the rest carry NIF-specific
 * channels, not wind masks.
 */
const VERTEX_BODY = /* glsl */ `
{
  // transformed is still in OBJECT space here; the instance matrix is applied
  // later, in project_vertex. The offset is computed in WORLD space (so a
  // stand bends one way whatever each instance's yaw) and converted back.
  #ifdef ES_BATCH_SLOTS
    // The foliage batches: the tune rides texel 1 of the per-slot data
    // texture (decision 0082 §5).
    mat3 esBasis = mat3(instanceMatrix);
    vec3 esInstanceOrigin = instanceMatrix[3].xyz;
    vec3 esTune = esBatchTexel(1).xyz;
  #elif defined(USE_INSTANCING)
    mat3 esBasis = mat3(instanceMatrix);
    vec3 esInstanceOrigin = instanceMatrix[3].xyz;
    vec3 esTune = esWindTune;
  #else
    mat3 esBasis = mat3(1.0);
    vec3 esInstanceOrigin = vec3(0.0);
    vec3 esTune = vec3(0.0);
  #endif
  vec3 esLocal = esBasis * transformed;
  // Height above the GROUND LINE, not the pivot: terrain species are sunk so a
  // flat base never shows on a slope, and weighting from the pivot moved the
  // trunk where it meets the soil (owner round 6).
  float esHeight = max(0.0, esLocal.y - esTune.y);
  float esStrength = length(esWindVec.xy);
  float esDist = length(esWindEye - esInstanceOrigin);
  float esFade = 1.0 - smoothstep(esWindFadeM * 0.6, esWindFadeM, esDist);
  if (esStrength > 0.0001 && esHeight > 0.01 && esFade > 0.0) {
    float esStiffness = 1.0 + esTune.x;
    // Unknown height (ground cover draws without the tune) reads as 1 m.
    float esPlantH = esTune.z > 0.05 ? esTune.z : 1.0;
    vec2 esDir = esWindVec.xy / esStrength;
    vec2 esPerp = vec2(-esDir.y, esDir.x);
    float esT = esWindTime;
    float esPhase = esWindHash(esInstanceOrigin.xz) * 6.2831853;
    // Gust envelope: separate fronts carried downwind, calm between them.
    float esSpeedMS = esStrength / ${WIND_METRES_PER_MS.toFixed(4)};
    float esGustiness = clamp(esWindVec.z, 0.0, 1.0);
    float esEnv = esGustEnvelope(esInstanceOrigin.xz, esDir, esSpeedMS, esGustiness, esT);
    float esGust = mix(1.0, 0.4 + 1.6 * esEnv, esGustiness);
    float esRustle = esRustleGate(esSpeedMS, esGustiness, esEnv);
    float esLeafPhase = dot(esLocal, vec3(17.3, 11.1, 13.7));
    vec3 esOffset;
    if (esTune.z <= 0.05) {
      // Ground cover (groundCoverSway in TS): a steady lean that scales with
      // the wind, a front's push on top, a slow bend, and the rustle only as
      // a front passes or in strong wind.
      float esW = smoothstep(${f(G.coverCalmMS)}, ${f(G.coverFullMS)}, esSpeedMS);
      float esGcFreq = (${f(G.coverHz[0])} + ${f(G.coverHz[1] - G.coverHz[0])} * esW) * 6.2831853;
      float esGcProfile = min(esHeight / esPlantH, 1.2);
      esGcProfile *= esGcProfile;
      float esPush = ${f(G.coverSteady)} + ${f(1 - G.coverSteady)} * esEnv * esGustiness;
      float esGcLean = ${f(G.coverLean)} * esPlantH * esW * esGcProfile * esPush
        * (0.75 + 0.25 * (0.3 + 0.7 * esEnv) * sin(esT * esGcFreq + esPhase));
      float esGcRustle = ${f(G.rustleCover)} * esPlantH * esGcProfile * esRustle
        * sin(esT * ${f(G.rustleRadS)} + esLeafPhase);
      esOffset = vec3(esDir.x * esGcLean + esPerp.x * esGcRustle, 0.0, esDir.y * esGcLean + esPerp.y * esGcRustle);
      float esGcL = length(esOffset);
      esOffset.y -= esHeight * (1.0 - cos(min(esGcL / max(esHeight, 0.01), 1.0)));
    } else {
    // Trunk bend. Crown amplitude keeps the calibrated pow(H/10, 0.8) law; the
    // profile up the plant is (h/H)², so trunks stay planted and crowns swing.
    float esFreq = clamp(2.2 * inversesqrt(esPlantH), 0.3, 2.2) * 6.2831853;
    float esProfile = min(esHeight / esPlantH, 1.3);
    esProfile *= esProfile;
    float esCrown = pow(min(esPlantH / 10.0, 1.6), 0.8) * esStiffness * esStrength;
    float esOsc = sin(esT * esFreq + esPhase) + 0.4 * sin(esT * esFreq * 1.73 + esPhase * 1.3);
    float esBend = esCrown * esProfile * (0.5 * esGust + 0.35 * esOsc * (0.5 + 0.5 * esGust));
    float esCross = esCrown * esProfile * 0.15 * esGust * sin(esT * esFreq * 0.71 + esPhase * 2.1);
    esOffset = vec3(esDir.x * esBend + esPerp.x * esCross, 0.0,
                    esDir.y * esBend + esPerp.y * esCross);
    // Length-preserving correction: without it a bent plant visibly stretches.
    float esLean = length(esOffset);
    esOffset.y -= esHeight * (1.0 - cos(min(esLean / max(esHeight, 0.01), 1.0)));
    // Branch sway: weight by distance from the trunk axis and height.
    float esRadial = length(esLocal.xz);
    float esOuter = smoothstep(0.06 * esPlantH, 0.4 * esPlantH, esRadial) * min(esHeight / esPlantH, 1.0);
    if (esOuter > 0.0) {
      float esLimb = esStiffness * esStrength * min(esPlantH / 10.0, 1.0) * esGust;
      float esBranchPhase = esPhase + dot(esLocal, vec3(1.0, 0.6, 0.8)) * 2.0 / max(0.3 * esPlantH, 0.5);
      esOffset += vec3(0.6 * esDir.x, 1.0, 0.6 * esDir.y)
        * (0.12 * esLimb * esOuter * sin(esT * esFreq * 2.1 + esBranchPhase));
      // Leaf flutter, near field only (beyond ~60 m it is sub-pixel shimmer),
      // gated like the ground-cover rustle: it shivers as a front passes and
      // in strong wind, never in a light breeze.
      float esNear = 1.0 - smoothstep(30.0, 60.0, esDist);
      esOffset += vec3(esPerp.x, 0.7, esPerp.y)
        * (0.03 * esRustle * esStrength * esGust * esOuter * esNear * sin(esT * ${f(G.rustleRadS)} + esLeafPhase));
    }
    }
    esOffset *= esFade;
    // World -> object: the basis is rotation × uniform scale, so its inverse
    // is transpose / s² (written out: GLSL ES 1.00 has no transpose()).
    float esScaleSq = max(1e-6, dot(esBasis[0], esBasis[0]));
    mat3 esBasisT = mat3(
      esBasis[0][0], esBasis[1][0], esBasis[2][0],
      esBasis[0][1], esBasis[1][1], esBasis[2][1],
      esBasis[0][2], esBasis[1][2], esBasis[2][2]);
    transformed += (esBasisT * esOffset) / esScaleSq;
  }
}
`;

interface WindPatchState {
  esWindUniforms?: WindUniforms;
  /** The exact wrapper we installed — identity-checked by `reapplyWindSway`. */
  esWindWrapped?: THREE.Material["onBeforeCompile"];
  esWindCacheKeyed?: boolean;
}

function installWindHook(material: THREE.Material, uniforms: WindUniforms): void {
  const state = material.userData as WindPatchState;
  state.esWindUniforms = uniforms;
  const previous = material.onBeforeCompile;
  const wrapped: THREE.Material["onBeforeCompile"] = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    if (shader.vertexShader.includes("esWindVec")) return; // never double-bend
    shader.uniforms.esWindTime = uniforms.esWindTime;
    shader.uniforms.esWindVec = uniforms.esWindVec;
    shader.uniforms.esWindFadeM = uniforms.esWindFadeM;
    shader.uniforms.esWindEye = uniforms.esWindEye;
    shader.vertexShader = shader.vertexShader
      .replace("void main() {", `${VERTEX_HEAD}\nvoid main() {`)
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>\n${VERTEX_BODY}`,
      );
  };
  material.onBeforeCompile = wrapped;
  state.esWindWrapped = wrapped;
  if (!state.esWindCacheKeyed) {
    // Without a cache key, a patched material with the same parameters as an
    // unpatched one shares its compiled program and the injection silently
    // never renders (the aerial patch keys every flora material to the SAME
    // constant string, so this collision is not hypothetical).
    state.esWindCacheKeyed = true;
    const previousKey = material.customProgramCacheKey;
    material.customProgramCacheKey = function (this: THREE.Material) {
      return `${previousKey.call(this)}|es-wind`;
    };
  }
  // Any material already compiled by an earlier frame has to be rebuilt, or
  // the injection silently never runs.
  material.needsUpdate = true;
}

/**
 * Patch one material to sway. Safe to call repeatedly on the same material —
 * a material shared across LOD levels must only be patched once, or the
 * injection is applied twice and the plant bends double.
 */
export function applyWindSway(
  material: THREE.Material,
  uniforms: WindUniforms,
): void {
  const state = material.userData as WindPatchState;
  if (state.esWindUniforms) return;
  installWindHook(material, uniforms);
}

/**
 * Restore the sway hook after something else reassigned `onBeforeCompile`.
 *
 * `CSM.setupMaterial` (and anything like it) OVERWRITES `onBeforeCompile`
 * with a plain assignment, which is how round 5 shipped with trees that never
 * moved: the wind hook was installed at mesh build, then wiped ~1 s later by
 * the shadow-cascade patch pass. Whoever runs such a pass must call this on
 * each material afterwards — it is a no-op while our wrapper is still the
 * live hook, and re-wraps (chaining the newcomer, preserving the shader-level
 * double-patch guard) when it is not. Materials never touched by
 * `applyWindSway` are ignored, so it is safe to call on a whole scene.
 */
export function reapplyWindSway(material: THREE.Material): void {
  const state = material.userData as WindPatchState;
  if (!state.esWindUniforms) return;
  if (material.onBeforeCompile === state.esWindWrapped) return;
  installWindHook(material, state.esWindUniforms);
}

/**
 * Patch a colour material AND its shadow-depth twin together.
 *
 * Always prefer this over calling `applyWindSway` twice by hand: the pairing
 * is the whole correctness condition, and having one call site for it is what
 * stops a future edit from re-detaching shadows from their trees.
 */
export function applyWindSwayWithShadow(
  material: THREE.Material,
  depthMaterial: THREE.Material | undefined,
  uniforms: WindUniforms,
): void {
  applyWindSway(material, uniforms);
  if (depthMaterial) applyWindSway(depthMaterial, uniforms);
}
