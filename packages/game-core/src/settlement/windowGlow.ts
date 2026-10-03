import type * as THREE from "three";

/** Warm lamplight colour of a lit window at full night (linear RGB), and its
 * gain over the glTF emissive (the NIF's Glow_Map mask at factor 1). This
 * module imports nothing at runtime, so the look sheets (tooling/visual-look)
 * load it as the game does. */
export const WINDOW_GLOW_LINEAR_RGB = [1.0, 0.6, 0.28] as const;
export const WINDOW_GLOW_GAIN = 2.0;

/**
 * A glow material is one whose kit build carried the NIF's Glow_Map slot
 * into the glTF as an emissive texture (blender/build_kit.py
 * rebuild_material). Selected by that map, never by a material name.
 */
export function isSettlementGlowMaterial(material: THREE.Material): boolean {
  return Boolean((material as THREE.MeshStandardMaterial).emissiveMap);
}
