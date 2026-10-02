import * as THREE from "three";
import { NodeMaterial, QuadMesh, RenderTarget, type WebGPURenderer } from "three/webgpu";
import * as TSLNS from "three/tsl";
import { sel, type TslNode } from "../nodes/materialNodes";
import bloomConfig from "./bloom.config.json";
// TSL typings are too deep for tsc to check usefully (0107 §1): the graph is typed as TslNode.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const {
  clamp, dot, exp, float, getViewPosition, log2, max, min, normalize, reference, sRGBTransferOETF, step,
  texture, uniform, uv, vec2, vec3, vec4,
} = TSLNS as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const n = (v: TslNode): any => v;

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
 * The passes are TSL node materials on fullscreen quads (decision 0111),
 * never three's `bloom()` node: that one thresholds before exposure, has no
 * sky mask, no bloom-source layer and composites before tone mapping. The
 * composite draws straight onto the canvas with the renderer's tone mapping
 * and output colour space switched off for that one draw, so the glow is
 * added to the display-referred frame exactly as before.
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
 * knee, then `(br - threshold) / br`. The prefilter graph is this.
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
 * by `skyThreshold`, clamped to `skyMax`. The prefilter's `pick` is this.
 */
export function bloomSource(br: number, sky: boolean, o: Required<BloomOptions> = BLOOM_DEFAULTS,
  degFromSun = 0): number {
  if (!sky) return br * bloomWeight(br, o.threshold, o.knee);
  if (degFromSun > o.sunHaloDeg) return 0;
  return Math.min(br * bloomWeight(br, o.skyThreshold, o.skyKnee), o.skyMax);
}

// ---- node graphs (TSL; one build serves WebGPU and WebGL2, decision 0111) ----
// Each pass is a NodeMaterial on its own QuadMesh, built once in the
// constructor (0108 rule 2); per frame only uniform and texture values change.

/** The sun-disc test's uniforms, shared by the prefilter and the census. */
interface DiscUniforms { invProj: TslNode; camRot: TslNode; sunDir: TslNode; sunCos: TslNode }

/** Is the view ray through `uvn` within `sunHaloDeg` of the sun? The dome
 * clamps the Preetham disc into its own halo (WorldSky `min(texColor, 50)`),
 * so no brightness separates disc from halo; the disc's direction does. The
 * ray is from the NEAR plane (depth 0 in either backend's clip space,
 * `getViewPosition` flips and remaps per backend), rotated to world; never
 * the far-plane world point minus the camera: at near 0.3 m and far 60 km
 * that point is a float32 cancellation that moved the cone off the disc
 * (walk 9, 06:30). */
function inSunDisc(uvn: TslNode, d: DiscUniforms): TslNode {
  const v = n(getViewPosition(uvn, float(0.0), d.invProj));
  return n(dot(normalize(n(d.camRot).mul(v)), d.sunDir)).greaterThanEqual(d.sunCos);
}

/** Brightest channel. */
const maxc = (c: TslNode): TslNode => max(n(c).r, max(n(c).g, n(c).b));

function quadMaterial(colour: TslNode, name: string, additive = false): NodeMaterial {
  const m = new NodeMaterial();
  m.fragmentNode = vec4(colour, 1.0);
  m.depthTest = false;
  m.depthWrite = false;
  m.toneMapped = false;
  m.fog = false;
  m.name = name;
  if (additive) {
    m.blending = THREE.CustomBlending;
    m.blendSrc = THREE.OneFactor;
    m.blendDst = THREE.OneFactor;
  }
  return m;
}

function mipTarget(depth: boolean): RenderTarget {
  const t = new RenderTarget(2, 2, {
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

/** Dual-filter downsample of `src` (5 taps, centre ×4). */
function downGraph(src: TslNode, texel: TslNode): TslNode {
  const vUv = n(uv());
  const o = n(texel).mul(0.5);
  const at = (p: TslNode) => n(n(src).sample(p)).rgb;
  return n(at(vUv)).mul(4.0)
    .add(at(vUv.sub(o))).add(at(vUv.add(o)))
    .add(at(vUv.add(vec2(o.x, o.y.negate())))).add(at(vUv.sub(vec2(o.x, o.y.negate()))))
    .div(8.0);
}

/** Dual-filter upsample of `src` (8 taps, the diagonals ×2). */
function upGraph(src: TslNode, texel: TslNode): TslNode {
  const vUv = n(uv());
  const o = n(texel).mul(0.5);
  const at = (x: TslNode, y: TslNode, w: number) => n(n(n(src).sample(vUv.add(vec2(x, y)))).rgb).mul(w);
  const z = float(0.0);
  return n(at(o.x.mul(-2.0), z, 1)).add(at(o.x.negate(), o.y, 2)).add(at(z, o.y.mul(2.0), 1))
    .add(at(o.x, o.y, 2)).add(at(o.x.mul(2.0), z, 1)).add(at(o.x, o.y.negate(), 2))
    .add(at(z, o.y.mul(-2.0), 1)).add(at(o.x.negate(), o.y.negate(), 2))
    .div(12.0);
}

/** Row stride (bytes) of a `readRenderTargetPixelsAsync` result: WebGPU pads
 * each row to 256 bytes, WebGL packs them. */
function rowStride(bytes: number, w: number, h: number, bpt: number): number {
  return h > 1 ? (bytes - w * bpt) / (h - 1) : w * bpt;
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
  /** Glowing sky texels, and the farthest of them from `sunPx` (mip-0 texels; -1 off-frame). */
  glowCount: number;
  glowReachPx: number;
  /** Glowing texels whose CPU view ray is outside the cone (+0.25 deg slack): must be 0. */
  glowOutsideCone: number;
  /** Where the sun's centre projects (mip-0 texels, row 0 at the bottom), or
   * null when it is behind the camera or off the frame: a probe that aims at
   * the sun reads this, never its own aim, to know the disc is in view. */
  sunPx: [number, number] | null;
  /** Brightest sky texel within 3 mip-0 texels of `sunPx` (exposed linear; 0 off-frame). */
  sunBr: number;
  /** Glowing texels within 3 mip-0 texels of `sunPx`. */
  sunGlow: number;
  /** Angle (deg) between the `peak` texel's view ray and the sun. */
  peakDegFromSun: number;
  /** Raw scene depth and linear colour (pre-exposure) at `sunPx`; null off-frame. */
  sunTexel: { depth: number; rgb: [number, number, number] } | null;
}

/** The mip-0 texel (row 0 at the bottom) the direction `dir` projects to
 * through `camera`, or null when behind it or off a `w`×`h` frame. */
export function sunPixel(camera: THREE.Camera, dir: THREE.Vector3, w: number, h: number): [number, number] | null {
  const view = dir.clone().transformDirection(camera.matrixWorldInverse);
  if (view.z >= 0) return null;
  const ndc = view.applyMatrix4(camera.projectionMatrix);
  const x = Math.floor((ndc.x * 0.5 + 0.5) * w);
  const y = Math.floor((ndc.y * 0.5 + 0.5) * h);
  return x < 0 || y < 0 || x >= w || y >= h ? null : [x, y];
}

/** World view ray (unit) through the centre of mip-0 texel (`x`, `y`): the
 * CPU twin of the shader's `inSunDisc` ray. */
export function pixelRay(camera: THREE.Camera, x: number, y: number, w: number, h: number): THREE.Vector3 {
  // the near plane: NDC z -1 in WebGL clip space, 0 in WebGPU's
  const near = camera.coordinateSystem === THREE.WebGPUCoordinateSystem ? 0 : -1;
  return new THREE.Vector3(((x + 0.5) / w) * 2 - 1, ((y + 0.5) / h) * 2 - 1, near)
    .applyMatrix4(camera.projectionMatrixInverse).transformDirection(camera.matrixWorld);
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
  readonly skyMax: { value: number };
  /** World direction TO the sun (unit); the app copies its light rig's into it each frame. */
  readonly sunDirection = new THREE.Vector3(0, -1, 0);
  /** 1: the sky glows only by `skyThreshold`/`skyMax`; 0: as scene content (probe A/B). */
  readonly skyMask = { value: 1 };
  /** The last census `requestSkyCensus` asked for (probes), else null; filled
   * when its GPU read-back resolves (a frame or two later). */
  lastSkyCensus: SkyCensus | null = null;
  private censusNext = false;
  private censusBusy = false;
  private readonly maxMips: number;
  /** Every level `maxMips` allows, allocated once; `active` of them are in use. */
  private readonly mips: RenderTarget[] = [];
  private active = 0;
  private readonly sunCos = { value: 1 };
  private readonly invProj = uniform(new THREE.Matrix4());
  private readonly camRot = uniform(new THREE.Matrix3());
  private readonly exposure = uniform(1);
  private readonly skyMaskNow = uniform(1);
  private readonly prefilterTexel = uniform(new THREE.Vector2());
  private readonly colorTex = texture(new THREE.Texture());
  private readonly depthTex = texture(new THREE.DepthTexture(1, 1));
  private readonly prefilter: QuadMesh;
  private readonly down: { quad: QuadMesh; texel: TslNode }[] = [];
  private readonly up: { quad: QuadMesh; texel: TslNode }[] = [];
  private readonly composite: QuadMesh;
  private readonly census: QuadMesh;
  private readonly texelRead: QuadMesh;
  private readonly texelAt = uniform(new THREE.Vector2());
  private censusTarget: RenderTarget | null = null;
  private readonly texelTarget = new RenderTarget(1, 1, { depthBuffer: false, type: THREE.FloatType });
  private readonly bufferSize = new THREE.Vector2();

  constructor(options: BloomOptions = {}) {
    const o = { ...BLOOM_DEFAULTS, ...options };
    this.threshold = { value: o.threshold };
    this.knee = { value: o.knee };
    this.strength = { value: o.strength };
    this.maxMips = o.maxMips;
    this.skyThreshold = { value: o.skyThreshold };
    this.skyKnee = { value: o.skyKnee };
    this.skyMax = { value: o.skyMax };
    this.sunCos.value = Math.cos(THREE.MathUtils.degToRad(o.sunHaloDeg));

    const ref = (obj: { value: unknown }, type: string) => reference("value", type, obj);
    const T = ref(this.threshold, "float"); const K = ref(this.knee, "float");
    const ST = ref(this.skyThreshold, "float"); const SK = ref(this.skyKnee, "float");
    const SM = ref(this.skyMax, "float");
    const disc: DiscUniforms = {
      invProj: this.invProj, camRot: this.camRot,
      sunDir: reference("value", "vec3", { value: this.sunDirection }), sunCos: ref(this.sunCos, "float"),
    };
    const isSky = (uvn: TslNode) => n(n(this.depthTex).sample(uvn)).x.greaterThanEqual(BLOOM_SKY_DEPTH);

    // 1. prefilter: exposed colour, scene or sky threshold, Karis-weighted 4-tap
    const pick = (uvn: TslNode): TslNode => {
      const c = n(n(n(this.colorTex).sample(uvn)).rgb).mul(this.exposure);
      const br = n(maxc(c));
      const sky = n(this.skyMaskNow).greaterThan(0.5).and(isSky(uvn));
      const t = n(sel(sky, ST, T));
      const k = n(max(sel(sky, SK, K), 1e-5));
      let soft = n(clamp(br.sub(t).add(k), 0.0, k.mul(2.0)));
      soft = soft.mul(soft).div(k.mul(4.0).add(1e-5));
      const safeBr = n(max(br, 1e-5));
      let w = n(max(soft, br.sub(t))).div(safeBr);
      // the sun's halo: a fixed ceiling, never the size of the bright sky
      w = n(sel(sky, min(w, n(SM).div(safeBr)), w));
      // Karis weight: one hot texel cannot flicker the whole glow
      const out = c.mul(w).div(br.mul(w).add(1.0));
      // the sky glows only at the sun's disc
      return sel(sky.and(inSunDisc(uvn, disc).not()), vec3(0.0), out);
    };
    {
      const vUv = n(uv());
      const o2 = n(this.prefilterTexel).mul(0.5);
      let c = n(pick(vUv.add(vec2(o2.x.negate(), o2.y.negate())))).add(pick(vUv.add(vec2(o2.x, o2.y.negate()))))
        .add(pick(vUv.add(vec2(o2.x.negate(), o2.y)))).add(pick(vUv.add(vec2(o2.x, o2.y))));
      // undo the Karis compression on the average
      c = c.mul(0.25);
      c = c.div(max(float(1.0).sub(maxc(c)), 1e-3));
      const m = quadMaterial(c, "es-bloom-prefilter");
      // writes the scene depth so the bloom-source layer depth-tests against it
      m.depthNode = n(n(this.depthTex).sample(vUv)).x;
      m.depthTest = true;
      m.depthWrite = true;
      m.depthFunc = THREE.AlwaysDepth;
      this.prefilter = new QuadMesh(m);
    }

    // 2/3. the chain: every level maxMips allows, its materials bound once
    for (let i = 0; i < this.maxMips; i++) this.mips.push(mipTarget(i === 0));
    for (let i = 1; i < this.maxMips; i++) {
      const dt = uniform(new THREE.Vector2());
      this.down.push({ quad: new QuadMesh(quadMaterial(downGraph(texture(this.mips[i - 1].texture), dt), `es-bloom-down-${i}`)), texel: dt });
      const ut = uniform(new THREE.Vector2());
      this.up.push({ quad: new QuadMesh(quadMaterial(upGraph(texture(this.mips[i].texture), ut), `es-bloom-up-${i}`, true)), texel: ut });
    }

    // 4. composite: mip 0 × strength, soft-clamped, sRGB-encoded, added to the canvas
    {
      const g = n(n(texture(this.mips[0].texture)).sample(uv())).rgb;
      const b = n(float(1.0).sub(exp(g.negate().mul(ref(this.strength, "float")))));
      this.composite = new QuadMesh(quadMaterial(n(sRGBTransferOETF(vec4(b, 1.0))).rgb, "es-bloom-composite", true));
    }

    // probe census (`measureSky`): per texel, is it sky (r), would the scene
    // threshold let it glow (g: the walk-9 behaviour), does it glow now (b),
    // and the sky texel's exposed brightness, log-encoded (a: log2(1 + br) / 12)
    {
      const vUv = n(uv());
      const c = n(n(n(this.colorTex).sample(vUv)).rgb).mul(this.exposure);
      const br = n(maxc(c));
      const sky = n(step(BLOOM_SKY_DEPTH, n(n(this.depthTex).sample(vUv)).x));
      const inDisc = n(sel(inSunDisc(vUv, disc), float(1.0), float(0.0)));
      const m = new NodeMaterial();
      m.fragmentNode = vec4(sky, sky.mul(step(n(T).sub(K), br)), sky.mul(inDisc).mul(step(n(ST).sub(SK), br)),
        sky.mul(clamp(n(log2(br.add(1.0))).div(12.0), 0.0, 1.0)));
      m.depthTest = false; m.depthWrite = false; m.toneMapped = false; m.name = "es-bloom-census";
      this.census = new QuadMesh(m);
      const r = new NodeMaterial();
      r.fragmentNode = vec4(n(n(this.colorTex).sample(this.texelAt)).rgb, n(n(this.depthTex).sample(this.texelAt)).x);
      r.depthTest = false; r.depthWrite = false; r.toneMapped = false; r.name = "es-bloom-texel-read";
      this.texelRead = new QuadMesh(r);
    }
  }

  /** Levels currently in use (tests, HUD). */
  get mipCount(): number { return this.active; }

  /** Render targets of the chain in use, mip 0 first (tests, probes). */
  get targetSizes(): [number, number][] { return this.mips.slice(0, this.active).map((t) => [t.width, t.height]); }

  /** The uniform values the next draw uses (tests). */
  get uniformValues(): { exposure: number; skyMask: number; texel: [number, number]; sunCos: number } {
    const t = this.prefilterTexel.value as THREE.Vector2;
    return { exposure: this.exposure.value as number, skyMask: this.skyMaskNow.value as number, texel: [t.x, t.y], sunCos: this.sunCos.value };
  }

  private resize(w: number, h: number): void {
    const sizes = bloomMipSizes(w, h, this.maxMips);
    this.active = sizes.length;
    sizes.forEach(([mw, mh], i) => {
      const t = this.mips[i];
      if (t.width !== mw || t.height !== mh) t.setSize(mw, mh);
      if (i > 0) {
        const src = this.mips[i - 1];
        (this.down[i - 1].texel.value as THREE.Vector2).set(1 / src.width, 1 / src.height);
        (this.up[i - 1].texel.value as THREE.Vector2).set(1 / mw, 1 / mh);
      }
    });
    (this.prefilterTexel.value as THREE.Vector2).set(1 / this.mips[0].width, 1 / this.mips[0].height);
  }

  /**
   * Glow the frame. `color`/`depth`: the linear HDR scene target the canvas
   * was blitted from (pre-exposure); `camera`/`scene`: for the bloom-source
   * layer. Draws onto the canvas (render target null) and restores the
   * renderer's target, clear, layer, tone-mapping and colour-space state.
   */
  render(
    renderer: WebGPURenderer,
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

    this.colorTex.value = color;
    if (depth) this.depthTex.value = depth;
    (this.prefilter.material as NodeMaterial).depthWrite = depth !== null;
    this.skyMaskNow.value = depth ? this.skyMask.value : 0;
    this.exposure.value = this.lastExposure = renderer.toneMappingExposure;
    camera.updateMatrixWorld();
    (this.invProj.value as THREE.Matrix4).copy(camera.projectionMatrixInverse);
    (this.camRot.value as THREE.Matrix3).setFromMatrix4(camera.matrixWorld);
    if (this.censusNext && depth && !this.censusBusy) {
      this.censusNext = false;
      this.censusBusy = true;
      this.measureSky(renderer, camera.clone())
        .then((c) => { this.lastSkyCensus = c; })
        .finally(() => { this.censusBusy = false; });
    }
    renderer.setRenderTarget(this.mips[0]);
    renderer.clear(true, true, false);
    this.prefilter.render(renderer);
    if (depth) {
      camera.layers.mask = 1 << BLOOM_SOURCE_LAYER;
      renderer.render(scene, camera);
      camera.layers.mask = prevMask;
    }

    for (let i = 1; i < this.active; i++) {
      renderer.setRenderTarget(this.mips[i]);
      this.down[i - 1].quad.render(renderer);
    }
    for (let i = this.active - 1; i > 0; i--) {
      renderer.setRenderTarget(this.mips[i - 1]);
      this.up[i - 1].quad.render(renderer);
    }

    // Straight onto the canvas: with tone mapping and the output colour space
    // off, three draws to the canvas itself (no frame-buffer output pass that
    // would re-tone-map the frame), and the graph encodes sRGB on its own.
    const prevTone = renderer.toneMapping;
    const prevSpace = renderer.outputColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.setRenderTarget(null);
    this.composite.render(renderer);
    renderer.toneMapping = prevTone;
    renderer.outputColorSpace = prevSpace;

    renderer.setRenderTarget(prevTarget);
    renderer.autoClear = prevAuto;
  }

  /** Ask for one sky census on the next frame (`lastSkyCensus`; probes). */
  requestSkyCensus(): void { this.censusNext = true; this.lastSkyCensus = null; }

  /**
   * Fractions of the frame's texels (at mip-0 size) that are sky, and of the
   * SKY texels those the scene threshold would glow (`skyOverSceneThreshold`:
   * the walk-9 sun blob) and those that glow now (`skyGlowing`: the disc).
   * Rows are turned to row 0 at the bottom on either backend.
   */
  private async measureSky(renderer: WebGPURenderer, camera: THREE.Camera): Promise<SkyCensus> {
    const [w, h] = [this.mips[0].width, this.mips[0].height];
    const webgpu = Boolean((renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend);
    const exposure = renderer.toneMappingExposure;
    if (!this.censusTarget || this.censusTarget.width !== w || this.censusTarget.height !== h) {
      this.censusTarget?.dispose();
      this.censusTarget = new RenderTarget(w, h, { depthBuffer: false });
    }
    const target = this.censusTarget;
    renderer.setRenderTarget(target);
    this.census.render(renderer);
    const sun = sunPixel(camera, this.sunDirection, w, h);
    if (sun) {
      // texture rows run top-down in WebGPU, bottom-up in WebGL
      const v = (sun[1] + 0.5) / h;
      (this.texelAt.value as THREE.Vector2).set((sun[0] + 0.5) / w, webgpu ? 1 - v : v);
      renderer.setRenderTarget(this.texelTarget);
      this.texelRead.render(renderer);
    }
    const raw = await renderer.readRenderTargetPixelsAsync(target, 0, 0, w, h) as Uint8Array;
    const stride = rowStride(raw.byteLength, w, h, 4);
    const px = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      const srcRow = webgpu ? h - 1 - y : y;
      px.set(new Uint8Array(raw.buffer, raw.byteOffset + srcRow * stride, w * 4), y * w * 4);
    }
    let sky = 0; let over = 0; let glow = 0; let peakA = -1; let peak = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i] > 127) sky++;
      if (px[i + 1] > 127) over++;
      if (px[i + 2] > 127) glow++;
      if (px[i] > 127 && px[i + 3] > peakA) { peakA = px[i + 3]; peak = i / 4; }
    }
    const [x0, y0] = [peak % w, Math.floor(peak / w)];
    // Reach is measured from the sun's own texel, never from the brightest
    // sky texel (at noon that is horizon haze ~59 texels off: walk 9), and
    // each glowing texel's ray is re-tested on the CPU against the cone.
    const coneDeg = THREE.MathUtils.radToDeg(Math.acos(this.sunCos.value));
    let reach = 0; let outside = 0;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 2] <= 127) continue;
      const j = i / 4;
      const [x, y] = [j % w, Math.floor(j / w)];
      if (sun) reach = Math.max(reach, Math.hypot(x - sun[0], y - sun[1]));
      if (THREE.MathUtils.radToDeg(pixelRay(camera, x, y, w, h).angleTo(this.sunDirection)) > coneDeg + 0.25) outside++;
    }
    let sunBr = 0; let sunGlow = 0;
    if (sun) {
      for (let y = Math.max(0, sun[1] - 3); y <= Math.min(h - 1, sun[1] + 3); y++) {
        for (let x = Math.max(0, sun[0] - 3); x <= Math.min(w - 1, sun[0] + 3); x++) {
          const k = (y * w + x) * 4;
          if (px[k] > 127) sunBr = Math.max(sunBr, 2 ** ((px[k + 3] / 255) * 12) - 1);
          if (px[k + 2] > 127) sunGlow++;
        }
      }
    }
    let sunTexel: SkyCensus["sunTexel"] = null;
    if (sun) {
      const f = await renderer.readRenderTargetPixelsAsync(this.texelTarget, 0, 0, 1, 1) as Float32Array;
      sunTexel = { depth: f[3], rgb: [f[0], f[1], f[2]] };
    }
    const peakDegFromSun = THREE.MathUtils.radToDeg(pixelRay(camera, x0, y0, w, h).angleTo(this.sunDirection));
    return { sunTexel, sunPx: sun, sunBr, sunGlow, peakDegFromSun, skyFraction: sky / (w * h), skyOverSceneThreshold: sky ? over / sky : 0,
      skyGlowing: sky ? glow / sky : 0, exposure,
      maxSkyBr: peakA < 0 ? 0 : 2 ** ((peakA / 255) * 12) - 1, peak: [x0, y0],
      glowCount: glow, glowReachPx: sun ? reach : -1, glowOutsideCone: outside };
  }

  dispose(): void {
    for (const t of this.mips) t.dispose();
    this.mips.length = 0;
    this.active = 0;
    this.censusTarget?.dispose();
    this.texelTarget.dispose();
    const quads = [this.prefilter, this.composite, this.census, this.texelRead,
      ...this.down.map((d) => d.quad), ...this.up.map((u) => u.quad)];
    for (const q of quads) (q.material as THREE.Material).dispose();
  }
}
