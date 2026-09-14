import * as THREE from "three";
import type { WaterMeta } from "../waterData";
import type { WaterRuntime } from "./types";
import { WATER_LAYER } from "./waterMaterial";
import type { ChannelStrip } from "./ChannelStrips";
import { KIT_SHAPE_ROLES, kitIsComplete, type KitPieceId, type WaterfallKit, type KitShapeRole } from "./WaterfallKit";
import { stackFall, type FallStack, type PieceInstance } from "./WaterfallKitStack";
import { createKitPieceMaterial, createKitSharedUniforms, prepareKitTexture, type KitSharedUniforms } from "./WaterfallKitMaterial";
import { WaterfallMistVolume, type MistVolumeDiagnostics } from "./WaterfallMistVolume";

/**
 * Waterfalls (decision 0064): the ballistic tracer is the SPINE and the
 * vanilla Skyrim FX kit is the BODY.
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
 * is not drawn as a fall at all — `chuteStrips` hands it to the strip mesh
 * (ES_STRIP whitewater shader), so one reach is one piece.
 *
 * A fall is then `WaterfallKitStack.stackFall`: Bethesda's pieces stacked
 * down the traced path the way Skyrim.esm stacks them, one InstancedMesh per
 * shape role (a handful of draws for the whole province), all shaded by
 * `WaterfallKitMaterial`, plus the ray-marched `WaterfallMistVolume` per
 * fall. The procedural ribbon that used to stand in for the body is gone.
 */

export type Cascade = NonNullable<WaterMeta["cascades"]>[number];

export const GRAVITY_MPS2 = 9.81;
/** Below this the compiler does not emit a cascade at all; guard anyway. */
export const MIN_CASCADE_DROP_M = 2.5;
/** Minimum launch speed: a lip is never truly still water. */
export const MIN_LIP_SPEED_MS = 1.5;
/** How far the sheet floats above ground while it is following it. */
export const GROUND_CLEARANCE_M = 0.12;
/** The trace starts this far upstream of the lip, at lip level (a ramp's
 * chute strip begins on the field there). */
export const CREST_BACK_M = 2.5;
/**
 * THE BRINK: the rock across the lip is measured, not assumed flat (across
 * the sixteen compiled lips the ground varies bank to bank by 0.7–13.7 m,
 * median ~3.1 m). What is measured is the rock's RELIEF across the lip,
 * `ground(u) − min ground`, not `ground(u) − lip.y`: the lip's own y and the
 * height raster sit on different grids, and beyond the banks the ground is
 * the cliff face below the lip. The notch centre is where the water runs.
 */
export const BRINK_STATIONS = 17;
/** Cap on the crest delay a proud shoulder imposes (m of arc). */
export const BRINK_MAX_ARC_M = 6;
/** Relief below this reads as a clean sill, not a notch (m). */
export const BRINK_FLAT_M = 0.15;
/**
 * Hard bounds on one traced path, independent of the cascade record: the
 * trace also stops at the end of the exported profile, but a record with a
 * kilometres-long profile (or a stalled arc) must still cost O(steps), never
 * grow without limit.
 */
export const MAX_TRACE_STEPS = 4096;
export const MAX_TRACE_RUN_M = 1500;
const MAX_FALL_SPEED_MS = 40;
/**
 * Water running ON the bed loses energy to friction and aeration; only free
 * flight converts drop into speed cleanly.
 */
export const CHUTE_DROP_EFFICIENCY = 0.4;
/** Hard cap on bed-following speed (m/s) — a rapid, not a railgun. */
export const MAX_CHUTE_SPEED_MS = 12;
/** Air under the sheet before a reach counts as free flight rather than chute. */
export const FREE_FLIGHT_MIN_AIR_M = 0.5;
/** ... and that much air must persist over this much contiguous arc. */
export const FREE_FLIGHT_MIN_SPAN_M = 3;
/** A strip `lip`/`plunge` end within this distance of a cascade's own point
 * is the same point: the trace snaps to it exactly. */
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

/** Ground height (m) under a world point, or null where it is unknown. */
export type GroundSampler = (x: number, z: number) => number | null;

/** Per-column brink measurement across a lip (see `BRINK_STATIONS`). */
export interface BrinkProfile {
  /** Signed metres across the lip, trench centre 0, one per station. */
  acrossM: number[];
  /** Rock relief above the lowest column (m). */
  reliefM: number[];
  /** Metres of arc before water appears in this column: relief, capped. */
  crestArcM: number[];
  /** Signed metres across to the lowest column — the notch floor. */
  notchCentreM: number;
  /** Ground range across the lip (m) — the evidence a notch exists at all. */
  groundRangeM: number;
}

export interface FallPath {
  id: string;
  points: FallPathPoint[];
  /** The rock across the lip, when a ground sampler was supplied. */
  brink?: BrinkProfile;
  /** The channel's width at the lip (m) — equal to `widthM` since the
   * bankfull compile; kept for the probe's report. */
  trenchWidthM: number;
  /** True only when the water is in the air by ≥ `FREE_FLIGHT_MIN_AIR_M`
   * over a contiguous ≥ `FREE_FLIGHT_MIN_SPAN_M` of arc. A ramp is false and
   * is drawn as a chute strip, never as a fall body. */
  freeFlight: boolean;
  /** Longest contiguous arc (m) with that much air under the sheet. */
  freeSpanM: number;
  dropM: number;
  /** The water's width at the lip (m, bankfull) — what the kit stack fits. */
  widthM: number;
  /** The cascade as traced (after strip alignment). */
  cascade: Cascade;
}

/**
 * Measure the rock across a lip. Stations span the TRENCH (the rock edge is a
 * property of the channel, not of the water in it); the water's own extent is
 * then whatever part of that span is below the lip water level.
 */
export function measureBrink(fall: Cascade, ground: GroundSampler,
  stations = BRINK_STATIONS): BrinkProfile | undefined {
  let dx = fall.direction.x;
  let dz = fall.direction.z;
  const dl = Math.hypot(dx, dz);
  if (!(dl > 1e-6)) return undefined;
  dx /= dl; dz /= dl;
  const nx = -dz;
  const nz = dx;
  const trench = Math.max(fall.widthM, 0.5);
  const acrossM: number[] = [];
  const groundM: number[] = [];
  for (let i = 0; i < stations; i++) {
    const u = stations === 1 ? 0 : i / (stations - 1);
    const a = (u - 0.5) * trench;
    const g = ground(fall.lip.x + nx * a, fall.lip.z + nz * a);
    if (g === null || !Number.isFinite(g)) return undefined;
    acrossM.push(a);
    groundM.push(g);
  }
  const gMin = Math.min(...groundM);
  const gMax = Math.max(...groundM);
  const notchCentreM = acrossM[groundM.indexOf(gMin)];
  const reliefM = groundM.map((g) => g - gMin);
  // A lip flat to within BRINK_FLAT_M is a clean sill: no crest delay at all
  // (and the notch centre is meaningless, so it is not used either).
  const flat = gMax - gMin <= BRINK_FLAT_M;
  const crestArcM = reliefM.map((r) => (flat ? 0 : Math.min(Math.max(r - BRINK_FLAT_M, 0), BRINK_MAX_ARC_M)));
  return { acrossM, reliefM, crestArcM, notchCentreM: flat ? 0 : notchCentreM, groundRangeM: gMax - gMin };
}

/** Linear interpolation of a per-station brink term at signed metres across. */
export function brinkAt(profile: BrinkProfile, term: "reliefM" | "crestArcM", acrossM: number): number {
  const xs = profile.acrossM;
  const ys = profile[term];
  if (acrossM <= xs[0]) return ys[0];
  if (acrossM >= xs[xs.length - 1]) return ys[ys.length - 1];
  const span = xs[1] - xs[0];
  const f = (acrossM - xs[0]) / span;
  const i = Math.min(Math.floor(f), xs.length - 2);
  const t = f - i;
  return ys[i] * (1 - t) + ys[i + 1] * t;
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
export function traceWaterfallSheet(fall: Cascade,
  options: { stepM?: number; groundHeightM?: GroundSampler } = {}): FallPath {
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
  const freeSpanM = freeFlightSpanM(points);
  const brink = options.groundHeightM ? measureBrink(fall, options.groundHeightM) : undefined;
  // The drawn width is the water's width at the lip: `widthM` is bankfull
  // since the 16c round-2 compile (`wettedWidthM` equals it and is ignored).
  const widthM = Math.max(fall.widthM, 0.5);
  return {
    id: fall.id,
    points,
    brink,
    trenchWidthM: widthM,
    freeFlight: freeSpanM >= FREE_FLIGHT_MIN_SPAN_M,
    freeSpanM,
    dropM,
    widthM,
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
  options: { stepM?: number; channels?: readonly ChannelStrip[]; groundHeightM?: GroundSampler } = {}): TracedCascades {
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

/* ------------------------------------------------------------------ *
 * The FX texture kit
 * ------------------------------------------------------------------ */

/**
 * The FX texture kit (`apps/world-studio/public/kits/waterfall-fx-textures/`,
 * exported separately): the named slots feed the strip/field shaders that
 * borrow a vanilla texture; `byId` holds every texture the kit's shape roles
 * bind (`KIT_SHAPE_ROLES[*].texture` / `.normal`), keyed by file stem.
 */
export interface WaterfallTextureSet {
  sheet?: THREE.Texture | null;
  skirt?: THREE.Texture | null;
  mist?: THREE.Texture | null;
  ring?: THREE.Texture | null;
  /** The field water's foam dissolve/breakup tile (sea, beach, river flecks). */
  foam?: THREE.Texture | null;
  byId?: Record<string, THREE.Texture>;
}
export type WaterfallTextureSlot = "sheet" | "skirt" | "mist" | "ring" | "foam";

/** Manifest `role` → shader slot (the kit's `manifest.json` names roles, the
 * app composes URLs, this file decides what each slot means). */
export const WATERFALL_TEXTURE_ROLES: Readonly<Record<WaterfallTextureSlot, string>> = Object.freeze({
  sheet: "sheet-main",        // fxfluidtile01: thin sheets, V −0.857 / U +0.030
  ring: "plunge-ring",        // fxwhitewater: plunge-pool foam ring, puffs +0.375
  skirt: "mist-cloud-strip",  // fxcloudroundtilestrip: skirt fog strip
  mist: "mist-cloud",         // fxcloudroundtile: mist blast / skirt fog card
  foam: "foam-tile",          // foamtile01: field foam dissolve (alpha = coverage)
});

const SLOT_NAMES: readonly string[] = Object.keys(WATERFALL_TEXTURE_ROLES);

/** Every texture id the kit's shape roles bind. */
export function kitTextureIds(): string[] {
  const ids = new Set<string>();
  for (const roles of Object.values(KIT_SHAPE_ROLES)) for (const r of roles) { ids.add(r.texture); if (r.normal) ids.add(r.normal); }
  return [...ids];
}

/**
 * Load the kit textures from app-composed URLs (no URL knowledge here): keys
 * are either a shader slot or a texture id. A slot that is absent or fails
 * to load stays null and the shader keeps its procedural field; a piece
 * texture that fails leaves its shapes undrawn — never an error at runtime.
 */
export async function loadWaterfallTextures(
  urls: Partial<Record<WaterfallTextureSlot, string>> & Record<string, string | undefined>,
  loader: { loadAsync(url: string): Promise<THREE.Texture> } = new THREE.TextureLoader(),
): Promise<WaterfallTextureSet> {
  const out: WaterfallTextureSet = { byId: {} };
  await Promise.all(Object.keys(urls).map(async (key) => {
    const url = urls[key];
    if (!url) return;
    try {
      const tex = prepareKitTexture(await loader.loadAsync(url));
      if (SLOT_NAMES.includes(key)) out[key as WaterfallTextureSlot] = tex;
      else out.byId![key] = tex;
    } catch {
      if (SLOT_NAMES.includes(key)) out[key as WaterfallTextureSlot] = null;
    }
  }));
  return out;
}

/* ------------------------------------------------------------------ *
 * Diagnostics and probe marks
 * ------------------------------------------------------------------ */

export interface WaterfallDiagnostics {
  /** Fall bodies drawn from the kit. */
  count: number;
  /** Kit piece instances over every fall. */
  pieces: number;
  /** Instanced draws (one per shape role with instances). */
  draws: number;
  triangles: number;
  freeFlightCount: number;
  /** Ramps handed to the strip mesh instead of drawn as falls. */
  chuteStrips: number;
  /** Whether the kit geometry was available (false = falls undrawn, ramps only). */
  kit: boolean;
  mist: Omit<MistVolumeDiagnostics, "perFall">;
  perFall: Record<string, FallBudget>;
  /** World-space marks the numeric probe projects (unscaled metres). */
  sites: Record<string, FallSiteMarks>;
}

export interface FallBudget {
  dropM: number;
  /** The water's width at the lip (bankfull). */
  widthM: number;
  trenchWidthM: number;
  /** Ground range across the lip (m) when the rock was sampled. */
  brinkRangeM?: number;
  /** Body family and uniform scale. */
  body: KitPieceId;
  bodyScale: number;
  bodySpans: number;
  bodyLateral: number;
  /** The first body piece's top edge (world y) and the width the stack covers at the lip. */
  bodyTopY: number;
  bodyTopWidthM: number;
  pieces: number;
  counts: Record<KitPieceId, number>;
  triangles: number;
  mistConeFootRadiusM: number;
  mistDomeRadiusM: number;
}

export interface FallSiteMarks {
  lip: [number, number, number];
  /** On the path, 2 m of arc past the lip. */
  lipPlus2M: [number, number, number];
  foot: [number, number, number];
  /** On the path, 2 m of arc before the foot. */
  footMinus2M: [number, number, number];
  plunge: [number, number, number];
  direction: [number, number];
  /** Body samples at 15 / 35 / 50 / 65 / 85 % of the arc lip → foot. */
  samples: [number, number, number][];
  basinRadiusM: number;
}

/** A path point at a given arc length from the lip (linear between points). */
function pointAtArc(points: readonly FallPathPoint[], lipIndex: number, arcM: number): [number, number, number] {
  const sign = arcM >= 0 ? 1 : -1;
  let remaining = Math.abs(arcM);
  let i = lipIndex;
  while (i + sign >= 0 && i + sign < points.length) {
    const a = points[i];
    const b = points[i + sign];
    const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    if (len >= remaining) {
      const t = len > 0 ? remaining / len : 0;
      return [a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t];
    }
    remaining -= len;
    i += sign;
  }
  const p = points[i];
  return [p.x, p.y, p.z];
}

/** Probe marks for a traced fall (pure). */
export function fallSiteMarks(path: FallPath): FallSiteMarks {
  const pts = path.points;
  const lipIndex = Math.max(pts.findIndex((p) => p.s >= 0), 0);
  const last = pts.length - 1;
  let arc = 0;
  for (let i = lipIndex + 1; i <= last; i++) arc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z);
  const c = path.cascade;
  const dl = Math.hypot(c.direction.x, c.direction.z) || 1;
  return {
    lip: [pts[lipIndex].x, pts[lipIndex].y, pts[lipIndex].z],
    lipPlus2M: pointAtArc(pts, lipIndex, Math.min(2, arc)),
    foot: [pts[last].x, pts[last].y, pts[last].z],
    footMinus2M: pointAtArc(pts, last, -Math.min(2, arc)),
    plunge: [c.plunge.x, c.plunge.y, c.plunge.z],
    direction: [c.direction.x / dl, c.direction.z / dl],
    samples: [0.15, 0.35, 0.5, 0.65, 0.85].map((f) => pointAtArc(pts, lipIndex, arc * f)),
    basinRadiusM: Math.max(c.bowlRadiusM ?? c.widthM, c.widthM * 0.9, 4),
  };
}

/* ------------------------------------------------------------------ *
 * The mounted stack
 * ------------------------------------------------------------------ */

interface ShapeDraw {
  piece: KitPieceId;
  role: KitShapeRole;
  mesh: THREE.InstancedMesh;
  material: THREE.ShaderMaterial;
}

/**
 * Load-time falls stack: one group holding an InstancedMesh per kit shape
 * role plus the mist volume; no per-frame path work. `update` only feeds
 * time, light and the season lift. Pass the compiled `channels` so the
 * traces align to the strips' `lip`/`plunge` ends; read `chuteStrips` back
 * into the strip mesh. Without a kit (`options.kit` null) the falls draw
 * nothing and the ramps still come back as strips.
 */
export class WaterfallSheets {
  /** The group every fall draw hangs off (mounted by WaterSurface). */
  readonly mesh: THREE.Group;
  readonly uniforms: KitSharedUniforms;
  readonly mistVolume: WaterfallMistVolume | null;
  readonly diagnostics: WaterfallDiagnostics;
  readonly paths: FallPath[];
  readonly stacks: FallStack[];
  /** Ramps, as strip records — merge into `buildChannelStripGeometry`. */
  readonly chuteStrips: ChannelStrip[];
  private readonly draws: ShapeDraw[] = [];
  private readonly byId = new Map<string, FallPath>();
  private underwater = false;

  constructor(cascades: readonly Cascade[], applyAerial: (m: THREE.Material) => void,
    options: { channels?: readonly ChannelStrip[]; textures?: WaterfallTextureSet; kit?: WaterfallKit | null;
      /** Ground height under a world point: the rock the crest leaves. */
      groundHeightM?: GroundSampler } = {}) {
    const traced = traceCascades(cascades, { channels: options.channels, groundHeightM: options.groundHeightM });
    this.paths = traced.paths;
    this.chuteStrips = traced.chutes;
    for (const path of traced.paths) this.byId.set(path.id, path);
    const falls = traced.sheets;
    this.uniforms = createKitSharedUniforms();
    this.mesh = new THREE.Group();
    this.mesh.name = "water-waterfalls";
    this.mesh.layers.set(WATER_LAYER);
    const kit = kitIsComplete(options.kit ?? undefined) ? options.kit! : null;
    const byId = options.textures?.byId ?? {};
    this.stacks = kit ? falls.map(stackFall) : [];

    // one InstancedMesh per (piece, shape) with instances; the stack's
    // instances are grouped by piece
    let triangles = 0;
    if (kit) {
      const perPiece = new Map<KitPieceId, PieceInstance[]>();
      for (const s of this.stacks) for (const inst of s.instances) {
        const list = perPiece.get(inst.piece);
        if (list) list.push(inst); else perPiece.set(inst.piece, [inst]);
      }
      const inst = new Float32Array(4);
      for (const [pieceId, instances] of perPiece) {
        const piece = kit[pieceId];
        if (!piece || !instances.length) continue;
        for (const shape of piece.shapes) {
          const tex = byId[shape.role.texture] ?? null;
          if (!tex) continue;   // a missing texture leaves the shape undrawn, never black
          const normal = shape.role.normal ? byId[shape.role.normal] ?? null : null;
          const material = createKitPieceMaterial(shape.role, tex, normal, this.uniforms, applyAerial);
          const geometry = shape.geometry.clone();
          const attr = new THREE.InstancedBufferAttribute(new Float32Array(instances.length * 4), 4);
          const mesh = new THREE.InstancedMesh(geometry, material, instances.length);
          instances.forEach((i, k) => {
            mesh.setMatrixAt(k, i.matrix);
            inst[0] = i.phase; inst[1] = i.poolY; inst[2] = 0; inst[3] = i.alphaScale;
            attr.set(inst, k * 4);
          });
          geometry.setAttribute("aInst", attr);
          mesh.instanceMatrix.needsUpdate = true;
          mesh.name = `water-waterfall-${pieceId}-${shape.name}`;
          mesh.layers.set(WATER_LAYER);
          mesh.frustumCulled = false;
          // flat pool pieces first, bodies over them, mist last
          mesh.renderOrder = shape.role.upness >= 1 ? 3 : shape.role.kind === "mist" ? 5 : 4;
          this.mesh.add(mesh);
          this.draws.push({ piece: pieceId, role: shape.role, mesh, material });
          triangles += shape.triangles * instances.length;
        }
      }
    }
    this.mistVolume = kit && falls.length ? new WaterfallMistVolume(falls, this.uniforms, applyAerial) : null;
    if (this.mistVolume) {
      const volume = this.mistVolume;
      volume.mesh.onBeforeRender = (_r, _s, camera) => volume.setCamera(camera);
      this.mesh.add(volume.mesh);
    }

    const perFall: Record<string, FallBudget> = {};
    const sites: Record<string, FallSiteMarks> = {};
    for (const p of falls) {
      const stack = this.stacks.find((s) => s.id === p.id);
      const mist = this.mistVolume?.diagnostics.perFall[p.id];
      let tris = 0;
      if (stack && kit) for (const i of stack.instances) for (const sh of kit[i.piece]?.shapes ?? []) tris += sh.triangles;
      perFall[p.id] = {
        dropM: p.dropM, widthM: p.widthM, trenchWidthM: p.trenchWidthM, brinkRangeM: p.brink?.groundRangeM,
        body: stack?.body.piece ?? "body16", bodyScale: stack?.body.scale ?? 0,
        bodySpans: stack?.body.spans ?? 0, bodyLateral: stack?.body.lateral ?? 0,
        bodyTopY: stack?.body.topY ?? NaN, bodyTopWidthM: stack?.body.topWidthM ?? 0,
        pieces: stack?.instances.length ?? 0,
        counts: stack?.counts ?? { body16: 0, body34: 0, thin7: 0, thin29: 0, crest: 0, ring: 0, skirt: 0, mistCard: 0, groundMist: 0 },
        triangles: tris,
        mistConeFootRadiusM: mist?.coneFootRadiusM ?? 0, mistDomeRadiusM: mist?.domeRadiusM ?? 0,
      };
      sites[p.id] = fallSiteMarks(p);
    }
    const { perFall: _m, ...mistTotals } = this.mistVolume?.diagnostics ?? { count: 0, steps: 0, perFall: {} };
    this.diagnostics = {
      count: falls.length,
      pieces: this.stacks.reduce((n, s) => n + s.instances.length, 0),
      draws: this.draws.length + (this.mistVolume ? 1 : 0),
      triangles,
      freeFlightCount: falls.length,
      chuteStrips: traced.chutes.length,
      kit: !!kit,
      mist: mistTotals,
      perFall,
      sites,
    };
  }

  /** The traced path, for the particle emitters spaced along the fall. */
  pathFor(id: string): FallPath | undefined { return this.byId.get(id); }

  /** Per frame: time, light and the season lift of the receiving pools. */
  update(runtime: WaterRuntime, timeS: number, verticalScale: number, seasonLiftM = 0): void {
    this.uniforms.uTime.value = timeS;
    this.uniforms.uVerticalScale.value = verticalScale;
    this.uniforms.uLift.value = seasonLiftM;
    this.uniforms.uAmbient.value.copy(runtime.ambient.value);
    this.uniforms.uSunLight.value.copy(runtime.sunLight.value);
    this.uniforms.uSunDir.value.copy(runtime.sunDirection.value);
  }

  /**
   * Submerged camera: nothing of the kit or the mist is drawn, and the
   * soft-depth fade is off — under water the water layer draws INTO the
   * scene target, so reading its own depth there would be a feedback loop.
   */
  setUnderwater(underwater: boolean, _surfaceY: number): void {
    this.underwater = underwater;
    this.uniforms.uUnderwater.value = underwater ? 1 : 0;
    if (underwater) this.uniforms.uHasDepth.value = 0;
  }

  setDepth(texture: THREE.Texture | null, near: number, far: number, width: number, height: number): void {
    const depth = this.underwater ? null : texture;
    this.uniforms.uSceneDepth.value = texture;
    this.uniforms.uHasDepth.value = depth && near > 0 && far > near ? 1 : 0;
    this.uniforms.uCamNear.value = near;
    this.uniforms.uCamFar.value = far;
    this.uniforms.uResolution.value.set(width, height);
  }

  dispose(): void {
    this.mistVolume?.dispose();
    for (const d of this.draws) { d.mesh.geometry.dispose(); d.material.dispose(); d.mesh.removeFromParent(); }
    this.draws.length = 0;
    this.mesh.removeFromParent();
  }
}
