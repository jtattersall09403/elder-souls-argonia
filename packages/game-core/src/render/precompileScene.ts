import * as THREE from "three";
import { prepareLit } from "./fixtureLights/fixtureLightField";

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
 * first view. Shadow variants are not reached by compileAsync: they build in
 * the real frames that follow behind the loading overlay (synchronously, as
 * shadow-pass draws never defer: shaderBuildQueue), and the warm gate waits
 * for the build queue to empty.
 *
 * Every compileAsync starts synchronously inside one block (three reads the
 * bound render target there), so the caller's target is restored before any
 * await. Each compile settles after `settleMs` at the latest.
 */
export interface PrecompileRenderer {
  getRenderTarget(): THREE.RenderTarget | null;
  setRenderTarget(target: THREE.RenderTarget | null): void;
  compileAsync(scene: THREE.Object3D, camera: THREE.Camera, targetScene?: THREE.Scene | null): Promise<unknown>;
}

export const PRECOMPILE_YAWS = 6;
export const PRECOMPILE_SETTLE_MS = 30_000;

export function precompileScene(renderer: PrecompileRenderer, scene: THREE.Scene, camera: THREE.Camera,
  targets: readonly (THREE.RenderTarget | null)[], yaws = PRECOMPILE_YAWS, settleMs = PRECOMPILE_SETTLE_MS): Promise<number> {
  prepareLit(scene, scene);
  const view = camera.clone();
  const turn = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const bound = renderer.getRenderTarget();
  const compiles: Promise<unknown>[] = [];
  try {
    for (let i = 0; i < yaws; i++) {
      turn.setFromAxisAngle(up, (i * 2 * Math.PI) / yaws);
      view.quaternion.copy(camera.quaternion).premultiply(turn);
      view.updateMatrixWorld(true);
      for (const target of targets) {
        renderer.setRenderTarget(target);
        compiles.push(settled(renderer.compileAsync(scene, view), settleMs));
      }
    }
  } finally {
    renderer.setRenderTarget(bound);
  }
  return Promise.all(compiles).then(() => compiles.length);
}

function settled(p: Promise<unknown>, ms: number): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cap = new Promise((resolve) => { timer = setTimeout(resolve, ms); });
  return Promise.race([p.catch((e) => console.error("[precompile] compileAsync failed", e)), cap]).finally(() => clearTimeout(timer));
}
