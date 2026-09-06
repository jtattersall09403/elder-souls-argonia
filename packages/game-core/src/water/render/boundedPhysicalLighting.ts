import { ShaderChunk } from 'three';

/** Minimum WebGL2 devices expose16 fragment textures. The water/terrain
 * stack needs that budget for hydrology, shadows and interactive caustics.
 * Keep three.js's LUT on larger devices; on16-unit devices use its former
 * analytical environment-BRDF fit instead. The direct single-scatter GGX
 * lobe stays exact; its multi-scatter compensation uses the same fit.
 * Fit: Brian Karis, Physically Based Shading on Mobile (Epic,2014), also
 * three.js r180 lights_physical_pars_fragment (MIT; project notices).
 */
export function boundedPhysicalLighting(source: string, maxTextures: number): string {
  if (maxTextures > 16 || !source.includes('#include <lights_physical_pars_fragment>')) return source;
  const original = ShaderChunk.lights_physical_pars_fragment;
  if (!original.includes('uniform sampler2D dfgLUT;')) return source;
  let replacements = 0;
  const physical = original.replace('uniform sampler2D dfgLUT;', /* glsl */ `
vec2 esEnvironmentFit(vec2 uv) {
  vec4 coefficients = vec4(1.0, 0.0425, 1.04, -0.04)
    + uv.x * vec4(-1.0, -0.0275, -0.572, 0.022);
  float grazing = min(coefficients.x * coefficients.x, exp2(-9.28 * uv.y));
  float fit = grazing * coefficients.x + coefficients.y;
  return vec2(-1.04, 1.04) * fit + coefficients.zw;
}
`).replace(/texture2D\(\s*dfgLUT,\s*(vec2\([^)]*\))\s*\)\.rg/g, (_match, uv: string) => {
    replacements++;
    return `esEnvironmentFit(${uv})`;
  });
  if (!replacements || /\bdfgLUT\b/.test(physical)) {
    throw new Error('three.js DFG shader changed: update the16-texture water lighting fallback');
  }
  return source.replace('#include <lights_physical_pars_fragment>', physical);
}
