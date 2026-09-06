import type { Material } from 'three';
import { boundedPhysicalLighting } from './boundedPhysicalLighting';
import { WATER_RECEIVER_DECLARATIONS, waterReceiverLight, type GroundWetnessUniforms } from './groundWetness';

/** Opt-in for physical submerged props/hulls. Shares the terrain's injected
 * water/light state, but owns no world singleton or material lifecycle.
 * Apply CSM/aerial hooks normally; this adds caustics only to shadowed direct
 * diffuse light and works with skinning, instancing and batched meshes.
 */
export function applySubmergedCaustics(material: Material, uniforms: GroundWetnessUniforms,
  verticalScale: { value: number } = { value: 1 }): void {
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms, { uWaterReceiverScale: verticalScale });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWaterReceiverPos;')
      .replace('#include <worldpos_vertex>', /* glsl */ `#include <worldpos_vertex>
      vec4 waterReceiverPos = vec4(transformed, 1.0);
      #ifdef USE_BATCHING
        waterReceiverPos = batchingMatrix * waterReceiverPos;
      #endif
      #ifdef USE_INSTANCING
        waterReceiverPos = instanceMatrix * waterReceiverPos;
      #endif
      vWaterReceiverPos = (modelMatrix * waterReceiverPos).xyz;`);
    shader.fragmentShader = boundedPhysicalLighting(shader.fragmentShader, renderer.capabilities?.maxTextures ?? 16)
      .replace('#include <common>', `#include <common>\nvarying vec3 vWaterReceiverPos;
        uniform float uWaterReceiverScale;\n${WATER_RECEIVER_DECLARATIONS}`)
      .replace('#include <opaque_fragment>', waterReceiverLight('vWaterReceiverPos',
        'inverseTransformDirection(normal, viewMatrix)', 'uWaterReceiverScale'));
  };
  const previousKey = material.customProgramCacheKey;
  material.customProgramCacheKey = () => `${previousKey.call(material)}|water-caustic-receiver-v1`;
  material.needsUpdate = true;
}
