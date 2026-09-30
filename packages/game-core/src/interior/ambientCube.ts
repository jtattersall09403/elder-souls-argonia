/**
 * The cell's directional ambient (Skyrim XCLL "Ambient Colors" / LGTM DALC,
 * bundle schema 4 `lighting.ambientCube`) as spherical-harmonic irradiance
 * coefficients, plain numbers so any renderer can read them (the WebGL
 * loader feeds them to a THREE.LightProbe; a WebGPU path reads the same
 * array).
 *
 * The cube is six linear colours on the game axes (y up, z south). The
 * irradiance it stands for on a unit normal n is
 *
 *   E(n) = Σ_a m_a·a² + d_a·a,  a ∈ {x, y, z},  m_a = (p_a + n_a)/2,  d_a = (p_a − n_a)/2
 *
 * which is exactly the cube colour on each of the six axes, uniform for a
 * uniform cube, and blends quadratically between them. A quadratic on the
 * sphere is exactly representable in SH bands 0–2, so the coefficients below
 * reproduce E(n) exactly under three.js's `shGetIrradianceAt` (the band-1
 * only projection misses each axis by half the difference of its pair's mean
 * and the cube's mean, and goes negative opposite a one-sided cube). Only
 * the diagonal band-2 terms (6 = z², 8 = x² − y²) are non-zero.
 *
 * interior_light.py `cube_irradiance` and the render tool
 * (render_interior.py) evaluate the same E(n).
 */

/** Linear rgb, 0–1. */
export type LinearRGB = [number, number, number];

/** `lighting.ambientCube`: one linear colour per game axis direction. */
export interface AmbientCube {
  px: LinearRGB; nx: LinearRGB; py: LinearRGB; ny: LinearRGB; pz: LinearRGB; nz: LinearRGB;
}

export const AMBIENT_CUBE_KEYS = ["px", "nx", "py", "ny", "pz", "nz"] as const;

// three.js shGetIrradianceAt (lights_pars_begin / SphericalHarmonics3.getIrradianceAt)
const C_L0 = 0.886227;
const C_L1 = 2 * 0.511664;
const C_Z2 = 0.743125;
const C_Z2_OFFSET = 0.247708;
const C_XY2 = 0.429043;

/**
 * Nine rgb SH coefficients (three.js order: L00, L1-1 (y), L10 (z), L11 (x),
 * L2-2, L2-1, L20, L21, L22) whose irradiance is `scale × E(n)` (see the
 * module comment). `scale` is the loader's ambient scale (π × intensity), so
 * the probe lights a Lambert surface exactly as an AmbientLight of the same
 * colour and scale would on each axis.
 */
export function ambientCubeToSH(cube: AmbientCube, scale = 1): LinearRGB[] {
  const out: LinearRGB[] = Array.from({ length: 9 }, () => [0, 0, 0] as LinearRGB);
  for (let c = 0; c < 3; c++) {
    const m = [cube.px[c] + cube.nx[c], cube.py[c] + cube.ny[c], cube.pz[c] + cube.nz[c]].map((v) => v * scale / 2);
    const d = [cube.px[c] - cube.nx[c], cube.py[c] - cube.ny[c], cube.pz[c] - cube.nz[c]].map((v) => v * scale / 2);
    // m_x x² + m_y y² + m_z z² on the unit sphere = α + β z² + γ (x² − y²)
    const alpha = (m[0] + m[1]) / 2;
    const beta = m[2] - alpha;
    const gamma = (m[0] - m[1]) / 2;
    const s6 = beta / C_Z2;
    out[6][c] = s6;
    out[8][c] = gamma / C_XY2;
    out[0][c] = (alpha + C_Z2_OFFSET * s6) / C_L0;
    out[1][c] = d[1] / C_L1;
    out[2][c] = d[2] / C_L1;
    out[3][c] = d[0] / C_L1;
  }
  return out;
}

/** `E(n)` itself (unit normal, game axes): what the SH evaluates to. */
export function ambientCubeAt(cube: AmbientCube, n: readonly [number, number, number]): LinearRGB {
  const [x, y, z] = n;
  const out: LinearRGB = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    out[c] = ((cube.px[c] + cube.nx[c]) * x * x + (cube.py[c] + cube.ny[c]) * y * y + (cube.pz[c] + cube.nz[c]) * z * z
      + (cube.px[c] - cube.nx[c]) * x + (cube.py[c] - cube.ny[c]) * y + (cube.pz[c] - cube.nz[c]) * z) / 2;
  }
  return out;
}

export function isAmbientCube(v: unknown): v is AmbientCube {
  if (typeof v !== "object" || v === null) return false;
  return AMBIENT_CUBE_KEYS.every((k) => {
    const c = (v as Record<string, unknown>)[k];
    return Array.isArray(c) && c.length === 3 && c.every((x) => typeof x === "number" && Number.isFinite(x) && x >= 0);
  });
}
