/** Bounded, world-anchored small-amplitude pool solver. Linear shallow-water
 * fluxes: q_t = -g H grad(eta), eta_t = -div(q). A face transfers exactly
 * opposite volumes to its neighbours; dry/foreign faces transfer none.
 * This is not a breaking-wave, flooding or province-wide fluid simulation.
 * Numerical references: https://www.clawpack.org/riemann_book/html/Shallow_water.html
 * https://hplgit.github.io/fdm-book/doc/pub/wave/html/._wave-solarized004.html
 */
export interface LocalWaterPatchDomain {
  originX: number;
  originZ: number;
  bodyId: string;
  baseHeightM: number;
  /** Cell-centre bed heights in metres; arrays are copied on initialization. */
  groundHeights: ArrayLike<number>;
  /** Zero means another owner or disconnected dry fringe. Omitted = own body. */
  ownerMask?: ArrayLike<number>;
}
export interface LocalWaterPatchOptions extends LocalWaterPatchDomain {
  size: number;
  cellSizeM: number;
  dampingRate?: number;
  gravity?: number;
  densityKgM3?: number;
  maxCatchupS?: number;
  maxSubsteps?: number;
  maxSpheres?: number;
}
export interface LocalWaterSphere { x: number; y: number; z: number; radiusM: number }
export interface LocalWaterPatchStep { steps: number; simulatedS: number; droppedS: number; revision: number }
export interface LocalWaterPatchSample { height: number; slopeX: number; slopeZ: number; foam: number }

const MIN_DEPTH_M = 0.01;
const POLAR_RINGS = 12, POLAR_ANGLES = 32;
const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value));

/** Exact squared Euclidean distance to dry/foreign cell centres in O(n²).
 * Artificial rectangular boundaries are handled separately by the shared
 * presentation envelope, not falsely treated as physical shores here. */
function shoreWeights(mask: Uint8Array, n: number, spacing: number): Float32Array {
  const distance = new Float64Array(mask.length), result = new Float32Array(mask.length);
  if (mask.every(value => value === 1)) { result.fill(1); return result; }
  const f = new Float64Array(n), out = new Float64Array(n), sites = new Int32Array(n), cuts = new Float64Array(n + 1);
  const far = n * n * 4;
  for (let i = 0; i < mask.length; i++) distance[i] = mask[i] ? far : 0;
  const transform = () => {
    let k = 0; sites[0] = 0; cuts[0] = -Infinity; cuts[1] = Infinity;
    for (let q = 1; q < n; q++) {
      let s = ((f[q] + q * q) - (f[sites[k]] + sites[k] * sites[k])) / (2 * (q - sites[k]));
      while (s <= cuts[k]) { k--; s = ((f[q] + q * q) - (f[sites[k]] + sites[k] * sites[k])) / (2 * (q - sites[k])); }
      sites[++k] = q; cuts[k] = s; cuts[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < n; q++) { while (cuts[k + 1] < q) k++; out[q] = (q - sites[k]) ** 2 + f[sites[k]]; }
  };
  for (let z = 0; z < n; z++) { for (let x = 0; x < n; x++) f[x] = distance[z * n + x]; transform(); for (let x = 0; x < n; x++) distance[z * n + x] = out[x]; }
  for (let x = 0; x < n; x++) { for (let z = 0; z < n; z++) f[z] = distance[z * n + x]; transform(); for (let z = 0; z < n; z++) distance[z * n + x] = out[z]; }
  const collar = Math.SQRT2 * spacing, width = Math.max(1, spacing * 4);
  for (let i = 0; i < mask.length; i++) {
    const t = clamp((Math.sqrt(distance[i]) * spacing - collar) / width, 0, 1);
    result[i] = mask[i] ? t * t * (3 - 2 * t) : 0;
  }
  return result;
}

export class LocalWaterPatch {
  readonly size: number;
  readonly cellSizeM: number;
  /** Reused shore-safe DISPLAY RGBA: height offset, X/Z slopes, foam. This
   * deliberately bounded presentation is not the conserved raw volume field. */
  readonly fields: Float32Array;
  /** Reused cell-centre mask for GPU binding; 1 is owned wet bed, 0 is dry. */
  readonly wetMask: Uint8Array;
  readonly diagnostics = { droppedTimeS: 0, rejectedSphereAdmissions: 0, rejectedImpulses: 0, steps: 0 };
  private readonly height: Float64Array;
  private readonly depth: Float64Array;
  private readonly ground: Float64Array;
  private readonly fluxX: Float64Array;
  private readonly fluxZ: Float64Array;
  private readonly faceX: Float64Array;
  private readonly faceZ: Float64Array;
  private readonly component: Int32Array;
  private readonly foam: Float64Array;
  private readonly scratch: Float64Array;
  private readonly shoreWeight: Float32Array;
  private readonly spheres = new Map<string, { columns: Float64Array; volumeM3: number }>();
  private readonly damping: number;
  private readonly gravity: number;
  private readonly density: number;
  private readonly maxCatchup: number;
  private readonly maxSteps: number;
  private readonly maxSpheres: number;
  private accumulator = 0;
  private _active = true;
  private _bodyId = '';
  private _originX = 0;
  private _originZ = 0;
  private _baseHeight = 0;
  private _minimumSafeBaseHeight = -Infinity;
  private _stepS = 1 / 120;
  private _revision = 0;
  private displacementBatchDepth = 0;
  private displacementDirty = false;
  private baselineVolume = 0;
  private disturbed = false;

  constructor(options: LocalWaterPatchOptions) {
    if (!Number.isInteger(options.size) || options.size < 3 || options.size > 128
      || !Number.isFinite(options.cellSizeM) || options.cellSizeM <= 0) throw new RangeError('Local water grid requires 3..128 cells and positive spacing');
    this.size = options.size; this.cellSizeM = options.cellSizeM;
    this.damping = options.dampingRate ?? 1.2; this.gravity = options.gravity ?? 9.81;
    this.density = options.densityKgM3 ?? 1000; this.maxCatchup = options.maxCatchupS ?? 0.1;
    this.maxSteps = options.maxSubsteps ?? 24; this.maxSpheres = options.maxSpheres ?? 16;
    if (![this.damping, this.gravity, this.density, this.maxCatchup].every(Number.isFinite)
      || this.damping < 0 || this.gravity <= 0 || this.density <= 0 || this.maxCatchup <= 0 || this.maxCatchup > 0.25
      || !Number.isInteger(this.maxSteps) || this.maxSteps < 1 || this.maxSteps > 64
      || !Number.isInteger(this.maxSpheres) || this.maxSpheres < 1 || this.maxSpheres > 32) throw new RangeError('Invalid local water solver budget or physics');
    const count = this.size ** 2;
    this.fields = new Float32Array(count * 4);
    this.wetMask = new Uint8Array(count);
    this.height = new Float64Array(count); this.depth = new Float64Array(count); this.ground = new Float64Array(count);
    this.fluxX = new Float64Array(count); this.fluxZ = new Float64Array(count);
    this.faceX = new Float64Array(count); this.faceZ = new Float64Array(count);
    this.component = new Int32Array(count); this.foam = new Float64Array(count); this.scratch = new Float64Array(count);
    this.shoreWeight = new Float32Array(count);
    this.initialize(options);
  }

  get bodyId() { return this._bodyId; }
  get originX() { return this._originX; }
  get originZ() { return this._originZ; }
  get baseHeightM() { return this._baseHeight; }
  /** Below this level at least one admitted wet cell loses solver support.
   * Consumers must suspend/rebuild BEFORE stepping, not wait for an arbitrary
   * centimetre-wide visual retarget threshold. Uniform standing-owner stage. */
  get minimumSafeBaseHeightM() { return this._minimumSafeBaseHeight; }
  get active() { return this._active; }
  get fixedStepS() { return this._stepS; }
  get revision() { return this._revision; }
  get trackedSphereCount() { return this.spheres.size; }
  get sphereCapacity() { return this.maxSpheres; }

  /** Explicit retargeting resets all body history; camera movement alone must
   * not recenter an active patch. Origin is the lower-left outer cell edge. */
  initialize(domain: LocalWaterPatchDomain): void {
    if (!domain.bodyId || ![domain.originX, domain.originZ, domain.baseHeightM].every(Number.isFinite)
      || domain.groundHeights.length !== this.height.length || (domain.ownerMask && domain.ownerMask.length !== this.height.length)) {
      throw new RangeError('Invalid local water domain');
    }
    for (let i = 0; i < this.height.length; i++) if (!Number.isFinite(domain.groundHeights[i])
      || !Number.isFinite(domain.baseHeightM - domain.groundHeights[i])) throw new RangeError('Local water bed and depth must be finite');
    this._bodyId = domain.bodyId; this._originX = domain.originX; this._originZ = domain.originZ; this._baseHeight = domain.baseHeightM;
    this._minimumSafeBaseHeight = -Infinity;
    let maxDepth = 0;
    for (let i = 0; i < this.depth.length; i++) {
      this.ground[i] = domain.groundHeights[i];
      const d = domain.baseHeightM - this.ground[i];
      this.depth[i] = (!domain.ownerMask || domain.ownerMask[i]) && d > MIN_DEPTH_M ? d : 0;
      this.wetMask[i] = this.depth[i] > 0 ? 1 : 0;
      if (this.wetMask[i]) this._minimumSafeBaseHeight = Math.max(this._minimumSafeBaseHeight, this.ground[i] + MIN_DEPTH_M);
      maxDepth = Math.max(maxDepth, this.depth[i]);
    }
    this.shoreWeight.set(shoreWeights(this.wetMask, this.size, this.cellSizeM));
    this.faceX.fill(0); this.faceZ.fill(0); this.component.fill(0);
    for (let z = 0; z < this.size; z++) for (let x = 0; x < this.size; x++) {
      const i = z * this.size + x, d = this.depth[i];
      if (x + 1 < this.size && d > 0 && this.depth[i + 1] > 0) this.faceX[i] = 2 * d * this.depth[i + 1] / (d + this.depth[i + 1]);
      if (z + 1 < this.size && d > 0 && this.depth[i + this.size] > 0) this.faceZ[i] = 2 * d * this.depth[i + this.size] / (d + this.depth[i + this.size]);
    }
    const queue = new Int32Array(this.height.length);
    let label = 0;
    for (let seed = 0; seed < this.depth.length; seed++) {
      if (!this.depth[seed] || this.component[seed]) continue;
      let read = 0, write = 1; queue[0] = seed; this.component[seed] = ++label;
      while (read < write) {
        const i = queue[read++], x = i % this.size, z = Math.floor(i / this.size);
        for (const j of [x > 0 ? i - 1 : -1, x + 1 < this.size ? i + 1 : -1,
          z > 0 ? i - this.size : -1, z + 1 < this.size ? i + this.size : -1]) {
          if (j >= 0 && this.depth[j] && !this.component[j]) { this.component[j] = label; queue[write++] = j; }
        }
      }
    }
    // 2-D CFL with worst-case depth; 0.8 safety factor and fixed real-time rate.
    this._stepS = Math.min(1 / 120, maxDepth > 0 ? 0.8 * this.cellSizeM / Math.sqrt(2 * this.gravity * maxDepth) : 1 / 120);
    if (!Number.isFinite(this._stepS) || this._stepS <= 0) throw new RangeError('Local water depth exceeds finite CFL range');
    this.clear();
  }

  clear(): void {
    this.height.fill(0); this.fluxX.fill(0); this.fluxZ.fill(0); this.foam.fill(0); this.fields.fill(0);
    this.spheres.clear(); this.baselineVolume = 0; this.accumulator = 0; this.displacementDirty = false; this.disturbed = false; this._revision++;
  }
  setActive(active: boolean): void { this._active = active; this.accumulator = 0; }

  /** A hull's multiple proxies publish one coherent field, not N complete
   * GPU upload fields. Do not sample during the synchronous callback. */
  batchDisplacementUpdates(update: () => void): void {
    this.displacementBatchDepth++;
    try { update(); }
    finally {
      this.displacementBatchDepth--;
      if (!this.displacementBatchDepth && this.displacementDirty) { this.displacementDirty = false; this.publish(); }
    }
  }

  /** Returns accepted impulse energy. An impact displaces no net volume,
   * even beside a wall or another disconnected pool of the same body. The
   * linear-wave safety envelope scales the entire kernel, never clips cells. */
  impulse(input: { x: number; z: number; radiusM: number; energyJ: number }): number {
    if (![input.x, input.z, input.radiusM, input.energyJ].every(Number.isFinite) || input.radiusM <= 0 || input.energyJ < 0 || input.energyJ > 1e6) throw new RangeError('Invalid local water impulse');
    if (!this._active || input.energyJ === 0) return 0;
    const cx = Math.floor((input.x - this._originX) / this.cellSizeM), cz = Math.floor((input.z - this._originZ) / this.cellSizeM);
    const label = cx >= 0 && cz >= 0 && cx < this.size && cz < this.size ? this.component[cz * this.size + cx] : 0;
    if (!label) { this.diagnostics.rejectedImpulses++; return 0; }
    this.scratch.fill(0);
    let sum = 0, weights = 0;
    const visit = (fn: (i: number, r2: number, w: number) => void) => {
      const x0 = Math.max(0, Math.floor((input.x - input.radiusM - this._originX) / this.cellSizeM));
      const x1 = Math.min(this.size - 1, Math.floor((input.x + input.radiusM - this._originX) / this.cellSizeM));
      const z0 = Math.max(0, Math.floor((input.z - input.radiusM - this._originZ) / this.cellSizeM));
      const z1 = Math.min(this.size - 1, Math.floor((input.z + input.radiusM - this._originZ) / this.cellSizeM));
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        const i = z * this.size + x;
        if (this.component[i] !== label) continue;
        const dx = (x + 0.5) * this.cellSizeM - (input.x - this._originX), dz = (z + 0.5) * this.cellSizeM - (input.z - this._originZ);
        const r2 = (dx * dx + dz * dz) / input.radiusM ** 2;
        if (r2 < 1) fn(i, r2, (1 - r2) ** 2);
      }
    };
    visit((_i, r2, w) => { sum += r2 * w; weights += w; });
    if (weights === 0) { this.diagnostics.rejectedImpulses++; return 0; }
    let square = 0;
    visit((i, r2, w) => { this.scratch[i] = w * (r2 - sum / weights); square += this.scratch[i] ** 2; });
    if (square < 1e-20) { this.diagnostics.rejectedImpulses++; return 0; }
    const unitEnergy = 0.5 * this.density * this.gravity * this.cellSizeM ** 2 * square;
    let scale = Math.sqrt(input.energyJ / unitEnergy);
    visit((i) => { if (this.scratch[i]) scale = Math.min(scale, this.depth[i] * 0.2 / Math.abs(this.scratch[i])); });
    visit((i) => { this.height[i] += this.scratch[i] * scale; });
    this.disturbed = true;
    this.publish();
    return unitEnergy * scale ** 2;
  }

  /** Move/remove an excluded immersed sphere, adding NEW minus OLD columns.
   * No wake is stamped along a teleport path. Fixed sphere-local quadrature
   * preserves exact spherical-cap volume on an unobstructed bed independently
   * of grid alignment; irregular bed/owner clipping is a bounded quadrature
   * approximation. Overlapping solid spheres are not a Boolean hull union. */
  moveImmersedSphere(id: string, sphere: LocalWaterSphere | null): boolean {
    return this.updateImmersedSphere(id, sphere, false);
  }

  /** Initialize existing occupancy without inventing an impact when a patch
   * is selected. Volume is relative to this initial occupied-water baseline. */
  seedImmersedSphere(id: string, sphere: LocalWaterSphere | null): boolean {
    return this.updateImmersedSphere(id, sphere, true);
  }

  private updateImmersedSphere(id: string, sphere: LocalWaterSphere | null, quiet: boolean): boolean {
    if (!id || (sphere && (![sphere.x, sphere.y, sphere.z, sphere.radiusM].every(Number.isFinite)
      || sphere.radiusM <= 0 || sphere.radiusM > this.size * this.cellSizeM))) throw new RangeError('Invalid immersed sphere or radius exceeds local patch extent');
    if (!this._active && sphere) return false;
    const old = this.spheres.get(id);
    if (!sphere && !old) return true;
    if (sphere && !old && this.spheres.size >= this.maxSpheres) { this.diagnostics.rejectedSphereAdmissions++; return false; }
    this.scratch.fill(0);
    if (sphere) this.sphereColumns(sphere, this.scratch);
    let volume = 0, changed = false;
    for (let i = 0; i < this.height.length; i++) {
      if (!quiet) {
        const delta = this.scratch[i] - (old?.columns[i] ?? 0);
        this.height[i] += delta; changed ||= delta !== 0;
      }
      volume += this.scratch[i] * this.cellSizeM ** 2;
    }
    if (sphere) {
      const columns = old?.columns ?? new Float64Array(this.height.length);
      columns.set(this.scratch); this.spheres.set(id, { columns, volumeM3: volume });
    } else this.spheres.delete(id);
    if (quiet) this.baselineVolume += volume - (old?.volumeM3 ?? 0);
    else if (changed) {
      this.disturbed = true;
      if (this.displacementBatchDepth) this.displacementDirty = true; else this.publish();
    }
    return true;
  }

  private sphereColumns(sphere: LocalWaterSphere, out: Float64Array): void {
    const r = sphere.radiusM, cap = clamp(this._baseHeight - sphere.y + r, 0, 2 * r);
    if (cap === 0) return;
    const diskRadiusSquared = cap < r ? cap * (2 * r - cap) : r * r;
    const exactVolume = Math.PI * cap * cap * (r - cap / 3), sampleArea = Math.PI * diskRadiusSquared / (POLAR_RINGS * POLAR_ANGLES);
    let rawVolume = 0;
    for (let ring = 0; ring < POLAR_RINGS; ring++) {
      const half = Math.sqrt(r * r - diskRadiusSquared * (ring + 0.5) / POLAR_RINGS);
      rawVolume += Math.max(0, Math.min(this._baseHeight, sphere.y + half) - (sphere.y - half)) * sampleArea * POLAR_ANGLES;
    }
    if (!rawVolume) return;
    const normalise = exactVolume / rawVolume / this.cellSizeM ** 2;
    for (let ring = 0; ring < POLAR_RINGS; ring++) {
      const radius = Math.sqrt(diskRadiusSquared * (ring + 0.5) / POLAR_RINGS), half = Math.sqrt(r * r - radius * radius);
      for (let angle = 0; angle < POLAR_ANGLES; angle++) {
        const phase = (angle + (ring % 2) * 0.5) * 2 * Math.PI / POLAR_ANGLES;
        const gx = (sphere.x - this._originX + radius * Math.cos(phase)) / this.cellSizeM - 0.5;
        const gz = (sphere.z - this._originZ + radius * Math.sin(phase)) / this.cellSizeM - 0.5;
        const ix = Math.floor(gx), iz = Math.floor(gz), tx = gx - ix, tz = gz - iz;
        for (let dz = 0; dz <= 1; dz++) for (let dx = 0; dx <= 1; dx++) {
          const x = ix + dx, z = iz + dz;
          if (x < 0 || z < 0 || x >= this.size || z >= this.size) continue;
          const i = z * this.size + x;
          if (!this.depth[i]) continue;
          const column = Math.max(0, Math.min(this._baseHeight, sphere.y + half) - Math.max(this.ground[i], sphere.y - half));
          out[i] += column * sampleArea * normalise * (dx ? tx : 1 - tx) * (dz ? tz : 1 - tz);
        }
      }
    }
  }

  advance(dtS: number): LocalWaterPatchStep {
    if (!Number.isFinite(dtS) || dtS < 0) throw new RangeError('Local water timestep must be finite and nonnegative');
    if (!this._active || !this.disturbed || dtS === 0) return { steps: 0, simulatedS: 0, droppedS: 0, revision: this._revision };
    let dropped = Math.max(0, dtS - this.maxCatchup);
    this.accumulator += Math.min(dtS, this.maxCatchup);
    const available = Math.floor((this.accumulator + 1e-12) / this._stepS), steps = Math.min(this.maxSteps, available);
    for (let step = 0; step < steps; step++) this.integrate(this._stepS);
    this.accumulator = Math.max(0, this.accumulator - available * this._stepS);
    dropped += Math.max(0, available - steps) * this._stepS;
    this.diagnostics.droppedTimeS += dropped; this.diagnostics.steps += steps;
    if (steps) this.publish();
    return { steps, simulatedS: steps * this._stepS, droppedS: dropped, revision: this._revision };
  }

  private integrate(dt: number): void {
    const n = this.size, rate = dt / this.cellSizeM, damping = Math.exp(-this.damping * dt);
    for (let i = 0; i < this.height.length; i++) {
      if (this.faceX[i]) this.fluxX[i] = (this.fluxX[i] - this.gravity * this.faceX[i] * (this.height[i + 1] - this.height[i]) * rate) * damping;
      if (this.faceZ[i]) this.fluxZ[i] = (this.fluxZ[i] - this.gravity * this.faceZ[i] * (this.height[i + n] - this.height[i]) * rate) * damping;
    }
    const foamDecay = Math.exp(-1.5 * dt);
    for (let i = 0; i < this.height.length; i++) {
      const change = rate * ((i % n ? this.fluxX[i - 1] : 0) - this.fluxX[i]
        + (i >= n ? this.fluxZ[i - n] : 0) - this.fluxZ[i]);
      this.height[i] += change;
      // Compression rate is a physical breaking/agitation cue; quiet water
      // loses foam. Foam never feeds back into height or conserved volume.
      this.foam[i] = clamp(this.foam[i] * foamDecay + Math.max(0, change / dt - 0.08) * dt * 2, 0, 1);
    }
  }

  private publish(): void {
    const n = this.size;
    // Keep the linear solver's signed-volume bookkeeping intact. Its local
    // additive display cannot model runup/overflow, so fade at true shores
    // and smoothly limit to 45% rest depth rather than cutting a raised slab
    // at the last wet cell. A one-cell zero collar makes nearest-mask exits
    // continuous, including diagonal/foreign-owner islands.
    for (let i = 0; i < this.height.length; i++) {
      const p = i * 4;
      if (!this.depth[i]) { this.fields[p] = this.fields[p + 1] = this.fields[p + 2] = this.fields[p + 3] = 0; continue; }
      const capacity = this.depth[i] * 0.45, weight = this.shoreWeight[i];
      const limited = capacity * Math.tanh(this.height[i] / capacity), displayed = limited * weight;
      this.fields[p] = displayed;
      // Bounded agitation cue for unresolved steep/shallow wave energy.
      // It does not alter water mass or spawn additional particle systems.
      const lostEnergy = Math.max(0, this.height[i] ** 2 - displayed ** 2) / (capacity ** 2);
      this.fields[p + 3] = Math.min(1, this.foam[i] + 0.5 * (1 - Math.exp(-lostEnergy))) * weight;
    }
    for (let i = 0; i < this.height.length; i++) {
      const p = i * 4;
      if (!this.depth[i] || !this.shoreWeight[i]) { this.fields[p + 1] = this.fields[p + 2] = 0; continue; }
      const h = this.fields[p];
      const left = i % n && this.faceX[i - 1] ? this.fields[p - 4] : h;
      const right = this.faceX[i] ? this.fields[p + 4] : h;
      const top = i >= n && this.faceZ[i - n] ? this.fields[p - n * 4] : h;
      const bottom = this.faceZ[i] ? this.fields[p + n * 4] : h;
      this.fields[p + 1] = (right - left) / (2 * this.cellSizeM);
      this.fields[p + 2] = (bottom - top) / (2 * this.cellSizeM);
    }
    this._revision++;
  }

  /** Hardware-linear texture twin: cell-centred Float32 RGBA, clamped edges,
   * nearest wet-mask rejection. Domain holes are never promoted to water.
   * Callers additionally compare bodyId; this method does not recenter. */
  sample(x: number, z: number, out?: LocalWaterPatchSample): LocalWaterPatchSample | null {
    if (!this._active || !Number.isFinite(x) || !Number.isFinite(z)) return null;
    const gx = (x - this._originX) / this.cellSizeM, gz = (z - this._originZ) / this.cellSizeM;
    if (gx < 0 || gz < 0 || gx >= this.size || gz >= this.size || !this.wetMask[Math.floor(gz) * this.size + Math.floor(gx)]) return null;
    const fx = clamp(gx - 0.5, 0, this.size - 1), fz = clamp(gz - 0.5, 0, this.size - 1);
    const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
    const value = out ?? { height: 0, slopeX: 0, slopeZ: 0, foam: 0 };
    value.height = value.slopeX = value.slopeZ = value.foam = 0;
    for (let dz = 0; dz <= 1; dz++) for (let dx = 0; dx <= 1; dx++) {
      const i = (Math.min(this.size - 1, iz + dz) * this.size + Math.min(this.size - 1, ix + dx)) * 4;
      const w = (dx ? tx : 1 - tx) * (dz ? tz : 1 - tz);
      value.height += this.fields[i] * w; value.slopeX += this.fields[i + 1] * w;
      value.slopeZ += this.fields[i + 2] * w; value.foam += this.fields[i + 3] * w;
    }
    return value;
  }

  /** Exact discrete water-column accounting; Float32 upload rounding is not
   * used to integrate or correct volume. Useful for fixtures and diagnostics. */
  get volumeOffsetM3(): number { return this.height.reduce((sum, h) => sum + h, 0) * this.cellSizeM ** 2; }
  /** Published cell-volume equivalent BEFORE the additional rectangular
   * presentation envelope. Not a conservation claim or overflow model. */
  get displayedVolumeOffsetM3(): number {
    let volume = 0; for (let i = 0; i < this.fields.length; i += 4) volume += this.fields[i];
    return volume * this.cellSizeM ** 2;
  }
  get displacedVolumeM3(): number { let volume = 0; for (const body of this.spheres.values()) volume += body.volumeM3; return volume; }
  get baselineDisplacedVolumeM3(): number { return this.baselineVolume; }
  get energyJ(): number {
    let energy = 0;
    for (let i = 0; i < this.height.length; i++) {
      energy += this.gravity * this.height[i] ** 2;
      if (this.faceX[i]) energy += this.fluxX[i] ** 2 / this.faceX[i];
      if (this.faceZ[i]) energy += this.fluxZ[i] ** 2 / this.faceZ[i];
    }
    return 0.5 * this.density * this.cellSizeM ** 2 * energy;
  }
}
