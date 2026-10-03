import * as THREE from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";
import * as tsl from "three/tsl";

import type { TslNode } from "@elder-souls/game-core/render/nodes/materialNodes";

// TSL chains are typed loosely on purpose (docs/standards/tsl-shaders.md §1).
const {
  abs, clamp, dot, float, max, mix, modelNormalMatrix, normalize, normalLocal, positionView,
  texture, uniform, uv, varying, vec4,
} = tsl as unknown as Record<string, TslNode>;

/**
 * Skyrim's BSEffectShader falloff on the torch glow (part A diag): opacity 0.6
 * facing the viewer (cosine 1.0), rising to 1.0 at a cosine of 0.4226 and
 * below, so the flame's edges read brighter than its face.
 */
export const GLOW_FALLOFF = { startCos: 1, stopCos: 0.4226, startOpacity: 0.6, stopOpacity: 1 } as const;

/** The view-falloff opacity at facing cosine `facing` (the node graph mirrors it). */
export function glowViewOpacity(facing: number): number {
  const { startCos, stopCos, startOpacity, stopOpacity } = GLOW_FALLOFF;
  const t = Math.min(1, Math.max(0, (facing - stopCos) / Math.max(1e-4, startCos - stopCos)));
  return stopOpacity + (startOpacity - stopOpacity) * t;
}

export interface GlowMaterial {
  material: MeshBasicNodeMaterial;
  /** 0-1 brightness, a `uniform()` node: write `.value` every frame. */
  intensity: { value: number } & TslNode;
}

/**
 * The additive material for a flagged effect mesh: the GLB's own texture times
 * its vertex colours, opacity from the vertex alpha and the view falloff,
 * added onto what is behind it. No new art: everything comes from the mesh.
 * Unlit, unfogged and not tone-mapped, as the old custom shader was.
 */
export function createGlowMaterial(map: THREE.Texture | null): GlowMaterial {
  const intensity = uniform(1) as GlowMaterial["intensity"];
  // Per vertex, as before: |cos| between the view-space normal and the view ray.
  const facing = varying(
    abs(dot(normalize(modelNormalMatrix.mul(normalLocal)), normalize(positionView.negate()))),
    "vGlowFacing",
  );
  const { startCos, stopCos, startOpacity, stopOpacity } = GLOW_FALLOFF;
  const t = clamp(facing.sub(stopCos).div(max(float(startCos - stopCos), 1e-4)), 0, 1);
  const viewOpacity = mix(float(stopOpacity), float(startOpacity), t);
  // An unbound sampler read black: a glow with no map adds nothing.
  const texel = map ? texture(map, uv()) : vec4(0, 0, 0, 1);
  const material = new MeshBasicNodeMaterial({
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
    forceSinglePass: true, // additive: one pass draws the same
    fog: false,
  });
  material.name = "offhand-glow";
  // Vertex colour (rgb and alpha) multiplies after colorNode, as `vColor` did.
  material.colorNode = vec4(texel.rgb, texel.a.mul(viewOpacity).mul(intensity));
  return { material, intensity };
}
