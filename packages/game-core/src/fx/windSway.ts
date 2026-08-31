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
  /** Seconds, monotonic. Advanced once per frame by `updateWindSway`. */
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
  deltaSeconds: number,
  wind: { windDirXZ: readonly [number, number]; windSpeedMS: number; gustiness: number },
): void {
  uniforms.esWindTime.value += deltaSeconds;
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
  // Instance origin in world space. Height above the instance's OWN base (not
  // above sea level) is what weights the bend, so a trunk's foot never slides.
  #ifdef USE_INSTANCING
    vec3 esInstanceOrigin = instanceMatrix[3].xyz;
    float esHeight = max(0.0, (instanceMatrix * vec4(transformed, 1.0)).y - esInstanceOrigin.y);
  #else
    vec3 esInstanceOrigin = vec3(0.0);
    float esHeight = max(0.0, transformed.y);
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
    // Weight by height^1.5: crowns swing, mid-trunk barely moves, base is
    // pinned. Normalised against a nominal 10 m plant so tall trees do not
    // bend proportionally further than short ones.
    float esWeight = pow(min(esHeight / 10.0, 1.6), 1.5);
    float esFade = 1.0 - smoothstep(esWindFadeM * 0.6, esWindFadeM,
                                    length(cameraPosition - esInstanceOrigin));
    vec2 esOffset = esWindVec.xy * esWeight * esFade * (0.65 + 0.35 * esGust);
    transformed.xz += esOffset;
    // Length-preserving correction: without it a bent plant visibly stretches.
    transformed.y -= esHeight * (1.0 - cos(min(length(esOffset) / max(esHeight, 0.01), 1.0)));
  }
}
`;

/**
 * Patch one material to sway. Safe to call repeatedly on the same material —
 * a material shared across LOD levels must only be patched once, or the
 * injection is applied twice and the plant bends double.
 */
export function applyWindSway(
  material: THREE.Material,
  uniforms: WindUniforms,
): void {
  const flagged = material.userData as { esWindPatched?: boolean };
  if (flagged.esWindPatched) return;
  flagged.esWindPatched = true;
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
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
  // Any material already compiled by an earlier frame has to be rebuilt, or
  // the injection silently never runs.
  material.needsUpdate = true;
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
