import * as THREE from "three";
import { WAVES, gerstnerGlsl, standingRatioGlsl, surfGlsl } from "../waves";
import { SHORE_FROTH_GLSL } from "./shoreFroth";

/**
 * Persistent foam ENERGY field (Greenheck study §1.3, §3.1 (1), §6): one
 * camera-centred half-float ping-pong, ~512 m a side, snapped to whole
 * texels, holding foam energy E with memory. Per frame, one fullscreen pass:
 *
 *   E' = E(p − flow·dt) · exp(−dt / decayTime)
 *      + (crestEq·fold + windEq·windward + surfEq·surf) · (1 − exp(−dt / decayTime))
 *      + injections
 *
 * - **Advected by the compiled flow raster** (semi-Lagrangian back-trace):
 *   river foam drifts downstream and persists, a plunge pool looks fed.
 * - `fold` is the same wave crest the surface renders (waves.ts GLSL twin,
 *   the fragment's `smoothstep(0.16, 0.34, height)` measure), `windward` the
 *   wind-facing slope, `surf` the bore energy inside the shoreline froth
 *   band — surf foam lingers on the sand and drains back.
 * - Decay ~0.5 s at sea, 2–4 s in sheltered/still water (a function of wave
 *   exposure), ~1 s on texels that have dried.
 * - Injections (≤ 32 a frame) are swept segments with a radius: wading and
 *   contact paths, splashes, plunge pools, strip aeration.
 *
 * The surface fragment samples it with `FOAM_FIELD_GLSL` and takes
 * `max(instantaneous, field)` in front of the UNCHANGED dissolve, so beyond
 * the field the stateless path continues with no seam. Deterministic: no
 * RNG anywhere. Tier-gated by size (512 high, 256 low, or absent).
 */

export const FOAM_FIELD_M = 512;
export const MAX_FOAM_INJECTIONS = 32;
/** Longest back-trace per frame (s): bounds the semi-Lagrangian step. */
const MAX_STEP_S = 0.1;

/** Energy law constants — uniforms so the probe can retune without a
 * recompile. Equilibrium energy at a sustained sharp fold / a fully
 * wind-facing face / inside the surf band, and the two decay e-folds. */
export const FOAM_LAW = {
  crestEq: 0.8,
  windwardEq: 0.3,
  surfEq: 0.7,
  decaySeaS: 0.5,
  decaySlowS: 3.0,
  decayDryS: 1.0,
  /** Slope at which a face counts as fully wind-facing. */
  windwardSlope: 0.12,
} as const;

/** CPU twin of the pass's decay time: fast at sea, slow when sheltered. */
export function foamDecayTime(exposure: number, dry: boolean): number {
  const e = Math.min(Math.max(exposure, 0), 1);
  const t = FOAM_LAW.decaySlowS + (FOAM_LAW.decaySeaS - FOAM_LAW.decaySlowS) * e;
  return dry ? Math.min(t, FOAM_LAW.decayDryS) : t;
}

/** CPU twin of one field step at a texel with no advection: returns E'.
 * Exact integration of dE/dt = −E/τ + src, so the equilibrium `src·τ` (=
 * crestEq at a sustained fold) does not depend on the frame rate. */
export function foamStep(E: number, dt: number, exposure: number, fold: number, windward: number, surf: number,
  dry = false, windWave = 1): number {
  const tau = foamDecayTime(exposure, dry);
  const expo01 = Math.min(Math.max(exposure, 0), 1);
  const gust = Math.min(Math.max(windWave - 0.8, 0), 2) * 0.5;
  const eq = (FOAM_LAW.crestEq * fold + FOAM_LAW.windwardEq * windward * gust) * expo01 + FOAM_LAW.surfEq * surf;
  const keep = Math.exp(-dt / tau);
  return Math.min(Math.max(E * keep + eq * (1 - keep), 0), 2);
}

/** CPU twin of the injection kernel: a soft disc of `radius` around the
 * nearest point of the segment, `strength` at the centre. */
export function foamInjectKernel(distM: number, radiusM: number, strength: number): number {
  const r = Math.max(radiusM, 0.05);
  const t = Math.min(Math.max((distM - 0.35 * r) / (r - 0.35 * r), 0), 1);
  return strength * (1 - t * t * (3 - 2 * t));
}

/** Snap a focus to the field's texel grid and give the uv shift that maps
 * the new frame's uv onto the previous frame's texture. */
export function foamFieldRecentre(prevCx: number, prevCz: number, focusX: number, focusZ: number, size: number,
  worldSizeM: number = FOAM_FIELD_M): { cx: number; cz: number; shiftU: number; shiftV: number } {
  const texel = worldSizeM / size;
  const cx = Math.round(focusX / texel) * texel;
  const cz = Math.round(focusZ / texel) * texel;
  const first = !Number.isFinite(prevCx) || !Number.isFinite(prevCz);
  return { cx, cz, shiftU: first ? 0 : (cx - prevCx) / worldSizeM, shiftV: first ? 0 : (cz - prevCz) / worldSizeM };
}

/** Fragment-side sampler: include in the water material, feed
 * `uFoamField` / `uFoamFieldInfo` from `FoamField.texture` / `.info`. */
export const FOAM_FIELD_GLSL = /* glsl */ `
uniform sampler2D uFoamField;
uniform vec4 uFoamFieldInfo;   // centre x, centre z, world size (m), active
float esFoamFieldAt(vec2 wp){
  if (uFoamFieldInfo.w < 0.5) return 0.0;
  vec2 uv = (wp - uFoamFieldInfo.xy) / uFoamFieldInfo.z + 0.5;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return 0.0;
  vec2 e = smoothstep(0.0, 0.06, uv) * smoothstep(0.0, 0.06, 1.0 - uv);
  return texture2D(uFoamField, uv).r * e.x * e.y;
}
`;

export interface FoamFieldUniforms {
  uFoamField: { value: THREE.Texture | null };
  uFoamFieldInfo: { value: THREE.Vector4 };
}
export function createFoamFieldUniforms(): FoamFieldUniforms {
  return { uFoamField: { value: null }, uFoamFieldInfo: { value: new THREE.Vector4(0, 0, FOAM_FIELD_M, 0) } };
}

export interface FoamFieldOptions {
  /** Texels a side (512 high tier, 256 low). */
  size: number;
  worldSizeM?: number;
  /** The water material's raster samplers (`SAMPLER_GLSL`) and noise
   * (`NOISE_GLSL`) — the pass decodes the SAME rasters the surface does. */
  samplerGlsl: string;
  noiseGlsl: string;
  /** The material's shared uniform objects (raster textures, levels, clocks);
   * the pass binds the very same objects so nothing is copied per frame. */
  uniforms: Record<string, THREE.IUniform>;
  /** Gerstner bands to evaluate (the tier's `waveBands`). */
  waveBands?: number;
  /** Compiled class order (`meta.klass.classes`) for the standing ratio. */
  classes: readonly string[];
}

const VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export function foamFieldFragment(opts: FoamFieldOptions): string {
  return /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uPrev;
  uniform vec2 uShift;
  uniform vec4 uField;        // centre x, centre z, world size (m), dt (s)
  uniform vec2 uWindDir;
  uniform vec4 uFoamLaw;      // crestEq, windwardEq, decaySea, decaySlow
  uniform vec3 uFoamLaw2;     // surfEq, decayDry, windwardSlope
  uniform vec4 uInjectA[${MAX_FOAM_INJECTIONS}];   // x0, z0, x1, z1
  uniform vec4 uInjectB[${MAX_FOAM_INJECTIONS}];   // radius, strength, -, -
  uniform int uInjectCount;
  ${opts.samplerGlsl}
  ${opts.noiseGlsl}
  ${gerstnerGlsl(opts.waveBands ?? WAVES.bands)}
  ${surfGlsl()}
  ${standingRatioGlsl(opts.classes)}
  ${SHORE_FROTH_GLSL}

  float esSegmentDist(vec2 p, vec2 a, vec2 b){
    vec2 ab = b - a;
    float l2 = max(dot(ab, ab), 1e-6);
    float t = clamp(dot(p - a, ab) / l2, 0.0, 1.0);
    return length(p - (a + ab * t));
  }

  void main(){
    float dt = uField.w;
    vec2 wp = uField.xy + (vUv - 0.5) * uField.z;
    // ---- hydraulics at this texel: the vertex stage's decode, verbatim ----
    vec2 surf = esSurfaceAt(wp);
    vec2 dUv = clamp(wp / uFlowExtentM, vec2(0.0), vec2(1.0));
    vec4 kl = texture2D(uKlassTex, dUv);
    vec4 fl = texture2D(uFlowTex, dUv);
    if (wp.x < 0.0 || wp.y < 0.0 || wp.x >= uFlowExtentM || wp.y >= uFlowExtentM) {
      kl = vec4(0.0, 0.25, 1.0, 1.0);
      fl = vec4(0.5, 0.5, 0.0, 1.0);
    }
    vec3 ss = esShoreAt(wp);
    float still = surf.x + uLevelTide * esTideResponse(kl.b) + uLevelSeason * ss.y;
    float depth = surf.y + (still - surf.x);
    float turb = max(kl.g, ss.z);
    float exposure = esWaveExposure(ss.x, depth, turb) * uWindWave;
    float expo01 = clamp(exposure, 0.0, 1.0);
    vec2 flow = (fl.xy - 0.5) * 2.0 * uFlowMax;
    // ---- 1. history: recentre shift + semi-Lagrangian back-trace along the flow
    vec2 prevUv = vUv + uShift - flow * dt / uField.z;
    float E = 0.0;
    if (all(greaterThanEqual(prevUv, vec2(0.0))) && all(lessThanEqual(prevUv, vec2(1.0)))) {
      E = texture2D(uPrev, prevUv).r;
    }
    // ---- 2. decay: fast at sea, slow when sheltered, drained once dry ------
    float tau = mix(uFoamLaw.w, uFoamLaw.z, expo01);
    if (depth <= 0.0) tau = min(tau, uFoamLaw2.y);
    float keep = exp(-dt / tau);
    E *= keep;
    // ---- 3. sources: equilibrium energies, integrated exactly over dt ------
    float eq = 0.0;
    if (exposure > 0.002) {
      float standing = esStandingRatio(kl.r * 255.0, ss.x);
      EsWave w = esWaveSampleEx(wp, exposure, ss.x, standing, uWaveTime);
      float fold = smoothstep(0.16, 0.34, w.height);
      float windward = clamp(dot(w.normal.xz, -uWindDir) / uFoamLaw2.z, 0.0, 1.0);
      float gust = clamp(uWindWave - 0.8, 0.0, 2.0) * 0.5;
      eq += (uFoamLaw.x * fold + uFoamLaw.y * windward * gust) * expo01;
    }
    if (ss.x < 90.0 && depth > -0.5) {
      // fetch ~30 m seaward (the vertex stage's shore frame)
      float eG = uSurfMpp * 2.0;
      vec2 gradD = vec2(esShoreAt(wp + vec2(eG, 0.0)).x - ss.x, esShoreAt(wp + vec2(0.0, eG)).x - ss.x) / eG;
      float gl = length(gradD);
      float seaD = gl > 0.05 ? esShoreAt(wp + gradD / gl * 30.0).x : ss.x;
      float fetch = esFetchExp(max(seaD, ss.x), turb);
      float windAmp = clamp(pow(uWindWave, 0.8), 0.6, 3.2);
      float bn = esFbm(wp * 0.16, 3);
      float surfE = esSurfFoam(ss.x + bn * 4.0, fetch, uWaveTime, windAmp) * esShoreFrothBand(depth, bn);
      eq += uFoamLaw2.x * surfE * (1.0 - 0.75 * clamp(turb, 0.0, 1.0));
    }
    E += eq * (1.0 - keep);
    // ---- 4. injections: swept segments with a soft radius ------------------
    for (int i = 0; i < ${MAX_FOAM_INJECTIONS}; i++) {
      if (i >= uInjectCount) break;
      vec4 A = uInjectA[i];
      vec2 B = uInjectB[i].xy;
      float r = max(B.x, 0.05);
      float d = esSegmentDist(wp, A.xy, A.zw);
      if (d >= r) continue;
      E += B.y * (1.0 - smoothstep(0.35 * r, r, d));
    }
    // ---- outer ring damped so a recentre never drags a hard edge inward ---
    float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
    E *= smoothstep(0.0, 0.04, edge);
    gl_FragColor = vec4(clamp(E, 0.0, 2.0), 0.0, 0.0, 1.0);
  }
  `;
}

interface Injection { x0: number; z0: number; x1: number; z1: number; radius: number; strength: number }

export class FoamField {
  readonly size: number;
  readonly worldSizeM: number;
  readonly center = new THREE.Vector2(NaN, NaN);
  /** Feed the water material: (centre x, centre z, world size, active). */
  readonly info = new THREE.Vector4(0, 0, FOAM_FIELD_M, 0);
  private a: THREE.WebGLRenderTarget;
  private b: THREE.WebGLRenderTarget;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly pass: THREE.ShaderMaterial;
  private readonly pending: Injection[] = [];
  private initialized = false;
  private disposed = false;

  constructor(opts: FoamFieldOptions) {
    this.size = Math.max(64, Math.min(1024, Math.round(opts.size)));
    this.worldSizeM = opts.worldSizeM ?? FOAM_FIELD_M;
    this.info.z = this.worldSizeM;
    const makeTarget = () => {
      const rt = new THREE.WebGLRenderTarget(this.size, this.size, {
        type: THREE.HalfFloatType, format: THREE.RGBAFormat,
        minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false,
      });
      rt.texture.colorSpace = THREE.NoColorSpace;
      rt.texture.generateMipmaps = false;
      return rt;
    };
    this.a = makeTarget();
    this.b = makeTarget();
    this.pass = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: foamFieldFragment(opts),
      uniforms: {
        ...opts.uniforms,
        uPrev: { value: null },
        uShift: { value: new THREE.Vector2() },
        uField: { value: new THREE.Vector4(0, 0, this.worldSizeM, 0) },
        uWindDir: { value: new THREE.Vector2(WAVES.windDir[0], WAVES.windDir[1]) },
        uFoamLaw: { value: new THREE.Vector4(FOAM_LAW.crestEq, FOAM_LAW.windwardEq, FOAM_LAW.decaySeaS, FOAM_LAW.decaySlowS) },
        uFoamLaw2: { value: new THREE.Vector3(FOAM_LAW.surfEq, FOAM_LAW.decayDryS, FOAM_LAW.windwardSlope) },
        uInjectA: { value: Array.from({ length: MAX_FOAM_INJECTIONS }, () => new THREE.Vector4()) },
        uInjectB: { value: Array.from({ length: MAX_FOAM_INJECTIONS }, () => new THREE.Vector4()) },
        uInjectCount: { value: 0 },
      },
      depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.pass);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  get texture(): THREE.Texture { return this.a.texture; }
  /** The energy-law uniforms (probe retuning). */
  get law(): { uFoamLaw: THREE.Vector4; uFoamLaw2: THREE.Vector3 } {
    return { uFoamLaw: this.pass.uniforms.uFoamLaw.value, uFoamLaw2: this.pass.uniforms.uFoamLaw2.value };
  }
  get pendingCount(): number { return this.pending.length; }

  /** Deposit `strength` energy in a soft disc (an instantaneous deposit —
   * continuous sources multiply their rate by dt themselves). */
  inject(x: number, z: number, radiusM: number, strength: number): void {
    this.injectPath(x, z, x, z, radiusM, strength);
  }

  /** Deposit along the path travelled since the last frame (a swept
   * footprint, never a dotted line of points). */
  injectPath(x0: number, z0: number, x1: number, z1: number, widthM: number, strength: number): void {
    if (this.disposed || ![x0, z0, x1, z1, widthM, strength].every(Number.isFinite)) return;
    if (widthM <= 0 || strength <= 0 || this.pending.length >= MAX_FOAM_INJECTIONS) return;
    this.pending.push({ x0, z0, x1, z1, radius: Math.min(widthM, 24), strength: Math.min(strength, 2) });
  }

  /** One field step: recentre on the focus, advect, decay, deposit. Call
   * once per rendered frame before the water pass. */
  update(renderer: THREE.WebGLRenderer, focusX: number, focusZ: number, deltaS: number): void {
    if (this.disposed || ![focusX, focusZ, deltaS].every(Number.isFinite)) return;
    const dt = Math.min(Math.max(deltaS, 0), MAX_STEP_S);
    const plan = foamFieldRecentre(this.center.x, this.center.y, focusX, focusZ, this.size, this.worldSizeM);
    this.center.set(plan.cx, plan.cz);
    this.info.set(plan.cx, plan.cz, this.worldSizeM, 1);
    const u = this.pass.uniforms;
    u.uShift.value.set(plan.shiftU, plan.shiftV);
    u.uField.value.set(plan.cx, plan.cz, this.worldSizeM, dt);
    let count = 0;
    for (const p of this.pending) {
      u.uInjectA.value[count].set(p.x0, p.z0, p.x1, p.z1);
      u.uInjectB.value[count].set(p.radius, p.strength, 0, 0);
      count++;
    }
    this.pending.length = 0;
    u.uInjectCount.value = count;

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
      u.uPrev.value = this.a.texture;
      renderer.setRenderTarget(this.b);
      renderer.render(this.scene, this.camera);
      [this.a, this.b] = [this.b, this.a];
    } finally {
      renderer.setRenderTarget(target);
      renderer.setViewport(viewport); renderer.setScissor(scissor); renderer.setScissorTest(scissorTest);
      renderer.setClearColor(color, alpha);
      renderer.toneMapping = tone; renderer.autoClear = autoClear;
    }
  }

  /** Hidden tab / teleport: forget the history rather than replay it. */
  suspend(): void {
    this.pending.length = 0;
    this.initialized = false;
    this.center.set(NaN, NaN);
    this.info.w = 0;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pending.length = 0;
    this.a.dispose(); this.b.dispose(); this.pass.dispose();
    this.quad.geometry.dispose(); this.scene.clear();
  }
}
