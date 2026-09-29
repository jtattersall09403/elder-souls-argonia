import * as tsl from "three/tsl";
import type { TslNode } from "../../render/nodes/materialNodes";

// Loosely typed on purpose (docs/standards/tsl-shaders.md §1).
const { clamp, float, floor, int, ivec2, min, max, select, step, vec2, vec4 } = tsl as TslNode;

/** The uniform nodes the local-patch surface reads (a subset of the ground
 * wetness uniforms; the water material may pass its own). */
export interface LocalWaterSurfaceUniforms {
  /** Texture node: RGBA float field, A = foam + 2*wet. */
  uLocalWaterField: TslNode;
  /** origin x, origin z, cell size m, cells per side. */
  uLocalWaterInfo: TslNode;
  uLocalWaterEdge: TslNode;
  uLocalWaterActive: TslNode;
}

/** TSL twin of LOCAL_WATER_SURFACE_GLSL (localPatchPresentation.ts; the CPU
 * twin is sampleLocalPatchSurface there). Piecewise mesh-triangle sampling,
 * with exact nearest ownership; each texel decoded BEFORE interpolation.
 * Every read is a texel fetch, so these are safe in any control flow.
 * `surface` declares locals (toVar): call it inside an `Fn` body. */
export function localWaterSurfaceNodes(u: LocalWaterSurfaceUniforms) {
  const info = u.uLocalWaterInfo;
  const extent = (): TslNode => float(info.z).mul(info.w);

  const texel = (cell: TslNode): TslNode => {
    const size = ivec2(u.uLocalWaterField.size(0));
    const pixel = int(cell.y).mul(int(info.w)).add(int(cell.x));
    return u.uLocalWaterField.load(ivec2(pixel.mod(size.x), pixel.div(size.x)));
  };

  const smoothWeights = (q: TslNode, edge: TslNode) => {
    const t = clamp(min(q, vec2(extent()).sub(q)).div(edge), 0.0, 1.0);
    return { t, w: t.mul(t).mul(vec2(3.0).sub(t.mul(2.0))) };
  };

  const weight = (p: TslNode): TslNode => {
    const q = vec2(p).sub(info.xy);
    const edge = min(u.uLocalWaterEdge, extent().mul(0.5));
    const { w } = smoothWeights(q, edge);
    return w.x.mul(w.y);
  };

  const mask = (p: TslNode): TslNode => {
    const g = vec2(p).sub(info.xy).div(info.z);
    const outside = float(u.uLocalWaterActive).lessThan(0.5)
      .or(min(g.x, g.y).lessThan(0.0)).or(max(g.x, g.y).greaterThanEqual(info.w));
    return select(outside, float(0.0), step(1.5, texel(floor(g)).a));
  };

  const cell = (c: TslNode): TslNode => {
    const v = texel(clamp(c, vec2(0.0), vec2(float(info.w).sub(1.0))));
    return vec4(v.xyz, v.a.sub(step(1.5, v.a).mul(2.0)));
  };

  const vertexPosition = (i: TslNode): TslNode =>
    clamp(vec2(i).sub(0.5).mul(info.z), vec2(0.0), vec2(extent()));

  const vertex = (i: TslNode): TslNode => {
    const v = cell(vec2(i).sub(1.0));
    const ext = extent();
    const q = vertexPosition(i);
    const edge = min(u.uLocalWaterEdge, ext.mul(0.5));
    const { t, w } = smoothWeights(q, edge);
    const d = t.mul(6.0).mul(vec2(1.0).sub(t)).div(edge)
      .mul(vec2(1.0).sub(step(vec2(ext.mul(0.5)), q).mul(2.0)));
    const wt = w.x.mul(w.y);
    return vec4(v.x.mul(wt), v.y.mul(wt).add(v.x.mul(d.x).mul(w.y)),
      v.z.mul(wt).add(v.x.mul(d.y).mul(w.x)), v.a.mul(wt));
  };

  /** (height, slope x, slope z, foam) at world xz; 0 outside the wet patch. */
  const surface = (p: TslNode): TslNode => {
    const q = vec2(p).sub(info.xy).toVar();
    const i = min(floor(q.div(info.z).add(0.5)), vec2(info.w)).toVar();
    const lo = vertexPosition(i), hi = vertexPosition(i.add(1.0));
    const f = q.sub(lo).div(hi.sub(lo)).toVar();
    const b = vertex(i.add(vec2(1.0, 0.0))).toVar(), c = vertex(i.add(vec2(0.0, 1.0))).toVar();
    const lower = vertex(i).mul(float(1.0).sub(f.x).sub(f.y)).add(b.mul(f.x)).add(c.mul(f.y));
    const upper = vertex(i.add(1.0)).mul(f.x.add(f.y).sub(1.0)).add(b.mul(float(1.0).sub(f.y)))
      .add(c.mul(float(1.0).sub(f.x)));
    return select(mask(p).lessThan(0.5), vec4(0.0), select(f.x.add(f.y).lessThanEqual(1.0), lower, upper));
  };

  return { texel, weight, mask, cell, vertexPosition, vertex, surface };
}
