/**
 * Dithered LOD crossfade for instanced vegetation — the companion injection to
 * `windSway.ts`, and deliberately the same shape (chained `onBeforeCompile`, a
 * shared uniform block, a cache-key suffix, a `reapply` hook for the CSM pass
 * that overwrites `onBeforeCompile`).
 *
 * The defect it fixes: an instance swapped from its full mesh to a decimated
 * level, or from a level to its billboard card, in ONE frame — the owner's
 * single hard jump between quality levels. The industry answer is not to blend
 * (alpha blending sorts wrongly through a canopy and costs the most on the
 * devices that can least afford it) but to DITHER: draw both levels over a
 * band of metres, and discard each one's fragments against a screen-space
 * Bayer threshold. The two copies use complementary smoothsteps against the
 * SAME threshold pattern, so for every pixel exactly one of them survives —
 * no double coverage, no holes, no sorting, and it works in the depth pass and
 * on opaque rocks because the discard is injected after `alphatest_fragment`.
 *
 * The per-instance band is an instanced `vec4` attribute, `esLodBand` =
 * (dIn, dOut, wIn, wOut) in metres: fade in across `dIn ± wIn`, out across
 * `dOut ± wOut`. `dIn <= 0` means "already in"; `dOut <= 0` or `dOut >= 1e8`
 * means "never fades out" — and (0,0,0,0), which is what WebGL hands an
 * unbound attribute, therefore decodes to "fully visible, no fade", exactly
 * the behaviour before this existed.
 *
 * Distance is measured from `esLodViewPos`, an explicit uniform, NOT from the
 * built-in `cameraPosition`: in the shadow pass `cameraPosition` is the light,
 * which would fade a plant's shadow out while the plant stayed.
 */

import * as THREE from "three";

/** The uniform block a group of vegetation materials shares. */
export interface LodFadeUniforms {
  /** The real camera's world position, set every frame by the renderer. */
  esLodViewPos: { value: THREE.Vector3 };
}

/** Instanced `vec4` attribute: (dIn, dOut, wIn, wOut), metres. */
export const LOD_BAND_ATTRIBUTE = "esLodBand";

/**
 * Half-width, in metres, of each crossfade band. Both copies of a crossfading
 * instance are drawn over `2 × LOD_BAND_M`, so this is paid in instances.
 */
export const LOD_BAND_M = 5;

/**
 * Metres of movement between rebuilds (`REBUILD_MOVE_M` in the renderer).
 * The overlap has to be at least this plus the band half-width, or the camera
 * can walk past a boundary between two rebuilds and see the swap happen with
 * no second copy drawn at all.
 */
export const LOD_REBUILD_MOVE_M = 16;

/** How far either side of a ring an instance is emitted into BOTH levels. */
export const LOD_OVERLAP_M = LOD_REBUILD_MOVE_M + LOD_BAND_M;

/** Fade-out half-width at the draw-distance cull (wider: it is a vanish). */
export const LOD_CULL_BAND_M = 8;

/** One draw an instance is emitted into, with the band it fades over. */
export interface LodEmission {
  level: number;
  /** (dIn, dOut, wIn, wOut), metres. */
  band: [number, number, number, number];
}

/**
 * The band level `level` occupies: from its ring's inner bound to its outer
 * one. Level 0 starts at 0, which the shader reads as "no fade-in"; the last
 * level ends at the species' draw distance and fades out there.
 */
function bandFor(
  level: number,
  rings: readonly number[],
  maxDraw: number,
): [number, number, number, number] {
  const lo = level > 0 ? rings[level - 1] : 0;
  const last = level >= rings.length;
  const hi = last ? maxDraw : rings[level];
  return [lo, hi, LOD_BAND_M, last ? LOD_CULL_BAND_M : LOD_BAND_M];
}

/**
 * Which draws one instance at distance `d` goes into, and over what band.
 *
 * Normally one. Inside `overlap` of a ring it is two — the level it is in and
 * the neighbour it is about to become — with complementary bands: the inner
 * copy fades OUT across the ring, the outer one fades IN across the same ring
 * with the same half-width. Pure, so the arithmetic is testable without a GPU.
 */
export function lodEmissions(
  d: number,
  rings: readonly number[],
  maxDraw: number,
  overlap: number = LOD_OVERLAP_M,
): LodEmission[] {
  let level = rings.length;
  for (let i = 0; i < rings.length; i++) {
    if (d < rings[i]) {
      level = i;
      break;
    }
  }
  const band = bandFor(level, rings, maxDraw);
  const out: LodEmission[] = [{ level, band }];
  const [lo, hi] = band;
  if (level < rings.length && d > hi - overlap) {
    out.push({ level: level + 1, band: bandFor(level + 1, rings, maxDraw) });
  }
  if (level > 0 && d < lo + overlap) {
    out.push({ level: level - 1, band: bandFor(level - 1, rings, maxDraw) });
  }
  return out;
}

export function createLodFadeUniforms(): LodFadeUniforms {
  return { esLodViewPos: { value: new THREE.Vector3() } };
}

const VERTEX_HEAD = /* glsl */ `
uniform vec3 esLodViewPos;
varying float vEsLod;

#ifdef USE_INSTANCING
  // vec4(dIn, dOut, wIn, wOut) metres. Unbound => (0,0,0,0) => fully visible.
  attribute vec4 esLodBand;
#endif
`;

const VERTEX_BODY = /* glsl */ `
{
  #ifdef USE_INSTANCING
    vec3 esLodOrigin = instanceMatrix[3].xyz;
    vec4 esBand = esLodBand;
  #else
    vec3 esLodOrigin = vec3(0.0);
    vec4 esBand = vec4(0.0);
  #endif
  float esLodD = distance(esLodViewPos.xz, esLodOrigin.xz);
  float esLodIn = esBand.x <= 0.0
    ? 1.0
    : smoothstep(esBand.x - esBand.z, esBand.x + esBand.z, esLodD);
  float esLodOut = (esBand.y <= 0.0 || esBand.y >= 1e8)
    ? 1.0
    : 1.0 - smoothstep(esBand.y - esBand.w, esBand.y + esBand.w, esLodD);
  vEsLod = min(esLodIn, esLodOut);
  // A copy that is fully faded out still costs a full transform, rasterisation
  // and a discarded fragment for every pixel it covers — and the crossfade
  // doubles how many such copies exist. Collapsing every vertex onto the
  // pivot makes its triangles zero-area, so the rasteriser produces no
  // fragments at all and the copy costs vertex work only.
  if (vEsLod <= 0.0) transformed = vec3(0.0);
}
`;

const FRAGMENT_HEAD = /* glsl */ `
varying float vEsLod;

// 4x4 ordered (Bayer) dither, built arithmetically: GLSL ES 1.00 forbids
// indexing a const array with a non-constant expression, so the usual lookup
// table is not portable to WebGL1-class targets.
float esBayer2(vec2 a) {
  a = floor(a);
  return fract(a.x * 0.5 + a.y * a.y * 0.75);
}
float esBayer4(vec2 a) {
  return esBayer2(a * 0.5) * 0.25 + esBayer2(a);
}
`;

// FIRST thing in main(), before any texture fetch: a fragment the dither
// rejects must not pay for sampling the albedo/normal/roughness maps it was
// never going to use. (It runs before the alpha test rather than after it for
// the same reason — and it is injected into the depth material too, so a
// half-faded plant's shadow dissolves with it.)
const FRAGMENT_BODY = /* glsl */ `
  if (vEsLod < esBayer4(gl_FragCoord.xy)) discard;
`;

interface LodPatchState {
  esLodUniforms?: LodFadeUniforms;
  esLodWrapped?: THREE.Material["onBeforeCompile"];
  esLodCacheKeyed?: boolean;
}

function installLodHook(material: THREE.Material, uniforms: LodFadeUniforms): void {
  const state = material.userData as LodPatchState;
  state.esLodUniforms = uniforms;
  const previous = material.onBeforeCompile;
  const wrapped: THREE.Material["onBeforeCompile"] = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    if (shader.vertexShader.includes("esLodViewPos")) return; // never double-patch
    shader.uniforms.esLodViewPos = uniforms.esLodViewPos;
    shader.vertexShader = shader.vertexShader
      .replace("void main() {", `${VERTEX_HEAD}\nvoid main() {`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${VERTEX_BODY}`);
    shader.fragmentShader = shader.fragmentShader.replace(
      "void main() {",
      `${FRAGMENT_HEAD}\nvoid main() {\n${FRAGMENT_BODY}`,
    );
  };
  material.onBeforeCompile = wrapped;
  state.esLodWrapped = wrapped;
  if (!state.esLodCacheKeyed) {
    state.esLodCacheKeyed = true;
    const previousKey = material.customProgramCacheKey;
    material.customProgramCacheKey = function (this: THREE.Material) {
      return `${previousKey.call(this)}|es-lod`;
    };
  }
  material.needsUpdate = true;
}

/** Patch one material to dither-fade. Safe to call repeatedly. */
export function applyLodFade(
  material: THREE.Material,
  uniforms: LodFadeUniforms,
): void {
  const state = material.userData as LodPatchState;
  if (state.esLodUniforms) return;
  installLodHook(material, uniforms);
}

/**
 * Restore the fade hook after something else reassigned `onBeforeCompile`
 * (CSM does, with a plain assignment). Same contract as `reapplyWindSway`:
 * a no-op while our wrapper is live, and safe on materials never patched.
 */
export function reapplyLodFade(material: THREE.Material): void {
  const state = material.userData as LodPatchState;
  if (!state.esLodUniforms) return;
  if (material.onBeforeCompile === state.esLodWrapped) return;
  installLodHook(material, state.esLodUniforms);
}

/**
 * Patch a colour material AND its shadow-depth twin together — the same
 * pairing rule wind has, for the same reason: fade one and not the other and a
 * half-faded plant keeps a solid shadow.
 */
export function applyLodFadeWithShadow(
  material: THREE.Material,
  depthMaterial: THREE.Material | undefined,
  uniforms: LodFadeUniforms,
): void {
  applyLodFade(material, uniforms);
  if (depthMaterial) applyLodFade(depthMaterial, uniforms);
}
