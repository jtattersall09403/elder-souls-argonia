import * as THREE from "three";

/**
 * The ONE cloud field (Phase 8c round 2, decision 0032): a deterministic
 * 2-3-layer FBM cloud function evaluated identically on the GPU (dome
 * shader, star vertex stage) and the CPU (sun/moon occlusion — the light
 * visibly dims when a cumulus drifts across the sun; the moons vanish
 * behind, and glow through, cloud). Lockstep is guaranteed by construction:
 * both sides sample the SAME seeded lattice (a repeat-wrapped DataTexture on
 * the GPU, the same Float32Array bilinearly on the CPU) and the layer maths
 * is baked into the GLSL from the constants below — change `CLOUD`, both
 * sides follow (the waves.ts pattern).
 *
 * Layer character comes from the weather state profile (states.ts):
 * coverage per layer, `puff` (featureless nimbostratus sheet → crisp
 * cumulus), scroll speed, and the squall `stormFront` (coverage piles into a
 * near-black wall on the upwind horizon and thins downwind — the shelf-line
 * asymmetry is the entire squall read; research doc §8).
 */

export const CLOUD = {
  lattice: 256,
  /** FBM octaves: weight, frequency, offset x/y. */
  octaves: [
    [0.5, 1.0, 0.0, 0.0],
    [0.27, 2.03, 17.1, 9.3],
    [0.16, 4.05, 41.7, 23.4],
    [0.07, 8.1, 5.2, 67.4],
  ] as const,
  /** Mid deck (the weather-bearing layer). */
  midScale: 1.35,
  midDetail: 0.35,
  midDetailScale: 3.1,
  midScroll: 0.01,
  softSheet: 0.42, // coverage-remap softness at puff 0 (mushy stratus)
  softPuff: 0.1, // …and at puff 1 (hard cumulus edges)
  /** Low scud (ragged, fast). */
  lowScale: 2.3,
  lowFreq: 1.7,
  lowScroll: 0.034,
  /** High cirrus (thin, wind-stretched). */
  highAniso: 0.22,
  highScale: 0.9,
  highFreq: 2.0,
  highScroll: 0.006,
  highAlpha: 0.42,
  /** Squall shelf wall. */
  frontGain: 0.35,
  frontThin: 0.4,
  lowFrontMul: 1.5,
  /** Horizon fade band (matches the dome composite). */
  horizonLo: 0.012,
  horizonHi: 0.09,
} as const;

export interface CloudParams {
  covLow: number;
  covMid: number;
  covHigh: number;
  density: number;
  puff: number;
  scroll: number;
  stormFront: number;
  /** Wind travel direction (unit XZ) — the wall stands on the UPWIND horizon. */
  windDir: [number, number];
  timeS: number;
}

// ---------------------------------------------------------------------------
// The shared lattice
// ---------------------------------------------------------------------------

let latticeData: Float32Array | null = null;

/** Seeded value lattice in [0,1] — the single source both samplers read. */
export function cloudNoiseData(): Float32Array {
  if (latticeData) return latticeData;
  const n = CLOUD.lattice * CLOUD.lattice;
  const out = new Float32Array(n);
  let s = 0xc10d05;
  for (let i = 0; i < n; i += 1) {
    s = (s * 1664525 + 1013904223) >>> 0;
    // Quantise to 8 bits so the CPU sees exactly what the byte texture holds.
    out[i] = Math.floor((s / 4294967296) * 256) / 255;
  }
  latticeData = out;
  return out;
}

let latticeTexture: THREE.DataTexture | null = null;

export function cloudNoiseTexture(): THREE.DataTexture {
  if (latticeTexture) return latticeTexture;
  const data = cloudNoiseData();
  const bytes = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i += 1) bytes[i] = Math.round(data[i] * 255);
  const t = new THREE.DataTexture(bytes, CLOUD.lattice, CLOUD.lattice, THREE.RedFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  latticeTexture = t;
  return t;
}

// ---------------------------------------------------------------------------
// GLSL side
// ---------------------------------------------------------------------------

const f = (v: number) => {
  const s = String(v);
  return s.includes(".") || s.includes("e") ? s : `${s}.0`;
};

/** Uniform declarations every cloud-sampling shader shares. */
export const CLOUD_UNIFORMS_GLSL = /* glsl */ `
uniform sampler2D uCloudNoise;
uniform vec3 uCloudCov;
uniform float uCloudDens;
uniform float uCloudPuff;
uniform float uCloudScroll;
uniform float uCloudFront;
uniform vec2 uCloudDir;
uniform float uCloudTime;
`;

/** One shared uniform value-set (single objects — every material that
 * Object.assigns these sees each frame's WorldSky update for free). */
export function createCloudUniforms() {
  return {
    uCloudNoise: { value: cloudNoiseTexture() },
    uCloudCov: { value: new THREE.Vector3(0, 0, 0) },
    uCloudDens: { value: 0 },
    uCloudPuff: { value: 1 },
    uCloudScroll: { value: 1 },
    uCloudFront: { value: 0 },
    uCloudDir: { value: new THREE.Vector2(1, 0) },
    uCloudTime: { value: 0 },
  };
}
export type CloudUniforms = ReturnType<typeof createCloudUniforms>;

/** The field functions. KEEP IN LOCKSTEP with the CPU twins below — both are
 * generated/written from the same `CLOUD` table. */
export function cloudFieldGlsl(): string {
  const oct = CLOUD.octaves
    .map(([w, fr, ox, oy]) => `n += ${f(w)} * esCloudN(p * ${f(fr)} + vec2(${f(ox)}, ${f(oy)}));`)
    .join("\n  ");
  return /* glsl */ `
float esCloudN(vec2 p) {
  return texture2D(uCloudNoise, (p + 0.5) / ${f(CLOUD.lattice)}).r;
}
float esCloudFbm(vec2 p) {
  float n = 0.0;
  ${oct}
  return n;
}
// Squall shelf wall: coverage shift by azimuth — piles up on the UPWIND
// horizon (where the line approaches from), thins downwind so lighter sky
// shows behind the front. Applied to BOTH the mid deck and the low scud.
float esFrontShift(vec3 d) {
  if (uCloudFront <= 0.001) return 0.0;
  vec2 az = normalize(d.xz + vec2(1e-4, 0.0));
  float front = smoothstep(-0.25, 0.55, dot(az, -uCloudDir));
  return uCloudFront * (${f(CLOUD.frontGain)} * front - ${f(CLOUD.frontThin)} * (1.0 - front));
}
float esCloudMid(vec3 d, out float n) {
  vec2 uv = d.xz / (d.y * 0.8 + 0.055) * ${f(CLOUD.midScale)}
          + uCloudDir * (uCloudTime * ${f(CLOUD.midScroll)} * uCloudScroll);
  n = (esCloudFbm(uv) + ${f(CLOUD.midDetail)} * esCloudFbm(uv * ${f(CLOUD.midDetailScale)} + 7.7))
    / ${f(1 + CLOUD.midDetail)};
  float cov = clamp(uCloudCov.y + esFrontShift(d), 0.0, 1.0);
  float soft = mix(${f(CLOUD.softSheet)}, ${f(CLOUD.softPuff)}, uCloudPuff);
  float m = smoothstep(1.0 - cov, 1.0 - cov + soft, n);
  return pow(m, mix(1.0, 1.5, uCloudPuff)) * uCloudDens;
}
float esCloudLow(vec3 d) {
  vec2 uv = d.xz / (d.y * 0.4 + 0.09) * ${f(CLOUD.lowScale)}
          + uCloudDir * (uCloudTime * ${f(CLOUD.lowScroll)} * uCloudScroll);
  float n = esCloudFbm(uv * ${f(CLOUD.lowFreq)} + 11.0);
  float cov = clamp(uCloudCov.x + ${f(CLOUD.lowFrontMul)} * esFrontShift(d), 0.0, 1.0);
  float m = smoothstep(1.0 - cov, 1.0 - cov + 0.3, n);
  return m * uCloudDens * 0.85;
}
float esCloudHigh(vec3 d) {
  vec2 q = d.xz / (d.y + 0.06);
  vec2 perp = vec2(uCloudDir.y, -uCloudDir.x);
  vec2 uv = vec2(dot(q, uCloudDir) * ${f(CLOUD.highAniso)}, dot(q, perp)) * ${f(CLOUD.highScale)};
  uv.x += uCloudTime * ${f(CLOUD.highScroll)} * uCloudScroll;
  float n = esCloudFbm(uv * ${f(CLOUD.highFreq)});
  return smoothstep(1.0 - uCloudCov.z, 1.0 - uCloudCov.z + 0.32, n) * ${f(CLOUD.highAlpha)};
}
float esCloudAlpha(vec3 d) {
  if (d.y <= ${f(CLOUD.horizonLo)}) return 0.0;
  float nMid;
  float a = esCloudHigh(d);
  float am = esCloudMid(d, nMid);
  a += am * (1.0 - a);
  float al = esCloudLow(d);
  a += al * (1.0 - a);
  return a * smoothstep(${f(CLOUD.horizonLo)}, ${f(CLOUD.horizonHi)}, d.y);
}
`;
}

// ---------------------------------------------------------------------------
// CPU twins (KEEP IN LOCKSTEP with the GLSL above)
// ---------------------------------------------------------------------------

function latticeAt(x: number, y: number): number {
  const L = CLOUD.lattice;
  const data = cloudNoiseData();
  const xi = ((Math.floor(x) % L) + L) % L;
  const yi = ((Math.floor(y) % L) + L) % L;
  return data[yi * L + xi];
}

/** Bilinear sample matching `texture2D(uCloudNoise, (p + 0.5) / lattice)`
 * with linear filtering on a repeat-wrapped texture: texel centres sit at
 * integer p, so the fractional part interpolates neighbouring texels. */
function cloudN(px: number, py: number): number {
  const fx = px - Math.floor(px);
  const fy = py - Math.floor(py);
  const n00 = latticeAt(px, py);
  const n10 = latticeAt(px + 1, py);
  const n01 = latticeAt(px, py + 1);
  const n11 = latticeAt(px + 1, py + 1);
  return (n00 * (1 - fx) + n10 * fx) * (1 - fy) + (n01 * (1 - fx) + n11 * fx) * fy;
}

export function cloudFbm(px: number, py: number): number {
  let n = 0;
  for (const [w, fr, ox, oy] of CLOUD.octaves) n += w * cloudN(px * fr + ox, py * fr + oy);
  return n;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const sstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function frontShift(d: [number, number, number], p: CloudParams): number {
  if (p.stormFront <= 0.001) return 0;
  const azLen = Math.hypot(d[0] + 1e-4, d[2]) || 1;
  const front = sstep(
    -0.25,
    0.55,
    ((d[0] + 1e-4) / azLen) * -p.windDir[0] + (d[2] / azLen) * -p.windDir[1],
  );
  return p.stormFront * (CLOUD.frontGain * front - CLOUD.frontThin * (1 - front));
}

function cloudMid(d: [number, number, number], p: CloudParams): number {
  const s = CLOUD.midScale;
  const ux = (d[0] / (d[1] * 0.8 + 0.055)) * s + p.windDir[0] * (p.timeS * CLOUD.midScroll * p.scroll);
  const uy = (d[2] / (d[1] * 0.8 + 0.055)) * s + p.windDir[1] * (p.timeS * CLOUD.midScroll * p.scroll);
  const n =
    (cloudFbm(ux, uy) +
      CLOUD.midDetail * cloudFbm(ux * CLOUD.midDetailScale + 7.7, uy * CLOUD.midDetailScale + 7.7)) /
    (1 + CLOUD.midDetail);
  const cov = clamp01(p.covMid + frontShift(d, p));
  const soft = CLOUD.softSheet + (CLOUD.softPuff - CLOUD.softSheet) * p.puff;
  const m = sstep(1 - cov, 1 - cov + soft, n);
  return Math.pow(m, 1 + 0.5 * p.puff) * p.density;
}

function cloudLow(d: [number, number, number], p: CloudParams): number {
  const s = CLOUD.lowScale;
  const ux = (d[0] / (d[1] * 0.4 + 0.09)) * s + p.windDir[0] * (p.timeS * CLOUD.lowScroll * p.scroll);
  const uy = (d[2] / (d[1] * 0.4 + 0.09)) * s + p.windDir[1] * (p.timeS * CLOUD.lowScroll * p.scroll);
  const n = cloudFbm(ux * CLOUD.lowFreq + 11.0, uy * CLOUD.lowFreq + 11.0);
  const cov = clamp01(p.covLow + CLOUD.lowFrontMul * frontShift(d, p));
  return sstep(1 - cov, 1 - cov + 0.3, n) * p.density * 0.85;
}

function cloudHigh(d: [number, number, number], p: CloudParams): number {
  const qx = d[0] / (d[1] + 0.06);
  const qy = d[2] / (d[1] + 0.06);
  const along = qx * p.windDir[0] + qy * p.windDir[1];
  const across = qx * p.windDir[1] - qy * p.windDir[0];
  let ux = along * CLOUD.highAniso * CLOUD.highScale;
  const uy = across * CLOUD.highScale;
  ux += p.timeS * CLOUD.highScroll * p.scroll;
  const n = cloudFbm(ux * CLOUD.highFreq, uy * CLOUD.highFreq);
  return sstep(1 - p.covHigh, 1 - p.covHigh + 0.32, n) * CLOUD.highAlpha;
}

/** Total premultiplied cloud alpha toward unit direction `d` — the CPU twin
 * of `esCloudAlpha`. Drives sun dimming when a cumulus crosses the sun and
 * per-moon occlusion (moons vanish behind thick cloud, glow through thin). */
export function cloudAlphaTowards(d: [number, number, number], p: CloudParams): number {
  if (d[1] <= CLOUD.horizonLo) return 0;
  if (p.covLow + p.covMid + p.covHigh <= 0.003) return 0;
  let a = cloudHigh(d, p);
  a += cloudMid(d, p) * (1 - a);
  a += cloudLow(d, p) * (1 - a);
  return a * sstep(CLOUD.horizonLo, CLOUD.horizonHi, d[1]);
}

/** Cloud params for the current weather sample + wind. */
export function cloudParamsFrom(
  profile: {
    cloudLow: number;
    cloudMid: number;
    cloudHigh: number;
    cloudDensity: number;
    cloudPuff: number;
    cloudScroll: number;
    stormFront: number;
  },
  windDir: [number, number],
  timeS: number,
): CloudParams {
  return {
    covLow: profile.cloudLow,
    covMid: profile.cloudMid,
    covHigh: profile.cloudHigh,
    density: profile.cloudDensity,
    puff: profile.cloudPuff,
    scroll: profile.cloudScroll,
    stormFront: profile.stormFront,
    windDir,
    timeS,
  };
}
