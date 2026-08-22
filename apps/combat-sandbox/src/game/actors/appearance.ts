import * as THREE from "three";

import type { Appearance } from "./races";

/**
 * Colouring a character.
 *
 * One function, applied to a loaded body: every mesh named as skin gets the
 * skin tint multiplied over its diffuse, every mesh named as hair gets the hair
 * tint. Nothing here knows what a race is — it takes an `Appearance` — which is
 * what makes it the same call for a race default, an NPC variant and, when
 * there is one, a character creator moving a slider.
 *
 * Renderer-level and free of React on purpose: tinting is a property of the
 * material instance, and the actor already clones its materials per fighter so
 * two Nords can be coloured differently without either affecting the other.
 */

export type TintedMaterial = {
  material: THREE.MeshStandardMaterial;
  /** The colour the asset shipped with, restored when the tint is removed. */
  original: THREE.Color;
};

/** Apply an appearance to a loaded body. Returns what it touched. */
export function applyAppearance(
  model: THREE.Object3D,
  appearance: Appearance,
): TintedMaterial[] {
  const skin = new Set(appearance.skinMeshes.map(sanitize));
  const hair = new Set(appearance.hairMeshes.map(sanitize));
  if (skin.size === 0 && hair.size === 0) return [];

  const touched: TintedMaterial[] = [];
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const name = sanitize(object.name);
    const tint = skin.has(name) ? appearance.skinTint : hair.has(name) ? appearance.hairTint : null;
    if (!tint) return;
    for (const material of materialsOf(object)) {
      if (!(material instanceof THREE.MeshStandardMaterial)) continue;
      touched.push({ material, original: material.color.clone() });
      // Multiplied, not replaced: the diffuse still carries every fold, pore
      // and shadow the artist painted, and the tint decides its colour.
      material.color.multiply(new THREE.Color(tint[0], tint[1], tint[2]));
    }
  });
  return touched;
}

/** Undo `applyAppearance`, leaving the materials as the asset shipped them. */
export function clearAppearance(touched: readonly TintedMaterial[]) {
  for (const entry of touched) entry.material.color.copy(entry.original);
}

function materialsOf(mesh: THREE.Mesh) {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

/**
 * glTF sanitises node names on load, and the roster records the authored ones.
 * Key both sides the same way so `MaleUnderwearBody:0` matches.
 */
function sanitize(name: string) {
  return THREE.PropertyBinding.sanitizeNodeName(name);
}
