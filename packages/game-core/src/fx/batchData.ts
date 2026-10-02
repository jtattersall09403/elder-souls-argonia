/**
 * Per-instance data for the foliage batches (decision 0082 §5, 0084 round 12).
 *
 * The two numbers the vegetation shaders need per instance — the LOD band
 * (`lodFade.ts`) and the wind tune (`windSway.ts`) — ride a `DataTexture`
 * shared by every instanced mesh of one batch, indexed by the instance's
 * permanent SLOT in that batch. The slot rides an `esSlot` instanced
 * attribute, because the visible copies are a compact prefix that moves as
 * copies are switched on and off, so no ordering the GPU can see is stable
 * (which is also why the TSL `instanceIndex` is NOT the key).
 * Two RGBA float texels per slot: texel 2i is the band (dIn, dOut, wIn, wOut),
 * texel 2i+1 is (stiffness − 1, sink, plant height m, 0).
 *
 * The same uniforms also carry the terrain-occlusion mask (`occlusionMask.ts`),
 * because it is read from the same place and by the same instances.
 *
 * Node form (decision 0111): `applyBatchData` marks the material; `lodFade`
 * and `windSway` read `batchTexel(material, k)` at BUILD time, so either may
 * be applied before or after `applyBatchData` (the old `ES_BATCH_SLOTS`
 * define). Each batch material carries its own data texture
 * (`setBatchTexture`, again when the batch grows); the shared `esBatchData`
 * node binds it per drawn object, so all batch materials can share one node
 * graph and one shader build. Clone first, then
 * patch: the feature graphs look up the batch mark on the material they were
 * applied to, and `clone()` does not carry the mark.
 */

import * as THREE from "three";
import * as tsl from "three/tsl";
// TSL chains are typed loosely on purpose (tsl-shaders.md §1).
const { float, int, ivec2, texture, textureLoad, textureSize, uniform, vec2, vec4 } = tsl as unknown as Record<string, TslNode>;
import type { TslNode } from "../render/nodes/materialNodes";
import { optionalAttribute, whenInstanced } from "./instanceNodes";
import { sharedUniform } from "../render/nodes/sharedUniform";

/** RGBA float texels per batch instance. */
export const BATCH_DATA_TEXELS = 2;

const MAX_TEXTURE_WIDTH = 1024;

function nextPow2(n: number): number {
  let w = 1;
  while (w < n) w *= 2;
  return w;
}

/** A texture node whose `.value` is the bound texture (swap it to re-point). */
export interface TextureUniformNode {
  value: THREE.Texture;
}

/**
 * Uniforms every foliage batch material shares (the shadow pass reuses them).
 * ONE set per vegetation layer, so every batch material can share one node
 * graph and one shader build (decision 0111 §shader builds): the per-batch
 * data texture is not a node per batch but the material's own texture
 * (`setBatchTexture`), bound per drawn OBJECT by `esBatchSelect`.
 */
export interface BatchDataUniforms {
  /**
   * The data texture node every batch reads. Its `.value` is re-pointed per
   * drawn object to that object's material's batch texture; never set it by hand.
   */
  esBatchData: TextureUniformNode & TslNode;
  /** Always 0; its per-object update binds the drawn object's batch texture. */
  esBatchSelect: TslNode;
  /** Terrain-occlusion mask texture node (R > 0.5 = occluded). */
  esOccMask: TextureUniformNode & TslNode;
  /** (originCellX, originCellZ, size, cellM) of the occlusion mask, a `sharedUniform()` node (frame-wide; read by static draws). */
  esOccParams: { value: THREE.Vector4 } & TslNode;
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

/**
 * Disposes textures a few ticks after they are replaced, so bind groups built
 * off-frame that still reference the old texture never submit a destroyed one.
 * One instance per owner; `tick()` once per frame, `flush()` on unmount.
 */
export function createDeferredDisposer(frames = 3): {
  defer(texture: { dispose(): void }): void;
  tick(): void;
  flush(): void;
} {
  let queue: { texture: { dispose(): void }; age: number }[] = [];
  return {
    defer(texture) { queue.push({ texture, age: 0 }); },
    tick() {
      if (queue.length === 0) return;
      const keep: typeof queue = [];
      for (const item of queue) {
        if (++item.age >= frames) item.texture.dispose();
        else keep.push(item);
      }
      queue = keep;
    },
    flush() {
      for (const item of queue) item.texture.dispose();
      queue = [];
    },
  };
}

/** Write one slot's band and wind tune. */
export function writeBatchInstance(
  texture: THREE.DataTexture,
  id: number,
  band: readonly [number, number, number, number],
  stiffness: number,
  sink: number,
  plantHeightM: number,
): void {
  const data = texture.image.data as Float32Array;
  const at = id * BATCH_DATA_TEXELS * 4;
  data[at] = band[0];
  data[at + 1] = band[1];
  data[at + 2] = band[2];
  data[at + 3] = band[3];
  data[at + 4] = stiffness;
  data[at + 5] = sink;
  data[at + 6] = plantHeightM;
  data[at + 7] = 0;
}

/**
 * A 1×1 zero texture: what an unbound sampler read before a batch is filled.
 * Same format as the texture that replaces it (RGBA float data; the R8
 * occlusion mask), so the bind layout's sample type never changes on a swap.
 */
function placeholderTexture(occlusion = false): THREE.DataTexture {
  const t = occlusion
    ? new THREE.DataTexture(new Uint8Array(1), 1, 1, THREE.RedFormat, THREE.UnsignedByteType)
    : new THREE.DataTexture(new Float32Array(4), 1, 1, THREE.RGBAFormat, THREE.FloatType);
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

const BATCH_TEXTURE_KEY = Symbol("esBatchTexture");

/** Point a batch material at its per-batch data texture (again when it grows). */
export function setBatchTexture(material: THREE.Material, data: THREE.Texture): void {
  (material as unknown as Record<symbol, THREE.Texture>)[BATCH_TEXTURE_KEY] = data;
}

/** The data texture `setBatchTexture` gave a material. */
export function batchTextureOf(material: THREE.Material): THREE.Texture | undefined {
  return (material as unknown as Record<symbol, THREE.Texture | undefined>)[BATCH_TEXTURE_KEY];
}

/**
 * The texture the data node must bind for a drawn object: its OWN material's
 * batch texture. Read from the object, never from the frame's material: in the
 * shadow pass the frame material is the shadow material.
 */
export function objectBatchTexture(object: THREE.Object3D | null | undefined): THREE.Texture | undefined {
  const m = (object as THREE.Mesh | null | undefined)?.material;
  const material = Array.isArray(m) ? m[0] : m;
  return material ? batchTextureOf(material) : undefined;
}

/**
 * Fresh uniforms, one set per vegetation layer (or harness scene). `shared`
 * hands over the occlusion mask and its window.
 */
export function createBatchDataUniforms(
  shared?: Pick<BatchDataUniforms, "esOccMask" | "esOccParams">,
): BatchDataUniforms {
  const empty = placeholderTexture();
  // An explicit uv: a uv-less texture node builds the default `uv`
  // attribute, which batched geometry may lack ("Vertex attribute uv not
  // found"); the node is only ever read with textureSize/textureLoad.
  const esBatchData = texture(empty, vec2(0)) as BatchDataUniforms["esBatchData"];
  // A TextureNode resets its own update type in setup, so the per-object bind
  // rides a uniform that is in every batch graph (it adds 0 to the texel index).
  // three updates OBJECT nodes before it updates the object's bindings.
  const esBatchSelect = (uniform(0, "int") as TslNode).onObjectUpdate(
    (frame: { object?: THREE.Object3D }) => {
      esBatchData.value = objectBatchTexture(frame.object) ?? empty;
      return 0;
    },
  ) as TslNode;
  return {
    esBatchData,
    esBatchSelect,
    esOccMask: shared?.esOccMask
      ?? (texture(placeholderTexture(true)) as BatchDataUniforms["esOccMask"]),
    esOccParams: shared?.esOccParams
      ?? (sharedUniform(new THREE.Vector4(0, 0, 128, 32)) as BatchDataUniforms["esOccParams"]),
  };
}

const BATCH_KEY = Symbol("esBatchUniforms");

/** The batch uniforms a material was marked with, if any. Not copied by `clone()`. */
export function batchUniformsOf(material: THREE.Material): BatchDataUniforms | undefined {
  return (material as unknown as Record<symbol, BatchDataUniforms | undefined>)[BATCH_KEY];
}

/**
 * Texel `k` of the compiled instance's slot: `esBatchData[esSlot * 2 + k]`,
 * row-major over the texture's live width (read on the GPU, so a re-pointed,
 * wider texture needs no rebuild).
 */
export function batchTexelNode(uniforms: BatchDataUniforms, k: number): TslNode {
  const slot = optionalAttribute("esSlot", "float", () => float(0));
  const t = int(slot).mul(BATCH_DATA_TEXELS).add(k).add(uniforms.esBatchSelect);
  const width = int(textureSize(uniforms.esBatchData, 0).x);
  return textureLoad(uniforms.esBatchData, ivec2(t.mod(width), t.div(width)));
}

/**
 * The per-instance vec4 a feature reads: batch texel `k` on a batch-marked
 * instanced material, else the instanced attribute `attributeName`
 * (zero when the geometry lacks it), else zero on a plain mesh. Decided at
 * build time from the MATERIAL the feature patched (captured here, because in
 * the shadow pass the builder's material is the shadow material).
 */
export function instanceDataNode(
  material: THREE.Material,
  k: number,
  attributeName: string,
  type: "vec4" | "vec3" | "vec2",
): TslNode {
  const swz = (v: TslNode) => (type === "vec4" ? v : type === "vec3" ? v.xyz : v.xy);
  const zero = () => swz(vec4(0, 0, 0, 0));
  return whenInstanced(
    () => {
      const batch = batchUniformsOf(material);
      if (batch) {
        const texel = batchTexelNode(batch, k);
        return swz(texel);
      }
      return optionalAttribute(attributeName, type, zero);
    },
    zero,
    type,
  );
}

/**
 * Mark a material as a foliage-batch material (its per-instance data comes
 * from `uniforms`). Safe to call twice. The shadow pass reuses the colour
 * material's nodes, so there is no depth twin: `depthMaterial` is accepted
 * for the old call shape and ignored.
 */
export function applyBatchData(
  material: THREE.Material,
  depthMaterial: THREE.Material | undefined,
  uniforms: BatchDataUniforms,
): void {
  void depthMaterial;
  // Keyed on the symbol, not a userData flag: `clone()` JSON-copies userData
  // but not the symbol, so a flag would make a clone look marked when it is not.
  if (batchUniformsOf(material)) return;
  (material as unknown as Record<symbol, BatchDataUniforms>)[BATCH_KEY] = uniforms;
  material.needsUpdate = true;
}
