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
 * Bayer threshold. For every pixel exactly one of the two copies survives:
 * the copy fading IN keeps the pixels whose threshold is BELOW its fade
 * factor, the copy fading OUT keeps the pixels whose threshold is AT OR
 * ABOVE the same factor — exact complements, so coverage is 1 at every
 * distance. (Round 3 tested both copies against the same side of the
 * threshold, so the two kept sets NESTED instead of complementing: coverage
 * was max(s, 1-s), half the plant's pixels were empty at the middle of every
 * ring, and every tree, grass card and rock "faded out and back in" as the
 * camera crossed a ring — owner, round 4.) No double coverage, no holes, no
 * sorting, and it works in the depth pass and on opaque rocks because the
 * discard is the first statement of `main()`.
 *
 * `lodFadeFactors` and `lodPixelKept` below are the SAME arithmetic in
 * TypeScript, so the coverage invariant is unit-tested without a GPU; the
 * GLSL is asserted to carry the same comparison.
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

/** GLSL `smoothstep`, for the TypeScript mirror of the vertex shader. */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * The fade factors one copy carries at distance `d`, exactly as the vertex
 * shader computes them from its `esLodBand`: `fadeIn` rises 0→1 across the
 * inner ring (1 = fully in; `dIn <= 0` is always 1), `fadeOut` rises 0→1
 * across the outer ring (0 = fully in, 1 = gone; `dOut <= 0` or `>= 1e8` is
 * always 0). Both are the RAW smoothstep — no `1 -` anywhere — so the copy
 * fading out at a ring holds the bit-identical number the copy fading in
 * holds, and the two comparisons in `lodPixelKept` are exact complements.
 */
export function lodFadeFactors(
  band: readonly [number, number, number, number],
  d: number,
): { fadeIn: number; fadeOut: number } {
  const [dIn, dOut, wIn, wOut] = band;
  const fadeIn = dIn <= 0 ? 1 : smoothstep(dIn - wIn, dIn + wIn, d);
  const fadeOut = dOut <= 0 || dOut >= 1e8 ? 0 : smoothstep(dOut - wOut, dOut + wOut, d);
  return { fadeIn, fadeOut };
}

/** The 4×4 ordered-dither thresholds `esBayer4` produces: k/16, k = 0..15. */
export const BAYER4_THRESHOLDS: readonly number[] = Array.from(
  { length: 16 },
  (_, k) => k / 16,
);

/**
 * Whether a fragment with dither threshold `bayer` survives — the fragment
 * shader's discard, inverted. Kept iff `bayer < fadeIn` AND `bayer >= fadeOut`.
 * At a ring the incoming copy has `fadeIn = s` and the outgoing copy has
 * `fadeOut = s`, so they keep `{bayer < s}` and `{bayer >= s}`: every pixel
 * exactly once.
 */
export function lodPixelKept(
  factors: { fadeIn: number; fadeOut: number },
  bayer: number,
): boolean {
  return bayer < factors.fadeIn && bayer >= factors.fadeOut;
}

/** True when the copy draws nothing at all and the vertex shader collapses it. */
export function lodCopyCollapsed(factors: { fadeIn: number; fadeOut: number }): boolean {
  return factors.fadeIn <= 0 || factors.fadeOut >= 1;
}

const VERTEX_HEAD = /* glsl */ `
uniform vec3 esLodViewPos;
varying vec2 vEsLod;

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
  // (fadeIn, fadeOut): both RAW smoothsteps — see lodFadeFactors(). The copy
  // fading out at a ring must hold the bit-identical number the copy fading
  // in holds, so the fragment test below partitions the pixels exactly.
  float esLodIn = esBand.x <= 0.0
    ? 1.0
    : smoothstep(esBand.x - esBand.z, esBand.x + esBand.z, esLodD);
  float esLodOut = (esBand.y <= 0.0 || esBand.y >= 1e8)
    ? 0.0
    : smoothstep(esBand.y - esBand.w, esBand.y + esBand.w, esLodD);
  vEsLod = vec2(esLodIn, esLodOut);
  // A copy that is fully faded out still costs a full transform, rasterisation
  // and a discarded fragment for every pixel it covers — and the crossfade
  // doubles how many such copies exist. Collapsing every vertex onto the
  // pivot makes its triangles zero-area, so the rasteriser produces no
  // fragments at all and the copy costs vertex work only.
  if (esLodIn <= 0.0 || esLodOut >= 1.0) transformed = vec3(0.0);
}
`;

const FRAGMENT_HEAD = /* glsl */ `
varying vec2 vEsLod;

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
// Kept iff bayer < fadeIn AND bayer >= fadeOut (`lodPixelKept`): the
// incoming copy at a ring keeps {bayer < s}, the outgoing keeps {bayer >= s}.
const FRAGMENT_BODY = /* glsl */ `
  float esLodBayer = esBayer4(gl_FragCoord.xy);
  if (esLodBayer >= vEsLod.x || esLodBayer < vEsLod.y) discard;
`;

/** The fragment test, exported so a test can hold the GLSL to the mirror. */
export const LOD_FRAGMENT_TEST = FRAGMENT_BODY;

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
