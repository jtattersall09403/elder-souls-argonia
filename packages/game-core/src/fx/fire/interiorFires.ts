/**
 * An interior cell's fires (16k walk 5): every placed piece whose kit
 * manifest row carries mined flames (candles, lanterns, hearths) burns at its
 * emitters through the placement's final matrix. The interior loader
 * (interior/interiorLoader.ts `instantiateInterior`) builds the cell's meshes
 * and its plugin lights but, until wired, draws no flame at all: it hands
 * these emitters to a `FlameSystem` added to the cell's group, with every
 * owner at strength 1 (an interior's candles burn whatever the hour).
 */
import * as THREE from "three";
import type { FireEmitter } from "./FlameSystem";
import { manifestBoxYUp, pieceFlameAnchorsLocal, type FlameAnchorMeta } from "./flameAnchors";

export interface InteriorFirePlacement { id: string; kit: string; assetId: string }
export type InteriorFireRow = FlameAnchorMeta & { sizeM?: number[]; originOffsetM?: number[] };

/** A stable 0..1 hash of a string (FNV-1a), as settlement/lighting.ts `hash01`. */
function hash01(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0x100000000;
}

export function interiorFireEmitters<P extends InteriorFirePlacement>(
  placements: readonly P[],
  rowOf: (p: P) => InteriorFireRow | undefined,
  matrixOf: (p: P) => THREE.Matrix4,
): FireEmitter[] {
  const out: FireEmitter[] = [];
  const scale = new THREE.Vector3();
  for (const p of placements) {
    const row = rowOf(p);
    if (!row?.flames?.length) continue;
    const box = manifestBoxYUp(row);
    if (!box) continue;
    const matrix = matrixOf(p);
    scale.setFromMatrixScale(matrix);
    for (const a of pieceFlameAnchorsLocal(row, box, false)) {
      out.push({ position: a.local.clone().applyMatrix4(matrix), preset: a.preset,
        scale: Math.max(scale.x, scale.y, scale.z), seed: hash01(`${p.id}#${a.record}`), owner: 0 });
    }
  }
  return out;
}
