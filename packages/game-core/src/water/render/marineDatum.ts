/** CPU oracle for the horizon vertex operation. The horizon owns only
 * marine fragments (compiled datum zero); its hidden inland vertices must
 * not interpolate an unrelated inland head into those fragments. Rebase
 * signed depth too, retaining the original proxy bed exactly. This does
 * not change tide/season coefficients or solve their grid interpolation. */
export function marineDatumSurface(baseM: number, depthM: number, overrideW: number): readonly [number, number] {
  return overrideW < -0.5 ? [0, depthM - baseM] : [baseM, depthM];
}

export const MARINE_DATUM_GLSL = /* glsl */ `
vec2 esMarineDatumSurface(vec2 surface, float overrideW) {
  return overrideW < -0.5 ? vec2(0.0, surface.y - surface.x) : surface;
}
`;
