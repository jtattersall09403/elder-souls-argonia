/**
 * An interior cell's fires (16k walk 5): every placed piece whose kit
 * manifest row carries mined flames (candles, lanterns, hearths) burns at its
 * emitters through the placement's final matrix. The interior loader
 * (interior/interiorLoader.ts `instantiateInterior`) builds the cell's meshes
 * and its plugin lights but, until wired, draws no flame at all: it hands
 * these emitters to a `FlameSystem` added to the cell's group, with every
 * owner at strength 1 (an interior's candles burn whatever the hour).
 *
 * A piece whose fire is additive flame CARDS (`flameCardMaterials`:
 * fxfirewithembers01, the fire on a Keeba hut's floor hearth) has no mined
 * emitter; it burns one bed at its base centre with its preset (`brazier`),
 * and the loader stops drawing its cards (`isInteriorFlameCard`): the cards
 * alone read as a glow with no flame (walk 5, owner).
 *
 * A LIT piece with neither (a kit row with a `light` record but no mined
 * emitter and no cards: argonianlanterns03, a brazier whose bowl fire is a
 * separate piece) burns one fallback flame (`fallbackFlameAnchorLocal`), as
 * the exterior layer's fixtures do, unless another burning piece stands in
 * its bounds (the brazier's fxfirewithembers01: that bed is its fire). Until
 * 2026-09-29 such a row was skipped outright, so a lit fixture with no mined
 * flame drew nothing (lessons L-fire-light-only).
 */
import * as THREE from "three";
import type { FireEmitter } from "./FlameSystem";
import { FIRE_PRESETS, fireFlicker } from "./fireTypes";
import {
  FLAME_ANCHOR_SLACK_M, flameCardBedAnchorLocal, isFlameCardMaterial, manifestBoxYUp, pieceFlameAnchorsLocal,
  type FlameAnchorMeta, type LocalFlameAnchor,
} from "./flameAnchors";

export interface InteriorFirePlacement { id: string; kit: string; assetId: string }
export type InteriorFireRow = FlameAnchorMeta & { sizeM?: number[]; originOffsetM?: number[]; emissiveMaterials?: readonly string[] | null;
  windowMaterials?: readonly string[] | null };

/** A material the interior loader leaves undrawn: one of its piece's flame cards. */
export function isInteriorFlameCard(row: InteriorFireRow | undefined, materialName: string): boolean {
  return isFlameCardMaterial(row, materialName);
}

/** Whether a kit row burns in an interior: mined emitters, flame cards, or a light fixture record. */
export function burnsInInterior(row: InteriorFireRow | undefined): boolean {
  return Boolean(row?.flames?.length || row?.flameCardMaterials?.length || row?.light?.fixtureKind);
}

/** Whether a row draws a fire of its own (mined emitters or flame cards), as settlement/lighting.ts `drawsOwnFire`. */
function ownsFire(row: InteriorFireRow): boolean {
  return Boolean(row.flames?.length || row.flameCardMaterials?.length);
}

/**
 * The local anchors of an interior piece: its mined emitters, else one bed at
 * a flame-card piece's base centre, else (a lit piece, `fallback`) one
 * fallback flame.
 */
export function interiorFlameAnchorsLocal(row: InteriorFireRow, box: THREE.Box3, fallback = true): LocalFlameAnchor[] {
  const bed = flameCardBedAnchorLocal(row, box);
  return bed ? [bed] : pieceFlameAnchorsLocal(row, box, fallback && Boolean(row.light?.fixtureKind));
}

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
  // where each piece with a fire of its own stands: a lit piece holding one
  // in its bounds (a brazier's bowl fire) draws no fallback of its own
  const ownFires: THREE.Vector3[] = [];
  for (const p of placements) {
    const row = rowOf(p);
    if (row && ownsFire(row)) ownFires.push(new THREE.Vector3().setFromMatrixPosition(matrixOf(p)));
  }
  for (const p of placements) {
    const row = rowOf(p);
    if (!row || !burnsInInterior(row)) continue;
    const box = manifestBoxYUp(row);
    if (!box) continue;
    const matrix = matrixOf(p);
    scale.setFromMatrixScale(matrix);
    const hostsFire = !ownsFire(row) && ownFires.some((at) =>
      box.clone().expandByScalar(FLAME_ANCHOR_SLACK_M).applyMatrix4(matrix).containsPoint(at));
    for (const a of interiorFlameAnchorsLocal(row, box, !hostsFire)) {
      out.push({ position: a.local.clone().applyMatrix4(matrix), preset: a.preset,
        scale: Math.max(scale.x, scale.y, scale.z), seed: hash01(`${p.id}#${a.record}`), owner: 0 });
    }
  }
  return out;
}

/** A record light within this distance (m, cell space) of a fire's emitter is that fire's light and
 * flickers with it: a hearth's LIGH ref stands over its bed, a candle's at its wick (Skyrim places
 * them within ~0.5 m; 1.5 m covers a hearth light hung above a wide bed). */
export const LIGHT_FLAME_PAIR_M = 1.5;

/**
 * The cast-light flicker of an interior cell's record lights (vol10 F8c): each light paired once
 * with its nearest fire emitter within `LIGHT_FLAME_PAIR_M` reads that fire's own flicker signal
 * (`fireFlicker`, the seed and preset rate the flame's shader uses), so light and flame agree;
 * an unpaired light (a window, a glowing mushroom) stays steady. `factor` allocates nothing.
 */
export class CellLightFlicker {
  private readonly seed: Float64Array;
  private readonly rateHz: Float64Array;
  private readonly amount: Float64Array;

  constructor(lights: readonly { position: THREE.Vector3 }[], emitters: readonly FireEmitter[]) {
    const n = lights.length;
    this.seed = new Float64Array(n).fill(-1);
    this.rateHz = new Float64Array(n);
    this.amount = new Float64Array(n);
    lights.forEach((l, j) => {
      let best = LIGHT_FLAME_PAIR_M * LIGHT_FLAME_PAIR_M;
      for (const e of emitters) {
        const d2 = e.position.distanceToSquared(l.position);
        if (d2 > best) continue;
        best = d2;
        const f = FIRE_PRESETS[e.preset].flicker;
        this.seed[j] = e.seed; this.rateHz[j] = f.rateHz; this.amount[j] = f.amount;
      }
    });
  }

  /** Light `j`'s intensity factor at `timeS` (real seconds, the flames' clock); 1 when unpaired. */
  factor(j: number, timeS: number): number {
    const s = this.seed[j];
    return s < 0 ? 1 : fireFlicker(timeS, s, this.rateHz[j], this.amount[j]);
  }
}
