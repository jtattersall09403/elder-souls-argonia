import * as THREE from "three";
import type { WaterMeta } from "../waterData";
import type { WaterRuntime } from "./types";
import { WATER_LAYER } from "./waterMaterial";
import type { ChannelStrip } from "./ChannelStrips";
import { WHITEWATER_GLSL, STREAK_LAYERS, streakSpeedGain } from "./whitewaterStreaks";
import { PlungeBase } from "./PlungeBase";

/**
 * Waterfall sheets for the compiled cascade lips (decision 0047; research
 * `waterfalls-realtime.md` §4.1: a procedural ribbon carrying Bethesda's
 * measured numbers — nobody simulates the fall, and an authored Skyrim body
 * NIF is never snapped to a computed path).
 *
 * The path is traced ONCE at load, in the vertical plane along the cascade's
 * `direction`, against the refined-terrain `profile` the compiler exports:
 * free ballistic flight from the lip, hugging the ground (+`GROUND_CLEARANCE_M`)
 * wherever the arc would pass below it, and detaching again when the ground
 * falls away faster than the arc.
 *
 * Classification (the alignment guard the two failed attempts lacked): a path
 * is a FALL only if it leaves the ground by ≥ `FREE_FLIGHT_MIN_AIR_M` over a
 * contiguous ≥ `FREE_FLIGHT_MIN_SPAN_M` of arc. Anything else is a ramp and
 * is not drawn as a free-fall body at all — `chuteStrips` hands it to the
 * strip mesh (ES_STRIP whitewater shader), so one reach is one piece.
 *
 * Geometry per fall (owner steer 2026-09-08: stack it the way Bethesda places
 * the vanilla thin sheets, not as one continuous ribbon): the traced path is
 * cut into PIECES of a family height (7.5 / 29 / 44 / 58 m, chosen by drop),
 * successive pieces overlapping by a third (they stack at 2/3 of a piece
 * height) and, for a fall wider than the piece, lateral copies with ~2x
 * width overlap. Every piece copy carries its own 0..1 UV rectangle
 * (`aPieceUv`) so the vanilla texture layout binds when the FX textures
 * arrive, its own scroll phase so copies never move in lockstep, and an
 * end fade across each overlap. Each piece has three body ribbons (front /
 * back / core); the fall as a whole gets the crest wrap (the sheet starts
 * `CREST_BACK_M` upstream of the lip at lip level, foam boosted over
 * `CREST_FOAM_M` past the lip), two mirrored side strips whose width and
 * texture pinch in toward the top (Taiji), and the plunge base kit
 * (`PlungeBase`: 12–19 flat quads on the pool, Bethesda's `CurrentPlane`
 * set). Shading is unlit aerated white x1.0 in free fall, x0.75 on a chute
 * reach, streaks scrolled down each piece's own arc in metres.
 */

export type Cascade = NonNullable<WaterMeta["cascades"]>[number];

export const GRAVITY_MPS2 = 9.81;
/** Below this the compiler does not emit a cascade at all; guard anyway. */
export const MIN_CASCADE_DROP_M = 2.5;
/** Minimum launch speed: a lip is never truly still water. */
export const MIN_LIP_SPEED_MS = 1.5;
/** How far the sheet floats above ground while it is following it. */
export const GROUND_CLEARANCE_M = 0.12;
/** Crest wrap: sheet starts this far upstream of the lip, at lip level. */
export const CREST_BACK_M = 2.5;
/** Foam is boosted to ~1 over this much arc past the lip: Bethesda's 5.1 m
 * crest strip sits at lip + 0.5 m (vault audit §5), so ~3 m past the lip. */
export const CREST_FOAM_M = 3;
/** One sheet never spans more than this much fall (UV scroll + overdraw). */
export const MAX_SEGMENT_DROP_M = 60;
/** Front/back layer separation — the thickness illusion. */
export const SHEET_THICKNESS_M = 0.25;
/**
 * Three body layers (owner refinement): a falling sheet has to read as a
 * plunging VOLUME. Front and back give the 0.25 m thickness; a narrower,
 * brighter core down the middle of the flow gives the body its mass.
 */
export const SHEET_LAYERS = [
  { offsetM: 0, widthScale: 1, tint: 1 },
  { offsetM: -SHEET_THICKNESS_M, widthScale: 1, tint: 0.55 },
  { offsetM: SHEET_THICKNESS_M * 0.5, widthScale: 0.55, tint: 1.25 },
] as const;
/**
 * Vanilla thin-sheet families (vault audit §2.2; `NNNNxNNN` = drop x width
 * in game units at 70.03 u/m): 512x128, 2048x512, 3072x256, 4096x256.
 * A fall picks the smallest family that spans its drop, the tallest beyond.
 */
export const SHEET_PIECE_FAMILIES = [
  { heightM: 7.5, widthM: 1.83 },
  { heightM: 29, widthM: 7.3 },
  { heightM: 44, widthM: 3.66 },
  { heightM: 58, widthM: 3.66 },
] as const;
export type SheetPieceFamily = (typeof SHEET_PIECE_FAMILIES)[number];
/** Successive pieces overlap by this fraction of a piece (stack at 2/3 H). */
export const SHEET_PIECE_OVERLAP = 1 / 3;
/** Lateral copies are spaced half a piece width apart (~2x width overlap). */
export const SHEET_LATERAL_OVERLAP = 2;
/** Layer index of the mirrored side strips. */
export const SIDE_STRIP_LAYER = 3;
/** Side strip width at the foot of the fall (m); it pinches to 10 % at the lip. */
export const SIDE_STRIP_M = 0.6;
export const SIDE_STRIP_PINCH = 0.1;
/** Per-layer alpha and soft-particle fade depth (m), from `softFalloffDepth`:
 * 40 u = 0.57 m on the sheets, 75 u = 1.07 m on the spray (side strips)
 * (vault audit §4 rule 5). */
export const SHEET_LAYER_ALPHA = [1, 0.68, 0.85, 0.7] as const;
export const SHEET_DEPTH_FADE_M = [0.57, 0.57, 0.57, 1.07] as const;
/** Unlit emissive multiple: unit white in free fall, 0.75 on a chute reach;
 * the spray-class side strips carry the thin sheets' 0.70 grey x 0.75. */
export const SHEET_EMISSIVE = { free: 1.0, chute: 0.75, side: 0.53 } as const;
/** View-angle falloff: opacity 1 → 0 between cos 0.26 and cos 0.09 (≈75°→85°
 * from the normal; vault audit §7) — edge-on layers fade out. */
export const SHEET_FACING_FADE = { start: 0.09, full: 0.26 } as const;
/**
 * Hard bounds on one traced path, independent of the cascade record: the
 * trace also stops at the end of the exported profile, but a record with a
 * kilometres-long profile (or a stalled arc) must still cost O(steps), never
 * grow without limit. Longest shipped path (fall-33, 259 m drop) is ~700 points.
 */
export const MAX_TRACE_STEPS = 4096;
export const MAX_TRACE_RUN_M = 1500;
const MAX_FALL_SPEED_MS = 40;
/**
 * Water running ON the bed loses energy to friction and aeration; only free
 * flight converts drop into speed cleanly. Without this a long chute reached
 * ~28 m/s and the next bump launched it into a 20 m flat ballistic plate that
 * never came back down.
 */
export const CHUTE_DROP_EFFICIENCY = 0.4;
/** Hard cap on bed-following speed (m/s) — a rapid, not a railgun. */
export const MAX_CHUTE_SPEED_MS = 12;
/** Consecutive path points closer than this cannot make a drawable quad. */
export const MIN_QUAD_LENGTH_M = 1e-4;
/** Air under the sheet before a reach counts as free flight rather than chute. */
export const FREE_FLIGHT_MIN_AIR_M = 0.5;
/** ... and that much air must persist over this much contiguous arc. */
export const FREE_FLIGHT_MIN_SPAN_M = 3;
/** A strip `lip`/`plunge` end within this distance of a cascade's own point
 * is the same point: the sheet snaps to it exactly. */
export const STRIP_ALIGN_TOLERANCE_M = 3;

export interface FallPathPoint {
  /** Distance from the lip along the horizontal direction (m); negative upstream. */
  s: number;
  x: number; y: number; z: number;
  /** Water speed along the path here (m/s). */
  speedMS: number;
  /** True where the water is in free flight rather than following ground. */
  free: boolean;
  /** Height above the ground it would otherwise hug (m). */
  airM: number;
}

export interface FallPath {
  id: string;
  points: FallPathPoint[];
  /** Contiguous slices, each spanning at most `MAX_SEGMENT_DROP_M` of fall. */
  segments: FallPathPoint[][];
  /** True only when the water is in the air by ≥ `FREE_FLIGHT_MIN_AIR_M`
   * over a contiguous ≥ `FREE_FLIGHT_MIN_SPAN_M` of arc. A ramp is false and
   * is drawn as a chute strip, never as a fall body. */
  freeFlight: boolean;
  /** Longest contiguous arc (m) with that much air under the sheet. */
  freeSpanM: number;
  dropM: number;
  widthM: number;
  /** The cascade as traced (after strip alignment). */
  cascade: Cascade;
}

function terrainSampler(fall: Cascade): (s: number) => number | null {
  const profile = fall.profile;
  const step = fall.profileStepM ?? 1;
  const start = fall.profileStartM ?? 0;
  if (!profile || profile.length < 2 || !(step > 0)) return () => null;
  const last = profile.length - 1;
  return (s: number) => {
    const f = (s - start) / step;
    if (f < 0) return profile[0];
    if (f >= last) return null; // past the exported profile: nothing to hug
    const i = Math.floor(f);
    const t = f - i;
    return profile[i] * (1 - t) + profile[i + 1] * t;
  };
}

/** Longest contiguous arc length (m) over which the sheet has ≥ `minAirM` under it. */
export function freeFlightSpanM(points: readonly FallPathPoint[], minAirM = FREE_FLIGHT_MIN_AIR_M): number {
  let best = 0;
  let run = 0;
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    const q = points[i - 1];
    if (p.free && p.airM >= minAirM && q.airM >= minAirM) {
      run += Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }
  return best;
}

/**
 * Alignment guard: when a compiled strip ends at a `lip` (or resumes at a
 * `plunge`) within `STRIP_ALIGN_TOLERANCE_M` of the cascade's own point, the
 * sheet is traced FROM that exact point, so the ribbon and the sheet meet
 * (attempt 2's misalignment would have failed this). Returns a copy.
 */
export function alignCascadeToStrips(fall: Cascade, channels: readonly ChannelStrip[] | undefined,
  toleranceM = STRIP_ALIGN_TOLERANCE_M): Cascade {
  if (!channels?.length) return fall;
  let lip = fall.lip;
  let plunge = fall.plunge;
  let bestLip = toleranceM * toleranceM;
  let bestPlunge = toleranceM * toleranceM;
  for (const strip of channels) {
    const pts = strip.points;
    if (!pts?.length) continue;
    const last = pts[pts.length - 1];
    if (last.kind === "lip") {
      const d = (last.x - fall.lip.x) ** 2 + (last.z - fall.lip.z) ** 2;
      if (d < bestLip) { bestLip = d; lip = { x: last.x, y: last.y, z: last.z }; }
    }
    const first = pts[0];
    if (first.kind === "plunge") {
      const d = (first.x - fall.plunge.x) ** 2 + (first.z - fall.plunge.z) ** 2;
      if (d < bestPlunge) { bestPlunge = d; plunge = { x: first.x, y: first.y, z: first.z }; }
    }
  }
  if (lip === fall.lip && plunge === fall.plunge) return fall;
  return { ...fall, lip, plunge };
}

/** Ballistic sheet path from the lip, clamped onto the exported ground profile. */
export function traceWaterfallSheet(fall: Cascade, options: { stepM?: number } = {}): FallPath {
  const stepM = Math.min(Math.max(options.stepM ?? 0.5, 0.05), 5);
  let dx = fall.direction.x;
  let dz = fall.direction.z;
  let dl = Math.hypot(dx, dz);
  if (!(dl > 1e-6)) {
    dx = fall.plunge.x - fall.lip.x;
    dz = fall.plunge.z - fall.lip.z;
    dl = Math.hypot(dx, dz) || 1;
  }
  dx /= dl; dz /= dl;
  const at = (s: number, y: number): Omit<FallPathPoint, "speedMS" | "free" | "airM"> =>
    ({ s, x: fall.lip.x + dx * s, y, z: fall.lip.z + dz * s });
  const ground = terrainSampler(fall);
  const v0 = Math.max(fall.lipSpeedMS ?? 0, MIN_LIP_SPEED_MS);
  const plungeY = fall.plunge.y;

  const points: FallPathPoint[] = [
    { ...at(-CREST_BACK_M, fall.lip.y), speedMS: v0, free: false, airM: 0 },
    { ...at(0, fall.lip.y), speedMS: v0, free: false, airM: 0 },
  ];

  let s = 0;
  let y = fall.lip.y;
  let vs = v0;      // horizontal speed
  let vy = 0;       // vertical speed (negative = falling)
  let free = true;
  /** Re-seat the water on the bed: speed grows with the height just lost. */
  const attach = (run: number, drop: number, speed: number) => {
    const newSpeed = Math.min(
      Math.sqrt(speed * speed + 2 * GRAVITY_MPS2 * Math.max(drop, 0) * CHUTE_DROP_EFFICIENCY),
      MAX_CHUTE_SPEED_MS, MAX_FALL_SPEED_MS);
    const len = Math.hypot(run, drop) || 1;
    vs = (newSpeed * run) / len;
    vy = (-newSpeed * drop) / len;
  };
  for (let step = 0; step < MAX_TRACE_STEPS; step++) {
    const speed = Math.max(Math.hypot(vs, vy), 0.05);
    let ns: number;
    let ny: number;
    let air = 0;
    if (free) {
      const dt = Math.min(stepM / speed, 0.2);
      ns = s + Math.max(vs * dt, 1e-3);
      ny = y + vy * dt - 0.5 * GRAVITY_MPS2 * dt * dt;
      const g = ground(ns);
      if (g === null) { points.push({ ...at(ns, ny), speedMS: speed, free, airM: 0 }); break; }
      const floorM = g + GROUND_CLEARANCE_M;
      if (ny < floorM) {
        // The arc met the bed: from here the water is a chute, not a fall.
        ny = floorM;
        free = false;
        attach(ns - s, y - ny, speed);
      } else {
        vy -= GRAVITY_MPS2 * dt;
        air = ny - floorM;
      }
    } else {
      ns = s + stepM;
      const g = ground(ns);
      if (g === null) { points.push({ ...at(ns, y), speedMS: speed, free, airM: 0 }); break; }
      const floorM = g + GROUND_CLEARANCE_M;
      // Launch test: hold the current heading for one step and see whether the
      // bed falls away from under it. (Comparing the arc against the NEXT bed
      // height is the only test that can fire — a path re-seated on the bed
      // every step is by construction never above it.)
      const dtFree = stepM / Math.max(vs, 0.05);
      const yFree = y + vy * dtFree - 0.5 * GRAVITY_MPS2 * dtFree * dtFree;
      if (yFree > floorM + 0.02) {
        ny = yFree;
        vy -= GRAVITY_MPS2 * dtFree;
        free = true;
        air = ny - floorM;
      } else {
        ny = floorM;
        attach(ns - s, y - ny, speed);
      }
    }
    s = ns;
    y = ny;
    points.push({ ...at(s, y), speedMS: Math.min(Math.hypot(vs, vy), MAX_FALL_SPEED_MS), free,
      airM: Math.max(air, 0) });
    // The sheet ends where it reaches the receiving level. A bed-following
    // reach sits GROUND_CLEARANCE_M above the bed, so test against that too —
    // otherwise a landed sheet ran on along the pool floor to the end of the
    // exported profile (54 m of path for a 20 m fall).
    if (y <= plungeY + GROUND_CLEARANCE_M + 1e-3) break;
    if (s >= MAX_TRACE_RUN_M) break;
  }

  const dropM = fall.lip.y - points[points.length - 1].y;
  const segments: FallPathPoint[][] = [];
  let current: FallPathPoint[] = [points[0]];
  let segTop = points[0].y;
  for (let i = 1; i < points.length; i++) {
    current.push(points[i]);
    if (segTop - points[i].y >= MAX_SEGMENT_DROP_M && i < points.length - 1) {
      segments.push(current);
      current = [points[i]];
      segTop = points[i].y;
    }
  }
  if (current.length >= 2) segments.push(current);
  else if (segments.length === 0) segments.push(points);

  const freeSpanM = freeFlightSpanM(points);
  return {
    id: fall.id,
    points,
    segments,
    freeFlight: freeSpanM >= FREE_FLIGHT_MIN_SPAN_M,
    freeSpanM,
    dropM,
    widthM: Math.max(fall.widthM, 0.5),
    cascade: fall,
  };
}

/**
 * A ramp's path as a strip record for `buildChannelStripGeometry`: the same
 * ribbon the compiler's steep reaches use, shaded by ES_STRIP. Both ends are
 * `join`s (the first is the crest wrap upstream of the lip, on the field).
 */
export function chuteStripFromPath(path: FallPath): ChannelStrip {
  const fall = path.cascade;
  const last = path.points.length - 1;
  return {
    id: `${fall.id}:chute`,
    band: fall.riverBand,
    points: path.points.map((p, i) => ({
      x: p.x, z: p.z, y: p.y,
      bedY: p.y - GROUND_CLEARANCE_M - 0.05,
      halfWidthM: path.widthM * 0.5,
      speedMS: Math.max(p.speedMS, MIN_LIP_SPEED_MS),
      season: 0,
      kind: i === 0 || i === last ? "join" : "steep",
    })),
  };
}

export interface TracedCascades {
  /** Fall bodies: paths with real free flight. */
  sheets: FallPath[];
  /** Ramps, as strip records for the ES_STRIP ribbon mesh. */
  chutes: ChannelStrip[];
  /** Every traced path, by id (emitters spaced along a fall need the ramps too). */
  paths: FallPath[];
}

/** Trace, align to the strips and classify every compiled cascade once. */
export function traceCascades(cascades: readonly Cascade[],
  options: { stepM?: number; channels?: readonly ChannelStrip[] } = {}): TracedCascades {
  const paths = cascades
    .filter((c) => Number.isFinite(c.dropM) && c.dropM >= MIN_CASCADE_DROP_M)
    .map((c) => traceWaterfallSheet(alignCascadeToStrips(c, options.channels), options))
    .filter((p) => p.points.length >= 2);
  return {
    sheets: paths.filter((p) => p.freeFlight),
    chutes: paths.filter((p) => !p.freeFlight).map(chuteStripFromPath),
    paths,
  };
}

/** The vanilla family for a drop: smallest piece that spans it, else the tallest. */
export function sheetPieceFamily(dropM: number): SheetPieceFamily {
  for (const f of SHEET_PIECE_FAMILIES) if (dropM <= f.heightM) return f;
  return SHEET_PIECE_FAMILIES[SHEET_PIECE_FAMILIES.length - 1];
}

export interface SheetPieceSpan {
  startM: number;
  endM: number;
  /** Overlap (m) with the neighbour above / below; 0 at the fall's ends. */
  overlapTopM: number;
  overlapBottomM: number;
}

/**
 * Piece spans down a path of `lengthM` for a family height: count =
 * ceil(length / (2/3 H)), piece k covers [k·2/3 H, k·2/3 H + H] clipped to the
 * path, so neighbours overlap by H/3 (the vanilla stacking, audit §5).
 */
export function sheetPieceSpans(lengthM: number, heightM: number): SheetPieceSpan[] {
  const step = heightM * (1 - SHEET_PIECE_OVERLAP);
  // one piece when it spans the path; otherwise enough that the last piece's
  // foot reaches the end (never a short stub that is all overlap)
  const count = lengthM <= heightM ? 1 : Math.ceil((lengthM - heightM) / step) + 1;
  const spans: SheetPieceSpan[] = [];
  for (let k = 0; k < count; k++) {
    const startM = k * step;
    const endM = Math.min(startM + heightM, lengthM);
    if (endM - startM < 1e-6) break;
    spans.push({ startM, endM, overlapTopM: 0, overlapBottomM: 0 });
  }
  for (let k = 0; k < spans.length; k++) {
    if (k > 0) spans[k].overlapTopM = Math.max(spans[k - 1].endM - spans[k].startM, 0);
    if (k + 1 < spans.length) spans[k].overlapBottomM = Math.max(spans[k].endM - spans[k + 1].startM, 0);
  }
  return spans;
}

/**
 * Lateral piece centres (signed metres across) for a fall `widthM` wide built
 * from pieces `pieceWidthM` wide: one piece clipped to the fall when it fits,
 * otherwise copies spaced ≤ half a piece apart spanning the width, so every
 * point is under ~2 pieces.
 */
export function sheetLateralOffsets(widthM: number, pieceWidthM: number): { offsets: number[]; pieceWidthM: number } {
  if (widthM <= pieceWidthM) return { offsets: [0], pieceWidthM: widthM };
  const span = widthM - pieceWidthM;
  const count = Math.ceil(span / (pieceWidthM / SHEET_LATERAL_OVERLAP)) + 1;
  const offsets = Array.from({ length: count }, (_, i) => -span / 2 + (span * i) / (count - 1));
  return { offsets, pieceWidthM };
}

/** Deterministic per-piece scroll phase (s) in one breathe period. */
function piecePhaseS(id: string, k: number, lateral: number): number {
  let h = 0x811c9dc5;
  for (const ch of `${id}|${k}|${lateral}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return (h % 8330) / 1000;
}

export interface WaterfallSheetGeometry {
  geometry: THREE.BufferGeometry;
  fallCount: number;
  segmentCount: number;
  /** Piece copies (vertical spans x lateral copies) over every fall. */
  pieceCount: number;
  /** Mirrored side strips (two per segment). */
  sideStripCount: number;
  vertexCount: number;
  triangleCount: number;
  freeFlightCount: number;
  /** Zero-area quads dropped at build time (see `MIN_QUAD_LENGTH_M`). */
  skippedQuads: number;
  paths: FallPath[];
  chutes: ChannelStrip[];
}

/** All fall bodies in one geometry; ramps come back as `chutes` instead. */
export function buildWaterfallSheetGeometry(
  cascades: readonly Cascade[],
  options: { stepM?: number; channels?: readonly ChannelStrip[] } = {},
): WaterfallSheetGeometry {
  const traced = traceCascades(cascades, options);
  const paths = traced.sheets;

  const position: number[] = [];
  const uv: number[] = [];
  const speed: number[] = [];
  const layer: number[] = [];
  const tint: number[] = [];
  const frac: number[] = [];
  const air: number[] = [];
  const slope: number[] = [];
  const piece: number[] = [];    // (piece start arc m, piece height m, scroll phase s)
  const pieceUv: number[] = [];  // the piece's own 0..1 rectangle
  const fade: number[] = [];     // cross-fade across piece overlaps
  const index: number[] = [];
  let segmentCount = 0;
  let pieceCount = 0;
  let sideStripCount = 0;
  let skippedQuads = 0;

  for (const path of paths) {
    const totalDrop = Math.max(path.dropM, 0.01);
    const pts = path.points;
    if (pts.length < 2) continue;
    // arc length from the crest wrap start (metres) drives every UV
    const along: number[] = [0];
    for (let i = 1; i < pts.length; i++) {
      along.push(along[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z));
    }
    const lengthM = along[along.length - 1];
    // Local descent slope (|dy| / path length) drives the whitewater term on
    // bed-following reaches: a chute is white because it is steep and fast,
    // not because it has fallen far.
    const slopeAt: number[] = [];
    const fracAt: number[] = [];
    const frames: { tx: number; tz: number; nx: number; nz: number }[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[Math.max(i - 1, 0)];
      const b = pts[Math.min(i + 1, pts.length - 1)];
      const run = Math.hypot(b.x - a.x, b.z - a.z);
      const drop = Math.max(a.y - b.y, 0);
      slopeAt.push(drop / Math.max(Math.hypot(run, drop), 1e-6));
      fracAt.push(Math.min(Math.max((pts[0].y - pts[i].y) / totalDrop, 0), 1));
      let tx = b.x - a.x;
      let tz = b.z - a.z;
      const tl = Math.hypot(tx, tz);
      if (tl > 1e-6) { tx /= tl; tz /= tl; } else { tx = 1; tz = 0; }
      frames.push({ tx, tz, nx: -tz, nz: tx });
    }
    const pushVertex = (i: number, x: number, z: number, u: number, l: number, t: number,
      pieceStartM: number, pieceHeightM: number, phaseS: number, endFade: number, pieceU: number) => {
      const p = pts[i];
      position.push(x, p.y, z);
      uv.push(u, along[i]);
      speed.push(p.speedMS);
      layer.push(l);
      tint.push(t);
      frac.push(fracAt[i]);
      air.push(Math.max(p.airM, 0));
      slope.push(slopeAt[i]);
      piece.push(pieceStartM, pieceHeightM, phaseS);
      pieceUv.push(pieceU, Math.min(Math.max((along[i] - pieceStartM) / pieceHeightM, 0), 1));
      fade.push(endFade);
    };
    const pushQuads = (base: number, first: number, last: number) => {
      for (let i = first; i < last; i++) {
        // A quad between two coincident path points has zero area: it draws
        // nothing but it does stack an extra transparent layer's worth of
        // alpha where the trace stalls. Skip it.
        const p = pts[i];
        const q = pts[i + 1];
        if (Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) < MIN_QUAD_LENGTH_M) { skippedQuads++; continue; }
        const a = base + (i - first) * 2;
        index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    };

    // ---- the body: a stack of vanilla-sized pieces ----------------------
    const family = sheetPieceFamily(path.dropM);
    const spans = sheetPieceSpans(lengthM, family.heightM);
    const lateral = sheetLateralOffsets(path.widthM, family.widthM);
    segmentCount += spans.length;
    for (let k = 0; k < spans.length; k++) {
      const span = spans[k];
      let first = 0;
      while (first + 1 < pts.length && along[first + 1] <= span.startM) first++;
      let last = first;
      while (last + 1 < pts.length && along[last] < span.endM) last++;
      if (last - first < 1) continue;
      const height = Math.max(span.endM - span.startM, 1e-3);
      const endFadeAt = (i: number) => {
        const a = along[i];
        let f = 1;
        if (span.overlapTopM > 0) f *= smoothstep(span.startM, span.startM + span.overlapTopM, a);
        if (span.overlapBottomM > 0) f *= smoothstep(span.endM, span.endM - span.overlapBottomM, a);
        return f;
      };
      for (let c = 0; c < lateral.offsets.length; c++) {
        pieceCount++;
        const phase = piecePhaseS(path.id, k, c);
        const centre = lateral.offsets[c];
        for (let l = 0; l < SHEET_LAYERS.length; l++) {
          const spec = SHEET_LAYERS[l];
          const base = position.length / 3;
          const half = lateral.pieceWidthM * 0.5 * spec.widthScale;
          const back = -spec.offsetM;
          for (let i = first; i <= last; i++) {
            const p = pts[i];
            const { tx, tz, nx, nz } = frames[i];
            const f = endFadeAt(i);
            for (const side of [-1, 1]) {
              const across = centre + half * side;
              // u across the WHOLE fall for the width profile; the piece's own
              // 0..1 rectangle rides aPieceUv
              const uFall = Math.min(Math.max(0.5 + across / path.widthM, 0), 1);
              pushVertex(i, p.x + nx * across - tx * back, p.z + nz * across - tz * back, uFall, l, spec.tint,
                span.startM, height, phase, f, side < 0 ? 0 : 1);
            }
          }
          pushQuads(base, first, last);
        }
      }
    }

    // ---- mirrored side strips for the whole fall: inner edge just inside
    // the sheet edge, outer edge flaring from 10 % of SIDE_STRIP_M at the lip
    // to the full width at the foot — the taper that reads as spray rather
    // than a cut card
    for (const side of [-1, 1]) {
      sideStripCount++;
      const base = position.length / 3;
      const half = path.widthM * 0.5;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const { nx, nz } = frames[i];
        const flare = SIDE_STRIP_M * (SIDE_STRIP_PINCH + (1 - SIDE_STRIP_PINCH) * fracAt[i]);
        const inner = half * 0.85;
        const outer = half + flare;
        pushVertex(i, p.x + nx * inner * side, p.z + nz * inner * side, 0, SIDE_STRIP_LAYER, SHEET_EMISSIVE.side,
          0, Math.max(lengthM, 1e-3), 0, 1, 0);
        pushVertex(i, p.x + nx * outer * side, p.z + nz * outer * side, 1, SIDE_STRIP_LAYER, SHEET_EMISSIVE.side,
          0, Math.max(lengthM, 1e-3), 0, 1, 1);
      }
      pushQuads(base, 0, pts.length - 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute("aSheetUv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute("aSpeed", new THREE.Float32BufferAttribute(speed, 1));
  geometry.setAttribute("aLayer", new THREE.Float32BufferAttribute(layer, 1));
  geometry.setAttribute("aTint", new THREE.Float32BufferAttribute(tint, 1));
  geometry.setAttribute("aFrac", new THREE.Float32BufferAttribute(frac, 1));
  geometry.setAttribute("aAir", new THREE.Float32BufferAttribute(air, 1));
  geometry.setAttribute("aSlope", new THREE.Float32BufferAttribute(slope, 1));
  geometry.setAttribute("aPiece", new THREE.Float32BufferAttribute(piece, 3));
  geometry.setAttribute("aPieceUv", new THREE.Float32BufferAttribute(pieceUv, 2));
  geometry.setAttribute("aEndFade", new THREE.Float32BufferAttribute(fade, 1));
  geometry.setIndex(index);
  geometry.computeBoundingSphere();
  return {
    geometry,
    fallCount: paths.length,
    segmentCount,
    pieceCount,
    sideStripCount,
    vertexCount: position.length / 3,
    triangleCount: index.length / 3,
    freeFlightCount: paths.length,
    skippedQuads,
    paths: traced.paths,
    chutes: traced.chutes,
  };
}


/* ------------------------------------------------------------------ *
 * Across-width, aeration and alpha twins.
 *
 * The shader and the TS twins below MUST stay in step: the twins are what
 * the unit tests measure, and `SHEET_PROFILE_GLSL` is the literal source the
 * fragment shader compiles. Edit both or neither.
 * ------------------------------------------------------------------ */

/** Across-width coverage: 1 down the middle, hard 0 at both edges. */
export function sheetWidthProfile(u: number): number {
  const x = Math.min(Math.max(u, 0), 1);
  return smoothstep(0, 0.3, x) * smoothstep(1, 0.7, x);
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
}

export interface SheetSampleInput {
  /** Across-width coordinate, 0..1. */
  u: number;
  /** Layer index: 0..2 body layers, 3 side strip. */
  layer: number;
  /** Fraction of the total drop already fallen, 0..1. */
  frac: number;
  /** Local water speed (m/s). */
  speedMS: number;
  /** Local descent slope, 0 (flat) .. 1 (sheer). */
  slope: number;
  /** Air under the sheet (m); 0 where it is running on the bed. */
  airM: number;
  /** True in free flight. */
  free: boolean;
  /** Combined streak+churn noise, 0..1 (the shader's animated term). */
  noise?: number;
  /** Scene depth behind the fragment minus fragment depth (m). */
  depthDeltaM?: number;
  /** |dot(face normal, view)|: 1 face-on, 0 edge-on. */
  facing?: number;
  opacity?: number;
}

/** Aeration (0..1): how white the water is here. */
export function sheetAeration(i: Pick<SheetSampleInput, "free" | "speedMS" | "frac" | "slope">): number {
  if (i.free) {
    return clamp01(Math.min(0.22 + i.speedMS * 0.05 + smoothstep(0.15, 0.75, i.frac) * 0.55, 0.98));
  }
  // Whitewater: a chute is aerated by speed and steepness, all the way down.
  return clamp01(Math.min(0.42 + i.speedMS * 0.045 + smoothstep(0.08, 0.5, i.slope) * 0.45, 0.99));
}

/** Unlit emissive multiple: 1.0 in free fall, 0.75 running on rock (§2.4). */
export function sheetEmissive(free: boolean): number {
  return free ? SHEET_EMISSIVE.free : SHEET_EMISSIVE.chute;
}

/** Crest foam boost, 1 over the wrap and the first `CREST_FOAM_M` past the lip. */
export function sheetCrestBoost(arcM: number): number {
  return 1 - smoothstep(CREST_BACK_M, CREST_BACK_M + CREST_FOAM_M, arcM);
}

/** Side-strip texture pinch: the across coordinate converges toward the top. */
export function sideStripPinchedU(u: number, frac: number): number {
  return 0.5 + (u - 0.5) * (0.2 + 0.8 * clamp01(frac));
}

/** The fragment shader's alpha, minus tone mapping — the twin the tests read. */
export function sheetAlpha(i: SheetSampleInput): number {
  const profile = sheetWidthProfile(i.u);
  const noise = clamp01(i.noise ?? 0.5);
  const l = Math.min(Math.max(Math.round(i.layer), 0), SHEET_LAYER_ALPHA.length - 1);
  let alpha = (i.opacity ?? 1) * profile * (0.55 + 0.45 * noise) * SHEET_LAYER_ALPHA[l];
  alpha *= 1 - smoothstep(0.85, 1, i.frac);
  // faces seen edge-on fade out (no hard silhouette cut)
  alpha *= smoothstep(SHEET_FACING_FADE.start, SHEET_FACING_FADE.full, i.facing ?? 1);
  // Soft particle, but only where there IS air behind the sheet. Water running
  // on the bed is in contact with it and must not fade against it.
  const freeness = smoothstep(0.15, 1.2, i.airM);
  const depthFade = smoothstep(0, SHEET_DEPTH_FADE_M[l], i.depthDeltaM ?? 0);
  alpha *= 1 + freeness * (depthFade - 1);
  return clamp01(alpha);
}

function clamp01(v: number): number { return Math.min(Math.max(v, 0), 1); }

/** Compiled into the fragment shader; twin of the functions above. */
export const SHEET_PROFILE_GLSL = /* glsl */ `
float esSheetWidthProfile(float u){
  float x = clamp(u, 0.0, 1.0);
  return smoothstep(0.0, 0.3, x) * smoothstep(1.0, 0.7, x);
}
float esSheetAeration(float free, float speed, float frac, float slope){
  float air = free > 0.5
    ? min(0.22 + speed * 0.05 + smoothstep(0.15, 0.75, frac) * 0.55, 0.98)
    : min(0.42 + speed * 0.045 + smoothstep(0.08, 0.5, slope) * 0.45, 0.99);
  return clamp(air, 0.0, 1.0);
}
float esSheetCrest(float arcM){
  return 1.0 - smoothstep(${CREST_BACK_M.toFixed(2)}, ${(CREST_BACK_M + CREST_FOAM_M).toFixed(2)}, arcM);
}
float esSheetLayerAlpha(float layer){
  return layer < 0.5 ? ${SHEET_LAYER_ALPHA[0].toFixed(2)} : (layer < 1.5 ? ${SHEET_LAYER_ALPHA[1].toFixed(2)}
    : (layer < 2.5 ? ${SHEET_LAYER_ALPHA[2].toFixed(2)} : ${SHEET_LAYER_ALPHA[3].toFixed(2)}));
}
float esSheetDepthFadeM(float layer){
  return layer < 0.5 ? ${SHEET_DEPTH_FADE_M[0].toFixed(2)} : (layer < 1.5 ? ${SHEET_DEPTH_FADE_M[1].toFixed(2)}
    : (layer < 2.5 ? ${SHEET_DEPTH_FADE_M[2].toFixed(2)} : ${SHEET_DEPTH_FADE_M[3].toFixed(2)}));
}
`;

const SHEET_VERTEX = /* glsl */ `
attribute vec2 aSheetUv;
attribute float aSpeed;
attribute float aLayer;
attribute float aTint;
attribute float aFrac;
attribute float aAir;
attribute float aSlope;
attribute vec3 aPiece;
attribute vec2 aPieceUv;
attribute float aEndFade;
varying vec2 vSheetUv;
varying float vSpeed;
varying float vLayer;
varying float vTint;
varying float vFrac;
varying float vAir;
varying float vSlope;
varying vec3 vPiece;
varying vec2 vPieceUv;
varying float vEndFade;
varying vec3 vWorldPos;
uniform float uVerticalScale;
#include <common>
void main() {
  vSheetUv = aSheetUv;
  vPiece = aPiece;
  vPieceUv = aPieceUv;
  vEndFade = aEndFade;
  vSpeed = aSpeed;
  vLayer = aLayer;
  vTint = aTint;
  vFrac = aFrac;
  vAir = aAir;
  vSlope = aSlope;
  vec3 transformed = vec3(position.x, position.y * uVerticalScale, position.z);
  #include <worldpos_vertex>
  vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const SHEET_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vSheetUv;
varying float vSpeed;
varying float vLayer;
varying float vTint;
varying float vFrac;
varying float vAir;
varying float vSlope;
varying vec3 vPiece;
varying vec2 vPieceUv;
varying float vEndFade;
varying vec3 vWorldPos;
uniform float uTime;
uniform vec3 uAmbient;
uniform vec3 uSunLight;
uniform vec3 uSunDir;
uniform sampler2D uSceneDepth;
uniform float uHasDepth;
uniform float uCamNear;
uniform float uCamFar;
uniform vec2 uResolution;
uniform float uOpacity;
#include <common>
${WHITEWATER_GLSL}
${SHEET_PROFILE_GLSL}

void main() {
  // Streaks: three layers scrolled DOWN THE SHEET'S OWN ARC (aSheetUv.y is
  // metres from the crest) at the measured 0.313 / 0.857 / 0.075 tiles/s x
  // speed gain, plus the U drift and U-scale breathing (whitewaterStreaks.ts).
  // Never world position x time.
  float arc = vSheetUv.y;
  float gain = esStreakGain(vSpeed);
  bool sideStrip = vLayer > 2.5;
  // side strips pinch their texture in toward the top (Taiji)
  float u = sideStrip ? 0.5 + (vSheetUv.x - 0.5) * (0.2 + 0.8 * vFrac) : vSheetUv.x;
  // each piece scrolls its OWN rectangle (arc from the piece top, own phase)
  // so stacked and side-by-side copies never move in lockstep; the width
  // profile still spans the whole fall
  float pieceArc = arc - vPiece.x;
  float foam;
  float streak = esWhitewater(sideStrip ? u : vPieceUv.x, sideStrip ? arc : pieceArc, uTime + vPiece.z, gain, vFrac, foam);

  // Across-width profile: opaque whitewater down the middle, smoothly gone at
  // both edges. Colour AND alpha ride it.
  float profile = esSheetWidthProfile(vSheetUv.x);
  // Aeration: free flight entrains air with the distance fallen; a chute is
  // aerated by local speed and steepness instead, so it stays white end to end.
  float freeHere = step(0.15, vAir);
  float aeration = esSheetAeration(freeHere, vSpeed, vFrac, vSlope);
  // crest wrap: foam to ~1 over the wrap and the first 1.5 m past the lip
  float crest = esSheetCrest(arc);
  float white = clamp(aeration * (0.45 + 0.75 * streak) * mix(0.7, 1.0, profile), 0.0, 1.0);
  white = max(white, crest * (0.75 + 0.25 * foam));
  // Unlit aerated shading (research §2.4): emissive white x1.0 in free fall,
  // x0.75 on a chute reach; no normal term, no refraction, no shore terms.
  // The sky + sun irradiance scales it so the HDR frame exposes it like foam.
  float emissive = mix(${SHEET_EMISSIVE.chute.toFixed(2)}, ${SHEET_EMISSIVE.free.toFixed(2)}, freeHere);
  vec3 albedo = mix(vec3(0.30, 0.42, 0.46), vec3(1.0), white);
  float churn = smoothstep(0.35, 0.85, foam);
  albedo = mix(albedo, vec3(1.0), churn * aeration * 0.4);
  // the additive crest accent (Bethesda's one SRC_ALPHA/ONE layer) at 0.25
  albedo += crest * foam * 0.25;
  albedo *= emissive * vTint;          // back layer darker, core brighter
  float light = 0.55 + 0.45 * clamp(uSunDir.y, 0.0, 1.0);
  vec3 color = albedo * (uAmbient + uSunLight * light);

  float noise = clamp(streak + churn * 0.6, 0.0, 1.0);
  float alpha = uOpacity * profile * (0.55 + 0.45 * noise) * esSheetLayerAlpha(vLayer);
  // dissolve into the plunge over the last 15 % of the fall, and cross-fade
  // across each piece overlap (a third of a piece) so the stack reads as one
  alpha *= 1.0 - smoothstep(0.85, 1.0, vFrac);
  alpha *= vEndFade;
  // view-angle falloff (measured 0.42/0.09): edge-on faces fade instead of
  // showing the silhouette as a hard cut
  vec3 faceN = normalize(cross(dFdx(vWorldPos), dFdy(vWorldPos)));
  float facing = abs(dot(faceN, normalize(cameraPosition - vWorldPos)));
  alpha *= smoothstep(${SHEET_FACING_FADE.start.toFixed(2)}, ${SHEET_FACING_FADE.full.toFixed(2)}, facing);
  // Soft particle — but ONLY where there is air behind the sheet. Water running
  // on the bed sits GROUND_CLEARANCE_M above the terrain; fading it against
  // that terrain erased the middle of every chute and left its overhanging
  // edges bright, which is exactly backwards.
  if (uHasDepth > 0.5) {
    vec2 suv = gl_FragCoord.xy / uResolution;
    float d = texture2D(uSceneDepth, suv).x;
    float sceneEye = (uCamNear * uCamFar) / (uCamFar - d * (uCamFar - uCamNear));
    float fragEye = 1.0 / gl_FragCoord.w;
    float freeness = smoothstep(0.15, 1.2, vAir);
    alpha *= mix(1.0, smoothstep(0.0, esSheetDepthFadeM(vLayer), sceneEye - fragEye), freeness);
  }
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(color, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export interface WaterfallSheetUniforms {
  uTime: { value: number };
  uVerticalScale: { value: number };
  uAmbient: { value: THREE.Vector3 };
  uSunLight: { value: THREE.Vector3 };
  uSunDir: { value: THREE.Vector3 };
  uSceneDepth: { value: THREE.Texture | null };
  uHasDepth: { value: number };
  uCamNear: { value: number };
  uCamFar: { value: number };
  uResolution: { value: THREE.Vector2 };
  uOpacity: { value: number };
  /** Sourced sheet streak texture (FX kit); null = procedural fallback. */
  uStreakTex: { value: THREE.Texture | null };
  /** Per-layer slots for the rest of the kit, bound when the export lands. */
  uSkirtTex: { value: THREE.Texture | null };
  uMistTex: { value: THREE.Texture | null };
  uRingTex: { value: THREE.Texture | null };
}

/**
 * The FX texture kit (`apps/world-studio/public/kits/waterfall-fx-textures/`,
 * exported separately): each slot is optional and the procedural field
 * stands in for a missing one. `sheet` feeds the falling body, `ring` the
 * plunge base, `skirt`/`mist` the base skirt and mist cards to come.
 */
export interface WaterfallTextureSet {
  sheet?: THREE.Texture | null;
  skirt?: THREE.Texture | null;
  mist?: THREE.Texture | null;
  ring?: THREE.Texture | null;
  /** The field water's foam dissolve/breakup tile (sea, beach, river flecks)
   * — one foam family across sheets, strips and field (study §3.1 (3)). */
  foam?: THREE.Texture | null;
}
export type WaterfallTextureSlot = keyof WaterfallTextureSet;

/** Manifest `role` → shader slot (the kit's `manifest.json` names roles, the
 * app composes URLs, this file decides what each slot means). */
export const WATERFALL_TEXTURE_ROLES: Readonly<Record<WaterfallTextureSlot, string>> = Object.freeze({
  sheet: "sheet-main",        // fxfluidtile01: thin sheets, V −0.857 / U +0.030
  ring: "plunge-ring",        // fxwhitewater: plunge-pool foam ring, puffs +0.375
  skirt: "mist-cloud-strip",  // fxcloudroundtilestrip: skirt fog strip
  mist: "mist-cloud",         // fxcloudroundtile: mist blast / skirt fog card
  foam: "foam-tile",          // foamtile01: field foam dissolve (alpha = coverage)
});

/**
 * Load the kit textures from app-composed URLs (no URL knowledge here). A
 * slot that is absent or fails to load stays null and the shader keeps its
 * procedural field — a missing texture is never an error at runtime.
 */
export async function loadWaterfallTextures(
  urls: Partial<Record<WaterfallTextureSlot, string>>,
  loader: { loadAsync(url: string): Promise<THREE.Texture> } = new THREE.TextureLoader(),
): Promise<WaterfallTextureSet> {
  const out: WaterfallTextureSet = {};
  await Promise.all((Object.keys(urls) as WaterfallTextureSlot[]).map(async (slot) => {
    const url = urls[slot];
    if (!url) return;
    try {
      const tex = await loader.loadAsync(url);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;   // scroll the offset forever
      tex.colorSpace = THREE.NoColorSpace;            // greyscale coverage, not colour
      tex.needsUpdate = true;
      out[slot] = tex;
    } catch {
      out[slot] = null;
    }
  }));
  return out;
}

export interface WaterfallDiagnostics {
  /** Fall bodies drawn as sheets. */
  count: number;
  /** Piece copies over every fall (vertical spans x lateral copies). */
  pieces: number;
  triangles: number;
  freeFlightCount: number;
  /** Ramps handed to the strip mesh instead of drawn as sheets. */
  chuteStrips: number;
  sideStrips: number;
  /** Plunge base quads over every fall, and the per-fall range. */
  baseQuads: number;
  baseQuadsPerFall: { min: number; max: number };
  baseTriangles: number;
}

/**
 * Load-time sheet stack: one mesh + one base mesh (a child), two materials,
 * no per-frame path work. `update` only feeds time, light, season lift and
 * the pipeline's scene depth. Pass the compiled `channels` so the sheets
 * align to the strips' `lip`/`plunge` ends; read `chuteStrips` back into the
 * strip mesh.
 */
export class WaterfallSheets {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  readonly uniforms: WaterfallSheetUniforms;
  readonly base: PlungeBase;
  readonly diagnostics: WaterfallDiagnostics;
  readonly paths: FallPath[];
  /** Ramps, as strip records — merge into `buildChannelStripGeometry`. */
  readonly chuteStrips: ChannelStrip[];
  private readonly byId = new Map<string, FallPath>();

  constructor(cascades: readonly Cascade[], applyAerial: (m: THREE.Material) => void,
    options: { channels?: readonly ChannelStrip[]; textures?: WaterfallTextureSet } = {}) {
    const built = buildWaterfallSheetGeometry(cascades, { channels: options.channels });
    const tex = options.textures ?? {};
    this.paths = built.paths;
    this.chuteStrips = built.chutes;
    for (const path of built.paths) this.byId.set(path.id, path);
    this.uniforms = {
      uTime: { value: 0 },
      uVerticalScale: { value: 1 },
      uAmbient: { value: new THREE.Vector3(0.2, 0.2, 0.2) },
      uSunLight: { value: new THREE.Vector3(1, 1, 1) },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSceneDepth: { value: null },
      uHasDepth: { value: 0 },
      uCamNear: { value: 0.3 },
      uCamFar: { value: 60000 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uOpacity: { value: 1 },
      uStreakTex: { value: tex.sheet ?? null },
      uSkirtTex: { value: tex.skirt ?? null },
      uMistTex: { value: tex.mist ?? null },
      uRingTex: { value: tex.ring ?? null },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms as unknown as Record<string, THREE.IUniform>,
      vertexShader: SHEET_VERTEX,
      fragmentShader: SHEET_FRAGMENT,
      defines: tex.sheet ? { ES_STREAK_TEX: 1 } : {},
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    applyAerial(this.material);
    this.material.customProgramCacheKey = () => `es-waterfall-sheet${tex.sheet ? "-tex" : ""}`;
    this.mesh = new THREE.Mesh(built.geometry, this.material);
    this.mesh.name = "water-waterfall-sheets";
    this.mesh.layers.set(WATER_LAYER);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.base = new PlungeBase(built.paths.filter((p) => p.freeFlight), applyAerial,
      { streakTexture: tex.ring ?? null });
    this.mesh.add(this.base.mesh);
    const perFall = Object.values(this.base.quadsPerFall);
    this.diagnostics = {
      count: built.fallCount,
      pieces: built.pieceCount,
      triangles: built.triangleCount,
      freeFlightCount: built.freeFlightCount,
      chuteStrips: built.chutes.length,
      sideStrips: built.sideStripCount,
      baseQuads: this.base.quadCount,
      baseQuadsPerFall: { min: perFall.length ? Math.min(...perFall) : 0, max: perFall.length ? Math.max(...perFall) : 0 },
      baseTriangles: this.base.triangleCount,
    };
  }

  /** The traced sheet path, for the particle emitters spaced along the fall. */
  pathFor(id: string): FallPath | undefined { return this.byId.get(id); }

  /** Bind (or unbind, with null) any of the kit's textures; unnamed slots keep theirs. */
  setTextures(textures: WaterfallTextureSet): void {
    if ("sheet" in textures) {
      const texture = textures.sheet ?? null;
      this.uniforms.uStreakTex.value = texture;
      this.material.defines = texture ? { ES_STREAK_TEX: 1 } : {};
      this.material.customProgramCacheKey = () => `es-waterfall-sheet${texture ? "-tex" : ""}`;
      this.material.needsUpdate = true;
    }
    if ("skirt" in textures) this.uniforms.uSkirtTex.value = textures.skirt ?? null;
    if ("mist" in textures) this.uniforms.uMistTex.value = textures.mist ?? null;
    if ("ring" in textures) {
      this.uniforms.uRingTex.value = textures.ring ?? null;
      this.base.setStreakTexture(textures.ring ?? null);
    }
  }

  update(runtime: WaterRuntime, timeS: number, verticalScale: number, seasonLiftM = 0): void {
    this.uniforms.uTime.value = timeS;
    this.uniforms.uVerticalScale.value = verticalScale;
    this.uniforms.uAmbient.value.copy(runtime.ambient.value);
    this.uniforms.uSunLight.value.copy(runtime.sunLight.value);
    this.uniforms.uSunDir.value.copy(runtime.sunDirection.value);
    this.base.update(runtime, timeS, verticalScale, seasonLiftM);
  }

  setDepth(texture: THREE.Texture | null, near: number, far: number, width: number, height: number): void {
    this.uniforms.uSceneDepth.value = texture;
    this.uniforms.uHasDepth.value = texture && near > 0 && far > near ? 1 : 0;
    this.uniforms.uCamNear.value = near;
    this.uniforms.uCamFar.value = far;
    this.uniforms.uResolution.value.set(width, height);
    this.base.setDepth(texture, near, far, width, height);
  }

  dispose(): void {
    this.base.dispose();
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mesh.removeFromParent();
  }
}

/** Re-exported for callers that size scroll by local speed (tests, base). */
export { STREAK_LAYERS, streakSpeedGain };
