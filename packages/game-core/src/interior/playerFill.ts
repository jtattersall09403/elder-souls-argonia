/**
 * The player fill indoors (vol10 c9 I2, an art-direction default): a weak point light kept between the
 * camera and the player, keyed to the cell's ambient, so a character backlit by a lit wall still reads
 * (the common character key light). Its irradiance at the body is k x the cell's ambient irradiance, so a
 * dim cell gets a dim fill and a bright cell a bright one; k comes from QualitySettings.interiorPlayerFillK
 * (0 = off). The host adds the light before the cell's link and only changes its intensity and position.
 */
import type { InteriorBundle } from "./bundle";

/** Linear luminance (Rec. 709) of a linear RGB triple. */
function luminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** sRGB 0-255 channel to linear 0-1. */
function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** The cell ambient's luminance as the loader lights it (interiorAmbient's inputs, before its PI scale):
 * the mean over the ambient cube's six faces, else the flat colour (linearised), times `ambient.intensity`. */
export function cellAmbientLuminance(bundle: Pick<InteriorBundle, "ambient" | "lighting">): number {
  const cube = bundle.lighting?.ambientCube;
  let l: number;
  if (cube) {
    const faces = [cube.px, cube.nx, cube.py, cube.ny, cube.pz, cube.nz];
    l = faces.reduce((s, f) => s + luminance(f[0], f[1], f[2]), 0) / faces.length;
  } else {
    const [r, g, b] = bundle.ambient.colorRGB;
    l = luminance(srgbToLinear(r), srgbToLinear(g), srgbToLinear(b));
  }
  return l * bundle.ambient.intensity;
}

/** The fill's point intensity (candela): I = k x E_amb x d^2, E_amb = PI x `ambientLuminance`, so at `d`
 * metres (decay 2) it adds k x the ambient irradiance to the side of the body it faces. */
export function playerFillIntensity(ambientLuminance: number, k: number, d: number): number {
  if (!(k > 0) || !(ambientLuminance > 0)) return 0;
  return k * Math.PI * ambientLuminance * d * d;
}

/** Where the fill sits: metres from the body centre toward the camera, and up. */
export const PLAYER_FILL_TOWARD_CAMERA_M = 0.9;
export const PLAYER_FILL_UP_M = 0.3;
/** The fill's reach (THREE.PointLight distance), metres. */
export const PLAYER_FILL_DISTANCE_M = 2.5;
