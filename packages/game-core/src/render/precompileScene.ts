import * as THREE from "three";
import { prepareLit } from "./fixtureLights/fixtureLightField";
import { CASCADE_LAYER_BASE, MAX_CASCADE_LAYERS, SHADOW_CASTER_LAYER, shadowPassMaterialsOf } from "./shadowCasters";

/**
 * Precompile the scene around the spawn before the game opens (decision 0108
 * §2: a material is ready before its first draw; walk 10 diag20 E2: ~330
 * pipelines built lazily, the last at 42-48 s).
 *
 * Called once the spawn ring is resident (three's compileAsync walks only
 * what is in the scene, visible and in the frustum). For each target the
 * frame's scene pass draws into (its own render target, so the program and
 * pipeline keys carry the real samples and format; `null` is the canvas),
 * the scene is compiled from `yaws` camera headings around the camera's
 * position, so the whole ring around the spawn is covered, not just the
 * first view. compileAsync never runs three's shadow pass, so the caster
 * variants compile separately (`precompileShadowVariants`): the scene again,
 * as the sun's shadow pass draws it (its shadow-pass material as the
 * override, into its shadow map, from a camera on every caster layer). The
 * warm gate then waits for the build queue to empty.
 *
 * Every compileAsync starts synchronously inside one block (three reads the
 * bound render target there), so the caller's target is restored before any
 * await. Each compile settles after `settleMs` at the latest.
 */
export interface PrecompileRenderer {
  getRenderTarget(): THREE.RenderTarget | null;
  getMRT?(): unknown;
  setMRT?(mrt: unknown): void;
  setRenderTarget(target: THREE.RenderTarget | null): void;
  compileAsync(scene: THREE.Object3D, camera: THREE.Camera, targetScene?: THREE.Scene | null): Promise<unknown>;
}

export const PRECOMPILE_YAWS = 6;
export const PRECOMPILE_SETTLE_MS = 30_000;

export function precompileScene(renderer: PrecompileRenderer, scene: THREE.Scene, camera: THREE.Camera,
  targets: readonly (THREE.RenderTarget | null)[], yaws = PRECOMPILE_YAWS, settleMs = PRECOMPILE_SETTLE_MS): Promise<number> {
  prepareLit(scene, scene);
  const jobs: CompileJob[] = [];
  const turn = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < yaws; i++) {
    const view = camera.clone();
    turn.setFromAxisAngle(up, (i * 2 * Math.PI) / yaws);
    view.quaternion.copy(camera.quaternion).premultiply(turn);
    view.updateMatrixWorld(true);
    for (const target of targets) jobs.push({ root: scene, target, camera: view });
  }
  return Promise.all([
    compileInBatches(renderer, scene, camera, jobs, jobs.length, settleMs),
    precompileShadowVariants(renderer, scene, scene, MAX_CASCADE_LAYERS, settleMs),
  ]).then(([a, b]) => a + b);
}

/** One compileAsync: `root` (the scene or a dummy group) into `target` (`null`: the canvas). */
export interface CompileJob {
  root: THREE.Object3D;
  target: THREE.RenderTarget | null;
  camera?: THREE.Camera;
  /** Set as `scene.overrideMaterial` for the call's synchronous part (a shadow-pass material). */
  override?: THREE.Material;
}

/**
 * Run `jobs` with at most `inFlight` compileAsync calls pending at once
 * (three awaits each render object's build in turn inside one call, so the
 * calls are the unit of parallelism; each one's pipelines go through
 * createRenderPipelineAsync). Every call starts synchronously with its
 * target, MRT and override bound and restores them before any await, as
 * three reads them there. `scene` lends its lights, environment and fog.
 * Resolves with the number of calls; each settles after `settleMs` at most.
 */
export function compileInBatches(renderer: PrecompileRenderer, scene: THREE.Scene, camera: THREE.Camera,
  jobs: readonly CompileJob[], inFlight: number, settleMs = PRECOMPILE_SETTLE_MS): Promise<number> {
  let next = 0;
  const startOne = (): Promise<void> | null => {
    if (next >= jobs.length) return null;
    const job = jobs[next++];
    const bound = renderer.getRenderTarget();
    const override = scene.overrideMaterial;
    const mrt = renderer.getMRT?.();
    let p: Promise<unknown>;
    try {
      renderer.setRenderTarget(job.target);
      if (job.override) { scene.overrideMaterial = job.override; renderer.setMRT?.(null); }
      p = renderer.compileAsync(job.root, job.camera ?? camera, scene);
    } catch (e) {
      p = Promise.reject(e);
    } finally {
      if (job.override) { scene.overrideMaterial = override; renderer.setMRT?.(mrt); }
      renderer.setRenderTarget(bound);
    }
    return settled(p, settleMs).then(() => undefined);
  };
  // each lane starts its next job when its last one settles: `inFlight` lanes keep `inFlight` calls pending
  const lanes: Promise<void>[] = [];
  for (let i = 0; i < Math.max(1, inFlight) && next < jobs.length; i++) lanes.push(runLane(startOne));
  return Promise.all(lanes).then(() => jobs.length);
}

function runLane(start: () => Promise<void> | null): Promise<void> {
  return new Promise((resolve) => {
    const step = (): void => { const p = start(); if (p) p.then(step); else resolve(); };
    step();
  });
}

/** The shadow lights (three's CSM cascade proxies included) whose shadow map exists: it is made at their first shadow render. */
function shadowLights(scene: THREE.Object3D): { map: THREE.RenderTarget; camera: THREE.Camera }[] {
  const out: { map: THREE.RenderTarget; camera: THREE.Camera }[] = [];
  scene.traverse((o) => {
    const shadow = (o as THREE.DirectionalLight).shadow as { map?: THREE.RenderTarget | null; camera?: THREE.Camera } | undefined;
    if ((o as THREE.Light).isLight && o.castShadow && shadow?.map && shadow.camera) out.push({ map: shadow.map, camera: shadow.camera });
  });
  return out;
}

/**
 * Compile `root`'s casters as the shadow pass draws them: once per shadow
 * map (every cascade's), with the scene's shadow-pass material as the
 * override and a camera on every caster layer (`shadowCasters.ts`). Needs
 * one shadow render first (it makes the material and the maps); returns 0
 * before that.
 */
export function precompileShadowVariants(renderer: PrecompileRenderer, root: THREE.Object3D, scene: THREE.Scene,
  inFlight: number, settleMs = PRECOMPILE_SETTLE_MS): Promise<number> {
  const [override] = shadowPassMaterialsOf(scene);
  if (!override) return Promise.resolve(0);
  const jobs: CompileJob[] = shadowLights(scene).map(({ map, camera }) => {
    const view = camera.clone();
    view.layers.mask = (1 << SHADOW_CASTER_LAYER) | (((1 << MAX_CASCADE_LAYERS) - 1) << CASCADE_LAYER_BASE);
    return { root, target: map, camera: view, override };
  });
  return compileInBatches(renderer, scene, jobs[0]?.camera ?? new THREE.Camera(), jobs, inFlight, settleMs);
}

function settled(p: Promise<unknown>, ms: number): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cap = new Promise((resolve) => { timer = setTimeout(resolve, ms); });
  return Promise.race([p.catch((e) => console.error("[precompile] compileAsync failed", e)), cap]).finally(() => clearTimeout(timer));
}
