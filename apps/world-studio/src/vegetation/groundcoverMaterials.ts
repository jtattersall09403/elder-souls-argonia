/**
 * The ground-cover ring's kit cards and material patches, outside React so
 * `Groundcover.tsx` and the harness scene (`harness/scenes/gc.ts`) build the
 * same materials (decision 0107).
 *
 * The ground tint (`instanceColor`) needs no patch: a node material multiplies
 * `vInstanceColor` into its diffuse colour whenever the mesh has an
 * `instanceColor` (NodeMaterial.setupDiffuseColor).
 */

import type * as THREE from "three";
import type { NodeMaterial } from "three/webgpu";
import { applyWindSway, type WindUniforms } from "@elder-souls/game-core/fx/windSway";
import { applyLodFade, type LodFadeUniforms } from "@elder-souls/game-core/fx/lodFade";
import { applyCylindricalBillboard } from "@elder-souls/game-core/fx/billboardQuad";
import { patchShared, type PatchMemo } from "@elder-souls/game-core/render/nodes/materialNodes";
import type { FloraKit } from "./floraKit";

export interface KitLevelPart {
  geometry: THREE.BufferGeometry;
  material: NodeMaterial;
}

/**
 * The baked card for each species, read from the GLB ONCE.
 *
 * The kit builder gives a billboard level two mesh children tagged
 * `cardView: "a"` and `"b"` (glTF extras, never node names). Grass uses view A
 * only: a tuft has no distinguished profile worth two atlas slots, and one
 * card per species halves the card tier's draws. `buildFloraKit` does not
 * carry the view tag through its `parts`, so it is looked up here from the
 * scene graph; the material is the kit's own node twin of that card (matched
 * by geometry), so it carries the cut-out flags `buildFloraKit` set.
 *
 * A species with no card simply has no entry, and its mid and far tiers fall
 * back to level 0.
 */
export function buildCardIndex(
  gltf: { scene: THREE.Object3D },
  kit: FloraKit,
): Map<string, KitLevelPart> {
  const cards = new Map<string, KitLevelPart>();
  for (const root of gltf.scene.children) {
    const extras = (root.userData ?? {}) as { assetId?: string };
    const id = extras.assetId ?? (root.name ? root.name.replace("__", ":") : null);
    if (!id) continue;
    const entry = kit.get(id);
    const level = entry && entry.billboardIndex !== null ? entry.levels[entry.billboardIndex] : null;
    if (!level) continue;
    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || cards.has(id)) return;
      const data = (mesh.userData ?? {}) as { billboard?: boolean; cardView?: string };
      if (data.billboard !== true || data.cardView !== "a") return;
      // `buildFloraKit` already dropped a card whose material lost its
      // texture (the "grey slab" defect): no twin, no card.
      const twin = level.parts.find((p) => p.geometry === mesh.geometry)?.material;
      if (!twin) return;
      cards.set(id, { geometry: mesh.geometry, material: twin });
    });
  }
  return cards;
}

/**
 * Patch one ground-cover kit material in place (each feature applies once).
 * A card tier's material is billboarded and never sways: at a card's distance
 * the motion is sub-pixel and it would fight the billboard rotation. The
 * mesh tiers (and every tier of a species with no card) sway.
 */
export function patchGroundcoverPart(
  material: NodeMaterial,
  opts: { wind: WindUniforms; lodFade: LodFadeUniforms; billboard: boolean; memo: PatchMemo },
): void {
  // One node graph per signature, so every kit material shares its build.
  patchShared(material, opts.memo, `groundcover|${opts.billboard ? 1 : 0}`, (m) => {
    if (!opts.billboard) applyWindSway(m, opts.wind);
    applyLodFade(m, opts.lodFade);
    if (opts.billboard) applyCylindricalBillboard(m, opts.lodFade);
  });
}
