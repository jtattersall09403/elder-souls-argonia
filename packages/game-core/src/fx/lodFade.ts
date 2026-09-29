/**
 * Distance-stepped LOD for instanced vegetation, rocks and dressing — the
 * companion node feature to `windSway.ts`, the same shape (a function that
 * wraps a NodeMaterial's slots, a shared block of `uniform()` nodes;
 * decision 0107, docs/standards/tsl-shaders.md).
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
 * `step(edge, d)` and the partition is the hard step, which since 2026-09-21
 * is what every rung and every ground-cover tier edge uses (the owner reads
 * the dissolve as smearing; only the vanish at the end of a ladder keeps
 * it). The partition is exact either way. It works in the
 * depth pass and on opaque rocks because the discard is the first statement
 * of `main()`, before any texture fetch.
 *
 * `lodFadeFactors` and `lodPixelKept` below are the SAME arithmetic in
 * TypeScript, so the coverage invariant is unit-tested without a GPU; the
 * node graph mirrors the same comparison (`lodBayer4` mirrors the dither).
 *
 * The per-instance band is an instanced `vec4` attribute, `esLodBand` =
 * (dIn, dOut, wIn, wOut) in metres: kept from `dIn` (stepped, or dithered
 * across `dIn ± wIn`) to `dOut` (likewise). `dIn <= 0` means "already in";
 * `dOut >= LOD_OPEN_M` (or `<= 0`) means "never out" — so (0,0,0,0), which
 * is what WebGL hands an unbound attribute, decodes to "fully visible".
 *
 * Distance is measured from `esLodViewPos`, an explicit uniform node, NOT from
 * the built-in `cameraPosition`: in the shadow pass `cameraPosition` is the light,
 * which would fade a plant's shadow out while the plant stayed. The CPU side
 * measures from the same camera position (`Vegetation.tsx`), never from the
 * character.
 */

import * as THREE from "three";
import type { NodeMaterial } from "three/webgpu";
import * as tsl from "three/tsl";
// TSL chains are typed loosely on purpose (tsl-shaders.md §1).
const {
  bool, distance, float, floor, fract, int, ivec2, positionLocal, screenCoordinate, select,
  smoothstep, step, textureLoad, uniform, vec2, vec3,
} = tsl as unknown as Record<string, TslNode>;
import { batchUniformsOf, instanceDataNode } from "./batchData";
import { instanceMatrixNode, matrixColumn } from "./instanceNodes";
import { OCCLUSION_MIN_DISTANCE_M } from "../render/terrainOcclusion";
import {
  andMask, claimFeature, wrapPosition, type TslNode,
} from "../render/nodes/materialNodes";

/** The uniform block a group of vegetation materials shares. */
export interface LodFadeUniforms {
  /** The real camera's world position (`uniform()` node), set every frame: `.value.copy(camera.position)`. */
  esLodViewPos: { value: THREE.Vector3 } & TslNode;
}

/** Instanced `vec4` attribute: (dIn, dOut, wIn, wOut), metres. */
export const LOD_BAND_ATTRIBUTE = "esLodBand";

/** An edge at or beyond this is open: the copy never steps out there. */
export const LOD_OPEN_M = 1e9;

/**
 * Half-width, in metres, of a dithered edge between two mesh rungs. ZERO from
 * 2026-09-21 (owner: "jump between rungs, no gradual fade" — decision 0075
 * addendum): every rung edge is a hard step, `esLodRamp` degenerating to
 * `step()`. The constant stays because the partition arithmetic is written in
 * terms of it and a half-width of 0 is the hard step by construction; the one
 * surviving dither is the vanish at the end of a ladder (`LOD_CULL_BAND_M`).
 */
export const LOD_BAND_M = 0;

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
  return { esLodViewPos: uniform(new THREE.Vector3()) as LodFadeUniforms["esLodViewPos"] };
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

/**
 * The 4×4 ordered (Bayer) threshold at pixel (`x`, `y`), exactly as the mask
 * node computes it from `screenCoordinate`: `bayer2(a) = fract(⌊a.x⌋/2 +
 * ⌊a.y⌋²·3/4)`, `bayer4(a) = bayer2(a/2)/4 + bayer2(a)`. Every 4×4 tile holds
 * each of `BAYER4_THRESHOLDS` once.
 */
export function lodBayer4(x: number, y: number): number {
  const b2 = (ax: number, ay: number) => {
    const fx = Math.floor(ax);
    const fy = Math.floor(ay);
    const v = fx * 0.5 + fy * fy * 0.75;
    return v - Math.floor(v);
  };
  return b2(x * 0.5, y * 0.5) * 0.25 + b2(x, y);
}

function bayer2Node(a: TslNode): TslNode {
  const f = floor(a);
  return fract(f.x.mul(0.5).add(f.y.mul(f.y).mul(0.75)));
}

function bayer4Node(a: TslNode): TslNode {
  return bayer2Node(a.mul(0.5)).mul(0.25).add(bayer2Node(a));
}

/** `esLodRamp`: a hard step at `edge` when `w` is 0, else a smoothstep across `edge ± w`. */
function rampNode(edge: TslNode, w: TslNode, d: TslNode): TslNode {
  return select(w.greaterThan(0), smoothstep(edge.sub(w), edge.add(w), d), step(edge, d));
}

/** Options for one patched material. */
export interface LodFadeOptions {
  /**
   * Shadow pass only: ignore the copy's inner edge and cast from distance 0
   * (the outer edge is untouched), so the mid rung carries the shadow for
   * everything nearer than its own band too. Becomes `maskShadowNode` and
   * `castShadowPositionNode`; the colour pass is unchanged.
   */
  shadowBandFromZero?: boolean;
}

/**
 * Patch one material to step/dither-fade by its per-instance band. Safe to
 * call repeatedly (a second call is a no-op). Reads the band from the batch
 * data texture on a batch material (`applyBatchData`, either order), from the
 * instanced `esLodBand` attribute otherwise, and treats a plain mesh as fully
 * visible. On a batch material it also applies the terrain-occlusion mask.
 */
export function applyLodFade(
  material: NodeMaterial,
  uniforms: LodFadeUniforms,
  options?: LodFadeOptions,
): void {
  if (!claimFeature(material, "lodFade")) return;
  const fromZero = options?.shadowBandFromZero === true;
  const m = instanceMatrixNode();
  const origin = matrixColumn(m, 3);
  const band = instanceDataNode(material, 0, LOD_BAND_ATTRIBUTE, "vec4");
  const d = distance(uniforms.esLodViewPos.xz, origin.xz);
  // (fadeIn, fadeOut): both RAW ramps — see lodFadeFactors().
  const fadeIn = select(band.x.lessThanEqual(0), float(1), rampNode(band.x, band.z, d));
  const fadeOut = select(
    band.y.lessThanEqual(0).or(band.y.greaterThanEqual(1e8)),
    float(0),
    rampNode(band.y, band.w, d),
  );
  // A fully faded copy collapses onto its pivot (object-space 0; the instance
  // matrix is applied after positionNode): zero-area triangles, no
  // fragments (the tail is BAYER4_MAX, where the mask already rejects all).
  const outGone = fadeOut.greaterThan(BAYER4_MAX);
  let collapse = fadeIn.lessThanEqual(0).or(outGone);
  let shadowCollapse = outGone;
  // Terrain occlusion, read from the swept mask (decision 0082 §6); nothing
  // nearer than OCCLUSION_MIN_DISTANCE_M is ever culled (0071). Decided at
  // build time like the old ES_BATCH_SLOTS define.
  const batch = batchUniformsOf(material);
  if (batch) {
    const params = batch.esOccParams;
    const cell = ivec2(floor(origin.xz.div(params.w))).sub(ivec2(params.xy));
    const size = int(params.z);
    const inside = cell.x.greaterThanEqual(0).and(cell.y.greaterThanEqual(0))
      .and(cell.x.lessThan(size)).and(cell.y.lessThan(size));
    const safe = ivec2(
      cell.x.max(0).min(size.sub(1)),
      cell.y.max(0).min(size.sub(1)),
    );
    const occluded = d.greaterThan(OCCLUSION_MIN_DISTANCE_M).and(inside)
      .and(textureLoad(batch.esOccMask, safe).r.greaterThan(0.5));
    collapse = collapse.or(occluded);
    shadowCollapse = shadowCollapse.or(occluded);
  }
  // Mask BEFORE this feature, for the from-zero shadow mask below.
  const shadowBase = material.maskShadowNode ?? material.maskNode;
  const previousShadowPosition = material.castShadowPositionNode;
  const prePosition = material.positionNode ?? positionLocal;
  wrapPosition(material, (p) => select(collapse, vec3(0, 0, 0), p));
  const lod = vec2(fadeIn, fadeOut).toVarying("vEsLod");
  const bayer = bayer4Node(screenCoordinate.xy);
  // Kept iff bayer < fadeIn AND bayer >= fadeOut (`lodPixelKept`).
  andMask(material, bayer.lessThan(lod.x).and(bayer.greaterThanEqual(lod.y)));
  if (fromZero) {
    const shadowLod = fadeOut.toVarying("vEsLodShadow");
    const keep = bayer.greaterThanEqual(shadowLod);
    material.maskShadowNode = shadowBase ? bool(shadowBase).and(keep) : keep;
    // The shadow collapses on the outer edge (and occlusion) only, from the
    // position as it was before this feature.
    material.castShadowPositionNode = select(
      shadowCollapse, vec3(0, 0, 0), previousShadowPosition ?? prePosition);
  }
  material.needsUpdate = true;
}

/**
 * The old colour-and-depth-twin pairing. The shadow pass now reuses the
 * colour material's nodes, so `depthMaterial` is ignored; `options` (the
 * from-zero shadow band) applies to the colour material's shadow slots.
 */
export function applyLodFadeWithShadow(
  material: NodeMaterial,
  depthMaterial: THREE.Material | undefined,
  uniforms: LodFadeUniforms,
  options?: LodFadeOptions,
): void {
  void depthMaterial;
  applyLodFade(material, uniforms, options);
}
