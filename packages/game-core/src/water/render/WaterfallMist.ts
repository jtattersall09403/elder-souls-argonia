import * as THREE from "three";
import type { WaterRuntime } from "./types";
import { WATER_LAYER } from "./waterMaterial";
import { WHITEWATER_GLSL } from "./whitewaterStreaks";
import { FOAM_FIELD_GLSL } from "./FoamField";
import { plungeBaseRadiusM, type PlungeSite } from "./PlungeBase";

/**
 * The mist of a waterfall as static GEOMETRY, mined from Bethesda's stacks
 * (vault audit §5, the worked `bodytall` example): "half a dozen small mist
 * cards pitched in every direction around the impact (scale 0.2–0.5, often
 * rotated 90–135° so they read as blasts rather than sheets), a scatter of
 * 10–40 ground-mist discs at random yaw filling the whole basin, and a skirt
 * at the plunge. The mist cards are individually cheap and numerous — that is
 * the whole trick, and it is not a particle system." Particles stay the
 * accent (`cascadeEmitterKit`: 1–2 emitters); this carries the read.
 *
 * Three kinds in ONE merged geometry and one material (a child of the sheet
 * mesh, like `PlungeBase`):
 *  - **mist cards**: 4–8 per fall by drop, `MIST_CARD_SCALE` × the fall width,
 *    seeded yaw, pitched −10° … 135° about their waterline edge, within
 *    `MIST_CARD_RADIUS_M` of the impact; the waterline edge fades out so no
 *    cut shows at the pool; soft depth 1.07 m (the spray class);
 *  - **ground mist**: 10–40 level discs filling the plunge basin, size by pool
 *    radius, alpha by distance from the impact AND by the foam field under
 *    them (a fed pool steams, a still one barely); soft depth 0.60 m;
 *  - **skirt**: a curved column hugging the upstream side of the sheet foot,
 *    two foam layers scrolling down at −0.545 t/s and one up at +0.362 t/s
 *    (`fxwaterfallskirttallfront`); its visible foam is only the bottom
 *    `SKIRT_FOAM_M`, a faint fog above.
 * Scroll: the ground-mist rates, U +0.030 / V −0.017 tiles/s (a 34 s / 60 s
 * loop, `fxmistlow01`). Shaded like the sheets — unlit grey × the same sky +
 * sun irradiance, tone-mapped with the frame — so a fall, its base and its
 * mist expose as one thing. The TS alpha twins below are what the tests read.
 */

export type MistSite = PlungeSite;

/** Mist cards per fall: 4 at ≤ 8 m of drop rising to 8 at ≥ 40 m. */
export const MIST_CARDS = { min: 4, max: 8, dropMinM: 8, dropMaxM: 40 } as const;
/** Card size as a fraction of the fall width (median vanilla scale 0.51 of a
 * ~5 m card on ~10 m falls → 0.2–0.5 of the width). */
export const MIST_CARD_SCALE = { min: 0.2, max: 0.5 } as const;
export const MIST_CARD_MIN_M = 1.2;
/** Cards sit within this much of the impact point. */
export const MIST_CARD_RADIUS_M = 12;
/** Card pitch about its waterline edge (deg): 0 vertical, 90 flat, 135 laid back. */
export const MIST_CARD_PITCH_DEG = { min: -10, max: 135 } as const;
/** Soft-particle depth fades (m): 75 u spray on the cards and skirt, 42 u on ground mist. */
export const MIST_DEPTH_FADE_M = { card: 1.07, disc: 0.6, skirt: 1.07 } as const;
/** Ground-mist scroll, tiles/s (fxmistlow01: +0.030 U over a 34 s loop, −0.017 V over 60 s). */
export const MIST_SCROLL_UVS = { u: 0.03, v: -0.017 } as const;
export const MIST_LOOP_S = 34;
/** One mist tile is this many metres on a card / disc. */
export const MIST_TILE_M = 4;
/** Ground-mist discs per fall: 10 at ≤ 8 m of drop rising to 40 at ≥ 60 m. */
export const GROUND_MIST = { min: 10, max: 40, dropMinM: 8, dropMaxM: 60 } as const;
/** Disc size as a fraction of the basin radius, clamped to metres. */
export const GROUND_MIST_SIZE = { minFrac: 0.3, maxFrac: 0.55, minM: 1.5, maxM: 6 } as const;
/** The basin the discs fill: the base kit's radius, a little wider. */
export const GROUND_MIST_BASIN_SCALE = 1.25;
export const GROUND_MIST_LIFT_M = 0.35;
/** Skirt: visible foam over the bottom 3.5 m; column height capped at the
 * vanilla skirt's 11.6 m; wraps ±75° around the impact on the cliff side. */
export const SKIRT_FOAM_M = 3.5;
export const SKIRT_HEIGHT_MAX_M = 11.6;
export const SKIRT_HALF_ANGLE_DEG = 75;
export const SKIRT_SEGMENTS = 10;
export const SKIRT_TILE_M = 4;
/** Skirt scroll rates, tiles/s (audit §4): foam ×2 down at 0.545, fog up at 0.362. */
export const SKIRT_SCROLL_TS = { down: 0.545, up: 0.362 } as const;
/** Unlit emissive: mist is the 0.70 grey of the effect shaders, the skirt is foam (0.90). */
export const MIST_EMISSIVE = { mist: 0.7, skirt: 0.9 } as const;
/** Peak alpha per kind. */
export const MIST_ALPHA = { card: 0.45, disc: 0.35, skirt: 0.7 } as const;
/** Kind codes in `aMistKind`. */
export const MIST_KIND = { card: 0, disc: 1, skirt: 2 } as const;

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
}
function clamp01(v: number): number { return Math.min(Math.max(v, 0), 1); }
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
  return Math.min(Math.max(Math.round(spec.min + (spec.max - spec.min) * s), spec.min), spec.max);
}

/** Mist cards for a drop, 4..8. */
export function mistCardCount(dropM: number): number { return countByDrop(dropM, MIST_CARDS); }
/** Ground-mist discs for a drop, 10..40. */
export function groundMistCount(dropM: number): number { return countByDrop(dropM, GROUND_MIST); }
/** The basin radius the ground mist fills (m). */
export function mistBasinRadiusM(widthM: number, dropM: number): number {
  return plungeBaseRadiusM(widthM, dropM) * GROUND_MIST_BASIN_SCALE;
}
/** Skirt column height for a drop (m). */
export function skirtHeightM(dropM: number): number {
  return Math.min(SKIRT_HEIGHT_MAX_M, Math.max(dropM * 0.7, SKIRT_FOAM_M));
}

export interface MistCard {
  x: number; z: number;
  /** Bottom (waterline) edge height. */
  y: number;
  sizeM: number;
  yawRad: number;
  pitchRad: number;
  distM: number;
  phase: number;
}
export interface GroundMistDisc {
  x: number; z: number; y: number;
  sizeM: number;
  yawRad: number;
  distM: number;
  radiusM: number;
  phase: number;
}
export interface MistLayout {
  cards: MistCard[];
  discs: GroundMistDisc[];
  skirt: { x: number; z: number; y: number; radiusM: number; heightM: number; upstreamRad: number; phase: number };
}

/** Deterministic layout for one fall (seeded by id). Pure; the tests read it. */
export function mistLayout(site: MistSite): MistLayout {
  const random = lcg(hashString(`${site.id}|mist`));
  const dl = Math.hypot(site.direction.x, site.direction.z);
  const dx = dl > 1e-6 ? site.direction.x / dl : 1;
  const dz = dl > 1e-6 ? site.direction.z / dl : 0;
  const downstream = Math.atan2(dz, dx);
  const width = Math.max(site.widthM, 0.5);

  const cards: MistCard[] = [];
  const nCards = mistCardCount(site.dropM);
  const cardRadius = Math.min(MIST_CARD_RADIUS_M, 2.5 + width * 0.5 + Math.min(site.dropM, 60) * 0.1);
  for (let i = 0; i < nCards; i++) {
    // around the impact, all sectors (blasts go every way), never at the exact centre
    const a = downstream + ((i + random()) / nCards) * Math.PI * 2;
    const dist = (0.2 + 0.8 * Math.sqrt(random())) * cardRadius;
    const scale = MIST_CARD_SCALE.min + (MIST_CARD_SCALE.max - MIST_CARD_SCALE.min) * random();
    const pitchDeg = MIST_CARD_PITCH_DEG.min + (MIST_CARD_PITCH_DEG.max - MIST_CARD_PITCH_DEG.min) * random();
    cards.push({
      x: site.plunge.x + Math.cos(a) * dist, z: site.plunge.z + Math.sin(a) * dist, y: site.plunge.y + 0.1,
      sizeM: Math.max(width * scale, MIST_CARD_MIN_M), yawRad: random() * Math.PI * 2,
      pitchRad: (pitchDeg * Math.PI) / 180, distM: dist, phase: random() * MIST_LOOP_S,
    });
  }

  const discs: GroundMistDisc[] = [];
  const nDiscs = groundMistCount(site.dropM);
  const R = mistBasinRadiusM(width, site.dropM);
  for (let i = 0; i < nDiscs; i++) {
    const a = random() * Math.PI * 2;
    const dist = Math.sqrt((i + random()) / nDiscs) * R;   // area-uniform fill
    const frac = GROUND_MIST_SIZE.minFrac + (GROUND_MIST_SIZE.maxFrac - GROUND_MIST_SIZE.minFrac) * random();
    discs.push({
      x: site.plunge.x + Math.cos(a) * dist, z: site.plunge.z + Math.sin(a) * dist, y: site.plunge.y + GROUND_MIST_LIFT_M,
      sizeM: Math.min(Math.max(R * frac, GROUND_MIST_SIZE.minM), GROUND_MIST_SIZE.maxM),
      yawRad: random() * Math.PI * 2, distM: dist, radiusM: R, phase: random() * MIST_LOOP_S,
    });
  }

  return {
    cards, discs,
    skirt: {
      x: site.plunge.x, z: site.plunge.z, y: site.plunge.y + 0.05,
      radiusM: width * 0.5 + 0.8, heightM: skirtHeightM(site.dropM),
      upstreamRad: downstream + Math.PI, phase: random() * MIST_LOOP_S,
    },
  };
}

export interface MistGeometry {
  geometry: THREE.BufferGeometry;
  cardCount: number;
  discCount: number;
  skirtCount: number;
  triangleCount: number;
  perFall: Record<string, { cards: number; discs: number; skirts: number; triangles: number }>;
}

/** One merged geometry for every fall's mist kit. */
export function buildMistGeometry(sites: readonly MistSite[]): MistGeometry {
  const position: number[] = [];
  const uv: number[] = [];      // local (u, v) 0..1
  const kind: number[] = [];
  const fade: number[] = [];    // (dist/R | height above foot m, phase, skirt column height m)
  const size: number[] = [];    // metres along u (tiling)
  const index: number[] = [];
  const perFall: MistGeometry["perFall"] = {};
  let cardCount = 0;
  let discCount = 0;
  let skirtCount = 0;
  const quad = (corners: [number, number, number][], k: number, f: [number, number], s: number) => {
    // cards and discs carry no column height (only the skirt reads .z)
    const base = position.length / 3;
    const local: [number, number][] = [[0, 0], [1, 0], [0, 1], [1, 1]];
    corners.forEach((c, i) => {
      position.push(c[0], c[1], c[2]);
      uv.push(local[i][0], local[i][1]);
      kind.push(k);
      fade.push(f[0], f[1], 0);
      size.push(s);
    });
    index.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
  };
  for (const site of sites) {
    const layout = mistLayout(site);
    const trisBefore = index.length / 3;
    for (const c of layout.cards) {
      const rx = Math.cos(c.yawRad), rz = Math.sin(c.yawRad);      // card's across axis
      const nx = -rz, nz = rx;                                       // horizontal normal
      const cp = Math.cos(c.pitchRad), sp = Math.sin(c.pitchRad);
      // up axis = vertical rotated about the across axis by the pitch
      const ux = sp * nx, uy = cp, uz = sp * nz;
      // a card laid back past flat would dip below the pool: raise its pivot
      const lift = Math.max(0, -cp) * c.sizeM;
      const h = c.sizeM * 0.5;
      const y0 = c.y + lift;
      quad([
        [c.x - rx * h, y0, c.z - rz * h], [c.x + rx * h, y0, c.z + rz * h],
        [c.x - rx * h + ux * c.sizeM, y0 + uy * c.sizeM, c.z - rz * h + uz * c.sizeM],
        [c.x + rx * h + ux * c.sizeM, y0 + uy * c.sizeM, c.z + rz * h + uz * c.sizeM],
      ], MIST_KIND.card, [c.distM, c.phase], c.sizeM);
      cardCount++;
    }
    for (const d of layout.discs) {
      const rx = Math.cos(d.yawRad), rz = Math.sin(d.yawRad);
      const fx = -rz, fz = rx;
      const h = d.sizeM * 0.5;
      quad([
        [d.x - rx * h - fx * h, d.y, d.z - rz * h - fz * h], [d.x + rx * h - fx * h, d.y, d.z + rz * h - fz * h],
        [d.x - rx * h + fx * h, d.y, d.z - rz * h + fz * h], [d.x + rx * h + fx * h, d.y, d.z + rz * h + fz * h],
      ], MIST_KIND.disc, [d.distM / d.radiusM, d.phase], d.sizeM);
      discCount++;
    }
    {
      const s = layout.skirt;
      const half = (SKIRT_HALF_ANGLE_DEG * Math.PI) / 180;
      const arcM = s.radiusM * half * 2;
      const rows = [0, SKIRT_FOAM_M, s.heightM].filter((h, i, a) => i === 0 || h > a[i - 1] + 1e-6);
      const base = position.length / 3;
      for (let r = 0; r < rows.length; r++) {
        for (let j = 0; j <= SKIRT_SEGMENTS; j++) {
          const a = s.upstreamRad - half + (2 * half * j) / SKIRT_SEGMENTS;
          position.push(s.x + Math.cos(a) * s.radiusM, s.y + rows[r], s.z + Math.sin(a) * s.radiusM);
          uv.push(j / SKIRT_SEGMENTS, rows[r] / s.heightM);
          kind.push(MIST_KIND.skirt);
          fade.push(rows[r], s.phase, s.heightM);
          size.push(arcM);
        }
      }
      const cols = SKIRT_SEGMENTS + 1;
      for (let r = 0; r + 1 < rows.length; r++) {
        for (let j = 0; j < SKIRT_SEGMENTS; j++) {
          const a = base + r * cols + j;
          index.push(a, a + cols, a + 1, a + 1, a + cols, a + cols + 1);
        }
      }
      skirtCount++;
    }
    perFall[site.id] = { cards: layout.cards.length, discs: layout.discs.length, skirts: 1, triangles: index.length / 3 - trisBefore };
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(position, 3));
  geometry.setAttribute("aMistUv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setAttribute("aMistKind", new THREE.Float32BufferAttribute(kind, 1));
  geometry.setAttribute("aMistFade", new THREE.Float32BufferAttribute(fade, 3));
  geometry.setAttribute("aMistSize", new THREE.Float32BufferAttribute(size, 1));
  geometry.setIndex(index);
  geometry.computeBoundingSphere();
  return { geometry, cardCount, discCount, skirtCount, triangleCount: index.length / 3, perFall };
}

/* ------------------------------------------------------------------ *
 * Alpha twins (minus tone mapping and the depth fade unless given). The
 * fragment shader below compiles the same shapes. Edit both or neither.
 * ------------------------------------------------------------------ */

/** Soft box: sides over 20 %, top over 30 %, and the waterline edge (v = 0)
 * over the bottom 30 % so no cut ever shows at the pool. */
export function mistBox(u: number, v: number): number {
  return smoothstep(0, 0.2, u) * smoothstep(1, 0.8, u) * smoothstep(0, 0.3, v) * smoothstep(1, 0.7, v);
}
export function mistCardAlpha(u: number, v: number, coverage: number, depthDeltaM = 10): number {
  return clamp01(MIST_ALPHA.card * mistBox(u, v) * coverage * smoothstep(0, MIST_DEPTH_FADE_M.card, depthDeltaM));
}
/** Ground mist: radial fade over the basin × the foam field under the disc. */
export function groundMistAlpha(u: number, v: number, distFrac: number, coverage: number, foamField: number,
  depthDeltaM = 10): number {
  const radial = 1 - smoothstep(0.55, 1.0, distFrac);
  const fed = 0.3 + 0.7 * clamp01(foamField * 2);
  return clamp01(MIST_ALPHA.disc * mistBox(u, v) * radial * coverage * fed * smoothstep(0, MIST_DEPTH_FADE_M.disc, depthDeltaM));
}
/** Skirt: foam over the bottom `SKIRT_FOAM_M`, a faint fog above to the top. */
export function skirtAlpha(u: number, heightM: number, columnHeightM: number, foamCoverage: number, fogCoverage: number,
  depthDeltaM = 10): number {
  const edge = smoothstep(0, 0.15, u) * smoothstep(1, 0.85, u);
  const foam = (1 - smoothstep(0, SKIRT_FOAM_M, heightM)) * foamCoverage;
  const fog = (1 - smoothstep(SKIRT_FOAM_M * 0.5, Math.max(columnHeightM, SKIRT_FOAM_M + 1e-3), heightM)) * fogCoverage * 0.25;
  return clamp01(MIST_ALPHA.skirt * edge * Math.min(foam + fog, 1) * smoothstep(0, MIST_DEPTH_FADE_M.skirt, depthDeltaM));
}

const MIST_VERTEX = /* glsl */ `
attribute vec2 aMistUv;
attribute float aMistKind;
attribute vec3 aMistFade;
attribute float aMistSize;
varying vec2 vUvL;
varying float vKind;
varying vec3 vFade;
varying float vSize;
varying vec3 vWorldPos;
uniform float uVerticalScale;
uniform float uLift;
#include <common>
void main() {
  vUvL = aMistUv;
  vKind = aMistKind;
  vFade = aMistFade;
  vSize = aMistSize;
  vec3 transformed = vec3(position.x, (position.y + uLift) * uVerticalScale, position.z);
  vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
}
`;

const MIST_FRAGMENT = /* glsl */ `
precision highp float;
varying vec2 vUvL;
varying float vKind;
varying vec3 vFade;
varying float vSize;
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
uniform float uUnderwater;
uniform float uSurfaceY;
#ifdef ES_MIST_TEX
uniform sampler2D uMistTex;
#endif
#ifdef ES_SKIRT_TEX
uniform sampler2D uSkirtTex;
#endif
#include <common>
${WHITEWATER_GLSL}
${FOAM_FIELD_GLSL}
// the vanilla mist textures are greyscale with the cloud in ALPHA
float esMistField(vec2 uv){
#ifdef ES_MIST_TEX
  return texture2D(uMistTex, uv).a;
#else
  return clamp(esStreakValueNoise(uv * 3.0) * 0.6 + esStreakValueNoise(uv * 7.0 + 3.0) * 0.4, 0.0, 1.0);
#endif
}
float esSkirtField(vec2 uv){
#ifdef ES_SKIRT_TEX
  return texture2D(uSkirtTex, uv).a;
#else
  return esStreakValueNoise(vec2(uv.x * 4.0, uv.y));
#endif
}
void main() {
  float u = vUvL.x;
  float v = vUvL.y;
  float t = uTime + vFade.y;
  float alpha;
  float cov;
  float emissive;
  float depthFadeM;
  if (vKind < 0.5) {
    // mist card: box-faded (waterline edge strongest), slow U/V drift
    float tiles = max(vSize / ${MIST_TILE_M.toFixed(1)}, 0.5);
    vec2 uv = vec2(u, v) * tiles + vec2(${MIST_SCROLL_UVS.u.toFixed(3)}, ${MIST_SCROLL_UVS.v.toFixed(3)}) * t;
    cov = esMistField(uv);
    float box = smoothstep(0.0, 0.2, u) * smoothstep(1.0, 0.8, u) * smoothstep(0.0, 0.3, v) * smoothstep(1.0, 0.7, v);
    alpha = ${MIST_ALPHA.card.toFixed(2)} * box * cov;
    emissive = ${MIST_EMISSIVE.mist.toFixed(2)};
    depthFadeM = ${MIST_DEPTH_FADE_M.card.toFixed(2)};
  } else if (vKind < 1.5) {
    // ground mist: radial over the basin x the foam field under the disc
    float tiles = max(vSize / ${MIST_TILE_M.toFixed(1)}, 0.5);
    vec2 uv = vec2(u, v) * tiles + vec2(${MIST_SCROLL_UVS.u.toFixed(3)}, ${MIST_SCROLL_UVS.v.toFixed(3)}) * t;
    cov = esMistField(uv);
    float box = smoothstep(0.0, 0.2, u) * smoothstep(1.0, 0.8, u) * smoothstep(0.0, 0.3, v) * smoothstep(1.0, 0.7, v);
    float radial = 1.0 - smoothstep(0.55, 1.0, vFade.x);
    float fed = 0.3 + 0.7 * clamp(esFoamFieldAt(vWorldPos.xz) * 2.0, 0.0, 1.0);
    alpha = ${MIST_ALPHA.disc.toFixed(2)} * box * radial * cov * fed;
    emissive = ${MIST_EMISSIVE.mist.toFixed(2)};
    depthFadeM = ${MIST_DEPTH_FADE_M.disc.toFixed(2)};
  } else {
    // skirt: two foam layers down at 0.545 t/s, one fog layer up at 0.362
    float h = vFade.x;
    float tilesU = max(vSize / ${SKIRT_TILE_M.toFixed(1)}, 1.0);
    float vt = h / ${SKIRT_TILE_M.toFixed(1)};
    float a = esSkirtField(vec2(u * tilesU, vt + ${SKIRT_SCROLL_TS.down.toFixed(3)} * t));
    float b = esSkirtField(vec2(u * tilesU + 0.37, vt + ${(SKIRT_SCROLL_TS.down * 1.03).toFixed(3)} * t + 5.0));
    float c = esSkirtField(vec2(u * tilesU + 0.71, vt - ${SKIRT_SCROLL_TS.up.toFixed(3)} * t));
    float foamCov = clamp(a * 0.5 + b * 0.5, 0.0, 1.0);
    float edge = smoothstep(0.0, 0.15, u) * smoothstep(1.0, 0.85, u);
    float foam = (1.0 - smoothstep(0.0, ${SKIRT_FOAM_M.toFixed(2)}, h)) * foamCov;
    float fog = (1.0 - smoothstep(${(SKIRT_FOAM_M * 0.5).toFixed(2)}, max(vFade.z, ${SKIRT_FOAM_M.toFixed(2)} + 1e-3), h)) * c * 0.25;
    cov = foamCov;
    alpha = ${MIST_ALPHA.skirt.toFixed(2)} * edge * min(foam + fog, 1.0);
    emissive = ${MIST_EMISSIVE.skirt.toFixed(2)};
    depthFadeM = ${MIST_DEPTH_FADE_M.skirt.toFixed(2)};
  }
  alpha *= uOpacity;
  // Seen from under the pool: nothing of the mist is drawn. It is airborne
  // spray; a submerged eye reaches it only through the surface, which we do
  // not refract, tint or clip to Snell's window — that view belongs to the
  // field water's below variant. Same rule as the sheet and the plunge base,
  // and the reason the falls layer stopped painting the submerged frame.
  alpha *= 1.0 - clamp(uUnderwater, 0.0, 1.0);
  if (uHasDepth > 0.5) {
    vec2 suv = gl_FragCoord.xy / uResolution;
    float d = texture2D(uSceneDepth, suv).x;
    float sceneEye = (uCamNear * uCamFar) / (uCamFar - d * (uCamFar - uCamNear));
    float fragEye = 1.0 / gl_FragCoord.w;
    alpha *= smoothstep(0.0, depthFadeM, sceneEye - fragEye);
  }
  if (alpha < 0.004) discard;
  vec3 color = vec3(emissive) * (0.85 + 0.15 * cov)
    * esFallsIrradiance(uAmbient, uSunLight, uSunDir);
  gl_FragColor = vec4(color, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export interface MistTextures {
  mist?: THREE.Texture | null;
  skirt?: THREE.Texture | null;
}

export interface WaterfallMistDiagnostics {
  cards: number;
  discs: number;
  skirts: number;
  triangles: number;
  perFall: MistGeometry["perFall"];
}

export class WaterfallMist {
  readonly mesh: THREE.Mesh;
  readonly material: THREE.ShaderMaterial;
  readonly uniforms: Record<string, THREE.IUniform>;
  readonly diagnostics: WaterfallMistDiagnostics;
  private textures: MistTextures;
  private underwater = false;

  constructor(sites: readonly MistSite[], applyAerial: (m: THREE.Material) => void, textures: MistTextures = {}) {
    const built = buildMistGeometry(sites);
    this.textures = { mist: textures.mist ?? null, skirt: textures.skirt ?? null };
    this.diagnostics = { cards: built.cardCount, discs: built.discCount, skirts: built.skirtCount,
      triangles: built.triangleCount, perFall: built.perFall };
    this.uniforms = {
      uTime: { value: 0 },
      uVerticalScale: { value: 1 },
      uLift: { value: 0 },
      uAmbient: { value: new THREE.Vector3(0.2, 0.2, 0.2) },
      uSunLight: { value: new THREE.Vector3(1, 1, 1) },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSceneDepth: { value: null },
      uHasDepth: { value: 0 },
      uCamNear: { value: 0.3 },
      uCamFar: { value: 60000 },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uOpacity: { value: 1 },
      uUnderwater: { value: 0 },
      uSurfaceY: { value: 0 },
      uMistTex: { value: this.textures.mist },
      uSkirtTex: { value: this.textures.skirt },
      uFoamField: { value: null },
      uFoamFieldInfo: { value: new THREE.Vector4(0, 0, 512, 0) },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: MIST_VERTEX,
      fragmentShader: MIST_FRAGMENT,
      defines: this.defines(),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    applyAerial(this.material);
    this.material.customProgramCacheKey = () => this.cacheKey();
    this.mesh = new THREE.Mesh(built.geometry, this.material);
    this.mesh.name = "water-waterfall-mist";
    this.mesh.layers.set(WATER_LAYER);
    this.mesh.frustumCulled = false;
    // after the sheets and the base so the mist lies over the foot
    this.mesh.renderOrder = 4;
  }

  private defines(): Record<string, number> {
    const d: Record<string, number> = {};
    if (this.textures.mist) d.ES_MIST_TEX = 1;
    if (this.textures.skirt) d.ES_SKIRT_TEX = 1;
    return d;
  }
  private cacheKey(): string {
    return `es-waterfall-mist${this.textures.mist ? "-mist" : ""}${this.textures.skirt ? "-skirt" : ""}`;
  }

  /** Bind (or unbind, with null) the mist / skirt textures; unnamed slots keep theirs. */
  setTextures(textures: MistTextures): void {
    if ("mist" in textures) this.textures.mist = textures.mist ?? null;
    if ("skirt" in textures) this.textures.skirt = textures.skirt ?? null;
    this.uniforms.uMistTex.value = this.textures.mist;
    this.uniforms.uSkirtTex.value = this.textures.skirt;
    this.material.defines = this.defines();
    this.material.needsUpdate = true;
  }

  update(runtime: WaterRuntime, timeS: number, verticalScale: number, seasonLiftM: number,
    foam?: { texture: THREE.Texture | null; info: THREE.Vector4 }): void {
    this.uniforms.uTime.value = timeS;
    this.uniforms.uVerticalScale.value = verticalScale;
    this.uniforms.uLift.value = seasonLiftM;
    (this.uniforms.uAmbient.value as THREE.Vector3).copy(runtime.ambient.value);
    (this.uniforms.uSunLight.value as THREE.Vector3).copy(runtime.sunLight.value);
    (this.uniforms.uSunDir.value as THREE.Vector3).copy(runtime.sunDirection.value);
    if (foam) {
      this.uniforms.uFoamField.value = foam.texture;
      (this.uniforms.uFoamFieldInfo.value as THREE.Vector4).copy(foam.info);
    }
  }

  /** Submerged camera: fade everything at and below the pool surface (scaled y). */
  setUnderwater(underwater: boolean, surfaceY: number): void {
    this.underwater = underwater;
    this.uniforms.uUnderwater.value = underwater ? 1 : 0;
    this.uniforms.uSurfaceY.value = surfaceY;
    if (underwater) this.uniforms.uHasDepth.value = 0;
  }

  setDepth(texture: THREE.Texture | null, near: number, far: number, width: number, height: number): void {
    this.uniforms.uSceneDepth.value = texture;
    // under water the mist draws INTO the scene target: sampling its own depth
    // there would be a feedback loop, so the soft fade is off until we surface
    this.uniforms.uHasDepth.value = texture && near > 0 && far > near && !this.underwater ? 1 : 0;
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
