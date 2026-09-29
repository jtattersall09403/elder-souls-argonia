/** Irregular bubble groups in an advected foam patch (the shader is
 * WaterEffects.ts `particleFoamNode`). Neighbour search keeps cell edges
 * invisible; footprint-integrated rings do not become stripes when
 * individual bubbles shrink below a pixel. No bitmap asset is created.
 * This is the TS probe twin of the finite-width ring's pixel integral.
 */
export function bubbleRingCoverage(distance: number, radius: number, pixel: number): number {
  const width = Math.max(0.006, pixel);
  const smooth = (v: number) => {
    const t = Math.max(0, Math.min(1, (v + width) / (2 * width)));
    return t * t * (3 - 2 * t);
  };
  return smooth(radius + 0.025 - distance) - smooth(radius - 0.025 - distance);
}
