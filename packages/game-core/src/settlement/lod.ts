import * as THREE from "three";
import { lodLadder, type LodRung } from "../fx/lodFade";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

export interface ArchitectureLodContract {
  absoluteTriangleFloor: readonly [number, number];
  distancePerFootprintDiagonal: readonly [number, number];
  farMergeDistanceM: number;
}

/** What the LOD gate needs to know about a placed piece (0102 decision 6). */
export interface LodPieceSize {
  /** Longest side of the placed piece, metres (kit `sizeM` times its scale). */
  longestSideM: number;
  /** The placement kind (`SettlementPlacement.kind`) or `clutter`. */
  kind: string;
}

/** A piece shorter than this on every side may ship LOD0 only when its kind allows. */
export const SINGLE_TIER_MAX_SIDE_M = 1.5;

/** Kinds that may ship one tier under the size bar; architecture never does. */
export const SINGLE_TIER_KINDS: readonly string[] = ["dressing", "clutter"];

/**
 * Tiers a piece must carry (decision 0102 decision 6): one for dressing or
 * clutter whose longest side is under 1.5 m, since the distance bands (0071
 * decision 3, 0075) already cull it by size; three for everything else,
 * architecture shells included. No piece given = three (the old rule).
 */
export function requiredLodTiers(piece?: LodPieceSize): 1 | 3 {
  return piece
    && SINGLE_TIER_KINDS.includes(piece.kind)
    && Number.isFinite(piece.longestSideM)
    && piece.longestSideM < SINGLE_TIER_MAX_SIDE_M ? 1 : 3;
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
  piece?: LodPieceSize,
): LodRung[] {
  if (availableLevels < requiredLodTiers(piece)) {
    throw new Error("architecture asset is missing a three-tier LOD chain");
  }
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
  piece?: LodPieceSize,
): { level: number; farMerged: boolean } {
  const ladder = settlementLadder(footprintDiagonalM, availableLevels, contract, maxDrawM,
    drawScale, piece);
  return {
    level: ladderLevelAt(ladder, distanceM),
    farMerged: distanceM >= contract.farMergeDistanceM * drawScale,
  };
}

export function validateLodTriangles(
  triangles: readonly number[],
  contract: ArchitectureLodContract,
  piece?: LodPieceSize,
): void {
  if (triangles.length < requiredLodTiers(piece)) {
    throw new Error("architecture asset is missing a three-tier LOD chain");
  }
  // A one-tier piece has no decimated tier to hold to a floor.
  if (triangles.length < 3) return;
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

/** The vertex attributes a settlement material reads (MeshStandardMaterial and
 * the settlement surface patch). A kit part's extra NIF colour sets
 * (`color_1`, `color_2`) are read by no settlement shader: a merge drops them,
 * so they neither split batches nor cost memory. */
const SETTLEMENT_SHADED_ATTRIBUTES: ReadonlySet<string> = new Set(
  ["position", "normal", "uv", "uv1", "uv2", "uv3", "color", "tangent"]);

/** Bake copies of one part into one real geometry (one entry of a draw batch). */
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
    const copy = geometry.clone();
    for (const name of Object.keys(copy.attributes)) {
      if (!SETTLEMENT_SHADED_ATTRIBUTES.has(name)) copy.deleteAttribute(name);
    }
    copy.applyMatrix4(matrix);
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
  return alignVertexStrides(merged);
}

/**
 * The vertex layout two kit parts must share to merge into one geometry:
 * each attribute's name, array type, item size and normalisation, and
 * whether the part is indexed (`mergeGeometries` refuses a mismatch).
 */
export function vertexLayoutKey(geometry: THREE.BufferGeometry): string {
  const rows = Object.entries(geometry.attributes).filter(([name]) => SETTLEMENT_SHADED_ATTRIBUTES.has(name)).map(([name, attribute]) => {
    const array = attribute instanceof THREE.InterleavedBufferAttribute ? attribute.data.array : attribute.array;
    return `${name}:${array.constructor.name}:${attribute.itemSize}:${attribute.normalized ? 1 : 0}`;
  }).sort();
  return `${geometry.index ? "i" : "n"}|${rows.join(",")}`;
}

/** One kit part and its copies in a settlement draw batch. */
export interface MergeEntry {
  geometry: THREE.BufferGeometry;
  transforms: readonly THREE.Matrix4[];
  groundLinesM: readonly number[];
}

/**
 * Bake every copy of every part of one draw batch (one material, one vertex
 * layout, one cell) into one geometry: one draw where an instanced mesh per
 * part made one each (SettlementLayer drawBatchKey). Each part's copies are
 * merged and freed before the next part, so peak memory is the batch, never
 * parts x copies twice over.
 */
export function mergeTransformedParts(entries: readonly MergeEntry[]): THREE.BufferGeometry | null {
  const pieces = entries
    .map((entry) => mergeTransformedGeometry(entry.geometry, entry.transforms, entry.groundLinesM))
    .filter((piece): piece is THREE.BufferGeometry => piece !== null);
  if (pieces.length <= 1) return pieces[0] ?? null;
  const merged = mergeGeometries(pieces, false);
  pieces.forEach((piece) => piece.dispose());
  if (!merged) throw new Error("settlement draw batch could not be merged (vertex layouts differ)");
  return alignVertexStrides(merged);
}

/**
 * WebGPU rejects a vertex buffer whose stride is not a multiple of 4 bytes
 * (WebGL2 accepts it). Kits ship octahedral int8 normals padded to stride 4
 * inside an interleaved buffer; `mergeGeometries` de-interleaves them into a
 * tight Int8 array of stride 3, and one such pipeline invalidates the whole
 * render pass (walk 8: every building vanished whenever a far merge was in
 * view). Any attribute that is not 4-byte aligned is widened to float32.
 */
export function alignVertexStrides(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  for (const [name, attribute] of Object.entries(geometry.attributes)) {
    if (attribute instanceof THREE.InterleavedBufferAttribute) continue;
    const { itemSize, count } = attribute;
    if ((attribute.array.BYTES_PER_ELEMENT * itemSize) % 4 === 0) continue;
    const out = new Float32Array(count * itemSize);
    for (let i = 0; i < count; i += 1) {
      for (let c = 0; c < itemSize; c += 1) out[i * itemSize + c] = attribute.getComponent(i, c);
    }
    geometry.setAttribute(name, new THREE.Float32BufferAttribute(out, itemSize));
  }
  return geometry;
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
