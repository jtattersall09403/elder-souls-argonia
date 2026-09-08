import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

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
