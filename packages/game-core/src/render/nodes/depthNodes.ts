/**
 * Scene-depth helpers shared by every material that soft-fades against, or
 * measures thickness behind, an opaque depth texture (water surface, falls
 * kit, mist, spray, crowns, underwater bubbles). docs/standards/tsl-shaders.md.
 *
 * Feedback rule: the depth texture bound to one of these reads must never be
 * the depth attachment of the target the reading material is drawn into
 * (WebGL rejects the draw; WebGPU reports a usage conflict). A writer that
 * has no safe depth binds the placeholder instead of the live texture.
 */
import * as THREE from "three";
import { RenderTarget } from "three/webgpu";
import * as tsl from "three/tsl";
import type { TslNode } from "./materialNodes";

const { screenCoordinate } = tsl as unknown as Record<string, TslNode>;

/**
 * A 1x1 depth texture: the stand-in a scene-depth texture node binds while
 * there is none. Owned by a 1x1 target so the backend knows its format and
 * sample count before the real scene depth is handed over.
 */
export function createDepthPlaceholder(): THREE.DepthTexture {
  return new RenderTarget(1, 1, { depthTexture: new THREE.DepthTexture(1, 1) }).depthTexture as THREE.DepthTexture;
}

/** Perspective depth-buffer value (0..1) to eye distance (m, positive). */
export function eyeDepthNode(d: TslNode, near: TslNode, far: TslNode): TslNode {
  return near.mul(far).div(far.sub(d.mul(far.sub(near))));
}

/** Eye distance (m) of the scene depth texture node `depth` at screen `uv` (0..1). */
export function eyeDepthAtUvNode(depth: TslNode, uv: TslNode, near: TslNode, far: TslNode): TslNode {
  return eyeDepthNode(depth.sample(uv).x, near, far);
}

/** The scene's eye distance behind this fragment, from a depth texture node sized `resolution` (px). */
export function sceneEyeDepthNode(depth: TslNode, resolution: TslNode, near: TslNode, far: TslNode): TslNode {
  return eyeDepthAtUvNode(depth, screenCoordinate.xy.div(resolution), near, far);
}
