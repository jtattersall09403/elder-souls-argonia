import * as THREE from "three";
import { NodeMaterial, QuadMesh, RenderTarget, type WebGPURenderer } from "three/webgpu";
import * as TSLNS from "three/tsl";
import type { TslNode } from "../nodes/materialNodes";
import { deferBuildsInto } from "../shaderBuildQueue";
// TSL typings are too deep for tsc to check usefully (0107 §1): the graph is typed as TslNode.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { abs, float, floor, fract, max, perspectiveDepthToViewZ, texture, uniform, uv, vec2, vec4 } = TSLNS as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const n = (v: TslNode): any => v;

/**
 * The raymarched fire volumes at reduced resolution (vol10 F8a; design B5 in
 * tooling/.reports/16k/walk10/vol-fix-design.md, the three.js
 * webgpu_volume_fire example's reduced-resolution volumetric pass).
 *
 * The volume boxes (fx/fire/volumeFire.ts) carry `FIRE_VOLUME_LAYER` only, so
 * no scene pass draws them at full resolution. Once a frame, after the
 * post-water passes, this pass
 * 1. writes the scene depth into its own low-resolution depth buffer (one
 *    point sample per low texel), so the boxes depth-test against the scene;
 * 2. draws the volume layer into the low target (premultiplied, cleared to 0);
 * 3. composites onto the canvas with a depth-aware upsample: each frame pixel
 *    blends the four low texels around it, bilinear weights times a weight
 *    that falls with the RELATIVE view-depth gap between the pixel and the
 *    texel, so a flame never bleeds over a nearer edge (a hearth's cauldron)
 *    and an edge never punches a hole in the flame.
 *
 * The composite draws with the renderer's tone mapping and colour space as
 * the flame cards' own pass does: the volume material writes scene-referred
 * colour (`displayToScene`), exactly as it did drawn straight to the canvas.
 *
 * One instance per renderer, injected by the host (engineering standard 8).
 * The low target is made once and resized only when the drawing buffer
 * changes size; nothing is allocated per frame. `dispose` is for teardown
 * only (the host unmounts after its last frame).
 */

/** Layer the fire volume boxes draw on, and only on (3-5 water/overlay/precip,
 * 6 underwater bubbles, 7 bloom sources). */
export const FIRE_VOLUME_LAYER = 8;
/** The march's resolution share of the drawing buffer, per axis: half (the
 * design's desktop row); mobile quarter (design B6). */
export const FIRE_VOLUME_SCALE = { desktop: 0.5, mobile: 0.25 } as const;
/** Relative view-depth gap at which a low texel's upsample weight halves: 4 %
 * of the pixel's distance (a flame 3 m away keeps texels within ~12 cm). */
export const FIRE_UPSAMPLE_DEPTH_TOLERANCE = 0.04;

/** The low target's size for a `w` x `h` drawing buffer at `scale` (never below 2). */
export function fireVolumeTargetSize(w: number, h: number, scale: number): [number, number] {
  return [Math.max(2, Math.round(w * scale)), Math.max(2, Math.round(h * scale))];
}

/** CPU twin of the composite's per-texel depth weight (tests). */
export function fireUpsampleDepthWeight(pixelViewZ: number, texelViewZ: number): number {
  const rel = Math.abs(pixelViewZ - texelViewZ) / Math.max(Math.abs(pixelViewZ), 1e-3);
  return 1 / (1 + rel / FIRE_UPSAMPLE_DEPTH_TOLERANCE);
}

export class FireVolumePass {
  enabled = true;
  readonly scale: number;
  private readonly target: RenderTarget;
  private readonly sceneDepth = texture(new THREE.DepthTexture(1, 1));
  private readonly lowSize = uniform(new THREE.Vector2(2, 2));
  private readonly near = uniform(0.1);
  private readonly far = uniform(1000);
  private readonly depthCopy: QuadMesh;
  private readonly composite: QuadMesh;
  private readonly bufferSize = new THREE.Vector2();
  private readonly prevClear = new THREE.Color();

  constructor(scale: number = FIRE_VOLUME_SCALE.desktop) {
    this.scale = scale;
    const depthTexture = new THREE.DepthTexture(2, 2);
    depthTexture.type = THREE.UnsignedIntType;
    this.target = new RenderTarget(2, 2, {
      type: THREE.HalfFloatType,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: true,
      depthTexture,
      samples: 0,
    });
    this.target.texture.colorSpace = THREE.NoColorSpace;
    this.target.texture.generateMipmaps = false;

    // 1. the scene depth, point-sampled into the low depth buffer; colour cleared to 0
    {
      const m = new NodeMaterial();
      m.fragmentNode = vec4(0, 0, 0, 0);
      m.depthNode = n(n(this.sceneDepth).sample(uv())).x;
      m.depthTest = true;
      m.depthWrite = true;
      m.depthFunc = THREE.AlwaysDepth;
      m.toneMapped = false;
      m.fog = false;
      m.name = "es-fire-volume-depth";
      this.depthCopy = new QuadMesh(m);
    }

    // 3. depth-aware 4-tap upsample, premultiplied over the canvas
    {
      const lowColor = texture(this.target.texture);
      const lowDepth = texture(depthTexture);
      const vUv = n(uv());
      const viewZ = (d: TslNode) => n(perspectiveDepthToViewZ(d, this.near, this.far));
      const zPix = viewZ(n(n(this.sceneDepth).sample(vUv)).x);
      const p = n(vUv.mul(this.lowSize).sub(0.5));
      const base = n(floor(p));
      const f = n(fract(p));
      let sum: TslNode = vec4(0, 0, 0, 0);
      let wsum: TslNode = float(1e-5);
      for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
        const at = n(base.add(vec2(ox + 0.5, oy + 0.5)).div(this.lowSize));
        const bx = ox ? f.x : n(float(1)).sub(f.x);
        const by = oy ? f.y : n(float(1)).sub(f.y);
        const rel = n(abs(zPix.sub(viewZ(n(n(lowDepth).sample(at)).x)))).div(max(abs(zPix), 1e-3));
        const w = n(bx).mul(by).div(n(float(1)).add(rel.div(FIRE_UPSAMPLE_DEPTH_TOLERANCE)));
        sum = n(sum).add(n(n(lowColor).sample(at)).mul(w));
        wsum = n(wsum).add(w);
      }
      const m = new NodeMaterial();
      m.fragmentNode = n(sum).div(wsum);
      m.depthTest = false;
      m.depthWrite = false;
      m.transparent = true;
      m.fog = false;
      m.blending = THREE.CustomBlending;
      m.blendEquation = THREE.AddEquation;
      m.blendSrc = THREE.OneFactor;
      m.blendDst = THREE.OneMinusSrcAlphaFactor;
      m.blendSrcAlpha = THREE.OneFactor;
      m.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
      m.premultipliedAlpha = false;
      m.name = "es-fire-volume-composite";
      this.composite = new QuadMesh(m);
    }
  }

  /** The low target's size (tests, HUD). */
  get targetSize(): [number, number] { return [this.target.width, this.target.height]; }

  private resize(w: number, h: number): void {
    const [tw, th] = fireVolumeTargetSize(w, h, this.scale);
    if (this.target.width === tw && this.target.height === th) return;
    this.target.setSize(tw, th);
    // keep the depth texture's image in step (WaterPipeline resizeTarget: three leaves it stale)
    const d = this.target.depthTexture;
    if (d) { d.image.width = tw; d.image.height = th; d.needsUpdate = true; }
    (this.lowSize.value as THREE.Vector2).set(tw, th);
  }

  /**
   * March the volume layer at low resolution and composite it onto the
   * canvas. `depth`: the scene depth the frame's opaque pass wrote. Restores
   * the renderer's target, clear and the camera's layers.
   */
  render(renderer: WebGPURenderer, scene: THREE.Scene, camera: THREE.Camera, depth: THREE.Texture): void {
    if (!this.enabled) return;
    if (!(renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend) return; // volumes are WebGPU-only
    const size = renderer.getDrawingBufferSize(this.bufferSize);
    this.resize(size.x, size.y);
    const prevTarget = renderer.getRenderTarget();
    const prevAuto = renderer.autoClear;
    const prevMask = camera.layers.mask;
    renderer.autoClear = false;
    this.sceneDepth.value = depth;
    const cam = camera as THREE.PerspectiveCamera;
    this.near.value = cam.near ?? 0.1;
    this.far.value = cam.far ?? 1000;

    deferBuildsInto(renderer, this.target);
    renderer.setRenderTarget(this.target);
    renderer.getClearColor(this.prevClear as never); // three types the target as Color4; a Color takes r, g, b
    const prevAlpha = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, false);
    renderer.setClearColor(this.prevClear, prevAlpha);
    this.depthCopy.render(renderer);
    camera.layers.mask = 1 << FIRE_VOLUME_LAYER;
    renderer.render(scene, camera);
    camera.layers.mask = prevMask;

    renderer.setRenderTarget(prevTarget);
    this.composite.render(renderer);
    renderer.autoClear = prevAuto;
  }

  dispose(): void {
    this.target.depthTexture?.dispose();
    this.target.dispose();
    (this.depthCopy.material as THREE.Material).dispose();
    (this.composite.material as THREE.Material).dispose();
  }
}
