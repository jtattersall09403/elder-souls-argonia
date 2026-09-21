/**
 * Distance-stepped LOD for instanced vegetation, rocks and dressing — the
 * companion injection to `windSway.ts`, the same shape (chained
 * `onBeforeCompile`, a shared uniform block, a cache-key suffix, a `reapply`
 * hook for the CSM pass that overwrites `onBeforeCompile`).
 *
 * THE RULE (16f round 5, decision 0075; the Skyrim rule): a species has a
 * LADDER of distance intervals that tile the distance line from 0 to its draw
 * distance, each naming one kit level (full mesh, a decimated mesh, the baked
 * card). At any camera distance exactly one interval holds, and that level is
 * drawn — a hard step at every boundary, chosen per pixel from the live
 * camera distance. Nothing dissolves between levels. The one fade is the
 * VANISH at the end of the ladder for things that do vanish (a ground plant
 * at 100 m, a rock at 70 m): a short screen-door dither to nothing, which is
 * what Skyrim's object fade does too. Land trees never vanish inside the
 * loaded ring (their ladder ends past it), so they never take that edge.
 *
 * Why it cannot hole. Since decision 0082 the renderer emits every instance
 * into EVERY rung of its ladder, both band edges closed, once when its cell
 * is built; the emitted copies therefore tile the whole distance line by
 * construction and exactly one is kept at any camera distance, forever. There
 * is no rebuild margin and no rebuild: the CPU never chooses a level, it only
 * gates whole rungs of a cell that cannot be seen (`vegetation/cellGating`).
 * Rounds 2–4 instead emitted copies within a margin of the CHARACTER's
 * position and faded from the CAMERA's, so closed edges faced copies that
 * were never emitted (every rock: three rungs merged into one band that
 * dissolved at 24 m with nothing behind it). The pre-0082 rule survives as
 * the parity ORACLE in `vegetation/cellBuild.test.ts`, which asserts the
 * emitted rungs pick the same level it did at every distance.
 *
 * The dither, where it is used, is a partition: the copy fading IN keeps the
 * pixels whose Bayer threshold is BELOW its factor, the copy fading OUT keeps
 * those AT OR ABOVE the same factor. With a half-width of 0 both factors are
 * `step(edge, d)` and the partition is the hard step. The ground-cover ring
 * still dissolves its tile bands this way (every tier copy of a plant exists
 * at once there, so its partition is exact by construction). It works in the
 * depth pass and on opaque rocks because the discard is the first statement
 * of `main()`, before any texture fetch.
 *
 * `lodFadeFactors` and `lodPixelKept` below are the SAME arithmetic in
 * TypeScript, so the coverage invariant is unit-tested without a GPU; the
 * GLSL is asserted to carry the same comparison.
 *
 * The per-instance band is an instanced `vec4` attribute, `esLodBand` =
 * (dIn, dOut, wIn, wOut) in metres: kept from `dIn` (stepped, or dithered
 * across `dIn ± wIn`) to `dOut` (likewise). `dIn <= 0` means "already in";
 * `dOut >= LOD_OPEN_M` (or `<= 0`) means "never out" — so (0,0,0,0), which
 * is what WebGL hands an unbound attribute, decodes to "fully visible".
 *
 * Distance is measured from `esLodViewPos`, an explicit uniform, NOT from the
 * built-in `cameraPosition`: in the shadow pass `cameraPosition` is the light,
 * which would fade a plant's shadow out while the plant stayed. The CPU side
 * measures from the same camera position (`Vegetation.tsx`), never from the
 * character.
 */

import * as THREE from "three";
import { BATCH_DATA_HEAD } from "./batchData";
import { OCCLUSION_MIN_DISTANCE_M } from "../render/terrainOcclusion";

/** The uniform block a group of vegetation materials shares. */
export interface LodFadeUniforms {
  /** The real camera's world position, set every frame by the renderer. */
  esLodViewPos: { value: THREE.Vector3 };
}

/** Instanced `vec4` attribute: (dIn, dOut, wIn, wOut), metres. */
export const LOD_BAND_ATTRIBUTE = "esLodBand";

/** An edge at or beyond this is open: the copy never steps out there. */
export const LOD_OPEN_M = 1e9;

/**
 * Half-width, in metres, of a dithered edge where one is used (the ground
 * ring's tile bands; `lodRings` keeps mesh rungs at least 2× this apart so a
 * rung is never narrower than one band).
 */
export const LOD_BAND_M = 5;

/** Dither half-width of the vanish at the end of a ladder. */
export const LOD_CULL_BAND_M = 8;

/** One rung of a species' ladder: kit level `level` is drawn for camera distances in [lo, hi). */
export interface LodRung {
  level: number;
  lo: number;
  hi: number;
}

/**
 * A species' ladder from its ring distances and its kit chain. Rung i of the
 * rings resolves to kit level min(i, last mesh level); the rung past the
 * last ring is the card where the species has one, else the last mesh
 * level. Rungs are clipped to `maxDraw`, and adjacent rungs that resolve to
 * the SAME kit level are one rung (a rock with one level has a one-rung
 * ladder; drawing it twice with a fade edge between the two copies was the
 * round-4 rock defect). The result tiles [0, maxDraw).
 */
export function lodLadder(
  rings: readonly number[],
  meshLevels: number,
  cardLevel: number | null,
  maxDraw: number,
): LodRung[] {
  const out: LodRung[] = [];
  let lo = 0;
  for (let i = 0; i <= rings.length; i++) {
    const hi = i < rings.length ? Math.min(rings[i], maxDraw) : maxDraw;
    const level = i < rings.length || cardLevel === null
      ? Math.min(meshLevels - 1, i)
      : cardLevel;
    if (hi > lo) {
      const last = out[out.length - 1];
      if (last && last.level === level) last.hi = hi;
      else out.push({ level, lo, hi });
    }
    lo = Math.max(lo, hi);
    if (lo >= maxDraw) break;
  }
  return out;
}

export function createLodFadeUniforms(): LodFadeUniforms {
  return { esLodViewPos: { value: new THREE.Vector3() } };
}

/** The vertex shader's `esLodRamp`: a hard step at `edge` when `w` is 0, else a smoothstep across `edge ± w`. */
function ramp(edge: number, w: number, x: number): number {
  if (!(w > 0)) return x >= edge ? 1 : 0;
  const t = Math.min(1, Math.max(0, (x - (edge - w)) / (2 * w)));
  return t * t * (3 - 2 * t);
}

/**
 * The fade factors one copy carries at distance `d`, exactly as the vertex
 * shader computes them from its `esLodBand`: `fadeIn` rises 0→1 across the
 * inner edge (1 = fully in; `dIn <= 0` is always 1), `fadeOut` rises 0→1
 * across the outer edge (0 = fully in, 1 = gone; `dOut <= 0` or open is
 * always 0). Both are the RAW ramp — no `1 -` anywhere — so the copy
 * fading out at a ring holds the bit-identical number the copy fading in
 * holds, and the two comparisons in `lodPixelKept` are exact complements.
 */
export function lodFadeFactors(
  band: readonly [number, number, number, number],
  d: number,
): { fadeIn: number; fadeOut: number } {
  const [dIn, dOut, wIn, wOut] = band;
  const fadeIn = dIn <= 0 ? 1 : ramp(dIn, wIn, d);
  const fadeOut = dOut <= 0 || dOut >= LOD_OPEN_M ? 0 : ramp(dOut, wOut, d);
  return { fadeIn, fadeOut };
}

/** The 4×4 ordered-dither thresholds `esBayer4` produces: k/16, k = 0..15. */
export const BAYER4_THRESHOLDS: readonly number[] = Array.from(
  { length: 16 },
  (_, k) => k / 16,
);

/**
 * The LARGEST threshold `esBayer4` produces (15/16). A fragment test
 * `bayer >= fadeIn` rejects every pixel once `fadeIn <= 0`; `bayer < fadeOut`
 * rejects every pixel once `fadeOut` passes this value, not at 1.
 */
export const BAYER4_MAX: number = BAYER4_THRESHOLDS[BAYER4_THRESHOLDS.length - 1];

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
  return factors.fadeIn <= 0 || factors.fadeOut > BAYER4_MAX;
}

const VERTEX_HEAD = /* glsl */ `
uniform vec3 esLodViewPos;
varying vec2 vEsLod;
// A hard step at the edge when the half-width is 0 (smoothstep with equal
// edges is undefined in GLSL), else a dither ramp across edge ± w.
float esLodRamp(float edge, float w, float d) {
  return w > 0.0 ? smoothstep(edge - w, edge + w, d) : step(edge, d);
}

#ifdef USE_INSTANCING
  // vec4(dIn, dOut, wIn, wOut) metres. Unbound => (0,0,0,0) => fully visible.
  attribute vec4 esLodBand;
#endif
${BATCH_DATA_HEAD}
`;

const VERTEX_BODY = /* glsl */ `
{
  #ifdef USE_INSTANCING
    vec3 esLodOrigin = instanceMatrix[3].xyz;
    vec4 esBand = esLodBand;
  #elif defined(USE_BATCHING)
    // BatchedMesh has no instanced attributes: the band rides texel 0 of the
    // per-instance data texture (decision 0082 §5).
    vec3 esLodOrigin = batchingMatrix[3].xyz;
    vec4 esBand = esBatchTexel(0);
  #else
    vec3 esLodOrigin = vec3(0.0);
    vec4 esBand = vec4(0.0);
  #endif
  float esLodD = distance(esLodViewPos.xz, esLodOrigin.xz);
  // (fadeIn, fadeOut): both RAW smoothsteps — see lodFadeFactors(). The copy
  // fading out at a ring must hold the bit-identical number the copy fading
  // in holds, so the fragment test below partitions the pixels exactly.
  float esLodIn = esBand.x <= 0.0 ? 1.0 : esLodRamp(esBand.x, esBand.z, esLodD);
  float esLodOut = (esBand.y <= 0.0 || esBand.y >= 1e8)
    ? 0.0
    : esLodRamp(esBand.y, esBand.w, esLodD);
  vEsLod = vec2(esLodIn, esLodOut);
  // A copy that is fully faded out still costs a full transform, rasterisation
  // and a discarded fragment for every pixel it covers — and the crossfade
  // doubles how many such copies exist. Collapsing every vertex onto the
  // pivot makes its triangles zero-area, so the rasteriser produces no
  // fragments at all and the copy costs vertex work only. The fragment test
  // below already discards EVERY pixel once esLodOut passes the largest Bayer
  // threshold, so the collapse tail is BAYER4_MAX, not 1.
  if (esLodIn <= 0.0 || esLodOut > ${BAYER4_MAX}) transformed = vec3(0.0);
  #ifdef USE_BATCHING
  // Terrain occlusion, read from the incrementally swept mask rather than
  // decided on the CPU per instance (decision 0082 §6). 0071's rule is
  // unchanged: nothing nearer than OCCLUSION_MIN_DISTANCE_M is ever culled.
  if (esLodD > ${OCCLUSION_MIN_DISTANCE_M.toFixed(1)}) {
    ivec2 esOccCell =
      ivec2(floor(esLodOrigin.xz / esOccParams.w)) - ivec2(esOccParams.xy);
    int esOccSize = int(esOccParams.z);
    if (esOccCell.x >= 0 && esOccCell.y >= 0
        && esOccCell.x < esOccSize && esOccCell.y < esOccSize
        && texelFetch(esOccMask, esOccCell, 0).r > 0.5) {
      transformed = vec3(0.0);
    }
  }
  #endif
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
