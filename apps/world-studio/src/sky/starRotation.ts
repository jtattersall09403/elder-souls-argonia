/**
 * Stars sit fixed on the celestial sphere, so their horizontal positions are
 * one rotation of their equatorial unit vectors (perf10 K2): the star buffer
 * is written once in equatorial coordinates and the frame only updates this
 * 3x3 matrix. The matrix reproduces `toHorizontal(dec, lst - ra, latitude)`
 * (world-time ephemeris): x east, y up, z south.
 */

/** Equatorial unit vector of (right ascension, declination), radians. */
export function equatorialUnit(ra: number, dec: number, out: { x: number; y: number; z: number }) {
  const c = Math.cos(dec);
  out.x = c * Math.cos(ra);
  out.y = c * Math.sin(ra);
  out.z = Math.sin(dec);
  return out;
}

/**
 * Row-major equatorial-to-horizontal rotation for local sidereal angle `lst`
 * at `latitude`, written into `out` (9 numbers, e.g. Matrix3.set argument order).
 */
export function equatorialToHorizontal(lst: number, latitude: number, out: number[]): number[] {
  const cL = Math.cos(lst), sL = Math.sin(lst);
  const cP = Math.cos(latitude), sP = Math.sin(latitude);
  out[0] = -sL; out[1] = cL; out[2] = 0;
  out[3] = cP * cL; out[4] = cP * sL; out[5] = sP;
  out[6] = sP * cL; out[7] = sP * sL; out[8] = -cP;
  return out;
}
