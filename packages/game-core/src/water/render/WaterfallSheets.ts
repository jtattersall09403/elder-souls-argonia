import * as THREE from "three";
import type { WaterMeta } from "../waterData";
import type { WaterRuntime } from "./types";
import { WATER_LAYER } from "./waterMaterial";

/**
 * Waterfall sheets for the compiled cascade lips (decision 0046 item 4,
 * research `waterfalls-realtime.md` §1/§3: every shipped waterfall is a ribbon
 * mesh with scrolled streak textures — nobody simulates the fall).
 *
 * The path is traced ONCE at load, in the vertical plane along the cascade's
 * `direction`, against the refined-terrain `profile` the compiler exports:
 * free ballistic flight from the lip, but hugging the ground (+`GROUND_CLEARANCE_M`)
 * wherever the arc would pass below it, and detaching again when the ground
 * falls away faster than the arc. A fall with no free flight anywhere is a
 * rapid, and still gets its sheet — that is what a steep chute looks like.
 *
 * The sheet starts `CREST_BACK_M` upstream of the lip at lip level so the water
 * is wrapped over the crest rather than faded in (research §1.2: the crest is
 * the hardest transition and a fade always reads as a seam).
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
export const CREST_BACK_M = 2;
/** One sheet never spans more than this much fall (UV scroll + overdraw). */
export const MAX_SEGMENT_DROP_M = 60;
/** Front/back layer separation — the thickness illusion. */
export const SHEET_THICKNESS_M = 0.25;
/**
 * Three layers, not two (owner refinement): a falling sheet has to read as a
 * plunging VOLUME. Front and back give the 0.25 m thickness; a narrower,
 * brighter core down the middle of the flow gives the body its mass.
 */
export const SHEET_LAYERS = [
  { offsetM: 0, widthScale: 1, tint: 1 },
  { offsetM: -SHEET_THICKNESS_M, widthScale: 1, tint: 0.55 },
  { offsetM: SHEET_THICKNESS_M * 0.5, widthScale: 0.55, tint: 1.25 },
] as const;
const MAX_TRACE_STEPS = 4096;
const MAX_FALL_SPEED_MS = 40;
/**
 * Water running ON the bed loses energy to friction and aeration; only free
 * flight converts drop into speed cleanly. Without this a long chute reached
 * ~28 m/s and the next bump launched it into a 20 m flat ballistic plate that
 * never came back down — the light-grey slab in the fly-camera screenshot.
 */
export const CHUTE_DROP_EFFICIENCY = 0.4;
/** Hard cap on bed-following speed (m/s) — a rapid, not a railgun. */
export const MAX_CHUTE_SPEED_MS = 12;
/** Consecutive path points closer than this cannot make a drawable quad. */
export const MIN_QUAD_LENGTH_M = 1e-4;
/** Air under the sheet before a reach counts as free flight rather than chute. */
export const FREE_FLIGHT_MIN_AIR_M = 0.5;

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
  /** False for a pure rapid — a chute the water never leaves. A single step
   * of daylight off a ramp lip is not a waterfall; `FREE_FLIGHT_MIN_AIR_M` is. */
  freeFlight: boolean;
  dropM: number;
  widthM: number;
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
    if (y <= plungeY) break;
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

  return {
    id: fall.id,
    points,
    segments,
    freeFlight: points.some((p) => p.free && p.airM > FREE_FLIGHT_MIN_AIR_M),
    dropM,
    widthM: Math.max(fall.widthM, 0.5),
  };
}

export interface WaterfallSheetGeometry {
  geometry: THREE.BufferGeometry;
  fallCount: number;
  segmentCount: number;
  vertexCount: number;
  triangleCount: number;
  freeFlightCount: number;
  /** Zero-area quads dropped at build time (see `MIN_QUAD_LENGTH_M`). */
  skippedQuads: number;
  paths: FallPath[];
}

/** All sheets in one geometry; two layers per segment for the volume read. */
export function buildWaterfallSheetGeometry(
  cascades: readonly Cascade[],
  options: { stepM?: number } = {},
): WaterfallSheetGeometry {
  const paths = cascades
    .filter((c) => Number.isFinite(c.dropM) && c.dropM >= MIN_CASCADE_DROP_M)
    .map((c) => traceWaterfallSheet(c, options))
    .filter((p) => p.points.length >= 2);

  const position: number[] = [];
  const uv: number[] = [];
  const speed: number[] = [];
  const layer: number[] = [];
  const tint: number[] = [];
  const frac: number[] = [];
  const air: number[] = [];
  const slope: number[] = [];
  const index: number[] = [];
  let segmentCount = 0;
  let skippedQuads = 0;

  for (const path of paths) {
    const totalDrop = Math.max(path.dropM, 0.01);
    for (const seg of path.segments) {
      if (seg.length < 2) continue;
      segmentCount++;
      // path length along the segment drives the scrolled UV.v (metres)
      const along: number[] = [0];
      for (let i = 1; i < seg.length; i++) {
        const p = seg[i];
        const q = seg[i - 1];
        along.push(along[i - 1] + Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z));
      }
      // Local descent slope (|dy| / path length) drives the whitewater term on
      // bed-following reaches: a chute is white because it is steep and fast,
      // not because it has fallen far (distance alone leaves a hillside chute
      // grey-green along its whole length).
      const slopeAt: number[] = [];
      for (let i = 0; i < seg.length; i++) {
        const a = seg[Math.max(i - 1, 0)];
        const b = seg[Math.min(i + 1, seg.length - 1)];
        const run = Math.hypot(b.x - a.x, b.z - a.z);
        const drop = Math.max(a.y - b.y, 0);
        slopeAt.push(drop / Math.max(Math.hypot(run, drop), 1e-6));
      }
      for (let l = 0; l < SHEET_LAYERS.length; l++) {
        const spec = SHEET_LAYERS[l];
        const base = position.length / 3;
        for (let i = 0; i < seg.length; i++) {
          const p = seg[i];
          const q = seg[Math.min(i + 1, seg.length - 1)];
          const r = seg[Math.max(i - 1, 0)];
          let tx = q.x - r.x;
          let tz = q.z - r.z;
          const tl = Math.hypot(tx, tz);
          if (tl > 1e-6) { tx /= tl; tz /= tl; } else { tx = 1; tz = 0; }
          const nx = -tz;
          const nz = tx;
          const half = path.widthM * 0.5 * spec.widthScale;
          const back = -spec.offsetM;
          for (const side of [-1, 1]) {
            position.push(p.x + nx * half * side - tx * back, p.y, p.z + nz * half * side - tz * back);
            uv.push(side < 0 ? 0 : 1, along[i]);
            speed.push(p.speedMS);
            layer.push(l);
            tint.push(spec.tint);
            frac.push(Math.min(Math.max((path.points[0].y - p.y) / totalDrop, 0), 1));
            air.push(Math.max(p.airM, 0));
            slope.push(slopeAt[i]);
          }
        }
        for (let i = 0; i + 1 < seg.length; i++) {
          // A quad between two coincident path points has zero area: it draws
          // nothing but it does stack an extra transparent layer's worth of
          // alpha where the trace stalls. Skip it.
          const p = seg[i];
          const q = seg[i + 1];
          if (Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) < MIN_QUAD_LENGTH_M) { skippedQuads++; continue; }
          const a = base + i * 2;
          index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        }
      }
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
  geometry.setIndex(index);
  geometry.computeBoundingSphere();
  return {
    geometry,
    fallCount: paths.length,
    segmentCount,
    vertexCount: position.length / 3,
    triangleCount: index.length / 3,
    freeFlightCount: paths.filter((p) => p.freeFlight).length,
    skippedQuads,
    paths,
  };
}


/* ------------------------------------------------------------------ *
 * Across-width and aeration profile.
 *
 * The shader and the TS twin below MUST stay in step: the twin is what the
 * unit tests measure, and `SHEET_PROFILE_GLSL` is the literal source the
 * fragment shader compiles. Edit both or neither.
 *
 * The old profile was `pow(sin(u*PI), 0.45)` — a near-flat plateau — and the
 * only thing that varied across the width was the soft-particle depth fade.
 * On a bed-following chute the sheet sits `GROUND_CLEARANCE_M` above the
 * terrain, so that fade drove the CENTRE to ~0.09 alpha (terrain read through
 * it) while the ribbon edges, overhanging the channel banks with metres of air
 * behind them, kept full alpha: two white lines with a see-through middle.
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
  /** Layer index into `SHEET_LAYERS`. */
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

const LAYER_ALPHA = [1, 0.68, 0.85];

/** The fragment shader's alpha, minus tone mapping — the twin the tests read. */
export function sheetAlpha(i: SheetSampleInput): number {
  const profile = sheetWidthProfile(i.u);
  const noise = clamp01(i.noise ?? 0.5);
  const layerAlpha = LAYER_ALPHA[Math.min(Math.max(Math.round(i.layer), 0), 2)];
  let alpha = (i.opacity ?? 1) * profile * (0.55 + 0.45 * noise) * layerAlpha;
  alpha *= 1 - smoothstep(0.85, 1, i.frac);
  // Soft particle, but only where there IS air behind the sheet. Water running
  // on the bed is in contact with it and must not fade against it.
  const freeness = smoothstep(0.15, 1.2, i.airM);
  const depthFade = smoothstep(0, 0.6, i.depthDeltaM ?? 0);
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
`;

const SHEET_VERTEX = /* glsl */ `
attribute vec2 aSheetUv;
attribute float aSpeed;
attribute float aLayer;
attribute float aTint;
attribute float aFrac;
attribute float aAir;
attribute float aSlope;
varying vec2 vSheetUv;
varying float vSpeed;
varying float vLayer;
varying float vTint;
varying float vFrac;
varying float vAir;
varying float vSlope;
uniform float uVerticalScale;
#include <common>
void main() {
  vSheetUv = aSheetUv;
  vSpeed = aSpeed;
  vLayer = aLayer;
  vTint = aTint;
  vFrac = aFrac;
  vAir = aAir;
  vSlope = aSlope;
  vec3 transformed = vec3(position.x, position.y * uVerticalScale, position.z);
  #include <worldpos_vertex>
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

float esSheetHash(vec2 p){
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float esSheetNoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(esSheetHash(i), esSheetHash(i + vec2(1.0, 0.0)), u.x),
             mix(esSheetHash(i + vec2(0.0, 1.0)), esSheetHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
${SHEET_PROFILE_GLSL}

void main() {
  // Streaks: two down-scrolled layers at different scales and speeds, the
  // classic panner recipe (research §1.1). The scroll offset is a uniform
  // function of time, so absolute time is safe here.
  float scroll = uTime * max(vSpeed, 1.0);
  float wobble = sin(vSheetUv.y * 0.7 + uTime * 1.7) * 0.06;
  vec2 uv = vec2(vSheetUv.x + wobble, vSheetUv.y);
  float n1 = esSheetNoise(vec2(uv.x * 7.0, uv.y * 0.55 - scroll * 0.9));
  float n2 = esSheetNoise(vec2(uv.x * 2.6 + 11.0, uv.y * 0.22 - scroll * 0.45));
  float streak = n1 * (0.55 + 0.75 * n2);

  // Across-width profile: opaque whitewater down the middle, smoothly gone at
  // both edges. Colour AND alpha ride it, so the centre is always the whitest
  // and the most opaque part of the sheet.
  float profile = esSheetWidthProfile(uv.x);
  // Aeration: free flight entrains air with the distance fallen; a chute is
  // aerated by local speed and steepness instead, so it stays white end to end.
  float freeHere = step(0.15, vAir);
  float aeration = esSheetAeration(freeHere, vSpeed, vFrac, vSlope);
  float white = clamp(aeration * (0.45 + 0.75 * streak) * mix(0.7, 1.0, profile), 0.0, 1.0);
  vec3 albedo = mix(vec3(0.26, 0.40, 0.44), vec3(0.90, 0.94, 0.96), white);
  // foam breakup: coarse blobs riding the streaks, so the white reads as
  // churning water rather than a flat card
  float churn = smoothstep(0.35, 0.85, esSheetNoise(vec2(uv.x * 3.4 + 5.0, uv.y * 0.9 - scroll * 0.7)));
  albedo = mix(albedo, vec3(0.97, 0.98, 1.0), churn * aeration * 0.55);
  albedo *= vTint;                     // back layer darker, core brighter

  float light = 0.55 + 0.45 * clamp(uSunDir.y, 0.0, 1.0);
  vec3 color = albedo * (uAmbient + uSunLight * light);

  float layerAlpha = vLayer < 0.5 ? 1.0 : (vLayer < 1.5 ? 0.68 : 0.85);
  float noise = clamp(streak + churn * 0.6, 0.0, 1.0);
  float alpha = uOpacity * profile * (0.55 + 0.45 * noise) * layerAlpha;
  // dissolve into the plunge over the last 15 % of the fall
  alpha *= 1.0 - smoothstep(0.85, 1.0, vFrac);
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
    alpha *= mix(1.0, smoothstep(0.0, 0.6, sceneEye - fragEye), freeness);
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
}

/**
 * Load-time sheet stack: one mesh, one material, no per-frame path work.
 * `update` only feeds time, light and the pipeline's scene depth.
 */
export class WaterfallSheets {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  readonly uniforms: WaterfallSheetUniforms;
  readonly diagnostics: { count: number; triangles: number; freeFlightCount: number };
  readonly paths: FallPath[];
  private readonly byId = new Map<string, FallPath>();

  constructor(cascades: readonly Cascade[], applyAerial: (m: THREE.Material) => void) {
    const built = buildWaterfallSheetGeometry(cascades);
    this.paths = built.paths;
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
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms as unknown as Record<string, THREE.IUniform>,
      vertexShader: SHEET_VERTEX,
      fragmentShader: SHEET_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    applyAerial(this.material);
    this.material.customProgramCacheKey = () => "es-waterfall-sheet";
    this.mesh = new THREE.Mesh(built.geometry, this.material);
    this.mesh.name = "water-waterfall-sheets";
    this.mesh.layers.set(WATER_LAYER);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.diagnostics = {
      count: built.fallCount,
      triangles: built.triangleCount,
      freeFlightCount: built.freeFlightCount,
    };
  }

  /** The traced sheet path, for the particle emitters spaced along the fall. */
  pathFor(id: string): FallPath | undefined { return this.byId.get(id); }

  update(runtime: WaterRuntime, timeS: number, verticalScale: number): void {
    this.uniforms.uTime.value = timeS;
    this.uniforms.uVerticalScale.value = verticalScale;
    this.uniforms.uAmbient.value.copy(runtime.ambient.value);
    this.uniforms.uSunLight.value.copy(runtime.sunLight.value);
    this.uniforms.uSunDir.value.copy(runtime.sunDirection.value);
  }

  setDepth(texture: THREE.Texture | null, near: number, far: number, width: number, height: number): void {
    this.uniforms.uSceneDepth.value = texture;
    this.uniforms.uHasDepth.value = texture && near > 0 && far > near ? 1 : 0;
    this.uniforms.uCamNear.value = near;
    this.uniforms.uCamFar.value = far;
    this.uniforms.uResolution.value.set(width, height);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mesh.removeFromParent();
  }
}
