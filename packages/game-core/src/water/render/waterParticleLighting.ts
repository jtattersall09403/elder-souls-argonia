import type { Vec3 } from "@elder-souls/contracts";

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t);
};

/** The runtime supplies the same HDR air-light feeds as the sky: ambient is
 * sky irradiance×0.1; direct is sun/moon irradiance×the haze scatter factor.
 * Undo those atmospheric factors, then use off-white diffuse albedo/PI.
 * Never clamp scene-linear radiance to display white: daylight exposure is
 * ~1e-5, and doing so turns white spray into near-black soot. */
export function waterParticleRadiance(ambient: Vec3, direct: Vec3, sunY: number, out: Vec3 = { x: 0, y: 0, z: 0 }): Vec3 {
  const altitudeDeg = Math.asin(Math.min(1, Math.max(-1, sunY))) * 180 / Math.PI;
  const golden = (1 - smooth(4, 16, altitudeDeg)) * smooth(-3, 1, altitudeDeg);
  const hazeScatter = 0.06 * (1 + 2.2 * golden);
  const albedoOverPi = 0.88 / Math.PI;
  // Randomly oriented spray sees a hemisphere, not a sun-facing flat plate.
  const directFraction = 0.5;
  for (const axis of ["x", "y", "z"] as const) {
    const sky = Number.isFinite(ambient[axis]) ? Math.max(0, ambient[axis]) / 0.1 : 0;
    const beam = Number.isFinite(direct[axis]) ? Math.max(0, direct[axis]) / hazeScatter : 0;
    out[axis] = albedoOverPi * (sky + beam * directFraction);
  }
  return out;
}
