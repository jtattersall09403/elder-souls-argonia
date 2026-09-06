import type { WorldWaterQuery } from "@elder-souls/contracts";
import * as THREE from "three";
import { RIPPLE_PATH_GLSL } from './rippleIsolation';
import { RIPPLE_ADVECTION_GLSL } from './rippleAdvection';

export const RIPPLE_PATCH_M = 64;
const FIXED_STEP = 1 / 60;
const MAX_DROPS = 32;
const MIN_WET_MARGIN_M = 0.02;
const MAX_STALE_STAGE_M = 0.008;

export interface RippleBoundarySample {
  waterBodyId: string | null;
  depth: number;
  surfaceHeight: number;
  /** Distance to either drying or losing flood access, in vertical metres. */
  wetMarginM?: number;
  flowX?: number;
  flowZ?: number;
}
interface RippleLevelSource {
  levelOffsets(epochMinutes: number): { tide: number; season: number };
}
/** Still-water depth against actual ground is sufficient; no wave/normal evaluation needed. */
export type RippleBoundarySampler = (x: number, z: number, epochMinutes: number) => RippleBoundarySample;

export interface RippleSimOptions {
  size?: number;
  patchM?: number;
  boundarySize?: number;
  maskRefreshS?: number;
  sampleBoundary?: RippleBoundarySampler;
}

/** CPU mask sampled at 0.5 m by default. Movement reuses overlapping samples;
 * tide/season changes refresh the complete patch at most five times per second.
 * RG = stable 16-bit local body label, B = depth / 4 m, A = wet support. */
export class RippleBoundaryMask {
  readonly center = new THREE.Vector2(NaN, NaN);
  data: Uint8Array;
  /** Parallel true-metre/second XZ current; never packed/clipped to a speed range. */
  current: Float32Array;
  hasCurrent = false;
  private currentScratch: Float32Array;
  private scratch: Uint8Array;
  private readonly cornerLabels: Uint16Array;
  private readonly bodyLabels = new Map<string, number>();
  private age = Infinity;
  private refreshRow = 0;
  private rowsRemaining = 0;
  private sampler?: RippleBoundarySampler;
  private readonly rowStages: Float64Array;
  private readonly scratchRowStages: Float64Array;
  private tide = 0;
  private season = 0;
  private hasLevels = false;
  private dirty = false;

  constructor(readonly size = 128, readonly patchM = RIPPLE_PATCH_M, readonly refreshS = 0.2, sampler?: RippleBoundarySampler, private readonly refreshRows = size) {
    this.data = new Uint8Array(size * size * 4);
    this.scratch = new Uint8Array(this.data.length);
    this.current = new Float32Array(size * size * 2);
    this.currentScratch = new Float32Array(this.current.length);
    this.cornerLabels = new Uint16Array((size + 1) * (size + 1));
    this.rowStages = new Float64Array(size * 4).fill(NaN);
    this.scratchRowStages = new Float64Array(size * 4);
    this.sampler = sampler;
  }

  setSampler(sampler: RippleBoundarySampler): void { this.sampler = sampler; this.invalidate(); }
  invalidate(): void { this.age = Infinity; }

  /** Clear unsafe support immediately, then refill rows without restarting the
   * refresh cursor. A continuously moving tide cannot starve later rows. */
  setLevelOffsets(tide: number, season: number): boolean {
    if (!Number.isFinite(tide) || !Number.isFinite(season)) return false;
    let cleared = false;
    for (let row = 0; row < this.size; row++) {
      const i = row * 4;
      // Responses lie in [0,1]. This bounds every sample represented by a
      // row, including mixed-age samples retained during lateral scrolling.
      const excursion = Math.max(Math.abs(tide - this.rowStages[i]), Math.abs(tide - this.rowStages[i + 1]))
        + Math.max(Math.abs(season - this.rowStages[i + 2]), Math.abs(season - this.rowStages[i + 3]));
      if ((!this.hasLevels && Number.isFinite(this.center.x)) || excursion > MAX_STALE_STAGE_M) {
        this.data.fill(0, row * this.size * 4, (row + 1) * this.size * 4);
        this.current.fill(0, row * this.size * 2, (row + 1) * this.size * 2);
        this.rowStages.fill(NaN, i, i + 4);
        cleared = true;
      }
    }
    this.tide = tide; this.season = season; this.hasLevels = true;
    if (cleared) { this.dirty = true; this.rowsRemaining = this.size; this.age = 0; }
    return cleared;
  }

  invalidateProgressively(): void {
    this.data.fill(0); this.current.fill(0); this.hasCurrent = false; this.rowStages.fill(NaN);
    this.dirty = true; this.rowsRemaining = this.size; this.age = 0;
  }

  update(focusX: number, focusZ: number, epoch: number, dt: number): boolean {
    const texel = this.patchM / this.size;
    const cx = Math.round(focusX / texel) * texel;
    const cz = Math.round(focusZ / texel) * texel;
    this.age += Math.max(0, dt);
    const full = !Number.isFinite(this.age) || !Number.isFinite(this.center.x);
    if (!full && !this.rowsRemaining && this.age + 1e-9 >= this.refreshS) {
      this.rowsRemaining = this.size;
      this.refreshRow = 0;
      this.age = 0;
    }
    const rowStart = this.refreshRow;
    const rowCount = full ? this.size : Math.min(this.rowsRemaining, Math.max(1, this.refreshRows));
    const dx = Number.isFinite(this.center.x) ? Math.round((cx - this.center.x) / texel) : this.size;
    const dz = Number.isFinite(this.center.y) ? Math.round((cz - this.center.y) / texel) : this.size;
    if (!full && !rowCount && dx === 0 && dz === 0 && !this.dirty) return false;
    const target = this.scratch;
    // Corner samples are shared by four cells: conservative support needs
    // about two samples/cell, not five. 65535 is the unsampled sentinel.
    this.cornerLabels.fill(65535);
    this.scratchRowStages.fill(NaN);
    this.hasCurrent = false;
    for (let z = 0; z < this.size; z++) for (let x = 0; x < this.size; x++) {
      const i = (z * this.size + x) * 4;
      const ci = i / 2;
      const oldX = x + dx;
      const oldZ = z + dz;
      const refreshCell = full || (z - rowStart + this.size) % this.size < rowCount;
      if (!refreshCell && oldX >= 0 && oldX < this.size && oldZ >= 0 && oldZ < this.size) {
        const old = (oldZ * this.size + oldX) * 4;
        target[i] = this.data[old]; target[i + 1] = this.data[old + 1];
        target[i + 2] = this.data[old + 2]; target[i + 3] = this.data[old + 3];
        this.currentScratch[ci] = this.current[old / 2]; this.currentScratch[ci + 1] = this.current[old / 2 + 1];
        if (this.currentScratch[ci] !== 0 || this.currentScratch[ci + 1] !== 0) this.hasCurrent = true;
        if (target[i + 3]) this.includeRowStage(z, oldZ);
        continue;
      }
      const sample = this.sampler?.(cx + (x + 0.5) * texel - this.patchM / 2, cz + (z + 0.5) * texel - this.patchM / 2, epoch);
      const id = this.sampler ? sample?.waterBodyId : "water.unbounded.default";
      const depth = this.sampler ? sample?.depth ?? 0 : 4;
      let label = 0;
      if (id && Number.isFinite(depth) && depth > 0.025 && (sample?.wetMarginM ?? depth - 0.004) > MIN_WET_MARGIN_M) {
        label = this.bodyLabel(id);
      }
      if (label && this.sampler) {
        // A cell must be wet at its centre AND four corners; thin banks
        // cannot become a full wet cell just because its centre missed land.
        for (let cornerZ = z; cornerZ <= z + 1 && label; cornerZ++) {
          for (let cornerX = x; cornerX <= x + 1; cornerX++) {
            const corner = cornerZ * (this.size + 1) + cornerX;
            if (this.cornerLabels[corner] === 65535) {
              const edge = this.sampler(cx + cornerX * texel - this.patchM / 2, cz + cornerZ * texel - this.patchM / 2, epoch);
              this.cornerLabels[corner] = edge.waterBodyId && Number.isFinite(edge.depth) && edge.depth > 0.025
                && (edge.wetMarginM ?? edge.depth - 0.004) > MIN_WET_MARGIN_M ? this.bodyLabel(edge.waterBodyId) : 0;
            }
            if (this.cornerLabels[corner] !== label) { label = 0; break; }
          }
        }
      }
      target[i] = label & 255;
      target[i + 1] = label >>> 8;
      target[i + 2] = label ? Math.min(255, Math.max(1, Math.round(depth / 4 * 255))) : 0;
      target[i + 3] = label ? 255 : 0;
      this.currentScratch[ci] = label && Number.isFinite(sample?.flowX) ? sample!.flowX! : 0;
      this.currentScratch[ci + 1] = label && Number.isFinite(sample?.flowZ) ? sample!.flowZ! : 0;
      if (this.currentScratch[ci] !== 0 || this.currentScratch[ci + 1] !== 0) this.hasCurrent = true;
      if (label) this.includeRowStage(z);
    }
    this.scratch = this.data;
    this.data = target;
    [this.current, this.currentScratch] = [this.currentScratch, this.current];
    this.rowStages.set(this.scratchRowStages);
    this.dirty = false;
    this.center.set(cx, cz);
    if (full) { this.age = 0; this.rowsRemaining = 0; this.refreshRow = 0; }
    else { this.rowsRemaining -= rowCount; this.refreshRow = (this.refreshRow + rowCount) % this.size; }
    return true;
  }

  /** Label at a world point, used to restrict each impulse to its origin body. */
  labelAt(x: number, z: number): number {
    if (!Number.isFinite(this.center.x) || !Number.isFinite(x) || !Number.isFinite(z)) return 0;
    const ix = Math.floor((x - this.center.x + this.patchM / 2) * this.size / this.patchM);
    const iz = Math.floor((z - this.center.y + this.patchM / 2) * this.size / this.patchM);
    if (ix < 0 || iz < 0 || ix >= this.size || iz >= this.size) return 0;
    const i = (iz * this.size + ix) * 4;
    return this.data[i] + this.data[i + 1] * 256;
  }

  private bodyLabel(id: string): number {
    const known = this.bodyLabels.get(id);
    if (known) return known;
    if (this.bodyLabels.size >= 65534) return 0;
    const label = this.bodyLabels.size + 1;
    this.bodyLabels.set(id, label);
    return label;
  }

  private includeRowStage(row: number, previousRow?: number): void {
    const i = row * 4;
    const old = previousRow === undefined ? -1 : previousRow * 4;
    const minT = old < 0 ? this.tide : this.rowStages[old], maxT = old < 0 ? this.tide : this.rowStages[old + 1];
    const minS = old < 0 ? this.season : this.rowStages[old + 2], maxS = old < 0 ? this.season : this.rowStages[old + 3];
    if (!Number.isFinite(this.scratchRowStages[i])) {
      this.scratchRowStages[i] = minT; this.scratchRowStages[i + 1] = maxT;
      this.scratchRowStages[i + 2] = minS; this.scratchRowStages[i + 3] = maxS;
    } else {
      this.scratchRowStages[i] = Math.min(this.scratchRowStages[i], minT);
      this.scratchRowStages[i + 1] = Math.max(this.scratchRowStages[i + 1], maxT);
      this.scratchRowStages[i + 2] = Math.min(this.scratchRowStages[i + 2], minS);
      this.scratchRowStages[i + 3] = Math.max(this.scratchRowStages[i + 3], maxS);
    }
  }
}

/** Scheduling is independent of rendering. Every recenter is copied immediately,
 * including frames shorter than one simulation step, before new drops are stamped. */
export class RippleFrameScheduler {
  readonly center = new THREE.Vector2();
  private accumulator = 0;
  constructor(readonly size = 256, readonly patchM = RIPPLE_PATCH_M) {}

  advance(focusX: number, focusZ: number, deltaS: number) {
    const texel = this.patchM / this.size;
    const x = Math.round(focusX / texel) * texel;
    const z = Math.round(focusZ / texel) * texel;
    const shiftX = (x - this.center.x) / this.patchM;
    const shiftZ = (z - this.center.y) / this.patchM;
    this.center.set(x, z);
    this.accumulator = Math.min(this.accumulator + Math.max(0, deltaS), 4 * FIXED_STEP);
    const steps = Math.floor((this.accumulator + 1e-9) / FIXED_STEP);
    this.accumulator = Math.max(0, this.accumulator - steps * FIXED_STEP);
    return { shiftX, shiftZ, steps };
  }
}

const VERTEX = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const COMMON = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uPrev;
  uniform sampler2D uBoundary;
  uniform vec2 uMaskOffset;
  bool inside(vec2 uv) { return all(greaterThanEqual(uv, vec2(0.0))) && all(lessThanEqual(uv, vec2(1.0))); }
  vec4 support(vec2 uv) {
    vec2 maskUv = uv + uMaskOffset;
    if (!inside(maskUv)) return vec4(0.0);
    return texture2D(uBoundary, maskUv);
  }
  bool sameBody(vec2 a, vec2 b) { return dot(abs(a - b), vec2(1.0)) < 0.002; }
  vec4 history(vec2 uv, vec4 boundary) {
    if (!inside(uv) || boundary.a < 0.5) return vec4(0.0, 0.0, boundary.rg);
    vec4 state = texture2D(uPrev, uv);
    if (!sameBody(state.ba, boundary.rg)) state.rg = vec2(0.0);
    return vec4(state.rg, boundary.rg);
  }
`;

const COPY = COMMON + /* glsl */`
  uniform vec2 uShift;
  void main() { gl_FragColor = history(vUv + uShift, support(vUv)); }
`;

const UPDATE = COMMON + /* glsl */`
  uniform vec2 uTexel;
  uniform float uCellM;
  float neighbour(vec2 uv, vec4 centre, vec2 body) {
    vec4 edge = support(uv);
    // Neumann/no-flux shoreline: reflected waves, never propagation through a bank.
    if (!inside(uv) || edge.a < 0.5 || !sameBody(edge.rg, body)) return centre.r;
    return history(uv, edge).r;
  }
  void main() {
    vec4 boundary = support(vUv);
    if (boundary.a < 0.5) { gl_FragColor = vec4(0.0); return; }
    vec4 state = history(vUv, boundary);
    float laplacian = neighbour(vUv + vec2(uTexel.x, 0.0), state, boundary.rg)
      + neighbour(vUv - vec2(uTexel.x, 0.0), state, boundary.rg)
      + neighbour(vUv + vec2(0.0, uTexel.y), state, boundary.rg)
      + neighbour(vUv - vec2(0.0, uTexel.y), state, boundary.rg) - 4.0 * state.r;
    // Shallow-water phase speed sqrt(g*d), capped locally; CFL <= .45.
    float speed = min(3.0, sqrt(9.81 * max(0.025, boundary.b * 4.0)));
    float courant = min(0.45, speed / (60.0 * uCellM));
    float velocity = (state.g + laplacian * courant * courant) * 0.99;
    float height = state.r + velocity;
    float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
    float keep = smoothstep(0.0, 0.06, edge);
    gl_FragColor = vec4(clamp(height * keep, -0.5, 0.5), clamp(velocity * keep, -0.2, 0.2), boundary.rg);
  }
`;

const DROP = COMMON + RIPPLE_PATH_GLSL + /* glsl */`
  uniform vec4 uDrops[${MAX_DROPS}];
  uniform vec2 uDropBodies[${MAX_DROPS}];
  uniform int uDropCount;
  void main() {
    vec4 boundary = support(vUv);
    if (boundary.a < 0.5) { gl_FragColor = vec4(0.0); return; }
    vec4 state = history(vUv, boundary);
    float impulse = 0.0;
    for (int i = 0; i < ${MAX_DROPS}; i++) {
      if (i >= uDropCount) break;
      vec4 drop = uDrops[i];
      if (!sameBody(uDropBodies[i], boundary.rg)) continue;
      vec2 travel = vUv - drop.xy;
      float radial = length(travel) / drop.z;
      if (radial >= 1.0) continue;
      // Exact bounded cell supercover, including both sides of a corner.
      bool connected = esRipplePath(drop.xy, vUv, boundary.rg);
      if (connected) impulse += (0.5 + 0.5 * cos(radial * 3.14159265)) * drop.w;
    }
    gl_FragColor = vec4(clamp(state.r + impulse, -0.5, 0.5), state.g, boundary.rg);
  }
`;

/**
 * One bounded near-camera wave patch, evolved with the finite-difference method
 * used by Evan Wallace / jeantimex (MIT; source research in water-edges-and-shore-waves.md §4).
 * Every update obeys shared water support/body boundaries. RG is height/velocity;
 * BA retains the body's mask label so newly flooded or recentered cells cannot
 * inherit another pool's disturbance. No readbacks and no per-drop draw calls.
 */
export class RippleSim {
  private a: THREE.WebGLRenderTarget;
  private b: THREE.WebGLRenderTarget;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly copy: THREE.ShaderMaterial;
  private readonly update: THREE.ShaderMaterial;
  private readonly drop: THREE.ShaderMaterial;
  private readonly advect: THREE.ShaderMaterial;
  private readonly mask: RippleBoundaryMask;
  private readonly maskTexture: THREE.DataTexture;
  private readonly currentTexture: THREE.DataTexture;
  private readonly scheduler: RippleFrameScheduler;
  private readonly pendingDrops: { x: number; z: number; radiusM: number; strength: number }[] = [];
  private readonly fastSampler?: RippleBoundarySampler;
  private readonly maxDropRadiusM: number;
  private epoch = () => 0;
  private levels?: (epochMinutes: number) => { tide: number; season: number };
  private initialized = false;
  private disposed = false;
  readonly center: THREE.Vector2;
  readonly patchM: number;

  constructor(options: RippleSimOptions = {}) {
    const size = Math.max(32, Math.min(512, Math.round(options.size ?? 256)));
    this.patchM = Math.max(8, Math.min(128, options.patchM ?? RIPPLE_PATCH_M));
    const boundarySize = Math.max(16, Math.min(256, Math.round(options.boundarySize ?? 128)));
    this.maxDropRadiusM = Math.min(4, this.patchM / boundarySize * 8);
    this.fastSampler = options.sampleBoundary;
    // Keep conservative half-metre banks without a 33k-query hitch every
    // fifth of a second. Initial/teleported support is complete immediately;
    // subsequent level changes refresh in bounded row batches.
    this.mask = new RippleBoundaryMask(boundarySize, this.patchM, Math.max(0.1, options.maskRefreshS ?? 0.2), this.fastSampler, 16);
    this.scheduler = new RippleFrameScheduler(size, this.patchM);
    this.center = this.scheduler.center;
    this.maskTexture = new THREE.DataTexture(this.mask.data, boundarySize, boundarySize, THREE.RGBAFormat);
    this.maskTexture.minFilter = this.maskTexture.magFilter = THREE.NearestFilter;
    this.maskTexture.generateMipmaps = false;
    this.maskTexture.colorSpace = THREE.NoColorSpace;
    this.maskTexture.needsUpdate = true;
    this.currentTexture = new THREE.DataTexture(this.mask.current, boundarySize, boundarySize, THREE.RGFormat, THREE.FloatType);
    this.currentTexture.minFilter = this.currentTexture.magFilter = THREE.NearestFilter;
    this.currentTexture.generateMipmaps = false;
    this.currentTexture.colorSpace = THREE.NoColorSpace;
    this.currentTexture.needsUpdate = true;
    const makeTarget = () => {
      const rt = new THREE.WebGLRenderTarget(size, size, { type: THREE.HalfFloatType, format: THREE.RGBAFormat,
        // Simulation taps are exact texel centres; linear filtering gives the
        // surface shader smooth gradients without any additional output pass.
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false });
      rt.texture.colorSpace = THREE.NoColorSpace;
      rt.texture.generateMipmaps = false;
      return rt;
    };
    this.a = makeTarget(); this.b = makeTarget();
    const uniforms = () => ({ uPrev: { value: null }, uBoundary: { value: this.maskTexture }, uMaskOffset: { value: new THREE.Vector2() } });
    const material = (fragmentShader: string, extra: Record<string, THREE.IUniform>) => new THREE.ShaderMaterial({
      vertexShader: VERTEX, fragmentShader, uniforms: { ...uniforms(), ...extra },
      depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false,
    });
    this.copy = material(COPY, { uShift: { value: new THREE.Vector2() } });
    this.update = material(UPDATE, { uTexel: { value: new THREE.Vector2(1 / size, 1 / size) }, uCellM: { value: this.patchM / size } });
    this.advect = material(COMMON + RIPPLE_PATH_GLSL + RIPPLE_ADVECTION_GLSL, {
      uCurrent: { value: this.currentTexture }, uMaskSize: { value: boundarySize },
      uStateSize: { value: size }, uPatchM: { value: this.patchM }, uDeltaS: { value: FIXED_STEP },
    });
    this.drop = material(DROP, {
      uMaskSize: { value: boundarySize },
      uDrops: { value: Array.from({ length: MAX_DROPS }, () => new THREE.Vector4()) },
      uDropBodies: { value: Array.from({ length: MAX_DROPS }, () => new THREE.Vector2()) },
      uDropCount: { value: 0 },
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.copy);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  get texture(): THREE.Texture { return this.a.texture; }

  configureBoundary(query: WorldWaterQuery, epochMinutes: () => number): void {
    this.epoch = epochMinutes;
    // WaterWorld can expose this optional cheap path while generic gameplay queries work too.
    const cheap = query as WorldWaterQuery & { sampleBoundary?: RippleBoundarySampler } & Partial<RippleLevelSource>;
    this.levels = cheap.levelOffsets ? epoch => cheap.levelOffsets!(epoch) : undefined;
    this.initialized = false;
    this.pendingDrops.length = 0;
    this.mask.setSampler(this.fastSampler ?? (cheap.sampleBoundary
      ? (x, z, epoch) => cheap.sampleBoundary!(x, z, epoch)
      : (x, z, epoch) => {
        const sample = query.sample({ x, y: 0, z }, epoch);
        return { ...sample, flowX: sample.flowVelocity.x, flowZ: sample.flowVelocity.z };
      }));
  }

  /** Explicit terrain/support changes discard stale history immediately on the
   * next render step; the new mask is admitted in the usual bounded row budget. */
  invalidateBoundary(): void {
    this.mask.invalidateProgressively(); this.initialized = false; this.pendingDrops.length = 0;
  }

  /** Optional explicit injection for query adapters without levelOffsets. */
  setLevelOffsets(tide: number, season: number): void {
    if (this.mask.setLevelOffsets(tide, season)) {
      this.initialized = false; this.pendingDrops.length = 0;
    }
  }

  addDrop(x: number, z: number, radiusM: number, strength: number): void {
    if (this.disposed || ![x, z, radiusM, strength].every(Number.isFinite) || radiusM <= 0 || strength === 0) return;
    if (this.pendingDrops.length >= MAX_DROPS) return;
    this.pendingDrops.push({ x, z, radiusM: Math.min(this.maxDropRadiusM, radiusM), strength: THREE.MathUtils.clamp(strength, -0.3, 0.3) });
  }

  step(renderer: THREE.WebGLRenderer, focusX: number, focusZ: number, deltaS: number): void {
    if (this.disposed || ![focusX, focusZ, deltaS].every(Number.isFinite) || deltaS < 0) return;
    const plan = this.scheduler.advance(focusX, focusZ, deltaS);
    const epoch = this.epoch();
    const levels = this.levels?.(epoch);
    if (levels) this.setLevelOffsets(levels.tide, levels.season);
    const maskChanged = this.mask.update(this.center.x, this.center.y, epoch, deltaS);
    if (maskChanged) {
      this.maskTexture.image.data = this.mask.data; this.maskTexture.needsUpdate = true;
      this.currentTexture.image.data = this.mask.current; this.currentTexture.needsUpdate = true;
    }
    for (const material of [this.copy, this.drop, this.update, this.advect]) {
      material.uniforms.uMaskOffset.value.set((this.center.x - this.mask.center.x) / this.patchM, (this.center.y - this.mask.center.y) / this.patchM);
    }
    const target = renderer.getRenderTarget();
    const tone = renderer.toneMapping;
    const autoClear = renderer.autoClear;
    const color = renderer.getClearColor(new THREE.Color());
    const alpha = renderer.getClearAlpha();
    const viewport = renderer.getViewport(new THREE.Vector4());
    const scissor = renderer.getScissor(new THREE.Vector4());
    const scissorTest = renderer.getScissorTest();
    try {
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.autoClear = false;
      renderer.setScissorTest(false);
      if (!this.initialized) {
        renderer.setClearColor(0, 0);
        renderer.setRenderTarget(this.a); renderer.clear();
        renderer.setRenderTarget(this.b); renderer.clear();
        this.initialized = true;
      }
      if (plan.shiftX !== 0 || plan.shiftZ !== 0 || maskChanged) {
        this.copy.uniforms.uShift.value.set(plan.shiftX, plan.shiftZ);
        this.renderPass(renderer, this.copy);
      }
      let count = 0;
      for (const d of this.pendingDrops) {
        const label = this.mask.labelAt(d.x, d.z);
        const u = (d.x - this.center.x) / this.patchM + 0.5;
        const v = (d.z - this.center.y) / this.patchM + 0.5;
        if (!label || u < 0 || v < 0 || u > 1 || v > 1) continue;
        this.drop.uniforms.uDrops.value[count].set(u, v, Math.max(d.radiusM, this.patchM / this.scheduler.size) / this.patchM, d.strength);
        this.drop.uniforms.uDropBodies.value[count].set((label & 255) / 255, (label >>> 8) / 255);
        count++;
      }
      this.pendingDrops.length = 0;
      if (count) { this.drop.uniforms.uDropCount.value = count; this.renderPass(renderer, this.drop); }
      for (let i = 0; i < plan.steps; i++) {
        if (this.mask.hasCurrent) this.renderPass(renderer, this.advect);
        this.renderPass(renderer, this.update);
      }
    } finally {
      renderer.setRenderTarget(target);
      renderer.setViewport(viewport); renderer.setScissor(scissor); renderer.setScissorTest(scissorTest);
      renderer.setClearColor(color, alpha);
      renderer.toneMapping = tone; renderer.autoClear = autoClear;
    }
  }

  /** Invisible remote patches do no mask/solver work. Discard their history
   * and queued events rather than replaying stale splashes upon reactivation. */
  suspend(): void {
    this.pendingDrops.length = 0;
    this.initialized = false;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pendingDrops.length = 0;
    this.a.dispose(); this.b.dispose(); this.maskTexture.dispose(); this.currentTexture.dispose();
    this.copy.dispose(); this.update.dispose(); this.drop.dispose(); this.advect.dispose();
    this.quad.geometry.dispose(); this.scene.clear();
  }

  private renderPass(renderer: THREE.WebGLRenderer, material: THREE.ShaderMaterial): void {
    material.uniforms.uPrev.value = this.a.texture;
    this.quad.material = material;
    renderer.setRenderTarget(this.b);
    renderer.render(this.scene, this.camera);
    [this.a, this.b] = [this.b, this.a];
  }
}
