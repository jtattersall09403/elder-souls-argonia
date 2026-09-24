import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
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

/** Build the semantic asset/LOD index once; never use sanitised node names. */
export function buildArchitectureKit(gltf: GLTF): Map<string, ArchitectureAsset> {
  gltf.scene.updateMatrixWorld(true);
  const sceneInverse = gltf.scene.matrixWorld.clone().invert();
  const out = new Map<string, ArchitectureAsset>();
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
        material: material.clone(),
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
      designedSinkM: asset.designedSinkM,
      designedWaterlineM: asset.designedWaterlineM,
      anchorClass: asset.anchorClass,
      fit: typeof asset.placement?.evidence?.policyId === "string"
        ? asset.placement.evidence.policyId : undefined,
    });
  }
  return out;
}

/** The manifest metadata a placement resolves against: its kit, then its asset id. */
export function kitAssetMetaOf(
  manifests: SettlementKitManifests, placement: Pick<SettlementPlacement, "kit" | "assetId">,
): SettlementKitAssetMeta | undefined {
  return manifests.get(placement.kit)?.get(placement.assetId);
}
