import * as THREE from "three";
import bloomConfig from "./bloom.config.json";

/**
 * Soft glow around bright lights (owner 2026-10-01; decision 0108 post row):
 * a half-resolution dual-filter (Kawase-style) mip-chain bloom, the variant
 * the target-device research rates at 60 fps on both the Adreno 830 phone and
 * the M2 (docs/research/rendering/cheap-sky-and-post-effects-for-target-devices.md §2).
 *
 * One instance per renderer, injected by the host (engineering standard 8):
 * the water pipeline calls `render` once a frame after its on-screen passes.
 *
 * 1. prefilter → mip 0 (half the canvas): the linear HDR scene target times
 *    the renderer's exposure, kept above a soft-knee threshold in EXPOSED
 *    units, so the cut sits at the same place on the display by day and by
 *    night. The sky (depth at the far clear: the Preetham dome, its clouds
 *    and stars write no depth) is NOT scene content here (walk 9, owner: the
 *    sun bloomed into a white blob from 14:30 and at sunrise, because the
 *    authored exposure rises as the sun sinks while the Mie halo spreads, so
 *    a wide sky region passed the scene threshold). A sky texel feeds the
 *    glow only above `skyThreshold`, which only the sun's disc reaches, and
 *    never by more than `skyMax` (a quarter of a flame's mip-0 level), so the
 *    sun keeps a small halo of a fixed size at every altitude. The pass also
 *    writes the scene depth, so
 * 2. the bloom-source layer (flames; display-referred, drawn after the
 *    tone-mapped blit and so absent from the HDR target) is drawn into mip 0
 *    depth-tested against the scene;
 * 3. dual-filter downsample mip i → mip i+1, then upsample mip i+1 added into
 *    mip i, back to mip 0;
 * 4. composite: mip 0 × strength, soft-clamped and sRGB-encoded, added to the
 *    canvas (blend ONE, ONE).
 *
 * Disabled (`enabled = false`), `render` touches nothing and the frame is the
 * same frame as with no bloom at all.
 *
 * ---- WebGPU port (branch `webgpu`, decision 0111) ------------------------
 * TSL `bloom()` from `three/addons/tsl/display` is the same mip-chain shape;
 * the port keeps `bloomWeight` (threshold/knee in exposed units), the mip
 * count rule and the bloom-source layer, and composites in the
 * RenderPipeline output node instead of a fourth pass.
 * ---------------------------------------------------------------------------
 */

/** Layer the bloom-source meshes (flames, embers) carry IN ADDITION to their
 * own: rain shares the flames' post-water layer and must not glow. */
export const BLOOM_SOURCE_LAYER = 7; // 3-5 water/overlay/precip, 6 underwater bubbles

export interface BloomOptions {
  /** Exposed linear brightness (max channel) where the glow starts. */
  threshold?: number;
  /** Soft knee half-width in the same units: the glow fades in over
   * [threshold - knee, threshold + knee]. */
  knee?: number;
  /** Composite gain on the summed mip chain. */
  strength?: number;
  /** Upper bound on mips below mip 0. */
  maxMips?: number;
  /** Exposed brightness a SKY texel (depth at the far clear) must pass to
   * glow: above the Mie halo at every sun altitude, below the sun's disc. */
  skyThreshold?: number;
  /** The sky's own knee half-width: narrow, so the Mie halo just under the
   * disc never fades in (the shared knee made the walk-9 blob). */
  skyKnee?: number;
  /** Angular radius (deg) around the sun inside which a sky texel may glow:
   * the disc (0.53 deg) plus a little; the halo is never wider than this. */
  sunHaloDeg?: number;
  /** Most a sky texel adds to mip 0 (exposed linear): the sun's halo never
   * grows with exposure or with the halo's spread. */
  skyMax?: number;
}

/** The tuned values live in `bloom.config.json`; the sky pair is calibrated
 * by `apps/world-studio/scripts/probe-bloom-sky.mjs`. */
export const BLOOM_DEFAULTS: Required<BloomOptions> = {
  threshold: bloomConfig.threshold,
  knee: bloomConfig.knee,
  strength: bloomConfig.strength,
  maxMips: bloomConfig.maxMips,
  skyThreshold: bloomConfig.skyThreshold,
  skyKnee: bloomConfig.skyKnee,
  sunHaloDeg: bloomConfig.sunHaloDeg,
  skyMax: bloomConfig.skyMax,
};

/** A depth-buffer value at or above this is the far clear: no geometry, the sky. */
export const BLOOM_SKY_DEPTH = 0.9999999;

/** Smallest side a mip may have; below it the chain stops. */
const MIN_MIP_PX = 8;

/**
 * Sizes of the chain for a drawing buffer of `w`×`h`: mip 0 is half the
 * buffer, each next one half again, stopping before a side drops under 8 px
 * or after `maxMips` levels. Always at least one level.
 */
export function bloomMipSizes(w: number, h: number, maxMips = BLOOM_DEFAULTS.maxMips): [number, number][] {
  const out: [number, number][] = [];
  let mw = Math.max(1, Math.floor(w / 2));
  let mh = Math.max(1, Math.floor(h / 2));
  out.push([mw, mh]);
  while (out.length < maxMips) {
    mw = Math.floor(mw / 2);
    mh = Math.floor(mh / 2);
    if (mw < MIN_MIP_PX || mh < MIN_MIP_PX) break;
    out.push([mw, mh]);
  }
  return out;
}

/**
 * Fraction of a pixel's colour that feeds the glow, from its brightest
 * channel `br` (exposed linear): zero below `threshold - knee`, a quadratic
 * knee, then `(br - threshold) / br`. The GLSL in the prefilter is this.
 */
export function bloomWeight(br: number, threshold: number, knee: number): number {
  const k = Math.max(knee, 1e-5);
  let soft = Math.min(Math.max(br - threshold + k, 0), 2 * k);
  soft = (soft * soft) / (4 * k + 1e-5);
  return Math.max(soft, br - threshold) / Math.max(br, 1e-5);
}

/**
 * Brightest channel a texel of exposed brightness `br` adds to mip 0 before
 * the Karis weight: a scene texel by the scene threshold, a sky texel (`sky`)
 * by `skyThreshold`, clamped to `skyMax`. The GLSL `esPick` is this.
 */
export function bloomSource(br: number, sky: boolean, o: Required<BloomOptions> = BLOOM_DEFAULTS,
  degFromSun = 0): number {
  if (!sky) return br * bloomWeight(br, o.threshold, o.knee);
  if (degFromSun > o.sunHaloDeg) return 0;
  return Math.min(br * bloomWeight(br, o.skyThreshold, o.skyKnee), o.skyMax);
}

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

// Is a sky texel within `sunHaloDeg` of the sun? The dome clamps the
// Preetham disc into its own halo (WorldSky `min(texColor, 50)`), so no
// brightness separates disc from halo; the disc's direction does.
const SUN_DISC = /* glsl */ `
uniform mat4 uInvViewProj;
uniform vec3 uCamPos;
uniform vec3 uSunDir;
uniform float uSunCos;
bool esInSunDisc(vec2 uv) {
  vec4 p = uInvViewProj * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
  return dot(normalize(p.xyz / p.w - uCamPos), uSunDir) >= uSunCos;
}
`;

const PREFILTER = /* glsl */ `
uniform sampler2D uColor;
uniform sampler2D uDepth;
uniform vec2 uTexel;
uniform float uExposure;
uniform float uThreshold;
uniform float uKnee;
uniform float uSkyThreshold;
uniform float uSkyKnee;
uniform float uSkyMax;
uniform float uSkyMask;
varying vec2 vUv;
${SUN_DISC}
vec3 esPick(vec2 uv) {
  vec3 c = texture2D(uColor, uv).rgb * uExposure;
  float br = max(c.r, max(c.g, c.b));
  bool sky = uSkyMask > 0.5 && texture2D(uDepth, uv).x >= ${BLOOM_SKY_DEPTH.toFixed(7)};
  // the sky glows only at the sun's disc
  if (sky && !esInSunDisc(uv)) return vec3(0.0);
  float t = sky ? uSkyThreshold : uThreshold;
  float k = max(sky ? uSkyKnee : uKnee, 1e-5);
  float soft = clamp(br - t + k, 0.0, 2.0 * k);
  soft = soft * soft / (4.0 * k + 1e-5);
  float w = max(soft, br - t) / max(br, 1e-5);
  // the sun's halo: a fixed ceiling, never the size of the bright sky
  if (sky) w = min(w, uSkyMax / max(br, 1e-5));
  // Karis weight: one hot texel cannot flicker the whole glow
  return c * w / (1.0 + br * w);
}
void main() {
  vec2 o = uTexel * 0.5;
  vec3 c = esPick(vUv + vec2(-o.x, -o.y)) + esPick(vUv + vec2(o.x, -o.y))
         + esPick(vUv + vec2(-o.x, o.y)) + esPick(vUv + vec2(o.x, o.y));
  // undo the Karis compression on the average
  c *= 0.25;
  float m = max(c.r, max(c.g, c.b));
  c /= max(1.0 - m, 1e-3);
  gl_FragColor = vec4(c, 1.0);
  gl_FragDepth = texture2D(uDepth, vUv).x;
}
`;

// The probe's census (`measureSky`): per texel, is it sky (r), would the
// scene threshold let it glow (g: the walk-9 behaviour), does it glow now (b).
const SKY_CENSUS = /* glsl */ `
uniform sampler2D uColor;
uniform sampler2D uDepth;
uniform float uExposure;
uniform float uThreshold;
uniform float uKnee;
uniform float uSkyThreshold;
uniform float uSkyKnee;
varying vec2 vUv;
${SUN_DISC}
void main() {
  vec3 c = texture2D(uColor, vUv).rgb * uExposure;
  float br = max(c.r, max(c.g, c.b));
  float sky = step(${BLOOM_SKY_DEPTH.toFixed(7)}, texture2D(uDepth, vUv).x);
  float disc = esInSunDisc(vUv) ? 1.0 : 0.0;
  // a: the sky texel's exposed brightness, log-encoded (log2(1 + br) / 12)
  gl_FragColor = vec4(sky, sky * step(uThreshold - uKnee, br), sky * disc * step(uSkyThreshold - uSkyKnee, br),
    sky * clamp(log2(1.0 + br) / 12.0, 0.0, 1.0));
}
`;

const DOWN = /* glsl */ `
uniform sampler2D uSrc;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec2 o = uTexel * 0.5;
  vec3 c = texture2D(uSrc, vUv).rgb * 4.0;
  c += texture2D(uSrc, vUv - o).rgb;
  c += texture2D(uSrc, vUv + o).rgb;
  c += texture2D(uSrc, vUv + vec2(o.x, -o.y)).rgb;
  c += texture2D(uSrc, vUv - vec2(o.x, -o.y)).rgb;
  gl_FragColor = vec4(c / 8.0, 1.0);
}
`;

const UP = /* glsl */ `
uniform sampler2D uSrc;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec2 o = uTexel * 0.5;
  vec3 c = texture2D(uSrc, vUv + vec2(-o.x * 2.0, 0.0)).rgb;
  c += texture2D(uSrc, vUv + vec2(-o.x, o.y)).rgb * 2.0;
  c += texture2D(uSrc, vUv + vec2(0.0, o.y * 2.0)).rgb;
  c += texture2D(uSrc, vUv + vec2(o.x, o.y)).rgb * 2.0;
  c += texture2D(uSrc, vUv + vec2(o.x * 2.0, 0.0)).rgb;
  c += texture2D(uSrc, vUv + vec2(o.x, -o.y)).rgb * 2.0;
  c += texture2D(uSrc, vUv + vec2(0.0, -o.y * 2.0)).rgb;
  c += texture2D(uSrc, vUv + vec2(-o.x, -o.y)).rgb * 2.0;
  gl_FragColor = vec4(c / 12.0, 1.0);
}
`;

const COMPOSITE = /* glsl */ `
uniform sampler2D uSrc;
uniform float uStrength;
varying vec2 vUv;
void main() {
  vec3 b = 1.0 - exp(-texture2D(uSrc, vUv).rgb * uStrength);
  gl_FragColor = vec4(sRGBTransferOETF(vec4(b, 1.0)).rgb, 1.0);
}
`;

function pass(fragmentShader: string, uniforms: Record<string, THREE.IUniform>): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader,
    uniforms,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
}

function mipTarget(depth: boolean): THREE.WebGLRenderTarget {
  const t = new THREE.WebGLRenderTarget(2, 2, {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: depth,
    samples: 0,
  });
  t.texture.colorSpace = THREE.NoColorSpace;
  t.texture.generateMipmaps = false;
  return t;
}

/** One frame's sky census (`BloomPass.measureSky`). */
export interface SkyCensus {
  skyFraction: number;
  skyOverSceneThreshold: number;
  skyGlowing: number;
  exposure: number;
  /** Brightest sky texel (exposed linear, ~3 % steps) and where it is (mip-0 texels). */
  maxSkyBr: number;
  peak: [number, number];
  /** Glowing sky texels, and the farthest of them from `peak` (mip-0 texels). */
  glowCount: number;
  glowReachPx: number;
}

export class BloomPass {
  enabled = true;
  /** The renderer exposure the last frame was filtered at (probes, HUD). */
  lastExposure = 0;
  readonly threshold: { value: number };
  readonly knee: { value: number };
  readonly strength: { value: number };
  readonly skyThreshold: { value: number };
  readonly skyKnee: { value: number };
  /** World direction TO the sun (unit); the app copies its light rig's into it each frame. */
  readonly sunDirection = new THREE.Vector3(0, -1, 0);
  /** The sun-disc test's uniforms, shared by the prefilter and the census. */
  private readonly disc = {
    uInvViewProj: { value: new THREE.Matrix4() },
    uCamPos: { value: new THREE.Vector3() },
    uSunDir: { value: this.sunDirection },
    uSunCos: { value: 1 },
  };
  readonly skyMax: { value: number };
  /** 1: the sky glows only by `skyThreshold`/`skyMax`; 0: as scene content (probe A/B). */
  readonly skyMask = { value: 1 };
  /** The last census `requestSkyCensus` asked for (probes), else null. */
  lastSkyCensus: SkyCensus | null = null;
  private censusNext = false;
  private readonly maxMips: number;
  private readonly mips: THREE.WebGLRenderTarget[] = [];
  private readonly quad: THREE.Mesh;
  private readonly quadScene = new THREE.Scene();
  private readonly quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly prefilter: THREE.ShaderMaterial;
  private readonly down: THREE.ShaderMaterial;
  private readonly up: THREE.ShaderMaterial;
  private readonly composite: THREE.ShaderMaterial;
  private readonly bufferSize = new THREE.Vector2();

  constructor(options: BloomOptions = {}) {
    const o = { ...BLOOM_DEFAULTS, ...options };
    this.threshold = { value: o.threshold };
    this.knee = { value: o.knee };
    this.strength = { value: o.strength };
    this.maxMips = o.maxMips;
    this.skyThreshold = { value: o.skyThreshold };
    this.skyKnee = { value: o.skyKnee };
    this.disc.uSunCos.value = Math.cos(THREE.MathUtils.degToRad(o.sunHaloDeg));
    this.skyMax = { value: o.skyMax };
    this.prefilter = pass(PREFILTER, {
      uColor: { value: null }, uDepth: { value: null }, uTexel: { value: new THREE.Vector2() },
      uExposure: { value: 1 }, uThreshold: this.threshold, uKnee: this.knee,
      uSkyThreshold: this.skyThreshold, uSkyKnee: this.skyKnee, uSkyMax: this.skyMax, uSkyMask: { value: 1 },
      ...this.disc,
    });
    // writes the scene depth so the bloom-source layer depth-tests against it
    this.prefilter.depthTest = true;
    this.prefilter.depthWrite = true;
    this.prefilter.depthFunc = THREE.AlwaysDepth;
    this.down = pass(DOWN, { uSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.up = pass(UP, { uSrc: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.up.blending = THREE.CustomBlending;
    this.up.blendSrc = THREE.OneFactor;
    this.up.blendDst = THREE.OneFactor;
    this.composite = pass(COMPOSITE, { uSrc: { value: null }, uStrength: this.strength });
    this.composite.blending = THREE.CustomBlending;
    this.composite.blendSrc = THREE.OneFactor;
    this.composite.blendDst = THREE.OneFactor;
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.prefilter);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  /** Levels currently allocated (tests, HUD). */
  get mipCount(): number { return this.mips.length; }

  private draw(renderer: THREE.WebGLRenderer, material: THREE.Material, target: THREE.WebGLRenderTarget | null): void {
    this.quad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(this.quadScene, this.quadCamera);
  }

  private resize(w: number, h: number): void {
    const sizes = bloomMipSizes(w, h, this.maxMips);
    while (this.mips.length > sizes.length) this.mips.pop()!.dispose();
    while (this.mips.length < sizes.length) this.mips.push(mipTarget(this.mips.length === 0));
    sizes.forEach(([mw, mh], i) => {
      const t = this.mips[i];
      if (t.width !== mw || t.height !== mh) t.setSize(mw, mh);
    });
  }

  /**
   * Glow the frame. `color`/`depth`: the linear HDR scene target the canvas
   * was blitted from (pre-exposure); `camera`/`scene`: for the bloom-source
   * layer. Draws onto the canvas (render target null) and restores the
   * renderer's target, clear and layer state.
   */
  render(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    color: THREE.Texture,
    depth: THREE.Texture | null,
  ): void {
    if (!this.enabled) return;
    const size = renderer.getDrawingBufferSize(this.bufferSize);
    this.resize(size.x, size.y);
    const prevTarget = renderer.getRenderTarget();
    const prevAuto = renderer.autoClear;
    const prevMask = camera.layers.mask;
    renderer.autoClear = false;

    const pu = this.prefilter.uniforms;
    pu.uColor.value = color;
    pu.uDepth.value = depth;
    this.prefilter.depthWrite = depth !== null;
    pu.uSkyMask.value = depth ? this.skyMask.value : 0;
    pu.uTexel.value.set(1 / this.mips[0].width, 1 / this.mips[0].height);
    pu.uExposure.value = this.lastExposure = renderer.toneMappingExposure;
    camera.updateMatrixWorld();
    this.disc.uInvViewProj.value.multiplyMatrices(camera.matrixWorld, camera.projectionMatrixInverse);
    this.disc.uCamPos.value.setFromMatrixPosition(camera.matrixWorld);
    if (this.censusNext && depth) {
      this.censusNext = false;
      this.lastSkyCensus = this.measureSky(renderer, color, depth);
    }
    renderer.setRenderTarget(this.mips[0]);
    renderer.clear(true, true, false);
    this.draw(renderer, this.prefilter, this.mips[0]);
    if (depth) {
      camera.layers.mask = 1 << BLOOM_SOURCE_LAYER;
      renderer.render(scene, camera);
      camera.layers.mask = prevMask;
    }

    for (let i = 1; i < this.mips.length; i++) {
      const src = this.mips[i - 1];
      this.down.uniforms.uSrc.value = src.texture;
      this.down.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
      this.draw(renderer, this.down, this.mips[i]);
    }
    for (let i = this.mips.length - 1; i > 0; i--) {
      const src = this.mips[i];
      this.up.uniforms.uSrc.value = src.texture;
      this.up.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
      this.draw(renderer, this.up, this.mips[i - 1]);
    }

    this.composite.uniforms.uSrc.value = this.mips[0].texture;
    this.draw(renderer, this.composite, null);

    renderer.setRenderTarget(prevTarget);
    renderer.autoClear = prevAuto;
  }

  /** Ask for one sky census on the next frame (`lastSkyCensus`; probes). */
  requestSkyCensus(): void { this.censusNext = true; this.lastSkyCensus = null; }

  /**
   * Fractions of the frame's texels (at mip-0 size) that are sky, and of the
   * SKY texels those the scene threshold would glow (`skyOverSceneThreshold`:
   * the walk-9 sun blob) and those that glow now (`skyGlowing`: the disc).
   */
  private measureSky(renderer: THREE.WebGLRenderer, color: THREE.Texture, depth: THREE.Texture): SkyCensus {
    const [w, h] = [this.mips[0].width, this.mips[0].height];
    const target = new THREE.WebGLRenderTarget(w, h, { depthBuffer: false });
    const material = pass(SKY_CENSUS, {
      uColor: { value: color }, uDepth: { value: depth }, uExposure: { value: renderer.toneMappingExposure },
      uThreshold: this.threshold, uKnee: this.knee, uSkyThreshold: this.skyThreshold, uSkyKnee: this.skyKnee,
      ...this.disc,
    });
    this.draw(renderer, material, target);
    const px = new Uint8Array(w * h * 4);
    renderer.readRenderTargetPixels(target, 0, 0, w, h, px);
    let sky = 0; let over = 0; let glow = 0; let peakA = -1; let peak = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i] > 127) sky++;
      if (px[i + 1] > 127) over++;
      if (px[i + 2] > 127) glow++;
      if (px[i] > 127 && px[i + 3] > peakA) { peakA = px[i + 3]; peak = i / 4; }
    }
    const [x0, y0] = [peak % w, Math.floor(peak / w)];
    let reach = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 2] <= 127) continue;
      const j = i / 4;
      reach = Math.max(reach, Math.hypot((j % w) - x0, Math.floor(j / w) - y0));
    }
    target.dispose();
    material.dispose();
    return { skyFraction: sky / (w * h), skyOverSceneThreshold: sky ? over / sky : 0,
      skyGlowing: sky ? glow / sky : 0, exposure: renderer.toneMappingExposure,
      maxSkyBr: peakA < 0 ? 0 : 2 ** ((peakA / 255) * 12) - 1, peak: [x0, y0],
      glowCount: glow, glowReachPx: reach };
  }

  dispose(): void {
    for (const t of this.mips) t.dispose();
    this.mips.length = 0;
    for (const m of [this.prefilter, this.down, this.up, this.composite]) m.dispose();
    this.quad.geometry.dispose();
  }
}
