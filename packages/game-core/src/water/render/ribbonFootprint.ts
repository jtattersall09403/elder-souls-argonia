import type { ChannelRibbonFootprintTriangle } from "../channelRibbons";

export type FootprintPoint = Readonly<{ x: number; z: number }>;

function area(polygon: readonly FootprintPoint[]): number {
  let sum = 0;
  const origin = polygon[0];
  if (!origin) return 0;
  for (let i = 1; i < polygon.length - 1; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length];
    sum += (a.x - origin.x) * (b.z - origin.z) - (b.x - origin.x) * (a.z - origin.z);
  }
  return sum * 0.5;
}

function halfPlane(polygon: readonly FootprintPoint[], a: FootprintPoint, b: FootprintPoint,
  direction: number): FootprintPoint[] {
  const result: FootprintPoint[] = [];
  const distance = (p: FootprintPoint) => direction * ((b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x));
  for (let i = 0; i < polygon.length; i++) {
    const from = polygon[i], to = polygon[(i + 1) % polygon.length];
    const d0 = distance(from), d1 = distance(to);
    if (d0 >= 0) result.push(from);
    if ((d0 >= 0) !== (d1 >= 0)) {
      const t = d0 / (d0 - d1);
      result.push({ x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t });
    }
  }
  return result;
}

/** Exact convex subtraction: retain all raster area outside native sheets,
 * including adjacent pools; never discard an entire cell or add skirts. */
export function subtractRibbonFootprints(triangle: readonly FootprintPoint[],
  cutters: readonly ChannelRibbonFootprintTriangle[]): FootprintPoint[][] {
  let polygons: FootprintPoint[][] = [[...triangle]];
  for (const cutter of cutters) {
    const clip = [cutter.a, cutter.b, cutter.c];
    const orientation = Math.sign(area(clip));
    if (!orientation) continue;
    const next: FootprintPoint[][] = [];
    for (const polygon of polygons) {
      let intersection = polygon;
      for (let edge = 0; edge < 3 && intersection.length >= 3; edge++) {
        intersection = halfPlane(intersection, clip[edge], clip[(edge + 1) % 3], orientation);
      }
      if (intersection.length < 3 || Math.abs(area(intersection)) <= 1e-8) { next.push(polygon); continue; }
      let remaining = polygon;
      for (let edge = 0; edge < 3 && remaining.length >= 3; edge++) {
        const a = clip[edge], b = clip[(edge + 1) % 3];
        const outside = halfPlane(remaining, a, b, -orientation);
        if (outside.length >= 3 && Math.abs(area(outside)) > 1e-8) next.push(outside);
        remaining = halfPlane(remaining, a, b, orientation);
      }
    }
    polygons = next;
    if (!polygons.length) break;
  }
  return polygons;
}
