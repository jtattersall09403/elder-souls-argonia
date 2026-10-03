import * as THREE from "three";
import { litPreparerOf, prepareLit, whenLitPreparer } from "./fixtureLights/fixtureLightField";

/**
 * How long one link may stay pending before it counts as settled
 * (`compileGuarded`, perf10 diag 6 C1b). A held mesh is shown at
 * the timeout: a late link costs one hitch, a mesh hidden for good is a defect.
 */
export const LINK_SETTLE_MS = 2000;

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
 * implies, never its size). Every pre-link goes through this class (the
 * player fade, the settlement build, the interior cells).
 */
/** The renderer calls the linker makes (WebGPURenderer on either backend). */
export interface LinkingRenderer {
  getRenderTarget(): THREE.RenderTarget | null;
  setRenderTarget(target: THREE.RenderTarget | null): void;
  compileAsync(object: THREE.Object3D, camera: THREE.Camera, scene: THREE.Scene): Promise<unknown>;
}

export class DrawTargetLinker {
  /** Whether a layer-0 pass has been seen, so `drawsToTarget` is known. */
  observed = false;
  drawsToTarget = false;
  private readonly scratch = new THREE.RenderTarget(1, 1, { type: THREE.HalfFloatType });
  private readonly hook: THREE.Scene["onBeforeRender"];
  private previous: THREE.Scene["onBeforeRender"] | null = null;

  /** `preparerWaitMs`: how long a link waits for the sky's lit preparer before
   * linking with fixture lights alone (an app with no sky). `settleMs`: how
   * long one compile may stay pending before its link counts as settled
   * (LINK_SETTLE_MS). */
  constructor(private readonly gl: LinkingRenderer, private readonly scene: THREE.Scene,
    private readonly preparerWaitMs = 4000, private readonly settleMs = LINK_SETTLE_MS) {
    this.scratch.texture.colorSpace = THREE.NoColorSpace;
    this.hook = (...args) => {
      const [, , camera, target] = args as unknown as [unknown, unknown, THREE.Camera, THREE.RenderTarget | null];
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
    // The lit preparer (WorldSky's CSM patch, fixture lights) runs before the
    // compile, so warm and draw link one program key (16k walk 10 E3: rocks,
    // bedrolls and impostors warmed without USE_CSM and relinked at draw).
    // A link asked before the sky registers it waits for the registration.
    if (litPreparerOf(this.scene)) return this.linkNow(warm, camera);
    return whenLitPreparer(this.scene, this.preparerWaitMs).then(() => this.linkNow(warm, camera));
  }

  private linkNow(warm: LinkWarm, camera: THREE.Camera): Promise<unknown> {
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
        prepareLit(this.scene, object);
        links.push(this.compileGuarded(object, camera, warm.scene ?? this.scene));
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
   * The renderer's `compileAsync`, settled after `settleMs` at the latest so a
   * link that never resolves never leaves a held mesh dark (perf10 diag 6 C1b).
   */
  private compileGuarded(object: THREE.Object3D, camera: THREE.Camera, scene: THREE.Scene): Promise<unknown> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = new Promise((resolve) => { timer = setTimeout(() => resolve(object), this.settleMs); });
    return Promise.race([this.gl.compileAsync(object, camera, scene).then(() => object), settle])
      .finally(() => clearTimeout(timer));
  }

  /**
   * Link `warms` while their objects stay hidden, for meshes whose first draw
   * may come before any scene pass is seen (the water's falls, chute strips
   * and pools; perf10 diag 6 C3: `linkWhenObserved` linked them after their
   * first draw). Each warm names its `pass` ("screen" or "target"), since no
   * observation is waited for. `hold(object, true)` runs for every object at
   * once, `hold(object, false)` when all its links settle, failed or timed
   * out (`settleMs`), so a held object is never left dark. Returns a cancel
   * for the effect's cleanup, which releases every object.
   */
  holdUntilLinked(warms: readonly LinkWarm[], camera: THREE.Camera,
    hold: (object: THREE.Object3D, held: boolean) => void): () => void {
    const pending = new Map<THREE.Object3D, Promise<unknown>[]>();
    for (const warm of warms) {
      let link: Promise<unknown>;
      try { link = this.link(warm, camera); } catch (err) { link = Promise.reject(err); }
      const list = pending.get(warm.object) ?? [];
      list.push(link.catch(() => undefined));
      pending.set(warm.object, list);
    }
    let cancelled = false;
    for (const [object, links] of pending) {
      hold(object, true);
      void Promise.all(links).then(() => { if (!cancelled) hold(object, false); });
    }
    return () => {
      if (cancelled) return;
      cancelled = true;
      for (const object of pending.keys()) hold(object, false);
    };
  }

  /**
   * Link `warms` once the scene pass has been seen (or after `maxWaitMs`),
   * polling on `schedule` (rAF in the app). For load-time meshes and
   * material variants that first draw later than their mount: the water
   * field's underwater variant and the bubbles linked on the first dive
   * (16k walk 10, 48 ms frames). A mesh that may draw before the first scene
   * pass uses `holdUntilLinked` instead. Returns a
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
