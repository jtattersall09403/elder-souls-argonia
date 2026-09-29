import * as tsl from "three/tsl";
import type { TslNode } from "../../render/nodes/materialNodes";

// Loosely typed on purpose (docs/standards/tsl-shaders.md §1).
const { exp2, float, min, vec2, vec4 } = tsl as TslNode;

/** Analytic environment-BRDF fit, the node twin of the old 16-texture-unit
 * `lights_physical_pars_fragment` patch. `uv` = (roughness, dotNV), the same
 * coordinates three's DFGLUT (nodes/functions/BSDF/DFGLUT.js) samples its
 * 16x16 table at; returns the same (scale, bias) pair.
 * Fit: Brian Karis, Physically Based Shading on Mobile (Epic, 2014), also
 * three.js r180 lights_physical_pars_fragment (MIT; project notices).
 * Node three imports DFGLUT at module level inside PhysicalLightingModel and
 * BRDF_GGX_Multiscatter, so no lighting-model override swaps it in yet: this
 * is exported for a model that needs to free the LUT's texture unit. */
export function esEnvironmentFit(uv: TslNode): TslNode {
  const coords = vec2(uv);
  const coefficients = vec4(1.0, 0.0425, 1.04, -0.04)
    .add(vec4(-1.0, -0.0275, -0.572, 0.022).mul(coords.x));
  const grazing = min(coefficients.x.mul(coefficients.x), exp2(float(-9.28).mul(coords.y)));
  const fit = grazing.mul(coefficients.x).add(coefficients.y);
  return vec2(-1.04, 1.04).mul(fit).add(coefficients.zw);
}

/** CPU twin of esEnvironmentFit (tests and probes). */
export function environmentFit(roughness: number, dotNV: number): [number, number] {
  const c = [1 - roughness, 0.0425 - 0.0275 * roughness, 1.04 - 0.572 * roughness, -0.04 + 0.022 * roughness];
  const grazing = Math.min(c[0] * c[0], Math.pow(2, -9.28 * dotNV));
  const fit = grazing * c[0] + c[1];
  return [-1.04 * fit + c[2], 1.04 * fit + c[3]];
}
