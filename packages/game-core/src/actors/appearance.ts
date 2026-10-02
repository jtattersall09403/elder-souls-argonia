import * as THREE from "three";
import type { NodeMaterial } from "three/webgpu";
import * as tsl from "three/tsl";

import type { Appearance } from "./races";
import {
  cloneNodeMaterial, isNodeMaterial, patchShared, toNodeMaterial, wrapColor,
  type PatchMemo, type TslNode,
} from "../render/nodes/materialNodes";

// TSL chains are typed loosely on purpose (tsl-shaders.md §1).
const { uniform, vec3, vec4 } = tsl as unknown as Record<string, TslNode>;

/** Where a tinted material carries its own skin tone (read per drawn object). */
const SKIN_TONE_KEY = "esSkinTone";

/**
 * The FaceGen overlay's node graphs, one per source-material signature
 * (`patchShared`), so every actor shares one shader build (walk 10 (g)).
 * Standard 8: a write-once memo, not shared state. Each entry is a pure
 * function of its key (the patch is fixed; the tone is not baked in but read
 * per drawn object from that object's own material), so no caller can see
 * another's effect through it, and it holds no per-actor value.
 */
const skinToneMemo: PatchMemo = new Map();

/** Make the per-object tone uniform. Called once per memo entry (inside the patch). */
function skinToneUniform(): TslNode {
  const tone = new THREE.Vector3();
  return uniform(tone).onObjectUpdate((frame: { material?: THREE.Material }) => {
    const t = frame.material?.userData?.[SKIN_TONE_KEY] as readonly number[] | undefined;
    if (t) tone.set(t[0], t[1], t[2]);
    return tone;
  });
}

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
  /** The material the mesh carried before the tint (restored by `clearAppearance`). */
  material: THREE.Material;
  /** The colour the asset shipped with, restored when the tint is removed. */
  original: THREE.Color;
  /** The mesh and material slot, when the tint swapped in a node material. */
  mesh?: THREE.Mesh;
  slot?: number;
  /** The node material that replaced `material` for the FaceGen overlay. */
  tinted?: NodeMaterial;
};

/**
 * Skyrim's FACEGEN_RGB_TINT overlay on a base colour `b` (per channel, linear):
 * `b² + 2·tone·b − 2·tone·b²`, then × the constant body detail factor.
 * The node graph in `skyrimRgbTintNode` computes the same.
 */
export const SKYRIM_SKIN_DETAIL: readonly [number, number, number] = [1.01172, 0.996094, 1.01172];

export function skyrimRgbTint(
  base: readonly [number, number, number],
  tone: readonly [number, number, number],
): [number, number, number] {
  return [0, 1, 2].map((i) => {
    const b = base[i];
    const t = tone[i];
    return (b * b + 2 * t * b - 2 * t * b * b) * SKYRIM_SKIN_DETAIL[i];
  }) as [number, number, number];
}

/**
 * The FaceGen overlay as a node material over `material`: a node twin (the
 * source is left untouched for `clearAppearance`) whose base colour
 * (colour × map, before vertex colours: the old `map_fragment` seam) goes
 * through `skyrimRgbTint`. Skinning is untouched: only `colorNode` changes.
 */
function skyrimRgbTintMaterial(
  material: THREE.MeshStandardMaterial,
  tint: Appearance["skinTint"],
): NodeMaterial {
  // Actor::UpdateSkinColor passes the NPC's QNAM bytes to the shader as
  // normalised floats. They are shader constants, not an sRGB texture sample,
  // so converting them through Three's sRGB transfer curve makes every race
  // substantially darker than Skyrim does.
  const node = isNodeMaterial(material) ? cloneNodeMaterial(material) : toNodeMaterial(material.clone());
  (node as unknown as { color: THREE.Color }).color.set(0xffffff);
  node.userData[SKIN_TONE_KEY] = [tint[0], tint[1], tint[2]];
  patchShared(node, skinToneMemo, "skyrimRgbTint", (m) => {
    const tone = skinToneUniform();
    const detail = vec3(...SKYRIM_SKIN_DETAIL);
    wrapColor(m, (c: TslNode) => {
      const b = c.rgb;
      const overlay = b.mul(b).add(tone.mul(b).mul(2)).sub(tone.mul(b).mul(b).mul(2));
      return vec4(overlay.mul(detail), c.a);
    });
  });
  return node;
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
    materialsOf(object).forEach((material, slot) => {
      if (!isStandard(material)) return;
      const entry: TintedMaterial = { material, original: material.color.clone() };
      touched.push(entry);
      if (skin.has(name) && appearance.skinTintMode === "skyrim-rgb-tint") {
        // This is Skyrim's FACEGEN_RGB_TINT overlay equation and constant
        // body-detail factor, applied in linear colour space. The previous
        // luminance remap was an invented grade that flattened the diffuse.
        const tinted = skyrimRgbTintMaterial(material, appearance.skinTint);
        setMaterial(object, slot, tinted);
        Object.assign(entry, { mesh: object, slot, tinted });
      } else {
        material.color.multiply(new THREE.Color(tint[0], tint[1], tint[2]));
      }
    });
  });
  return touched;
}

/** Undo `applyAppearance`, leaving the materials as the asset shipped them. */
export function clearAppearance(touched: readonly TintedMaterial[]) {
  for (const entry of touched) {
    if (entry.mesh && entry.tinted && entry.slot !== undefined) {
      if (materialsOf(entry.mesh)[entry.slot] === entry.tinted) {
        setMaterial(entry.mesh, entry.slot, entry.material);
      }
      entry.tinted.dispose();
    } else {
      (entry.material as THREE.MeshStandardMaterial).color.copy(entry.original);
    }
  }
}

/** A standard-lit material: the classic class or its node twin (both carry `color`). */
function isStandard(material: THREE.Material): material is THREE.MeshStandardMaterial {
  const m = material as { isMeshStandardMaterial?: boolean; isMeshStandardNodeMaterial?: boolean };
  return m.isMeshStandardMaterial === true || m.isMeshStandardNodeMaterial === true;
}

function setMaterial(mesh: THREE.Mesh, slot: number, material: THREE.Material): void {
  if (Array.isArray(mesh.material)) {
    const next = [...mesh.material];
    next[slot] = material;
    mesh.material = next;
  } else {
    mesh.material = material;
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
