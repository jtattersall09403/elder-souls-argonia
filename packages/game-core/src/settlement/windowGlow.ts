import type * as THREE from "three";

/** Warm lamplight colour of a lit window at full night (linear RGB). This
 * module imports nothing at runtime, so the look sheets (tooling/visual-look)
 * load it as the game does. */
export const WINDOW_GLOW_LINEAR_RGB = [1.0, 0.6, 0.28] as const;

/** A lit window's SCREEN gain over the glTF emissive. The emissive is
 * exposure-anchored (times 1 / toneMappingExposure, the
 * `esSettlementExposureInv` uniform), so a mid amber texel (sRGB 0.8, 0.55,
 * 0.2) reaches screen-linear ~0.9 before ACES at any exposure and reads
 * amber, under the bloom threshold. Unanchored, the moonless exposure (22)
 * drove it to white (perf c10 F41). */
export const WINDOW_SCREEN_GAIN = 1.5;

/** The emissive scale a renderer at `exposure` needs for a full-night window
 * (the look sheets mirror the shader with it). */
export function windowGlowScale(exposure: number): number {
  return WINDOW_SCREEN_GAIN / exposure;
}

/**
 * A glow material is one whose kit build carried the NIF's Glow_Map slot
 * into the glTF as an emissive texture (blender/build_kit.py
 * rebuild_material). Selected by that map, never by a material name.
 */
export function isSettlementGlowMaterial(material: THREE.Material): boolean {
  return Boolean((material as THREE.MeshStandardMaterial).emissiveMap);
}
