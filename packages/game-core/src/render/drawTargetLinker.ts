import * as THREE from "three";

/**
 * One object to link ahead of its first draw. `pass` names the target its
 * draw binds: "scene" the kind the layer-0 pass was seen to use, "screen" the
 * default framebuffer (tone-mapped, output colour space), "target" a linear
 * half-float target (the water pipeline's scene and bubble targets).
 */
export interface LinkWarm {
  object: THREE.Object3D;
  /** Every material the object swaps between at runtime (default: its own). */
  materials?: readonly THREE.Material[];
  pass?: "scene" | "screen" | "target";
  /** The scene whose lights the draw uses (default: the linker's scene). */
  scene?: THREE.Scene;
}

/**
 * Link programs ahead of their first draw, against the render target the
 * draw actually binds.
 *
 * A program's key depends on where the pass draws: the water pipeline draws
 * the scene into a linear, un-tone-mapped half-float target (WaterPipeline
 * `makeTarget`), the bare scene and the above-water surface draw to the
 * screen, tone-mapped. A `compileAsync` run against the wrong one links
 * programs the draw never uses, so the first visible frame linked the right
 * ones synchronously anyway (review 2026-09-30; 16k walk 10: the underwater
 * water variants). `scene.onBeforeRender` records which kind the pass that
 * draws layer 0 used; `link` binds a 1x1 target of the named kind while it
 * links (the key reads the target's colour space and the tone mapping it
 * implies, never its size). Same contract as apps/world-studio InteriorDoors
 * `InteriorLinker`.
 */
export class DrawTargetLinker {
  /** Whether a layer-0 pass has been seen, so `drawsToTarget` is known. */
  observed = false;
  drawsToTarget = false;
  private readonly scratch = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  private readonly hook: THREE.Scene["onBeforeRender"];
  private previous: THREE.Scene["onBeforeRender"] | null = null;

  constructor(private readonly gl: THREE.WebGLRenderer, private readonly scene: THREE.Scene) {
    this.scratch.texture.colorSpace = THREE.NoColorSpace;
    this.hook = (...args) => {
      const [, , camera, target] = args as unknown as [unknown, unknown, THREE.Camera, THREE.WebGLRenderTarget | null];
      if (camera.layers.isEnabled(0)) { this.drawsToTarget = target !== null; this.observed = true; }
      this.previous?.apply(scene, args);
    };
  }

  /** Start recording the scene pass (an effect's mount; safe to repeat after `detach`). */
  attach(): this {
    if (this.previous) return this;
    this.previous = this.scene.onBeforeRender;
    this.scene.onBeforeRender = this.hook;
    return this;
  }

  /** `gl.compileAsync(object, camera, target)` with the drawn target's kind bound. */
  compileAsync(object: THREE.Object3D, camera: THREE.Camera, target: THREE.Scene = this.scene): Promise<unknown> {
    return this.link({ object, scene: target }, camera);
  }

  /**
   * Link one warm: the real object with its own flags (receiveShadow,
   * instancing, colours, material hooks), in each material it swaps between
   * at runtime (its own restored after; three keeps every program a material
   * used), against the target its draw binds, visible for the compile.
   * The compile step inside `compileAsync` is synchronous, so the swap and
   * restore bracket it exactly.
   */
  link(warm: LinkWarm, camera: THREE.Camera): Promise<unknown> {
    const { object } = warm;
    const mesh = object as THREE.Mesh;
    const own = mesh.material;
    const variants = warm.materials?.length ? warm.materials : [undefined];
    const bound = this.gl.getRenderTarget();
    const visible = object.visible;
    const pass = warm.pass ?? "scene";
    const toTarget = pass === "target" || (pass === "scene" && this.drawsToTarget);
    this.gl.setRenderTarget(toTarget ? this.scratch : null);
    object.visible = true;
    try {
      const links: Promise<unknown>[] = [];
      for (const material of variants) {
        if (material) mesh.material = material;
        links.push(this.gl.compileAsync(object, camera, warm.scene ?? this.scene));
      }
      return Promise.all(links);
    } catch (err) {
      return Promise.reject(err);
    } finally {
      if (warm.materials?.length) mesh.material = own;
      object.visible = visible;
      this.gl.setRenderTarget(bound);
    }
  }

  /**
   * Link `warms` once the scene pass has been seen (or after `maxWaitMs`),
   * polling on `schedule` (rAF in the app). For load-time meshes and
   * material variants that first draw later: the water's underwater
   * variants, the waterfalls, chute strips, pools and bubbles linked on
   * their first draw while walking (16k walk 10, 48 ms frames). Returns a
   * cancel for the effect's cleanup.
   */
  linkWhenObserved(warms: readonly (THREE.Object3D | LinkWarm)[], camera: THREE.Camera, maxWaitMs = 4000,
    schedule: (step: () => void) => unknown = (step) => requestAnimationFrame(step)): () => void {
    let cancelled = false;
    const start = performance.now();
    const step = () => {
      if (cancelled) return;
      if (!this.observed && performance.now() - start < maxWaitMs) { schedule(step); return; }
      for (const warm of warms) {
        this.link(warm instanceof THREE.Object3D ? { object: warm } : warm, camera).catch(() => undefined);
      }
    };
    if (warms.length) schedule(step);
    return () => { cancelled = true; };
  }

  /** Stop recording (an effect's cleanup) and free the scratch target's GL objects. */
  detach(): void {
    if (this.previous && this.scene.onBeforeRender === this.hook) this.scene.onBeforeRender = this.previous;
    this.previous = null;
    this.scratch.dispose();
  }
}
