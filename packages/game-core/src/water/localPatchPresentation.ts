import type { LocalWaterPatch, LocalWaterPatchSample } from './LocalWaterPatch';

/** Presentation blend at an artificial local-model boundary. Solver volume is
 * unchanged; this explicitly localized display is not a global volume model. */
export const LOCAL_WATER_EDGE_M = 2;
/** Mesh vertices are field centres plus both outer half-cell borders. */
export function localWaterVertexCoordinate(index: number, size: number, cellSizeM: number): number {
  return Math.max(0, Math.min(size * cellSizeM, (index - 0.5) * cellSizeM));
}
export function sampleLocalPatchSurface(patch: LocalWaterPatch, x: number, z: number,
  out?: LocalWaterPatchSample): LocalWaterPatchSample | null {
  if (!patch.active || !Number.isFinite(x) || !Number.isFinite(z)) return null;
  const gx = (x - patch.originX) / patch.cellSizeM, gz = (z - patch.originZ) / patch.cellSizeM;
  if (gx < 0 || gz < 0 || gx >= patch.size || gz >= patch.size
    || !patch.wetMask[Math.floor(gz) * patch.size + Math.floor(gx)]) return null;
  const ix = Math.min(patch.size, Math.floor(gx + 0.5)), iz = Math.min(patch.size, Math.floor(gz + 0.5));
  const x0 = localWaterVertexCoordinate(ix, patch.size, patch.cellSizeM);
  const z0 = localWaterVertexCoordinate(iz, patch.size, patch.cellSizeM);
  const fx = (x - patch.originX - x0) / (localWaterVertexCoordinate(ix + 1, patch.size, patch.cellSizeM) - x0);
  const fz = (z - patch.originZ - z0) / (localWaterVertexCoordinate(iz + 1, patch.size, patch.cellSizeM) - z0);
  const upper = fx + fz > 1;
  const value = out ?? { height: 0, slopeX: 0, slopeZ: 0, foam: 0 };
  value.height = value.slopeX = value.slopeZ = value.foam = 0;
  const extent = patch.size * patch.cellSizeM;
  const edge = Math.min(LOCAL_WATER_EDGE_M, extent / 2);
  // Same anti-diagonal triangles as the submitted mesh. Interpolated normals
  // intentionally remain smooth vertex normals, not discontinuous face normals.
  for (let corner = 0; corner < 3; corner++) {
    const vx = ix + (corner === 1 || (corner === 0 && upper) ? 1 : 0);
    const vz = iz + (corner === 2 || (corner === 0 && upper) ? 1 : 0);
    const bary = corner === 0 ? (upper ? fx + fz - 1 : 1 - fx - fz) : corner === 1 ? (upper ? 1 - fz : fx) : (upper ? 1 - fx : fz);
    const px = localWaterVertexCoordinate(vx, patch.size, patch.cellSizeM), pz = localWaterVertexCoordinate(vz, patch.size, patch.cellSizeM);
    const tx = Math.min(1, Math.min(px, extent - px) / edge), tz = Math.min(1, Math.min(pz, extent - pz) / edge);
    const wx = tx * tx * (3 - 2 * tx), wz = tz * tz * (3 - 2 * tz), weight = wx * wz;
    const dx = 6 * tx * (1 - tx) / edge * (px < extent / 2 ? 1 : -1);
    const dz = 6 * tz * (1 - tz) / edge * (pz < extent / 2 ? 1 : -1);
    const offset = (Math.max(0, Math.min(patch.size - 1, vz - 1)) * patch.size + Math.max(0, Math.min(patch.size - 1, vx - 1))) * 4;
    const height = patch.fields[offset];
    value.height += bary * height * weight;
    value.slopeX += bary * (patch.fields[offset + 1] * weight + height * dx * wz);
    value.slopeZ += bary * (patch.fields[offset + 2] * weight + height * dz * wx);
    value.foam += bary * patch.fields[offset + 3] * weight;
  }
  return value;
}

/** Piecewise mesh-triangle sampling, with exact nearest ownership.
 * A = foam + 2*wet. Decode each texel BEFORE interpolation. No float-filter
 * extension is required. Shared verbatim by water and receiving terrain. */
export const LOCAL_WATER_SURFACE_GLSL = /* glsl */ `
uniform sampler2D uLocalWaterField;
uniform vec4 uLocalWaterInfo;
uniform float uLocalWaterEdge;
uniform float uLocalWaterActive;
uniform float uLocalWaterBody;
vec4 esLocalWaterTexel(vec2 cell) {
  ivec2 size = textureSize(uLocalWaterField, 0);
  int pixel = int(cell.y)*int(uLocalWaterInfo.w)+int(cell.x);
  return texelFetch(uLocalWaterField, ivec2(pixel % size.x, pixel / size.x), 0);
}
float esLocalWaterWeight(vec2 p) {
  float extent = uLocalWaterInfo.z * uLocalWaterInfo.w;
  vec2 q = p - uLocalWaterInfo.xy;
  float edge = min(uLocalWaterEdge, extent * 0.5);
  vec2 t = clamp(min(q, vec2(extent) - q) / edge, 0.0, 1.0);
  vec2 w = t * t * (3.0 - 2.0 * t);
  return w.x * w.y;
}
float esLocalWaterMask(vec2 p) {
  vec2 g = (p - uLocalWaterInfo.xy) / uLocalWaterInfo.z;
  if (uLocalWaterActive < 0.5 || min(g.x,g.y) < 0.0 || max(g.x,g.y) >= uLocalWaterInfo.w) return 0.0;
  return step(1.5, esLocalWaterTexel(floor(g)).a);
}
vec4 esLocalWaterCell(vec2 cell) {
  vec4 v = esLocalWaterTexel(clamp(cell,vec2(0.0),vec2(uLocalWaterInfo.w-1.0)));
  v.a -= 2.0*step(1.5,v.a);
  return v;
}
vec2 esLocalWaterVertexPosition(vec2 i) {
  return clamp((i-0.5)*uLocalWaterInfo.z,vec2(0.0),vec2(uLocalWaterInfo.z*uLocalWaterInfo.w));
}
vec4 esLocalWaterVertex(vec2 i) {
  vec4 v = esLocalWaterCell(i-1.0);
  float extent = uLocalWaterInfo.z*uLocalWaterInfo.w;
  vec2 q = esLocalWaterVertexPosition(i);
  float edge = min(uLocalWaterEdge,extent*0.5);
  vec2 t = clamp(min(q,vec2(extent)-q)/edge,0.0,1.0);
  vec2 w = t*t*(3.0-2.0*t);
  vec2 d = 6.0*t*(1.0-t)/edge*(1.0-2.0*step(vec2(extent*0.5),q));
  float weight = w.x*w.y;
  return vec4(v.x*weight,v.y*weight+v.x*d.x*w.y,v.z*weight+v.x*d.y*w.x,v.a*weight);
}
vec4 esLocalWaterSurface(vec2 p) {
  if (esLocalWaterMask(p) < 0.5) return vec4(0.0);
  vec2 q = p-uLocalWaterInfo.xy;
  vec2 i = min(floor(q/uLocalWaterInfo.z+0.5),vec2(uLocalWaterInfo.w));
  vec2 lo = esLocalWaterVertexPosition(i), hi = esLocalWaterVertexPosition(i+1.0);
  vec2 f = (q-lo)/(hi-lo);
  vec4 b = esLocalWaterVertex(i+vec2(1,0)), c = esLocalWaterVertex(i+vec2(0,1));
  if (f.x+f.y <= 1.0) return esLocalWaterVertex(i)*(1.0-f.x-f.y)+b*f.x+c*f.y;
  return esLocalWaterVertex(i+1.0)*(f.x+f.y-1.0)+b*(1.0-f.y)+c*(1.0-f.x);
}
`;
