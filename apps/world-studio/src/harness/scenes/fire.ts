/**
 * Harness scene "fire": every fire preset in a row by day (noon exposure,
 * 3.9e-5), drawn by the REAL fire module (`FlameSystem`: TSL flame cards on
 * both backends, the raymarched volume for the large presets on WebGPU).
 * Each fire is scaled to the same 0.8 m height so the eight read side by
 * side; left to right: candle, lanternStanding, lanternHanging, torchGround,
 * torchHandheld, brazier, hearth, campfire. The backdrop is written through
 * the fire's own `displayToScene`, so it shows the display colours the old
 * fire sheets used (tools/fire-sheet.mjs, retired) under the frame's tone map.
 * fire-night.ts and fire-close.ts reuse `buildFireScene`.
 *
 * Readiness (vol-diag1 row 14: the first shot was black): `build` resolves
 * only after `compileAsync` of the whole scene has settled and, on WebGPU,
 * every volume field has run its prewarm (`FlameSystem.warmVolumes`), so the
 * first drawn frame already burns. `window.__FIRE_READY__` turns true after
 * that first frame has been rendered and presented; a gpu-lane capture waits
 * on it before its first shot (`fireReady`).
 */
import * as THREE from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";
import { uniform, vec3 } from "three/tsl";
import { FlameSystem } from "@elder-souls/game-core/fx/fire/FlameSystem";
import { FIRE_PRESETS, FIRE_PRESET_ORDER, type FirePresetId } from "@elder-souls/game-core/fx/fire/fireTypes";
import { displayToScene } from "@elder-souls/game-core/fx/fire/fireNodes";
import type { WebGPURenderer } from "three/webgpu";
import type { HarnessContext } from "../types";

declare global {
  interface Window { __FIRE_READY__?: boolean }
}

/**
 * Compile the scene, prewarm the fire's volume fields, and return the frame
 * hook that raises `window.__FIRE_READY__` once a frame has been drawn after
 * both (the frame hook runs before each render, so its second call follows
 * the first presented frame).
 */
export async function fireReady(ctx: HarnessContext, scene: THREE.Scene, camera: THREE.Camera, fire: FlameSystem):
  Promise<() => void> {
  window.__FIRE_READY__ = false;
  // bounded as main.ts bounds its own compile: a hang here would hang the page before main.ts names it
  await Promise.race([ctx.renderer.compileAsync(scene, camera), new Promise((r) => setTimeout(r, 60_000))]);
  if (ctx.backend === "webgpu") fire.warmVolumes(ctx.renderer as unknown as WebGPURenderer);
  let calls = 0;
  return () => { if (++calls === 2) window.__FIRE_READY__ = true; };
}

export interface FireLook {
  exposure: number;
  /** Display-referred sRGB hex of the sky and the ground behind the fires. */
  sky: number;
  ground: number;
}

export const FIRE_DAY: FireLook = { exposure: 3.9e-5, sky: 0x9fb8d0, ground: 0x6b6247 };
export const FIRE_NIGHT: FireLook = { exposure: 22, sky: 0x05070d, ground: 0x0b0a08 };

function backdropMaterial(hex: number, exposure: number): MeshBasicNodeMaterial {
  const c = new THREE.Color(hex); // linear display value of the sRGB hex
  const m = new MeshBasicNodeMaterial();
  m.colorNode = displayToScene(vec3(c.r, c.g, c.b), uniform(exposure), uniform(1));
  m.fog = false;
  return m;
}

/** A row of fires over a sky/ground backdrop at one exposure. */
export async function buildFireScene(ctx: HarnessContext, look: FireLook, presets: readonly FirePresetId[], heightM: number,
  spacingM: number, opts: { seeds?: readonly number[]; show?: (name: string) => boolean; cardsOnly?: boolean } = {}) {
  ctx.renderer.toneMappingExposure = look.exposure;
  const scene = new THREE.Scene();
  const width = spacingM * (presets.length + 1);
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(width * 4, heightM * 12), backdropMaterial(look.sky, look.exposure));
  sky.position.set(0, heightM * 6, -spacingM * 2);
  scene.add(sky);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(width * 4, spacingM * 8).rotateX(-Math.PI / 2),
    backdropMaterial(look.ground, look.exposure));
  scene.add(ground);
  const fire = new FlameSystem();
  // cardsOnly: the card path as WebGL draws it, on both backends. Hiding the
  // volume meshes is not enough: on WebGPU the cards of a volume preset yield
  // to the volume inside its reach (flameMaterial.ts cardShare), so hidden
  // volumes left the WebGPU cards faded (the ~9 luma backend gap, L19 round)
  fire.setBackend(opts.cardsOnly ? "webgl" : ctx.backend);
  fire.setEmitters(presets.map((preset, i) => ({
    position: new THREE.Vector3((i - (presets.length - 1) / 2) * spacingM, 0.02, 0),
    preset, scale: heightM / FIRE_PRESETS[preset].shape.heightM, seed: opts.seeds?.[i] ?? (0.37 + i * 0.13) % 1, owner: i,
  })));
  scene.add(fire.group);
  const fov = 36;
  const aspect = ctx.width / ctx.height;
  const halfW = (spacingM * presets.length) / 2;
  const dist = Math.max(halfW / (Math.tan((fov * Math.PI) / 360) * aspect), heightM * 1.4 / Math.tan((fov * Math.PI) / 360));
  const camera = new THREE.PerspectiveCamera(fov, aspect, 0.05, 200);
  camera.position.set(0, heightM * 0.55, dist);
  camera.lookAt(0, heightM * 0.5, 0);
  camera.layers.enableAll();
  camera.updateMatrixWorld();
  fire.update(3.7, () => 1);
  const drawn = await fireReady(ctx, scene, camera, fire);
  return {
    scene,
    camera,
    frame(t: number) {
      drawn();
      fire.update(3.7 + t, () => 1, { x: 0.3, y: 0 });
      // diagnostic layer isolation (fire-diag-*.ts): hide the draws `show` rejects
      if (opts.show) for (const o of fire.group.children) o.visible = opts.show(o.name);
    },
  };
}

export default {
  name: "fire",
  build(ctx: HarnessContext) {
    return buildFireScene(ctx, FIRE_DAY, FIRE_PRESET_ORDER, 0.8, 1.3);
  },
};
