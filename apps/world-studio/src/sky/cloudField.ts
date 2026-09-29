import * as THREE from "three";
import * as TSL_TYPED from "three/tsl";
import type { TslNode } from "@elder-souls/game-core/render/nodes/materialNodes";
import type { UniformOf } from "./aerial";
// TSL builders typed loosely (standard 0107 §1: chained TSL typings are too deep for tsc).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const {
  clamp,
  dot,
  float,
  mix,
  normalize,
  pow,
  select,
  smoothstep,
  texture,
  uniform,
  vec2
} = TSL_TYPED as unknown as Record<string, any>;

/**
 * The ONE cloud field (Phase 8c round 2, decision 0032): a deterministic
 * 2-3-layer FBM cloud function evaluated identically on the GPU (dome
 * shader, star vertex stage) and the CPU (sun/moon occlusion — the light
 * visibly dims when a cumulus drifts across the sun; the moons vanish
 * behind, and glow through, cloud). Lockstep is guaranteed by construction:
 * both sides sample the SAME seeded lattice (a repeat-wrapped DataTexture on
 * the GPU, the same Float32Array bilinearly on the CPU) and the layer maths
 * is built into the TSL graph from the constants below — change `CLOUD`, both
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
// GPU side (TSL, decision 0107)
// ---------------------------------------------------------------------------

/** One shared uniform node set (every material that builds the field from
 * this object sees each frame's WorldSky `.value` write for free). */
export function createCloudUniforms() {
  return {
    uCloudNoise: texture(cloudNoiseTexture()) as UniformOf<THREE.Texture>,
    uCloudCov: uniform(new THREE.Vector3(0, 0, 0)) as UniformOf<THREE.Vector3>,
    uCloudDens: uniform(0) as UniformOf<number>,
    uCloudPuff: uniform(1) as UniformOf<number>,
    uCloudScroll: uniform(1) as UniformOf<number>,
    uCloudFront: uniform(0) as UniformOf<number>,
    uCloudDir: uniform(new THREE.Vector2(1, 0)) as UniformOf<THREE.Vector2>,
    uCloudTime: uniform(0) as UniformOf<number>,
  };
}
export type CloudUniforms = ReturnType<typeof createCloudUniforms>;

/** The field functions as TSL builders. KEEP IN LOCKSTEP with the CPU twins
 * below — both are written from the same `CLOUD` table. `vertex` samples the
 * lattice at LOD 0 (the star vertex stage has no derivatives). */
export function cloudFieldNodes(u: CloudUniforms, options: { vertex?: boolean } = {}) {
  const esCloudN = (p: TslNode): TslNode => {
    const s = u.uCloudNoise.sample(p.add(0.5).div(CLOUD.lattice));
    return (options.vertex ? s.level(0) : s).r;
  };
  const esCloudFbm = (p: TslNode): TslNode => {
    let n: TslNode = float(0);
    for (const [w, fr, ox, oy] of CLOUD.octaves) {
      n = n.add(esCloudN(p.mul(fr).add(vec2(ox, oy))).mul(w));
    }
    return n;
  };
  // Squall shelf wall: coverage shift by azimuth — piles up on the UPWIND
  // horizon (where the line approaches from), thins downwind so lighter sky
  // shows behind the front. Applied to BOTH the mid deck and the low scud.
  // (The old `if (uCloudFront <= 0.001) return 0` is exact as a select.)
  const esFrontShift = (d: TslNode): TslNode => {
    const az = normalize(d.xz.add(vec2(1e-4, 0)));
    const front = smoothstep(-0.25, 0.55, dot(az, u.uCloudDir.negate()));
    const shift = u.uCloudFront.mul(
      front.mul(CLOUD.frontGain).sub(float(1).sub(front).mul(CLOUD.frontThin)),
    );
    return select(u.uCloudFront.lessThanEqual(0.001), float(0), shift);
  };
  /** Mid deck: `alpha` and the raw noise `n` (the dome shades bases by it). */
  const esCloudMid = (d: TslNode): { alpha: TslNode; n: TslNode } => {
    const uvm = d.xz
      .div(d.y.mul(0.8).add(0.055))
      .mul(CLOUD.midScale)
      .add(u.uCloudDir.mul(u.uCloudTime.mul(CLOUD.midScroll).mul(u.uCloudScroll)))
      .toVar();
    const n = esCloudFbm(uvm)
      .add(esCloudFbm(uvm.mul(CLOUD.midDetailScale).add(7.7)).mul(CLOUD.midDetail))
      .div(1 + CLOUD.midDetail)
      .toVar();
    const cov = clamp(u.uCloudCov.y.add(esFrontShift(d)), 0, 1);
    const soft = mix(CLOUD.softSheet, CLOUD.softPuff, u.uCloudPuff);
    const m = smoothstep(float(1).sub(cov), float(1).sub(cov).add(soft), n);
    return { alpha: pow(m, mix(1.0, 1.5, u.uCloudPuff)).mul(u.uCloudDens), n };
  };
  const esCloudLow = (d: TslNode): TslNode => {
    const uvl = d.xz
      .div(d.y.mul(0.4).add(0.09))
      .mul(CLOUD.lowScale)
      .add(u.uCloudDir.mul(u.uCloudTime.mul(CLOUD.lowScroll).mul(u.uCloudScroll)));
    const n = esCloudFbm(uvl.mul(CLOUD.lowFreq).add(11.0));
    const cov = clamp(u.uCloudCov.x.add(esFrontShift(d).mul(CLOUD.lowFrontMul)), 0, 1);
    const m = smoothstep(float(1).sub(cov), float(1).sub(cov).add(0.3), n);
    return m.mul(u.uCloudDens).mul(0.85);
  };
  const esCloudHigh = (d: TslNode): TslNode => {
    const q = d.xz.div(d.y.add(0.06));
    const perp = vec2(u.uCloudDir.y, u.uCloudDir.x.negate());
    const uvh = vec2(
      dot(q, u.uCloudDir).mul(CLOUD.highAniso).mul(CLOUD.highScale)
        .add(u.uCloudTime.mul(CLOUD.highScroll).mul(u.uCloudScroll)),
      dot(q, perp).mul(CLOUD.highScale),
    );
    const n = esCloudFbm(uvh.mul(CLOUD.highFreq));
    return smoothstep(float(1).sub(u.uCloudCov.z), float(1).sub(u.uCloudCov.z).add(0.32), n)
      .mul(CLOUD.highAlpha);
  };
  /** Total premultiplied alpha toward unit direction `d`. Below
   * `horizonLo` the closing smoothstep is 0, which is the old early return. */
  const esCloudAlpha = (d: TslNode): TslNode => {
    const a = esCloudHigh(d).toVar();
    const am = esCloudMid(d).alpha;
    a.addAssign(am.mul(float(1).sub(a)));
    const al = esCloudLow(d);
    a.addAssign(al.mul(float(1).sub(a)));
    return a.mul(smoothstep(CLOUD.horizonLo, CLOUD.horizonHi, d.y));
  };
  return { esCloudFbm, esFrontShift, esCloudMid, esCloudLow, esCloudHigh, esCloudAlpha };
}

// ---------------------------------------------------------------------------
// CPU twins (KEEP IN LOCKSTEP with the TSL above)
// ---------------------------------------------------------------------------

function latticeAt(x: number, y: number): number {
  const L = CLOUD.lattice;
  const data = cloudNoiseData();
  const xi = ((Math.floor(x) % L) + L) % L;
  const yi = ((Math.floor(y) % L) + L) % L;
  return data[yi * L + xi];
}

/** Bilinear sample matching the GPU lattice sample at `(p + 0.5) / lattice`
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
 * of the TSL `esCloudAlpha`. Drives sun dimming when a cumulus crosses the sun and
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
