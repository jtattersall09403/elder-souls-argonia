import type * as THREE from "three";
import {
  applyGroundWetness, createGroundWetnessUniforms, primeGroundWetnessUniforms,
  type GroundWetnessAssets,
} from "@elder-souls/game-core/water/render/groundWetness";

/** Studio composition adapter; shared runtime code owns the shader and data contract. */
export const wetnessUniforms = createGroundWetnessUniforms();

export function primeWetnessUniforms(assets: GroundWetnessAssets): void {
  primeGroundWetnessUniforms(wetnessUniforms, assets);
}

export function applyShoreWetness(material: THREE.Material): void {
  applyGroundWetness(material, wetnessUniforms);
}
