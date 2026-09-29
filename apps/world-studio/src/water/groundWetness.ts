import type { NodeMaterial } from "three/webgpu";
import {
  applyGroundWetness, createGroundWetnessUniforms, primeGroundWetnessUniforms,
  type GroundWetnessAssets, type SurfaceWetnessInputs,
} from "@elder-souls/game-core/water/render/groundWetness";

/** Studio composition adapter; shared runtime code owns the shader and data contract. */
export const wetnessUniforms = createGroundWetnessUniforms();

export function primeWetnessUniforms(assets: GroundWetnessAssets): void {
  primeGroundWetnessUniforms(wetnessUniforms, assets);
}

/** Terrain shore wetness + caustics. Call AFTER the terrain's own colorNode
 * and roughnessNode are set (it wraps both), passing the terrain's display
 * world position, its world normal (the gradient-map normal, esNrmW), the
 * vertical-scale node and the climate raster node where it has them. */
export function applyShoreWetness(material: NodeMaterial, inputs: Partial<SurfaceWetnessInputs> = {}): void {
  applyGroundWetness(material, wetnessUniforms, inputs);
}
