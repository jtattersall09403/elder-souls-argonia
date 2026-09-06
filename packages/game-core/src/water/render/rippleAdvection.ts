import { ripplePathConnected } from './rippleIsolation';

/** Leave slack inside the shared 32-iteration exact supercover. A longer
 * backtrace expires local history; it never slows the authored current. */
export const RIPPLE_TRANSPORT_MAX_CELLS = 30;

/** CPU oracle for the offscreen transport pass. State is RG height/velocity,
 * BA normalized 16-bit owner label; labels/current share a cell-centred mask.
 * No flow rescaling: backtraces are current metres/second * elapsed seconds. */
export function advectRippleField(state: Float32Array, size: number, labels: ArrayLike<number>, current: Float32Array,
  maskSize: number, patchM: number, dt: number): Float32Array<ArrayBuffer> {
  const output = new Float32Array(state.length);
  const labelAt = (u: number, v: number) => u < 0 || v < 0 || u >= 1 || v >= 1 ? 0
    : labels[Math.floor(v * maskSize) * maskSize + Math.floor(u * maskSize)];
  const connected = (u: number, v: number, x: number, z: number) => ripplePathConnected(labels, maskSize,
    u * maskSize, v * maskSize, x * maskSize, z * maskSize);
  const history = (x: number, z: number, label: number, component: number) => {
    if (x < 0 || z < 0 || x >= size || z >= size) return 0;
    const i = (z * size + x) * 4;
    return Math.abs(state[i + 2] - (label & 255) / 255) + Math.abs(state[i + 3] - (label >>> 8) / 255) < 0.002 ? state[i + component] : 0;
  };
  for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) {
    const i = (z * size + x) * 4, u = (x + 0.5) / size, v = (z + 0.5) / size, label = labelAt(u, v);
    if (!label) continue;
    output[i + 2] = (label & 255) / 255; output[i + 3] = (label >>> 8) / 255;
    const ci = (Math.floor(v * maskSize) * maskSize + Math.floor(u * maskSize)) * 2;
    const sourceU = u - current[ci] * dt / patchM, sourceV = v - current[ci + 1] * dt / patchM;
    const crossings = Math.abs(Math.floor(sourceU * maskSize) - Math.floor(u * maskSize))
      + Math.abs(Math.floor(sourceV * maskSize) - Math.floor(v * maskSize));
    if (sourceU < 0 || sourceV < 0 || sourceU >= 1 || sourceV >= 1 || crossings > RIPPLE_TRANSPORT_MAX_CELLS) continue;
    const fallback = [history(x, z, label, 0), history(x, z, label, 1)];
    if (!connected(u, v, sourceU, sourceV) || labelAt(sourceU, sourceV) !== label) {
      output[i] = fallback[0]; output[i + 1] = fallback[1]; continue;
    }
    const gx = sourceU * size - 0.5, gz = sourceV * size - 0.5, ix = Math.floor(gx), iz = Math.floor(gz), tx = gx - ix, tz = gz - iz;
    for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 2; dx++) {
      const sampleU = (ix + dx + 0.5) / size, sampleV = (iz + dz + 0.5) / size;
      const weight = (dx ? tx : 1 - tx) * (dz ? tz : 1 - tz);
      if (weight <= 0) continue;
      const admitted = labelAt(sampleU, sampleV) === label && connected(sourceU, sourceV, sampleU, sampleV);
      for (let c = 0; c < 2; c++) output[i + c] += weight * (admitted ? history(ix + dx, iz + dz, label, c) : fallback[c]);
    }
  }
  return output;
}

/** Requires COMMON and RIPPLE_PATH_GLSL. The separate bounded pass transports
 * both wave variables through full visible elapsed time; capped wave steps preserve their existing
 * four-neighbour no-flux update. This adds no main-material sampler. */
export const RIPPLE_ADVECTION_GLSL = /* glsl */ `
uniform sampler2D uCurrent;
uniform float uStateSize;
uniform float uPatchM;
uniform float uDeltaS;
void main() {
  vec4 boundary = support(vUv);
  if (boundary.a < 0.5) { gl_FragColor = vec4(0.0); return; }
  vec4 centre = history(vUv, boundary);
  vec2 velocity = texture2D(uCurrent, vUv + uMaskOffset).rg;
  vec2 source = vUv - velocity * uDeltaS / uPatchM;
  vec2 crossings = abs(floor((source + uMaskOffset) * uMaskSize) - floor((vUv + uMaskOffset) * uMaskSize));
  if (!inside(source) || crossings.x + crossings.y > ${RIPPLE_TRANSPORT_MAX_CELLS.toFixed(1)}) {
    gl_FragColor = vec4(0.0, 0.0, boundary.rg); return;
  }
  vec4 sourceBoundary = support(source);
  if (sourceBoundary.a < 0.5 || !sameBody(sourceBoundary.rg, boundary.rg)
      || !esRipplePath(vUv, source, boundary.rg)) { gl_FragColor = centre; return; }
  vec2 grid = source * uStateSize - 0.5, origin = floor(grid), fraction = fract(grid);
  vec2 result = vec2(0.0);
  for (int z = 0; z < 2; z++) for (int x = 0; x < 2; x++) {
    vec2 tap = (origin + vec2(float(x), float(z)) + 0.5) / uStateSize;
    float weight = (x == 0 ? 1.0-fraction.x : fraction.x) * (z == 0 ? 1.0-fraction.y : fraction.y);
    if (weight <= 0.0) continue;
    vec4 edge = support(tap);
    bool admitted = inside(tap) && edge.a > 0.5 && sameBody(edge.rg, boundary.rg)
      && esRipplePath(source, tap, boundary.rg);
    result += weight * (admitted ? history(tap, edge).rg : centre.rg);
  }
  gl_FragColor = vec4(result, boundary.rg);
}
`;
