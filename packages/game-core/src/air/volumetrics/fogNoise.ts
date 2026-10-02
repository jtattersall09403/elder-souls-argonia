/**
 * The fog's own noise and its clock (vol10 fix design part A, tooling/.reports/16k/walk10/vol-fix-design.md):
 * - two periodic 3-D textures baked once on the CPU (`bakeFogShape`, `bakeFogWarp`);
 * - `FogDrift`, the per-instance state that moves the field: wind advection integrated per frame in
 *   double precision (never wind x time), a slow two-slice morph at sqrt(2)-ratio rates under a
 *   speed modulator re-phased per day, and the eased coverage per regime;
 * - `fogShapeNoise`, the CPU mirror of the shader's octave sum (froxelGrid density()), for tests.
 * Four octaves on prime tiles 997/263/71/19 m, each rotated by the golden angle, drift at 1.00-1.25 x
 * the wind, warped by 50 m and 12 m (no curl, no rotation in time: banks bend, never spiral).
 * Everything is sampled at world position only: nothing here reads the camera or the player.
 */

/** One octave of the fog shape: world tile (one texture period) in xz and y, weight, drift rate vs wind. */
export interface FogOctave { tileXZ: number; tileY: number; weight: number; rate: number }
/** What a band spends on the fog shape (froxel fetches): octaves summed and warp layers. */
export interface FogBandNoise { octaves: 2 | 3 | 4; warps: 1 | 2; shapeTexels: 64 | 128 }

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // 137.5 deg

export const FOG_NOISE = {
  /** Gradient-noise lattice cells per texture period (feature = tile / 8). */
  shapePeriod: 8,
  warpTexels: 32,
  warpPeriod: 4,
  octaves: [
    { tileXZ: 997, tileY: 211, weight: 0.45, rate: 1.0 },
    { tileXZ: 263, tileY: 67, weight: 0.3, rate: 1.07 },
    { tileXZ: 71, tileY: 23, weight: 0.17, rate: 1.15 },
    { tileXZ: 19, tileY: 7, weight: 0.08, rate: 1.25 },
  ] as readonly FogOctave[],
  /** Octave k's axes are turned about Y by k x this, so no two lattices align. */
  rotationRad: GOLDEN_ANGLE,
  /** Domain warp: world tile and amplitude (m) per layer; it drifts at `warpRate` x the wind. */
  warp: [{ tileM: 1777, ampM: 50 }, { tileM: 433, ampM: 12 }] as readonly { tileM: number; ampM: number }[],
  warpRate: 0.7,
  /** The 4th octave fades to its mean between these view distances (m): near froxels only. */
  fineFadeM: [60, 120] as const,
  /** Stretch of the octave sum about its mean 0.5 before the burn-off threshold. */
  contrast: 2.6,
  morph: {
    /** Two slices advance at these rates (texture periods / s); B/A = sqrt(2). */
    rateA: 0.0011, rateB: 0.0011 * Math.SQRT2,
    /** The crossfade between them, period at modulator 1 (s). */
    fadePeriodS: 389,
    /** Speed modulator m(t) = 1 + 0.5 sum a_i sin(2 pi t / P_i + phase_i(day)), 0.5..1.5. */
    modPeriodsS: [431, 797, 1531] as const, modAmps: [0.5, 0.3, 0.2] as const,
  },
  coverage: {
    /** Eased toward its target with this time constant (s). */
    tauS: 180,
    /** Sun elevation (deg) over which the sun burns the mist off. */
    sunBurnDeg: [4, 25] as const,
    /** Slow day-to-day patchiness: CPU sines (minutes) with a per-day phase. */
    slowPeriodsMin: [7.3, 13.1, 23.9] as const,
    /** Share of coverage the spatial (warp a) and slow terms move: C_p = clamp(C (1 + s ((a - 0.5) + (slow - 0.5)))), s = this. */
    spatialShare: 0.5,
    /** A jump of the game clock larger than this (minutes) between frames is a scrub: coverage snaps. */
    snapMin: 30,
  },
  /** Steam wisps (over water) and their finer wisp layer: world tile (m) and drift vs wind / rise (m/s). */
  steam: { tile: [4.4, 6, 4.4] as const, windRate: 0.8, riseMS: 0.35 },
  wisp: { tile: [2.6, 4.4, 2.6] as const, windRate: 1.2, riseMS: 0.525 },
  /** Per-band spend (VOLUMETRIC_BANDS carries the low/medium/high rows; mobile is the 64^3 tier). */
  bands: {
    low: { octaves: 2, warps: 1, shapeTexels: 128 },
    medium: { octaves: 3, warps: 1, shapeTexels: 128 },
    high: { octaves: 4, warps: 2, shapeTexels: 128 },
    mobile: { octaves: 2, warps: 1, shapeTexels: 64 },
  } as Record<"low" | "medium" | "high" | "mobile", FogBandNoise>,
  /** rgba8 3-D memory: shape 128^3 = 8 MiB (64^3 = 1 MiB), warp 32^3 = 128 KiB. */
  textureBytes: (shapeTexels: number) => shapeTexels ** 3 * 4 + 32 ** 3 * 4,
} as const;

/** Stored noise value v in 0..1 = 0.5 + 0.5 n / NOISE_NORM. */
const NOISE_NORM = 0.6;

function hash32(a: number, b: number, c: number, salt: number): number {
  let h = Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(c, 83492791) ^ Math.imul(salt, 2654435761 | 0);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  h ^= h >>> 15;
  return h >>> 0;
}

/**
 * Fill channel `ch` of an rgba8 `n`^3 texture with periodic gradient noise of lattice period `period`
 * (repeat-wrapped, quintic fade). `billow`: 1 - |n| (the eroded mist top) instead of n.
 */
function bakeChannel(out: Uint8Array, n: number, period: number, ch: number, salt: number, billow: boolean): void {
  const P = period;
  const grad = new Float32Array(P * P * P * 3);
  for (let z = 0; z < P; z++) for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
    const h = hash32(x, y, z, salt);
    const a = ((h & 4095) / 4096) * Math.PI * 2;
    const c = (((h >>> 12) & 4095) / 4096) * 2 - 1;
    const r = Math.sqrt(1 - c * c);
    const o = ((z * P + y) * P + x) * 3;
    grad[o] = Math.cos(a) * r; grad[o + 1] = Math.sin(a) * r; grad[o + 2] = c;
  }
  const cell = new Int32Array(n), fr = new Float32Array(n), fd = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const q = ((i + 0.5) / n) * P;
    cell[i] = Math.floor(q); fr[i] = q - cell[i];
    const t = fr[i]; fd[i] = t * t * t * (t * (t * 6 - 15) + 10);
  }
  const g = (ix: number, iy: number, iz: number, dx: number, dy: number, dz: number) => {
    const o = ((((iz % P) * P) + (iy % P)) * P + (ix % P)) * 3;
    return grad[o] * dx + grad[o + 1] * dy + grad[o + 2] * dz;
  };
  let o = ch;
  for (let z = 0; z < n; z++) {
    const zi = cell[z], fz = fr[z], w = fd[z];
    for (let y = 0; y < n; y++) {
      const yi = cell[y], fy = fr[y], v = fd[y];
      for (let x = 0; x < n; x++, o += 4) {
        const xi = cell[x], fx = fr[x], u = fd[x];
        const a0 = g(xi, yi, zi, fx, fy, fz), a1 = g(xi + 1, yi, zi, fx - 1, fy, fz);
        const b0 = g(xi, yi + 1, zi, fx, fy - 1, fz), b1 = g(xi + 1, yi + 1, zi, fx - 1, fy - 1, fz);
        const c0 = g(xi, yi, zi + 1, fx, fy, fz - 1), c1 = g(xi + 1, yi, zi + 1, fx - 1, fy, fz - 1);
        const d0 = g(xi, yi + 1, zi + 1, fx, fy - 1, fz - 1), d1 = g(xi + 1, yi + 1, zi + 1, fx - 1, fy - 1, fz - 1);
        const ab = a0 + (a1 - a0) * u + ((b0 + (b1 - b0) * u) - (a0 + (a1 - a0) * u)) * v;
        const cd = c0 + (c1 - c0) * u + ((d0 + (d1 - d0) * u) - (c0 + (c1 - c0) * u)) * v;
        const nv = ab + (cd - ab) * w;
        const s = billow ? 1 - 2 * Math.min(1, Math.abs(nv) / NOISE_NORM) : nv / NOISE_NORM;
        out[o] = Math.round(255 * Math.min(1, Math.max(0, 0.5 + 0.5 * s)));
      }
    }
  }
}

/** fogShape: rgb three independent noises (r, g the morph pair; b octaves 3-4, steam), a billow
 * (eroded tops, wisps). rgba8, `n`^3 texels, lattice period `FOG_NOISE.shapePeriod`. */
export function bakeFogShape(n: number): Uint8Array {
  const out = new Uint8Array(n * n * n * 4);
  for (let ch = 0; ch < 4; ch++) bakeChannel(out, n, FOG_NOISE.shapePeriod, ch, 0x0f0 + ch, ch === 3);
  return out;
}

/** fogWarp: rgb the warp vector, a the slow spatial coverage noise. rgba8 32^3, lattice period 4. */
export function bakeFogWarp(): Uint8Array {
  const n = FOG_NOISE.warpTexels;
  const out = new Uint8Array(n * n * n * 4);
  for (let ch = 0; ch < 4; ch++) bakeChannel(out, n, FOG_NOISE.warpPeriod, ch, 0x1f0 + ch, false);
  return out;
}

const frac = (v: number) => v - Math.floor(v);

/** Trilinear, repeat-wrapped read of channel `ch` of an rgba8 `n`^3 texture at uvw (texture units), 0..1:
 * the CPU twin of a linear-filtered texture3D fetch. */
export function sampleTexture3(tex: Uint8Array, n: number, u: number, v: number, w: number, ch: number): number {
  const x = frac(u) * n - 0.5, y = frac(v) * n - 0.5, z = frac(w) * n - 0.5;
  const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
  const fx = x - x0, fy = y - y0, fz = z - z0;
  const m = (i: number) => ((i % n) + n) % n;
  const at = (i: number, j: number, k: number) => tex[((m(k) * n + m(j)) * n + m(i)) * 4 + ch];
  const l = (a: number, b: number, t: number) => a + (b - a) * t;
  const c00 = l(at(x0, y0, z0), at(x0 + 1, y0, z0), fx), c10 = l(at(x0, y0 + 1, z0), at(x0 + 1, y0 + 1, z0), fx);
  const c01 = l(at(x0, y0, z0 + 1), at(x0 + 1, y0, z0 + 1), fx), c11 = l(at(x0, y0 + 1, z0 + 1), at(x0 + 1, y0 + 1, z0 + 1), fx);
  return l(l(c00, c10, fy), l(c01, c11, fy), fz) / 255;
}

/** Hash of a day index to 0..1 phases (std 6: from a stable input, no Math.random). */
function dayPhase(day: number, i: number): number {
  return (hash32(day | 0, i, 0x5eed, 0x3a7) & 0xffffff) / 0x1000000;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The share of fog the sun has burnt off at `sunElevationDeg` (0 at 4 deg and below, 1 at 25 and above). */
export function sunBurn(sunElevationDeg: number): number {
  return smooth(FOG_NOISE.coverage.sunBurnDeg[0], FOG_NOISE.coverage.sunBurnDeg[1], sunElevationDeg);
}

/** Burn-off: density share of a point with shape noise `n` (0..1) under coverage `c` (0..1). Thin parts
 * (low n) cross the threshold 1 - c first, so fog shrinks from its edges and leaves isolated banks. */
export function burnOff(n: number, c: number): number {
  return Math.max(0, n - (1 - c)) / Math.max(c, 0.05);
}

/** Regimes eased by FogDrift, in this order (froxelGrid's `cover` uniform: x mist, y steam, z marsh, w sea). */
export const COVER_REGIMES = ["radiationMist", "steamFog", "marshFog", "seaFog", "canopyHaze"] as const;

/**
 * The clock of the fog field, one per Volumetrics (no module state). `step` advances it by real seconds;
 * the outputs are the per-frame uniforms, all in 0..1 texture units (no time and no unbounded offset is
 * ever uploaded to float32).
 */
export class FogDrift {
  /** Accumulated real seconds (double; never folded). */
  t = 0;
  /** World advection offset (m) per octave, x,z interleaved, and per warp layer; steam and wisp x,y,z. */
  readonly octaveO = new Float64Array(8);
  readonly warpO = new Float64Array(4);
  readonly steamO = new Float64Array(3);
  readonly wispO = new Float64Array(3);
  phiA = 0; phiB = 0; fadePhase = 0;
  private day = 0;
  private readonly modPhase = new Float64Array(3);
  private readonly slowPhase = new Float64Array(3);
  /** Coverage per COVER_REGIMES, eased (tau FOG_NOISE.coverage.tauS). */
  readonly cover = new Float64Array(5);
  private covered = false;
  private lastMinute = Number.NaN;
  // ---- uploads (0..1 texture units) ----
  /** Per octave: fract(R_k O_k / L_k), x,y,z (y 0). */
  readonly octaveOff = new Float32Array(12);
  readonly warpOff = new Float32Array(6);
  readonly steamOff = new Float32Array(3);
  readonly wispOff = new Float32Array(3);
  wfade = 0.5;
  /** Slow day-to-day patchiness, 0..1. */
  slow = 0.5;

  constructor(dayIndex = 0) { this.setDay(dayIndex); this.writeUploads(); }

  private setDay(day: number): void {
    this.day = day;
    for (let i = 0; i < 3; i++) { this.modPhase[i] = dayPhase(day, i) * Math.PI * 2; this.slowPhase[i] = dayPhase(day, 10 + i) * Math.PI * 2; }
  }

  /** Speed modulator m(t), 0.5..1.5. */
  modulator(t = this.t): number {
    const { modPeriodsS: P, modAmps: A } = FOG_NOISE.morph;
    let s = 0;
    for (let i = 0; i < 3; i++) s += A[i] * Math.sin((2 * Math.PI * t) / P[i] + this.modPhase[i]);
    return 1 + 0.5 * s;
  }

  /**
   * Advance by `deltaS` real seconds under wind `windX, windZ` (m/s, already floored by fogRegimes).
   * `dayIndex` re-phases the modulator and the slow noise each game day.
   */
  step(deltaS: number, windX: number, windZ: number, dayIndex = this.day): void {
    if (dayIndex !== this.day) this.setDay(dayIndex);
    const dt = Math.max(0, deltaS);
    this.t += dt;
    const oct = FOG_NOISE.octaves;
    for (let k = 0; k < 4; k++) {
      this.octaveO[2 * k] += windX * oct[k].rate * dt;
      this.octaveO[2 * k + 1] += windZ * oct[k].rate * dt;
    }
    for (let k = 0; k < 2; k++) {
      this.warpO[2 * k] += windX * FOG_NOISE.warpRate * dt;
      this.warpO[2 * k + 1] += windZ * FOG_NOISE.warpRate * dt;
    }
    const { steam, wisp } = FOG_NOISE;
    this.steamO[0] += windX * steam.windRate * dt; this.steamO[1] += steam.riseMS * dt; this.steamO[2] += windZ * steam.windRate * dt;
    this.wispO[0] += windX * wisp.windRate * dt; this.wispO[1] += wisp.riseMS * dt; this.wispO[2] += windZ * wisp.windRate * dt;
    const m = this.modulator();
    const mo = FOG_NOISE.morph;
    this.phiA = frac(this.phiA + mo.rateA * m * dt);
    this.phiB = frac(this.phiB + mo.rateB * m * dt);
    this.fadePhase = frac(this.fadePhase + (m * dt) / mo.fadePeriodS);
    this.writeUploads();
  }

  /** Ease the coverage toward `target` (COVER_REGIMES order) over `deltaS`; snaps on the first call or
   * when the game minute jumps by more than `FOG_NOISE.coverage.snapMin` (a scrub or a ?t= instant). */
  ease(target: ArrayLike<number>, deltaS: number, minuteOfDay: number): void {
    let jump = Math.abs(minuteOfDay - this.lastMinute);
    jump = Math.min(jump, 1440 - jump);
    const snap = !this.covered || !(jump <= FOG_NOISE.coverage.snapMin);
    const k = snap ? 1 : 1 - Math.exp(-Math.max(0, deltaS) / FOG_NOISE.coverage.tauS);
    for (let i = 0; i < 5; i++) this.cover[i] += (target[i] - this.cover[i]) * k;
    this.covered = true;
    this.lastMinute = minuteOfDay;
  }

  private writeUploads(): void {
    const oct = FOG_NOISE.octaves;
    for (let k = 0; k < 4; k++) {
      const c = Math.cos(k * FOG_NOISE.rotationRad), s = Math.sin(k * FOG_NOISE.rotationRad);
      const ox = this.octaveO[2 * k], oz = this.octaveO[2 * k + 1];
      this.octaveOff[3 * k] = frac((c * ox - s * oz) / oct[k].tileXZ);
      this.octaveOff[3 * k + 1] = 0;
      this.octaveOff[3 * k + 2] = frac((s * ox + c * oz) / oct[k].tileXZ);
    }
    for (let k = 0; k < 2; k++) {
      const a = (k + 0.5) * FOG_NOISE.rotationRad, c = Math.cos(a), s = Math.sin(a);
      const ox = this.warpO[2 * k], oz = this.warpO[2 * k + 1];
      this.warpOff[3 * k] = frac((c * ox - s * oz) / FOG_NOISE.warp[k].tileM);
      this.warpOff[3 * k + 1] = 0;
      this.warpOff[3 * k + 2] = frac((s * ox + c * oz) / FOG_NOISE.warp[k].tileM);
    }
    for (let i = 0; i < 3; i++) {
      this.steamOff[i] = frac(this.steamO[i] / FOG_NOISE.steam.tile[i]);
      this.wispOff[i] = frac(this.wispO[i] / FOG_NOISE.wisp.tile[i]);
    }
    this.wfade = 0.5 + 0.5 * Math.sin(2 * Math.PI * this.fadePhase);
    const P = FOG_NOISE.coverage.slowPeriodsMin;
    let s = 0;
    for (let i = 0; i < 3; i++) s += Math.sin((2 * Math.PI * this.t) / (P[i] * 60) + this.slowPhase[i]) / 3;
    this.slow = 0.5 + 0.5 * s;
  }
}

/** Textures and spend the CPU mirror reads. */
export interface FogNoiseTextures { shape: Uint8Array; shapeTexels: number; warp: Uint8Array }

/**
 * CPU mirror of froxelGrid's fog shape at world (x, y, z): warp, the band's octave sum, contrast, 0..1;
 * `fine` is the 4th octave's near weight (1 at the camera, 0 beyond FOG_NOISE.fineFadeM; the shader's
 * only view-tied term, a level of detail fading to the octave's mean). Returns the spatial coverage
 * noise (warp a) in `outA[0]` when given.
 */
export function fogShapeNoise(tex: FogNoiseTextures, d: FogDrift, band: FogBandNoise, x: number, y: number, z: number,
  fine = 1, outA?: Float64Array): number {
  let qx = x, qy = y, qz = z;
  const nw = FOG_NOISE.warpTexels;
  for (let k = 0; k < band.warps; k++) {
    const a = (k + 0.5) * FOG_NOISE.rotationRad, c = Math.cos(a), s = Math.sin(a), L = FOG_NOISE.warp[k].tileM;
    const u = (c * x - s * z) / L - d.warpOff[3 * k], v = y / L, w = (s * x + c * z) / L - d.warpOff[3 * k + 2];
    const amp = 2 * FOG_NOISE.warp[k].ampM;
    qx += (sampleTexture3(tex.warp, nw, u, v, w, 0) - 0.5) * amp;
    qy += (sampleTexture3(tex.warp, nw, u, v, w, 1) - 0.5) * amp;
    qz += (sampleTexture3(tex.warp, nw, u, v, w, 2) - 0.5) * amp;
    if (k === 0 && outA) outA[0] = sampleTexture3(tex.warp, nw, u, v, w, 3);
  }
  const n = tex.shapeTexels;
  let sum = 0, wsum = 0;
  for (let k = 0; k < band.octaves; k++) {
    const o = FOG_NOISE.octaves[k];
    const c = Math.cos(k * FOG_NOISE.rotationRad), s = Math.sin(k * FOG_NOISE.rotationRad);
    const u = (c * qx - s * qz) / o.tileXZ - d.octaveOff[3 * k], v = qy / o.tileY, w = (s * qx + c * qz) / o.tileXZ - d.octaveOff[3 * k + 2];
    let sv: number;
    if (k < 2) {
      const sA = sampleTexture3(tex.shape, n, u + d.phiA, v, w, 0);
      const sB = sampleTexture3(tex.shape, n, u, v + d.phiB, w, 1);
      sv = sA + (sB - sA) * d.wfade;
    } else {
      sv = sampleTexture3(tex.shape, n, u, v, w, 2);
      if (k === 3) sv = 0.5 + (sv - 0.5) * fine;
    }
    sum += o.weight * sv; wsum += o.weight;
  }
  return Math.min(1, Math.max(0, 0.5 + (sum / wsum - 0.5) * FOG_NOISE.contrast));
}
