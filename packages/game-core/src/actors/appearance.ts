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

const SKIN_SHADER_MARKER = "// elder-souls skin tone";

function colorizeSkin(material: THREE.MeshStandardMaterial, tint: Appearance["skinTint"]) {
  const target = new THREE.Color().setRGB(tint[0], tint[1], tint[2], THREE.SRGBColorSpace);
  const previousCompile = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey;
  material.color.set(0xffffff);
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile.call(material, shader, renderer);
    shader.uniforms.esSkinTone = { value: target };
    shader.fragmentShader = shader.fragmentShader
      .replace("void main() {", `uniform vec3 esSkinTone;\n${SKIN_SHADER_MARKER}\nvoid main() {`)
      .replace("#include <map_fragment>", `#include <map_fragment>\n${SKIN_SHADER_MARKER}\nfloat esSkinLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));\nfloat esSkinDetail = clamp(0.82 + (esSkinLuma - 0.075) * 3.2, 0.52, 1.18);\ndiffuseColor.rgb = esSkinTone * esSkinDetail * diffuse;`);
  };
  material.customProgramCacheKey = () => `${previousKey.call(material)}|elder-souls-skin-v1`;
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
      if (skin.has(name) && appearance.skinTintMode === "colorize") {
        // Skyrim's shared body diffuse is dark baked albedo. A glTF base-colour
        // multiply can only darken it, so reconstruct the selected skin tone
        // from its luminance detail instead of treating it as white paint.
        colorizeSkin(material, appearance.skinTint);
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
