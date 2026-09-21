/**
 * Per-instance data for BATCHED foliage (decision 0082 §5).
 *
 * `THREE.BatchedMesh` has no instanced attributes, so the two numbers the
 * vegetation shaders need per instance — the LOD band (`lodFade.ts`) and the
 * wind tune (`windSway.ts`) — ride a `DataTexture` indexed by the instance id
 * the shader can see, `getIndirectIndex(gl_DrawID)`. Two RGBA float texels per
 * instance: texel 2i is the band (dIn, dOut, wIn, wOut), texel 2i+1 is
 * (stiffness − 1, sink, 0, 0).
 *
 * The same head also carries the terrain-occlusion mask (`occlusionMask.ts`),
 * because it is read from the same place and by the same instances.
 *
 * `lodFade` and `windSway` both need the head and either may be applied
 * first, so it is written once behind an `#ifndef ES_BATCH_DATA` guard and
 * emitted by all three patches; the preprocessor drops the duplicates.
 */

import * as THREE from "three";

/** RGBA float texels per batch instance. */
export const BATCH_DATA_TEXELS = 2;

const MAX_TEXTURE_WIDTH = 1024;

function nextPow2(n: number): number {
  let w = 1;
  while (w < n) w *= 2;
  return w;
}

/** Uniforms every batched foliage material shares with its depth twin. */
export interface BatchDataUniforms {
  esBatchData: { value: THREE.DataTexture | null };
  esOccMask: { value: THREE.DataTexture | null };
  /** (originCellX, originCellZ, size, cellM) of the occlusion mask. */
  esOccParams: { value: THREE.Vector4 };
}

/** The per-instance data texture for one batch, sized for its capacity. */
export function createBatchDataTexture(capacity: number): THREE.DataTexture {
  const texels = Math.max(1, capacity) * BATCH_DATA_TEXELS;
  // Square-ish, so a small batch does not reserve a full 1024-texel row.
  const width = Math.min(MAX_TEXTURE_WIDTH, nextPow2(Math.ceil(Math.sqrt(texels))));
  const height = Math.max(1, Math.ceil(texels / width));
  const texture = new THREE.DataTexture(
    new Float32Array(width * height * 4),
    width, height, THREE.RGBAFormat, THREE.FloatType,
  );
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/** Write one instance's band and wind tune. */
export function writeBatchInstance(
  texture: THREE.DataTexture,
  id: number,
  band: readonly [number, number, number, number],
  stiffness: number,
  sink: number,
): void {
  const data = texture.image.data as Float32Array;
  const at = id * BATCH_DATA_TEXELS * 4;
  data[at] = band[0];
  data[at + 1] = band[1];
  data[at + 2] = band[2];
  data[at + 3] = band[3];
  data[at + 4] = stiffness;
  data[at + 5] = sink;
  data[at + 6] = 0;
  data[at + 7] = 0;
}

export function createBatchDataUniforms(): BatchDataUniforms {
  return {
    esBatchData: { value: null },
    esOccMask: { value: null },
    esOccParams: { value: new THREE.Vector4(0, 0, 128, 32) },
  };
}

/**
 * The shared vertex head. Injected before `void main()`, where
 * `<batching_pars_vertex>` (and therefore `getIndirectIndex`) is already in
 * scope. Guarded so `lodFade`, `windSway` and `applyBatchData` can all emit it.
 */
export const BATCH_DATA_HEAD = /* glsl */ `
#ifdef USE_BATCHING
#ifndef ES_BATCH_DATA
#define ES_BATCH_DATA
uniform highp sampler2D esBatchData;
uniform highp sampler2D esOccMask;
uniform vec4 esOccParams;
vec4 esBatchTexel(int k) {
  // three declares \`float getIndirectIndex( const in int i )\`: GLSL ES has no
  // implicit float -> int, so the cast is load-bearing (round-2 shader gate).
  int t = int(getIndirectIndex(gl_DrawID)) * ${BATCH_DATA_TEXELS} + k;
  ivec2 sz = textureSize(esBatchData, 0);
  return texelFetch(esBatchData, ivec2(t % sz.x, t / sz.x), 0);
}
#endif
#endif
`;

interface BatchPatchState {
  esBatchUniforms?: BatchDataUniforms;
  esBatchWrapped?: THREE.Material["onBeforeCompile"];
  esBatchCacheKeyed?: boolean;
}

function installBatchHook(
  material: THREE.Material,
  uniforms: BatchDataUniforms,
): void {
  const state = material.userData as BatchPatchState;
  state.esBatchUniforms = uniforms;
  const previous = material.onBeforeCompile;
  const wrapped: THREE.Material["onBeforeCompile"] = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    shader.uniforms.esBatchData = uniforms.esBatchData;
    shader.uniforms.esOccMask = uniforms.esOccMask;
    shader.uniforms.esOccParams = uniforms.esOccParams;
    if (shader.vertexShader.includes("esBatchTexel")) return;
    shader.vertexShader = shader.vertexShader.replace(
      "void main() {", `${BATCH_DATA_HEAD}\nvoid main() {`);
  };
  material.onBeforeCompile = wrapped;
  state.esBatchWrapped = wrapped;
  if (!state.esBatchCacheKeyed) {
    state.esBatchCacheKeyed = true;
    const previousKey = material.customProgramCacheKey;
    material.customProgramCacheKey = function (this: THREE.Material) {
      return `${previousKey.call(this)}|es-batch`;
    };
  }
  material.needsUpdate = true;
}

/** Patch a colour material and its shadow-depth twin. Safe to call twice. */
export function applyBatchData(
  material: THREE.Material,
  depthMaterial: THREE.Material | undefined,
  uniforms: BatchDataUniforms,
): void {
  const state = material.userData as BatchPatchState;
  if (!state.esBatchUniforms) installBatchHook(material, uniforms);
  if (depthMaterial) {
    const depthState = depthMaterial.userData as BatchPatchState;
    if (!depthState.esBatchUniforms) installBatchHook(depthMaterial, uniforms);
  }
}

/** Restore the hook after something else (CSM) reassigned `onBeforeCompile`. */
export function reapplyBatchData(material: THREE.Material): void {
  const state = material.userData as BatchPatchState;
  if (!state.esBatchUniforms) return;
  if (material.onBeforeCompile === state.esBatchWrapped) return;
  installBatchHook(material, state.esBatchUniforms);
}
