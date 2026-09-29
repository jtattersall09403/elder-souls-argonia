import type { TslNode } from "../../render/nodes/materialNodes";
import * as TSL from "three/tsl";
// Loose TSL (decision 0107 §1): the chained typings are too deep for tsc to
// check usefully and cost minutes of type-checking; values are TslNode.
const {Break, If, Loop, abs, bool, clamp, dot, float, floor, fract, ivec2, select, sign, textureLoad, textureSize, vec2, vec3, vec4} = TSL as TslNode;

/** Exact grid supercover for a bounded ripple impulse. Crossing a corner
 * requires both incident orthogonal cells, so diagonal ponds never couple. */
export function ripplePathConnected(labels: ArrayLike<number>, size: number, ax: number, az: number, bx: number, bz: number): boolean {
  const read = (x: number, z: number) => x >= 0 && z >= 0 && x < size && z < size ? labels[z * size + x] : 0;
  let x = Math.floor(ax), z = Math.floor(az);
  const endX = Math.floor(bx), endZ = Math.floor(bz), label = read(x, z);
  if (!label) return false;
  const dx = bx - ax, dz = bz - az, sx = Math.sign(dx), sz = Math.sign(dz);
  const tx = sx ? 1 / Math.abs(dx) : Infinity, tz = sz ? 1 / Math.abs(dz) : Infinity;
  let nextX = sx ? ((sx > 0 ? x + 1 : x) - ax) / dx : Infinity;
  let nextZ = sz ? ((sz > 0 ? z + 1 : z) - az) / dz : Infinity;
  for (let step = 0; step < 32; step++) {
    if (x === endX && z === endZ) return true;
    if (Math.abs(nextX - nextZ) < 1e-7) {
      if (read(x + sx, z) !== label || read(x, z + sz) !== label) return false;
      x += sx; z += sz; nextX += tx; nextZ += tz;
    } else if (nextX < nextZ) { x += sx; nextX += tx; }
    else { z += sz; nextZ += tz; }
    if (read(x, z) !== label) return false;
  }
  return false;
}

/** The shared boundary accessors every ripple pass builds once per material
 * (RippleSim's former COMMON block): `support(uv)` samples the RG-label /
 * B-depth / A-wet mask at state uv + maskOffset (zero outside), `sameBody`
 * compares two normalized 16-bit owner labels. */
export interface RippleSupportNodes {
  maskOffset: TslNode;
  maskSize: TslNode;
  support(uv: TslNode): TslNode;
  sameBody(a: TslNode, b: TslNode): TslNode;
}

/** Wet, same-body test for one mask cell (GPU twin of the label read inside
 * ripplePathConnected). */
export function esRipplePathCell(ctx: RippleSupportNodes, cell: TslNode, body: TslNode): TslNode {
  const value = ctx.support(cell.add(0.5).div(ctx.maskSize).sub(ctx.maskOffset));
  return value.a.greaterThan(0.5).and(ctx.sameBody(value.rg, body));
}

/** GPU twin of ripplePathConnected in state-uv space (bool node). Emits its
 * 32-step loop into the current TSL stack: call it inside a Fn / If only
 * where the GLSL evaluated it, so short-circuited paths stay unevaluated. */
export function esRipplePath(ctx: RippleSupportNodes, from: TslNode, to: TslNode, body: TslNode): TslNode {
  // Every input is evaluated once into a local before the loop, so no loop
  // body re-reads an outer loop's index (the drop pass calls this per drop).
  const a = from.add(ctx.maskOffset).mul(ctx.maskSize).toVar(), b = to.add(ctx.maskOffset).mul(ctx.maskSize).toVar();
  const start = floor(a).toVar(), end = floor(b).toVar(), delta = b.sub(a).toVar(), direction = sign(delta).toVar();
  const target = vec2(body).toVar();
  const hasX = abs(delta.x).greaterThan(1e-12), hasY = abs(delta.y).greaterThan(1e-12);
  const interval = vec2(select(hasX, float(1).div(abs(delta.x)), 1e20), select(hasY, float(1).div(abs(delta.y)), 1e20)).toVar();
  const cell = vec2(start).toVar();
  const next = vec2(
    select(hasX, select(direction.x.greaterThan(0), start.x.add(1), start.x).sub(a.x).div(delta.x), 1e20),
    select(hasY, select(direction.y.greaterThan(0), start.y.add(1), start.y).sub(a.y).div(delta.y), 1e20)).toVar();
  const connected = bool(false).toVar();
  Loop({ start: 0, end: 32, type: "int", condition: "<", name: "pathStep" }, () => {
    If(cell.x.equal(end.x).and(cell.y.equal(end.y)), () => { connected.assign(true); Break(); });
    const blocked = bool(false).toVar();
    If(abs(next.x.sub(next.y)).lessThan(1e-7), () => {
      If(esRipplePathCell(ctx, cell.add(vec2(direction.x, 0)), target).not()
        .or(esRipplePathCell(ctx, cell.add(vec2(0, direction.y)), target).not()), () => { blocked.assign(true); });
      cell.assign(cell.add(direction)); next.assign(next.add(interval));
    }).ElseIf(next.x.lessThan(next.y), () => {
      cell.assign(cell.add(vec2(direction.x, 0))); next.assign(next.add(vec2(interval.x, 0)));
    }).Else(() => {
      cell.assign(cell.add(vec2(0, direction.y))); next.assign(next.add(vec2(0, interval.y)));
    });
    If(blocked.or(esRipplePathCell(ctx, cell, target).not()), () => { Break(); });
  });
  return connected;
}

/** Shared renderer oracle: RG height/velocity, BA normalized owner bytes.
 * Never linearly mix owner labels or borrow the other side of a dry corner. */
export function sampleIsolatedRipple(field: ArrayLike<number>, size: number, u: number, v: number) {
  const fetch = (x: number, z: number) => x < 0 || z < 0 || x >= size || z >= size ? [0, 0, 0, 0] : Array.from({ length: 4 }, (_, c) => field[(z * size + x) * 4 + c]);
  const same = (a: number[], b: number[]) => Math.abs(a[2] - b[2]) + Math.abs(a[3] - b[3]) < 0.002;
  const rx = Math.floor(u * size), rz = Math.floor(v * size), reference = fetch(rx, rz);
  const result = { gradientX: 0, gradientZ: 0, height: 0 };
  if (reference[2] + reference[3] < 0.002) return result;
  const gx = u * size - 0.5, gz = v * size - 0.5, ix = Math.floor(gx), iz = Math.floor(gz), tx = gx - ix, tz = gz - iz;
  for (let dz = 0; dz < 2; dz++) for (let dx = 0; dx < 2; dx++) {
    const x = ix + dx, z = iz + dz, current = fetch(x, z), weight = (dx ? tx : 1 - tx) * (dz ? tz : 1 - tz);
    if (!same(current, reference) || (x !== rx && z !== rz && (!same(fetch(x, rz), reference) || !same(fetch(rx, z), reference)))) {
      result.height += reference[0] * weight; continue;
    }
    const height = (x: number, z: number) => { const next = fetch(x, z); return same(next, current) ? next[0] : current[0]; };
    result.gradientX += (height(x + 1, z) - height(x - 1, z)) * weight;
    result.gradientZ += (height(x, z + 1) - height(x, z - 1)) * weight;
    result.height += current[0] * weight;
  }
  return result;
}

/** No extra texture: point-fetch labels and owner-aware height gradients
 * directly from the existing ripple state. `field` is a texture node of the
 * RG height/velocity, BA owner-label state; returns vec3(X difference,
 * Z difference, height). GPU twin of sampleIsolatedRipple. Call inside a Fn. */
export function esRippleTexel(field: TslNode, cell: TslNode): TslNode {
  const size = ivec2(textureSize(field, 0));
  const outside = cell.x.lessThan(0).or(cell.y.lessThan(0)).or(cell.x.greaterThanEqual(size.x)).or(cell.y.greaterThanEqual(size.y));
  return select(outside, vec4(0), textureLoad(field, clamp(cell, ivec2(0), size.sub(1))));
}
export function esRippleSame(a: TslNode, b: TslNode): TslNode {
  return dot(abs(a.ba.sub(b.ba)), vec2(1)).lessThan(0.002);
}
function esRippleNeighbour(field: TslNode, cell: TslNode, reference: TslNode): TslNode {
  const value = esRippleTexel(field, cell);
  return select(esRippleSame(value, reference), value.r, reference.r);
}
export function esIsolatedRipple(field: TslNode, uv: TslNode): TslNode {
  const size = vec2(textureSize(field, 0)), g = uv.mul(size).sub(0.5);
  const origin = ivec2(floor(g)), refCell = ivec2(floor(uv.mul(size)));
  const reference = esRippleTexel(field, refCell);
  const result = vec3(0).toVar();
  If(reference.b.add(reference.a).greaterThanEqual(0.002), () => {
    const f = fract(g);
    for (let z = 0; z < 2; z++) for (let x = 0; x < 2; x++) {
      const cell = origin.add(ivec2(x, z)), value = esRippleTexel(field, cell);
      const weight = float(x === 0 ? f.x.oneMinus() : f.x).mul(z === 0 ? f.y.oneMinus() : f.y);
      const diagonal = cell.x.notEqual(refCell.x).and(cell.y.notEqual(refCell.y));
      const connected = esRippleSame(value, reference).and(diagonal.not()
        .or(esRippleSame(esRippleTexel(field, ivec2(cell.x, refCell.y)), reference)
          .and(esRippleSame(esRippleTexel(field, ivec2(refCell.x, cell.y)), reference))));
      If(connected.not(), () => { result.assign(result.add(vec3(0, 0, reference.r.mul(weight)))); }).Else(() => {
        result.assign(result.add(vec3(
          esRippleNeighbour(field, cell.add(ivec2(1, 0)), value).sub(esRippleNeighbour(field, cell.sub(ivec2(1, 0)), value)),
          esRippleNeighbour(field, cell.add(ivec2(0, 1)), value).sub(esRippleNeighbour(field, cell.sub(ivec2(0, 1)), value)),
          value.r).mul(weight)));
      });
    }
  });
  return result;
}
