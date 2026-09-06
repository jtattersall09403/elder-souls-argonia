type Point = { x: number; y: number; z: number };

/** Closest actual point on a finite sheet triangle, not the entire infinite
 * plane or the vertical column beneath a projected surface. */
export function closestSheetPoint(p: Point, a: Point, b: Point, c: Point): Point {
  const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
  const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
  const n2 = nx * nx + ny * ny + nz * nz;
  if (n2 > 1e-20) {
    const t = ((p.x - a.x) * nx + (p.y - a.y) * ny + (p.z - a.z) * nz) / n2;
    const q = { x: p.x - nx * t, y: p.y - ny * t, z: p.z - nz * t };
    const wx = q.x - a.x, wy = q.y - a.y, wz = q.z - a.z;
    const uu = ux * ux + uy * uy + uz * uz, uv = ux * vx + uy * vy + uz * vz, vv = vx * vx + vy * vy + vz * vz;
    const wu = wx * ux + wy * uy + wz * uz, wv = wx * vx + wy * vy + wz * vz;
    const denominator = uu * vv - uv * uv;
    const s = (wu * vv - wv * uv) / denominator, r = (wv * uu - wu * uv) / denominator;
    if (s >= 0 && r >= 0 && s + r <= 1) return q;
  }
  let best = { ...a }, distance = Infinity;
  for (const [start, end] of [[a, b], [b, c], [c, a]]) {
    const dx = end.x - start.x, dy = end.y - start.y, dz = end.z - start.z;
    const length2 = dx * dx + dy * dy + dz * dz;
    const t = length2 > 0 ? Math.max(0, Math.min(1, ((p.x - start.x) * dx + (p.y - start.y) * dy + (p.z - start.z) * dz) / length2)) : 0;
    const q = { x: start.x + dx * t, y: start.y + dy * t, z: start.z + dz * t };
    const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2 + (q.z - p.z) ** 2;
    if (d < distance) { distance = d; best = q; }
  }
  return best;
}
