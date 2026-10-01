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
 * The gust is a value-noise field advected downwind, sampled at the plant's
 * root: bands of stronger wind visibly roll across a stand. Grass and ground
 * cover take the same code; at their height the trunk bend IS the blade bend
 * and the gust band is the ripple.
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
    // Gust band: 30 m noise cells carried downwind at 2 m/s + 0.6 × wind speed.
    float esSpeedMS = esStrength / ${WIND_METRES_PER_MS.toFixed(4)};
    vec2 esGustAt = (esInstanceOrigin.xz - esDir * esT * (2.0 + 0.6 * esSpeedMS)) / 30.0;
    float esGust = mix(1.0, 0.25 + 1.5 * esWindNoise(esGustAt), clamp(esWindVec.z, 0.0, 1.0));
    // Trunk bend. Crown amplitude keeps the calibrated pow(H/10, 0.8) law; the
    // profile up the plant is (h/H)², so trunks stay planted and crowns swing.
    float esFreq = clamp(2.2 * inversesqrt(esPlantH), 0.3, 2.2) * 6.2831853;
    float esProfile = min(esHeight / esPlantH, 1.3);
    esProfile *= esProfile;
    float esCrown = pow(min(esPlantH / 10.0, 1.6), 0.8) * esStiffness * esStrength;
    float esOsc = sin(esT * esFreq + esPhase) + 0.4 * sin(esT * esFreq * 1.73 + esPhase * 1.3);
    float esBend = esCrown * esProfile * (0.5 * esGust + 0.35 * esOsc * (0.5 + 0.5 * esGust));
    float esCross = esCrown * esProfile * 0.15 * esGust * sin(esT * esFreq * 0.71 + esPhase * 2.1);
    vec3 esOffset = vec3(esDir.x * esBend + esPerp.x * esCross, 0.0,
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
      // Leaf flutter, near field only (beyond ~60 m it is sub-pixel shimmer).
      float esNear = 1.0 - smoothstep(30.0, 60.0, esDist);
      float esLeafPhase = dot(esLocal, vec3(17.3, 11.1, 13.7));
      esOffset += vec3(esPerp.x, 0.7, esPerp.y)
        * (0.03 * esStrength * esGust * esOuter * esNear * sin(esT * 44.0 + esLeafPhase));
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
