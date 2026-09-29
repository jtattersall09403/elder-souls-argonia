import { sel, type TslNode } from "../../render/nodes/materialNodes";
import { esRipplePath, ripplePathConnected, type RippleSupportNodes } from './rippleIsolation';
import * as TSL from "three/tsl";
// Loose TSL (decision 0107 §1): the chained typings are too deep for tsc to
// check usefully and cost minutes of type-checking; values are TslNode.
const {If, abs, bool, float, floor, fract, texture, vec2, vec4} = TSL as TslNode;

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

/** A ripple pass's shared nodes: the boundary accessors plus the state
 * history read (RippleSim builds these once per pass material). */
export interface RipplePassNodes extends RippleSupportNodes {
  /** Fragment state uv (the quad's uv). */
  uv: TslNode;
  inside(uv: TslNode): TslNode;
  /** Previous state at uv with its label replaced by `boundary.rg`; RG zeroed
   * off-mask or when the stored owner differs. */
  history(uv: TslNode, boundary: TslNode): TslNode;
}

export interface RippleAdvectionUniforms {
  /** RG float32 current texture node (metres/second), cell-centred like the mask. */
  current: TslNode;
  stateSize: TslNode;
  patchM: TslNode;
  deltaS: TslNode;
}

/** The separate bounded pass transports both wave variables through full
 * visible elapsed time; capped wave steps preserve their existing
 * four-neighbour no-flux update. Returns the new state (vec4) at `ctx.uv`.
 * GPU twin of advectRippleField; call inside a Fn. */
export function esRippleAdvection(ctx: RipplePassNodes, u: RippleAdvectionUniforms): TslNode {
  const uv = ctx.uv;
  const out = vec4(0).toVar();
  const boundary = ctx.support(uv);
  If(boundary.a.greaterThanEqual(0.5), () => {
    const centre = ctx.history(uv, boundary);
    const velocity: TslNode = (texture(u.current, uv.add(ctx.maskOffset)) as TslNode).level(float(0)).rg;
    const source = uv.sub(velocity.mul(u.deltaS).div(u.patchM));
    const crossings: TslNode = abs(floor(source.add(ctx.maskOffset).mul(ctx.maskSize)).sub(floor(uv.add(ctx.maskOffset).mul(ctx.maskSize))));
    If(ctx.inside(source).not().or(crossings.x.add(crossings.y).greaterThan(RIPPLE_TRANSPORT_MAX_CELLS)), () => {
      out.assign(vec4(0, 0, boundary.rg));
    }).Else(() => {
      out.assign(centre);
      const sourceBoundary = ctx.support(source);
      If(sourceBoundary.a.greaterThanEqual(0.5).and(ctx.sameBody(sourceBoundary.rg, boundary.rg)), () => {
        If(esRipplePath(ctx, uv, source, boundary.rg), () => {
          const grid: TslNode = source.mul(u.stateSize).sub(0.5), origin: TslNode = floor(grid), fraction: TslNode = fract(grid);
          const result = vec2(0).toVar();
          for (let z = 0; z < 2; z++) for (let x = 0; x < 2; x++) {
            const tap = origin.add(vec2(x, z)).add(0.5).div(u.stateSize);
            const weight = float(x === 0 ? fraction.x.oneMinus() : fraction.x).mul(z === 0 ? fraction.y.oneMinus() : fraction.y);
            If(weight.greaterThan(0), () => {
              const edge = ctx.support(tap);
              const admitted = bool(false).toVar();
              If(ctx.inside(tap).and(edge.a.greaterThan(0.5)).and(ctx.sameBody(edge.rg, boundary.rg)), () => {
                admitted.assign(esRipplePath(ctx, source, tap, boundary.rg));
              });
              result.assign(result.add(sel(admitted, ctx.history(tap, edge).rg, centre.rg).mul(weight)));
            });
          }
          out.assign(vec4(result, boundary.rg));
        });
      });
    });
  });
  return out;
}
