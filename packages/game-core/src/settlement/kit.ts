import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { toNodeMaterial } from "../render/nodes/materialNodes";
import { isSmokeColumnPlacement } from "./smokeColumn";
import { stampKitImageKeys } from "./materialIdentity";
import type { SettlementKitAssetMeta, SettlementKitManifests, SettlementPlacement } from "./types";

export interface ArchitecturePart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  localMatrix: THREE.Matrix4;
  triangles: number;
}

export interface ArchitectureAsset {
  id: string;
  levels: ArchitecturePart[][];
}

function assetIdOf(object: THREE.Object3D): string | null {
  const id = object.userData?.assetId;
  return typeof id === "string" ? id : null;
}

/**
 * Build the semantic asset/LOD index once; never use sanitised node names.
 * Each glTF material is cloned ONCE for the kit (the loaded GLTF stays
 * untouched for the interior loader that shares the cache) and that clone is
 * shared by every part drawing it: one material, one set of uniforms, one
 * program look-up, where a clone per part made a material per mesh.
 */
export function buildArchitectureKit(gltf: GLTF): Map<string, ArchitectureAsset> {
  stampKitImageKeys(gltf);
  gltf.scene.updateMatrixWorld(true);
  const sceneInverse = gltf.scene.matrixWorld.clone().invert();
  const out = new Map<string, ArchitectureAsset>();
  const cloned = new Map<THREE.Material, THREE.Material>();
  const shared = (material: THREE.Material): THREE.Material => {
    let copy = cloned.get(material);
    // the node twin of a clone (decision 0107): converted ONCE at load, so
    // the surface features wrap its slots; the glTF's own material stays classic
    if (!copy) { copy = toNodeMaterial(material.clone()); cloned.set(material, copy); }
    return copy;
  };
  for (const root of gltf.scene.children) {
    const id = assetIdOf(root);
    if (!id) continue;
    const levels: ArchitecturePart[][] = [];
    root.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      const level = typeof child.userData?.lod === "number" ? child.userData.lod : 0;
      const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      if (!material) return;
      const index = mesh.geometry.index;
      const triangles = index ? index.count / 3 : mesh.geometry.getAttribute("position").count / 3;
      (levels[level] ??= []).push({
        geometry: mesh.geometry,
        material: shared(material),
        localMatrix: sceneInverse.clone().multiply(mesh.matrixWorld),
        triangles,
      });
    });
    out.set(id, { id, levels });
  }
  return out;
}

/**
 * Reduce a published kit manifest (`public/kits/<kit>.kit.json`) to the
 * per-asset metadata the runtime needs, keyed by each entry's `id`. The
 * manifest's `assets` is a LIST; keying it any other way (e.g. by array
 * index) leaves every placement unresolved.
 */
export function kitAssetMetaFromManifest(
  manifest: unknown, source: string,
): Map<string, SettlementKitAssetMeta> {
  const assets = (manifest as { assets?: unknown } | null)?.assets;
  if (!Array.isArray(assets)) throw new Error(`kit manifest ${source} has no assets list`);
  const out = new Map<string, SettlementKitAssetMeta>();
  for (const [index, entry] of assets.entries()) {
    const asset = entry as { id?: unknown; placement?: { evidence?: { policyId?: unknown } } }
      & Omit<SettlementKitAssetMeta, "fit">;
    if (typeof asset?.id !== "string" || !asset.id) {
      throw new Error(`kit manifest ${source}: asset ${index} has no id`);
    }
    if (out.has(asset.id)) throw new Error(`kit manifest ${source}: duplicate asset id ${asset.id}`);
    out.set(asset.id, {
      id: asset.id,
      designedSinkM: asset.designedSinkM,
      designedWaterlineM: asset.designedWaterlineM,
      anchorClass: asset.anchorClass,
      fit: typeof asset.placement?.evidence?.policyId === "string"
        ? asset.placement.evidence.policyId : undefined,
      category: asset.category,
      light: asset.light,
      additiveMaterials: asset.additiveMaterials,
      glowFacingsDeg: asset.glowFacingsDeg,
      flames: asset.flames,
      glows: asset.glows,
      flameCardMaterials: asset.flameCardMaterials,
    });
  }
  return out;
}

/** Meta for a runtime effect placement: it has no kit row; it mounts on its host. */
const EFFECT_META: SettlementKitAssetMeta = { anchorClass: "fx" };

/**
 * The metadata a placement resolves against: a runtime effect
 * (`fx:smoke-column`) mounts with no kit row; anything else is its kit, then
 * its asset id. The ONE lookup the layer and the published-bundle gate share.
 */
export function kitAssetMetaOf(
  manifests: SettlementKitManifests,
  placement: Pick<SettlementPlacement, "kit" | "assetId" | "kind">,
): SettlementKitAssetMeta | undefined {
  if (isSmokeColumnPlacement(placement)) return EFFECT_META;
  return manifests.get(placement.kit)?.get(placement.assetId);
}
