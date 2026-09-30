import * as THREE from "three";

/**
 * Link programs ahead of their first draw, against the render target the
 * scene pass actually draws into.
 *
 * A program's key depends on where the pass draws: the water pipeline draws
 * the scene into a linear, un-tone-mapped half-float target (WaterPipeline
 * `makeTarget`), the bare scene draws to the screen, tone-mapped. A
 * `compileAsync` run while no target is bound links the screen's programs, so
 * the first visible frame linked the water target's ones synchronously
 * anyway (review 2026-09-30). `scene.onBeforeRender` records which kind the
 * pass that draws layer 0 used, and `compileAsync` here binds a 1x1 target of
 * that kind while it links (the key reads the target's colour space and the
 * tone mapping it implies, never its size). Same contract as
 * apps/world-studio InteriorDoors `InteriorLinker`.
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
    const bound = this.gl.getRenderTarget();
    if (this.drawsToTarget) this.gl.setRenderTarget(this.scratch);
    try {
      return this.gl.compileAsync(object, camera, target);
    } catch (err) {
      return Promise.reject(err);
    } finally {
      this.gl.setRenderTarget(bound);
    }
  }

  /** Stop recording (an effect's cleanup) and free the scratch target's GL objects. */
  detach(): void {
    if (this.previous && this.scene.onBeforeRender === this.hook) this.scene.onBeforeRender = this.previous;
    this.previous = null;
    this.scratch.dispose();
  }
}
