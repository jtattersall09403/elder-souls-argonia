/**
 * One foliage batch's patched node material, outside React so the renderer
 * (`Vegetation.tsx`) and the harness scene (`harness/scenes/veg.ts`) build the
 * SAME material from a kit part (decision 0111).
 *
 * The kit material is already a NodeMaterial (`floraKit.ts` converts it once
 * at load). The batch clones it, then patches the clone: wind, the LOD fade
 * (with the from-zero shadow band on the casting mid rung), the batch data
 * texture. The shadow pass reuses the same material's nodes, so there is no
 * depth twin; the from-zero band lives in its shadow slots, and `fromZero` is
 * part of the batch key so flagged and unflagged materials stay separate.
 */

import { cloneNodeMaterial } from "@elder-souls/game-core/render/nodes/materialNodes";
export { cloneNodeMaterial };
import type { NodeMaterial } from "three/webgpu";
import { applyWindSway, type WindUniforms } from "@elder-souls/game-core/fx/windSway";
import { applyLodFade, type LodFadeUniforms } from "@elder-souls/game-core/fx/lodFade";
import {
  applyBatchData,
  createBatchDataUniforms,
  type BatchDataUniforms,
} from "@elder-souls/game-core/fx/batchData";

/**
 * DIAGNOSTIC SWITCH values (`?vegshader=…`, read in `Vegetation.tsx`):
 * `off` no patch at all, `lod` fade + batch data only, `wind` wind + batch
 * data only, `noaerial` all three with `fog = false`.
 */
export type VegShaderMode = "all" | "off" | "lod" | "wind" | "noaerial";

/** The patched material one batch KEY owns, kept across capacity growth. */
export interface BatchMaterials {
  material: NodeMaterial;
  /** Per-batch data texture node + the shared occlusion mask and window. */
  uniforms: BatchDataUniforms;
}


export function makeBatchMaterial(
  material: NodeMaterial,
  opts: {
    wind: WindUniforms;
    lodFade: LodFadeUniforms;
    /** The shared occlusion mask and window every batch reads. */
    batchUniforms: BatchDataUniforms;
    /** Casting mid rung: the shadow ignores the copy's inner edge. */
    fromZero: boolean;
    mode?: VegShaderMode;
  },
): BatchMaterials {
  const mode = opts.mode ?? "all";
  const clone = cloneNodeMaterial(material);
  const uniforms = createBatchDataUniforms(opts.batchUniforms);
  // EVERY batch material is wind-patched, unconditionally: a batch key is a
  // material, and a rock and a plant can share one glTF material, so a
  // `sways` test here silenced whichever species did not create the batch.
  // Stillness is per INSTANCE: a non-swaying species and every card copy
  // carry stiffness -1 in the data texture.
  if (mode !== "off") {
    if (mode !== "lod") applyWindSway(clone, opts.wind);
    if (mode !== "wind") {
      applyLodFade(clone, opts.lodFade, { shadowBandFromZero: opts.fromZero });
    }
    applyBatchData(clone, undefined, uniforms);
  }
  if (mode === "noaerial") clone.fog = false;
  return { material: clone, uniforms };
}
