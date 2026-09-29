/**
 * A `scene.background` colour that shows as its own hex on the node renderer.
 *
 * Three 0.184's WebGPURenderer tone-maps the whole frame in its output pass,
 * the clear colour included, so a Color background shifts under ACES; the
 * classic WebGLRenderer cleared to it untouched. No node can skip that pass,
 * so this pre-applies the inverse: the returned Color, once tone-mapped with
 * the renderer's own exposure, lands on the requested colour (decision 0109).
 * Only NoToneMapping and ACESFilmicToneMapping are inverted; any other mode
 * returns the colour unchanged.
 */
import { ACESFilmicToneMapping, Color, type ColorRepresentation, type ToneMapping } from "three";

// three/src/nodes/display/ToneMappingFunctions.js acesFilmicToneMapping, row-major.
const ACES_IN = [0.59719, 0.35458, 0.04823, 0.076, 0.90834, 0.01566, 0.0284, 0.13383, 0.83777];
const ACES_OUT = [1.60475, -0.53108, -0.07367, -0.10208, 1.10813, -0.00605, -0.00327, -0.07276, 1.07602];

function mul(m: number[], v: number[]): number[] {
  return [0, 1, 2].map((r) => m[r * 3] * v[0] + m[r * 3 + 1] * v[1] + m[r * 3 + 2] * v[2]);
}

function inverse3(m: number[]): number[] {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d]
    .map((x) => x / det);
}

const ACES_IN_INV = inverse3(ACES_IN);
const ACES_OUT_INV = inverse3(ACES_OUT);

/** RRTAndODTFit: (v(v+0.0245786)-0.000090537) / (0.983729 v(v+0.432951) + 0.238081). */
export function rrtOdtFit(v: number): number {
  return (v * (v + 0.0245786) - 0.000090537) / (0.983729 * v * (v + 0.432951) + 0.238081);
}

/** The positive root of rrtOdtFit(v) = u; u is capped below the fit's asymptote. */
function rrtOdtFitInverse(u: number): number {
  const t = Math.min(Math.max(u, 0), 0.999 / 0.983729);
  const a = 1 - 0.983729 * t;
  const b = 0.0245786 - 0.983729 * 0.432951 * t;
  const c = -(0.000090537 + 0.238081 * t);
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
}

/** Three's ACES (linear in, linear out, before the output colour space). */
export function acesFilmic(rgb: number[], exposure: number): number[] {
  const v = mul(ACES_IN, rgb.map((x) => (x * exposure) / 0.6));
  return mul(ACES_OUT, v.map(rrtOdtFit)).map((x) => Math.min(Math.max(x, 0), 1));
}

export function untonedBackground(color: ColorRepresentation, toneMapping: ToneMapping, exposure: number): Color {
  const target = new Color(color);
  if (toneMapping !== ACESFilmicToneMapping || exposure <= 0) return target;
  const v = mul(ACES_OUT_INV, [target.r, target.g, target.b]).map(rrtOdtFitInverse);
  const [r, g, b] = mul(ACES_IN_INV, v).map((x) => Math.max(0, (x * 0.6) / exposure));
  return new Color(r, g, b);
}
