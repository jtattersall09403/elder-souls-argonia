import * as tsl from "three/tsl";
import type { TslNode } from "../../render/nodes/materialNodes";

// Loosely typed on purpose (docs/standards/tsl-shaders.md §1).
const { abs, clamp, float, floor, fract, int, ivec2, max, min, select, vec2, vec3, vec4 } = tsl as TslNode;

/** WaterData's owner-aware access/tide/season sampler as node helpers (the
 * old CONNECTED_STAGE_GLSL). Packed RG16 is affine, but different owners'
 * barriers and level responses must never blend. Shared by water and opaque
 * receiving materials. Texture arguments are texture NODES (their `.value`
 * may be swapped later); every read is a texel fetch, so these are safe in
 * any control flow. The GLSL's `continue` on a foreign owner is a zero weight. */

interface Corner { p: TslNode; weight: TslNode }

function ownedCorners(worldXZ: TslNode, supportMap: TslNode, size: TslNode, mpp: TslNode,
  origin: TslNode): Corner[] {
  const pixel = clamp(vec2(worldXZ).sub(origin).div(mpp), vec2(0.0), vec2(float(size).sub(1.0)));
  const limit = ivec2(int(size).sub(1));
  const base = ivec2(floor(pixel));
  const nearest = min(ivec2(floor(pixel.add(0.5))), limit);
  const owner = supportMap.load(nearest).gb;
  const f = fract(pixel);
  const corners: Corner[] = [];
  for (let z = 0; z < 2; z++) for (let x = 0; x < 2; x++) {
    const p = min(base.add(ivec2(x, z)), limit);
    const delta = abs(supportMap.load(p).gb.sub(owner));
    const foreign = delta.x.greaterThan(0.5 / 255.0).or(delta.y.greaterThan(0.5 / 255.0));
    const weight = (x === 0 ? float(1.0).sub(f.x) : f.x).mul(z === 0 ? float(1.0).sub(f.y) : f.y);
    corners.push({ p, weight: select(foreign, float(0.0), weight) });
  }
  return corners;
}

/** Owner-weighted bilinear of `field` (vec4). */
export function esOwnedRaster(worldXZ: TslNode, field: TslNode, supportMap: TslNode,
  size: TslNode, mpp: TslNode, origin: TslNode): TslNode {
  let result: TslNode = vec4(0.0);
  let total: TslNode = float(0.0);
  for (const { p, weight } of ownedCorners(worldXZ, supportMap, size, mpp, origin)) {
    result = result.add(field.load(p).mul(weight));
    total = total.add(weight);
  }
  return result.div(max(total, 0.000001));
}

/** Owner-weighted (access threshold, season, shore class) of a column. */
export function esConnectedStage(worldXZ: TslNode, surfaceMap: TslNode, supportMap: TslNode,
  shoreMap: TslNode, size: TslNode, mpp: TslNode, origin: TslNode, minimum: TslNode,
  span: TslNode): TslNode {
  let result: TslNode = vec3(0.0);
  let total: TslNode = float(0.0);
  for (const { p, weight } of ownedCorners(worldXZ, supportMap, size, mpp, origin)) {
    // Packed after PNG decoding; original CPU RGB/access arrays unchanged.
    const shore = shoreMap.load(p);
    const access = vec3(supportMap.load(p).a, shore.a, surfaceMap.load(p).a);
    const threshold = float(minimum).add(access.xy.dot(vec2(65280.0, 255.0)).div(65535.0).mul(span));
    result = result.add(vec3(threshold, access.z, shore.g).mul(weight));
    total = total.add(weight);
  }
  return result.div(max(total, 0.000001));
}
