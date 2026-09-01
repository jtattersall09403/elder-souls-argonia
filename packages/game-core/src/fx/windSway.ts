/**
 * Wind sway for instanced vegetation — a vertex-shader injection shared by
 * every plant material in the world.
 *
 * The recipe is the standard one (research/vegetation-scatter-instancing-threejs.md
 * §4, after GPU Gems 3 ch. 16): displace along the wind direction, weighted by
 * height above the instance's own base so trunks stay planted while crowns
 * move; two sines plus a scrolled noise term for gusts; a per-instance phase
 * so a forest never sways in unison; and a distance fade because nobody can
 * see a leaf move at 600 m.
 *
 * **The one thing that must not be got wrong**: alpha-tested foliage casts its
 * shadow through a *separate* `customDepthMaterial`. If the displacement is
 * injected into the colour material only, every tree's shadow stays still
 * while the tree moves and the whole effect reads as broken. `applyWindSway`
 * therefore takes both materials and shares one uniform block between them —
 * same uniforms object, same clock, same code. Detail (per-leaf) bending is
 * deliberately not implemented: our sourced meshes carry no authored vertex
 * colours to drive it, and main bending alone is the documented fallback.
 *
 * Lives in a package rather than in the studio app because it is game
 * rendering, not scene composition (owner ruling 2026-08-30, decision 0038
 * addendum).
 */

import * as THREE from "three";

/** The uniform block a group of vegetation materials shares. */
export interface WindUniforms {
  /** Seconds, monotonic — the caller's elapsed clock, set by `updateWindSway`. */
  esWindTime: { value: number };
  /** Travel direction (XZ unit) × strength, plus gustiness in `z`. */
  esWindVec: { value: THREE.Vector3 };
  /** Beyond this distance from the camera, sway fades to nothing. */
  esWindFadeM: { value: number };
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

export function createWindUniforms(): WindUniforms {
  return {
    esWindTime: { value: 0 },
    esWindVec: { value: new THREE.Vector3(1, 0, 0) },
    esWindFadeM: { value: WIND_FADE_M },
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
): void {
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

// Cheap hash for a per-instance phase, so neighbours are never in step.
float esWindPhase(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}
`;

/**
 * Injected after `project_vertex`'s prerequisites are set up but before the
 * position is used: three.js builds `transformed` in `begin_vertex`, and both
 * the colour and the depth material go through that same chunk — which is
 * exactly why the same injection works for both.
 */
const VERTEX_BODY = /* glsl */ `
{
  // transformed is still in OBJECT space here — three.js applies
  // instanceMatrix later, in project_vertex. That matters more than it looks:
  // adding the wind offset straight to transformed would send it through each
  // instance's own yaw rotation, so every tree in a stand would bend in a
  // different direction. The offset is therefore computed in WORLD space and
  // converted back into object space before it is applied.
  #ifdef USE_INSTANCING
    mat3 esBasis = mat3(instanceMatrix);
    vec3 esInstanceOrigin = instanceMatrix[3].xyz;
    float esHeight = max(0.0, (esBasis * transformed).y);
    // Uniform instance scale, so squared length of any basis column gives s².
    float esScaleSq = max(1e-6, dot(esBasis[0], esBasis[0]));
  #else
    mat3 esBasis = mat3(1.0);
    vec3 esInstanceOrigin = vec3(0.0);
    float esHeight = max(0.0, transformed.y);
    float esScaleSq = 1.0;
  #endif
  float esWindStrength = length(esWindVec.xy);
  if (esWindStrength > 0.0001 && esHeight > 0.01) {
    float esPhase = esWindPhase(esInstanceOrigin.xz) * 6.2831853;
    // Two sines at incommensurate rates plus a slow swell: a gust pattern
    // that never visibly repeats without costing a noise texture fetch.
    float esT = esWindTime;
    float esGust =
        sin(esT * 1.7 + esPhase)
      + 0.5 * sin(esT * 2.9 + esPhase * 1.7)
      + esWindVec.z * sin(esT * 0.31 + esPhase * 0.5);
    // Weight by height^0.8: crowns swing, bases are pinned. Normalised
    // against a nominal 10 m plant. The exponent was 1.5 in round 5 and that
    // made every sub-2 m plant move by millimetres — literally invisible
    // (owner: "couldn't see any movement in a thunderstorm"). 0.8 keeps
    // trunk-pinning (weight still ~0 at the base) while a 1 m fern in a
    // 13 m/s storm oscillates ~±9 cm and a 15 m crown leans ~1.5 m.
    float esWeight = pow(min(esHeight / 10.0, 1.6), 0.8);
    float esFade = 1.0 - smoothstep(esWindFadeM * 0.6, esWindFadeM,
                                    length(cameraPosition - esInstanceOrigin));
    // Half the displacement is oscillation, not standing lean — the moving
    // part is what the eye reads as wind.
    float esAmount = esWeight * esFade * (0.5 + 0.5 * esGust);
    vec3 esWorldOffset = vec3(esWindVec.x, 0.0, esWindVec.y) * esAmount;
    // Length-preserving correction: without it a bent plant visibly stretches.
    float esLean = length(esWorldOffset);
    esWorldOffset.y -= esHeight * (1.0 - cos(min(esLean / max(esHeight, 0.01), 1.0)));
    // World -> object: the basis is rotation × uniform scale, so its inverse
    // is transpose / s². (Written out because GLSL ES 1.00 has no
    // transpose() and no inverse().)
    mat3 esBasisT = mat3(
      esBasis[0][0], esBasis[1][0], esBasis[2][0],
      esBasis[0][1], esBasis[1][1], esBasis[2][1],
      esBasis[0][2], esBasis[1][2], esBasis[2][2]);
    transformed += (esBasisT * esWorldOffset) / esScaleSq;
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
