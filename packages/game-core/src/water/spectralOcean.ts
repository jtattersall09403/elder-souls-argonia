/** Bounded, deterministic spectral water field. CPU and renderer consume the
 * same interpolated grids: no synchronous GPU height readback for buoyancy.
 * Statistical spectrum / conjugate evolution follows Tessendorf's formulation;
 * this implementation is independent of the reference demos' source code.
 */
export function inverseFFT2D(real: Float64Array, imaginary: Float64Array, size: number): void {
  if (size < 2 || (size & (size - 1)) !== 0 || real.length !== size * size || imaginary.length !== real.length) {
    throw new Error("FFT requires matching square power-of-two arrays");
  }
  const line = (offset: number, stride: number) => {
    for (let i = 1, j = 0; i < size; i++) {
      let bit = size >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        const a = offset + i * stride, b = offset + j * stride;
        const r = real[a], im = imaginary[a];
        real[a] = real[b]; real[b] = r;
        imaginary[a] = imaginary[b]; imaginary[b] = im;
      }
    }
    for (let length = 2; length <= size; length *= 2) {
      const angle = 2 * Math.PI / length, cr = Math.cos(angle), ci = Math.sin(angle);
      for (let start = 0; start < size; start += length) {
        let wr = 1, wi = 0;
        for (let j = 0; j < length / 2; j++) {
          const a = offset + (start + j) * stride, b = a + length / 2 * stride;
          const br = real[b] * wr - imaginary[b] * wi, bi = real[b] * wi + imaginary[b] * wr;
          real[b] = real[a] - br; imaginary[b] = imaginary[a] - bi;
          real[a] += br; imaginary[a] += bi;
          const next = wr * cr - wi * ci;
          wi = wr * ci + wi * cr; wr = next;
        }
      }
    }
  };
  for (let i = 0; i < size; i++) line(i * size, 1);
  for (let i = 0; i < size; i++) line(i, size);
  const scale = 1 / (size * size);
  for (let i = 0; i < real.length; i++) { real[i] *= scale; imaginary[i] *= scale; }
}

export interface SpectralCascadeSpec {
  lengthM: number;
  minimumWavelengthM: number;
  maximumWavelengthM: number;
  rmsHeightM: number;
}

/** Non-overlapping physical wavelength bands prevent counting energy twice. */
export const OCEAN_CASCADES: readonly SpectralCascadeSpec[] = [
  { lengthM: 512, minimumWavelengthM: 32, maximumWavelengthM: 256, rmsHeightM: 0.12 },
  { lengthM: 96, minimumWavelengthM: 4, maximumWavelengthM: 32, rmsHeightM: 0.045 },
  { lengthM: 16, minimumWavelengthM: 0.5, maximumWavelengthM: 4, rmsHeightM: 0.012 },
];

const wrap = (n: number, size: number) => ((n % size) + size) % size;
export interface SpectralSample { height: number; slopeX: number; slopeZ: number }

export class SpectralCascade {
  /** RGBA: height, x/z slopes, reserved. Two temporal endpoints shared with GPU. */
  readonly previous: Float32Array;
  readonly next: Float32Array;
  /** Phase-identical radial low-pass fields for rendering. Level0 remains the
   * authoritative physical grid; levels are true frequency cutoffs, not
   * spatial downsampling that would fold short waves into long aliases. */
  readonly previousLods: readonly Float32Array[];
  readonly nextLods: readonly Float32Array[];
  private readonly lodScratch: { size: number; real: Float64Array; imaginary: Float64Array }[];
  private readonly initialReal: Float64Array;
  private readonly initialImaginary: Float64Array;
  private readonly frequency: Float64Array;
  private readonly real: Float64Array;
  private readonly imaginary: Float64Array;
  private readonly unitX: Float64Array;
  private readonly unitZ: Float64Array;
  private readonly baseDirection: Float64Array;
  private readonly direction: Float64Array;
  private readonly gains: Float64Array;
  private readonly activeModes: Int32Array;
  private readonly referenceEnergy: number;
  directionalUpdates = 0;
  constructor(readonly spec: SpectralCascadeSpec, readonly size = 64, seed = 731) {
    if (!Number.isInteger(size) || size < 8 || size > 256 || (size & (size - 1)) !== 0) throw new Error("Invalid ocean FFT resolution");
    if (!(spec.lengthM > 0 && spec.minimumWavelengthM >= 2 * spec.lengthM / size
      && spec.maximumWavelengthM > spec.minimumWavelengthM && spec.rmsHeightM >= 0)) throw new Error("Invalid ocean cascade band");
    const count = size * size;
    this.previous = new Float32Array(count * 4); this.next = new Float32Array(count * 4);
    const sizes = Array.from({ length: Math.log2(size) - 1 }, (_, level) => size >> level);
    this.previousLods = sizes.map((n, level) => level ? new Float32Array(n * n * 4) : this.previous);
    this.nextLods = sizes.map((n, level) => level ? new Float32Array(n * n * 4) : this.next);
    this.lodScratch = sizes.slice(1).map(n => ({ size: n, real: new Float64Array(n * n), imaginary: new Float64Array(n * n) }));
    this.initialReal = new Float64Array(count); this.initialImaginary = new Float64Array(count);
    this.frequency = new Float64Array(count); this.real = new Float64Array(count); this.imaginary = new Float64Array(count);
    this.unitX = new Float64Array(count); this.unitZ = new Float64Array(count);
    this.baseDirection = new Float64Array(count); this.direction = new Float64Array(count); this.gains = new Float64Array(count).fill(1);
    const active: number[] = [];
    let state = seed >>> 0;
    const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return (state + 0.5) / 4294967296; };
    let variance = 0;
    for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
      const i = z * size + x;
      const kx = 2 * Math.PI * (x < size / 2 ? x : x - size) / spec.lengthM;
      const kz = 2 * Math.PI * (z < size / 2 ? z : z - size) / spec.lengthM;
      const k = Math.hypot(kx, kz), wavelength = 2 * Math.PI / k;
      this.frequency[i] = Math.sqrt(9.81 * k);
      if (!k || wavelength < spec.minimumWavelengthM || wavelength >= spec.maximumWavelengthM) continue;
      // Fetch-limited peak, JONSWAP enhancement and deep-water dispersion.
      // Transform S(omega) to a 2D k-density: dω/dk divided by radial k.
      const omega = this.frequency[i], peak = Math.sqrt(9.81 * 2 * Math.PI / Math.sqrt(spec.minimumWavelengthM * spec.maximumWavelengthM));
      const sigma = omega <= peak ? 0.07 : 0.09;
      const enhancement = Math.pow(3.3, Math.exp(-0.5 * Math.pow((omega - peak) / (sigma * peak), 2)));
      const energy = Math.pow(omega, -5) * Math.exp(-1.25 * Math.pow(peak / omega, 4)) * enhancement * (9.81 / (2 * omega * k));
      const alongWind = (kx * 0.66 - kz * 0.75) / k;
      const direction = 0.04 + Math.pow(Math.max(0, alongWind), 4);
      this.unitX[i] = kx / k; this.unitZ[i] = kz / k;
      this.baseDirection[i] = this.direction[i] = direction;
      active.push(i);
      const radius = Math.sqrt(-2 * Math.log(random()) * energy * direction), phase = 2 * Math.PI * random();
      this.initialReal[i] = radius * Math.cos(phase); this.initialImaginary[i] = radius * Math.sin(phase);
      variance += 2 * radius * radius;
    }
    const scale = variance > 0 ? spec.rmsHeightM * count / Math.sqrt(variance) : 0;
    for (let i = 0; i < count; i++) { this.initialReal[i] *= scale; this.initialImaginary[i] *= scale; }
    this.activeModes = Int32Array.from(active);
    this.referenceEnergy = variance * scale * scale * 0.5;
  }

  /** Relax spectral energy, never phases or sample coordinates. Expected RMS
   * remains fixed; do not renormalise each instantaneous spatial frame (that
   * would pump all waves together whenever unrelated phases interfere). */
  relaxDirection(windX: number, windZ: number, dt: number, responseSeconds: number): void {
    const speed = Math.hypot(windX, windZ);
    if (!(dt > 0) || !Number.isFinite(dt) || !(responseSeconds > 0) || !Number.isFinite(speed) || speed < 0.15) return;
    const x = windX / speed, z = windZ / speed;
    const blend = -Math.expm1(-dt / responseSeconds);
    let energy = 0;
    for (const i of this.activeModes) {
      const projection = Math.max(0, this.unitX[i] * x + this.unitZ[i] * z);
      const target = 0.04 + projection ** 4;
      this.direction[i] += (target - this.direction[i]) * blend;
      const ratio = this.direction[i] / this.baseDirection[i];
      energy += (this.initialReal[i] ** 2 + this.initialImaginary[i] ** 2) * ratio;
      this.gains[i] = Math.sqrt(ratio);
    }
    const normalise = energy > 0 ? Math.sqrt(this.referenceEnergy / energy) : 1;
    for (const i of this.activeModes) this.gains[i] *= normalise;
    this.directionalUpdates++;
  }

  /** Direction of travelling spectral energy, not a rotation of the grid. */
  get directionalEnergy() {
    let x = 0, z = 0, total = 0;
    for (const i of this.activeModes) {
      const energy = (this.initialReal[i] ** 2 + this.initialImaginary[i] ** 2) * this.gains[i] ** 2;
      x += this.unitX[i] * energy; z += this.unitZ[i] * energy; total += energy;
    }
    return { x: total > 0 ? x / total : 0, z: total > 0 ? z / total : 0,
      expectedRmsM: Math.sqrt(total * 2) / (this.size * this.size), activeModes: this.activeModes.length };
  }

  evaluate(timeS: number, output: Float32Array): void {
    const n = this.size;
    for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
      const i = z * n + x, opposite = ((n - z) % n) * n + (n - x) % n;
      const angle = this.frequency[i] * timeS, c = Math.cos(angle), s = Math.sin(angle);
      const ar = this.initialReal[i] * this.gains[i], ai = this.initialImaginary[i] * this.gains[i];
      const br = this.initialReal[opposite] * this.gains[opposite], bi = this.initialImaginary[opposite] * this.gains[opposite];
      // The inverse transform uses +ik·x: exp(-iωt) travels WITH +k.
      this.real[i] = (ar + br) * c + (ai + bi) * s;
      this.imaginary[i] = -(ar - br) * s + (ai - bi) * c;
    }
    const lods = output === this.previous ? this.previousLods : output === this.next ? this.nextLods : null;
    if (lods) for (let level = 1; level < lods.length; level++) {
      const scratch = this.lodScratch[level - 1], m = scratch.size;
      const scale = (m * m) / (n * n);
      for (let z = 0; z < m; z++) for (let x = 0; x < m; x++) {
        const kx = x < m / 2 ? x : x - m, kz = z < m / 2 ? z : z - m;
        const radial = Math.hypot(kx, kz) / (m / 2);
        // Symmetric energy taper cannot rotate phases. ZERO at/above the
        // destination Nyquist radius, including its ambiguous edge modes.
        const t = Math.max(0, Math.min(1, (radial - 0.75) / 0.25));
        const weight = (1 - t * t * (3 - 2 * t)) * scale;
        const from = wrap(kz, n) * n + wrap(kx, n), to = z * m + x;
        scratch.real[to] = this.real[from] * weight;
        scratch.imaginary[to] = this.imaginary[from] * weight;
      }
      inverseFFT2D(scratch.real, scratch.imaginary, m);
      this.publishGrid(scratch.real, m, lods[level]);
    }
    inverseFFT2D(this.real, this.imaginary, n);
    this.publishGrid(this.real, n, output);
  }

  private publishGrid(heights: Float64Array, n: number, output: Float32Array): void {
    const gradient = n / (2 * this.spec.lengthM);
    for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
      const i = z * n + x;
      output[i * 4] = heights[i];
      output[i * 4 + 1] = (heights[z * n + (x + 1) % n] - heights[z * n + (x + n - 1) % n]) * gradient;
      output[i * 4 + 2] = (heights[((z + 1) % n) * n + x] - heights[((z + n - 1) % n) * n + x]) * gradient;
    }
  }

  sample(x: number, z: number, alpha: number, out: SpectralSample): void {
    const fx = wrap(x / this.spec.lengthM * this.size, this.size), fz = wrap(z / this.spec.lengthM * this.size, this.size);
    const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
    const a = (iz * this.size + ix) * 4;
    const b = (iz * this.size + (ix + 1) % this.size) * 4;
    const c = (((iz + 1) % this.size) * this.size + ix) * 4;
    const d = (((iz + 1) % this.size) * this.size + (ix + 1) % this.size) * 4;
    const wa = (1 - tx) * (1 - tz), wb = tx * (1 - tz), wc = (1 - tx) * tz, wd = tx * tz;
    for (let channel = 0; channel < 3; channel++) {
      const before = this.previous[a + channel] * wa + this.previous[b + channel] * wb
        + this.previous[c + channel] * wc + this.previous[d + channel] * wd;
      const after = this.next[a + channel] * wa + this.next[b + channel] * wb
        + this.next[c + channel] * wc + this.next[d + channel] * wd;
      const value = before * (1 - alpha) + after * alpha;
      if (channel === 0) out.height += value;
      else if (channel === 1) out.slopeX += value;
      else out.slopeZ += value;
    }
  }

  /** Diagnostic/render twin. Never used to camera-dependently alter physics. */
  sampleFiltered(x: number, z: number, alpha: number, footprintM: number, out: SpectralSample): void {
    const lod = Math.max(0, Math.log2(Math.max(1, 2 * footprintM * this.size / this.spec.lengthM)));
    const first = Math.floor(lod), blend = lod - first;
    for (let level = first; level <= first + 1; level++) {
      const weight = level === first ? 1 - blend : blend;
      if (!weight || level >= this.previousLods.length) continue;
      const n = this.size >> level, previous = this.previousLods[level], next = this.nextLods[level];
      const gx = wrap(x / this.spec.lengthM * n, n), gz = wrap(z / this.spec.lengthM * n, n);
      const ix = Math.floor(gx), iz = Math.floor(gz), tx = gx - ix, tz = gz - iz;
      for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 2; dx++) {
        const i = (((iz + dz) % n) * n + (ix + dx) % n) * 4;
        const w = weight * (dx ? tx : 1 - tx) * (dz ? tz : 1 - tz);
        out.height += (previous[i] * (1 - alpha) + next[i] * alpha) * w;
        out.slopeX += (previous[i + 1] * (1 - alpha) + next[i + 1] * alpha) * w;
        out.slopeZ += (previous[i + 2] * (1 - alpha) + next[i + 2] * alpha) * w;
      }
    }
  }

  /** Exact L-infinity bound between these two bilinear grids at this alpha:
   * all coarse grids align to native vertices, so extrema of their difference
   * on every finest cell occur at its corners. No per-frame diagnostic scan. */
  filterErrorBound(footprintM: number, alpha: number): number {
    let maximum = 0;
    const raw = { height: 0, slopeX: 0, slopeZ: 0 }, filtered = { ...raw };
    for (let z = 0; z < this.size; z++) for (let x = 0; x < this.size; x++) {
      raw.height = raw.slopeX = raw.slopeZ = filtered.height = filtered.slopeX = filtered.slopeZ = 0;
      this.sample(x * this.spec.lengthM / this.size, z * this.spec.lengthM / this.size, alpha, raw);
      this.sampleFiltered(x * this.spec.lengthM / this.size, z * this.spec.lengthM / this.size, alpha, footprintM, filtered);
      maximum = Math.max(maximum, Math.abs(raw.height - filtered.height));
    }
    return maximum;
  }
}

export class SpectralOcean {
  readonly cascades = OCEAN_CASCADES.map((spec, i) => new SpectralCascade(spec, 64, 731 + i * 1907));
  readonly stepSeconds = 1 / 15;
  frame = NaN;
  alpha = 0;
  revision = 0;
  private windX = 0;
  private windZ = 0;
  /** Update the target only. Existing temporal endpoints remain immutable. */
  setWindVelocity(wind: { x: number; z: number }): void {
    if (!Number.isFinite(wind.x) || !Number.isFinite(wind.z)) return;
    this.windX = wind.x; this.windZ = wind.z;
  }
  /** Called only while an ocean view or physical consumer needs waves.
   * A teleport/time scrub evaluates two endpoints, never a catch-up backlog. */
  update(timeS: number): void {
    if (!Number.isFinite(timeS)) return;
    const frame = Math.floor(timeS / this.stepSeconds);
    if (frame !== this.frame) {
      const elapsed = Number.isFinite(this.frame) ? Math.max(0, (frame - this.frame) * this.stepSeconds) : 0;
      for (let index = 0; index < this.cascades.length; index++) {
        const cascade = this.cascades[index];
        const response = index === 1 ? 30 : 8;
        // The last gains belong to the previously computed NEXT endpoint.
        // On a skipped frame, advance them analytically to the new previous
        // endpoint before evaluating it. Otherwise low FPS uses stale seas
        // for one endpoint and squeezes the entire wind change into 1/15 s.
        const beforePrevious = Math.max(0, elapsed - this.stepSeconds);
        if (frame === this.frame + 1) cascade.previousLods.forEach((field, level) => field.set(cascade.nextLods[level]));
        else {
          if (index > 0) cascade.relaxDirection(this.windX, this.windZ, beforePrevious, response);
          cascade.evaluate(frame * this.stepSeconds, cascade.previous);
        }
        // Swell retains its prevailing long-fetch direction. Shorter local
        // seas respond at distinct rates with at most two per-mode passes,
        // including after a long pause or explicit time scrub.
        if (index > 0) cascade.relaxDirection(this.windX, this.windZ, elapsed - beforePrevious, response);
        cascade.evaluate((frame + 1) * this.stepSeconds, cascade.next);
      }
      this.frame = frame; this.revision++;
    }
    this.alpha = Math.max(0, Math.min(1, timeS / this.stepSeconds - frame));
  }
  sample(x: number, z: number, out: SpectralSample = { height: 0, slopeX: 0, slopeZ: 0 }): SpectralSample {
    out.height = 0; out.slopeX = 0; out.slopeZ = 0;
    for (const cascade of this.cascades) cascade.sample(x, z, this.alpha, out);
    return out;
  }
}
