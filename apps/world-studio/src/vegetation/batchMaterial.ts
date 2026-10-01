/**
 * One foliage batch's patched node material, outside React so the renderer
 * (`Vegetation.tsx`) and the harness scene (`harness/scenes/veg.ts`) build the
 * SAME material from a kit part (decision 0111).
 *
 * The kit material is already a NodeMaterial (`floraKit.ts` converts it once
 * at load). The batch clones it, then patches the clone: wind, the LOD fade
 * (with the from-zero shadow band on the casting mid rung), the batch data
 * mark. The shadow pass reuses the same material's nodes, so there is no
 * depth twin; the from-zero band lives in its shadow slots, and `fromZero` is
 * part of the batch key so flagged and unflagged materials stay separate.
 *
 * Shared builds (decision 0111 §shader builds): three keys a shader build by
 * node identity, so a patch run per clone made one build per batch (Riverwalk:
 * BedrollHay01 built 14 times). The patched node slots are memoised per
 * SIGNATURE (material type, the source's node slots, fromZero, mode) in the
 * caller's `BatchPatchMemo` (`patchShared`) and assigned to every later clone; the per-batch
 * data texture is the material's own (`setBatchTexture`), bound per object.
 */

import {
  cloneNodeMaterial, patchShared, type PatchMemo,
} from "@elder-souls/game-core/render/nodes/materialNodes";
export { cloneNodeMaterial };
import type { NodeMaterial } from "three/webgpu";
import { applyWindSway, type WindUniforms } from "@elder-souls/game-core/fx/windSway";
import { applyLodFade, type LodFadeUniforms } from "@elder-souls/game-core/fx/lodFade";
import { applyBatchData, type BatchDataUniforms } from "@elder-souls/game-core/fx/batchData";

/**
 * DIAGNOSTIC SWITCH values (`?vegshader=…`, read in `Vegetation.tsx`):
 * `off` no patch at all, `lod` fade + batch data only, `wind` wind + batch
 * data only, `noaerial` all three with `fog = false`.
 */
export type VegShaderMode = "all" | "off" | "lod" | "wind" | "noaerial";

/** Patched node slots per signature; one per vegetation layer or harness scene. */
export type BatchPatchMemo = PatchMemo;

export function makeBatchMaterial(
  material: NodeMaterial,
  opts: {
    wind: WindUniforms;
    lodFade: LodFadeUniforms;
    /** The layer's one set of batch uniforms (data node, occlusion mask, window). */
    batchUniforms: BatchDataUniforms;
    /** The layer's memo of patched node slots. */
    memo: BatchPatchMemo;
    /** Casting mid rung: the shadow ignores the copy's inner edge. */
    fromZero: boolean;
    mode?: VegShaderMode;
  },
): NodeMaterial {
  const mode = opts.mode ?? "all";
  const clone = cloneNodeMaterial(material);
  if (mode === "noaerial") clone.fog = false;
  if (mode === "off") return clone;
  // Marked first: the feature graphs read the mark when they are BUILT, and
  // every clone carries the same uniforms, so the memoised graphs serve all.
  applyBatchData(clone, undefined, opts.batchUniforms);
  patchShared(clone, opts.memo, `batch|${opts.fromZero ? 1 : 0}|${mode}`, (m) => {
    // EVERY batch material is wind-patched, unconditionally: a batch key is a
    // material, and a rock and a plant can share one glTF material, so a
    // `sways` test here silenced whichever species did not create the batch.
    // Stillness is per INSTANCE: a non-swaying species and every card copy
    // carry stiffness -1 in the data texture.
    if (mode !== "lod") applyWindSway(m, opts.wind);
    if (mode !== "wind") applyLodFade(m, opts.lodFade, { shadowBandFromZero: opts.fromZero });
  });
  return clone;
}
