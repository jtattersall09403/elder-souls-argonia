/**
 * Harness scene "fire-stress": the decision-0110 cost bar, 20 large fires
 * (torches, braziers, hearths, campfires at their real sizes) spread 4-34 m
 * from the camera at night, all inside the volume reach. On WebGPU every one
 * is a volume; fire-stress-cards.ts is the same scene forced to cards, so the
 * two `frameMs` in summary.json are a ratio (SwiftShader is CPU: a ratio,
 * never a GPU time).
 */
import * as THREE from "three";
import { FlameSystem } from "@elder-souls/game-core/fx/fire/FlameSystem";
import { addLitGroundAndFireLights, FIRE_NIGHT, fireReady } from "./fire";
import type { FirePresetId } from "@elder-souls/game-core/fx/fire/fireTypes";
import type { HarnessContext } from "../types";

const KINDS: FirePresetId[] = ["torchGround", "brazier", "hearth", "campfire", "torchHandheld"];

export async function buildFireStress(ctx: HarnessContext, backend: "webgpu" | "webgl") {
  ctx.renderer.toneMappingExposure = 22;
  const scene = new THREE.Scene();
  const fire = new FlameSystem();
  fire.setBackend(backend);
  const emitters = Array.from({ length: 20 }, (_, i) => {
    const d = 4 + (i / 19) * 30;
    const a = ((i * 0.618034) % 1 - 0.5) * 1.1;
    return {
      position: new THREE.Vector3(Math.sin(a) * d, 0, -Math.cos(a) * d),
      preset: KINDS[i % KINDS.length], scale: 1, seed: (i * 0.377) % 1, owner: i,
    };
  });
  fire.setEmitters(emitters);
  addLitGroundAndFireLights(ctx, scene, FIRE_NIGHT, 90, emitters);
  scene.add(fire.group);
  const camera = new THREE.PerspectiveCamera(60, ctx.width / ctx.height, 0.1, 200);
  camera.position.set(0, 1.6, 0);
  camera.lookAt(0, 0.4, -10);
  camera.layers.enableAll();
  camera.updateMatrixWorld();
  fire.update(2, () => 1);
  const drawn = await fireReady(ctx, scene, camera, fire); // fire.ts: no shot before compile + prewarm + one frame
  return { scene, camera, frame(t: number) { drawn(); fire.update(2 + t, () => 1); } };
}

export default {
  name: "fire-stress",
  build(ctx: HarnessContext) {
    return buildFireStress(ctx, ctx.backend);
  },
};
