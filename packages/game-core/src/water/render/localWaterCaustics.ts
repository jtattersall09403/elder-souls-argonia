import * as tsl from "three/tsl";
import type { TslNode } from "../../render/nodes/materialNodes";
import { localWaterSurfaceNodes, type LocalWaterSurfaceUniforms } from "./localWaterSurfaceNodes";

// Loosely typed on purpose (docs/standards/tsl-shaders.md §1).
const { Fn, If, clamp, dFdx, dFdy, exp, float, length, max, min, normalize, refract, smoothstep, vec2, vec3 } = tsl as TslNode;

/** Refraction-map Jacobian for the interactive surface (node twin of the old
 * LOCAL_WATER_CAUSTICS_GLSL). Unlike decorative caustic noise, moving a body
 * changes these focused rays through the same height/slope field used by the
 * visible surface and physical queries. Receiver material supplies
 * direct-light shadowing; this is not emission. The footprint derivatives run
 * first, at the top level; the GLSL's early returns are real `If` branches
 * after them. */
export function esLocalWaterCaustic(u: LocalWaterSurfaceUniforms, receiver: TslNode,
  receiverNormal: TslNode, level: TslNode, sunDirection: TslNode): TslNode {
  return Fn(() => {
  const local = localWaterSurfaceNodes(u);
  const r = vec3(receiver).toVar(), sun = vec3(sunDirection).toVar();
  const refractedOffset = (p: TslNode, depth: TslNode): TslNode => {
    const water = local.surface(p);
    const normal = normalize(vec3(water.y.negate(), 1.0, water.z.negate()));
    const ray = refract(sun.negate(), normal, 1.0 / 1.333);
    return ray.xz.div(max(ray.y.negate(), 0.15)).mul(max(0.0, depth.add(water.x)));
  };
  // Derivatives must execute before any per-pixel dry/depth branch.
  const footprint = max(length(dFdx(r.xz)), length(dFdy(r.xz))).toVar();
  // Clamped: a receiver far above or below the level is off anyway (the
  // `off` gate), and the unclamped value overflowed exp() into inf -> NaN.
  const depth = clamp(float(level).sub(r.y), -1.0, 13.0).toVar();
  const flatRay = refract(sun.negate(), vec3(0.0, 1.0, 0.0), 1.0 / 1.333);
  const p = r.xz.sub(flatRay.xz.div(max(flatRay.y.negate(), 0.15)).mul(depth)).toVar();
  const stepM = max(u.uLocalWaterInfo.z, 0.25).toVar();
  const ex = vec2(stepM, 0.0), ez = vec2(0.0, stepM);
  const out = float(0.0).toVar();
  // dev's early returns as real branches (loads only, no derivatives inside):
  // the cheap gates, then the centre and four neighbour masks (a dry/foreign
  // neighbour is not a flat water sample; differentiating across it makes a
  // spurious bright rectangular bank), then the 16-load refraction Jacobian.
  If(float(u.uLocalWaterActive).greaterThan(0.5).and(depth.greaterThan(0.03))
    .and(depth.lessThanEqual(12.0)).and(sun.y.greaterThan(0.05)), () => {
    If(local.mask(p).greaterThanEqual(0.5).and(min(min(local.mask(p.add(ex)), local.mask(p.sub(ex))),
      min(local.mask(p.add(ez)), local.mask(p.sub(ez)))).greaterThanEqual(0.5)), () => {
      const dx = refractedOffset(p.add(ex), depth).sub(refractedOffset(p.sub(ex), depth)).div(stepM.mul(2.0));
      const dz = refractedOffset(p.add(ez), depth).sub(refractedOffset(p.sub(ez), depth)).div(stepM.mul(2.0));
      const jacobian = float(1.0).add(dx.x).mul(float(1.0).add(dz.y)).sub(dx.y.mul(dz.x));
      const focused = clamp(float(1.0).div(max(jacobian.abs(), 0.1)), 0.25, 3.0).sub(1.0);
      out.assign(focused.mul(float(1.0).sub(smoothstep(stepM.mul(0.5), stepM.mul(2.0), footprint)))
        .mul(smoothstep(0.5, 0.9, vec3(receiverNormal).y)).mul(exp(clamp(depth, 0.0, 12.0).mul(-0.12))));
    });
  });
  return out;
  })();
}

/** CPU optical oracle for probes: the same central-difference refraction
 * Jacobian as the shader, before receiver attenuation and pixel filtering.
 * Returns a relative direct-light change, not an emissive intensity.
 */
export function localWaterFocus(
  sample: (x: number, z: number) => { height: number; slopeX: number; slopeZ: number } | null,
  x: number, z: number, depth: number, sun: readonly [number, number, number], cellSizeM: number,
): number {
  if (depth <= 0.03 || depth > 12 || sun[1] <= 0.05 || !sample(x, z)) return 0;
  const step = Math.max(cellSizeM, 0.25);
  const offset = (px: number, pz: number): [number, number] | null => {
    const water = sample(px, pz);
    if (!water) return null;
    const nLength = Math.hypot(water.slopeX, 1, water.slopeZ);
    const nx = -water.slopeX / nLength, ny = 1 / nLength, nz = -water.slopeZ / nLength;
    const eta = 1 / 1.333;
    const dot = -(sun[0] * nx + sun[1] * ny + sun[2] * nz);
    const normalScale = eta * dot + Math.sqrt(Math.max(0, 1 - eta * eta * (1 - dot * dot)));
    const rx = -eta * sun[0] - normalScale * nx;
    const ry = -eta * sun[1] - normalScale * ny;
    const rz = -eta * sun[2] - normalScale * nz;
    const distance = Math.max(0, depth + water.height) / Math.max(-ry, 0.15);
    return [rx * distance, rz * distance];
  };
  const xp = offset(x + step, z), xm = offset(x - step, z);
  const zp = offset(x, z + step), zm = offset(x, z - step);
  if (!xp || !xm || !zp || !zm) return 0;
  const xx = (xp[0] - xm[0]) / (2 * step), xz = (xp[1] - xm[1]) / (2 * step);
  const zx = (zp[0] - zm[0]) / (2 * step), zz = (zp[1] - zm[1]) / (2 * step);
  const determinant = (1 + xx) * (1 + zz) - xz * zx;
  return Math.max(0.25, Math.min(3, 1 / Math.max(Math.abs(determinant), 0.1))) - 1;
}
