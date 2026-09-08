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
  originalOnBeforeCompile: THREE.MeshStandardMaterial["onBeforeCompile"];
  originalProgramCacheKey: THREE.MeshStandardMaterial["customProgramCacheKey"];
};

const SKIN_SHADER_MARKER = "// skyrim facegen rgb tint";

function applySkyrimRgbTint(material: THREE.MeshStandardMaterial, tint: Appearance["skinTint"]) {
  // Actor::UpdateSkinColor passes the NPC's QNAM bytes to the shader as
  // normalised floats. They are shader constants, not an sRGB texture sample,
  // so converting them through Three's sRGB transfer curve makes every race
  // substantially darker than Skyrim does.
  const target = new THREE.Color().setRGB(tint[0], tint[1], tint[2]);
  const detail = new THREE.Vector3(1.01172, 0.996094, 1.01172);
  const previousCompile = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  material.color.set(0xffffff);
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile.call(material, shader, renderer);
    shader.uniforms.skyrimSkinTone = { value: target };
    shader.uniforms.skyrimSkinDetail = { value: detail };
    shader.fragmentShader = shader.fragmentShader
      .replace("void main() {", `uniform vec3 skyrimSkinTone;\nuniform vec3 skyrimSkinDetail;\n${SKIN_SHADER_MARKER}\nvoid main() {`)
      .replace("#include <map_fragment>", `#include <map_fragment>\n${SKIN_SHADER_MARKER}\nvec3 skyrimBase = diffuseColor.rgb;\nvec3 skyrimTintOverlay = skyrimBase * skyrimBase + 2.0 * skyrimSkinTone * skyrimBase - 2.0 * skyrimSkinTone * skyrimBase * skyrimBase;\ndiffuseColor.rgb = skyrimTintOverlay * skyrimSkinDetail;`);
  };
  material.customProgramCacheKey = () => `${previousKey.call(material)}|skyrim-facegen-rgb-tint-v1`;
  material.needsUpdate = true;
}

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
      touched.push({
        material,
        original: material.color.clone(),
        originalOnBeforeCompile: material.onBeforeCompile,
        originalProgramCacheKey: material.customProgramCacheKey,
      });
      if (skin.has(name) && appearance.skinTintMode === "skyrim-rgb-tint") {
        // This is Skyrim's FACEGEN_RGB_TINT overlay equation and constant
        // body-detail factor, applied in linear colour space. The previous
        // luminance remap was an invented grade that flattened the diffuse.
        applySkyrimRgbTint(material, appearance.skinTint);
      } else {
        material.color.multiply(new THREE.Color(tint[0], tint[1], tint[2]));
      }
    }
  });
  return touched;
}

/** Undo `applyAppearance`, leaving the materials as the asset shipped them. */
export function clearAppearance(touched: readonly TintedMaterial[]) {
  for (const entry of touched) {
    entry.material.color.copy(entry.original);
    entry.material.onBeforeCompile = entry.originalOnBeforeCompile;
    entry.material.customProgramCacheKey = entry.originalProgramCacheKey;
    entry.material.needsUpdate = true;
  }
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
