/**
 * The sky IBL (PMREM of the bake dome) as ONE render target for the life of
 * the sky. `createSkyEnvironment` bakes once at creation, so the texture
 * exists before the first frame compiles the world's lit materials; every
 * later `rebake()` renders into that same target. `scene.environment` is set
 * once and its identity never changes: on the WebGL backend each new
 * environment texture (or null -> texture) changed every lit program's cache
 * key and recompiled it inside render(), and the terrain splat's recompile
 * never finished on SwiftShader (lane L12/L17, tsl-shaders.md Gotchas).
 */
import type * as THREE from "three";
import { PMREMGenerator, type RenderTarget, type WebGPURenderer } from "three/webgpu";

/** Bake near/far planes: the bake dome has radius 100. */
const BAKE_NEAR = 0.1;
const BAKE_FAR = 1100;

export interface SkyEnvironment {
  /** The one environment texture; assign it to `scene.environment` once. */
  readonly texture: THREE.Texture;
  /** Re-render the bake scene into the same target (texture identity kept). */
  rebake(): void;
  dispose(): void;
}

export function createSkyEnvironment(renderer: WebGPURenderer, bakeScene: THREE.Scene): SkyEnvironment {
  const pmrem = new PMREMGenerator(renderer);
  const target: RenderTarget = pmrem.fromScene(bakeScene, 0, BAKE_NEAR, BAKE_FAR);
  return {
    texture: target.texture,
    rebake() {
      pmrem.fromScene(bakeScene, 0, BAKE_NEAR, BAKE_FAR, { renderTarget: target });
    },
    dispose() {
      pmrem.dispose();
      target.dispose();
    },
  };
}
