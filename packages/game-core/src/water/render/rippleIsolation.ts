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

export const RIPPLE_PATH_GLSL = /* glsl */ `
uniform float uMaskSize;
bool esRipplePathCell(vec2 cell, vec2 body) {
  vec4 value = support((cell + 0.5) / uMaskSize - uMaskOffset);
  return value.a > 0.5 && sameBody(value.rg, body);
}
bool esRipplePath(vec2 from, vec2 to, vec2 body) {
  vec2 a = (from + uMaskOffset) * uMaskSize, b = (to + uMaskOffset) * uMaskSize;
  vec2 cell = floor(a), end = floor(b), delta = b-a, direction = sign(delta);
  vec2 interval = vec2(abs(delta.x) > 1e-12 ? 1.0/abs(delta.x) : 1e20, abs(delta.y) > 1e-12 ? 1.0/abs(delta.y) : 1e20);
  vec2 next = vec2(abs(delta.x) > 1e-12 ? ((direction.x > 0.0 ? cell.x+1.0 : cell.x)-a.x)/delta.x : 1e20,
    abs(delta.y) > 1e-12 ? ((direction.y > 0.0 ? cell.y+1.0 : cell.y)-a.y)/delta.y : 1e20);
  for (int stepIndex=0; stepIndex<32; stepIndex++) {
    if (all(equal(cell,end))) return true;
    if (abs(next.x-next.y)<1e-7) {
      if (!esRipplePathCell(cell+vec2(direction.x,0),body) || !esRipplePathCell(cell+vec2(0,direction.y),body)) return false;
      cell += direction; next += interval;
    } else if (next.x<next.y) { cell.x+=direction.x; next.x+=interval.x; }
    else { cell.y+=direction.y; next.y+=interval.y; }
    if (!esRipplePathCell(cell,body)) return false;
  }
  return false;
}
`;

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
 * directly from the existing ripple state. Returns X/Z difference, height. */
export const RIPPLE_ISOLATION_GLSL = /* glsl */ `
vec4 esRippleTexel(sampler2D field, ivec2 cell) {
  ivec2 size = textureSize(field,0);
  if (any(lessThan(cell,ivec2(0))) || any(greaterThanEqual(cell,size))) return vec4(0.0);
  return texelFetch(field,cell,0);
}
bool esRippleSame(vec4 a,vec4 b) { return dot(abs(a.ba-b.ba),vec2(1.0))<0.002; }
float esRippleNeighbour(sampler2D field,ivec2 cell,vec4 reference) {
  vec4 value=esRippleTexel(field,cell); return esRippleSame(value,reference)?value.r:reference.r;
}
vec3 esIsolatedRipple(sampler2D field,vec2 uv) {
  vec2 size=vec2(textureSize(field,0)), g=uv*size-0.5;
  ivec2 origin=ivec2(floor(g)), refCell=ivec2(floor(uv*size));
  vec4 reference=esRippleTexel(field,refCell);
  if (reference.b+reference.a<0.002) return vec3(0.0);
  vec2 f=fract(g); vec3 result=vec3(0.0);
  for(int z=0;z<2;z++) for(int x=0;x<2;x++) {
    ivec2 cell=origin+ivec2(x,z); vec4 value=esRippleTexel(field,cell);
    float weight=(x==0?1.0-f.x:f.x)*(z==0?1.0-f.y:f.y);
    bool connected=esRippleSame(value,reference);
    if(cell.x!=refCell.x && cell.y!=refCell.y) connected=connected
      &&esRippleSame(esRippleTexel(field,ivec2(cell.x,refCell.y)),reference)
      &&esRippleSame(esRippleTexel(field,ivec2(refCell.x,cell.y)),reference);
    if(!connected) { result.z+=reference.r*weight; continue; }
    result+=vec3(esRippleNeighbour(field,cell+ivec2(1,0),value)-esRippleNeighbour(field,cell-ivec2(1,0),value),
      esRippleNeighbour(field,cell+ivec2(0,1),value)-esRippleNeighbour(field,cell-ivec2(0,1),value),value.r)*weight;
  }
  return result;
}
`;
