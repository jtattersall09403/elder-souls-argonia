import * as THREE from "three";
import { lodLadder, type LodRung } from "../fx/lodFade";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export interface ArchitectureLodContract {
  absoluteTriangleFloor: readonly [number, number];
  distancePerFootprintDiagonal: readonly [number, number];
  farMergeDistanceM: number;
}

/**
 * The rung ladder of one placed building, stepped from the camera (0075).
 *
 * The SAME helper the vegetation cell build uses (`lodLadder`, fx/lodFade):
 * one kit level per rung, hard steps at every edge, adjacent rungs that
 * resolve to the same kit level collapsed into one. Buildings take
 * `card: none` in 16h — no kit piece has a card bake — so the last mesh level
 * runs out to `maxDrawM`, which covers the loaded ring: nothing inside the
 * ring fades to nothing.
 */
export function settlementLadder(
  footprintDiagonalM: number,
  availableLevels: number,
  contract: ArchitectureLodContract,
  maxDrawM: number,
  drawScale = 1,
): LodRung[] {
  if (availableLevels < 3) throw new Error("architecture asset is missing a three-tier LOD chain");
  const rings = contract.distancePerFootprintDiagonal.map((k, i) =>
    Math.max(i === 0 ? 55 : 180, footprintDiagonalM * k) * drawScale);
  return lodLadder(rings, availableLevels, SETTLEMENT_CARD_LEVEL, maxDrawM * drawScale);
}

/** Buildings have no card bake in 16h; the mesh ladder covers the whole ring. */
export const SETTLEMENT_CARD_LEVEL: number | null = null;

/** Wind never moves a building. */
export const SETTLEMENT_WIND_STIFFNESS = 0;

/** The rung a camera distance falls in; the last rung holds beyond the ladder. */
export function ladderLevelAt(ladder: readonly LodRung[], distanceM: number): number {
  for (const rung of ladder) if (distanceM < rung.hi) return rung.level;
  return ladder[ladder.length - 1].level;
}

/**
 * One and only one full-vs-LOD decision for a placed building, now read off
 * the ladder so the drawn level and the gate test can never disagree.
 */
export function architectureLod(
  distanceM: number,
  footprintDiagonalM: number,
  availableLevels: number,
  contract: ArchitectureLodContract,
  drawScale = 1,
  maxDrawM = 5000,
): { level: number; farMerged: boolean } {
  const ladder = settlementLadder(footprintDiagonalM, availableLevels, contract, maxDrawM, drawScale);
  return {
    level: ladderLevelAt(ladder, distanceM),
    farMerged: distanceM >= contract.farMergeDistanceM * drawScale,
  };
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
