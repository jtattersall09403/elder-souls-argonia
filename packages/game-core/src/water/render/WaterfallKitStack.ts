import * as THREE from "three";
import { KIT_DIMS, type KitPieceId } from "./WaterfallKit";
import type { FallPath, FallPathPoint } from "./WaterfallSheets";

/**
 * Where the kit pieces go on one traced fall (decision 0064): Bethesda's
 * stacking rules mined from Skyrim.esm (vault audit §5), driven by the
 * ballistic tracer's path. Pure — the tests read it.
 *
 *  - **Body**: the curved body family (`bodytall` 16 m, `bodytall02` 34 m)
 *    uniformly scaled so its TOP width is the water's width at the lip
 *    (`cascade.widthM`, bankfull), clamped to Bethesda's own scale range;
 *    thin sheets for water under `THIN_BELOW_M` wide. Pieces stack down the
 *    path at 2/3 of a piece height (a third overlaps), the last one lifted so
 *    its foot is the plunge. Each piece's origin is its top edge on the
 *    path; it is yawed to the flow and tilted in the fall's vertical plane so
 *    its authored foot bulge lands on the chord of its span — that is the
 *    lean with the arc. Lateral copies half a piece apart when the piece is
 *    narrower than the water.
 *  - **Crest** `fxrapidsfallsline01` flat on the water at lip level, its
 *    scrolling end `CREST_OVERHANG_M` past the lip, the rest on the strip.
 *  - **Skirt** at the impact, `SKIRT_BACK_M` toward the cliff, fog rising.
 *  - **Ring** flat on the pool just downstream of the impact.
 *  - **Mist cards** 4–8 within 12 m of the impact, random yaw, pitched
 *    −10° … 135°; **ground mist** 10–40 discs over the plunge basin.
 */

/** Bethesda's own uniform-scale range (audit §5). */
export const KIT_SCALE = { min: 0.35, max: 2.28 } as const;
/** Water narrower than this at the lip is a thin sheet, not a body. */
export const THIN_BELOW_M = 4;
/** A body family is picked so the fall needs few pieces: up to this arc, the 16 m body. */
export const BODY16_MAX_ARC_M = 26;
/** Successive pieces stack at this fraction of a piece height. */
export const STACK_STEP = 2 / 3;
/** Lateral copies are spaced this fraction of a piece width apart. */
export const LATERAL_STEP = 0.5;
/** The crest's scrolling end reaches this far past the lip (the water is still level there). */
export const CREST_OVERHANG_M = 1.0;
export const CREST_LIFT_M = 0.05;
export const CREST_SCALE = { min: 0.5, max: 1.3 } as const;
/** The skirt's origin sits this far upstream of the impact (audit §5 example: y +3.3 in the body frame). */
export const SKIRT_BACK_M = 2.5;
export const SKIRT_SCALE = { min: 0.5, max: 1.5, perWidthM: 12 } as const;
export const RING_AHEAD_M = 2;
export const RING_LIFT_M = 0.05;
export const RING_SCALE = { min: 0.5, max: 1.4, perWidthM: 10 } as const;
/** Mist cards per fall: 4 at ≤ 8 m of drop rising to 8 at ≥ 40 m; within 12 m of the impact. */
export const MIST_CARDS = { min: 4, max: 8, dropMinM: 8, dropMaxM: 40, radiusM: 12 } as const;
export const MIST_CARD_SCALE = { min: 0.2, max: 0.5 } as const;
export const MIST_CARD_PITCH_DEG = { min: -10, max: 135 } as const;
/** Ground-mist discs per fall: 10 at ≤ 8 m of drop rising to 40 at ≥ 60 m. */
export const GROUND_MIST = { min: 10, max: 40, dropMinM: 8, dropMaxM: 60 } as const;
export const GROUND_MIST_SCALE = { min: 0.3, max: 0.8 } as const;
export const GROUND_MIST_LIFT_M = 0.3;
export const GROUND_MIST_BASIN_SCALE = 1.1;
/** Pieces fade out this far below the pool surface (they are cut, not drawn, under it). */
export const POOL_FADE_M = 0.6;

export interface PieceInstance {
  piece: KitPieceId;
  fallId: string;
  /** World transform (unscaled metres; the material applies the vertical scale). */
  matrix: THREE.Matrix4;
  scale: number;
  /** Scroll phase (s). */
  phase: number;
  /** The receiving pool level (m); geometry below it fades out. */
  poolY: number;
  /** Per-instance alpha scale (ground mist thins toward the basin edge). */
  alphaScale: number;
}

export interface FallStack {
  id: string;
  instances: PieceInstance[];
  body: {
    piece: KitPieceId;
    scale: number;
    /** Vertical spans (m of arc from the lip) and lateral copies. */
    spans: number;
    lateral: number;
    /** The first body piece's top edge (world y) — the lip seam the gate reads. */
    topY: number;
    /** Width the body stack covers at the lip (m). */
    topWidthM: number;
  };
  counts: Record<KitPieceId, number>;
}

function clamp(v: number, lo: number, hi: number): number { return Math.min(Math.max(v, lo), hi); }
function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
function lcg(seed: number): () => number {
  let state = seed || 1;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}
function countByDrop(dropM: number, spec: { min: number; max: number; dropMinM: number; dropMaxM: number }): number {
  const s = smoothstep(spec.dropMinM, spec.dropMaxM, dropM);
  return clamp(Math.round(spec.min + (spec.max - spec.min) * s), spec.min, spec.max);
}
export function mistCardCount(dropM: number): number { return countByDrop(dropM, MIST_CARDS); }
export function groundMistCount(dropM: number): number { return countByDrop(dropM, GROUND_MIST); }

/** The body family for a fall: thin sheets for narrow water, else the body whose height suits the arc. */
export function bodyFamily(widthM: number, arcM: number): KitPieceId {
  if (widthM < THIN_BELOW_M) return arcM <= KIT_DIMS.thin7.heightM * 1.6 ? "thin7" : "thin29";
  return arcM <= BODY16_MAX_ARC_M ? "body16" : "body34";
}

/** Uniform body scale: top width = the water's width, shrunk for a fall shorter than the piece. */
export function bodyScale(piece: KitPieceId, widthM: number, arcM: number): number {
  const dims = KIT_DIMS[piece as "body16" | "body34" | "thin7" | "thin29"];
  let s = clamp(widthM / dims.topWidthM, KIT_SCALE.min, KIT_SCALE.max);
  if (arcM < dims.heightM * s) s = clamp(arcM / dims.heightM, KIT_SCALE.min, s);
  return s;
}

export interface StackSpan { startM: number; endM: number }

/** Piece spans down `lengthM` of arc for a scaled piece height: stacked at
 * 2/3 H, the last piece lifted so its foot is the end, never past it. */
export function stackSpans(lengthM: number, heightM: number): StackSpan[] {
  if (lengthM <= heightM + 1e-6) return [{ startM: 0, endM: Math.min(heightM, lengthM) }];
  const step = heightM * STACK_STEP;
  const count = Math.ceil((lengthM - heightM) / step) + 1;
  const spans: StackSpan[] = [];
  for (let k = 0; k < count; k++) {
    const startM = Math.min(k * step, lengthM - heightM);
    spans.push({ startM, endM: startM + heightM });
  }
  return spans;
}

/** Lateral copy offsets (signed m across) so copies half a piece apart span the water. */
export function lateralOffsets(widthM: number, pieceWidthM: number): number[] {
  if (widthM <= pieceWidthM * 1.05) return [0];
  const span = widthM - pieceWidthM;
  const count = Math.ceil(span / (pieceWidthM * LATERAL_STEP)) + 1;
  return Array.from({ length: count }, (_, i) => -span / 2 + (span * i) / (count - 1));
}

/** Arc length (m) from the lip along the path, per point; the lip index. */
function arcFromLip(points: readonly FallPathPoint[]): { along: number[]; lipIndex: number } {
  const lipIndex = Math.max(points.findIndex((p) => p.s >= 0), 0);
  const along = new Array<number>(points.length).fill(0);
  for (let i = lipIndex + 1; i < points.length; i++) {
    along[i] = along[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y, points[i].z - points[i - 1].z);
  }
  for (let i = lipIndex - 1; i >= 0; i--) along[i] = along[i + 1] - Math.hypot(points[i].x - points[i + 1].x, points[i].y - points[i + 1].y, points[i].z - points[i + 1].z);
  return { along, lipIndex };
}

function pointAtArc(points: readonly FallPathPoint[], along: readonly number[], arcM: number): THREE.Vector3 {
  if (arcM <= along[0]) return new THREE.Vector3(points[0].x, points[0].y, points[0].z);
  for (let i = 1; i < points.length; i++) {
    if (along[i] >= arcM) {
      const t = along[i] > along[i - 1] ? (arcM - along[i - 1]) / (along[i] - along[i - 1]) : 0;
      const a = points[i - 1];
      const b = points[i];
      return new THREE.Vector3(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
    }
  }
  const p = points[points.length - 1];
  return new THREE.Vector3(p.x, p.y, p.z);
}

/** Basis with +Z along a horizontal direction, +Y up, +X right; then tilted
 * about X by `tiltRad` (positive = the foot swings forward). */
function frame(forward: THREE.Vector3, tiltRad: number): THREE.Matrix4 {
  const up0 = new THREE.Vector3(0, 1, 0);
  const c = Math.cos(tiltRad);
  const s = Math.sin(tiltRad);
  const y = up0.clone().multiplyScalar(c).addScaledVector(forward, -s);
  const z = up0.clone().multiplyScalar(s).addScaledVector(forward, c);
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  return new THREE.Matrix4().makeBasis(x, y, z);
}

function place(piece: KitPieceId, fallId: string, position: THREE.Vector3, basis: THREE.Matrix4, scale: number,
  phase: number, poolY: number, alphaScale = 1): PieceInstance {
  const matrix = basis.clone();
  matrix.scale(new THREE.Vector3(scale, scale, scale));
  matrix.setPosition(position);
  return { piece, fallId, matrix, scale, phase, poolY, alphaScale };
}

/** Lay out every kit piece for one traced fall. */
export function stackFall(path: FallPath): FallStack {
  const c = path.cascade;
  const random = lcg(hashString(`${path.id}|kit`));
  const pts = path.points;
  const { along, lipIndex } = arcFromLip(pts);
  const lip = new THREE.Vector3(pts[lipIndex].x, pts[lipIndex].y, pts[lipIndex].z);
  const plunge = new THREE.Vector3(c.plunge.x, c.plunge.y, c.plunge.z);
  const poolY = c.plunge.y;
  const dl = Math.hypot(c.direction.x, c.direction.z) || 1;
  const fwd = new THREE.Vector3(c.direction.x / dl, 0, c.direction.z / dl);
  const widthM = Math.max(c.widthM, 0.5);
  const arcM = Math.max(along[along.length - 1], 0.5);
  const instances: PieceInstance[] = [];
  const counts: Record<KitPieceId, number> = { body16: 0, body34: 0, thin7: 0, thin29: 0, crest: 0, ring: 0, skirt: 0, mistCard: 0, groundMist: 0 };
  const add = (i: PieceInstance) => { instances.push(i); counts[i.piece]++; };

  // ---- body stack ------------------------------------------------------
  const piece = bodyFamily(widthM, arcM);
  const dims = KIT_DIMS[piece as "body16" | "body34" | "thin7" | "thin29"];
  const scale = bodyScale(piece, widthM, arcM);
  const heightM = dims.heightM * scale;
  const spans = stackSpans(arcM, heightM);
  const pieceTopW = dims.topWidthM * scale;
  const lateral = lateralOffsets(widthM, pieceTopW);
  const tiltLocal = Math.atan2(dims.footForwardM, dims.heightM);
  const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
  let topY = lip.y;
  for (let k = 0; k < spans.length; k++) {
    const top = pointAtArc(pts, along, spans[k].startM);
    const bottom = pointAtArc(pts, along, spans[k].endM);
    const chord = bottom.clone().sub(top);
    const tiltWorld = Math.atan2(chord.dot(fwd), Math.max(-chord.y, 1e-3));
    const basis = frame(fwd, tiltWorld - tiltLocal);
    if (k === 0) topY = top.y;
    for (let l = 0; l < lateral.length; l++) {
      const pos = top.clone().addScaledVector(right, lateral[l]);
      add(place(piece, path.id, pos, basis, scale, random() * 100, poolY));
    }
  }

  // ---- crest on the lip --------------------------------------------------
  {
    const sc = clamp(widthM / KIT_DIMS.crest.acrossM, CREST_SCALE.min, CREST_SCALE.max);
    const basis = frame(fwd.clone().negate(), 0);           // local +z points upstream
    const origin = lip.clone().addScaledVector(fwd, CREST_OVERHANG_M - KIT_DIMS.crest.aheadM * sc);
    origin.y = lip.y + CREST_LIFT_M;
    for (const off of lateralOffsets(widthM, KIT_DIMS.crest.acrossM * sc)) {
      add(place("crest", path.id, origin.clone().addScaledVector(right, off), basis, sc, random() * 100, poolY));
    }
  }

  // ---- skirt and ring at the plunge ------------------------------------
  {
    const sk = clamp(widthM / SKIRT_SCALE.perWidthM, SKIRT_SCALE.min, SKIRT_SCALE.max);
    const pos = plunge.clone().addScaledVector(fwd, -SKIRT_BACK_M * sk);
    add(place("skirt", path.id, pos, frame(fwd, 0), sk, random() * 100, poolY));
    const rs = clamp(widthM / RING_SCALE.perWidthM, RING_SCALE.min, RING_SCALE.max);
    const ring = plunge.clone().addScaledVector(fwd, RING_AHEAD_M * rs);
    ring.y = poolY + RING_LIFT_M;
    add(place("ring", path.id, ring, frame(fwd, 0), rs, random() * 100, poolY));
  }

  // ---- mist cards around the impact ------------------------------------
  {
    const n = mistCardCount(c.dropM);
    const radius = Math.min(MIST_CARDS.radiusM, 2.5 + widthM * 0.5 + Math.min(c.dropM, 60) * 0.1);
    const widthGain = clamp(widthM / 10, 0.6, 1.5);
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(fwd.z, fwd.x) + ((i + random()) / n) * Math.PI * 2;
      const dist = (0.2 + 0.8 * Math.sqrt(random())) * radius;
      const sc = (MIST_CARD_SCALE.min + (MIST_CARD_SCALE.max - MIST_CARD_SCALE.min) * random()) * widthGain;
      const yaw = random() * Math.PI * 2;
      const pitch = ((MIST_CARD_PITCH_DEG.min + (MIST_CARD_PITCH_DEG.max - MIST_CARD_PITCH_DEG.min) * random()) * Math.PI) / 180;
      // the card lies in its y–z plane: yaw about world up, then roll it about
      // its own length (z) so it leans anywhere from upright to laid back
      const basis = new THREE.Matrix4().makeRotationY(yaw).multiply(new THREE.Matrix4().makeRotationZ(pitch));
      const pos = new THREE.Vector3(plunge.x + Math.cos(a) * dist, poolY, plunge.z + Math.sin(a) * dist);
      add(place("mistCard", path.id, pos, basis, sc, random() * 100, poolY));
    }
  }

  // ---- ground mist over the basin ---------------------------------------
  {
    const n = groundMistCount(c.dropM);
    const R = Math.max(c.bowlRadiusM ?? widthM, widthM * 0.9, 4) * GROUND_MIST_BASIN_SCALE;
    for (let i = 0; i < n; i++) {
      const a = random() * Math.PI * 2;
      const distFrac = Math.sqrt((i + random()) / n);
      const dist = distFrac * R;
      const sc = clamp((GROUND_MIST_SCALE.min + (GROUND_MIST_SCALE.max - GROUND_MIST_SCALE.min) * random())
        * (R / (KIT_DIMS.groundMist.diameterM * 0.5)), 0.25, 1.2);
      const pos = new THREE.Vector3(plunge.x + Math.cos(a) * dist, poolY + GROUND_MIST_LIFT_M, plunge.z + Math.sin(a) * dist);
      add(place("groundMist", path.id, pos, new THREE.Matrix4().makeRotationY(random() * Math.PI * 2), sc,
        random() * 100, poolY, 1 - 0.6 * smoothstep(0.5, 1, distFrac)));
    }
  }

  return {
    id: path.id,
    instances,
    body: { piece, scale, spans: spans.length, lateral: lateral.length, topY,
      topWidthM: pieceTopW + (lateral.length - 1) * pieceTopW * LATERAL_STEP },
    counts,
  };
}
