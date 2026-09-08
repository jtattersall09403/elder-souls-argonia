import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export interface ArchitectureLodContract {
  absoluteTriangleFloor: readonly [number, number];
  distancePerFootprintDiagonal: readonly [number, number];
  farMergeDistanceM: number;
}

/** One and only one full-vs-LOD decision for a placed building. */
export function architectureLod(
  distanceM: number,
  footprintDiagonalM: number,
  availableLevels: number,
  contract: ArchitectureLodContract,
  drawScale = 1,
): { level: number; farMerged: boolean } {
  if (availableLevels < 3) throw new Error("architecture asset is missing a three-tier LOD chain");
  const d0 = Math.max(55, footprintDiagonalM * contract.distancePerFootprintDiagonal[0]) * drawScale;
  const d1 = Math.max(180, footprintDiagonalM * contract.distancePerFootprintDiagonal[1]) * drawScale;
  const level = distanceM < d0 ? 0 : distanceM < d1 ? 1 : 2;
  return { level, farMerged: distanceM >= contract.farMergeDistanceM * drawScale };
}

export function validateLodTriangles(
  triangles: readonly number[],
  contract: ArchitectureLodContract,
): void {
  if (triangles.length < 3) throw new Error("architecture asset is missing a three-tier LOD chain");
  // A six-triangle prop cannot have a 120-triangle decimation floor. The
  // absolute floor is capped by the source mesh, but never expressed only as
  // a percentage (the architecture failure the contract prevents).
  if (triangles[1] < Math.min(triangles[0], contract.absoluteTriangleFloor[0])
      || triangles[2] < Math.min(triangles[0], contract.absoluteTriangleFloor[1])) {
    throw new Error("architecture LOD fell below its absolute triangle floor");
  }
}

/** Validate the texture actually bound to a drawn material, not a manifest claim. */
export function validateMaterialTextureCap(material: THREE.Material, maxSize: number): void {
  if (!Number.isFinite(maxSize) || maxSize <= 0) throw new Error("invalid settlement texture cap");
  const texture = (material as THREE.MeshStandardMaterial).map;
  if (!texture) return;
  const image = texture.image as { width?: number; height?: number } | undefined;
  if (!image || !Number.isFinite(image.width) || !Number.isFinite(image.height)) {
    throw new Error(`settlement material ${material.name || "<unnamed>"} has an unmeasured colour texture`);
  }
  if ((image.width ?? 0) > maxSize || (image.height ?? 0) > maxSize) {
    throw new Error(`settlement material ${material.name || "<unnamed>"} exceeds ${maxSize}px texture cap`);
  }
}

/** Bake repeated far-tier instances into one real geometry for one material. */
export function mergeTransformedGeometry(
  geometry: THREE.BufferGeometry,
  transforms: readonly THREE.Matrix4[],
  groundLinesM?: readonly number[],
): THREE.BufferGeometry | null {
  if (!transforms.length) return null;
  if (groundLinesM && groundLinesM.length !== transforms.length) {
    throw new Error("settlement far-tier ground-line count does not match transforms");
  }
  const copies = transforms.map((matrix, index) => {
    const copy = geometry.clone().applyMatrix4(matrix);
    if (groundLinesM) {
      const count = copy.getAttribute("position").count;
      copy.setAttribute("esSettlementGroundY", new THREE.Float32BufferAttribute(
        new Float32Array(count).fill(groundLinesM[index]), 1,
      ));
    }
    return copy;
  });
  const merged = mergeGeometries(copies, false);
  copies.forEach((copy) => copy.dispose());
  if (!merged) throw new Error("settlement far-tier geometry could not be merged");
  return merged;
}

export function selectCollisionRing<T>(
  candidates: readonly { value: T; distanceM: number; parts: number }[],
  radiusM: number,
  partBudget: number,
): { chosen: T[]; coveredRadiusM: number; parts: number } {
  const ordered = candidates
    .filter((candidate) => candidate.distanceM <= radiusM)
    .slice()
    .sort((a, b) => a.distanceM - b.distanceM);
  const chosen: T[] = [];
  let parts = 0;
  let coveredRadiusM = radiusM;
  for (const candidate of ordered) {
    const cost = Math.max(1, candidate.parts);
    if (parts + cost > partBudget) {
      coveredRadiusM = candidate.distanceM;
      break;
    }
    parts += cost;
    chosen.push(candidate.value);
  }
  return { chosen, coveredRadiusM, parts };
}
