import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { SettlementKitMaterialExtras } from "./types";

/**
 * Settlement material identity (perf10 c9 F39): kit materials are one per NIF
 * shape, so two assets drawing the same texture with the same factors carry
 * two materials and could never share a draw. The layer keeps one material
 * per identity and batches by that instance (SettlementLayer drawBatchKey),
 * so pieces of different assets, and of different kits that embed the same
 * image, merge into one draw. Nothing about the look changes: every field the
 * runtime shades with is in the key.
 */

/** Slots a settlement material can sample, in the key's order. */
const TEXTURE_SLOTS = ["map", "normalMap", "emissiveMap", "roughnessMap", "metalnessMap",
  "aoMap", "alphaMap", "lightMap", "bumpMap"] as const;

interface GltfTextureRef { textures?: number }
interface GltfJson {
  textures?: { source?: number; extensions?: { KHR_texture_basisu?: { source?: number } } }[];
  images?: { name?: string; uri?: string; bufferView?: number }[];
  bufferViews?: { byteLength: number }[];
}

/**
 * Stamp every texture a loaded kit made with its image's identity
 * (`esImageKey`: the image name and its embedded byte length, or its URI),
 * read from the glTF's own records. Kits embed their images, so the same
 * source image in two kits is two Texture objects with one key.
 */
export function stampKitImageKeys(gltf: GLTF): void {
  const parser = gltf.parser as unknown as {
    json: GltfJson; associations: Map<unknown, GltfTextureRef | undefined>;
  } | undefined;
  if (!parser?.associations) return;
  const { json } = parser;
  for (const [object, ref] of parser.associations) {
    const texture = object as THREE.Texture;
    if (!texture?.isTexture || ref?.textures === undefined) continue;
    const def = json.textures?.[ref.textures];
    const source = def?.extensions?.KHR_texture_basisu?.source ?? def?.source;
    const image = source === undefined ? undefined : json.images?.[source];
    if (!image) continue;
    const bytes = image.bufferView !== undefined ? json.bufferViews?.[image.bufferView]?.byteLength : image.uri;
    texture.userData.esImageKey = `${image.name ?? ""}:${bytes ?? ""}`;
  }
}

function textureKey(texture: THREE.Texture | null | undefined): string {
  if (!texture) return "-";
  const image = (texture.userData?.esImageKey as string | undefined) ?? `src:${texture.source.uuid}`;
  return [image, texture.channel, texture.wrapS, texture.wrapT, texture.flipY ? 1 : 0, texture.colorSpace,
    texture.offset.toArray().join(","), texture.repeat.toArray().join(","), texture.rotation].join("/");
}

const colourKey = (colour: THREE.Color | undefined): string => colour ? colour.getHexString() : "-";

/**
 * The identity of a kit material as the settlement layer shades it, or null
 * when it must keep its own instance: an additive card, a transparent surface
 * (its draw order is its own), still water. The key is taken from the kit's
 * material BEFORE the layer patches it.
 */
export function settlementMaterialIdentity(material: THREE.Material): string | null {
  const extras = material.userData as SettlementKitMaterialExtras | undefined;
  if (material.transparent || extras?.additive || extras?.water) return null;
  const m = material as THREE.MeshStandardMaterial & { vertexColors?: boolean };
  return [
    material.type, material.side, material.alphaTest, material.alphaToCoverage ? 1 : 0,
    material.depthWrite ? 1 : 0, material.blending, material.opacity,
    m.vertexColors ? 1 : 0, m.flatShading ? 1 : 0,
    colourKey(m.color), m.roughness, m.metalness,
    colourKey(m.emissive), m.emissiveIntensity, m.normalScale?.toArray().join(","), m.aoMapIntensity,
    extras?.decal ? "decal" : "",
    ...TEXTURE_SLOTS.map((slot) => `${slot}=${textureKey((m as unknown as Record<string, THREE.Texture | null>)[slot])}`),
  ].join("|");
}

/**
 * One material instance per identity, for one layer's life (never a module
 * singleton, standard 8). `of` returns the instance every equal kit material
 * draws with: the first one seen.
 */
export class SettlementMaterialIdentities {
  private readonly byKey = new Map<string, THREE.Material>();
  private readonly byMaterial = new WeakMap<THREE.Material, THREE.Material>();

  of(material: THREE.Material): THREE.Material {
    const known = this.byMaterial.get(material);
    if (known) return known;
    const key = settlementMaterialIdentity(material);
    let shared = material;
    if (key !== null) {
      shared = this.byKey.get(key) ?? material;
      if (shared === material) this.byKey.set(key, material);
    }
    this.byMaterial.set(material, shared);
    return shared;
  }

  /** Distinct instances handed out (evidence for probes and tests). */
  get size(): number { return this.byKey.size; }
}
